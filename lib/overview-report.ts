// Báo cáo tổng quan (dùng chung cho API web và bot Telegram). Đọc bảng số liệu ngày đã tính sẵn;
// số khách (đếm SĐT khác nhau) đọc bảng đơn theo index.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { comparePeriod, vnRangeUtc } from '@/lib/report-time';
import { CLOSED, PRODUCT_COLUMNS, STAT_COLUMNS, STATUS_GROUPS, type GroupKey } from '@/lib/stats';
import { parseCursor } from '@/lib/sync';

type Row = Record<string, number | string | null>;
const sumColumns = STAT_COLUMNS.map((c) => `SUM(${c}) AS ${c}`).join(',');
const sumProductColumns = PRODUCT_COLUMNS.map((c) => `SUM(${c}) AS ${c}`).join(',');

function toMetrics(row: Row | null, customers?: { all: number; closed: number }) {
  const n = (k: string) => Number(row?.[k] ?? 0);
  const groups = Object.fromEntries((Object.keys(STATUS_GROUPS) as GroupKey[]).map((key) => [
    key, { orders: n(`${key}_orders`), net: n(`${key}_net`) },
  ])) as Record<GroupKey, { orders: number; net: number }>;
  const closedOrders = n('closed_orders');
  return {
    orders: n('orders'), deletedOrders: n('deleted_orders'), gross: n('gross'), discount: n('discount'), net: n('net'),
    shippingFee: n('shipping_fee'), cod: n('cod'), customers: customers?.all ?? null,
    closedOrders, closedGross: n('closed_gross'), closedDiscount: n('closed_discount'), closedNet: n('closed_net'),
    closedShippingFee: n('closed_shipping_fee'), closedCustomers: customers?.closed ?? null, closedQuantity: n('closed_quantity'),
    assignedOrders: n('assigned_orders'),
    closeRate: n('orders') ? closedOrders / n('orders') * 100 : null,
    assignedCloseRate: n('assigned_orders') ? closedOrders / n('assigned_orders') * 100 : null,
    averageOrder: closedOrders ? n('closed_net') / closedOrders : null,
    deliveredAverage: groups.delivered.orders ? groups.delivered.net / groups.delivered.orders : null,
    groups,
  };
}
export type Metrics = ReturnType<typeof toMetrics>;

const bucketOf = (groupBy: 'day' | 'week' | 'month') =>
  groupBy === 'month' ? 'substr(day,1,7)'
    : groupBy === 'week' ? "date(day,'-' || ((strftime('%w',day)+6)%7) || ' days')"
    : 'day';

