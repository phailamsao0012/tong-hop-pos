import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { runScheduledSync } from '../lib/sync';
import { customerBackfillProgress, customerStatements, parseCustomerCursor, type CustomerCursor } from '../lib/customers-sync';
import { setPancakeTransport } from '../lib/pancake';
import { POS } from '../lib/report-model';

void test('G9: rewalk waits until startedAt + 12h, keeps initial progress, and saves writes with identical data', async (t) => {
  const start = Date.parse('2026-10-18T00:00:00Z'), hour = 3600000;
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const initial: CustomerCursor = { page: 1, total: 0, startedAt: new Date(start).toISOString(),
    windowEnd: start / 1000, windowDays: 1, fetched: 0 };
  const completed: CustomerCursor = { ...initial, completed: true, completedAt: new Date(start + hour).toISOString(),
    firstCompletedAt: new Date(start + hour).toISOString() };
  const run = async (cursor: CustomerCursor, at: number) => {
    t.mock.timers.setTime(at);
    const f = emptyDb({}, { estimateIndexes: true });
    setPancakeTransport(async () => Response.json({ success: true, data: [], total_entries: 0 }));
    try {
      for (const [i, p] of POS.entries()) f.raw.prepare('INSERT INTO pos_shops (id,name,shop_id,enabled,users_synced_at,products_synced_at,cursor,customer_cursor) VALUES (?,?,?,?,?,?,?,?)')
        .run(p.id, 'POS ảo', String(i + 1), i === 0 ? 1 : 0, new Date(at).toISOString(), new Date(at).toISOString(),
          JSON.stringify({ month: '2026-10', page: 1, completed: true }), JSON.stringify(cursor));
      await f.db.batch(customerStatements(f.db, POS[0].id, { id: 'customer-fake', name: 'Khách ảo', notes: [] }, new Date(start).toISOString()));
      const result = await runScheduledSync({ DB: f.db, PANCAKE_POS_API_KEY: 'fake' } as Cloudflare.Env, new Date(at));
      const next = parseCustomerCursor(String(f.raw.prepare('SELECT customer_cursor FROM pos_shops WHERE id=?').get(POS[0].id)!.customer_cursor))!;
      const tables = f.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name IN ('pos_customers','customer_notes','raw_pos_orders','raw_pos_order_items','customer_stats','customer_seller_stats') OR name LIKE 'stats_daily%')").all();
      const snapshot = Object.fromEntries(tables.map(({ name }) => [String(name), f.raw.prepare(`SELECT * FROM ${String(name)} ORDER BY id`).all()]));
      return { result, next, snapshot };
    } finally { f.raw.close(); }
  };
  try {
    const waiting = await run(completed, start + 2 * hour); // T + 1h (T = completedAt).
    assert.deepEqual(waiting.next, completed);
    assert.equal(waiting.result.stages.customers_backfill, 0);
    const beforeBoundary = await run(completed, start + 12 * hour - 1);
    assert.deepEqual(beforeBoundary.next, completed);
    const boundary = await run(completed, start + 12 * hour);
    assert.equal(boundary.next.startedAt, new Date(start + 12 * hour).toISOString());
    assert.equal(boundary.next.firstCompletedAt, completed.firstCompletedAt);
    assert.ok(boundary.result.stages.customers_backfill > 0);
    const first = await run(initial, start + hour);
    assert.equal(first.next.completed, true);
    assert.equal(first.next.startedAt, initial.startedAt);
    assert.equal(first.next.firstCompletedAt, new Date(start + hour).toISOString());
    const progress = (c: CustomerCursor) => customerBackfillProgress([{ id: POS[0].id, customer_cursor: JSON.stringify(c) }])[0];
    assert.equal(progress(initial).initial, true);
    assert.equal(progress(first.next).percent, 100);
    assert.equal(progress({ page: 1, firstCompletedAt: completed.firstCompletedAt }).initial, false);
    // Giả lập điều kiện lịch cũ tại T + 1h + 1ms: vòng mới đã được phép chạy.
    const legacyEligible = await run({ page: 1, total: completed.total, firstCompletedAt: completed.firstCompletedAt }, start + 2 * hour + 1);
    const newWaiting = await run(completed, start + 2 * hour + 1);
    assert.deepEqual(newWaiting.snapshot, legacyEligible.snapshot);
    assert.ok(legacyEligible.result.stages.customers_backfill > newWaiting.result.stages.customers_backfill);
    const writes = (r: typeof newWaiting) => Object.values(r.result.stages).reduce((sum, n) => sum + n, 0);
    t.diagnostic(`estimated writes: total ${writes(legacyEligible)} -> ${writes(newWaiting)}; customer backfill ${legacyEligible.result.stages.customers_backfill} -> ${newWaiting.result.stages.customers_backfill}`);
  } finally { setPancakeTransport(async () => { throw new Error('Transport closed'); }); }
});
