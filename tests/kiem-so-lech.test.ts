// Kiểm số lệch giữa các trang (đánh giá 21/10/2026, kiểm lại trên main 05/11/2026). Chỉ TÁI HIỆN, không đổi cách tính:
// mỗi mục có một test "hiện trạng" (qua, ghi hai số đang lệch bằng số ảo) và một test "sau khi thống nhất" đánh dấu todo,
// chờ anh Vũ quyết (PR "Kiểm số lệch", mục "Cần anh Vũ quyết"). Tên người, SĐT, số tiền đều là ảo.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { markDirty, rebuildStats, type DirtyBuckets } from '../lib/reports/stats';
import { COUNTED_STAFF, teamSubquery } from '../lib/teams/team';
import { cskhAnalytics } from '../lib/reports/cskh-analytics';
import { GET as execGET } from '../app/api/reports/exec/route';
import { GET as sectionsGET } from '../app/api/reports/sections/route';
import { GET as overviewGET } from '../app/api/reports/overview/route';
import { GET as pancakeRefGET } from '../app/api/reports/pancake-ref/route';
import { GET as originGET } from '../app/api/reports/origin/route';

const POS_ID = 'thuy-san';
// "Bây giờ" = 05/11/2026 12:00 giờ Việt Nam (05:00 UTC). Giờ trên đơn ghi UTC không hậu tố như Pancake.
const NOW = Date.parse('2026-11-05T05:00:00Z');
const TODAY = '2026-11-05', MONTH_START = '2026-11-01';

type Person = { id: string; name: string; department: string };
type Order = { id: string; seller?: string; care?: string; marketer?: string; status: number; createdAt: string; closedAt?: string | null; confirmedAt?: string | null; net: number; phone?: string | null; item?: string };

