import { allowedPos, MENTOR_REPORTS, scopeApi, type Access } from './access';
import { MENTOR_SQL } from './hr-teams';
import { maskPhone } from './bot-guard-core';
import { maskPhonesIn } from './audit';
import { DATE_RE, todayVn, vnRangeUtc } from './report-time';
import { CLOSED } from './stats';
import { COUNTED_STAFF, WORKING, teamFilter, webTeamMembers } from './team';
import { WEB_TEAM_ID } from './web-teams';
import { POS } from './report-model';

type ScopeUser = Access & { userId: string };
const ph = (ids: readonly string[]) => ids.map(() => '?').join(',');

/** Không dùng email hay tên để đoán hồ sơ; liên kết HR chính thức được ưu tiên. */
export async function staffScope(db: D1Database, user: ScopeUser, today = todayVn()): Promise<string[]> {
  // Mentor / Leader gán ở Cài đặt → Team (31/10/2026): người trong các team đó, bỏ người đã nghỉ.
  if (user.teamScope) {
    const ids = user.teamScope.ids.filter((id) => WEB_TEAM_ID.test(id));
    if (!ids.length) return [];
    const rows = await db.prepare(`SELECT DISTINCT user_id FROM pos_users WHERE ${WORKING} AND user_id IN ${webTeamMembers(ids)}`).all<{ user_id: string }>();
    return rows.results.map((r) => r.user_id).sort();
  }
  const linked = await db.prepare('SELECT id,status,left_on FROM hr_employees WHERE main_user_id=?').bind(user.userId).all<{ id: string; status: string; left_on: string | null }>();
  if (linked.results.some((row) => row.status === 'da_nghi' || (row.left_on !== null && row.left_on < today))) return [];
  let employeeId: string | null = linked.results.length === 1 ? linked.results[0].id : null;
  if (linked.results.length > 1) return [];
  if (!employeeId) {
    const saved = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(`user_employee:${user.userId}`).first<{ value: string }>();
    const employee = saved ? await db.prepare(`SELECT id FROM hr_employees WHERE id=? AND status<>'da_nghi' AND (left_on IS NULL OR left_on>=?) AND (main_user_id IS NULL OR main_user_id='' OR main_user_id=?)`).bind(saved.value, today, user.userId).first<{ id: string }>() : null;
    employeeId = employee?.id ?? null;
  }
  if (!employeeId) return [];
  // Dùng đúng định nghĩa ghế Mentor (kể cả kiêm nhiệm) của trang team.
  const mentorSql = MENTOR_SQL.replace('e.full_name AS name', 'e.id AS employee_id');
  const teams = await db.prepare(`SELECT team_id FROM (${mentorSql}) WHERE employee_id=?`).bind(today, today, employeeId).all<{ team_id: string }>();
  const teamIds = [...new Set(teams.results.map((r) => r.team_id))];
  const members = await db.prepare(`SELECT DISTINCT t.pos_user_id FROM hr_pos_team t JOIN hr_employees e ON e.id=t.employee_id
    WHERE t.status<>'da_nghi' AND e.status<>'da_nghi' AND (e.joined_on IS NULL OR e.joined_on<=?) AND (e.left_on IS NULL OR e.left_on>=?)
    AND (t.employee_id=?${teamIds.length ? ` OR (t.department_id IN (${ph(teamIds)}) AND EXISTS (SELECT 1 FROM hr_assignments a WHERE a.employee_id=t.employee_id AND a.department_id=t.department_id AND a.is_primary=1 AND (a.start_on IS NULL OR a.start_on<=?) AND (a.end_on IS NULL OR a.end_on>=?)))` : ''})`)
    .bind(today, today, employeeId, ...teamIds, ...(teamIds.length ? [today, today] : [])).all<{ pos_user_id: string }>();
  return [...new Set(members.results.map((r) => r.pos_user_id).filter(Boolean))].sort();
}

/** Bộ lọc bind bắt buộc; rỗng luôn phủ định, không bao giờ hiểu là tất cả. */
export function staffOrderFilter(ids: readonly string[], seller = 'o.seller_id', care = 'o.care_id') {
  return ids.length ? { sql: ` AND (${seller} IN (${ph(ids)}) OR ${care} IN (${ph(ids)}))`, binds: [...ids, ...ids] }
    : { sql: ' AND 0=1', binds: [] as string[] };
}

export type MentorStaff = { id: string; name: string; net: number; closedOrders: number; aov: number | null; closeRate: number | null; returnRate: number | null; target: number | null; monthNet: number };
export type MentorCustomer = { id: string; name: string; phone: string | null; posId: string; orders: number; net: number; lastNoteAt: string | null };
export type MentorOrder = { id: string; code: string; posId: string; at: string; net: number };
export type MentorReport = { start: string; end: string; month: string; posOptions: { id: string; name: string }[]; staff: MentorStaff[]; customers: MentorCustomer[]; orderRows?: MentorOrder[]; page: number; hasMore: boolean; definitions: string };

