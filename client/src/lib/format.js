const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Money arrives in paise; always rendered in figures.
export const money = (paise, { exact = false } = {}) => {
  if (paise == null || Number.isNaN(paise)) return '—';
  const r = paise / 100;
  return exact || !Number.isInteger(r) ? inr2.format(r) : inr.format(r);
};
export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);

const TZ = 'Asia/Kolkata';
export const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '—');
export const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—');
export const dateShort = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ }) : '—');
export const dateTime = (d) => (d ? `${dateShort(d)}, ${time(d)}` : '—');

export function ago(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return dateShort(d);
}

export function until(d) {
  const s = Math.round((new Date(d) - Date.now()) / 1000);
  if (s <= 0) return 'now';
  if (s < 3600) return `in ${Math.ceil(s / 60)} min`;
  if (s < 86400) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86400)} d`;
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export const STATE_LABEL = {
  CREATED: 'Requested',
  DISPATCHING: 'Finding a professional',
  ASSIGNED: 'Professional assigned',
  EN_ROUTE: 'On the way',
  ARRIVED: 'Arrived',
  IN_PROGRESS: 'Work in progress',
  SCOPE_REVISED: 'Scope change pending',
  WORK_COMPLETE: 'Work complete',
  CUSTOMER_CONFIRMED: 'Confirmed',
  PAID: 'Paid',
  CLOSED: 'Closed',
  CANCELLED_BY_CUSTOMER: 'Cancelled',
  CANCELLED_BY_PRO: 'Professional cancelled',
  NO_SHOW: 'No-show',
  DISPUTED: 'In dispute',
  REASSIGNED: 'Reassigning',
  EXPIRED: 'Expired',
};

export const STATE_TONE = {
  DISPATCHING: 'info', ASSIGNED: 'brand', EN_ROUTE: 'brand', ARRIVED: 'brand', IN_PROGRESS: 'brand', SCOPE_REVISED: 'warning',
  WORK_COMPLETE: 'success', CUSTOMER_CONFIRMED: 'success', PAID: 'success', CLOSED: '', CANCELLED_BY_CUSTOMER: '', EXPIRED: '',
  DISPUTED: 'danger', NO_SHOW: 'danger', CANCELLED_BY_PRO: 'warning', REASSIGNED: 'warning',
};

export const REASON_LABEL = {
  category_not_added: 'Add this skill to your passport',
  skill_not_verified: 'Skill assessment pending',
  verification_tier_too_low: 'Complete more verification',
  account_suspended: 'Account suspended',
  category_suspended_pending_reassessment: 'Paused for re-assessment',
  background_verification_lapsed: 'Background check expired — renew',
  offline: 'Offline right now',
  busy: 'On another job',
  not_found: 'No longer on Harmonia',
  unavailable: 'Unavailable',
  declined: 'Declined this request',
  no_response: 'Did not respond in time',
  no_candidates: 'No one available for that slot',
  no_one_scheduled: 'No one is scheduled for that slot',
};

export const labelize = (s = '') => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
