// Timezone helpers built on Intl only, so they run in browsers and Node alike.
// Dates are 'YYYY-MM-DD' strings and times 'HH:MM' strings in the venue's timezone.
const pad = (n) => String(n).padStart(2, '0');

function offsetMs(utcMs, tz) {
  const secMs = Math.floor(utcMs / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(secMs));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - secMs;
}

export const isDateString = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const minutesToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const timeToMinutes = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

// Wall-clock date + minutes-after-midnight in `tz` → UTC Date (DST-safe).
export function zonedToUtc(date, minutes, tz) {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, 0, minutes);
  let result = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(result, tz);
  if (second !== result) result = second;
  return new Date(result);
}

export function dateInZone(instant, tz) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  return p; // en-CA formats as YYYY-MM-DD
}

export const todayInZone = (tz) => dateInZone(new Date(), tz);

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
