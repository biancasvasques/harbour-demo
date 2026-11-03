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
