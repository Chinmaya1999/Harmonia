import mongoose from 'mongoose';

const { Schema } = mongoose;

// §4.4 — two-sided, multi-dimensional, blind until both submit.
const ratingSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    direction: { type: String, enum: ['customer_to_pro', 'pro_to_customer'], required: true },
    rater: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pro: { type: Schema.Types.ObjectId, ref: 'Professional', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: String,
    scores: {
      quality: Number,
      punctuality: Number,
      conduct: Number,
      cleanliness: Number,
      priceFairness: Number,
      // pro → customer
      respect: Number,
      clarity: Number,
      paymentPromptness: Number,
    },
    overall: { type: Number, min: 1, max: 5, required: true },
    reasonCode: String,
    text: { type: String, maxlength: 800 },
    response: { text: String, at: Date }, // REP-05 — once
    visible: { type: Boolean, default: false },
    excluded: { type: Boolean, default: false }, // REP-07
    excludedReason: String,
  },
  { timestamps: true },
);
ratingSchema.index({ job: 1, direction: 1 }, { unique: true });
ratingSchema.index({ pro: 1, direction: 1, createdAt: -1 });

export const Rating = mongoose.model('Rating', ratingSchema);

// §6.5
const disputeSchema = new Schema(
  {
    ref: { type: String, required: true, unique: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raisedByRole: { type: String, enum: ['customer', 'professional'], required: true },
    reason: { type: String, required: true },
    description: { type: String, maxlength: 2000 },
    claimAmount: Number,
    attachments: [{ _id: false, url: String, sha256: String }],
    stateBefore: String,
    amountHeld: { type: Number, default: 0 }, // DIS-02
    evidence: Schema.Types.Mixed, // DIS-03 auto-assembled file
    status: { type: String, enum: ['open', 'decided', 'appealed', 'closed'], default: 'open' },
    slaDueAt: Date, // DIS-05
    decision: {
      outcome: { type: String, enum: ['favour_customer', 'favour_pro', 'split', 'no_fault'] },
      refundPaise: Number,
      releasePaise: Number,
      rationale: String,
      seriousConduct: Boolean,
      decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
    appeal: {
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      at: Date,
      outcome: { type: String, enum: ['upheld', 'overturned'] },
      rationale: String,
      decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      decidedAt: Date,
    },
  },
  { timestamps: true },
);

export const Dispute = mongoose.model('Dispute', disputeSchema);

// §6.6
const incidentSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job' },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raisedByRole: String,
    kind: { type: String, enum: ['sos', 'safety_complaint', 'tip_solicitation', 'off_platform_request', 'harassment', 'other'], required: true },
    serious: { type: Boolean, default: false },
    description: String,
    location: { type: { type: String, default: 'Point' }, coordinates: [Number] },
    against: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['open', 'investigating', 'resolved'], default: 'open' },
    resolution: String,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true },
);

export const Incident = mongoose.model('Incident', incidentSchema);

// JOB-07 / VER-08 / NFR-09 — immutable audit log.
const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    data: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'], function block(next) {
  next(new Error('Audit log is append-only'));
});

export const AuditLog = mongoose.model('AuditLog', auditSchema);

// In-app chat, retained as dispute evidence (§3.6).
const messageSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: String,
    text: { type: String, maxlength: 1000 },
    redacted: { type: Boolean, default: false },
    flags: [String],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Message = mongoose.model('Message', messageSchema);
