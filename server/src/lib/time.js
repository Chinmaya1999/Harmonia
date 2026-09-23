// All timestamps are stored in UTC; operational rules (working hours,
// restrictions, schedules) are evaluated in the locality's timezone.
export const TZ = 'Asia/Kolkata';

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;
  return { hhmm: `${hh}:${p.minute}`, day: DAYS[p.weekday], date: `${p.year}-${p.month}-${p.day}` };
}

export const inRange = (hhmm, from, to) => (!from || hhmm >= from) && (!to || hhmm <= to);

export function startOfLocalDay(date = new Date()) {
  const { date: d } = localParts(date);
  return new Date(`${d}T00:00:00+05:30`);
}
