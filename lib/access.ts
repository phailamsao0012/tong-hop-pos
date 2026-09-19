// Phân quyền: vai trò, danh sách trang, phạm vi POS/nhóm, và cách áp lên từng API (không phụ thuộc runtime Cloudflare).
import { POS } from '@/lib/report-model';
import type { Team } from '@/lib/team';

export type Role = 'owner' | 'director' | 'lead' | 'staff';
export const ROLE_LABELS: Record<Role, string> = { owner: 'Chủ hệ thống', director: 'Giám đốc', lead: 'Trưởng nhóm', staff: 'Nhân viên' };
export const parseRole = (v: unknown): Role => v === 'owner' || v === 'admin' ? 'owner' : v === 'director' ? 'director' : v === 'lead' ? 'lead' : 'staff';

/** Mọi trang của web (id trùng với View trong dashboard). 'config' chỉ chủ hệ thống. */
export const VIEW_LABELS: Record<string, string> = {
  center: 'Điều khiển trung tâm', overview: 'Tổng quan POS', shift: 'Điều hành trong ca',
  calls: 'Cuộc gọi CSKH', care: 'Khách theo nhân viên', repurchase: 'Mua lại & Upsell', dormant: 'Khách lâu chưa mua',
  compare: 'So sánh nhân viên', batches: 'Data được cấp', pipeline: 'Vận hành đơn',
  customers: 'Hồ sơ khách hàng', monthly: 'Báo cáo cuối tháng', custom: 'Báo cáo tùy chỉnh', 'raw-orders': 'Đơn nguồn Pancake POS',
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
export const canView = (a: Access, view: string) => view === 'security' ? true : isOwner(a) ? true : view !== 'config' && view !== 'audit' && (a.views ?? []).includes(view);
export const allowedPos = (a: Access) => a.posIds ?? POS.map((p) => p.id);

export function parseAccess(row: { role: unknown; views_json?: string | null; pos_ids_json?: string | null; team?: string | null }): Access {
  const role = parseRole(row.role);
  if (role === 'owner') return { role, views: null, posIds: null, team: 'all' };
  const parseList = (v: string | null | undefined) => { if (!v) return null; try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : null; } catch { return null; } };
  const views = parseList(row.views_json) ?? [];
  const pos = parseList(row.pos_ids_json);
  const team: Team = row.team === 'sale' || row.team === 'cskh' ? row.team : 'all';
  return { role, views: views.filter((v) => v !== 'config'), posIds: pos && pos.length ? pos.filter((id) => POS.some((p) => p.id === id)) : null, team };
}

/** API nào cần trang nào (khớp tiền tố đường dẫn). Không có trong danh sách = mọi người đăng nhập đều gọi được (đã bị thu hẹp POS/nhóm). */
const OWNER_ONLY = ['/api/users', '/api/config', '/api/connection', '/api/telegram', '/api/sync/scheduler', '/api/import', '/api/audit'];
const VIEW_GATES: [string, string[]][] = [
  ['/api/reports/calls', ['calls']],
  ['/api/reports/care', ['care']],
  ['/api/reports/repurchase', ['repurchase']],
  ['/api/reports/pipeline', ['pipeline']],
  ['/api/reports/batches', ['batches']],
  ['/api/reports/customers', ['customers', 'dormant', 'care', 'repurchase']],
  ['/api/reports/shift', ['shift', 'center']],
  ['/api/reports/live', ['shift', 'center']],
  ['/api/raw', ['raw-orders']],
  ['/api/data', ['custom']],
  ['/api/presets', ['custom']],
  ['/api/reports/overview', ['overview', 'center', 'monthly', 'compare', 'custom', 'batches']],
];

/** Kiểm tra và thu hẹp một yêu cầu API theo quyền: trả về lý do chặn, hoặc URL đã sửa tham số posIds/team. */
export function scopeApi(a: Access, method: string, url: URL): { blocked?: string; url: URL } {
  const path = url.pathname;
  if (path === '/api/telegram/webhook' || path.startsWith('/api/auth/')) return { url };
  if (!isOwner(a)) {
    if (OWNER_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) return { blocked: 'Chỉ chủ hệ thống mới dùng được phần này.', url };
    if (path === '/api/targets' && method !== 'GET') return { blocked: 'Chỉ chủ hệ thống mới đặt mục tiêu.', url };
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
