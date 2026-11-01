// Liên kết với web vệ tinh nhân sự (crm): hàm thuần dùng chung cho các API /api/hr/* (không phụ thuộc runtime Cloudflare).

/** Header web vệ tinh gửi kèm khi gọi API nội bộ; giá trị là bí mật HR_SHARED_SECRET đặt ở cả hai web. */
export const HR_SECRET_HEADER = 'x-hr-secret';
/** Mã chuyển đăng nhập sống 2 phút và chỉ dùng được một lần. */
export const HANDOFF_TTL_MS = 2 * 60000;

/** So sánh bí mật không lộ thời gian; thiếu bí mật ở máy chủ thì luôn từ chối. */
export function secretMatches(expected: string | undefined, given: string | null) {
  const a = expected?.trim() ?? '', b = given?.trim() ?? '';
  if (!a || a.length < 16 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Đường quay về trên web vệ tinh: chỉ nhận đường dẫn nội bộ ("/..."), không nhận URL ngoài. */
export function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value.length <= 300 ? value : '/';
}

/** Thời điểm Pancake trả (unix giây/mili giây hoặc chuỗi ngày) → ISO; không đọc được thì null. */
export function toIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  if (typeof value === 'string' && value.trim()) {
    const raw = value.trim();
    if (/^\d+$/.test(raw)) return toIso(Number(raw));
    // Pancake hay trả giờ UTC không hậu tố (xem report-time.ts).
    const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) || raw.length <= 10 ? raw : `${raw}Z`);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}

/** Tài khoản hệ thống Pancake (API_CONNECTION…) hoặc chỉ còn mã id thay tên: không phải nhân viên. */
export const junkStaffName = (name: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name) || /api[_ ]?connection|webhook/i.test(name);

export type PosStaffRow = {
  user_id: string; pos_id: string; name: string; email: string | null; phone: string | null; is_active: number;
  department: string | null; sale_group: string | null; source_created_at: string | null;
};
export type PosStaff = {
  posUserId: string; name: string; email: string | null; phone: string | null; active: boolean;
  departments: string[]; saleGroups: string[]; posIds: string[];
  /** Ngày tạo tài khoản sớm nhất trên các POS (ngày vào làm); null nếu Pancake không trả. */
  createdAt: string | null;
  /** Ngày đầu tiên có đơn trên POS, dùng khi Pancake không trả ngày tạo. */
  firstActivityDay: string | null;
  /** Ngày cuối cùng có đơn trên POS: ước tính ngày nghỉ cho người đã nghỉ mà HR chưa ghi ngày. */
  lastActivityDay: string | null;
};

/** Gộp các dòng pos_users cùng một tài khoản Pancake (user_id) ở nhiều POS thành một nhân viên. */
export function groupPosStaff(rows: PosStaffRow[], firstDays: Map<string, string>, lastDays: Map<string, string> = new Map()): PosStaff[] {
  const byUser = new Map<string, PosStaff>();
  const add = (list: string[], v: string | null) => { const s = v?.trim(); if (s && !list.includes(s)) list.push(s); };
  for (const r of rows) {
    const name = r.name?.trim() ?? '';
    if (!name || junkStaffName(name)) continue;
    let s = byUser.get(r.user_id);
    if (!s) {
      s = { posUserId: r.user_id, name, email: null, phone: null, active: false, departments: [], saleGroups: [], posIds: [], createdAt: null, firstActivityDay: firstDays.get(r.user_id) ?? null, lastActivityDay: lastDays.get(r.user_id) ?? null };
      byUser.set(r.user_id, s);
    }
    s.email ??= r.email?.trim() || null;
    s.phone ??= r.phone?.trim() || null;
    s.active ||= !!r.is_active;
    add(s.departments, r.department); add(s.saleGroups, r.sale_group); add(s.posIds, r.pos_id);
    const created = toIso(r.source_created_at);
    if (created && (!s.createdAt || created < s.createdAt)) s.createdAt = created;
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
