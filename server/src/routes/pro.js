import { Router } from 'express';
import { z } from 'zod';
import { customAlphabet } from 'nanoid';
import { Professional, Offer, Job, Category, Invite, Rating, User, LedgerTxn } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, conflict, forbidden } from '../lib/errors.js';
import { PRO_STATUS, ARCHETYPES, OPEN_STATES } from '../config/constants.js';
import { isValidCoords, point, haversineKm } from '../lib/geo.js';
import { acceptOffer, declineOffer } from '../services/dispatch.js';
import { ineligibilityReason, requiredTier } from '../services/matching.js';
import { recomputePro, computeTier } from '../services/score.js';
import { assertUniqueIdentifier, identifierHash } from '../services/identity.js';
import { offerView } from '../services/views.js';
import { balance } from '../services/ledger.js';
import { audit } from '../services/audit.js';
import { env } from '../config/env.js';
import { toOps } from '../services/notifier.js';

const r = Router();
r.use(authenticate, requireRole('professional'));
r.use((req, _res, next) => (req.pro ? next() : next(forbidden('Professional profile missing'))));

// A live fix far from the declared service base is almost always a GPS glitch
// (or a device in another city); it must not pull the pro out of their area.
const MAX_FROM_BASE_KM = 30;
const plausible = (pro, lng, lat) => !pro.baseLocation?.coordinates?.length || haversineKm(pro.baseLocation.coordinates, [lng, lat]) <= MAX_FROM_BASE_KM;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

// ------------------------------------------------------------------ Profile
r.get('/me', async (req, res) => {
  await recomputePro(req.pro._id);
  const pro = await Professional.findById(req.pro._id).lean();
  const categories = await Category.find({ active: true }).sort({ sortOrder: 1 }).lean();
  // Every category shows exactly why the pro can or cannot receive its jobs.
  const eligibility = categories.map((c) => ({
    code: c.code, name: c.name, archetype: c.archetype, archetypeName: ARCHETYPES[c.archetype].name, requiredTier: requiredTier(c),
    added: pro.skills.some((s) => s.category === c.code), reason: ineligibilityReason(pro, c),
  }));
  const receivable = await balance(`pro:${pro._id}:receivable`);
  res.json({ pro, eligibility, cashCommissionOwed: Math.max(0, -receivable.net), shareUrl: `${env.publicUrl}/share/p/${pro.harmoniaId}` });
});

r.patch('/me', async (req, res) => {
  const body = z.object({
    displayName: z.string().trim().min(2).max(60).optional(),
    bio: z.string().trim().max(600).optional(),
    photoUrl: z.string().startsWith('/uploads/').optional(),
    languages: z.array(z.enum(['en', 'hi', 'kn', 'ta', 'te', 'ml', 'mr', 'bn'])).min(1).max(8).optional(),
    radiusKm: z.coerce.number().min(1).max(25).optional(),
    categoryRadius: z.array(z.object({ category: z.string(), radiusKm: z.coerce.number().min(1).max(25) })).optional(),
    restrictions: z.object({ earliest: hhmm.nullable().optional(), latest: hhmm.nullable().optional(), womenCustomersOnly: z.boolean().optional() }).optional(),
    selfDeclaredHistory: z.object({ years: z.coerce.number().int().min(0).max(60), approxJobs: z.coerce.number().int().min(0).max(100000), note: z.string().max(300).optional() }).optional(),
    baseLat: z.coerce.number().optional(),
    baseLng: z.coerce.number().optional(),
  }).parse(req.body);
  const { baseLat, baseLng, ...rest } = body;
  req.pro.set(rest);
  if (isValidCoords(baseLng, baseLat)) {
    req.pro.baseLocation = point(baseLng, baseLat);
    if (req.pro.status === PRO_STATUS.OFFLINE) req.pro.location = point(baseLng, baseLat);
  }
  await req.pro.save();
  res.json(req.pro);
});

