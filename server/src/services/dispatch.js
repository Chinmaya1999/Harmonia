import { Job, Offer, DispatchAttempt, Professional, Category, User } from '../models/index.js';
import { S, PRO_STATUS } from '../config/constants.js';
import { conflict, notFound, forbidden } from '../lib/errors.js';
import { getConfig } from './settings.js';
import { rankCandidates, ineligibilityReason } from './matching.js';
import { computeSplit } from './pricing.js';
import { transition } from './jobMachine.js';
import { toUser, notify, jobChanged, toOps } from './notifier.js';
import { audit } from './audit.js';
import { refreshLoad } from './score.js';

const secs = (n) => new Date(Date.now() + n * 1000);
const otp4 = () => String(Math.floor(1000 + Math.random() * 9000));

// §5.3 dispatch waves
//  0  preferred professional, first refusal
//  1  top N within the near radius, simultaneous
//  2  next M within the extended radius
//  3  broadcast within max radius; customer offered a priority tip
//  4  fallback — never leave the request unanswered

async function expectedSplit(job, category) {
  const price = job.priceBand
    ? { visit: job.priceBand.visit, labour: job.priceBand.min - job.priceBand.visit, parts: [], partsTotal: 0, total: job.priceBand.min }
    : { visit: 0, labour: 0, parts: [], partsTotal: 0, total: 0 };
  return computeSplit({
    archetype: job.archetype, category: job.category, city: job.city, stateCode: job.stateCode, price,
    paymentMode: job.paymentMode, priorityTip: job.priorityTip, feeHoliday: job.feeHoliday, categoryCommissionBps: category.commissionBps,
  });
}

async function makeOffers(job, category, candidates, { wave, expiresAt, radiusKm, weights, excludedCount }) {
  const split = await expectedSplit(job, category);
  const customer = await User.findById(job.customer).select('reputation').lean();
  const offered = [];
  for (const c of candidates) {
    try {
      const offer = await Offer.create({
        job: job._id, pro: c.pro._id, wave, score: c.score, features: c.features,
        distanceKm: c.distanceKm, travelMin: c.travelMin, expectedEarning: split.proReceives, expectedSplit: split, expiresAt,
      });
      offered.push(c);
      // Warranty rework: the original pro fixes their own work unpaid; a
      // replacement is paid by Harmonia's Assurance provision.
      const earning = job.route === 'warranty'
        ? (String(c.pro._id) === String(job.warranty?.originalPro) ? 0 : (job.priceBand?.visit || 0) + (job.jobType?.labour || 0))
        : split.proReceives;
      if (earning !== split.proReceives) await Offer.updateOne({ _id: offer._id }, { $set: { expectedEarning: earning } });
      await Professional.updateOne({ _id: c.pro._id }, { $inc: { 'stats.offers': 1 } });
      // DSP-02 — full offer card before acceptance. REP-02 — pros see the customer's rating.
      toUser(c.pro.user, 'offer:new', {
        offerId: String(offer._id), jobId: String(job._id), ref: job.ref, category: job.categoryName, jobType: job.jobType?.name,
        distanceKm: c.distanceKm, travelMin: c.travelMin, durationMin: job.jobType?.durationMin, expectedEarning: earning,
        priorityTip: job.priorityTip, expiresAt, block: job.address?.block, community: job.address?.communityName,
        customerRating: customer?.reputation?.ratingAvg ?? null, route: job.route, scheduledAt: job.scheduledAt,
      });
    } catch (err) {
      if (err.code !== 11000) throw err; // already offered this job — skip
    }
  }
  await DispatchAttempt.create({
    job: job._id, wave, radiusKm, weights, excludedCount,
    candidates: candidates.map((c) => ({ pro: c.pro._id, name: c.pro.displayName, score: c.score, features: c.features, offered: offered.includes(c) })),
    outcome: offered.length ? 'offered' : 'no_candidates',
  });
  if (offered.length) {
    await Job.updateOne({ _id: job._id }, { $addToSet: { 'dispatch.offered': { $each: offered.map((c) => c.pro._id) } } });
  }
  return offered.length;
}

