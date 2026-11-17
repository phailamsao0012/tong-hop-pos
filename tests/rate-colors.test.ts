import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelRateClass, closeRateClass, ratePct, returnRateClass } from '../lib/shared/close-rate';

// Anh Vũ 12/11/2026: tỉ lệ chốt < 40% đỏ; Sale hoàn ≥ 7% đỏ, hủy ≥ 5% đỏ, ở mọi nơi.
void test('tỉ lệ chốt: dưới 40% đỏ, đúng 40% không đỏ, không có số không tô', () => {
  assert.deepEqual([39.99, 40, 75, null, undefined, Number.NaN].map(closeRateClass), ['text-bad', '', '', '', '', '']);
});

void test('tỉ lệ hoàn ≥ 7% đỏ, tỉ lệ hủy ≥ 5% đỏ', () => {
  assert.deepEqual([6.99, 7, 12, null].map(returnRateClass), ['', 'text-bad', 'text-bad', '']);
  assert.deepEqual([4.99, 5, 9, null].map(cancelRateClass), ['', 'text-bad', 'text-bad', '']);
});

void test('ratePct: mẫu số 0 → null', () => {
  assert.equal(ratePct(3, 0), null);
  assert.equal(ratePct(1, 4), 25);
});
