// Đường dự phòng: tính trực tiếp từ bảng đơn khi bảng số liệu ngày chưa được tạo
// (đọc nhiều dòng hơn; chỉ dùng tạm cho tới khi migration được áp dụng).
import { env } from 'cloudflare:workers';
import { STATUS_GROUPS, type GroupKey } from '@/lib/stats';
import { bucketExpr, vnRangeUtc } from '@/lib/report-time';

const inList = (codes: readonly number[]) => codes.join(',');
const NET = '(COALESCE(current_total,0)-COALESCE(total_discount,0))';
// "Đơn chốt" theo Pancake: đã xác nhận trở đi (không tính Mới/Chờ XN/Hủy/Xóa).
const NOT_CLOSED = [...STATUS_GROUPS.new, ...STATUS_GROUPS.cancelled];
const CLOSED = `status_code NOT IN (${inList(NOT_CLOSED)})`;
const metricColumns = `
  SUM(CASE WHEN status_code<>7 THEN 1 ELSE 0 END) AS orders,
  SUM(CASE WHEN status_code=7 THEN 1 ELSE 0 END) AS deleted_orders,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN current_total ELSE 0 END),0) AS gross,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN total_discount ELSE 0 END),0) AS discount,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN ${NET} ELSE 0 END),0) AS net,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN shipping_fee ELSE 0 END),0) AS shipping_fee,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN cod ELSE 0 END),0) AS cod,
  SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS closed_orders,
  COALESCE(SUM(CASE WHEN ${CLOSED} THEN current_total ELSE 0 END),0) AS closed_gross,
  COALESCE(SUM(CASE WHEN ${CLOSED} THEN total_discount ELSE 0 END),0) AS closed_discount,
  COALESCE(SUM(CASE WHEN ${CLOSED} THEN ${NET} ELSE 0 END),0) AS closed_net,
  COALESCE(SUM(CASE WHEN ${CLOSED} THEN shipping_fee ELSE 0 END),0) AS closed_shipping_fee,
  COUNT(DISTINCT CASE WHEN ${CLOSED} AND phone IS NOT NULL AND phone<>'' THEN pos_id||':'||phone END) AS closed_customers,
  ${(Object.keys(STATUS_GROUPS) as GroupKey[]).map((key) => `
  SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN 1 ELSE 0 END) AS ${key}_orders,
  COALESCE(SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN ${NET} ELSE 0 END),0) AS ${key}_net`).join(',')},
  COUNT(DISTINCT CASE WHEN status_code<>7 AND phone IS NOT NULL AND phone<>'' THEN pos_id||':'||phone END) AS customers
`;

type MetricRow = Record<string, number | string | null>;

function toMetrics(row: MetricRow | null, quantity = 0) {
  const n = (k: string) => Number(row?.[k] ?? 0);
  const groups = Object.fromEntries((Object.keys(STATUS_GROUPS) as GroupKey[]).map((key) => [
    key, { orders: n(`${key}_orders`), net: n(`${key}_net`) },
  ])) as Record<GroupKey, { orders: number; net: number }>;
  const closedOrders = n('closed_orders');
  return {
    orders: n('orders'), deletedOrders: n('deleted_orders'), gross: n('gross'), discount: n('discount'), net: n('net'),
    shippingFee: n('shipping_fee'), cod: n('cod'), customers: n('customers'),
    // Khái niệm Pancake: Đơn chốt, Doanh số (trước giảm giá), Doanh thu (sau giảm giá), GTTB, SL bán thực, Số khách.
    closedOrders, closedGross: n('closed_gross'), closedDiscount: n('closed_discount'), closedNet: n('closed_net'),
    closedShippingFee: n('closed_shipping_fee'), closedCustomers: n('closed_customers'), closedQuantity: quantity,
    closeRate: n('orders') ? closedOrders / n('orders') * 100 : null,
    averageOrder: closedOrders ? n('closed_net') / closedOrders : null,
    deliveredAverage: groups.delivered.orders ? groups.delivered.net / groups.delivered.orders : null,
    groups,
  };
}


