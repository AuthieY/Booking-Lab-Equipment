const ERROR_BUFFER_KEY = 'booking_client_errors';
const MAX_ERROR_BUFFER = 25;

const makeId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

const toMessage = (value) => {
  if (value instanceof Error) return value.message || 'Unknown error';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Store client-side error records in localStorage and log a structured payload.
 * This keeps diagnostics lightweight without changing runtime features.
 */
export const reportClientError = (payload = {}) => {
  const entry = {
    id: makeId(),
    ts: new Date().toISOString(),
    source: payload.source || 'unknown',
    message: toMessage(payload.message || payload.error || 'Unknown error'),
    stack: payload.stack || '',
    extra: payload.extra || null
  };

  console.error('[client-error]', entry);

  try {
    const raw = localStorage.getItem(ERROR_BUFFER_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(existing) ? existing : [];
    next.push(entry);
    if (next.length > MAX_ERROR_BUFFER) next.splice(0, next.length - MAX_ERROR_BUFFER);
    localStorage.setItem(ERROR_BUFFER_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures in private/restricted environments.
  }

  return entry.id;
};
