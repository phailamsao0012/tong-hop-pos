import handler from 'vinext/server/fetch-handler';
import { maybeDailySummary } from '@/lib/ai-summary';
import { maybeDailyTrendNotes } from '@/lib/ai-trends';
import { SyncScheduler } from '@/lib/scheduler';
import { getSessionUserFromRequest } from '@/lib/auth';
import { scopeApi } from '@/lib/access';
import { AUDIT_HEADER, audit, classifyApi, summarizeBody } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import { pullHr } from '@/lib/hr-sync';
import { COUNTED_STAFF_KEY, usingHrTeams } from '@/lib/team';
import { SENT_AT_READY_KEY } from '@/lib/stats';
import { refreshTeamSource } from '@/lib/team-source';
import { runDispatch } from '@/lib/dispatch';
import { demoBlocked, installDemo, isDemo } from '@/lib/demo/mode';

export { SyncScheduler };
// Bản demo (Worker riêng, DEMO_MODE=1): nối Pancake POS giả (người và số ảo); ở web thật lệnh này không làm gì.
installDemo();

// Cache cho API báo cáo, hai tầng: bộ nhớ isolate (90 giây) và Cache API dùng chung mọi isolate cùng trạm Cloudflare (5 phút).
// Khóa luôn kèm "phiên bản dữ liệu" (lần đồng bộ Pancake mới nhất, danh sách "Vẫn tính doanh số", ghi chú nguyên nhân):
// đồng bộ xong là khóa đổi, người mở sau tính lại từ D1 nên số luôn mới bằng lần đồng bộ gần nhất (anh Vũ 10/10/2026: "tôi cần
// dữ liệu realtime"). Mục đích: nhiều người/nhiều thẻ mở cùng một báo cáo không bắt D1 tính lại từng lần (D1 chạy tuần tự từng câu;
// test tải 10/10/2026: quá ~10 lời gọi/giây là D1 báo "overloaded").
const REPORT_CACHE_TTL_MS = 90000;
const SHARED_CACHE_TTL_S = 300;
const REPORT_CACHE_MAX_BYTES = 3_000_000;
const REPORT_CACHE_MAX_ENTRIES = 80;
type CachedResponse = { at: number; status: number; headers: [string, string][]; body: ArrayBuffer };
const reportCache = new Map<string, CachedResponse>();
// Bản mới nhất của từng báo cáo, không kèm phiên bản: chỉ dùng khi tính lại bị lỗi vì D1 quá tải (thay vì báo lỗi cho người xem).
// Số trong bản này có giờ đồng bộ của nó (syncedAt), cũ nhất STALE_MAX_MS.
const STALE_MAX_MS = 15 * 60000;
const staleCache = new Map<string, CachedResponse>();
// Cùng một báo cáo đang được tính trong isolate này: người đến sau chờ kết quả đó, không gửi thêm câu giống hệt vào D1.
const inflight = new Map<string, Promise<{ entry: CachedResponse; tag: string } | null>>();
const cacheable = (pathname: string) => pathname.startsWith('/api/reports/') || pathname === '/api/employees' || pathname === '/api/sync/pos';

