// Lõi D1 trên PC (plan 2026-11-01-chay-web-pc-node, bước N1): chạy một câu SQL trên một kết nối node:sqlite
// và trả đúng dạng D1 của Cloudflare. Dùng chung cho luồng phụ (d1-worker.ts) và chế độ một luồng (d1.ts, readers: 0).
// Không import gì của Cloudflare để chạy được trong worker thread.
import { DatabaseSync, type StatementSync } from 'node:sqlite';

/** Giá trị đã chuẩn hoá để gửi qua luồng: số nguyên an toàn thành bigint để SQLite lưu INTEGER như D1 (D1: "Number → INTEGER" khi là số nguyên). */
export type Bound = null | string | number | bigint | Uint8Array;
export type Row = Record<string, unknown>;
export type Meta = {
  served_by: string;
  duration: number;
  changes: number;
  last_row_id: number;
  changed_db: boolean;
  size_after: number;
  rows_read: number;
  rows_written: number;
};
export type Result = { success: true; results: Row[]; meta: Meta };
export type Op =
  | { kind: 'all' | 'run'; sql: string; args: Bound[] }
  | { kind: 'first'; sql: string; args: Bound[]; col?: string }
  | { kind: 'raw'; sql: string; args: Bound[]; columnNames: boolean };
export type Request =
  | { id: number; op: Op }
  | { id: number; batch: { sql: string; args: Bound[] }[] }
  | { id: number; exec: string };
export type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string; readonly: boolean };

