// D1 trên PC (pc/d1.ts, plan 2026-11-01-chay-web-pc-node bước N1): đúng dạng D1, đúng chuyển kiểu, batch lùi trọn,
// và 40 API báo cáo trả JSON trùng từng byte với D1 giả của test trên cùng dữ liệu số ảo.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { bindValue } from '../pc/d1-core';
import { isReadSql, openD1, type PcD1 } from '../pc/d1';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';

const dir = mkdtempSync(join(tmpdir(), 'pc-d1-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
let n = 0;
function fresh() {
  const file = join(dir, `t${++n}.sqlite`);
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, no TEXT UNIQUE, v, flag INTEGER); INSERT INTO t (no, v) VALUES ('a', 'x')");
  db.close();
  return file;
}

void test('chuyển kiểu như D1: số nguyên lưu INTEGER, số lẻ REAL, boolean 0/1, undefined báo D1_TYPE_ERROR', async () => {
  assert.equal(bindValue(true), 1);
  assert.equal(typeof bindValue(7), 'bigint');
  assert.equal(bindValue(1.5), 1.5);
  assert.throws(() => bindValue(undefined), /D1_TYPE_ERROR/);
  for (const readers of [0, 2]) {
    const db = await openD1(fresh(), { readers });
    try {
      await db.prepare('INSERT INTO t (no, v, flag) VALUES (?, ?, ?)').bind('b', 1, true).run();
      await db.prepare('INSERT INTO t (no, v) VALUES (?, ?)').bind('c', 1.5).run();
      const rows = await db.prepare('SELECT no, typeof(v) AS tv, v, flag FROM t ORDER BY id').all();
      assert.deepEqual(rows.results, [{ no: 'a', tv: 'text', v: 'x', flag: null }, { no: 'b', tv: 'integer', v: 1, flag: 1 }, { no: 'c', tv: 'real', v: 1.5, flag: null }]);
      assert.equal(Object.getPrototypeOf(rows.results[0]), Object.prototype);
      assert.throws(() => db.prepare('SELECT ?').bind(undefined), /D1_TYPE_ERROR/);
    } finally { await db.close(); }
  }
});

void test('first, run, raw, meta theo D1', async () => {
  for (const readers of [0, 2]) {
    const db = await openD1(fresh(), { readers });
    try {
      assert.equal(await db.prepare('SELECT no FROM t WHERE no=?').bind('zz').first(), null);
      assert.equal(await db.prepare('SELECT no FROM t').first('no'), 'a');
      await assert.rejects(db.prepare('SELECT no FROM t').first('khong'), /D1_ERROR/);
      const w = await db.prepare('INSERT INTO t (no) VALUES (?)').bind('d').run();
      assert.equal(w.success, true);
      assert.deepEqual(w.results, []);
      assert.equal(w.meta.changes, 1);
      assert.equal(w.meta.rows_written, 1);
      assert.equal(w.meta.last_row_id, 2);
      assert.ok(w.meta.size_after > 0);
      const r = await db.prepare('SELECT count(*) AS n FROM t').run();
      assert.equal(r.meta.changes, 0);
      assert.deepEqual(r.results, [{ n: 2 }]);
      assert.deepEqual(await db.prepare('SELECT no, id FROM t ORDER BY id').raw({ columnNames: true }), [['no', 'id'], ['a', 1], ['d', 2]]);
      const ret = await db.prepare("INSERT INTO t (no) VALUES ('e') RETURNING id").first<{ id: number }>();
      assert.deepEqual(ret, { id: 3 });
      const up = await db.prepare("UPDATE t SET v='y' WHERE no IN ('a','d')").run();
      assert.equal(up.meta.changes, 2);
    } finally { await db.close(); }
  }
});

void test('exec trả số câu đã chạy', async () => {
  const db = await openD1(fresh(), { readers: 1 });
  try {
    const r = await db.exec('UPDATE t SET flag=1;\nUPDATE t SET flag=2;');
    assert.equal(r.count, 2);
    assert.equal(await db.prepare('SELECT flag FROM t').first('flag'), 2);
  } finally { await db.close(); }
});

void test('batch là một giao dịch: câu sau lỗi thì câu trước lùi lại; lời lỗi giữ "UNIQUE constraint failed"', async () => {
  for (const readers of [0, 2]) {
    const db = await openD1(fresh(), { readers });
    try {
      const ins = (no: string) => db.prepare('INSERT INTO t (no) VALUES (?)').bind(no);
      await assert.rejects(db.batch([ins('b'), ins('a')]), (e: Error) => e.message.startsWith('D1_ERROR: UNIQUE constraint failed: t.no') && /SQLITE_CONSTRAINT/.test(e.message));
      assert.equal(await db.prepare("SELECT count(*) AS n FROM t WHERE no='b'").first('n'), 0);
      const out = await db.batch([ins('b'), db.prepare('SELECT count(*) AS n FROM t')]);
      assert.equal(out[0].meta.changes, 1);
      assert.deepEqual(out[1].results, [{ n: 2 }]);
      const reads = await db.batch([db.prepare('SELECT 1 AS x'), db.prepare('SELECT 2 AS y')]);
      assert.deepEqual(reads.map((r) => r.results), [[{ x: 1 }], [{ y: 2 }]]);
    } finally { await db.close(); }
  }
});

void test('chia luồng: câu đọc sang luồng đọc, câu ghi (kể cả WITH ... INSERT, RETURNING) sang luồng ghi; ghi xong đọc thấy ngay', async () => {
  assert.equal(isReadSql('  select 1'), true);
  assert.equal(isReadSql('WITH x AS (SELECT 1) SELECT * FROM x'), true);
  assert.equal(isReadSql("SELECT replace(no, 'a', 'b') FROM t"), true);
  assert.equal(isReadSql('WITH x AS (SELECT 1) INSERT INTO t (no) SELECT * FROM x'), false);
  assert.equal(isReadSql('INSERT INTO t (no) VALUES (1) RETURNING id'), false);
  assert.equal(isReadSql('PRAGMA table_info(t)'), false);
  const db: PcD1 = await openD1(fresh(), { readers: 3 });
  try {
    await Promise.all(Array.from({ length: 30 }, (_, i) => db.prepare('INSERT INTO t (no) VALUES (?)').bind(`k${i}`).run()));
    const counts = await Promise.all(Array.from({ length: 30 }, () => db.prepare('SELECT count(*) AS n FROM t').first<number>('n')));
    assert.deepEqual(new Set(counts), new Set([31]));
    const s = db.stats();
    assert.equal(s.writes, 30);
    assert.equal(s.reads, 30);
  } finally { await db.close(); }
});

void test('40 API báo cáo: D1 của PC (3 luồng đọc) trả JSON trùng từng byte với D1 giả của test', { timeout: 600000 }, async (t) => {
  const days = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
  const nowIso = '2026-10-13T05:00:00.000Z';
  const { raw } = await demoWorld(days, Date.parse(nowIso));
  const id = await loginAs(raw, 'owner');
  const file = join(dir, 'world.sqlite');
  raw.exec(`VACUUM INTO '${file}'`);
  raw.close();
  const P = 'sieu-vo-gao,mgt-apex,thuy-san,bio-nano,megaroot,oxytetra';
  const vars = { S: days[0], E: days[6], T: days[6], E29: '2026-09-14', M: '2026-10', P: encodeURIComponent(P) };
  const run = (mode: string) => JSON.parse(execFileSync(process.execPath, [...process.execArgv.filter((a) => !a.startsWith('--test')), join(import.meta.dirname, 'support/pc-d1-golden.ts'), file, mode, `tok-${id}`, nowIso, JSON.stringify(vars)], { maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) as { out: Record<string, { status: number; body: string }>; stats?: { reads: number; writes: number; rerouted: number } };
  const fake = run('fake');
  const pc = run('pc');
  const names = Object.keys(fake.out);
  assert.ok(names.length >= 35, `chỉ gọi được ${names.length} API`);
  const ok = names.filter((k) => fake.out[k].status === 200);
  assert.ok(ok.length >= 30, `ít API trả 200: ${names.filter((k) => fake.out[k].status !== 200).map((k) => `${k} ${fake.out[k].status}`).join(', ')}`);
  for (const k of names) assert.deepEqual(pc.out[k], fake.out[k], `API ${k} lệch giữa D1 giả và D1 của PC`);
  t.diagnostic(`${names.length} API, ${ok.length} trả 200, ${names.reduce((s, k) => s + fake.out[k].body.length, 0)} byte; luồng PC ${JSON.stringify(pc.stats)}; không 200: ${names.filter((k) => fake.out[k].status !== 200).map((k) => `${k} ${fake.out[k].status}`).join(', ')}`);
  assert.ok(pc.stats && pc.stats.reads > 50, `luồng đọc ít được dùng: ${JSON.stringify(pc.stats)}`);
});
