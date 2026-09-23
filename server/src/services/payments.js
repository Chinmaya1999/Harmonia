import { customAlphabet } from 'nanoid';
import { Job, Category } from '../models/index.js';
import { post, balance } from './ledger.js';
import { computeSplit, agreedPrice } from './pricing.js';
import { bps } from '../lib/money.js';
import { getConfig } from './settings.js';
import { badRequest } from '../lib/errors.js';

const ref = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 12);

// ---------------------------------------------------------------------------
// Payment aggregator adapter (sandbox).
// PAY-01: Harmonia never holds customer funds; money sits in the PA-operated
// escrow. Replace these three calls with the licensed PA's split-settlement /
// marketplace-payout API. Everything else in the platform only sees the refs.
// ---------------------------------------------------------------------------
export const PA = {
  async collect({ amount, method = 'upi' }) {
    if (amount <= 0) throw badRequest('Nothing to collect');
    return { paRef: `pa_col_${ref()}`, method, amount, status: 'captured' };
  },
  async payout({ amount }) {
    return { payoutRef: `pa_pay_${ref()}`, amount, status: 'processed', rail: 'upi' };
  },
  async refund({ amount }) {
    return { refundRef: `pa_ref_${ref()}`, amount, status: 'processed' };
  },
};

const escrowAcct = (job) => `escrow:job:${job._id}`;
const payableAcct = (proId) => `pro:${proId}:payable`;
const receivableAcct = (proId) => `pro:${proId}:receivable`;

// Customer pays into escrow (quote approval, scope top-up, or at confirmation).
export async function holdInEscrow(job, amount, reason) {
  if (amount <= 0) return null;
  const { paRef } = await PA.collect({ amount });
  const n = (job.payment?.paRefs?.length || 0) + 1;
  await post({
    key: `escrow_hold:${job._id}:${reason}:${n}`,
    kind: 'escrow_hold',
    memo: `Customer payment held in escrow (${reason})`,
    job: job._id,
    customer: job.customer,
    externalRef: paRef,
    lines: [
      { account: 'pa:escrow', debit: amount },
      { account: escrowAcct(job), credit: amount },
    ],
  });
  return Job.findByIdAndUpdate(
    job._id,
    { $inc: { 'payment.escrowed': amount }, $set: { 'payment.status': 'escrow_held' }, $push: { 'payment.paRefs': paRef } },
    { new: true },
  );
}

async function refundFromEscrow(job, amount, reason) {
  if (amount <= 0) return;
  const { refundRef } = await PA.refund({ amount });
  await post({
    key: `escrow_refund:${job._id}:${reason}`,
    kind: 'refund',
    memo: `Refund to customer (${reason})`,
    job: job._id,
    customer: job.customer,
    externalRef: refundRef,
    lines: [
      { account: escrowAcct(job), debit: amount },
      { account: 'pa:escrow', credit: amount },
    ],
  });
  await Job.updateOne({ _id: job._id }, { $inc: { 'payment.refunded': amount } });
}

// Same-day payout (PAY-03). Any commission a pro owes from cash jobs is netted
// off first, so cash and online jobs reconcile without chasing anyone.
async function payoutPro(proId, amount, key, jobId, memo) {
  if (amount <= 0) return null;
  const owed = Math.max(0, -(await balance(receivableAcct(proId))).net);
  const offset = Math.min(owed, amount);
  if (offset > 0) {
    await post({
      key: `${key}:offset`,
      kind: 'receivable_offset',
      memo: 'Cash-job commission netted from payout',
      job: jobId,
      pro: proId,
      lines: [
        { account: payableAcct(proId), debit: offset },
        { account: receivableAcct(proId), credit: offset },
      ],
    });
  }
  const payable = amount - offset;
  if (payable <= 0) return { payoutRef: null, amount: 0, offset };
  const { payoutRef } = await PA.payout({ amount: payable });
  await post({
    key,
    kind: 'payout',
    memo,
    job: jobId,
    pro: proId,
    externalRef: payoutRef,
    lines: [
      { account: payableAcct(proId), debit: payable },
      { account: 'pa:escrow', credit: payable },
    ],
  });
  return { payoutRef, amount: payable, offset };
}

async function splitFor(job, overrides = {}) {
  const price = agreedPrice(job);
  if (!price) throw badRequest('No agreed price on this job');
  const category = await Category.findOne({ code: job.category }).lean();
  return computeSplit({
    archetype: job.archetype,
    category: job.category,
    city: job.city,
    stateCode: job.stateCode,
    price,
    paymentMode: job.paymentMode,
    priorityTip: job.priorityTip || 0,
    feeHoliday: job.feeHoliday,
    categoryCommissionBps: category?.commissionBps ?? null,
    ...overrides,
  });
}

async function postPlatformCosts(job, split, suffix = '') {
  await post({
    key: `platform_costs:${job._id}${suffix}`,
    kind: 'platform_costs',
    memo: 'Welfare fee and gateway cost borne by Harmonia',
    job: job._id,
    lines: [
      { account: 'cost:welfare', debit: split.welfareFee },
      { account: `govt:welfare:${job.stateCode}`, credit: split.welfareFee },
      { account: 'cost:gateway', debit: split.gatewayFee },
      { account: 'pa:escrow', credit: split.gatewayFee },
    ],
  });
}

