import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { oldOrderStatements } from './support/g2-old-orders';
import { loadStored, orderStatements, syncRecent, syncBackfill, type ShopRow } from '../lib/pancake/sync';
import { setPancakeTransport, type SourceOrder } from '../lib/pancake/pancake';
import { markDirtyOrder, rebuildStats, type DirtyBuckets } from '../lib/reports/stats';
import { markDirtyCustomer, rebuildCustomerStats, type DirtyCustomers } from '../lib/reports/customer-stats';

const at = '2026-10-15T02:00:00';
const base = (): SourceOrder => ({
  id: 'g2', inserted_at: at, updated_at: at, status: 0,
  bill_phone_number: '0900000001', assigning_seller: { id: 'seller-a' },
  total_price: 100, total_price_after_sub_discount: 100,
  items: [{ product_id: 'product-a', quantity: 1, variation_info: { name: 'Hàng ảo', retail_price: 100 } }],
});
type Statement = D1PreparedStatement & { sql: string; args: (string | number | null)[] };
const sqls = (s: D1PreparedStatement[]) => (s as Statement[]).map((v) => v.sql);
async function changes(db: D1Database, o: SourceOrder, now = at) {
  return orderStatements(db, 'p', '1', o, now, (await loadStored(db, 'p', [o])).get(`p:${o.id}`));
}
async function apply(db: D1Database, statements: D1PreparedStatement[]) {
  return (await db.batch(statements)).reduce((n, r) => n + Number(r.meta.rows_written ?? 0), 0);
}

void test('G2: lặp nguyên trang không ghi; trạng thái chỉ UPDATE cột đổi, không ghi hàng', async () => {
  const { db } = emptyDb();
  const o = base();
  await apply(db, await changes(db, o));
  assert.equal(await apply(db, await changes(db, o, '2026-10-18')), 0);
  o.status = 1; o.updated_at = '2026-10-16T03:00:00';
  o.status_history = [{ old_status: 0, status: 1, updated_at: o.updated_at, editor_id: 'seller-a' }];
  const statements = await changes(db, o, '2026-10-18');
  assert.equal(statements.length, 1);
  const columns = sqls(statements)[0].match(/SET (.*) WHERE/)![1].split(',').map((c) => c.split('=')[0]).sort();
  assert.deepEqual(columns, ['updated_at', 'status_code', 'first_confirmed_at', 'first_confirmed_by', 'status_history_json', 'fetched_at', 'last_status_at', 'raw_json', 'first_closed_at'].sort());
});

void test('G2: thêm/bớt/sửa hàng chỉ ghi đúng một INSERT/DELETE/UPDATE theo id', async () => {
  const { db } = emptyDb(); const o = base();
  await apply(db, await changes(db, o));
  for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
    if (operation === 'INSERT') o.items!.push({ product_id: 'product-b', quantity: 2 });
    if (operation === 'UPDATE') o.items![1].quantity = 3;
    if (operation === 'DELETE') o.items!.pop();
    const statements = await changes(db, o);
    const items = sqls(statements).filter((s) => s.includes('raw_pos_order_items'));
    assert.equal(items.length, 1); assert.ok(items[0].startsWith(operation));
    if (operation !== 'INSERT') assert.match(items[0], /WHERE id=\?/);
    await apply(db, statements);
  }
});

void test('G2: giữ COALESCE và mốc chốt/gửi sớm nhất giống SQL cũ', async () => {
  const { db, raw } = emptyDb(); const o = base();
  o.status = 3;
  o.status_history = [{ status: 1, updated_at: '2026-10-16T02:00:00', editor_id: 'seller-a' }, { status: 3, updated_at: '2026-10-17T02:00:00' }];
  await apply(db, await changes(db, o));
  for (const day of ['14', '18']) {
    o.status_history = [{ status: 1, updated_at: `2026-10-${day}T02:00:00`, editor_id: 'seller-b' }, { status: 3, updated_at: `2026-10-${day}T03:00:00` }];
    await apply(db, await changes(db, o));
    const row = raw.prepare('SELECT first_closed_at,first_confirmed_at,first_confirmed_by,first_sent_at FROM raw_pos_orders').get();
    assert.deepEqual({ ...row }, { first_closed_at: '2026-10-14T02:00:00', first_confirmed_at: '2026-10-16T02:00:00', first_confirmed_by: 'seller-a', first_sent_at: '2026-10-14T03:00:00' });
  }
});

