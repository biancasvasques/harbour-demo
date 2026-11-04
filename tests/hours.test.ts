import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpen, type BusinessHours } from '../lib/hours.ts';

const H: BusinessHours = { '1': ['09:00', '17:30'], '2': ['09:00', '17:30'], '3': ['09:00', '17:30'], '4': ['09:00', '17:30'], '5': ['09:00', '17:00'] };
const tz = 'Australia/Sydney'; // UTC+11 in November (daylight saving)

test('open on a weekday morning in Sydney', () => {
  assert.equal(isOpen(new Date('2026-11-03T00:00:00Z'), tz, H), true); // Tue 11:00
});
test('closed at 17:30 sharp and after', () => {
  assert.equal(isOpen(new Date('2026-11-03T06:30:00Z'), tz, H), false); // Tue 17:30
});
test('Friday closes at 17:00', () => {
  assert.equal(isOpen(new Date('2026-11-06T06:15:00Z'), tz, H), false); // Fri 17:15
});
test('closed on the weekend', () => {
  assert.equal(isOpen(new Date('2026-11-07T00:00:00Z'), tz, H), false); // Sat 11:00
});
test('uses the business time zone, not the server clock', () => {
  // 22:00 UTC Monday is 09:00 Tuesday in Sydney
  assert.equal(isOpen(new Date('2026-11-02T22:00:00Z'), tz, H), true);
});

import { zonedTimeToUtc, nextSlots } from '../lib/hours.ts';

test('Sydney local time converts to the right UTC instant (daylight saving)', () => {
  assert.equal(zonedTimeToUtc('2026-11-06', '14:00', tz).toISOString(), '2026-11-06T03:00:00.000Z'); // UTC+11
  assert.equal(zonedTimeToUtc('2026-07-06', '14:00', tz).toISOString(), '2026-07-06T04:00:00.000Z'); // UTC+10
});

test('slots: next 3 business days, skipping the weekend, inside opening hours', () => {
  // Thursday 5 Nov 2026, 15:00 in Sydney
  const slots = nextSlots(new Date('2026-11-05T04:00:00Z'), tz, H);
  const days = [...new Set(slots.map((s) => s.day))];
  assert.equal(days.length, 3);
  assert.match(days[0], /Fri/);
  assert.match(days[1], /Mon/); // Sat and Sun skipped
  assert.match(days[2], /Tue/);
  assert.ok(slots.every((s) => new Date(s.start) > new Date('2026-11-05T04:00:00Z')));
  assert.equal(slots.filter((s) => /Fri/.test(s.day)).length, 4); // Friday closes 17:00, 16:00 still fits
});
