import test from 'node:test';
import assert from 'node:assert/strict';
import { buckets, cumulative, indexSeries, periodRows, summaries, type GrowthData } from '../lib/reports/growth-calc';
import { growthData, saveJoined } from '../lib/reports/growth';
import { canView, parseAccess, scopeApi } from '../lib/auth/access';
import { addDays, daysBetween } from '../lib/shared/report-time';
import { demoWorld } from './support/d1-sqlite';
import { countedFilter, teamFilter } from '../lib/teams/team';

// Ba người Sale ảo: A vào 12/08, B vào 20/08 (cùng đợt), C vào từ trước khoảng xem.
const start = '2026-08-01', today = '2026-10-28';
const series = (from: string, perDay: (i: number) => number) => {
  const s = { d: [] as number[], v: [] as number[], n: [] as number[] };
  for (let d = from, i = 0; d <= today; d = addDays(d, 1), i++) { s.d.push(daysBetween(start, d) - 1); s.v.push(perDay(i)); s.n.push(1); }
  return s;
};
const data: GrowthData = {
  dept: 'sale', start, end: today, today, unit: 'money',
  people: [
    { id: 'a', name: 'A', joined: '2026-08-12', source: 'nhan-su', left: null },
    { id: 'b', name: 'B', joined: '2026-08-20', source: 'pancake', left: null },
    { id: 'c', name: 'C', joined: '2025-01-05', source: 'nhan-su', left: null },
  ],
  series: { a: series('2026-08-12', (i) => 100 + i), b: series('2026-08-20', () => 50), c: series(start, () => 200) },
};
const idx = indexSeries(data);
const [a] = data.people;

test('gom theo tháng: tháng vào chỉ tính từ ngày vào, kỳ trước so trên tổng', () => {
  const rows = periodRows(a, data, idx, 'moy', 'prev', 'v', 'sum');
  assert.deepEqual(rows.map((r) => [r.label, r.days]), [['T8/2026', 20], ['T9/2026', 30], ['T10/2026', 28]]);
  assert.equal(rows[0].total, Array.from({ length: 20 }, (_, i) => 100 + i).reduce((x, y) => x + y, 0));
  assert.equal(rows[0].pct, null);
  assert.ok(rows[1].pct! > 0);
});

test('thứ trong tuần đủ 7 cột T2 → CN; "chính mình" là trung bình của người đó', () => {
  const rows = periodRows(a, data, idx, 'dow', 'prev', 'v', 'avg');
  assert.deepEqual(rows.map((r) => r.label), ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
  const avg = rows.reduce((s, r) => s + r.total, 0) / rows.reduce((s, r) => s + r.days, 0);
  for (const r of rows) assert.equal(Math.round(r.cmpPerDay!), Math.round(avg));
  assert.deepEqual(buckets('wom', '2026-10-01', '2026-10-31').map((b) => b.days.length), [7, 7, 7, 7, 3]);
});

test('cùng kỳ: người làm suốt các ngày đó; cùng thâm niên / cùng đợt: chỉ người vào trong khoảng xem', () => {
  // Tháng 9: B (50/ngày) và C (200/ngày) đều làm cả tháng → trung bình 125/ngày.
  const same = periodRows(a, data, idx, 'moy', 'same', 'v', 'avg').find((r) => r.key === '2026-09')!;
  assert.equal(same.cmpPerDay, 125); assert.equal(same.people, 2);
  // Cùng thâm niên: C vào trước khoảng xem nên không tính; B ở mốc 50/ngày.
  const fresh = periodRows(a, data, idx, 'moy', 'new', 'v', 'avg').find((r) => r.key === '2026-09')!;
  assert.equal(fresh.cmpPerDay, 50); assert.equal(fresh.people, 1);
  // Tháng 10 của A tương ứng ngày làm 51–78, B mới làm 70 ngày → chưa đủ, không ai để so.
  assert.equal(periodRows(a, data, idx, 'moy', 'batch', 'v', 'sum').find((r) => r.key === '2026-10')!.cmpTotal, null);
  const pick = periodRows(a, data, idx, 'moy', 'pick', 'v', 'avg', ['c']).find((r) => r.key === '2026-09')!;
  assert.equal(pick.cmpPerDay, 200);
});

test('cộng dồn theo ngày làm và bảng toàn bộ phận', () => {
  const cum = cumulative(a, data, idx, 'new', 'v');
  assert.equal(cum[0].mine, 100); assert.equal(cum[0].theirs, 50);
  assert.equal(cum[9].theirs, 500);
  assert.equal(cum.at(-1)!.theirs, null);
  assert.deepEqual(cumulative(data.people[2], data, idx, 'new', 'v'), []);
  const s = summaries(data, idx, 'v');
  assert.equal(s.find((r) => r.id === 'b')!.first30, 1500);
  assert.equal(s.find((r) => r.id === 'c')!.first30, null);
  assert.equal(s.find((r) => r.id === 'c')!.pct, 0);
});

test('chỉ chủ hệ thống xem trang và gọi API tăng trưởng', () => {
  const director = parseAccess({ role: 'director', views_json: JSON.stringify(['growth', 'overview']) });
  assert.equal(canView(parseAccess({ role: 'owner' }), 'growth'), true);
  assert.equal(canView(director, 'growth'), false);
  assert.ok(scopeApi(director, 'GET', new URL('https://x/api/reports/growth?dept=sale')).blocked);
});

test('số từng ngày khớp đơn chốt; ngày vào: sửa tay → web nhân sự → Pancake', async () => {
  const days = ['2026-10-20', '2026-10-21', '2026-10-22'];
  const { raw, db } = await demoWorld(days, Date.parse('2026-10-22T12:00:00Z'));
  const got = await growthData(db, 'sale', '2026-10-01', '2026-10-22', '2026-10-22');
  assert.ok(got.people.length > 0);
  const total = Object.values(got.series).reduce((s, x) => s + x.v.reduce((a, b) => a + b, 0), 0);
  // Cùng con số với bảng tổng hợp theo ngày của Sale (ngày chốt, chỉ người có hậu tố).
  const expect = raw.prepare(`SELECT SUM(closed_net) AS v FROM stats_daily WHERE day>='2026-10-01'${teamFilter('seller_id', 'sale')}${countedFilter('seller_id')} AND seller_id<>''`).get() as { v: number };
  assert.equal(Math.round(total), Math.round(expect.v));
  const p = got.people[0];
  await saveJoined(db, p.id, '2026-10-02');
  const after = await growthData(db, 'sale', '2026-10-01', '2026-10-22', '2026-10-22');
  assert.deepEqual([after.people.find((x) => x.id === p.id)!.joined, after.people.find((x) => x.id === p.id)!.source], ['2026-10-02', 'tay']);
  await saveJoined(db, p.id, null);
  const back = (await growthData(db, 'sale', '2026-10-01', '2026-10-22', '2026-10-22')).people.find((x) => x.id === p.id)!;
  assert.notEqual(back.source, 'tay');
  for (const dept of ['cskh', 'mkt', 'vandon'] as const) assert.equal((await growthData(db, dept, '2026-10-01', '2026-10-22', '2026-10-22')).dept, dept);
});
