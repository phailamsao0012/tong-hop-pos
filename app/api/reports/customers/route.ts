import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, todayVn, vnRangeUtc } from '@/lib/report-time';
import { parseTeam, teamFilter, type Team } from '@/lib/team';

// Danh sách khách theo POS × SĐT từ customer_stats: tìm kiếm, khách lâu chưa mua theo nhóm ngày,
// khách chưa từng mua thành công.
type Row = {
  id: string; pos_id: string; phone: string; name: string; seller_id: string | null; first_order_at: string | null;
  last_order_at: string | null; orders: number; closed_orders: number; success_orders: number; success_net: number;
  success_quantity: number; returned_orders: number; cancelled_orders: number; first_success_at: string | null;
  last_success_at: string | null; product_kinds: number; products_json: string;
};
export const DORMANT_GROUPS = {
  '30-45': [30, 45], '46-60': [46, 60], '61-90': [61, 90], '90+': [91, 100000],
} as const;

// Phân khúc khách (cùng định nghĩa với giao diện): tính theo số ngày từ lần mua thành công gần nhất (giờ VN).
const DAYS = `CAST(julianday(?) - julianday(date(datetime(last_success_at,'+7 hours'))) AS INTEGER)`;
const SEGMENTS: Record<string, string> = {
  vip: 'success_orders>0 AND success_net>=5000000',
  loyal: `success_orders>=3 AND ${DAYS}<=90`,
  active: `success_orders>0 AND ${DAYS}<=30`,
  new: `success_orders=1 AND CAST(julianday(?) - julianday(date(datetime(first_success_at,'+7 hours'))) AS INTEGER)<=30`,
  risk: `success_orders>=2 AND ${DAYS}>60`,
  potential: `success_orders=1 AND ${DAYS} BETWEEN 31 AND 90`,
  dormant: `success_orders>0 AND ${DAYS}>90`,
  never: 'success_orders=0',
};
const SEGMENT_BINDS: Record<string, number[]> = { vip: [], loyal: [1], active: [1], new: [1], risk: [1], potential: [1], dormant: [1], never: [] };
const ORDER: Record<string, string> = {
  recent: 'COALESCE(last_success_at,last_order_at) DESC',
  spend: 'success_net DESC, success_orders DESC',
  orders: 'success_orders DESC, success_net DESC',
  quantity: 'success_quantity DESC',
  first: 'first_success_at DESC',
  dormant: 'last_success_at ASC',
  name: 'name ASC',
};
const NET = 'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';

