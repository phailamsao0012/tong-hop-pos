// Durable Object chạy trong tiến trình Node trên PC (plan 2026-11-01-chay-web-pc-node, N2–N3).
// Web tổng chỉ có một DO (SyncScheduler, tên 'main'): bộ hẹn giờ đồng bộ Pancake. Trên PC chỉ một tiến trình nên một bản
// trong bộ nhớ là đủ; ctx.storage (get/put/delete, alarm) lưu vào file SQLite riêng để tắt máy bật lại vẫn nhớ trạng thái.
// Giá trị lưu bằng v8.serialize (cùng kiểu "structured clone" như Cloudflare).
import { DatabaseSync } from 'node:sqlite';
import { deserialize, serialize } from 'node:v8';

type AlarmTarget = { alarm?: () => Promise<void> | void };
const MAX_TIMEOUT = 2 ** 31 - 1;
/** Alarm lỗi thì thử lại như Cloudflare: tối đa 6 lần, giãn dần từ 2 giây. */
const RETRY_MS = [2000, 4000, 8000, 16000, 32000, 64000];

export class DoStorage {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private retries = 0;
  target: AlarmTarget | null = null;

  constructor(private db: DatabaseSync, private ns: string) {}

  async get<T = unknown>(key: string | string[]): Promise<T | undefined | Map<string, unknown>> {
    if (Array.isArray(key)) {
      const out = new Map<string, unknown>();
      for (const k of key) { const v = this.read(k); if (v !== undefined) out.set(k, v); }
      return out;
    }
    return this.read(key) as T | undefined;
  }

  async put(key: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof key === 'string' ? [[key, value] as const] : Object.entries(key);
    const st = this.db.prepare('INSERT INTO do_kv (ns, k, v) VALUES (?, ?, ?) ON CONFLICT(ns, k) DO UPDATE SET v = excluded.v');
    this.db.exec('BEGIN');
    try { for (const [k, v] of entries) st.run(this.ns, k, serialize(v)); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  async delete(key: string | string[]): Promise<boolean | number> {
    const keys = Array.isArray(key) ? key : [key];
    let n = 0;
    for (const k of keys) n += Number(this.db.prepare('DELETE FROM do_kv WHERE ns = ? AND k = ?').run(this.ns, k).changes);
    return Array.isArray(key) ? n : n > 0;
  }

  async list(opts: { prefix?: string } = {}): Promise<Map<string, unknown>> {
    const rows = this.db.prepare('SELECT k, v FROM do_kv WHERE ns = ? AND k >= ? ORDER BY k').all(this.ns, opts.prefix ?? '') as { k: string; v: Uint8Array }[];
    return new Map(rows.filter((r) => !opts.prefix || r.k.startsWith(opts.prefix)).map((r) => [r.k, deserialize(r.v)]));
  }

  async getAlarm(): Promise<number | null> {
    const r = this.db.prepare('SELECT at FROM do_alarm WHERE ns = ?').get(this.ns) as { at: number } | undefined;
    return r ? Number(r.at) : null;
  }

  async setAlarm(at: number | Date): Promise<void> {
    const t = typeof at === 'number' ? at : at.getTime();
    this.db.prepare('INSERT INTO do_alarm (ns, at) VALUES (?, ?) ON CONFLICT(ns) DO UPDATE SET at = excluded.at').run(this.ns, t);
    this.arm();
  }

  async deleteAlarm(): Promise<void> {
    this.db.prepare('DELETE FROM do_alarm WHERE ns = ?').run(this.ns);
    this.arm();
  }

  /** Đặt lại đồng hồ theo alarm đang lưu. Gọi khi khởi động và mỗi lần alarm đổi. */
  arm() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.running) return; // chạy xong sẽ tự đặt lại
    const r = this.db.prepare('SELECT at FROM do_alarm WHERE ns = ?').get(this.ns) as { at: number } | undefined;
    if (!r) return;
    this.timer = setTimeout(() => void this.fire(), Math.min(MAX_TIMEOUT, Math.max(0, Number(r.at) - Date.now())));
    this.timer.unref();
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  private async fire() {
    this.timer = null;
    const at = await this.getAlarm();
    if (at === null) return;
    if (at > Date.now()) return this.arm();
    // Như Cloudflare: alarm được xoá trước khi alarm() chạy; alarm() muốn chạy tiếp thì tự setAlarm.
    this.db.prepare('DELETE FROM do_alarm WHERE ns = ? AND at = ?').run(this.ns, at);
    this.running = true;
    try {
      await this.target?.alarm?.();
      this.retries = 0;
    } catch (e) {
      console.error('alarm failed', e);
      if (this.retries < RETRY_MS.length && (await this.getAlarm()) === null) {
        this.db.prepare('INSERT INTO do_alarm (ns, at) VALUES (?, ?) ON CONFLICT(ns) DO NOTHING').run(this.ns, Date.now() + RETRY_MS[this.retries++]);
      } else this.retries = 0;
    } finally {
      this.running = false;
      this.arm();
    }
  }

  private read(k: string) {
    const r = this.db.prepare('SELECT v FROM do_kv WHERE ns = ? AND k = ?').get(this.ns, k) as { v: Uint8Array } | undefined;
    return r ? deserialize(r.v) : undefined;
  }
}

type DoClass<T> = new (ctx: unknown, env: Record<string, unknown>) => T;

/** Thay binding Durable Object (env.SYNC_SCHEDULER): idFromName/get trả thẳng bản trong tiến trình (gọi hàm như RPC). */
export function durableNamespace<T extends AlarmTarget>(file: string, className: string, Klass: DoClass<T>, env: Record<string, unknown>) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
    CREATE TABLE IF NOT EXISTS do_kv (ns TEXT NOT NULL, k TEXT NOT NULL, v BLOB, PRIMARY KEY (ns, k));
    CREATE TABLE IF NOT EXISTS do_alarm (ns TEXT PRIMARY KEY, at INTEGER NOT NULL);`);
  const objects = new Map<string, { obj: T; storage: DoStorage }>();
  const open = (name: string) => {
    let o = objects.get(name);
    if (!o) {
      const storage = new DoStorage(db, `${className}:${name}`);
      const ctx = {
        id: { name, toString: () => name },
        storage,
        waitUntil: (p: Promise<unknown>) => void Promise.resolve(p).catch((e) => console.error('DO waitUntil failed', e)),
        blockConcurrencyWhile: <R>(fn: () => Promise<R>) => fn(),
      };
      const obj = new Klass(ctx, env);
      storage.target = obj;
      o = { obj, storage };
      objects.set(name, o);
      storage.arm();
    }
    return o;
  };
  // Mở sẵn những DO đã có alarm từ lần chạy trước để đồng hồ chạy tiếp ngay khi bật máy.
  for (const r of db.prepare('SELECT ns FROM do_alarm').all() as { ns: string }[]) {
    if (r.ns.startsWith(`${className}:`)) open(r.ns.slice(className.length + 1));
  }
  return {
    idFromName: (name: string) => ({ name, toString: () => name }),
    get: (id: { name: string }) => open(id.name).obj,
    close() { for (const o of objects.values()) o.storage.stop(); db.close(); },
    storageOf: (name: string) => open(name).storage,
  };
}
