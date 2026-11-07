// Nhóm nhân sự (Sale / CSKH) theo bộ phận trên Pancake. Lọc bằng truy vấn con để không tốn tham số bind.
import { branchFilter, branchSubquery } from '@/lib/teams/branch';
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
/**
 * Hậu tố bộ phận ở CUỐI tên Pancake (anh Vũ 06/11/2026: chỉ tính đúng hậu tố, mỗi người một bộ phận), thay cách cũ "tên chứa chữ"
 * (tên "Rosalee" từng bị tính là Sale). Bỏ phần trong ngoặc, coi '-', '_' là khoảng trắng; cho phép chi nhánh HN / TN sau hậu tố
 * ("Lan SALE HN"). LIKE của SQLite không phân biệt hoa thường với chữ không dấu.
 * Viết gọn (một truy vấn con với danh sách mẫu JSON) vì đoạn này lặp lại nhiều lần trong một câu: bản đầu viết OR từng mẫu làm câu
 * vượt giới hạn độ dài của D1 (SQLITE_TOOBIG, lỗi 500 trang Marketing 06/11/2026).
 */
const NAME_WORDS = "(' '||REPLACE(REPLACE(REPLACE(REPLACE(TRIM(substr(name,1,instr(name||'(','(')-1)),'-',' '),'_',' '),'  ',' '),'  ',' ')||' ')";
const SUFFIXES: Record<string, string[]> = { sale: ['sale', 'sales'], cskh: ['cskh'], mkt: ['mkt'] };
const suffixJson = (depts: string[]) => JSON.stringify(Object.fromEntries(depts.map((d) => [d, SUFFIXES[d].flatMap((w) => [`% ${w} `, `% ${w} _n `])])));
/** Bộ phận theo hậu tố cuối tên ('sale' | 'cskh' | 'mkt'), NULL khi không có. */
export const nameSuffixDept = (depts = ['sale', 'cskh', 'mkt']) => `(SELECT d.key FROM json_each('${suffixJson(depts)}') d, json_each(d.value) p WHERE ${NAME_WORDS} LIKE p.value LIMIT 1)`;
/** Tên có hậu tố cuối thuộc một trong các từ (sale, sales, cskh, mkt). */
export const nameSuffix = (...words: string[]) => `(${nameSuffixDept([...new Set(words.map((w) => (w === 'sales' ? 'sale' : w)))])} IS NOT NULL)`;
const DEPT_OF = `COALESCE(${nameSuffixDept()},CASE WHEN department LIKE '%sale%' OR department LIKE '%bán hàng%' OR department LIKE '%BÁN HÀNG%' THEN 'sale' WHEN department LIKE '%cskh%' OR department LIKE '%chăm sóc%' OR department LIKE '%CHĂM SÓC%' THEN 'cskh' END)`;
const CONDITIONS: Record<Exclude<Team, 'all'>, string> = {
  // Hậu tố tên quyết trước (kể cả trưởng phòng "… - TP SALE" có bộ phận Pancake "Quản trị viên"); tên không có hậu tố thì theo bộ phận Pancake.
  sale: `(${DEPT_OF}='sale')`,
  cskh: `(${DEPT_OF}='cskh')`,
};
/**
 * Nguồn team: 'pancake' (bộ phận trên Pancake, cách cũ) hoặc 'hr' (bảng hr_pos_team kéo từ web nhân sự). Worker đọc cài đặt
 * team_source rồi đặt cờ này cho isolate (xem lib/team-source.ts); tài khoản POS chưa gắn hồ sơ nhân sự vẫn theo Pancake.
 */
let hrTeams = false;
export const setHrTeams = (on: boolean) => { hrTeams = on; };
export const usingHrTeams = () => hrTeams;
/**
 * Trang một bộ phận mà thanh trên chọn bộ phận kia (anh Vũ 21/10/2026: "phần sale mà tích vào cskh thì mọi doanh thu phải về 0", "0 phải chuẩn
 * dựa trên tính toán, không phải ép về 0"): người được tính = người thuộc bộ phận của trang VÀ thuộc bộ phận đang chọn. Không ai thuộc cả hai
 * thì số tự ra 0. Cờ theo từng request, worker đặt qua lib/seg-lens.ts (file này dùng cả ở trình duyệt nên không import node:).
 */
