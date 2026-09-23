import { Router } from 'express';
import { z } from 'zod';
import {
  Job, Professional, User, Category, Community, Dispute, Incident, AuditLog, DispatchAttempt, Offer, LedgerTxn, Config,
} from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { notFound, badRequest, conflict } from '../lib/errors.js';
import { OPEN_STATES, VERIFICATION_CHECKS, PRO_STATUS } from '../config/constants.js';
import { pilotScorecard, dailyDashboard } from '../services/metrics.js';
import { decideDispute, decideAppeal } from '../services/jobs.js';
import { computeTier, recomputePro } from '../services/score.js';
import { getConfig, setConfig, DEFAULTS } from '../services/settings.js';
import { trialBalance, balancesByPrefix } from '../services/ledger.js';
import { categoryLiveness } from '../services/catalogue.js';
import { verifyFileHash } from '../middleware/upload.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifier.js';

const r = Router();
r.use(authenticate, requireRole('admin'));

const log = (req, action, entity, entityId, data) => audit({ actor: req.user._id, actorRole: 'admin', action, entity, entityId, data });

// ----------------------------------------------------------------- Metrics
r.get('/metrics', async (req, res) => {
  const [scorecard, daily] = await Promise.all([pilotScorecard({ days: Number(req.query.days) || 84 }), dailyDashboard()]);
  res.json({ scorecard, daily });
});

// -------------------------------------------------------------- Live jobs
r.get('/jobs', async (req, res) => {
  const q = {};
  if (req.query.scope === 'open') q.state = { $in: OPEN_STATES };
  if (req.query.state) q.state = req.query.state;
  if (req.query.q) q.ref = new RegExp(String(req.query.q).replace(/[^\w-]/g, ''), 'i');
  const jobs = await Job.find(q).sort({ updatedAt: -1 }).limit(100)
    .populate('professional', 'displayName harmoniaId').populate('customer', 'name').lean();
  res.json(jobs.map((j) => ({ ...j, arrivalOtp: undefined })));
});

// MTC-05 — every dispatch decision with its input features.
r.get('/jobs/:id/dispatch', async (req, res) => {
  const [attempts, offers] = await Promise.all([
    DispatchAttempt.find({ job: req.params.id }).sort({ createdAt: 1 }).lean(),
    Offer.find({ job: req.params.id }).populate('pro', 'displayName harmoniaId').sort({ createdAt: 1 }).lean(),
  ]);
  res.json({ attempts, offers });
});

// ---------------------------------------------------------- Verification
r.get('/verification', async (_req, res) => {
  const pros = await Professional.find({
    $or: [
      ...Object.keys(VERIFICATION_CHECKS).map((k) => ({ [`checks.${k}.status`]: 'submitted' })),
      { 'skills.status': 'pending' },
      { 'review.appeal.status': 'open' },
    ],
  }).populate('user', 'phone name').sort({ updatedAt: 1 }).limit(100).lean();
  res.json(pros.map((p) => ({
    _id: p._id, harmoniaId: p.harmoniaId, displayName: p.displayName, photoUrl: p.photoUrl, tier: p.tier, createdAt: p.createdAt,
    phoneLast4: p.user?.phone?.slice(-4),
    pendingChecks: Object.entries(p.checks || {}).filter(([, c]) => c?.status === 'submitted').map(([k, c]) => ({ check: k, label: VERIFICATION_CHECKS[k]?.label, ...c })),
    pendingSkills: p.skills.filter((s) => s.status === 'pending'),
    appeal: p.review?.appeal?.status === 'open' ? p.review : null,
  })));
});

r.get('/pros', async (req, res) => {
  const q = {};
  if (req.query.q) q.$or = [{ displayName: new RegExp(String(req.query.q), 'i') }, { harmoniaId: new RegExp(String(req.query.q), 'i') }];
  if (req.query.category) q['skills.category'] = req.query.category;
  const pros = await Professional.find(q).sort({ 'score.value': -1 }).limit(200).lean();
  res.json(pros);
});

