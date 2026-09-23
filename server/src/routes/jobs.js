import { Router } from 'express';
import { z } from 'zod';
import { Job, Offer, Professional, User, Rating, Dispute, Message, Category, Incident } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { forbidden, notFound, badRequest, conflict } from '../lib/errors.js';
import { S, OPEN_STATES } from '../config/constants.js';
import * as jobs from '../services/jobs.js';
import { restartDispatch, addPriorityTip } from '../services/dispatch.js';
import { jobForCustomer, jobForPro } from '../services/views.js';
import { tipCap, computeSplit, agreedPrice } from '../services/pricing.js';
import { getConfig } from '../services/settings.js';
import { toJob } from '../services/notifier.js';

const r = Router();
r.use(authenticate);

const money = z.coerce.number().int().min(0).max(10_000_000);
const media = z.object({ url: z.string().startsWith('/uploads/'), sha256: z.string().length(64) });
const parts = z.array(z.object({ name: z.string().trim().min(1).max(80), qty: z.coerce.number().int().min(1).max(100).default(1), unitPrice: money, photo: z.string().optional() })).max(20).default([]);

async function access(req) {
  const job = await Job.findById(req.params.id);
  if (!job) throw notFound('Job not found');
  const role = req.user.role;
  if (role === 'admin') return { job, as: 'admin' };
  if (role === 'customer' && String(job.customer) === String(req.user._id)) return { job, as: 'customer' };
  if (role === 'professional' && req.pro) {
    if (String(job.professional) === String(req.pro._id)) return { job, as: 'professional' };
    const offer = await Offer.findOne({ job: job._id, pro: req.pro._id }).lean();
    if (offer) return { job, as: 'offeree' };
  }
  throw forbidden();
}

async function detail(job, as, req) {
  const [pro, customer, ratings, dispute, messagesCount, offers, category] = await Promise.all([
    job.professional ? Professional.findById(job.professional).lean() : null,
    User.findById(job.customer).select('name reputation gender').lean(),
    Rating.find({ job: job._id }).lean(),
    job.dispute ? Dispute.findById(job.dispute).select('-evidence').lean() : null,
    Message.countDocuments({ job: job._id }),
    Offer.find({ job: job._id }).select('wave status expiresAt pro').lean(),
    Category.findOne({ code: job.category }).select('cancellation warrantyDays archetype').lean(),
  ]);
  const windows = await getConfig('windows');
  const myRating = ratings.find((x) => String(x.rater) === String(req.user._id));
  const theirRating = ratings.find((x) => String(x.rater) !== String(req.user._id));

  // Live dispatch picture for the customer (DSP-01) — counts only, never who.
  const dispatchView = {
    wave: job.dispatch.wave, mode: job.dispatch.mode, exhausted: job.dispatch.exhausted, tipSuggested: job.dispatch.tipSuggested,
    waveEndsAt: job.dispatch.waveEndsAt, namedOutcome: job.dispatch.namedOutcome,
    offered: offers.length, pending: offers.filter((o) => o.status === 'pending').length, declined: offers.filter((o) => o.status === 'declined').length,
  };

  const common = {
    dispatchView,
    ratings: {
      mine: myRating || null,
      // REP-03 — blind until both are in or the window closes.
      theirs: theirRating && (theirRating.visible || job.ratings.revealed) ? theirRating : theirRating ? { hidden: true } : null,
    },
    dispute,
    messagesCount,
    tipCap: [S.PAID, S.CLOSED].includes(job.state) ? await tipCap(job) : null,
    tipsTotal: (job.tips || []).reduce((a, t) => a + t.amount, 0),
    cancellationPolicy: category?.cancellation,
    windows: { noShowGraceMin: windows.noShowGraceMin, disputeWindowDays: windows.disputeWindowDays, autoConfirmHours: windows.autoConfirmHours },
    agreedPrice: agreedPrice(job),
  };

  if (as === 'customer' || as === 'admin') {
    const withOtp = await Job.findById(job._id).select('+arrivalOtp').lean();
    const view = jobForCustomer(job, { pro, otp: [S.ASSIGNED, S.EN_ROUTE].includes(job.state) || as === 'admin' ? withOtp.arrivalOtp : undefined });
    return { ...view, ...common, customerInfo: as === 'admin' ? customer : undefined };
  }
  const view = jobForPro(job, { customer });
  // Before acceptance (offeree) only the block and community are visible.
  if (as === 'offeree') delete view.address.line;
  // PRC-06 — complete split, before and after.
  let split = job.pricing?.gross != null ? job.pricing : null;
  const price = agreedPrice(job);
  if (!split && price) {
    const cat = await Category.findOne({ code: job.category }).lean();
    split = await computeSplit({ archetype: job.archetype, category: job.category, city: job.city, stateCode: job.stateCode, price, paymentMode: job.paymentMode, priorityTip: job.priorityTip, feeHoliday: job.feeHoliday, categoryCommissionBps: cat?.commissionBps });
  }
  return { ...view, ...common, split, dispatchView: undefined };
}

