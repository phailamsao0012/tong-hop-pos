// Tài khoản & phân quyền (trang Tài khoản, chỉ chủ hệ thống). Tách khỏi app/api/users/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { hashPassword } from '@/lib/auth/auth';
import { ALL_VIEWS, type Role } from '@/lib/auth/access';
import { POS } from '@/lib/shared/report-model';
import { setOwnedTeams } from '@/lib/teams/account-from-pos';
import { MARKETING_TEAMS_KEY, parseMarketingTeams } from '@/lib/teams/marketing-teams';
import { WEB_TEAMS_BACKUP_KEY, WEB_TEAMS_KEY, parseWebTeams } from '@/lib/teams/web-teams';

export type UserRow = { id: string; email: string; name: string; role: string; disabled: number; created_at: string; last_login_at: string | null; title: string; manager_id: string | null; views_json: string; pos_ids_json: string; team: string };

export async function employeeLink(userId: string, value: unknown): Promise<D1PreparedStatement | Response | null> {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 100) return Response.json({ error: 'Hồ sơ không hợp lệ.' }, { status: 400 });
  const official = await env.DB.prepare('SELECT id FROM hr_employees WHERE main_user_id=?').bind(userId).all<{ id: string }>();
  if (official.results.length && (official.results.length !== 1 || official.results[0].id !== value)) return Response.json({ error: 'Liên kết chính thức do web nhân sự quản lý.' }, { status: 400 });
  if (!value) return env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`user_employee:${userId}`);
  const employee = await env.DB.prepare("SELECT id,main_user_id FROM hr_employees WHERE id=? AND status<>'da_nghi'").bind(value).first<{ id: string; main_user_id: string | null }>();
  if (!employee || (employee.main_user_id && employee.main_user_id !== userId)) return Response.json({ error: 'Không tìm thấy hồ sơ hoặc hồ sơ đã nối tài khoản khác.' }, { status: 400 });
  const other = await env.DB.prepare("SELECT key FROM app_settings WHERE key LIKE 'user_employee:%' AND value=? AND key<>? LIMIT 1").bind(value, `user_employee:${userId}`).first();
  if (other) return Response.json({ error: 'Hồ sơ đã nối tài khoản khác.' }, { status: 409 });
  return env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`user_employee:${userId}`, value, new Date().toISOString());
}

const cleanTeamIds = (v: unknown) => Array.isArray(v) && v.length <= 200 ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= 100))] : null;
const putSetting = (key: string, value: string, now: string) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, value, now);

/** Team tài khoản phụ trách (ô Mentor / Leader ở trang Chia team), lưu cùng lúc tạo / sửa tài khoản (anh Vũ 03/11/2026). Không đổi gì thì trả []. */
export async function ownedTeamWrites(userId: string, role: string, value: unknown): Promise<D1PreparedStatement[] | Response> {
  if (value === undefined) return [];
  const teamIds = cleanTeamIds(value);
  if (!teamIds) return Response.json({ error: 'Danh sách team không hợp lệ.' }, { status: 400 });
  const rows = await env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind(WEB_TEAMS_KEY, MARKETING_TEAMS_KEY).all<{ key: string; value: string }>();
  const saved = new Map(rows.results.map((r) => [r.key, r.value]));
  const web = setOwnedTeams(parseWebTeams(saved.get(WEB_TEAMS_KEY)), userId, role, teamIds);
  const mkt = setOwnedTeams(parseMarketingTeams(saved.get(MARKETING_TEAMS_KEY)), userId, role, teamIds);
  if (!web.changed && !mkt.changed) return [];
  const now = new Date().toISOString();
  return [
    putSetting(WEB_TEAMS_BACKUP_KEY, JSON.stringify({ savedAt: now, teams: saved.get(WEB_TEAMS_KEY) ?? null, mkt: saved.get(MARKETING_TEAMS_KEY) ?? null }), now),
    ...(web.changed ? [putSetting(WEB_TEAMS_KEY, JSON.stringify(web.teams), now)] : []),
    ...(mkt.changed ? [putSetting(MARKETING_TEAMS_KEY, JSON.stringify(mkt.teams), now)] : []),
  ];
}

