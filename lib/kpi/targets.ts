import { env } from 'cloudflare:workers';
import type { Access } from '@/lib/auth/access';
import { staffScope } from '@/lib/teams/staff-scope';
import { teamSubquery } from '@/lib/teams/team';

export function parseTargetCosts(value?: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

/** KPI tỉ lệ chốt (%) lưu ở app_settings target_rate:<tháng>, khoá "scope:refId" (employee hoặc team).
 *  Anh Vũ 02/11/2026: Sale đặt KPI tỉ lệ chốt + doanh số; CSKH chỉ doanh số. Không thêm cột vào bảng targets. */
export function mergeTargetRates(stored: Record<string, number>, items: { scope?: string; refId?: string; closeRate?: number | null }[], only: string[] | null): Record<string, number> {
  const next: Record<string, number> = only ? { ...stored } : {};
  if (only) for (const k of only) delete next[k];
  for (const it of items) {
    if ((it.scope !== 'employee' && it.scope !== 'team') || !it.refId || it.closeRate == null) continue;
    const k = `${it.scope}:${it.refId}`;
    if (only && !only.includes(k)) continue;
    const v = Number(it.closeRate);
    if (Number.isFinite(v) && v > 0) next[k] = Math.min(100, Math.round(v * 10) / 10);
  }
  return next;
}

/** Gắn tỉ lệ chốt KPI vào từng dòng; người/team chỉ có tỉ lệ (chưa có doanh số) vẫn thành một dòng. */
export function withTargetRates(rows: TargetRow[], rates: Record<string, number>, updatedAt = ''): TargetRow[] {
  const seen = new Set<string>();
  const out = rows.map((r) => {
    const k = `${r.scope}:${r.refId}`; seen.add(k);
    return r.scope === 'pos' ? r : { ...r, closeRate: typeof rates[k] === 'number' ? rates[k] : null };
  });
  for (const [k, v] of Object.entries(rates)) {
    if (seen.has(k) || typeof v !== 'number') continue;
    const at = k.indexOf(':'), scope = k.slice(0, at);
    if (scope !== 'employee' && scope !== 'team') continue;
    out.push({ scope, refId: k.slice(at + 1), revenue: 0, closedOrders: 0, workingDays: null, updatedAt, closeRate: v });
  }
  return out;
}

/** Tài khoản POS của chính người đăng nhập: cùng email trên POS, hoặc nhân sự cùng email đã ghép tài khoản POS (web nhân sự). */
export async function ownPosUserIds(db: D1Database, email: string | undefined): Promise<string[]> {
  if (!email) return [];
  const rows = await db.prepare(`SELECT DISTINCT user_id AS id FROM pos_users WHERE lower(email)=lower(?)
      UNION SELECT DISTINCT t.pos_user_id AS id FROM hr_pos_team t JOIN hr_employees e ON e.id=t.employee_id WHERE lower(e.email)=lower(?)`)
    .bind(email, email).all<{ id: string }>();
  return rows.results.map((r) => r.id).filter(Boolean);
}

/** KPI trung bình đơn (đồng/đơn) của cả team, lưu ở app_settings target_aov:<tháng>, khoá "team:<mã team>" (Giao việc → KPI team,
 *  anh Vũ 28/10/2026). Cùng kiểu target_rate, không thêm cột. Chỉ thay khi dòng gửi lên có trường aov (null hay 0 = bỏ KPI),
 *  để trang KPI cũ không biết TB đơn (Theo team, Mục tiêu) lưu doanh thu không làm mất TB đơn đã đặt. */
export function mergeTargetAov(stored: Record<string, number>, items: { scope?: string; refId?: string; aov?: number | null }[], only: string[] | null): Record<string, number> {
  const next: Record<string, number> = { ...stored };
  for (const it of items) {
    if (it.scope !== 'team' || !it.refId || it.aov === undefined) continue;
    const k = `team:${it.refId}`;
    if (only && !only.includes(k)) continue;
    const v = Number(it.aov);
    if (it.aov !== null && Number.isFinite(v) && v > 0) next[k] = Math.round(v); else delete next[k];
  }
  return next;
}

/** Gắn KPI TB đơn vào dòng team; team chỉ có TB đơn (chưa có doanh thu) vẫn thành một dòng. */
export function withTargetAov(rows: TargetRow[], aov: Record<string, number>, updatedAt = ''): TargetRow[] {
  const seen = new Set<string>();
  const out = rows.map((r) => {
    if (r.scope !== 'team') return r;
    seen.add(r.refId);
    return { ...r, aov: typeof aov[`team:${r.refId}`] === 'number' ? aov[`team:${r.refId}`] : null };
  });
  for (const [k, v] of Object.entries(aov)) {
    if (!k.startsWith('team:') || seen.has(k.slice(5)) || typeof v !== 'number') continue;
    out.push({ scope: 'team', refId: k.slice(5), revenue: 0, closedOrders: 0, workingDays: null, updatedAt, closeRate: null, aov: v });
  }
  return out;
}

/** Team mà người này cầm (anh Vũ 05/11/2026: leader / mentor xem KPI team của mình để tự chia cho từng người). null = mọi team (chủ hệ thống).
 *  Team gán ở Cài đặt → Team (teamScope), hoặc team web nhân sự mà người này là Leader; giám đốc thêm các team của bộ phận mình. Nhân viên: không team nào. */
export async function managedTeams(db: D1Database, user: Access & { userId: string }): Promise<string[] | null> {
  if (user.role === 'owner') return null;
  if (user.teamScope) return [...user.teamScope.ids];
  if (user.role !== 'director' && user.role !== 'lead' && user.role !== 'mentor') return [];
  const rows = await db.prepare(`SELECT DISTINCT t.department_id AS id FROM hr_pos_team t
    LEFT JOIN hr_employees e ON e.id=t.leader_employee_id
    WHERE t.department_id IS NOT NULL AND t.department_id<>'' AND t.status<>'da_nghi' AND (
      e.main_user_id=? OR t.leader_employee_id=(SELECT value FROM app_settings WHERE key='user_employee:'||?)
      OR (?='director' AND ?<>'all' AND t.team=?))`)
    .bind(user.userId, user.userId, user.role, user.team, user.team).all<{ id: string }>();
  return rows.results.map((r) => r.id).sort();
}

export async function visibleTargets(db: D1Database, user: Access & { email?: string }, items: TargetRow[], ids: string[] | null, teams: string[] | null = []): Promise<TargetRow[]> {
  if (user.role === 'owner') return items;
  const mine = (item: TargetRow) => item.scope === 'team' && !!teams?.includes(item.refId);
  if (user.role === 'mentor' && !user.teamScope) return items.filter((item) => mine(item) || (item.scope === 'employee' && !!ids?.includes(item.refId)));
  // Nhân viên thường: KPI cá nhân chỉ của chính mình (không thấy KPI người khác, không thấy KPI team); KPI cấp POS giữ như cũ.
  if (user.role === 'staff') {
    const own = new Set(await ownPosUserIds(db, user.email));
    return items.filter((item) => item.scope === 'pos' || (item.scope === 'employee' && own.has(item.refId)));
  }
  const cskh = new Set((await db.prepare(`SELECT user_id FROM ${teamSubquery('cskh', false)} AS t`).all<{ user_id: string }>()).results.map((row) => row.user_id));
  return items.filter((item) => mine(item) || item.scope === 'pos' || (item.scope === 'employee' && (!cskh.has(item.refId) || (user.role !== 'staff' && !!ids?.includes(item.refId)))));
}

export type TargetRow = { scope: 'pos' | 'employee' | 'team'; refId: string; revenue: number; closedOrders: number; workingDays: number | null; updatedAt: string; costCeiling?: number | null; closeRate?: number | null; aov?: number | null };
/** Mục tiêu của một tháng (YYYY-MM). */
export async function listTargets(month: string): Promise<TargetRow[]> {
  const rows = await env.DB.prepare('SELECT scope,ref_id,revenue,closed_orders,working_days,updated_at FROM targets WHERE month=?').bind(month)
    .all<{ scope: 'pos' | 'employee' | 'team'; ref_id: string; revenue: number; closed_orders: number; working_days: number | null; updated_at: string }>();
  // Chi phí trần, tỉ lệ chốt, TB đơn: một lần đọc app_settings.
  const settings = new Map((await env.DB.prepare('SELECT key,value,updated_at FROM app_settings WHERE key IN (?,?,?)').bind(`target_cost:${month}`, `target_rate:${month}`, `target_aov:${month}`)
    .all<{ key: string; value: string; updated_at: string }>()).results.map((r) => [r.key.slice(0, r.key.indexOf(':')), r]));
  const costs = parseTargetCosts(settings.get('target_cost')?.value);
  const rates = settings.get('target_rate'), aov = settings.get('target_aov');
  const base = withTargetRates(rows.results.map((r): TargetRow => ({ scope: r.scope, refId: r.ref_id, revenue: Number(r.revenue), closedOrders: Number(r.closed_orders), workingDays: r.working_days === null ? null : Number(r.working_days), updatedAt: r.updated_at, ...(r.scope === 'team' ? { costCeiling: costs[r.ref_id] ?? null } : {}) })), parseTargetCosts(rates?.value), rates?.updated_at ?? '');
  return aov ? withTargetAov(base, parseTargetCosts(aov.value), aov.updated_at) : base;
}

/** Tài khoản POS được phép đặt KPI; null dành riêng cho chủ hệ thống. */
export async function targetStaff(db: D1Database, user: Access & { userId: string }): Promise<string[] | null> {
  if (user.role === 'owner') return null;
  if (user.role === 'mentor' || (user.role === 'lead' && user.teamScope)) {
    const ids = await staffScope(db, user);
    if (user.posIds === null) return ids;
    const rows = await db.prepare('SELECT DISTINCT user_id FROM pos_users WHERE user_id IN (SELECT value FROM json_each(?)) AND pos_id IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(ids), JSON.stringify(user.posIds)).all<{ user_id: string }>();
    return rows.results.map((row) => row.user_id);
  }
  if (user.role !== 'director' && user.role !== 'lead') return [];
  // Trưởng nhóm chỉ có cấp dưới trực tiếp; giám đốc thêm bộ phận, giao với POS được cấp.
  const rows = await db.prepare(`SELECT DISTINCT t.pos_user_id FROM hr_pos_team t
    JOIN hr_employees e ON e.id=t.employee_id
    WHERE t.status<>'da_nghi' AND e.status<>'da_nghi' AND (
      e.main_user_id IN (SELECT id FROM users WHERE manager_id=?)
      OR EXISTS (SELECT 1 FROM users u JOIN app_settings s ON s.key='user_employee:'||u.id
        WHERE u.manager_id=? AND s.value=e.id AND (e.main_user_id IS NULL OR e.main_user_id='' OR e.main_user_id=u.id))
      OR (?='director' AND ?<>'all' AND t.team=?))
    AND EXISTS (SELECT 1 FROM pos_users p WHERE p.user_id=t.pos_user_id
      AND (? IS NULL OR p.pos_id IN (SELECT value FROM json_each(?))))`)
    .bind(user.userId, user.userId, user.role, user.team, user.team, user.posIds === null ? null : JSON.stringify(user.posIds), JSON.stringify(user.posIds ?? []))
    .all<{ pos_user_id: string }>();
  return rows.results.map((row) => row.pos_user_id);
}

export function canWriteTarget(user: Access, ids: string[] | null, scope: string, refId: string) {
  return user.role === 'owner' || (scope === 'employee' && ['director', 'lead', 'mentor'].includes(user.role) && !!ids?.includes(refId));
}
