/** Chi nhánh theo team chính; chỉ người không ở team mới dùng văn phòng hồ sơ. */
export const BRANCH_RE = /^[A-Za-z0-9_-]{1,80}$/;
export type Branch = { id: string; name: string };

export function branchSubquery(officeId: string): string {
  if (!BRANCH_RE.test(officeId)) throw new Error('Mã chi nhánh không hợp lệ.');
  return `(SELECT DISTINCT t.pos_user_id FROM hr_pos_team t
    LEFT JOIN hr_departments d ON d.id=t.department_id AND d.kind='team'
    LEFT JOIN hr_employees e ON e.id=t.employee_id
    WHERE CASE WHEN d.id IS NOT NULL THEN d.office_id ELSE e.office_id END='${officeId}')`;
}

export function branchFilter(column: string, officeId: string | null): string {
  return officeId ? ` AND ${column} IN ${branchSubquery(officeId)}` : '';
}
