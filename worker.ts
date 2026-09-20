import handler from 'vinext/server/fetch-handler';
import { SyncScheduler } from '@/lib/scheduler';
import { getSessionUserFromRequest } from '@/lib/auth';
import { scopeApi } from '@/lib/access';
import { AUDIT_HEADER, audit, classifyApi, summarizeBody } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';

export { SyncScheduler };

// Cache ngắn (trong bộ nhớ isolate) cho API báo cáo: cùng một URL trong 90 giây và chưa có lượt đồng bộ mới
// thì trả lại kết quả cũ, để nhiều người/nhiều thẻ mở cùng lúc không xếp hàng chờ D1 (D1 chạy tuần tự từng câu).
const REPORT_CACHE_TTL_MS = 90000;
const REPORT_CACHE_MAX_BYTES = 3_000_000;
const REPORT_CACHE_MAX_ENTRIES = 80;
type CachedResponse = { at: number; version: string; status: number; headers: [string, string][]; body: ArrayBuffer };
const reportCache = new Map<string, CachedResponse>();
const cacheable = (pathname: string) => pathname.startsWith('/api/reports/') || pathname === '/api/employees' || pathname === '/api/sync/pos';

async function cachedReport(request: Request, env: Cloudflare.Env, pathname: string, run: () => Promise<Response>, user: SessionUser | null = null) {
  if (request.method !== 'GET' || !cacheable(pathname)) return run();
  let version = '';
  try {
    if (!user) return run();
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

const BATCH_MAX = 12;
const batchable = (path: string) => (path.startsWith('/api/reports/') && path !== '/api/reports/batch') || path === '/api/sync/pos' || path === '/api/employees';
async function batchReports(request: Request, env: Cloudflare.Env, ctx: ExecutionContext, user: SessionUser) {
  let body: { urls?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string' && u.startsWith('/api/')).slice(0, BATCH_MAX) : [];
  if (!urls.length) return Response.json({ error: 'Thiếu danh sách URL.' }, { status: 400 });
  const results = await Promise.all(urls.map(async (u) => {
    const subUrl = new URL(u, request.url);
    if (!batchable(subUrl.pathname)) return { url: u, status: 400, body: JSON.stringify({ error: 'URL không được gộp.' }) };
    const r = scopeApi(user, 'GET', subUrl);
    if (r.blocked) return { url: u, status: 403, body: JSON.stringify({ error: r.blocked }) };
    // Chỉ chuyển cookie/accept: giữ nguyên header của POST (content-type, content-length) cho một GET làm handler chờ body mãi.
    const h = new Headers(); const ck = request.headers.get('cookie'); if (ck) h.set('cookie', ck); h.set('accept', 'application/json');
    const sub = new Request(r.url.toString(), { method: 'GET', headers: h });
    try {
      const res = await cachedReport(sub, env, subUrl.pathname, () => handler.fetch(sub, env, ctx), user);
      return { url: u, status: res.status, body: await res.text() };
    } catch (error) {
      console.error('batch item failed', u, error);
      return { url: u, status: 500, body: JSON.stringify({ error: 'Lỗi máy chủ.' }) };
    }
  }));
  return Response.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
}

const scheduler = (env: Cloudflare.Env) => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

// Worker entry: vinext phục vụ web + API; đồng bộ Pancake chạy nền bằng DO alarm
// (và cả Cron Trigger nếu Cloudflare gọi).
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    // Chỉ "đánh thức" bộ hẹn giờ khi mở trang chính, không phải mỗi lời gọi API (bớt RPC vào Durable Object).
    if (pathname === '/')
      ctx.waitUntil(scheduler(env).ensure().catch((error) => console.error('scheduler ensure failed', error)));
    const started = Date.now();
    // Phân quyền tập trung: mọi API (trừ đăng nhập/webhook) được thu hẹp theo POS/nhóm của tài khoản, phần không được cấp thì chặn.
    let scoped = request;
    // Nhật ký hoạt động: mọi API thay đổi dữ liệu (POST/PUT/PATCH/DELETE) và các lần xuất/xem toàn bộ được ghi lại kèm người dùng.
    let auditUser: SessionUser | null = null;
    let sessionUser: SessionUser | null = null;
    let auditKind: { action: string; target: string } | null = null;
    let auditBody = '';
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/') && pathname !== '/api/telegram/webhook') {
      let user: SessionUser | null;
      try { user = await getSessionUserFromRequest(request); }
      catch (error) {
        // D1 bận / lỗi tạm thời: không được hiểu nhầm thành "chưa đăng nhập" (trước đây trả 401, trang báo sai).
        console.error('session lookup failed', error);
        return Response.json({ error: 'Máy chủ dữ liệu đang bận, thử lại sau vài giây.' }, { status: 503, headers: { 'Retry-After': '3' } });
      }
      if (!user) return Response.json({ error: 'Đăng nhập để tiếp tục.' }, { status: 401 });
      sessionUser = user;
      // Gộp nhiều API báo cáo trong một request (trình duyệt gom các lời gọi song song lại): giảm số vòng đi–về trên mạng chậm.
      // Từng URL con vẫn qua đúng phân quyền và cache như gọi riêng.
      if (pathname === '/api/reports/batch' && request.method === 'POST') return batchReports(request, env, ctx, user);
      const url = new URL(request.url);
      auditKind = pathname === '/api/activity' ? null : classifyApi(request.method, pathname, url.searchParams);
      if (auditKind) {
        auditUser = user;
        if (request.method !== 'GET') auditBody = await request.clone().text().catch(() => '');
        else auditBody = url.search.slice(1, 400);
      }
      const r = scopeApi(user, request.method, url);
      if (r.blocked) {
        if (auditKind) ctx.waitUntil(audit({ ...auditKind, userId: user.userId, email: user.email, name: user.displayName, detail: `Bị chặn: ${r.blocked}`, status: 403, request }));
        return Response.json({ error: r.blocked }, { status: 403 });
      }
      if (r.url.toString() !== request.url) scoped = new Request(r.url.toString(), request);
    }
    try {
      const response = await cachedReport(scoped, env, pathname, () => handler.fetch(scoped, env, ctx), sessionUser);
      if (auditKind && auditUser) {
        const declared = response.headers.get(AUDIT_HEADER);
        let action = auditKind.action, detail = request.method === 'GET' ? auditBody : summarizeBody(auditBody);
        if (declared) { const d = decodeURIComponent(declared); const i = d.indexOf('|'); if (i > 0) { action = d.slice(0, i); detail = d.slice(i + 1); } else detail = d; }
        ctx.waitUntil(audit({ action, target: auditKind.target, userId: auditUser.userId, email: auditUser.email, name: auditUser.displayName, detail, status: response.status, request }));
      }
      return response;
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