type PeriodArgs = { posIds: string[]; q: string; sellerId: string; page: number; size: number; sort: string; start: string; end: string; today: string; team: Team };
/** Top khách theo kỳ: đơn thành công (3,16) tạo trong kỳ, gộp theo SĐT trong POS; kèm số liệu trọn đời từ customer_stats. */
async function periodTop({ posIds, q, sellerId, page, size, sort, start, end, today, team }: PeriodArgs) {
  const db = env.DB;
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const order = sort === 'orders' ? 'orders DESC, net DESC' : sort === 'recent' ? 'last_at DESC' : 'net DESC, orders DESC';
  const filter = [`pos_id IN (${ph})`, 'status_code IN (3,16)', "phone IS NOT NULL AND phone<>''", 'created_at>=? AND created_at<?'];
  const binds: (string | number)[] = [...posIds, startUtc, endUtc];
  if (sellerId) { filter.push('seller_id=?'); binds.push(sellerId); }
  if (team !== 'all') filter.push(teamFilter('seller_id', team).slice(5));
  if (q) { filter.push('(phone LIKE ? OR customer_name LIKE ?)'); binds.push(`%${q.replace(/\D/g, '') || q}%`, `%${q}%`); }
  const where = filter.join(' AND ');
  const [rows, count, names] = await db.batch([
    db.prepare(`SELECT pos_id, phone, COUNT(*) AS orders, SUM(${NET}) AS net, MAX(created_at) AS last_at, MIN(created_at) AS first_at
      FROM raw_pos_orders WHERE ${where} GROUP BY pos_id, phone ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...binds, size + 1, (page - 1) * size),
    db.prepare(`SELECT COUNT(*) AS n, SUM(net) AS net, SUM(orders) AS orders FROM (SELECT pos_id, phone, COUNT(*) AS orders, SUM(${NET}) AS net FROM raw_pos_orders WHERE ${where} GROUP BY pos_id, phone)`).bind(...binds),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
  ]);
  type R = { pos_id: string; phone: string; orders: number; net: number; last_at: string; first_at: string };
  const pageRows = (rows.results as R[]).slice(0, size);
  const ids = pageRows.map((r) => `${r.pos_id}:${r.phone}`);
  const stats = ids.length
    ? (await db.prepare(`SELECT id,name,seller_id,orders,closed_orders,success_orders,success_net,success_quantity,returned_orders,cancelled_orders,first_order_at,last_order_at,first_success_at,last_success_at,product_kinds,products_json FROM customer_stats WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Row>()).results
    : [];
  const statMap = new Map(stats.map((r) => [r.id, r]));
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const totals = count.results[0] as { n: number; net: number | null; orders: number | null };
  return Response.json({
    page, size, hasMore: rows.results.length > size, total: Number(totals.n ?? 0),
    period: { start, end, net: Number(totals.net ?? 0), orders: Number(totals.orders ?? 0) },
    groups: null,
    customers: pageRows.map((r) => {
      const st = statMap.get(`${r.pos_id}:${r.phone}`);
      const last = r.last_at ? new Date(`${r.last_at}Z`) : null;
      const days = last ? Math.floor((Date.parse(`${today}T00:00:00Z`) - (last.getTime() - (last.getTime() % 86400000))) / 86400000) : null;
      const sellerId = st?.seller_id ? String(st.seller_id) : null;
      return {
        posId: r.pos_id, posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id, phone: r.phone, name: String(st?.name ?? ''),
        sellerId, sellerName: sellerId ? nameMap.get(sellerId) ?? `NV ${sellerId.slice(0, 8)}` : '—',
        firstOrderAt: st?.first_order_at ?? null, lastOrderAt: st?.last_order_at ?? null,
        orders: Number(st?.orders ?? 0), closedOrders: Number(st?.closed_orders ?? 0),
        // Trong kỳ:
        successOrders: Number(r.orders), successNet: Number(r.net), successQuantity: Number(st?.success_quantity ?? 0),
        averageOrder: r.orders ? Number(r.net) / Number(r.orders) : null,
        // Trọn đời:
        lifetimeOrders: Number(st?.success_orders ?? 0), lifetimeNet: Number(st?.success_net ?? 0),
        returnedOrders: Number(st?.returned_orders ?? 0), cancelledOrders: Number(st?.cancelled_orders ?? 0),
        firstSuccessAt: st?.first_success_at ?? null, lastSuccessAt: r.last_at, daysSinceSuccess: days,
        productKinds: Number(st?.product_kinds ?? 0), products: JSON.parse(String(st?.products_json ?? '[]')) as { name: string; quantity: number; total: number; orders: number }[],
      };
    }),
    definitions: {
      success: `Top khách trong kỳ ${start} → ${end}: đơn mua thành công (Đã nhận / Đã thu tiền) tạo trong kỳ, cộng dồn theo SĐT trong từng POS. Cột "Mua TC" và "Tổng tiền mua" là số trong kỳ; hồ sơ chi tiết vẫn xem toàn bộ lịch sử.`,
      dormant: 'Ngày chưa mua lại = số ngày từ lần mua thành công gần nhất trong kỳ tới hôm nay.',
      identity: 'Mỗi khách = một SĐT trong một POS; chưa gộp trùng số giữa các POS.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const q = (p.get('q') ?? '').trim().slice(0, 60);
  const group = p.get('group') ?? 'all';
  const sellerId = (p.get('sellerId') ?? '').slice(0, 100);
  const page = Math.max(1, Math.min(500, Number(p.get('page') ?? '1') || 1));
  // size: 50 theo trang; "Xem toàn bộ" tới 5.000; xuất Excel tới 20.000.
  const size = Math.max(1, Math.min(20000, Number(p.get('size') ?? 50) || 50));
  const today = todayVn();
  const sort = p.get('sort') ?? 'recent';
  const team = parseTeam(p.get('team'));
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  // Có kỳ → "Top khách trong kỳ": gộp đơn thành công tạo trong kỳ theo (POS, SĐT), đọc theo chỉ mục (pos_id, created_at).
  if (start || end) {
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
    return periodTop({ posIds, q, sellerId, page, size, sort, start, end, today, team });
  }
  // Ngày kể từ lần mua thành công gần nhất, tính theo ngày VN.
  const daysExpr = `CAST(julianday(?) - julianday(date(datetime(last_success_at,'+7 hours'))) AS INTEGER)`;
  const where: string[] = [`pos_id IN (${posIds.map(() => '?').join(',')})`];
  const binds: (string | number)[] = [...posIds];
  if (q) { where.push('(phone LIKE ? OR name LIKE ?)'); binds.push(`%${q.replace(/\D/g, '') || q}%`, `%${q}%`); }
  if (sellerId) { where.push('seller_id=?'); binds.push(sellerId); }
  if (team !== 'all') where.push(teamFilter('seller_id', team).slice(5));
  const segment = p.get('segment') ?? '';
  if (segment && segment in SEGMENTS) { where.push(SEGMENTS[segment]); binds.push(...SEGMENT_BINDS[segment].map(() => today)); }
  if (group === 'never') where.push('success_orders=0');
  else if (group in DORMANT_GROUPS) {
    const [lo, hi] = DORMANT_GROUPS[group as keyof typeof DORMANT_GROUPS];
    where.push(`success_orders>0 AND ${daysExpr} BETWEEN ? AND ?`); binds.push(today, lo, hi);
  } else if (group === 'active') { where.push(`success_orders>0 AND ${daysExpr} < 30`); binds.push(today); }
  const whereSql = where.join(' AND ');
  const db = env.DB;
  const [rows, count, groups, names] = await db.batch([
    db.prepare(`SELECT id,pos_id,phone,name,seller_id,first_order_at,last_order_at,orders,closed_orders,success_orders,success_net,success_quantity,returned_orders,cancelled_orders,first_success_at,last_success_at,product_kinds,products_json
      FROM customer_stats WHERE ${whereSql} ORDER BY ${ORDER[sort] ?? ORDER.recent} LIMIT ? OFFSET ?`).bind(...binds, size + 1, (page - 1) * size),
    db.prepare(`SELECT COUNT(*) AS n FROM customer_stats WHERE ${whereSql}`).bind(...binds),
    // Đếm nhóm (không áp bộ lọc nhóm) để hiện tổng quan.
    db.prepare(`SELECT
        SUM(CASE WHEN success_orders=0 THEN 1 ELSE 0 END) AS never,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr}<30 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 30 AND 45 THEN 1 ELSE 0 END) AS g30,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 46 AND 60 THEN 1 ELSE 0 END) AS g46,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS g61,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr}>90 THEN 1 ELSE 0 END) AS g90,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 30 AND 45 THEN success_net ELSE 0 END) AS g30_net,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 46 AND 60 THEN success_net ELSE 0 END) AS g46_net,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 61 AND 90 THEN success_net ELSE 0 END) AS g61_net,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr}>90 THEN success_net ELSE 0 END) AS g90_net,
        SUM(CASE WHEN ${SEGMENTS.vip} THEN 1 ELSE 0 END) AS seg_vip,
        SUM(CASE WHEN ${SEGMENTS.loyal} THEN 1 ELSE 0 END) AS seg_loyal,
        SUM(CASE WHEN ${SEGMENTS.new} THEN 1 ELSE 0 END) AS seg_new,
        SUM(CASE WHEN ${SEGMENTS.risk} THEN 1 ELSE 0 END) AS seg_risk,
        SUM(CASE WHEN ${SEGMENTS.potential} THEN 1 ELSE 0 END) AS seg_potential,
        SUM(CASE WHEN success_orders>0 THEN success_net ELSE 0 END) AS ltv_total,
        COUNT(*) AS total
      FROM customer_stats WHERE pos_id IN (${posIds.map(() => '?').join(',')})${sellerId ? ' AND seller_id=?' : ''}${teamFilter('seller_id', team)}`)
      .bind(today, today, today, today, today, today, today, today, today, today, today, today, today, ...posIds, ...(sellerId ? [sellerId] : [])),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
  ]);
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const g = groups.results[0] as Record<string, number>;
  const list = (rows.results as Row[]).slice(0, size).map((r) => {
    const last = r.last_success_at ? new Date(`${r.last_success_at}Z`) : null;
    const days = last ? Math.floor((Date.parse(`${today}T00:00:00Z`) - (last.getTime() - (last.getTime() % 86400000)) ) / 86400000) : null;
    return {
      posId: r.pos_id, posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id, phone: r.phone, name: r.name,
      sellerId: r.seller_id, sellerName: r.seller_id ? nameMap.get(r.seller_id) ?? `NV ${r.seller_id.slice(0, 8)}` : '—',
      firstOrderAt: r.first_order_at, lastOrderAt: r.last_order_at, orders: r.orders, closedOrders: r.closed_orders,
      successOrders: r.success_orders, successNet: r.success_net, successQuantity: r.success_quantity,
      averageOrder: r.success_orders ? r.success_net / r.success_orders : null,
      lifetimeOrders: r.success_orders, lifetimeNet: r.success_net,
      returnedOrders: r.returned_orders, cancelledOrders: r.cancelled_orders,
      firstSuccessAt: r.first_success_at, lastSuccessAt: r.last_success_at, daysSinceSuccess: days,
      productKinds: r.product_kinds, products: JSON.parse(r.products_json) as { productId: string; name: string; quantity: number; total: number; orders: number }[],
    };
  });
  return Response.json({
    page, size, hasMore: rows.results.length > size, total: Number((count.results[0] as { n: number }).n),
    groups: { never: Number(g.never ?? 0), active: Number(g.active ?? 0), '30-45': Number(g.g30 ?? 0), '46-60': Number(g.g46 ?? 0), '61-90': Number(g.g61 ?? 0), '90+': Number(g.g90 ?? 0), total: Number(g.total ?? 0) },
    groupNets: { '30-45': Number(g.g30_net ?? 0), '46-60': Number(g.g46_net ?? 0), '61-90': Number(g.g61_net ?? 0), '90+': Number(g.g90_net ?? 0) },
    segments: { vip: Number(g.seg_vip ?? 0), loyal: Number(g.seg_loyal ?? 0), active: Number(g.active ?? 0), new: Number(g.seg_new ?? 0), risk: Number(g.seg_risk ?? 0), potential: Number(g.seg_potential ?? 0), dormant: Number(g.g90 ?? 0), never: Number(g.never ?? 0),
      buyers: Number(g.total ?? 0) - Number(g.never ?? 0), ltvTotal: Number(g.ltv_total ?? 0) },
    customers: list,
    definitions: {
      success: 'Mua thành công = đơn ở trạng thái Đã nhận (3) hoặc Đã thu tiền (16); tiền mua = doanh thu sau mọi giảm trừ (như Pancake).',
      dormant: 'Ngày chưa mua lại = số ngày từ lần mua thành công gần nhất (theo ngày tạo đơn) tới hôm nay. Khách chưa từng mua thành công tách riêng.',
      identity: 'Mỗi khách = một SĐT trong một POS; chưa gộp trùng số giữa các POS.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
