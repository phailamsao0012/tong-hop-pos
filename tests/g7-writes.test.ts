import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from 'cloudflare:workers';
import { emptyDb } from './support/d1-sqlite';
import { syncUsers, syncProducts, syncRecent, syncBackfill, loadStored, orderStatements, type ShopRow } from '../lib/sync';
import { syncCustomersRecent, syncCustomersBackfill, customerStatements, changedCustomers, noteStatements } from '../lib/customers-sync';
import { rebuildCustomerStats } from '../lib/customer-stats';
import { rebuildStats } from '../lib/stats';
import { pullHr } from '../lib/hr-sync';
import { hrSnapshot } from '../lib/demo/world';
import { setPancakeTransport, type SourceCustomer, type SourceOrder } from '../lib/pancake';
import { rebuildCustomerStats as oldRebuild } from './support/g7-old-customer-stats';
import { customerStatements as oldCustomer } from './support/g7-old-customers';
import { syncUsers as oldUsers, syncProducts as oldProducts } from './support/g7-old-catalog';

const at = '2026-10-18T03:00:00Z';
const shop: ShopRow = { id: 'p', shop_id: '1', enabled: 1, cursor: null, last_sync_at: null, users_synced_at: null, products_synced_at: null };
const phone = '0900000001'; // Số ảo chỉ dùng trong test.
const order = (id = 'o'): SourceOrder => ({ id, inserted_at: '2026-10-17T02:00:00', updated_at: '2026-10-17T03:00:00', status: 1,
  bill_phone_number: phone, assigning_seller: { id: 'seller-a' }, total_price: 100, total_price_after_sub_discount: 100,
  customer: { id: 'c', name: 'Khách ảo' }, items: [{ product_id: 'product-a', quantity: 1, variation_info: { name: 'Hàng ảo', retail_price: 100 } }] });
const customer = (): SourceCustomer => ({ id: 'c', name: 'Khách ảo', phone_numbers: [phone], assigned_user_id: 'seller-a',
  inserted_at: '2026-10-17T01:00:00', updated_at: '2026-10-17T03:00:00', order_count: 1, succeed_order_count: 0, purchased_amount: 0,
  tags: ['Ảo'], notes: [{ id: 'n1', message: 'Ghi chú ảo', created_at: 1792202400 }] });

function fixture() {
  const log: { sql: string; rows: number }[] = [];
  const instance = emptyDb({ DEMO_MODE: '' }, { estimateIndexes: true, onWrite: (sql, rows) => log.push({ sql, rows }) });
  instance.raw.exec("INSERT INTO pos_shops (id,name,shop_id,enabled) VALUES ('p','POS ảo','1',1)");
  return { ...instance, log };
}
const dataWrites = (log: { sql: string; rows: number }[]) => log.filter((r) => !/^(?:UPDATE pos_shops|INSERT INTO sync_runs)/.test(r.sql)).reduce((n, r) => n + r.rows, 0);
const totalWrites = (log: { rows: number }[]) => log.reduce((n, r) => n + r.rows, 0);
const tables = ['customer_stats', 'customer_seller_stats', 'pos_customers', 'pos_users', 'pos_products'];
function snapshot(instance: ReturnType<typeof fixture>, table: string) {
  return instance.raw.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((r) => {
    const row = { ...r }; delete row.fetched_at;
    if (table !== 'pos_customers') delete row.updated_at;
    return row;
  });
}
async function saveOrder(db: D1Database, o: SourceOrder) {
  await db.batch(orderStatements(db, 'p', '1', o, at, (await loadStored(db, 'p', [o])).get(`p:${o.id}`)));
}

void test('G7: mỗi khâu lặp nguồn không đổi ghi 0 dòng dữ liệu, kể cả danh sách thiếu ghi chú', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const f = fixture(); t.after(() => f.raw.close());
  const c = customer(), o = order();
  setPancakeTransport(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/load_customer_notes')) return Response.json({ notes: [...c.notes!, { id: 'n2', message: 'Ghi chú ảo bổ sung', created_at: 1792202500 }] });
    if (path.endsWith('/customers')) return Response.json({ success: true, data: [c], total_entries: 1 });
    if (path.endsWith('/users')) return Response.json({ success: true, data: [{ user_id: 'seller-a', user: { name: 'Nhân viên ảo' }, is_active: true }] });
    if (path.endsWith('/variations')) return Response.json({ success: true, data: [{ id: 'v', product_id: 'product-a', name: 'Hàng ảo', retail_price: 100 }], total_entries: 1 });
    return Response.json({ success: true, data: [o], total_entries: 1 });
  });
  Object.assign(env, { HR_SHARED_SECRET: 'synthetic-test-value', CRM_URL: 'https://hr.invalid', HR: { fetch: async () => Response.json(hrSnapshot()) } });
  const runs: [string, () => Promise<unknown>][] = [
    ['syncUsers', () => syncUsers(f.db, shop, 'fake')], ['syncProducts', () => syncProducts(f.db, shop, 'fake')],
    ['syncCustomersRecent', () => syncCustomersRecent(f.db, shop, 'fake')],
    ['syncCustomersBackfill', () => syncCustomersBackfill(f.db, shop, 'fake', { page: 1, windowEnd: 1792300000, total: 1 }, 1)],
    ['syncRecent', () => syncRecent(f.db, shop, 'fake', 1)],
    ['syncBackfill', () => syncBackfill(f.db, shop, 'fake', { month: '2026-10', page: 1 }, 1)],
    ['rebuildStats', () => rebuildStats(f.db, new Map([['p', new Set(['2026-10-17'])]]))],
    ['rebuildCustomerStats', () => rebuildCustomerStats(f.db, new Map([['p', new Set([phone])]]))],
    ['pullHr', () => pullHr()],
  ];
  for (const [name, run] of runs) {
    await run(); f.log.length = 0;
    t.mock.timers.tick(1000);
    await run();
    assert.equal(dataWrites(f.log), 0, name);
    t.diagnostic(`${name}: dữ liệu=0, trạng thái=${totalWrites(f.log)} (ước lượng gồm chỉ mục)`);
  }
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM customer_notes').get()!.n, 2);
});

