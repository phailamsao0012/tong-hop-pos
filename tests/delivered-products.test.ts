import test from 'node:test';
import assert from 'node:assert/strict';
import { pivotDelivered, rangeDays } from '../lib/delivered-products';

void test('delivered-products: cột sản phẩm nhiều đơn nhất, còn lại vào Khác, ngày mới nhất lên đầu', () => {
  const rows = [
    { day: '2026-10-30', name: 'A', orders: 5, qty: 6, revenue: 500 },
    { day: '2026-10-31', name: 'A', orders: 3, qty: 3, revenue: 300 },
    { day: '2026-10-31', name: 'B', orders: 4, qty: 4, revenue: 400 },
    { day: '2026-10-31', name: 'C', orders: 1, qty: 1, revenue: 100 },
  ];
  const totals = [{ day: '2026-10-30', orders: 5, net: 450 }, { day: '2026-10-31', orders: 7, net: 700 }];
  const r = pivotDelivered(rows, totals, rangeDays('2026-10-29', '2026-10-31'), 2);
  assert.deepEqual(r.top, ['A', 'B']);
  assert.deepEqual(r.days.map((d) => d.day), ['2026-10-31', '2026-10-30', '2026-10-29']);
  assert.deepEqual(r.days[0], { day: '2026-10-31', cells: { A: 3, B: 4 }, other: 1, orders: 7, net: 700 });
  assert.deepEqual(r.days[2], { day: '2026-10-29', cells: { A: 0, B: 0 }, other: 0, orders: 0, net: 0 });
  assert.deepEqual(r.total, { orders: 12, net: 1150 });
  assert.equal(r.products[0].orders, 8);
});