/** D1 giả có một POS, các tài khoản POS và đơn ảo; dựng lại bảng tổng hợp ngày (stats_daily) như lượt đồng bộ. */
async function world(people: Person[], orders: Order[]) {
  mock.timers.enable({ apis: ['Date'], now: NOW });
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  const now = new Date(NOW).toISOString();
  raw.prepare("INSERT INTO pos_shops (id,name,status,enabled) VALUES (?,?,'connected',1)").run(POS_ID, POS_ID);
  for (const p of people) raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,is_active,fetched_at,department) VALUES (?,?,?,?,1,?,?)')
    .run(`${POS_ID}:${p.id}`, POS_ID, p.id, p.name, now, p.department);
  const dirty: DirtyBuckets = new Map();
  for (const o of orders) {
    raw.prepare(`INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,created_at,updated_at,status_code,seller_id,care_id,marketer_id,
        first_closed_at,first_confirmed_at,net_total,current_total,phone,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(o.id, POS_ID, '1', o.id, o.createdAt, o.createdAt, o.status, o.seller ?? null, o.care ?? null, o.marketer ?? null,
        o.closedAt ?? null, o.confirmedAt ?? null, o.net, o.net, o.phone ?? null, now);
    if (o.item) raw.prepare('INSERT INTO raw_pos_order_items (id,order_id,pos_id,name,quantity,line_total) VALUES (?,?,?,?,1,?)').run(`${o.id}-1`, o.id, POS_ID, o.item, o.net);
    for (const t of [o.createdAt, o.closedAt, o.confirmedAt]) markDirty(dirty, POS_ID, t);
  }
  await rebuildStats(db, dirty);
  await loginAs(raw, 'owner');
  return raw;
}
const done = () => mock.timers.reset();
const get = async (handler: (r: Request) => Promise<Response>, path: string, query: Record<string, string>) => {
  const res = await handler(new Request(`http://local${path}?${new URLSearchParams({ posIds: POS_ID, ...query })}`));
  assert.equal(res.status, 200, `${path} trả ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
};
type RefPos = { pancake?: { total: { revenue: number } }; web: { total: { revenue: number } } };
/** Cùng cách cộng với ô "Doanh thu công ty" (app/overview-sections.tsx refRevenue). */
const companyRevenue = (rows: RefPos[]) => rows.reduce((s, p) => s + (p.pancake ?? p.web).total.revenue, 0);
type Total = { closedNet: number; closedOrders: number };
/** Báo cáo overview: kỳ đang xem ở `current`, kỳ so sánh ở `compare`. */
const totalOf = (r: Record<string, unknown>, part: 'current' | 'compare') => (r[part] as { total: Total }).total;

const SALE: Person = { id: 'u-sale', name: 'Lan SALE', department: 'Sale' };
const CSKH: Person = { id: 'u-cskh', name: 'Mai CSKH', department: 'CSKH' };
const MKT: Person = { id: 'u-mkt', name: 'Hoa MKT', department: 'Marketing' };

// ---- Mục 1: Doanh thu công ty so kỳ trước không cắt cùng mốc giờ ----
// Hôm qua có 2 đơn (09:00 và 20:00), hôm nay 1 đơn lúc 09:00; bây giờ là 12:00. Người bán có hậu tố SALE nên hai trang cùng phạm vi người.
const day1 = async () => world([SALE], [
  { id: 'y1', seller: SALE.id, status: 1, createdAt: '2026-11-04T02:00:00', closedAt: '2026-11-04T02:00:00', confirmedAt: '2026-11-04T02:00:00', net: 100000 },
  { id: 'y2', seller: SALE.id, status: 1, createdAt: '2026-11-04T13:00:00', closedAt: '2026-11-04T13:00:00', confirmedAt: '2026-11-04T13:00:00', net: 100000 },
  { id: 't1', seller: SALE.id, status: 1, createdAt: '2026-11-05T02:00:00', closedAt: '2026-11-05T02:00:00', confirmedAt: '2026-11-05T02:00:00', net: 100000 },
]);

void test('Mục 1 hiện trạng: kỳ trước của Doanh thu công ty lấy trọn ngày, Tổng quan cắt ở cùng giờ', async () => {
  try {
    await day1();
    const ref = await get(pancakeRefGET, '/api/reports/pancake-ref', { start: TODAY, end: TODAY });
    const ov = await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, compare: 'previous', groupBy: 'day' });
    assert.equal(companyRevenue(ref.current as RefPos[]), 100000);
    assert.equal(totalOf(ov, 'current').closedNet, 100000);
    // Kỳ trước: Doanh thu công ty cộng cả đơn 20:00 hôm qua; Tổng quan chỉ tới 12:00 hôm qua.
    assert.equal(companyRevenue(ref.previous as RefPos[]), 200000);
    assert.equal(totalOf(ov, 'compare').closedNet, 100000);
  } finally { done(); }
});

void test('Mục 1 sau khi thống nhất: hai trang cùng kỳ trước', { todo: 'Chờ anh Vũ quyết: cắt kỳ trước của Doanh thu công ty ở cùng giờ' }, async () => {
  try {
    await day1();
    const ref = await get(pancakeRefGET, '/api/reports/pancake-ref', { start: TODAY, end: TODAY });
    const ov = await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, compare: 'previous', groupBy: 'day' });
    assert.equal(companyRevenue(ref.previous as RefPos[]), totalOf(ov, 'compare').closedNet);
  } finally { done(); }
});

// ---- Mục 2a: CSKH theo người bán hay người chăm sóc ----
// Đơn do người bán thuộc Sale lên, người chăm sóc thuộc CSKH.
const careWorld = async () => world([SALE, CSKH], [
  { id: 'a1', seller: SALE.id, care: CSKH.id, status: 1, createdAt: '2026-11-05T02:00:00', closedAt: '2026-11-05T02:00:00', confirmedAt: '2026-11-05T02:00:00', net: 120000, phone: '0000000001' },
]);
/** Tự ups & từ MKT: doanh số CSKH = tự ups + từ MKT của nhân viên CSKH trong phạm vi trang. */
const originCskh = (r: Record<string, unknown>) => { const t = r.total as { selfNet: number; mktNet: number }; return t.selfNet + t.mktNet; };

void test('Mục 2a hiện trạng: mặc định cùng theo người bán; tuỳ chọn "NV chăm sóc" và chữ định nghĩa ở Điều hành thì khác', async () => {
  try {
    await careWorld();
    const exec = await get(execGET, '/api/reports/exec', {});
    const cskh = (exec.teams as { key: string; current: { net: number } }[]).find((t) => t.key === 'cskh')!;
    const sections = await get(sectionsGET, '/api/reports/sections', { start: MONTH_START, end: TODAY });
    const bySeller = await get(originGET, '/api/reports/origin', { start: MONTH_START, end: TODAY });
    const byCare = await get(originGET, '/api/reports/origin', { start: MONTH_START, end: TODAY, by: 'care' });
    // Điều hành, 4 bảng Tổng quan POS, Tự ups & từ MKT (mặc định): đơn này không phải của CSKH.
    assert.equal(cskh.current.net, 0);
    assert.equal((sections.cskh as { net: number }).net, 0);
    assert.equal(originCskh(bySeller), 0);
    // Chọn "NV chăm sóc (trống thì người bán)": đơn về người CSKH.
    assert.equal(originCskh(byCare), 120000);
    // Chữ định nghĩa ở Điều hành vẫn ghi theo NV chăm sóc, trong khi số tính theo người bán.
    assert.match((exec.definitions as { teams: string }).teams, /CSKH = đơn có NV chăm sóc \(trống thì người bán\)/);
  } finally { done(); }
});

// ---- Mục 2b: Phân tích CSKH bỏ đơn không có SĐT ----
const phoneWorld = async () => world([CSKH], [
  { id: 'b1', seller: CSKH.id, status: 1, createdAt: '2026-11-05T02:00:00', closedAt: '2026-11-05T02:00:00', confirmedAt: '2026-11-05T02:00:00', net: 80000, phone: null },
  { id: 'b2', seller: CSKH.id, status: 1, createdAt: '2026-11-05T02:10:00', closedAt: '2026-11-05T02:10:00', confirmedAt: '2026-11-05T02:10:00', net: 50000, phone: '0000000002' },
]);

void test('Mục 2b hiện trạng: Phân tích CSKH bỏ đơn không SĐT, Tổng quan CSKH vẫn tính', async () => {
  try {
    await phoneWorld();
    const analytics = await cskhAnalytics({ posIds: [POS_ID], start: TODAY, end: TODAY, staffIds: [] });
    const ov = await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'cskh', groupBy: 'day' });
    assert.equal(analytics.total.net, 50000);
    assert.equal(totalOf(ov, 'current').closedNet, 130000);
  } finally { done(); }
});

void test('Mục 2b sau khi thống nhất: ô tổng của Phân tích CSKH bằng Tổng quan CSKH', { todo: 'Chờ anh Vũ quyết: ô tổng tính cả đơn không SĐT' }, async () => {
  try {
    await phoneWorld();
    const analytics = await cskhAnalytics({ posIds: [POS_ID], start: TODAY, end: TODAY, staffIds: [] });
    const ov = await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'cskh', groupBy: 'day' });
    assert.equal(analytics.total.net, totalOf(ov, 'current').closedNet);
  } finally { done(); }
});

// ---- Mục 3: MKT theo ngày chốt hay ngày xác nhận ----
// Đơn có Marketer, đang Chờ xác nhận (17): đã "chốt" theo cách Sale/CSKH, chưa "đã xác nhận" theo cách MKT.
const mktWorld = async () => world([SALE, MKT], [
  { id: 'k1', seller: SALE.id, marketer: MKT.id, status: 17, createdAt: '2026-11-05T02:00:00', closedAt: '2026-11-05T02:30:00', confirmedAt: null, net: 150000, phone: '0000000003' },
]);
const execMkt = (r: Record<string, unknown>) => (r.teams as { key: string; current: { orders: number; net: number } }[]).find((t) => t.key === 'mkt')!.current;

void test('Mục 3 hiện trạng: Điều hành tính MKT theo ngày chốt, Tổng quan POS / Marketing theo ngày xác nhận', async () => {
  try {
    await mktWorld();
    const exec = await get(execGET, '/api/reports/exec', {});
    const sections = await get(sectionsGET, '/api/reports/sections', { start: MONTH_START, end: TODAY });
    assert.deepEqual(execMkt(exec), { orders: 1, net: 150000 });
    const mkt = sections.mkt as { orders: number; net: number };
    assert.deepEqual([mkt.orders, mkt.net], [0, 0]);
  } finally { done(); }
});

void test('Mục 3 sau khi thống nhất: Số MKT ở Điều hành bằng MKT ở Tổng quan POS', { todo: 'Chờ anh Vũ quyết: MKT dùng first_confirmed_at ở mọi trang' }, async () => {
  try {
    await mktWorld();
    const exec = await get(execGET, '/api/reports/exec', {});
    const sections = await get(sectionsGET, '/api/reports/sections', { start: MONTH_START, end: TODAY });
    assert.equal(execMkt(exec).orders, (sections.mkt as { orders: number }).orders);
  } finally { done(); }
});

// ---- Mục 4: lọc "hậu tố" đang là "chứa chữ" ----
// Rosalee Trần: không có hậu tố, chỉ chứa chữ "sale" giữa tên, ở bộ phận Kho. Hà Rosalee CSKH: hậu tố CSKH nhưng tên chứa "sale".
const ROSA: Person = { id: 'u-rosa', name: 'Rosalee Trần', department: 'Kho' };
const ROSA_CSKH: Person = { id: 'u-rosa-cskh', name: 'Hà Rosalee CSKH', department: 'CSKH' };
const suffixWorld = async () => world([ROSA, ROSA_CSKH], [
  { id: 'r1', seller: ROSA.id, status: 1, createdAt: '2026-11-05T02:00:00', closedAt: '2026-11-05T02:00:00', confirmedAt: '2026-11-05T02:00:00', net: 70000, phone: '0000000004' },
  { id: 'r2', seller: ROSA_CSKH.id, status: 1, createdAt: '2026-11-05T02:20:00', closedAt: '2026-11-05T02:20:00', confirmedAt: '2026-11-05T02:20:00', net: 90000, phone: '0000000005' },
]);
const ids = (raw: Awaited<ReturnType<typeof world>>, sql: string) => (raw.prepare(sql).all() as { user_id: string }[]).map((r) => r.user_id).sort();

void test('Mục 4 hiện trạng: tên chứa "sale" vẫn được tính; một người vừa Sale vừa CSKH, số cộng hai lần', async () => {
  try {
    const raw = await suffixWorld();
    assert.deepEqual(ids(raw, `SELECT user_id FROM pos_users WHERE user_id IN ${COUNTED_STAFF}`), [ROSA.id, ROSA_CSKH.id]);
    assert.deepEqual(ids(raw, `SELECT user_id FROM ${teamSubquery('sale')} AS t`), [ROSA.id, ROSA_CSKH.id]);
    assert.deepEqual(ids(raw, `SELECT user_id FROM ${teamSubquery('cskh')} AS t`), [ROSA_CSKH.id]);
    const all = totalOf(await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, groupBy: 'day' }), 'current').closedNet;
    const sale = totalOf(await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'sale', groupBy: 'day' }), 'current').closedNet;
    const cskh = totalOf(await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'cskh', groupBy: 'day' }), 'current').closedNet;
    assert.deepEqual({ all, sale, cskh }, { all: 160000, sale: 160000, cskh: 90000 });
  } finally { done(); }
});

void test('Mục 4 sau khi thống nhất: chỉ tính đúng hậu tố, mỗi người một bộ phận', { todo: 'Chờ anh Vũ quyết: lọc theo hậu tố thật' }, async () => {
  try {
    const raw = await suffixWorld();
    assert.deepEqual(ids(raw, `SELECT user_id FROM pos_users WHERE user_id IN ${COUNTED_STAFF}`), [ROSA_CSKH.id]);
    const sale = totalOf(await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'sale', groupBy: 'day' }), 'current').closedNet;
    const cskh = totalOf(await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'cskh', groupBy: 'day' }), 'current').closedNet;
    assert.deepEqual({ sale, cskh }, { sale: 0, cskh: 90000 });
  } finally { done(); }
});

// ---- Mục 5 (đã sửa): bấm số ở Tổng quan POS khi đang lọc nhóm đơn ----
// Ô Sale của 4 bảng Tổng quan POS lọc nhóm Kháng sinh; Tổng quan Sale trước đây mở mọi nhóm nên số khác ô vừa bấm.
// Nay trang nhận nhóm đơn qua gợi ý điều hướng và gửi productSegment cho cùng báo cáo overview (app/team-overview-view.tsx).
const segWorld = async () => world([SALE], [
  { id: 'g1', seller: SALE.id, status: 1, createdAt: '2026-11-05T02:00:00', closedAt: '2026-11-05T02:00:00', confirmedAt: '2026-11-05T02:00:00', net: 110000, phone: '0000000006', item: 'Gentadox 100ml' },
  { id: 'h1', seller: SALE.id, status: 1, createdAt: '2026-11-05T02:40:00', closedAt: '2026-11-05T02:40:00', confirmedAt: '2026-11-05T02:40:00', net: 60000, phone: '0000000007', item: 'Men tiêu hoá' },
]);

void test('Mục 5: Tổng quan Sale nhận nhóm đơn thì khớp ô Sale vừa bấm ở Tổng quan POS', async () => {
  try {
    await segWorld();
    const clicked = (await get(sectionsGET, '/api/reports/sections', { start: TODAY, end: TODAY, productSegment: 'gentadox' })).sale as { net: number };
    const kept = totalOf(await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'sale', groupBy: 'day', compare: 'previous', productSegment: 'gentadox' }), 'current');
    const lost = totalOf(await get(overviewGET, '/api/reports/overview', { start: TODAY, end: TODAY, team: 'sale', groupBy: 'day', compare: 'previous' }), 'current');
    assert.equal(clicked.net, 110000);
    assert.equal(kept.closedNet, clicked.net);
    // Mất bộ lọc (cách cũ): Tổng quan Sale cộng cả nhóm Khác.
    assert.equal(lost.closedNet, 170000);
  } finally { done(); }
});
