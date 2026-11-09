import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { callsCoverage, callsReport } from '../lib/reports/calls-report';
import { backfillCallsCoverage } from '../lib/reports/calls-coverage';
import { backfillMarketerIds, marketerIds, MARKETER_READY_KEY } from '../lib/teams/marketer-ids';
import { orderStatements, loadStored } from '../lib/pancake/sync';
import { destroySession, forgetUserSessions, getSessionUser } from '../lib/auth/auth';
import { setPasswordDropSessions, revokeSessions, enableTotp, disableTotp, deletePasskey, insertPasskey } from '../lib/auth/auth-db';
import { disableUser } from '../lib/teams/hr-api';
import type { SourceOrder } from '../lib/pancake/pancake';

void test('Cuộc gọi: chỉ mục hẹp giữ nguyên toàn bộ báo cáo sau thêm ghi chú, đổi phụ trách, xoá khách', async () => {
  const f = emptyDb();
  try {
    f.raw.exec("INSERT INTO pos_shops(id,name,shop_id) VALUES ('p','POS ảo','1'); INSERT INTO pos_users(id,pos_id,user_id,name,fetched_at) VALUES ('p:a','p','a','Người ảo CSKH','2026-11-09'),('p:b','p','b','Người ảo SALE','2026-11-09')");
    f.raw.exec("INSERT INTO pos_customers(id,pos_id,customer_id,assigned_user_id,fetched_at) VALUES ('p:c','p','c','a','2026-11-09')");
    f.raw.exec("INSERT INTO customer_notes(id,pos_id,customer_id,author_id,created_at,fetched_at) VALUES ('n','p','c','a','2026-11-09T01:00:00','2026-11-09T02:00:00')");
    for (const mutation of ['', "INSERT INTO customer_notes(id,pos_id,customer_id,author_id,created_at,fetched_at) VALUES ('n2','p','c','a','2026-11-09T03:00:00','2026-11-09T04:00:00')", "UPDATE pos_customers SET assigned_user_id='b'", 'DELETE FROM pos_customers']) {
      if (mutation) f.raw.exec(mutation);
      for (const team of ['all', 'cskh'] as const) {
        f.raw.exec('DROP INDEX IF EXISTS idx_pos_customers_assigned_pos');
        const opts = { posIds: ['p'], start: '2026-11-01', end: '2026-11-09', team, unit: null };
        const old = await callsReport(opts);
        f.raw.exec('CREATE INDEX idx_pos_customers_assigned_pos ON pos_customers(assigned_user_id,pos_id) WHERE assigned_user_id IS NOT NULL');
        assert.deepEqual(await callsReport(opts), old);
      }
    }
  } finally { f.raw.close(); }
});

void test('MKT: điền từng POS ngoài giờ, đường mới bằng DISTINCT sau tạo/đổi/xoá mềm; lặp ghi 0', async () => {
  const f = emptyDb();
  try {
    f.raw.exec("INSERT INTO pos_shops(id,name,shop_id) VALUES ('p','POS ảo','1'),('q','POS ảo 2','2')");
    const at = '2026-11-08T18:00:00Z';
    const save = async (o: SourceOrder) => f.db.batch(orderStatements(f.db, 'p', '1', o, at, (await loadStored(f.db, 'p', [o])).get(`p:${o.id}`)));
    const o: SourceOrder = { id: 'o', status: 1, marketer: { id: ' m1 ' }, inserted_at: at, updated_at: at };
    await save(o);
    await backfillMarketerIds(f.db, new Date('2026-11-09T05:00:00Z'));
    assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM app_settings WHERE key=?').get(MARKETER_READY_KEY)?.n, 0);
    for (let i = 0; i < 3; i++) await backfillMarketerIds(f.db, new Date(at));
    assert.equal(f.raw.prepare('SELECT value FROM app_settings WHERE key=?').get(MARKETER_READY_KEY)?.value, '1');
    const check = async () => {
      const expected = f.raw.prepare("SELECT DISTINCT TRIM(marketer_id) AS id FROM raw_pos_orders WHERE marketer_id IS NOT NULL AND TRIM(marketer_id)<>''").all().map(r => String(r.id)).sort((a, b) => a.localeCompare(b));
      assert.deepEqual([...(await marketerIds(f.db))].sort((a, b) => a.localeCompare(b)), expected);
    };
    await check();
    await save({ ...o, id: 'o2', marketer: { id: 'm2' } }); await check();
    await save({ ...o, marketer: { id: 'm3' } }); await check();
    const removed = { ...o, status: 7, marketer: { id: 'm3' } };
    await save(removed); await check();
    assert.ok((await marketerIds(f.db)).has('m3'));
    const prior = (await loadStored(f.db, 'p', [removed])).get('p:o');
    assert.equal(orderStatements(f.db, 'p', '1', removed, at, prior).length, 0);
    // Đường đã sẵn sàng không được tra bảng đơn khi người xem mở trang.
    const original = f.db.prepare.bind(f.db);
    f.db.prepare = ((sql: string) => { assert.ok(!sql.includes('raw_pos_orders')); return original(sql); }) as typeof f.db.prepare;
    await marketerIds(f.db, Date.now() + 11 * 60000);
  } finally { f.raw.close(); }
});

