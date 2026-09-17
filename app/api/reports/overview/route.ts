import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, bucketExpr, comparePeriod, vnRangeUtc } from '@/lib/report-time';
import { parseCursor } from '@/lib/sync';

// Nhóm trạng thái Pancake dùng cho tổng hợp.
export const STATUS_GROUPS = {
  new: [0, 17],
  confirmed: [1, 11, 12, 13, 20, 8, 9],
  shipping: [2],
  delivered: [3, 16],
  returned: [4, 15, 5],
  cancelled: [6, 7],
} as const;
type GroupKey = keyof typeof STATUS_GROUPS;

const inList = (codes: readonly number[]) => codes.join(',');
const NET = '(COALESCE(current_total,0)-COALESCE(total_discount,0))';
const metricColumns = `
  COUNT(*) AS orders,
  COALESCE(SUM(current_total),0) AS gross,
  COALESCE(SUM(total_discount),0) AS discount,
  COALESCE(SUM(${NET}),0) AS net,
  COALESCE(SUM(shipping_fee),0) AS shipping_fee,
  COALESCE(SUM(cod),0) AS cod,
  ${(Object.keys(STATUS_GROUPS) as GroupKey[]).map((key) => `
  SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN 1 ELSE 0 END) AS ${key}_orders,
  COALESCE(SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN ${NET} ELSE 0 END),0) AS ${key}_net`).join(',')},
  COALESCE(SUM(CASE WHEN status_code NOT IN (${inList(STATUS_GROUPS.cancelled)}) THEN ${NET} ELSE 0 END),0) AS valid_net,
  SUM(CASE WHEN status_code NOT IN (${inList(STATUS_GROUPS.cancelled)}) THEN 1 ELSE 0 END) AS valid_orders,
  COUNT(DISTINCT CASE WHEN phone IS NOT NULL AND phone<>'' THEN pos_id||':'||phone END) AS customers
`;

type MetricRow = Record<string, number | string | null>;

function toMetrics(row: MetricRow | null) {
  const n = (k: string) => Number(row?.[k] ?? 0);
  const groups = Object.fromEntries((Object.keys(STATUS_GROUPS) as GroupKey[]).map((key) => [
    key, { orders: n(`${key}_orders`), net: n(`${key}_net`) },
  ])) as Record<GroupKey, { orders: number; net: number }>;
  return {
    orders: n('orders'), gross: n('gross'), discount: n('discount'), net: n('net'),
    shippingFee: n('shipping_fee'), cod: n('cod'), customers: n('customers'),
    validOrders: n('valid_orders'), validNet: n('valid_net'),
    averageOrder: n('valid_orders') ? n('valid_net') / n('valid_orders') : null,
    deliveredAverage: groups.delivered.orders ? groups.delivered.net / groups.delivered.orders : null,
    groups,
  };
}
export type Metrics = ReturnType<typeof toMetrics>;

