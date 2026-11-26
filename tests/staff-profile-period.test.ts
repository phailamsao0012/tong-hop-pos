import assert from 'node:assert/strict';
import { test } from 'node:test';

// Hồ sơ nhân sự theo kỳ (lib/reports/staff-profile-period.ts). Số giả.
const sums = (o: Partial<{ net: number; closedOrders: number; orders: number; createdClosed: number; cancelled: number; deleted: number }>) =>
  ({ net: 0, closedOrders: 0, orders: 0, createdClosed: 0, cancelled: 0, deleted: 0, ...o });

void test('kỳ trước cùng độ dài, liền trước kỳ chọn', async () => {
  const { prevRange } = await import('../lib/reports/staff-profile-period');
  assert.deepEqual(prevRange('2026-11-01', '2026-11-26'), { start: '2026-10-06', end: '2026-10-31', days: 26 });
  assert.deepEqual(prevRange('2026-11-26', '2026-11-26'), { start: '2026-11-25', end: '2026-11-25', days: 1 });
});

void test('4 ô theo bộ phận: Sale có TL chốt, CSKH thay bằng giá trị TB đơn, MKT theo số MKT', async () => {
  const { periodCards } = await import('../lib/reports/staff-profile-period');
  const cur = sums({ net: 10_000_000, closedOrders: 20, orders: 50, createdClosed: 19, cancelled: 4, deleted: 1 });
  const prev = sums({ net: 8_000_000, closedOrders: 16, orders: 40, createdClosed: 18, cancelled: 2 });
  const sale = periodCards('sale', cur, prev, { cur: 5, prev: 6 });
  assert.deepEqual(sale.map((c) => c.key), ['net', 'closed', 'rate', 'cancel']);
  assert.equal(sale[2].value, 38, 'TL chốt = đơn lên đã chốt ÷ đơn lên (19/50)');
  assert.equal(sale[2].prev, 45);
  assert.equal(sale[3].value, 6, 'TL hủy = (hủy − xoá) ÷ đơn lên, như Tổng quan (3/50)');
  const cskh = periodCards('cskh', cur, prev, { cur: 5, prev: 6 });
  assert.deepEqual(cskh.map((c) => c.key), ['net', 'closed', 'aov', 'cancel'], 'CSKH không có TL chốt');
  assert.equal(cskh[2].value, 500_000);
  const mkt = periodCards('mkt', sums({ net: 5e6, closedOrders: 10, orders: 10, createdClosed: 10 }), sums({}), { cur: 3, prev: 0 });
  assert.deepEqual(mkt.map((c) => c.key), ['net', 'closed', 'aov', 'days']);
  assert.equal(mkt[0].label, 'Doanh số MKT');
  assert.equal(mkt[2].prev, null, 'kỳ trước không có đơn: không chia cho 0');
  // Không có đơn lên: tỉ lệ trống.
  assert.equal(periodCards('sale', sums({}), sums({}), { cur: 0, prev: 0 })[2].value, null);
});

void test('cột theo ngày điền đủ mọi ngày của kỳ', async () => {
  const { fillDays } = await import('../lib/reports/staff-profile-period');
  const d = fillDays('2026-11-01', '2026-11-04', [{ day: '2026-11-02', net: 5, orders: 1 }]);
  assert.deepEqual(d.map((x) => x.day), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  assert.deepEqual(d.map((x) => x.net), [0, 5, 0, 0]);
});

void test('hồ sơ theo kỳ chạy trên dữ liệu demo: khớp tổng theo tháng của hồ sơ', async () => {
  const { demoWorld } = await import('./support/d1-sqlite');
  const { raw, db } = await demoWorld(['2026-10-15', '2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  const seller = raw.prepare("SELECT seller_id AS id FROM stats_daily WHERE closed_orders>0 AND seller_id IS NOT NULL GROUP BY seller_id ORDER BY SUM(closed_net) DESC LIMIT 1").get() as { id: string } | undefined;
  assert.ok(seller, 'demo có người bán có đơn chốt');
  const { staffProfilePeriod } = await import('../lib/reports/staff-profile-period');
  const { staffProfile } = await import('../lib/reports/staff-profile');
  const period = await staffProfilePeriod(db, seller.id, '2026-10-01', '2026-10-31', '2026-10-17');
  const profile = await staffProfile(db, seller.id, '2026-10-17');
  const october = profile.months.find((m) => m.month === '2026-10');
  assert.equal(period.cards.length, 4);
  assert.equal(period.days.length, 31);
  if (profile.dept !== 'mkt') assert.equal(period.cards[0].value, october?.net ?? 0, 'DT chốt cả tháng = cột tháng của hồ sơ');
});
