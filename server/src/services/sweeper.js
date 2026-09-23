import { Job, Professional, Offer } from '../models/index.js';
import { S } from '../config/constants.js';
import { tick as dispatchTick } from './dispatch.js';
import { confirmWork, closeRatingWindow } from './jobs.js';
import { transition } from './jobMachine.js';
import { recomputePro } from './score.js';
import { audit } from './audit.js';
import { jobChanged } from './notifier.js';

// Time-driven rules live here rather than in per-job timers, so a server
// restart loses nothing: every rule is re-derived from what is in the database.

let fastBusy = false;
let slowBusy = false;

async function fast() {
  if (fastBusy) return;
  fastBusy = true;
  try {
    await dispatchTick();
  } catch (err) {
    console.error('[sweeper:fast]', err);
  } finally {
    fastBusy = false;
  }
}

async function slow() {
  if (slowBusy) return;
  slowBusy = true;
  const now = new Date();
  try {
    // PAY-02 — auto-confirm after the window.
    const due = await Job.find({ state: S.WORK_COMPLETE, confirmDueAt: { $lte: now } }).select('_id').limit(50);
    for (const j of due) await confirmWork(j._id, { actorRole: 'system', auto: true }).catch((e) => console.error('[auto-confirm]', e.message));

    // REP-03 — ratings become visible when the window closes.
    const closing = await Job.find({ state: S.PAID, 'ratings.revealed': false, 'ratings.windowClosesAt': { $lte: now } }).limit(50);
    for (const j of closing) await closeRatingWindow(j).catch((e) => console.error('[rating-window]', e.message));

    // Scheduled broadcasts that nobody picked up.
    const stale = await Job.find({ state: S.DISPATCHING, 'dispatch.mode': 'broadcast_scheduled', 'dispatch.exhausted': { $ne: true }, 'dispatch.waveEndsAt': { $lte: now } });
    for (const j of stale) {
      const pending = await Offer.countDocuments({ job: j._id, status: 'pending' });
      if (!pending) jobChanged(await Job.findByIdAndUpdate(j._id, { $set: { 'dispatch.exhausted': true, 'dispatch.namedOutcome': { status: 'no_response' } } }, { new: true }));
    }

    // Requests nobody could serve for 12 hours expire (the customer was given
    // options long before this).
    const old = await Job.find({ state: S.DISPATCHING, createdAt: { $lte: new Date(now - 12 * 3600000) }, $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }] }).select('_id');
    for (const j of old) await transition(j._id, S.DISPATCHING, S.EXPIRED, { actorRole: 'system', note: 'No professional accepted' }).catch(() => {});

    // VER-04 / VER-07 — lapsed verification removes from dispatch.
    const lapsed = await Professional.find({ 'checks.police.status': 'verified', 'checks.police.expiresAt': { $lte: now } }).select('_id');
    for (const p of lapsed) {
      await Professional.updateOne({ _id: p._id }, { $set: { 'checks.police.status': 'expired' } });
      audit({ actorRole: 'system', action: 'verification.expired', entity: 'Professional', entityId: p._id, data: { check: 'police' } });
      await recomputePro(p._id);
    }
  } catch (err) {
    console.error('[sweeper:slow]', err);
  } finally {
    slowBusy = false;
  }
}

export function startSweeper() {
  const a = setInterval(fast, 2000);
  const b = setInterval(slow, 30000);
  setTimeout(slow, 3000);
  return () => {
    clearInterval(a);
    clearInterval(b);
  };
}
