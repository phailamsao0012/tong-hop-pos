import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCompareChart, compareChartCut, type CompareChartCell as Cell } from '../lib/compare-chart';

type Metric = 'closed' | 'closedNet' | 'closeRate';
type Kind = 'wave' | 'diff' | 'cum';
const metrics: Metric[] = ['closed', 'closedNet', 'closeRate'];
const kinds: Kind[] = ['wave', 'diff', 'cum'];
const pointValue = (p: Cell | undefined, metric: Metric) => !p ? null
  : metric === 'closeRate' ? p.created ? Math.min(p.created, p.createdClosed) / p.created * 100 : null
  : p[metric];

// Thuật toán CompareStrip trước W5, giữ độc lập làm chuẩn đối chiếu mọi kiểu vẽ.
function legacyRows(current: Cell[], previous: Cell[], bucket: 'hour' | 'day', group: number, cut: number | null, metric: Metric, kind: Kind) {
  const g = bucket === 'day' ? group : 1;
  const pack = (ps: Cell[]) => g === 1 ? ps : Array.from({ length: Math.ceil(ps.length / g) }, (_, k) =>
    ps.slice(k * g, k * g + g).reduce((x, p) => ({
      closed: x.closed + p.closed, closedNet: x.closedNet + p.closedNet,
      created: x.created + p.created, createdClosed: x.createdClosed + p.createdClosed,
    }), { closed: 0, closedNet: 0, created: 0, createdClosed: 0 }));
  const curP = pack(current), prevP = pack(previous);
  const curLen = cut ?? curP.length, prevLen = cut ?? prevP.length;
  const len = bucket === 'hour' ? 24 : Math.max(curP.length, prevP.length);
  const chartMetric = kind === 'cum' ? metric === 'closed' ? 'closed' : 'closedNet' : metric;
  let a = 0, b = 0;
  return Array.from({ length: len }, (_, i) => {
    const pa = pointValue(curP[i], chartMetric), pb = pointValue(prevP[i], chartMetric);
    a += pa ?? 0; b += pb ?? 0;
    const cur = i < curLen ? kind === 'cum' ? a : pa : null;
    const prev = i < prevLen ? kind === 'cum' ? b : pb : null;
    return { cur, prev, diff: cur !== null && prev !== null ? cur - prev : null };
  });
}
const points = (len: number): Cell[] => Array.from({ length: len }, (_, i) => ({
  closed: i % 5, closedNet: (i % 5) * 123,
  created: i % 4 ? i + 1 : 0, createdClosed: i % 3 ? i % 7 : i + 3,
}));

void test('W5: chart trùng CompareStrip cũ ở mọi chỉ số, kiểu vẽ, giờ/ngày, gộp, cutoff và hai kỳ lệch độ dài', () => {
  for (const [bucket, group, curLen, prevLen, cutoff] of [
    ['hour', 1, 24, 24, null], ['hour', 1, 24, 24, '10:59'],
    ['hour', 5, 24, 24, '00:01'], ['hour', 1, 24, 24, '23:59'],
    ['day', 1, 30, 31, null], ['day', 1, 31, 30, '10:59'],
    ['day', 2, 43, 31, null], ['day', 2, 31, 43, '10:59'],
    ['day', 3, 7, 2, null], ['day', 1, 2, 7, null],
  ] as const) {
    const current = points(curLen), previous = points(prevLen).reverse();
    const original = structuredClone({ current, previous });
    const chart = buildCompareChart(current, previous, { bucket, group, cutoff });
    for (const kind of kinds) for (const metric of metrics) {
      const value = (p: (typeof chart.current)[number]) => !p ? null : kind === 'cum'
        ? metric === 'closed' ? p.cumClosed : p.cumClosedNet : p[metric];
      const rows = chart.current.map((p, i) => {
        const cur = value(p), prev = value(chart.previous[i]);
        return { cur, prev, diff: cur !== null && prev !== null ? cur - prev : null };
      });
      assert.deepEqual(rows, legacyRows(current, previous, bucket, group,
        bucket === 'hour' && cutoff ? Number(cutoff.slice(0, 2)) + 1 : null, metric, kind),
      `${bucket}/${group}/${curLen}/${prevLen}/${cutoff}/${metric}/${kind}`);
      assert.equal(rows.length, chart.len);
    }
    assert.deepEqual({ current, previous }, original);
  }
});

void test('W5: tỷ lệ gộp có trọng số, chặn 100%, null khi thiếu số chia; cộng dồn đơn và tiền, đuôi ngắn null toàn bộ', () => {
  const chart = buildCompareChart([
    { closed: 1, closedNet: 100, created: 1, createdClosed: 1 },
    { closed: 2, closedNet: 250, created: 3, createdClosed: 0 },
    { closed: 3, closedNet: 400, created: 0, createdClosed: 5 },
    { closed: 0, closedNet: 0, created: 0, createdClosed: 0 },
    { closed: 1, closedNet: 50, created: 1, createdClosed: 2 },
  ], [{ closed: 2, closedNet: 300, created: 2, createdClosed: 1 }],
  { bucket: 'day', group: 2, cutoff: '00:00' });
  assert.deepEqual(chart, { len: 3, current: [
    { closed: 3, closedNet: 350, closeRate: 25, cumClosed: 3, cumClosedNet: 350 },
    { closed: 3, closedNet: 400, closeRate: null, cumClosed: 6, cumClosedNet: 750 },
    { closed: 1, closedNet: 50, closeRate: 100, cumClosed: 7, cumClosedNet: 800 },
  ], previous: [
    { closed: 2, closedNet: 300, closeRate: 50, cumClosed: 2, cumClosedNet: 300 }, null, null,
  ] });
});

void test('W5: giờ luôn group 1, cắt hai kỳ theo cutoff; null vượt độ dài và chuỗi rỗng', () => {
  const chart = buildCompareChart(points(24), points(3), { bucket: 'hour', group: 9, cutoff: '10:59' });
  assert.equal(chart.len, 24);
  assert.equal(chart.current[10]?.closed, points(24)[10].closed);
  assert.ok(chart.current.slice(11).every((p) => p === null));
  assert.ok(chart.previous.slice(3).every((p) => p === null));
  assert.equal(compareChartCut('hour', '10:59'), 11);
  assert.equal(compareChartCut('day', '10:59'), null);
  assert.equal(compareChartCut('hour', null), null);
  assert.deepEqual(buildCompareChart([], [], { bucket: 'day', group: 1, cutoff: null }), { len: 0, current: [], previous: [] });
  const empty = buildCompareChart([], [], { bucket: 'hour', group: 1, cutoff: null });
  assert.equal(empty.len, 24);
  assert.ok([...empty.current, ...empty.previous].every((p) => p === null));
});
