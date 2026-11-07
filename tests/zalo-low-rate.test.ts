import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentSlot, lowRateText, pickLowRate } from '../lib/zalo/low-rate';

void test('báo tỷ lệ chốt dưới 42%: đủ 10 số, 1 lần mỗi khung, sang ngày mới thì báo lại', () => {
  const rows = [
    { sellerId: 'a', name: 'Bạn A', base: 20, closed: 7 }, // 35%
    { sellerId: 'b', name: 'Bạn B', base: 9, closed: 1 }, // chưa đủ số
    { sellerId: 'c', name: 'Bạn C', base: 50, closed: 21 }, // 42% xanh
    { sellerId: 'd', name: 'Bạn D', base: 10, closed: 2 }, // 20%
  ];
  const first = pickLowRate(rows, {}, '2026-11-07', '12:00', 't1');
  assert.deepEqual(first.low.map((r) => r.sellerId), ['d', 'a']);
  const again = pickLowRate(rows, first.state, '2026-11-07', '12:00', 't1');
  assert.equal(again.low.length, 0);
  assert.equal(pickLowRate(rows, first.state, '2026-11-07', '17:00', 't1').low.length, 2);
  assert.equal(pickLowRate(rows, first.state, '2026-11-08', '12:00', 't1').low.length, 2);
  assert.equal(currentSlot(['12:00', '17:00', '22:00'], '12:15'), '17:00');
  assert.equal(currentSlot(['12:00', '17:00', '22:00'], '22:00'), 'cuoi-ngay');
  const text = lowRateText('Team X', '14:15', first.low);
  assert.ok(text.startsWith('🔴 Tỷ lệ chốt dưới 42% · Team X · hôm nay tới 14:15'));
  assert.ok(text.includes('• Bạn D: 20% (2/10 số)'));
});

void test('todayRates đọc stats_daily hôm nay', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { todayRates } = await import('../lib/zalo/low-rate');
  const { raw, db } = emptyDb();
  const cols = (raw.prepare('PRAGMA table_info(stats_daily)').all() as { name: string; notnull: number; dflt_value: unknown }[]);
  const need = cols.filter((c) => c.notnull && c.dflt_value === null).map((c) => c.name);
  let n = 0;
  const row = (vals: Record<string, string | number>) => { const v = { ...Object.fromEntries(need.map((k) => [k, 0])), id: `r${n++}`, updated_at: 'x', ...vals }; raw.prepare(`INSERT INTO stats_daily (${Object.keys(v).join(',')}) VALUES (${Object.keys(v).map(() => '?').join(',')})`).run(...Object.values(v)); };
  row({ pos_id: 'p1', day: '2026-11-07', seller_id: 's1', orders: 12, confirmed_orders: 3, shipping_orders: 1, delivered_orders: 0, returned_orders: 0 });
  row({ pos_id: 'p2', day: '2026-11-07', seller_id: 's1', orders: 8, confirmed_orders: 2, shipping_orders: 0, delivered_orders: 0, returned_orders: 0 });
  row({ pos_id: 'p1', day: '2026-11-06', seller_id: 's1', orders: 50, confirmed_orders: 50, shipping_orders: 0, delivered_orders: 0, returned_orders: 0 });
  const out = await todayRates(db, ['s1', 's2'], '2026-11-07');
  assert.deepEqual(out, [{ sellerId: 's1', name: 's1', base: 20, closed: 6 }]);
});
