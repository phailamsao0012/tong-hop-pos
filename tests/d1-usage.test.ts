import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { addUsage, cycleOf, cycleSummary, observeD1 } from '../lib/ops/d1-usage';
import { emptyDb, d1 } from './support/d1-sqlite';

void test('G6: đạt trần 1,2 triệu chuyển nhánh bị chặn và bỏ dựng số liệu', async () => {
  const { SyncScheduler, D1_DAILY_WRITE_LIMIT } = await import('../lib/ops/scheduler');
  const { raw, db } = emptyDb();
  const data = new Map<string, unknown>();
  const ctx = { storage: { get: async (key: string) => data.get(key), put: async (key: string, v: unknown) => { data.set(key, v); } } } as unknown as DurableObjectState;
  const scheduler = new SyncScheduler(ctx, { DB: db } as Cloudflare.Env);
  let builds = 0;
  Object.assign(scheduler, {
    state: async () => ({ writesUsed: D1_DAILY_WRITE_LIMIT, writeBlockedUntil: null }),
    ensureSchema: async () => {}, watch: async () => {},
    buildPendingStats: async () => { builds++; return 0; },
  });
  try {
    assert.equal(D1_DAILY_WRITE_LIMIT, 1_200_000);
    assert.equal((await scheduler.runNow()).blocked, true);
    assert.equal(builds, 0);
  } finally { raw.close(); }
});

void test('G6: scheduler đưa kỳ vào canh gác chỉ ở bản thật, demo không mở sự cố kỳ', async () => {
  const { env } = await import('cloudflare:workers');
  const { SyncScheduler } = await import('../lib/ops/scheduler');
  const { raw, db } = emptyDb();
  const today = new Date().toISOString().slice(0, 10);
  const history = [{ day: today, writes: 49_000_000, stages: {}, sizeBytes: null }];
  try {
    for (const demo of [false, true]) {
      if (demo) env.DEMO_MODE = '1'; else delete env.DEMO_MODE;
      const data = new Map<string, unknown>();
      const ctx = { storage: { get: async (key: string) => data.get(key), put: async (key: string, v: unknown) => { data.set(key, v); } } } as unknown as DurableObjectState;
      const scheduler = new SyncScheduler(ctx, { DB: db, DEMO_MODE: demo ? '1' : undefined } as Cloudflare.Env);
      const watch = scheduler as unknown as { watch(s: { writesUsed: number }, run: { ok: boolean }, usage: typeof history): Promise<void> };
      await watch.watch({ writesUsed: 0 }, { ok: true }, history);
      const state = data.get('watch') as { incidents: { key: string }[] };
      assert.equal(state.incidents.some((i) => i.key === 'd1_cycle_95'), !demo);
    }
  } finally { delete env.DEMO_MODE; raw.close(); }
});

