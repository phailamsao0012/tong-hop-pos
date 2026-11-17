import { env } from 'cloudflare:workers';
import { isOwner, type Access } from '@/lib/auth/access';
import { POS } from '@/lib/shared/report-model';
import { staffScope } from '@/lib/teams/staff-scope';

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
    // Từ 14/11/2026 TB đơn đặt cho từng người (khoá "employee:<mã>"); khoá team cũ giữ nguyên tới khi team có TB đơn từng người.
    if ((it.scope !== 'team' && it.scope !== 'employee') || !it.refId || it.aov === undefined) continue;
    const k = `${it.scope}:${it.refId}`;
    if (only && !only.includes(k)) continue;
    const v = Number(it.aov);
    if (it.aov !== null && Number.isFinite(v) && v > 0) next[k] = Math.round(v); else delete next[k];
  }
  return next;
}

/** Gắn KPI TB đơn vào dòng team; team chỉ có TB đơn (chưa có doanh thu) vẫn thành một dòng. */
export function withTargetAov(rows: TargetRow[], aov: Record<string, number>, updatedAt = ''): TargetRow[] {
  const seen = new Set<string>();
  // Gắn TB đơn cho dòng team và dòng người (khoá employee: từ 14/11/2026); chỉ có TB đơn vẫn thành một dòng.
  const out = rows.map((r) => {
    if (r.scope !== 'team' && r.scope !== 'employee') return r;
    const k = `${r.scope}:${r.refId}`;
    seen.add(k);
    return { ...r, aov: typeof aov[k] === 'number' ? aov[k] : null };
  });
  for (const [k, v] of Object.entries(aov)) {
    const scope = k.slice(0, k.indexOf(':'));
    if ((scope !== 'team' && scope !== 'employee') || seen.has(k) || typeof v !== 'number') continue;
    out.push({ scope: scope as 'team' | 'employee', refId: k.slice(scope.length + 1), revenue: 0, closedOrders: 0, workingDays: null, updatedAt, closeRate: null, aov: v });
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
    return items.filter((item) => item.scope === 'pos' || item.scope === 'dept_pos' || (item.scope === 'employee' && own.has(item.refId)));
  }
  // Giám đốc / trưởng nhóm: KPI cá nhân chỉ của người mình quản lý (ids = targetStaff), cộng KPI team mình cầm (plan sửa web 1.3, 17/11/2026:
  // trước đây trả KPI của mọi người không thuộc CSKH, kể cả người ngoài team).
  return items.filter((item) => mine(item) || item.scope === 'pos' || item.scope === 'dept_pos' || (item.scope === 'employee' && !!ids?.includes(item.refId)));
}

