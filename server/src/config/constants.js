// Domain constants taken directly from the Harmonia PRD v2.0.

export const ROLES = Object.freeze({ CUSTOMER: 'customer', PRO: 'professional', ADMIN: 'admin' });

// §3.1 — every category belongs to exactly one archetype; the archetype drives
// booking flow, pricing, verification depth, cancellation, settlement and SLA.
export const ARCHETYPES = Object.freeze({
  A: { code: 'A', name: 'Instant on-site', pricing: 'Fixed rate card + parts', dispatch: 'realtime', minTier: 2 },
  B: { code: 'B', name: 'Scheduled on-site', pricing: 'Rate card or hourly', dispatch: 'slot', minTier: 1 },
  C: { code: 'C', name: 'Project', pricing: 'Quotation, milestone-based', dispatch: 'quote', minTier: 2 },
  D: { code: 'D', name: 'Consultation', pricing: 'Session or engagement fee', dispatch: 'appointment', minTier: 1 },
  E: { code: 'E', name: 'Retainer', pricing: 'Subscription', dispatch: 'assigned', minTier: 2 },
});

// §4.2 — graded verification. Each tier is cumulative.
export const TIERS = Object.freeze([
  { level: 0, name: 'Registered', requires: ['otp', 'selfie'], unlocks: 'Profile only, no job access' },
  { level: 1, name: 'Identity Verified', requires: ['pan', 'digilocker', 'address', 'bank'], unlocks: 'Scheduled (B) jobs' },
  { level: 2, name: 'Background Verified', requires: ['police', 'references'], unlocks: 'Instant dispatch (A), entry into homes' },
  { level: 3, name: 'Skill Verified', requires: ['skill'], unlocks: 'Category unlock, higher dispatch priority' },
  { level: 4, name: 'Licence Verified', requires: ['licence'], unlocks: 'Regulated consultation (D) categories' },
  { level: 5, name: 'Harmonia Elite', requires: ['performance'], unlocks: 'Premium jobs, priority dispatch, higher visibility' },
]);

export const VERIFICATION_CHECKS = Object.freeze({
  otp: { tier: 0, label: 'Mobile OTP', auto: true },
  selfie: { tier: 0, label: 'Selfie with liveness check' },
  pan: { tier: 1, label: 'PAN verification' },
  digilocker: { tier: 1, label: 'Identity via DigiLocker' },
  address: { tier: 1, label: 'Address proof' },
  bank: { tier: 1, label: 'Bank / UPI name match (penny drop)' },
  police: { tier: 2, label: 'Police verification (empanelled agency)' },
  references: { tier: 2, label: 'Two work references' },
  licence: { tier: 4, label: 'Licence against professional register' },
});

export const CHECK_STATUS = Object.freeze(['not_started', 'submitted', 'verified', 'rejected', 'expired']);

// §6.1 canonical job states.
export const S = Object.freeze({
  CREATED: 'CREATED',
  DISPATCHING: 'DISPATCHING',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  SCOPE_REVISED: 'SCOPE_REVISED',
  WORK_COMPLETE: 'WORK_COMPLETE',
  CUSTOMER_CONFIRMED: 'CUSTOMER_CONFIRMED',
  PAID: 'PAID',
  CLOSED: 'CLOSED',
  CANCELLED_BY_CUSTOMER: 'CANCELLED_BY_CUSTOMER',
  CANCELLED_BY_PRO: 'CANCELLED_BY_PRO',
  NO_SHOW: 'NO_SHOW',
  DISPUTED: 'DISPUTED',
  REASSIGNED: 'REASSIGNED',
  EXPIRED: 'EXPIRED',
});

// Allowed transitions. Enforced by the job state machine with a conditional
// update, so two actors can never move a job along different paths.
export const TRANSITIONS = Object.freeze({
  CREATED: [S.DISPATCHING, S.CANCELLED_BY_CUSTOMER, S.EXPIRED],
  DISPATCHING: [S.ASSIGNED, S.CANCELLED_BY_CUSTOMER, S.EXPIRED],
  ASSIGNED: [S.EN_ROUTE, S.CANCELLED_BY_CUSTOMER, S.CANCELLED_BY_PRO, S.NO_SHOW],
  EN_ROUTE: [S.ARRIVED, S.CANCELLED_BY_CUSTOMER, S.CANCELLED_BY_PRO, S.NO_SHOW],
  ARRIVED: [S.IN_PROGRESS, S.WORK_COMPLETE, S.CANCELLED_BY_CUSTOMER, S.DISPUTED],
  IN_PROGRESS: [S.SCOPE_REVISED, S.WORK_COMPLETE, S.DISPUTED],
  SCOPE_REVISED: [S.IN_PROGRESS, S.DISPUTED],
  WORK_COMPLETE: [S.CUSTOMER_CONFIRMED, S.DISPUTED],
  CUSTOMER_CONFIRMED: [S.PAID, S.DISPUTED],
  PAID: [S.CLOSED, S.DISPUTED],
  DISPUTED: [S.PAID, S.CLOSED],
  // A pro cancellation or no-show is never the end for the customer: the job
  // passes through REASSIGNED and back into dispatch (free replacement).
  CANCELLED_BY_PRO: [S.REASSIGNED],
  NO_SHOW: [S.REASSIGNED],
  REASSIGNED: [S.DISPATCHING],
  CLOSED: [S.DISPUTED],
  CANCELLED_BY_CUSTOMER: [],
  EXPIRED: [],
});

export const ACTIVE_STATES = [S.ASSIGNED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.SCOPE_REVISED];
export const OPEN_STATES = [S.CREATED, S.DISPATCHING, ...ACTIVE_STATES, S.WORK_COMPLETE, S.CUSTOMER_CONFIRMED, S.DISPUTED];
export const TERMINAL_STATES = [S.CLOSED, S.CANCELLED_BY_CUSTOMER, S.EXPIRED];

export const PRO_STATUS = Object.freeze({ AVAILABLE: 'available', WINDOW: 'window', BUSY: 'busy', OFFLINE: 'offline' });

// REP-04: a low rating must carry a reason code.
export const RATING_REASON_CODES = [
  'poor_workmanship', 'late_arrival', 'rude_behaviour', 'left_mess', 'overcharged',
  'incomplete_work', 'safety_concern', 'other',
];
export const CUSTOMER_RATING_REASON_CODES = [
  'abusive', 'unsafe_environment', 'scope_pressure', 'payment_delay', 'wrong_address', 'other',
];

export const DISPUTE_REASONS = [
  'work_quality', 'price_disagreement', 'scope_disagreement', 'damage', 'no_show', 'conduct', 'payment', 'other',
];

// §6.7 HOM-05 — default service intervals per asset type, in days.
export const ASSET_SERVICE_INTERVALS = Object.freeze({
  air_conditioner: 180,
  water_purifier: 90,
  geyser: 365,
  washing_machine: 365,
  refrigerator: 365,
  chimney: 180,
  inverter: 180,
  electrical_panel: 730,
  plumbing_fixture: 365,
  other: 365,
});

export const CITY_CODES = Object.freeze({ Bengaluru: 'BLR', Chennai: 'MAA', Hyderabad: 'HYD', Mumbai: 'BOM', Delhi: 'DEL', Pune: 'PNQ' });
