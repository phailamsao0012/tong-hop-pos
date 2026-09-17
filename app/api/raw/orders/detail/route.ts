import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';

// Chi tiết một đơn nguồn: thông tin, sản phẩm, lịch sử trạng thái, các trường Pancake đáng chú ý và JSON gốc.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return Response.json({ error: 'Đăng nhập để xem đơn nguồn.' }, { status: 401 });
  const id = (new URL(request.url).searchParams.get('id') ?? '').slice(0, 120);
  if (!id) return Response.json({ error: 'Thiếu mã đơn.' }, { status: 400 });
  const [order, items, names, shops] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM raw_pos_orders WHERE id=?').bind(id),
    env.DB.prepare('SELECT name,quantity,retail_price,discount,line_total,returned_count,is_bonus,product_id,variation_id FROM raw_pos_order_items WHERE order_id=? ORDER BY id').bind(id),
    env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
    env.DB.prepare('SELECT id, shop_id FROM pos_shops'),
  ]);
  const o = order.results[0] as Record<string, string | number | null> | undefined;
  if (!o) return Response.json({ error: 'Không tìm thấy đơn.' }, { status: 404 });
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const who = (v: string | number | null) => v ? nameMap.get(String(v)) ?? `NV ${String(v).slice(0, 8)}` : null;
  const parse = (v: string | number | null) => { try { return v ? JSON.parse(String(v)) : null; } catch { return null; } };
  const raw = parse(o.raw_json) as Record<string, unknown> | null;
  const history = (parse(o.status_history_json) as { old_status: number | null; status: number | null; editor_id: string | null; updated_at: string | null }[] | null) ?? [];
  const shopId = (shops.results as { id: string; shop_id: string | null }[]).find((s) => s.id === o.pos_id)?.shop_id ?? null;
  const pick = (k: string) => (raw?.[k] as string | number | null | undefined) ?? null;
  const addr = raw?.shipping_address as Record<string, string> | undefined;
  const checks = {
    created: !!o.created_at, assigned: !!o.seller_assigned_at, confirmed: !!o.first_confirmed_at, history: history.length > 0 && !o.history_limited, raw: !!raw,
  };
  return Response.json({
    id: o.id, orderId: o.source_order_id, posId: o.pos_id, posName: POS.find((x) => x.id === o.pos_id)?.name ?? o.pos_id, shopId,
    pancakeUrl: shopId ? `https://pos.pancake.vn/shop/${shopId}/orders?order_id=${o.source_order_id}` : null,
    phone: o.phone, customer: o.customer_name, createdAt: o.created_at, updatedAt: o.updated_at, fetchedAt: o.fetched_at,
    statusCode: o.status_code, statusName: ORDER_STATUS[Number(o.status_code)] ?? String(o.status_code), subStatus: o.sub_status,
    sellerName: who(o.seller_id), sellerAssignedAt: o.seller_assigned_at, careName: who(o.care_id), closerName: who(o.first_confirmed_by), firstConfirmedAt: o.first_confirmed_at,
    deliveredAt: o.delivered_at, returnedAt: o.returned_at, cancelledAt: o.cancelled_at, lastStatusAt: o.last_status_at,
    creatorName: who(o.creator_id), marketerName: who(o.marketer_id) ?? ((raw?.marketer as { name?: string } | null)?.name ?? null),
    gross: o.current_total, discount: o.total_discount, net: o.net_total ?? o.current_total, shippingFee: o.shipping_fee, cod: o.cod, moneyToCollect: o.money_to_collect, quantity: o.total_quantity,
    note: o.note, tags: parse(o.tags_json) ?? [], source: pick('order_sources_name') ?? o.order_source, warehouse: (raw?.warehouse_info as { name?: string } | null)?.name ?? null,
    address: addr?.full_address ?? null, province: addr?.province_name ?? null, receiver: addr?.full_name ?? null,
    returnedReason: pick('returned_reason_name'), trackingLink: pick('tracking_link'), orderLink: pick('order_link'), partner: (raw?.partner as { partner_name?: string; extend_code?: string } | null) ?? null,
    prepaid: pick('prepaid'), transferMoney: pick('transfer_money'), cash: pick('cash'), partnerFee: pick('partner_fee'), surcharge: pick('surcharge'),
    isLive: !!raw?.is_livestream || !!raw?.is_live_shopping, adsSource: pick('ads_source'), utm: { source: pick('p_utm_source'), campaign: pick('p_utm_campaign'), medium: pick('p_utm_medium') },
    historyLimited: !!o.history_limited, hasRaw: !!raw, checks,
    items: (items.results as Record<string, string | number | null>[]).map((i) => ({ name: i.name, quantity: i.quantity, price: i.retail_price, discount: i.discount, total: i.line_total, returned: i.returned_count, bonus: !!i.is_bonus })),
    history: history.map((h) => ({ from: h.old_status, to: h.status, fromName: h.old_status === null ? null : ORDER_STATUS[Number(h.old_status)] ?? String(h.old_status), toName: h.status === null ? null : ORDER_STATUS[Number(h.status)] ?? String(h.status), by: who(h.editor_id), at: h.updated_at })),
    raw,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
