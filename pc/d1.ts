// env.DB kiểu D1 cho web tổng chạy bằng Node trên PC (plan docs/plans/2026-11-01-chay-web-pc-node, bước N1).
// Gỡ nút thắt "một luồng" của wrangler dev: câu đọc chia cho nhiều luồng phụ, mỗi luồng một kết nối chỉ đọc (SQLite WAL
// cho phép đọc song song); câu ghi, batch có ghi và exec đi qua một luồng ghi duy nhất. Kết quả, lỗi, meta giữ đúng dạng D1.
import { Worker } from 'node:worker_threads';
import { bindValue, handle, openConn, type Bound, type Conn, type Reply, type Request } from './d1-core';

export type PcD1Options = {
  /** Số luồng đọc. 0 = chạy hết trên luồng chính, một kết nối (dùng cho test và máy yếu). */
  readers?: number;
  /** Đường dẫn file worker; mặc định là d1-worker cạnh file này (.ts khi chạy test, .js khi đã build). */
  workerUrl?: URL;
};
export type PcD1 = D1Database & { close(): Promise<void>; stats(): { reads: number; writes: number; rerouted: number } };

const READ = /^\s*(?:SELECT|WITH|VALUES)\b/i;
const WRITE_WORD = /\b(?:INSERT|UPDATE|DELETE|REPLACE\s+INTO|CREATE|DROP|ALTER)\b/i;
/** Câu chỉ đọc thì đi luồng đọc. Đoán sai cũng không hỏng: kết nối đọc báo SQLITE_READONLY thì chạy lại trên luồng ghi. */
export const isReadSql = (sql: string) => READ.test(sql) && !(/^\s*WITH\b/i.test(sql) && WRITE_WORD.test(sql)) && !/\bRETURNING\b/i.test(sql);

type Lane = { run(req: Omit<Request, 'id'>): Promise<unknown>; pending(): number; close(): Promise<void> };

function workerLane(url: URL, file: string, readonly: boolean, label: string): Lane {
  const w = new Worker(url, { workerData: { file, readonly, label } });
  let seq = 0;
  const waiting = new Map<number, { ok(v: unknown): void; fail(e: Error): void }>();
  let ready!: () => void;
  let broken!: (e: Error) => void;
  const started = new Promise<void>((r, f) => { ready = r; broken = f; });
  w.on('message', (m: Reply) => {
    if (m.id === 0) return ready();
    const p = waiting.get(m.id);
    if (!p) return;
    waiting.delete(m.id);
    if (m.ok) p.ok(m.value);
    else p.fail(Object.assign(new Error(m.message), { readonlyConn: m.readonly }));
  });
  // Luồng chết (lỗi nạp, hết bộ nhớ): báo lỗi cho mọi câu đang chờ thay vì treo.
  const die = (e: Error) => { broken(e); for (const p of waiting.values()) p.fail(e); waiting.clear(); };
  w.on('error', die);
  w.on('exit', (code) => die(new Error(`D1_ERROR: luồng ${label} đã dừng (mã ${code})`)));
  return {
    async run(req) {
      await started;
      const id = ++seq;
      return new Promise((ok, fail) => { waiting.set(id, { ok, fail }); w.postMessage({ ...req, id }); });
    },
    pending: () => waiting.size,
    async close() { await started; w.postMessage('close'); await new Promise((r) => w.once('exit', r)); },
  };
}

function inlineLane(conn: Conn): Lane {
  return {
    async run(req) {
      const m = handle(conn, { ...req, id: 1 } as Request);
      if (m.ok) return m.value;
      throw Object.assign(new Error(m.message), { readonlyConn: m.readonly });
    },
    pending: () => 0,
    async close() { conn.db.close(); },
  };
}

/** Mở file SQLite (bản chép D1) thành env.DB. Luồng ghi mở trước để bật WAL, rồi mới mở các luồng đọc. */
export async function openD1(file: string, opts: PcD1Options = {}): Promise<PcD1> {
  const n = opts.readers ?? 6;
  const url = opts.workerUrl ?? new URL(import.meta.url.endsWith('.ts') ? './d1-worker.ts' : './d1-worker.js', import.meta.url);
  let writer: Lane;
  let readers: Lane[] = [];
  if (n <= 0) writer = inlineLane(openConn(file, false, 'pc-sqlite'));
  else {
    writer = workerLane(url, file, false, 'pc-sqlite-w');
    await writer.run({ exec: 'SELECT 1' });
    readers = Array.from({ length: n }, (_, i) => workerLane(url, file, true, `pc-sqlite-r${i + 1}`));
  }
  const learnedWrites = new Set<string>();
  const stats = { reads: 0, writes: 0, rerouted: 0 };
  const pick = () => readers.reduce((a, b) => (b.pending() < a.pending() ? b : a));

  /** Chạy trên luồng đọc nếu là câu đọc; luồng đọc từ chối vì chỉ đọc thì nhớ câu đó và chạy lại trên luồng ghi. */
  async function route(req: Omit<Request, 'id'>, sqls: string[]) {
    const read = readers.length > 0 && sqls.every((s) => isReadSql(s) && !learnedWrites.has(s));
    if (!read) { stats.writes++; return writer.run(req); }
    stats.reads++;
    try {
      return await pick().run(req);
    } catch (e) {
      if (!(e as { readonlyConn?: boolean }).readonlyConn) throw e;
      for (const s of sqls) learnedWrites.add(s);
      stats.rerouted++;
      return writer.run(req);
    }
  }

  type Stmt = { sql: string; args: Bound[] };
  const statement = (s: Stmt): D1PreparedStatement => {
    const self = {
      __pc: s,
      bind: (...values: unknown[]) => statement({ sql: s.sql, args: values.map(bindValue) }),
      first: (col?: string) => route({ op: { kind: 'first', sql: s.sql, args: s.args, col } }, [s.sql]),
      all: () => route({ op: { kind: 'all', sql: s.sql, args: s.args } }, [s.sql]),
      run: () => route({ op: { kind: 'run', sql: s.sql, args: s.args } }, [s.sql]),
      raw: (o?: { columnNames?: boolean }) => route({ op: { kind: 'raw', sql: s.sql, args: s.args, columnNames: !!o?.columnNames } }, [s.sql]),
    };
    return self as unknown as D1PreparedStatement;
  };

  const db = {
    prepare: (sql: string) => statement({ sql, args: [] }),
    batch: (list: D1PreparedStatement[]) => {
      const items = list.map((x) => (x as unknown as { __pc: Stmt }).__pc);
      return route({ batch: items }, items.map((i) => i.sql));
    },
    exec: (sql: string) => { stats.writes++; return writer.run({ exec: sql }); },
    dump: () => Promise.reject(new Error('D1_ERROR: dump không hỗ trợ trên PC')),
    withSession: () => db,
    stats: () => ({ ...stats }),
    async close() { await Promise.all([...readers, writer].map((l) => l.close())); },
  };
  return db as unknown as PcD1;
}
