import { MARKETING_TEAMS_KEY, parseMarketingTeams, type MarketingTeam } from './marketing-teams';
import { groupTeams, MENTOR_SQL, mentorMap, type DeptRow, type TeamRow } from './hr-teams';
import { primaryAssignment, teamFor, type HrAssignment, type HrDepartment } from './hr-copy';
import { todayVn } from './report-time';

export type HrStaff = { employees: { id: string; full_name: string; status: string }[]; assignments: HrAssignment[]; day: string };

/**
 * Team MKT theo web nhân sự. Số liệu lọc theo tài khoản POS đã gắn hồ sơ (hr_pos_team); danh sách team và tên thành viên lấy theo vai trò chính
 * bên web nhân sự, nên team có người chưa gắn POS vẫn hiện trong ô Team (anh Vũ 22/10/2026: "team của a Quỳnh và team Đắc Đạt đâu").
 */
export function selectMktTeams(source: string | undefined, saved: string | undefined, rows: TeamRow[], depts: DeptRow[], offices: Map<string, string>, mentors = new Map<string, string>(), staff?: HrStaff) {
  const linked = groupTeams(rows.filter((r) => r.status !== 'da_nghi' && !!r.pos_user_id.trim()), depts, offices, 'mkt', mentors)
    .filter((t) => t.id !== 'none' && t.members.length);
  const teams = new Map(linked.map((t): [string, MarketingTeam] => [t.id, { id: `hr:${t.id}`, name: t.name, office: t.office, mentor: t.mentor ?? null, memberIds: [...new Set(t.members.map((m) => m.posUserId))], memberNames: [...new Set(t.members.map((m) => m.name))] }]));
  if (staff) {
    const byId = new Map(depts.map((d) => [d.id, d]));
    const deptMap = new Map(depts.map((d): [string, HrDepartment] => [d.id, { ...d, kind: d.kind ?? '', director_employee_id: null, active: 1 }]));
    const byEmp = new Map<string, HrAssignment[]>();
    for (const a of staff.assignments) byEmp.set(a.employee_id, [...(byEmp.get(a.employee_id) ?? []), a]);
    for (const e of staff.employees) {
      if (e.status === 'da_nghi') continue;
      const deptId = primaryAssignment(byEmp.get(e.id) ?? [], staff.day)?.department_id ?? null;
      const d = deptId ? byId.get(deptId) : undefined;
      if (!d || d.kind !== 'team' || teamFor(d.id, null, deptMap) !== 'mkt') continue;
      const t = teams.get(d.id) ?? { id: `hr:${d.id}`, name: d.name, office: d.office_id ? offices.get(d.office_id) ?? null : null, mentor: mentors.get(d.id) ?? null, memberIds: [], memberNames: [] };
      if (!t.memberNames!.includes(e.full_name)) t.memberNames!.push(e.full_name);
      teams.set(d.id, t);
    }
  }
  const list = [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return source === 'hr' && list.length ? { source: 'hr' as const, teams: list } : { source: 'local' as const, teams: parseMarketingTeams(saved).map((t) => ({ ...t, office: null, mentor: null })) };
}

export async function mktTeams(db: D1Database) {
  const day = todayVn();
  const [settings, rows, depts, offices, mentors, employees, assignments] = await db.batch([
    db.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind('team_source', MARKETING_TEAMS_KEY),
    db.prepare("SELECT * FROM hr_pos_team WHERE status<>'da_nghi'"),
    db.prepare('SELECT id,name,parent_id,kind,office_id FROM hr_departments WHERE active=1'),
    db.prepare('SELECT id,name FROM hr_offices'),
    db.prepare(MENTOR_SQL).bind(day, day),
    db.prepare("SELECT id,full_name,status FROM hr_employees WHERE status<>'da_nghi'"),
    db.prepare('SELECT id,employee_id,department_id,level_id,title_id,manager_employee_id,is_primary,start_on,end_on FROM hr_assignments'),
  ]);
  const values = new Map((settings.results as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return selectMktTeams(values.get('team_source'), values.get(MARKETING_TEAMS_KEY), rows.results as TeamRow[], depts.results as DeptRow[], new Map((offices.results as { id: string; name: string }[]).map((o) => [o.id, o.name])), mentorMap(mentors.results as { team_id: string; name: string }[]),
    { employees: employees.results as HrStaff['employees'], assignments: assignments.results as HrAssignment[], day });
}
