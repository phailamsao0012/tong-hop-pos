import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';

// Lịch sử cuộc gọi (ghi chú) của một nhân viên trong kỳ, kèm đơn chốt cùng ngày của khách đó (để xuất Excel).
const VN_DAY = (col: string) => `date(datetime(${col},'+7 hours'))`;
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
type Note = { id: string; pos_id: string; customer_id: string | null; phone: string | null; author_name: string | null; message: string; order_id: string | null; created_at: string; source: string; customer_name: string | null; assigned_user_id: string | null; succeed_order_count: number | null; purchased_amount: number | null };
type Order = { id: string; source_order_id: string; pos_id: string; phone: string; status_code: number; created_at: string; first_confirmed_at: string | null; net: number; seller_id: string | null; items: string | null; day: string };

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const authorId = (p.get('authorId') ?? '').slice(0, 100);
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!authorId || !DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Thiếu nhân viên hoặc khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const [notes, names, sold] = await env.DB.batch([
    env.DB.prepare(`SELECT n.id, n.pos_id, n.customer_id, n.phone, n.author_name, n.message, n.order_id, n.created_at, n.source,
        c.name AS customer_name, c.assigned_user_id, c.succeed_order_count, c.purchased_amount
      FROM customer_notes n LEFT JOIN pos_customers c ON c.id = n.pos_id||':'||n.customer_id
      WHERE n.pos_id IN (${ph}) AND n.author_id=? AND n.created_at>=? AND n.created_at<? ORDER BY n.created_at DESC LIMIT 5000`).bind(...posIds, authorId, startUtc, endUtc),
    env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
    // Đơn chốt theo người bán (cùng cách tính với bảng nhân viên và Tổng quan).
    env.DB.prepare(`SELECT ${VN_DAY('o.first_confirmed_at')} AS day, COUNT(*) AS orders, SUM(${NET}) AS net FROM raw_pos_orders o
      WHERE o.pos_id IN (${ph}) AND o.seller_id=? AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7) GROUP BY 1`).bind(...posIds, authorId, startUtc, endUtc),
  ]);
  const rows = notes.results as Note[];
  const soldMap = new Map((sold.results as { day: string; orders: number; net: number }[]).map((r) => [r.day, { orders: Number(r.orders), net: Number(r.net ?? 0) }]));
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  // Đơn chốt cùng ngày của các khách đã ghi chú (theo POS + SĐT), lấy theo lô.
  const phonesByPos = new Map<string, Set<string>>();
  for (const n of rows) if (n.phone) { if (!phonesByPos.has(n.pos_id)) phonesByPos.set(n.pos_id, new Set()); phonesByPos.get(n.pos_id)!.add(n.phone); }
  const orders: Order[] = [];
  for (const [posId, phones] of phonesByPos) {
    const list = [...phones];
    for (let i = 0; i < list.length; i += 80) {
      const chunk = list.slice(i, i + 80);
      const r = await env.DB.prepare(`SELECT o.id, o.source_order_id, o.pos_id, o.phone, o.status_code, o.created_at, o.first_confirmed_at, ${NET} AS net, o.seller_id, ${VN_DAY('o.first_confirmed_at')} AS day,
          (SELECT GROUP_CONCAT(i.name||' ×'||i.quantity, ', ') FROM raw_pos_order_items i WHERE i.order_id=o.id) AS items
        FROM raw_pos_orders o WHERE o.pos_id=? AND o.phone IN (${chunk.map(() => '?').join(',')}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)`)
        .bind(posId, ...chunk, startUtc, endUtc).all<Order>();
      orders.push(...r.results);
    }
  }
  const byKey = new Map<string, Order[]>();
  for (const o of orders) { const k = `${o.pos_id}:${o.phone}:${o.day}`; byKey.set(k, [...(byKey.get(k) ?? []), o]); }
  const seenOrder = new Set<string>();
  const items = rows.map((n) => {
    const day = new Date(Date.parse(`${n.created_at}Z`) + 7 * 3600000).toISOString().slice(0, 10);
    const same = n.phone ? (byKey.get(`${n.pos_id}:${n.phone}:${day}`) ?? []) : [];
    // Mỗi đơn chỉ gắn vào ghi chú đầu tiên (theo thời gian) của khách trong ngày để không đếm trùng khi cộng.
    const own = same.filter((o) => !seenOrder.has(o.id));
    for (const o of own) seenOrder.add(o.id);
    return {
      id: n.id, posId: n.pos_id, posName: POS.find((x) => x.id === n.pos_id)?.name ?? n.pos_id, day, createdAt: n.created_at, author: n.author_name ?? nameMap.get(authorId) ?? '',
      customer: n.customer_name ?? '', phone: n.phone, customerId: n.customer_id, message: n.message, source: n.source,
      assignedTo: n.assigned_user_id ? nameMap.get(n.assigned_user_id) ?? null : null, customerSuccessOrders: n.succeed_order_count, customerPurchased: n.purchased_amount,
      orders: own.map((o) => ({ id: o.id, orderId: o.source_order_id, statusName: ORDER_STATUS[Number(o.status_code)] ?? String(o.status_code), net: Number(o.net), confirmedAt: o.first_confirmed_at, items: o.items ?? '', seller: o.seller_id ? nameMap.get(o.seller_id) ?? null : null })),
    };
  });
  // Tổng theo ngày: cuộc gọi/khách từ ghi chú; đơn chốt/doanh thu theo người bán trên đơn.
  const daysMap = new Map<string, { day: string; calls: number; customers: Set<string>; orders: number; net: number }>();
  for (const it of items) {
    const d = daysMap.get(it.day) ?? { day: it.day, calls: 0, customers: new Set<string>(), orders: 0, net: 0 };
    d.calls++; d.customers.add(`${it.posId}:${it.customerId ?? it.phone}`);
    daysMap.set(it.day, d);
  }
  for (const [day, o] of soldMap) {
    const d = daysMap.get(day) ?? { day, calls: 0, customers: new Set<string>(), orders: 0, net: 0 };
    d.orders = o.orders; d.net = o.net; daysMap.set(day, d);
  }
  return Response.json({
    authorId, author: nameMap.get(authorId) ?? rows[0]?.author_name ?? authorId, period: { start, end },
    days: [...daysMap.values()].sort((a, b) => b.day.localeCompare(a.day)).map((d) => ({ day: d.day, calls: d.calls, customers: d.customers.size, orders: d.orders, net: d.net, aov: d.orders ? d.net / d.orders : null })),
    items,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