void test('G7: chuỗi đổi phân công/ghi chú/giao/hoàn giống cách cũ và giảm ghi chỉ mục', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const old = fixture(), next = fixture(); t.after(() => { old.raw.close(); next.raw.close(); });
  const c = customer(), o = order();
  let userName = 'Nhân viên ảo', price = 100;
  setPancakeTransport(async (url) => new URL(String(url)).pathname.endsWith('/users')
    ? Response.json({ success: true, data: [{ user_id: 'seller-a', user: { name: userName }, inserted_at: '2026-10-01T00:00:00' }] })
    : Response.json({ success: true, data: [{ id: 'v', product_id: 'product-a', name: 'Hàng ảo', retail_price: price }], total_entries: 1 }));
  let before = 0, after = 0;
  for (let step = 0; step < 6; step++) {
    if (step === 1) { c.assigned_user_id = 'seller-b'; o.assigning_seller = { id: 'seller-b' }; userName += ' sửa'; }
    if (step === 2) { c.notes!.push({ id: 'n2', message: 'Chăm sóc ảo', created_at: 1792202600 }); price = 110; }
    if (step === 3) { o.status = 3; c.succeed_order_count = 1; c.purchased_amount = 100; }
    if (step === 4) { o.status = 4; c.succeed_order_count = 0; c.purchased_amount = 0; }
    for (const [f, legacy] of [[old, true], [next, false]] as const) {
      f.log.length = 0;
      await saveOrder(f.db, o);
      if (legacy) await f.db.batch(oldCustomer(f.db, 'p', c, at));
      else {
        const stored = new Map<string, Record<string, string | number | null>>();
        for (const row of await changedCustomers(f.db, 'p', [c], stored)) await f.db.batch(customerStatements(f.db, 'p', row, at, stored.get('p:c')));
      }
      await (legacy ? oldUsers : syncUsers)(f.db, shop, 'fake');
      await (legacy ? oldProducts : syncProducts)(f.db, shop, 'fake');
      await (legacy ? oldRebuild : rebuildCustomerStats)(f.db, new Map([['p', new Set([phone])]]));
      if (legacy) before += dataWrites(f.log); else after += dataWrites(f.log);
      if (step === 5 && !legacy) assert.equal(dataWrites(f.log), 0);
    }
    for (const table of tables) assert.deepEqual(snapshot(next, table), snapshot(old, table), `${table}, bước ${step}`);
  }
  assert.ok(after < before); t.diagnostic(`Chuỗi thay đổi, gồm chỉ mục: ${before} -> ${after}`);
  for (const f of [old, next]) {
    f.raw.exec('DELETE FROM raw_pos_orders; DELETE FROM raw_pos_order_items');
    await (f === old ? oldRebuild : rebuildCustomerStats)(f.db, new Map([['p', new Set([phone])]]));
  }
  for (const table of ['customer_stats', 'customer_seller_stats']) {
    assert.deepEqual(snapshot(next, table), []); assert.deepEqual(snapshot(old, table), []);
  }
});

