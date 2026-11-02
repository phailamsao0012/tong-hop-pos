import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMorningReport,
  morningSvg,
  morningText,
  type MorningData,
} from '../lib/zalo/morning-report';
import { addDays } from '../lib/shared/report-time';

// Số ảo: 14 ngày tới 01/11, hôm qua 30 tr, hôm trước 25 tr, cùng thứ tuần trước 40 tr.
function data(over: Partial<MorningData> = {}): MorningData {
  const days = Array.from({ length: 14 }, (_, i) => ({
    day: addDays('2026-11-01', i - 13),
    net: 20_000_000,
    orders: 20,
    created: 50,
    createdClosed: 20,
  }));
  days[13] = {
    day: '2026-11-01',
    net: 30_000_000,
    orders: 30,
    created: 60,
    createdClosed: 30,
  };
  days[12] = {
    ...days[12],
    net: 25_000_000,
    orders: 25,
    created: 50,
    createdClosed: 20,
  };
  days[6] = { ...days[6], net: 40_000_000 };
  return {
    team: 'Team demo',
    dept: 'sale',
    today: '2026-11-02',
    days,
    monthNet: 30_000_000,
    goal: 900_000_000,
    workingDays: null,
    people: [
      { name: 'A demo', net: 20_000_000, orders: 20 },
      { name: 'B demo', net: 10_000_000, orders: 10 },
      { name: 'C demo', net: 0, orders: 0 },
    ],
    overdue: [{ who: 'A demo', title: 'Gọi lại khách' }],
    dueToday: [],
    ...over,
  };
}

void test('báo cáo 8h: so hôm trước, so cùng thứ tuần trước, ô nhỏ, người', () => {
  const r = buildMorningReport(data());
  assert.equal(r.title, 'Báo cáo sáng thứ Hai 02/11 · số của ngày 01/11');
  assert.equal(r.yesterday, 30_000_000);
  assert.equal(Math.round(r.vsPrev!), 20);
  assert.equal(Math.round(r.vsLastWeek!), -25);
  assert.equal(r.lastWeekLabel, 'Chủ nhật tuần trước');
  assert.equal(r.week.length, 7);
  assert.equal(r.week[6].day, '2026-11-01');
  assert.equal(r.weekBefore[6], 40_000_000);
  assert.deepEqual(
    r.tiles.map((t) => t.label),
    ['Đơn chốt', 'Tỉ lệ chốt', 'TB đơn'],
  );
  assert.equal(r.tiles[0].delta, 5);
  assert.equal(r.tiles[1].value, '50%');
  assert.equal(Math.round(r.tiles[1].delta!), 10);
  assert.deepEqual(
    r.best.map((p) => p.name),
    ['A demo', 'B demo'],
  );
  assert.deepEqual(r.coach, ['C demo']);
});

void test('báo cáo 8h: KPI tháng chia đều theo ngày, cần bao nhiêu mỗi ngày', () => {
  const k = buildMorningReport(data()).kpi!;
  assert.equal(k.month, 11);
  assert.equal(Math.round(k.percent * 10) / 10, 3.3);
  assert.equal(k.paceDiff, 0); // 900 tr / 30 ngày = 30 tr, hôm qua là ngày 1
  assert.equal(k.needPerDay, 870_000_000 / 29);
  assert.equal(buildMorningReport(data({ goal: null })).kpi, null);
  assert.match(
    morningText(buildMorningReport(data({ goal: null }))),
    /KPI tháng: chưa đặt cho team/,
  );
});

void test('báo cáo 8h: CSKH không có tỉ lệ chốt; ngày thiếu số coi là 0', () => {
  const r = buildMorningReport(data({ dept: 'cskh', days: [] }));
  assert.deepEqual(
    r.tiles.map((t) => t.label),
    ['Đơn chốt', 'Người có đơn', 'TB đơn'],
  );
  assert.equal(r.yesterday, 0);
  assert.equal(r.vsPrev, null);
  assert.doesNotMatch(morningText(r), /Tỉ lệ chốt/);
  assert.match(r.footer, /hậu tố CSKH/);
});

void test('báo cáo 8h: bản chữ dưới 2000 ký tự, ảnh SVG thoát ký tự lạ', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({
    who: `Người demo ${i}`,
    title: 'Việc rất dài '.repeat(5),
  }));
  const text = morningText(
    buildMorningReport(data({ overdue: many, team: 'Team <demo> & "x"' })),
  );
  assert.ok(text.length <= 2000);
  assert.match(text, /Quá hạn 80/);
  assert.match(
    text,
    /Doanh số hôm qua: 30 tr \(▲ 20% so hôm trước · ▼ 25% so Chủ nhật tuần trước\)/,
  );
  const svg = morningSvg(
    buildMorningReport(data({ team: 'Team <demo> & "x"' })),
  );
  assert.match(svg, /^<svg /);
  assert.match(svg, /Team &lt;demo&gt; &amp; &quot;x&quot;/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});
