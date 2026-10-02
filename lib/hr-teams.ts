// Team Sale / CSKH theo web nhân sự (bản sao hr_*): mỗi team là một đơn vị loại "team" bên web nhân sự, có Leader và Trưởng phòng.
// Dùng để đo lường và đặt KPI theo team (01/10/2026). Người chưa vào team nào gom vào "Chưa vào team".
import type { Team } from '@/lib/team';

export type TeamMember = { posUserId: string; name: string; level: string | null; title: string | null; isLeader: boolean; active: boolean; joinedOn: string | null };
export type HrTeamGroup = {
  /** Mã đơn vị bên web nhân sự; 'none' = chưa vào team. */
  id: string; name: string; parent: string | null; office: string | null; leader: string | null; head: string | null; members: TeamMember[];
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
export function groupTeams(rows: TeamRow[], depts: DeptRow[], offices: Map<string, string>, team: Exclude<Team, 'all'>): HrTeamGroup[] {
  const byId = new Map(depts.map((d) => [d.id, d]));
  const byName = new Map<string, DeptRow[]>();
  for (const d of depts) byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
  const deptOf = (r: TeamRow) => (r.department_id ? byId.get(r.department_id) : undefined) ?? (r.department && byName.get(r.department)?.length === 1 ? byName.get(r.department)![0] : undefined);
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
      members: g.rows.map((r) => ({ posUserId: r.pos_user_id, name: r.employee_name, level: r.level, title: r.title, isLeader: leaders.has(r.employee_id), active: r.status !== 'da_nghi', joinedOn: r.joined_on ?? null }))
        .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name, 'vi')),
    };
  });
  return out.sort((a, b) => Number(a.id === NO_TEAM) - Number(b.id === NO_TEAM) || (a.head ?? '').localeCompare(b.head ?? '', 'vi') || a.name.localeCompare(b.name, 'vi'));
}