/** Chuẩn hoá tham số theo bảng chuyển kiểu D1: boolean → 0/1, số nguyên → INTEGER, undefined → lỗi D1_TYPE_ERROR. */
export function bindValue(v: unknown): Bound {
  if (v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isSafeInteger(v) ? BigInt(v) : v;
  if (typeof v === 'bigint') throw new Error('D1_TYPE_ERROR: Type \'bigint\' not supported for value \'' + String(v) + '\'');
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  throw new Error(`D1_TYPE_ERROR: Type '${v === undefined ? 'undefined' : typeof v}' not supported for value '${v === undefined ? 'undefined' : JSON.stringify(v)}'`);
}

const CODES: Record<number, string> = { 1: 'SQLITE_ERROR', 5: 'SQLITE_BUSY', 6: 'SQLITE_LOCKED', 8: 'SQLITE_READONLY', 13: 'SQLITE_FULL', 19: 'SQLITE_CONSTRAINT', 20: 'SQLITE_MISMATCH', 25: 'SQLITE_RANGE' };
/** Lỗi theo kiểu D1 ("D1_ERROR: <lời SQLite>: SQLITE_<mã>"), giữ lời gốc để code cũ dò /UNIQUE constraint failed/ vẫn khớp. */
export function d1Message(e: unknown): { message: string; readonly: boolean } {
  const err = e as { message?: string; errcode?: number; errstr?: string };
  const msg = String(err?.message ?? e);
  if (msg.startsWith('D1_')) return { message: msg, readonly: false };
  const code = typeof err?.errcode === 'number' ? err.errcode & 0xff : undefined;
  const name = code !== undefined ? CODES[code] : undefined;
  const text = err?.errstr && msg.startsWith(err.errstr) && msg !== err.errstr ? msg.slice(err.errstr.length).trim() : msg;
  return { message: `D1_ERROR: ${text}${name ? `: ${name}` : ''}`, readonly: code === 8 };
}

/** Bình thường hoá giá trị đọc ra: bigint (số quá lớn, đọc lại bằng readBigInts) về Number như D1; BLOB về mảng số như D1. */
function plain(row: Row): Row {
  const out: Row = {};
  for (const k in row) {
    const v = row[k];
    out[k] = typeof v === 'bigint' ? Number(v) : v instanceof Uint8Array ? Array.from(v) : v;
  }
  return out;
}

export type Conn = { db: DatabaseSync; readonly: boolean; label: string; cache: Map<string, StatementSync> };

/** Mở một kết nối. Kết nối ghi bật WAL; kết nối đọc mở chỉ đọc, nên lỡ chạy câu ghi sẽ báo SQLITE_READONLY và được chuyển sang kết nối ghi. */
export function openConn(file: string, readonly: boolean, label: string): Conn {
  const db = new DatabaseSync(file, { readOnly: readonly });
  db.exec('PRAGMA busy_timeout=10000');
  if (!readonly && file !== ':memory:') db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL');
  // 64 MB bộ nhớ trang mỗi kết nối; mmap để các kết nối dùng chung trang trong RAM của hệ điều hành.
  db.exec('PRAGMA cache_size=-65536; PRAGMA mmap_size=4294967296; PRAGMA temp_store=MEMORY');
  return { db, readonly, label, cache: new Map() };
}

function prepared(c: Conn, sql: string): StatementSync {
  let st = c.cache.get(sql);
  if (st) { c.cache.delete(sql); c.cache.set(sql, st); return st; }
  st = c.db.prepare(sql);
  c.cache.set(sql, st);
  if (c.cache.size > 500) c.cache.delete(c.cache.keys().next().value!);
  return st;
}

function counters(c: Conn) {
  const r = prepared(c, 'SELECT total_changes() AS t, changes() AS c, last_insert_rowid() AS l').get() as { t: number; c: number; l: number };
  return r;
}

function sizeAfter(c: Conn) {
  const p = prepared(c, 'PRAGMA page_count').get() as { page_count: number };
  const s = prepared(c, 'PRAGMA page_size').get() as { page_size: number };
  return Number(p.page_count) * Number(s.page_size);
}

/** Chạy câu, lấy mọi dòng (kể cả RETURNING). Số dòng quá lớn cho Number thì đọc lại bằng bigint rồi đổi về Number như D1. */
function rows(st: StatementSync, args: Bound[]): Row[] {
  try {
    return (st.all(...args) as Row[]).map(plain);
  } catch (e) {
    if ((e as { code?: string }).code !== 'ERR_OUT_OF_RANGE') throw e;
    st.setReadBigInts(true);
    try { return (st.all(...args) as Row[]).map(plain); } finally { st.setReadBigInts(false); }
  }
}

/** Một câu, trả D1Result. `changes` chỉ tính khi tổng thay đổi của kết nối tăng (câu SELECT giữ 0 như D1). */
export function runStatement(c: Conn, sql: string, args: Bound[]): Result {
  const t0 = performance.now();
  const before = c.readonly ? 0 : counters(c).t;
  const results = rows(prepared(c, sql), args);
  let changes = 0;
  let lastRowId = 0;
  if (!c.readonly) {
    const after = counters(c);
    if (after.t !== before) { changes = Number(after.c); lastRowId = Number(after.l); }
  }
  const duration = performance.now() - t0;
  return {
    success: true,
    results,
    meta: { served_by: c.label, duration, changes, last_row_id: lastRowId, changed_db: changes > 0, size_after: sizeAfter(c), rows_read: results.length, rows_written: changes },
  };
}

export function runOp(c: Conn, op: Op): unknown {
  if (op.kind === 'all' || op.kind === 'run') return runStatement(c, op.sql, op.args);
  if (op.kind === 'first') {
    const r = runStatement(c, op.sql, op.args).results[0];
    if (!r) return null;
    if (op.col === undefined) return r;
    if (!(op.col in r)) throw new Error(`D1_ERROR: Column not found: ${op.col}`);
    return r[op.col];
  }
  const raw = op as Extract<Op, { kind: 'raw' }>;
  const st = prepared(c, raw.sql);
  const names = st.columns().map((x) => x.name);
  const out = rows(st, raw.args).map((r) => Object.values(r));
  return raw.columnNames ? [names, ...out] : out;
}

/** batch của D1 là một giao dịch: lỗi ở câu nào thì lùi cả lượt. Kết nối đọc dùng giao dịch đọc để mọi câu cùng một ảnh dữ liệu. */
export function runBatch(c: Conn, list: { sql: string; args: Bound[] }[]): Result[] {
  c.db.exec(c.readonly ? 'BEGIN' : 'BEGIN IMMEDIATE');
  try {
    const out = list.map((s) => runStatement(c, s.sql, s.args));
    c.db.exec('COMMIT');
    return out;
  } catch (e) {
    if (c.db.isTransaction) c.db.exec('ROLLBACK');
    throw e;
  }
}

/** exec của D1: nhiều câu cách nhau, trả { count, duration }. */
export function runExec(c: Conn, sql: string) {
  const t0 = performance.now();
  c.db.exec(sql);
  const count = sql.split(/;\s*(?:\r?\n|$)/).filter((s) => s.trim()).length;
  return { count, duration: performance.now() - t0 };
}

export function handle(c: Conn, req: Request): Reply {
  try {
    const value = 'op' in req ? runOp(c, req.op) : 'batch' in req ? runBatch(c, req.batch) : runExec(c, req.exec);
    return { id: req.id, ok: true, value };
  } catch (e) {
    return { id: req.id, ok: false, ...d1Message(e) };
  }
}
