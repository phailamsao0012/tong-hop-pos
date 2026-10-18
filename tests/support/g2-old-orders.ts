import { normalizePhone } from '../../lib/customer-stats';
import { noteStatements } from '../../lib/customers-sync';
import { CANCELLED_STATUSES, DELIVERED_STATUSES, RETURNED_STATUSES, type SourceOrder } from '../../lib/pancake';
import { NOT_CLOSED_CODES } from '../../lib/stats';
import { SENT_CODES } from '../../lib/shipping-lines';
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown) => typeof v === 'string' && v ? v : null;
export function oldOrderStatements(db: D1Database, posId: string, shopId: string, o: SourceOrder, now: string) {
  if (o.id === undefined || o.id === null) return [];
  const id = `${posId}:${o.id}`;
  const history = Array.isArray(o.status_history)
    ? o.status_history.map((h) => ({
        old_status: h.old_status ?? null, status: h.status ?? null,
        editor_id: h.editor_id ?? null, updated_at: h.updated_at ?? null,
      })).filter((h) => h.updated_at)
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
    : [];
  const firstWith = (codes: number[]) => history.find((h) => h.status !== null && codes.includes(h.status));
  const first = firstWith([1]);
  // Chốt = lần đầu vào Chờ xác nhận hoặc trạng thái sau đó (anh Vũ 08/10/2026); thiếu lịch sử thì lấy giờ xác nhận / giờ cập nhật.
  // Mục lịch sử đầu tiên mà trạng thái cũ đã là chốt (đơn tạo thẳng ở Chờ xác nhận) thì chốt từ lúc tạo đơn.
  const isClosed = (code: number | null) => code !== null && !NOT_CLOSED_CODES.includes(code);
  const closedStep = history.find((h) => isClosed(h.old_status) || isClosed(h.status));
  const closedAt = closedStep
    ? (isClosed(closedStep.old_status) ? str(o.inserted_at) ?? closedStep.updated_at : closedStep.updated_at)
    : isClosed(Number.isInteger(o.status) ? o.status! : null) ? first?.updated_at ?? str(o.updated_at) ?? now : null;
  const delivered = firstWith(DELIVERED_STATUSES);
  const returned = firstWith(RETURNED_STATUSES);
  const cancelled = firstWith(CANCELLED_STATUSES);
  const lastStatusAt = history.at(-1)?.updated_at ?? null;
  // Giờ gửi = lần đầu giao cho đơn vị vận chuyển (Vận đơn tính theo ngày gửi hàng, anh Vũ 10/10/2026). Thiếu lịch sử mà đang ở
  // trạng thái đã gửi: lấy giờ đổi trạng thái gần nhất, không có thì giờ cập nhật.
  // Mục lịch sử đầu tiên mà trạng thái cũ đã là gửi (đơn tạo thẳng ở trạng thái gửi): gửi từ lúc tạo đơn, như giờ chốt ở trên.
  // Thiếu lịch sử mà đang ở trạng thái gửi: giờ xác nhận lần đầu (gửi thường ngay sau xác nhận; giờ giao, hoàn, đổi trạng thái cuối
  // đều muộn hơn ngày gửi), rồi mới tới giờ đổi trạng thái gần nhất, giờ cập nhật.
  const isSent = (code: number | null) => code !== null && SENT_CODES.includes(code);
  const sentStep = history.find((h) => isSent(h.old_status) || isSent(h.status));
  const sentAt = sentStep
    ? (isSent(sentStep.old_status) ? str(o.inserted_at) ?? sentStep.updated_at : sentStep.updated_at)
    : isSent(Number.isInteger(o.status) ? o.status! : null) ? first?.updated_at ?? lastStatusAt ?? str(o.updated_at) ?? now : null;
  const items = Array.isArray(o.items) ? o.items : [];
  const compactItems = items.map((i) => ({
    product_id: i.product_id ?? null, variation_id: i.variation_id ?? null,
    quantity: i.quantity ?? null, returned_count: i.returned_count ?? null,
    retail_price: i.variation_info?.retail_price ?? null,
  }));
  const status = Number.isInteger(o.status) ? o.status! : null;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,created_at,updated_at,status_code,seller_id,seller_assigned_at,care_id,current_total,first_confirmed_at,first_confirmed_by,status_history_json,other_history_json,item_json,history_limited,fetched_at,
        customer_name,customer_id,total_discount,shipping_fee,cod,money_to_collect,total_quantity,sub_status,creator_id,last_editor_id,marketer_id,care_assigned_at,delivered_at,returned_at,cancelled_at,last_status_at,order_source,warehouse_id,tags_json,note,is_removed,raw_json,net_total,first_closed_at,first_sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,created_at=excluded.created_at,updated_at=excluded.updated_at,status_code=excluded.status_code,seller_id=excluded.seller_id,seller_assigned_at=excluded.seller_assigned_at,care_id=excluded.care_id,current_total=excluded.current_total,
        first_confirmed_at=COALESCE(raw_pos_orders.first_confirmed_at,excluded.first_confirmed_at),first_confirmed_by=COALESCE(raw_pos_orders.first_confirmed_by,excluded.first_confirmed_by),
        status_history_json=excluded.status_history_json,item_json=excluded.item_json,history_limited=excluded.history_limited,fetched_at=excluded.fetched_at,
        customer_name=excluded.customer_name,customer_id=excluded.customer_id,total_discount=excluded.total_discount,shipping_fee=excluded.shipping_fee,cod=excluded.cod,money_to_collect=excluded.money_to_collect,total_quantity=excluded.total_quantity,sub_status=excluded.sub_status,creator_id=excluded.creator_id,last_editor_id=excluded.last_editor_id,marketer_id=excluded.marketer_id,care_assigned_at=excluded.care_assigned_at,
        delivered_at=COALESCE(raw_pos_orders.delivered_at,excluded.delivered_at),returned_at=COALESCE(raw_pos_orders.returned_at,excluded.returned_at),cancelled_at=COALESCE(raw_pos_orders.cancelled_at,excluded.cancelled_at),last_status_at=excluded.last_status_at,
        order_source=excluded.order_source,warehouse_id=excluded.warehouse_id,tags_json=excluded.tags_json,note=excluded.note,is_removed=excluded.is_removed,raw_json=excluded.raw_json,net_total=excluded.net_total,
        first_closed_at=COALESCE(MIN(raw_pos_orders.first_closed_at,excluded.first_closed_at),raw_pos_orders.first_closed_at,excluded.first_closed_at),
        first_sent_at=COALESCE(MIN(raw_pos_orders.first_sent_at,excluded.first_sent_at),raw_pos_orders.first_sent_at,excluded.first_sent_at)`,
    ).bind(
      id, posId, shopId, String(o.id), str(o.bill_phone_number),
      str(o.inserted_at), str(o.updated_at), status,
      str(o.assigning_seller?.id), str(o.time_assign_seller),
      str(o.assigning_care?.id) ?? str(o.assigning_care_id),
      num(o.total_price), first?.updated_at ?? null, first?.editor_id ?? null,
      JSON.stringify(history), '[]', JSON.stringify(compactItems),
      Array.isArray(o.histories) && o.histories.length > 0 ? 1 : 0, now,
      str(o.bill_full_name) ?? str(o.customer?.name),
      str(o.customer?.customer_id) ?? str(o.customer?.id),
      num(o.total_discount), num(o.shipping_fee), num(o.cod), num(o.money_to_collect), num(o.total_quantity),
      num(o.sub_status), str(o.creator_id) ?? str(o.creator?.id), str(o.last_editor_id) ?? str(o.last_editor?.id),
      str(o.marketer?.id), str(o.time_assign_care),
      delivered?.updated_at ?? null, returned?.updated_at ?? null, cancelled?.updated_at ?? null, lastStatusAt,
      str(o.order_sources), str(o.warehouse_id),
      JSON.stringify((o.tags ?? []).map((t) => ({ id: t.id ?? null, name: t.name ?? null }))),
      str(o.note), status === 7 ? 1 : 0,
      JSON.stringify({ ...o, histories: undefined }),
      num(o.total_price_after_sub_discount), closedAt, sentAt,
    ),
    db.prepare('DELETE FROM raw_pos_order_items WHERE order_id=?').bind(id),
  ];
  // Ghi chú khách hàng kèm trong đơn (mỗi ghi chú = một lần chăm sóc).
  statements.push(...noteStatements(db, posId, str(o.customer?.id) ?? str(o.customer?.customer_id), normalizePhone(str(o.bill_phone_number) ?? '') || null, o.customer?.notes ?? null, now, 'order'));
  items.forEach((i, index) => {
    const quantity = num(i.quantity) ?? 0;
    const price = num(i.variation_info?.retail_price) ?? 0;
    const rawDiscount = num(i.discount_each_product) ?? 0;
    const discount = i.is_discount_percent ? Math.round(price * rawDiscount / 100) : rawDiscount;
    statements.push(db.prepare(
      // OR REPLACE: hai lượt đồng bộ (bấm tay + lập lịch) có thể ghi cùng một đơn gần như đồng thời.
      'INSERT OR REPLACE INTO raw_pos_order_items (id,order_id,pos_id,product_id,variation_id,name,quantity,returned_count,retail_price,discount,line_total,seller_id,is_bonus,is_composite,one_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(
      `${id}:${index}`, id, posId, str(i.product_id) ?? str(i.variation_info?.product_id), str(i.variation_id),
      variationName(i), quantity, num(i.returned_count) ?? 0, price, discount,
      Math.max(0, (price - discount) * quantity), str(i.assigning_seller_id),
      i.is_bonus_product ? 1 : 0, i.is_composite ? 1 : 0, i.one_time_product ? 1 : 0,
    ));
  });
  return statements;
}

function variationName(i: SourceOrder['items'] extends (infer T)[] | undefined ? T : never) {
  const base = i.variation_info?.name?.trim() ?? '';
  const fields = (i.variation_info?.fields ?? []).map((f) => f.value).filter(Boolean).join(' / ');
  return fields ? `${base} (${fields})` : base;
}

