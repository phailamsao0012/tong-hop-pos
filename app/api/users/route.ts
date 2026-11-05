import { primaryOwnerId } from '@/lib/auth/primary-owner';
import { auditHeaders } from '@/lib/ops/audit';
import { forbidden, getSessionUser, normalizeEmail, passwordProblem, hashPassword, unauthorized } from '@/lib/auth/auth';
import { isOwner, parseRole } from '@/lib/auth/access';
import { groupPosPeople, teamChoices, type PosPersonRow } from '@/lib/teams/account-from-pos';
import { parseMarketingTeams } from '@/lib/teams/marketing-teams';
import { refreshTeamSource } from '@/lib/teams/team-source';
import { WEB_TEAMS_KEY, parseWebTeams } from '@/lib/teams/web-teams';
import { MARKETING_TEAMS_KEY } from '@/lib/teams/marketing-teams';
import {
  cleanPos, cleanRole, cleanTeam, cleanViews, createUser, deleteSessionsStatement, deleteUser, emailTaken, employeeLink, employeeOptions, ownedTeamWrites,
  posPeopleSources, runStatements, updateUserStatements, userCount, userEmployeeLinks, userRoleEmail, userRows, userTarget, type UserRow,
} from '@/lib/auth/user-admin';

// Tài khoản & phân quyền: chỉ chủ hệ thống (owner) được xem danh sách, tạo, sửa quyền, khóa, đặt lại mật khẩu.
const MAX_USERS = 60;


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

