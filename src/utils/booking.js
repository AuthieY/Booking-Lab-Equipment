import { addDaysLocal, formatLocalDate, parseLocalDate } from './date';

/**
 * Keep current user first, then alphabetic order.
 */
export const sortSlotsForDisplay = (slots = [], currentUserName) => (
  [...slots].sort((a, b) => {
    const am = a.userName === currentUserName ? 0 : 1;
    const bm = b.userName === currentUserName ? 0 : 1;
    if (am !== bm) return am - bm;
    return (a.userName || '').localeCompare(b.userName || '');
  })
);

export const getPrimarySlot = (slots = [], currentUserName) => {
  if (!slots.length) return null;
  let primary = slots[0];
  for (let index = 1; index < slots.length; index += 1) {
    const candidate = slots[index];
    const primaryMine = primary.userName === currentUserName ? 0 : 1;
    const candidateMine = candidate.userName === currentUserName ? 0 : 1;
    if (candidateMine < primaryMine) {
      primary = candidate;
      continue;
    }
    if (candidateMine === primaryMine) {
      const candidateName = candidate.userName || '';
      const primaryName = primary.userName || '';
      if (candidateName.localeCompare(primaryName) < 0) primary = candidate;
    }
  }
  return primary;
};

export const getOverflowCount = (slots = []) => Math.max(0, slots.length - 1);

/**
 * Expand booking mode + repeat into concrete date/hour slots.
 */
export const buildBookingSlots = ({
  startDateStr,
  startHour,
  repeatCount,
  isFullDay,
  isOvernight,
  isWorkingHours
}) => {
  const slots = [];
  const startDate = parseLocalDate(startDateStr);

  for (let i = 0; i <= repeatCount; i += 1) {
    const date = addDaysLocal(startDate, i * 7);
    const dateStr = formatLocalDate(date);

    if (isFullDay) {
      for (let h = 0; h < 24; h += 1) slots.push({ date: dateStr, hour: h });
      continue;
    }

    if (isWorkingHours) {
      for (let h = 9; h < 17; h += 1) slots.push({ date: dateStr, hour: h });
      continue;
    }

    if (isOvernight) {
      for (let h = 17; h <= 23; h += 1) slots.push({ date: dateStr, hour: h });
      const nextDay = formatLocalDate(addDaysLocal(date, 1));
      for (let h = 0; h <= 8; h += 1) slots.push({ date: nextDay, hour: h });
      continue;
    }

    slots.push({ date: dateStr, hour: startHour });
  }

  return slots;
};

export const summarizeBlockingBookings = (blockingBookings = []) => {
  const instrumentNames = [...new Set(blockingBookings.map((b) => b.instrumentName || 'Unknown instrument'))].sort();
  const userNames = [...new Set(blockingBookings.map((b) => b.userName || 'Unknown user'))].sort();
  const instrumentsText = instrumentNames.join(' & ');
  const usersText = userNames.join(' & ');

  return {
    instrumentsText,
    usersText,
    signature: `${instrumentsText}||${usersText}`,
    labelPrefix: `Conflict: ${instrumentsText} booked by ${usersText}`
  };
};

export const isValidBookingSlotRecord = (booking = {}) => {
  if (!booking || typeof booking !== 'object') return false;
  if (typeof booking.instrumentId !== 'string' || booking.instrumentId.trim() === '') return false;
  if (typeof booking.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(booking.date)) return false;
  return Number.isInteger(booking.hour) && booking.hour >= 0 && booking.hour <= 23;
};

export const buildCancellationDeltasBySlot = (bookings = []) => {
  const deltas = new Map();
  let malformedCount = 0;

  bookings.forEach((booking) => {
    if (!isValidBookingSlotRecord(booking)) {
      malformedCount += 1;
      return;
    }

    const key = `${booking.instrumentId}|${booking.date}|${booking.hour}`;
    const current = deltas.get(key) || {
      instrumentId: booking.instrumentId,
      date: booking.date,
      hour: booking.hour,
      usedDelta: 0,
      bookingDelta: 0
    };
    current.usedDelta += Math.max(1, Number(booking.requestedQuantity) || 1);
    current.bookingDelta += 1;
    deltas.set(key, current);
  });

  return { deltas, malformedCount };
};
