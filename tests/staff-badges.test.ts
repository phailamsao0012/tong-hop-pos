import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeBadges, moneyLabel, type BadgePerson } from '../lib/reports/staff-badges';
import { bestOf, rankByMonth } from '../lib/reports/staff-profile';

const m = (month: string, orders: number, net: number, base = 0, closedOfBase = 0) => ({ month, orders, net, base, closedOfBase });

void test('huy hiệu: mốc cao nhất, kỷ lục nhanh nhất, quán quân, top 3, bền bỉ, bùng nổ (số ảo)', () => {
  const people: BadgePerson[] = [
    // A vào 01/2026, 3 tháng đạt 1.000 đơn và 1 tỷ; tỷ lệ chốt ≥42% liền 3 tháng.
    { id: 'A', dept: 'sale', joined: '2026-01-05', months: [m('2026-01', 300, 3e8, 100, 50), m('2026-02', 400, 4e8, 100, 45), m('2026-03', 400, 4e8, 100, 42), m('2026-04', 10, 1e7, 100, 10)] },
    // B vào 06/2025, đạt 1.000 đơn sau lâu hơn.
    { id: 'B', dept: 'sale', joined: '2025-06-01', months: [m('2025-06', 200, 1e8), m('2025-09', 500, 2e8), m('2026-02', 500, 5e8), m('2026-03', 10, 1e6)] },
    { id: 'C', dept: 'cskh', joined: null, months: [m('2026-01', 50, 5e7), m('2026-02', 60, 6e7), m('2026-03', 70, 7e7)] },
  ];
  const book = computeBadges(people, '2026-04', { sale: { bestDay: { id: 'B', day: '2026-02-14', net: 9e7 }, bigOrder: { id: 'A', day: '2026-03-02', net: 12_500_000 }, streak: { id: 'A', days: 40, end: '2026-03-31' }, mktOrders: [{ month: '2026-03', id: 'B', orders: 30 }, { month: '2026-03', id: 'A', orders: 20 }] } });
  const keys = (id: string) => book[id].map((b) => b.key);
  assert.ok(keys('A').includes('orders-2') && keys('A').includes('net-2'), 'A: Vàng 1.000 đơn, 1 tỷ');
  assert.ok(keys('A').includes('fast-orders-2'), 'A nhanh nhất tới 1.000 đơn');
  assert.ok(!keys('B').includes('fast-orders-2'));
  assert.ok(keys('A').includes('streak'));
  // Quán quân: 01/2026 A (B không có tháng đó), 02/2026 B (5e8 > 4e8), 03/2026 A; 2025 là của B; tháng 04 đang chạy không tính.
  assert.equal(book.A.find((b) => b.key === 'champion')?.label, 'Quán quân tháng ×2');
  assert.equal(book.B.find((b) => b.key === 'champion')?.label, 'Quán quân tháng ×3');
  assert.equal(book.A.find((b) => b.key === 'top3')?.label, 'Top 3 tháng ×1');
  assert.ok(keys('B').includes('best-day'));
  assert.equal(book.B[0].key, 'best-month'); // xếp: kỷ lục trước, B có tháng 5e8 cao nhất phòng
  // Giải mở rộng: đơn to nhất, chuỗi ngày, Vua chốt đơn (A 50%, 45%, 42% các tháng), Chiến thần số MKT tháng 03 là B.
  assert.ok(keys('A').includes('big-order') && keys('A').includes('streak-days'));
  assert.equal(book.A.find((b) => b.key === 'king-rate')?.label, 'Vua chốt đơn ×3');
  assert.equal(book.B.find((b) => b.key === 'king-mkt')?.label, 'Chiến thần số MKT ×1');
  assert.ok(keys('C').includes('king-resale'));
  // CSKH: doanh số tăng liền 3 tháng (2 lần tăng) → Bền bỉ; 180 đơn, 180 triệu → Đồng.
  assert.ok(['champion', 'streak', 'orders-0', 'net-0', 'best-month'].every((k) => keys('C').includes(k))); // một mình phòng CSKH nên hạng 1 mọi tháng
  assert.equal(book.C.find((b) => b.key === 'streak')?.label, 'Doanh số tăng liền 3 tháng');
  assert.equal(moneyLabel(1e9), '1 tỷ');
  assert.equal(moneyLabel(5e8), '500 triệu');
});

void test('hồ sơ: xếp hạng theo tháng và thành tích tốt nhất', () => {
  const ranks = rankByMonth([{ month: '2026-01', id: 'a', net: 5 }, { month: '2026-01', id: 'b', net: 9 }, { month: '2026-01', id: 'c', net: 0 }], 'a');
  assert.deepEqual(ranks.get('2026-01'), { rank: 2, of: 2 });
  const row = (month: string, net: number, orders: number, rate: number | null, rank: number | null) => ({ month, net, closedOrders: 0, orders, createdClosed: 0, rate, rank, of: 5 });
  const best = bestOf([row('2026-01', 10, 40, 50, 1), row('2026-02', 30, 10, 90, 4), row('2026-03', 20, 35, 45, 3)]);
  assert.equal(best.month?.month, '2026-02');
  assert.equal(best.rateMonth?.month, '2026-01'); // tháng 02 chỉ 10 đơn lên, không xét
  assert.deepEqual(best.topMonths.map((r) => r.month), ['2026-01', '2026-03']);
});

void test('badgeBook và staffProfile chạy được trên thế giới demo (câu SQL hợp lệ, có lưu theo ngày)', async () => {
  const { demoWorld } = await import('./support/d1-sqlite');
  const { badgeBook } = await import('../lib/reports/staff-badges');
  const { staffProfile } = await import('../lib/reports/staff-profile');
  const days = ['2026-11-03', '2026-11-04', '2026-11-05'];
  const { db } = await demoWorld(days, Date.parse('2026-11-05T10:00:00Z')) as unknown as { db: D1Database };
  const book = await badgeBook(db, '2026-11-05');
  assert.equal(book.day, '2026-11-05');
  assert.ok(Object.keys(book.people).length > 0);
  const again = await badgeBook(db, '2026-11-05');
  assert.deepEqual(again, book);
  const seller = (await db.prepare("SELECT seller_id FROM stats_daily WHERE seller_id<>'' AND closed_orders>0 LIMIT 1").first<{ seller_id: string }>())!.seller_id;
  const p = await staffProfile(db, seller, '2026-11-05');
  assert.ok(p.months.length >= 1 && p.firstOrderDay !== null);
  assert.ok(Array.isArray(p.badges));
});
