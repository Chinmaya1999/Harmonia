import mongoose from 'mongoose';

const { Schema } = mongoose;

const jobTypeSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    labour: { type: Number, required: true }, // paise
    standardParts: { type: Number, default: 0 }, // paise, indicative
    durationMin: { type: Number, default: 60 },
  },
  { _id: false },
);

const rateCardSchema = new Schema(
  {
    city: { type: String, required: true },
    visitCharge: { type: Number, required: true }, // paise
    jobTypes: [jobTypeSchema],
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// §3.2 — every category MUST have: archetype, minimum verification tier, rate
// card, standard duration, cancellation policy and warranty period.
const categorySchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    description: String,
    icon: { type: String, default: 'wrench' },
    archetype: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true },
    collar: { type: String, enum: ['blue', 'white'], default: 'blue' },
    regulated: { type: Boolean, default: false },
    minTier: { type: Number, min: 0, max: 5, required: true },
    // VER-05 — unsupervised access to children, elderly or vulnerable.
    vulnerableAccess: { type: Boolean, default: false },
    womanPreferenceOffered: { type: Boolean, default: true },
    standardDurationMin: { type: Number, default: 60 },
    warrantyDays: { type: Number, default: 30 },
    cancellation: {
      freeBeforeState: { type: String, default: 'EN_ROUTE' }, // free until pro is en route
      feePaise: { type: Number, default: 10000 },
    },
    commissionBps: { type: Number, default: null }, // null → archetype default from config
    // §3.2 depth rule: a category only goes live in a locality once enough
    // eligible professionals exist to meet the fill rate at peak.
    minActivePros: { type: Number, default: 3 },
    rateCards: [rateCardSchema],
    active: { type: Boolean, default: true },
    phase: { type: Number, default: 1 },
    sortOrder: { type: Number, default: 100 },
  },
  { timestamps: true },
);

export const Category = mongoose.model('Category', categorySchema);

const communitySchema = new Schema(
  {
    name: { type: String, required: true },
    locality: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    households: { type: Number, default: 0 },
    buildingAgeYears: Number,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    radiusKm: { type: Number, default: 1 },
    // §2.5 activation sequence
    stage: { type: String, enum: ['prospect', 'signed', 'panel_ready', 'live', 'contracted'], default: 'prospect' },
    rwaContact: { name: String, role: String },
    contracts: [
      {
        _id: false,
        kind: { type: String, enum: ['loi', 'amc', 'membership_pilot'] },
        valuePaise: Number,
        signedAt: Date,
        note: String,
      },
    ],
    activationCostPaise: { type: Number, default: 0 },
  },
  { timestamps: true },
);
communitySchema.index({ location: '2dsphere' });

export const Community = mongoose.model('Community', communitySchema);

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.model('Counter', counterSchema);

export async function nextSeq(key) {
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return c.seq;
}

// Runtime configuration (MTC-02: weights configurable without a deployment).
const configSchema = new Schema(
  {
    key: { type: String, required: true },
    scope: { type: String, default: 'global' }, // global | city:BLR | category:ELEC | city:BLR:category:ELEC
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
configSchema.index({ key: 1, scope: 1 }, { unique: true });

export const Config = mongoose.model('Config', configSchema);
