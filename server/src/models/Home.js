import mongoose from 'mongoose';
import { ASSET_SERVICE_INTERVALS } from '../config/constants.js';

const { Schema } = mongoose;

// §6.7 — the customer-side moat.
const homeSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, default: 'My home' },
    kind: { type: String, enum: ['own', 'rented', 'parents', 'nri_owned', 'other'], default: 'own' }, // HOM-08
    type: { type: String, enum: ['apartment', 'independent', 'villa', 'office'], default: 'apartment' },
    bhk: Number,
    sizeSqft: Number,
    ageYears: Number,
    ownership: { type: String, enum: ['owner', 'tenant', 'family'], default: 'owner' },
    community: { type: Schema.Types.ObjectId, ref: 'Community' },
    address: {
      line: { type: String, pii: true },
      block: { type: String, pii: true },
      pincode: String,
      city: { type: String, default: 'Bengaluru' },
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    members: [{ _id: false, user: { type: Schema.Types.ObjectId, ref: 'User' }, permission: { type: String, enum: ['view', 'book'] } }],
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Home = mongoose.model('Home', homeSchema);

const assetSchema = new Schema(
  {
    home: { type: Schema.Types.ObjectId, ref: 'Home', required: true, index: true },
    type: { type: String, enum: Object.keys(ASSET_SERVICE_INTERVALS), required: true },
    label: String,
    make: String,
    model: String,
    room: String,
    installedAt: Date,
    purchasedAt: Date,
    warrantyExpiresAt: Date,
    lastServiceAt: Date,
    serviceIntervalDays: Number,
    photos: [{ _id: false, url: String, sha256: String }],
    notes: String,
  },
  { timestamps: true },
);

assetSchema.virtual('nextServiceDue').get(function nextServiceDue() {
  const base = this.lastServiceAt || this.installedAt || this.purchasedAt;
  if (!base) return null;
  const days = this.serviceIntervalDays || ASSET_SERVICE_INTERVALS[this.type] || 365;
  return new Date(base.getTime() + days * 86400000);
});
assetSchema.set('toJSON', { virtuals: true });
assetSchema.set('toObject', { virtuals: true });

export const Asset = mongoose.model('Asset', assetSchema);

// HOM-03 — every completed job writes here automatically.
const recordSchema = new Schema(
  {
    home: { type: Schema.Types.ObjectId, ref: 'Home', required: true, index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, unique: true },
    asset: { type: Schema.Types.ObjectId, ref: 'Asset' },
    date: Date,
    professional: { type: Schema.Types.ObjectId, ref: 'Professional' },
    professionalName: String,
    harmoniaId: String,
    category: String,
    categoryName: String,
    workDone: String,
    parts: [{ _id: false, name: String, qty: Number, unitPrice: Number }],
    cost: Number,
    photos: [{ _id: false, url: String, sha256: String }],
    warrantyExpiresAt: Date,
    isRework: Boolean,
  },
  { timestamps: true },
);

export const HomeRecord = mongoose.model('HomeRecord', recordSchema);

// §3.8 — the professional's own customer book.
const inviteSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    pro: { type: Schema.Types.ObjectId, ref: 'Professional', required: true, index: true },
    channel: { type: String, enum: ['whatsapp', 'sms', 'link'], default: 'link' },
    label: String, // e.g. "Mrs Rao, B-402"
    opens: { type: Number, default: 0 },
    activated: [{ _id: false, customer: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date }],
    expiresAt: Date,
  },
  { timestamps: true },
);

export const Invite = mongoose.model('Invite', inviteSchema);
