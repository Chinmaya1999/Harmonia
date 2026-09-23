import crypto from 'node:crypto';
import { nextSeq, Professional } from '../models/index.js';
import { CITY_CODES } from '../config/constants.js';
import { env } from '../config/env.js';
import { conflict } from '../lib/errors.js';

// ID-01 — permanent, human-readable, e.g. HM-BLR-004582. The city code marks
// where the professional first registered; it never changes when they move.
export async function issueHarmoniaId(city = 'Bengaluru') {
  const code = CITY_CODES[city] || 'IND';
  const seq = await nextSeq('harmonia_id');
  return `HM-${code}-${String(seq).padStart(6, '0')}`;
}

// ID-03 — duplicate detection on hashed identifiers. Raw PAN and account
// numbers are never stored; only a keyed hash and the last four characters.
export const identifierHash = (value) => crypto.createHmac('sha256', env.jwtSecret).update(String(value).trim().toUpperCase()).digest('hex');

export async function assertUniqueIdentifier(field, value, proId) {
  const h = identifierHash(value);
  const other = await Professional.findOne({ [`identity.${field}`]: h, _id: { $ne: proId } }).select('harmoniaId');
  if (other) throw conflict('This identifier is already linked to another Harmonia ID. Each professional holds exactly one.', 'DUPLICATE_IDENTITY');
  return h;
}