async function runWave(job, wave) {
  const category = await Category.findOne({ code: job.category }).lean();
  const cfg = await getConfig('dispatch', { city: job.city, category: job.category });
  const customer = await User.findById(job.customer).lean();
  const exclude = [...(job.dispatch.offered || []), ...(job.dispatch.excluded || [])];
  const base = { customerGender: customer?.gender };

  if (wave === 0) {
    const pref = customer?.preferredPros?.find((p) => p.category === job.category && !exclude.map(String).includes(String(p.pro)));
    if (!pref) return 0;
    const { ranked, weights } = await rankCandidates(job, category, { ...base, radiusKm: cfg.maxKm, onlyPro: pref.pro });
    return makeOffers(job, category, ranked.slice(0, 1), { wave, expiresAt: secs(cfg.wave0Sec), radiusKm: cfg.maxKm, weights, excludedCount: ranked.length ? 0 : 1 });
  }
  const plan = {
    1: { radiusKm: cfg.nearKm, take: cfg.wave1Count, dur: cfg.wave1Sec },
    2: { radiusKm: cfg.extKm, take: cfg.wave2Count, dur: cfg.wave2Sec },
    3: { radiusKm: cfg.maxKm, take: 100, dur: cfg.wave3Sec },
  }[wave];
  const { ranked, excluded, weights } = await rankCandidates(job, category, { ...base, radiusKm: plan.radiusKm, exclude });
  return makeOffers(job, category, ranked.slice(0, plan.take), { wave, expiresAt: secs(plan.dur), radiusKm: plan.radiusKm, weights, excludedCount: excluded });
}

function waveDuration(cfg, wave) {
  return [cfg.wave0Sec, cfg.wave1Sec, cfg.wave2Sec, cfg.wave3Sec][wave] ?? 0;
}

/**
 * Advance a job to its next wave. The conditional update on `dispatch.wave`
 * makes this safe to call from the ticker and from a decline at the same time:
 * only one caller wins each step.
 */
export async function advance(jobId) {
  for (let guard = 0; guard < 6; guard += 1) {
    const current = await Job.findById(jobId);
    if (!current || current.state !== S.DISPATCHING || current.dispatch.exhausted) return current;
    if (current.dispatch.mode !== 'waves') return current;
    const next = current.dispatch.wave + 1;
    const cfg = await getConfig('dispatch', { city: current.city, category: current.category });

    if (next >= 4) {
      // Wave 4 — fallback. Keep late offers alive so anyone can still accept,
      // and hand the customer explicit choices (DSP-04).
      const job = await Job.findOneAndUpdate(
        { _id: jobId, state: S.DISPATCHING, 'dispatch.wave': current.dispatch.wave },
        { $set: { 'dispatch.wave': 4, 'dispatch.exhausted': true, 'dispatch.waveEndsAt': null, 'dispatch.tipSuggested': true } },
        { new: true },
      );
      if (!job) continue;
      await Offer.updateMany({ job: jobId, status: 'pending' }, { $set: { expiresAt: secs(600) } });
      notify(job.customer, { title: 'Still looking', body: 'Nobody has accepted yet. You can wait, add a priority tip, or schedule a slot.', link: `/app/jobs/${job._id}`, tone: 'warning' });
      jobChanged(job);
      toOps('dispatch:exhausted', { jobId: String(job._id), ref: job.ref });
      return job;
    }

    const claimed = await Job.findOneAndUpdate(
      { _id: jobId, state: S.DISPATCHING, 'dispatch.wave': current.dispatch.wave },
      { $set: { 'dispatch.wave': next, 'dispatch.waveEndsAt': secs(waveDuration(cfg, next)), ...(next === 3 ? { 'dispatch.tipSuggested': true } : {}) }, $inc: { 'dispatch.attempts': 1 } },
      { new: true },
    );
    if (!claimed) continue; // another caller advanced it
    const offered = await runWave(claimed, next);
    jobChanged(claimed, { wave: next });
    if (offered > 0) return claimed;
    // Nobody to offer in this wave — move straight on rather than wait.
  }
  return Job.findById(jobId);
}

