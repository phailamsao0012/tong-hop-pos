// Sao lưu đêm nhóm bảng KHÔNG lấy lại được (tài khoản, cài đặt, mục tiêu, chia số, quyền bot, nhật ký) ra kho R2 riêng tư (binding BACKUP).
// Plan: web-tong/2026-10-11-rui-ro/2-dung-luong-sao-luu.md. Đọc từng bảng theo trang (rowid tăng dần, mỗi trang nhỏ) để D1 không bị giữ lâu;
// không dùng `d1 export` (khoá cả database). Mỗi bảng một tệp gzip JSON + manifest (số dòng, câu CREATE). Giữ 30 bản đêm + 12 bản đầu tháng.
// Không ghi bí mật đăng nhập ra R2 (EXCLUDED_TABLES, REDACTED_COLUMNS, ROW_FILTERS). Log chỉ ghi số đếm và thời gian, không ghi dữ liệu.
// Khôi phục: một bảng của một ngày vào bảng MỚI restore_<bảng>_<yyyymmdd>, không bao giờ ghi đè bảng đang chạy.
import { env } from 'cloudflare:workers';
import { VN_OFFSET_HOURS, todayVn } from '@/lib/shared/report-time';

/** Bảng được sao lưu (thứ tự: nhỏ trước, nhật ký lớn sau cùng). Bảng tạo trong mã khi dùng lần đầu mà chưa có thì bỏ qua. */
export const BACKUP_TABLES = [
  'users', 'app_settings', 'targets', 'staff_settings', 'alert_rules', 'telegram_chats', 'telegram_requests', 'report_presets',
  'dispatch_pos', 'dispatch_staff', 'dispatch_log', 'assignments', 'orders', 'customers', 'recruit_candidates', 'recruit_cv',
  'sheet_cost_aliases', 'audit_log',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Bảng chứa bí mật đăng nhập: không bao giờ sao lưu (QA 11/10/2026). Mất thì người dùng đăng ký / đăng nhập lại. */
export const EXCLUDED_TABLES: Record<string, string> = {
  user_mfa: 'Khoá TOTP của người dùng; mất thì bật lại mã ứng dụng',
  passkeys: 'Khoá passkey; mất thì đăng ký lại passkey',
  trusted_devices: 'Băm cookie thiết bị tin cậy; mất thì nhập OTP lại',
  sessions: 'Băm mã phiên đăng nhập; mất thì đăng nhập lại',
  login_challenges: 'OTP / thử thách đăng nhập đang chờ (sống vài phút)',
  login_requests: 'Yêu cầu đăng nhập QR đang chờ (băm mã hỏi)',
  hr_handoffs: 'Mã chuyển đăng nhập một lần sang web nhân sự',
  sheet_cost_keys: 'Băm khoá gửi chi phí từ Google Sheet; tạo khoá mới được',
};
/** Cột bí mật trong bảng được sao lưu: ghi rỗng. Khôi phục tài khoản thì chủ hệ thống đặt lại mật khẩu (đăng nhập Google vẫn dùng được). */
export const REDACTED_COLUMNS: Partial<Record<BackupTable, string[]>> = { users: ['password_hash'] };
/** Dòng bí mật bỏ qua (điều kiện SQL cố định, không nhận từ ngoài). */
export const ROW_FILTERS: Partial<Record<BackupTable, string>> = { app_settings: "key NOT IN ('bot_password')" };

export const BACKUP_STATUS_KEY = 'backup:last';
export const BACKUP_PREFIX = 'd1/';
export const NOT_CONFIGURED = 'Chưa cấu hình kho sao lưu (R2 BACKUP).';
const RUN_HOUR_VN = 2;
const PAGE_ROWS = 1000;
/** D1 cho tối đa 1.000 câu mỗi lượt Worker; chừa phần cho việc khác trong cùng lượt Cron. */
const QUERY_BUDGET = 700;
const MAX_ATTEMPTS = 3;
const RETRY_MS = 30 * 60000;
const RUNNING_STALE_MS = 30 * 60000;
/** Mỗi câu INSERT khi khôi phục mang một chuỗi JSON nhiều dòng (D1 giới hạn 100 tham số / câu, 2 MB / chuỗi). */
const RESTORE_CHUNK_CHARS = 400_000;
export const KEEP_NIGHTLY = 30;
export const KEEP_MONTHLY = 12;

export type BackupStatus = {
  status: 'ok' | 'fail' | 'off' | 'running';
  /** Ngày (giờ VN) của lượt sao lưu, cũng là thư mục d1/<ngày>/ trên R2. */
  date: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  /** Tổng byte đã nén ghi lên R2. */
  bytes?: number;
  /** Số dòng từng bảng. */
  tables?: Record<string, number>;
  error?: string;
  /** Ghi chú khi vẫn thành công (vd. bảng tạo trong mã chưa có). */
  note?: string;
  attempts: number;
  lastOkDate?: string;
  lastOkAt?: string;
  /** Số thư mục ngày đã xoá theo quy tắc giữ 30 + 12. */
  pruned?: number;
};
export type ManifestTable = { name: string; key: string; rows: number; bytes: number; columns: string[]; createSql: string; redacted?: string[]; filter?: string };
export type Manifest = {
  version: 1; date: string; startedAt: string; finishedAt: string;
  tables: ManifestTable[]; missing: string[]; excluded: Record<string, string>;
};
type Bucket = Pick<R2Bucket, 'put' | 'get' | 'list' | 'delete'>;

export class BackupError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const bucket = (): Bucket | undefined => env.BACKUP;
const quote = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Tên bảng/cột lạ: ${name}`);
  return `"${name}"`;
};
const shortError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
export const tableKey = (date: string, table: string) => `${BACKUP_PREFIX}${date}/${table}.json.gz`;
export const manifestKey = (date: string) => `${BACKUP_PREFIX}${date}/manifest.json`;
export const restoreName = (table: string, date: string) => `restore_${table}_${date.replaceAll('-', '')}`;
const validDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function readBackupStatus(db: D1Database = env.DB): Promise<BackupStatus | null> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(BACKUP_STATUS_KEY).first<{ value: string }>();
  if (!row) return null;
  try { return JSON.parse(row.value) as BackupStatus; } catch { return null; }
}
async function writeStatus(s: BackupStatus) {
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(BACKUP_STATUS_KEY, JSON.stringify(s), new Date().toISOString()).run();
}
/** Giành lượt chạy: chỉ ghi "running" khi trạng thái vẫn đúng như lúc đọc (hai lượt Cron không chạy chồng). */
async function claim(prev: string | null, next: BackupStatus) {
  const value = JSON.stringify(next), at = new Date().toISOString();
  const r = prev === null
    ? await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value,updated_at) VALUES (?,?,?)').bind(BACKUP_STATUS_KEY, value, at).run()
    : await env.DB.prepare('UPDATE app_settings SET value=?,updated_at=? WHERE key=? AND value=?').bind(value, at, BACKUP_STATUS_KEY, prev).run();
  return Number(r.meta.changes ?? r.meta.rows_written ?? 0) > 0;
}
const running = (s: BackupStatus | null, now: number) => s?.status === 'running' && now - Date.parse(s.startedAt) < RUNNING_STALE_MS;

/** Gọi mỗi lượt Cron 5 phút: từ 02:00 giờ VN chạy một lần mỗi ngày; lỗi thì thử lại sau 30 phút, tối đa 3 lần. */
export async function maybeNightlyBackup(now = new Date()) {
  if (new Date(now.getTime() + VN_OFFSET_HOURS * 3600000).getUTCHours() < RUN_HOUR_VN) return null;
  const cur = await readBackupStatus();
  const date = todayVn(now.getTime());
  if (cur?.date === date) {
    if (cur.status === 'ok' || cur.status === 'off' || running(cur, now.getTime())) return null;
    if (cur.status === 'fail' && (cur.attempts >= MAX_ATTEMPTS || now.getTime() - Date.parse(cur.finishedAt ?? cur.startedAt) < RETRY_MS)) return null;
  }
  return runBackup({ now });
}

/** Chạy một lượt sao lưu (Cron hoặc chủ hệ thống bấm). Trả null khi đang có lượt khác chạy. */
export async function runBackup(opts: { now?: Date; pageRows?: number } = {}): Promise<BackupStatus | null> {
  const now = opts.now ?? new Date();
  const date = todayVn(now.getTime());
  const prevRow = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(BACKUP_STATUS_KEY).first<{ value: string }>();
  const prev = prevRow ? (() => { try { return JSON.parse(prevRow.value) as BackupStatus; } catch { return null; } })() : null;
  if (running(prev, now.getTime())) return null;
  const keep = prev?.lastOkDate ? { lastOkDate: prev.lastOkDate, lastOkAt: prev.lastOkAt } : {};
  const startedAt = now.toISOString();
  const r2 = bucket();
  if (!r2) {
    const off: BackupStatus = { status: 'off', date, startedAt, finishedAt: startedAt, durationMs: 0, attempts: 0, error: NOT_CONFIGURED, ...keep };
    await writeStatus(off);
    return off;
  }
  const attempts = prev?.date === date && prev.status !== 'ok' && prev.status !== 'off' ? prev.attempts + 1 : 1;
  const start: BackupStatus = { status: 'running', date, startedAt, attempts, ...keep };
  if (!(await claim(prevRow?.value ?? null, start))) return null;
  const t0 = Date.now();
  // Giờ kết thúc tính từ `now` (giờ lượt Cron) cộng thời gian chạy, để so lần thử lại cùng một mốc.
  const at = () => new Date(now.getTime() + Date.now() - t0).toISOString();
  try {
    const manifest = await dumpAll(r2, date, startedAt, opts.pageRows ?? PAGE_ROWS);
    const pruned = await prune(r2, date);
    const bytes = manifest.tables.reduce((s, t) => s + t.bytes, 0);
    const done: BackupStatus = {
      status: 'ok', date, startedAt, finishedAt: at(), durationMs: Date.now() - t0, bytes, attempts,
      tables: Object.fromEntries(manifest.tables.map((t) => [t.name, t.rows])), lastOkDate: date, lastOkAt: at(), pruned,
      ...(manifest.missing.length ? { note: `Chưa có bảng: ${manifest.missing.join(', ')}` } : {}),
    };
    await writeStatus(done);
    console.log(`backup ok ${date}: ${manifest.tables.length} bảng, ${Object.values(done.tables!).reduce((a, b) => a + b, 0)} dòng, ${bytes} byte, ${done.durationMs} ms, xoá ${pruned} bản cũ`);
    return done;
  } catch (error) {
    const fail: BackupStatus = { status: 'fail', date, startedAt, finishedAt: at(), durationMs: Date.now() - t0, attempts, error: shortError(error), ...keep };
    console.error(`backup fail ${date} lần ${attempts} sau ${fail.durationMs} ms`);
    await writeStatus(fail).catch(() => console.error('backup status write failed'));
    return fail;
  }
}

/** Ghi từng dòng (chuỗi) vào luồng nén gzip, trả về bytes đã nén. */
async function gzip(produce: (push: (text: string) => Promise<void>) => Promise<void>) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  const out = new Response(cs.readable).arrayBuffer();
  const enc = new TextEncoder();
  try {
    await produce((text) => writer.write(enc.encode(text)));
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    out.catch(() => undefined);
    throw error;
  }
  return new Uint8Array(await out);
}

async function dumpAll(r2: Bucket, date: string, startedAt: string, pageRows: number): Promise<Manifest> {
  const db = env.DB;
  let queries = 0;
  const q = <T>(p: Promise<T>) => { if (++queries > QUERY_BUDGET) throw new Error(`Vượt ${QUERY_BUDGET} câu D1 trong một lượt sao lưu`); return p; };
  const names = BACKUP_TABLES.map(() => '?').join(',');
  const master = new Map((await q(db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN (${names})`).bind(...BACKUP_TABLES).all<{ name: string; sql: string }>()))
    .results.map((r) => [r.name, r.sql]));
  const tables: ManifestTable[] = [];
  const missing: string[] = [];
  for (const table of BACKUP_TABLES) {
    const createSql = master.get(table);
    if (!createSql) { missing.push(table); continue; }
    const columns = (await q(db.prepare(`PRAGMA table_info(${quote(table)})`).all<{ name: string }>())).results.map((c) => c.name);
    const redacted = (REDACTED_COLUMNS[table] ?? []).filter((c) => columns.includes(c));
    const filter = ROW_FILTERS[table];
    const select = `SELECT rowid AS "__rk", ${columns.map(quote).join(',')} FROM ${quote(table)} WHERE rowid > ?${filter ? ` AND (${filter})` : ''} ORDER BY rowid LIMIT ?`;
    let rows = 0;
    const bytes = await gzip(async (push) => {
      await push(`${JSON.stringify({ table, date, columns, redacted }).slice(0, -1)},"rows":[`);
      let after = Number.MIN_SAFE_INTEGER, first = true;
      for (;;) {
        const page = (await q(db.prepare(select).bind(after, pageRows).all<Record<string, unknown>>())).results;
        if (!page.length) break;
        let chunk = '';
        for (const row of page) {
          const values = columns.map((c) => redacted.includes(c) ? '' : row[c] ?? null);
          chunk += `${first ? '' : ','}\n${JSON.stringify(values)}`;
          first = false;
        }
        await push(chunk);
        rows += page.length;
        after = Number(page[page.length - 1].__rk);
        if (page.length < pageRows) break;
      }
      await push('\n]}\n');
    });
    const key = tableKey(date, table);
    await r2.put(key, bytes, { httpMetadata: { contentType: 'application/gzip' } });
    tables.push({ name: table, key, rows, bytes: bytes.byteLength, columns, createSql, ...(redacted.length ? { redacted } : {}), ...(filter ? { filter } : {}) });
  }
  const manifest: Manifest = { version: 1, date, startedAt, finishedAt: new Date().toISOString(), tables, missing, excluded: EXCLUDED_TABLES };
  // Manifest ghi sau cùng: thư mục ngày chưa có manifest là lượt dở, không dùng để khôi phục.
  await r2.put(manifestKey(date), JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json' } });
  return manifest;
}

