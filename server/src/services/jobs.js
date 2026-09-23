import { customAlphabet } from 'nanoid';
import {
  Job, Offer, Category, Community, Professional, Home, Asset, HomeRecord, User, Rating, Dispute, Incident, Message, nextSeq,
} from '../models/index.js';
import { S, PRO_STATUS, RATING_REASON_CODES, CUSTOMER_RATING_REASON_CODES } from '../config/constants.js';
import { badRequest, conflict, forbidden, notFound, assert } from '../lib/errors.js';
import { localParts } from '../lib/time.js';
import { transition, logEvent } from './jobMachine.js';
import { startDispatch } from './dispatch.js';
import { priceBand, jobTypeFor, normalisePrice, agreedPrice, tipCap } from './pricing.js';
import { holdInEscrow, settleOnline, settleCash, refundAll, payTip, payWarrantyReplacement, PA } from './payments.js';
import { post } from './ledger.js';
import { recomputePro, recomputeCustomer, refreshLoad } from './score.js';
import { getConfig } from './settings.js';
import { notify, jobChanged, toOps, toUser } from './notifier.js';
import { audit } from './audit.js';
import { categoryLiveness } from './catalogue.js';

const token = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 16);

async function newRef() {
  const { date } = localParts();
  const seq = await nextSeq(`job:${date}`);
  return `HJ-${date.slice(2).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
}

async function loadForCustomer(jobId, userId) {
  const job = await Job.findById(jobId);
  if (!job) throw notFound('Job not found');
  if (String(job.customer) !== String(userId)) throw forbidden();
  return job;
}

async function loadForPro(jobId, userId) {
  const pro = await Professional.findOne({ user: userId });
  const job = await Job.findById(jobId);
  if (!job || !pro) throw notFound('Job not found');
  if (String(job.professional) !== String(pro._id)) throw forbidden('This job is not assigned to you');
  return { job, pro };
}

// AVL-03 — auto-return to the previous status when the pro has nothing active.
async function releasePro(proId) {
  if (!proId) return;
  await refreshLoad(proId);
  const pro = await Professional.findById(proId);
  if (pro && pro.status === PRO_STATUS.BUSY && (pro.stats.activeJobs || 0) === 0) {
    pro.status = pro.statusBeforeBusy && pro.statusBeforeBusy !== PRO_STATUS.BUSY ? pro.statusBeforeBusy : PRO_STATUS.AVAILABLE;
    pro.statusBeforeBusy = undefined;
    await pro.save();
    toUser(pro.user, 'pro:status', { status: pro.status });
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createJob(user, input) {
  if (user.suspended?.active) throw forbidden('Your account is suspended. Contact support.');
  const category = await Category.findOne({ code: input.category, active: true }).lean();
  if (!category) throw badRequest('This service is not available');
  if (['C', 'E'].includes(category.archetype)) throw badRequest('Projects and retainers open in Phase 2');

  const home = await Home.findOne({ _id: input.homeId, customer: user._id });
  if (!home) throw badRequest('Choose one of your homes');
  const asset = input.assetId ? await Asset.findOne({ _id: input.assetId, home: home._id }) : null;

  // Route rules per archetype (§3.3)
  let route = input.route;
  if (category.archetype === 'A' && !['instant', 'named'].includes(route)) route = 'instant';
  if (['B', 'D'].includes(category.archetype)) {
    if (!input.scheduledAt) throw badRequest('Pick a slot for this service');
    route = input.proId ? 'named' : 'scheduled';
  }
  if (route === 'named' && !input.proId) throw badRequest('Choose a professional');
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && (Number.isNaN(scheduledAt.getTime()) || scheduledAt < new Date(Date.now() - 60000))) throw badRequest('Pick a time in the future');

  // §3.2 depth rule — never let a customer book something we cannot fill.
  if (route !== 'named') {
    const live = await categoryLiveness(category, home.location.coordinates);
    if (!live.live) throw conflict(`${category.name} is not live in your area yet (${live.eligible}/${category.minActivePros} professionals). We will tell you when it is.`, 'CATEGORY_NOT_LIVE');
  }

  const { jt } = jobTypeFor(category, input.jobType, home.address?.city || 'Bengaluru');
  const band = priceBand(category, jt.code, home.address?.city || 'Bengaluru');

  const pay = await getConfig('payments');
  const maxPriority = Math.min(pay.tipCapPaise, Math.floor((band.min * pay.tipCapPct) / 100));
  const priorityTip = Math.max(0, Math.min(Number(input.priorityTip) || 0, maxPriority));

  const community = home.community ? await Community.findById(home.community).lean() : null;

  const job = await Job.create({
    ref: await newRef(),
    customer: user._id,
    home: home._id,
    asset: asset?._id,
    community: home.community,
    category: category.code,
    categoryName: category.name,
    archetype: category.archetype,
    city: home.address?.city || 'Bengaluru',
    stateCode: community?.state === 'Tamil Nadu' ? 'TN' : 'KA',
    jobType: { code: jt.code, name: jt.name, labour: jt.labour, standardParts: jt.standardParts, durationMin: jt.durationMin },
    route,
    requestedPro: route === 'named' ? input.proId : undefined,
    scheduledAt,
    description: input.description,
    requestPhotos: (input.photos || []).slice(0, 4),
    location: home.location,
    address: { line: home.address?.line, block: home.address?.block, communityName: community?.name },
    requireWoman: Boolean(input.requireWoman && category.womanPreferenceOffered),
    priceBand: band,
    priorityTip,
    paymentMode: input.paymentMode === 'cash' ? 'cash' : 'online',
    dispatch: { mode: route === 'named' ? 'named' : route === 'scheduled' ? 'broadcast_scheduled' : 'waves' },
    timeline: [{ state: S.CREATED, at: new Date(), by: user._id, actor: 'customer' }],
    shareToken: token(),
  });
  audit({ actor: user._id, actorRole: 'customer', action: 'job.created', entity: 'Job', entityId: job._id, data: { route, category: category.code } });
  return startDispatch(job._id, { actor: user._id });
}

// ---------------------------------------------------------------------------
// Professional execution
// ---------------------------------------------------------------------------
export async function markEnRoute(jobId, userId) {
  await loadForPro(jobId, userId);
  return transition(jobId, S.ASSIGNED, S.EN_ROUTE, { actor: userId, actorRole: 'professional' });
}

export async function markArrived(jobId, userId, otp) {
  const { job, pro } = await loadForPro(jobId, userId);
  const withOtp = await Job.findById(jobId).select('+arrivalOtp');
  if (!otp || String(otp).trim() !== withOtp.arrivalOtp) throw badRequest('That code does not match. Ask the customer for the 4-digit arrival code.');
  const now = new Date();
  const onTime = job.eta ? now <= new Date(job.eta.getTime() + 5 * 60000) : true;
  const updated = await transition(jobId, [S.ASSIGNED, S.EN_ROUTE], S.ARRIVED, { actor: userId, actorRole: 'professional', note: onTime ? 'Arrived on time' : 'Arrived late', set: { arrivedAt: now } });
  await Professional.updateOne({ _id: pro._id }, { $inc: { 'stats.arrivals': 1, 'stats.onTimeArrivals': onTime ? 1 : 0 } });
  return updated;
}

export async function addPhotos(jobId, userId, kind, photos) {
  assert(['before', 'after'].includes(kind), badRequest('Unknown photo type'));
  const { job } = await loadForPro(jobId, userId);
  assert([S.ARRIVED, S.IN_PROGRESS, S.SCOPE_REVISED].includes(job.state), conflict('Photos can be added once you have arrived'));
  const clean = (photos || []).filter((p) => p?.url && p?.sha256).slice(0, 6).map((p) => ({ ...p, by: userId, at: new Date() }));
  assert(clean.length, badRequest('Upload at least one photo'));
  await Job.updateOne({ _id: jobId }, { $push: { [`photos.${kind}`]: { $each: clean } } });
  return logEvent(jobId, { actor: userId, actorRole: 'professional', note: `${clean.length} ${kind} photo(s) added` });
}

const needsPhotos = (job) => ['A', 'C'].includes(job.archetype); // JOB-02

export async function submitQuote(jobId, userId, input) {
  const { job } = await loadForPro(jobId, userId);
  assert(job.state === S.ARRIVED, conflict('Quote once you have arrived and inspected the job'));
  assert(job.quote?.status !== 'approved', conflict('The quote is already approved'));
  if (needsPhotos(job)) assert(job.photos.before.length > 0, badRequest('Add a "before" photo first — it protects you in any dispute'));
  const price = normalisePrice({ visit: job.priceBand.visit, labour: input.labour, parts: input.parts });
  assert(price.total > 0, badRequest('Enter the labour charge'));
  price.note = input.note?.slice(0, 300);
  const updated = await Job.findOneAndUpdate(
    { _id: jobId, state: S.ARRIVED },
    { $set: { quote: { status: 'pending', price, submittedAt: new Date() } }, $push: { timeline: { state: 'EVENT', at: new Date(), by: userId, actor: 'professional', note: `Firm price ₹${price.total / 100} sent for approval` } } },
    { new: true },
  );
  jobChanged(updated);
  notify(job.customer, { title: 'Approve the firm price', body: `₹${price.total / 100} before work begins`, link: `/app/jobs/${job._id}`, tone: 'info' });
  return updated;
}

export async function decideQuote(jobId, userId, approve) {
  const job = await loadForCustomer(jobId, userId);
  assert(job.state === S.ARRIVED && job.quote?.status === 'pending', conflict('There is no quote waiting for you'));
  if (!approve) {
    const updated = await Job.findByIdAndUpdate(jobId, { $set: { 'quote.status': 'rejected', 'quote.decidedAt': new Date() }, $push: { timeline: { state: 'EVENT', at: new Date(), by: userId, actor: 'customer', note: 'Quote declined' } } }, { new: true });
    jobChanged(updated);
    return updated;
  }
  await Job.updateOne({ _id: jobId }, { $set: { 'quote.status': 'approved', 'quote.decidedAt': new Date() } });
  // Escrow: the customer pays now, the pro is paid when the customer confirms.
  if (job.paymentMode === 'online') await holdInEscrow(job, job.quote.price.total + (job.priorityTip || 0), 'quote');
  return transition(jobId, S.ARRIVED, S.IN_PROGRESS, { actor: userId, actorRole: 'customer', note: `Firm price approved ₹${job.quote.price.total / 100}`, set: { startedAt: new Date() } });
}

// Warranty rework has no price — the pro simply starts.
export async function startRework(jobId, userId) {
  const { job } = await loadForPro(jobId, userId);
  assert(job.route === 'warranty', badRequest('Only warranty jobs start without a quote'));
  if (needsPhotos(job)) assert(job.photos.before.length > 0, badRequest('Add a "before" photo first'));
  await Job.updateOne({ _id: jobId }, { $set: { quote: { status: 'approved', price: normalisePrice({}), submittedAt: new Date(), decidedAt: new Date() } } });
  return transition(jobId, S.ARRIVED, S.IN_PROGRESS, { actor: userId, actorRole: 'professional', note: 'Warranty rework started', set: { startedAt: new Date() } });
}

export async function proposeScope(jobId, userId, input) {
  const { job } = await loadForPro(jobId, userId);
  assert(job.state === S.IN_PROGRESS, conflict('Scope can only change while work is in progress'));
  assert(input.reason?.trim(), badRequest('Explain what changed'));
  const price = normalisePrice({ visit: job.priceBand.visit, labour: input.labour, parts: input.parts });
  const current = agreedPrice(job);
  assert(price.total !== current.total, badRequest('The revised price is the same as the agreed price'));
  const updated = await transition(jobId, S.IN_PROGRESS, S.SCOPE_REVISED, {
    actor: userId, actorRole: 'professional', note: `Scope revision: ₹${current.total / 100} → ₹${price.total / 100}`,
    push: { scopeRevisions: { price, reason: input.reason.slice(0, 300), status: 'pending', proposedAt: new Date() } },
  });
  notify(job.customer, { title: 'Scope change needs your approval', body: input.reason.slice(0, 80), link: `/app/jobs/${job._id}`, tone: 'warning' });
  return updated;
}

export async function decideScope(jobId, userId, approve) {
  const job = await loadForCustomer(jobId, userId);
  assert(job.state === S.SCOPE_REVISED, conflict('There is no scope change waiting for you'));
  const idx = job.scopeRevisions.length - 1;
  const rev = job.scopeRevisions[idx];
  if (approve && job.paymentMode === 'online') {
    const heldNet = job.payment.escrowed - job.payment.refunded;
    const delta = rev.price.total + (job.priorityTip || 0) - heldNet;
    if (delta > 0) await holdInEscrow(job, delta, `scope${idx}`);
  }
  return transition(jobId, S.SCOPE_REVISED, S.IN_PROGRESS, {
    actor: userId, actorRole: 'customer',
    note: approve ? `Scope change approved (₹${rev.price.total / 100})` : 'Scope change declined — original scope continues',
    set: { [`scopeRevisions.${idx}.status`]: approve ? 'approved' : 'rejected', [`scopeRevisions.${idx}.decidedAt`]: new Date() },
  });
}

export async function markNotFeasible(jobId, userId, reason) {
  const { job } = await loadForPro(jobId, userId);
  assert(job.state === S.ARRIVED, conflict('Only possible on arrival'));
  const windows = await getConfig('windows');
  const updated = await transition(jobId, S.ARRIVED, S.WORK_COMPLETE, {
    actor: userId, actorRole: 'professional', note: `Not feasible: ${reason || 'no reason given'} — visit charge applies`,
    set: { notFeasible: { flag: true, reason }, completedAt: new Date(), confirmDueAt: new Date(Date.now() + windows.autoConfirmHours * 3600000) },
  });
  await releasePro(job.professional);
  return updated;
}

export async function completeWork(jobId, userId) {
  const { job } = await loadForPro(jobId, userId);
  assert(job.state === S.IN_PROGRESS, conflict('Work must be in progress to complete it'));
  if (needsPhotos(job)) assert(job.photos.after.length > 0, badRequest('Add an "after" photo — it is your evidence the work was done'));
  const windows = await getConfig('windows');
  const updated = await transition(jobId, S.IN_PROGRESS, S.WORK_COMPLETE, {
    actor: userId, actorRole: 'professional',
    set: { completedAt: new Date(), confirmDueAt: new Date(Date.now() + windows.autoConfirmHours * 3600000) },
  });
  await releasePro(job.professional);
  notify(job.customer, { title: 'Work complete — please confirm', body: job.paymentMode === 'online' ? 'Payment is released to your professional when you confirm.' : 'Confirm, then pay your professional in cash.', link: `/app/jobs/${job._id}`, tone: 'success' });
  return updated;
}

// MIG-03 — fee holiday for jobs from customers the professional brought in.
async function applyFeeHoliday(job) {
  const customer = await User.findById(job.customer).lean();
  if (!customer?.invitedBy?.pro || String(customer.invitedBy.pro) !== String(job.professional)) return false;
  const pay = await getConfig('payments');
  const within = Date.now() - new Date(customer.invitedBy.at).getTime() <= pay.feeHolidayDays * 86400000;
  const used = await Job.countDocuments({ customer: job.customer, professional: job.professional, feeHoliday: true, _id: { $ne: job._id } });
  const eligible = within && used < pay.feeHolidayMaxJobs;
  if (eligible) await Job.updateOne({ _id: job._id }, { $set: { feeHoliday: true } });
  return eligible;
}

export async function confirmWork(jobId, { actor, actorRole = 'customer', auto = false } = {}) {
  let job = await Job.findById(jobId);
  assert(job && job.state === S.WORK_COMPLETE, conflict('Nothing to confirm'));
  job = await transition(jobId, S.WORK_COMPLETE, S.CUSTOMER_CONFIRMED, {
    actor, actorRole, note: auto ? 'Auto-confirmed after the confirmation window' : 'Customer confirmed the work', set: { confirmedAt: new Date() },
  });
  if (job.route === 'warranty' || job.paymentMode === 'online') return settle(job._id, { actor, actorRole });
  notify((await Professional.findById(job.professional).lean())?.user, { title: 'Customer confirmed', body: 'Collect cash and mark it received.', link: `/pro/jobs/${job._id}`, tone: 'success' });
  return job;
}

export async function markCashCollected(jobId, userId) {
  const { job } = await loadForPro(jobId, userId);
  assert(job.paymentMode === 'cash', badRequest('This is an online payment job'));
  assert([S.CUSTOMER_CONFIRMED].includes(job.state), conflict('Wait for the customer to confirm the work'));
  return settle(jobId, { actor: userId, actorRole: 'professional' });
}

async function settle(jobId, { actor, actorRole }) {
  let job = await Job.findById(jobId);
  if (job.route === 'warranty') {
    const original = String(job.warranty?.originalPro) === String(job.professional);
    if (!original) {
      // Replacement professional paid from the Assurance provision.
      const pay = await getConfig('payments');
      const amount = Math.round(((job.priceBand.visit + job.jobType.labour) * pay.reworkPayoutPct) / 100);
      await payWarrantyReplacement(job, amount);
    }
    await Job.updateOne({ _id: jobId }, { $set: { pricing: { gross: 0, netToPro: 0, platformFee: 0 }, 'payment.status': 'released', 'payment.settledAt': new Date() } });
  } else {
    await applyFeeHoliday(job);
    job = await Job.findById(jobId);
    job = job.paymentMode === 'online' ? await settleOnline(job) : await settleCash(job);
  }
  const windows = await getConfig('windows');
  job = await transition(jobId, S.CUSTOMER_CONFIRMED, S.PAID, {
    actor, actorRole, note: job.paymentMode === 'cash' && job.route !== 'warranty' ? 'Cash collected and reconciled' : 'Escrow released, professional settled same day',
    set: { paidAt: new Date(), 'ratings.windowClosesAt': new Date(Date.now() + windows.ratingWindowHours * 3600000) },
  });
  await afterPaid(job);
  return job;
}

// HOM-03 / ASR-01 — every paid job writes to the Home Record with its warranty.
async function afterPaid(job) {
  const category = await Category.findOne({ code: job.category }).lean();
  const pro = await Professional.findById(job.professional).lean();
  const warrantyDays = job.route === 'warranty' ? 0 : category?.warrantyDays ?? 30;
  const expiresAt = new Date(Date.now() + warrantyDays * 86400000);
  if (job.route !== 'warranty') await Job.updateOne({ _id: job._id }, { $set: { 'warranty.expiresAt': expiresAt } });
  const price = agreedPrice(job) || { parts: [], total: 0 };
  await HomeRecord.updateOne(
    { job: job._id },
    {
      $setOnInsert: {
        home: job.home, job: job._id, asset: job.asset, date: new Date(), professional: pro._id, professionalName: pro.displayName, harmoniaId: pro.harmoniaId,
        category: job.category, categoryName: job.categoryName, workDone: `${job.jobType?.name}${job.notFeasible?.flag ? ' (inspection only)' : ''}${job.route === 'warranty' ? ' — warranty rework' : ''}`,
        parts: price.parts, cost: job.pricing?.gross ?? price.total, photos: [...(job.photos?.after || [])].map((p) => ({ url: p.url, sha256: p.sha256 })),
        warrantyExpiresAt: job.route === 'warranty' ? null : expiresAt, isRework: job.route === 'warranty',
      },
    },
    { upsert: true },
  );
  if (job.asset) await Asset.updateOne({ _id: job.asset }, { $set: { lastServiceAt: new Date() } });
  await recomputePro(job.professional);
}

// ---------------------------------------------------------------------------
// Cancellation, reassignment, no-show
// ---------------------------------------------------------------------------
export async function cancelByCustomer(jobId, userId, reason) {
  const job = await loadForCustomer(jobId, userId);
  const category = await Category.findOne({ code: job.category }).lean();
  const order = [S.CREATED, S.DISPATCHING, S.ASSIGNED, S.EN_ROUTE, S.ARRIVED];
  assert(order.includes(job.state), conflict('This job can no longer be cancelled — raise an issue instead'));
  // JOB-06 — cancellation charges disclosed before booking, applied here.
  const freeUntil = order.indexOf(category?.cancellation?.freeBeforeState || S.EN_ROUTE);
  let fee = order.indexOf(job.state) < freeUntil ? 0 : category?.cancellation?.feePaise || 0;
  if (job.state === S.ARRIVED) fee = job.priceBand.visit;

  const updated = await transition(jobId, order, S.CANCELLED_BY_CUSTOMER, { actor: userId, actorRole: 'customer', note: reason, set: { cancellation: { by: 'customer', reason, feePaise: fee, at: new Date() } } });
  await Offer.updateMany({ job: jobId, status: 'pending' }, { $set: { status: 'withdrawn' } });
  await refundAll(updated, 'customer_cancel');
  if (fee > 0 && job.professional) {
    // The fee compensates the professional's wasted trip, in full.
    const { paRef } = await PA.collect({ amount: fee });
    await post({ key: `cancel_fee:${job._id}`, kind: 'cancellation_fee', memo: 'Cancellation fee to professional', job: job._id, pro: job.professional, customer: job.customer, externalRef: paRef, lines: [{ account: 'pa:escrow', debit: fee }, { account: `pro:${job.professional}:payable`, credit: fee }] });
    const { payoutRef } = await PA.payout({ amount: fee });
    await post({ key: `cancel_fee_payout:${job._id}`, kind: 'payout', memo: 'Cancellation fee payout', job: job._id, pro: job.professional, externalRef: payoutRef, lines: [{ account: `pro:${job.professional}:payable`, debit: fee }, { account: 'pa:escrow', credit: fee }] });
  }
  if (job.professional) {
    const pro = await Professional.findById(job.professional).lean();
    notify(pro?.user, { title: 'Job cancelled by customer', body: fee ? `You receive the ₹${fee / 100} cancellation fee.` : job.ref, tone: 'warning' });
    await releasePro(job.professional);
  }
  return updated;
}

async function reassign(jobId, { actor, actorRole, note, proId }) {
  await transition(jobId, [S.CANCELLED_BY_PRO, S.NO_SHOW], S.REASSIGNED, { actor, actorRole, note: 'Finding a replacement at no cost' });
  const job = await Job.findById(jobId);
  // A named or warranty job whose professional dropped out opens to everyone else.
  const mode = job.dispatch.mode === 'named' || job.dispatch.mode === 'waves'
    ? (job.archetype === 'A' || job.route === 'warranty' ? 'waves' : 'broadcast_scheduled')
    : job.dispatch.mode;
  const set = { 'dispatch.mode': mode, 'dispatch.offered': [], 'dispatch.namedOutcome': null };
  if (job.route === 'named') set.route = mode === 'waves' ? 'instant' : 'scheduled';
  await Job.updateOne({ _id: jobId }, { $set: set, $unset: { professional: 1, eta: 1, assignedAt: 1 }, $addToSet: { 'dispatch.excluded': proId } });
  await releasePro(proId);
  return startDispatch(jobId, { from: S.REASSIGNED, note });
}

export async function cancelByPro(jobId, userId, reason) {
  const { job, pro } = await loadForPro(jobId, userId);
  await transition(jobId, [S.ASSIGNED, S.EN_ROUTE], S.CANCELLED_BY_PRO, { actor: userId, actorRole: 'professional', note: reason });
  // AVL-05 — accepting then cancelling does reduce the Score.
  await Professional.updateOne({ _id: pro._id }, { $inc: { 'stats.cancelledAfterAccept': 1 } });
  notify(job.customer, { title: 'Your professional had to cancel', body: 'We are finding a replacement right now, at no cost to you.', link: `/app/jobs/${job._id}`, tone: 'warning' });
  const out = await reassign(jobId, { actor: userId, actorRole: 'professional', note: 'Replacement after professional cancelled', proId: pro._id });
  recomputePro(pro._id);
  return out;
}

export async function reportNoShow(jobId, userId) {
  const job = await loadForCustomer(jobId, userId);
  const windows = await getConfig('windows');
  assert([S.ASSIGNED, S.EN_ROUTE].includes(job.state), conflict('No-show can only be reported before arrival'));
  assert(job.eta && Date.now() > job.eta.getTime() + windows.noShowGraceMin * 60000, conflict(`You can report a no-show ${windows.noShowGraceMin} minutes after the expected arrival time`));
  const proId = job.professional;
  await transition(jobId, [S.ASSIGNED, S.EN_ROUTE], S.NO_SHOW, { actor: userId, actorRole: 'customer' });
  await Professional.updateOne({ _id: proId }, { $inc: { 'stats.noShows': 1 } });
  const out = await reassign(jobId, { actor: userId, actorRole: 'customer', note: 'Free replacement after no-show', proId });
  recomputePro(proId);
  return out;
}

// ---------------------------------------------------------------------------
// Ratings (REP-01..07), tips (TIP-03..06), warranty (ASR-02..05)
// ---------------------------------------------------------------------------
export async function rate(jobId, user, input) {
  const job = await Job.findById(jobId);
  if (!job) throw notFound();
  assert([S.CUSTOMER_CONFIRMED, S.PAID, S.CLOSED, S.DISPUTED].includes(job.state), conflict('You can rate once the work is confirmed'));
  const isCustomer = String(job.customer) === String(user._id);
  const pro = await Professional.findById(job.professional).lean();
  const isPro = pro && String(pro.user) === String(user._id);
  assert(isCustomer || isPro, forbidden());
  if (job.ratings.windowClosesAt && job.ratings.windowClosesAt < new Date()) throw conflict('The rating window has closed');

  const dims = isCustomer ? ['quality', 'punctuality', 'conduct', 'cleanliness', 'priceFairness'] : ['respect', 'clarity', 'paymentPromptness'];
  const scores = {};
  for (const d of dims) {
    const v = Number(input.scores?.[d]);
    assert(Number.isInteger(v) && v >= 1 && v <= 5, badRequest(`Rate ${d} from 1 to 5`));
    scores[d] = v;
  }
  const overall = Math.round((dims.reduce((a, d) => a + scores[d], 0) / dims.length) * 10) / 10;
  const codes = isCustomer ? RATING_REASON_CODES : CUSTOMER_RATING_REASON_CODES;
  if (overall < 3) assert(codes.includes(input.reasonCode), badRequest('Tell us what went wrong — pick a reason')); // REP-04

  try {
    await Rating.create({
      job: job._id, direction: isCustomer ? 'customer_to_pro' : 'pro_to_customer', rater: user._id, pro: job.professional, customer: job.customer,
      category: job.category, scores, overall: Math.max(1, Math.min(5, Math.round(overall))), reasonCode: overall < 3 ? input.reasonCode : undefined, text: input.text?.slice(0, 800),
    });
  } catch (err) {
    if (err.code === 11000) throw conflict('You have already rated this job');
    throw err;
  }
  const flag = isCustomer ? 'ratings.customerRated' : 'ratings.proRated';
  let updated = await Job.findByIdAndUpdate(jobId, { $set: { [flag]: true } }, { new: true });

  // PRF-01 — offer preferred status after a good job.
  if (isCustomer && overall >= 4 && input.makePreferred) await addPreferred(user._id, job.professional, job.category, 'job');

  if (updated.ratings.customerRated && updated.ratings.proRated) updated = await revealAndClose(updated);
  else jobChanged(updated);
  return updated;
}

async function revealAndClose(job) {
  await Rating.updateMany({ job: job._id }, { $set: { visible: true } });
  let updated = await Job.findByIdAndUpdate(job._id, { $set: { 'ratings.revealed': true } }, { new: true });
  if (updated.state === S.PAID) updated = await transition(job._id, S.PAID, S.CLOSED, { actorRole: 'system', note: 'Ratings exchanged', set: { closedAt: new Date() } });
  await Promise.all([recomputePro(job.professional), recomputeCustomer(job.customer)]);
  return updated;
}

export async function closeRatingWindow(job) {
  return revealAndClose(job);
}

export async function tip(jobId, userId, amount) {
  const job = await loadForCustomer(jobId, userId);
  assert(job.ratings.customerRated, conflict('Tips are offered after you rate — never before')); // TIP-03
  assert([S.PAID, S.CLOSED].includes(job.state), conflict('Tips can be added after payment'));
  const windows = await getConfig('windows');
  assert(Date.now() - job.paidAt.getTime() <= windows.tipWindowDays * 86400000, conflict('The tip window for this job has closed'));
  const cap = await tipCap(job);
  const already = (job.tips || []).reduce((a, t) => a + t.amount, 0);
  assert(Number.isInteger(amount) && amount > 0, badRequest('Choose a tip amount'));
  assert(already + amount <= cap, badRequest(`Tips on this job are capped at ₹${cap / 100}`)); // TIP-05
  const ref = await payTip(job, amount, (job.tips?.length || 0) + 1);
  const updated = await Job.findByIdAndUpdate(jobId, { $push: { tips: { amount, at: new Date(), txn: ref } } }, { new: true });
  await Professional.updateOne({ _id: job.professional }, { $inc: { 'stats.tipsCount': 1 } });
  const pro = await Professional.findById(job.professional).lean();
  notify(pro.user, { title: `You received a ₹${amount / 100} tip`, body: 'Zero commission — the full amount is on its way to your UPI.', tone: 'success' });
  jobChanged(updated);
  return updated;
}

export async function raiseWarrantyClaim(jobId, userId, { reason, photos }) {
  const job = await loadForCustomer(jobId, userId);
  assert([S.PAID, S.CLOSED].includes(job.state), conflict('Warranty applies to completed, paid jobs'));
  assert(job.route !== 'warranty', badRequest('Raise the claim on the original job'));
  assert(job.warranty?.expiresAt && job.warranty.expiresAt > new Date(), conflict('The workmanship warranty on this job has expired'));
  assert(reason?.trim(), badRequest('Describe what failed'));
  const open = await Job.findOne({ 'warranty.parentJob': job._id, state: { $nin: [S.CLOSED, S.PAID, S.CANCELLED_BY_CUSTOMER, S.EXPIRED] } });
  if (open) throw conflict('A warranty visit is already open for this job');

  const rework = await Job.create({
    ref: await newRef(),
    customer: job.customer, home: job.home, asset: job.asset, community: job.community,
    category: job.category, categoryName: job.categoryName, archetype: job.archetype, city: job.city, stateCode: job.stateCode,
    jobType: job.jobType, route: 'warranty', requestedPro: job.professional,
    description: `Warranty claim on ${job.ref}: ${reason.slice(0, 500)}`, requestPhotos: (photos || []).slice(0, 4),
    location: job.location, address: job.address, priceBand: { min: 0, max: 0, visit: job.priceBand.visit }, paymentMode: 'online',
    dispatch: { mode: 'named' }, warranty: { parentJob: job._id, originalPro: job.professional, reason },
    reworkAttributedTo: job.professional, // ASR-05 — feeds the rework rate
    timeline: [{ state: S.CREATED, at: new Date(), by: userId, actor: 'customer', note: 'Harmonia Assurance claim' }],
    shareToken: token(),
  });
  await Job.updateOne({ _id: job._id }, { $push: { 'warranty.claims': rework._id } });
  audit({ actor: userId, actorRole: 'customer', action: 'warranty.claimed', entity: 'Job', entityId: job._id, data: { rework: rework._id } });
  const pro = await Professional.findById(job.professional).lean();
  notify(pro?.user, { title: 'Warranty visit requested', body: `${job.categoryName} at ${job.address?.block || 'a previous customer'} — first refusal is yours.`, link: '/pro', tone: 'warning' });
  recomputePro(job.professional);
  return startDispatch(rework._id, { actor: userId });
}

// ---------------------------------------------------------------------------
// Disputes (DIS-01..08)
// ---------------------------------------------------------------------------
async function assembleEvidence(job) {
  const [messages, ratings, pro, customer] = await Promise.all([
    Message.find({ job: job._id }).sort({ createdAt: 1 }).lean(),
    Rating.find({ job: job._id }).lean(),
    Professional.findById(job.professional).select('displayName harmoniaId tier score stats.ratingAvg').lean(),
    User.findById(job.customer).select('name reputation').lean(),
  ]);
  return {
    assembledAt: new Date(),
    request: { description: job.description, photos: job.requestPhotos, jobType: job.jobType, priceBand: job.priceBand, createdAt: job.createdAt },
    quote: job.quote, scopeRevisions: job.scopeRevisions, notFeasible: job.notFeasible,
    photos: job.photos, timeline: job.timeline, payment: job.payment, pricing: job.pricing,
    chat: messages.map((m) => ({ role: m.role, text: m.text, at: m.createdAt, flags: m.flags })),
    ratings, professional: pro, customer: { name: customer?.name, reputation: customer?.reputation },
  };
}

export async function raiseDispute(jobId, user, input) {
  const job = await Job.findById(jobId);
  if (!job) throw notFound();
  const isCustomer = String(job.customer) === String(user._id);
  const pro = job.professional ? await Professional.findById(job.professional).lean() : null;
  const isPro = pro && String(pro.user) === String(user._id);
  assert(isCustomer || isPro, forbidden());
  assert(job.professional, badRequest('Nothing to dispute before a professional is assigned'));
  const allowed = [S.ARRIVED, S.IN_PROGRESS, S.SCOPE_REVISED, S.WORK_COMPLETE, S.CUSTOMER_CONFIRMED, S.PAID, S.CLOSED];
  assert(allowed.includes(job.state), conflict('A dispute cannot be raised at this stage'));
  const windows = await getConfig('windows');
  const anchor = job.paidAt || job.completedAt || new Date();
  assert(Date.now() - anchor.getTime() <= windows.disputeWindowDays * 86400000, conflict('The dispute window has closed'));
  assert(input.reason && input.description?.trim(), badRequest('Choose a reason and describe the issue'));
  if (job.dispute) {
    const existing = await Dispute.findById(job.dispute);
    if (existing && existing.status !== 'closed') throw conflict('A dispute is already open on this job');
  }

  const held = Math.max(0, job.payment.escrowed - job.payment.refunded);
  const dispute = await Dispute.create({
    ref: `HD-${String(await nextSeq('dispute')).padStart(5, '0')}`,
    job: job._id, raisedBy: user._id, raisedByRole: isCustomer ? 'customer' : 'professional',
    reason: input.reason, description: input.description.slice(0, 2000), claimAmount: input.claimAmount, attachments: (input.attachments || []).slice(0, 6),
    stateBefore: job.state, amountHeld: [S.PAID, S.CLOSED].includes(job.state) ? 0 : held,
    evidence: await assembleEvidence(job), slaDueAt: new Date(Date.now() + 72 * 3600000),
  });
  const updated = await transition(jobId, allowed, S.DISPUTED, { actor: user._id, actorRole: isCustomer ? 'customer' : 'professional', note: `Dispute ${dispute.ref}: ${input.reason}`, set: { dispute: dispute._id } });
  if ([S.ARRIVED, S.IN_PROGRESS, S.SCOPE_REVISED].includes(job.state)) await releasePro(job.professional);
  toOps('dispute:new', { disputeId: String(dispute._id), ref: dispute.ref });
  notify(isCustomer ? pro.user : job.customer, { title: 'A dispute was raised', body: `${dispute.ref} — our team decides within 72 hours under a published, symmetric policy.`, tone: 'warning' });
  return { job: updated, dispute };
}

export async function decideDispute(disputeId, admin, input) {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw notFound();
  assert(dispute.status === 'open', conflict('This dispute has already been decided'));
  assert(['favour_customer', 'favour_pro', 'split', 'no_fault'].includes(input.outcome), badRequest('Choose an outcome'));
  assert(input.rationale?.trim()?.length >= 10, badRequest('Write the rationale — decisions must be explainable (DIS-08)'));
  let job = await Job.findById(dispute.job);
  const preSettlement = ![S.PAID, S.CLOSED].includes(dispute.stateBefore);
  const price = agreedPrice(job);
  const gross = price?.total || 0;

  let refund = 0;
  if (input.outcome === 'favour_customer') refund = input.refundPaise != null ? Math.min(input.refundPaise, gross) : gross;
  if (input.outcome === 'split') refund = Math.min(Math.max(0, input.refundPaise || 0), gross);

  if (preSettlement) {
    const workDone = [S.WORK_COMPLETE, S.CUSTOMER_CONFIRMED].includes(dispute.stateBefore);
    if (!price || (refund >= gross && gross > 0) || (!workDone && input.outcome === 'favour_customer')) {
      await refundAll(job, 'dispute');
      job = await transition(job._id, S.DISPUTED, S.CLOSED, { actor: admin._id, actorRole: 'admin', note: `Dispute ${dispute.ref}: full refund`, set: { closedAt: new Date() } });
    } else {
      if (job.paymentMode === 'online') await settleOnline(job, { refund });
      else {
        await settleCash(job);
        if (refund > 0) {
          // The pro holds the cash; Harmonia refunds the customer and absorbs it.
          const { refundRef } = await PA.refund({ amount: refund });
          await post({ key: `goodwill:${dispute._id}`, kind: 'goodwill_refund', memo: `Dispute ${dispute.ref} refund on cash job`, job: job._id, customer: job.customer, externalRef: refundRef, lines: [{ account: 'cost:goodwill', debit: refund }, { account: 'pa:escrow', credit: refund }] });
        }
      }
      const windows = await getConfig('windows');
      job = await transition(job._id, S.DISPUTED, S.PAID, { actor: admin._id, actorRole: 'admin', note: `Dispute ${dispute.ref} decided: ${input.outcome}`, set: { paidAt: new Date(), 'ratings.windowClosesAt': new Date(Date.now() + windows.ratingWindowHours * 3600000) } });
      await afterPaid(job);
    }
  } else {
    if (refund > 0) {
      // Money was already settled — Harmonia makes the customer whole.
      const { refundRef } = await PA.refund({ amount: refund });
      await post({ key: `goodwill:${dispute._id}`, kind: 'goodwill_refund', memo: `Dispute ${dispute.ref} goodwill refund`, job: job._id, customer: job.customer, externalRef: refundRef, lines: [{ account: 'cost:goodwill', debit: refund }, { account: 'pa:escrow', credit: refund }] });
    }
    job = await transition(job._id, S.DISPUTED, dispute.stateBefore === S.PAID ? S.PAID : S.CLOSED, { actor: admin._id, actorRole: 'admin', note: `Dispute ${dispute.ref} decided: ${input.outcome}` });
  }

  // REP-07 — a customer rating from a dispute won by the pro does not count.
  if (input.outcome === 'favour_pro') {
    await Rating.updateMany({ job: job._id, direction: 'customer_to_pro' }, { $set: { excluded: true, excludedReason: `Dispute ${dispute.ref} decided in the professional's favour` } });
    if (dispute.raisedByRole === 'professional' && ['payment', 'conduct'].includes(dispute.reason)) {
      await User.updateOne({ _id: job.customer }, { $inc: { [dispute.reason === 'payment' ? 'reputation.nonPayment' : 'reputation.upheldComplaints']: 1 } });
    }
  }

  dispute.set({ status: 'decided', decision: { outcome: input.outcome, refundPaise: refund, rationale: input.rationale, seriousConduct: !!input.seriousConduct, decidedBy: admin._id, at: new Date() } });
  await dispute.save();
  audit({ actor: admin._id, actorRole: 'admin', action: 'dispute.decided', entity: 'Dispute', entityId: dispute._id, data: { outcome: input.outcome, refund } });
  await Promise.all([recomputePro(job.professional), recomputeCustomer(job.customer)]); // DIS-07

  const pro = await Professional.findById(job.professional).lean();
  for (const uid of [job.customer, pro?.user]) notify(uid, { title: `Dispute ${dispute.ref} decided`, body: input.rationale.slice(0, 120), link: '', tone: 'info' });
  return dispute;
}

