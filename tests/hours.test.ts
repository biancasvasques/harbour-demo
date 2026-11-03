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
