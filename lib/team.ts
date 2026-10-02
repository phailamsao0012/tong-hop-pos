// Nhóm nhân sự (Sale / CSKH) theo bộ phận trên Pancake. Lọc bằng truy vấn con để không tốn tham số bind.
export type Team = 'all' | 'sale' | 'cskh';
export const parseTeam = (v: string | null | undefined): Team => v === 'sale' || v === 'cskh' ? v : 'all';
export const TEAM_LABELS: Record<Team, string> = { all: 'Tất cả', sale: 'Sale', cskh: 'CSKH' };
/** Nhãn cho bot/tiêu đề: "Sale + CSKH" khi xem cả hai. */
export const teamTitle = (team: Team) => team === 'all' ? 'Sale + CSKH' : TEAM_LABELS[team];
/** Tên bộ phận (Pancake) thuộc nhóm nào — cùng quy tắc với CONDITIONS bên dưới, dùng khi đã có dữ liệu trong bộ nhớ. */
export const teamOf = (department: string | null | undefined): Exclude<Team, 'all'> | null => {
  const d = (department ?? '').toLowerCase();
  if (d.includes('sale') || d.includes('bán hàng')) return 'sale';
  if (d.includes('cskh') || d.includes('chăm sóc')) return 'cskh';
  return null;
};
const CONDITIONS: Record<Exclude<Team, 'all'>, string> = {
  sale: "(department LIKE '%sale%' OR department LIKE '%bán hàng%' OR department LIKE '%BÁN HÀNG%')",
  // Kể cả trưởng phòng CSKH (bộ phận Pancake là "Quản trị viên" nhưng tên có "CSKH").
  cskh: "(department LIKE '%cskh%' OR department LIKE '%chăm sóc%' OR department LIKE '%CHĂM SÓC%' OR name LIKE '%CSKH%')",
};
/**
 * Nguồn team: 'pancake' (bộ phận trên Pancake, cách cũ) hoặc 'hr' (bảng hr_pos_team kéo từ web nhân sự). Worker đọc cài đặt
 * team_source rồi đặt cờ này cho isolate (xem lib/team-source.ts); tài khoản POS chưa gắn hồ sơ nhân sự vẫn theo Pancake.
 */
let hrTeams = false;
export const setHrTeams = (on: boolean) => { hrTeams = on; };
export const usingHrTeams = () => hrTeams;
/**
 * Người còn làm (02/10/2026, anh Vũ): tài khoản POS gắn hồ sơ bên web nhân sự thì theo trạng thái hồ sơ — đã nghỉ là thôi đo, ẩn khỏi
 * mọi bảng Sale / CSKH; tài khoản chưa gắn hồ sơ (vd người mới chưa nhập sang web nhân sự) thì còn bật trên POS mới tính.
 * Điều kiện trên một dòng pos_users.
 */
export const WORKING = "(user_id NOT IN (SELECT pos_user_id FROM hr_pos_team WHERE status='da_nghi') AND (is_active=1 OR user_id IN (SELECT pos_user_id FROM hr_pos_team)))";
/** Mã người đã nghỉ (không còn làm theo điều kiện trên), để bỏ khỏi bảng xếp hạng theo người. */
export const LEFT_STAFF_SQL = `SELECT DISTINCT user_id FROM pos_users WHERE user_id NOT IN (SELECT user_id FROM pos_users WHERE ${WORKING})`;
export const teamSubquery = (team: Team) => team === 'all' ? null
  : hrTeams
    ? `(SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING} AND CASE WHEN user_id IN (SELECT pos_user_id FROM hr_pos_team) THEN user_id IN (SELECT pos_user_id FROM hr_pos_team WHERE team='${team}') ELSE ${CONDITIONS[team]} END)`
    : `(SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING} AND ${CONDITIONS[team]})`;
/** Biểu thức SQL team Pancake của một dòng pos_users ('sale' / 'cskh' / NULL), dùng khi đối chiếu với web nhân sự. */
export const pancakeTeamCase = `CASE WHEN ${CONDITIONS.sale} THEN 'sale' WHEN ${CONDITIONS.cskh} THEN 'cskh' END`;
/** ` AND <column> IN (…)` hoặc chuỗi rỗng khi xem tất cả. */
export const teamFilter = (column: string, team: Team) => { const q = teamSubquery(team); return q ? ` AND ${column} IN ${q}` : ''; };
