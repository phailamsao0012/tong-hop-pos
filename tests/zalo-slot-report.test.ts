import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBossSlotReport, bossSlotText } from '../lib/zalo/slot-report';
import { buildMorningReport, morningText } from '../lib/zalo/morning-report';

void test('ảnh gộp cho sếp: xếp team theo doanh số khung', () => {
  const r = buildBossSlotReport('khung 8h–12h', '12', '2026-11-03', [
    { team: 'X', total: 1, cumulative: 1 },
    { team: 'Y', total: 5, cumulative: 9 },
  ]);
  assert.deepEqual(
    r.teams.map((t) => t.team),
    ['Y', 'X'],
  );
  assert.equal(
    bossSlotText(r),
    'Doanh số các team\nY · khung 8h–12h: 5 · Luỹ kế: 9\nX · khung 8h–12h: 1 · Luỹ kế: 1',
  );
});

void test('báo cáo ca dùng kiểu ảnh 8h: so cùng giờ, ngày chưa có số thì không so', () => {
  const base = {
    team: 'Team ảo',
    dept: 'sale' as const,
    today: '2026-11-04',
    slotHour: '12',
    monthNet: 0,
    goal: null,
    workingDays: null,
    overdue: [],
    dueToday: [],
  };
  const today = {
    day: '2026-11-03',
    net: 20_000_000,
    orders: 10,
    created: 20,
    createdClosed: 9,
  };
  const people = [
    { name: 'A', net: 20_000_000, orders: 10 },
    { name: 'B', net: 0, orders: 0 },
  ];
  const fresh = buildMorningReport({ ...base, days: [today], people });
  assert.equal(fresh.title, 'Báo cáo 12h thứ Ba 03/11 · số từ 0h tới 12h');
  assert.equal(fresh.headline, 'Doanh số tới 12h');
  assert.equal(fresh.vsPrev, null);
  assert.equal(fresh.vsLastWeek, null);
  assert.equal(fresh.chart, false);
  assert.equal(fresh.tiles[0].delta, null);
  assert.match(
    morningText(fresh),
    /Doanh số tới 12h: 20 tr \(chưa có số so cùng giờ hôm qua · chưa có số so cùng giờ thứ Ba tuần trước\)/,
  );
  const withYesterday = buildMorningReport({
    ...base,
    days: [
      {
        day: '2026-11-02',
        net: 10_000_000,
        orders: 5,
        created: 10,
        createdClosed: 5,
      },
      today,
    ],
    people,
  });
  assert.equal(withYesterday.vsPrev, 100);
  assert.equal(withYesterday.tiles[0].delta, 5);
  assert.deepEqual(withYesterday.coach, ['B']);
});