export async function appealDispute(disputeId, user, reason) {
  const dispute = await Dispute.findById(disputeId).populate('job');
  if (!dispute) throw notFound();
  const pro = await Professional.findById(dispute.job.professional).lean();
  const party = String(dispute.job.customer) === String(user._id) || String(pro?.user) === String(user._id);
  assert(party, forbidden());
  assert(dispute.status === 'decided', conflict('Only a decided dispute can be appealed'));
  assert(Date.now() - dispute.decision.at.getTime() <= 7 * 86400000, conflict('The appeal window has closed'));
  assert(reason?.trim(), badRequest('Explain why the decision is wrong'));
  dispute.set({ status: 'appealed', appeal: { by: user._id, reason: reason.slice(0, 1000), at: new Date() } });
  await dispute.save();
  toOps('dispute:appeal', { disputeId: String(dispute._id) });
  return dispute;
}

export async function decideAppeal(disputeId, admin, { outcome, rationale }) {
  const dispute = await Dispute.findById(disputeId).populate('job');
  assert(dispute && dispute.status === 'appealed', conflict('No open appeal'));
  assert(String(dispute.decision.decidedBy) !== String(admin._id), forbidden('An appeal must be heard by a different reviewer'));
  assert(['upheld', 'overturned'].includes(outcome) && rationale?.trim(), badRequest('Choose an outcome and give the rationale'));
  if (outcome === 'overturned') {
    // Reputation consequences are reversed; money is not clawed back from a worker.
    const pro = dispute.decision.outcome === 'favour_pro';
    await Rating.updateMany({ job: dispute.job._id, direction: 'customer_to_pro' }, { $set: { excluded: !pro, excludedReason: pro ? null : `Appeal on ${dispute.ref} overturned` } });
  }
  dispute.set({ status: 'closed', appeal: { ...dispute.appeal.toObject(), outcome, rationale, decidedBy: admin._id, decidedAt: new Date() } });
  await dispute.save();
  await recomputePro(dispute.job.professional);
  audit({ actor: admin._id, actorRole: 'admin', action: 'dispute.appeal_decided', entity: 'Dispute', entityId: dispute._id, data: { outcome } });
  return dispute;
}