/** refId KPI bộ phận × POS: 'sale:<pos>' | 'cskh:<pos>' | 'mkt:<pos>' (anh Vũ 12/11/2026). */
export const DEPT_POS_DEPTS = ['sale', 'cskh', 'mkt'] as const;
export type DeptPosDept = typeof DEPT_POS_DEPTS[number];
export function isDeptPosRef(refId: string): boolean {
  const at = refId.indexOf(':');
  return at > 0 && (DEPT_POS_DEPTS as readonly string[]).includes(refId.slice(0, at)) && POS.some((p) => p.id === refId.slice(at + 1));
}
export type TargetRow = { scope: 'pos' | 'employee' | 'team' | 'dept_pos'; refId: string; revenue: number; closedOrders: number; workingDays: number | null; updatedAt: string; costCeiling?: number | null; closeRate?: number | null; aov?: number | null };
/** Mục tiêu của một tháng (YYYY-MM). */
export async function listTargets(month: string): Promise<TargetRow[]> {
  const rows = await env.DB.prepare('SELECT scope,ref_id,revenue,closed_orders,working_days,updated_at FROM targets WHERE month=?').bind(month)
    .all<{ scope: 'pos' | 'employee' | 'team' | 'dept_pos'; ref_id: string; revenue: number; closed_orders: number; working_days: number | null; updated_at: string }>();
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

// Ghi KPI tháng (PUT /api/targets). Tách khỏi app/api/targets/route.ts (cải tổ B5, 05/11/2026), câu SQL giữ nguyên.
/** Một dòng app_settings của KPI: chi phí trần `target_cost:<tháng>`, tỷ lệ chốt `target_rate:<tháng>`. */
export const readTargetSetting = (key: string) => env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();

/** Sao lưu KPI trước mỗi lần lưu trên web (plan sửa web 1.1, 17/11/2026): giữ 20 bản gần nhất mỗi tháng, hoàn tác lần lưu gần nhất. */
export const TARGET_BACKUP_PREFIX = 'targets_backup:';
const TARGET_BACKUP_KEEP = 20;
type TargetBackup = { at: string; by: string; month: string; keys: string[]; rows: Record<string, unknown>[]; settings: Record<string, string | null> };
const SETTING_KEYS = (month: string) => [`target_cost:${month}`, `target_rate:${month}`, `target_aov:${month}`];
async function backupStatements(month: string, keys: string[], by: string, now: string) {
  const ids = keys.map((k) => `${month}:${k}`);
  const rows = ids.length ? (await env.DB.prepare(`SELECT * FROM targets WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Record<string, unknown>>()).results : [];
  const set = new Map((await env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?,?)').bind(...SETTING_KEYS(month)).all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
  const backup: TargetBackup = { at: now, by, month, keys, rows, settings: Object.fromEntries(SETTING_KEYS(month).map((k) => [k, set.get(k) ?? null])) };
  const key = `${TARGET_BACKUP_PREFIX}${month}:${now}`;
  return [
    env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, JSON.stringify(backup), now),
    // Giữ 20 bản gần nhất của tháng.
    env.DB.prepare(`DELETE FROM app_settings WHERE key LIKE ? AND key NOT IN (SELECT key FROM app_settings WHERE key LIKE ? ORDER BY key DESC LIMIT ${TARGET_BACKUP_KEEP})`).bind(`${TARGET_BACKUP_PREFIX}${month}:%`, `${TARGET_BACKUP_PREFIX}${month}:%`),
  ];
}
/** Bản sao lưu gần nhất của tháng (để hiện nút hoàn tác). */
export async function lastTargetBackup(month: string) {
  const r = await env.DB.prepare('SELECT key,value FROM app_settings WHERE key LIKE ? ORDER BY key DESC LIMIT 1').bind(`${TARGET_BACKUP_PREFIX}${month}:%`).first<{ key: string; value: string }>();
  if (!r) return null;
  try { const b = JSON.parse(r.value) as TargetBackup; return { key: r.key, at: b.at, by: b.by, count: b.keys.length }; } catch { return null; }
}
/** Hoàn tác lần lưu KPI gần nhất của tháng trên web: trả đúng các dòng và cài đặt (chi phí trần, tỉ lệ chốt, TB đơn) về bản trước. Ghi trọn một lần. */
export async function undoTargets(month: string, now: string) {
  const r = await env.DB.prepare('SELECT key,value FROM app_settings WHERE key LIKE ? ORDER BY key DESC LIMIT 1').bind(`${TARGET_BACKUP_PREFIX}${month}:%`).first<{ key: string; value: string }>();
  if (!r) return null;
  const b = JSON.parse(r.value) as TargetBackup;
  const st: D1PreparedStatement[] = b.keys.map((k) => env.DB.prepare('DELETE FROM targets WHERE id=?').bind(`${month}:${k}`));
  for (const row of b.rows) {
    const cols = Object.keys(row);
    st.push(env.DB.prepare(`INSERT INTO targets (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => row[c] as string | number | null)));
  }
  for (const [k, v] of Object.entries(b.settings)) {
    st.push(v == null ? env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(k)
      : env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(k, v, now));
  }
  st.push(env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(r.key));
  await env.DB.batch(st);
  return { at: b.at, count: b.keys.length };
}