async function periodReport(
  posIds: string[], start: string, end: string, groupBy: 'day' | 'week' | 'month', employeeIds: string[],
) {
  const db = env.DB;
  const posPlaceholders = posIds.map(() => '?').join(',');
  const employeeFilter = employeeIds.length ? ` AND seller_id IN (${employeeIds.map(() => '?').join(',')})` : '';
  const where = `pos_id IN (${posPlaceholders}) AND day>=? AND day<=?${employeeFilter}`;
  const binds = [...posIds, start, end, ...employeeIds];
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  // Số khách: SĐT khác nhau của đơn tạo trong kỳ (all) và của đơn chốt trong kỳ theo ngày chốt (closed).
  const customerWhere = `pos_id IN (${posPlaceholders}) AND phone IS NOT NULL AND phone<>'' AND status_code<>7${employeeFilter}`;
  const customerBinds = [...posIds, ...employeeIds];
  const [total, byPos, series, byEmployee, byProduct, customers, closedCustomers, employeeSeries] = await db.batch([
    db.prepare(`SELECT ${sumColumns} FROM stats_daily WHERE ${where}`).bind(...binds),
    db.prepare(`SELECT pos_id, ${sumColumns} FROM stats_daily WHERE ${where} GROUP BY pos_id`).bind(...binds),
    db.prepare(`SELECT ${bucketOf(groupBy)} AS bucket, pos_id, ${sumColumns} FROM stats_daily WHERE ${where} GROUP BY bucket, pos_id ORDER BY bucket`).bind(...binds),
    db.prepare(`SELECT seller_id, ${sumColumns} FROM stats_daily WHERE ${where} GROUP BY seller_id ORDER BY closed_net DESC LIMIT 150`).bind(...binds),
    db.prepare(`SELECT pos_id, product_id, MAX(name) AS name, ${sumProductColumns} FROM stats_daily_product WHERE pos_id IN (${posPlaceholders}) AND day>=? AND day<=? GROUP BY pos_id, product_id ORDER BY closed_total DESC LIMIT 200`).bind(...posIds, start, end),
    // Số khách: đếm SĐT khác nhau trong kỳ (đọc bảng đơn theo index pos_id+created_at).
    db.prepare(`SELECT pos_id, COUNT(DISTINCT phone) AS all_customers FROM raw_pos_orders WHERE ${customerWhere} AND created_at>=? AND created_at<? GROUP BY pos_id`)
      .bind(...customerBinds, startUtc, endUtc),
    db.prepare(`SELECT pos_id, COUNT(DISTINCT phone) AS closed_customers FROM raw_pos_orders WHERE ${customerWhere} AND ${CLOSED} AND first_confirmed_at>=? AND first_confirmed_at<? GROUP BY pos_id`)
      .bind(...customerBinds, startUtc, endUtc),
    // Chuỗi theo nhân viên × ngày (cho sparkline so sánh nhân viên).
    db.prepare(`SELECT seller_id, day, SUM(closed_orders) AS closed_orders, SUM(assigned_orders) AS assigned_orders, SUM(closed_net) AS closed_net FROM stats_daily WHERE ${where} GROUP BY seller_id, day`).bind(...binds),
  ]);
  const closedMap = new Map((closedCustomers.results as Row[]).map((r) => [String(r.pos_id), Number(r.closed_customers)]));
  const customerMap = new Map<string, { all: number; closed: number }>();
  for (const r of customers.results as Row[]) customerMap.set(String(r.pos_id), { all: Number(r.all_customers), closed: closedMap.get(String(r.pos_id)) ?? 0 });
  for (const [posId, closed] of closedMap) if (!customerMap.has(posId)) customerMap.set(posId, { all: 0, closed });
  const totalCustomers = [...customerMap.values()].reduce((a, c) => ({ all: a.all + c.all, closed: a.closed + c.closed }), { all: 0, closed: 0 });
  return {
    period: { start, end },
    total: toMetrics((total.results[0] as Row) ?? null, totalCustomers),
    byPos: (byPos.results as Row[]).map((r) => ({ posId: String(r.pos_id), ...toMetrics(r, customerMap.get(String(r.pos_id)) ?? { all: 0, closed: 0 }) })),
    series: (series.results as Row[]).map((r) => ({ bucket: String(r.bucket), posId: String(r.pos_id), ...toMetrics(r) })),
    byEmployee: (byEmployee.results as Row[]).map((r) => ({ sellerId: String(r.seller_id ?? ''), ...toMetrics(r) })),
    byEmployeeDay: (employeeSeries.results as Row[]).map((r) => ({ sellerId: String(r.seller_id ?? ''), day: String(r.day), closedOrders: Number(r.closed_orders), assignedOrders: Number(r.assigned_orders), closedNet: Number(r.closed_net) })),
    byProduct: (byProduct.results as Row[]).map((r) => ({
      posId: String(r.pos_id), productId: String(r.product_id ?? ''), itemName: String(r.name ?? ''),
      orders: Number(r.orders), quantity: Number(r.quantity), total: Number(r.total),
      closedQuantity: Number(r.closed_quantity), closedTotal: Number(r.closed_total),
      deliveredQuantity: Number(r.delivered_quantity), deliveredTotal: Number(r.delivered_total),
      returnedQuantity: Number(r.returned_quantity),
    })),
  };
}


export type OverviewOptions = {
  posIds: string[]; start: string; end: string; groupBy?: 'day' | 'week' | 'month'; employeeIds?: string[];
  compare?: 'none' | 'previous' | 'year' | { start: string; end: string };
};