// ------------------------------------------------------------------ Reads
r.get('/', async (req, res) => {
  const scope = req.query.scope === 'history' ? 'history' : req.query.scope === 'open' ? 'open' : 'all';
  const q = {};
  if (req.user.role === 'customer') q.customer = req.user._id;
  else if (req.user.role === 'professional') q.professional = req.pro?._id;
  else if (req.user.role !== 'admin') throw forbidden();
  if (scope === 'open') q.state = { $in: OPEN_STATES };
  if (scope === 'history') q.state = { $nin: OPEN_STATES };
  const list = await Job.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 200)).populate('professional', 'displayName harmoniaId photoUrl tier').lean();
  res.json(list.map((j) => ({ ...j, arrivalOtp: undefined, shareToken: undefined })));
});

r.get('/:id', async (req, res) => {
  const { job, as } = await access(req);
  res.json(await detail(job, as, req));
});

// ------------------------------------------------------------ Customer
r.post('/', requireRole('customer'), async (req, res) => {
  const body = z.object({
    category: z.string().min(2),
    jobType: z.string().min(1),
    homeId: z.string(),
    assetId: z.string().optional(),
    route: z.enum(['instant', 'named', 'scheduled']).default('instant'),
    proId: z.string().optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    description: z.string().trim().max(1000).optional(),
    photos: z.array(media).max(4).optional(),
    priorityTip: money.optional(),
    paymentMode: z.enum(['online', 'cash']).default('online'),
    requireWoman: z.boolean().optional(),
  }).parse(req.body);
  const job = await jobs.createJob(req.user, { ...body, category: body.category.toUpperCase() });
  res.status(201).json({ _id: job._id, ref: job.ref, state: job.state });
});

const asCustomer = async (req) => {
  const { job, as } = await access(req);
  if (as !== 'customer') throw forbidden();
  return job;
};
const asPro = async (req) => {
  const { job, as } = await access(req);
  if (as !== 'professional') throw forbidden();
  return job;
};

r.post('/:id/cancel', async (req, res) => {
  const reason = z.string().trim().max(300).optional().parse(req.body.reason);
  if (req.user.role === 'customer') {
    await asCustomer(req);
    return res.json(await jobs.cancelByCustomer(req.params.id, req.user._id, reason));
  }
  if (req.user.role === 'professional') {
    await asPro(req);
    if (!reason) throw badRequest('Tell the customer why you are cancelling');
    return res.json(await jobs.cancelByPro(req.params.id, req.user._id, reason));
  }
  throw forbidden();
});

r.post('/:id/dispatch', requireRole('customer'), async (req, res) => {
  await asCustomer(req);
  const body = z.object({ action: z.enum(['search_again', 'find_others', 'schedule', 'wait_named']), scheduledAt: z.string().datetime({ offset: true }).optional() }).parse(req.body);
  if (body.action === 'schedule') {
    if (!body.scheduledAt) throw badRequest('Pick a slot');
    return res.json(await restartDispatch(req.params.id, { actor: req.user._id, mode: 'broadcast_scheduled', scheduledAt: new Date(body.scheduledAt), excludeRequested: false }));
  }
  if (body.action === 'wait_named') return res.json(await restartDispatch(req.params.id, { actor: req.user._id, mode: 'named', excludeRequested: false }));
  return res.json(await restartDispatch(req.params.id, { actor: req.user._id, mode: 'waves', excludeRequested: body.action === 'find_others' }));
});

r.post('/:id/priority-tip', requireRole('customer'), async (req, res) => {
  const job = await asCustomer(req);
  const amount = money.parse(req.body.amount);
  const pay = await getConfig('payments');
  const max = Math.min(pay.tipCapPaise, Math.floor((job.priceBand.min * pay.tipCapPct) / 100));
  if (amount <= 0 || amount > max) throw badRequest(`Priority tip must be between ₹1 and ₹${max / 100}`);
  res.json(await addPriorityTip(req.params.id, amount, req.user._id));
});

