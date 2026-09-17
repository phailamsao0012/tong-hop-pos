// Dựng bảng số liệu theo ngày (stats_daily, stats_daily_product) từ đơn nguồn.
// Chỉ các (POS, ngày) có đơn thay đổi mới được tính lại; upsert bỏ qua dòng không đổi
// để tiết kiệm lượt ghi D1.
import { VN_OFFSET_HOURS, addDays, vnDayStartUtc } from '@/lib/report-time';

export const STATUS_GROUPS = {
  new: [0, 17],
  confirmed: [1, 11, 12, 13, 20, 8, 9],
  shipping: [2],
  delivered: [3, 16],
  returned: [4, 15, 5],
  cancelled: [6, 7],
} as const;
export type GroupKey = keyof typeof STATUS_GROUPS;
const inList = (codes: readonly number[]) => codes.join(',');
const NET = '(COALESCE(current_total,0)-COALESCE(total_discount,0))';
// "Đơn chốt" theo Pancake: đã xác nhận trở đi (không tính Mới/Chờ XN/Hủy/Xóa).
export const NOT_CLOSED = [...STATUS_GROUPS.new, ...STATUS_GROUPS.cancelled];
export const CLOSED = `status_code NOT IN (${inList(NOT_CLOSED)})`;
export const DAY_EXPR = `date(datetime(created_at,'+${VN_OFFSET_HOURS} hours'))`;

export const STAT_COLUMNS = [
  'orders', 'deleted_orders', 'gross', 'discount', 'net', 'shipping_fee', 'cod',
  'closed_orders', 'closed_gross', 'closed_discount', 'closed_net', 'closed_shipping_fee', 'closed_quantity',
  ...(Object.keys(STATUS_GROUPS) as GroupKey[]).flatMap((k) => [`${k}_orders`, `${k}_net`]),
] as const;
export const PRODUCT_COLUMNS = [
  'orders', 'quantity', 'total', 'closed_quantity', 'closed_total', 'delivered_quantity', 'delivered_total', 'returned_quantity',
] as const;

const metricSelect = `
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
  ${(Object.keys(STATUS_GROUPS) as GroupKey[]).map((key) => `
  SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN 1 ELSE 0 END) AS ${key}_orders,
  COALESCE(SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN ${NET} ELSE 0 END),0) AS ${key}_net`).join(',')}
`;

type Row = Record<string, string | number | null>;
export type DirtyBuckets = Map<string, Set<string>>; // posId -> days (YYYY-MM-DD, giờ VN)

