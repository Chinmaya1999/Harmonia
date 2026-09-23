import { Job, Professional, User, Invite, Community, Dispute, Asset, Incident, Home } from '../models/index.js';
import { S } from '../config/constants.js';
import { balancesByPrefix } from './ledger.js';
import { getConfig } from './settings.js';
import { startOfLocalDay } from '../lib/time.js';

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const quantile = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// §12.12 — each gate is GO / MODIFY / STOP. Lower-is-better metrics invert.
function gate(value, { go, stop }, lowerIsBetter = false) {
  if (value == null) return 'NO_DATA';
  if (lowerIsBetter) return value < go ? 'GO' : value > stop ? 'STOP' : 'MODIFY';
  return value >= go ? 'GO' : value < stop ? 'STOP' : 'MODIFY';
}

export async function pilotScorecard({ days = 84 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const gates = await getConfig('pilotGates');
  const paidStates = [S.PAID, S.CLOSED];

  const jobs = await Job.find({ createdAt: { $gte: since }, route: { $ne: 'warranty' } })
    .select('state customer professional createdAt paidAt assignedAt dispatch.assignmentSec category pricing tips paymentMode payment timeline route')
    .lean();

  // Fill rate — requests that got a professional, excluding customers who
  // cancelled inside the first minute (changed their mind, not unfilled).
  const cancelledEarly = (j) => j.state === S.CANCELLED_BY_CUSTOMER && !j.assignedAt && j.timeline.at(-1).at - j.createdAt < 60000;
  const fillBase = jobs.filter((j) => !cancelledEarly(j) && j.state !== S.DISPATCHING);
  const filled = fillBase.filter((j) => j.assignedAt || j.timeline.some((t) => t.state === S.ASSIGNED));
  const fillRate = pct(filled.length, fillBase.length);

  const assignSecs = jobs.map((j) => j.dispatch?.assignmentSec).filter((x) => x != null);

  // Repeat within 90 days of a customer's first paid job.
  const paid = jobs.filter((j) => paidStates.includes(j.state) && j.paidAt).sort((a, b) => a.paidAt - b.paidAt);
  const byCustomer = new Map();
  for (const j of paid) {
    const k = String(j.customer);
    if (!byCustomer.has(k)) byCustomer.set(k, []);
    byCustomer.get(k).push(j.paidAt);
  }
  let repeaters = 0;
  for (const dates of byCustomer.values()) if (dates.length > 1 && dates[1] - dates[0] <= 90 * 86400000) repeaters += 1;
  const repeat90 = pct(repeaters, byCustomer.size);

  const reworkJobs = await Job.countDocuments({ route: 'warranty', createdAt: { $gte: since } });
  const reworkPer100 = paid.length ? Math.round((reworkJobs / paid.length) * 1000) / 10 : null;

  // Professional retention: of pros with any completed job, the share still
  // working (a job in the last 30 days) at 90+ days since their first job.
  const pros = await Professional.find({ 'stats.firstJobAt': { $ne: null } }).select('stats.firstJobAt stats.lastJobAt').lean();
  const mature = pros.filter((p) => Date.now() - new Date(p.stats.firstJobAt) >= 90 * 86400000);
  const retainedBase = mature.length ? mature : pros;
  const retained = retainedBase.filter((p) => p.stats.lastJobAt && Date.now() - new Date(p.stats.lastJobAt) <= 30 * 86400000);
  const proRetention90 = pct(retained.length, retainedBase.length);

  const activePros = await Professional.countDocuments({ tier: { $gte: 1 }, 'suspended.active': { $ne: true } });
  const migrating = await Invite.distinct('pro', { 'activated.0': { $exists: true } });
  const migratingPros = pct(migrating.length, activePros);

  const communities = await Community.find().lean();
  const contracts = communities.reduce((a, c) => a + (c.contracts || []).filter((k) => ['amc', 'loi'].includes(k.kind)).length, 0);

  // Contribution: platform revenue less the costs Harmonia bears.
  const [rev] = await balancesByPrefix('platform:revenue');
  const costs = await balancesByPrefix('cost:');
  const revenue = rev?.net || 0;
  const costTotal = costs.reduce((a, c) => a + (c.debit - c.credit), 0);
  const contribution = revenue - costTotal;
  const contributionPerJob = paid.length ? Math.round(contribution / paid.length) : null;

  const tipJobs = paid.filter((j) => (j.tips || []).length);
  const tipTotal = tipJobs.reduce((a, j) => a + j.tips.reduce((x, t) => x + t.amount, 0), 0);

  const homes = await Home.find().select('_id').lean();
  const assetCounts = await Asset.aggregate([{ $group: { _id: '$home', n: { $sum: 1 } } }]);
  const disputes = await Dispute.find({ createdAt: { $gte: since } }).select('createdAt decision.at status').lean();
  const decided = disputes.filter((d) => d.decision?.at);
  const preferredCustomers = await User.countDocuments({ role: 'customer', 'preferredPros.0': { $exists: true } });

  const avgTicket = paid.length ? Math.round(paid.reduce((a, j) => a + (j.pricing?.gross || 0), 0) / paid.length) : null;
  const metrics = {
    repeat90: { label: 'Repeat booking within 90 days', value: repeat90, unit: '%', gate: gate(repeat90, gates.repeat90), thresholds: gates.repeat90, n: byCustomer.size },
    fillRate: { label: 'Fill rate at committed slots', value: fillRate, unit: '%', gate: gate(fillRate, gates.fillRate), thresholds: gates.fillRate, n: fillBase.length },
    contribution: { label: 'Contribution margin (blended)', value: contributionPerJob, unit: 'paise/job', gate: contributionPerJob == null ? 'NO_DATA' : contributionPerJob > 0 ? 'GO' : contributionPerJob > -5000 ? 'MODIFY' : 'STOP', total: contribution },
    reworkPer100: { label: 'Rework per 100 jobs', value: reworkPer100, unit: '', gate: gate(reworkPer100, gates.reworkPer100, true), thresholds: gates.reworkPer100, n: paid.length },
    proRetention90: { label: 'Professional retention at 90 days', value: proRetention90, unit: '%', gate: gate(proRetention90, gates.proRetention90), thresholds: gates.proRetention90, n: retainedBase.length, matureCohort: mature.length > 0 },
    migratingPros: { label: 'Professionals migrating own customers', value: migratingPros, unit: '%', gate: gate(migratingPros, gates.migratingPros), thresholds: gates.migratingPros, n: activePros },
    contracts: { label: 'Contracted revenue secured', value: contracts, unit: 'AMCs/LOIs', gate: contracts >= gates.contracts.go ? 'GO' : contracts > gates.contracts.stop ? 'MODIFY' : 'STOP', thresholds: gates.contracts },
  };
  const verdicts = Object.values(metrics).map((m) => m.gate);
  const verdict = verdicts.includes('STOP') ? 'STOP' : verdicts.every((v) => v === 'GO') ? 'GO' : 'MODIFY';

  return {
    days, verdict, metrics,
    secondary: {
      jobs: jobs.length, paidJobs: paid.length,
      timeToAssignP50: quantile(assignSecs, 0.5), timeToAssignP95: quantile(assignSecs, 0.95),
      avgTicket, tipAttachment: pct(tipJobs.length, paid.length), avgTip: tipJobs.length ? Math.round(tipTotal / tipJobs.length) : null,
      homesWith3Assets: assetCounts.filter((a) => a.n >= 3).length, homes: homes.length,
      disputeRate: pct(disputes.length, paid.length), avgResolutionHours: decided.length ? Math.round(decided.reduce((a, d) => a + (d.decision.at - d.createdAt), 0) / decided.length / 3600000) : null,
      preferredAttachment: pct(preferredCustomers, byCustomer.size), activePros,
      jobsPerProPerDay: activePros ? Math.round((paid.length / activePros / Math.max(1, days)) * 100) / 100 : null,
      revenue, costs: costs.map((c) => ({ account: c.account, amount: c.debit - c.credit })),
    },
  };
}

// §12.10 — the ten-minute daily review.
export async function dailyDashboard() {
  const start = startOfLocalDay();
  const today = await Job.find({ createdAt: { $gte: start }, route: { $ne: 'warranty' } }).select('ref state categoryName dispatch assignedAt createdAt cancellation').lean();
  const unfilled = today.filter((j) => [S.DISPATCHING, S.EXPIRED].includes(j.state) || (j.state === S.CANCELLED_BY_CUSTOMER && !j.assignedAt));
  const assignSecs = today.map((j) => j.dispatch?.assignmentSec).filter((x) => x != null);
  const settledToday = await Job.countDocuments({ paidAt: { $gte: start } });
  const issues = await Promise.all([
    Incident.countDocuments({ createdAt: { $gte: start } }),
    Dispute.countDocuments({ createdAt: { $gte: start } }),
    Job.countDocuments({ route: 'warranty', createdAt: { $gte: start } }),
    Job.countDocuments({ state: S.NO_SHOW, updatedAt: { $gte: start } }),
  ]);
  const cashJobs = await Job.find({ paymentMode: 'cash', paidAt: { $gte: start } }).select('pricing').lean();
  const receivables = await balancesByPrefix('pro:');
  const openReceivables = receivables.filter((b) => b.account.endsWith(':receivable') && b.net < 0);
  return {
    requested: today.length,
    filled: today.filter((j) => j.assignedAt).length,
    unfilled: unfilled.map((j) => ({
      ref: j.ref, category: j.categoryName, state: j.state,
      reason: j.state === S.DISPATCHING ? (j.dispatch?.exhausted ? 'All waves exhausted — customer choosing' : `Searching (wave ${j.dispatch?.wave})`) : j.state === S.EXPIRED ? 'Expired unfilled' : `Customer cancelled: ${j.cancellation?.reason || 'no reason'}`,
    })),
    avgAssignSec: assignSecs.length ? Math.round(assignSecs.reduce((a, b) => a + b, 0) / assignSecs.length) : null,
    settled: settledToday,
    issues: { incidents: issues[0], disputes: issues[1], rework: issues[2], noShows: issues[3] },
    cash: { collected: cashJobs.reduce((a, j) => a + (j.pricing?.gross || 0), 0), jobs: cashJobs.length, outstandingCommission: openReceivables.reduce((a, b) => a - b.net, 0), prosOwing: openReceivables.length },
  };
}