export async function periodReportRaw(
  posIds: string[], start: string, end: string, groupBy: 'day' | 'week' | 'month',
  employeeIds: string[], detail: boolean,
) {
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const posPlaceholders = posIds.map(() => '?').join(',');
  const employeeFilter = employeeIds.length ? ` AND seller_id IN (${employeeIds.map(() => '?').join(',')})` : '';
  const where = `pos_id IN (${posPlaceholders}) AND created_at>=? AND created_at<?${employeeFilter}`;
  const binds = [...posIds, startUtc, endUtc, ...employeeIds];
  const oWhere = where.replace(/\b(pos_id|created_at|seller_id)\b/g, 'o.$1');
  const bucket = bucketExpr('created_at', groupBy);
  const db = env.DB;
  const quantitySql = (group: string) => `
    SELECT ${group} AS key, SUM(i.quantity) AS quantity
    FROM raw_pos_order_items i JOIN raw_pos_orders o ON o.id=i.order_id
    WHERE ${oWhere} AND o.${CLOSED} GROUP BY key`;
  const queries = [
    db.prepare(`SELECT ${metricColumns} FROM raw_pos_orders WHERE ${where}`).bind(...binds),
    db.prepare(`SELECT pos_id, ${metricColumns} FROM raw_pos_orders WHERE ${where} GROUP BY pos_id`).bind(...binds),
    db.prepare(`SELECT ${bucket} AS bucket, pos_id, ${metricColumns} FROM raw_pos_orders WHERE ${where} GROUP BY bucket, pos_id ORDER BY bucket`).bind(...binds),
    db.prepare(quantitySql('o.pos_id')).bind(...binds),
  ];
  if (detail) {
    queries.push(
      db.prepare(`SELECT COALESCE(seller_id,'') AS seller_id, ${metricColumns} FROM raw_pos_orders WHERE ${where} GROUP BY seller_id ORDER BY closed_net DESC LIMIT 150`).bind(...binds),
      db.prepare(quantitySql("COALESCE(o.seller_id,'')")).bind(...binds),
      db.prepare(`
        SELECT i.pos_id, COALESCE(i.product_id,'') AS product_id, MAX(i.name) AS item_name,
          COUNT(DISTINCT i.order_id) AS orders,
          SUM(i.quantity) AS quantity,
          SUM(i.line_total) AS total,
          SUM(CASE WHEN o.${CLOSED} THEN i.quantity ELSE 0 END) AS closed_quantity,
          SUM(CASE WHEN o.${CLOSED} THEN i.line_total ELSE 0 END) AS closed_total,
          SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.quantity ELSE 0 END) AS delivered_quantity,
          SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.line_total ELSE 0 END) AS delivered_total,
          SUM(i.returned_count) AS returned_quantity
        FROM raw_pos_order_items i JOIN raw_pos_orders o ON o.id=i.order_id
        WHERE ${oWhere} AND o.status_code<>7
        GROUP BY i.pos_id, i.product_id ORDER BY closed_total DESC LIMIT 200`).bind(...binds),
    );
  }
  const [total, byPos, series, posQty, byEmployee, empQty, byProduct] = await db.batch(queries);
  const qtyMap = (r: D1Result | undefined) => new Map((r?.results as MetricRow[] | undefined ?? []).map((x) => [String(x.key), Number(x.quantity)]));
  const posQuantity = qtyMap(posQty), empQuantity = qtyMap(empQty);
  const totalQuantity = [...posQuantity.values()].reduce((a, b) => a + b, 0);
  return {
    period: { start, end, startUtc, endUtc },
    total: toMetrics((total.results[0] as MetricRow) ?? null, totalQuantity),
    byPos: (byPos.results as MetricRow[]).map((r) => ({ posId: String(r.pos_id), ...toMetrics(r, posQuantity.get(String(r.pos_id)) ?? 0) })),
    series: (series.results as MetricRow[]).map((r) => ({ bucket: String(r.bucket), posId: String(r.pos_id), ...toMetrics(r) })),
    byEmployee: byEmployee ? (byEmployee.results as MetricRow[]).map((r) => ({ sellerId: String(r.seller_id), ...toMetrics(r, empQuantity.get(String(r.seller_id)) ?? 0) })) : [],
    byProduct: byProduct ? (byProduct.results as MetricRow[]).map((r) => ({
      posId: String(r.pos_id), productId: String(r.product_id), itemName: String(r.item_name ?? ''),
      orders: Number(r.orders), quantity: Number(r.quantity), total: Number(r.total),
      closedQuantity: Number(r.closed_quantity), closedTotal: Number(r.closed_total),
      deliveredQuantity: Number(r.delivered_quantity), deliveredTotal: Number(r.delivered_total),
      returnedQuantity: Number(r.returned_quantity),
    })) : [],
  };
}

