// Sao lưu đêm ra R2 (lib/backup.ts) trên D1 giả (node:sqlite) và R2 giả trong bộ nhớ: đủ bảng, đúng số dòng, nhiều trang,
// không chép bí mật đăng nhập, giữ 30 + 12, khôi phục vào bảng mới, thiếu kho R2, người không phải chủ hệ thống bị chặn.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { env } from 'cloudflare:workers';
import { emptyDb } from './support/d1-sqlite';
import { parseAccess, scopeApi } from '../lib/auth/access';
import { classifyApi } from '../lib/ops/audit';
import type * as Backup from '../lib/ops/backup';

/** R2 giả: put/get/list/delete; list trả tối đa 50 khoá mỗi trang để thử phân trang. */
class FakeR2 {
  store = new Map<string, Uint8Array>();
  async put(key: string, value: string | Uint8Array | ArrayBuffer) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, bytes);
    return { key, size: bytes.byteLength };
  }
  async get(key: string) {
    const b = this.store.get(key);
    if (!b) return null;
    return { key, size: b.byteLength, body: new Response(b.slice()).body!, text: async () => new TextDecoder().decode(b), arrayBuffer: async () => b.slice().buffer };
  }
  async list(o: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const keys = [...this.store.keys()].filter((k) => k.startsWith(o.prefix ?? '')).sort();
    const start = Number(o.cursor ?? 0), end = start + Math.min(o.limit ?? 1000, 50);
    const objects = keys.slice(start, end).map((key) => ({ key, size: this.store.get(key)!.byteLength }));
    return end < keys.length ? { objects, delimitedPrefixes: [], truncated: true, cursor: String(end) } : { objects, delimitedPrefixes: [], truncated: false };
  }
  async delete(keys: string | string[]) { for (const k of [keys].flat()) this.store.delete(k); }
  dates() { return [...new Set([...this.store.keys()].map((k) => k.split('/')[1]))].sort(); }
}

let raw: DatabaseSync;
let B: typeof Backup;
const r2 = new FakeR2();
const setEnv = (v: Record<string, unknown>) => Object.assign(env as object, v);
// 02:30 sáng 11/10/2026 giờ VN.
const NIGHT = new Date('2026-10-10T19:30:00Z');
const DATE = '2026-10-11';
const count = (sql: string) => (raw.prepare(sql).get() as { n: number }).n;
const rowsOf = (key: string) => {
  const j = JSON.parse(gunzipSync(r2.store.get(key)!).toString('utf8')) as { table: string; columns: string[]; rows: unknown[][] };
  return j;
};
const SECRET_HASH = 'pbkdf2$KHONG-DUOC-RA-R2';
const BOT_HASH = 'bot-hash-KHONG-DUOC-RA-R2';

before(async () => {
  ({ raw } = emptyDb({ AUTH_SECRET: 'x' }));
  B = await import('../lib/ops/backup');
  const now = '2026-10-10T00:00:00.000Z';
  const user = raw.prepare('INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)');
  user.run('u-owner', 'o@x', 'Chủ', SECRET_HASH, 'owner', now, now);
  user.run('u-staff', 's@x', 'Nhân viên "A"\nxuống dòng', SECRET_HASH, 'staff', now, now);
  const set = raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)');
  set.run('bot_password', BOT_HASH, now);
  set.run('team_source', 'hr', now);
  set.run('marketing_teams_v1', JSON.stringify({ a: [1, 2], b: 'ư' }), now);
  raw.prepare("INSERT INTO telegram_chats (chat_id,name,added_by,added_at,role) VALUES ('111','Chủ','test',?,'admin')").run(now);
  const log = raw.prepare('INSERT INTO audit_log (id,at,user_id,email,name,action,target,detail,status,ip,device,user_agent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 2345; i++) log.run(`a${String(i).padStart(5, '0')}`, now, 'u-owner', 'o@x', 'Chủ', 'view', `GET /x/${i}`, i % 7 ? `chi tiết ${i}` : null, i % 3 ? 200 : null, '1.2.3.4', 'Chrome · macOS', 'UA');
  // Bảng bí mật: có dữ liệu nhưng không được ra R2.
  raw.prepare("INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES ('sess-KHONG-DUOC-RA-R2','u-owner',?,?)").run(now, now);
  raw.prepare("INSERT INTO user_mfa (user_id,totp_secret,updated_at) VALUES ('u-owner','totp-KHONG-DUOC-RA-R2',?)").run(now);
  raw.prepare("INSERT INTO passkeys (id,user_id,public_key,created_at) VALUES ('pk1','u-owner','pk-KHONG-DUOC-RA-R2',?)").run(now);
  raw.prepare("INSERT INTO trusted_devices (id,user_id,created_at,expires_at) VALUES ('dev-KHONG-DUOC-RA-R2','u-owner',?,?)").run(now, now);
});

