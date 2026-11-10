// Canh gác 24/7 chạy thật trên D1 giả (node:sqlite) và Telegram giả (bắt lời gọi fetch): QA 11/10 điểm 7–9.
// Chỉ gửi tới watch_chats chủ hệ thống đặt (chat riêng); D1 ghi lỗi vẫn ra đúng một tin; D1 treo không giữ chân lượt canh;
// bản demo không gọi Telegram lần nào; lớp 2 không quá 1 tin mỗi giờ khi D1 hỏng.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { env as globalEnv } from 'cloudflare:workers';
import { emptyDb } from './support/d1-sqlite';
import { checkScheduler, runWatch, type Ceiling, type WatchStore } from '../lib/bot/watch';
import type { RunInfo, WatchState } from '../lib/bot/watch-core';
import { cycleSummary } from '../lib/ops/d1-usage';

void test('G6: kỳ 30 ngày, ngày 10 dùng 15 triệu; chỉ một tin/ngày từ 08:00, demo không gửi', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  const cycle = cycleSummary([{ day: '2026-09-26', writes: 15_000_000, stages: {}, sizeBytes: null }], '2026-09-26');
  assert.equal(cycle.daysElapsed, 10);
  assert.equal(cycle.projected, 45_000_000);
  const store = memStore();
  const tick = async (iso: string) => { const now = new Date(iso); synced(now); return runWatch(env(), store, { ...OK_RUN, cycle }, { now }); };
  await tick('2026-09-26T00:55:00Z');
  assert.equal(sent.length, 0);
  await tick('2026-09-26T01:00:00Z');
  await tick('2026-09-26T01:05:00Z');
  assert.equal(sent.length, 1);
  assert.ok(store.value?.incidents.some((i) => i.key === 'd1_cycle_80'));
  assert.ok(!store.value?.incidents.some((i) => i.key === 'd1_cycle_95'));
  assert.match(sent[0].text, /phần gói đã gồm/);
  await tick('2026-09-27T01:00:00Z');
  assert.equal(sent.length, 2);
  const now = new Date('2026-09-27T01:05:00Z'); synced(now);
  // Scheduler không đưa cycle vào RunInfo ở demo.
  await runWatch({ ...env(), DEMO_MODE: '1' }, memStore(), OK_RUN, { now });
  assert.equal(sent.length, 2);
});

void test('G6: mức cao vẫn chờ 08:00 và giờ yên lặng; đóng rồi mở cùng ngày không gửi trùng', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  setting('watch_config', JSON.stringify({ quietStart: '22:00', quietEnd: '09:00' }));
  const cycle = cycleSummary([{ day: '2026-09-26', writes: 17_000_000, stages: {}, sizeBytes: null }], '2026-09-26');
  const store = memStore();
  const tick = async (hour: string, active = true) => {
    const now = new Date(`2026-09-26T${hour}:00Z`); synced(now);
    return runWatch(env(), store, { ...OK_RUN, cycle: active ? cycle : undefined }, { now });
  };
  await tick('00:55'); await tick('01:00');
  assert.equal(sent.length, 0);
  await tick('02:00');
  assert.equal(sent.length, 1);
  assert.equal(store.value?.incidents[0].key, 'd1_cycle_95');
  await tick('02:05', false); await tick('02:10', false);
  await tick('02:15'); await tick('08:00');
  assert.equal(sent.length, 1);
});

const OWNER = '111111', GROUP = '-100222333';
const DAY = new Date('2026-10-11T03:00:00Z'); // 10:00 giờ VN
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const OK_RUN: RunInfo = { ok: true, blocked: false, writesUsed: 0, writeLimit: 4000000 };

let sent: { chat: string; text: string }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://api.telegram.org/')) throw new Error(`gọi mạng ngoài Telegram trong test: ${url}`);
  const body = JSON.parse(init?.body as string) as { chat_id: string; text: string };
  sent.push({ chat: String(body.chat_id), text: body.text });
  return Response.json({ ok: true, result: {} });
}) as typeof fetch;

const memStore = (): WatchStore & { value?: WatchState } => {
  const s: WatchStore & { value?: WatchState } = { get: async () => s.value, put: async (v) => { s.value = structuredClone(v); } };
  return s;
};
const memCeiling = (): Ceiling => {
  const m = new Map<string, { v: string; until: number }>();
  return {
    get: async (k) => { const x = m.get(k); return x && x.until > Date.now() ? x.v : null; },
    set: async (k, v, ttl) => { m.set(k, { v, until: Date.now() + ttl * 1000 }); },
    del: async (k) => { m.delete(k); },
  };
};