r.post('/:id/quote/decision', requireRole('customer'), async (req, res) => {
  await asCustomer(req);
  res.json(await jobs.decideQuote(req.params.id, req.user._id, z.boolean().parse(req.body.approve)));
});

r.post('/:id/scope/decision', requireRole('customer'), async (req, res) => {
  await asCustomer(req);
  res.json(await jobs.decideScope(req.params.id, req.user._id, z.boolean().parse(req.body.approve)));
});

r.post('/:id/confirm', requireRole('customer'), async (req, res) => {
  await asCustomer(req);
  res.json(await jobs.confirmWork(req.params.id, { actor: req.user._id, actorRole: 'customer' }));
});

r.post('/:id/no-show', requireRole('customer'), async (req, res) => {
  await asCustomer(req);
  res.json(await jobs.reportNoShow(req.params.id, req.user._id));
});

r.post('/:id/tip', requireRole('customer'), async (req, res) => {
  await asCustomer(req);
  res.json(await jobs.tip(req.params.id, req.user._id, money.parse(req.body.amount)));
});

r.post('/:id/warranty', requireRole('customer'), async (req, res) => {
  await asCustomer(req);
  const body = z.object({ reason: z.string().trim().min(5).max(500), photos: z.array(media).max(4).optional() }).parse(req.body);
  const rework = await jobs.raiseWarrantyClaim(req.params.id, req.user._id, body);
  res.status(201).json({ _id: rework._id, ref: rework.ref });
});

// --------------------------------------------------------------- Professional
r.post('/:id/en-route', requireRole('professional'), async (req, res) => {
  await asPro(req);
  res.json(await jobs.markEnRoute(req.params.id, req.user._id));
});

r.post('/:id/arrive', requireRole('professional'), async (req, res) => {
  await asPro(req);
  res.json(await jobs.markArrived(req.params.id, req.user._id, z.string().regex(/^\d{4}$/, 'Enter the 4-digit code').parse(String(req.body.otp || ''))));
});

r.post('/:id/photos', requireRole('professional'), async (req, res) => {
  await asPro(req);
  const body = z.object({ kind: z.enum(['before', 'after']), photos: z.array(media).min(1).max(6) }).parse(req.body);
  res.json(await jobs.addPhotos(req.params.id, req.user._id, body.kind, body.photos));
});

r.post('/:id/quote', requireRole('professional'), async (req, res) => {
  await asPro(req);
  const body = z.object({ labour: money, parts, note: z.string().max(300).optional() }).parse(req.body);
  res.json(await jobs.submitQuote(req.params.id, req.user._id, body));
});

r.post('/:id/start-rework', requireRole('professional'), async (req, res) => {
  await asPro(req);
  res.json(await jobs.startRework(req.params.id, req.user._id));
});

r.post('/:id/scope', requireRole('professional'), async (req, res) => {
  await asPro(req);
  const body = z.object({ labour: money, parts, reason: z.string().trim().min(5).max(300) }).parse(req.body);
  res.json(await jobs.proposeScope(req.params.id, req.user._id, body));
});

r.post('/:id/not-feasible', requireRole('professional'), async (req, res) => {
  await asPro(req);
  res.json(await jobs.markNotFeasible(req.params.id, req.user._id, z.string().trim().min(5).max(300).parse(req.body.reason)));
});

r.post('/:id/complete', requireRole('professional'), async (req, res) => {
  await asPro(req);
  res.json(await jobs.completeWork(req.params.id, req.user._id));
});

r.post('/:id/cash-collected', requireRole('professional'), async (req, res) => {
  await asPro(req);
  res.json(await jobs.markCashCollected(req.params.id, req.user._id));
});

// ------------------------------------------------------------------- Both
r.post('/:id/rate', async (req, res) => {
  const { as } = await access(req);
  if (!['customer', 'professional'].includes(as)) throw forbidden();
  const body = z.object({ scores: z.record(z.coerce.number().int().min(1).max(5)), reasonCode: z.string().optional(), text: z.string().max(800).optional(), makePreferred: z.boolean().optional() }).parse(req.body);
  res.json(await jobs.rate(req.params.id, req.user, body));
});

r.post('/:id/dispute', async (req, res) => {
  const { as } = await access(req);
  if (!['customer', 'professional'].includes(as)) throw forbidden();
  const body = z.object({ reason: z.string(), description: z.string().trim().min(10).max(2000), claimAmount: money.optional(), attachments: z.array(media).max(6).optional() }).parse(req.body);
  const { dispute } = await jobs.raiseDispute(req.params.id, req.user, body);
  res.status(201).json(dispute);
});

