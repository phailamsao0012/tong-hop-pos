import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeRateBase, closeRateOf, closeRateTop } from '../lib/metrics';

// 08/10/2026: lọc nhóm Gentadox ra "41 chốt ÷ 39 đơn lên = 100%" vì đơn mới lên chưa có sản phẩm nên không nằm trong nhóm.
test('lọc nhóm đơn: tỷ lệ chốt chia cho mọi đơn lên cùng phạm vi', () => {
  const gentadox = { orders: 39, closedOrders: 41, createdClosedOrders: 39, rateOrders: 120 };
  assert.equal(closeRateBase(gentadox, 'created'), 120);
  assert.equal(closeRateTop(gentadox, 'created'), 39);
  assert.equal(closeRateOf(gentadox, 'created'), 39 / 120 * 100);
});

test('không lọc nhóm: giữ công thức cũ, không vượt 100%', () => {
  const all = { orders: 120, closedOrders: 70, createdClosedOrders: 60 };
  assert.equal(closeRateOf(all, 'created'), 50);
  assert.equal(closeRateOf({ orders: 10, closedOrders: 30 }, 'created'), 100);
  assert.equal(closeRateOf({ orders: 10, closedOrders: 3, assignedOrders: 20, assignedClosedOrders: 5, rateAssigned: 50 }, 'assigned'), 10);
  assert.equal(closeRateOf({ orders: 10, closedOrders: 3, assignedOrders: 20, assignedHidden: true }, 'assigned'), null);
});
