import { env } from 'cloudflare:workers';

// Ghi nhật ký hoạt động vào bảng audit_log. Không bao giờ làm hỏng yêu cầu chính: lỗi ghi chỉ in ra log.
export type AuditInput = {
  action: string;
  userId?: string | null; email?: string | null; name?: string | null;
  target?: string | null; detail?: string | null; status?: number | null;
  request?: Request | null;
};

export const clientIp = (r: Request | null | undefined) => r?.headers.get('cf-connecting-ip') ?? r?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

/** Rút gọn User-Agent thành "Chrome · macOS" cho dễ đọc. */
export function deviceLabel(ua: string | null | undefined) {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Khác';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /CriOS\//.test(ua) ? 'Chrome' : /FxiOS\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python|okhttp/i.test(ua) ? 'Công cụ' : 'Trình duyệt';
  return `${browser} · ${os}`;
}

const SENSITIVE = /pass|secret|token|key|code|otp|response|challenge|hash/i;
/** Tóm tắt JSON gửi lên: che các trường nhạy cảm, cắt ngắn. */
export function summarizeBody(text: string, max = 400) {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    const clean = (x: unknown, depth = 0): unknown => {
      if (Array.isArray(x)) return x.length > 20 ? [...x.slice(0, 20).map((i) => clean(i, depth + 1)), `… +${x.length - 20}`] : x.map((i) => clean(i, depth + 1));
      if (x && typeof x === 'object') {
        if (depth > 2) return '{…}';
        return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, val]) => [k, SENSITIVE.test(k) ? '•••' : clean(val, depth + 1)]));
      }
      return typeof x === 'string' && x.length > 120 ? `${x.slice(0, 120)}…` : x;
    };
    const s = JSON.stringify(clean(v));
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch { return text.length > max ? `${text.slice(0, max)}…` : text; }
}

/** Đặt tên hành động theo API bị gọi (khi route không tự khai báo qua header x-audit). */
export function classifyApi(method: string, path: string, search: URLSearchParams): { action: string; target: string } | null {
  const target = `${method} ${path}`;
  if (method === 'GET') {
    const size = Number(search.get('size') ?? search.get('limit') ?? 0);
    if (size >= 1000 || search.get('export') === '1') return { action: 'export', target };
    return null;
  }
  const map: [string, string][] = [
    ['/api/users', method === 'POST' ? 'user.create' : method === 'DELETE' ? 'user.delete' : 'user.update'],
    ['/api/targets', 'targets.update'], ['/api/config', 'config.update'], ['/api/connection', 'connection.update'],
    ['/api/telegram', 'telegram.update'], ['/api/sync/scheduler', 'sync.scheduler'], ['/api/sync', 'sync.run'],
    ['/api/import', 'import'], ['/api/presets', 'preset.update'],
  ];
  const hit = map.find(([p]) => path === p || path.startsWith(`${p}/`));
  return { action: hit?.[1] ?? 'api', target };
}

export async function audit(e: AuditInput) {
  try {
    const r = e.request ?? null;
    const ua = r?.headers.get('user-agent')?.slice(0, 300) ?? null;
    await env.DB.prepare('INSERT INTO audit_log (id,at,user_id,email,name,action,target,detail,status,ip,device,user_agent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), new Date().toISOString(), e.userId ?? null, e.email ?? null, e.name ?? null, e.action, e.target ?? null, e.detail?.slice(0, 600) ?? null, e.status ?? null, clientIp(r), deviceLabel(ua), ua).run();
  } catch (error) { console.error('audit failed', error); }
}

/** Route tự mô tả thao tác cho nhật ký: worker đọc header này thay cho tóm tắt tự động. */
export const AUDIT_HEADER = 'x-audit';
export const auditHeaders = (summary: string, action?: string) => ({ [AUDIT_HEADER]: encodeURIComponent(action ? `${action}|${summary}` : summary) });
