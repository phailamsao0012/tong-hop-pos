import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePeriod, parsePos, splitMessage } from '../lib/bot-parse';
import { todayVn, addDays } from '../lib/report-time';

test('parsePeriod understands Vietnamese period tokens', () => {
  const today = todayVn();
  assert.equal(parsePeriod(['homqua']).period.start, addDays(today, -1));
  assert.equal(parsePeriod(['thang']).period.start, `${today.slice(0, 7)}-01`);
  assert.equal(parsePeriod(['7ngay']).period.start, addDays(today, -6));
  const range = parsePeriod(['1/9-15/9']).period;
  assert.equal(range.start, `${today.slice(0, 4)}-09-01`);
  assert.equal(range.end, `${today.slice(0, 4)}-09-15`);
  const { period, rest } = parsePeriod(['Huong', 'tuan', 'truoc']);
  assert.deepEqual(rest, ['Huong']);
  assert.equal(period.label, 'tuần trước');
});

test('parsePos maps aliases and leaves other words', () => {
  const { posIds, rest } = parsePos(['gao', 'Huong', 'apex']);
  assert.deepEqual(posIds, ['sieu-vo-gao', 'mgt-apex']);
  assert.deepEqual(rest, ['Huong']);
});

test('splitMessage keeps Telegram parts under the limit', () => {
  const parts = splitMessage(Array.from({ length: 400 }, (_, i) => `dòng ${i} `.repeat(3)).join('\n'));
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 3800));
});