// Online settlement on customer confirmation.
export async function settleOnline(job, { refund = 0 } = {}) {
  let split = await splitFor(job);
  // Collect any outstanding amount (e.g. not-feasible visit charge) or return
  // any excess (scope reduced) before releasing.
  const fresh = await Job.findById(job._id);
  const outstanding = split.customerPays - (fresh.payment.escrowed - fresh.payment.refunded);
  if (outstanding > 0) await holdInEscrow(fresh, outstanding, 'balance');
  if (outstanding < 0) await refundFromEscrow(fresh, -outstanding, 'excess');

  if (refund > 0) {
    // Dispute partial refund: taken from the service portion first.
    await refundFromEscrow(fresh, refund, 'dispute');
    const pay = await getConfig('payments', { city: job.city, category: job.category });
    const gross = split.gross - Math.min(refund, split.gross);
    const serviceBase = Math.max(0, split.serviceBase - refund);
    const platformFee = bps(serviceBase, split.commissionBps);
    const tds = bps(gross, pay.tdsBps);
    const netToPro = gross - platformFee - tds;
    split = { ...split, gross, serviceBase, platformFee, tds, netToPro, proReceives: netToPro + split.priorityTip, customerPays: gross + split.priorityTip };
  }

  await post({
    key: `escrow_release:${job._id}`,
    kind: 'escrow_release',
    memo: 'Escrow released on confirmation',
    job: job._id,
    pro: job.professional,
    lines: [
      { account: escrowAcct(job), debit: split.gross + split.priorityTip },
      { account: payableAcct(job.professional), credit: split.netToPro + split.priorityTip },
      { account: 'platform:revenue', credit: split.platformFee },
      { account: 'govt:tds', credit: split.tds },
    ],
  });
  await postPlatformCosts(job, split);
  const payout = await payoutPro(job.professional, split.proReceives, `payout:${job._id}`, job._id, `Same-day settlement ${job.ref}`);

  return Job.findByIdAndUpdate(
    job._id,
    {
      $set: {
        pricing: split,
        'payment.status': refund > 0 ? 'partially_refunded' : 'released',
        'payment.payoutRef': payout?.payoutRef,
        'payment.settledAt': new Date(),
      },
    },
    { new: true },
  );
}

// Cash (PAY-05): the pro holds the gross; the ledger records what they owe.
export async function settleCash(job) {
  const split = await splitFor(job, { paymentMode: 'cash' });
  await post({
    key: `cash_settle:${job._id}`,
    kind: 'cash_settlement',
    memo: 'Cash collected by professional — commission receivable',
    job: job._id,
    pro: job.professional,
    lines: [
      { account: receivableAcct(job.professional), debit: split.platformFee + split.tds },
      { account: 'platform:revenue', credit: split.platformFee },
      { account: 'govt:tds', credit: split.tds },
    ],
  });
  await postPlatformCosts(job, split);
  return Job.findByIdAndUpdate(
    job._id,
    { $set: { pricing: split, 'payment.status': 'cash_collected', 'payment.settledAt': new Date() } },
    { new: true },
  );
}

// Full refund of whatever is in escrow (customer cancellation, dispute).
export async function refundAll(job, reason) {
  const fresh = await Job.findById(job._id);
  const held = fresh.payment.escrowed - fresh.payment.refunded;
  if (held > 0) {
    await refundFromEscrow(fresh, held, reason);
    await Job.updateOne({ _id: job._id }, { $set: { 'payment.status': 'refunded' } });
  }
}

// TIP-01/02/07 — zero commission, settled same day, separately identified.
export async function payTip(job, amount, n) {
  const { paRef } = await PA.collect({ amount });
  await post({
    key: `tip:${job._id}:${n}`,
    kind: 'tip',
    memo: `Tip for ${job.ref} — zero commission`,
    job: job._id,
    pro: job.professional,
    customer: job.customer,
    externalRef: paRef,
    lines: [
      { account: 'pa:escrow', debit: amount },
      { account: payableAcct(job.professional), credit: amount },
    ],
  });
  const { payoutRef } = await PA.payout({ amount });
  await post({
    key: `tip_payout:${job._id}:${n}`,
    kind: 'tip_payout',
    memo: `Tip payout ${job.ref}`,
    job: job._id,
    pro: job.professional,
    externalRef: payoutRef,
    lines: [
      { account: payableAcct(job.professional), debit: amount },
      { account: 'pa:escrow', credit: amount },
    ],
  });
  return paRef;
}

// ASR-03 — a replacement professional on a warranty job is paid by Harmonia.
export async function payWarrantyReplacement(job, amount) {
  await post({
    key: `warranty_pay:${job._id}`,
    kind: 'warranty_payout',
    memo: `Assurance replacement ${job.ref}`,
    job: job._id,
    pro: job.professional,
    lines: [
      { account: 'cost:warranty', debit: amount },
      { account: payableAcct(job.professional), credit: amount },
    ],
  });
  return payoutPro(job.professional, amount, `payout:${job._id}`, job._id, `Assurance replacement ${job.ref}`);
}
