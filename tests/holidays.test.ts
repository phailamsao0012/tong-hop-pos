import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lunarToSolar } from '../lib/shared/lunar';
import { DEFAULT_HOLIDAYS, holidayDate, holidayOn, parseHolidays } from '../lib/shared/holidays';

// Ngày Tết đã biết (lịch Việt Nam).
void test('lunarToSolar: mùng 1 Tết các năm', () => {
  assert.equal(lunarToSolar(1, 1, 2024), '2024-02-10');
  assert.equal(lunarToSolar(1, 1, 2025), '2025-01-29');
  assert.equal(lunarToSolar(1, 1, 2026), '2026-02-17');
  assert.equal(lunarToSolar(1, 1, 2027), '2027-02-06');
});

void test('lunarToSolar: Giỗ Tổ 10/3 âm', () => {
  assert.equal(lunarToSolar(10, 3, 2025), '2025-04-07');
  assert.equal(lunarToSolar(10, 3, 2026), '2026-04-26');
});

void test('holidayOn: dương và âm lịch; parseHolidays bỏ dòng hỏng', () => {
  assert.equal(holidayOn(DEFAULT_HOLIDAYS, '2026-09-02'), 'Quốc khánh');
  assert.equal(holidayOn(DEFAULT_HOLIDAYS, '2026-02-17'), 'Mùng 1 Tết');
  assert.equal(holidayOn(DEFAULT_HOLIDAYS, '2026-11-12'), null);
  assert.equal(holidayDate({ name: 'x', kind: 'solar', month: 4, day: 30 }, 2027), '2027-04-30');
  assert.deepEqual(parseHolidays('[{"name":"A","kind":"solar","month":13,"day":1},{"name":"B","kind":"lunar","month":1,"day":1}]'), [{ name: 'B', kind: 'lunar', month: 1, day: 1 }]);
  assert.deepEqual(parseHolidays('oops'), []);
});
