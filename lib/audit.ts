import { env } from 'cloudflare:workers';
import { maskSearchTerm, searchTermType } from './search-query';

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
        return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, val]) => [k, SENSITIVE.test(k) ? '•••' : /phone|sdt|tel/i.test(k) && (typeof val === 'string' || typeof val === 'number') ? `•••${String(val).replace(/\D/g, '').slice(-3)}` : clean(val, depth + 1)]));
      }
      return typeof x === 'string' ? maskPhonesIn(x.length > 120 ? `${x.slice(0, 120)}…` : x) : x;
    };
    const s = JSON.stringify(clean(v));
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch { const t = maskPhonesIn(text); return t.length > max ? `${t.slice(0, max)}…` : t; }
}

/** SĐT Việt Nam lẫn trong chuỗi (0… hoặc +84…, 9–11 số, có thể cách bằng dấu cách / chấm / gạch): chỉ giữ 3 số cuối (QA 11/10 N1, N2). */
const PHONE_IN_TEXT = /(?<![\d+])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g;
export const maskPhonesIn = (text: string) => text.replace(PHONE_IN_TEXT, (m) => `•••${m.replace(/\D/g, '').slice(-3)}`);

/**
 * Chuỗi tham số ghi vào nhật ký: che từ khoá tìm, SĐT chỉ giữ 3 số cuối.
 */
export function scrubSearch(search: string, max = 400) {
  let p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const q = p.get('q')?.trim();
  // Đặt từ khoá đầu tiên (giống route) và loại tìm ở đầu để không mất khi cắt ngắn nhật ký.
  if (q) p = new URLSearchParams([
    ['q', q], ['searchType', searchTermType(q)],
    ...Array.from(p).filter(([k]) => k !== 'q' && k !== 'searchType'),
  ]);
  for (const [k, v] of Array.from(p)) { // chép ra trước vì p.set đổi p trong vòng lặp
    const digits = v.replace(/\D/g, '');
    // Ngày (2026-10-01) không phải SĐT: giữ nguyên để nhật ký còn biết xem kỳ nào.
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (k === 'q') p.set(k, maskSearchTerm(v));
    else if (/phone|sdt|tel/i.test(k) || (!isDate && digits.length >= 7 && /^[+\d\s().-]+$/.test(v))) p.set(k, `•••${digits.slice(-3)}`);
    else if (!isDate) p.set(k, maskPhonesIn(v));
  }
  const s = p.toString();
  return s.length > max ? s.slice(0, max) : s;
}

/** Đặt tên hành động theo API bị gọi (khi route không tự khai báo qua header x-audit). */
export function classifyApi(method: string, path: string, search: URLSearchParams): { action: string; target: string } | null {
  const target = `${method} ${path}`;
  if (method === 'GET') {
    if ((path === '/api/raw/orders' || path === '/api/reports/customers') && search.get('q')?.trim()) return { action: 'search', target };
    const size = Number(search.get('size') ?? search.get('limit') ?? 0);
    if (size >= 1000 || search.get('export') === '1') return { action: 'export', target };
    // Danh sách khách có SĐT: từ 200 dòng một lần đã coi là lấy hàng loạt (QA 11/10 M2: không chỉ dựa vào trình duyệt tự báo).
    if (size >= 200 && (path.startsWith('/api/reports/customers') || path.startsWith('/api/reports/care') || path.startsWith('/api/raw/orders'))) return { action: 'export', target };
    // Mở hồ sơ một khách / chi tiết một đơn (dữ liệu cá nhân): ghi ai xem, xem gì (luật bảo vệ dữ liệu cá nhân, 10/10/2026).
    if (path === '/api/raw/orders/detail') return { action: 'order.view', target };
    if (path === '/api/reports/customers/detail' || (path === '/api/reports/customer360' && search.get('phone'))) return { action: 'customer.view', target };
    // Hồ sơ / CV ứng viên (app của sếp): ghi ai mở.
    if (path === '/api/recruit/cv') return { action: 'recruit.cv.view', target };
    if (path === '/api/recruit/candidates' && search.get('id')) return { action: 'recruit.view', target };
    return null;
  }
  const map: [string, string][] = [
    ['/api/users', method === 'POST' ? 'user.create' : method === 'DELETE' ? 'user.delete' : 'user.update'],
    ['/api/targets', 'targets.update'], ['/api/config', 'config.update'], ['/api/connection', 'connection.update'],
    ['/api/telegram', 'telegram.update'], ['/api/sync/scheduler', 'sync.scheduler'], ['/api/sync', 'sync.run'],
    ['/api/import', 'import'], ['/api/backup/restore', 'backup.restore'], ['/api/backup', 'backup.run'], ['/api/presets', 'preset.update'], ['/api/dispatch', 'dispatch.update'], ['/api/sat/hr/approvals', 'hr.decide'],
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
