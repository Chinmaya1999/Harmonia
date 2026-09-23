import { Professional } from '../models/index.js';
import { ineligibilityReason } from './matching.js';
import { getConfig } from './settings.js';

/**
 * §3.2 — "no category goes live in a locality until it has enough active
 * professionals to meet the target fill rate at peak. A category visible but
 * unfillable is worse than absent."
 */
export async function categoryLiveness(category, coordinates) {
  const cfg = await getConfig('dispatch', { category: category.code });
  const pros = await Professional.find({
    'skills.category': category.code,
    'suspended.active': { $ne: true },
    location: { $nearSphere: { $geometry: { type: 'Point', coordinates }, $maxDistance: cfg.maxKm * 1000 } },
  })
    .select('skills tier checks suspended status')
    .lean();
  const eligible = pros.filter((p) => !ineligibilityReason(p, category)).length;
  const onlineNow = pros.filter((p) => !ineligibilityReason(p, category) && ['available', 'window'].includes(p.status)).length;
  return { live: eligible >= (category.minActivePros ?? 3), eligible, onlineNow, needed: category.minActivePros ?? 3 };
}
