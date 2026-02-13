import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBookingSlots,
  summarizeBlockingBookings,
  isValidBookingSlotRecord,
  buildCancellationDeltasBySlot
} from '../src/utils/booking.js';

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

test('buildCancellationDeltasBySlot aggregates multiple bookings in same slot', () => {
  const { deltas, malformedCount } = buildCancellationDeltasBySlot([
    { instrumentId: 'inst-a', date: '2026-02-11', hour: 10, requestedQuantity: 2 },
    { instrumentId: 'inst-a', date: '2026-02-11', hour: 10, requestedQuantity: 3 },
    { instrumentId: 'inst-a', date: '2026-02-11', hour: 11, requestedQuantity: 1 }
  ]);
  assert.equal(malformedCount, 0);
  assert.equal(deltas.size, 2);

  const slot10 = deltas.get('inst-a|2026-02-11|10');
  assert.equal(slot10.usedDelta, 5);
  assert.equal(slot10.bookingDelta, 2);

  const slot11 = deltas.get('inst-a|2026-02-11|11');
  assert.equal(slot11.usedDelta, 1);
  assert.equal(slot11.bookingDelta, 1);
});

test('buildCancellationDeltasBySlot skips malformed records but keeps valid deltas', () => {
  const { deltas, malformedCount } = buildCancellationDeltasBySlot([
    { instrumentId: 'inst-a', date: '2026-02-11', hour: 10, requestedQuantity: 2 },
    { instrumentId: '', date: '2026-02-11', hour: 10, requestedQuantity: 2 },
    { instrumentId: 'inst-a', date: 'invalid-date', hour: 10, requestedQuantity: 2 },
    { instrumentId: 'inst-a', date: '2026-02-11', hour: 40, requestedQuantity: 2 }
  ]);
  assert.equal(malformedCount, 3);
  assert.equal(deltas.size, 1);
  assert.equal(deltas.get('inst-a|2026-02-11|10').usedDelta, 2);
});

test('isValidBookingSlotRecord validates instrument/date/hour basics', () => {
  assert.equal(isValidBookingSlotRecord({ instrumentId: 'inst-a', date: '2026-02-11', hour: 0 }), true);
  assert.equal(isValidBookingSlotRecord({ instrumentId: 'inst-a', date: '2026-02-11', hour: 23 }), true);
  assert.equal(isValidBookingSlotRecord({ instrumentId: '', date: '2026-02-11', hour: 10 }), false);
  assert.equal(isValidBookingSlotRecord({ instrumentId: 'inst-a', date: '2026/02/11', hour: 10 }), false);
  assert.equal(isValidBookingSlotRecord({ instrumentId: 'inst-a', date: '2026-02-11', hour: 10.5 }), false);
});
