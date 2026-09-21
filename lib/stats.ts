// Dựng bảng số liệu theo ngày (stats_daily, stats_daily_product) từ đơn nguồn.
// Một dòng (POS, ngày, người bán) gộp ba cơ sở thời gian:
//   - ngày TẠO đơn: orders, deleted_orders, gross/discount/net/..., nhóm trạng thái hiện tại;
//   - ngày CHỐT (xác nhận lần đầu): closed_* — trùng cách Pancake tính "Đơn chốt / Doanh thu";
//   - ngày GIAO người bán: assigned_orders ("đơn chia").
// Chỉ các (POS, ngày) có đơn thay đổi mới được tính lại; upsert bỏ qua dòng không đổi.
import { VN_OFFSET_HOURS, addDays, vnDayStartUtc } from '@/lib/report-time';
import type { SourceOrder } from '@/lib/pancake';

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
// Doanh thu theo Pancake = total_price_after_sub_discount (net_total); đơn cũ chưa có cột này thì lấy tổng − giảm giá.
export const NET = 'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';
// Giảm giá hiển thị = doanh số − doanh thu (gồm cả voucher/khuyến mãi sàn).
const DISCOUNT = '(COALESCE(current_total,0)-COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0)))';
// "Đơn chốt" = đúng như ô "Tổng cộng · Đơn chốt / Doanh thu" trên Pancake (yêu cầu 21/09/2026, bỏ quy tắc "đẩy sang ĐVVC mới tính"):
// đơn đã xác nhận trở đi (đã XN, đóng gói, chờ chuyển, đang giao, đã nhận, đã thu tiền, kể cả hoàn), xếp theo ngày xác nhận lần đầu.
// Mới / chờ xử lý, Hủy, Xóa không tính. SHIPPED giữ lại cho các chỗ cần "đã bàn giao ĐVVC".
export const SHIPPED = [...STATUS_GROUPS.shipping, ...STATUS_GROUPS.delivered, ...STATUS_GROUPS.returned];
export const NOT_CLOSED = [...STATUS_GROUPS.new, ...STATUS_GROUPS.cancelled];
export const CLOSED = `status_code NOT IN (${inList(NOT_CLOSED)})`;
export const dayExpr = (column: string) => `date(datetime(${column},'+${VN_OFFSET_HOURS} hours'))`;
export const DAY_EXPR = dayExpr('created_at');

export const CREATED_COLUMNS = [
  'orders', 'deleted_orders', 'gross', 'discount', 'net', 'shipping_fee', 'cod',
  ...(Object.keys(STATUS_GROUPS) as GroupKey[]).flatMap((k) => [`${k}_orders`, `${k}_net`]),
] as const;
export const CLOSED_COLUMNS = [
  'closed_orders', 'closed_gross', 'closed_discount', 'closed_net', 'closed_shipping_fee', 'closed_quantity',
] as const;
export const STAT_COLUMNS = [...CREATED_COLUMNS, ...CLOSED_COLUMNS, 'assigned_orders'] as const;
export const PRODUCT_COLUMNS = [
  'orders', 'quantity', 'total', 'closed_quantity', 'closed_total', 'delivered_quantity', 'delivered_total', 'returned_quantity',
] as const;

const createdSelect = `
  SUM(CASE WHEN status_code<>7 THEN 1 ELSE 0 END) AS orders,
  SUM(CASE WHEN status_code=7 THEN 1 ELSE 0 END) AS deleted_orders,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN current_total ELSE 0 END),0) AS gross,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN ${DISCOUNT} ELSE 0 END),0) AS discount,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN ${NET} ELSE 0 END),0) AS net,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN shipping_fee ELSE 0 END),0) AS shipping_fee,
  COALESCE(SUM(CASE WHEN status_code<>7 THEN cod ELSE 0 END),0) AS cod,
  ${(Object.keys(STATUS_GROUPS) as GroupKey[]).map((key) => `
  SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN 1 ELSE 0 END) AS ${key}_orders,
  COALESCE(SUM(CASE WHEN status_code IN (${inList(STATUS_GROUPS[key])}) THEN ${NET} ELSE 0 END),0) AS ${key}_net`).join(',')}
`;
const closedSelect = `
  COUNT(*) AS closed_orders,
  COALESCE(SUM(current_total),0) AS closed_gross,
  COALESCE(SUM(${DISCOUNT}),0) AS closed_discount,
  COALESCE(SUM(${NET}),0) AS closed_net,
  COALESCE(SUM(shipping_fee),0) AS closed_shipping_fee
`;

type Row = Record<string, string | number | null>;
export type DirtyBuckets = Map<string, Set<string>>; // posId -> days (YYYY-MM-DD, giờ VN)

