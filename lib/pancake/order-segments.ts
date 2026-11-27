import { addDays, vnDayStartUtc } from '@/lib/shared/report-time';
import { CLOSED, NET, STAT_COLUMNS, STATUS_GROUPS, dayExpr, revenueDate, revenueStatsReady } from '@/lib/reports/stats';
import { countedFilter, teamFilter, type HrUnit, type Team } from '@/lib/teams/team';
import { parseStatus, statusSql, type StatusFilter } from '@/lib/pancake/order-status';

// Bộ thẻ mới (anh Vũ 27/11/2026 8h38 "ok plan thẻ sản phẩm mới…", plan docs/plans/2026-11-27-the-san-pham-moi): thẻ theo THUỐC CHÍNH của đơn,
// từng POS một bộ; bỏ thẻ SK GK (đã ngừng bán). Khoá cũ 'gentadox', 'oxy', 'khac' giữ nguyên; 'skgk' cũ đọc như 'khac'.
export const SEGMENT_KEYS = ['gentadox', 'oxy', 'sat-trung', 'doxytylo', 'khac'] as const;
export type SegmentKey = typeof SEGMENT_KEYS[number];
export type ProductSegment = 'all' | SegmentKey;
/** POS chỉ bán một combo (anh Vũ 04/11/2026: "bên pos oxytetra chỉ bán duy nhất combo oxytetra và bổ đậm đặc, không có cái khác"):
 *  mọi đơn POS này là một nhóm riêng, không chia vào Kháng sinh / SK GK / Khác. */
