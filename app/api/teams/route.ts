import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { MENTOR_SQL, groupTeams, mentorMap, type DeptRow, type TeamRow } from '@/lib/hr-teams';
import { todayVn } from '@/lib/report-time';

// Team Sale / CSKH theo web nhân sự: ?team=sale|cskh → các team, Leader, Mentor, Trưởng phòng và tài khoản POS của từng người (người đã nghỉ không tính).
// ?list=1: chỉ danh sách team của cả Sale và CSKH (mã, tên, chi nhánh, bộ phận, số người) cho ô chọn team trên thanh lọc; tài khoản bị giới hạn
// một bộ phận chỉ nhận team của bộ phận đó (scopeApi đã ghi ?team=).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const params = new URL(request.url).searchParams;
  const asked = params.get('team');
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
    const teams = depts.flatMap((dept) => group(dept).filter((t) => t.id !== 'none').map((t) => ({ id: t.id, name: t.name, office: t.office, dept, people: t.members.length, mentor: t.mentor ?? null })));
    return Response.json({ teams }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  }
  const team = asked === 'cskh' ? 'cskh' : 'sale';
  return Response.json({ team, teams: group(team), linked: rows.results.length > 0 }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