void test('addUsage accumulates immutably and retains 45 calendar days', () => {
  const old = addUsage([], '2026-10-17', { recent: 3 }, 100);
  const rows = addUsage(old, '2026-10-17', { recent: 2, stats: 4 }, 120);
  assert.equal(old[0].writes, 3);
  assert.deepEqual(rows[0], { day: '2026-10-17', writes: 9, stages: { recent: 5, stats: 4 }, sizeBytes: 120 });
  let history = rows;
  for (let i = 1; i <= 50; i++) { const d = new Date('2026-10-17T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); history = addUsage(history, d.toISOString().slice(0, 10), {}, null); }
  assert.equal(history.length, 45);
  assert.equal(history[0].day, '2026-10-23');
  assert.equal(addUsage(rows, '2027-01-01', {}, null).length, 1);
});
void test('cycleOf handles boundaries, new year and leap month', () => {
  for (const [day, start, end] of [
    ['2026-10-16', '2026-09-17', '2026-10-16'], ['2026-10-17', '2026-10-17', '2026-11-16'],
    ['2026-10-31', '2026-10-17', '2026-11-16'], ['2027-01-01', '2026-12-17', '2027-01-16'],
    ['2028-02-29', '2028-02-17', '2028-03-16'],
  ]) assert.deepEqual(cycleOf(day), { start, end });
});
void test('cycleSummary projects using elapsed calendar days', () => {
  let history = addUsage([], '2026-10-16', { recent: 999 }, 10);
  history = addUsage(history, '2026-10-17', { recent: 100 }, 20);
  history = addUsage(history, '2026-10-18', { stats: 100 }, 30);
  const summary = cycleSummary(history, '2026-10-18');
  assert.equal(summary.daysElapsed, 2); assert.equal(summary.daysTotal, 31);
  assert.equal(summary.writes, 200); assert.equal(summary.projected, 3100); assert.equal(summary.sizeBytes, 30);
  assert.equal(cycleSummary([], '2026-10-17').sizeBytes, null);
  assert.equal(cycleSummary([], '2026-10-17').projected, 0);
});
void test('measurement preserves rows and writes, recording adds zero D1 writes', async () => {
  const run = async (measured: boolean) => {
    const raw = new DatabaseSync(':memory:'); raw.exec('CREATE TABLE sample (id TEXT PRIMARY KEY, value INTEGER)');
    let writes = 0; let measuredWrites = 0;
    const base = d1(raw);
    const db = measured ? observeD1(base, (meta) => { measuredWrites += meta.rows_written; }) : base;
    for (const r of await db.batch([db.prepare('INSERT INTO sample VALUES (?,?)').bind('a', 1), db.prepare('INSERT INTO sample VALUES (?,?)').bind('b', 2)])) writes += r.meta.rows_written;
    const r = await db.prepare('UPDATE sample SET value=? WHERE id=?').bind(3, 'a').run(); writes += r.meta.rows_written;
    await db.prepare('SELECT * FROM sample').all();
    const history = addUsage([], '2026-10-18', { recent: measuredWrites }, null);
    const rows = raw.prepare('SELECT * FROM sample ORDER BY id').all(); raw.close();
    return { rows, writes, history };
  };
  const old = await run(false), measured = await run(true);
  assert.deepEqual(measured.rows, old.rows); assert.equal(old.writes, 3); assert.equal(measured.writes, 3);
  assert.equal(measured.history[0].writes, 3);
});
void test('last write size_after is used without extra queries', async () => {
  let calls = 0; const sizes: (number | undefined)[] = [100, 200, undefined];
  const db = { prepare: () => ({ run: async () => { calls++; return { meta: { rows_written: 1, size_after: sizes.shift() } }; } }) } as unknown as D1Database;
  let size: number | null = null;
  const measured = observeD1(db, (meta) => { size = typeof meta.size_after === 'number' ? meta.size_after : null; });
  await measured.prepare('write').run(); assert.equal(size, 100);
  await measured.prepare('write').run(); assert.equal(size, 200);
  await measured.prepare('write').run(); assert.equal(size, null); assert.equal(calls, 3);
});

void test('usage route rejects non-owner with 403 and unauthenticated with 401', async () => {
  const { raw } = emptyDb({ AUTH_SECRET: 'test-only' });
  const { loginAs, logout } = await import('./support/session');
  const { GET } = await import('../app/api/sync/scheduler/usage/route');
  try {
    logout(); assert.equal((await GET()).status, 401);
    await loginAs(raw, 'director'); assert.equal((await GET()).status, 403);
  } finally { logout(); raw.close(); }
});

void test('usage route owner receives history and cycle without D1 writes', async () => {
  const { raw } = emptyDb({ AUTH_SECRET: 'test-only' });
  const { env } = await import('cloudflare:workers');
  const { loginAs, logout } = await import('./support/session');
  const { GET } = await import('../app/api/sync/scheduler/usage/route');
  const payload = { history: [], cycle: cycleSummary([], '2026-10-18') };
  Object.assign(env, { SYNC_SCHEDULER: { idFromName: () => 'main', get: () => ({ usage: async () => payload }) } });
  try {
    await loginAs(raw, 'owner');
    const before = raw.prepare('SELECT total_changes() AS n').get();
    const response = await GET();
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), payload);
    assert.deepEqual(raw.prepare('SELECT total_changes() AS n').get(), before);
  } finally { logout(); raw.close(); }
});

void test('scheduler records stats in Durable Object storage without D1 usage writes', async () => {
  const { raw, db } = emptyDb();
  raw.exec('CREATE TABLE usage_fixture (value INTEGER)');
  const { SyncScheduler } = await import('../lib/ops/scheduler');
  const data = new Map<string, unknown>();
  const ctx = { storage: { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } } as unknown as DurableObjectState;
  const scheduler = new SyncScheduler(ctx, { DB: db } as Cloudflare.Env);
  Object.assign(scheduler, {
    state: async () => ({ writesUsed: 0, writeBlockedUntil: null }),
    ensureSchema: async () => {}, ensureWebhook: async () => {}, watch: async () => {},
    buildPendingStats: async (_state: unknown, measured: D1Database) => (await measured.prepare('INSERT INTO usage_fixture VALUES (1)').run()).meta.rows_written,
  });
  try {
    await scheduler.runNow();
    const usage = await scheduler.usage();
    assert.equal(usage.history.length, 1); assert.equal(usage.history[0].stages.stats, 1);
    assert.equal(usage.cycle.writes, 1);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM usage_fixture').get()!.n, 1);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM app_settings WHERE key='usage'").get()!.n, 0);
    assert.ok(data.has('usage'));
  } finally { raw.close(); }
});
