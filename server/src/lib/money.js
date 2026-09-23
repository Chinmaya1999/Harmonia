// All money is stored in paise as integers (PRD §7.4). Never floating point.

export const rupees = (r) => Math.round(Number(r) * 100);
export const toRupees = (p) => p / 100;

// Basis-point percentage of an integer amount, rounded half-up to the paisa.
export const bps = (amountPaise, basisPoints) => Math.round((amountPaise * basisPoints) / 10000);

export const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

export function assertPaise(n, label = 'amount') {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} must be a non-negative integer number of paise`);
  return n;
}