// ---------------------------------------------------------------------------
// My Harmonia Team
// ---------------------------------------------------------------------------
export async function addPreferred(userId, proId, category, source = 'job') {
  const res = await User.updateOne(
    { _id: userId, preferredPros: { $not: { $elemMatch: { pro: proId, category } } } },
    { $push: { preferredPros: { pro: proId, category, source, addedAt: new Date() } } },
  );
  if (res.modifiedCount) {
    await Professional.updateOne({ _id: proId }, { $inc: { 'stats.preferredBy': 1 } });
    const pro = await Professional.findById(proId).lean();
    notify(pro?.user, { title: 'A customer added you to their team', body: 'You now get first refusal on their requests.', tone: 'success' });
  }
}

// ---------------------------------------------------------------------------
// Safety (SAF-01, SAF-07)
// ---------------------------------------------------------------------------
export async function raiseIncident(jobId, user, { kind, description, lat, lng }) {
  const job = jobId ? await Job.findById(jobId) : null;
  let against = null;
  if (job) {
    const pro = await Professional.findById(job.professional).lean();
    against = String(job.customer) === String(user._id) ? pro?.user : job.customer;
  }
  const serious = ['sos', 'harassment', 'safety_complaint'].includes(kind);
  const incident = await Incident.create({
    job: job?._id, raisedBy: user._id, raisedByRole: user.role, kind, serious, description,
    location: lat && lng ? { type: 'Point', coordinates: [Number(lng), Number(lat)] } : undefined, against,
  });
  // SAF-07 — immediate suspension pending investigation, for either party.
  if (serious && kind !== 'sos' && against) {
    await User.updateOne({ _id: against }, { $set: { suspended: { active: true, reason: 'Pending safety investigation', at: new Date() } } });
    await Professional.updateOne({ user: against }, { $set: { suspended: { active: true, reason: 'Pending safety investigation', at: new Date() }, status: PRO_STATUS.OFFLINE } });
  }
  toOps('incident:new', { incidentId: String(incident._id), kind, jobRef: job?.ref });
  audit({ actor: user._id, actorRole: user.role, action: `incident.${kind}`, entity: 'Incident', entityId: incident._id });
  return incident;
}
