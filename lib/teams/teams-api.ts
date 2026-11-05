// Tách khỏi app/api/teams/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { MENTOR_SQL } from '@/lib/teams/hr-teams';
import { WEB_TEAMS_KEY } from '@/lib/teams/web-teams';

/** Team Sale / CSKH theo web nhân sự: người, đơn vị, chi nhánh, Mentor trong ngày `day`, và cài đặt nguồn team / team web tổng. */
export const teamSources = (day: string) => env.DB.batch([
  env.DB.prepare(`SELECT t.pos_user_id,t.employee_id,t.employee_name,t.team,t.department,t.department_id,t.level,t.title,t.leader_employee_id,t.leader_name,t.head_name,t.status,e.joined_on
      FROM hr_pos_team t LEFT JOIN hr_employees e ON e.id=t.employee_id WHERE t.status<>'da_nghi'`),
  env.DB.prepare('SELECT id,name,parent_id,kind,office_id FROM hr_departments WHERE active=1'),
  env.DB.prepare('SELECT id,name FROM hr_offices'),
  env.DB.prepare(MENTOR_SQL).bind(day, day),
  env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind('team_source', WEB_TEAMS_KEY),
]);

export async function staffNames() {
  const staff = await env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE user_id<>'' GROUP BY user_id").all<{ user_id: string; name: string }>();
  return new Map(staff.results.map((r) => [r.user_id, r.name || `NV ${r.user_id.slice(0, 8)}`]));
}