export function vnDayOf(iso: string | null | undefined) {
  if (!iso) return null;
  const t = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + VN_OFFSET_HOURS * 3600000).toISOString().slice(0, 10);
}
export function markDirty(dirty: DirtyBuckets, posId: string, iso: string | null | undefined) {
  const day = vnDayOf(iso);
  if (!day) return;
  if (!dirty.has(posId)) dirty.set(posId, new Set());
  dirty.get(posId)!.add(day);
}
/** Đánh dấu cả ba ngày liên quan của một đơn (tạo, chốt, giao người bán). */
export function markDirtyOrder(dirty: DirtyBuckets, posId: string, o: SourceOrder) {
  markDirty(dirty, posId, o.inserted_at);
  markDirty(dirty, posId, o.time_assign_seller);
  const confirmed = (o.status_history ?? []).filter((h) => h.status === 1 && h.updated_at)
    .map((h) => h.updated_at!).sort()[0];
  markDirty(dirty, posId, confirmed);
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
      const [createdRows, closedRows, closedQty, assignedRows, productRows] = await db.batch([
        db.prepare(`SELECT ${dayExpr('created_at')} AS day, COALESCE(seller_id,'') AS seller_id, ${createdSelect}
          FROM raw_pos_orders WHERE pos_id=? AND created_at>=? AND created_at<? GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${dayExpr('first_confirmed_at')} AS day, COALESCE(seller_id,'') AS seller_id, ${closedSelect}
          FROM raw_pos_orders WHERE pos_id=? AND first_confirmed_at>=? AND first_confirmed_at<? AND ${CLOSED} GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${dayExpr('o.first_confirmed_at')} AS day, COALESCE(o.seller_id,'') AS seller_id, SUM(i.quantity) AS quantity
          FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
          WHERE o.pos_id=? AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.${CLOSED} AND i.is_bonus=0 GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${dayExpr('seller_assigned_at')} AS day, COALESCE(seller_id,'') AS seller_id, COUNT(*) AS assigned_orders
          FROM raw_pos_orders WHERE pos_id=? AND seller_assigned_at>=? AND seller_assigned_at<? AND status_code<>7 GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        // Sản phẩm theo ngày chốt của đơn (đơn chốt), giống "SL sản phẩm" trên Pancake.
        db.prepare(`SELECT ${dayExpr('o.first_confirmed_at')} AS day, COALESCE(i.product_id,'') AS product_id, MAX(i.name) AS name,
            COUNT(DISTINCT i.order_id) AS orders, SUM(i.quantity) AS quantity, SUM(i.line_total) AS total,
            SUM(CASE WHEN i.is_bonus=0 THEN i.quantity ELSE 0 END) AS closed_quantity,
            SUM(i.line_total) AS closed_total,
            SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.quantity ELSE 0 END) AS delivered_quantity,
            SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.line_total ELSE 0 END) AS delivered_total,
            SUM(i.returned_count) AS returned_quantity
          FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
          WHERE o.pos_id=? AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.${CLOSED} GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
      ]);
      // Gộp ba cơ sở theo (ngày, người bán).
      const merged = new Map<string, Record<string, number>>();
      const bucket = (day: string, seller: string) => {
        const key = `${day} ${seller}`;
        if (!merged.has(key)) merged.set(key, Object.fromEntries(STAT_COLUMNS.map((c) => [c, 0])));
        return merged.get(key)!;
      };
      for (const r of createdRows.results as Row[]) {
        const b = bucket(String(r.day), String(r.seller_id ?? ''));
        for (const c of CREATED_COLUMNS) b[c] = Number(r[c] ?? 0);
      }
      for (const r of closedRows.results as Row[]) {
        const b = bucket(String(r.day), String(r.seller_id ?? ''));
        for (const c of CLOSED_COLUMNS) if (c !== 'closed_quantity') b[c] = Number(r[c] ?? 0);
      }
      for (const r of closedQty.results as Row[]) bucket(String(r.day), String(r.seller_id ?? '')).closed_quantity = Number(r.quantity ?? 0);
      for (const r of assignedRows.results as Row[]) bucket(String(r.day), String(r.seller_id ?? '')).assigned_orders = Number(r.assigned_orders ?? 0);

      const statements: D1PreparedStatement[] = [];
      const keepSellers = new Map<string, string[]>(), keepProducts = new Map<string, string[]>();
      for (const [key, values] of merged) {
        const [day, seller] = key.split(' ');
        if (day < range.start || day > range.end) continue; // ngoài khoảng đang tính (an toàn)
        statements.push(upsertStatement(db, 'stats_daily', { pos_id: posId, day, seller_id: seller }, values, now));
        keepSellers.set(day, [...(keepSellers.get(day) ?? []), seller]);
      }
      for (const r of productRows.results as Row[]) {
        const day = String(r.day), product = String(r.product_id ?? '');
        if (day < range.start || day > range.end) continue;
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
