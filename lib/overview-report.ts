// Báo cáo tổng quan (dùng chung cho API web và bot Telegram). Đọc bảng số liệu ngày đã tính sẵn;
// số khách (đếm SĐT khác nhau) đọc bảng đơn theo index.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { comparePeriod, vnRangeUtc } from '@/lib/report-time';
import { CLOSED, NET, PRODUCT_COLUMNS, STAT_COLUMNS, STATUS_GROUPS, type GroupKey } from '@/lib/stats';
import { parseCursor } from '@/lib/sync';
import { teamFilter, type Team } from '@/lib/team';

import { EMPTY_ORDER_FILTERS, orderFilterSql, segmentedStats, type OrderFilters } from './order-segments';

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
    assignedOrders: n('assigned_orders'), assignedHidden: false,
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
  posIds: string[], start: string, end: string, groupBy: 'day' | 'week' | 'month', employeeIds: string[], team: Team = 'all', filters: OrderFilters = EMPTY_ORDER_FILTERS,
) {
  const db = env.DB;
  const posPlaceholders = posIds.map(() => '?').join(',');
  const employeeFilter = (employeeIds.length ? ` AND seller_id IN (${employeeIds.map(() => '?').join(',')})` : '') + teamFilter('seller_id', team);
  const where = `pos_id IN (${posPlaceholders}) AND day>=? AND day<=?${employeeFilter}`;
  const binds = [...posIds, start, end, ...employeeIds];
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const rawFilter = orderFilterSql(filters, team, 'raw_pos_orders');
  const virtual = segmentedStats(posIds, startUtc, endUtc, team, filters, employeeIds);
  const filtered = filters.productSegment !== 'all' || team === 'cskh';
  const stats = (sql: string, product = false) => {
    const useRaw = filtered || (product && (team !== 'all' || employeeIds.length > 0));
    return { bind: (...args: (string | number)[]) => db.prepare((useRaw ? virtual.sql : '') + sql).bind(...(useRaw ? virtual.binds : []), ...args) };
  };
  // Số khách: SĐT khác nhau của đơn tạo trong kỳ (all) và của đơn chốt trong kỳ theo ngày chốt (closed).
  const customerWhere = `pos_id IN (${posPlaceholders}) AND phone IS NOT NULL AND phone<>'' AND status_code<>7${employeeFilter}${rawFilter.sql}`;
  const customerBinds = [...posIds, ...employeeIds, ...rawFilter.binds];
  const [total, byPos, series, byEmployee, byEmployeePos, byProduct, customers, closedCustomers, employeeSeries, recon] = await db.batch([
    stats(`SELECT ${sumColumns} FROM stats_daily WHERE ${where}`).bind(...binds),
    stats(`SELECT pos_id, ${sumColumns} FROM stats_daily WHERE ${where} GROUP BY pos_id`).bind(...binds),
    stats(`SELECT ${bucketOf(groupBy)} AS bucket, pos_id, ${sumColumns} FROM stats_daily WHERE ${where} GROUP BY bucket, pos_id ORDER BY bucket`).bind(...binds),
    stats(`SELECT seller_id, ${sumColumns} FROM stats_daily WHERE ${where} GROUP BY seller_id ORDER BY closed_net DESC LIMIT 150`).bind(...binds),
    // Nhân viên × POS: mỗi POS chỉ có số của nhân viên POS đó (yêu cầu 19/09/2026).
    stats(`SELECT pos_id, seller_id, ${sumColumns} FROM stats_daily WHERE ${where} GROUP BY pos_id, seller_id ORDER BY closed_net DESC LIMIT 600`).bind(...binds),
    stats(`SELECT pos_id, product_id, MAX(name) AS name, ${sumProductColumns} FROM stats_daily_product WHERE pos_id IN (${posPlaceholders}) AND day>=? AND day<=? GROUP BY pos_id, product_id ORDER BY closed_total DESC LIMIT 200`, true).bind(...posIds, start, end),
    // Số khách: đếm SĐT khác nhau trong kỳ (đọc bảng đơn theo index pos_id+created_at).
    db.prepare(`SELECT pos_id, COUNT(DISTINCT phone) AS all_customers FROM raw_pos_orders WHERE ${customerWhere} AND created_at>=? AND created_at<? GROUP BY pos_id`)
      .bind(...customerBinds, startUtc, endUtc),
    db.prepare(`SELECT pos_id, COUNT(DISTINCT phone) AS closed_customers FROM raw_pos_orders WHERE ${customerWhere} AND ${CLOSED} AND first_confirmed_at>=? AND first_confirmed_at<? GROUP BY pos_id`)
      .bind(...customerBinds, startUtc, endUtc),
    // Chuỗi theo nhân viên × ngày (cho sparkline so sánh nhân viên).
    stats(`SELECT seller_id, day, SUM(closed_orders) AS closed_orders, SUM(assigned_orders) AS assigned_orders, SUM(closed_net) AS closed_net FROM stats_daily WHERE ${where} GROUP BY seller_id, day`).bind(...binds),
    // Đối chiếu: đếm lại đơn chốt, doanh số và doanh thu THẲNG từ đơn gốc (chỉ mục bao phủ idx_raw_orders_pos_confirmed_status_money),
    // độc lập với bảng stats_daily; giao diện so hai kết quả và báo vàng nếu lệch.
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(current_total,0)),0) AS gross, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders
      WHERE pos_id IN (${posPlaceholders}) AND first_confirmed_at>=? AND first_confirmed_at<? AND ${CLOSED}${employeeFilter}${rawFilter.sql}`).bind(...posIds, startUtc, endUtc, ...employeeIds, ...rawFilter.binds),
  ]);
  const reconRow = (recon.results[0] as Row) ?? null;
  const reconcile = reconRow ? { orders: Number(reconRow.n ?? 0), gross: Number(reconRow.gross ?? 0), net: Number(reconRow.net ?? 0), discount: Number(reconRow.gross ?? 0) - Number(reconRow.net ?? 0) } : null;
  const closedMap = new Map((closedCustomers.results as Row[]).map((r) => [String(r.pos_id), Number(r.closed_customers)]));
  const customerMap = new Map<string, { all: number; closed: number }>();
  for (const r of customers.results as Row[]) customerMap.set(String(r.pos_id), { all: Number(r.all_customers), closed: closedMap.get(String(r.pos_id)) ?? 0 });
  for (const [posId, closed] of closedMap) if (!customerMap.has(posId)) customerMap.set(posId, { all: 0, closed });
  const totalCustomers = [...customerMap.values()].reduce((a, c) => ({ all: a.all + c.all, closed: a.closed + c.closed }), { all: 0, closed: 0 });
  return {
    period: { start, end },
    reconcile,
    total: toMetrics((total.results[0] as Row) ?? null, totalCustomers),
    byPos: (byPos.results as Row[]).map((r) => ({ posId: String(r.pos_id), ...toMetrics(r, customerMap.get(String(r.pos_id)) ?? { all: 0, closed: 0 }) })),
    series: (series.results as Row[]).map((r) => ({ bucket: String(r.bucket), posId: String(r.pos_id), ...toMetrics(r) })),
    byEmployee: (byEmployee.results as Row[]).map((r) => ({ sellerId: String(r.seller_id ?? ''), ...toMetrics(r) })),
    byEmployeePos: (byEmployeePos.results as Row[]).map((r) => ({ posId: String(r.pos_id), sellerId: String(r.seller_id ?? ''), ...toMetrics(r) })),
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
  posIds: string[]; start: string; end: string; groupBy?: 'day' | 'week' | 'month'; employeeIds?: string[]; team?: Team;
  filters?: OrderFilters;
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
    periodReport(posIds, start, end, groupBy, employeeIds, options.team ?? 'all', options.filters),
    comparePeriodRange ? periodReport(posIds, comparePeriodRange.start, comparePeriodRange.end, groupBy, employeeIds, options.team ?? 'all', options.filters) : null,
    env.DB.prepare(`SELECT id,shop_id,status,last_sync_at,history_start,cursor,enabled,last_error FROM pos_shops WHERE id IN (${posIds.map(() => '?').join(',')})`)
      .bind(...posIds).all<{ id: string; shop_id: string | null; status: string; last_sync_at: string | null; history_start: string | null; cursor: string | null; enabled: number; last_error: string | null }>(),
    env.DB.prepare('SELECT user_id,name,department,sale_group FROM pos_users WHERE name<>\'\'').all<{ user_id: string; name: string; department: string | null; sale_group: string | null }>(),
    env.DB.prepare(`SELECT pos_id,product_id,MAX(product_name) AS name FROM pos_products WHERE pos_id IN (${posIds.map(() => '?').join(',')}) GROUP BY pos_id,product_id`)
      .bind(...posIds).all<{ pos_id: string; product_id: string; name: string }>(),
  ]);
  const filters = options.filters ?? EMPTY_ORDER_FILTERS;
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const querySummary = (f: OrderFilters, team = options.team ?? 'all', group = '') => {
    const v = segmentedStats(posIds, startUtc, endUtc, team, f, employeeIds);
    return env.DB.prepare(v.sql + `SELECT ${group ? 'marketer_id,' : ''}${sumColumns} FROM stats_daily ${group}`).bind(...v.binds);
  };
  const [productSummaries, originSummary] = await Promise.all([
    options.team === 'sale' ? env.DB.batch(['gentadox', 'skgk'].map(productSegment => querySummary({ ...filters, productSegment: productSegment as OrderFilters['productSegment'] }))) : null,
    options.team === 'cskh' ? querySummary({ ...filters, orderOrigin: 'all', marketerId: '' }, 'cskh', 'GROUP BY marketer_id').all<Row>() : null,
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
    byEmployeePos: report.byEmployeePos.map((r) => ({
      ...r, name: r.sellerId ? nameMap.get(r.sellerId) ?? `NV ${r.sellerId.slice(0, 8)}` : 'Chưa gán người bán',
      department: deptMap.get(r.sellerId) ?? null, saleGroup: groupMap.get(r.sellerId) ?? null,
    })),
    byProduct: report.byProduct.map((r) => ({
      ...r, name: productMap.get(`${r.posId}:${r.productId}`) || r.itemName || 'Sản phẩm không tên',
    })),
  });
  return {

    filters,
    productSegments: productSummaries ? productSummaries.map((r, i) => ({ key: i === 0 ? 'gentadox' : 'skgk', ...toMetrics(r.results[0] as Row ?? null) })) : [],
    origins: originSummary ? originSummary.results.map(r => ({ marketerId: String(r.marketer_id ?? ''), marketerName: r.marketer_id ? nameMap.get(String(r.marketer_id)) ?? `MKT ${r.marketer_id}` : 'Tự ups', ...toMetrics(r) })) : [],
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Ho_Chi_Minh',
    groupBy,
    comparePeriod: comparePeriodRange,
    pos: POS.filter((p) => posIds.includes(p.id)).map((p) => {
      const shop = shops.results.find((s) => s.id === p.id);
      const cursor = parseCursor(shop?.cursor ?? null);
      return {
        id: p.id, name: p.name, connected: !!shop?.shop_id, status: shop?.status ?? 'pending',
        syncedAt: shop?.last_sync_at ?? null, historyStart: shop?.history_start ?? null,
        backfillDone: !!cursor?.completed, backfillMonth: cursor?.month ?? null, lastError: shop?.last_error ?? null,
      };
    }),
    syncedAt: shops.results.map((s) => s.last_sync_at).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)))[0] ?? null,
    current: withNames(current),
    compare: previous ? withNames(previous) : null,
    departments: [...new Set(names.results.map((r) => r.department).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'vi')),
    definitions: {
      basis: 'Giờ Việt Nam. Đơn tạo mới và các nhóm trạng thái tính theo ngày tạo đơn (trạng thái hiện tại lúc đồng bộ).',
      closed: 'Đơn chốt, Doanh thu, SL bán thực, Số khách xếp theo ngày CHỐT đơn (xác nhận lần đầu), đúng như ô "Tổng cộng" trên Pancake: gồm mọi đơn đã xác nhận trở đi (đóng gói, chờ chuyển, đang giao, đã nhận, kể cả hoàn). Đơn mới / chờ xử lý, Hủy, Xóa không tính.',
      revenue: 'Doanh thu = tổng tiền đơn chốt sau khi trừ giảm giá / quà tặng (chưa gồm phí vận chuyển). GTTB = doanh thu ÷ đơn chốt.',
      quantity: 'SL bán thực = tổng số lượng sản phẩm trong đơn chốt. Số khách = số SĐT khác nhau có đơn chốt.',
      segments: 'Gentadox: đơn có sản phẩm Gentadox không phải quà tặng. SK + GK: đơn gắn nhãn SK + GK trên Pancake. Mỗi đơn tính một lần trong từng nhóm; đơn thuộc cả hai nhóm xuất hiện ở cả hai, không cộng hai nhóm thành tổng. Doanh thu là toàn bộ đơn thuộc nhóm.',
      origin: 'Chỉ áp dụng CSKH: không có Marketer = tự ups; có Marketer = từ MKT. Lọc nguồn và người MKT áp dụng đồng thời cho mọi chỉ số, bảng, biểu đồ và kỳ so sánh trong báo cáo.',
      overviewRate: 'Tỷ lệ chốt tổng quan = đơn chốt trong kỳ ÷ đơn tạo mới trong kỳ. Hai số dùng ngày chốt và ngày tạo tương ứng; có thể vượt 100% khi chốt đơn cũ. Không có đơn tạo mới thì tỷ lệ để trống.',
      rate: 'Tỷ lệ chốt nhân viên = đơn chốt trong kỳ ÷ đơn chia trong kỳ (đơn được giao cho nhân viên đó theo thời điểm giao người bán).',
      groups: 'Mới: 0,17 · Đã xác nhận/đang xử lý: 1,8,9,11,12,13,20 · Đang giao: 2 · Giao thành công: 3,16 · Hoàn: 4,5,15 · Hủy: 6 · Xóa: 7.',
    },
  };
}
export type OverviewReport = Awaited<ReturnType<typeof overviewReport>>;
