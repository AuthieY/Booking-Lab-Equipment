import test from 'node:test';
import assert from 'node:assert/strict';
import { getArrowTarget, isSlotNavigationKey } from '../src/utils/slotNavigation.js';

const GRID = { rowCount: 24, colCount: 7 };

test('isSlotNavigationKey recognises arrows, Home and End only', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.equal(isSlotNavigationKey(key), true, key);
  }
  for (const key of ['Enter', ' ', 'Escape', 'Tab', 'PageUp', 'a', '', undefined, null]) {
    assert.equal(isSlotNavigationKey(key), false, String(key));
  }
});

test('getArrowTarget moves one step in each direction inside the grid', () => {
  const origin = { row: 10, col: 3, ...GRID };
  assert.deepEqual(getArrowTarget({ key: 'ArrowUp', ...origin }), { row: 9, col: 3 });
  assert.deepEqual(getArrowTarget({ key: 'ArrowDown', ...origin }), { row: 11, col: 3 });
  assert.deepEqual(getArrowTarget({ key: 'ArrowLeft', ...origin }), { row: 10, col: 2 });
  assert.deepEqual(getArrowTarget({ key: 'ArrowRight', ...origin }), { row: 10, col: 4 });
});

test('getArrowTarget clamps at the top edge without wrapping', () => {
  assert.deepEqual(getArrowTarget({ key: 'ArrowUp', row: 0, col: 2, ...GRID }), { row: 0, col: 2 });
});

test('getArrowTarget clamps at the bottom edge without wrapping', () => {
  assert.deepEqual(getArrowTarget({ key: 'ArrowDown', row: 23, col: 2, ...GRID }), { row: 23, col: 2 });
});

test('getArrowTarget clamps at the left edge without wrapping', () => {
  assert.deepEqual(getArrowTarget({ key: 'ArrowLeft', row: 5, col: 0, ...GRID }), { row: 5, col: 0 });
});

test('getArrowTarget clamps at the right edge without wrapping', () => {
  assert.deepEqual(getArrowTarget({ key: 'ArrowRight', row: 5, col: 6, ...GRID }), { row: 5, col: 6 });
});

test('getArrowTarget clamps at every corner', () => {
  const corners = [
    { row: 0, col: 0 },
    { row: 0, col: 6 },
    { row: 23, col: 0 },
    { row: 23, col: 6 }
  ];
  for (const corner of corners) {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const target = getArrowTarget({ key, ...corner, ...GRID });
      assert.ok(target.row >= 0 && target.row <= 23, `${key} row in range from ${JSON.stringify(corner)}`);
      assert.ok(target.col >= 0 && target.col <= 6, `${key} col in range from ${JSON.stringify(corner)}`);
    }
  }
});

test('getArrowTarget keeps a single-column grid on column 0 for horizontal keys', () => {
  const singleColumn = { row: 8, col: 0, rowCount: 24, colCount: 1 };
  assert.deepEqual(getArrowTarget({ key: 'ArrowLeft', ...singleColumn }), { row: 8, col: 0 });
  assert.deepEqual(getArrowTarget({ key: 'ArrowRight', ...singleColumn }), { row: 8, col: 0 });
  assert.deepEqual(getArrowTarget({ key: 'ArrowDown', ...singleColumn }), { row: 9, col: 0 });
});

test('getArrowTarget Home jumps to the first hour in the same column', () => {
  assert.deepEqual(getArrowTarget({ key: 'Home', row: 17, col: 4, ...GRID }), { row: 0, col: 4 });
  assert.deepEqual(getArrowTarget({ key: 'Home', row: 0, col: 4, ...GRID }), { row: 0, col: 4 });
});

test('getArrowTarget End jumps to the last hour in the same column', () => {
  assert.deepEqual(getArrowTarget({ key: 'End', row: 3, col: 1, ...GRID }), { row: 23, col: 1 });
  assert.deepEqual(getArrowTarget({ key: 'End', row: 23, col: 1, ...GRID }), { row: 23, col: 1 });
});

test('getArrowTarget returns null for non-navigation keys', () => {
  for (const key of ['Enter', ' ', 'Escape', 'Tab', 'PageDown', 'x', undefined]) {
    assert.equal(getArrowTarget({ key, row: 4, col: 2, ...GRID }), null, String(key));
  }
});

test('getArrowTarget returns null for an empty grid', () => {
  assert.equal(getArrowTarget({ key: 'ArrowDown', row: 0, col: 0, rowCount: 0, colCount: 7 }), null);
  assert.equal(getArrowTarget({ key: 'ArrowDown', row: 0, col: 0, rowCount: 24, colCount: 0 }), null);
});

test('getArrowTarget tolerates string data-attribute values', () => {
  assert.deepEqual(
    getArrowTarget({ key: 'ArrowDown', row: '6', col: '2', rowCount: '24', colCount: '7' }),
    { row: 7, col: 2 }
  );
});

test('getArrowTarget normalises an out-of-range origin back into the grid', () => {
  assert.deepEqual(getArrowTarget({ key: 'ArrowRight', row: 40, col: 9, ...GRID }), { row: 23, col: 6 });
  assert.deepEqual(getArrowTarget({ key: 'ArrowUp', row: -3, col: -1, ...GRID }), { row: 0, col: 0 });
});
