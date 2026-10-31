import test from 'node:test';
import assert from 'node:assert/strict';
import { kpiPace, signedShort } from '../lib/kpi-pace';

// Số ảo theo ví dụ của anh: 300tr / 30 ngày = 10tr một ngày.
test('daily target and differences', () => {
  const p = kpiPace({ goal: 300e6, workingDays: null, daysInMonth: 30, daysElapsed: 5, monthNet: 47e6, todayNet: 8e6 })!;
  assert.equal(p.daily, 10e6);
  assert.equal(p.todayDiff, -2e6);
  assert.equal(p.paceTarget, 50e6);
  assert.equal(p.paceDiff, -3e6);
  const w = kpiPace({ goal: 260e6, workingDays: 26, daysInMonth: 31, daysElapsed: 31, monthNet: 263e6, todayNet: 13e6 })!;
  assert.equal(w.paceTarget, 260e6);
  assert.equal(w.todayDiff, 3e6);
  assert.equal(kpiPace({ goal: 0, workingDays: null, daysInMonth: 30, daysElapsed: 1, monthNet: 0, todayNet: 0 }), null);
});

test('signed short label', () => {
  const s = (n: number) => `${n / 1e6}tr`;
  assert.equal(signedShort(3e6, s), '+3tr');
  assert.equal(signedShort(-2e6, s), '−2tr');
  assert.equal(signedShort(0.2, s), '0');
});
