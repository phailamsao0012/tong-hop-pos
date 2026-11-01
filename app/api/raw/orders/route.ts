import { orderFilterSql, parseOrderFilters, marketerValue } from '@/lib/pancake/order-segments';
import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth/auth';
import { ORDER_STATUS } from '@/lib/pancake/pancake';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/shared/report-time';
import { CLOSED, STATUS_GROUPS, type GroupKey } from '@/lib/reports/stats';
import { parseTeam, teamFilter } from '@/lib/teams/team';
import { escapeLike, orderKeys, phoneVariants } from '@/lib/shared/search-query';
import { checkSearchLimit } from '@/lib/shared/search-limit';

// Đơn nguồn Pancake: danh sách có bộ lọc (POS, ngày tạo, nhóm trạng thái, nhân viên, mã đơn / SĐT).
// Truy vấn theo chỉ mục (pos_id, created_at); tìm SĐT dùng chỉ mục (pos_id, phone) khi nhập đủ số.
type RawOrder = {
  id: string; source_order_id: string; pos_id: string; phone: string | null; customer_name: string | null; created_at: string | null; updated_at: string | null;
  marketer_id: string | null; status_code: number | null; seller_id: string | null; seller_assigned_at: string | null; current_total: number | null; net_total: number | null;
  first_confirmed_at: string | null; first_confirmed_by: string | null; delivered_at: string | null; history_limited: number; has_raw: number; order_source: string | null; fetched_at: string;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'Đăng nhập để xem đơn nguồn.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = [...(params.get('posIds') ?? '').split(','), params.get('posId') ?? ''].filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? [...new Set(requested)] : POS.map((x) => x.id);
  const page = Number(params.get('page') ?? '1');
  if (!Number.isInteger(page) || page < 1 || page > 1000) return Response.json({ error: 'Trang không hợp lệ.' }, { status: 400 });
  const size = Math.min(100, Math.max(10, Number(params.get('size') ?? '25') || 25));
  const start = params.get('start') ?? '', end = params.get('end') ?? '';
  if ((start && !DATE_RE.test(start)) || (end && !DATE_RE.test(end)) || (start && end && start > end)) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const group = params.get('group') ?? '';
  const sellerId = (params.get('sellerId') ?? '').slice(0, 100);
  const q = (params.get('q') ?? '').trim().slice(0, 40);
  if (q) {
    const limited = await checkSearchLimit(env, user.userId);
    if (limited) return limited;
  }
  const phones = phoneVariants(q);
  // IN nhiều biến thể cộng ORDER BY có thể khiến SQLite chọn chỉ mục ngày và đọc cả POS.
  const source = phones.length ? 'raw_pos_orders INDEXED BY idx_raw_orders_phone' : 'raw_pos_orders';

  const where: string[] = [`pos_id IN (${posIds.map(() => '?').join(',')})`];
  const binds: (string | number)[] = [...posIds];
  // Cơ sở thời gian của khoảng ngày: tạo đơn (mặc định), chốt (xác nhận lần đầu) hoặc giao người bán — để app/ web mở đúng
  // danh sách đơn cấu thành một con số (Đơn chốt xếp theo giờ chốt, số nhận theo giờ chia).
  const basis = params.get('basis') === 'confirmed' ? 'first_confirmed_at' : params.get('basis') === 'assigned' ? 'seller_assigned_at' : 'created_at';
  if (start) { where.push(`${basis}>=?`); binds.push(vnRangeUtc(start, start).startUtc); }
  if (end) { where.push(`${basis}<?`); binds.push(vnRangeUtc(end, end).endUtc); }
  // Nhóm mở rộng trùng các bậc của trang Vận hành đơn (ngoài STATUS_GROUPS).
  const EXTRA: Record<string, number[]> = { shipped: [2, 3, 16, 4, 5, 15], processing: [1, 8, 9, 11, 12, 13, 20], packing: [8], waiting: [9], justconfirmed: [1], other: [11, 12, 13, 20] };
  if (group === 'closed') where.push(CLOSED);
  else if (Object.hasOwn(EXTRA, group)) where.push(`status_code IN (${EXTRA[group].join(',')})`);
  else if (group === 'unconfirmed') where.push("first_confirmed_at IS NULL AND status_code NOT IN (0,17,6,7)");
  else if (group === 'limited') where.push('(history_limited=1 OR raw_json IS NULL)');
  else if (Object.hasOwn(STATUS_GROUPS, group)) where.push(`status_code IN (${STATUS_GROUPS[group as GroupKey].join(',')})`);
  if (sellerId) { where.push('seller_id=?'); binds.push(sellerId); }
  // Giờ (VN) trên cột cơ sở thời gian: cột theo giờ của Điều hành trong ca mở đúng các đơn trong giờ đó.
  const hour = params.get('hour') ?? '';
  if (/^\d{1,2}$/.test(hour) && Number(hour) < 24) { where.push(`CAST(strftime('%H', datetime(${basis}, '+7 hours')) AS INTEGER)=?`); binds.push(Number(hour)); }
  { const tf = teamFilter('seller_id', parseTeam(params.get('team'))); if (tf) where.push(tf.slice(5)); }
  if (q) {
    const keys = orderKeys(q, posIds);
    if (phones.length) { where.push(`phone IN (${phones.map(() => '?').join(',')})`); binds.push(...phones); }
    else if (/^\d{4,8}$/.test(q)) { where.push(`(phone LIKE ? ESCAPE '\\' OR id IN (${keys.map(() => '?').join(',')}))`); binds.push(`%${escapeLike(q)}`, ...keys); }
    else if (keys.length) { where.push(`id IN (${keys.map(() => '?').join(',')})`); binds.push(...keys); }
    else { where.push("customer_name LIKE ? ESCAPE '\\'"); binds.push(`%${escapeLike(q)}%`); }
  }
  const team = parseTeam(params.get('team'));
  const filter = orderFilterSql(parseOrderFilters(params, team), team, 'raw_pos_orders');
  const whereSql = where.join(' AND ') + filter.sql;
  binds.push(...filter.binds);
  const rows = await env.DB.prepare(`SELECT marketer_id,id,source_order_id,pos_id,phone,customer_name,created_at,updated_at,status_code,seller_id,seller_assigned_at,current_total,net_total,first_confirmed_at,first_confirmed_by,delivered_at,history_limited,(raw_json IS NOT NULL) AS has_raw,order_source,fetched_at
    FROM ${source} WHERE ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...binds, size + 1, (page - 1) * size).all<RawOrder>();
  const names = await env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; name: string }>();
  const nameMap = new Map(names.results.map((r) => [r.user_id, r.name]));
  const baseWhere = where.join(' AND ');
  const marketers = team === 'cskh' ? await env.DB.prepare(`SELECT DISTINCT ${marketerValue('raw_pos_orders')} AS id FROM ${source} WHERE ${baseWhere} AND ${marketerValue('raw_pos_orders')} IS NOT NULL`).bind(...binds.slice(0, binds.length - filter.binds.length)).all<{ id: string }>() : null;
  const who = (id: string | null) => id ? nameMap.get(id) ?? `NV ${id.slice(0, 8)}` : null;
  return Response.json({
    marketers: marketers?.results.map(m => ({ marketerId: m.id, marketerName: who(m.id)! })) ?? [],
    page, size, hasMore: rows.results.length > size,
    orders: rows.results.slice(0, size).map((o) => ({
      id: o.id, orderId: o.source_order_id, posId: o.pos_id, posName: POS.find((x) => x.id === o.pos_id)?.name ?? o.pos_id,
      phone: o.phone, customer: o.customer_name, createdAt: o.created_at, updatedAt: o.updated_at, fetchedAt: o.fetched_at,
      statusCode: o.status_code, statusName: ORDER_STATUS[Number(o.status_code)] ?? String(o.status_code),
      marketerId: o.marketer_id?.trim() || null, marketerName: who(o.marketer_id?.trim() || null), orderOrigin: o.marketer_id?.trim() ? 'mkt' : 'self',
      sellerId: o.seller_id, sellerName: who(o.seller_id), sellerAssignedAt: o.seller_assigned_at,
      currentTotal: o.current_total, net: o.net_total ?? o.current_total, firstConfirmedAt: o.first_confirmed_at, closerName: who(o.first_confirmed_by), deliveredAt: o.delivered_at,
      historyLimited: !!o.history_limited, hasRaw: !!o.has_raw, source: o.order_source,
    })),
    note: 'Trạng thái và tổng tiền là giá trị hiện tại của đơn nguồn tại lúc đồng bộ.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