void test('Coverage: bảng đếm bằng câu cũ sau thêm/đổi/xoá khách và ghi chú; rollback không lệch', async () => {
  const f = emptyDb();
  try {
    f.raw.exec("INSERT INTO pos_shops(id,name,shop_id) VALUES ('p','POS ảo','1'),('q','POS ảo 2','2')");
    f.raw.exec("INSERT INTO pos_customers(id,pos_id,customer_id,assigned_user_id,fetched_at) VALUES ('c','p','c','a','2026-11-09')");
    f.raw.exec("INSERT INTO customer_notes(id,pos_id,created_at,fetched_at) VALUES ('n','p','2026-11-09T01:00:00','2026-11-09T02:00:00')");
    for (let i = 0; i < 2; i++) await backfillCallsCoverage(f.db, new Date('2026-11-08T18:00:00Z'));
    const check = async () => {
      for (const ids of [['p'], ['q'], ['p', 'q']]) {
        const ph = ids.map(() => '?').join(',');
        const old = f.raw.prepare(`SELECT (SELECT COUNT(*) FROM pos_customers WHERE pos_id IN (${ph})) AS customers, COUNT(*) AS notes, MIN(created_at) AS first_note, MAX(fetched_at) AS last_fetch FROM customer_notes WHERE pos_id IN (${ph})`).get(...ids, ...ids);
        assert.deepEqual(await callsCoverage(f.db, ids), { ...old });
      }
    };
    await check();
    for (const sql of [
      "INSERT INTO customer_notes(id,pos_id,created_at,fetched_at) VALUES ('n2','p','2026-11-08T01:00:00','2026-11-10T02:00:00')",
      "UPDATE pos_customers SET assigned_user_id='b'",
      "UPDATE customer_notes SET created_at='2026-11-11T01:00:00',fetched_at='2026-11-07T02:00:00' WHERE id='n2'",
      "UPDATE customer_notes SET pos_id='q' WHERE id='n'",
      "UPDATE pos_customers SET pos_id='q'",
      'DELETE FROM pos_customers',
      "DELETE FROM customer_notes WHERE id='n2'",
      'BEGIN; DELETE FROM customer_notes; ROLLBACK;',
      'DELETE FROM customer_notes',
    ]) { f.raw.exec(sql); await check(); }
    const original = f.db.prepare.bind(f.db);
    f.db.prepare = ((sql: string) => { assert.ok(!/FROM (?:pos_customers|customer_notes|app_settings)/.test(sql)); return original(sql); }) as typeof f.db.prepare;
    await callsCoverage(f.db, ['p', 'q']);
  } finally { f.raw.close(); }
});

void test('Phiên: TTL 60 giây và thao tác bảo mật xoá nhớ cùng isolate', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-09T00:00:00Z') });
  const f = emptyDb();
  try {
    const id = await loginAs(f.raw, 'staff');
    const original = f.db.prepare.bind(f.db);
    let reads = 0;
    f.db.prepare = ((sql: string) => { if (sql.includes('FROM sessions s JOIN users')) reads++; return original(sql); }) as typeof f.db.prepare;
    await getSessionUser(); assert.equal(reads, 1);
    t.mock.timers.tick(59999); await getSessionUser(); assert.equal(reads, 1);
    t.mock.timers.tick(1); await getSessionUser(); assert.equal(reads, 2);
    for (const action of [
      async () => { forgetUserSessions(id); },
      async () => { await enableTotp(id, new Date().toISOString()); },
      async () => { await disableTotp(id, new Date().toISOString()); },
      async () => { await insertPasskey({ id: 'key', userId: id, publicKey: 'fake', counter: 0, transports: '[]', deviceType: 'singleDevice', backedUp: false, name: 'Ảo', createdAt: new Date().toISOString() }); },
      async () => { await deletePasskey('key', id); },
      async () => { await revokeSessions({ others: { userId: id, keep: String(f.raw.prepare('SELECT id FROM sessions WHERE user_id=?').get(id)!.id) } }, null); },
    ]) {
      const before: number = reads; await action(); await getSessionUser(); assert.equal(reads, before + 1);
    }
    await disableUser(id); assert.equal(await getSessionUser(), null);
    const id2 = await loginAs(f.raw, 'staff'); await getSessionUser();
    await setPasswordDropSessions(id2, 'synthetic'); assert.equal(await getSessionUser(), null);
    await loginAs(f.raw, 'staff'); await getSessionUser();
    await destroySession((globalThis as { __testCookie?: string }).__testCookie ?? null);
    assert.equal(await getSessionUser(), null);
  } finally { f.raw.close(); t.mock.timers.reset(); }
});

void test('Phiên: lượt đọc đang dở không điền lại memo sau đổi mật khẩu', async () => {
  const f = emptyDb();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const id = await loginAs(f.raw, 'staff');
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const original = f.db.prepare.bind(f.db);
    let block = true;
    f.db.prepare = ((sql: string) => {
      const statement = original(sql);
      if (!sql.includes('FROM sessions s JOIN users')) return statement;
      const bind = statement.bind.bind(statement);
      statement.bind = (...args: unknown[]) => {
        const bound = bind(...args);
        const first = bound.first.bind(bound);
        return Object.assign(bound, { async first() {
          const row = await first();
          if (block) { block = false; entered(); await gate; }
          return row;
        } }) as D1PreparedStatement;
      };
      return statement;
    }) as typeof f.db.prepare;
    const pending = getSessionUser();
    await started;
    await setPasswordDropSessions(id, 'synthetic');
    release();
    await pending;
    assert.equal(await getSessionUser(), null);
  } finally { release(); f.raw.close(); }
});