export const COMBO_OXY_POS = 'oxytetra';
/** POS Siêu Vô Gạo: Gentadox → Combo Oxytetra → Sát trùng / Glucan / Điện giải → Khác. */
export const GENTADOX_POS = 'sieu-vo-gao';
/** POS BIO NANO: Doxytylo → Khác. */
export const DOXYTYLO_POS = 'bio-nano';
/** Thẻ (trừ Khác) của từng POS, theo thứ tự xét; POS không có trong bảng chỉ có Khác. POS Oxytetra chỉ có Combo (không có Khác). */
export const POS_SEGMENTS: Record<string, readonly SegmentKey[]> = {
  [GENTADOX_POS]: ['gentadox', 'oxy', 'sat-trung'],
  [DOXYTYLO_POS]: ['doxytylo'],
  [COMBO_OXY_POS]: ['oxy'],
};
/** Thẻ cần hiện theo POS đang chọn: hợp thẻ của các POS, không lặp, theo thứ tự SEGMENT_KEYS. */
export function segmentsFor(posIds: readonly string[]): SegmentKey[] {
  const keys = new Set<SegmentKey>();
  for (const pos of posIds) {
    for (const k of POS_SEGMENTS[pos] ?? []) keys.add(k);
    if (pos !== COMBO_OXY_POS) keys.add('khac');
  }
  return SEGMENT_KEYS.filter((k) => keys.has(k));
}
export const isSegment = (v: string | null): v is SegmentKey => (SEGMENT_KEYS as readonly (string | null)[]).includes(v);
/** Đọc khoá thẻ từ URL / gợi ý: khoá cũ 'skgk' (thẻ đã bỏ 27/11/2026) đọc như 'khac'; khoá lạ → null. */
export const parseSegment = (v: string | null | undefined): SegmentKey | null => v === 'skgk' ? 'khac' : v !== undefined && isSegment(v) ? v : null;
export type OrderOrigin = 'all' | 'self' | 'mkt';
export type OrderFilters = { productSegment: ProductSegment; orderOrigin: OrderOrigin; marketerId: string; status: StatusFilter };
// Mỗi đơn đúng MỘT thẻ, xét theo thuốc chính (món đi kèm như men tỏi, detox, bổ đậm đặc không quyết định thẻ):
//   POS Oxytetra → Combo Oxytetra (POS chỉ bán combo này, anh Vũ 04/11/2026);
//   POS Siêu Vô Gạo → Gentadox (gồm các cỡ, mã cũ, và tên cũ Oxy + Bổ huyết, Bio Nano Shield) → Combo Oxytetra (đơn có Oxytetra)
//     → Sát trùng, Glucan, Điện giải (đơn có Bencid / Glucan / Gluco) → Khác;
//   POS BIO NANO → Doxytylo (mọi cỡ) → Khác; POS khác → Khác.
export const PRODUCT_SEGMENTS: Record<ProductSegment, string> = {
  all: 'Tất cả sản phẩm', gentadox: 'Gentadox', oxy: 'Combo Oxytetra + Bổ đậm đặc', 'sat-trung': 'Sát trùng, Glucan, Điện giải', doxytylo: 'Doxytylo', khac: 'Khác',
};
/** POS tính tên cũ Oxy + Bổ huyết và Bio Nano Shield vào Gentadox (giữ cách cũ của 31/10/2026; lib/reports/care-basket.ts dùng). */
export const ANTIBIOTIC_EXTRA_POS = GENTADOX_POS;
export const ORDER_ORIGINS = { all: 'Cả hai nguồn', self: 'Tự ups · không MKT', mkt: 'Từ MKT' };
export function parseOrderFilters(p: URLSearchParams, team: Team): OrderFilters {
  const product = p.get('productSegment');
  const origin = p.get('orderOrigin');
  return {
    productSegment: parseSegment(product) ?? 'all',
    orderOrigin: team === 'cskh' && (origin === 'self' || origin === 'mkt') ? origin : 'all',
    marketerId: team === 'cskh' && origin === 'mkt' ? (p.get('marketerId') ?? '').trim().slice(0, 100) : '',
    status: parseStatus(p.get('status')),
  };
}
export const EMPTY_ORDER_FILTERS: OrderFilters = { productSegment: 'all', orderOrigin: 'all', marketerId: '', status: parseStatus(null) };
/** Cột ngày của "đơn chốt" / doanh thu: ngày TẠO đơn (revenueDate, anh Vũ 27/11/2026), mọi trạng thái lọc. Giữ tham số f để nơi gọi không đổi. */
export const closedDate = (_f: OrderFilters, alias = '') => revenueDate(alias);
export const closedWhere = (f: OrderFilters, alias = '') => f.status.isDefault ? `${alias}${CLOSED}` : statusSql(f.status, `${alias}status_code`);
// The Marketer field, not arbitrary order tags, determines the CSKH acquisition source.
export const marketerValue = (alias = 'o') => `NULLIF(TRIM(${alias}.marketer_id),'')`;
/** Điều kiện "đơn có món (không phải quà, số lượng > 0) mà tên chứa một trong các mẫu" (so chữ thường). */
function hasItem(alias: string, likes: readonly string[]) {
  return `EXISTS (SELECT 1 FROM raw_pos_order_items si WHERE si.order_id=${alias}.id AND si.is_bonus=0 AND si.quantity>0 AND (${likes.map((l) => `LOWER(si.name) LIKE '${l}'`).join(' OR ')}))`;
}
/** Mẫu tên món của từng thẻ (chữ thường, LIKE). */
export const SEGMENT_ITEM_LIKES: Record<Exclude<SegmentKey, 'khac'>, readonly string[]> = {
  gentadox: ['%gentadox%', '%oxy%huy%', '%nano shield%'],
  oxy: ['%oxytetra%'],
  'sat-trung': ['%bencid%', '%glucan%', '%gluco%'],
  doxytylo: ['%doxytylo%', '%doxy%tylo%'],
};
/** Khoá thẻ của một đơn (bí danh bảng đơn `alias`), một biểu thức SQL. Đổi luật thì tăng SEGMENT_EPOCH (lib/reports/stats.ts). */
export function segmentKeyExpr(alias = 'o') {
  const pos = `${alias}.pos_id`;
  const whens = [`WHEN ${pos}='${COMBO_OXY_POS}' THEN 'oxy'`];
  for (const [p, keys] of Object.entries(POS_SEGMENTS)) {
    if (p === COMBO_OXY_POS) continue;
    for (const k of keys) whens.push(`WHEN ${pos}='${p}' AND ${hasItem(alias, SEGMENT_ITEM_LIKES[k as Exclude<SegmentKey, 'khac'>])} THEN '${k}'`);
  }
  return `CASE ${whens.join(' ')} ELSE 'khac' END`;
}
export function orderFilterSql(filters: OrderFilters, team: Team, alias = 'o') {
  const conditions: string[] = [], binds: string[] = [];
  // Lọc thẻ = đúng biểu thức xếp thẻ (một chỗ định nghĩa), nên các thẻ cộng lại luôn bằng tổng.
  // Khoá thẻ ghi thẳng (chỉ nhận khoá trong SEGMENT_KEYS), không thêm bind: vài nơi chỉ dùng .sql (sections-report, trends-report).
  if (filters.productSegment !== 'all' && isSegment(filters.productSegment)) conditions.push(`(${segmentKeyExpr(alias)})='${filters.productSegment}'`);
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
export type SegmentReadOptions = { start: string; end: string; ready: boolean; withProducts?: boolean };
export function segmentedStats(posIds: string[], startUtc: string, endUtc: string, team: Team, filters: OrderFilters, employeeIds: string[] = [], base: SegmentBase | null = null, unit: HrUnit | null = null, read: SegmentReadOptions | null = null) {
  const withProducts = read?.withProducts !== false;
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
    received_orders: `CASE WHEN status_code IN (${STATUS_GROUPS.delivered.join(',')}) THEN 1 ELSE 0 END`,
    received_net: `CASE WHEN status_code IN (${STATUS_GROUPS.delivered.join(',')}) THEN ${NET} ELSE 0 END`,
    closed_quantity: '(SELECT COALESCE(SUM(quantity),0) FROM raw_pos_order_items i WHERE i.order_id=o.id AND i.is_bonus=0)',
  };
  const project = (expressions: Record<string, string>) => STAT_COLUMNS.map(c => `(${expressions[c] ?? '0'}) AS ${c}`).join(',');
  const event = (date: string, expressions: Record<string, string>, where: string) => `SELECT pos_id, COALESCE(seller_id,'') AS seller_id, COALESCE(${marketerValue()},'') AS marketer_id, ${dayExpr(date)} AS day, ${project(expressions)} FROM segment_orders o WHERE ${date}>=? AND ${date}<? ${where}`;
  const ph = posIds.map(() => '?').join(',');
  const baseSql = base ? `SELECT pos_id, seller_id, '' AS marketer_id, day, ${STAT_COLUMNS.join(',')} FROM main.stats_daily WHERE pos_id IN (${ph}) AND day>=? AND day<? UNION ALL\n      ` : '';
  const eventRange = base ? [base.lastDayStartUtc, endUtc] : [startUtc, endUtc];
  const rawOrders = `segment_orders AS NOT MATERIALIZED (
      SELECT o.* FROM raw_pos_orders o WHERE o.pos_id IN (${ph})${teamFilter('o.seller_id', team, true, unit)}${countedFilter('o.seller_id')}${seller}${filter.sql}
    )`;
  const rawDaily = `stats_daily AS (
      ${baseSql}${event('created_at', values, '')} UNION ALL
      ${event(closedDate(filters), closed, `AND ${closedWhere(filters)}`)} UNION ALL
      ${event('seller_assigned_at', { assigned_orders: '1', assigned_closed_orders: `CASE WHEN ${closedWhere(filters)} THEN 1 ELSE 0 END` }, 'AND status_code<>7')}
    )`;
  const products = `stats_daily_product AS (
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
    )`;
  const ready = !!read?.ready && filters.status.isDefault && startUtc === vnDayStartUtc(read.start) && (base ? base.start === read.start && base.lastDay === read.end && base.lastDayStartUtc === vnDayStartUtc(read.end) && endUtc >= base.lastDayStartUtc && endUtc <= vnDayStartUtc(addDays(read.end, 1)) : endUtc === vnDayStartUtc(addDays(read.end, 1)));
  // Keep the existing stats_daily base for unfiltered cutoff periods.
  const segmentReady = ready && !(base && filters.productSegment === 'all' && team !== 'cskh');
  const needsRaw = !segmentReady || !!base || withProducts;
  const origin = team === 'cskh' ? filters.orderOrigin : 'all';
  const segment = filters.productSegment !== 'all' ? ' AND segment=?' : '';
  const originSql = origin === 'self' ? " AND marketer_id=''" : origin === 'mkt' ? " AND marketer_id<>''" + (filters.marketerId ? ' AND marketer_id=?' : '') : '';
  const daily = segmentReady ? `stats_daily AS (
    SELECT pos_id,seller_id,marketer_id,day,${STAT_COLUMNS.join(',')} FROM main.stats_daily_segment o
    WHERE pos_id IN (${ph}) AND day>=? AND day${base ? '<' : '<='}?${teamFilter('o.seller_id', team, true, unit)}${countedFilter('o.seller_id')}${seller}${segment}${originSql}
    ${base ? `UNION ALL ${event('created_at', values, '')} UNION ALL ${event(closedDate(filters), closed, `AND ${closedWhere(filters)}`)} UNION ALL ${event('seller_assigned_at', { assigned_orders: '1', assigned_closed_orders: `CASE WHEN ${closedWhere(filters)} THEN 1 ELSE 0 END` }, 'AND status_code<>7')}` : ''}
  )` : rawDaily;
  const rawBinds = [...posIds, ...employeeIds, ...filter.binds];
  const dailyBinds = segmentReady ? [...posIds, read.start, read.end, ...employeeIds,
    ...(filters.productSegment !== 'all' ? [filters.productSegment] : []),
    ...(origin === 'mkt' && filters.marketerId ? [filters.marketerId] : []),
    ...(base ? Array.from({ length: 3 }, () => eventRange).flat() : [])]
    : [...(base ? [...posIds, base.start, base.lastDay] : []), ...Array.from({ length: 3 }, () => eventRange).flat()];
  return {
    sql: `WITH ${[...(needsRaw ? [rawOrders] : []), daily, ...(withProducts ? [products] : [])].join(', ')} `,
    binds: [...(needsRaw ? rawBinds : []), ...dailyBinds, ...(withProducts ? [startUtc, endUtc] : [])],
  };
}

