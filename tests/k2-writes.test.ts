import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { env } from 'cloudflare:workers';
import { emptyDb } from './support/d1-sqlite';
import { SHOPS, dayData, toSourceOrder } from '../lib/demo/world';
import { fakePancake } from '../lib/demo/fake-pancake';
import { setPancakeTransport } from '../lib/pancake';
import * as currentSync from '../lib/sync';
import * as currentCustomers from '../lib/customers-sync';
import * as currentHr from '../lib/hr-sync';
import * as currentDispatch from '../lib/dispatch';

void test('K2: three demo days and 24 hours of all sync stages, HR and dispatch preserve tables and reduce estimated writes', { timeout: 1800000 }, async (t) => {
  const directory = new URL('./support/old-write-path-k2/', import.meta.url);
  const files = ['sync', 'hr-sync', 'dispatch', 'stats', 'customers-sync', 'customer-stats'];
  mkdirSync(directory, { recursive: true });
  try {
    for (const file of files) {
      const path = new URL(`${file}.ts`, directory);
      let source = existsSync(path) ? readFileSync(path, 'utf8') : execFileSync('git', ['show', `fad5bb7:lib/${file}.ts`], { encoding: 'utf8' });
      source = source.replace(/from ['"]@\/lib\/([^'"]+)['"]/g, (_all, name: string) =>
        `from '${files.includes(name) ? './' + name : '../../../lib/' + name}'`);
      writeFileSync(new URL(`${file}.ts`, directory), source);
    }
    // Variable URL keeps temporary historical modules outside the persistent typecheck graph.
    const legacySync = await import(new URL('sync.ts', directory).href) as typeof currentSync;
    const legacyCustomers = await import(new URL('customers-sync.ts', directory).href) as typeof currentCustomers;
    const legacyHr = await import(new URL('hr-sync.ts', directory).href) as typeof currentHr;
    const legacyDispatch = await import(new URL('dispatch.ts', directory).href) as typeof currentDispatch;
    const start = Date.parse('2026-10-18T00:00:00Z');
    t.mock.timers.enable({ apis: ['Date'], now: start });
    setPancakeTransport(async (url, init) => {
      const [status, body] = fakePancake(init.method ?? 'GET', url);
      return Response.json(body, { status });
    });
    const run = async (sync: typeof currentSync, hr: typeof currentHr, dispatch: typeof currentDispatch, customers: typeof currentCustomers) => {
      let stage = 'seed';
      const writes: Record<string, number> = { seed: 0, orders: 0, items: 0, stats: 0, customers: 0, syncState: 0, hr: 0, dispatch: 0, users: 0, products: 0, customersRecent: 0, customersBackfill: 0 };
      const fixture = emptyDb({ DEMO_MODE: '1' }, { estimateIndexes: true, onWrite: (sql, n) => {
        const bucket = stage !== 'recent' ? stage : /(?:INTO|UPDATE|FROM) raw_pos_orders\b/.test(sql) ? 'orders'
          : /(?:INTO|UPDATE|FROM) raw_pos_order_items\b/.test(sql) ? 'items'
          : /(?:INTO|UPDATE|FROM) stats_/.test(sql) ? 'stats'
          : /(?:INTO|UPDATE|FROM) customer_/.test(sql) ? 'customers' : 'syncState';
        writes[bucket] += n;
      } });
      Object.assign(env, { PANCAKE_POS_API_KEY: 'synthetic-demo' });
      t.mock.timers.setTime(start);
      for (const shop of SHOPS) {
        await fixture.db.prepare("INSERT INTO pos_shops (id,name,shop_id,status,enabled,last_sync_at,recent_watermark) VALUES (?,?,?,'connected',1,?,?)")
          .bind(shop.posId, shop.posId, shop.shopId, new Date(start).toISOString(), new Date(start).toISOString()).run();
        for (const day of ['2026-10-15', '2026-10-16', '2026-10-17']) {
          for (const order of dayData(shop.posId, day).orders) {
            const source = toSourceOrder(order, start);
            if (source) await fixture.db.batch(sync.orderStatements(fixture.db, shop.posId, shop.shopId, source, new Date(start).toISOString()));
          }
        }
      }
      for (let minute = 0; minute < 1440; minute++) {
        t.mock.timers.setTime(start + minute * 60000);
        if (minute % 5 === 0) {
          stage = 'recent';
          for (const shop of SHOPS) {
            const row = await sync.loadShop(fixture.db, shop.posId);
            assert.ok(row);
            await sync.syncRecent(fixture.db, row, 'synthetic-demo', 100);
          }
        }
        if (minute % 5 === 0) {
          stage = 'customersRecent';
          for (const shop of SHOPS) await customers.syncCustomersRecent(fixture.db, (await sync.loadShop(fixture.db, shop.posId))!, 'synthetic-demo');
        }
        if (minute % 180 === 0) {
          stage = 'customersBackfill';
          for (const shop of SHOPS) {
            let cursor: Parameters<typeof customers.syncCustomersBackfill>[3] = { page: 1 };
            for (let batch = 0; ; batch++) {
              assert.ok(batch < 1000, 'customer walk must finish');
              const result = await customers.syncCustomersBackfill(fixture.db, (await sync.loadShop(fixture.db, shop.posId))!, 'synthetic-demo', cursor, 12);
              cursor = result.cursor;
              if (result.completed) break;
            }
          }
        }
        if (minute % 60 === 0) {
          for (const shop of SHOPS) {
            stage = 'users';
            await sync.syncUsers(fixture.db, (await sync.loadShop(fixture.db, shop.posId))!, 'synthetic-demo');
            stage = 'products';
            await sync.syncProducts(fixture.db, (await sync.loadShop(fixture.db, shop.posId))!, 'synthetic-demo');
          }
          stage = 'hr';
          assert.equal((await hr.pullHr()).error, null);
        }
        stage = 'dispatch';
        await dispatch.runDispatch(new Date());
      }
      const tables = ['pos_users', 'pos_products', 'pos_customers', 'customer_notes', 'raw_pos_orders', 'raw_pos_order_items', 'customer_stats', 'customer_seller_stats',
        ...fixture.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'stats_daily%' OR name LIKE 'hr_%') ORDER BY name").all().map((r) => String(r.name))];
      const snapshots = Object.fromEntries(tables.map((table) => [table, fixture.raw.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map((r) => {
        const row = { ...r }; delete row.fetched_at;
        if (table.startsWith('stats_') || table === 'customer_stats' || table === 'customer_seller_stats') delete row.updated_at;
        return row;
      })]));
      fixture.raw.close();
      return { writes, snapshots };
    };
    const before = await run(legacySync, legacyHr, legacyDispatch, legacyCustomers);
    const after = await run(currentSync, currentHr, currentDispatch, currentCustomers);
    const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(total(after.writes) < total(before.writes));
    assert.ok(total(after.writes) - after.writes.seed < total(before.writes) - before.writes.seed);
    t.diagnostic(JSON.stringify({ before: before.writes, after: after.writes }));
    // Report only table/column counts, never record contents, even on a regression.
    const differences: Record<string, { rows: number; columns: Record<string, number> }> = {};
    for (const table of Object.keys(before.snapshots)) {
      const oldRows = before.snapshots[table], newRows = after.snapshots[table];
      const columns: Record<string, number> = {};
      let rows = 0;
      for (let i = 0; i < Math.max(oldRows.length, newRows.length); i++) {
        if (isDeepStrictEqual(oldRows[i], newRows[i])) continue;
        rows++;
        for (const column of new Set([...Object.keys(oldRows[i] ?? {}), ...Object.keys(newRows[i] ?? {})])) {
          if (!isDeepStrictEqual(oldRows[i]?.[column], newRows[i]?.[column])) columns[column] = (columns[column] ?? 0) + 1;
        }
      }
      if (rows) differences[table] = { rows, columns };
    }
    t.diagnostic(JSON.stringify({ differences }));
    assert.deepEqual(differences, {}, 'K2: final tables must match the baseline');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    setPancakeTransport(async () => { throw new Error('Pancake transport closed'); });
  }
});

