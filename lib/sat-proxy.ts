// Gọi API dành cho app của web vệ tinh (/api/v1/app/*) thay mặt người đang dùng app: kèm bí mật liên kết (crmFetch)
// và header x-main-actor để web vệ tinh tự kiểm quyền. App không bao giờ gọi thẳng web vệ tinh.
import { canView } from '@/lib/access';
import { forbidden, getSessionUser, unauthorized, type SessionUser } from '@/lib/auth';
import { crmFetch } from '@/lib/hr-sync';
import { HR_FORBIDDEN, MAIN_ACTOR_HEADER, actorHeader, relay, type Relayed } from '@/lib/satellites';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };
const noStore = (r: Response) => { r.headers.set('Cache-Control', NO_STORE['Cache-Control']); return r; };
/** Cách gọi từng web vệ tinh (Service Binding). */
const SENDERS: Record<string, (path: string, init?: RequestInit) => Promise<Response>> = { hr: crmFetch };

/** Gọi web vệ tinh (mặc định web nhân sự); quá thời gian thì ném lỗi. */
export async function satFetch(user: SessionUser, path: string, init: RequestInit = {}, { sat = 'hr', timeoutMs = 20000 } = {}) {
  const send = SENDERS[sat];
  if (!send) throw new Error(`Chưa nối web vệ tinh ${sat}.`);
  const headers = new Headers(init.headers);
  headers.set(MAIN_ACTOR_HEADER, actorHeader(user));
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Hẹn giờ riêng phòng khi Service Binding không dừng theo signal.
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Web vệ tinh trả lời quá lâu.')), timeoutMs); });
  try { return await Promise.race([send(path, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) }), late]); }
  finally { clearTimeout(timer); }
}

/** Gọi web nhân sự và chuẩn hóa: lỗi mạng / 5xx → 502, lỗi 4xx của web nhân sự giữ nguyên. */
export async function satCall(user: SessionUser, path: string, init: RequestInit = {}): Promise<Relayed> {
  try {
    const res = await satFetch(user, path, init);
    return relay(res.status, await res.json().catch(() => null));
  } catch (error) {
    console.error('satellite call failed', path, error);
    return relay(0, null);
  }
}
export const satResponse = (r: Relayed, headers: Record<string, string> = {}) => Response.json(r.body, { status: r.status, headers: { ...NO_STORE, ...headers } });

/** Phần Nhân sự trong app: chỉ chủ hệ thống và giám đốc (worker đã chặn theo VIEW_GATES, kiểm lại ở đây). */
export async function hrBoss() {
  const user = await getSessionUser();
  if (!user) return { error: noStore(unauthorized()) };
  if (!canView(user, 'people')) return { error: noStore(forbidden(HR_FORBIDDEN)) };
  return { user };
}

/** Chuyển nguyên một lời gọi GET sang web nhân sự, chỉ giữ các tham số cho phép. */
export async function hrGet(request: Request, path: string, keep: string[] = []) {
  const { user, error } = await hrBoss();
  if (error) return error;
  const from = new URL(request.url).searchParams, q = new URLSearchParams();
  for (const k of keep) { const v = from.get(k); if (v) q.set(k, v.slice(0, 100)); }
  return satResponse(await satCall(user, q.size ? `${path}?${q}` : path));
}