// AVL-01 / AVL-06
r.post('/status', async (req, res) => {
  const body = z.object({
    status: z.enum(['available', 'window', 'offline']),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
  }).parse(req.body);
  if (req.pro.suspended?.active) throw forbidden('Your account is suspended pending review');
  if (req.pro.status === PRO_STATUS.BUSY && (req.pro.stats.activeJobs || 0) > 0 && body.status !== 'offline') throw conflict('You are on a job. Your status returns automatically when it is complete.');
  const set = { status: body.status };
  if (body.status === 'window') {
    if (!body.from || !body.to || new Date(body.to) <= new Date(body.from)) throw badRequest('Set a valid window');
    set.window = { from: new Date(body.from), to: new Date(body.to) };
  }
  if (body.status !== 'offline' && isValidCoords(body.lng, body.lat) && plausible(req.pro, body.lng, body.lat)) {
    set.location = point(body.lng, body.lat);
    set.locationUpdatedAt = new Date();
  }
  if (body.status === 'offline') {
    // Stop holding live location the moment the pro goes offline.
    set.location = req.pro.baseLocation;
    set.locationUpdatedAt = null;
  }
  await Professional.updateOne({ _id: req.pro._id }, { $set: set });
  audit({ actor: req.user._id, actorRole: 'professional', action: 'pro.status', entity: 'Professional', entityId: req.pro._id, data: { status: body.status } });
  res.json({ status: body.status });
});

// AVL-07 — the client sends significant changes only; accepted only while
// available or on an active job.
r.post('/location', async (req, res) => {
  const { lat, lng } = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).parse(req.body);
  if (!isValidCoords(lng, lat)) throw badRequest('Invalid location');
  const active = await Job.exists({ professional: req.pro._id, state: { $in: ['ASSIGNED', 'EN_ROUTE'] } });
  if (req.pro.status === PRO_STATUS.OFFLINE && !active) throw conflict('Location is only shared while you are available or on a job');
  if (!plausible(req.pro, lng, lat)) return res.json({ ok: false, ignored: 'far_from_base', note: `More than ${MAX_FROM_BASE_KM} km from your service base — update your base in Availability if you have moved.` });
  await Professional.updateOne({ _id: req.pro._id }, { $set: { location: point(lng, lat), locationUpdatedAt: new Date() } });
  res.json({ ok: true });
});

r.put('/schedule', async (req, res) => {
  const body = z.object({
    weeklySchedule: z.array(z.object({ day: z.number().int().min(0).max(6), from: hhmm, to: hhmm })).max(21),
    scheduleOverrides: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), off: z.boolean().default(false), from: hhmm.optional(), to: hhmm.optional() })).max(60).default([]),
  }).parse(req.body);
  if (body.weeklySchedule.some((s) => s.to <= s.from)) throw badRequest('Each block must end after it starts');
  req.pro.set(body);
  await req.pro.save();
  res.json({ weeklySchedule: req.pro.weeklySchedule, scheduleOverrides: req.pro.scheduleOverrides });
});

