import mongoose from 'mongoose';
import { ROLES } from '../config/constants.js';

const { Schema } = mongoose;

// Fields tagged `pii: true` are personal data under the DPDP Act. The export
// and erasure services walk schemas for this tag instead of relying on a manual
// audit (PRD §7.4 design rules).
const userSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true, pii: true },
    name: { type: String, trim: true, maxlength: 80, pii: true },
    email: { type: String, trim: true, lowercase: true, pii: true },
    role: { type: String, enum: Object.values(ROLES), required: true },
    gender: { type: String, enum: ['female', 'male', 'other', 'undisclosed'], default: 'undisclosed', pii: true },
    language: { type: String, default: 'en' },
    community: { type: Schema.Types.ObjectId, ref: 'Community' },

    // PRF-01..06 — My Harmonia Team.
    preferredPros: [
      {
        _id: false,
        pro: { type: Schema.Types.ObjectId, ref: 'Professional', required: true },
        category: { type: String, required: true },
        source: { type: String, enum: ['job', 'invite'], default: 'job' },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // MIG-02 — customer migrated from a professional's own book.
    invitedBy: {
      pro: { type: Schema.Types.ObjectId, ref: 'Professional' },
      invite: { type: Schema.Types.ObjectId, ref: 'Invite' },
      at: Date,
    },

    // REP-02 / REP-10 — customers are rated too.
    reputation: {
      ratingAvg: { type: Number, default: null },
      ratingCount: { type: Number, default: 0 },
      upheldComplaints: { type: Number, default: 0 },
      nonPayment: { type: Number, default: 0 },
      deprioritised: { type: Boolean, default: false },
    },

    suspended: {
      active: { type: Boolean, default: false },
      reason: String,
      at: Date,
    },

    consents: [
      {
        _id: false,
        purpose: { type: String, enum: ['service_delivery', 'location', 'home_record', 'marketing_harmonia', 'contacts_import'] },
        grantedAt: Date,
        withdrawnAt: Date,
      },
    ],

    otp: {
      hash: { type: String, select: false },
      expiresAt: { type: Date, select: false },
      attempts: { type: Number, default: 0, select: false },
    },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const o = this.toObject({ versionKey: false });
  delete o.otp;
  return o;
};

export const User = mongoose.model('User', userSchema);
