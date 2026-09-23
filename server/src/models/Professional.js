import mongoose from 'mongoose';
import { CHECK_STATUS, PRO_STATUS } from '../config/constants.js';

const { Schema } = mongoose;

const checkSchema = new Schema(
  {
    status: { type: String, enum: CHECK_STATUS, default: 'not_started' },
    // Reference identifiers only. VER-03: Aadhaar numbers are never stored.
    reference: String,
    documentUrl: String,
    note: String,
    submittedAt: Date,
    verifiedAt: Date,
    expiresAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const skillSchema = new Schema(
  {
    category: { type: String, required: true },
    level: { type: Number, min: 1, max: 5, default: 2 },
    yearsExperience: { type: Number, min: 0, max: 60, default: 0 },
    // SKP-02 provenance marker for every claim.
    provenance: {
      type: String,
      enum: ['self_declared', 'platform_assessed', 'document_verified', 'performance_derived'],
      default: 'self_declared',
    },
    status: { type: String, enum: ['pending', 'verified', 'rejected', 'suspended'], default: 'pending' },
    certificates: [{ _id: false, name: String, issuer: String, issuedOn: Date, url: String }],
    assessmentNote: String,
    verifiedAt: Date,
    suspendedReason: String,
  },
  { _id: false },
);

const professionalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // ID-01 / ID-02 — permanent, human-readable, survives phone/city/category change.
    harmoniaId: { type: String, required: true, unique: true },
    entityType: { type: String, enum: ['individual', 'contractor', 'company'], default: 'individual' },
    displayName: { type: String, required: true, trim: true },
    photoUrl: String,
    bio: { type: String, maxlength: 600 },
    languages: { type: [String], default: ['en'] },
    gender: { type: String, enum: ['female', 'male', 'other', 'undisclosed'], default: 'undisclosed' },
    homeCity: { type: String, default: 'Bengaluru' },
    community: { type: Schema.Types.ObjectId, ref: 'Community' },

    // ID-03 — duplicate detection on hashed identifiers; raw values never stored.
    identity: {
      panHash: { type: String, index: { unique: true, sparse: true } },
      panLast4: String,
      payoutHash: { type: String, index: { unique: true, sparse: true } },
      payoutMasked: String,
      payoutNameMatched: Boolean,
    },

    tier: { type: Number, min: 0, max: 5, default: 0 },
    checks: {
      otp: { type: checkSchema, default: () => ({ status: 'verified', verifiedAt: new Date() }) },
      selfie: { type: checkSchema, default: () => ({}) },
      pan: { type: checkSchema, default: () => ({}) },
      digilocker: { type: checkSchema, default: () => ({}) },
      address: { type: checkSchema, default: () => ({}) },
      bank: { type: checkSchema, default: () => ({}) },
      police: { type: checkSchema, default: () => ({}) },
      references: { type: checkSchema, default: () => ({}) },
      licence: { type: checkSchema, default: () => ({}) },
    },
    skills: [skillSchema],

    // AVL-01..07
    status: { type: String, enum: Object.values(PRO_STATUS), default: PRO_STATUS.OFFLINE },
    statusBeforeBusy: { type: String, enum: Object.values(PRO_STATUS) },
    window: { from: Date, to: Date },
    weeklySchedule: [
      {
        _id: false,
        day: { type: Number, min: 0, max: 6 },
        from: String, // "09:00"
        to: String, // "19:00"
      },
    ],
    scheduleOverrides: [{ _id: false, date: String, off: Boolean, from: String, to: String }],
    radiusKm: { type: Number, default: 6, min: 1, max: 25 },
    categoryRadius: [{ _id: false, category: String, radiusKm: Number }],
    // SAF-06 — restrictions with no dispatch penalty.
    restrictions: {
      earliest: { type: String, default: null }, // "08:00"
      latest: { type: String, default: null }, // "20:00"
      womenCustomersOnly: { type: Boolean, default: false },
    },
    // AVL-06 — only collected while available or on an active job.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    locationUpdatedAt: Date,
    baseLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },

    stats: {
      offers: { type: Number, default: 0 },
      accepted: { type: Number, default: 0 },
      declined: { type: Number, default: 0 },
      cancelledAfterAccept: { type: Number, default: 0 },
      noShows: { type: Number, default: 0 },
      arrivals: { type: Number, default: 0 },
      onTimeArrivals: { type: Number, default: 0 },
      jobsCompleted: { type: Number, default: 0 },
      jobsByCategory: { type: Map, of: Number, default: {} },
      reworkClaims: { type: Number, default: 0 },
      disputesAgainst: { type: Number, default: 0 },
      ratingAvg: { type: Number, default: null },
      ratingCount: { type: Number, default: 0 },
      dimensionAvg: {
        quality: Number, punctuality: Number, conduct: Number, cleanliness: Number, priceFairness: Number,
      },
      tipsCount: { type: Number, default: 0 },
      preferredBy: { type: Number, default: 0 },
      hoursToday: { type: Number, default: 0 },
      activeJobs: { type: Number, default: 0 },
      firstJobAt: Date,
      lastJobAt: Date,
    },

    // §3.5 Harmonia Score — formula and components visible to the pro (REP-08).
    score: {
      value: { type: Number, default: null },
      band: { type: String, enum: ['new', 'elite', 'good', 'watch', 'review'], default: 'new' },
      components: { type: Schema.Types.Mixed, default: {} },
      updatedAt: Date,
    },
    review: {
      flagged: { type: Boolean, default: false },
      reason: String,
      appeal: { text: String, at: Date, status: { type: String, enum: ['none', 'open', 'upheld', 'rejected'], default: 'none' } },
    },

    suspended: { active: { type: Boolean, default: false }, reason: String, at: Date },
    selfDeclaredHistory: { years: Number, approxJobs: Number, note: String }, // MIG-05
  },
  { timestamps: true },
);

professionalSchema.index({ location: '2dsphere' });
professionalSchema.index({ 'skills.category': 1, status: 1, tier: 1 });

export const Professional = mongoose.model('Professional', professionalSchema);