let lensNow = (): Exclude<Team, 'all'> | null => null;
export const setLensCheck = (check: () => Exclude<Team, 'all'> | null) => { lensNow = check; };
/**
 * Phạm vi Mentor / Leader (anh Vũ 31/10/2026): mã team web tổng mà tài khoản phụ trách, theo từng request (worker đặt qua lib/seg-lens.ts từ
 * tham số wscope do lib/access.ts scopeApi ghi). Mọi lọc nhóm/team trong request đó chỉ giữ người thuộc các team này; mảng rỗng = không ai.
 */
let scopeNow = (): string[] | null => null;
export const setScopeCheck = (check: () => string[] | null) => { scopeNow = check; };
const scopeSet = (ids: string[]) => ids.length ? webTeamMembers(ids) : '(SELECT NULL WHERE 0)';
/** Thu hẹp một truy vấn con người dùng (hoặc "tất cả" = null) theo phạm vi Mentor / Leader đang áp. */
const inScope = (q: string | null) => {
  const ids = scopeNow();
  if (!ids) return q;
  return q ? `(SELECT user_id FROM ${q} AS s WHERE user_id IN ${scopeSet(ids)})` : `(SELECT DISTINCT user_id FROM pos_users WHERE user_id IN ${scopeSet(ids)})`;
};
const both = (own: string, other: string) => `(SELECT user_id FROM ${own} AS l WHERE user_id IN ${other})`;
/**
 * Người còn làm (02/10/2026, anh Vũ): chỉ ẩn người mà web nhân sự ghi đã nghỉ — thôi đo, ẩn khỏi mọi bảng Sale / CSKH.
 * Tài khoản chưa gắn hồ sơ (vd nhân sự Thái Nguyên chưa nhập) vẫn giữ nguyên. Điều kiện trên một dòng pos_users.
 */
export const WORKING = "user_id NOT IN (SELECT pos_user_id FROM hr_pos_team WHERE status='da_nghi')";
/** Mã người đã nghỉ theo web nhân sự, để bỏ khỏi bảng xếp hạng theo người. */
export const LEFT_STAFF_SQL = "SELECT pos_user_id AS user_id FROM hr_pos_team WHERE status='da_nghi'";
/** Một dòng pos_users còn trên POS: chưa bị khoá; người Pancake không trả nữa được syncUsers khoá (is_active=0). Bảng p = pos_users, s = pos_shops (giữ cho câu gọi cũ). */
export const PRESENT_ON_POS = "p.is_active=1";
/**
 * Người đã bị xoá (hoặc khoá) khỏi mọi POS (anh Vũ 02/11/2026: "những người đã xóa khỏi pos thì loại danh sách doanh số với KPI, còn dữ liệu vẫn để thế").
 * Chỉ dùng để bỏ khỏi bảng theo người và danh sách KPI; đơn, tổng cửa hàng, tổng bộ phận giữ nguyên.
 */
export const REMOVED_STAFF_SQL = `SELECT p.user_id FROM pos_users p LEFT JOIN pos_shops s ON s.id=p.pos_id GROUP BY p.user_id HAVING SUM(CASE WHEN ${PRESENT_ON_POS} THEN 1 ELSE 0 END)=0`;
/** Người không hiện ở bảng theo người: đã nghỉ theo web nhân sự, hoặc đã bị xoá khỏi mọi POS. */
export const HIDDEN_STAFF_SQL = `${LEFT_STAFF_SQL} UNION ${REMOVED_STAFF_SQL}`;
/**
 * Người được tính doanh số (anh Vũ 08/10/2026, mọi POS): tên trên Pancake có hậu tố MKT / CSKH / SALE (kể cả "TP SALE"), riêng anh Hoàng Xuân Nghĩa
 * có nhiều tên vẫn tính. Người không có hậu tố (trực page, kho, vận đơn, quản trị…) không lấy doanh thu, để số không loạn.
 * Ai sót hậu tố thì sửa tên trên Pancake, hoặc chủ hệ thống bật "Vẫn tính" (app_settings COUNTED_STAFF_KEY, mảng mã người dùng).
 * LIKE của SQLite không phân biệt hoa thường với chữ không dấu, nên '%sale%' khớp cả "Sale", "SALE".
 */