r.post('/:id/dispute/appeal', async (req, res) => {
  const { job, as } = await access(req);
  if (!['customer', 'professional'].includes(as)) throw forbidden();
  if (!job.dispute) throw notFound('No dispute on this job');
  const reason = z.string().trim().min(10).max(1000).parse(req.body.reason);
  res.json(await jobs.appealDispute(job.dispute, req.user, reason));
});

r.post('/:id/sos', async (req, res) => {
  const { as } = await access(req);
  if (!['customer', 'professional'].includes(as)) throw forbidden();
  const body = z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), description: z.string().max(500).optional() }).parse(req.body);
  const incident = await jobs.raiseIncident(req.params.id, req.user, { kind: 'sos', ...body });
  res.status(201).json({ ok: true, incidentId: incident._id });
});

r.post('/:id/report', async (req, res) => {
  const { as } = await access(req);
  if (!['customer', 'professional'].includes(as)) throw forbidden();
  const body = z.object({ kind: z.enum(['safety_complaint', 'tip_solicitation', 'off_platform_request', 'harassment', 'other']), description: z.string().trim().min(5).max(1000) }).parse(req.body);
  const incident = await jobs.raiseIncident(req.params.id, req.user, body);
  res.status(201).json({ ok: true, incidentId: incident._id, suspendedOtherParty: incident.serious });
});

// SAF-02 — share live status with family.
r.get('/:id/share', requireRole('customer'), async (req, res) => {
  const job = await asCustomer(req);
  res.json({ path: `/track/${job.shareToken}` });
});

// ------------------------------------------------------------ Chat (§3.6)
// Fresh regex per use — a shared /g regex keeps lastIndex between calls.
const PHONE_RE = () => /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const UPI_RE = () => /[\w.-]{2,}@(ok\w+|ybl|paytm|upi|axl|ibl|apl)\b/gi;
const TIP_RE = /\b(tip|bakshish|extra\s+money|chai\s+pani)\b/i;

r.get('/:id/messages', async (req, res) => {
  const { as } = await access(req);
  if (as === 'offeree') throw forbidden();
  res.json(await Message.find({ job: req.params.id }).sort({ createdAt: 1 }).limit(500).lean());
});

r.post('/:id/messages', async (req, res) => {
  const { job, as } = await access(req);
  if (!['customer', 'professional'].includes(as)) throw forbidden();
  if ([S.CLOSED, S.CANCELLED_BY_CUSTOMER, S.EXPIRED].includes(job.state)) throw conflict('Chat is closed for this job');
  let text = z.string().trim().min(1).max(1000).parse(req.body.text);
  const flags = [];
  // SAF-03 / masked comms — numbers and UPI IDs never pass through chat.
  if (PHONE_RE().test(text)) { flags.push('phone_number'); text = text.replace(PHONE_RE(), '[number hidden — use in-app call]'); }
  if (UPI_RE().test(text)) { flags.push('payment_handle'); text = text.replace(UPI_RE(), '[payment ID hidden]'); }
  if (as === 'professional' && TIP_RE.test(text)) flags.push('possible_tip_solicitation'); // TIP-07 — surfaced to ops
  const msg = await Message.create({ job: job._id, from: req.user._id, role: as, text, redacted: flags.length > 0, flags });
  if (flags.includes('possible_tip_solicitation')) {
    await Incident.create({ job: job._id, raisedBy: req.user._id, raisedByRole: 'system', kind: 'tip_solicitation', description: 'Auto-flagged chat message', against: req.user._id });
  }
  toJob(job._id, 'chat:message', msg.toObject());
  res.status(201).json(msg);
});

// Masked calling (SAF-03) — the telephony provider bridges both legs; neither
// party ever sees the other's number.
r.post('/:id/call', async (req, res) => {
  const { job, as } = await access(req);
  if (!['customer', 'professional'].includes(as)) throw forbidden();
  if (![S.ASSIGNED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.SCOPE_REVISED, S.WORK_COMPLETE].includes(job.state)) throw conflict('Calling opens once a professional is assigned');
  res.json({ bridge: '+91 80 4718 2200', pin: String(job._id).slice(-4).toUpperCase(), note: 'Call this number and enter the PIN. Your number stays private.' });
});

export default r;
