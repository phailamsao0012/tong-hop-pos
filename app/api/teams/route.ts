import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { MENTOR_SQL, groupTeams, mentorMap, type DeptRow, type TeamRow } from '@/lib/hr-teams';
import { mktTeams } from '@/lib/mkt-teams-source';
import { todayVn } from '@/lib/report-time';
import { teamSubquery } from '@/lib/team';
import { WEB_TEAMS_KEY, parseWebTeams } from '@/lib/web-teams';
import type { HrTeamGroup } from '@/lib/hr-teams';

// Team Sale / CSKH theo web nhân sự: ?team=sale|cskh → các team, Leader, Mentor, Trưởng phòng và tài khoản POS của từng người (người đã nghỉ không tính).
// ?list=1: chỉ danh sách team của cả Sale và CSKH (mã, tên, chi nhánh, bộ phận, số người) cho ô chọn team trên thanh lọc; tài khoản bị giới hạn
// một bộ phận chỉ nhận team của bộ phận đó (scopeApi đã ghi ?team=).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const params = new URL(request.url).searchParams;
  const asked = params.get('team');
  const web = await webTeamsResponse(params, asked);
  if (web) return web;
  const day = todayVn();
  const [rows, depts, offices, mentors] = await env.DB.batch([
    env.DB.prepare(`SELECT t.pos_user_id,t.employee_id,t.employee_name,t.team,t.department,t.department_id,t.level,t.title,t.leader_employee_id,t.leader_name,t.head_name,t.status,e.joined_on
      FROM hr_pos_team t LEFT JOIN hr_employees e ON e.id=t.employee_id WHERE t.status<>'da_nghi'`),
    env.DB.prepare('SELECT id,name,parent_id,kind,office_id FROM hr_departments WHERE active=1'),
    env.DB.prepare('SELECT id,name FROM hr_offices'),
    env.DB.prepare(MENTOR_SQL).bind(day, day),
  ]);
  const officeMap = new Map((offices.results as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  const mentorOf = mentorMap(mentors.results as { team_id: string; name: string }[]);
  const group = (team: 'sale' | 'cskh') => groupTeams(rows.results as TeamRow[], depts.results as DeptRow[], officeMap, team, mentorOf);
  if (params.get('list') === '1') {
    const depts: ('sale' | 'cskh')[] = asked === 'sale' || asked === 'cskh' ? [asked] : ['sale', 'cskh'];
    const teams: ListTeam[] = depts.flatMap((dept) => group(dept).filter((t) => t.id !== 'none').map((t) => listTeam(t.id, t.name, t.office, dept, t.mentor ?? null, t.members.map((m) => m.name))));
    if (asked !== 'sale' && asked !== 'cskh') {
      const mkt = await mktTeams(env.DB);
      const nameOf = await staffNames();
      teams.push(...mkt.teams.map((t) => listTeam(t.id, t.name, t.office ?? null, 'mkt', t.mentor ?? null, t.memberNames ?? t.memberIds.map((id) => nameOf.get(id) ?? id))));
    }
    return Response.json({ teams }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  }
  const team = asked === 'cskh' ? 'cskh' : 'sale';
  return Response.json({ team, teams: group(team), linked: rows.results.length > 0 }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}

/** Team chia trên web tổng (lib/web-teams.ts): dùng khi nguồn team không phải web nhân sự và đã lưu ít nhất một team. */
async function webTeamsResponse(params: URLSearchParams, asked: string | null) {
  const settings = await env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind('team_source', WEB_TEAMS_KEY).all<{ key: string; value: string }>();
  const values = new Map(settings.results.map((r) => [r.key, r.value]));
  const saved = parseWebTeams(values.get(WEB_TEAMS_KEY));
  if (values.get('team_source') === 'hr' || !saved.length) return null;
  const headers = { 'Cache-Control': 'private, max-age=60' };
  const nameOf = await staffNames();
  const names = (ids: string[]) => ids.map((id) => nameOf.get(id) ?? id);
  if (params.get('list') === '1') {
    const depts = asked === 'sale' || asked === 'cskh' ? [asked] : ['sale', 'cskh'];
    const teams: ListTeam[] = saved.filter((t) => depts.includes(t.dept)).map((t) => listTeam(t.id, t.name, t.office, t.dept, null, names(t.memberIds)));
    if (asked !== 'sale' && asked !== 'cskh') {
      const mkt = await mktTeams(env.DB);
      teams.push(...mkt.teams.map((t) => listTeam(t.id, t.name, t.office ?? null, 'mkt', t.mentor ?? null, t.memberNames ?? names(t.memberIds))));
    }
    return Response.json({ teams }, { headers });
  }
  const team = asked === 'cskh' ? 'cskh' : 'sale';
  const member = (id: string) => ({ posUserId: id, name: nameOf.get(id) ?? id, level: null, title: null, isLeader: false, active: true, joinedOn: null });
  const groups: HrTeamGroup[] = saved.filter((t) => t.dept === team).map((t) => ({ id: t.id, name: t.name, parent: null, office: t.office, leader: null, head: null, mentor: null, members: t.memberIds.map(member).sort((a, b) => a.name.localeCompare(b.name, 'vi')) }));
  const placed = new Set(groups.flatMap((g) => g.members.map((m) => m.posUserId)));
  const rest = await env.DB.prepare(`SELECT DISTINCT user_id FROM pos_users WHERE user_id IN ${teamSubquery(team, false)}`).all<{ user_id: string }>();
  const none = rest.results.map((r) => r.user_id).filter((id) => !placed.has(id));
  if (none.length) groups.push({ id: 'none', name: 'Chưa vào team', parent: null, office: null, leader: null, head: null, mentor: null, members: none.map(member).sort((a, b) => a.name.localeCompare(b.name, 'vi')) });
  return Response.json({ team, teams: groups, linked: true }, { headers });
}

type ListTeam = { id: string; name: string; office: string | null; dept: 'sale' | 'cskh' | 'mkt'; people: number; mentor: string | null; members: string[] };
/** Một dòng trong ô chọn team; members là tên thành viên để xổ ra xem (anh Vũ 22/10/2026). Một người có tài khoản ở nhiều POS chỉ tính một lần. */
function listTeam(id: string, name: string, office: string | null, dept: ListTeam['dept'], mentor: string | null, memberNames: string[]): ListTeam {
  const members = [...new Set(memberNames.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  return { id, name, office, dept, people: members.length, mentor, members };
}

async function staffNames() {
  const staff = await env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE user_id<>'' GROUP BY user_id").all<{ user_id: string; name: string }>();
  return new Map(staff.results.map((r) => [r.user_id, r.name || `NV ${r.user_id.slice(0, 8)}`]));
}