// Bật cờ Vận đơn theo ngày gửi (van_don_sent_ready) cũng đổi phiên bản, để số theo cách tính mới hiện ngay (QA 10/10/2026).
// Phiên bản dữ liệu: nhớ 5 giây trong isolate (mỗi lời gọi API không phải hỏi D1 thêm một câu). Lệnh ghi (POST/PUT/...) xoá
// bản nhớ để bấm "Vẫn tính" / ghi nguyên nhân xong thấy số mới ngay.
// D1 bận không hỏi được phiên bản: dùng phiên bản hỏi được gần nhất (tối đa 10 phút) thay vì bỏ qua cache. Test tải 10/10/2026: bỏ qua
// cache lúc D1 bận làm mọi lượt dồn hết vào D1, quá tải nặng thêm.
const VERSION_MEMO_MS = 5000;
const VERSION_FALLBACK_MS = 10 * 60000;
let versionMemo: { at: number; value: Promise<string> } | null = null;
let lastVersion: { at: number; value: string } | null = null;
function dataVersion(env: Cloudflare.Env, fresh = false) {
  if (!fresh && versionMemo && Date.now() - versionMemo.at < VERSION_MEMO_MS) return versionMemo.value;
  const value = env.DB.prepare(`SELECT COALESCE(MAX(last_sync_at),'')||COALESCE(MAX(customers_synced_at),'')||COALESCE((SELECT MAX(updated_at) FROM app_settings WHERE key IN ('${COUNTED_STAFF_KEY}','uncounted_notes','${SENT_AT_READY_KEY}')),'') AS v FROM pos_shops`)
    .first<{ v: string }>().then((row) => {
      const v = row?.v ?? '';
      lastVersion = { at: Date.now(), value: v };
      return v;
    }).catch((error) => {
      if (lastVersion && Date.now() - lastVersion.at < VERSION_FALLBACK_MS) return lastVersion.value;
      throw error;
    });
  const memo = { at: Date.now(), value };
  versionMemo = memo;
  value.catch(() => { if (versionMemo === memo) versionMemo = null; });
  return value;
}
const forgetVersion = () => { versionMemo = null; };
// Người vừa ghi (ghi nguyên nhân, bấm "Vẫn tính"...) thấy ngay số mới dù lượt đọc sau rơi vào isolate khác còn nhớ phiên bản cũ
// (tới VERSION_MEMO_MS): lệnh ghi gắn cookie ngắn hạn, lượt đọc có cookie này hỏi lại phiên bản thẳng từ D1.
const WRITE_COOKIE = 'thp_w';
const WRITE_FRESH_MS = 15000;
const recentWrite = (request: Request) => {
  const m = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)thp_w=(\d+)/);
  return !!m && Date.now() - Number(m[1]) < WRITE_FRESH_MS;
};

const replay = (entry: CachedResponse, tag: string) =>
  new Response(entry.body.slice(0), { status: entry.status, headers: [...entry.headers, ['x-thp-cache', tag]] });
function remember(key: string, staleKey: string, entry: CachedResponse) {
  if (reportCache.size >= REPORT_CACHE_MAX_ENTRIES) reportCache.delete(reportCache.keys().next().value!);
  reportCache.set(key, { ...entry, at: Date.now() });
  staleCache.delete(staleKey);
  if (staleCache.size >= REPORT_CACHE_MAX_ENTRIES) staleCache.delete(staleCache.keys().next().value!);
  staleCache.set(staleKey, entry);
}
async function capture(response: Response): Promise<CachedResponse | null> {
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) return null;
  const body = await response.clone().arrayBuffer();
  if (body.byteLength > REPORT_CACHE_MAX_BYTES) return null;
  const headers = [...response.headers.entries()].filter(([k]) => k !== 'set-cookie' && k !== 'x-thp-cache');
  return { at: Date.now(), status: response.status, headers, body };
}

