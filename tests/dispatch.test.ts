import test from 'node:test';
import assert from 'node:assert/strict';
import { canView, parseAccess, scopeApi } from '../lib/access';
import { customerLabel, pickCandidates, roundRobin, type Staff } from '../lib/dispatch-core';

const order = (id: number, at: string, extra: Record<string, unknown> = {}) => ({ id, inserted_at: at, status: 0, ...extra });

test('chỉ chia đơn Mới, chưa có người bán, tạo sau lúc bật, chưa xử lý; đơn cũ trước', () => {
  const orders = [
    order(1, '2026-10-03T02:05:00'),
    order(2, '2026-10-03T02:01:00'),
    order(3, '2026-10-03T01:59:00'), // trước lúc bật
    order(4, '2026-10-03T02:02:00', { assigning_seller: { id: 'x' } }),
    order(5, '2026-10-03T02:03:00', { status: 1 }),
    order(6, '2026-10-03T02:04:00'), // đã xử lý
  ];
  const picked = pickCandidates(orders, '2026-10-03T02:00:00.000Z', new Set(['6']));
  assert.deepEqual(picked.map((o) => o.id), [2, 1]);
});

test('chia vòng: người chưa nhận trước, rồi lần lượt', () => {
  const staff: Staff[] = [
    { id: 'a', name: 'A', lastAssignedAt: '2026-10-03T02:00:00.000Z' },
    { id: 'b', name: 'B', lastAssignedAt: '2026-10-03T01:00:00.000Z' },
    { id: 'c', name: 'C', lastAssignedAt: null },
  ];
  const plan = roundRobin([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], staff, new Date('2026-10-03T03:00:00Z'));
  assert.deepEqual(plan.map((p) => p.staff.id), ['c', 'b', 'a', 'c']);
  assert.deepEqual(roundRobin([{ id: 1 }], [], new Date()), []);
});

test('che SĐT khách', () => {
  assert.equal(customerLabel({ bill_full_name: 'Lan', bill_phone_number: '0912 345 678' }), 'Lan · ***678');
});

test('Chia số chỉ chủ hệ thống', () => {
  const director = parseAccess({ role: 'director', views_json: JSON.stringify(['dispatch']) });
  assert.equal(canView(director, 'dispatch'), false);
  assert.ok(scopeApi(director, 'GET', new URL('https://x/api/dispatch')).blocked);
  assert.equal(canView(parseAccess({ role: 'owner' }), 'dispatch'), true);
});
