import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalDate, parseLocalDate, addDaysLocal, getMondayLocal } from '../src/utils/date.js';

test('formatLocalDate keeps local calendar date', () => {
  const value = new Date(2026, 1, 9, 23, 45, 0);
  assert.equal(formatLocalDate(value), '2026-02-09');
});

test('parseLocalDate parses yyyy-mm-dd as local date', () => {
  const date = parseLocalDate('2026-02-09');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 1);
  assert.equal(date.getDate(), 9);
});

test('addDaysLocal shifts by calendar day', () => {
  const shifted = addDaysLocal('2026-02-09', 7);
  assert.equal(formatLocalDate(shifted), '2026-02-16');
});

test('getMondayLocal returns monday of current week', () => {
  const monday = getMondayLocal('2026-02-12');
  assert.equal(formatLocalDate(monday), '2026-02-09');
});
