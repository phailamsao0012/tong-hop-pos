import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { env } from 'cloudflare:workers';
import { emptyDb } from './support/d1-sqlite';
import { SHOPS, dayData, toSourceOrder } from '../lib/demo/world';
import { fakePancake } from '../lib/demo/fake-pancake';
import { setPancakeTransport } from '../lib/pancake';
import * as currentSync from '../lib/sync';
import * as currentHr from '../lib/hr-sync';
import * as currentDispatch from '../lib/dispatch';

void test('K1: index estimate is opt-in and counts only indexes touched by SET', async () => {
  const counts: number[] = [];
  const { db, raw } = emptyDb({}, { estimateIndexes: true, onWrite: (_sql, n) => counts.push(n) });
  const indexes = raw.prepare("PRAGMA index_list('pos_shops')").all().length;
  await db.prepare("INSERT INTO pos_shops (id,name) VALUES ('meter','demo')").run();
  assert.equal(counts.pop(), 1 + indexes);
  await db.prepare("UPDATE pos_shops SET name='changed' WHERE id='meter'").run();
  assert.equal(counts.pop(), 1);
  await db.prepare("UPDATE pos_shops SET id='meter2' WHERE id='meter'").run();
  assert.equal(counts.pop(), 2);
  await db.prepare("DELETE FROM pos_shops WHERE id='absent'").run();
  assert.equal(counts.pop(), 0);
  await db.prepare("DELETE FROM pos_shops WHERE id='meter2'").run();
  assert.equal(counts.pop(), 1 + indexes);
  const plain = emptyDb();
  assert.equal((await plain.db.prepare("INSERT INTO pos_shops (id,name) VALUES ('plain','demo')").run()).meta.rows_written, 1);
  raw.close(); plain.raw.close();
});

void test('K1: three demo days and 24 hours of sync, HR and dispatch preserve tables and reduce estimated writes', { timeout: 600000 }, async (t) => {
  const directory = new URL('./support/old-write-path/', import.meta.url);
  const files = ['sync', 'hr-sync', 'dispatch', 'stats'];
  mkdirSync(directory, { recursive: true });
  try {
    for (const file of files) {
      const fixture = new URL(`./fixtures/fad5bb7/${file}.ts.txt`, import.meta.url);
      assert.ok(existsSync(fixture), `thiếu tests/fixtures/fad5bb7/${file}.ts.txt`);
      let source = readFileSync(fixture, 'utf8');
      source = source.replace(/from ['"]@\/lib\/([^'"]+)['"]/g, (_all, name: string) =>
        `from '${files.includes(name) ? './' + name : '../../../lib/' + name}'`);
      writeFileSync(new URL(`${file}.ts`, directory), source);
    }
    // Variable URL keeps temporary historical modules outside the persistent typecheck graph.
    const legacySync = await import(new URL('sync.ts', directory).href) as typeof currentSync;
    const legacyHr = await import(new URL('hr-sync.ts', directory).href) as typeof currentHr;
    const legacyDispatch = await import(new URL('dispatch.ts', directory).href) as typeof currentDispatch;
    const start = Date.parse('2026-10-18T00:00:00Z');
    t.mock.timers.enable({ apis: ['Date'], now: start });
    setPancakeTransport(async (url, init) => {
      const [status, body] = fakePancake(init.method ?? 'GET', url);
      return Response.json(body, { status });
    });
    const run = async (sync: typeof currentSync, hr: typeof currentHr, dispatch: typeof currentDispatch) => {
      let stage = 'seed';
      const writes: Record<string, number> = { seed: 0, orders: 0, items: 0, stats: 0, customers: 0, syncState: 0, hr: 0, dispatch: 0 };
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
        if (minute % 60 === 0) {
          stage = 'hr';
          assert.equal((await hr.pullHr()).error, null);
        }
        stage = 'dispatch';
        await dispatch.runDispatch(new Date());
      }
      const tables = ['raw_pos_orders', 'raw_pos_order_items', 'customer_stats', 'customer_seller_stats',
        ...fixture.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'stats_daily%' OR name LIKE 'hr_%') ORDER BY name").all().map((r) => String(r.name))];
      const snapshots = Object.fromEntries(tables.map((table) => [table, fixture.raw.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map((r) => {
        const row = { ...r }; delete row.fetched_at;
        if (table !== 'raw_pos_orders' && table !== 'raw_pos_order_items') delete row.updated_at;
        return row;
      })]));
      fixture.raw.close();
      return { writes, snapshots };
    };
    const before = await run(legacySync, legacyHr, legacyDispatch);
    const after = await run(currentSync, currentHr, currentDispatch);
    assert.deepEqual(after.snapshots, before.snapshots);
    const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(total(after.writes) < total(before.writes));
    t.diagnostic(JSON.stringify({ before: before.writes, after: after.writes }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
    setPancakeTransport(async () => { throw new Error('Pancake transport closed'); });
  }
});

