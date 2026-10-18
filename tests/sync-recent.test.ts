// Đồng bộ đơn vừa sửa theo mốc nước (rủi ro 1, QA 11/10/2026 điểm 4–6): D1 giả (node:sqlite) + Pancake giả sửa được đơn giữa hai trang.
// Đặt giờ máy là giờ VN để bắt lỗi đọc giờ Pancake (không múi giờ) thành giờ địa phương.
process.env.TZ = 'Asia/Ho_Chi_Minh';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { emptyDb } from './support/d1-sqlite';
import { installFakeOrders, type FakeOrders } from './support/fake-orders';
import { listOrdersPage } from '../lib/pancake';
import { DEFAULT_BUDGET, loadShop, runScheduledSync, syncRecent, type ShopRow } from '../lib/sync';

const POS_ID = 'sieu-vo-gao';
const MIN = 60000;
let raw: DatabaseSync, db: D1Database, fake: FakeOrders;

beforeEach(() => {
  ({ raw, db } = emptyDb());
  fake = installFakeOrders('1');
  raw.prepare("INSERT INTO pos_shops (id,name,shop_id,status,enabled) VALUES (?,?,'1','connected',1)").run(POS_ID, POS_ID);
});

const setShop = (cols: { last_sync_at?: string | null; recent_watermark?: string | null; recent_cursor?: string | null }) =>
  raw.prepare('UPDATE pos_shops SET last_sync_at=?,recent_watermark=?,recent_cursor=? WHERE id=?')
    .run(cols.last_sync_at ?? null, cols.recent_watermark ?? null, cols.recent_cursor ?? null, POS_ID);
const shop = async () => (await loadShop(db, POS_ID)) as ShopRow;
const shopRow = () => ({ ...raw.prepare('SELECT last_sync_at,recent_watermark,recent_cursor FROM pos_shops WHERE id=?').get(POS_ID) }) as
  { last_sync_at: string | null; recent_watermark: string | null; recent_cursor: string | null };
/** Số đơn của Pancake giả mà D1 chưa có đúng bản mới nhất (thiếu đơn hoặc updated_at cũ). */
const missing = () => {
  const stored = new Map((raw.prepare('SELECT source_order_id,updated_at FROM raw_pos_orders WHERE pos_id=?').all(POS_ID) as { source_order_id: string; updated_at: string }[])
    .map((r) => [r.source_order_id, r.updated_at]));
  return [...fake.orders.keys()].filter((id) => stored.get(String(id)) !== fake.updatedAt(id)).length;
};
const sec = (ms: number) => Math.floor(ms / 1000) * 1000;

void test('G6: gần 800 nghìn bỏ lịch sử, giữ nguyên đơn mới và giảm dòng ghi', async () => {
  const { POS } = await import('../lib/report-model');
  const now = new Date();
  const run = async (backfillCap: number) => {
    const fixture = emptyDb();
    const source = installFakeOrders('1');
    source.orders.set(1, now.getTime() - MIN);
    for (const [i, p] of POS.entries()) fixture.raw.prepare("INSERT INTO pos_shops (id,name,shop_id,status,enabled,users_synced_at,products_synced_at) VALUES (?,?,?,'connected',?,?,?)")
      .run(p.id, p.id, String(i + 1), p.id === POS_ID ? 1 : 0, now.toISOString(), now.toISOString());
    fixture.raw.prepare('UPDATE pos_shops SET recent_watermark=? WHERE id=?').run(new Date(now.getTime() - 5 * MIN).toISOString(), POS_ID);
    const result = await runScheduledSync({ DB: fixture.db, PANCAKE_POS_API_KEY: 'k' } as Cloudflare.Env, now, 50000, { ...DEFAULT_BUDGET, writesUsed: 799_999, backfillCap });
    const rows = fixture.raw.prepare('SELECT * FROM raw_pos_orders ORDER BY id').all().map(({ fetched_at: _fetched, ...r }) => r);
    const items = fixture.raw.prepare('SELECT * FROM raw_pos_order_items ORDER BY id').all();
    fixture.raw.close();
    return { result, rows, items };
  };
  const before = await run(3_500_000);
  const after = await run(DEFAULT_BUDGET.backfillCap);
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(after.items, before.items);
  assert.equal(after.rows.length, 1);
  assert.ok(after.result.stages.recent > 0);
  assert.equal(after.result.stages.backfill, 0);
  assert.equal(after.result.stages.customers_backfill, 0);
  const writes = (r: typeof after) => Object.values(r.result.stages).reduce((a, b) => a + b, 0);
  assert.ok(writes(after) < writes(before));
  console.log(`G6 fixture rows_written: ${writes(before)} -> ${writes(after)}`);
});

