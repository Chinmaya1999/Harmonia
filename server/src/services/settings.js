import { Config } from '../models/index.js';

// Defaults mirror the indicative values in the PRD. Every one can be overridden
// at runtime from the ops console, per city and/or category (MTC-02).
export const DEFAULTS = {
  'matching.weights': {
    proximity: 0.3, skill: 0.2, reliability: 0.2, quality: 0.15, availability: 0.1, load: 0.1, fatigue: 0.05,
    tipBoostMax: 0.05, // MTC-06: bounded so a tip never beats a materially better match
    tipBoostFullAtPaise: 30000,
    newProAllowance: 0.08, // MTC-03
    newProJobs: 10,
  },
  dispatch: {
    wave0Sec: 20, wave1Sec: 40, wave2Sec: 60, wave3Sec: 60,
    nearKm: 3, extKm: 6, maxKm: 10,
    wave1Count: 3, wave2Count: 5,
    namedOfferMin: 15,
    warrantyOfferMin: 60,
    maxActiveInstantJobs: 1,
  },
  windows: {
    autoConfirmHours: 24, // PAY-02
    ratingWindowHours: 72, // REP-03
    disputeWindowDays: 7, // DIS-01
    tipWindowDays: 7,
    noShowGraceMin: 20,
    etaBufferMin: 10,
  },
  payments: {
    commissionBps: { A: 1500, B: 1500, C: 800, D: 0, E: 2000 },
    gatewayBps: 200,
    tdsBps: 10, // 194-O — confirm with CA before launch (§8.5)
    gstBps: 0, // section 9(5) treatment pending CA opinion; prices shown tax-inclusive
    // §8.1 — state-configurable welfare-fee module, never hardcoded.
    welfare: { KA: { bps: 100, capPaise: 500 } },
    tipCapPaise: 100000, // TIP-05: lower of ₹1,000
    tipCapPct: 50, // or 50% of job value
    feeHolidayDays: 90, // MIG-03 — capped and time-bounded
    feeHolidayMaxJobs: 10,
    reworkPayoutPct: 100, // replacement pro paid from the Assurance provision
  },
  score: {
    weights: { quality: 30, reliability: 25, conduct: 15, rework: 15, disputes: 10, tenure: 5 },
    halfLifeDays: 90, // REP-09
    priorJobs: 5,
    reviewBelow: 45,
    reviewMinJobs: 10,
  },
  elite: { minJobs: 40, minRating: 4.7, maxReworkPer100: 3, minTier: 3 },
  // §12.12 — the pilot is judged on these numbers and nothing else.
  pilotGates: {
    repeat90: { go: 35, stop: 20 },
    fillRate: { go: 85, stop: 65 },
    reworkPer100: { go: 6, stop: 12 },
    proRetention90: { go: 70, stop: 50 },
    migratingPros: { go: 40, stop: 15 },
    contracts: { go: 2, stop: 0 },
  },
};

const cache = new Map();
const TTL = 5000;

function scopesFor({ city, category } = {}) {
  const s = [];
  if (city && category) s.push(`city:${city}:category:${category}`);
  if (category) s.push(`category:${category}`);
  if (city) s.push(`city:${city}`);
  s.push('global');
  return s;
}

export async function getConfig(key, ctx) {
  const ck = `${key}|${ctx?.city || ''}|${ctx?.category || ''}`;
  const hit = cache.get(ck);
  if (hit && hit.at > Date.now() - TTL) return hit.value;

  const scopes = scopesFor(ctx);
  const docs = await Config.find({ key, scope: { $in: scopes } }).lean();
  // Merge from least to most specific, over the defaults.
  let value = structuredClone(DEFAULTS[key] ?? {});
  for (const scope of [...scopes].reverse()) {
    const d = docs.find((x) => x.scope === scope);
    if (d) value = deepMerge(value, d.value);
  }
  cache.set(ck, { at: Date.now(), value });
  return value;
}

export async function setConfig(key, scope, value, userId) {
  const doc = await Config.findOneAndUpdate(
    { key, scope },
    { value, updatedBy: userId },
    { upsert: true, new: true, runValidators: true },
  );
  cache.clear();
  return doc;
}

function deepMerge(a, b) {
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) ? deepMerge(a[k] ?? {}, v) : v;
  }
  return out;
}