export async function GET(request: Request) {
  const { error } = await requireOwner();
  if (error) return error;
  if (new URL(request.url).searchParams.get('employees') === '1') {
    const employees = await employeeOptions();
    return Response.json(employees.results, { headers: { 'Cache-Control': 'no-store' } });
  }
  // Ô "Chọn người trên POS" và "Team người này quản lý" ở form Thêm tài khoản (03/11/2026).
  if (new URL(request.url).searchParams.get('pos-people') === '1') {
    const [people, settings] = await posPeopleSources();
    const saved = new Map((settings.results as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    return Response.json({ people: groupPosPeople(people.results as PosPersonRow[]), teams: teamChoices(parseWebTeams(saved.get(WEB_TEAMS_KEY)), parseMarketingTeams(saved.get(MARKETING_TEAMS_KEY))) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const links = await userEmployeeLinks();
  const rows = await userRows();
  const primary = await primaryOwnerId();
  return Response.json(rows.results.map((r) => ({ ...publicUser(r), primary: r.id === primary, employeeId: links.results.find((link) => link.id === r.id)?.employeeId ?? null })), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const { error, user: actor } = await requireOwner();
  if (error) return error;
  let body: { email?: unknown; name?: unknown; password?: unknown; role?: unknown; title?: unknown; managerId?: unknown; views?: unknown; posIds?: unknown; team?: unknown; employeeId?: unknown; manageTeams?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const role = cleanRole(body.role) ?? 'staff';
  if (role === 'owner' && actor!.userId !== await primaryOwnerId()) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới cấp được quyền chủ hệ thống.' }, { status: 403 });
  if (!email || !name) return Response.json({ error: 'Cần email hợp lệ và tên.' }, { status: 400 });
  const problem = await passwordProblem(body.password, email);
  if (problem || typeof body.password !== 'string') return Response.json({ error: problem ?? 'Mật khẩu không hợp lệ.' }, { status: 400 });
  const count = await userCount();
  if (Number(count?.n ?? 0) >= MAX_USERS) return Response.json({ error: `Tối đa ${MAX_USERS} tài khoản.` }, { status: 400 });
  const exists = await emailTaken(email);
  if (exists) return Response.json({ error: 'Email này đã có tài khoản.' }, { status: 409 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const link = await employeeLink(id, body.employeeId);
  if (link instanceof Response) return link;
  const owned = await ownedTeamWrites(id, role, body.manageTeams);
  if (owned instanceof Response) return owned;
  await createUser(id, email, name, body as typeof body & { password: string }, role, now, link, owned);
  if (owned.length) await refreshTeamSource(true);
  return Response.json({ ok: true, id }, { headers: auditHeaders(`Tạo ${email} (${name}) · vai trò ${role}`) });
}

export async function PUT(request: Request) {
  const { error, user: owner } = await requireOwner();
  if (error) return error;
  let body: { id?: unknown; name?: unknown; role?: unknown; disabled?: unknown; password?: unknown; title?: unknown; managerId?: unknown; views?: unknown; posIds?: unknown; team?: unknown; employeeId?: unknown; manageTeams?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id : '';
  const target = await userTarget(id);
  if (!target) return Response.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  const targetIsOwner = parseRole(target.role) === 'owner';
  const isPrimary = owner!.userId === await primaryOwnerId();
  if (targetIsOwner && target.id !== owner!.userId && !isPrimary) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới sửa được tài khoản chủ hệ thống khác.' }, { status: 403 });
  // Quản được quyền / khóa: tài khoản thường, hoặc chủ hệ thống khác khi người sửa là chủ hệ thống gốc (không tự đổi quyền của mình).
  const canManage = !targetIsOwner || (isPrimary && target.id !== owner!.userId);
  if (cleanRole(body.role) === 'owner' && !targetIsOwner && !isPrimary) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới cấp được quyền chủ hệ thống.' }, { status: 403 });
  const link = await employeeLink(id, body.employeeId);
  if (link instanceof Response) return link;
  const owned = canManage ? await ownedTeamWrites(id, cleanRole(body.role) ?? parseRole(target.role), body.manageTeams) : [];
  if (owned instanceof Response) return owned;
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
  if (!sets.length && !link && !owned.length) return Response.json({ error: 'Không có gì để cập nhật.' }, { status: 400 });
  sets.push('updated_at=?'); values.push(new Date().toISOString());
  const statements = updateUserStatements(sets, values, id, link, owned);
  // Đổi quyền / khóa / đổi mật khẩu → đăng xuất mọi phiên của người đó để quyền mới có hiệu lực ngay.
  if (canManage && (body.disabled === true || body.password !== undefined || body.views !== undefined || body.posIds !== undefined || body.team !== undefined || body.role !== undefined || body.employeeId !== undefined))
    statements.push(deleteSessionsStatement(id));
  await runStatements(statements);
  if (owned.length) await refreshTeamSource(true);
  const changed = sets.filter((x) => x !== 'updated_at=?').map((x) => x.split('=')[0]).map((k) => ({ name: 'tên', title: 'chức danh', manager_id: 'quản lý', role: 'vai trò', views_json: 'trang', pos_ids_json: 'POS', team: 'nhóm', disabled: body.disabled ? 'khóa' : 'mở khóa', password_hash: 'mật khẩu' }[k] ?? k)).concat(owned.length ? ['team phụ trách'] : []);
  return Response.json({ ok: true }, { headers: auditHeaders(`${target.email}: ${changed.join(', ')}`) });
}

export async function DELETE(request: Request) {
  const { error, user: owner } = await requireOwner();
  if (error) return error;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id || id === owner!.userId) return Response.json({ error: 'Không thể xóa tài khoản đang dùng.' }, { status: 400 });
  const target = await userRoleEmail(id);
  // Chỉ chủ hệ thống gốc xóa được chủ hệ thống khác; không ai xóa được chủ hệ thống gốc.
  if (target && parseRole(target.role) === 'owner' && (owner!.userId !== await primaryOwnerId() || id === await primaryOwnerId())) return Response.json({ error: 'Chỉ chủ hệ thống gốc mới xóa được tài khoản chủ hệ thống khác.' }, { status: 403 });
  await deleteUser(id);
  return Response.json({ ok: true }, { headers: auditHeaders(`Xóa ${target?.email ?? id}`) });
}
