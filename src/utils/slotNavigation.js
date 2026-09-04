// Pure keyboard-cursor math for the timetable grids. Rows are hours (0-23),
// columns are instruments (overview), a single day, or weekdays (week view).
// No wrapping: moving past an edge stays on that edge.

const SLOT_NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End'
]);

const toIndex = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * True for keys the slot cursor consumes (arrows, Home, End).
 */
export const isSlotNavigationKey = (key) => SLOT_NAVIGATION_KEYS.has(key);

/**
 * Resolve the next { row, col } for a navigation key press.
 * Returns null for any key that is not a navigation key, or when the grid
 * has no rows/columns to move within.
 */
export const getArrowTarget = ({ key, row, col, rowCount, colCount }) => {
  if (!isSlotNavigationKey(key)) return null;

  const rows = toIndex(rowCount);
  const cols = toIndex(colCount);
  if (rows < 1 || cols < 1) return null;

  const maxRow = rows - 1;
  const maxCol = cols - 1;
  const currentRow = clamp(toIndex(row), 0, maxRow);
  const currentCol = clamp(toIndex(col), 0, maxCol);

  switch (key) {
    case 'ArrowUp':
      return { row: Math.max(0, currentRow - 1), col: currentCol };
    case 'ArrowDown':
      return { row: Math.min(maxRow, currentRow + 1), col: currentCol };
    case 'ArrowLeft':
      return { row: currentRow, col: Math.max(0, currentCol - 1) };
    case 'ArrowRight':
      return { row: currentRow, col: Math.min(maxCol, currentCol + 1) };
    case 'Home':
      return { row: 0, col: currentCol };
    case 'End':
      return { row: maxRow, col: currentCol };
    default:
      return null;
  }
};
