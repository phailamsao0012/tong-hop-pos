import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { groupTeams, type DeptRow, type TeamRow } from '@/lib/hr-teams';

// Team Sale / CSKH theo web nhân sự: ?team=sale|cskh → các team, Leader, Trưởng phòng và tài khoản POS của từng người.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const team = new URL(request.url).searchParams.get('team') === 'cskh' ? 'cskh' : 'sale';
  const [rows, depts, offices] = await env.DB.batch([
    env.DB.prepare('SELECT pos_user_id,employee_id,employee_name,team,department,department_id,level,title,leader_employee_id,leader_name,head_name,status FROM hr_pos_team'),
    env.DB.prepare('SELECT id,name,parent_id,kind,office_id FROM hr_departments WHERE active=1'),
    env.DB.prepare('SELECT id,name FROM hr_offices'),
  ]);
  const teams = groupTeams(rows.results as TeamRow[], depts.results as DeptRow[], new Map((offices.results as { id: string; name: string }[]).map((o) => [o.id, o.name])), team);
  return Response.json({ team, teams, linked: rows.results.length > 0 }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
