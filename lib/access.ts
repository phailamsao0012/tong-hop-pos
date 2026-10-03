// Phân quyền: vai trò, danh sách trang, phạm vi POS/nhóm, và cách áp lên từng API (không phụ thuộc runtime Cloudflare).
import { POS } from '@/lib/report-model';
import type { Team } from '@/lib/team';

export type Role = 'owner' | 'director' | 'lead' | 'staff';
export const ROLE_LABELS: Record<Role, string> = { owner: 'Chủ hệ thống', director: 'Giám đốc', lead: 'Trưởng nhóm', staff: 'Nhân viên' };
export const parseRole = (v: unknown): Role => v === 'owner' || v === 'admin' ? 'owner' : v === 'director' ? 'director' : v === 'lead' ? 'lead' : 'staff';

/** Mọi trang của web (id trùng với View trong dashboard). 'config' chỉ chủ hệ thống. */
export const VIEW_LABELS: Record<string, string> = {
  center: 'Điều hành', overview: 'Tổng quan POS', shift: 'Trong ngày · chốt nóng',
  'cskh-overview': 'Tổng quan CSKH', 'sale-overview': 'Tổng quan Sale',
  calls: 'Cuộc gọi CSKH', care: 'Khách theo nhân viên', repurchase: 'Mua lại & Upsell', dormant: 'Khách lâu chưa mua',
  origin: 'Tự ups & từ MKT', marketing: 'Tổng quan MKT',
  compare: 'So sánh nhân viên', batches: 'Data được cấp', pipeline: 'Vận hành đơn',
  customers: 'Hồ sơ khách hàng', monthly: 'Báo cáo cuối tháng', custom: 'Báo cáo tùy chỉnh', 'raw-orders': 'Đơn nguồn Pancake POS',
  recruit: 'Tuyển dụng', 'cskh-analytics': 'Phân tích CSKH', 'sale-analytics': 'Phân tích Sale', 'sale-quality': 'Chất lượng khách Sale', 'mkt-roas': 'Chi phí & ROAS', 'customer360': 'Khách hàng 360', products: 'Sản phẩm',
  'sale-teams': 'Sale theo team', 'cskh-teams': 'CSKH theo team',
};
export const ALL_VIEWS = Object.keys(VIEW_LABELS);

export type Access = {
  role: Role;
  /** null = mọi trang (chủ hệ thống). */
  views: string[] | null;
  /** null = mọi POS. */
  posIds: string[] | null;
  team: Team;
};

export const isOwner = (a: { role: Role }) => a.role === 'owner';
/** Trang KPI theo đầu người (CSKH, Sale): số nhạy cảm, chỉ chủ hệ thống xem và đặt được (giám đốc cũng không). */
export const KPI_VIEWS = ['cskh-kpi', 'sale-kpi'];
/** Trang chỉ chủ hệ thống: cấu hình, nhật ký, KPI. */
export const OWNER_VIEWS = ['config', 'audit', 'dispatch', ...KPI_VIEWS];
/** Trang Tuyển dụng (ứng viên, SĐT, CV): chỉ chủ hệ thống và giám đốc, không cần cấp trong danh sách trang. */
export const DIRECTOR_VIEWS = ['recruit', 'people', 'person', 'levels', 'org'];
// Trang tự mở theo trang đã được cấp (khỏi phải cấp thêm quyền): Tự ups & từ MKT cho ai xem được Cuộc gọi / Khách theo nhân viên;
// Tổng quan CSKH cho ai xem được một trang CSKH; Tổng quan Sale cho ai xem được So sánh nhân viên / Data được cấp / Tổng quan POS.
const IMPLIED: Record<string, string[]> = {
  origin: ['calls', 'care'],
  'cskh-overview': ['calls', 'care', 'origin', 'repurchase', 'dormant'],
  'sale-overview': ['compare', 'batches', 'overview'],
  'sale-teams': ['sale-overview', 'compare', 'batches', 'overview', 'sale-analytics'],
  'cskh-teams': ['cskh-overview', 'calls', 'care', 'origin', 'repurchase', 'dormant', 'cskh-analytics'],
  'mkt-roas': ['marketing'],
  products: ['overview', 'center', 'pipeline'],
  customer360: ['customers', 'repurchase', 'dormant', 'care'],
  'sale-analytics': ['compare', 'batches', 'overview', 'sale-overview', 'shift'],
  'sale-quality': ['sale-analytics', 'compare', 'sale-overview'],
  'cskh-analytics': ['calls', 'care', 'origin', 'repurchase', 'dormant', 'cskh-overview'],
};
export const canView = (a: Access, view: string): boolean => view === 'security' ? true : isOwner(a) ? true
  : DIRECTOR_VIEWS.includes(view) ? a.role === 'director'
  : !OWNER_VIEWS.includes(view) && [view, ...(IMPLIED[view] ?? [])].some((v) => (a.views ?? []).includes(v));
export const allowedPos = (a: Access) => a.posIds ?? POS.map((p) => p.id);

