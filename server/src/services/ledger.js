import { LedgerTxn } from '../models/index.js';

const isDupKey = (err) => err?.code === 11000;

// Idempotent posting: the same idempotency key always yields the same single
// transaction, however many times a request or a retry calls it (PAY-10).
export async function post({ key, kind, memo, job, pro, customer, lines, externalRef }) {
  const clean = lines.filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0).map((l) => ({ account: l.account, debit: l.debit || 0, credit: l.credit || 0 }));
  if (clean.length < 2) return null; // zero-value transaction — nothing to record
  try {
    return await LedgerTxn.create({ idempotencyKey: key, kind, memo, job, pro, customer, lines: clean, externalRef });
  } catch (err) {
    if (isDupKey(err)) return LedgerTxn.findOne({ idempotencyKey: key });
    throw err;
  }
}

export async function balance(account) {
  const [r] = await LedgerTxn.aggregate([
    { $match: { 'lines.account': account } },
    { $unwind: '$lines' },
    { $match: { 'lines.account': account } },
    { $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
  ]);
  return { debit: r?.debit || 0, credit: r?.credit || 0, net: (r?.credit || 0) - (r?.debit || 0) };
}

export async function balancesByPrefix(prefix) {
  return LedgerTxn.aggregate([
    { $unwind: '$lines' },
    { $match: { 'lines.account': { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } } },
    { $group: { _id: '$lines.account', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
    { $project: { account: '$_id', _id: 0, debit: 1, credit: 1, net: { $subtract: ['$credit', '$debit'] } } },
    { $sort: { account: 1 } },
  ]);
}

// Trial balance — daily reconciliation must show total debits == total credits.
export async function trialBalance() {
  const [r] = await LedgerTxn.aggregate([
    { $unwind: '$lines' },
    { $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' }, txns: { $addToSet: '$_id' } } },
    { $project: { debit: 1, credit: 1, txns: { $size: '$txns' } } },
  ]);
  return { debit: r?.debit || 0, credit: r?.credit || 0, balanced: (r?.debit || 0) === (r?.credit || 0), txns: r?.txns || 0 };
}