void test('1.200 đơn một POS sửa trong 5 phút: lượt 1 đọc 10 trang chưa hết, lượt 2 đọc nốt, 0 đơn sót', async () => {
  const now = Date.now();
  for (let i = 1; i <= 1200; i++) fake.orders.set(i, now - 10 * MIN + i * 250);
  setShop({ last_sync_at: new Date(now - 15 * MIN).toISOString() }); // POS cũ, chưa có cột mốc nước: lấy last_sync_at làm mốc
  const r1 = await syncRecent(db, await shop(), 'k', 10);
  assert.equal(r1.pages, 10);
  assert.equal(r1.caughtUp, false);
  assert.ok(missing() > 100, 'lượt 1 chưa đọc hết');
  assert.equal(shopRow().recent_cursor, '{}');
  assert.ok(Date.parse(shopRow().recent_watermark!) < now - 5 * MIN, 'mốc dừng ở đơn đã đọc, không nhảy tới giờ chạy');
  assert.equal(shopRow().last_sync_at, r1.fetchedAt, 'last_sync_at vẫn là giờ chạy');
  const r2 = await syncRecent(db, await shop(), 'k', 10);
  assert.equal(r2.caughtUp, true);
  assert.equal(missing(), 0);
  assert.deepEqual(shopRow(), { last_sync_at: r2.fetchedAt, recent_watermark: r2.fetchedAt, recent_cursor: null });
});

void test('đơn bị sửa giữa hai trang: lật page_number sót đơn, đọc theo mốc không sót', async () => {
  const now = Date.now();
  const reset = () => { fake.orders.clear(); for (let i = 1; i <= 300; i++) fake.orders.set(i, now - 60 * MIN + i * 7000); };
  // Trước lần lấy trang 2: 10 đơn của trang 1 bị sửa, nhảy xuống cuối danh sách.
  const editPage1 = (n: number) => { if (n === 2) for (let i = 1; i <= 10; i++) fake.edit(i, now - 3 * MIN + i); };
  // Cách cũ (lật page_number cố định cửa sổ): kiểm Pancake giả tái hiện được lỗi.
  reset();
  fake.before = editPage1;
  const seen = new Set<number>();
  for (let page = 1; page <= 3; page++) {
    const r = await listOrdersPage('1', 'k', { page_size: '100', page_number: String(page), updateStatus: 'updated_at', option_sort: 'last_updated_order_asc',
      startDateTime: String(Math.floor((now - 61 * MIN) / 1000)), endDateTime: String(Math.floor(now / 1000) + 3600) });
    for (const o of r.data!) seen.add(Number(o.id));
  }
  assert.equal(300 - seen.size, 10, 'lật page_number bỏ qua 10 đơn');
  // Cách mới.
  reset();
  fake.calls.clear();
  fake.before = editPage1;
  setShop({ last_sync_at: new Date(now - 70 * MIN).toISOString(), recent_watermark: new Date(sec(now - 61 * MIN)).toISOString(), recent_cursor: '{}' });
  const r = await syncRecent(db, await shop(), 'k', 10);
  assert.equal(r.caughtUp, true);
  assert.equal(missing(), 0);
});

void test('hơn 100 đơn cùng một giây, có đơn bị sửa khi đang lật trang: không lặp, không sót', async () => {
  const now = Date.now();
  const s = sec(now - 30 * MIN);
  for (let i = 1; i <= 250; i++) fake.orders.set(i, s + i); // cùng một giây, phần lẻ khác nhau
  for (let i = 251; i <= 300; i++) fake.orders.set(i, s + (i - 240) * 1000);
  // Lần gọi 1–2: trang thường, tới trang toàn đơn cùng một giây → lật trang trong giây đó (gọi 3 = trang 1 của giây).
  // Trước lần gọi 4 (trang 2 của giây): 5 đơn trang 1 bị sửa, rời khỏi giây, các đơn sau dịch lên.
  fake.before = (n) => { if (n === 4) for (let i = 1; i <= 5; i++) fake.edit(i, now - 5 * MIN + i * 1000); };
  setShop({ last_sync_at: new Date(now - 40 * MIN).toISOString(), recent_watermark: new Date(s - MIN).toISOString(), recent_cursor: '{}' });
  const r = await syncRecent(db, await shop(), 'k', 20);
  assert.equal(r.caughtUp, true);
  assert.ok(r.pages < 20, `dừng đúng lúc (${r.pages} trang)`);
  assert.equal(missing(), 0);
});

void test('giây có 350 đơn lớn hơn trần trang: lưu vị trí lật trang, lượt sau đi tiếp, đơn sửa giữa hai lượt không làm sót', async () => {
  const now = Date.now();
  const s = sec(now - 40 * MIN);
  for (let i = 1; i <= 350; i++) fake.orders.set(i, s + i);
  setShop({ last_sync_at: new Date(now - 5 * MIN).toISOString(), recent_watermark: new Date(s).toISOString(), recent_cursor: '{}' });
  const r1 = await syncRecent(db, await shop(), 'k', 2);
  assert.equal(r1.caughtUp, false);
  assert.deepEqual(shopRow().recent_watermark, new Date(s).toISOString());
  assert.deepEqual(JSON.parse(shopRow().recent_cursor!), { offset: 100, total: 350 });
  for (let i = 1; i <= 10; i++) fake.edit(i, now - 4 * MIN + i * 1000); // giữa hai lượt: 10 đơn đầu giây bị sửa
  let runs = 1, last = r1;
  while (!last.caughtUp && runs < 10) { last = await syncRecent(db, await shop(), 'k', 2); runs++; }
  assert.equal(last.caughtUp, true);
  assert.equal(missing(), 0);
});

