import { orderFilterSql, parseOrderFilters } from '@/lib/order-segments';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { parseTeam, teamFilter } from '@/lib/team';

// Hành trình đơn theo nhân viên: đơn chốt trong kỳ (theo giờ chốt, hoặc theo ngày tạo) và trạng thái hiện tại
// của từng đơn: chưa xuất kho (đã XN / đóng hàng / chờ chuyển…) → đã gửi hàng → đã nhận | hoàn | hủy.
const NET = 'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';
type Row = { seller_id: string | null; pos_id: string; status_code: number; n: number; net: number; gross: number };
export type Bucket = { orders: number; net: number; gross: number };
const BUCKETS = ['closed', 'processing', 'shipping', 'delivered', 'returned', 'cancelled', 'shipped', 'confirmed', 'packing', 'waiting', 'other', 'unconfirmed'] as const;
export type BucketKey = typeof BUCKETS[number];
const bucketOf = (code: number): BucketKey[] => {
  if (code === 0 || code === 17) return ['unconfirmed'];
  if (code === 6) return ['closed', 'cancelled'];
  if (code === 2) return ['closed', 'shipped', 'shipping'];
  if (code === 3 || code === 16) return ['closed', 'shipped', 'delivered'];
  if (code === 4 || code === 5 || code === 15) return ['closed', 'shipped', 'returned'];
  if (code === 1) return ['closed', 'processing', 'confirmed'];
  if (code === 8) return ['closed', 'processing', 'packing'];
  if (code === 9) return ['closed', 'processing', 'waiting'];
  return ['closed', 'processing', 'other']; // 11,12,13,20
};
const empty = () => Object.fromEntries(BUCKETS.map((b) => [b, { orders: 0, net: 0, gross: 0 }])) as Record<BucketKey, Bucket>;

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const basis = p.get('basis') === 'created' ? 'created' : 'confirmed';
  const team = parseTeam(p.get('team'));
  const filter = orderFilterSql(parseOrderFilters(p, team), team, 'raw_pos_orders');
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const timeCol = basis === 'created' ? 'created_at' : 'first_confirmed_at';
  // Theo giờ chốt: chỉ đơn đã từng xác nhận (kể cả sau đó hủy). Theo ngày tạo: mọi đơn tạo trong kỳ trừ đơn xóa.
  const statusFilter = basis === 'created' ? 'status_code<>7' : 'status_code NOT IN (0,17,7)';
  const [rows, names] = await env.DB.batch([
    env.DB.prepare(`SELECT seller_id, pos_id, status_code, COUNT(*) AS n, SUM(${NET}) AS net, SUM(COALESCE(current_total,0)) AS gross
      FROM raw_pos_orders WHERE pos_id IN (${ph}) AND ${timeCol}>=? AND ${timeCol}<? AND ${statusFilter}${teamFilter('seller_id', team)}${filter.sql}
      GROUP BY 1,2,3`).bind(...posIds, startUtc, endUtc, ...filter.binds),
    env.DB.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  const byEmployee = new Map<string, { sellerId: string; name: string; department: string | null; buckets: Record<BucketKey, Bucket>; pos: Set<string> }>();
  const byPos = new Map<string, Record<BucketKey, Bucket>>();
  const total = empty();
  for (const r of rows.results as Row[]) {
    const id = r.seller_id ?? '';
    if (!byEmployee.has(id)) byEmployee.set(id, { sellerId: id, name: id ? nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}` : 'Chưa gán người bán', department: id ? nameMap.get(id)?.department ?? null : null, buckets: empty(), pos: new Set() });
    if (!byPos.has(r.pos_id)) byPos.set(r.pos_id, empty());
    const e = byEmployee.get(id)!; e.pos.add(r.pos_id);
    for (const b of bucketOf(Number(r.status_code))) {
      for (const target of [e.buckets[b], byPos.get(r.pos_id)![b], total[b]]) { target.orders += Number(r.n); target.net += Number(r.net); target.gross += Number(r.gross); }
    }
  }
  return Response.json({
    period: { start, end }, basis, team,
    total,
    byEmployee: [...byEmployee.values()].map((e) => ({ sellerId: e.sellerId, name: e.name, department: e.department, posIds: [...e.pos], buckets: e.buckets }))
      .sort((a, b) => b.buckets.closed.orders - a.buckets.closed.orders),
    byPos: POS.filter((x) => byPos.has(x.id)).map((x) => ({ posId: x.id, posName: x.name, buckets: byPos.get(x.id)! })),
    departments: [...new Set([...byEmployee.values()].map((e) => e.department).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'vi')),
    definitions: {
      basis: basis === 'confirmed' ? 'Đơn chốt = đơn được xác nhận lần đầu trong kỳ (theo giờ chốt, như Pancake); trạng thái là trạng thái hiện tại lúc đồng bộ.' : 'Đơn tạo trong kỳ (theo ngày tạo); "Chưa chốt" = còn Mới / Chờ xác nhận.',
      flow: 'Chốt (Đã xác nhận) → kho đóng hàng → chờ chuyển hàng → đã gửi hàng (shipper lấy) → đã nhận hoặc hoàn. Hủy = hủy sau khi chốt.',
      shipped: 'Đã xuất đi = đã gửi hàng + đã nhận + hoàn. Chưa xuất = đã xác nhận, đang đóng hàng, chờ chuyển hàng, chờ hàng/in.',
      rates: '% thành công = đã nhận ÷ đã xuất đi; tỷ lệ hoàn = hoàn ÷ đã xuất đi; tỷ lệ chuyển hàng/chốt = đã xuất đi ÷ đơn chốt. Doanh số tính theo tổng giá sản phẩm; doanh thu = sau giảm trừ (như Pancake).',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
