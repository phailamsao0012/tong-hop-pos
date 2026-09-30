// Bản sao dữ liệu web nhân sự trong web chính (hàm thuần, kiểm thử được): từ ảnh chụp /api/v1/snapshot của web nhân sự
// tính team, Leader, Trưởng phòng cho từng tài khoản POS. Web nhân sự là nguồn gốc; bảng hr_* chỉ để đọc.
import { teamOf } from './team';

export type HrEmployee = { id: string; code: string; full_name: string; email: string | null; phone: string | null; office_id: string | null; joined_on: string | null; status: string; left_on: string | null; main_user_id: string | null };
export type HrDepartment = { id: string; name: string; parent_id: string | null; kind: string; office_id: string | null; director_employee_id: string | null; active: number };
export type HrLevel = { id: string; name: string; rank: number; is_manager: number };
export type HrTitle = { id: string; name: string };
export type HrAssignment = { id: string; employee_id: string; department_id: string | null; level_id: string | null; title_id: string | null; manager_employee_id: string | null; is_primary: number; start_on: string | null; end_on: string | null };
export type HrSnapshot = {
  offices: { id: string; name: string }[]; departments: HrDepartment[]; levels: HrLevel[]; titles: HrTitle[];
  employees: HrEmployee[]; assignments: HrAssignment[]; posAccounts: { pos_user_id: string; employee_id: string }[]; at?: string;
};
/** Nhóm của một người theo web nhân sự: sale/cskh như báo cáo cũ, thêm mkt và other (không thuộc Sale/CSKH). */
export type HrTeam = 'sale' | 'cskh' | 'mkt' | 'other';
export type HrPosTeam = {
  pos_user_id: string; employee_id: string; employee_name: string; team: HrTeam; department: string | null; level: string | null; title: string | null;
  leader_employee_id: string | null; leader_name: string | null; head_name: string | null; manager_pos_user_id: string | null; status: string;
};

export function isSnapshot(v: unknown): v is HrSnapshot {
  const s = v as Record<string, unknown> | null;
  return !!s && ['offices', 'departments', 'levels', 'titles', 'employees', 'assignments', 'posAccounts'].every((k) => Array.isArray(s[k]));
}

const active = (a: HrAssignment, day: string) => (!a.start_on || a.start_on <= day) && (!a.end_on || a.end_on >= day);

/**
 * Vai trò chính của một người tại ngày `day`: dòng is_primary đang hiệu lực; không có (đã nghỉ) thì vai trò chính gần nhất,
 * để doanh số cũ của người đã nghỉ vẫn nằm đúng team. Người kiêm nhiệm tính theo vai trò chính (đã chốt 30/09/2026).
 */
export function primaryAssignment(list: HrAssignment[], day: string): HrAssignment | null {
  const sorted = [...list].sort((a, b) => (b.start_on ?? '').localeCompare(a.start_on ?? ''));
  return sorted.find((a) => a.is_primary && active(a, day)) ?? sorted.find((a) => active(a, day))
    ?? sorted.find((a) => a.is_primary) ?? sorted[0] ?? null;
}

/** Team theo phòng ban (đi từ phòng lên phòng cha), rồi tới chức danh: cùng quy tắc tên với team Pancake. */
export function teamFor(deptId: string | null, titleName: string | null, depts: Map<string, HrDepartment>): HrTeam {
  const seen = new Set<string>();
  const names: string[] = [];
  for (let d = deptId ? depts.get(deptId) : undefined; d && !seen.has(d.id); d = d.parent_id ? depts.get(d.parent_id) : undefined) { seen.add(d.id); names.push(d.name); }
  for (const n of [...names, titleName ?? '']) { const t = teamOf(n); if (t) return t; }
  return [...names, titleName ?? ''].some((n) => /mkt|marketing/i.test(n)) ? 'mkt' : 'other';
}

const isHead = (level: HrLevel | undefined) => !!level && /trưởng phòng/i.test(level.name);

