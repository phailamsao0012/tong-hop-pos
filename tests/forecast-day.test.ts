import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baselineOf, decompose, forecastToday, forecastWeek, hourShares, personExpected, shareAt } from '../lib/forecast-day';

void test('hourShares: bỏ ngày lạ, ngày 0; nội suy, đường tăng và fallback đều', () => {
  const day = (n: number) => Array<number>(24).fill(n);
  const cum = hourShares([day(10), day(10), day(10), day(1), day(0)]);
  assert.equal(baselineOf([day(10), day(10), day(10), day(1)]), 240);
  assert.equal(cum[0], 0); assert.equal(cum[24], 1);
  assert.ok(cum.every((v, i) => i === 0 || v >= cum[i - 1]));
  assert.equal(shareAt(cum, 630), 10.5 / 24);
  assert.deepEqual(hourShares([day(0)]), Array.from({ length: 25 }, (_, h) => h / 24));
  assert.equal(baselineOf([]), null);
});
void test('forecastToday: ba nhánh, thiếu dữ liệu, không dưới actual, 23:59 lệch dưới 2%', () => {
  assert.equal(forecastToday({ actual: 40, share: 0.5, baseline: 100 }), 80);
  assert.equal(forecastToday({ actual: 10, share: 0.125, baseline: 100 }), 90);
  assert.equal(forecastToday({ actual: 10, share: 0, baseline: 100 }), 100);
  assert.equal(forecastToday({ actual: 110, share: 0, baseline: 100 }), 110);
  assert.equal(forecastToday({ actual: 0, share: 0, baseline: null }), null);
  const predicted = forecastToday({ actual: 100, share: shareAt(hourShares([]), 1439), baseline: 100 })!;
  assert.ok(predicted >= 100 && predicted <= 102);
});
void test('forecastWeek: cộng đúng và không giấu ngày thiếu dữ liệu', () => {
  assert.equal(forecastWeek({ actualToYesterday: 100, todayForecast: 200, restBaselines: [300, 400] }), 1000);
  assert.equal(forecastWeek({ actualToYesterday: 0, todayForecast: null, restBaselines: [] }), null);
  assert.equal(forecastWeek({ actualToYesterday: 0, todayForecast: 10, restBaselines: [null] }), null);
});
void test('decompose: sáu ca gồm CSKH, không chốt, người nghỉ, phần dư khớp số nguyên', () => {
  const cases = [
    [{ assigned: 10, closed: 3, net: 100 }, { assigned: 12, closed: 5, net: 170 }],
    [{ assigned: 0, closed: 3, net: 100 }, { assigned: 0, closed: 5, net: 170 }],
    [{ assigned: 10, closed: 0, net: 0 }, { assigned: 12, closed: 5, net: 170 }],
    [{ assigned: 10, closed: 3, net: 100 }, { assigned: 12, closed: 0, net: 0 }],
    [{ assigned: 10, closed: 3, net: 100 }, { assigned: 0, closed: 0, net: 0 }],
    [{ assigned: 0, closed: 0, net: 0 }, { assigned: 0, closed: 0, net: 0 }],
  ];
  for (const [expected, actual] of cases) {
    const p = decompose(expected, actual);
    assert.equal(p.soChia + p.tiLeChot + p.giaTriDon + p.khac, actual.net - expected.net);
    assert.equal(p.tong, actual.net - expected.net);
  }
});
void test('personExpected: bỏ ngày nghỉ, nhân hệ số và người mới dưới ba ngày', () => {
  const worked = { assigned: 10, closed: 2, net: 100 }, off = { assigned: 0, closed: 0, net: 0 };
  assert.equal(personExpected([worked, worked, off], 2), null);
  assert.deepEqual(personExpected([worked, worked, worked, off], 2), { assigned: 20, closed: 4, net: 200 });
});
