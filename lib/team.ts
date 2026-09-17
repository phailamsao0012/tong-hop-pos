// Nhóm nhân sự (Sale / CSKH) theo bộ phận trên Pancake. Lọc bằng truy vấn con để không tốn tham số bind.
export type Team = 'all' | 'sale' | 'cskh';
export const parseTeam = (v: string | null | undefined): Team => v === 'sale' || v === 'cskh' ? v : 'all';
export const TEAM_LABELS: Record<Team, string> = { all: 'Tất cả', sale: 'Sale', cskh: 'CSKH' };
const CONDITIONS: Record<Exclude<Team, 'all'>, string> = {
  sale: "(department LIKE '%sale%' OR department LIKE '%bán hàng%' OR department LIKE '%BÁN HÀNG%')",
  cskh: "(department LIKE '%cskh%' OR department LIKE '%chăm sóc%' OR department LIKE '%CHĂM SÓC%')",
};
export const teamSubquery = (team: Team) => team === 'all' ? null : `(SELECT DISTINCT user_id FROM pos_users WHERE ${CONDITIONS[team]})`;
/** ` AND <column> IN (…)` hoặc chuỗi rỗng khi xem tất cả. */
export const teamFilter = (column: string, team: Team) => { const q = teamSubquery(team); return q ? ` AND ${column} IN ${q}` : ''; };