async function periodReport(
  posIds: string[], start: string, end: string, groupBy: 'day' | 'week' | 'month',
  employeeIds: string[], detail: boolean,
) {
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const posPlaceholders = posIds.map(() => '?').join(',');
  const employeeFilter = employeeIds.length ? ` AND seller_id IN (${employeeIds.map(() => '?').join(',')})` : '';
  const where = `pos_id IN (${posPlaceholders}) AND created_at>=? AND created_at<? AND is_removed=0${employeeFilter}`;
  const binds = [...posIds, startUtc, endUtc, ...employeeIds];
  const bucket = bucketExpr('created_at', groupBy);
  const db = env.DB;
  const queries = [
    db.prepare(`SELECT ${metricColumns} FROM raw_pos_orders WHERE ${where}`).bind(...binds),
    db.prepare(`SELECT pos_id, ${metricColumns} FROM raw_pos_orders WHERE ${where} GROUP BY pos_id`).bind(...binds),
    db.prepare(`SELECT ${bucket} AS bucket, pos_id, ${metricColumns} FROM raw_pos_orders WHERE ${where} GROUP BY bucket, pos_id ORDER BY bucket`).bind(...binds),
  ];
  if (detail) {
    queries.push(
      db.prepare(`SELECT COALESCE(seller_id,'') AS seller_id, ${metricColumns} FROM raw_pos_orders WHERE ${where} GROUP BY seller_id ORDER BY valid_net DESC LIMIT 100`).bind(...binds),
      db.prepare(`
        SELECT i.pos_id, COALESCE(i.product_id,'') AS product_id, MAX(i.name) AS item_name,
          COUNT(DISTINCT i.order_id) AS orders,
          SUM(i.quantity) AS quantity,
          SUM(i.line_total) AS total,
          SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.quantity ELSE 0 END) AS delivered_quantity,
          SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.line_total ELSE 0 END) AS delivered_total,
          SUM(CASE WHEN o.status_code NOT IN (${inList(STATUS_GROUPS.cancelled)}) THEN i.line_total ELSE 0 END) AS valid_total,
          SUM(i.returned_count) AS returned_quantity
        FROM raw_pos_order_items i JOIN raw_pos_orders o ON o.id=i.order_id
        WHERE ${where.replace(/\b(pos_id|created_at|is_removed|seller_id)\b/g, 'o.$1')}
        GROUP BY i.pos_id, i.product_id ORDER BY valid_total DESC LIMIT 200`).bind(...binds),
    );
  }
  const [total, byPos, series, byEmployee, byProduct] = await db.batch(queries);
  return {
    period: { start, end, startUtc, endUtc },
    total: toMetrics((total.results[0] as MetricRow) ?? null),
    byPos: (byPos.results as MetricRow[]).map((r) => ({ posId: String(r.pos_id), ...toMetrics(r) })),
    series: (series.results as MetricRow[]).map((r) => ({ bucket: String(r.bucket), posId: String(r.pos_id), ...toMetrics(r) })),
    byEmployee: byEmployee ? (byEmployee.results as MetricRow[]).map((r) => ({ sellerId: String(r.seller_id), ...toMetrics(r) })) : [],
    byProduct: byProduct ? (byProduct.results as MetricRow[]).map((r) => ({
      posId: String(r.pos_id), productId: String(r.product_id), itemName: String(r.item_name ?? ''),
      orders: Number(r.orders), quantity: Number(r.quantity), total: Number(r.total),
      deliveredQuantity: Number(r.delivered_quantity), deliveredTotal: Number(r.delivered_total),
      validTotal: Number(r.valid_total), returnedQuantity: Number(r.returned_quantity),
    })) : [],
  };
}

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized('Đăng nhập để xem báo cáo.');
  const params = new URL(request.url).searchParams;
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end)
    return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((p) => p.id));
  const requested = (params.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id)))
    return Response.json({ error: 'Bộ lọc POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((p) => p.id);
  const employeeIds = (params.get('employeeIds') ?? '').split(',').filter(Boolean).slice(0, 50);
  const groupBy = (['day', 'week', 'month'] as const).find((g) => g === params.get('groupBy')) ?? 'day';
  const compare = params.get('compare') ?? 'none';
  let comparePeriodRange: { start: string; end: string } | null = null;
  if (compare === 'previous' || compare === 'year') comparePeriodRange = comparePeriod(start, end, compare);
  else if (compare === 'custom') {
    const cs = params.get('cstart') ?? '', ce = params.get('cend') ?? '';
    if (!DATE_RE.test(cs) || !DATE_RE.test(ce) || cs > ce)
      return Response.json({ error: 'Kỳ so sánh không hợp lệ.' }, { status: 400 });
    comparePeriodRange = { start: cs, end: ce };
  }

  const [current, previous, shops, names, products] = await Promise.all([
    periodReport(posIds, start, end, groupBy, employeeIds, true),
    comparePeriodRange ? periodReport(posIds, comparePeriodRange.start, comparePeriodRange.end, groupBy, employeeIds, true) : null,
    env.DB.prepare(`SELECT id,shop_id,status,last_sync_at,history_start,cursor,enabled,last_error FROM pos_shops WHERE id IN (${posIds.map(() => '?').join(',')})`)
      .bind(...posIds).all<{ id: string; shop_id: string | null; status: string; last_sync_at: string | null; history_start: string | null; cursor: string | null; enabled: number; last_error: string | null }>(),
    env.DB.prepare('SELECT user_id,name FROM pos_users WHERE name<>\'\'').all<{ user_id: string; name: string }>(),
    env.DB.prepare(`SELECT pos_id,product_id,MAX(product_name) AS name FROM pos_products WHERE pos_id IN (${posIds.map(() => '?').join(',')}) GROUP BY pos_id,product_id`)
      .bind(...posIds).all<{ pos_id: string; product_id: string; name: string }>(),
  ]);
  const nameMap = new Map(names.results.map((r) => [r.user_id, r.name]));
  const productMap = new Map(products.results.map((r) => [`${r.pos_id}:${r.product_id}`, r.name]));
  const withNames = (report: Awaited<ReturnType<typeof periodReport>>) => ({
    ...report,
    byEmployee: report.byEmployee.map((r) => ({
      ...r, name: r.sellerId ? nameMap.get(r.sellerId) ?? `NV ${r.sellerId.slice(0, 8)}` : 'Chưa gán người bán',
    })),
    byProduct: report.byProduct.map((r) => ({
      ...r, name: productMap.get(`${r.posId}:${r.productId}`) || r.itemName || 'Sản phẩm không tên',
    })),
  });
  return Response.json({
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Ho_Chi_Minh',
    groupBy,
    pos: POS.filter((p) => posIds.includes(p.id)).map((p) => {
      const shop = shops.results.find((s) => s.id === p.id);
      const cursor = parseCursor(shop?.cursor ?? null);
      return {
        id: p.id, name: p.name, connected: !!shop?.shop_id, status: shop?.status ?? 'pending',
        syncedAt: shop?.last_sync_at ?? null, historyStart: shop?.history_start ?? null,
        backfillDone: !!cursor?.completed, backfillMonth: cursor?.month ?? null, lastError: shop?.last_error ?? null,
      };
    }),
    syncedAt: shops.results.map((s) => s.last_sync_at).filter(Boolean).sort()[0] ?? null,
    current: withNames(current),
    compare: previous ? withNames(previous) : null,
    definitions: {
      net: 'Tiền hàng thuần = tổng giá trị sản phẩm − giảm giá (chưa gồm phí vận chuyển).',
      basis: 'Đơn tính theo ngày tạo đơn (giờ Việt Nam). Trạng thái là trạng thái hiện tại lúc đồng bộ.',
      groups: 'Mới: 0,17 · Đã xác nhận/đang xử lý: 1,8,9,11,12,13,20 · Đang giao: 2 · Giao thành công: 3,16 · Hoàn: 4,5,15 · Hủy: 6,7.',
      valid: 'Đơn hợp lệ = mọi đơn trừ Hủy/Xóa.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
