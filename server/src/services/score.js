import { Professional, Job, Rating, Dispute, Incident, User } from '../models/index.js';
import { S, ACTIVE_STATES, VERIFICATION_CHECKS } from '../config/constants.js';
import { getConfig } from './settings.js';
import { startOfLocalDay } from '../lib/time.js';
import { audit } from './audit.js';

const clamp = (x) => Math.min(1, Math.max(0, x));
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const DONE = [S.PAID, S.CLOSED];

// ---------------------------------------------------------------------------
// Verification tier — cumulative (§4.2). Tier 5 is performance-gated.
// ---------------------------------------------------------------------------
export function computeTier(pro, { elite = false } = {}) {
  const ok = (k) => pro.checks?.[k]?.status === 'verified' && (!pro.checks[k].expiresAt || pro.checks[k].expiresAt > new Date());
  const byTier = (t) => Object.entries(VERIFICATION_CHECKS).filter(([, v]) => v.tier === t).map(([k]) => k);
  let tier = -1;
  if (byTier(0).every(ok)) tier = 0; else return 0;
  if (byTier(1).every(ok)) tier = 1; else return tier;
  if (byTier(2).every(ok)) tier = 2; else return tier;
  if ((pro.skills || []).some((s) => s.status === 'verified' && s.provenance !== 'self_declared')) tier = 3; else return tier;
  if (ok('licence')) tier = 4;
  if (elite && tier >= 3) tier = 5;
  return tier;
}

// ---------------------------------------------------------------------------
// §3.5 Harmonia Score — multi-dimensional, recency weighted (REP-09), and
// shown in full to the professional (REP-08).
// ---------------------------------------------------------------------------
export async function recomputePro(proId) {
  const pro = await Professional.findById(proId);
  if (!pro) return null;
  const cfg = await getConfig('score');
  const eliteCfg = await getConfig('elite');
  const now = Date.now();
  const decay = (d) => Math.pow(0.5, (now - new Date(d).getTime()) / (cfg.halfLifeDays * 86400000));

  const [done, ratings, reworkJobs, disputesLost, seriousUpheld, preferredBy] = await Promise.all([
    Job.find({ professional: proId, state: { $in: DONE }, route: { $ne: 'warranty' } }).select('category paidAt createdAt assignedAt arrivedAt eta').lean(),
    Rating.find({ pro: proId, direction: 'customer_to_pro', excluded: false }).select('scores overall createdAt').lean(),
    Job.countDocuments({ route: 'warranty', reworkAttributedTo: proId }),
    Dispute.countDocuments({ status: { $in: ['decided', 'closed'] }, 'decision.outcome': { $in: ['favour_customer', 'split'] }, job: { $in: await Job.find({ professional: proId }).distinct('_id') } }),
    Incident.countDocuments({ against: pro.user, serious: true, status: 'resolved', resolution: /upheld/i }),
    User.countDocuments({ 'preferredPros.pro': proId }),
  ]);

  // Recency-weighted ratings
  let wSum = 0; const acc = { overall: 0, quality: 0, punctuality: 0, conduct: 0, cleanliness: 0, priceFairness: 0 };
  for (const r of ratings) {
    const w = decay(r.createdAt);
    wSum += w;
    acc.overall += w * r.overall;
    for (const k of ['quality', 'punctuality', 'conduct', 'cleanliness', 'priceFairness']) acc[k] += w * (r.scores?.[k] ?? r.overall);
  }
  const avg = (k) => (wSum ? acc[k] / wSum : null);
  const plainAvg = ratings.length ? ratings.reduce((a, r) => a + r.overall, 0) / ratings.length : null;

  const jobsCompleted = done.length;
  const st = pro.stats || {};
  const accepted = Math.max(st.accepted || 0, 1);
  const reworkPer100 = jobsCompleted ? (reworkJobs / jobsCompleted) * 100 : 0;

  // Components, each normalised 0–1. With few jobs, blend toward a neutral prior
  // so one bad review cannot destroy a new professional.
  const prior = 0.8;
  const n = jobsCompleted;
  const blend = (x) => (x == null ? prior : (x * n + prior * cfg.priorJobs) / (n + cfg.priorJobs));
  const toUnit = (stars) => (stars == null ? null : (stars - 1) / 4);

  const onTime = st.arrivals ? (st.onTimeArrivals || 0) / st.arrivals : null;
  const reliabilityRaw = clamp(1 - (st.cancelledAfterAccept || 0) / accepted - (2 * (st.noShows || 0)) / accepted) * 0.6 + (onTime ?? 0.9) * 0.4;
  const conductRaw = avg('conduct') != null ? (toUnit(avg('conduct')) + toUnit(avg('cleanliness'))) / 2 : null;
  const months = st.firstJobAt ? (now - new Date(st.firstJobAt).getTime()) / (30 * 86400000) : 0;

  const components = {
    quality: { value: r3(blend(toUnit(avg('quality')))), raw: r3(avg('quality')), weight: cfg.weights.quality, label: 'Work quality', source: 'Customer rating on work quality' },
    reliability: { value: r3(blend(clamp(reliabilityRaw))), raw: { onTime: r3(onTime), cancelledAfterAccept: st.cancelledAfterAccept || 0, noShows: st.noShows || 0 }, weight: cfg.weights.reliability, label: 'Reliability', source: 'Cancellations after accepting, no-shows, on-time arrival. Declining an offer never counts.' },
    conduct: { value: r3(blend(conductRaw)), raw: r3(avg('conduct')), weight: cfg.weights.conduct, label: 'Conduct', source: 'Customer rating on behaviour and cleanliness' },
    rework: { value: r3(blend(clamp(1 - reworkPer100 / 20))), raw: r3(reworkPer100), weight: cfg.weights.rework, label: 'Rework rate', source: 'Warranty claims per 100 jobs' },
    disputes: { value: r3(blend(clamp(1 - (jobsCompleted ? (disputesLost / jobsCompleted) * 10 : 0)))), raw: disputesLost, weight: cfg.weights.disputes, label: 'Dispute outcomes', source: 'Disputes decided against you' },
    tenure: { value: r3(clamp(0.5 * Math.min(jobsCompleted / 200, 1) + 0.5 * Math.min(months / 12, 1))), raw: { jobs: jobsCompleted, months: Math.round(months) }, weight: cfg.weights.tenure, label: 'Tenure and volume', source: 'Jobs completed and months active' },
  };
  const totalW = Object.values(components).reduce((a, c) => a + c.weight, 0);
  const value = Math.round((Object.values(components).reduce((a, c) => a + c.value * c.weight, 0) / totalW) * 100);

  const elite =
    jobsCompleted >= eliteCfg.minJobs && (plainAvg ?? 0) >= eliteCfg.minRating && reworkPer100 <= eliteCfg.maxReworkPer100 && seriousUpheld === 0;
  let band = jobsCompleted < 3 ? 'new' : value >= 85 && elite ? 'elite' : value >= 70 ? 'good' : value >= cfg.reviewBelow ? 'watch' : 'review';

  const byCat = {};
  for (const j of done) byCat[j.category] = (byCat[j.category] || 0) + 1;
  const hoursToday = await hoursWorkedToday(proId);

  const newTier = computeTier(pro, { elite });
  const prevTier = pro.tier;

  pro.set({
    tier: newTier,
    'stats.jobsCompleted': jobsCompleted,
    'stats.jobsByCategory': byCat,
    'stats.reworkClaims': reworkJobs,
    'stats.disputesAgainst': disputesLost,
    'stats.ratingAvg': plainAvg == null ? null : Math.round(plainAvg * 100) / 100,
    'stats.ratingCount': ratings.length,
    'stats.dimensionAvg': Object.fromEntries(['quality', 'punctuality', 'conduct', 'cleanliness', 'priceFairness'].map((k) => [k, avg(k) == null ? null : Math.round(avg(k) * 100) / 100])),
    'stats.preferredBy': preferredBy,
    'stats.hoursToday': hoursToday,
    'stats.firstJobAt': st.firstJobAt || (done.length ? done.reduce((m, j) => (j.paidAt && j.paidAt < m ? j.paidAt : m), new Date()) : undefined),
    'stats.lastJobAt': done.length ? done.reduce((m, j) => (j.paidAt && j.paidAt > m ? j.paidAt : m), new Date(0)) : undefined,
    score: { value, band, components, updatedAt: new Date() },
  });

  // Consequence must be transparent and appealable (§3.5): the flag is visible
  // to the pro with its reason, never a silent throttle.
  if (band === 'review' && jobsCompleted >= cfg.reviewMinJobs && !pro.review?.flagged) {
    pro.set('review', { flagged: true, reason: `Harmonia Score ${value} is below ${cfg.reviewBelow}. A re-assessment is required; you can appeal.`, appeal: { status: 'none' } });
  }
  await pro.save();
  if (prevTier !== newTier) audit({ action: 'pro.tier_changed', entity: 'Professional', entityId: pro._id, data: { from: prevTier, to: newTier } });
  return pro;
}

