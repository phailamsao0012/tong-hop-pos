import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { emptyDb } from './support/d1-sqlite';
import * as sync from '../lib/sync';
import * as customers from '../lib/customers-sync';
import { setPancakeTransport, type SourceCustomer, type SourceOrder } from '../lib/pancake';
import { listCustomers, SHOPS } from '../lib/demo/world';

void test('G8: repeated existing/new customers and orders use the latest pending row at real page limits', async (t) => {
  const directory = new URL('./support/old-write-path-g8/', import.meta.url);
  const files = ['sync', 'customers-sync', 'stats', 'customer-stats'];
  mkdirSync(directory, { recursive: true });
  try {
    for (const file of files) {
      const path = new URL(`${file}.ts`, directory);
      const source = existsSync(path) ? readFileSync(path, 'utf8') : execFileSync('git', ['show', `fad5bb7:lib/${file}.ts`], { encoding: 'utf8' });
      writeFileSync(path, source.replace(/from ['"]@\/lib\/([^'"]+)['"]/g, (_all, name: string) => `from '${files.includes(name) ? './' + name : '../../../lib/' + name}'`));
    }
    const oldSync = await import(new URL('sync.ts', directory).href) as typeof sync;
    const oldCustomers = await import(new URL('customers-sync.ts', directory).href) as typeof customers;
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-18T10:00:00Z') });
    const at = '2026-10-17T02:00:00';
    const c = (id: string, step: number): SourceCustomer => ({ id, name: step === 1 ? 'Khách ảo B' : 'Khách ảo A', assigned_user_id: step === 1 ? 'seller-b' : 'seller-a',
      phone_numbers: ['0900000001'], inserted_at: step === 0 ? null : step === 1 ? at : '2026-10-18T02:00:00', updated_at: `2026-10-18T0${step}:00:00`, order_count: 1,
      notes: step === 1 ? [{ id: `${id}-note`, message: 'Ghi chú ảo', created_at: 1792202400 }] : [] });
    const o = (id: string, step: number): SourceOrder => ({ id, inserted_at: at, updated_at: `2026-10-18T0${step}:00:00`, status: step === 1 ? 3 : 1,
      bill_phone_number: '0900000001', total_price: 100, total_price_after_sub_discount: 100,
      assigning_seller: { id: step === 1 ? 'seller-b' : 'seller-a' },
      status_history: [{ status: 1, updated_at: step === 2 ? '2026-10-16T02:00:00' : at, editor_id: `editor-${step}` }, ...(step === 1 ? [{ status: 3, updated_at: at }] : [])],
      customer: { id: 'existing' }, items: [{ product_id: step === 1 ? 'item-b' : 'item-a', quantity: step === 1 ? 2 : 1 }] });
    for (const mode of ['customersRecent', 'customersBackfill', 'ordersBackfill', 'ordersRecent']) {
      const results = [];
      for (const legacy of [true, false]) {
        let writes = 0, reads = 0;
        const f = emptyDb({}, { estimateIndexes: true, onWrite: (_sql, n) => { writes += n; } });
        try {
          const s = legacy ? oldSync : sync, cs = legacy ? oldCustomers : customers;
          f.raw.exec("INSERT INTO pos_shops (id,name,shop_id,enabled) VALUES ('p','POS ảo','1',1)");
          await f.db.batch(cs.customerStatements(f.db, 'p', c('existing', 0), at));
          await f.db.batch(s.orderStatements(f.db, 'p', '1', o('existing', 0), at));
          writes = 0;
          const prepare = f.db.prepare.bind(f.db);
          f.db.prepare = ((sql: string) => { if (/^SELECT .* FROM (?:pos_customers|raw_pos_orders|raw_pos_order_items) WHERE (?:id|order_id) IN/.test(sql)) reads++; return prepare(sql); }) as typeof f.db.prepare;
          setPancakeTransport(async (url) => {
            const u = new URL(String(url));
            if (u.pathname.endsWith('/load_customer_notes')) return Response.json({ notes: [] });
            const page = Number(u.searchParams.get('page_number') ?? 1);
            const step = page < 3 ? 1 : 2;
            const rows = page > 3 ? [] : Array.from({ length: 100 }, (_, i) => u.pathname.endsWith('/customers') ? c(i % 2 ? 'new' : 'existing', step) : o(i % 2 ? 'new' : 'existing', step));
            return Response.json({ success: true, data: rows, total_entries: 300 });
          });
          const shop = (await s.loadShop(f.db, 'p'))!;
          if (mode === 'customersRecent') await cs.syncCustomersRecent(f.db, shop, 'fake');
          if (mode === 'customersBackfill') await cs.syncCustomersBackfill(f.db, shop, 'fake', { page: 1, total: 300, windowEnd: 1792317600 }, 12);
          if (mode === 'ordersBackfill') await s.syncBackfill(f.db, shop, 'fake', { month: '2026-10', page: 1 }, 10);
          if (mode === 'ordersRecent') await s.syncRecent(f.db, shop, 'fake', 3);
          const tables = ['pos_customers', 'customer_notes', 'raw_pos_orders', 'raw_pos_order_items', 'customer_stats', 'customer_seller_stats',
            ...f.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stats_daily%'").all().map((r) => String(r.name))];
          const snapshot = Object.fromEntries(tables.map((table) => [table, f.raw.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((r) => {
            const row = { ...r }; delete row.fetched_at;
            if (table.startsWith('stats_') || table.startsWith('customer_') && table !== 'customer_notes') delete row.updated_at;
            return row;
          })]));
          if (mode.startsWith('orders')) assert.ok(snapshot.customer_stats.length > 0, 'customer totals must be exercised');
          results.push({ snapshot, writes, reads });
        } finally { f.raw.close(); }
      }
      for (const table of Object.keys(results[0].snapshot)) assert.deepEqual(results[1].snapshot[table], results[0].snapshot[table], `${mode}: ${table}`);
      assert.ok(results[1].writes < results[0].writes, mode);
      assert.ok(results[1].reads <= (mode.startsWith('customers') ? 1 : 2), `${mode}: repeated IDs must not be read again`);
      t.diagnostic(`${mode}: estimated writes ${results[0].writes} -> ${results[1].writes}; stored reads ${results[1].reads}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
    setPancakeTransport(async () => { throw new Error('Transport closed'); });
  }
});

void test('G8: demo customer fields are identical across query windows and page sizes', () => {
  const now = Date.parse('2026-10-18T10:00:00Z'), posId = SHOPS[0].posId;
  const params = (size: number, from?: string) => new URLSearchParams({ page_size: String(size), ...(from ? { start_time_updated_at: String(Date.parse(from) / 1000), end_time_updated_at: String(now / 1000) } : {}) });
  const all = listCustomers(posId, params(500), now);
  const recent = listCustomers(posId, params(500, '2026-10-17T00:00:00Z'), now);
  assert.ok(recent.data.length > 0);
  for (const row of recent.data) assert.deepEqual(row, all.data.find((r) => r.id === row.id));
  assert.deepEqual(listCustomers(posId, params(1), now).data[0], all.data[0]);
  assert.equal(listCustomers(posId, params(1), now).total_entries, all.total_entries);
});