export const MENTOR_DEFINITION = 'Doanh thu và đơn chốt theo ngày chốt trong kỳ, cùng định nghĩa Sale/CSKH. AOV = doanh thu ÷ đơn chốt. Tỷ lệ chốt = đơn tạo trong kỳ đã chốt ÷ đơn tạo trong kỳ (bỏ đơn xóa). Tỷ lệ hoàn = đơn hoàn ÷ đơn chuyển đi của nhóm đơn tạo trong kỳ. KPI là doanh thu tháng hiện tại trong POS được cấp. Khách gồm người được team phân công hoặc có đơn chốt do team bán/chăm sóc trong kỳ; số tiền chỉ cộng các đơn trong phạm vi. SĐT được che.';

/** Câu đọc đơn của riêng giao diện Mentor: không thay số hay hợp đồng API của vai trò cũ. */
export function mentorOrdersQuery(posIds: string[], ids: string[], start: string, end: string) {
  const range = vnRangeUtc(start, end), filter = staffOrderFilter(ids);
  return {
    sql: `SELECT o.id,o.source_order_id,o.pos_id,o.customer_id,o.phone,o.customer_name,o.seller_id,o.care_id,o.first_closed_at,o.status_code,COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0)) AS net
      FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money
      WHERE o.pos_id IN (${ph(posIds)}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED} AND o.seller_id IN ${COUNTED_STAFF}${filter.sql}`,
    binds: [...posIds, range.startUtc, range.endUtc, ...filter.binds],
  };
}