export const cleanViews = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(String).filter((x) => ALL_VIEWS.includes(x)))] : null;
export const cleanPos = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(String).filter((x) => POS.some((p) => p.id === x)))] : null;
export const cleanTeam = (v: unknown) => v === 'sale' || v === 'cskh' ? v : v === 'all' ? 'all' : null;
export const cleanRole = (v: unknown): Role | null => v === 'owner' || v === 'director' || v === 'lead' || v === 'mentor' || v === 'staff' ? v : null;

/** Hồ sơ nhân sự còn làm (ô nối hồ sơ). */
export const employeeOptions = () => env.DB.prepare("SELECT id,code,full_name AS name FROM hr_employees WHERE status<>'da_nghi' ORDER BY full_name").all();
/** Người trên POS (từng POS) kèm hồ sơ nhân sự, và team web tổng / MKT đang lưu (form Thêm tài khoản). */
export const posPeopleSources = () => env.DB.batch([
    env.DB.prepare("SELECT u.user_id,MAX(u.name) AS name,u.pos_id,MAX(COALESCE(u.department,'')) AS department,(SELECT t.employee_id FROM hr_pos_team t WHERE t.pos_user_id=u.user_id LIMIT 1) AS employee_id FROM pos_users u WHERE u.user_id<>'' AND u.name<>'' AND u.is_active=1 GROUP BY u.user_id,u.pos_id"),
    env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind(WEB_TEAMS_KEY, MARKETING_TEAMS_KEY),
]);
/** Hồ sơ nhân sự nối với từng tài khoản (chính thức từ web nhân sự, hoặc nối tay). */
export const userEmployeeLinks = () => env.DB.prepare("SELECT u.id,COALESCE((SELECT e.id FROM hr_employees e WHERE e.main_user_id=u.id LIMIT 1),(SELECT value FROM app_settings WHERE key='user_employee:'||u.id)) AS employeeId FROM users u").all<{ id: string; employeeId: string | null }>();
/** Mọi tài khoản, theo thứ tự tạo. */
export const userRows = () => env.DB.prepare('SELECT id,email,name,role,disabled,created_at,last_login_at,title,manager_id,views_json,pos_ids_json,team FROM users ORDER BY created_at').all<UserRow>();

export const userCount = () => env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
export const emailTaken = (email: string) => env.DB.prepare('SELECT 1 AS x FROM users WHERE email=?').bind(email).first();
/** Tạo tài khoản cùng liên kết hồ sơ và team phụ trách (một lượt ghi). */
export async function createUser(id: string, email: string, name: string, body: { password: string; title?: unknown; managerId?: unknown; views?: unknown; posIds?: unknown; team?: unknown }, role: Role, now: string, link: D1PreparedStatement | null, owned: D1PreparedStatement[]) {
  await env.DB.batch([env.DB.prepare('INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at,title,manager_id,views_json,pos_ids_json,team) VALUES (?,?,?,?,?,0,?,?,?,?,?,?,?)')
    .bind(id, email, name, await hashPassword(body.password), role, now, now, typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '', typeof body.managerId === 'string' && body.managerId ? body.managerId : null,
      JSON.stringify(cleanViews(body.views) ?? []), JSON.stringify(cleanPos(body.posIds) ?? []), cleanTeam(body.team) ?? 'all'), ...(link ? [link] : []), ...owned]);
}

export const userTarget = (id: string) => env.DB.prepare('SELECT id,role,email FROM users WHERE id=?').bind(id).first<{ id: string; role: string; email: string }>();
/** Câu sửa tài khoản (các trường đổi) cùng liên kết hồ sơ và team phụ trách. */
export const updateUserStatements = (sets: string[], values: (string | number | null)[], id: string, link: D1PreparedStatement | null, owned: D1PreparedStatement[]) => [env.DB.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).bind(...values, id), ...(link ? [link] : []), ...owned];
/** Đăng xuất mọi phiên của một người. */
export const deleteSessionsStatement = (id: string) => env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id);
export const runStatements = (statements: D1PreparedStatement[]) => env.DB.batch(statements);

export const userRoleEmail = (id: string) => env.DB.prepare('SELECT role,email FROM users WHERE id=?').bind(id).first<{ role: string; email: string }>();
/** Xoá tài khoản, phiên và liên kết hồ sơ. */
export const deleteUser = (id: string) =>
  env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id), env.DB.prepare('DELETE FROM users WHERE id=?').bind(id), env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`user_employee:${id}`)]);
