import React, { useState, useEffect } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { getStoredTheme, applyTheme, nextThemeMode } from '../../utils/theme';

const ICONS = {
  system: Monitor,
  dark: Moon,
  light: Sun
};

// 'paper' sits on the ds surface (member toolbar, gate screen); 'ink' sits on
// the theme-invariant ink admin header, so it borrows that header's white text.
const VARIANT_CLASS = {
  paper: 'ds-icon-btn-glass',
  ink: 'inline-flex items-center justify-center w-8 h-8 rounded-[var(--ds-radius-sm)] bg-transparent text-white/70 hover:text-white ds-transition'
};

const ThemeToggle = ({ variant = 'paper' }) => {
  const [mode, setMode] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const next = nextThemeMode(mode);
  const label = `Theme: ${mode}. Switch to ${next}`;
  const Icon = ICONS[mode] || Monitor;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setMode((current) => nextThemeMode(current))}
      className={VARIANT_CLASS[variant] || VARIANT_CLASS.paper}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
};

export default ThemeToggle;
