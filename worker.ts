import handler from 'vinext/server/fetch-handler';
import { SyncScheduler } from '@/lib/scheduler';
import { getSessionUserFromRequest } from '@/lib/auth';
import { scopeApi } from '@/lib/access';

export { SyncScheduler };

// Cache ngắn (trong bộ nhớ isolate) cho API báo cáo: cùng một URL trong 90 giây và chưa có lượt đồng bộ mới
// thì trả lại kết quả cũ, để nhiều người/nhiều thẻ mở cùng lúc không xếp hàng chờ D1 (D1 chạy tuần tự từng câu).
const REPORT_CACHE_TTL_MS = 90000;
const REPORT_CACHE_MAX_BYTES = 3_000_000;
const REPORT_CACHE_MAX_ENTRIES = 80;
type CachedResponse = { at: number; version: string; status: number; headers: [string, string][]; body: ArrayBuffer };
const reportCache = new Map<string, CachedResponse>();
const cacheable = (pathname: string) => pathname.startsWith('/api/reports/') || pathname === '/api/employees' || pathname === '/api/sync/pos';

async function cachedReport(request: Request, env: Cloudflare.Env, pathname: string, run: () => Promise<Response>) {
  if (request.method !== 'GET' || !cacheable(pathname)) return run();
  let version = '';
  try {
    if (!(await getSessionUserFromRequest(request))) return run();
    const row = await env.DB.prepare('SELECT COALESCE(MAX(last_sync_at),\'\')||COALESCE(MAX(customers_synced_at),\'\') AS v FROM pos_shops').first<{ v: string }>();
    version = row?.v ?? '';
  } catch { return run(); }
  const key = request.url;
  const hit = reportCache.get(key);
  if (hit && hit.version === version && Date.now() - hit.at < REPORT_CACHE_TTL_MS)
    return new Response(hit.body.slice(0), { status: hit.status, headers: [...hit.headers, ['x-thp-cache', 'hit']] });
  const response = await run();
  if (response.ok && (response.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await response.clone().arrayBuffer();
    if (body.byteLength <= REPORT_CACHE_MAX_BYTES) {
      if (reportCache.size >= REPORT_CACHE_MAX_ENTRIES) reportCache.delete(reportCache.keys().next().value!);
      reportCache.set(key, { at: Date.now(), version, status: response.status, headers: [...response.headers.entries()], body });
    }
  }
  return response;
}

const scheduler = (env: Cloudflare.Env) => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

// Worker entry: vinext phục vụ web + API; đồng bộ Pancake chạy nền bằng DO alarm
// (và cả Cron Trigger nếu Cloudflare gọi).
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    if (pathname === '/' || pathname.startsWith('/api/'))
      ctx.waitUntil(scheduler(env).ensure().catch((error) => console.error('scheduler ensure failed', error)));
    const started = Date.now();
    // Phân quyền tập trung: mọi API (trừ đăng nhập/webhook) được thu hẹp theo POS/nhóm của tài khoản, phần không được cấp thì chặn.
    let scoped = request;
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/') && pathname !== '/api/telegram/webhook') {
      const user = await getSessionUserFromRequest(request).catch(() => null);
      if (!user) return Response.json({ error: 'Đăng nhập để tiếp tục.' }, { status: 401 });
      const r = scopeApi(user, request.method, new URL(request.url));
      if (r.blocked) return Response.json({ error: r.blocked }, { status: 403 });
      if (r.url.toString() !== request.url) scoped = new Request(r.url.toString(), request);
    }
    try {
      return await cachedReport(scoped, env, pathname, () => handler.fetch(scoped, env, ctx));
    } finally {
      // Ghi lại request chậm (kèm đường dẫn) để tra trong Workers Logs khi web "treo".
      const ms = Date.now() - started;
      if (ms > 3000) console.warn(`slow ${request.method} ${pathname} ${ms}ms`);
    }
  },
  // Cron Trigger chỉ "đánh thức" bộ hẹn giờ DO; DO là nơi duy nhất chạy đồng bộ (không chạy chồng hai lượt lên D1).
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduler(env).kick().catch((error) => console.error('scheduler kick failed', error)));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