async function startNamed(job, { minutes }) {
  const category = await Category.findOne({ code: job.category }).lean();
  const pro = await Professional.findById(job.requestedPro).lean();
  const reason = !pro ? 'not_found' : ineligibilityReason(pro, category);
  const customer = await User.findById(job.customer).lean();

  const immediate = !job.scheduledAt || job.scheduledAt - Date.now() < 60 * 60 * 1000;
  let unavailable = reason;
  if (!unavailable && immediate && pro.status === PRO_STATUS.OFFLINE) unavailable = 'offline';
  if (!unavailable && immediate && pro.status === PRO_STATUS.BUSY) unavailable = 'busy';

  if (unavailable) {
    // PRF-04 — tell the customer who and why, and offer both options.
    const updated = await Job.findByIdAndUpdate(job._id, { $set: { 'dispatch.exhausted': true, 'dispatch.namedOutcome': { status: 'unavailable', reason: unavailable } } }, { new: true });
    jobChanged(updated);
    return updated;
  }
  const { ranked, weights } = await rankCandidates(job, category, {
    radiusKm: 25, onlyPro: pro._id, mode: immediate ? 'now' : 'scheduled', customerGender: customer?.gender,
  });
  // A named booking is the customer's explicit choice — if ranking filtered the
  // pro out (e.g. radius), still offer it and let the pro decide.
  const candidate = ranked[0] || { pro, score: null, features: { note: 'named_booking' }, distanceKm: null, travelMin: null };
  await makeOffers(job, category, [candidate], { wave: 0, expiresAt: secs(minutes * 60), radiusKm: null, weights, excludedCount: 0 });
  return Job.findByIdAndUpdate(job._id, { $set: { 'dispatch.waveEndsAt': secs(minutes * 60) } }, { new: true });
}

async function startScheduledBroadcast(job) {
  const category = await Category.findOne({ code: job.category }).lean();
  const cfg = await getConfig('dispatch', { city: job.city, category: job.category });
  const customer = await User.findById(job.customer).lean();
  const expiresAt = new Date(Math.max(Date.now() + 10 * 60 * 1000, job.scheduledAt.getTime() - 30 * 60 * 1000));
  const { ranked, excluded, weights } = await rankCandidates(job, category, {
    radiusKm: cfg.maxKm, mode: 'scheduled', exclude: job.dispatch.excluded || [], customerGender: customer?.gender,
  });
  const offered = await makeOffers(job, category, ranked.slice(0, 10), { wave: 1, expiresAt, radiusKm: cfg.maxKm, weights, excludedCount: excluded });
  const updated = await Job.findByIdAndUpdate(
    job._id,
    { $set: { 'dispatch.waveEndsAt': expiresAt, ...(offered ? {} : { 'dispatch.exhausted': true, 'dispatch.namedOutcome': { status: 'no_candidates', reason: 'no_one_scheduled' } }) } },
    { new: true },
  );
  jobChanged(updated);
  return updated;
}

export async function startDispatch(jobId, { actor, from = S.CREATED, note } = {}) {
  const job = await transition(jobId, from, S.DISPATCHING, {
    actor, actorRole: actor ? 'customer' : 'system', note,
    set: { 'dispatch.startedAt': new Date(), 'dispatch.exhausted': false, 'dispatch.wave': -1, 'dispatch.waveEndsAt': new Date() },
  });
  const cfg = await getConfig('dispatch', { city: job.city, category: job.category });
  if (job.dispatch.mode === 'named') return startNamed(job, { minutes: job.route === 'warranty' ? cfg.warrantyOfferMin : cfg.namedOfferMin });
  if (job.dispatch.mode === 'broadcast_scheduled') return startScheduledBroadcast(job);
  return advance(job._id);
}

