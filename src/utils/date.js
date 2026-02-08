// Date helpers that preserve local calendar dates.

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * Format a Date in local timezone as YYYY-MM-DD.
 */
export const formatLocalDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

/**
 * Parse YYYY-MM-DD into a local Date (no UTC conversion).
 */
export const parseLocalDate = (dateStr) => {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

/**
 * Add calendar days and return a new Date.
 */
export const addDaysLocal = (value, days) => {
  const date = value instanceof Date ? new Date(value) : parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return date;
};

/**
 * Return Monday (local time) for the week containing `value`.
 */
export const getMondayLocal = (value) => {
  const date = value instanceof Date ? new Date(value) : parseLocalDate(value);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.getFullYear(), date.getMonth(), diff);
};