/** Ngày giữ lại: 30 bản mới nhất + bản sớm nhất của mỗi tháng trong 12 tháng gần nhất. */
export function keepDates(dates: string[], nightly = KEEP_NIGHTLY, monthly = KEEP_MONTHLY) {
  const sorted = [...new Set(dates)].sort().reverse();
  const keep = new Set(sorted.slice(0, nightly));
  const firstOfMonth = new Map<string, string>();
  for (const d of sorted) firstOfMonth.set(d.slice(0, 7), d);
  [...firstOfMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, monthly).forEach(([, d]) => keep.add(d));
  return keep;
}

type DateEntry = { date: string; keys: string[]; bytes: number; complete: boolean };
async function listDates(r2: Bucket): Promise<DateEntry[]> {
  const byDate = new Map<string, DateEntry>();
  let cursor: string | undefined;
  do {
    const page = await r2.list({ prefix: BACKUP_PREFIX, cursor, limit: 1000 });
    for (const o of page.objects) {
      const m = o.key.slice(BACKUP_PREFIX.length).match(/^(\d{4}-\d{2}-\d{2})\//);
      if (!m) continue;
      const e = byDate.get(m[1]) ?? { date: m[1], keys: [], bytes: 0, complete: false };
      e.keys.push(o.key); e.bytes += o.size;
      if (o.key === manifestKey(m[1])) e.complete = true;
      byDate.set(m[1], e);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Xoá thư mục ngày ngoài quy tắc giữ (và lượt dở của ngày cũ). Chỉ chạy sau một lượt thành công. */
async function prune(r2: Bucket, today: string) {
  const all = await listDates(r2);
  const keep = keepDates(all.filter((e) => e.complete).map((e) => e.date));
  let pruned = 0;
  for (const e of all) {
    if (e.date === today || (e.complete && keep.has(e.date))) continue;
    for (let i = 0; i < e.keys.length; i += 1000) await r2.delete(e.keys.slice(i, i + 1000));
    pruned++;
  }
  return pruned;
}

/** Danh sách bản sao lưu trên R2 (mới nhất trước). */
export async function listBackups() {
  const r2 = bucket();
  if (!r2) return null;
  return (await listDates(r2)).map(({ date, bytes, complete, keys }) => ({ date, bytes, complete, files: keys.length }));
}

export async function readManifest(date: string): Promise<Manifest | null> {
  const r2 = bucket();
  if (!r2) throw new BackupError(NOT_CONFIGURED, 503);
  if (!validDate(date)) throw new BackupError('Ngày không hợp lệ.');
  const obj = await r2.get(manifestKey(date));
  return obj ? JSON.parse(await obj.text()) as Manifest : null;
}

/** Đổi tên bảng trong câu CREATE lấy từ sqlite_master sang tên bảng khôi phục (bỏ IF NOT EXISTS để không lặng lẽ ghi vào bảng có sẵn). */
export function renameCreate(sql: string, table: string, target: string) {
  const re = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(["`[]?)([A-Za-z0-9_]+)["`\]]?/i;
  const m = sql.match(re);
  if (!m || m[2] !== table) throw new BackupError('Câu tạo bảng trong bản sao lưu không khớp tên bảng.', 422);
  return sql.replace(re, `CREATE TABLE ${quote(target)}`);
}

/** Đọc tệp gzip JSON (mỗi dòng một bản ghi) theo luồng, không nạp cả bảng vào bộ nhớ. */
async function* readRows(body: ReadableStream): AsyncGenerator<unknown[]> {
  const reader = body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  const parse = (line: string) => { const t = line.trim(); return t.startsWith('[') ? JSON.parse(t.endsWith(',') ? t.slice(0, -1) : t) as unknown[] : null; };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    const lines = buf.split('\n');
    buf = done ? '' : lines.pop()!;
    for (const line of lines) { const row = parse(line); if (row) yield row; }
    if (done) { const row = parse(buf); if (row) yield row; return; }
  }
}

/** Khôi phục một bảng của một ngày vào bảng mới restore_<bảng>_<yyyymmdd>. Không đụng bảng đang chạy. */
export async function restoreTable(date: unknown, table: unknown) {
  const r2 = bucket();
  if (!r2) throw new BackupError(NOT_CONFIGURED, 503);
  if (!validDate(date)) throw new BackupError('Ngày không hợp lệ.');
  if (typeof table !== 'string' || !(BACKUP_TABLES as readonly string[]).includes(table)) throw new BackupError('Bảng không nằm trong nhóm sao lưu.');
  const manifest = await readManifest(date);
  if (!manifest) throw new BackupError(`Không có bản sao lưu ngày ${date}.`, 404);
  const entry = manifest.tables.find((t) => t.name === table);
  if (!entry) throw new BackupError(`Bản ngày ${date} không có bảng ${table}.`, 404);
  const target = restoreName(table, date);
  const db = env.DB;
  if (await db.prepare("SELECT 1 AS x FROM sqlite_master WHERE name=?").bind(target).first()) throw new BackupError(`Đã có bảng ${target}; xoá bảng đó trước nếu muốn khôi phục lại.`, 409);
  const obj = await r2.get(entry.key);
  if (!obj) throw new BackupError(`Thiếu tệp ${entry.key} trên kho sao lưu.`, 404);
  const create = renameCreate(entry.createSql, table, target);
  const insert = `INSERT INTO ${quote(target)} (${entry.columns.map(quote).join(',')}) SELECT ${entry.columns.map((_, i) => `json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?)`;
  await db.prepare(create).run();
  let rows = 0;
  try {
    let chunk: string[] = [], size = 0;
    const flush = async () => { if (!chunk.length) return; await db.prepare(insert).bind(`[${chunk.join(',')}]`).run(); chunk = []; size = 0; };
    for await (const row of readRows(obj.body)) {
      if (row.length !== entry.columns.length) throw new Error('Số cột của dòng không khớp manifest');
      const text = JSON.stringify(row);
      if (size + text.length > RESTORE_CHUNK_CHARS) await flush();
      chunk.push(text); size += text.length; rows++;
    }
    await flush();
  } catch (error) {
    // Lỗi giữa chừng: bỏ bảng dở (chỉ bảng restore_* vừa tạo) để lần sau khôi phục lại được.
    await db.prepare(`DROP TABLE IF EXISTS ${quote(target)}`).run().catch(() => undefined);
    throw new BackupError(`Khôi phục lỗi: ${shortError(error)}`, 500);
  }
  return { table: target, rows, expected: entry.rows, redacted: entry.redacted ?? [] };
}
