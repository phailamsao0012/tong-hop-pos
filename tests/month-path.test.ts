import test from 'node:test';
import assert from 'node:assert/strict';
import { monthPath } from '../lib/reports/trend-period';

// Nét liền tới hôm nay, nét đứt từ hôm nay tới cuối tháng, điểm cuối đúng bằng số dự đoán (anh Vũ 07/11/2026).
void test('đường tháng: cộng dồn rồi dự đoán tới cuối tháng', () => {
  const profile = { hours: Array(24).fill(1 / 24), weekdays: Array(7).fill(1), sufficient: true };
  const pts = [{ day: '2026-11-01', hour: 9, id: 'a', value: 10 }, { day: '2026-11-02', hour: 9, id: 'a', value: 20 }];
  const p = monthPath(pts, profile, '2026-11-01', '2026-11-30', '2026-11-03', 35, 350);
  assert.equal(p.length, 30);
  assert.deepEqual(p[0], { day: '2026-11-01', actual: 10, forecast: null });
  assert.deepEqual(p[1], { day: '2026-11-02', actual: 30, forecast: null });
  assert.deepEqual(p[2], { day: '2026-11-03', actual: 35, forecast: 35 });
  assert.equal(p[29].forecast, 350);
  assert.equal(p[29].actual, null);
  for (let i = 3; i < 30; i++) assert.ok((p[i].forecast ?? 0) >= (p[i - 1].forecast ?? p[i - 1].actual ?? 0));
});
