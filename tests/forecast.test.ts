import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastTargetAllowed, forecastMonth, monthForecast } from '../lib/kpi/forecast';

void test('forecast: ngày 1 và ngày cuối tháng', () => {
  assert.equal(forecastMonth({ actual: 100, dayOfMonth: 1, daysInMonth: 31 }), 3100);
  assert.equal(forecastMonth({ actual: 3100, dayOfMonth: 31, daysInMonth: 31 }), 3100);
  assert.equal(forecastMonth({ actual: 0, dayOfMonth: 15, daysInMonth: 30 }), 0);
});
void test('forecast: tháng 2 nhuận và không nhuận', () => {
  assert.equal(monthForecast({ actual: 100, start: '2024-02-01', end: '2024-02-01', today: '2024-02-01' })?.revenue, 2900);
  assert.equal(monthForecast({ actual: 100, start: '2025-02-01', end: '2025-02-01', today: '2025-02-01' })?.revenue, 2800);
});
void test('forecast: chỉ kỳ từ đầu tháng hiện tại tới hôm nay theo ngày VN', () => {
  const base = { actual: 1500, start: '2026-10-01', end: '2026-10-15', today: '2026-10-15' };
  assert.equal(monthForecast(base)?.revenue, 3100);
  for (const change of [{ start: '2026-10-02' }, { start: '2026-09-01', end: '2026-09-30' }, { end: '2026-10-14' }, { end: '2026-10-31' }])
    assert.equal(monthForecast({ ...base, ...change }), null);
});
void test('forecast: không mục tiêu, mục tiêu 0 và phần trăm thực đạt', () => {
  const base = { actual: 1500, start: '2026-10-01', end: '2026-10-15', today: '2026-10-15' };
  for (const target of [undefined, null, 0, -1, NaN])
    assert.deepEqual(monthForecast({ ...base, target }), { revenue: 3100, target: null, targetPercent: null });
  assert.deepEqual(monthForecast({ ...base, target: 3000 }), { revenue: 3100, target: 3000, targetPercent: 50 });
});
void test('forecast: ngày làm việc đã qua và còn lại', () => {
  assert.equal(forecastMonth({ actual: 1000, dayOfMonth: 10, daysInMonth: 31, workingDaysLeft: 12 }), 2200);
  assert.equal(forecastMonth({ actual: 1000, dayOfMonth: 10, daysInMonth: 31, workingDaysLeft: 0 }), 1000);
});
void test('forecast: dữ liệu không hợp lệ không sinh Infinity hay NaN', () => {
  const base = { actual: 100, dayOfMonth: 1, daysInMonth: 31 };
  for (const change of [{ dayOfMonth: 0 }, { dayOfMonth: 32 }, { dayOfMonth: 1.5 }, { actual: NaN }, { actual: Infinity }, { daysInMonth: 0 }, { workingDaysLeft: -1 }])
    assert.equal(forecastMonth({ ...base, ...change }), null);
});

void test('forecastTargetAllowed: only owner', () => {
 for (const role of ['owner', 'director', 'admin', 'staff', 'lead']) assert.equal(forecastTargetAllowed(role), role === 'owner');
});
