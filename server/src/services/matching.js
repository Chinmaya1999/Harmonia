import { Professional } from '../models/index.js';
import { ARCHETYPES, PRO_STATUS } from '../config/constants.js';
import { haversineKm, estimateTravelMin } from '../lib/geo.js';
import { localParts, inRange } from '../lib/time.js';
import { getConfig } from './settings.js';

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export function requiredTier(category) {
  return Math.max(category.minTier ?? 0, ARCHETYPES[category.archetype]?.minTier ?? 0, category.vulnerableAccess ? 2 : 0);
}

// Returns null when eligible, or the reason a professional cannot take work in
// this category. Reasons are shown to the pro so exclusion is never silent.
export function ineligibilityReason(pro, category, { now = new Date() } = {}) {
  if (pro.suspended?.active) return 'account_suspended';
  const skill = pro.skills?.find((s) => s.category === category.code);
  if (!skill) return 'category_not_added';
  if (skill.status === 'suspended') return 'category_suspended_pending_reassessment';
  if (skill.status !== 'verified') return 'skill_not_verified';
  if ((pro.tier ?? 0) < requiredTier(category)) return 'verification_tier_too_low';
  // VER-07 — lapsed background verification removes from dispatch.
  const police = pro.checks?.police;
  if (requiredTier(category) >= 2 && police?.expiresAt && police.expiresAt < now) return 'background_verification_lapsed';
  return null;
}

function withinRestrictions(pro, when, { customerGender }) {
  const { hhmm } = localParts(when);
  if (!inRange(hhmm, pro.restrictions?.earliest, pro.restrictions?.latest)) return false;
  if (pro.restrictions?.womenCustomersOnly && customerGender !== 'female') return false;
  return true;
}

export function scheduleCovers(pro, when) {
  const { hhmm, day, date } = localParts(when);
  const override = pro.scheduleOverrides?.find((o) => o.date === date);
  if (override) return !override.off && inRange(hhmm, override.from, override.to);
  return (pro.weeklySchedule || []).some((s) => s.day === day && inRange(hhmm, s.from, s.to));
}

export function computeFeatures(pro, job, { weights, maxKm, priorityTip = 0, now = new Date() }) {
  const coords = pro.location?.coordinates?.length ? pro.location.coordinates : pro.baseLocation?.coordinates;
  const distanceKm = haversineKm(coords, job.location.coordinates);
  const travelMin = estimateTravelMin(distanceKm);
  const maxTravel = estimateTravelMin(maxKm);
  const st = pro.stats || {};
  const skill = pro.skills.find((s) => s.category === job.category);

  const proximity = clamp(1 - travelMin / maxTravel);
  const skillMatch = clamp(((skill?.level || 1) / 5) * (skill?.provenance === 'self_declared' ? 0.85 : 1));

  // AVL-05: declining never counts against a professional. Reliability is built
  // only from what happens after acceptance.
  const accepted = Math.max(st.accepted || 0, 1);
  const cancelRate = (st.cancelledAfterAccept || 0) / accepted;
  const noShowRate = (st.noShows || 0) / accepted;
  const onTime = st.arrivals ? (st.onTimeArrivals || 0) / st.arrivals : 0.9;
  const reliability = clamp(clamp(1 - cancelRate - 2 * noShowRate) * 0.6 + onTime * 0.4);

  const rating = st.ratingAvg ? (st.ratingAvg - 1) / 4 : 0.75;
  const reworkPer100 = st.jobsCompleted ? ((st.reworkClaims || 0) / st.jobsCompleted) * 100 : 0;
  const quality = clamp(0.7 * rating + 0.3 * (1 - Math.min(reworkPer100 / 20, 1)));

  const availability = pro.status === PRO_STATUS.AVAILABLE ? 1 : 0.6;
  const load = clamp((st.activeJobs || 0) / 2);
  const fatigue = clamp((st.hoursToday || 0) / 10); // MTC-04

  const tipBoost = round(clamp(priorityTip / weights.tipBoostFullAtPaise) * weights.tipBoostMax); // MTC-06
  const jobs = st.jobsCompleted || 0;
  const newPro = jobs < weights.newProJobs ? round(weights.newProAllowance * (1 - jobs / weights.newProJobs)) : 0; // MTC-03
  const elite = pro.tier >= 5 ? 0.03 : 0;

  const score =
    weights.proximity * proximity +
    weights.skill * skillMatch +
    weights.reliability * reliability +
    weights.quality * quality +
    weights.availability * availability -
    weights.load * load -
    weights.fatigue * fatigue +
    tipBoost + newPro + elite;

  return {
    distanceKm: round(distanceKm, 2),
    travelMin,
    score: round(score, 4),
    features: {
      proximity: round(proximity), skillMatch: round(skillMatch), reliability: round(reliability), quality: round(quality),
      availability: round(availability), load: round(load), fatigue: round(fatigue), tipBoost, newPro, elite,
      travelMin,
    },
  };
}

/**
 * Rank eligible professionals for a job.
 * mode 'now'       — must be Available now (or inside a stated window)
 * mode 'scheduled' — availability judged from the weekly schedule at the slot
 */
export async function rankCandidates(job, category, { radiusKm, exclude = [], mode = 'now', customerGender, onlyPro } = {}) {
  const ctx = { city: job.city, category: job.category };
  const weights = await getConfig('matching.weights', ctx);
  const dispatch = await getConfig('dispatch', ctx);
  const now = new Date();
  const when = mode === 'scheduled' && job.scheduledAt ? job.scheduledAt : now;
  const excludeSet = new Set(exclude.map(String));

  const q = {
    'skills.category': job.category,
    'suspended.active': { $ne: true },
    location: { $nearSphere: { $geometry: job.location, $maxDistance: radiusKm * 1000 } },
  };
  if (mode === 'now') q.status = { $in: [PRO_STATUS.AVAILABLE, PRO_STATUS.WINDOW] };
  if (onlyPro) q._id = onlyPro;

  const pros = await Professional.find(q).limit(300).lean();
  const out = [];
  let excluded = 0;
  for (const pro of pros) {
    if (excludeSet.has(String(pro._id))) continue;
    const reason =
      ineligibilityReason(pro, category, { now }) ||
      (job.requireWoman && pro.gender !== 'female' ? 'gender_preference' : null) ||
      (!withinRestrictions(pro, when, { customerGender }) ? 'outside_pro_restrictions' : null) ||
      (mode === 'now' && pro.status === PRO_STATUS.WINDOW && !(pro.window?.from <= now && pro.window?.to >= now) ? 'outside_window' : null) ||
      (mode === 'scheduled' && !scheduleCovers(pro, when) ? 'not_scheduled' : null) ||
      (mode === 'now' && (pro.stats?.activeJobs || 0) >= dispatch.maxActiveInstantJobs ? 'at_capacity' : null);
    if (reason) {
      excluded += 1;
      continue;
    }
    const f = computeFeatures(pro, job, { weights, maxKm: dispatch.maxKm, priorityTip: job.priorityTip, now });
    const proRadius = pro.categoryRadius?.find((c) => c.category === job.category)?.radiusKm ?? pro.radiusKm ?? 6;
    if (f.distanceKm > proRadius) {
      excluded += 1; // AVL-04 — outside the pro's own working radius
      continue;
    }
    out.push({ pro, ...f });
  }
  out.sort((a, b) => b.score - a.score);
  return { ranked: out, excluded, weights };
}
