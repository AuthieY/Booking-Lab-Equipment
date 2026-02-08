# Design System (v1)

This project now includes a small design system foundation in:
- `src/index.css` (`:root` tokens + `ds-*` component classes)
- `tailwind.config.js` (`font-sans` + `font-data`)

## 1. Design Tokens

Defined in `:root`:

- Brand
  - `--ds-brand-900`
  - `--ds-brand-700`
  - `--ds-brand-500`
  - `--ds-brand-300`
  - `--ds-brand-100`
- Surface
  - `--ds-bg`
  - `--ds-surface`
  - `--ds-surface-muted`
  - `--ds-border`
- Text
  - `--ds-text-strong`
  - `--ds-text`
  - `--ds-text-muted`
  - `--ds-text-soft`
- States
  - `--ds-success-bg`, `--ds-success-text`
  - `--ds-warning-bg`, `--ds-warning-text`
  - `--ds-danger-bg`, `--ds-danger-text`
- Shape
  - `--ds-radius-sm`, `--ds-radius-md`, `--ds-radius-lg`, `--ds-radius-xl`
- Elevation
  - `--ds-shadow-sm`, `--ds-shadow-md`
- Motion
  - `--ds-motion-fast`, `--ds-motion-base`

## 2. Typography Roles

- UI text: Tailwind `font-sans` (`Plus Jakarta Sans`)
- Data/time text: Tailwind `font-data` (`IBM Plex Sans`)

Use `font-data tabular-nums` for:
- dates
- times
- counters
- capacity values

## 3. Reusable `ds-*` Classes

From `src/index.css`:

- Layout
  - `ds-page`
- Surfaces
  - `ds-card`
  - `ds-card-muted`
- Buttons
  - `ds-btn`
  - `ds-btn-primary`
  - `ds-btn-secondary`
  - `ds-btn-warning`
- Tabs
  - `ds-tab`
  - `ds-tab-active`
  - `ds-tab-inactive`
- Inputs
  - `ds-input`
- Chips
  - `ds-chip`
  - `ds-chip-brand`
  - `ds-chip-warning`
  - `ds-chip-danger`
- Utilities
  - `ds-transition`
  - `no-scrollbar`

## 4. Usage Rule (Simple)

- Prefer `ds-*` classes for shared UI patterns.
- Use Tailwind utilities for local layout tweaks only.
- If a pattern repeats 3+ times, move it into a `ds-*` class.