/**
 * Nơi đọc thẳng bảng stats_daily theo (POS, khoảng ngày): trong lúc bảng còn dựng lại theo ngày tạo đơn (revenueStatsReady chưa bật,
 * sau khi tăng STATS_EPOCH), thay bằng bảng ảo cùng tên `stats_daily` tính từ đơn gốc cho đúng POS và khoảng ngày đó, để không trộn ngày
 * cũ (ngày chốt) với ngày mới (ngày tạo). Bảng ảo chỉ có người bán được tính doanh số (countedFilter, như mọi số doanh thu) và có thêm cột
 * marketer_id; một ngày có thể nhiều dòng nên nơi đọc phải SUM / GROUP BY như khi đọc bảng thật.
 * Dùng: `const src = await statsDailySource(db, posIds, start, end); db.prepare(src.sql + 'SELECT ... FROM stats_daily ...').bind(...src.binds, ...)`.
 * Câu đọc phải bắt đầu bằng SELECT (không có WITH riêng).
 */
export async function statsDailySource(db: D1Database, posIds: string[], start: string, end: string): Promise<{ sql: string; binds: string[] }> {
  if (await revenueStatsReady(db)) return { sql: '', binds: [] };
  const v = segmentedStats(posIds, vnDayStartUtc(start), vnDayStartUtc(addDays(end, 1)), 'all', EMPTY_ORDER_FILTERS, [], null, null, { start, end, ready: false, withProducts: false });
  return { sql: v.sql, binds: v.binds.map(String) };
}
