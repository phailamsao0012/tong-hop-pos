import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPivot, pivotBucket } from '../lib/pivot';

const entries = [
  { row: 'a', rowLabel: 'NV A', col: '1', colLabel: 'POS A', data: 10 },
  { row: 'a', rowLabel: 'NV A', col: '2', colLabel: 'POS B', data: 20 },
  { row: 'b', rowLabel: 'NV B', col: '1', colLabel: 'POS A', data: 5 },
];
void test('pivot: tổng hàng, cột, toàn bảng và ô trống', () => {
  const p = buildPivot(entries, (xs) => xs.reduce((a, b) => a + b, 0));
  assert.deepEqual(p.rows.map((r) => r.values), [[10, 20], [5, null]]);
  assert.deepEqual(p.rows.map((r) => r.total), [30, 5]);
  assert.deepEqual(p.totals, [15, 20]);
  assert.equal(p.total, 35);
});
void test('pivot: gộp ô trùng, giữ 0 và không nhầm nhãn trùng với id', () => {
  const p = buildPivot([...entries, { ...entries[0], data: -10 }, { ...entries[2], row: 'c', data: 0 }], (xs) => xs.reduce((a, b) => a + b, 0));
  assert.deepEqual(p.rows.map((r) => r.values), [[0, 20], [5, null], [0, null]]);
});
void test('pivot: tỷ lệ tổng tính lại từ số gốc thay vì cộng tỷ lệ', () => {
  const p = buildPivot([{ ...entries[0], data: { n: 1, d: 2 } }, { ...entries[1], data: { n: 1, d: 10 } }], (xs) => xs.reduce((n, x) => n + x.n, 0) / xs.reduce((n, x) => n + x.d, 0) * 100);
  assert.equal(p.total, 2 / 12 * 100);
  assert.deepEqual(p.rows[0].values, [50, 10]);
});
void test('pivot: dữ liệu rỗng và chỉ số bị che giữ null', () => {
  assert.deepEqual(buildPivot<number>([], () => 0), { columns: [], rows: [], totals: [], total: null });
  assert.equal(buildPivot(entries, () => null).total, null);
});
void test('pivot: ngày, tháng và tuần thứ hai qua ranh giới tháng/năm', () => {
  assert.equal(pivotBucket('2026-10-15', 'day'), '2026-10-15');
  assert.equal(pivotBucket('2026-10-15', 'month'), '2026-10');
  assert.equal(pivotBucket('2026-10-04', 'week'), '2026-09-28');
  assert.equal(pivotBucket('2026-01-01', 'week'), '2025-12-29');
});
