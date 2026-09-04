// src/utils/theme.js
// Manual light / dark / system theme. The tokens in index.css already re-map
// under prefers-color-scheme; an explicit data-theme attribute on <html>
// overrides that in either direction. 'system' means "no attribute, no key".
// index.html reads the same storage key inline before first paint.

export const THEME_STORAGE_KEY = 'booking_theme';
export const THEME_MODES = ['system', 'light', 'dark'];

const isExplicitMode = (mode) => mode === 'light' || mode === 'dark';

export const getStoredTheme = () => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isExplicitMode(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
};

export const applyTheme = (mode) => {
  const root = document.documentElement;
  if (isExplicitMode(mode)) {
    root.dataset.theme = mode;
  } else {
    delete root.dataset.theme;
  }
  try {
    if (isExplicitMode(mode)) {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } else {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode, blocked site data) — the attribute
    // still applies for this page load.
  }
};

// Cycle order: system → dark → light → system.
export const nextThemeMode = (mode) => {
  if (mode === 'system') return 'dark';
  if (mode === 'dark') return 'light';
  return 'system';
};