/** Lưu KPI của tháng: CHỈ đổi đúng các dòng gửi lên (khoá trong `only`, hoặc khoá của các dòng gửi lên khi không có `only`);
 *  dòng gửi lên mà để trống (0) là xoá dòng đó. Không bao giờ xoá cả tháng (plan sửa web 1.1, 17/11/2026: trước đây thiếu `only`
 *  thì xoá hết KPI tháng rồi ghi lại theo lô 100 câu). Sao lưu các dòng sắp đổi rồi ghi trọn MỘT lần (lỗi giữa chừng thì không đổi gì).
 *  Trả danh sách khoá đã đổi để ghi nhật ký. */
export async function writeTargets(user: { role: Access['role']; email: string }, body: { only?: string[]; items: { scope?: string; refId?: string; revenue?: number; closedOrders?: number; workingDays?: number | null; costCeiling?: number | null; closeRate?: number | null; aov?: number | null }[] }, month: string, caps: Record<string, number>, storedRates: { value: string } | null, now: string, storedAovJson: string | null = null) {
  const sentKeys = body.items.map((it) => `${it.scope}:${String(it.refId ?? '').slice(0, 100)}`).filter((k) => /^(pos|employee|team|dept_pos):[^\s]{1,100}$/.test(k));
  const only = [...new Set(Array.isArray(body.only) ? body.only.map(String).filter((k) => /^(pos|employee|team|dept_pos):[^\s]{1,100}$/.test(k)) : sentKeys)].slice(0, 500);
  const statements: D1PreparedStatement[] = [...await backupStatements(month, only, user.email, now), ...only.map((k) => env.DB.prepare('DELETE FROM targets WHERE id=?').bind(`${month}:${k}`))];
  if (isOwner(user)) for (const k of only) if (k.startsWith('team:')) delete caps[k.slice(5)];
  const rates = mergeTargetRates(parseTargetCosts(storedRates?.value), body.items, only);
  const storedAov = parseTargetCosts(storedAovJson ?? undefined), aov = mergeTargetAov(storedAov, body.items, only);
  for (const it of body.items) {
    const scope = it.scope === 'pos' || it.scope === 'employee' || it.scope === 'team' || it.scope === 'dept_pos' ? it.scope : null;
    const refId = String(it.refId ?? '').slice(0, 100);
    const revenue = Math.max(0, Math.round(Number(it.revenue) || 0)), closed = Math.max(0, Math.round(Number(it.closedOrders) || 0));
    const workingDays = scope === 'employee' && it.workingDays != null && Number(it.workingDays) > 0 ? Math.min(31, Math.round(Number(it.workingDays))) : null;
    if (!scope || !refId || (scope === 'pos' && !POS.some((p) => p.id === refId)) || (scope === 'dept_pos' && !isDeptPosRef(refId)) || (!revenue && !closed && !workingDays && it.costCeiling == null)) continue;
    if (only && !only.includes(`${scope}:${refId}`)) continue;
    if (scope === 'team' && it.costCeiling != null) caps[refId] = it.costCeiling;
    statements.push(env.DB.prepare('INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,working_days,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(`${month}:${scope}:${refId}`, month, scope, refId, revenue, closed, workingDays, user.email, now));
  }
  if (isOwner(user)) statements.push(env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`target_cost:${month}`, JSON.stringify(caps), now));
  statements.push(env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`target_rate:${month}`, JSON.stringify(rates), now));
  // TB đơn chỉ ghi khi đổi: trang chưa biết TB đơn lưu KPI không tạo thêm khoá rỗng.
  if (JSON.stringify(aov) !== JSON.stringify(storedAov)) statements.push(env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`target_aov:${month}`, JSON.stringify(aov), now));
  // Một lần ghi (batch là một giao dịch): lỗi ở câu nào thì không đổi gì.
  await env.DB.batch(statements);
  return only;
}

/** Lưu chỉ tiêu KPI mới của tháng (lib/kpi/kpi2.ts), app_settings target_kpi2:<tháng>. */
export const saveKpi2 = (key: string, value: unknown, now: string) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(key, JSON.stringify(value), now).run();
