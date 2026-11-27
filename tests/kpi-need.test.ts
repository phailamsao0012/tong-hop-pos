import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysLeftInMonth, kpiNeedPerDay, kpiNeedTotal } from '../lib/kpi/kpi-need';

void test('Cần/ngày: còn thiếu ÷ số ngày còn lại tính cả hôm nay', () => {
  // Ví dụ của anh: KPI 200tr, đạt 80tr, hôm nay 27/11 → còn 4 ngày (27–30) → 30tr / ngày.
  const n = kpiNeedPerDay(200_000_000, 80_000_000, '2026-11', '2026-11-27');
  assert.equal(n.state, 'need');
  if (n.state === 'need') { assert.equal(n.remaining, 120_000_000); assert.equal(n.daysLeft, 4); assert.equal(n.perDay, 30_000_000); assert.equal(n.from, '2026-11-27'); assert.equal(n.to, '2026-11-30'); }
  // Ngày cuối tháng: còn 1 ngày.
  const last = kpiNeedPerDay(100, 40, '2026-11', '2026-11-30');
  assert.ok(last.state === 'need' && last.daysLeft === 1 && last.perDay === 60);
  // Đã đủ / vượt.
  assert.equal(kpiNeedPerDay(100, 100, '2026-11', '2026-11-27').state, 'reached');
  assert.equal(kpiNeedPerDay(100, 150, '2026-11', '2026-11-27').state, 'reached');
  // Chưa đặt KPI.
  assert.equal(kpiNeedPerDay(0, 10, '2026-11', '2026-11-27').state, 'none');
  assert.equal(kpiNeedPerDay(null, 10, '2026-11', '2026-11-27').state, 'none');
  // Tháng đã qua: hết ngày.
  assert.equal(kpiNeedPerDay(100, 40, '2026-10', '2026-11-27').state, 'past');
  // Tháng sau: cả tháng; tháng 2 năm nhuận.
  assert.deepEqual(daysLeftInMonth('2026-12', '2026-11-27'), { daysLeft: 31, from: '2026-12-01', to: '2026-12-31' });
  assert.equal(daysLeftInMonth('2028-02', '2028-02-01').daysLeft, 29);
});

void test('Cần/ngày dòng Tổng: chỉ cộng phần thiếu của người chưa đạt', () => {
  const t = kpiNeedTotal([{ goal: 200, done: 80 }, { goal: 100, done: 120 }, { goal: null, done: 50 }, { goal: 40, done: 0 }], '2026-11', '2026-11-27');
  assert.equal(t.remaining, 160);
  assert.equal(t.people, 2);
  assert.equal(t.perDay, 40);
  assert.equal(kpiNeedTotal([{ goal: 100, done: 10 }], '2026-10', '2026-11-27').perDay, null);
});
