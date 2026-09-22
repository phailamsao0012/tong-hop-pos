import { orderFilterSql, parseOrderFilters, marketerValue } from '@/lib/order-segments';
import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { STATUS_GROUPS, type GroupKey } from '@/lib/stats';
import { parseTeam, teamFilter } from '@/lib/team';

// Đơn nguồn Pancake: danh sách có bộ lọc (POS, ngày tạo, nhóm trạng thái, nhân viên, mã đơn / SĐT).
// Truy vấn theo chỉ mục (pos_id, created_at); tìm SĐT dùng chỉ mục (pos_id, phone) khi nhập đủ số.
type RawOrder = {
  id: string; source_order_id: string; pos_id: string; phone: string | null; customer_name: string | null; created_at: string | null; updated_at: string | null;
  marketer_id: string | null; status_code: number | null; seller_id: string | null; seller_assigned_at: string | null; current_total: number | null; net_total: number | null;
  first_confirmed_at: string | null; first_confirmed_by: string | null; delivered_at: string | null; history_limited: number; has_raw: number; order_source: string | null; fetched_at: string;
};

export async function GET(request: Request) {
  if (!(await getSessionUser())) return Response.json({ error: 'Đăng nhập để xem đơn nguồn.' }, { status: 401 });
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

  const where: string[] = [`pos_id IN (${posIds.map(() => '?').join(',')})`];
  const binds: (string | number)[] = [...posIds];
  if (start) { where.push('created_at>=?'); binds.push(vnRangeUtc(start, start).startUtc); }
  if (end) { where.push('created_at<?'); binds.push(vnRangeUtc(end, end).endUtc); }
  if (group === 'unconfirmed') where.push("first_confirmed_at IS NULL AND status_code NOT IN (0,17,6,7)");
  else if (group === 'limited') where.push('(history_limited=1 OR raw_json IS NULL)');
  else if (group in STATUS_GROUPS) where.push(`status_code IN (${STATUS_GROUPS[group as GroupKey].join(',')})`);
  if (sellerId) { where.push('seller_id=?'); binds.push(sellerId); }
  { const tf = teamFilter('seller_id', parseTeam(params.get('team'))); if (tf) where.push(tf.slice(5)); }
  if (q) {
    const digits = q.replace(/\D/g, '');
    if (/^\d{9,11}$/.test(digits)) { where.push('phone=?'); binds.push(digits); }
    else if (digits.length >= 4 && digits.length === q.length) { where.push('(phone LIKE ? OR source_order_id=?)'); binds.push(`%${digits}`, digits); }
    else { where.push('(source_order_id=? OR customer_name LIKE ?)'); binds.push(q, `%${q}%`); }
  }
  const team = parseTeam(params.get('team'));
  const filter = orderFilterSql(parseOrderFilters(params, team), team, 'raw_pos_orders');
  const whereSql = where.join(' AND ') + filter.sql;
  binds.push(...filter.binds);
  const rows = await env.DB.prepare(`SELECT marketer_id,id,source_order_id,pos_id,phone,customer_name,created_at,updated_at,status_code,seller_id,seller_assigned_at,current_total,net_total,first_confirmed_at,first_confirmed_by,delivered_at,history_limited,(raw_json IS NOT NULL) AS has_raw,order_source,fetched_at
    FROM raw_pos_orders WHERE ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...binds, size + 1, (page - 1) * size).all<RawOrder>();
  const names = await env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id").all<{ user_id: string; name: string }>();
  const nameMap = new Map(names.results.map((r) => [r.user_id, r.name]));
  const baseWhere = where.join(' AND ');
  const marketers = team === 'cskh' ? await env.DB.prepare(`SELECT DISTINCT ${marketerValue('raw_pos_orders')} AS id FROM raw_pos_orders WHERE ${baseWhere} AND ${marketerValue('raw_pos_orders')} IS NOT NULL`).bind(...binds.slice(0, binds.length - filter.binds.length)).all<{ id: string }>() : null;
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
