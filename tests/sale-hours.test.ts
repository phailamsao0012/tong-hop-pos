import test from 'node:test';
import assert from 'node:assert/strict';
import { byWeekday, dayRows, dayTotal, sumRows, vnDayHour, weekdayOf } from '../lib/sale-hours';

test('vnDayHour shifts UTC to Vietnam day and hour', () => {
  // 16:59 UTC = 23:59 giờ VN cùng ngày; 17:00 UTC = 0h ngày hôm sau.
  assert.deepEqual(vnDayHour(Date.parse('2026-10-04T16:59:00Z')), { day: '2026-10-04', hour: 23 });
  assert.deepEqual(vnDayHour(Date.parse('2026-10-04T17:00:00Z')), { day: '2026-10-05', hour: 0 });
  assert.deepEqual(vnDayHour(Date.parse('2026-10-05T02:30:00Z')), { day: '2026-10-05', hour: 9 });
});

test('dayRows lists every day with 24 empty slots', () => {
  const rows = dayRows('2026-09-29', '2026-10-02');
  assert.deepEqual(rows.map((r) => r.day), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(rows[0].a.length, 24);
  assert.equal(dayTotal(rows[0], 'net'), 0);
});

test('sumRows and byWeekday add slots hour by hour', () => {
  const rows = dayRows('2026-09-28', '2026-10-05'); // thứ Hai 28/09 tới thứ Hai 05/10
  assert.equal(weekdayOf('2026-09-28'), 0);
  assert.equal(weekdayOf('2026-10-04'), 6);
  rows[0].a[9] = 3; rows[0].c[9] = 1; rows[7].a[9] = 2; rows[7].o[10] = 4; rows[6].net[20] = 500;
  const all = sumRows(rows, 'all');
  assert.equal(all.a[9], 5);
  assert.equal(all.o[10], 4);
  assert.equal(dayTotal(all, 'net'), 500);
  const week = byWeekday(rows);
  assert.equal(week[0].day, 'T2');
  assert.equal(week[0].days, 2);
  assert.equal(week[0].a[9], 5);
  assert.equal(week[0].c[9], 1);
  assert.equal(week[6].days, 1);
  assert.equal(week[6].net[20], 500);
  assert.equal(week[1].a[9], 0);
});