let raw: DatabaseSync, db: D1Database;
const setting = (key: string, value: string) => raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value, DAY.toISOString());
const autoOff = (pos: string, at: string) => raw.prepare("INSERT INTO dispatch_pos (pos_id,mode,last_error,waiting,updated_at,updated_by) VALUES (?,'off',?,7,?,'Tự tắt') ON CONFLICT(pos_id) DO UPDATE SET mode='off',updated_at=excluded.updated_at,updated_by='Tự tắt'")
  .run(pos, 'Pancake không nhận người bán (khách 0912345678)', at);
const logRows = () => raw.prepare('SELECT key, notified_at, resolved_at, channel FROM ops_incidents ORDER BY opened_at').all() as { key: string; notified_at: string | null; resolved_at: string | null; channel: string | null }[];

beforeEach(() => {
  ({ raw, db } = emptyDb({ TELEGRAM_BOT_TOKEN: 't' }));
  delete (globalEnv as { DEMO_MODE?: string }).DEMO_MODE;
  sent = [];
  // Hai POS đang bật, vừa đồng bộ xong.
  for (const id of ['sieu-vo-gao', 'mgt-apex']) raw.prepare("INSERT INTO pos_shops (id,name,shop_id,status,enabled,last_sync_at) VALUES (?,?,'123','connected',1,?)").run(id, id, min(DAY, -2).toISOString());
});
const env = () => ({ DB: db, TELEGRAM_BOT_TOKEN: 't' }) as Cloudflare.Env;
/** Đồng bộ vẫn chạy đều: mọi POS vừa chạy xong 1 phút trước `now`. */
const synced = (now: Date) => raw.prepare('UPDATE pos_shops SET last_sync_at=?').run(min(now, -1).toISOString());

void test('chưa đặt watch_chats: chỉ ghi nhật ký, không gửi; không lấy chat cảnh báo cũ (alert_rules) làm dự phòng', async () => {
  raw.prepare("INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES ('u','o@x','Chủ','-','owner',0,?,?)").run(DAY.toISOString(), DAY.toISOString());
  raw.prepare('INSERT INTO alert_rules (owner_id,chat_id,updated_at) VALUES (?,?,?)').run('u', OWNER, DAY.toISOString());
  autoOff('sieu-vo-gao', DAY.toISOString());
  const store = memStore();
  const r = await runWatch(env(), store, OK_RUN, { now: DAY });
  assert.equal(sent.length, 0);
  assert.equal(r.open, 1);
  assert.equal(r.pending, 1);
  const rows = logRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].notified_at, null);
  // Chủ hệ thống đặt chat trên web (kèm một nhóm lọt vào JSON): lượt sau gửi ngay 🔴, chỉ tới chat riêng.
  setting('watch_chats', JSON.stringify([OWNER, GROUP]));
  await runWatch(env(), store, OK_RUN, { now: min(DAY, 5) });
  assert.deepEqual(sent.map((s) => s.chat), [OWNER]);
  assert.match(sent[0].text, /🔴 .*Chia số đã TỰ TẮT/);
  assert.doesNotMatch(sent[0].text, /0912345678/);
});

void test('chia số tự tắt: báo một lần, bật lại thì "Đã ổn lại" sau 2 lượt; tự tắt lần nữa là sự cố mới', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  const at1 = DAY.toISOString();
  autoOff('mgt-apex', at1);
  const store = memStore();
  const tick = (m: number) => { synced(min(DAY, m)); return runWatch(env(), store, OK_RUN, { now: min(DAY, m) }); };
  for (let k = 0; k < 4; k++) await tick(k * 5);
  assert.equal(sent.length, 1);
  raw.prepare("UPDATE dispatch_pos SET mode='live', updated_by='Chủ' WHERE pos_id='mgt-apex'").run();
  await tick(20);
  assert.equal(sent.length, 1);
  await tick(25);
  assert.equal(sent.length, 2);
  assert.match(sent[1].text, /Đã ổn lại.*kéo dài 25 phút/);
  autoOff('mgt-apex', min(DAY, 30).toISOString());
  await tick(30);
  assert.equal(sent.length, 3);
  assert.match(sent[2].text, /TỰ TẮT/);
  assert.equal(logRows().length, 2);
  assert.ok(logRows()[0].resolved_at);
});