export const COUNTED_STAFF_KEY = 'counted_staff_extra';
// Tên Xuân Nghĩa ghi cả dạng dựng sẵn (NFC) lẫn dạng tách dấu (NFD) để không lệch theo cách Pancake lưu.
export const COUNTED_NAME = `(${nameSuffix('sale', 'sales', 'cskh', 'mkt')} OR name LIKE '%Xuân Nghĩa%' OR name LIKE '%XUÂN NGHĨA%' OR name LIKE '%${'Xuân Nghĩa'.normalize('NFD')}%')`;
const COUNTED_EXTRA = `user_id IN (SELECT value FROM json_each((SELECT CASE WHEN json_valid(value) THEN value ELSE '[]' END FROM app_settings WHERE key='${COUNTED_STAFF_KEY}')))`;
// Người đã xếp vào một team ở Cài đặt → Chia team (Sale/CSKH lẫn MKT) luôn được tính, kể cả lead, mentor có tên không mang hậu tố
// (anh Vũ 03/11/2026: "anh đắc đạt làm lead thì mặc định ... vẫn tính doanh thu, vẫn tính mọi thứ phát sinh từ tài khoản pos").
const COUNTED_IN_TEAM = `user_id IN (SELECT m.value FROM app_settings s, json_each(s.value) t, json_each(t.value, '$.memberIds') m WHERE s.key IN ('web_teams_v1','marketing_teams_v1') AND json_valid(s.value))`;
/** Điều kiện trên một dòng pos_users: người này được tính doanh số. */
export const COUNTED = `(${COUNTED_NAME} OR ${COUNTED_EXTRA} OR ${COUNTED_IN_TEAM})`;
export const COUNTED_STAFF = `(SELECT DISTINCT user_id FROM pos_users WHERE ${COUNTED})`;
/** ` AND <cột người> được tính` (đơn chưa có người giữ nguyên, vì không thuộc ai). Dùng cho số doanh thu khi xem tất cả. */
export const countedFilter = (column: string) => ` AND (NULLIF(${column},'') IS NULL OR ${column} IN ${COUNTED_STAFF})`;
/** Biểu thức 1/0: người trên cột này được tính doanh số (chưa có người = 1). */
export const countedCase = (column: string) => `CASE WHEN NULLIF(${column},'') IS NULL OR ${column} IN ${COUNTED_STAFF} THEN 1 ELSE 0 END`;

/**
 * `counted` = chỉ người được tính doanh số (mặc định, cho số doanh thu / đơn chốt). Việc vận hành và chăm sóc (chia số, khách theo nhân viên,
 * cuộc gọi, KPI, danh sách nhân viên) truyền false để giữ đủ người.
 */
const baseTeamSubquery = (team: Team, counted: boolean) => team === 'all' ? null
  : hrTeams
    ? `(SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING}${counted ? ` AND ${COUNTED}` : ''} AND CASE WHEN user_id IN (SELECT pos_user_id FROM hr_pos_team) THEN user_id IN (SELECT pos_user_id FROM hr_pos_team WHERE team='${team}') ELSE ${CONDITIONS[team]} END)`
    : `(SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING}${counted ? ` AND ${COUNTED}` : ''} AND (${CONDITIONS[team]} OR ${inWebTeamOf(team)}))`;
export const teamSubquery = (team: Team, counted = true) => {
  const own = baseTeamSubquery(team, counted), lens = lensNow();
  if (!lens || lens === team) return inScope(own);
  const other = baseTeamSubquery(lens, counted)!;
  return inScope(own ? both(own, other) : other);
};
/** Biểu thức SQL team Pancake của một dòng pos_users ('sale' / 'cskh' / NULL), dùng khi đối chiếu với web nhân sự. */
/** Người đã xếp vào team Sale/CSKH trên web tổng thuộc bộ phận đó dù bộ phận Pancake khác (lead, mentor; 03/11/2026). */
const inWebTeamOf = (team: Exclude<Team, 'all'>) => `user_id IN (SELECT m.value FROM app_settings s, json_each(s.value) t, json_each(t.value, '$.memberIds') m WHERE s.key='web_teams_v1' AND json_valid(s.value) AND json_extract(t.value, '$.dept')='${team}')`;
export const pancakeTeamCase = `CASE WHEN ${CONDITIONS.sale} THEN 'sale' WHEN ${CONDITIONS.cskh} THEN 'cskh' END`;
/**
 * Một team cụ thể bên web nhân sự (đơn vị kind=team, anh Vũ 10/10/2026: "xem được thông số theo team"). Đã kiểm tồn tại ở lib/hr-unit.ts;
 * mã chỉ gồm chữ, số, `_`, `-` nên ghép thẳng vào SQL được (teamSubquery không có tham số bind). dept = bộ phận của team (sale / cskh).
 */
