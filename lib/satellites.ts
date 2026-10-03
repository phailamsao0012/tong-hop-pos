// Web vệ tinh cho app của sếp: danh sách module, header người dùng gửi sang web vệ tinh, chuẩn hóa kết quả trả về
// và tóm tắt hiệu suất cho hồ sơ nhân sự. Hàm thuần, không phụ thuộc runtime Cloudflare (xem lib/sat-proxy.ts).
import { canView, type Access, type Role } from '@/lib/access';

export type Satellite = {
  id: string; title: string; subtitle: string;
  /** Tên SF Symbol cho app iOS. */
  icon: string;
  /** Trang (canView) quyết định ai thấy module. */
  view: string;
  /** API trả { pending } để hiện số việc chờ trên app. */
  badgePath: string;
};

/** Thêm web vệ tinh mới = thêm Service Binding + một dòng ở đây + màn hình trong app. */
export const SATELLITES: Satellite[] = [
  { id: 'hr', title: 'Nhân sự', subtitle: 'Quân số, hồ sơ, sơ đồ, duyệt thay đổi', icon: 'person.3.fill', view: 'people', badgePath: '/api/v1/app/badge' },
];

export const visibleSatellites = (a: Access, list: Satellite[] = SATELLITES) => list.filter((s) => canView(a, s.view));

export type SatModule = { id: string; title: string; subtitle: string; icon: string; status: 'ok' | 'down'; badge: number | null };
/** Số chờ đọc từ { pending }; web vệ tinh không trả lời được (null) hoặc trả sai thì module báo 'down'. */
export function satModule(s: Satellite, badgeBody: unknown): SatModule {
  const pending = badgeBody && typeof badgeBody === 'object' ? (badgeBody as { pending?: unknown }).pending : undefined;
  const ok = typeof pending === 'number' && Number.isFinite(pending) && pending >= 0;
  return { id: s.id, title: s.title, subtitle: s.subtitle, icon: s.icon, status: ok ? 'ok' : 'down', badge: ok ? Math.round(pending) : null };
}

// ---- Người dùng app gửi sang web vệ tinh ----
/** Web vệ tinh dựng lại người dùng từ header này (vai trò web tổng) để tự kiểm quyền. */
export const MAIN_ACTOR_HEADER = 'x-main-actor';
export type Actor = { userId: string; email: string; displayName: string; role: Role; title: string };
/** Giá trị header phải là ASCII (tên tiếng Việt có dấu) nên mã hóa bằng encodeURIComponent. */
export const actorHeader = (u: Actor) =>
  encodeURIComponent(JSON.stringify({ userId: u.userId, email: u.email, name: u.displayName, role: u.role, title: u.title }));

// ---- Chuẩn hóa kết quả web vệ tinh ----
export const HR_DOWN = 'Không kết nối được web nhân sự.';
export const HR_FORBIDDEN = 'Phần Nhân sự chỉ dành cho chủ hệ thống và giám đốc.';
export type Relayed = { status: number; body: Record<string, unknown> };
/**
 * status 0 = không gọi được. 2xx JSON → 200; lỗi 4xx có { error } → giữ nguyên mã và lỗi; còn lại (5xx, không phải JSON) → 502.
 * Riêng 401 cũng thành 502: app hiểu 401 là phiên web tổng hết hạn và sẽ đăng xuất sếp.
 */
export function relay(status: number, body: unknown, down = HR_DOWN): Relayed {
  const obj = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  if (status >= 200 && status < 300 && obj) return { status: 200, body: obj };
  if (status >= 400 && status < 500 && status !== 401 && typeof obj?.error === 'string' && obj.error) return { status, body: obj };
  return { status: 502, body: { error: down } };
}

// ---- Hiệu suất bán hàng gắn vào hồ sơ nhân sự ----
/** Mã tài khoản POS của hồ sơ (posAccounts), bỏ trùng và giá trị rỗng. */
export function posAccountsOf(body: Record<string, unknown>): string[] {
  const list = Array.isArray(body.posAccounts) ? body.posAccounts : [];
  return [...new Set(list.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))];
}

type PerfMonth = { month: string; revenue: number; closedOrders: number; rank: number | null; peers: number };
/** Phần cần từ personDetail (lib/people.ts). */
export type PerfSource = { month: string; prevSameDays: number; lifetime: { revenue: number; closedOrders: number; firstDay: string | null }; series: PerfMonth[] };
export type Performance = {
  posUserId: string; month: string; revenue: number; closedOrders: number; rank: number | null; peers: number; prevSameDays: number;
  lifetime: { revenue: number; closedOrders: number; firstDay: string | null };
  series: { month: string; revenue: number; closedOrders: number }[];
};
/** Rút gọn hồ sơ 360 cho app: số tháng hiện tại (doanh thu, đơn chốt, hạng trong bộ phận) và 6 tháng gần nhất. */
export function performanceOf(posUserId: string, d: PerfSource): Performance {
  const cur = d.series.find((s) => s.month === d.month);
  return {
    posUserId, month: d.month, revenue: cur?.revenue ?? 0, closedOrders: cur?.closedOrders ?? 0, rank: cur?.rank ?? null, peers: cur?.peers ?? 0,
    prevSameDays: d.prevSameDays, lifetime: { revenue: d.lifetime.revenue, closedOrders: d.lifetime.closedOrders, firstDay: d.lifetime.firstDay },
    series: d.series.filter((s) => s.month <= d.month).slice(-6).map((s) => ({ month: s.month, revenue: s.revenue, closedOrders: s.closedOrders })),
  };
}

/** Mô tả một lần duyệt / từ chối cho nhật ký hoạt động. */
export function decisionSummary(body: unknown, result: Record<string, unknown>) {
  const b = (body && typeof body === 'object' ? body : {}) as { ids?: unknown; decision?: unknown; note?: unknown };
  const reject = b.decision === 'reject';
  const note = typeof b.note === 'string' && b.note.trim() ? ` · ${reject ? 'Lý do' : 'Ghi chú'}: ${b.note.trim()}` : '';
  const n = Array.isArray(b.ids) ? b.ids.length : 0;
  const text = `${reject ? 'Từ chối' : 'Duyệt'} ${n} yêu cầu thay đổi nhân sự: xong ${Number(result.done) || 0}, bỏ qua ${Number(result.skipped) || 0}${note}`;
  // Nửa emoji (ký tự hỏng trong ghi chú, hoặc do cắt 500) làm encodeURIComponent của header nhật ký lỗi: thay ký tự hỏng, bỏ nửa cuối.
  return text.toWellFormed().slice(0, 500).replace(/[\uD800-\uDBFF]$/, '');
}