void test('thiếu kho R2: ghi "chưa cấu hình", không chạy; trước 02:00 giờ VN không làm gì', async () => {
  setEnv({ BACKUP: undefined });
  assert.equal(await B.maybeNightlyBackup(new Date('2026-10-10T18:59:00Z')), null);
  const s = await B.runBackup({ now: NIGHT });
  assert.equal(s?.status, 'off');
  assert.equal(s?.error, B.NOT_CONFIGURED);
  assert.deepEqual(await B.readBackupStatus(), s);
  // Đã ghi "off" cho hôm nay: lượt Cron sau không ghi lại.
  assert.equal(await B.maybeNightlyBackup(new Date(NIGHT.getTime() + 300000)), null);
  await assert.rejects(B.restoreTable(DATE, 'users'), /Chưa cấu hình kho sao lưu/);
  assert.equal(await B.listBackups(), null);
});

void test('sao lưu đủ bảng, đúng số dòng, nhiều trang, không có bí mật đăng nhập', async () => {
  setEnv({ BACKUP: r2 });
  // Lượt "off" hôm nay không chặn khi chủ hệ thống bấm chạy (hoặc ngày sau): chạy thẳng.
  let selects = 0;
  const db = env.DB;
  setEnv({ DB: { prepare: (sql: string) => { if (/FROM "audit_log" WHERE rowid/.test(sql)) selects++; return db.prepare(sql); } } });
  const s = await B.runBackup({ now: NIGHT, pageRows: 100 });
  setEnv({ DB: db });
  assert.equal(s?.status, 'ok', s?.error);
  assert.equal(s?.date, DATE);
  assert.ok(selects >= 24, `audit_log phải đọc nhiều trang (đã đọc ${selects})`);
  const manifest = JSON.parse(await (await r2.get(B.manifestKey(DATE)))!.text()) as Backup.Manifest;
  const present = (raw.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name);
  for (const t of B.BACKUP_TABLES) {
    const entry = manifest.tables.find((x) => x.name === t);
    if (!present.includes(t)) { assert.ok(manifest.missing.includes(t), `${t} thiếu mà không ghi vào missing`); continue; }
    assert.ok(entry, `thiếu bảng ${t}`);
    const filter = B.ROW_FILTERS[t];
    assert.equal(entry.rows, count(`SELECT COUNT(*) AS n FROM ${t}${filter ? ` WHERE ${filter}` : ''}`), `số dòng ${t}`);
    assert.equal(s?.tables?.[t], entry.rows);
    assert.match(entry.createSql, /^CREATE TABLE/i);
    const file = rowsOf(entry.key);
    assert.equal(file.table, t);
    assert.equal(file.rows.length, entry.rows);
  }
  assert.equal(manifest.tables.find((t) => t.name === 'audit_log')?.rows, 2345);
  const ids = rowsOf(B.tableKey(DATE, 'audit_log')).rows.map((r) => r[0]);
  assert.equal(new Set(ids).size, 2345);
  // Bảng bí mật không có tệp, không chuỗi bí mật nào nằm trong bất kỳ tệp nào.
  for (const t of Object.keys(B.EXCLUDED_TABLES)) {
    assert.ok(!(B.BACKUP_TABLES as readonly string[]).includes(t), `${t} vừa sao lưu vừa loại trừ`);
    assert.ok(![...r2.store.keys()].some((k) => k.endsWith(`/${t}.json.gz`)), `có tệp ${t}`);
  }
  const all = [...r2.store.entries()].map(([k, v]) => k.endsWith('.gz') ? gunzipSync(v).toString('utf8') : new TextDecoder().decode(v)).join('\n');
  assert.ok(!all.includes('KHONG-DUOC-RA-R2'), 'bí mật lọt ra R2');
  assert.deepEqual(manifest.tables.find((t) => t.name === 'users')?.redacted, ['password_hash']);
  const status = await B.readBackupStatus();
  assert.equal(status?.status, 'ok');
  assert.equal(status?.lastOkDate, DATE);
  assert.ok((status?.bytes ?? 0) > 0);
  assert.ok(!JSON.stringify(status).includes('o@x'), 'trạng thái không được chứa dữ liệu dòng');
  // Đã xong hôm nay: lượt Cron sau không chạy lại.
  assert.equal(await B.maybeNightlyBackup(new Date(NIGHT.getTime() + 300000)), null);
});

