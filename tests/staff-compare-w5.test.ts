import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, mock, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { GET } from '../app/api/reports/staff-compare/route';
import { buildCompareChart, type CompareChart, type CompareChartCell } from '../lib/reports/compare-chart';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';

type Report = {
  bucket: 'hour' | 'day';
  group: number;
  compare: { cutoff: string | null };
  current: { points: CompareChartCell[] };
  previous: { points: CompareChartCell[] };
  chart: CompareChart;
  staff: {
    sellerId: string;
    chart: CompareChart;
    series: { current: number[][]; previous: number[][] };
    seriesRate: { current: (number | null)[]; previous: (number | null)[] };
  }[];
};
let raw: DatabaseSync;
let requestId = 0;
before(async () => {
  ({ raw } = await demoWorld(
    ['2026-08-01', '2026-08-02', '2026-08-03', '2026-09-01', '2026-09-02', '2026-09-03'],
    Date.parse('2026-10-14T05:00:00Z'),
  ));
  await loginAs(raw, 'owner');
});
after(() => raw.close());

async function report(params: Record<string, string>) {
  const response = await GET(new Request(`https://test.invalid/api/reports/staff-compare?${new URLSearchParams(params)}`));
  assert.equal(response.status, 200);
  return await response.json() as Report;
}

function checkCharts(r: Report) {
  assert.deepEqual(r.chart, buildCompareChart(r.current.points, r.previous.points, {
    bucket: r.bucket, group: r.group, cutoff: r.compare.cutoff,
  }));
  for (const s of r.staff) {
    assert.equal(s.chart.len, r.chart.len, s.sellerId);
    for (const key of ['current', 'previous'] as const) {
      let cumClosed = 0, cumClosedNet = 0;
      const cut = r.bucket === 'hour' && r.compare.cutoff ? Number(r.compare.cutoff.slice(0, 2)) + 1 : null;
      const expected = Array.from({ length: r.chart.len }, (_, i) => {
        const tuple = s.series[key][i];
        if (!tuple || (cut !== null && i >= cut)) return null;
        cumClosed += tuple[0]; cumClosedNet += tuple[1];
        return {
          closed: tuple[0], closedNet: tuple[1], closeRate: s.seriesRate[key][i],
          cumClosed, cumClosedNet,
        };
      });
      assert.deepEqual(s.chart[key], expected, `${s.sellerId}/${key}`);
    }
  }
}

void test('W5: JSON trước W5 giữ nguyên trên demo; chart cả đội và mọi người khớp số cũ, không gộp chuỗi focus lần hai', async () => {
  const snapshots = JSON.parse(readFileSync(
    new URL('./fixtures/staff-compare-before-w5.json', import.meta.url), 'utf8',
  )) as { params: Record<string, string>; hash: string }[];
  for (const { params, hash } of snapshots) {
    const r = await report({ ...params, test: `w5-${++requestId}` });
    const old = JSON.parse(JSON.stringify(r)) as { chart?: unknown; staff: { chart?: unknown }[] };
    delete old.chart;
    for (const s of old.staff) delete s.chart;
    assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'), hash, JSON.stringify(params));
    checkCharts(r);
  }
  // Tháng 30 so 31 ngày: kỳ ngắn phải có null ở cuối; tự chọn đảo lại độ dài cũng vậy.
  for (const params of [
    { start: '2026-09-01', end: '2026-09-30', cstart: '2026-08-01', cend: '2026-08-31' },
    { start: '2026-08-01', end: '2026-08-31', cstart: '2026-09-01', cend: '2026-09-30' },
  ]) {
    const r = await report({ ...params, mode: 'custom', team: 'all', test: `w5-${++requestId}` });
    checkCharts(r);
    assert.equal(r.chart.len, 31);
    const shorter = params.start === '2026-09-01' ? 'current' : 'previous';
    assert.equal(r.chart[shorter][30], null);
    for (const s of r.staff) assert.equal(s.chart[shorter][30], null);
  }
});

void test('W5: cutoff máy chủ cắt hai kỳ giờ; bản nhớ qua đầu giờ không mọc điểm; kiểu ngày không bị cắt', async () => {
  const clock = mock.method(Date, 'now', () => Date.parse('2026-09-02T03:59:00Z'));
  try {
    const params = { start: '2026-09-02', end: '2026-09-02', team: 'all', test: 'w5-hour-boundary' };
    const r = await report(params);
    assert.equal(r.bucket, 'hour');
    assert.equal(r.group, 1);
    assert.equal(r.compare.cutoff, '10:59');
    checkCharts(r);
    for (const chart of [r.chart, ...r.staff.map((s) => s.chart)]) {
      assert.equal(chart.len, 24);
      for (const key of ['current', 'previous'] as const) {
        assert.ok(chart[key].slice(0, 11).every((p) => p !== null));
        assert.ok(chart[key].slice(11).every((p) => p === null));
      }
    }
    clock.mock.mockImplementation(() => Date.parse('2026-09-02T04:01:00Z'));
    assert.deepEqual(await report(params), r);
    const fresh = await report({ ...params, test: 'w5-hour-fresh' });
    assert.equal(fresh.compare.cutoff, '11:01');
    assert.notEqual(fresh.chart.current[11], null);
    checkCharts(fresh);
    const daily = await report({ ...params, start: '2026-09-01', test: 'w5-day-cutoff' });
    assert.equal(daily.bucket, 'day');
    assert.equal(daily.compare.cutoff, '11:01');
    checkCharts(daily);
    assert.ok(daily.chart.current.every((p) => p !== null));
    assert.ok(daily.chart.previous.every((p) => p !== null));
  } finally {
    clock.mock.restore();
  }
});