r.get('/pros/:id', async (req, res) => {
  const pro = await Professional.findById(req.params.id).populate('user', 'phone name createdAt').lean();
  if (!pro) throw notFound();
  const [jobs, logs] = await Promise.all([
    Job.find({ professional: pro._id }).sort({ createdAt: -1 }).limit(30).select('ref state categoryName createdAt pricing route').lean(),
    AuditLog.find({ entityId: pro._id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  res.json({ pro, jobs, audit: logs });
});

r.post('/pros/:id/checks/:check', async (req, res) => {
  const check = req.params.check;
  if (!VERIFICATION_CHECKS[check]) throw notFound('Unknown check');
  const body = z.object({ decision: z.enum(['verify', 'reject']), note: z.string().max(300).optional(), reference: z.string().max(80).optional(), validMonths: z.coerce.number().int().min(1).max(60).optional() }).parse(req.body);
  const pro = await Professional.findById(req.params.id);
  if (!pro) throw notFound();
  if (check === 'police' && body.decision === 'verify' && !body.reference) throw badRequest('Record the agency report reference');
  const months = body.validMonths ?? (check === 'police' ? 24 : check === 'licence' ? 12 : null); // VER-04 / VER-06
  const prev = pro.checks[check]?.status;
  pro.checks[check] = {
    ...(pro.checks[check]?.toObject?.() || {}),
    status: body.decision === 'verify' ? 'verified' : 'rejected',
    note: body.note, reference: body.reference || pro.checks[check]?.reference,
    verifiedAt: body.decision === 'verify' ? new Date() : undefined,
    expiresAt: body.decision === 'verify' && months ? new Date(Date.now() + months * 30 * 86400000) : undefined,
    verifiedBy: req.user._id,
  };
  pro.tier = computeTier(pro);
  await pro.save();
  log(req, `verification.${check}.${body.decision}`, 'Professional', pro._id, { from: prev, note: body.note }); // VER-08
  notify(pro.user, { title: body.decision === 'verify' ? `${VERIFICATION_CHECKS[check].label} verified` : `${VERIFICATION_CHECKS[check].label} needs another look`, body: body.note || '', link: '/pro/verification', tone: body.decision === 'verify' ? 'success' : 'warning' });
  res.json({ tier: pro.tier, check: pro.checks[check] });
});

r.post('/pros/:id/skills/:category', async (req, res) => {
  const body = z.object({
    decision: z.enum(['verify', 'reject', 'suspend']),
    level: z.coerce.number().int().min(1).max(5).optional(),
    provenance: z.enum(['platform_assessed', 'document_verified']).default('platform_assessed'),
    note: z.string().max(300).optional(),
  }).parse(req.body);
  const pro = await Professional.findById(req.params.id);
  const skill = pro?.skills.find((s) => s.category === req.params.category);
  if (!skill) throw notFound('Skill not found');
  if (body.decision === 'verify') Object.assign(skill, { status: 'verified', provenance: body.provenance, level: body.level ?? skill.level, assessmentNote: body.note, verifiedAt: new Date(), suspendedReason: undefined });
  if (body.decision === 'reject') Object.assign(skill, { status: 'rejected', assessmentNote: body.note });
  if (body.decision === 'suspend') Object.assign(skill, { status: 'suspended', suspendedReason: body.note || 'Pending re-assessment' });
  pro.tier = computeTier(pro);
  await pro.save();
  log(req, `skill.${body.decision}`, 'Professional', pro._id, { category: req.params.category, level: skill.level });
  notify(pro.user, { title: `${req.params.category} skill ${body.decision === 'verify' ? 'verified' : body.decision === 'reject' ? 'not approved' : 'paused for re-assessment'}`, body: body.note || '', link: '/pro/passport', tone: body.decision === 'verify' ? 'success' : 'warning' });
  res.json({ tier: pro.tier, skill });
});

// DIS-08 — decisions affecting income are appealable to a human.
r.post('/pros/:id/appeal', async (req, res) => {
  const body = z.object({ decision: z.enum(['upheld', 'rejected']), note: z.string().min(5).max(500) }).parse(req.body);
  const pro = await Professional.findById(req.params.id);
  if (pro?.review?.appeal?.status !== 'open') throw conflict('No open appeal');
  pro.review.appeal.status = body.decision;
  if (body.decision === 'upheld') {
    pro.review.flagged = false;
    pro.skills.forEach((s) => { if (s.status === 'suspended') s.status = 'verified'; });
  }
  pro.review.reason = `${pro.review.reason || ''} — Appeal ${body.decision}: ${body.note}`;
  await pro.save();
  log(req, `pro.appeal.${body.decision}`, 'Professional', pro._id, { note: body.note });
  notify(pro.user, { title: `Your appeal was ${body.decision}`, body: body.note, link: '/pro/passport', tone: body.decision === 'upheld' ? 'success' : 'warning' });
  res.json(pro.review);
});

r.post('/users/:id/suspend', async (req, res) => {
  const body = z.object({ active: z.boolean(), reason: z.string().min(3).max(300) }).parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw notFound();
  user.suspended = { active: body.active, reason: body.reason, at: new Date() };
  await user.save();
  await Professional.updateOne({ user: user._id }, { $set: { suspended: user.suspended, ...(body.active ? { status: PRO_STATUS.OFFLINE } : {}) } });
  log(req, body.active ? 'user.suspended' : 'user.reinstated', 'User', user._id, { reason: body.reason });
  res.json(user.suspended);
});

// ----------------------------------------------------------------- Disputes
r.get('/disputes', async (req, res) => {
  const q = req.query.status ? { status: req.query.status } : { status: { $in: ['open', 'appealed'] } };
  const list = await Dispute.find(q).select('-evidence').sort({ slaDueAt: 1 }).populate('job', 'ref categoryName state pricing paymentMode').lean();
  res.json(list);
});

r.get('/disputes/:id', async (req, res) => {
  const d = await Dispute.findById(req.params.id).populate('raisedBy', 'name role').lean();
  if (!d) throw notFound();
  // Evidence integrity — recompute each photo's hash against the upload.
  const photos = [...(d.evidence?.photos?.before || []), ...(d.evidence?.photos?.after || []), ...(d.attachments || [])];
  const integrity = await Promise.all(photos.map(async (p) => ({ url: p.url, intact: await verifyFileHash(p.url, p.sha256) })));
  res.json({ ...d, integrity });
});

r.post('/disputes/:id/decide', async (req, res) => {
  const body = z.object({ outcome: z.enum(['favour_customer', 'favour_pro', 'split', 'no_fault']), refundPaise: z.coerce.number().int().min(0).optional(), rationale: z.string().min(10).max(2000), seriousConduct: z.boolean().optional() }).parse(req.body);
  res.json(await decideDispute(req.params.id, req.user, body));
});

r.post('/disputes/:id/appeal', async (req, res) => {
  const body = z.object({ outcome: z.enum(['upheld', 'overturned']), rationale: z.string().min(10).max(2000) }).parse(req.body);
  res.json(await decideAppeal(req.params.id, req.user, body));
});

// --------------------------------------------------------------- Incidents
r.get('/incidents', async (req, res) => {
  const q = req.query.status ? { status: req.query.status } : { status: { $ne: 'resolved' } };
  res.json(await Incident.find(q).sort({ serious: -1, createdAt: -1 }).populate('job', 'ref categoryName state').populate('raisedBy', 'name role').populate('against', 'name role').limit(100).lean());
});

r.post('/incidents/:id/resolve', async (req, res) => {
  const body = z.object({ resolution: z.enum(['upheld', 'not_upheld']), notes: z.string().min(5).max(1000), liftSuspension: z.boolean().default(false) }).parse(req.body);
  const inc = await Incident.findById(req.params.id);
  if (!inc) throw notFound();
  inc.set({ status: 'resolved', resolution: `${body.resolution}: ${body.notes}`, resolvedBy: req.user._id, resolvedAt: new Date() });
  await inc.save();
  if (inc.against) {
    if (body.liftSuspension || body.resolution === 'not_upheld') {
      await User.updateOne({ _id: inc.against }, { $set: { 'suspended.active': false } });
      await Professional.updateOne({ user: inc.against }, { $set: { 'suspended.active': false } });
    }
    if (body.resolution === 'upheld') {
      await User.updateOne({ _id: inc.against, role: 'customer' }, { $inc: { 'reputation.upheldComplaints': 1 } });
      const pro = await Professional.findOne({ user: inc.against });
      if (pro) {
        // VER-04 — upheld serious complaint forces background re-verification.
        if (inc.serious) await Professional.updateOne({ _id: pro._id }, { $set: { 'checks.police.status': 'expired' } });
        await recomputePro(pro._id);
      }
    }
  }
  log(req, 'incident.resolved', 'Incident', inc._id, { resolution: body.resolution });
  res.json(inc);
});

// --------------------------------------------------------------- Catalogue
r.get('/categories', async (_req, res) => {
  const cats = await Category.find().sort({ sortOrder: 1 }).lean();
  const community = await Community.findOne().sort({ createdAt: 1 }).lean();
  const out = await Promise.all(cats.map(async (c) => ({ ...c, liveness: community ? await categoryLiveness(c, community.location.coordinates) : null })));
  res.json(out);
});

r.patch('/categories/:code', async (req, res) => {
  const body = z.object({
    name: z.string().min(2).max(60).optional(), description: z.string().max(300).optional(), active: z.boolean().optional(),
    minTier: z.coerce.number().int().min(0).max(5).optional(), warrantyDays: z.coerce.number().int().min(0).max(365).optional(),
    minActivePros: z.coerce.number().int().min(1).max(100).optional(), commissionBps: z.coerce.number().int().min(0).max(4000).nullable().optional(),
    standardDurationMin: z.coerce.number().int().min(10).max(1440).optional(), womanPreferenceOffered: z.boolean().optional(), vulnerableAccess: z.boolean().optional(),
    cancellation: z.object({ freeBeforeState: z.enum(['ASSIGNED', 'EN_ROUTE', 'ARRIVED']), feePaise: z.coerce.number().int().min(0).max(100000) }).optional(),
  }).parse(req.body);
  const c = await Category.findOneAndUpdate({ code: req.params.code }, { $set: body }, { new: true, runValidators: true });
  if (!c) throw notFound();
  log(req, 'category.updated', 'Category', c._id, body);
  res.json(c);
});

r.put('/categories/:code/rate-card', async (req, res) => {
  const body = z.object({
    city: z.string().min(2),
    visitCharge: z.coerce.number().int().min(0),
    jobTypes: z.array(z.object({ code: z.string().min(1).max(30), name: z.string().min(2).max(80), labour: z.coerce.number().int().min(0), standardParts: z.coerce.number().int().min(0).default(0), durationMin: z.coerce.number().int().min(5).max(1440).default(60) })).min(1).max(40),
  }).parse(req.body);
  const c = await Category.findOne({ code: req.params.code });
  if (!c) throw notFound();
  const idx = c.rateCards.findIndex((x) => x.city === body.city);
  const card = { ...body, updatedAt: new Date() };
  if (idx >= 0) c.rateCards[idx] = card; else c.rateCards.push(card);
  await c.save();
  log(req, 'ratecard.updated', 'Category', c._id, { city: body.city });
  res.json(c);
});

// ------------------------------------------------------------------ Config
r.get('/config', async (_req, res) => {
  const overrides = await Config.find().lean();
  const merged = {};
  for (const key of Object.keys(DEFAULTS)) merged[key] = await getConfig(key);
  res.json({ merged, overrides, defaults: DEFAULTS });
});

r.put('/config/:key', async (req, res) => {
  if (!DEFAULTS[req.params.key]) throw notFound('Unknown setting');
  const body = z.object({ scope: z.string().regex(/^(global|city:\w+|category:\w+|city:\w+:category:\w+)$/).default('global'), value: z.record(z.any()) }).parse(req.body);
  const doc = await setConfig(req.params.key, body.scope, body.value, req.user._id);
  log(req, 'config.updated', 'Config', doc._id, { key: req.params.key, scope: body.scope, value: body.value });
  res.json(doc);
});

// ------------------------------------------------------------ Communities
const communitySchema = z.object({
  name: z.string().min(2).max(80), locality: z.string().min(2).max(60), city: z.string().default('Bengaluru'), state: z.string().default('Karnataka'),
  households: z.coerce.number().int().min(0).max(20000).default(0), buildingAgeYears: z.coerce.number().int().min(0).max(80).optional(),
  lat: z.coerce.number(), lng: z.coerce.number(), radiusKm: z.coerce.number().min(0.2).max(5).default(1),
  stage: z.enum(['prospect', 'signed', 'panel_ready', 'live', 'contracted']).default('prospect'),
  rwaContact: z.object({ name: z.string().max(60).optional(), role: z.string().max(60).optional() }).optional(),
  activationCostPaise: z.coerce.number().int().min(0).optional(),
});

r.get('/communities', async (_req, res) => {
  const list = await Community.find().sort({ createdAt: 1 }).lean();
  const stats = await Job.aggregate([
    { $match: { community: { $in: list.map((c) => c._id) }, state: { $in: ['PAID', 'CLOSED'] } } },
    { $group: { _id: '$community', jobs: { $sum: 1 }, gmv: { $sum: '$pricing.gross' }, revenue: { $sum: '$pricing.platformFee' }, customers: { $addToSet: '$customer' }, firstJobAt: { $min: '$paidAt' } } },
  ]);
  res.json(list.map((c) => {
    const s = stats.find((x) => String(x._id) === String(c._id));
    return { ...c, jobs: s?.jobs || 0, gmv: s?.gmv || 0, revenue: s?.revenue || 0, activeHouseholds: s?.customers?.length || 0, firstJobAt: s?.firstJobAt || null };
  }));
});

r.post('/communities', async (req, res) => {
  const b = communitySchema.parse(req.body);
  const { lat, lng, ...rest } = b;
  const c = await Community.create({ ...rest, location: { type: 'Point', coordinates: [lng, lat] } });
  log(req, 'community.created', 'Community', c._id);
  res.status(201).json(c);
});

r.patch('/communities/:id', async (req, res) => {
  const b = communitySchema.partial().parse(req.body);
  const { lat, lng, ...rest } = b;
  const set = { ...rest };
  if (lat != null && lng != null) set.location = { type: 'Point', coordinates: [lng, lat] };
  const c = await Community.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
  if (!c) throw notFound();
  log(req, 'community.updated', 'Community', c._id, rest);
  res.json(c);
});

r.post('/communities/:id/contracts', async (req, res) => {
  const b = z.object({ kind: z.enum(['loi', 'amc', 'membership_pilot']), valuePaise: z.coerce.number().int().min(0), note: z.string().max(200).optional() }).parse(req.body);
  const c = await Community.findByIdAndUpdate(req.params.id, { $push: { contracts: { ...b, signedAt: new Date() } }, $set: { stage: 'contracted' } }, { new: true });
  if (!c) throw notFound();
  log(req, 'community.contract', 'Community', c._id, b);
  res.json(c);
});

// ------------------------------------------------------------------ Ledger
r.get('/ledger', async (_req, res) => {
  const [trial, platform, govt, costs, pros, recent] = await Promise.all([
    trialBalance(), balancesByPrefix('platform:'), balancesByPrefix('govt:'), balancesByPrefix('cost:'), balancesByPrefix('pro:'),
    LedgerTxn.find().sort({ createdAt: -1 }).limit(60).lean(),
  ]);
  const receivables = pros.filter((b) => b.account.endsWith(':receivable') && b.net < 0);
  const proIds = receivables.map((b) => b.account.split(':')[1]);
  const names = await Professional.find({ _id: { $in: proIds } }).select('displayName harmoniaId').lean();
  res.json({
    trial, platform, govt, costs, recent,
    cashReconciliation: receivables.map((b) => ({ ...b, owed: -b.net, pro: names.find((n) => String(n._id) === b.account.split(':')[1]) })),
  });
});

// ------------------------------------------------------------------- Audit
r.get('/audit', async (req, res) => {
  const q = {};
  if (req.query.entity) q.entity = req.query.entity;
  if (req.query.action) q.action = new RegExp(String(req.query.action).replace(/[^\w.]/g, ''), 'i');
  res.json(await AuditLog.find(q).sort({ createdAt: -1 }).limit(200).populate('actor', 'name role').lean());
});

r.get('/customers', async (req, res) => {
  const q = { role: 'customer' };
  if (req.query.q) q.name = new RegExp(String(req.query.q), 'i');
  res.json(await User.find(q).select('name phone reputation suspended community createdAt preferredPros invitedBy').sort({ createdAt: -1 }).limit(200).lean());
});

export default r;
