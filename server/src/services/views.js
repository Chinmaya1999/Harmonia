import { approxKm, haversineKm } from '../lib/geo.js';
import { TIERS } from '../config/constants.js';

// Serializers decide what each party may see. Raw phone numbers are never
// exposed (SAF-03), precise pro location only while en route (NBY-04).

export function proCard(pro, { from } = {}) {
  const coords = pro.location?.coordinates?.length ? pro.location.coordinates : pro.baseLocation?.coordinates;
  return {
    _id: pro._id,
    harmoniaId: pro.harmoniaId,
    displayName: pro.displayName,
    photoUrl: pro.photoUrl,
    bio: pro.bio,
    gender: pro.gender,
    languages: pro.languages,
    tier: pro.tier,
    tierName: TIERS[pro.tier]?.name,
    status: pro.status,
    score: pro.score?.value ?? null,
    scoreBand: pro.score?.band,
    jobsCompleted: pro.stats?.jobsCompleted || 0,
    ratingAvg: pro.stats?.ratingAvg ?? null,
    ratingCount: pro.stats?.ratingCount || 0,
    preferredBy: pro.stats?.preferredBy || 0,
    skills: (pro.skills || []).filter((s) => s.status === 'verified').map((s) => ({ category: s.category, level: s.level, yearsExperience: s.yearsExperience, provenance: s.provenance })),
    distanceKm: from && coords ? approxKm(haversineKm(coords, from)) : undefined,
  };
}

export function jobForCustomer(job, { pro, otp } = {}) {
  const o = typeof job.toObject === 'function' ? job.toObject() : { ...job };
  delete o.arrivalOtp;
  if (otp) o.arrivalOtp = otp; // shown to the customer only (JOB-01)
  if (pro) {
    o.pro = {
      ...proCard(pro),
      // NBY-04 — precise live location only en route to this customer's job.
      liveLocation: o.state === 'EN_ROUTE' ? pro.location?.coordinates : undefined,
    };
  }
  return o;
}

export function jobForPro(job, { customer } = {}) {
  const o = typeof job.toObject === 'function' ? job.toObject() : { ...job };
  delete o.arrivalOtp;
  delete o.shareToken;
  o.customerInfo = customer
    ? { name: customer.name?.split(' ')[0], rating: customer.reputation?.ratingAvg ?? null, ratingCount: customer.reputation?.ratingCount || 0, gender: undefined }
    : undefined;
  return o;
}

export function offerView(offer, job) {
  return {
    _id: offer._id,
    wave: offer.wave,
    expiresAt: offer.expiresAt,
    status: offer.status,
    distanceKm: offer.distanceKm,
    travelMin: offer.travelMin,
    expectedEarning: offer.expectedEarning,
    split: offer.expectedSplit,
    job: job && {
      _id: job._id, ref: job.ref, category: job.category, categoryName: job.categoryName, jobType: job.jobType, route: job.route,
      description: job.description, scheduledAt: job.scheduledAt, priorityTip: job.priorityTip, paymentMode: job.paymentMode,
      // Before acceptance a pro sees the block and community, not the flat.
      area: { block: job.address?.block, community: job.address?.communityName }, archetype: job.archetype,
    },
  };
}
