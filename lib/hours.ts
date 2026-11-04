// Office hours are decided by code, never by the model: the model is not told
// to add the notice, the app adds it.

export type BusinessHours = Record<string, [string, string]>; // ISO weekday "1".."7" -> ["09:00","17:30"]

const WEEKDAY: Record<string, string> = { Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6', Sun: '7' };

export function isOpen(now: Date, timeZone: string, hours: BusinessHours): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = WEEKDAY[get('weekday')];
  const slot = day ? hours[day] : undefined;
  if (!slot) return false;
  const hhmm = `${get('hour')}:${get('minute')}`;
  return hhmm >= slot[0] && hhmm < slot[1];
}

// ---------------------------------------------------------------------------
// Consultation slots. Computed by code from the business hours, in the
// business time zone, so the model can never offer a time that does not exist.
// ---------------------------------------------------------------------------

const SLOT_TIMES = ['10:00', '11:30', '14:00', '16:00'];

function partsIn(timeZone: string, d: Date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { y: +g('year'), m: +g('month'), d: +g('day'), h: +g('hour'), min: +g('minute'), s: +g('second'), wd: WEEKDAY[g('weekday')] };
}

// "2026-11-06" + "14:00" in Australia/Sydney -> the exact UTC instant (handles daylight saving)
export function zonedTimeToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, min);
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(timeZone, new Date(guess));
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess += asUtc - shown;
  }
  return new Date(guess);
}

export type Slot = { start: string; label: string; day: string };

// The next `days` business days after today (in the business time zone), with
// the fixed slot times that fall inside opening hours.
export function nextSlots(now: Date, timeZone: string, hours: BusinessHours, days = 3): Slot[] {
  const today = partsIn(timeZone, now);
  const out: Slot[] = [];
  let found = 0;
  for (let i = 1; i <= 14 && found < days; i++) {
    const noon = new Date(Date.UTC(today.y, today.m - 1, today.d + i, 12));
    const ymd = noon.toISOString().slice(0, 10);
    const local = partsIn(timeZone, zonedTimeToUtc(ymd, '12:00', timeZone));
    const open = hours[local.wd];
    if (!open) continue;
    const times = SLOT_TIMES.filter((t) => t >= open[0] && t < open[1]);
    if (!times.length) continue;
    found++;
    const day = new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'short', day: 'numeric', month: 'short' })
      .format(zonedTimeToUtc(ymd, '12:00', timeZone));
    for (const t of times) {
      const start = zonedTimeToUtc(ymd, t, timeZone);
      const label = new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit' }).format(start);
      out.push({ start: start.toISOString(), label, day });
    }
  }
  return out;
}
