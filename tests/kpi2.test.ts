import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canWriteKpi2, cleanKpi2, mergeKpi2, parseKpi2, splitStatus, visibleKpi2 } from '../lib/kpi/kpi2';

void test('kpi2: làm sạch, lưu, đọc', () => {
  assert.deepEqual(cleanKpi2({ assigned: '120', closed: 50.4, orders: -3, upsellRate: 150, products: { gentadox: 40, la: 9, oxy: 0 } }),
    { assigned: 120, closed: 50, upsellRate: 100, products: { gentadox: 40 } });
  assert.equal(cleanKpi2({ orders: 0 }), null);
  assert.equal(cleanKpi2([1]), null);
  const stored = parseKpi2(JSON.stringify({ 'team:t1': { assigned: 300 }, 'employee:e1': { closed: 20 }, 'lạ:x': { closed: 1 } }));
  assert.deepEqual(Object.keys(stored), ['team:t1', 'employee:e1']);
  assert.deepEqual(parseKpi2('hỏng'), {});
  // Chỉ thay khoá gửi lên; rỗng thì xoá.
  const next = mergeKpi2(stored, [{ key: 'employee:e2', value: { closed: 15 } }, { key: 'employee:e1', value: {} }, { key: 'xấu', value: { closed: 1 } }]);
  assert.deepEqual(next, { 'team:t1': { assigned: 300 }, 'employee:e2': { closed: 15 } });
});

void test('kpi2: quyền xem và ghi (Leader không sửa team, không sửa người ngoài team mình)', () => {
  const map = { 'team:t1': { assigned: 300 }, 'team:t2': { assigned: 200 }, 'employee:e1': { closed: 20 }, 'employee:e9': { closed: 9 } };
  assert.deepEqual(visibleKpi2(map, null, null), map);
  assert.deepEqual(Object.keys(visibleKpi2(map, ['t1'], ['e1'])), ['team:t1', 'employee:e1']);
  assert.deepEqual(visibleKpi2(map, [], []), {});
  assert.equal(canWriteKpi2(true, null, 'team:t1'), true);
  assert.equal(canWriteKpi2(false, ['e1'], 'team:t1'), false);
  assert.equal(canWriteKpi2(false, ['e1'], 'employee:e1'), true);
  assert.equal(canWriteKpi2(false, ['e1'], 'employee:e9'), false);
  assert.equal(canWriteKpi2(false, null, 'employee:e1'), false);
});

void test('kpi2: đã chia / tổng, báo chia vượt', () => {
  const lines = splitStatus({ assigned: 100, products: { gentadox: 10 } }, [{ assigned: 60, products: { gentadox: 6 } }, { assigned: 50, closed: 5 }, undefined]);
  assert.deepEqual(lines, [
    { field: 'assigned', team: 100, split: 110, over: true },
    { field: 'closed', team: null, split: 5, over: false },
    { field: 'products.gentadox', team: 10, split: 6, over: false },
  ]);
});