/** Route Mentor có hợp đồng riêng, chỉ được dùng bởi Team của tôi. Không cache phạm vi HR. */
export async function mentorReport(db: D1Database, user: ScopeUser, request: Request): Promise<Response> {
  const scoped = scopeApi(user, request.method, new URL(request.url));
  if (scoped.blocked || !MENTOR_REPORTS.includes(scoped.url.pathname)) return Response.json({ error: scoped.blocked ?? 'Không có quyền.' }, { status: 403 });
  const p = scoped.url.searchParams, today = todayVn(), month = today.slice(0, 7);
  const start = p.get('start') ?? `${month}-01`, end = p.get('end') ?? today;
  const validDay = (day: string) => DATE_RE.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  if (!validDay(start) || !validDay(end) || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 >= 120)
    return Response.json({ error: 'Chọn kỳ hợp lệ, tối đa 120 ngày.' }, { status: 400 });
  const allowed = allowedPos(user), requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !allowed.includes(id))) return Response.json({ error: 'POS ngoài phạm vi.' }, { status: 403 });
  const posIds = requested.length ? requested : allowed;
  const ids = await staffScope(db, user);
  // Không nhận danh sách từ request, kể cả khi gọi route trực tiếp mà không qua Worker.
  p.set('staffIds', ids.length ? ids.join(',') : '__none__');
  const seller = p.get('sellerId') ?? p.get('assigned') ?? '';
  if (seller && seller !== 'all' && !ids.includes(seller)) return Response.json({ error: 'Nhân viên ngoài phạm vi.' }, { status: 403 });
  const selected = seller && seller !== 'all' ? [seller] : ids;
  const page = Math.max(1, Math.min(500, Math.trunc(Number(p.get('page')) || 1)));
  const base: MentorReport = { start, end, month, posOptions: POS.filter((pos) => allowed.includes(pos.id)), staff: [], customers: [], page, hasMore: false, definitions: MENTOR_DEFINITION };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/vnd.megatech.mentor+json', 'Cache-Control': 'private, no-store' } });
  const empty = () => scoped.url.pathname === '/api/reports/customer-detail' ? json({ error: 'Không tìm thấy khách trong phạm vi.' }, 404) : json(base);
  if (!selected.length || !posIds.length) return empty();
  const names = await db.prepare(`SELECT DISTINCT pos_user_id AS id,employee_name AS name FROM hr_pos_team WHERE pos_user_id IN (${ph(selected)})${teamFilter('pos_user_id', user.team)}`).bind(...selected).all<{ id: string; name: string }>();
  const visibleIds = names.results.map((r) => r.id);
  if (!visibleIds.length) return empty();
  const orders = mentorOrdersQuery(posIds, visibleIds, start, end);
  const path = scoped.url.pathname;
  if (path === '/api/reports/staff-compare' || path === '/api/reports/staff-detail') {
    if (p.get('orders') === '1') {
      const list = await db.prepare(`SELECT id,source_order_id AS code,pos_id AS posId,first_closed_at AS at,net FROM (${orders.sql}) WHERE seller_id IN (${ph(visibleIds)}) ORDER BY first_closed_at DESC,id LIMIT 51 OFFSET ?`)
        .bind(...orders.binds, ...visibleIds, (page - 1) * 50).all<MentorOrder>();
      base.orderRows = list.results.slice(0, 50).map((row) => ({ ...row, code: maskPhonesIn(row.code) }));
      base.hasMore = list.results.length > 50;
      return json(base);
    }
    const stats = await db.prepare(`SELECT seller_id AS id,SUM(closed_net) AS net,SUM(closed_orders) AS closedOrders,
      SUM(orders) AS created,SUM(confirmed_orders+shipping_orders+delivered_orders+returned_orders) AS createdClosed,
      SUM(returned_orders) AS returned,SUM(shipping_orders+delivered_orders+returned_orders) AS sent
      FROM stats_daily WHERE pos_id IN (${ph(posIds)}) AND day>=? AND day<=? AND seller_id IN (${ph(visibleIds)}) AND seller_id IN ${COUNTED_STAFF} GROUP BY seller_id`).bind(...posIds, start, end, ...visibleIds).all<{ id: string; net: number; closedOrders: number; created: number; createdClosed: number; returned: number; sent: number }>();
    const monthStats = await db.prepare(`SELECT seller_id AS id,SUM(closed_net) AS net FROM stats_daily WHERE pos_id IN (${ph(posIds)}) AND day>=? AND day<=? AND seller_id IN (${ph(visibleIds)}) AND seller_id IN ${COUNTED_STAFF} GROUP BY seller_id`).bind(...posIds, `${month}-01`, today, ...visibleIds).all<{ id: string; net: number }>();
    const targets = await db.prepare(`SELECT ref_id AS id,revenue FROM targets WHERE month=? AND scope='employee' AND ref_id IN (${ph(visibleIds)})`).bind(month, ...visibleIds).all<{ id: string; revenue: number }>();
    base.staff = names.results.map((person) => {
      const r = stats.results.find((row) => row.id === person.id), closedOrders = Number(r?.closedOrders ?? 0), net = Number(r?.net ?? 0);
      return { ...person, name: maskPhonesIn(person.name), closedOrders, net, aov: closedOrders ? net / closedOrders : null,
        closeRate: r?.created ? r.createdClosed / r.created * 100 : null, returnRate: r?.sent ? r.returned / r.sent * 100 : null,
        target: targets.results.find((row) => row.id === person.id)?.revenue ?? null, monthNet: Number(monthStats.results.find((row) => row.id === person.id)?.net ?? 0) };
    });
    return json(base);
  }
  // Chỉ lấy khách có liên hệ trong phạm vi: không dùng customer_stats trọn đời,
  // vì số ở đó có thể cộng cả đơn của nhân viên ngoài team.
  const customerId = p.get('customerId');
  const q = (p.get('q') ?? '').trim().slice(0, 60);
  const customers = await db.prepare(`WITH scoped_orders AS (${orders.sql})
    SELECT c.id,c.name,c.phone,c.pos_id AS posId,c.last_note_at AS lastNoteAt,
      COUNT(o.id) AS orders,COALESCE(SUM(o.net),0) AS net
    FROM pos_customers c LEFT JOIN scoped_orders o ON o.pos_id=c.pos_id AND (o.customer_id=c.customer_id OR (o.phone=c.phone AND c.phone IS NOT NULL))
    WHERE c.pos_id IN (${ph(posIds)}) AND (c.assigned_user_id IN (${ph(visibleIds)}) OR o.id IS NOT NULL)
      ${customerId ? 'AND c.id=?' : ''}${q ? "AND instr(lower(c.name),lower(?))>0" : ''}
    GROUP BY c.id ORDER BY c.last_note_at DESC,c.id LIMIT 51 OFFSET ?`)
    .bind(...orders.binds, ...posIds, ...visibleIds, ...(customerId ? [customerId] : []), ...(q ? [q] : []), (page - 1) * 50)
    .all<MentorCustomer>();
  if (path === '/api/reports/customer-detail') {
    if (!customerId || !customers.results.length) return json({ error: 'Không tìm thấy khách trong phạm vi.' }, 404);
    const customer = customers.results[0];
    const notes = await db.prepare(`SELECT n.id,n.message,n.created_at AS at FROM customer_notes n JOIN pos_customers c ON c.pos_id=n.pos_id AND c.customer_id=n.customer_id
      WHERE c.id=? AND n.author_id IN (${ph(visibleIds)}) ORDER BY n.created_at DESC,n.id LIMIT 100`).bind(customerId, ...visibleIds).all<{ id: string; message: string; at: string }>();
    return json({ customer: { ...customer, name: maskPhonesIn(customer.name), phone: customer.phone ? maskPhone(customer.phone) : null },
      notes: notes.results.map((n) => ({ ...n, message: maskPhonesIn(n.message) })), definitions: MENTOR_DEFINITION });
  }
  base.hasMore = customers.results.length > 50;
  base.customers = customers.results.slice(0, 50).map((c) => ({ ...c, name: maskPhonesIn(c.name), phone: c.phone ? maskPhone(c.phone) : null }));
  return json(base);
}
