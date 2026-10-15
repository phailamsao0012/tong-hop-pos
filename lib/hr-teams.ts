// Team Sale / CSKH theo web nhân sự (bản sao hr_*): mỗi team là một đơn vị loại "team" bên web nhân sự, có Leader và Trưởng phòng.
// Dùng để đo lường và đặt KPI theo team (01/10/2026). Người chưa vào team nào gom vào "Chưa vào team".
import type { Team } from '@/lib/team';

export type TeamMember = { posUserId: string; name: string; level: string | null; title: string | null; isLeader: boolean; active: boolean; joinedOn: string | null };
export type HrTeamGroup = {
  /** Mã đơn vị bên web nhân sự; 'none' = chưa vào team. */
  id: string; name: string; parent: string | null; office: string | null; leader: string | null; head: string | null;
  /** Người cầm team (vai trò Mentor bên web nhân sự, có thể kiêm nhiệm), anh Vũ 06/10/2026. Thiếu thì để trống, không phải lỗi. */
  mentor?: string | null;
  members: TeamMember[];
};
export type TeamRow = {
  pos_user_id: string; employee_id: string; employee_name: string; team: string; department: string | null; department_id: string | null;
  level: string | null; title: string | null; leader_employee_id: string | null; leader_name: string | null; head_name: string | null; status: string; joined_on?: string | null;
};
export type DeptRow = { id: string; name: string; parent_id: string | null; kind: string | null; office_id: string | null };
export const NO_TEAM = 'none';

const mostCommon = (values: (string | null)[]) => {
  const n = new Map<string, number>();
  for (const v of values) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))[0]?.[0] ?? null;
};

/** Gom tài khoản POS của một bộ phận (sale / cskh) theo team bên web nhân sự. */
export function groupTeams(rows: TeamRow[], depts: DeptRow[], offices: Map<string, string>, team: Exclude<Team, 'all'>, mentors: Map<string, string> = new Map()): HrTeamGroup[] {
  const byId = new Map(depts.map((d) => [d.id, d]));
  // Một quy tắc duy nhất (10/10/2026, cùng bộ lọc team lib/team.ts unitSubquery): team của một người = department_id vai trò chính.
  // hr_pos_team luôn ghi department_id cùng lúc với tên phòng (lib/hr-copy.ts computePosTeams), nên không cần dò theo tên nữa.
  const deptOf = (r: TeamRow) => r.department_id ? byId.get(r.department_id) : undefined;
  const leaders = new Set(rows.map((r) => r.leader_employee_id).filter(Boolean));
  const groups = new Map<string, { dept: DeptRow | null; rows: TeamRow[] }>();
  for (const r of rows) {
    if (r.team !== team) continue;
    const d = deptOf(r);
    const key = d?.kind === 'team' ? d.id : NO_TEAM;
    const g = groups.get(key) ?? { dept: d?.kind === 'team' ? d : null, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const out = [...groups].map(([id, g]): HrTeamGroup => {
    const active = g.rows.filter((r) => r.status !== 'da_nghi');
    const parent = g.dept?.parent_id ? byId.get(g.dept.parent_id)?.name ?? null : null;
    return {
      id, name: g.dept?.name ?? 'Chưa vào team', parent, office: g.dept?.office_id ? offices.get(g.dept.office_id) ?? null : null,
      leader: id === NO_TEAM ? null : mostCommon(active.map((r) => r.leader_name)),
      head: id === NO_TEAM ? null : mostCommon(active.map((r) => r.head_name)),
      mentor: id === NO_TEAM ? null : mentors.get(id) ?? null,
      members: g.rows.map((r) => ({ posUserId: r.pos_user_id, name: r.employee_name, level: r.level, title: r.title, isLeader: leaders.has(r.employee_id), active: r.status !== 'da_nghi', joinedOn: r.joined_on ?? null }))
        .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name, 'vi')),
    };
  });
  return out.sort((a, b) => Number(a.id === NO_TEAM) - Number(b.id === NO_TEAM) || (a.head ?? '').localeCompare(b.head ?? '', 'vi') || a.name.localeCompare(b.name, 'vi'));
}

/** Mentor đang hiệu lực của từng team: vai trò cấp Mentor (mã lv_mt hoặc tên "Mentor") ở đơn vị kind=team, kể cả kiêm nhiệm (is_primary=0). */
export const MENTOR_SQL = `SELECT a.department_id AS team_id, e.full_name AS name FROM hr_assignments a JOIN hr_employees e ON e.id=a.employee_id
  JOIN hr_levels l ON l.id=a.level_id JOIN hr_departments d ON d.id=a.department_id
  WHERE (l.id='lv_mt' OR LOWER(l.name)='mentor') AND d.kind='team' AND e.status<>'da_nghi' AND (a.start_on IS NULL OR a.start_on<=?) AND (a.end_on IS NULL OR a.end_on>=?)
  ORDER BY a.department_id, a.is_primary DESC, a.start_on, e.full_name`;
export function mentorMap(rows: { team_id: string; name: string }[]) {
  const out = new Map<string, string>();
  for (const r of rows) {
    const cur = out.get(r.team_id);
    if (!cur) out.set(r.team_id, r.name);
    else if (!cur.split(', ').includes(r.name)) out.set(r.team_id, `${cur}, ${r.name}`);
  }
  return out;
}
