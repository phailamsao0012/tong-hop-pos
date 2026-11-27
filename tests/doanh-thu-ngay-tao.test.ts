// Doanh thu theo ngày tạo đơn + Doanh thu đã nhận (anh Vũ 27/11/2026, plan phần A, B). Chạy báo cáo thật trên D1 giả (node:sqlite), số ảo.
// Đơn tạo 23:30 ngày 30/09 (giờ VN), chốt 07:00 ngày 01/10 phải tính cho 30/09 (tháng 9), không tính cho 01/10 (tháng 10).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from 'cloudflare:workers';
import { demoWorld } from './support/d1-sqlite';
import { rebuildStats, resetSegmentReadyMemo, SEGMENT_READY_KEY, SEGMENT_READY_VALUE, revenueDate } from '../lib/reports/stats';
import { closedDate, EMPTY_ORDER_FILTERS } from '../lib/pancake/order-segments';
import { teamSubquery } from '../lib/teams/team';
import { overviewReport } from '../lib/reports/overview-report';
import { sectionsReport } from '../lib/reports/sections-report';
import { kpiDayReport } from '../lib/kpi/kpi-day-report';
import type { DatabaseSync } from 'node:sqlite';

const D30 = '2026-09-30', D01 = '2026-10-01';
const AMOUNT = 777000; // số ảo, dễ nhận
const vn = (s: string) => Date.parse(`${s}+07:00`);

async function world() {
  resetSegmentReadyMemo();
  const { raw, db } = await demoWorld([D30, D01], Date.parse('2026-10-02T03:00:00Z'));
  const seller = raw.prepare(`SELECT seller_id AS id, pos_id AS pos FROM raw_pos_orders WHERE seller_id IN ${teamSubquery('sale')} LIMIT 1`).get() as { id: string; pos: string } | undefined;
  assert.ok(seller, 'thế giới demo có người bán thuộc Sale');
  return { raw, db, seller };
}
/** Thêm đơn ảo tạo 30/09 23:30 VN, chốt 01/10 07:00 VN, đang ở Đã nhận (3), rồi tính lại bảng tính sẵn hai ngày đó. */
async function addLateClosed(raw: DatabaseSync, db: D1Database, seller: { id: string; pos: string }) {
  raw.prepare(`INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,fetched_at,created_at,first_closed_at,first_confirmed_at,seller_assigned_at,
    seller_id,marketer_id,tags_json,status_code,current_total,total_discount,net_total,shipping_fee,cod,phone)
    VALUES ('test-late-close',?,'demo','test-late-close','2026-10-02T00:00:00','2026-09-30T16:30:00','2026-10-01T00:00:00','2026-10-01T00:00:00','2026-09-30T16:30:00',
    ?,NULL,'[]',3,?,0,?,0,?,'0900000000')`).run(seller.pos, seller.id, AMOUNT, AMOUNT, AMOUNT);
  await rebuildStats(db, new Map([[seller.pos, new Set([D30, D01])]]));
}
/** So hai báo cáo không phụ thuộc thứ tự dòng (bảng nhân viên sắp theo doanh thu, dòng bằng nhau có thể đổi chỗ). */
const sorted = (c: Awaited<ReturnType<typeof overviewReport>>['current']) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => JSON.stringify(x)).sort() : v]));
const overview = (pos: string, day: string) => overviewReport({ posIds: [pos], start: day, end: day });
const setReady = (raw: DatabaseSync) => {
  raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(SEGMENT_READY_KEY, SEGMENT_READY_VALUE, D30);
  resetSegmentReadyMemo();
};

void test('một chỗ quyết định: doanh thu xếp theo ngày tạo đơn', () => {
  assert.equal(revenueDate('o.'), 'o.created_at');
  assert.equal(closedDate(EMPTY_ORDER_FILTERS, 'o.'), 'o.created_at');
});

