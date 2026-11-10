// Máy chủ Node cho web tổng trên PC (plan docs/plans/2026-11-01-chay-web-pc-node, N2–N3).
// Chạy nguyên bản build Cloudflare (dist/server/index.js: worker.ts + vinext) trong Node, thay các thứ chỉ Cloudflare có:
//   env.DB → pc/d1.ts (SQLite nhiều luồng đọc)   env.SYNC_SCHEDULER → pc/durable.ts   caches → pc/cache.ts
//   'cloudflare:workers' → pc/cloudflare-workers.ts   Cron mỗi phút → đồng hồ trong tiến trình   tệp tĩnh dist/client
// AI, HR (gọi thẳng CRM_URL), SEARCH_LIMIT không gắn: code đã tự xử lý khi thiếu.
//
// Biến môi trường:
//   THP_DB      (bắt buộc) file SQLite bản chép D1        THP_DO_DB   file trạng thái bộ hẹn giờ (mặc định do.sqlite cạnh THP_DB)
//   THP_VARS    file .dev.vars (bí mật, KHOÁ=giá trị)     THP_DIST    thư mục build (mặc định thư mục dist của repo)
//   PORT=8787   HOST=127.0.0.1   THP_READERS=6 (số luồng đọc)   THP_CRON=0 để tắt đồng hồ mỗi phút
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseHeadersFile, parseVars, sendStatic, staticFile, toRequest, writeResponse } from './http';
import { env } from './cloudflare-workers';
import { installCaches } from './cache';
import { openD1 } from './d1';
import { durableNamespace } from './durable';

type Ctx = { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void; props: Record<string, unknown> };
type WorkerModule = {
  default: {
    fetch(req: Request, env: unknown, ctx: Ctx): Promise<Response>;
    scheduled(c: { cron: string; scheduledTime: number; noRetry(): void }, env: unknown, ctx: Ctx): Promise<void>;
  };
  SyncScheduler: new (ctx: unknown, env: Record<string, unknown>) => { alarm?: () => Promise<void> };
};

const here = dirname(fileURLToPath(import.meta.url));
// Chạy từ mã nguồn (pc/server.ts) thì build ở ../dist; chạy bản đóng gói (dist/pc/server.js) thì ở thư mục cha.
const DIST = resolve(process.env.THP_DIST ?? (import.meta.url.endsWith('.ts') ? join(here, '..', 'dist') : join(here, '..')));
const DB_FILE = process.env.THP_DB;
if (!DB_FILE) throw new Error('Thiếu THP_DB (đường dẫn file SQLite bản chép D1).');
const DO_FILE = process.env.THP_DO_DB ?? join(dirname(resolve(DB_FILE)), 'do.sqlite');
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';

const CLIENT = join(DIST, 'client');
const headerRules = parseHeadersFile(existsSync(join(CLIENT, '_headers')) ? readFileSync(join(CLIENT, '_headers'), 'utf8') : '');

const pending = new Set<Promise<unknown>>();
const ctx = (): Ctx => ({
  waitUntil(p) {
    const q = Promise.resolve(p).catch((e) => console.error('waitUntil failed', e)).finally(() => pending.delete(q));
    pending.add(q);
  },
  passThroughOnException() {},
  props: {},
});

// ---- khởi động ----
const vars = {
  ...(existsSync(join(DIST, 'server', 'wrangler.json')) ? (JSON.parse(readFileSync(join(DIST, 'server', 'wrangler.json'), 'utf8')) as { vars?: Record<string, string> }).vars : {}),
  ...(process.env.THP_VARS ? parseVars(readFileSync(process.env.THP_VARS, 'utf8')) : {}),
};
installCaches();
const db = await openD1(resolve(DB_FILE), { readers: Number(process.env.THP_READERS ?? 6) });
Object.assign(env, vars, { DB: db });
register(new URL(import.meta.url.endsWith('.ts') ? './hooks.ts' : './hooks.js', import.meta.url));
const worker = (await import(pathToFileURL(join(DIST, 'server', 'index.js')).href)) as WorkerModule;
const sched = durableNamespace(DO_FILE, 'SyncScheduler', worker.SyncScheduler, env);
env.SYNC_SCHEDULER = sched;

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if ((req.method === 'GET' || req.method === 'HEAD') && path === '/__pc/health' && /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress ?? '')) {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true, uptime: process.uptime(), d1: db.stats(), pending: pending.size }));
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const file = staticFile(CLIENT, path);
    if (file) return sendStatic(req, res, file, headerRules(path));
  }
  const started = Date.now();
  worker.default.fetch(toRequest(req, PORT), env, ctx())
    .then((r) => writeResponse(res, r, req.method === 'HEAD'))
    .catch((e) => {
      console.error('request failed', req.method, path, e);
      if (!res.headersSent) { res.statusCode = 500; res.setHeader('content-type', 'text/plain; charset=utf-8'); }
      res.end('Lỗi máy chủ.');
    })
    .finally(() => { const ms = Date.now() - started; if (ms > 3000) console.warn(`slow ${req.method} ${path} ${ms}ms`); });
});
server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => console.log(`web tổng (Node) chạy ở http://${HOST}:${PORT}, dữ liệu ${DB_FILE}`));

// ---- Cron mỗi phút (thay Cron Trigger của Cloudflare; Task Scheduler không cần gọi nữa) ----
let cronTimer: ReturnType<typeof setTimeout> | null = null;
function nextCron() {
  const now = Date.now();
  const at = Math.floor(now / 60000) * 60000 + 60000;
  cronTimer = setTimeout(() => {
    worker.default.scheduled({ cron: '* * * * *', scheduledTime: at, noRetry() {} }, env, ctx()).catch((e) => console.error('scheduled failed', e));
    nextCron();
  }, at - now);
}
if (process.env.THP_CRON !== '0') nextCron();

async function shutdown(signal: string) {
  console.log(`${signal}: dừng nhận request, chờ việc nền xong`);
  if (cronTimer) clearTimeout(cronTimer);
  server.close();
  await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, 10000))]);
  sched.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