export function parseAccess(row: { role: unknown; views_json?: string | null; pos_ids_json?: string | null; team?: string | null }): Access {
  const role = parseRole(row.role);
  if (role === 'owner') return { role, views: null, posIds: null, team: 'all' };
  const parseList = (v: string | null | undefined) => { if (!v) return null; try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : null; } catch { return null; } };
  const views = parseList(row.views_json) ?? [];
  const pos = parseList(row.pos_ids_json);
  const team: Team = row.team === 'sale' || row.team === 'cskh' ? row.team : 'all';
  return { role, views: views.filter((v) => !OWNER_VIEWS.includes(v)), posIds: pos && pos.length ? pos.filter((id) => POS.some((p) => p.id === id)) : null, team };
}

/** API nào cần trang nào (khớp tiền tố đường dẫn). Không có trong danh sách = mọi người đăng nhập đều gọi được (đã bị thu hẹp POS/nhóm). */
const OWNER_ONLY = ['/api/dispatch', '/api/users', '/api/config', '/api/connection', '/api/telegram', '/api/sync/scheduler', '/api/import', '/api/audit', '/api/hr-sync'];
const VIEW_GATES: [string, string[]][] = [
  ['/api/reports/calls', ['calls', 'cskh-overview']],
  ['/api/reports/origin', ['origin', 'calls', 'care']],
  ['/api/reports/product-groups', ['sale-overview', 'cskh-overview', 'overview']],
  ['/api/reports/cskh-origin', ['cskh-overview']],
  ['/api/reports/care', ['care']],
  ['/api/reports/repurchase', ['repurchase']],
  ['/api/reports/marketing', ['marketing']],
  ['/api/marketing-teams', ['marketing']],
  ['/api/reports/pipeline', ['pipeline']],
  ['/api/reports/batches', ['batches']],
  ['/api/reports/customers', ['customers', 'dormant', 'care', 'repurchase']],
  ['/api/reports/shift', ['shift', 'center']],
  ['/api/reports/live', ['shift', 'center']],
  ['/api/raw', ['raw-orders']],
  ['/api/data', ['custom']],
  ['/api/presets', ['custom']],
  ['/api/reports/overview', ['overview', 'center', 'monthly', 'compare', 'custom', 'batches', 'cskh-overview', 'sale-overview']],
  ['/api/reports/pancake-ref', ['overview', 'center', 'cskh-overview', 'sale-overview']],
  ['/api/reports/exec', ['center']],
  ['/api/ai/summary', ['center']],
  ['/api/reports/cskh-analytics', ['cskh-analytics']],
  ['/api/reports/sale-analytics', ['sale-analytics']],
  ['/api/reports/sale-quality', ['sale-quality']],
  ['/api/reports/sale-ladder', ['sale-quality']],
  ['/api/marketing/roas', ['mkt-roas']],
  ['/api/reports/customer360', ['customer360']],
  ['/api/reports/products', ['products']],
  ['/api/marketing/costs', ['mkt-roas']],
  ['/api/teams', ['sale-teams', 'cskh-teams']],
  // Phần Nhân sự trong app (qua web nhân sự): chỉ chủ hệ thống và giám đốc.
  ['/api/sat/hr', ['people']],
];

/** Kiểm tra và thu hẹp một yêu cầu API theo quyền: trả về lý do chặn, hoặc URL đã sửa tham số posIds/team. */
export function scopeApi(a: Access, method: string, url: URL): { blocked?: string; url: URL } {
  const path = url.pathname;
  if (path === '/api/telegram/webhook' || path === '/api/recruit/webhook' || path.startsWith('/api/auth/')) return { url };
  if (path.startsWith('/api/recruit') && !canView(a, 'recruit')) return { blocked: 'Phần Tuyển dụng chỉ dành cho chủ hệ thống và giám đốc.', url };
  if (!isOwner(a)) {
    if (OWNER_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) return { blocked: 'Chỉ chủ hệ thống mới dùng được phần này.', url };
    if ((path === '/api/targets' || path === '/api/staff-settings') && method !== 'GET') return { blocked: 'Chỉ chủ hệ thống mới đặt KPI và mục tiêu.', url };
    if (path.startsWith('/api/sync/') && method !== 'GET') return { blocked: 'Chỉ chủ hệ thống mới chạy đồng bộ.', url };
    const gate = VIEW_GATES.find(([p]) => path === p || path.startsWith(`${p}/`));
    if (gate && !gate[1].some((v) => canView(a, v))) return { blocked: 'Tài khoản của bạn không được cấp quyền xem phần này.', url };
  }
  const out = new URL(url);
  const allowed = allowedPos(a);
  if (a.posIds) {
    if (out.searchParams.has('posId')) { const one = out.searchParams.get('posId') ?? ''; if (!allowed.includes(one)) return { blocked: 'POS này không thuộc phạm vi của bạn.', url }; }
    if (out.searchParams.has('posIds') || path.startsWith('/api/reports/') || path.startsWith('/api/raw/')) {
      const asked = (out.searchParams.get('posIds') ?? '').split(',').filter(Boolean);
      const kept = asked.length ? asked.filter((id) => allowed.includes(id)) : allowed;
      out.searchParams.set('posIds', (kept.length ? kept : allowed).join(','));
    }
  }
  if (a.team !== 'all') out.searchParams.set('team', a.team);
  return { url: out };
}
