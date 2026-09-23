import mongoose from 'mongoose';

const { Schema } = mongoose;

// PAY-10 — double-entry, immutable. One document per transaction so the whole
// transaction is written atomically without needing a replica set.
// Accounts:
//   pa:escrow                 cash held at the payment aggregator (asset)
//   escrow:job:<id>           customer money held for a job (liability)
//   pro:<id>:payable          owed to a professional (liability)
//   pro:<id>:receivable       commission owed by a pro on cash jobs (asset)
//   platform:revenue          Harmonia commission
//   platform:warranty         Assurance provision (replacement jobs)
//   govt:tds                  194-O withholding
//   govt:welfare:<state>      gig-worker welfare fee
//   cost:gateway              payment gateway charges
//   customer:<id>:refund      refunds owed to a customer
const lineSchema = new Schema(
  {
    account: { type: String, required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
  },
  { _id: false },
);

const ledgerTxnSchema = new Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    memo: String,
    job: { type: Schema.Types.ObjectId, ref: 'Job', index: true },
    pro: { type: Schema.Types.ObjectId, ref: 'Professional', index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User' },
    lines: {
      type: [lineSchema],
      validate: {
        validator(lines) {
          const d = lines.reduce((a, l) => a + l.debit, 0);
          const c = lines.reduce((a, l) => a + l.credit, 0);
          return lines.length >= 2 && d === c && lines.every((l) => Number.isInteger(l.debit) && Number.isInteger(l.credit));
        },
        message: 'Ledger transaction must balance in integer paise',
      },
    },
    externalRef: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ledgerTxnSchema.index({ 'lines.account': 1 });

const immutable = function immutable(next) {
  next(new Error('Ledger entries are immutable'));
};
ledgerTxnSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], immutable);

export const LedgerTxn = mongoose.model('LedgerTxn', ledgerTxnSchema);
