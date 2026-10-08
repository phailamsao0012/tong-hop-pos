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
  // Kể cả người tên có hậu tố SALE mà bộ phận Pancake là "Quản trị viên" (vd trưởng phòng "… - TP SALE").
  sale: "(department LIKE '%sale%' OR department LIKE '%bán hàng%' OR department LIKE '%BÁN HÀNG%' OR name LIKE '%sale%')",
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
 * Người còn làm (02/10/2026, anh Vũ): chỉ ẩn người mà web nhân sự ghi đã nghỉ — thôi đo, ẩn khỏi mọi bảng Sale / CSKH.
 * Tài khoản chưa gắn hồ sơ (vd nhân sự Thái Nguyên chưa nhập) vẫn giữ nguyên. Điều kiện trên một dòng pos_users.
 */
export const WORKING = "user_id NOT IN (SELECT pos_user_id FROM hr_pos_team WHERE status='da_nghi')";
/** Mã người đã nghỉ theo web nhân sự, để bỏ khỏi bảng xếp hạng theo người. */
export const LEFT_STAFF_SQL = "SELECT pos_user_id AS user_id FROM hr_pos_team WHERE status='da_nghi'";
/**
 * Người được tính doanh số (anh Vũ 08/10/2026, mọi POS): tên trên Pancake có hậu tố MKT / CSKH / SALE (kể cả "TP SALE"), riêng anh Hoàng Xuân Nghĩa
 * có nhiều tên vẫn tính. Người không có hậu tố (trực page, kho, vận đơn, quản trị…) không lấy doanh thu, để số không loạn.
 * Ai sót hậu tố thì sửa tên trên Pancake, hoặc chủ hệ thống bật "Vẫn tính" (app_settings COUNTED_STAFF_KEY, mảng mã người dùng).
 * LIKE của SQLite không phân biệt hoa thường với chữ không dấu, nên '%sale%' khớp cả "Sale", "SALE".
 */
export const COUNTED_STAFF_KEY = 'counted_staff_extra';
export const COUNTED_NAME = "(name LIKE '%sale%' OR name LIKE '%cskh%' OR name LIKE '%mkt%' OR name LIKE '%Xuân Nghĩa%' OR name LIKE '%XUÂN NGHĨA%')";
const COUNTED_EXTRA = `user_id IN (SELECT value FROM json_each((SELECT CASE WHEN json_valid(value) THEN value ELSE '[]' END FROM app_settings WHERE key='${COUNTED_STAFF_KEY}')))`;
/** Điều kiện trên một dòng pos_users: người này được tính doanh số. */
export const COUNTED = `(${COUNTED_NAME} OR ${COUNTED_EXTRA})`;
export const COUNTED_STAFF = `(SELECT DISTINCT user_id FROM pos_users WHERE ${COUNTED})`;
/** ` AND <cột người> được tính` (đơn chưa có người giữ nguyên, vì không thuộc ai). Dùng cho số doanh thu khi xem tất cả. */
export const countedFilter = (column: string) => ` AND (NULLIF(${column},'') IS NULL OR ${column} IN ${COUNTED_STAFF})`;
/** Biểu thức 1/0: người trên cột này được tính doanh số (chưa có người = 1). */
export const countedCase = (column: string) => `CASE WHEN NULLIF(${column},'') IS NULL OR ${column} IN ${COUNTED_STAFF} THEN 1 ELSE 0 END`;

/** `counted` = chỉ người được tính doanh số (mặc định); việc vận hành như chia số khách thì truyền false để giữ đủ người. */
export const teamSubquery = (team: Team, counted = true) => team === 'all' ? null
  : hrTeams
    ? `(SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING}${counted ? ` AND ${COUNTED}` : ''} AND CASE WHEN user_id IN (SELECT pos_user_id FROM hr_pos_team) THEN user_id IN (SELECT pos_user_id FROM hr_pos_team WHERE team='${team}') ELSE ${CONDITIONS[team]} END)`
    : `(SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING}${counted ? ` AND ${COUNTED}` : ''} AND ${CONDITIONS[team]})`;
/** Biểu thức SQL team Pancake của một dòng pos_users ('sale' / 'cskh' / NULL), dùng khi đối chiếu với web nhân sự. */
export const pancakeTeamCase = `CASE WHEN ${CONDITIONS.sale} THEN 'sale' WHEN ${CONDITIONS.cskh} THEN 'cskh' END`;
/** ` AND <column> IN (…)` hoặc chuỗi rỗng khi xem tất cả. */
export const teamFilter = (column: string, team: Team, counted = true) => { const q = teamSubquery(team, counted); return q ? ` AND ${column} IN ${q}` : ''; };
