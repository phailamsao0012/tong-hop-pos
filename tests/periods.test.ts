import test from 'node:test';
import assert from 'node:assert/strict';
import { compareText, presetRange } from '../lib/periods';
import { compareWindow, comparePeriod } from '../lib/report-time';

// 30/09/2026 là thứ Tư; 16:21 giờ Việt Nam = 09:21 UTC.
const TODAY = '2026-09-30';
const NOW = Date.parse('2026-09-30T09:21:00Z');

test('presetRange covers the shared period list', () => {
  assert.deepEqual(presetRange('today', TODAY), { start: TODAY, end: TODAY });
  assert.deepEqual(presetRange('yesterday', TODAY), { start: '2026-09-29', end: '2026-09-29' });
  assert.deepEqual(presetRange('thisWeek', TODAY), { start: '2026-09-28', end: TODAY });
  assert.deepEqual(presetRange('lastWeek', TODAY), { start: '2026-09-21', end: '2026-09-27' });
  assert.deepEqual(presetRange('month', TODAY), { start: '2026-09-01', end: TODAY });
  assert.deepEqual(presetRange('lastMonth', TODAY), { start: '2026-08-01', end: '2026-08-31' });
  assert.deepEqual(presetRange('year', TODAY), { start: '2026-01-01', end: TODAY });
  assert.equal(presetRange('custom', TODAY), null);
});

test('comparePeriod previous follows the calendar', () => {
  assert.deepEqual(comparePeriod(TODAY, TODAY, 'previous'), { start: '2026-09-29', end: '2026-09-29' });
  // Tuần này (thứ Hai–thứ Tư) so với thứ Hai–thứ Tư tuần trước.
  assert.deepEqual(comparePeriod('2026-09-28', TODAY, 'previous'), { start: '2026-09-21', end: '2026-09-23' });
  // Tuần trước trọn tuần so với tuần trước nữa.
  assert.deepEqual(comparePeriod('2026-09-21', '2026-09-27', 'previous'), { start: '2026-09-14', end: '2026-09-20' });
  // Tháng này tới ngày 15 so với 01–15 tháng trước; cả tháng (kể cả hôm nay là ngày cuối tháng) so với cả tháng trước.
  assert.deepEqual(comparePeriod('2026-09-01', '2026-09-15', 'previous'), { start: '2026-08-01', end: '2026-08-15' });
  assert.deepEqual(comparePeriod('2026-09-01', TODAY, 'previous'), { start: '2026-08-01', end: '2026-08-31' });
  assert.deepEqual(comparePeriod('2026-08-01', '2026-08-31', 'previous'), { start: '2026-07-01', end: '2026-07-31' });
  assert.deepEqual(comparePeriod('2026-03-01', '2026-03-31', 'previous'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(comparePeriod('2026-03-01', '2026-03-30', 'previous'), { start: '2026-02-01', end: '2026-02-28' });
  // 7 ngày qua giữ cách lùi đúng số ngày.
  assert.deepEqual(comparePeriod('2026-09-24', TODAY, 'previous'), { start: '2026-09-17', end: '2026-09-23' });
});

test('compareWindow cuts the last compared day at the same time when the period ends today', () => {
  const today = compareWindow(TODAY, { start: '2026-09-29', end: '2026-09-29' }, NOW);
  assert.equal(today.startUtc, '2026-09-28T17:00:00');
  assert.equal(today.endUtc, '2026-09-29T09:21:00');
  assert.equal(today.cutoff, '16:21');
  assert.equal(compareText(today), '29/09 0h–16:21');
  const month = compareWindow(TODAY, { start: '2026-08-01', end: '2026-08-30' }, NOW);
  assert.equal(month.endUtc, '2026-08-30T09:21:00');
  assert.equal(compareText(month), '01/08–30/08 (ngày cuối tới 16:21)');
  // Kỳ đã kết thúc (hôm qua) thì so trọn ngày.
  const past = compareWindow('2026-09-29', { start: '2026-09-28', end: '2026-09-28' }, NOW);
  assert.equal(past.endUtc, '2026-09-28T17:00:00');
  assert.equal(past.cutoff, null);
  assert.equal(compareText(past), '28/09');
});

test('compareWindow keeps whole days for long compared periods', () => {
  assert.equal(compareWindow(TODAY, { start: '2026-06-02', end: '2026-08-30' }, NOW).cutoff, null);
});
