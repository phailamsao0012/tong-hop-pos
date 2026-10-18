import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { env } from 'cloudflare:workers';
import { runDispatch } from '../lib/dispatch';
import { setPancakeTransport } from '../lib/pancake';
import { emptyDb } from './support/d1-sqlite';
import { saveStuckConfig, STUCK_DEFAULTS } from '../lib/stuck-alert';

function fixture() {
  const { raw } = emptyDb({ PANCAKE_POS_API_KEY: 'fake', DEMO_MODE: '1' });
  const writes: { sql: string; changes: number }[] = [];
  const prepare = (sql: string, args: (string | number | null)[] = []): unknown => ({
    bind: (...a: (string | number | null)[]) => prepare(sql, a),
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    first: async () => raw.prepare(sql).get(...args) ?? null,
    run: async () => {
      const changes = Number(raw.prepare(sql).run(...args).changes);
      writes.push({ sql, changes });
      return { meta: { changes, rows_written: changes } };
    },
  });
  Object.assign(env, { DB: { prepare } });
  return { raw, writes };
}
const now = Date.parse('2026-10-18T03:00:00Z');

void test('G4: ten disabled dispatch runs write zero rows', async () => {
  const { raw, writes } = fixture();
  try {
    for (let i = 0; i < 10; i++) await runDispatch(new Date(now + i * 60000));
    assert.equal(writes.length, 0);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM dispatch_log').get()!.n, 0);
  } finally { raw.close(); }
});

void test('G4: idle POS heartbeat, waiting/error changes and overlapping lock', async () => {
  const { raw, writes } = fixture();
  let calls = 0;
  setPancakeTransport(async () => { calls++; return Response.json({ data: [] }); });
  raw.prepare("INSERT INTO pos_shops(id,name,shop_id) VALUES ('demo','POS demo','1')").run();
  raw.prepare("INSERT INTO dispatch_pos(pos_id,mode,since,updated_at) VALUES ('demo','dry',?,?)").run(new Date(now).toISOString(), new Date(now).toISOString());
  const count = () => writes.filter(w => w.sql.startsWith('UPDATE dispatch_pos')).reduce((n,w) => n + w.changes, 0);
  try {
    for (let i = 0; i < 10; i++) await runDispatch(new Date(now + i * 60000));
    assert.equal(count(), 1); // old path: ten writes
    assert.equal(calls, 10);
    await runDispatch(new Date(now + 10 * 60000));
    assert.equal(count(), 2);
    raw.prepare("UPDATE dispatch_pos SET waiting=2,last_error='fake error'").run();
    await runDispatch(new Date(now + 11 * 60000));
    assert.equal(count(), 3);
    assert.deepEqual({ ...raw.prepare('SELECT waiting,last_error FROM dispatch_pos').get() }, { waiting: 0, last_error: null });
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM dispatch_log').get()!.n, 0);
    raw.prepare("UPDATE app_settings SET value=? WHERE key='dispatch_lock'").run(String(now + 12 * 60000));
    await runDispatch(new Date(now + 12 * 60000));
    assert.equal(calls, 12);
    assert.equal(count(), 3);
  } finally { raw.close(); }
});

void test('G4: saving identical stuck config writes zero rows', async () => {
  const { raw, writes } = fixture();
  try {
    await saveStuckConfig(env.DB, STUCK_DEFAULTS);
    await saveStuckConfig(env.DB, STUCK_DEFAULTS);
    assert.deepEqual(writes.map(w => w.changes), [1, 0]);
    await saveStuckConfig(env.DB, { ...STUCK_DEFAULTS, hours: 48 });
    assert.equal(writes[2].changes, 1);
  } finally { raw.close(); }
});

void test('G4: ready upserts preserve values and skip identical writes', async () => {
  const { raw } = fixture();
  try {
    for (const file of ['lib/scheduler.ts', 'lib/stats.ts']) {
      const source = readFileSync(file, 'utf8');
      const statements = [...source.matchAll(/prepare\('(INSERT INTO app_settings[^']+)'\)/g)];
      assert.ok(statements.length > 0);
      for (const [, sql] of statements) {
        const key = `${file}:${sql}`;
        const stmt = raw.prepare(sql);
        assert.equal(Number(stmt.run(key, 'ready', 'first').changes), 1);
        assert.equal(Number(stmt.run(key, 'ready', 'second').changes), 0);
        assert.equal(Number(stmt.run(key, 'changed', 'third').changes), 1);
        assert.deepEqual({ ...raw.prepare('SELECT value,updated_at FROM app_settings WHERE key=?').get(key) }, { value: 'changed', updated_at: 'third' });
      }
    }
  } finally { raw.close(); }
});