void test('G2: toàn bộ bảng và số dòng ghi của chuỗi mới/trạng thái/người bán/bớt hàng giống cách cũ', async (t) => {
  const old = emptyDb(), next = emptyDb();
  const o = base(); o.items!.push({ product_id: 'product-b', quantity: 2 });
  let before = 0, after = 0;
  const tables = ['raw_pos_orders', 'raw_pos_order_items', 'customer_stats', 'customer_seller_stats',
    ...old.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stats_daily%'").all().map((r) => String(r.name))];
  for (let step = 0; step < 4; step++) {
    o.updated_at = `2026-10-${15 + step}T03:00:00`;
    if (step === 1) { o.status = 1; o.status_history = [{ status: 1, updated_at: o.updated_at }]; }
    if (step === 2) o.assigning_seller = { id: 'seller-b' };
    if (step === 3) o.items!.pop();
    for (const [instance, legacy] of [[old, true], [next, false]] as const) {
      const dirty: DirtyBuckets = new Map(), customers: DirtyCustomers = new Map();
      markDirtyOrder(dirty, 'p', o); markDirtyCustomer(customers, 'p', o.bill_phone_number);
      const writes = await apply(instance.db, legacy ? oldOrderStatements(instance.db, 'p', '1', o, at) : await changes(instance.db, o));
      const total = writes + await rebuildStats(instance.db, dirty) + await rebuildCustomerStats(instance.db, customers);
      if (legacy) before += total; else after += total;
    }
    for (const table of tables) {
      const rows = (instance: typeof old) => instance.raw.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((r) => {
        const row = { ...r }; delete row.fetched_at;
        if (table !== 'raw_pos_orders' && table !== 'raw_pos_order_items') delete row.updated_at;
        return row;
      });
      assert.deepEqual(rows(next), rows(old), `${table}, bước ${step}`);
    }
  }
  assert.ok(after < before); t.diagnostic(`SQLite changes (không gồm chỉ mục): ${before} -> ${after}`);
});

void test('G2: recent và backfill lặp trang ghi 0 đơn/hàng/số liệu, vẫn giữ ghi chú', async () => {
  for (const backfill of [false, true]) {
    const { raw, db } = emptyDb(); const o = base();
    o.customer = { id: 'customer-fake', notes: [{ id: 'note-fake', created_at: 1792029600, message: 'Ghi chú ảo' }] };
    raw.exec("INSERT INTO pos_shops (id,name,shop_id,enabled) VALUES ('p','p','1',1)");
    setPancakeTransport(async () => Response.json({ success: true, data: [o], total_entries: 1 }));
    const shop = { id: 'p', shop_id: '1', enabled: 1, cursor: null, last_sync_at: null, users_synced_at: null, products_synced_at: null } as ShopRow;
    const run = () => backfill ? syncBackfill(db, shop, 'fake', { month: '2026-10', page: 1 }, 1) : syncRecent(db, shop, 'fake', 1);
    await run();
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM customer_notes').get()!.n, 1);
    const statements: string[] = [];
    const batch = db.batch.bind(db);
    db.batch = ((list: D1PreparedStatement[]) => { statements.push(...sqls(list)); return batch(list); }) as typeof db.batch;
    assert.equal((await run()).records, 0);
    assert.equal(statements.filter((s) => /(?:INSERT|UPDATE|DELETE)[\s\S]*?(?:raw_pos_order|stats_daily|customer_stats|customer_seller_stats)/i.test(s)).length, 0);
  }
});

void test('G2: loadStored chia khối 90 id và đọc hàng qua idx_raw_items_order', async () => {
  const { raw, db } = emptyDb(); const reads: string[] = [];
  const prepare = db.prepare.bind(db);
  db.prepare = ((sql: string) => { reads.push(sql); return prepare(sql); }) as typeof db.prepare;
  await loadStored(db, 'p', Array.from({ length: 181 }, (_, id) => ({ id })));
  assert.equal(reads.length, 6);
  assert.deepEqual(reads.map((sql) => (sql.match(/\?/g) ?? []).length), [90, 90, 90, 90, 1, 1]);
  assert.ok(reads[0].includes('raw_json'));
  const plan = raw.prepare('EXPLAIN QUERY PLAN SELECT * FROM raw_pos_order_items WHERE order_id IN (?)').all('p:g2');
  assert.ok(plan.some((r) => String(r.detail).includes('idx_raw_items_order')));
});

void test('G2: đổi ngày/người bán/SĐT đánh dấu cả bản cũ và mới cho recent/backfill', async () => {
  for (const backfill of [false, true]) {
    const { raw, db } = emptyDb(); const o = base();
    o.status = 1; o.status_history = [{ status: 1, updated_at: at }];
    raw.exec("INSERT INTO pos_shops (id,name,shop_id,enabled) VALUES ('p','p','1',1)");
    setPancakeTransport(async () => Response.json({ success: true, data: [o], total_entries: 1 }));
    const shop = { id: 'p', shop_id: '1', enabled: 1, cursor: null, last_sync_at: null, users_synced_at: null, products_synced_at: null } as ShopRow;
    const run = () => backfill ? syncBackfill(db, shop, 'fake', { month: '2026-10', page: 1 }, 1) : syncRecent(db, shop, 'fake', 1);
    await run();
    o.inserted_at = '2026-10-16T02:00:00'; o.updated_at = '2026-10-17T02:00:00';
    o.status_history = [{ status: 1, updated_at: '2026-10-14T02:00:00' }];
    o.assigning_seller = { id: 'seller-b' }; o.bill_phone_number = '0900000002';
    await run();
    assert.deepEqual(raw.prepare('SELECT phone FROM customer_stats').all().map((r) => r.phone), ['0900000002']);
    assert.deepEqual(raw.prepare('SELECT seller_id FROM customer_seller_stats').all().map((r) => r.seller_id), ['seller-b']);
    // Một lần dựng lại đầy đủ các ngày và SĐT liên quan phải không sửa số nào nữa.
    const writes = await rebuildStats(db, new Map([['p', new Set(['2026-10-14', '2026-10-15', '2026-10-16'])]]))
      + await rebuildCustomerStats(db, new Map([['p', new Set(['0900000001', '0900000002'])]]));
    assert.equal(writes, 0);
  }
});
