import { getSessionUser, isOwner, unauthorized, forbidden } from '@/lib/auth/auth';
import { AUDIT_ACTIONS, AUDIT_GROUPS } from '@/lib/ops/audit-labels';
import { KEEP_DAYS, auditLogPage } from '@/lib/ops/audit-log';

// Nhật ký hoạt động (chỉ chủ hệ thống): lọc theo ngày, người, nhóm hành động, tìm chữ; phân trang; size lớn để xuất Excel.
export async function GET(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  const q = new URL(request.url).searchParams;
  const size = Math.min(20000, Math.max(1, Number(q.get('size') ?? 100) || 100));
  const page = Math.max(1, Number(q.get('page') ?? 1) || 1);
  const { rows, count, users } = await auditLogPage(q, size, page);
  return Response.json({
    items: rows.map((r) => ({ id: r.id, at: r.at, userId: r.user_id, email: r.email, name: r.name, action: r.action, target: r.target, detail: r.detail, status: r.status, ip: r.ip, device: r.device })),
    total: count, page, size,
    users: users.results, groups: AUDIT_GROUPS, keepDays: KEEP_DAYS, labels: AUDIT_ACTIONS,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
