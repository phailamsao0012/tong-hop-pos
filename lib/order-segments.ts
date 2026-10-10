import { CLOSED, NET, STAT_COLUMNS, STATUS_GROUPS, dayExpr } from './stats';
import { countedFilter, teamFilter, type HrUnit, type Team } from './team';
import { parseStatus, statusSql, type StatusFilter } from './order-status';

export type ProductSegment = 'all' | 'gentadox' | 'skgk';
export type OrderOrigin = 'all' | 'self' | 'mkt';
export type OrderFilters = { productSegment: ProductSegment; orderOrigin: OrderOrigin; marketerId: string; status: StatusFilter };
export const PRODUCT_SEGMENTS = { all: 'Tất cả sản phẩm', gentadox: 'Gentadox', skgk: 'SK + GK' };
export const ORDER_ORIGINS = { all: 'Cả hai nguồn', self: 'Tự ups · không MKT', mkt: 'Từ MKT' };
export function parseOrderFilters(p: URLSearchParams, team: Team): OrderFilters {
  const product = p.get('productSegment');
  const origin = p.get('orderOrigin');
  return {
    productSegment: product === 'gentadox' || product === 'skgk' ? product : 'all',
    orderOrigin: team === 'cskh' && (origin === 'self' || origin === 'mkt') ? origin : 'all',
    marketerId: team === 'cskh' && origin === 'mkt' ? (p.get('marketerId') ?? '').trim().slice(0, 100) : '',
    status: parseStatus(p.get('status')),
  };
}
export const EMPTY_ORDER_FILTERS: OrderFilters = { productSegment: 'all', orderOrigin: 'all', marketerId: '', status: parseStatus(null) };
/** Cột ngày của "đơn chốt": mặc định ngày xác nhận lần đầu; khi chọn trạng thái khác, đơn chưa từng xác nhận lấy ngày tạo. */
export const closedDate = (f: OrderFilters, alias = '') => f.status.isDefault ? `${alias}first_closed_at` : `COALESCE(${alias}first_closed_at,${alias}created_at)`;
export const closedWhere = (f: OrderFilters, alias = '') => f.status.isDefault ? `${alias}${CLOSED}` : statusSql(f.status, `${alias}status_code`);
// The Marketer field, not arbitrary order tags, determines the CSKH acquisition source.
export const marketerValue = (alias = 'o') => `NULLIF(TRIM(${alias}.marketer_id),'')`;
export function orderFilterSql(filters: OrderFilters, team: Team, alias = 'o') {
  const conditions: string[] = [], binds: string[] = [];
  if (filters.productSegment === 'gentadox') conditions.push(`EXISTS (SELECT 1 FROM raw_pos_order_items si WHERE si.order_id=${alias}.id AND si.is_bonus=0 AND si.quantity>0 AND LOWER(si.name) LIKE '%gentadox%')`);
  if (filters.productSegment === 'skgk') conditions.push(`EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(${alias}.tags_json) THEN ${alias}.tags_json ELSE '[]' END) st WHERE REPLACE(UPPER(TRIM(json_extract(st.value,'$.name'))),' ','')='SK+GK')`);
  if (team === 'cskh') {
    if (filters.orderOrigin === 'self') conditions.push(`${marketerValue(alias)} IS NULL`);
    if (filters.orderOrigin === 'mkt') conditions.push(`${marketerValue(alias)} IS NOT NULL`);
    if (filters.orderOrigin === 'mkt' && filters.marketerId) { conditions.push(`${marketerValue(alias)}=?`); binds.push(filters.marketerId); }
  }
  return { sql: conditions.length ? ` AND ${conditions.join(' AND ')}` : '', binds };
}

/** Virtual daily tables for dimensions absent from the precomputed daily tables.
 * Each event keeps its original time basis; EXISTS never duplicates an order.
 * No write, migration, row limit, or client-side approximation is involved.
 */
/** base: kỳ so sánh cắt giờ (vd. 01–10/09 tới 11:47 ngày 10/09) không lọc gì thêm: các ngày đủ (start ≤ day < lastDay) lấy từ bảng
 * tổng hợp stats_daily, chỉ ngày cuối [lastDayStartUtc, endUtc) tính từ đơn gốc. Trước đây cả kỳ quét đơn gốc 5–6 lần mỗi lượt mở Tổng quan,
 * chiếm gần nửa thời gian D1 khi test tải (10/10/2026). Cùng quy tắc với stats_daily (lib/stats.ts) nên tổng không đổi. */
