import { Job } from '../models/index.js';
import { TRANSITIONS } from '../config/constants.js';
import { conflict } from '../lib/errors.js';
import { audit } from './audit.js';
import { jobChanged } from './notifier.js';

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Race-safe state transition. The update only matches if the job is still in
 * one of the expected `from` states, so concurrent actors (two pros accepting,
 * a customer cancelling while a pro arrives) cannot both succeed.
 */
export async function transition(jobId, from, to, { actor, actorRole = 'system', note, set = {}, inc, push, unset } = {}) {
  const froms = (Array.isArray(from) ? from : [from]).filter((f) => canTransition(f, to));
  if (!froms.length) throw conflict(`A job cannot move to ${to} from ${[].concat(from).join('/')}`, 'INVALID_TRANSITION');

  const update = {
    $set: { state: to, ...set },
    $push: { timeline: { state: to, at: new Date(), by: actor, actor: actorRole, note }, ...(push || {}) },
  };
  if (inc) update.$inc = inc;
  if (unset) update.$unset = unset;

  const job = await Job.findOneAndUpdate({ _id: jobId, state: { $in: froms } }, update, { new: true });
  if (!job) throw conflict('This job has changed since you last saw it. Refresh and try again.', 'STALE_STATE');

  audit({ actor, actorRole, action: `job.${to.toLowerCase()}`, entity: 'Job', entityId: job._id, data: { from: froms, note } });
  jobChanged(job);
  return job;
}

// Record a non-state event in the timeline (quote submitted, photo added…).
export async function logEvent(jobId, { actor, actorRole = 'system', note, state }) {
  const job = await Job.findByIdAndUpdate(
    jobId,
    { $push: { timeline: { state: state || 'EVENT', at: new Date(), by: actor, actor: actorRole, note } } },
    { new: true },
  );
  if (job) jobChanged(job);
  return job;
}
