import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { MENTOR_SQL, groupTeams, mentorMap, type DeptRow, type TeamRow } from '@/lib/teams/hr-teams';
import { mktTeams } from '@/lib/teams/mkt-teams-source';
import { todayVn } from '@/lib/shared/report-time';
import { WEB_TEAMS_KEY, overlayWebTeams, parseWebTeams } from '@/lib/teams/web-teams';
import type { HrTeamGroup } from '@/lib/teams/hr-teams';

// Team Sale / CSKH theo web nhân sự: ?team=sale|cskh → các team, Leader, Mentor, Trưởng phòng và tài khoản POS của từng người (người đã nghỉ không tính).
// ?list=1: chỉ danh sách team của cả Sale và CSKH (mã, tên, chi nhánh, bộ phận, số người) cho ô chọn team trên thanh lọc; tài khoản bị giới hạn
// một bộ phận chỉ nhận team của bộ phận đó (scopeApi đã ghi ?team=).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const params = new URL(request.url).searchParams;
  const asked = params.get('team');
  const day = todayVn();
  const [rows, depts, offices, mentors, settings] = await env.DB.batch([
    env.DB.prepare(`SELECT t.pos_user_id,t.employee_id,t.employee_name,t.team,t.department,t.department_id,t.level,t.title,t.leader_employee_id,t.leader_name,t.head_name,t.status,e.joined_on
      FROM hr_pos_team t LEFT JOIN hr_employees e ON e.id=t.employee_id WHERE t.status<>'da_nghi'`),
    env.DB.prepare('SELECT id,name,parent_id,kind,office_id FROM hr_departments WHERE active=1'),
    env.DB.prepare('SELECT id,name FROM hr_offices'),
    env.DB.prepare(MENTOR_SQL).bind(day, day),
    env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind('team_source', WEB_TEAMS_KEY),
  ]);
  const officeMap = new Map((offices.results as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  const mentorOf = mentorMap(mentors.results as { team_id: string; name: string }[]);
  // Team chia trên web tổng (lib/web-teams.ts) ghép đè lên team web nhân sự, trừ khi nguồn team đặt là web nhân sự.
  const values = new Map((settings.results as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const saved = values.get('team_source') === 'hr' ? [] : parseWebTeams(values.get(WEB_TEAMS_KEY));
  const nameOf = saved.length || asked !== 'sale' && asked !== 'cskh' ? await staffNames() : new Map<string, string>();
  const member = (id: string) => ({ posUserId: id, name: nameOf.get(id) ?? id, level: null, title: null, isLeader: false, active: true, joinedOn: null });
  const overlay = (team: 'sale' | 'cskh') => overlayWebTeams(
    groupTeams(rows.results as TeamRow[], depts.results as DeptRow[], officeMap, team, mentorOf),
    saved.filter((t) => t.dept === team).map((t): HrTeamGroup => ({ id: t.id, name: t.name, parent: null, office: t.office, leader: null, head: null, mentor: null, members: t.memberIds.map(member).sort((a, b) => a.name.localeCompare(b.name, 'vi')) })),
  );
  const group = (team: 'sale' | 'cskh') => overlay(team).teams;
  if (params.get('list') === '1') {
    const depts: ('sale' | 'cskh')[] = asked === 'sale' || asked === 'cskh' ? [asked] : ['sale', 'cskh'];
    const teams: ListTeam[] = depts.flatMap((dept) => { const o = overlay(dept); return o.teams.filter((t) => t.id !== 'none').map((t) => listTeam(t.id, t.name, t.office, dept, t.mentor ?? null, t.members.map((m) => m.name), o.parent.get(t.id) ?? null)); });
    if (asked !== 'sale' && asked !== 'cskh') {
      const mkt = await mktTeams(env.DB);
      teams.push(...mkt.teams.map((t) => listTeam(t.id, t.name, t.office ?? null, 'mkt', t.mentor ?? null, t.memberNames ?? t.memberIds.map((id) => nameOf.get(id) ?? id))));
    }
    return Response.json({ teams }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  }
  const team = asked === 'cskh' ? 'cskh' : 'sale';
  return Response.json({ team, teams: group(team), linked: rows.results.length > 0 || saved.length > 0 }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}

type ListTeam = { id: string; name: string; office: string | null; dept: 'sale' | 'cskh' | 'mkt'; people: number; mentor: string | null; members: string[]; group: string | null };
/** Một dòng trong ô chọn team; members là tên thành viên để xổ ra xem (anh Vũ 22/10/2026). Một người có tài khoản ở nhiều POS chỉ tính một lần. */
/** group: thư mục mẹ ở ô Team (team web tổng nằm dưới team web nhân sự chứa họ). */
function listTeam(id: string, name: string, office: string | null, dept: ListTeam['dept'], mentor: string | null, memberNames: string[], group: string | null = null): ListTeam {
  const members = [...new Set(memberNames.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  return { id, name, office, dept, people: members.length, mentor, members, group };
}

async function staffNames() {
  const staff = await env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE user_id<>'' GROUP BY user_id").all<{ user_id: string; name: string }>();
  return new Map(staff.results.map((r) => [r.user_id, r.name || `NV ${r.user_id.slice(0, 8)}`]));
}
