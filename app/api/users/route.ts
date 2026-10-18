import { env } from 'cloudflare:workers';
import { primaryOwnerId } from '@/lib/primary-owner';
import { auditHeaders } from '@/lib/audit';
import { forbidden, getSessionUser, hashPassword, normalizeEmail, passwordProblem, unauthorized } from '@/lib/auth';
import { ALL_VIEWS, isOwner, parseRole, type Role } from '@/lib/access';
import { POS } from '@/lib/report-model';

// Tài khoản & phân quyền: chỉ chủ hệ thống (owner) được xem danh sách, tạo, sửa quyền, khóa, đặt lại mật khẩu.
type UserRow = { id: string; email: string; name: string; role: string; disabled: number; created_at: string; last_login_at: string | null; title: string; manager_id: string | null; views_json: string; pos_ids_json: string; team: string };
const MAX_USERS = 60;

async function employeeLink(userId: string, value: unknown): Promise<D1PreparedStatement | Response | null> {
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

const parseList = (v: string) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const publicUser = (r: UserRow) => ({
  id: r.id, email: r.email, name: r.name, role: parseRole(r.role), disabled: !!r.disabled, createdAt: r.created_at, lastLoginAt: r.last_login_at,
  title: r.title ?? '', managerId: r.manager_id, views: parseList(r.views_json), posIds: parseList(r.pos_ids_json), team: r.team === 'sale' || r.team === 'cskh' ? r.team : 'all',
});

async function requireOwner() {
  const user = await getSessionUser();
  if (!user) return { error: unauthorized() };
  if (!isOwner(user)) return { error: forbidden() };
  return { user };
}
const cleanViews = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(String).filter((x) => ALL_VIEWS.includes(x)))] : null;
const cleanPos = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(String).filter((x) => POS.some((p) => p.id === x)))] : null;
const cleanTeam = (v: unknown) => v === 'sale' || v === 'cskh' ? v : v === 'all' ? 'all' : null;
const cleanRole = (v: unknown): Role | null => v === 'owner' || v === 'director' || v === 'lead' || v === 'mentor' || v === 'staff' ? v : null;