void test('khôi phục vào bảng restore_* mới, giống hệt từng dòng, không đụng bảng thật', async () => {
  const live = raw.prepare('SELECT * FROM audit_log ORDER BY id').all();
  const r = await B.restoreTable(DATE, 'audit_log');
  assert.equal(r.table, 'restore_audit_log_20261011');
  assert.equal(r.rows, 2345);
  assert.deepEqual(raw.prepare('SELECT * FROM restore_audit_log_20261011 ORDER BY id').all(), live);
  assert.equal(count('SELECT COUNT(*) AS n FROM audit_log'), 2345);
  // Lần hai: không ghi đè bảng đã khôi phục.
  await assert.rejects(B.restoreTable(DATE, 'audit_log'), (e: Backup.BackupError) => e.status === 409);
  // Bảng tài khoản: đủ dòng, chuỗi đặc biệt giữ nguyên, mật khẩu không có.
  const u = await B.restoreTable(DATE, 'users');
  assert.equal(u.rows, 2);
  const restored = raw.prepare(`SELECT * FROM ${u.table} ORDER BY id`).all().map((x) => ({ ...x }));
  const users = raw.prepare('SELECT * FROM users ORDER BY id').all().map((x) => ({ ...x, password_hash: '' }));
  assert.deepEqual(restored, users);
  const settings = await B.restoreTable(DATE, 'app_settings');
  assert.deepEqual({ ...raw.prepare(`SELECT key, value FROM ${settings.table} WHERE key='marketing_teams_v1'`).get() }, { key: 'marketing_teams_v1', value: JSON.stringify({ a: [1, 2], b: 'ư' }) });
  assert.equal(count(`SELECT COUNT(*) AS n FROM ${settings.table} WHERE key='bot_password'`), 0);
  // Không khôi phục được bảng ngoài nhóm hay ngày lạ.
  await assert.rejects(B.restoreTable(DATE, 'user_mfa'), (e: Backup.BackupError) => e.status === 400);
  await assert.rejects(B.restoreTable('2026-01-01', 'users'), (e: Backup.BackupError) => e.status === 404);
  await assert.rejects(B.restoreTable("2026-10-11'; DROP TABLE users;--", 'users'), (e: Backup.BackupError) => e.status === 400);
});

