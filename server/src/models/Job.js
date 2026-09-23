import mongoose from 'mongoose';
import { S } from '../config/constants.js';

const { Schema } = mongoose;

// Photographs are dispute evidence: SHA-256 is recorded at upload so any later
// change to the file is detectable (tamper-evident media, §7.2).
const mediaSchema = new Schema(
  { url: String, sha256: String, at: { type: Date, default: Date.now }, by: { type: Schema.Types.ObjectId, ref: 'User' } },
  { _id: false },
);

const partSchema = new Schema(
  { name: { type: String, required: true }, qty: { type: Number, default: 1, min: 1 }, unitPrice: { type: Number, required: true }, photo: String },
  { _id: false },
);

const priceSchema = new Schema(
  {
    visit: { type: Number, default: 0 },
    labour: { type: Number, default: 0 },
    parts: [partSchema],
    partsTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    note: String,
  },
  { _id: false },
);

const jobSchema = new Schema(
  {
    ref: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    home: { type: Schema.Types.ObjectId, ref: 'Home', required: true },
    asset: { type: Schema.Types.ObjectId, ref: 'Asset' },
    community: { type: Schema.Types.ObjectId, ref: 'Community' },
    professional: { type: Schema.Types.ObjectId, ref: 'Professional', index: true },
    category: { type: String, required: true },
    categoryName: String,
    archetype: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true },
    city: { type: String, default: 'Bengaluru' },
    stateCode: { type: String, default: 'KA' },
    jobType: { code: String, name: String, labour: Number, standardParts: Number, durationMin: Number },

    // §3.3 demand routes
    route: { type: String, enum: ['instant', 'named', 'scheduled', 'warranty'], required: true },
    requestedPro: { type: Schema.Types.ObjectId, ref: 'Professional' },
    scheduledAt: Date,

    description: { type: String, maxlength: 1000 },
    requestPhotos: [mediaSchema],
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    address: { line: String, block: String, communityName: String },
    requireWoman: { type: Boolean, default: false }, // SAF-05

    state: { type: String, enum: Object.values(S), default: S.CREATED, index: true },
    // JOB-07 — append-only. Never edited, only pushed.
    timeline: [
      {
        _id: false,
        state: String,
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        actor: String,
        note: String,
      },
    ],

    // PRC-02 — indicative band before request, firm price before work.
    priceBand: { min: Number, max: Number, visit: Number },
    quote: {
      status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
      price: priceSchema,
      submittedAt: Date,
      decidedAt: Date,
    },
    // JOB-03 — scope revision is a formal step.
    scopeRevisions: [
      {
        price: priceSchema,
        reason: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        proposedAt: { type: Date, default: Date.now },
        decidedAt: Date,
      },
    ],
    notFeasible: { flag: { type: Boolean, default: false }, reason: String }, // JOB-05

    priorityTip: { type: Number, default: 0 }, // paise, TIP-04
    paymentMode: { type: String, enum: ['online', 'cash'], default: 'online' },
    pricing: {
      gross: Number,
      serviceBase: Number,
      partsTotal: Number,
      commissionBps: Number,
      platformFee: Number,
      tds: Number,
      welfareFee: Number,
      gatewayFee: Number,
      netToPro: Number,
      priorityTip: Number,
      feeHoliday: { type: Boolean, default: false },
    },
    payment: {
      status: { type: String, enum: ['none', 'escrow_held', 'released', 'refunded', 'partially_refunded', 'cash_collected'], default: 'none' },
      escrowed: { type: Number, default: 0 },
      refunded: { type: Number, default: 0 },
      paRefs: [String],
      payoutRef: String,
      settledAt: Date,
    },
    tips: [{ _id: false, amount: Number, at: Date, txn: String }],

    arrivalOtp: { type: String, select: false }, // JOB-01
    eta: Date,
    assignedAt: Date,
    arrivedAt: Date,
    startedAt: Date,
    completedAt: Date,
    confirmedAt: Date,
    confirmDueAt: Date,
    paidAt: Date,
    closedAt: Date,

    photos: { before: [mediaSchema], after: [mediaSchema] }, // JOB-02

    dispatch: {
      mode: { type: String, enum: ['waves', 'named', 'broadcast_scheduled'], default: 'waves' },
      wave: { type: Number, default: -1 },
      waveEndsAt: Date,
      startedAt: Date,
      attempts: { type: Number, default: 0 },
      offered: [{ type: Schema.Types.ObjectId, ref: 'Professional' }],
      excluded: [{ type: Schema.Types.ObjectId, ref: 'Professional' }],
      exhausted: { type: Boolean, default: false },
      tipSuggested: { type: Boolean, default: false },
      namedOutcome: { status: String, reason: String }, // PRF-04
      assignmentSec: Number, // time to assignment — the instant promise metric
    },

    warranty: {
      expiresAt: Date,
      parentJob: { type: Schema.Types.ObjectId, ref: 'Job' },
      originalPro: { type: Schema.Types.ObjectId, ref: 'Professional' },
      claims: [{ type: Schema.Types.ObjectId, ref: 'Job' }],
      reason: String,
    },

    ratings: {
      customerRated: { type: Boolean, default: false },
      proRated: { type: Boolean, default: false },
      windowClosesAt: Date,
      revealed: { type: Boolean, default: false },
    },

    dispute: { type: Schema.Types.ObjectId, ref: 'Dispute' },
    cancellation: { by: String, reason: String, feePaise: Number, at: Date },
    feeHoliday: { type: Boolean, default: false }, // MIG-03
    shareToken: { type: String, index: { unique: true, sparse: true } },
    reworkAttributedTo: { type: Schema.Types.ObjectId, ref: 'Professional' },
  },
  { timestamps: true },
);

jobSchema.index({ location: '2dsphere' });
jobSchema.index({ state: 1, 'dispatch.waveEndsAt': 1 });
jobSchema.index({ professional: 1, state: 1 });

export const Job = mongoose.model('Job', jobSchema);

const offerSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    pro: { type: Schema.Types.ObjectId, ref: 'Professional', required: true },
    wave: Number,
    score: Number,
    features: Schema.Types.Mixed,
    distanceKm: Number,
    travelMin: Number,
    expectedEarning: Number, // paise, DSP-02 / PRC-06
    expectedSplit: Schema.Types.Mixed,
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'expired', 'withdrawn', 'lost'], default: 'pending' },
    respondedAt: Date,
    declineReason: String,
  },
  { timestamps: true },
);
offerSchema.index({ job: 1, pro: 1 }, { unique: true });
offerSchema.index({ pro: 1, status: 1 });

export const Offer = mongoose.model('Offer', offerSchema);

// MTC-05 — every dispatch decision logged with input feature values.
const dispatchAttemptSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    wave: Number,
    radiusKm: Number,
    weights: Schema.Types.Mixed,
    candidates: [
      {
        _id: false,
        pro: { type: Schema.Types.ObjectId, ref: 'Professional' },
        name: String,
        score: Number,
        features: Schema.Types.Mixed,
        offered: Boolean,
      },
    ],
    excludedCount: Number,
    outcome: { type: String, default: 'offered' },
  },
  { timestamps: true },
);

export const DispatchAttempt = mongoose.model('DispatchAttempt', dispatchAttemptSchema);
