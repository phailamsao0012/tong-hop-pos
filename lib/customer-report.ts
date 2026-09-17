// Hồ sơ một khách (dùng chung cho web và bot).
import { env } from 'cloudflare:workers';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';

export async function customerDetail(posId: string, phone: string) {
  const db = env.DB;
  const [stats, orders, names] = await db.batch([
    db.prepare('SELECT * FROM customer_stats WHERE id=?').bind(`${posId}:${phone}`),
    db.prepare(`SELECT id,source_order_id,created_at,status_code,seller_id,first_confirmed_at,first_confirmed_by,delivered_at,returned_at,cancelled_at,current_total,total_discount,net_total,shipping_fee,cod,note,tags_json,customer_name,order_source,
        json_extract(raw_json,'$.order_sources_name') AS source_name, json_extract(raw_json,'$.returned_reason_name') AS returned_reason, json_extract(raw_json,'$.order_link') AS order_link,
        json_extract(raw_json,'$.shipping_address.full_address') AS address, json_extract(raw_json,'$.shipping_address.province_name') AS province,
        json_extract(raw_json,'$.customer.gender') AS gender, json_extract(raw_json,'$.customer.date_of_birth') AS dob, json_extract(raw_json,'$.customer.level') AS level,
        json_extract(raw_json,'$.customer.reward_point') AS reward_point, json_extract(raw_json,'$.customer.tags') AS customer_tags, json_extract(raw_json,'$.customer.notes') AS customer_notes,
        json_extract(raw_json,'$.customer.inserted_at') AS customer_since, json_extract(raw_json,'$.customer.succeed_order_count') AS pancake_success, json_extract(raw_json,'$.customer.purchased_amount') AS pancake_amount,
        json_extract(raw_json,'$.bill_email') AS email, json_extract(raw_json,'$.marketer.name') AS marketer_name
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
  // Hồ sơ Pancake: lấy từ đơn gần nhất có JSON gốc.
  const latest = orderRows.find((o) => o.address !== null || o.gender !== null || o.customer_since !== null) ?? orderRows[0];
  const parseJson = (v: unknown) => { try { return v ? JSON.parse(String(v)) : null; } catch { return null; } };
  const tags = (parseJson(latest?.customer_tags) as { name?: string; text?: string }[] | null) ?? [];
  const profile = latest ? {
    address: latest.address ?? null, province: latest.province ?? null, gender: latest.gender ?? null, dob: latest.dob ?? null,
    level: latest.level ?? null, rewardPoint: latest.reward_point ?? null, email: latest.email ?? null, customerSince: latest.customer_since ?? null,
    pancakeSuccessOrders: latest.pancake_success ?? null, pancakeAmount: latest.pancake_amount ?? null,
    tags: tags.map((t) => (typeof t === 'string' ? t : t.name ?? t.text ?? '')).filter(Boolean),
    notes: (parseJson(latest.customer_notes) as { content?: string; note?: string }[] | null)?.map((n) => (typeof n === 'string' ? n : n.content ?? n.note ?? '')).filter(Boolean) ?? [],
    sources: [...new Set(orderRows.map((o) => o.source_name).filter(Boolean))],
    marketers: [...new Set(orderRows.map((o) => o.marketer_name).filter(Boolean))],
  } : null;
  return {
    profile,

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
      gross: o.current_total, net: o.net_total != null ? Number(o.net_total) : Number(o.current_total ?? 0) - Number(o.total_discount ?? 0), discount: Number(o.current_total ?? 0) - (o.net_total != null ? Number(o.net_total) : Number(o.current_total ?? 0) - Number(o.total_discount ?? 0)),
      shippingFee: o.shipping_fee, cod: o.cod, note: o.note, tags: JSON.parse(String(o.tags_json ?? '[]')),
      sourceName: o.source_name, returnedReason: o.returned_reason, orderLink: o.order_link, marketerName: o.marketer_name,
      successRank: rank.get(String(o.id)) ?? null,
      items: (itemMap.get(String(o.id)) ?? []).map((i) => ({ name: i.name, quantity: i.quantity, price: i.retail_price, discount: i.discount, total: i.line_total, returned: i.returned_count })),
    })),
  };
}
export type CustomerDetail = Awaited<ReturnType<typeof customerDetail>>;

/** Tìm khách theo SĐT/tên trên mọi POS (cho bot). */
export async function findCustomers(query: string, limit = 5) {
  const digits = query.replace(/\D/g, '');
  const rows = await env.DB.prepare(
    'SELECT pos_id,phone,name,success_orders,success_net,last_success_at FROM customer_stats WHERE phone LIKE ? OR name LIKE ? ORDER BY success_net DESC LIMIT ?',
  ).bind(`%${digits || query}%`, `%${query}%`, limit).all<{ pos_id: string; phone: string; name: string; success_orders: number; success_net: number; last_success_at: string | null }>();
  return rows.results.map((r) => ({ ...r, posName: POS.find((p) => p.id === r.pos_id)?.name ?? r.pos_id }));
}
