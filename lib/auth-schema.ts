// Bảng / cột phục vụ đăng nhập mới (25/09/2026): yêu cầu đăng nhập bằng QR hoặc duyệt trên app, và thông tin từng phiên.
// Tự tạo khi cần (một lần mỗi isolate) để khỏi phải chạy migration tay; drizzle/0029_login_requests.sql ghi lại cùng nội dung.
import { env } from 'cloudflare:workers';

const SESSION_COLUMNS: [string, string][] = [
  ['client', 'TEXT'], ['method', 'TEXT'], ['ip', 'TEXT'], ['place', 'TEXT'], ['device', 'TEXT'], ['last_seen_at', 'TEXT'],
];
let ready: Promise<void> | null = null;
export function ensureAuthSchema() {
  ready ??= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_requests (
      id TEXT PRIMARY KEY, poll_hash TEXT NOT NULL, kind TEXT NOT NULL, user_id TEXT, number INTEGER NOT NULL, choices TEXT NOT NULL,
      status TEXT NOT NULL, remember INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_at TEXT,
      decided_by TEXT, requester_ua TEXT, requester_ip TEXT, requester_place TEXT, requester_device TEXT)`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_login_requests_user ON login_requests (user_id,status)').run();
    const cols = await env.DB.prepare('PRAGMA table_info(sessions)').all<{ name: string }>();
    const have = new Set(cols.results.map((c) => c.name));
    for (const [name, type] of SESSION_COLUMNS) if (!have.has(name)) await env.DB.prepare(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`).run();
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