// Cache API (bộ nhớ đệm riêng tên "thp-reports", không phải cache CDN): khóa là URL cùng tên miền, đường dẫn băm từ khóa báo cáo.
// Không ai mở được từ ngoài: mọi request vào tên miền đều qua Worker, Worker không đọc đường dẫn này từ cache cho trình duyệt.
const sharedUrl = async (origin: string, key: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return `${origin}/__thp_report_cache/${[...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};
async function sharedGet(origin: string, key: string): Promise<CachedResponse | null> {
  const res = await (await caches.open('thp-reports')).match(await sharedUrl(origin, key));
  if (!res) return null;
  const meta = JSON.parse(decodeURIComponent(res.headers.get('x-thp-meta') ?? 'null')) as { status: number; headers: [string, string][]; at?: number } | null;
  if (!meta) return null;
  return { at: meta.at ?? Date.now(), status: meta.status, headers: meta.headers, body: await res.arrayBuffer() };
}
async function sharedPut(origin: string, key: string, entry: CachedResponse, ttl = SHARED_CACHE_TTL_S) {
  const headers = new Headers({ 'content-type': 'application/octet-stream', 'cache-control': `max-age=${ttl}`, 'x-thp-meta': encodeURIComponent(JSON.stringify({ status: entry.status, headers: entry.headers, at: entry.at })) });
  await (await caches.open('thp-reports')).put(await sharedUrl(origin, key), new Response(entry.body.slice(0), { headers }));
}
async function staleFallback(origin: string, staleKey: string) {
  const local = staleCache.get(staleKey);
  if (local && Date.now() - local.at < STALE_MAX_MS) return local;
  return sharedGet(origin, staleKey).catch(() => null);
}

// Sau mỗi lần đồng bộ, khóa của mọi báo cáo đổi cùng lúc: người mở đầu tiên của từng báo cáo đều phải chờ D1 tính lại, test tải
// 10/10/2026 thấy lỗi dồn thành cụm ngay sau mỗi lần đồng bộ. Bật THP_SWR="1" (hiện chỉ bản demo): khi chưa có bản của phiên bản mới,
// trả ngay bản gần nhất (kèm giờ đồng bộ của chính nó, x-thp-data-at) và chỉ MỘT lượt tính lại ngầm. "Một lượt" nhờ khóa trong Cache API
// sống 30 giây: khóa này theo trạm Cloudflare và không nguyên tử, nên chỉ bớt tính trùng chứ không chắc chắn một (QA 10/10/2026).
// Lượt tính ngầm lỗi thì khóa tự hết hạn sau 30 giây, lượt đọc sau đó tính lại. Người vừa ghi (cookie thp_w) luôn tính thẳng.
const SWR_LOCK_TTL_S = 30;
const swrOn = (env: Cloudflare.Env) => env.THP_SWR === '1';
const revalidating = new Set<string>();
async function takeLock(origin: string, key: string) {
  const cache = await caches.open('thp-reports');
  const url = (await sharedUrl(origin, `lock|${key}`)).replace('/__thp_report_cache/', '/__thp_report_lock/');
  if (await cache.match(url)) return false;
  await cache.put(url, new Response('1', { headers: { 'cache-control': `max-age=${SWR_LOCK_TTL_S}` } }));
  return true;
}

async function cachedReport(request: Request, env: Cloudflare.Env, ctx: ExecutionContext, pathname: string, run: () => Promise<Response>, user: SessionUser | null = null) {
  if (request.method !== 'GET' || !cacheable(pathname) || !user) return run();
  const wrote = recentWrite(request);
  let version = '';
  try { version = await dataVersion(env, wrote); } catch { return run(); }
  // Khóa gồm cả vai trò và nguồn team (Pancake / web nhân sự): một số báo cáo che bớt số theo vai trò (vd. đơn chia CSKH chỉ chủ hệ thống / giám đốc thấy).
  // URL đã được phân quyền thu hẹp (POS/nhóm của tài khoản) trước khi tới đây.
  const staleKey = `stale|${user.role}|${usingHrTeams() ? 'hr' : 'pc'}|${request.url}`;
  const key = `${user.role}|${usingHrTeams() ? 'hr' : 'pc'}|${version}|${request.url}`;
  const { origin } = new URL(request.url);
  const hit = reportCache.get(key);
  if (hit && Date.now() - hit.at < REPORT_CACHE_TTL_MS) return replay(hit, 'hit');
  const waiting = inflight.get(key);
  if (waiting) {
    const got = await waiting.catch(() => null);
    return got ? replay(got.entry, got.tag === 'stale' || got.tag === 'swr' ? got.tag : 'wait') : run();
  }
  const own: { response?: Response } = {};
  // Tính từ D1, nhớ vào cả hai tầng (khóa theo phiên bản và bản gần nhất).
  const compute = async (keep: boolean) => {
    let response: Response | null = null;
    try { response = await run(); } catch (error) { console.error('report failed', pathname, error); }
    if (!response || response.status >= 500) return { response, entry: null };
    if (keep) own.response = response;
    const entry = await capture(response);
    if (entry) {
      remember(key, staleKey, entry);
      ctx.waitUntil(Promise.all([sharedPut(origin, key, entry), sharedPut(origin, staleKey, entry, STALE_MAX_MS / 1000)])
        .catch((error) => console.error('report cache put failed', error)));
    }
    return { response, entry };
  };
  const job = (async () => {
    const shared = await sharedGet(origin, key).catch(() => null);
    if (shared) { remember(key, staleKey, shared); return { entry: shared, tag: 'shared' }; }
    if (swrOn(env) && !wrote) {
      const prev = await staleFallback(origin, staleKey);
      if (prev) {
        if (!revalidating.has(key) && await takeLock(origin, key).catch(() => false)) {
          revalidating.add(key);
          ctx.waitUntil(compute(false).catch((error) => console.error('report revalidate failed', pathname, error))
            .finally(() => revalidating.delete(key)));
        }
        return { entry: prev, tag: 'swr' };
      }
    }
    const { response, entry } = await compute(true);
    if (!response || response.status >= 500) {
      const stale = await staleFallback(origin, staleKey);
      if (stale) return { entry: stale, tag: 'stale' };
      if (!response) throw new Error(`report failed: ${pathname}`);
      own.response = response;
    }
    return entry ? { entry, tag: 'db' } : null;
  })();
  inflight.set(key, job);
  try {
    const got = await job;
    if (own.response) return own.response;
    const out = replay(got!.entry, got!.tag);
    if (got!.tag === 'swr' || got!.tag === 'stale') out.headers.set('x-thp-data-at', new Date(got!.entry.at).toISOString());
    return out;
  } finally { inflight.delete(key); }
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
      const res = await cachedReport(sub, env, ctx, subUrl.pathname, () => handler.fetch(sub, env, ctx), user);
      return { url: u, status: res.status, body: await res.text() };
    } catch (error) {
      console.error('batch item failed', u, error);
      return { url: u, status: 500, body: JSON.stringify({ error: 'Lỗi máy chủ.' }) };
    }
  }));
  return Response.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
}

function withHsts(r: Response) {
  if (r.headers.has('Strict-Transport-Security')) return r;
  const out = new Response(r.body, r);
  out.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return out;
}
const scheduler = (env: Cloudflare.Env) => env.SYNC_SCHEDULER.get(env.SYNC_SCHEDULER.idFromName('main'));

// Worker entry: vinext phục vụ web + API; đồng bộ Pancake chạy nền bằng DO alarm
// (và cả Cron Trigger nếu Cloudflare gọi).
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const { pathname } = url;
    // Mở bằng http:// (gõ tay trên điện thoại): cookie đăng nhập chỉ đi qua https nên sẽ không đăng nhập được, và trình duyệt
    // báo "Không bảo mật" → chuyển hẳn sang https (trừ máy thử nghiệm localhost).
    // wrangler dev gán hostname của route thật vào request.url và Host, nên máy thử tự khai bằng biến LOCAL_DEV
    // (chạy: wrangler dev --var LOCAL_DEV:1); trên Cloudflare không có biến này.
    const local = !!env.LOCAL_DEV || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost');
    if (url.protocol === 'http:' && !local) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    // Mở bằng www.: Google chỉ cho quay về https://tonghopposmegatech.io.vn/login (08/10/2026 anh Vũ gặp "redirect_uri_mismatch"),
    // cookie đăng nhập cũng theo từng tên miền → chuyển trang (và nút Google) về tên miền chính. API khác giữ nguyên cho tab đang mở.
    if (url.hostname.startsWith('www.') && !local && (request.method === 'GET' || request.method === 'HEAD') && (!pathname.startsWith('/api/') || pathname === '/api/auth/google')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    // Chỉ "đánh thức" bộ hẹn giờ khi mở trang chính, không phải mỗi lời gọi API (bớt RPC vào Durable Object).
    if (pathname === '/')
      ctx.waitUntil(scheduler(env).ensure().catch((error) => console.error('scheduler ensure failed', error)));
    const started = Date.now();
    if (isDemo() && pathname.startsWith('/api/')) {
      const blocked = demoBlocked(request.method, pathname);
      if (blocked) return Response.json({ error: blocked }, { status: 403 });
    }
    // Nguồn team cho báo cáo (Pancake hay web nhân sự): đọc lại tối đa mỗi phút.
    if (pathname.startsWith('/api/')) await refreshTeamSource();
    // Phân quyền tập trung: mọi API (trừ đăng nhập/webhook) được thu hẹp theo POS/nhóm của tài khoản, phần không được cấp thì chặn.
    let scoped = request;
    // Nhật ký hoạt động: mọi API thay đổi dữ liệu (POST/PUT/PATCH/DELETE) và các lần xuất/xem toàn bộ được ghi lại kèm người dùng.
    let auditUser: SessionUser | null = null;
    let sessionUser: SessionUser | null = null;
    let auditKind: { action: string; target: string } | null = null;
    let auditBody = '';
    // /api/hr/* do web nhân sự gọi bằng bí mật HR_SHARED_SECRET, không có phiên đăng nhập. Riêng handoff là trình duyệt mở:
    // tự kiểm tra phiên và chuyển sang trang đăng nhập khi chưa đăng nhập (không trả JSON 401 ở đây).
    const hrInternal = pathname.startsWith('/api/hr/');
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/') && pathname !== '/api/telegram/webhook' && pathname !== '/api/recruit/webhook' && pathname !== '/api/marketing/sheet-webhook' && !hrInternal) {
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
      const upstream = await cachedReport(scoped, env, ctx, pathname, () => handler.fetch(scoped, env, ctx), sessionUser);
      // HSTS: trình duyệt nhớ 1 năm là chỉ dùng https với tên miền này (kể cả gõ http lần sau).
      let response = local ? upstream : withHsts(upstream);
      if (request.method !== 'GET' && request.method !== 'HEAD' && pathname.startsWith('/api/') && response.status < 400) {
        response = new Response(response.body, response);
        response.headers.append('Set-Cookie', `${WRITE_COOKIE}=${Date.now()}; Path=/; Max-Age=${WRITE_FRESH_MS / 1000}; SameSite=Lax; HttpOnly${local ? '' : '; Secure'}`);
      }
      if (auditKind && auditUser) {
        const declared = response.headers.get(AUDIT_HEADER);
        let action = auditKind.action, detail = request.method === 'GET' ? auditBody : summarizeBody(auditBody);
        if (declared) { const d = decodeURIComponent(declared); const i = d.indexOf('|'); if (i > 0) { action = d.slice(0, i); detail = d.slice(i + 1); } else detail = d; }
        ctx.waitUntil(audit({ action, target: auditKind.target, userId: auditUser.userId, email: auditUser.email, name: auditUser.displayName, detail, status: response.status, request }));
      }
      return response;
    } finally {
      if (request.method !== 'GET' && request.method !== 'HEAD' && pathname.startsWith('/api/')) forgetVersion();
      // Ghi lại request chậm (kèm đường dẫn) để tra trong Workers Logs khi web "treo".
      const ms = Date.now() - started;
      if (ms > 3000) console.warn(`slow ${request.method} ${pathname} ${ms}ms`);
    }
  },
  // Cron Trigger chỉ "đánh thức" bộ hẹn giờ DO; DO là nơi duy nhất chạy đồng bộ (không chạy chồng hai lượt lên D1).
  // Cron chạy mỗi phút cho Chia số (thử nghiệm); các việc cũ vẫn giữ nhịp 5 phút.
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDispatch(new Date(controller.scheduledTime)).catch((error) => console.error('dispatch run failed', error)));
    if (new Date(controller.scheduledTime).getUTCMinutes() % 5 !== 0) return;
    await refreshTeamSource();
    ctx.waitUntil(scheduler(env).kick().catch((error) => console.error('scheduler kick failed', error)));
    // Tóm tắt sáng bằng Workers AI: một lần mỗi ngày sau 7h30 giờ VN.
    ctx.waitUntil(maybeDailySummary().catch((error) => console.error('ai summary failed', error)));
    // Nhận xét xu hướng theo bộ phận: cũng một lần mỗi ngày sau 7h30.
    ctx.waitUntil(maybeDailyTrendNotes().catch((error) => console.error('ai trend notes failed', error)));
    // Bản sao web nhân sự: kéo mỗi lượt Cron (chỉ ghi khi dữ liệu đổi).
    if (env.HR_SHARED_SECRET || isDemo()) ctx.waitUntil(pullHr());
  },
} satisfies ExportedHandler<Cloudflare.Env>;