void test('giữ 30 bản đêm + 12 bản đầu tháng, xoá phần còn lại và lượt dở', async () => {
  // Dựng 15 tháng bản cũ (mỗi ngày một manifest + một tệp), thêm một thư mục dở không có manifest.
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  for (let ms = Date.parse('2025-07-01'); ms < Date.parse(DATE); ms += 86400000) {
    await r2.put(B.manifestKey(day(ms)), '{}');
    await r2.put(B.tableKey(day(ms), 'users'), 'x');
  }
  await r2.put(B.tableKey('2026-09-01', 'audit_log'), 'x');
  await r2.delete(B.manifestKey('2026-09-01'));
  await r2.put(B.tableKey('2025-06-15', 'users'), 'x');
  const s = await B.runBackup({ now: NIGHT });
  assert.equal(s?.status, 'ok', s?.error);
  const left = r2.dates();
  // 30 ngày gần nhất (tới hôm nay) + bản sớm nhất của 12 tháng gần nhất (01/10 đã nằm trong 30 ngày; 01/09 dở nên giữ 02/09).
  assert.ok(left.includes(DATE) && left.includes('2026-09-12') && !left.includes('2026-09-11'));
  for (const m of ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']) assert.ok(left.includes(`${m}-01`), `thiếu ${m}-01`);
  assert.ok(!left.includes('2025-10-01') && !left.includes('2025-07-01') && !left.includes('2025-06-15'));
  assert.ok(!left.includes('2026-09-01'), 'thư mục dở (không manifest) phải bị xoá');
  assert.ok(left.includes('2026-09-02'));
  assert.equal(left.length, 30 + 11);
  // Hàm thuần: bản sớm nhất của mỗi tháng khi thiếu ngày 01.
  const keep = B.keepDates(['2026-01-03', '2026-01-20', '2026-02-02', '2026-02-10'], 1, 12);
  assert.deepEqual([...keep].sort(), ['2026-01-03', '2026-02-02', '2026-02-10']);
  const listed = await B.listBackups();
  assert.equal(listed?.[0].date, DATE);
  assert.ok(listed?.every((b) => b.complete));
});

void test('lượt lỗi ghi "fail", Cron thử lại sau 30 phút, tối đa 3 lần', async () => {
  const broken = { put: () => Promise.reject(new Error('R2 hỏng')), list: (o: object) => r2.list(o), get: (k: string) => r2.get(k), delete: (k: string[]) => r2.delete(k) };
  setEnv({ BACKUP: broken });
  const t = Date.parse('2026-10-11T19:05:00Z'); // 02:05 ngày 12/10 giờ VN
  const s1 = await B.maybeNightlyBackup(new Date(t));
  assert.equal(s1?.status, 'fail');
  assert.equal(s1?.error, 'R2 hỏng');
  assert.equal(s1?.lastOkDate, DATE);
  assert.equal(await B.maybeNightlyBackup(new Date(t + 10 * 60000)), null);
  assert.equal((await B.maybeNightlyBackup(new Date(t + 31 * 60000)))?.attempts, 2);
  assert.equal((await B.maybeNightlyBackup(new Date(t + 62 * 60000)))?.attempts, 3);
  assert.equal(await B.maybeNightlyBackup(new Date(t + 93 * 60000)), null);
  setEnv({ BACKUP: r2 });
});

void test('chỉ chủ hệ thống: API sao lưu chặn giám đốc / trưởng nhóm / nhân viên, có tên trong nhật ký', async () => {
  for (const role of ['director', 'lead', 'staff']) {
    const a = parseAccess({ role, views_json: JSON.stringify(['config', 'overview']) });
    for (const [m, p] of [['GET', '/api/backup'], ['POST', '/api/backup'], ['POST', '/api/backup/restore']]) assert.ok(scopeApi(a, m, new URL(`https://x${p}`)).blocked, `${role} ${m} ${p}`);
  }
  const owner = parseAccess({ role: 'owner' });
  assert.equal(scopeApi(owner, 'POST', new URL('https://x/api/backup/restore')).blocked, undefined);
  assert.equal(classifyApi('POST', '/api/backup/restore', new URLSearchParams())?.action, 'backup.restore');
  assert.equal(classifyApi('POST', '/api/backup', new URLSearchParams())?.action, 'backup.run');
  // Không có phiên đăng nhập: route tự chặn.
  const { POST } = await import('../app/api/backup/restore/route');
  const res = await POST(new Request('https://x/api/backup/restore', { method: 'POST', body: JSON.stringify({ date: DATE, table: 'users' }) }));
  assert.equal(res.status, 401);
});
