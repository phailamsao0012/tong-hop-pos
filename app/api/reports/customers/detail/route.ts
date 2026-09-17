import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';

// Hồ sơ một khách: số liệu tổng, lịch sử đơn (kèm sản phẩm), ghi chú trên đơn.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const posId = p.get('posId') ?? '';
  const phone = (p.get('phone') ?? '').trim();
  if (!POS.some((x) => x.id === posId) || !phone) return Response.json({ error: 'Thiếu POS hoặc SĐT.' }, { status: 400 });
  const db = env.DB;
  const [stats, orders, names] = await db.batch([
    db.prepare('SELECT * FROM customer_stats WHERE id=?').bind(`${posId}:${phone}`),
    db.prepare(`SELECT id,source_order_id,created_at,status_code,seller_id,first_confirmed_at,first_confirmed_by,delivered_at,returned_at,cancelled_at,current_total,total_discount,shipping_fee,cod,note,tags_json,customer_name
      FROM raw_pos_orders WHERE pos_id=? AND phone=? ORDER BY created_at DESC LIMIT 200`).bind(posId, phone),
    db.prepare("SELECT user_id,name FROM pos_users WHERE name<>''"),
  ]);
  const orderRows = orders.results as Record<string, string | number | null>[];
  const ids = orderRows.map((o) => String(o.id));
  const items = ids.length
    ? await db.prepare(`SELECT order_id,name,quantity,retail_price,discount,line_total,returned_count FROM raw_pos_order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Record<string, string | number>>()
    : { results: [] as Record<string, string | number>[] };
  const itemMap = new Map<string, Record<string, string | number>[]>();
  for (const i of items.results) itemMap.set(String(i.order_id), [...(itemMap.get(String(i.order_id)) ?? []), i]);
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const who = (id: string | number | null) => id ? nameMap.get(String(id)) ?? `NV ${String(id).slice(0, 8)}` : null;
  // Thứ tự mua thành công (1 = lần đầu, 2 = Upsell lần 1, ...), tính theo ngày tạo đơn tăng dần.
  const successOrder = [...orderRows].filter((o) => [3, 16].includes(Number(o.status_code))).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const rank = new Map(successOrder.map((o, i) => [String(o.id), i + 1]));
  const s = stats.results[0] as Record<string, string | number | null> | undefined;
  return Response.json({
    posId, posName: POS.find((x) => x.id === posId)?.name, phone,
    stats: s ? {
      name: s.name, sellerName: who(s.seller_id), orders: s.orders, closedOrders: s.closed_orders, successOrders: s.success_orders,
      successNet: s.success_net, successQuantity: s.success_quantity, averageOrder: Number(s.success_orders) ? Number(s.success_net) / Number(s.success_orders) : null,
      returnedOrders: s.returned_orders, cancelledOrders: s.cancelled_orders, firstOrderAt: s.first_order_at, lastOrderAt: s.last_order_at,
      firstSuccessAt: s.first_success_at, lastSuccessAt: s.last_success_at, productKinds: s.product_kinds,
      products: JSON.parse(String(s.products_json ?? '[]')),
    } : null,
    orders: orderRows.map((o) => ({
      id: o.id, sourceOrderId: o.source_order_id, createdAt: o.created_at, statusCode: o.status_code,
      statusName: ORDER_STATUS[Number(o.status_code)] ?? String(o.status_code),
      sellerName: who(o.seller_id), closerName: who(o.first_confirmed_by), confirmedAt: o.first_confirmed_at,
      deliveredAt: o.delivered_at, returnedAt: o.returned_at, cancelledAt: o.cancelled_at,
      gross: o.current_total, discount: o.total_discount, net: Number(o.current_total ?? 0) - Number(o.total_discount ?? 0),
      shippingFee: o.shipping_fee, cod: o.cod, note: o.note, tags: JSON.parse(String(o.tags_json ?? '[]')),
      successRank: rank.get(String(o.id)) ?? null,
      items: (itemMap.get(String(o.id)) ?? []).map((i) => ({ name: i.name, quantity: i.quantity, price: i.retail_price, discount: i.discount, total: i.line_total, returned: i.returned_count })),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