export async function overviewReport(options: OverviewOptions) {
  const posIds = options.posIds.length ? options.posIds : POS.map((p) => p.id);
  const { start, end } = options;
  const groupBy = options.groupBy ?? 'day';
  const employeeIds = options.employeeIds ?? [];
  const compare = options.compare ?? 'none';
  const comparePeriodRange = compare === 'none' ? null : typeof compare === 'string' ? comparePeriod(start, end, compare) : compare;
  const [current, previous, shops, names, products] = await Promise.all([
    periodReport(posIds, start, end, groupBy, employeeIds),
    comparePeriodRange ? periodReport(posIds, comparePeriodRange.start, comparePeriodRange.end, groupBy, employeeIds) : null,
    env.DB.prepare(`SELECT id,shop_id,status,last_sync_at,history_start,cursor,enabled,last_error FROM pos_shops WHERE id IN (${posIds.map(() => '?').join(',')})`)
      .bind(...posIds).all<{ id: string; shop_id: string | null; status: string; last_sync_at: string | null; history_start: string | null; cursor: string | null; enabled: number; last_error: string | null }>(),
    env.DB.prepare('SELECT user_id,name,department,sale_group FROM pos_users WHERE name<>\'\'').all<{ user_id: string; name: string; department: string | null; sale_group: string | null }>(),
    env.DB.prepare(`SELECT pos_id,product_id,MAX(product_name) AS name FROM pos_products WHERE pos_id IN (${posIds.map(() => '?').join(',')}) GROUP BY pos_id,product_id`)
      .bind(...posIds).all<{ pos_id: string; product_id: string; name: string }>(),
  ]);
  const nameMap = new Map(names.results.map((r) => [r.user_id, r.name]));
  const deptMap = new Map(names.results.filter((r) => r.department).map((r) => [r.user_id, r.department!]));
  const groupMap = new Map(names.results.filter((r) => r.sale_group).map((r) => [r.user_id, r.sale_group!]));
  const productMap = new Map(products.results.map((r) => [`${r.pos_id}:${r.product_id}`, r.name]));
  const withNames = (report: Awaited<ReturnType<typeof periodReport>>) => ({
    ...report,
    byEmployee: report.byEmployee.map((r) => ({
      ...r, name: r.sellerId ? nameMap.get(r.sellerId) ?? `NV ${r.sellerId.slice(0, 8)}` : 'Chưa gán người bán',
      department: deptMap.get(r.sellerId) ?? null, saleGroup: groupMap.get(r.sellerId) ?? null,
    })),
    byProduct: report.byProduct.map((r) => ({
      ...r, name: productMap.get(`${r.posId}:${r.productId}`) || r.itemName || 'Sản phẩm không tên',
    })),
  });
  return {

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
    departments: [...new Set(names.results.map((r) => r.department).filter(Boolean))].sort(),
    definitions: {
      basis: 'Giờ Việt Nam. Đơn tạo mới và các nhóm trạng thái tính theo ngày tạo đơn (trạng thái hiện tại lúc đồng bộ).',
      closed: 'Đơn chốt, Doanh số, Doanh thu, SL bán thực, Số khách tính theo ngày CHỐT đơn (lần đầu chuyển sang Đã xác nhận) — giống màn Tổng quan Pancake; đơn chốt = đã xác nhận trở đi, không tính Hủy/Xóa.',
      revenue: 'Doanh số = tổng giá sản phẩm của đơn chốt (chưa trừ giảm giá). Doanh thu = doanh số − giảm giá (chưa gồm phí vận chuyển). GTTB = doanh thu ÷ đơn chốt.',
      quantity: 'SL bán thực = tổng số lượng sản phẩm trong đơn chốt. Số khách = số SĐT khác nhau có đơn chốt.',
      rate: 'Tỷ lệ chốt nhân viên = đơn chốt trong kỳ ÷ đơn chia trong kỳ (đơn được giao cho nhân viên đó theo thời điểm giao người bán).',
      groups: 'Mới: 0,17 · Đã xác nhận/đang xử lý: 1,8,9,11,12,13,20 · Đang giao: 2 · Giao thành công: 3,16 · Hoàn: 4,5,15 · Hủy: 6 · Xóa: 7.',
    },
  };
}
export type OverviewReport = Awaited<ReturnType<typeof overviewReport>>;