void test('Tổng quan: đơn tạo 30/09 chốt 01/10 tính cho 30/09, cả khi đọc đơn gốc lẫn bảng tính sẵn; DT đã nhận ≤ doanh thu, tổng dòng = ô', async () => {
  const { raw, db, seller } = await world();
  try {
    const before30 = await overview(seller.pos, D30), before01 = await overview(seller.pos, D01);
    await addLateClosed(raw, db, seller);
    const raw30 = await overview(seller.pos, D30), raw01 = await overview(seller.pos, D01);
    assert.equal(raw30.current.total.closedNet - before30.current.total.closedNet, AMOUNT, 'doanh thu 30/09 tăng đúng đơn mới');
    assert.equal(raw30.current.total.closedOrders - before30.current.total.closedOrders, 1);
    assert.equal(raw30.current.total.receivedNet - before30.current.total.receivedNet, AMOUNT, 'đơn Đã nhận vào DT đã nhận 30/09');
    assert.equal(raw01.current.total.closedNet, before01.current.total.closedNet, 'ngày chốt 01/10 không đổi');
    assert.equal(raw01.current.total.receivedNet, before01.current.total.receivedNet);
    // Bảng tính sẵn (đã dựng lại theo ngày tạo) ra đúng số như đọc đơn gốc.
    setReady(raw);
    const pre30 = await overview(seller.pos, D30), pre01 = await overview(seller.pos, D01);
    assert.deepEqual(sorted(pre30.current), sorted(raw30.current), 'bảng tính sẵn = đơn gốc (30/09)');
    assert.deepEqual(sorted(pre01.current), sorted(raw01.current), 'bảng tính sẵn = đơn gốc (01/10)');
    // Cả kỳ 30/09–01/10, mọi POS: DT đã nhận ≤ doanh thu ở mọi dòng; cộng các POS = ô đầu trang; tỷ lệ chốt không vượt 100%.
    const all = await overviewReport({ posIds: [], start: D30, end: D01, team: 'sale' });
    const t = all.current.total;
    assert.ok(t.receivedNet > 0 && t.receivedNet <= t.closedNet);
    for (const r of [...all.current.byPos, ...all.current.byEmployee, ...all.current.byEmployeePos, ...all.current.series])
      assert.ok(r.receivedNet <= r.closedNet && r.receivedOrders <= r.closedOrders && r.closedOrders <= r.orders, JSON.stringify([r.receivedNet, r.closedNet, r.closedOrders, r.orders]));
    assert.equal(all.current.byPos.reduce((n, r) => n + r.receivedNet, 0), t.receivedNet, 'cộng các POS = ô DT đã nhận');
    assert.equal(all.current.byPos.reduce((n, r) => n + r.closedNet, 0), t.closedNet, 'cộng các POS = ô doanh thu');
    assert.equal(all.current.series.reduce((n, r) => n + r.receivedNet, 0), t.receivedNet, 'cộng các ngày = ô DT đã nhận');
  } finally { resetSegmentReadyMemo(); raw.close(); }
});

void test('Tổng quan 4 mục (Sale): đơn tạo 30/09 chốt 01/10 tính cho 30/09; DT đã nhận ≤ doanh thu', async () => {
  const { raw, db, seller } = await world();
  try {
    const p = new URLSearchParams({ team: 'all' });
    const s30 = await sectionsReport(p, [seller.pos], D30, D30, null as never), s01 = await sectionsReport(p, [seller.pos], D01, D01, null as never);
    await addLateClosed(raw, db, seller);
    const a30 = await sectionsReport(p, [seller.pos], D30, D30, null as never), a01 = await sectionsReport(p, [seller.pos], D01, D01, null as never);
    assert.equal(a30.sale.net - s30.sale.net, AMOUNT);
    assert.equal(a30.sale.receivedNet - s30.sale.receivedNet, AMOUNT);
    assert.equal(a01.sale.net, s01.sale.net);
    for (const s of [a30, a01]) for (const m of [s.sale, s.cskh, s.other]) assert.ok(m.receivedNet <= m.net);
    // Tỷ lệ chốt: tử số cùng nhóm đơn tạo trong kỳ.
    assert.ok(a30.sale.closedNow <= a30.sale.created);
  } finally { raw.close(); }
});

void test('Báo cáo sếp: báo cáo sáng 01/10 (trọn ngày 30/09) có đơn tạo 30/09 chốt 7h 01/10; ngày 01/10 không có', async () => {
  const { raw, db, seller } = await world();
  try {
    const { bossReportData } = await import('../lib/zalo/boss-data');
    const b30 = await bossReportData(D01, '08', true, vn('2026-10-01T08:00:00'), db);
    const b01 = await bossReportData('2026-10-02', '08', true, vn('2026-10-02T08:00:00'), db);
    await addLateClosed(raw, db, seller);
    const a30 = await bossReportData(D01, '08', true, vn('2026-10-01T08:00:00'), db);
    const a01 = await bossReportData('2026-10-02', '08', true, vn('2026-10-02T08:00:00'), db);
    assert.equal(a30.day, D30);
    assert.equal(a30.sale.kpi.todayNet - b30.sale.kpi.todayNet, AMOUNT, 'Sale 30/09 có đơn mới');
    assert.equal(a30.company.net - b30.company.net, AMOUNT, 'tổng công ty 30/09 có đơn mới');
    assert.equal(a01.sale.kpi.todayNet, b01.sale.kpi.todayNet, 'ngày chốt 01/10 không có đơn đó');
    assert.equal(a01.sale.kpi.monthNet, b01.sale.kpi.monthNet, 'tháng 10 không có đơn tạo tháng 9');
  } finally { raw.close(); }
});

