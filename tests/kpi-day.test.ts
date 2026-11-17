import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysInMonthOf, kpiDay } from '../lib/kpi/kpi-day';

// Ví dụ anh Vũ 12/11/2026: tháng 30 ngày, 300 tr → 10 tr/ngày; hết ngày 1 đạt 8 → sáng ngày 2 thiếu −2; đạt 12 → +2; có đơn mới thì đổi.
void test('kpiDay: ví dụ của anh Vũ', () => {
  const a = kpiDay({ goal: 300e6, today: '2026-11-02', achieved: 8e6, achievedToday: 0 })!;
  assert.equal(a.daily, 10e6);
  assert.equal(a.mustByYesterday, 10e6);
  assert.equal(a.diff, -2e6);
  assert.equal(a.needToday, 12e6);
  const b = kpiDay({ goal: 300e6, today: '2026-11-02', achieved: 12e6, achievedToday: 0 })!;
  assert.equal(b.diff, 2e6);
  assert.equal(b.needToday, 8e6);
  const c = kpiDay({ goal: 300e6, today: '2026-11-02', achieved: 8e6 + 3e6, achievedToday: 3e6 })!;
  assert.equal(c.diff, 1e6, 'trong ngày có đơn chốt mới 3 tr thì từ −2 thành +1');
});

void test('kpiDay: ngày 1 chưa phải đạt gì; 200 tr / 30 ngày; tháng 31 ngày; chưa đặt KPI', () => {
  const d1 = kpiDay({ goal: 200e6, today: '2026-11-01', achieved: 0, achievedToday: 0 })!;
  assert.equal(d1.mustByYesterday, 0);
  assert.equal(d1.diff, 0);
  assert.ok(Math.abs(d1.daily - 200e6 / 30) < 1e-6);
  assert.equal(daysInMonthOf('2026-12'), 31);
  assert.equal(daysInMonthOf('2028-02'), 29);
  assert.equal(kpiDay({ goal: 0, today: '2026-11-05', achieved: 1, achievedToday: 1 }), null);
});