void test('G7: số liệu khách chỉ SET cột đổi, giữ inserted_at và so đủ phones/last_order_at', async (t) => {
  const f = fixture(); t.after(() => f.raw.close()); const o = order();
  await saveOrder(f.db, o); const dirty = new Map([['p', new Set([phone])]]);
  await rebuildCustomerStats(f.db, dirty);
  f.raw.exec('UPDATE raw_pos_orders SET current_total=110,net_total=110'); f.log.length = 0;
  await rebuildCustomerStats(f.db, dirty);
  const update = f.log.find((r) => r.sql.startsWith('UPDATE customer_stats'))!;
  assert.match(update.sql, /^UPDATE customer_stats SET closed_net=\?,updated_at=\? WHERE id=\?$/);
  assert.equal(update.rows, 1);
  const c = customer(); await f.db.batch(customerStatements(f.db, 'p', c, at));
  c.inserted_at = '2026-10-18T00:00:00'; c.phone_numbers!.push('0900000002'); c.last_order_at = '2026-10-18T01:00:00';
  const stored = new Map<string, Record<string, string | number | null>>();
  const rows = await changedCustomers(f.db, 'p', [c], stored); assert.equal(rows.length, 1);
  f.log.length = 0; await f.db.batch(customerStatements(f.db, 'p', c, at, stored.get('p:c')));
  assert.match(f.log[0].sql, /^UPDATE pos_customers SET phones_json=\?,last_order_at=\?,fetched_at=\? WHERE id=\?$/);
  assert.equal(f.raw.prepare('SELECT inserted_at FROM pos_customers').get()!.inserted_at, '2026-10-17T01:00:00');
});

void test('G7: recent nhiều trang chỉ dựng số liệu cuối lượt, kể cả lỗi trang sau', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  for (const fail of [false, true]) {
    const f = fixture(); let calls = 0; let aggregated = false;
    const batch = f.db.batch.bind(f.db);
    f.db.batch = (async (list: D1PreparedStatement[]) => {
      if (list.some((s) => /FROM raw_pos_orders WHERE pos_id=\? AND phone IN/.test((s as unknown as { sql: string }).sql))) aggregated = true;
      return batch(list);
    }) as typeof f.db.batch;
    setPancakeTransport(async () => {
      calls++;
      if (calls >= 2) { assert.equal(aggregated, false); if (fail) throw new Error('synthetic page failure'); }
      const data = calls === 1 ? Array.from({ length: 100 }, (_, i) => order(String(i))) : [order('last')];
      return Response.json({ success: true, data, total_entries: 101 });
    });
    if (fail) await assert.rejects(syncRecent(f.db, shop, 'fake', 2), /synthetic page failure/);
    else await syncRecent(f.db, shop, 'fake', 2);
    const expected = fail ? 100 : 101;
    assert.equal(f.raw.prepare('SELECT orders FROM customer_stats').get()!.orders, expected);
    assert.equal(f.log.filter((r) => /^(?:INSERT INTO|UPDATE) customer_stats/.test(r.sql) && r.rows).length, 1);
    assert.equal(await rebuildStats(f.db, new Map([['p', new Set(['2026-10-17'])]])), 0);
    assert.equal(await rebuildCustomerStats(f.db, new Map([['p', new Set([phone])]])), 0);
    f.raw.close();
  }
});

void test('G7: ghi chú chưa có mã khách không ghi lại; khách mới trùng trang không lỗi', async (t) => {
  const f = fixture(); t.after(() => f.raw.close());
  const notes = customer().notes!;
  await f.db.batch(noteStatements(f.db, 'p', null, phone, notes, at, 'order'));
  f.log.length = 0;
  await f.db.batch(noteStatements(f.db, 'p', null, phone, notes, at, 'order'));
  assert.equal(totalWrites(f.log), 0);
  await f.db.batch(noteStatements(f.db, 'p', 'c', phone, notes, at, 'customer'));
  assert.equal(f.raw.prepare('SELECT customer_id FROM customer_notes').get()!.customer_id, 'c');
  const c = customer();
  await f.db.batch([...customerStatements(f.db, 'p', c, at), ...customerStatements(f.db, 'p', c, at)]);
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM pos_customers').get()!.n, 1);
  f.log.length = 0;
  await f.db.batch(noteStatements(f.db, 'p', 'other', phone, notes, at, 'customer'));
  assert.equal(totalWrites(f.log), 0); // Giữ đúng luật cũ khi mã khách đã có.
});

void test('G7: dựng ngày nhận thay đổi riêng tên hàng và dùng IS NOT cho mọi cột', async (t) => {
  const f = fixture(); t.after(() => f.raw.close());
  await saveOrder(f.db, order());
  const dirty = new Map([['p', new Set(['2026-10-17'])]]);
  await rebuildStats(f.db, dirty);
  f.raw.exec("UPDATE raw_pos_order_items SET name='Hàng ảo đổi tên'");
  f.log.length = 0;
  await rebuildStats(f.db, dirty);
  assert.equal(f.raw.prepare('SELECT name FROM stats_daily_product').get()!.name, 'Hàng ảo đổi tên');
  const upserts = f.log.filter((r) => r.sql.startsWith('INSERT INTO stats_daily'));
  assert.ok(upserts.length > 0);
  for (const { sql } of upserts) {
    const predicate = sql.split('WHERE ')[1];
    assert.ok(predicate.includes(' IS NOT ')); assert.ok(!predicate.includes('<>'));
  }
  assert.equal(await rebuildStats(f.db, dirty), 0);
});