export type SegmentBase = { start: string; lastDay: string; lastDayStartUtc: string };
export function segmentedStats(posIds: string[], startUtc: string, endUtc: string, team: Team, filters: OrderFilters, employeeIds: string[] = [], base: SegmentBase | null = null, unit: HrUnit | null = null) {
  const filter = orderFilterSql(filters, team);
  const seller = employeeIds.length ? ` AND o.seller_id IN (${employeeIds.map(() => '?').join(',')})` : '';
  const gross = 'COALESCE(current_total,0)';
  const values: Record<string, string> = {
    orders: 'status_code<>7', deleted_orders: 'status_code=7',
    gross: `CASE WHEN status_code<>7 THEN ${gross} ELSE 0 END`,
    discount: `CASE WHEN status_code<>7 THEN ${gross}-${NET} ELSE 0 END`,
    net: `CASE WHEN status_code<>7 THEN ${NET} ELSE 0 END`,
    shipping_fee: 'CASE WHEN status_code<>7 THEN COALESCE(shipping_fee,0) ELSE 0 END',
    cod: 'CASE WHEN status_code<>7 THEN COALESCE(cod,0) ELSE 0 END',
  };
  for (const [key, codes] of Object.entries(STATUS_GROUPS)) {
    values[`${key}_orders`] = `status_code IN (${codes.join(',')})`;
    values[`${key}_net`] = `CASE WHEN status_code IN (${codes.join(',')}) THEN ${NET} ELSE 0 END`;
  }
  const closed: Record<string, string> = {
    closed_orders: '1', closed_gross: gross, closed_discount: `${gross}-${NET}`, closed_net: NET,
    closed_shipping_fee: 'COALESCE(shipping_fee,0)',
    closed_quantity: '(SELECT COALESCE(SUM(quantity),0) FROM raw_pos_order_items i WHERE i.order_id=o.id AND i.is_bonus=0)',
  };
  const project = (expressions: Record<string, string>) => STAT_COLUMNS.map(c => `(${expressions[c] ?? '0'}) AS ${c}`).join(',');
  const event = (date: string, expressions: Record<string, string>, where: string) => `SELECT pos_id, COALESCE(seller_id,'') AS seller_id, COALESCE(${marketerValue()},'') AS marketer_id, ${dayExpr(date)} AS day, ${project(expressions)} FROM segment_orders o WHERE ${date}>=? AND ${date}<? ${where}`;
  const ph = posIds.map(() => '?').join(',');
  const baseSql = base ? `SELECT pos_id, seller_id, '' AS marketer_id, day, ${STAT_COLUMNS.join(',')} FROM main.stats_daily WHERE pos_id IN (${ph}) AND day>=? AND day<? UNION ALL\n      ` : '';
  const eventRange = base ? [base.lastDayStartUtc, endUtc] : [startUtc, endUtc];
  return {
    sql: `WITH segment_orders AS NOT MATERIALIZED (
      SELECT o.* FROM raw_pos_orders o WHERE o.pos_id IN (${ph})${teamFilter('o.seller_id', team, true, unit)}${countedFilter('o.seller_id')}${seller}${filter.sql}
    ), stats_daily AS (
      ${baseSql}${event('created_at', values, '')} UNION ALL
      ${event(closedDate(filters), closed, `AND ${closedWhere(filters)}`)} UNION ALL
      ${event('seller_assigned_at', { assigned_orders: '1', assigned_closed_orders: `CASE WHEN ${closedWhere(filters)} THEN 1 ELSE 0 END` }, 'AND status_code<>7')}
    ), stats_daily_product AS (
      SELECT o.pos_id, ${dayExpr(closedDate(filters, 'o.'))} AS day, i.product_id, MAX(i.name) AS name,
        1 AS orders, SUM(i.quantity) AS quantity, SUM(i.line_total) AS total,
        SUM(CASE WHEN i.is_bonus=0 THEN i.quantity ELSE 0 END) AS closed_quantity,
        SUM(i.line_total) AS closed_total,
        SUM(CASE WHEN o.status_code IN (3,16) THEN i.quantity ELSE 0 END) AS delivered_quantity,
        SUM(CASE WHEN o.status_code IN (3,16) THEN i.line_total ELSE 0 END) AS delivered_total,
        SUM(i.returned_count) AS returned_quantity
      FROM segment_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
      WHERE ${closedDate(filters, 'o.')}>=? AND ${closedDate(filters, 'o.')}<? AND ${closedWhere(filters, 'o.')}
      GROUP BY o.id, i.product_id
    ) `,
    binds: [...posIds, ...employeeIds, ...filter.binds, ...(base ? [...posIds, base.start, base.lastDay] : []),
      ...Array.from({ length: 3 }, () => eventRange).flat(), startUtc, endUtc],
  };
}
