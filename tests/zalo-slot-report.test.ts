import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBossSlotReport,
  buildSlotReport,
  slotText,
} from '../lib/zalo/slot-report';

void test('báo cáo ca: xếp người theo doanh số, tách người chưa có đơn, chữ kèm ảnh đủ dòng', () => {
  const r = buildSlotReport({
    team: 'Team ảo',
    slot: 'khung 8h–12h',
    hour: '12',
    day: '2026-11-03',
    total: 300,
    cumulative: 900,
    orders: 3,
    people: [
      { name: 'B', total: 100, orders: 1 },
      { name: 'A', total: 200, orders: 2 },
      { name: 'C', total: 0, orders: 0 },
    ],
  });
  assert.deepEqual(
    r.people.map((p) => p.name),
    ['A', 'B'],
  );
  assert.deepEqual(r.noOrders, ['C']);
  assert.equal(
    slotText(r),
    'Doanh số team Team ảo khung 8h–12h\nDoanh số khung: 300 · Luỹ kế hôm nay: 900\nĐơn chốt: 3\nCao nhất: A: 200, B: 100\nChưa có đơn trong khung: C',
  );
  assert.deepEqual(
    buildBossSlotReport('khung 8h–12h', '12', '2026-11-03', [
      { team: 'X', total: 1, cumulative: 1 },
      { team: 'Y', total: 5, cumulative: 9 },
    ]).teams.map((t) => t.team),
    ['Y', 'X'],
  );
});
