import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { env } from 'cloudflare:workers';
import { SyncScheduler, SYNC_INTERVAL_MS } from '../lib/ops/scheduler';
import { emptyDb } from './support/d1-sqlite';

void test('G5: demo alarms throttle at 30 minutes, live alarms keep five minutes and data matches', async () => {
  const originalNow = Date.now;
  const results: { writes: number; rows: unknown[] }[] = [];
  try {
    for (const demo of ['0', '1']) {
      const { raw, db } = emptyDb({ DEMO_MODE: demo });
      let now = Date.parse('2026-10-18T03:00:00Z');
      Date.now = () => now;
      const data = new Map<string, unknown>();
      let alarm: number | null = null;
      const ctx = { storage: {
        get: async (key: string) => data.get(key),
        put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
        getAlarm: async () => alarm,
        setAlarm: async (at: number) => { alarm = at; },
      } } as unknown as DurableObjectState;
      const scheduler = new SyncScheduler(ctx, { DB: db } as Cloudflare.Env);
      let writes = 0;
      Object.assign(scheduler, {
        ensureSchema: async () => {}, ensureWebhook: async () => {}, watch: async () => {},
        // Count a real SQLite row per sync without loading orders or calling external services.
        buildPendingStats: async (_state: unknown, measured: D1Database) => {
          const r = await measured.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES ('g5_fixture','ready','fixture') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
          writes += r.meta.rows_written;
          return r.meta.rows_written;
        },
      });
      try {
        for (let minute = 0; minute <= 30; minute += 5) {
          now = Date.parse('2026-10-18T03:00:00Z') + minute * 60000;
          await scheduler.alarm();
          assert.equal(alarm, now + SYNC_INTERVAL_MS);
          assert.equal(writes, demo === '1' ? (minute < 30 ? 1 : 2) : minute / 5 + 1);
          await scheduler.kick();
          assert.equal(writes, demo === '1' ? (minute < 30 ? 1 : 2) : minute / 5 + 1);
        }
        results.push({ writes, rows: raw.prepare('SELECT * FROM app_settings').all() });
        now += 5 * 60000;
        await scheduler.runNow();
        assert.equal(writes, results.at(-1)!.writes + 1);
      } finally { raw.close(); }
    }
    assert.deepEqual(results[0].rows, results[1].rows);
    assert.deepEqual(results.map(r => r.writes), [7, 2]);
  } finally { Date.now = originalNow; Object.assign(env, { DEMO_MODE: '1' }); }
});

// Chia số đã bỏ (anh Vũ 21/10/2026 "bỏ chia số đi nhé"): cron mỗi phút không còn chạy chia số ở đâu cả.
void test('G5: Worker cron no longer runs the minute dispatch', () => {
  const source = readFileSync('worker.ts', 'utf8');
  assert.doesNotMatch(source, /runDispatch\(/);
});
