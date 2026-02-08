import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookingSlots, summarizeBlockingBookings } from '../src/utils/booking.js';

test('buildBookingSlots creates working-hours set', () => {
  const slots = buildBookingSlots({
    startDateStr: '2026-02-09',
    startHour: 10,
    repeatCount: 0,
    isFullDay: false,
    isOvernight: false,
    isWorkingHours: true
  });
  assert.equal(slots.length, 8);
  assert.equal(slots[0].hour, 9);
  assert.equal(slots[slots.length - 1].hour, 16);
});

test('buildBookingSlots creates overnight across midnight', () => {
  const slots = buildBookingSlots({
    startDateStr: '2026-02-09',
    startHour: 10,
    repeatCount: 0,
    isFullDay: false,
    isOvernight: true,
    isWorkingHours: false
  });
  assert.equal(slots.length, 16);
  assert.equal(slots[0].date, '2026-02-09');
  assert.equal(slots[0].hour, 17);
  assert.equal(slots[slots.length - 1].date, '2026-02-10');
  assert.equal(slots[slots.length - 1].hour, 8);
});

test('summarizeBlockingBookings returns readable conflict label', () => {
  const summary = summarizeBlockingBookings([
    { instrumentName: 'Mastersizer', userName: 'Yadong Li' },
    { instrumentName: 'Mastersizer', userName: 'Yadong Li' }
  ]);
  assert.equal(summary.labelPrefix, 'Conflict: Mastersizer booked by Yadong Li');
});