export async function GET(request: Request) {
  const { error } = await requireOwner();
  if (error) return error;
  if (new URL(request.url).searchParams.get('employees') === '1') {
    const employees = await env.DB.prepare("SELECT id,code,full_name AS name FROM hr_employees WHERE status<>'da_nghi' ORDER BY full_name").all();
    return Response.json(employees.results, { headers: { 'Cache-Control': 'no-store' } });
  }
  const links = await env.DB.prepare("SELECT u.id,COALESCE((SELECT e.id FROM hr_employees e WHERE e.main_user_id=u.id LIMIT 1),(SELECT value FROM app_settings WHERE key='user_employee:'||u.id)) AS employeeId FROM users u").all<{ id: string; employeeId: string | null }>();
  const rows = await env.DB.prepare('SELECT id,email,name,role,disabled,created_at,last_login_at,title,manager_id,views_json,pos_ids_json,team FROM users ORDER BY created_at').all<UserRow>();
  const primary = await primaryOwnerId();
  return Response.json(rows.results.map((r) => ({ ...publicUser(r), primary: r.id === primary, employeeId: links.results.find((link) => link.id === r.id)?.employeeId ?? null })), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const { error, user: actor } = await requireOwner();
  if (error) return error;
  let body: { email?: unknown; name?: unknown; password?: unknown; role?: unknown; title?: unknown; managerId?: unknown; views?: unknown; posIds?: unknown; team?: unknown; employeeId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const role = cleanRole(body.role) ?? 'staff';
  if (role === 'owner' && actor!.userId !== await primaryOwnerId()) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới cấp được quyền chủ hệ thống.' }, { status: 403 });
  if (!email || !name) return Response.json({ error: 'Cần email hợp lệ và tên.' }, { status: 400 });
  const problem = await passwordProblem(body.password, email);
  if (problem || typeof body.password !== 'string') return Response.json({ error: problem ?? 'Mật khẩu không hợp lệ.' }, { status: 400 });
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if (Number(count?.n ?? 0) >= MAX_USERS) return Response.json({ error: `Tối đa ${MAX_USERS} tài khoản.` }, { status: 400 });
  const exists = await env.DB.prepare('SELECT 1 AS x FROM users WHERE email=?').bind(email).first();
  if (exists) return Response.json({ error: 'Email này đã có tài khoản.' }, { status: 409 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const link = await employeeLink(id, body.employeeId);
  if (link instanceof Response) return link;
  await env.DB.batch([env.DB.prepare('INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at,title,manager_id,views_json,pos_ids_json,team) VALUES (?,?,?,?,?,0,?,?,?,?,?,?,?)')
    .bind(id, email, name, await hashPassword(body.password), role, now, now, typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '', typeof body.managerId === 'string' && body.managerId ? body.managerId : null,
      JSON.stringify(cleanViews(body.views) ?? []), JSON.stringify(cleanPos(body.posIds) ?? []), cleanTeam(body.team) ?? 'all'), ...(link ? [link] : [])]);
  return Response.json({ ok: true, id }, { headers: auditHeaders(`Tạo ${email} (${name}) · vai trò ${role}`) });
}

export async function PUT(request: Request) {
  const { error, user: owner } = await requireOwner();
  if (error) return error;
  let body: { id?: unknown; name?: unknown; role?: unknown; disabled?: unknown; password?: unknown; title?: unknown; managerId?: unknown; views?: unknown; posIds?: unknown; team?: unknown; employeeId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id : '';
  const target = await env.DB.prepare('SELECT id,role,email FROM users WHERE id=?').bind(id).first<{ id: string; role: string; email: string }>();
  if (!target) return Response.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  const targetIsOwner = parseRole(target.role) === 'owner';
  const isPrimary = owner!.userId === await primaryOwnerId();
  if (targetIsOwner && target.id !== owner!.userId && !isPrimary) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới sửa được tài khoản chủ hệ thống khác.' }, { status: 403 });
  // Quản được quyền / khóa: tài khoản thường, hoặc chủ hệ thống khác khi người sửa là chủ hệ thống gốc (không tự đổi quyền của mình).
  const canManage = !targetIsOwner || (isPrimary && target.id !== owner!.userId);
  if (cleanRole(body.role) === 'owner' && !targetIsOwner && !isPrimary) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới cấp được quyền chủ hệ thống.' }, { status: 403 });
  const link = await employeeLink(id, body.employeeId);
  if (link instanceof Response) return link;
  const sets: string[] = []; const values: (string | number | null)[] = [];
  if (typeof body.name === 'string' && body.name.trim()) { sets.push('name=?'); values.push(body.name.trim().slice(0, 100)); }
  if (typeof body.title === 'string') { sets.push('title=?'); values.push(body.title.trim().slice(0, 80)); }
  if (body.managerId !== undefined) { sets.push('manager_id=?'); values.push(typeof body.managerId === 'string' && body.managerId && body.managerId !== id ? body.managerId : null); }
  if (canManage) {
    const role = cleanRole(body.role); if (role) { sets.push('role=?'); values.push(role); }
    const views = cleanViews(body.views); if (views) { sets.push('views_json=?'); values.push(JSON.stringify(views)); }
    const pos = cleanPos(body.posIds); if (pos) { sets.push('pos_ids_json=?'); values.push(JSON.stringify(pos)); }
    const team = cleanTeam(body.team); if (team) { sets.push('team=?'); values.push(team); }
    if (typeof body.disabled === 'boolean') { sets.push('disabled=?'); values.push(body.disabled ? 1 : 0); }
  }
  if (body.password !== undefined) {
    const problem = await passwordProblem(body.password);
    if (problem || typeof body.password !== 'string') return Response.json({ error: problem ?? 'Mật khẩu không hợp lệ.' }, { status: 400 });
    sets.push('password_hash=?'); values.push(await hashPassword(body.password));
  }
  if (!sets.length && !link) return Response.json({ error: 'Không có gì để cập nhật.' }, { status: 400 });
  sets.push('updated_at=?'); values.push(new Date().toISOString());
  const statements = [env.DB.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).bind(...values, id), ...(link ? [link] : [])];
  // Đổi quyền / khóa / đổi mật khẩu → đăng xuất mọi phiên của người đó để quyền mới có hiệu lực ngay.
  if (canManage && (body.disabled === true || body.password !== undefined || body.views !== undefined || body.posIds !== undefined || body.team !== undefined || body.role !== undefined || body.employeeId !== undefined))
    statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id));
  await env.DB.batch(statements);
  const changed = sets.filter((x) => x !== 'updated_at=?').map((x) => x.split('=')[0]).map((k) => ({ name: 'tên', title: 'chức danh', manager_id: 'quản lý', role: 'vai trò', views_json: 'trang', pos_ids_json: 'POS', team: 'nhóm', disabled: body.disabled ? 'khóa' : 'mở khóa', password_hash: 'mật khẩu' }[k] ?? k));
  return Response.json({ ok: true }, { headers: auditHeaders(`${target.email}: ${changed.join(', ')}`) });
}

export async function DELETE(request: Request) {
  const { error, user: owner } = await requireOwner();
  if (error) return error;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id || id === owner!.userId) return Response.json({ error: 'Không thể xóa tài khoản đang dùng.' }, { status: 400 });
  const target = await env.DB.prepare('SELECT role,email FROM users WHERE id=?').bind(id).first<{ role: string; email: string }>();
  // Chỉ chủ hệ thống gốc xóa được chủ hệ thống khác; không ai xóa được chủ hệ thống gốc.
  if (target && parseRole(target.role) === 'owner' && (owner!.userId !== await primaryOwnerId() || id === await primaryOwnerId())) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới xóa được tài khoản chủ hệ thống khác.' }, { status: 403 });
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id), env.DB.prepare('DELETE FROM users WHERE id=?').bind(id), env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`user_employee:${id}`)]);
  return Response.json({ ok: true }, { headers: auditHeaders(`Xóa ${target?.email ?? id}`) });
}
