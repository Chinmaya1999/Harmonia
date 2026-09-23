import { bps, sum } from '../lib/money.js';
import { badRequest } from '../lib/errors.js';
import { getConfig } from './settings.js';

export function rateCardFor(category, city = 'Bengaluru') {
  return category.rateCards.find((r) => r.city === city) || category.rateCards[0];
}

export function jobTypeFor(category, code, city) {
  const card = rateCardFor(category, city);
  if (!card) throw badRequest(`No rate card for ${category.name} in ${city}`);
  const jt = card.jobTypes.find((j) => j.code === code) || card.jobTypes[0];
  if (!jt) throw badRequest('Unknown job type');
  return { card, jt };
}

// PRC-02 — indicative band before requesting. Lower bound is visit + labour,
// upper bound includes the standard parts for that job type.
export function priceBand(category, jobTypeCode, city) {
  const { card, jt } = jobTypeFor(category, jobTypeCode, city);
  return {
    visit: card.visitCharge,
    min: card.visitCharge + jt.labour,
    max: card.visitCharge + jt.labour + (jt.standardParts || 0),
  };
}

export function normalisePrice({ visit = 0, labour = 0, parts = [] }) {
  const cleanParts = (parts || [])
    .filter((p) => p && p.name && Number.isInteger(p.unitPrice) && p.unitPrice >= 0)
    .map((p) => ({ name: String(p.name).slice(0, 80), qty: Math.max(1, Math.floor(p.qty || 1)), unitPrice: p.unitPrice, photo: p.photo }));
  if (!Number.isInteger(visit) || !Number.isInteger(labour) || visit < 0 || labour < 0) {
    throw badRequest('Prices must be whole paise amounts');
  }
  const partsTotal = sum(cleanParts.map((p) => p.qty * p.unitPrice));
  return { visit, labour, parts: cleanParts, partsTotal, total: visit + labour + partsTotal };
}

// The price currently agreed for a job: latest approved scope revision, else
// the approved quote, else (not-feasible) the visit charge.
export function agreedPrice(job) {
  const approvedRevision = [...(job.scopeRevisions || [])].reverse().find((r) => r.status === 'approved');
  if (approvedRevision) return approvedRevision.price;
  if (job.quote?.status === 'approved') return job.quote.price;
  if (job.notFeasible?.flag) return { visit: job.priceBand?.visit || 0, labour: 0, parts: [], partsTotal: 0, total: job.priceBand?.visit || 0 };
  return null;
}

// PRC-06 — the complete split, shown to the professional before accepting and
// computed identically at settlement. Commission applies to visit + labour
// only; parts pass through at cost.
export async function computeSplit({ archetype, category, city, stateCode = 'KA', price, paymentMode = 'online', priorityTip = 0, feeHoliday = false, categoryCommissionBps = null }) {
  const pay = await getConfig('payments', { city, category });
  const serviceBase = price.visit + price.labour;
  const commissionBps = feeHoliday ? 0 : categoryCommissionBps ?? pay.commissionBps[archetype] ?? 1500;
  const platformFee = bps(serviceBase, commissionBps);
  const gross = price.total;
  const tds = bps(gross, pay.tdsBps);
  const netToPro = gross - platformFee - tds;
  const w = pay.welfare?.[stateCode];
  const welfareFee = w ? Math.min(bps(netToPro, w.bps), w.capPaise ?? Infinity) : 0; // borne by Harmonia
  const gatewayFee = paymentMode === 'online' ? bps(gross + priorityTip, pay.gatewayBps) : 0; // borne by Harmonia
  return {
    gross,
    serviceBase,
    partsTotal: price.partsTotal,
    commissionBps,
    platformFee,
    tds,
    welfareFee,
    gatewayFee,
    netToPro,
    priorityTip,
    customerPays: gross + priorityTip,
    proReceives: netToPro + priorityTip, // TIP-01 — zero commission on tips
    feeHoliday,
    platformContribution: platformFee - welfareFee - gatewayFee,
  };
}

// TIP-05 — lower of ₹1,000 or 50% of job value.
export async function tipCap(job) {
  const pay = await getConfig('payments');
  const value = job.pricing?.gross || job.priceBand?.min || 0;
  return Math.max(0, Math.min(pay.tipCapPaise, Math.floor((value * pay.tipCapPct) / 100)));
}