void test('D1 ném lỗi khi ghi: vẫn ra đúng một tin, trạng thái giữ ở bộ nhớ DO', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  autoOff('sieu-vo-gao', DAY.toISOString());
  const failing = {
    prepare: (sql: string) => db.prepare(sql),
    batch: async (list: { sql?: string }[]) => {
      if (list.some((s) => !/^\s*SELECT/i.test(String((s as { sql?: string }).sql)))) throw new Error('D1_ERROR: daily row write limit exceeded');
      return db.batch(list as D1PreparedStatement[]);
    },
  } as unknown as D1Database;
  const store = memStore();
  for (let k = 0; k < 3; k++) await runWatch({ DB: failing, TELEGRAM_BOT_TOKEN: 't' } as Cloudflare.Env, store, { ...OK_RUN, blocked: true }, { now: min(DAY, k * 5) });
  // Một tin gộp cả hai sự cố 🔴 (chia số tự tắt, hết hạn mức ghi), không gửi lại ở các lượt sau.
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /TỰ TẮT/);
  assert.match(sent[0].text, /hạn mức ghi/);
  assert.equal(logRows().length, 0);
  assert.equal(store.value!.incidents.filter((i) => i.notifiedAt).length, 2);
});

void test('D1 treo: lượt canh không bị giữ chân, 2 lượt liền thì báo 🔴 tới chat đã nhớ trong bộ nhớ DO', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  const store = memStore();
  await runWatch(env(), store, OK_RUN, { now: DAY });
  assert.deepEqual(store.value!.chats, [OWNER]);
  const hung = { prepare: (sql: string) => db.prepare(sql), batch: () => new Promise(() => undefined) } as unknown as D1Database;
  const started = Date.now();
  const a = await runWatch({ DB: hung, TELEGRAM_BOT_TOKEN: 't' } as Cloudflare.Env, store, { ...OK_RUN, ok: false, error: 'D1 overloaded' }, { now: min(DAY, 5), readTimeoutMs: 30 });
  assert.ok(a.readError);
  assert.equal(sent.length, 0);
  await runWatch({ DB: hung, TELEGRAM_BOT_TOKEN: 't' } as Cloudflare.Env, store, { ...OK_RUN, ok: false, error: 'D1 overloaded' }, { now: min(DAY, 10), readTimeoutMs: 30 });
  assert.ok(Date.now() - started < 2000);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /D1 không đọc được/);
  // Lỗi bộ hẹn giờ cần 3 lượt liên tiếp mới báo 🟠; chưa đủ.
  assert.doesNotMatch(sent[0].text, /Bộ hẹn giờ/);
});

void test('đồng bộ không chạy 🟠 lúc 02:00 chờ tới 07:00; chưa có cột recent_watermark thì không xét đơn về trễ', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  const night = new Date('2026-10-10T19:00:00Z');
  raw.prepare("UPDATE pos_shops SET last_sync_at=? WHERE id='mgt-apex'").run(min(night, -25).toISOString());
  raw.prepare("UPDATE pos_shops SET last_sync_at=? WHERE id='sieu-vo-gao'").run(min(night, -1).toISOString());
  const store = memStore();
  await runWatch(env(), store, OK_RUN, { now: night });
  assert.equal(sent.length, 0);
  assert.deepEqual(store.value!.incidents.map((i) => i.key), ['pos_stale:mgt-apex']);
  raw.prepare("UPDATE pos_shops SET last_sync_at=? WHERE id='mgt-apex'").run(min(night, 3).toISOString());
  await runWatch(env(), store, OK_RUN, { now: min(night, 5) });
  await runWatch(env(), store, OK_RUN, { now: min(night, 10) });
  assert.equal(sent.length, 0);
  const morning = new Date('2026-10-11T00:00:00Z');
  raw.prepare('UPDATE pos_shops SET last_sync_at=?').run(min(morning, -1).toISOString());
  await runWatch(env(), store, OK_RUN, { now: morning });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /tóm tắt[\s\S]*MGT - APEX[\s\S]*đã tự hết/);
});

void test('có cột mốc nước (tổ đồng bộ thêm): đang chạy mà mốc nước trễ thì báo "đơn về trễ", không báo "không chạy"', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  // Migration 0045 đã thêm cột; nhánh cũ chưa có thì tự thêm.
  const cols = raw.prepare('PRAGMA table_info(pos_shops)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'recent_watermark')) raw.exec('ALTER TABLE pos_shops ADD COLUMN recent_watermark TEXT');
  raw.prepare("UPDATE pos_shops SET recent_watermark=? WHERE id='mgt-apex'").run(min(DAY, -45).toISOString().slice(0, 19));
  raw.prepare("UPDATE pos_shops SET recent_watermark=? WHERE id='sieu-vo-gao'").run(min(DAY, -2).toISOString());
  const store = memStore();
  await runWatch(env(), store, OK_RUN, { now: DAY });
  assert.deepEqual(store.value!.incidents.map((i) => i.key), ['pos_lag:mgt-apex']);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /về trễ/);
});