void test('Pancake lỗi ở trang 2: trang 1 đã ghi, mốc dừng ở trang 1; lượt sau đọc nốt', async () => {
  const now = Date.now();
  const first = now - 60 * MIN;
  for (let i = 1; i <= 250; i++) fake.orders.set(i, first + i * 3000);
  setShop({ last_sync_at: new Date(now - 70 * MIN).toISOString(), recent_watermark: new Date(sec(first)).toISOString(), recent_cursor: '{}' });
  fake.failAt = 2;
  await assert.rejects(syncRecent(db, await shop(), 'k', 10));
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM raw_pos_orders').get() as { n: number }).n, 100);
  assert.deepEqual(shopRow(), {
    last_sync_at: new Date(now - 70 * MIN).toISOString(),
    recent_watermark: new Date(sec(fake.orders.get(100)!)).toISOString(), recent_cursor: '{}',
  });
  fake.failAt = null;
  const r = await syncRecent(db, await shop(), 'k', 10);
  assert.equal(r.caughtUp, true);
  assert.equal(missing(), 0);
});

void test('ban đêm không có đơn sửa: vẫn theo kịp, mốc = giờ chạy (độ trễ 0), không báo trễ giả', async () => {
  const now = Date.now();
  setShop({ last_sync_at: new Date(now - 5 * MIN).toISOString(), recent_watermark: new Date(now - 5 * MIN).toISOString() });
  const r = await syncRecent(db, await shop(), 'k', 10);
  assert.equal(r.caughtUp, true);
  assert.equal(r.records, 0);
  assert.deepEqual(shopRow(), { last_sync_at: r.fetchedAt, recent_watermark: r.fetchedAt, recent_cursor: null });
  assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM sync_runs').get() as { n: number }).n, 0);
});

void test('giờ Pancake đọc là UTC (máy đặt giờ VN), mốc không vượt quá giờ hiện tại', async () => {
  assert.equal(new Date().getTimezoneOffset(), -420, 'máy test đang ở giờ VN');
  const now = Date.now();
  const first = sec(now - 60 * MIN);
  for (let i = 1; i <= 150; i++) fake.orders.set(i, first + i * 1000 + 123); // "…:SS.123000", không hậu tố Z
  assert.match(fake.updatedAt(100), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.123000$/);
  setShop({ last_sync_at: new Date(now - 70 * MIN).toISOString(), recent_watermark: new Date(first).toISOString(), recent_cursor: '{}' });
  await syncRecent(db, await shop(), 'k', 1);
  assert.equal(shopRow().recent_watermark, new Date(first + 100 * 1000).toISOString());
  // Đơn có giờ sửa ở tương lai (đồng hồ Pancake lệch): mốc vẫn không vượt giờ hiện tại.
  fake.orders.clear();
  for (let i = 1; i <= 150; i++) fake.orders.set(i, now + 10 * MIN + i * 1000);
  await syncRecent(db, await shop(), 'k', 1);
  assert.ok(Date.parse(shopRow().recent_watermark!) <= Date.now());
  assert.equal(shopRow().recent_cursor, '{}');
});

void test('bộ hẹn giờ: nhánh bị khoá ghi giữ 3 trang mỗi POS, nhánh thường lên 10', async () => {
  const now = Date.now();
  const { POS } = await import('../lib/report-model');
  POS.forEach((p, i) => raw.prepare("INSERT INTO pos_shops (id,name,shop_id,status,enabled) VALUES (?,?,?,'connected',1) ON CONFLICT(id) DO NOTHING").run(p.id, p.id, String(i + 1)));
  for (let i = 1; i <= 2000; i++) fake.orders.set(i, now - 30 * MIN + i * 500);
  setShop({ last_sync_at: new Date(now - 31 * MIN).toISOString(), recent_watermark: new Date(sec(now - 31 * MIN)).toISOString(), recent_cursor: '{}' });
  const env = { DB: db, PANCAKE_POS_API_KEY: 'k' } as unknown as Cloudflare.Env;
  const measured = await runScheduledSync(env, new Date(), 30000, { writesUsed: 0, backfillCap: 0, hardCap: 200000, recentPages: 3 });
  assert.ok(measured.stages.recent > 0);
  assert.deepEqual(Object.keys(measured.stages).sort(), ['backfill', 'customers', 'customers_backfill', 'products', 'recent', 'users']);
  assert.equal(measured.stages.backfill, 0);
  assert.equal(measured.sizeBytes, null);
  assert.equal(fake.calls.get('1'), 3);
  fake.calls.clear();
  await runScheduledSync(env, new Date(), 50000, { writesUsed: 0, backfillCap: 0, hardCap: 200000 });
  assert.equal(fake.calls.get('1'), 10);
});
