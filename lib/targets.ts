import { env } from 'cloudflare:workers';
import type { Access } from './access';
import { staffScope } from './staff-scope';

export type TargetRow = { scope: 'pos' | 'employee' | 'team'; refId: string; revenue: number; closedOrders: number; workingDays: number | null; updatedAt: string; costCeiling?: number | null };
/** Mục tiêu của một tháng (YYYY-MM). */
export async function listTargets(month: string): Promise<TargetRow[]> {
  const rows = await env.DB.prepare('SELECT scope,ref_id,revenue,closed_orders,working_days,updated_at FROM targets WHERE month=?').bind(month)
    .all<{ scope: 'pos' | 'employee' | 'team'; ref_id: string; revenue: number; closed_orders: number; working_days: number | null; updated_at: string }>();
  const caps = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(`target_cost:${month}`).first<{ value: string }>();
  const costs: Record<string, number> = caps ? JSON.parse(caps.value) : {};
  return rows.results.map((r) => ({ scope: r.scope, refId: r.ref_id, revenue: Number(r.revenue), closedOrders: Number(r.closed_orders), workingDays: r.working_days === null ? null : Number(r.working_days), updatedAt: r.updated_at, ...(r.scope === 'team' ? { costCeiling: costs[r.ref_id] ?? null } : {}) }));
}

/** Tài khoản POS được phép đặt KPI; null dành riêng cho chủ hệ thống. */
export async function targetStaff(db: D1Database, user: Access & { userId: string }): Promise<string[] | null> {
  if (user.role === 'owner') return null;
  if (user.role === 'mentor') {
    const ids = await staffScope(db, user);
    if (user.posIds === null) return ids;
    const rows = await db.prepare('SELECT DISTINCT user_id FROM pos_users WHERE user_id IN (SELECT value FROM json_each(?)) AND pos_id IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(ids), JSON.stringify(user.posIds)).all<{ user_id: string }>();
    return rows.results.map((row) => row.user_id);
  }
  if (user.role !== 'director' && user.role !== 'lead') return [];
  // Quan hệ quản lý trực tiếp hoặc bộ phận được cấp, giao với POS được cấp.
  const rows = await db.prepare(`SELECT DISTINCT t.pos_user_id FROM hr_pos_team t
    JOIN hr_employees e ON e.id=t.employee_id
    WHERE t.status<>'da_nghi' AND e.status<>'da_nghi' AND (
      e.main_user_id IN (SELECT id FROM users WHERE manager_id=?)
      OR EXISTS (SELECT 1 FROM users u JOIN app_settings s ON s.key='user_employee:'||u.id
        WHERE u.manager_id=? AND s.value=e.id AND (e.main_user_id IS NULL OR e.main_user_id='' OR e.main_user_id=u.id))
      OR (?<>'all' AND t.team=?))
    AND EXISTS (SELECT 1 FROM pos_users p WHERE p.user_id=t.pos_user_id
      AND (? IS NULL OR p.pos_id IN (SELECT value FROM json_each(?))))`)
    .bind(user.userId, user.userId, user.team, user.team, user.posIds === null ? null : JSON.stringify(user.posIds), JSON.stringify(user.posIds ?? []))
    .all<{ pos_user_id: string }>();
  return rows.results.map((row) => row.pos_user_id);
}

export function canWriteTarget(user: Access, ids: string[] | null, scope: string, refId: string) {
  return user.role === 'owner' || (scope === 'employee' && ['director', 'lead', 'mentor'].includes(user.role) && !!ids?.includes(refId));
}