export function computePosTeams(s: HrSnapshot, day: string): HrPosTeam[] {
  const depts = new Map(s.departments.map((d) => [d.id, d]));
  const levels = new Map(s.levels.map((l) => [l.id, l]));
  const titles = new Map(s.titles.map((t) => [t.id, t.name]));
  const emps = new Map(s.employees.map((e) => [e.id, e]));
  const byEmp = new Map<string, HrAssignment[]>();
  for (const a of s.assignments) { const l = byEmp.get(a.employee_id) ?? []; l.push(a); byEmp.set(a.employee_id, l); }
  const primary = new Map([...byEmp].map(([id, l]) => [id, primaryAssignment(l, day)]));
  const posOf = new Map<string, string>();
  for (const p of [...s.posAccounts].sort((a, b) => a.pos_user_id.localeCompare(b.pos_user_id))) if (!posOf.has(p.employee_id)) posOf.set(p.employee_id, p.pos_user_id);
  // Trưởng phòng: đi ngược chuỗi quản lý trực tiếp (Leader → cấp trên…) tới người đầu tiên có cấp bậc Trưởng phòng.
  const headOf = (empId: string) => {
    const seen = new Set<string>([empId]);
    for (let m = primary.get(empId)?.manager_employee_id ?? null; m && !seen.has(m); m = primary.get(m)?.manager_employee_id ?? null) {
      seen.add(m);
      const lv = primary.get(m)?.level_id;
      if (isHead(lv ? levels.get(lv) : undefined)) return emps.get(m)?.full_name ?? null;
    }
    return null;
  };
  const out: HrPosTeam[] = [];
  for (const p of s.posAccounts) {
    const e = emps.get(p.employee_id);
    if (!e) continue;
    const a = primary.get(e.id) ?? null;
    const title = a?.title_id ? titles.get(a.title_id) ?? null : null;
    const leader = a?.manager_employee_id ?? null;
    out.push({
      pos_user_id: p.pos_user_id, employee_id: e.id, employee_name: e.full_name, team: teamFor(a?.department_id ?? null, title, depts),
      department: a?.department_id ? depts.get(a.department_id)?.name ?? null : null, level: a?.level_id ? levels.get(a.level_id)?.name ?? null : null, title,
      leader_employee_id: leader, leader_name: leader ? emps.get(leader)?.full_name ?? null : null,
      head_name: a?.level_id && isHead(levels.get(a.level_id)) ? null : headOf(e.id),
      manager_pos_user_id: leader ? posOf.get(leader) ?? null : null, status: e.status,
    });
  }
  return out;
}

/** Chuẩn hóa để băm: bỏ thời điểm chụp, thứ tự khóa cố định theo JSON gốc (web nhân sự luôn ORDER BY). */
export const snapshotKey = (s: HrSnapshot) => JSON.stringify({ ...s, at: undefined });

export type TeamCompare = { team: 'sale' | 'cskh'; pancakePeople: number; hrPeople: number; pancakeRevenue: number; hrRevenue: number };
/**
 * Đối chiếu team Pancake (cách cũ) với team theo web nhân sự: số người và doanh thu tháng này của từng team.
 * Người chưa gắn hồ sơ nhân sự giữ team Pancake (giống cách báo cáo chạy khi bật nguồn nhân sự).
 */
export function compareTeams(sellers: { id: string; name: string; pancake: 'sale' | 'cskh' | null; revenue: number }[], hr: Map<string, HrTeam>) {
  const rows: TeamCompare[] = (['sale', 'cskh'] as const).map((team) => ({ team, pancakePeople: 0, hrPeople: 0, pancakeRevenue: 0, hrRevenue: 0 }));
  const mismatches: { id: string; name: string; pancake: string | null; hr: HrTeam; revenue: number }[] = [];
  for (const s of sellers) {
    const h = hr.get(s.id);
    const next = h ? (h === 'sale' || h === 'cskh' ? h : null) : s.pancake;
    for (const r of rows) {
      if (s.pancake === r.team) { r.pancakePeople++; r.pancakeRevenue += s.revenue; }
      if (next === r.team) { r.hrPeople++; r.hrRevenue += s.revenue; }
    }
    if (h && next !== s.pancake) mismatches.push({ id: s.id, name: s.name, pancake: s.pancake, hr: h, revenue: s.revenue });
  }
  mismatches.sort((a, b) => b.revenue - a.revenue);
  return { rows, mismatches, matched: mismatches.length === 0 };
}
