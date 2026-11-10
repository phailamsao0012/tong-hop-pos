import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metrics, trendTile } from '../lib/reports/mkt-trend-rows';

const row = (key: string, phones: number, partial = false) => ({ key, partial, ...metrics({ cost: 100, phones, newOrders: 1, newNet: 50, coveredNet: 50, coveredPhones: phones }) });

void test('ô xu hướng: so đoạn đủ cuối với đoạn đủ trước, bỏ đoạn đang chạy', () => {
  const t = trendTile([row('2026-11-01', 10), row('2026-11-02', 12), row('2026-11-03', 3, true)], 'phones');
  assert.deepEqual(t.spark, [10, 12]);
  assert.equal(t.last, 12);
  assert.equal(t.prev, 10);
  assert.equal(t.lastKey, '2026-11-02');
  assert.ok(Math.abs((t.change ?? 0) - 20) < 1e-9);
});

void test('ô xu hướng: chỉ giữ 14 đoạn, thiếu đoạn trước thì không có % đổi', () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(`d${i}`, i + 1));
  assert.equal(trendTile(rows, 'phones').spark.length, 14);
  const one = trendTile([row('a', 5)], 'phones');
  assert.equal(one.change, null);
  assert.equal(one.prev, null);
});
