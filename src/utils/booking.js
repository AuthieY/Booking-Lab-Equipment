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

export const getPrimarySlot = (slots = [], currentUserName) => (
  sortSlotsForDisplay(slots, currentUserName)[0] || null
);

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