// Customer choices after exhaustion / named decline.
export async function restartDispatch(jobId, { actor, mode = 'waves', excludeRequested = true, scheduledAt } = {}) {
  const job = await Job.findById(jobId);
  if (!job) throw notFound('Job not found');
  if (job.state !== S.DISPATCHING) throw conflict('This job is no longer searching for a professional');
  await Offer.updateMany({ job: jobId, status: 'pending' }, { $set: { status: 'withdrawn' } });
  const excluded = [...(job.dispatch.excluded || [])];
  if (excludeRequested && job.requestedPro) excluded.push(job.requestedPro);
  const set = {
    'dispatch.mode': mode, 'dispatch.wave': -1, 'dispatch.exhausted': false, 'dispatch.offered': [],
    'dispatch.excluded': excluded, 'dispatch.waveEndsAt': new Date(), 'dispatch.namedOutcome': null,
  };
  if (scheduledAt) set.scheduledAt = scheduledAt;
  if (mode === 'waves' && job.route === 'named') set.route = 'instant';
  const updated = await Job.findByIdAndUpdate(jobId, { $set: set, $push: { timeline: { state: 'EVENT', at: new Date(), by: actor, actor: 'customer', note: mode === 'broadcast_scheduled' ? 'Rescheduled and re-broadcast' : 'Searching again' } } }, { new: true });
  if (mode === 'broadcast_scheduled') return startScheduledBroadcast(updated);
  if (mode === 'named') return startNamed(updated, { minutes: (await getConfig('dispatch')).namedOfferMin });
  return advance(jobId);
}

// TIP-04 — customer adds a priority tip mid-dispatch; raises TipBoost and re-broadcasts.
export async function addPriorityTip(jobId, amount, actor) {
  const job = await Job.findOneAndUpdate({ _id: jobId, state: S.DISPATCHING }, { $set: { priorityTip: amount } }, { new: true });
  if (!job) throw conflict('Priority tips can only be added while searching');
  audit({ actor, actorRole: 'customer', action: 'job.priority_tip', entity: 'Job', entityId: job._id, data: { amount } });
  return restartDispatch(jobId, { actor, mode: 'waves', excludeRequested: false });
}

export async function acceptOffer(offerId, proUserId) {
  const pro = await Professional.findOne({ user: proUserId });
  if (!pro) throw forbidden();
  const offer = await Offer.findById(offerId);
  if (!offer || String(offer.pro) !== String(pro._id)) throw notFound('Offer not found');

  // DSP-03 — idempotent: accepting twice returns the same assignment.
  if (offer.status === 'accepted') return Job.findById(offer.job);
  if (offer.status !== 'pending' || offer.expiresAt < new Date()) throw conflict('This offer has expired or been taken', 'OFFER_GONE');

  const existing = await Job.findById(offer.job);
  if (!existing) throw notFound('Job not found');
  const immediate = !existing.scheduledAt || existing.scheduledAt - Date.now() < 60 * 60 * 1000;
  const cfg = await getConfig('dispatch');
  if (immediate && (pro.stats?.activeJobs || 0) >= cfg.maxActiveInstantJobs) throw conflict('Finish your current job before accepting another');

  const travelMin = offer.travelMin ?? 20;
  const windows = await getConfig('windows');
  const now = new Date();
  const eta = immediate ? new Date(now.getTime() + (travelMin + windows.etaBufferMin) * 60000) : existing.scheduledAt;

  let job;
  try {
    job = await transition(offer.job, S.DISPATCHING, S.ASSIGNED, {
      actor: proUserId,
      actorRole: 'professional',
      note: `Accepted by ${pro.displayName} (${pro.harmoniaId})`,
      set: {
        professional: pro._id, assignedAt: now, eta, arrivalOtp: otp4(),
        'dispatch.assignmentSec': Math.round((now - (existing.dispatch.startedAt || existing.createdAt)) / 1000),
      },
    });
  } catch (err) {
    // Lost the race — someone else accepted first.
    await Offer.updateOne({ _id: offerId, status: 'pending' }, { $set: { status: 'lost', respondedAt: now } });
    throw conflict('Another professional accepted this job first', 'OFFER_LOST');
  }

  await Offer.updateOne({ _id: offerId }, { $set: { status: 'accepted', respondedAt: now } });
  const others = await Offer.find({ job: job._id, status: 'pending', _id: { $ne: offerId } }).populate('pro', 'user').lean();
  await Offer.updateMany({ job: job._id, status: 'pending', _id: { $ne: offerId } }, { $set: { status: 'withdrawn' } });
  for (const o of others) toUser(o.pro.user, 'offer:withdrawn', { offerId: String(o._id), jobId: String(job._id) });

  const set = { 'stats.accepted': (pro.stats.accepted || 0) + 1 };
  if (immediate && pro.status !== PRO_STATUS.BUSY) Object.assign(set, { status: PRO_STATUS.BUSY, statusBeforeBusy: pro.status }); // AVL-03
  await Professional.updateOne({ _id: pro._id }, { $set: set });
  await refreshLoad(pro._id);
  await DispatchAttempt.findOneAndUpdate({ job: job._id }, { $set: { outcome: 'accepted' } }, { sort: { createdAt: -1 } });

  notify(job.customer, { title: `${pro.displayName} is on the way`, body: `Arrival around ${eta.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`, link: `/app/jobs/${job._id}`, tone: 'success' });
  return job;
}