void test('sao lưu đêm: chưa có backup:last hoặc chưa gắn kho R2 thì không báo; xong lần cuối quá 26 giờ thì báo 🟠', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  const store = memStore();
  await runWatch(env(), store, OK_RUN, { now: DAY });
  assert.equal(store.value!.incidents.length, 0);
  setting('backup:last', JSON.stringify({ status: 'off', startedAt: DAY.toISOString(), attempts: 0, error: 'Chưa cấu hình kho sao lưu' }));
  await runWatch(env(), store, OK_RUN, { now: min(DAY, 5) });
  assert.equal(store.value!.incidents.length, 0);
  setting('backup:last', JSON.stringify({ status: 'ok', startedAt: min(DAY, -27 * 60).toISOString(), finishedAt: min(DAY, -27 * 60).toISOString(), attempts: 1, lastOkAt: min(DAY, -27 * 60).toISOString() }));
  await runWatch(env(), store, OK_RUN, { now: min(DAY, 10) });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Sao lưu đêm quá 26 giờ/);
});

void test('bản demo: không gọi Telegram lần nào (kể cả có token), ghi nhật ký demo-log; watch_sim tạo sự cố giả', async () => {
  (globalEnv as { DEMO_MODE?: string }).DEMO_MODE = '1';
  const { sendTelegram } = await import('../lib/bot/telegram');
  await assert.rejects(sendTelegram('t', OWNER, 'x'), /demo/);
  setting('watch_sim', JSON.stringify({ posStale: 'mgt-apex', writeBlock: true, d1Mb: 8600 }));
  const store = memStore();
  const demoEnv = { DB: db, TELEGRAM_BOT_TOKEN: 't', DEMO_MODE: '1' } as Cloudflare.Env;
  const r = await runWatch(demoEnv, store, OK_RUN, { now: DAY });
  assert.equal(sent.length, 0);
  assert.equal(r.sent, 1);
  assert.deepEqual(store.value!.incidents.map((i) => `${i.key}:${i.severity}`).sort(), ['d1_size:high', 'd1_write_block:high', 'pos_stale:mgt-apex:medium']);
  assert.ok(logRows().every((x) => x.channel === 'demo-log' && x.notified_at));
  // Bỏ sự cố giả (dung lượng về 100 MB): sau 2 lượt mọi sự cố đóng; dung lượng chỉ đo mỗi giờ nên đóng sau 2 lần đo.
  setting('watch_sim', JSON.stringify({ d1Mb: 100 }));
  for (const m of [5, 10]) { synced(min(DAY, m)); await runWatch(demoEnv, store, OK_RUN, { now: min(DAY, m) }); }
  assert.ok(logRows().filter((x) => x.key !== 'd1_size').every((x) => x.resolved_at));
  assert.ok(!logRows().find((x) => x.key === 'd1_size')!.resolved_at);
  for (const m of [60, 120]) { synced(min(DAY, m)); await runWatch(demoEnv, store, OK_RUN, { now: min(DAY, m) }); }
  assert.ok(logRows().every((x) => x.resolved_at));
  assert.equal(sent.length, 0);
});

void test('lớp 2: bộ hẹn giờ im 20 phút thì báo một lần, chạy lại thì "Đã ổn lại"; D1 hỏng vẫn không quá 1 tin mỗi giờ', async () => {
  setting('watch_chats', JSON.stringify([OWNER]));
  const ceiling = memCeiling();
  const status = (lastRunAt: number | null) => async () => ({ lastRunAt });
  const stale = status(min(DAY, -20).getTime());
  await checkScheduler(env(), stale, { now: DAY, ceiling });
  await checkScheduler(env(), stale, { now: min(DAY, 5), ceiling });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Bộ hẹn giờ đồng bộ không chạy/);
  await checkScheduler(env(), status(min(DAY, 9).getTime()), { now: min(DAY, 10), ceiling });
  assert.equal(sent.length, 2);
  assert.match(sent[1].text, /Đã ổn lại/);

  // D1 hỏng (đọc/ghi đều lỗi) và RPC lỗi: lần đầu chỉ ghi nhớ, lần 2 báo (chat lấy từ bản nhớ Cache API), sau đó trần 1 tin/giờ.
  sent = [];
  const broken = { prepare: () => { throw new Error('D1 down'); } } as unknown as D1Database;
  const rpcFail = async () => { throw new Error('DO lỗi'); };
  const brokenEnv = { DB: broken, TELEGRAM_BOT_TOKEN: 't' } as Cloudflare.Env;
  await checkScheduler(brokenEnv, rpcFail, { now: min(DAY, 15), ceiling });
  assert.equal(sent.length, 0);
  for (let k = 1; k <= 6; k++) await checkScheduler(brokenEnv, rpcFail, { now: min(DAY, 15 + k * 5), ceiling });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent.map((s) => s.chat), [OWNER]);
  assert.match(sent[0].text, /Không gọi được bộ hẹn giờ/);
});
