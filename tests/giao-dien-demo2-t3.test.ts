import test from 'node:test';
import assert from 'node:assert/strict';
import { peopleTrendSeries } from '../app/ui/d2-people-data';
import type { OverviewReport } from '../app/overview-view';

const report = {
  current: { period: { start: '2026-10-11' }, series: [
    { bucket: '2026-10-11', closedNet: 100 }, { bucket: '2026-10-11', closedNet: 50 }, { bucket: '2026-10-13', closedNet: 300 },
  ], byEmployeeDay: [
    { sellerId: 'a', day: '2026-10-11', closedNet: 100 }, { sellerId: 'b', day: '2026-10-11', closedNet: 50 }, { sellerId: 'a', day: '2026-10-13', closedNet: 300 },
  ] },
  compare: { period: { start: '2026-10-01' }, series: [
    { bucket: '2026-10-01', closedNet: 80 }, { bucket: '2026-10-02', closedNet: 99 },
  ], byEmployeeDay: [{ sellerId: 'a', day: '2026-10-01', closedNet: 60 }, { sellerId: 'b', day: '2026-10-01', closedNet: 20 }] },
} as unknown as OverviewReport;

void test('Demo 2 T3: daily trend sums POS and aligns missing comparison days by period offset', () => {
  assert.deepEqual(peopleTrendSeries(report), { labels: ['2026-10-11', '2026-10-13'], current: [150, 300], previous: [80, null] });
});
void test('Demo 2 T3: team and employee selection apply to both trend periods without duplicate counting', () => {
  assert.deepEqual(peopleTrendSeries(report, ['a', 'a']), { labels: ['2026-10-11', '2026-10-13'], current: [100, 300], previous: [60, null] });
  assert.deepEqual(peopleTrendSeries(report, []), { labels: [], current: [], previous: [] });
});
void test('Demo 2 T3: absent employee series never substitutes department totals', () => {
  const missing = { ...report, current: { ...report.current, byEmployeeDay: undefined } };
  assert.deepEqual(peopleTrendSeries(missing, ['a']), { labels: [], current: [], previous: [] });
});
