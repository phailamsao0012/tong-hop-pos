import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';

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
  const size = 50;
  const today = todayVn();
  // Ngày kể từ lần mua thành công gần nhất, tính theo ngày VN.
  const daysExpr = `CAST(julianday(?) - julianday(date(datetime(last_success_at,'+7 hours'))) AS INTEGER)`;
  const where: string[] = [`pos_id IN (${posIds.map(() => '?').join(',')})`];
  const binds: (string | number)[] = [...posIds];
  if (q) { where.push('(phone LIKE ? OR name LIKE ?)'); binds.push(`%${q.replace(/\D/g, '') || q}%`, `%${q}%`); }
  if (sellerId) { where.push('seller_id=?'); binds.push(sellerId); }
  if (group === 'never') where.push('success_orders=0');
  else if (group in DORMANT_GROUPS) {
    const [lo, hi] = DORMANT_GROUPS[group as keyof typeof DORMANT_GROUPS];
    where.push(`success_orders>0 AND ${daysExpr} BETWEEN ? AND ?`); binds.push(today, lo, hi);
  } else if (group === 'active') { where.push(`success_orders>0 AND ${daysExpr} < 30`); binds.push(today); }
  const whereSql = where.join(' AND ');
  const db = env.DB;
  const [rows, count, groups, names] = await db.batch([
    db.prepare(`SELECT id,pos_id,phone,name,seller_id,first_order_at,last_order_at,orders,closed_orders,success_orders,success_net,success_quantity,returned_orders,cancelled_orders,first_success_at,last_success_at,product_kinds,products_json
      FROM customer_stats WHERE ${whereSql} ORDER BY COALESCE(last_success_at,last_order_at) DESC LIMIT ? OFFSET ?`).bind(...binds, size + 1, (page - 1) * size),
    db.prepare(`SELECT COUNT(*) AS n FROM customer_stats WHERE ${whereSql}`).bind(...binds),
    // Đếm nhóm (không áp bộ lọc nhóm) để hiện tổng quan.
    db.prepare(`SELECT
        SUM(CASE WHEN success_orders=0 THEN 1 ELSE 0 END) AS never,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr}<30 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 30 AND 45 THEN 1 ELSE 0 END) AS g30,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 46 AND 60 THEN 1 ELSE 0 END) AS g46,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr} BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS g61,
        SUM(CASE WHEN success_orders>0 AND ${daysExpr}>90 THEN 1 ELSE 0 END) AS g90,
        COUNT(*) AS total
      FROM customer_stats WHERE pos_id IN (${posIds.map(() => '?').join(',')})${sellerId ? ' AND seller_id=?' : ''}`)
      .bind(today, today, today, today, today, ...posIds, ...(sellerId ? [sellerId] : [])),
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
      returnedOrders: r.returned_orders, cancelledOrders: r.cancelled_orders,
      firstSuccessAt: r.first_success_at, lastSuccessAt: r.last_success_at, daysSinceSuccess: days,
      productKinds: r.product_kinds, products: JSON.parse(r.products_json) as { productId: string; name: string; quantity: number; total: number; orders: number }[],
    };
  });
  return Response.json({
    page, size, hasMore: rows.results.length > size, total: Number((count.results[0] as { n: number }).n),
    groups: { never: Number(g.never ?? 0), active: Number(g.active ?? 0), '30-45': Number(g.g30 ?? 0), '46-60': Number(g.g46 ?? 0), '61-90': Number(g.g61 ?? 0), '90+': Number(g.g90 ?? 0), total: Number(g.total ?? 0) },
    customers: list,
    definitions: {
      success: 'Mua thành công = đơn ở trạng thái Đã nhận (3) hoặc Đã thu tiền (16); tiền mua = tổng giá sản phẩm − giảm giá.',
      dormant: 'Ngày chưa mua lại = số ngày từ lần mua thành công gần nhất (theo ngày tạo đơn) tới hôm nay. Khách chưa từng mua thành công tách riêng.',
      identity: 'Mỗi khách = một SĐT trong một POS; chưa gộp trùng số giữa các POS.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