export function vnDayOf(createdAt: string | null | undefined) {
  if (!createdAt) return null;
  const t = Date.parse(createdAt.endsWith('Z') ? createdAt : `${createdAt}Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + VN_OFFSET_HOURS * 3600000).toISOString().slice(0, 10);
}
export function markDirty(dirty: DirtyBuckets, posId: string, createdAt: string | null | undefined) {
  const day = vnDayOf(createdAt);
  if (!day) return;
  if (!dirty.has(posId)) dirty.set(posId, new Set());
  dirty.get(posId)!.add(day);
}

/** Gom các ngày bẩn thành các khoảng liên tục để giảm số truy vấn. */
function dayRanges(days: Set<string>): { start: string; end: string }[] {
  const sorted = [...days].sort();
  const ranges: { start: string; end: string }[] = [];
  for (const day of sorted) {
    const last = ranges.at(-1);
    if (last && addDays(last.end, 1) === day) last.end = day;
    else ranges.push({ start: day, end: day });
  }
  return ranges;
}

function upsertStatement(db: D1Database, table: string, key: Record<string, string>, values: Record<string, number | string>, now: string) {
  const cols = [...Object.keys(key), ...Object.keys(values), 'updated_at'];
  const valueCols = Object.keys(values);
  return db.prepare(
    `INSERT INTO ${table} (id,${cols.join(',')}) VALUES (?${cols.map(() => ',?').join('')})
     ON CONFLICT(id) DO UPDATE SET ${valueCols.map((c) => `${c}=excluded.${c}`).join(',')},updated_at=excluded.updated_at
     WHERE ${valueCols.map((c) => `${table}.${c}<>excluded.${c}`).join(' OR ')}`,
  ).bind(Object.values(key).join(':'), ...Object.values(key), ...Object.values(values), now);
}

async function run(db: D1Database, statements: D1PreparedStatement[]) {
  let writes = 0;
  for (let i = 0; i < statements.length; i += 100) {
    const results = await db.batch(statements.slice(i, i + 100));
    for (const r of results) writes += Number(r.meta?.rows_written ?? 0);
  }
  return writes;
}

/** Tính lại số liệu cho các (POS, ngày) đã đổi. Trả về số dòng ghi. */
export async function rebuildStats(db: D1Database, dirty: DirtyBuckets) {
  const now = new Date().toISOString();
  let writes = 0;
  for (const [posId, days] of dirty) {
    for (const range of dayRanges(days)) {
      const startUtc = vnDayStartUtc(range.start), endUtc = vnDayStartUtc(addDays(range.end, 1));
      const [sellerRows, sellerQty, productRows] = await db.batch([
        db.prepare(`SELECT ${DAY_EXPR} AS day, COALESCE(seller_id,'') AS seller_id, ${metricSelect}
          FROM raw_pos_orders WHERE pos_id=? AND created_at>=? AND created_at<? GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${DAY_EXPR.replace('created_at', 'o.created_at')} AS day, COALESCE(o.seller_id,'') AS seller_id, SUM(i.quantity) AS quantity
          FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
          WHERE o.pos_id=? AND o.created_at>=? AND o.created_at<? AND o.${CLOSED} GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${DAY_EXPR.replace('created_at', 'o.created_at')} AS day, COALESCE(i.product_id,'') AS product_id, MAX(i.name) AS name,
            COUNT(DISTINCT i.order_id) AS orders, SUM(i.quantity) AS quantity, SUM(i.line_total) AS total,
            SUM(CASE WHEN o.${CLOSED} THEN i.quantity ELSE 0 END) AS closed_quantity,
            SUM(CASE WHEN o.${CLOSED} THEN i.line_total ELSE 0 END) AS closed_total,
            SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.quantity ELSE 0 END) AS delivered_quantity,
            SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.line_total ELSE 0 END) AS delivered_total,
            SUM(i.returned_count) AS returned_quantity
          FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
          WHERE o.pos_id=? AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
      ]);
      const qty = new Map((sellerQty.results as Row[]).map((r) => [`${r.day}:${r.seller_id}`, Number(r.quantity)]));
      const statements: D1PreparedStatement[] = [];
      const keepSellers = new Map<string, string[]>(), keepProducts = new Map<string, string[]>();
      for (const r of sellerRows.results as Row[]) {
        const day = String(r.day), seller = String(r.seller_id ?? '');
        const values: Record<string, number> = {};
        for (const c of STAT_COLUMNS) values[c] = c === 'closed_quantity' ? qty.get(`${day}:${seller}`) ?? 0 : Number(r[c] ?? 0);
        statements.push(upsertStatement(db, 'stats_daily', { pos_id: posId, day, seller_id: seller }, values, now));
        keepSellers.set(day, [...(keepSellers.get(day) ?? []), seller]);
      }
      for (const r of productRows.results as Row[]) {
        const day = String(r.day), product = String(r.product_id ?? '');
        const values: Record<string, number | string> = { name: String(r.name ?? '') };
        for (const c of PRODUCT_COLUMNS) values[c] = Number(r[c] ?? 0);
        statements.push(upsertStatement(db, 'stats_daily_product', { pos_id: posId, day, product_id: product }, values, now));
        keepProducts.set(day, [...(keepProducts.get(day) ?? []), product]);
      }
      // Xóa dòng của người bán / sản phẩm không còn xuất hiện trong ngày đó.
      for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
        const sellers = keepSellers.get(d) ?? [];
        statements.push(db.prepare(`DELETE FROM stats_daily WHERE pos_id=? AND day=?${sellers.length ? ` AND seller_id NOT IN (${sellers.map(() => '?').join(',')})` : ''}`)
          .bind(posId, d, ...sellers));
        const products = keepProducts.get(d) ?? [];
        statements.push(db.prepare(`DELETE FROM stats_daily_product WHERE pos_id=? AND day=?${products.length ? ` AND product_id NOT IN (${products.map(() => '?').join(',')})` : ''}`)
          .bind(posId, d, ...products));
      }
      writes += await run(db, statements);
    }
  }
  return writes;
}

export function monthDays(month: string) {
  const days = new Set<string>();
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) days.add(d);
  return days;
}