void test('KPI ngày: "Đã đạt" tháng 9 có đơn tạo 30/09 chốt 01/10, tháng 10 không có', async (t) => {
  const { raw, db, seller } = await world();
  try {
    Object.assign(env, { DB: db });
    let now = vn('2026-09-30T23:50:00');
    t.mock.method(Date, 'now', () => now);
    const achieved = async () => (await kpiDayReport([seller.pos])).depts.sale.byPos[0].achieved;
    const sep0 = await achieved();
    now = vn('2026-10-01T10:00:00');
    const oct0 = await achieved();
    await addLateClosed(raw, db, seller);
    now = vn('2026-09-30T23:50:00');
    assert.equal(await achieved() - sep0, AMOUNT, 'tháng 9 cộng đơn tạo 30/09');
    now = vn('2026-10-01T10:00:00');
    assert.equal(await achieved(), oct0, 'tháng 10 không đổi');
  } finally { raw.close(); }
});

void test('MKT: DT New theo ngày tạo đơn (đơn tạo 30/09, xác nhận 01/10 tính cho 30/09); Marketing: DT đã nhận ≤ doanh thu', async () => {
  const { raw, db } = await world();
  try {
    const { MKT_STAFF } = await import('../lib/teams/team');
    const { mktAnalytics } = await import('../lib/reports/mkt-analytics');
    const { marketingOverview } = await import('../lib/reports/marketing-overview');
    const pick = raw.prepare(`SELECT marketer_id AS m, seller_id AS s, pos_id AS pos FROM raw_pos_orders WHERE marketer_id IN ${MKT_STAFF} AND seller_id IN ${teamSubquery('sale')} LIMIT 1`).get() as { m: string; s: string; pos: string } | undefined;
    assert.ok(pick, 'thế giới demo có đơn MKT do Sale chốt');
    const newNet = async (day: string) => (await mktAnalytics({ posIds: [pick.pos], start: day, end: day, db })).current.newNet;
    const b30 = await newNet(D30), b01 = await newNet(D01);
    raw.prepare(`INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,fetched_at,created_at,first_closed_at,first_confirmed_at,seller_assigned_at,
      seller_id,marketer_id,tags_json,status_code,current_total,total_discount,net_total,shipping_fee,cod,phone)
      VALUES ('test-mkt-late','${pick.pos}','demo','test-mkt-late','2026-10-02T00:00:00','2026-09-30T16:30:00','2026-10-01T00:00:00','2026-10-01T00:00:00','2026-09-30T16:30:00',
      ?,?,'[]',3,?,0,?,0,?,'0900000001')`).run(pick.s, pick.m, AMOUNT, AMOUNT, AMOUNT);
    assert.equal(await newNet(D30) - b30, AMOUNT, 'DT New 30/09 có đơn mới');
    assert.equal(await newNet(D01), b01, 'ngày xác nhận 01/10 không đổi');
    const m = await marketingOverview({ role: 'owner' } as never, new URLSearchParams({ stage: 'confirmed', team: 'all' }), [pick.pos], D30, D01, null);
    assert.equal(m!.basis, 'created', 'mặc định theo ngày tạo đơn');
    for (const r of [m!.summary, ...m!.byMarketer, ...m!.byTeam]) {
      assert.ok(r.receivedNet <= r.net, 'DT đã nhận ≤ doanh thu theo mốc');
      assert.ok(r.newReceivedNet <= r.newNet, 'DT đã nhận New ≤ DT chốt New');
    }
    assert.ok(m!.summary.newReceivedNet >= AMOUNT, 'đơn Đã nhận vào DT đã nhận');
  } finally { raw.close(); }
});

void test('statsDailySource: bảng chưa sẵn sàng thì đọc bảng ảo từ đơn gốc, ra đúng số bảng tính sẵn; sẵn sàng thì đọc bảng thật', async () => {
  const { raw, db } = await world();
  try {
    const { statsDailySource } = await import('../lib/pancake/order-segments');
    const { POS } = await import('../lib/shared/report-model');
    const { countedFilter } = await import('../lib/teams/team');
    const posIds = POS.map((p) => p.id), ph = posIds.map(() => '?').join(',');
    const sql = `SELECT pos_id, day, seller_id, SUM(closed_orders) AS c, SUM(closed_net) AS net, SUM(received_net) AS rec, SUM(orders) AS o FROM stats_daily
      WHERE pos_id IN (${ph}) AND day>=? AND day<=?${countedFilter('seller_id')} GROUP BY 1,2,3 ORDER BY 1,2,3`;
    const src = await statsDailySource(db, posIds, D30, D01);
    assert.match(src.sql, /segment_orders/);
    const virtual = raw.prepare(src.sql + sql).all(...src.binds, ...posIds, D30, D01);
    const table = raw.prepare(sql).all(...posIds, D30, D01);
    assert.ok(table.length > 0);
    assert.deepEqual(virtual, table);
    setReady(raw);
    assert.deepEqual(await statsDailySource(db, posIds, D30, D01), { sql: '', binds: [] });
  } finally { resetSegmentReadyMemo(); raw.close(); }
});