// ------------------------------------------------------------------- Offers
r.get('/offers', async (req, res) => {
  const offers = await Offer.find({ pro: req.pro._id, status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
  const jobs = await Job.find({ _id: { $in: offers.map((o) => o.job) } }).lean();
  const customers = await User.find({ _id: { $in: jobs.map((j) => j.customer) } }).select('reputation').lean();
  res.json(offers.map((o) => {
    const job = jobs.find((j) => String(j._id) === String(o.job));
    const c = customers.find((x) => String(x._id) === String(job?.customer));
    return { ...offerView(o, job), customerRating: c?.reputation?.ratingAvg ?? null };
  }));
});

r.post('/offers/:id/accept', async (req, res) => {
  const job = await acceptOffer(req.params.id, req.user._id);
  res.json({ jobId: job._id, ref: job.ref });
});

r.post('/offers/:id/decline', async (req, res) => {
  const reason = z.enum(['too_far', 'busy', 'not_my_skill', 'low_pay', 'personal', 'other']).optional().parse(req.body?.reason);
  await declineOffer(req.params.id, req.user._id, reason);
  res.json({ ok: true, note: 'Declining never affects your Harmonia Score.' });
});

r.get('/active', async (req, res) => {
  const jobs = await Job.find({ professional: req.pro._id, state: { $in: OPEN_STATES } }).sort({ scheduledAt: 1, createdAt: -1 }).lean();
  res.json(jobs.map((j) => ({ ...j, arrivalOtp: undefined, shareToken: undefined })));
});

// ------------------------------------------------------ Verification (§4.2)
const checkInputs = {
  selfie: z.object({ documentUrl: z.string().startsWith('/uploads/') }),
  pan: z.object({ pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN format is ABCDE1234F') }),
  digilocker: z.object({ consent: z.literal(true) }),
  address: z.object({ documentUrl: z.string().startsWith('/uploads/'), kind: z.enum(['utility_bill', 'rent_agreement', 'bank_statement', 'other']) }),
  bank: z.object({ upiOrAccount: z.string().trim().min(6).max(40), ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional() }),
  police: z.object({ consent: z.literal(true) }),
  references: z.object({ refs: z.array(z.object({ name: z.string().trim().min(2).max(60), phone: z.string().regex(/^[6-9]\d{9}$/), relation: z.string().max(60) })).length(2) }),
  licence: z.object({ body: z.string().min(2).max(80), number: z.string().min(3).max(40) }),
};

r.post('/verification/:check', async (req, res) => {
  const check = req.params.check;
  const schema = checkInputs[check];
  if (!schema) throw notFound('Unknown check');
  const input = schema.parse(req.body);
  const pro = await Professional.findById(req.pro._id);
  const now = new Date();
  const c = { status: 'submitted', submittedAt: now };

  switch (check) {
    case 'selfie':
      Object.assign(c, { documentUrl: input.documentUrl, note: 'Liveness to be confirmed by operations' });
      pro.photoUrl = pro.photoUrl || input.documentUrl;
      break;
    case 'pan': {
      // Sandbox: format-valid PAN verifies instantly. Swap for the PAN verification API.
      const h = await assertUniqueIdentifier('panHash', input.pan, pro._id);
      pro.identity.panHash = h;
      pro.identity.panLast4 = input.pan.slice(-4);
      Object.assign(c, { status: 'verified', verifiedAt: now, reference: `PAN••••••${input.pan.slice(-4)}` });
      break;
    }
    case 'digilocker':
      // VER-02/03 — DigiLocker returns a verification result and reference; the
      // Aadhaar number is never requested, received or stored.
      Object.assign(c, { status: 'verified', verifiedAt: now, reference: `DL-${customAlphabet('0123456789ABCDEF', 10)()}` });
      break;
    case 'address':
      Object.assign(c, { documentUrl: input.documentUrl, note: input.kind });
      break;
    case 'bank': {
      const h = await assertUniqueIdentifier('payoutHash', input.upiOrAccount, pro._id);
      pro.identity.payoutHash = h;
      pro.identity.payoutMasked = input.upiOrAccount.includes('@') ? `${input.upiOrAccount.slice(0, 2)}•••@${input.upiOrAccount.split('@')[1]}` : `••••${input.upiOrAccount.slice(-4)}`;
      pro.identity.payoutNameMatched = true; // sandbox penny-drop result
      Object.assign(c, { status: 'verified', verifiedAt: now, reference: `PD-${identifierHash(input.upiOrAccount).slice(0, 8)}`, note: 'Penny drop: name matched' });
      break;
    }
    case 'police':
      Object.assign(c, { note: 'Sent to empanelled verification agency' });
      break;
    case 'references':
      Object.assign(c, { note: input.refs.map((x) => `${x.name} (${x.relation}) ••••${x.phone.slice(-4)}`).join('; ') });
      break;
    case 'licence':
      Object.assign(c, { reference: `${input.body}: ${input.number}` });
      break;
    default:
  }
  pro.checks[check] = c;
  pro.tier = computeTier(pro);
  await pro.save();
  audit({ actor: req.user._id, actorRole: 'professional', action: `verification.${check}.${c.status}`, entity: 'Professional', entityId: pro._id });
  if (c.status === 'submitted') toOps('verification:new', { proId: String(pro._id), check });
  res.json({ check, ...c, tier: pro.tier });
});

// Skill Passport — adding a category starts at self-declared (SKP-02).
r.post('/skills', async (req, res) => {
  const body = z.object({
    category: z.string(),
    level: z.coerce.number().int().min(1).max(5),
    yearsExperience: z.coerce.number().int().min(0).max(60),
    certificates: z.array(z.object({ name: z.string().max(80), issuer: z.enum(['ITI', 'NCVET', 'NSDC', 'OEM', 'Other']), issuedOn: z.coerce.date().optional(), url: z.string().optional() })).max(5).default([]),
  }).parse(req.body);
  const category = await Category.findOne({ code: body.category.toUpperCase(), active: true });
  if (!category) throw notFound('Category not found');
  const pro = await Professional.findById(req.pro._id);
  const existing = pro.skills.find((s) => s.category === category.code);
  if (existing && existing.status === 'verified') throw conflict('This skill is already verified');
  if (existing) Object.assign(existing, { ...body, category: category.code, status: 'pending', provenance: 'self_declared' });
  else pro.skills.push({ ...body, category: category.code, status: 'pending', provenance: 'self_declared' });
  await pro.save();
  toOps('verification:new', { proId: String(pro._id), check: 'skill' });
  res.status(201).json(pro.skills);
});

r.post('/review/appeal', async (req, res) => {
  const text = z.string().trim().min(20).max(1000).parse(req.body.text);
  const pro = await Professional.findById(req.pro._id);
  if (!pro.review?.flagged) throw conflict('There is nothing to appeal');
  pro.review.appeal = { text, at: new Date(), status: 'open' };
  await pro.save();
  toOps('appeal:new', { proId: String(pro._id) });
  res.json(pro.review);
});

// ------------------------------------------------------------------ Reviews
r.get('/reviews', async (req, res) => {
  const reviews = await Rating.find({ pro: req.pro._id, direction: 'customer_to_pro' }).sort({ createdAt: -1 }).limit(50).lean();
  res.json(reviews.map((x) => (x.visible ? x : { _id: x._id, hidden: true, createdAt: x.createdAt })));
});

// REP-05 — respond publicly, once.
r.post('/reviews/:id/respond', async (req, res) => {
  const text = z.string().trim().min(2).max(400).parse(req.body.text);
  const rating = await Rating.findOneAndUpdate(
    { _id: req.params.id, pro: req.pro._id, direction: 'customer_to_pro', visible: true, 'response.text': { $exists: false } },
    { $set: { response: { text, at: new Date() } } },
    { new: true },
  );
  if (!rating) throw conflict('You can respond once to each visible review');
  res.json(rating);
});

// ----------------------------------------------------------------- Earnings
r.get('/earnings', async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 366);
  const since = new Date(Date.now() - days * 86400000);
  const jobs = await Job.find({ professional: req.pro._id, paidAt: { $gte: since } }).sort({ paidAt: -1 }).lean();
  const tipTxns = await LedgerTxn.find({ pro: req.pro._id, kind: 'tip', createdAt: { $gte: since } }).lean();
  const acct = `pro:${req.pro._id}:payable`;
  const payouts = await LedgerTxn.find({ pro: req.pro._id, kind: { $in: ['payout', 'tip_payout'] }, createdAt: { $gte: since } }).sort({ createdAt: -1 }).lean();

  const rows = jobs.map((j) => ({
    jobId: j._id, ref: j.ref, date: j.paidAt, category: j.categoryName, mode: j.route === 'warranty' ? 'warranty' : j.paymentMode,
    gross: j.pricing?.gross || 0, platformFee: j.pricing?.platformFee || 0, tds: j.pricing?.tds || 0, welfareFee: j.pricing?.welfareFee || 0,
    priorityTip: j.pricing?.priorityTip || 0, net: j.pricing?.netToPro || 0, tips: (j.tips || []).reduce((a, t) => a + t.amount, 0), feeHoliday: j.feeHoliday,
  }));
  const tipsTotal = tipTxns.reduce((a, t) => a + (t.lines.find((l) => l.account === acct)?.credit || 0), 0);
  const bucket = (fmt) => {
    const m = {};
    for (const x of rows) {
      const k = fmt(new Date(x.date));
      m[k] = m[k] || { key: k, net: 0, jobs: 0, tips: 0 };
      m[k].net += x.net + x.priorityTip;
      m[k].tips += x.tips;
      m[k].jobs += 1;
    }
    return Object.values(m).sort((a, b) => (a.key < b.key ? 1 : -1));
  };
  const d = (dt) => dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const week = (dt) => { const x = new Date(dt); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return `Week of ${d(x)}`; };
  const receivable = await balance(`pro:${req.pro._id}:receivable`);

  if (req.query.format === 'csv') {
    const head = 'Date,Job,Category,Mode,Customer paid,Platform fee,TDS,Net earning,Priority tip,Tips,Fee holiday\n';
    const body = rows.map((x) => [d(new Date(x.date)), x.ref, x.category, x.mode, x.gross / 100, x.platformFee / 100, x.tds / 100, x.net / 100, x.priorityTip / 100, x.tips / 100, x.feeHoliday ? 'yes' : ''].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="harmonia-earnings-${req.pro.harmoniaId}.csv"`);
    return res.send(head + body);
  }
  res.json({
    rows,
    totals: {
      net: rows.reduce((a, x) => a + x.net + x.priorityTip, 0), tips: tipsTotal, jobs: rows.length,
      platformFees: rows.reduce((a, x) => a + x.platformFee, 0), tds: rows.reduce((a, x) => a + x.tds, 0),
      cashCommissionOwed: Math.max(0, -receivable.net),
    },
    daily: bucket(d), weekly: bucket(week), monthly: bucket((dt) => d(dt).slice(0, 7)),
    payouts: payouts.slice(0, 20).map((p) => ({ at: p.createdAt, amount: (p.lines.find((l) => l.account === acct)?.debit || 0), ref: p.externalRef, kind: p.kind, memo: p.memo })),
  });
});

// ------------------------------------------------------------ Invites (§3.8)
const code = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 8);

r.get('/invites', async (req, res) => {
  const invites = await Invite.find({ pro: req.pro._id }).sort({ createdAt: -1 }).lean();
  const customerIds = invites.flatMap((i) => i.activated.map((a) => a.customer));
  // MIG-06 — how many invited customers activated and rebooked.
  const booked = await Job.aggregate([
    { $match: { customer: { $in: customerIds }, professional: req.pro._id, state: { $in: ['PAID', 'CLOSED'] } } },
    { $group: { _id: '$customer', n: { $sum: 1 } } },
  ]);
  const bookedMap = new Map(booked.map((b) => [String(b._id), b.n]));
  res.json({
    invites: invites.map((i) => ({ ...i, url: `${env.clientUrl}/join/${i.code}`, activatedCount: i.activated.length, bookedCount: i.activated.filter((a) => bookedMap.has(String(a.customer))).length })),
    totals: {
      sent: invites.length, opened: invites.reduce((a, i) => a + i.opens, 0), activated: customerIds.length,
      booked: [...bookedMap.keys()].length, rebooked: [...bookedMap.values()].filter((n) => n >= 2).length,
    },
  });
});

r.post('/invites', async (req, res) => {
  const body = z.object({ label: z.string().trim().max(60).optional(), channel: z.enum(['whatsapp', 'sms', 'link']).default('whatsapp') }).parse(req.body);
  const invite = await Invite.create({ code: code(), pro: req.pro._id, ...body, expiresAt: new Date(Date.now() + 90 * 86400000) });
  const url = `${env.clientUrl}/join/${invite.code}`;
  const text = `Namaste! I now take bookings through Harmonia — you pay only after the work is done, every job has a 30-day warranty, and you can book me directly. Join my list: ${url}\n— ${req.pro.displayName} (${req.pro.harmoniaId})`;
  res.status(201).json({ ...invite.toObject(), url, shareText: text, whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`, sms: `sms:?&body=${encodeURIComponent(text)}` });
});

export default r;