async function hoursWorkedToday(proId) {
  const jobs = await Job.find({ professional: proId, startedAt: { $gte: startOfLocalDay() } }).select('startedAt completedAt jobType').lean();
  const ms = jobs.reduce((a, j) => a + ((j.completedAt || new Date()) - j.startedAt), 0);
  return Math.round((ms / 3600000) * 10) / 10;
}

export async function refreshLoad(proId) {
  const [activeJobs, hoursToday] = await Promise.all([
    Job.countDocuments({ professional: proId, state: { $in: ACTIVE_STATES }, $or: [{ scheduledAt: null }, { scheduledAt: { $lte: new Date(Date.now() + 3600000) } }] }),
    hoursWorkedToday(proId),
  ]);
  await Professional.updateOne({ _id: proId }, { $set: { 'stats.activeJobs': activeJobs, 'stats.hoursToday': hoursToday } });
}

// REP-10 — customer reputation affects dispatch.
export async function recomputeCustomer(userId) {
  const ratings = await Rating.find({ customer: userId, direction: 'pro_to_customer', excluded: false }).select('overall').lean();
  const ratingAvg = ratings.length ? Math.round((ratings.reduce((a, r) => a + r.overall, 0) / ratings.length) * 100) / 100 : null;
  const user = await User.findById(userId);
  if (!user) return;
  const rep = user.reputation || {};
  const deprioritised = (ratings.length >= 3 && ratingAvg < 2.5) || (rep.upheldComplaints || 0) >= 2 || (rep.nonPayment || 0) >= 2;
  user.set({ 'reputation.ratingAvg': ratingAvg, 'reputation.ratingCount': ratings.length, 'reputation.deprioritised': deprioritised });
  await user.save();
}
