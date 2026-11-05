import { env } from 'cloudflare:workers';
import { isOwner, type Access } from '@/lib/auth/access';
import { POS } from '@/lib/shared/report-model';
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

export async function visibleTargets(db: D1Database, user: Access, items: TargetRow[], ids: string[] | null): Promise<TargetRow[]> {
  if (user.role === 'owner') return items;
  if (user.role === 'mentor' && !user.teamScope) return items.filter((item) => item.scope === 'employee' && !!ids?.includes(item.refId));
  const cskh = new Set((await db.prepare(`SELECT user_id FROM ${teamSubquery('cskh', false)} AS t`).all<{ user_id: string }>()).results.map((row) => row.user_id));
  return items.filter((item) => item.scope === 'pos' || (item.scope === 'employee' && (!cskh.has(item.refId) || (user.role !== 'staff' && !!ids?.includes(item.refId)))));
}

export type TargetRow = { scope: 'pos' | 'employee' | 'team'; refId: string; revenue: number; closedOrders: number; workingDays: number | null; updatedAt: string; costCeiling?: number | null; closeRate?: number | null };
/** Mục tiêu của một tháng (YYYY-MM). */
export async function listTargets(month: string): Promise<TargetRow[]> {
  const rows = await env.DB.prepare('SELECT scope,ref_id,revenue,closed_orders,working_days,updated_at FROM targets WHERE month=?').bind(month)
    .all<{ scope: 'pos' | 'employee' | 'team'; ref_id: string; revenue: number; closed_orders: number; working_days: number | null; updated_at: string }>();
  const caps = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(`target_cost:${month}`).first<{ value: string }>();
  const costs = parseTargetCosts(caps?.value);
  const rates = await env.DB.prepare('SELECT value,updated_at FROM app_settings WHERE key=?').bind(`target_rate:${month}`).first<{ value: string; updated_at: string }>();
  return withTargetRates(rows.results.map((r): TargetRow => ({ scope: r.scope, refId: r.ref_id, revenue: Number(r.revenue), closedOrders: Number(r.closed_orders), workingDays: r.working_days === null ? null : Number(r.working_days), updatedAt: r.updated_at, ...(r.scope === 'team' ? { costCeiling: costs[r.ref_id] ?? null } : {}) })), parseTargetCosts(rates?.value), rates?.updated_at ?? '');
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

// Ghi KPI tháng (PUT /api/targets). Tách khỏi app/api/targets/route.ts (cải tổ B5, 05/11/2026), câu SQL giữ nguyên.
/** Một dòng app_settings của KPI: chi phí trần `target_cost:<tháng>`, tỷ lệ chốt `target_rate:<tháng>`. */
export const readTargetSetting = (key: string) => env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();

/** Thay KPI của tháng (cả tháng, hoặc chỉ các khoá trong `only`) và lưu chi phí trần / tỷ lệ chốt; trả `only` để ghi nhật ký. */
export async function writeTargets(user: { role: Access['role']; email: string }, body: { only?: string[]; items: { scope?: string; refId?: string; revenue?: number; closedOrders?: number; workingDays?: number | null; costCeiling?: number | null; closeRate?: number | null }[] }, month: string, caps: Record<string, number>, storedRates: { value: string } | null, now: string) {
  const only = Array.isArray(body.only) ? body.only.map(String).filter((k) => /^(pos|employee|team):[^\s]{1,100}$/.test(k)).slice(0, 500) : null;
  const statements = only
    ? only.map((k) => env.DB.prepare('DELETE FROM targets WHERE id=?').bind(`${month}:${k}`))
    : [env.DB.prepare('DELETE FROM targets WHERE month=?').bind(month)];
  if (isOwner(user)) {
    if (only) { for (const k of only) if (k.startsWith('team:')) delete caps[k.slice(5)]; } else { for (const k of Object.keys(caps)) delete caps[k]; }
  }
  const rates = mergeTargetRates(parseTargetCosts(storedRates?.value), body.items, only);
  for (const it of body.items) {
    const scope = it.scope === 'pos' || it.scope === 'employee' || it.scope === 'team' ? it.scope : null;
    const refId = String(it.refId ?? '').slice(0, 100);
    const revenue = Math.max(0, Math.round(Number(it.revenue) || 0)), closed = Math.max(0, Math.round(Number(it.closedOrders) || 0));
    const workingDays = scope === 'employee' && it.workingDays != null && Number(it.workingDays) > 0 ? Math.min(31, Math.round(Number(it.workingDays))) : null;
    if (!scope || !refId || (scope === 'pos' && !POS.some((p) => p.id === refId)) || (!revenue && !closed && !workingDays && it.costCeiling == null)) continue;
    if (only && !only.includes(`${scope}:${refId}`)) continue;
    if (scope === 'team' && it.costCeiling != null) caps[refId] = it.costCeiling;
    statements.push(env.DB.prepare('INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,working_days,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(`${month}:${scope}:${refId}`, month, scope, refId, revenue, closed, workingDays, user.email, now));
  }
  if (isOwner(user)) statements.push(env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`target_cost:${month}`, JSON.stringify(caps), now));
  statements.push(env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`target_rate:${month}`, JSON.stringify(rates), now));
  for (let i = 0; i < statements.length; i += 100) await env.DB.batch(statements.slice(i, i + 100));
  return only;
}