export type HrUnit = { id: string; name: string; dept: Exclude<Team, 'all'>; branch?: string; branchOnly?: boolean };
// Nhiều mã nối bằng dấu phẩy = nhóm team cùng một người phụ trách (lọc mẹ-con, anh Vũ 21/10/2026: "team c mơ... ấn vào thấy sale hn của c mơ, sale tn của c mơ").
export const HR_UNIT_RE = /^[A-Za-z0-9_-]{1,80}(,[A-Za-z0-9_-]{1,80}){0,29}$/;
/** Các mã team trong một lựa chọn (một team hoặc cả nhóm). */
export const unitIds = (id: string) => id.split(',');
/**
 * Người thuộc một team: theo bản sao hr_pos_team (team trực tiếp = department_id của vai trò chính), luôn đọc web nhân sự, không phụ thuộc nguồn
 * team Pancake hay nhân sự. Cùng quy tắc với trang Theo team (lib/hr-teams.ts groupTeams) nên tổng các team khớp bộ phận.
 */
export const unitSubquery = (unit: HrUnit, counted = true) => {
  const lens = lensNow(), withLens = (q: string) => inScope(lens && lens !== unit.dept ? both(q, baseTeamSubquery(lens, counted)!) : q)!;
  if (unit.branchOnly && unit.branch) return withLens(branchSubquery(unit.branch));
  if (!HR_UNIT_RE.test(unit.id)) throw new Error('Mã team không hợp lệ.');
  // Thư mục mẹ có thể gồm cả team web nhân sự lẫn team con chia trên web tổng (anh Vũ 23/10/2026): ghép hai phần bằng OR.
  const ids = unitIds(unit.id), web = ids.filter((x) => x.startsWith('wt_')), hr = ids.filter((x) => !x.startsWith('wt_'));
  const parts = [
    ...web.length ? [`user_id IN ${webTeamMembers(web)}`] : [],
    ...hr.length ? [`(user_id IN (SELECT pos_user_id FROM hr_pos_team WHERE department_id IN (${hr.map((x) => `'${x}'`).join(',')}) AND team='${unit.dept}') AND user_id NOT IN ${WEB_PLACED})`] : [],
  ];
  return withLens(`(SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING}${counted ? ` AND ${COUNTED}` : ''} AND (${parts.join(' OR ')})${branchFilter('user_id', unit.branch ?? null)})`);
};
/** Mọi người đã xếp vào team web tổng: rút khỏi team web nhân sự (cùng quy tắc overlayWebTeams ở lib/web-teams.ts), trừ khi nguồn team là web nhân sự. */
const WEB_PLACED = `(SELECT m.value FROM app_settings s, json_each(s.value) t, json_each(t.value, '$.memberIds') m WHERE s.key='web_teams_v1' AND json_valid(s.value) AND NOT EXISTS (SELECT 1 FROM app_settings h WHERE h.key='team_source' AND h.value='hr'))`;
/** Thành viên các team web tổng (mã đã qua HR_UNIT_RE nên ghép thẳng được). */
export const webTeamMembers = (ids: string[]) => `(SELECT DISTINCT m.value FROM app_settings s, json_each(s.value) t, json_each(t.value, '$.memberIds') m WHERE s.key='web_teams_v1' AND json_valid(s.value) AND json_extract(t.value, '$.id') IN (${ids.map((x) => `'${x}'`).join(',')}))`;
/** ` AND <column> IN (…)` hoặc chuỗi rỗng khi xem tất cả. Có `unit` thì lọc theo team đó thay cho cả bộ phận. */
export const teamFilter = (column: string, team: Team, counted = true, unit: HrUnit | null = null) => {
  const q = unit && !unit.branchOnly ? unitSubquery(unit, counted) : teamSubquery(team, counted);
  return (q ? ` AND ${column} IN ${q}` : '') + (unit?.branchOnly ? branchFilter(column, unit.branch ?? null) : '');
};
/** Số về MKT: chỉ đơn đang chia cho bộ phận Sale mới tính số (sếp qua anh Vũ 07/11/2026, khớp Pancake lọc Marketer + bộ phận Sale).
 *  Chưa chia, chia CSKH hay người khác không tính số. Nút CSKH vẫn xem riêng đơn đang ở CSKH. */
export const leadSellerFilter = (column: string, team: Team = 'all') =>
  ` AND ${column} IN ${teamSubquery(team === 'cskh' ? 'cskh' : 'sale')}`;

