const PERF_FLAG_KEY = 'booking_perf_debug';
const PERF_LOG_BUFFER_KEY = 'booking_perf_events';
const PERF_LOG_BUFFER_MAX = 80;

const nowMs = () => (globalThis.performance?.now?.() || Date.now());

export const isPerfEnabled = () => {
  if (!import.meta.env.DEV) return false;
  try {
    return globalThis.localStorage?.getItem(PERF_FLAG_KEY) === '1';
  } catch {
    return false;
  }
};

const persistPerfEvent = (event) => {
  try {
    const raw = localStorage.getItem(PERF_LOG_BUFFER_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(existing) ? existing : [];
    next.push(event);
    if (next.length > PERF_LOG_BUFFER_MAX) next.splice(0, next.length - PERF_LOG_BUFFER_MAX);
    localStorage.setItem(PERF_LOG_BUFFER_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures in restricted/private mode.
  }
};

const logPerfEvent = (name, durationMs, meta = null) => {
  if (!isPerfEnabled()) return;
  const event = {
    name,
    durationMs: Number(durationMs.toFixed(2)),
    ts: new Date().toISOString(),
    meta
  };
  console.debug('[perf]', event);
  persistPerfEvent(event);
};

export const measurePerf = (name, operation, meta = null) => {
  if (!isPerfEnabled()) return operation();
  const start = nowMs();
  try {
    return operation();
  } finally {
    logPerfEvent(name, nowMs() - start, meta);
  }
};

export const measurePerfAsync = async (name, operation, meta = null) => {
  if (!isPerfEnabled()) return operation();
  const start = nowMs();
  try {
    return await operation();
  } finally {
    logPerfEvent(name, nowMs() - start, meta);
  }
};