export async function declineOffer(offerId, proUserId, reason) {
  const pro = await Professional.findOne({ user: proUserId });
  const offer = await Offer.findOneAndUpdate(
    { _id: offerId, pro: pro?._id, status: 'pending' },
    { $set: { status: 'declined', respondedAt: new Date(), declineReason: reason } },
    { new: true },
  );
  if (!offer) return null;
  await Professional.updateOne({ _id: pro._id }, { $inc: { 'stats.declined': 1 } }); // never touches the Score (AVL-05)
  await afterOfferClosed(offer);
  return offer;
}

// When every offer in the current step is closed, move on immediately.
async function afterOfferClosed(offer) {
  const job = await Job.findById(offer.job);
  if (!job || job.state !== S.DISPATCHING) return;
  const pending = await Offer.countDocuments({ job: job._id, status: 'pending' });
  if (pending > 0) return;
  if (job.dispatch.mode === 'waves' && !job.dispatch.exhausted) return advance(job._id);
  if (job.dispatch.mode === 'named') {
    if (job.route === 'warranty') {
      // ASR-03 — original professional could not attend: replacement at no cost.
      return restartDispatch(job._id, { mode: 'waves', excludeRequested: true });
    }
    const updated = await Job.findByIdAndUpdate(job._id, { $set: { 'dispatch.exhausted': true, 'dispatch.namedOutcome': { status: offer.status === 'declined' ? 'declined' : 'no_response', reason: offer.declineReason || null } } }, { new: true });
    notify(job.customer, { title: 'Your professional is not available', body: 'Choose to wait, pick someone else, or let us find the best match.', link: `/app/jobs/${job._id}`, tone: 'warning' });
    jobChanged(updated);
  }
  if (job.dispatch.mode === 'broadcast_scheduled') {
    const updated = await Job.findByIdAndUpdate(job._id, { $set: { 'dispatch.exhausted': true, 'dispatch.namedOutcome': { status: 'no_response', reason: null } } }, { new: true });
    jobChanged(updated);
  }
}

// Ticker body — called every couple of seconds by the sweeper.
export async function tick() {
  const now = new Date();
  const expired = await Offer.find({ status: 'pending', expiresAt: { $lte: now } }).populate('pro', 'user').limit(200);
  for (const o of expired) {
    const r = await Offer.updateOne({ _id: o._id, status: 'pending' }, { $set: { status: 'expired' } });
    if (r.modifiedCount) {
      toUser(o.pro?.user, 'offer:withdrawn', { offerId: String(o._id), jobId: String(o.job) });
      await afterOfferClosed(o);
    }
  }
  const due = await Job.find({ state: S.DISPATCHING, 'dispatch.mode': 'waves', 'dispatch.exhausted': { $ne: true }, 'dispatch.waveEndsAt': { $lte: now } }).select('_id').limit(100);
  for (const j of due) await advance(j._id);
}

