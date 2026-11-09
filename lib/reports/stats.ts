// Dựng bảng số liệu theo ngày (stats_daily, stats_daily_product) từ đơn nguồn.
// Một dòng (POS, ngày, người bán) gộp ba cơ sở thời gian:
//   - ngày TẠO đơn: orders, deleted_orders, gross/discount/net/..., nhóm trạng thái hiện tại;
//   - ngày CHỐT (xác nhận lần đầu): closed_* — trùng cách Pancake tính "Đơn chốt / Doanh thu";
//   - ngày GIAO người bán: assigned_orders ("đơn chia").
// Chỉ các (POS, ngày) có đơn thay đổi mới được tính lại; upsert bỏ qua dòng không đổi.
import { segmentKeyExpr, marketerValue } from '@/lib/pancake/order-segments';
import { VN_OFFSET_HOURS, addDays, vnDayStartUtc } from '@/lib/shared/report-time';
import type { SourceOrder } from '@/lib/pancake/pancake';
import { SENT_CODES } from '@/lib/reports/shipping-lines';
import { diffStatements, run, upsertStatement } from '@/lib/reports/stats-write';
import { ensureMktSchema, mktReads, mktStatements } from '@/lib/reports/stats-mkt';

// Ba giai đoạn đơn thống nhất toàn hệ thống (anh Vũ 08/10/2026): new (Mới) → chốt (Chờ xác nhận, Đã xác nhận, kho / in)
// → chuyển hàng (Đang đóng hàng, Chờ chuyển, Đã gửi hàng); sau đó là kết quả giao: đã nhận, hoàn, hủy.
export const STATUS_GROUPS = {
  new: [0],
  confirmed: [17, 1, 11, 12, 13, 20],
  shipping: [8, 9, 2],
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
// "Đơn chốt" (anh Vũ 08/10/2026): từ Chờ xác nhận trở đi (chờ XN, đã XN, đóng gói, chờ chuyển, đang giao, đã nhận, đã thu tiền,
// kể cả hoàn), xếp theo giờ chốt first_closed_at = lần đầu đơn vào Chờ xác nhận hoặc trạng thái sau đó. Mới, Hủy, Xóa không tính.
// Trước 08/10 tính từ Đã xác nhận như ô "Đơn chốt" trên Pancake; báo cáo MKT vẫn tính chốt = đã xác nhận (first_confirmed_at).
// SHIPPED giữ lại cho các chỗ cần "đã bàn giao ĐVVC".
export const SHIPPED = [2, ...STATUS_GROUPS.delivered, ...STATUS_GROUPS.returned];
export const NOT_CLOSED = [...STATUS_GROUPS.new, ...STATUS_GROUPS.cancelled];
export const NOT_CLOSED_CODES: number[] = [...NOT_CLOSED];
export const CLOSED = `status_code NOT IN (${inList(NOT_CLOSED)})`;
/** Cột giờ chốt của đơn (xem trên). */
export const CLOSED_AT = 'first_closed_at';
export const dayExpr = (column: string) => `date(datetime(${column},'+${VN_OFFSET_HOURS} hours'))`;
export const DAY_EXPR = dayExpr('created_at');

export const CREATED_COLUMNS = [
  'orders', 'deleted_orders', 'gross', 'discount', 'net', 'shipping_fee', 'cod',
  ...(Object.keys(STATUS_GROUPS) as GroupKey[]).flatMap((k) => [`${k}_orders`, `${k}_net`]),
] as const;
export const CLOSED_COLUMNS = [
  'closed_orders', 'closed_gross', 'closed_discount', 'closed_net', 'closed_shipping_fee', 'closed_quantity',
] as const;
// assigned_closed_orders: trong số đơn chia ngày đó, bao nhiêu đơn nay đã chốt (tỷ lệ chốt ÷ số chia không vượt 100%, 29/09/2026).
export const STAT_COLUMNS = [...CREATED_COLUMNS, ...CLOSED_COLUMNS, 'assigned_orders', 'assigned_closed_orders'] as const;

/** Thêm cột assigned_closed_orders vào stats_daily nếu chưa có (bảng cũ). Nhớ bằng cờ, không giữ Promise dùng chung giữa các yêu cầu. */
let statsSchemaReady = false;
export async function ensureStatsSchema(db: D1Database) {
  await ensureSegmentSchema(db);
  if (statsSchemaReady) return;
  try { await db.prepare('ALTER TABLE stats_daily ADD COLUMN assigned_closed_orders INTEGER NOT NULL DEFAULT 0').run(); }
  catch (e) { if (!/duplicate column/i.test(String(e))) throw e; }
  statsSchemaReady = true;
}
export const PRODUCT_COLUMNS = [
  'orders', 'quantity', 'total', 'closed_quantity', 'closed_total', 'delivered_quantity', 'delivered_total', 'returned_quantity',
] as const;
// stats_daily_seller_product (migration 0042): thêm người bán và tên dòng hàng; sale_* = dòng bán (không quà tặng, số lượng > 0),
// đúng điều kiện "Xu hướng theo dòng sản phẩm" (lib/trends-report.ts).
export const SELLER_PRODUCT_COLUMNS = [...PRODUCT_COLUMNS, 'sale_quantity', 'sale_total'] as const;
const SALE_ITEM = 'i.is_bonus=0 AND i.quantity>0';
const sellerProductSql = `SELECT ${dayExpr('o.first_closed_at')} AS day, COALESCE(o.seller_id,'') AS seller_id, COALESCE(i.product_id,'') AS product_id,
    COALESCE(i.name,'') AS name, COUNT(DISTINCT i.order_id) AS orders, SUM(i.quantity) AS quantity, SUM(i.line_total) AS total,
    SUM(CASE WHEN i.is_bonus=0 THEN i.quantity ELSE 0 END) AS closed_quantity,
    SUM(i.line_total) AS closed_total,
    SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.quantity ELSE 0 END) AS delivered_quantity,
    SUM(CASE WHEN o.status_code IN (${inList(STATUS_GROUPS.delivered)}) THEN i.line_total ELSE 0 END) AS delivered_total,
    SUM(i.returned_count) AS returned_quantity,
    SUM(CASE WHEN ${SALE_ITEM} THEN i.quantity ELSE 0 END) AS sale_quantity,
    SUM(CASE WHEN ${SALE_ITEM} THEN i.line_total ELSE 0 END) AS sale_total
  FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
  WHERE o.pos_id=? AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED} GROUP BY 1, 2, 3, 4`;
const sellerProductExisting = `SELECT id, ${SELLER_PRODUCT_COLUMNS.join(',')} FROM stats_daily_seller_product WHERE pos_id=? AND day>=? AND day<=?`;

/** Câu ghi cho stats_daily_seller_product của một khoảng ngày (chỉ ghi dòng mới / đổi, xóa dòng không còn). */
function sellerProductStatements(db: D1Database, posId: string, range: { start: string; end: string }, rows: Row[], existing: Row[], now: string) {
  const keyOf = (r: Row) => ({ pos_id: posId, day: String(r.day), seller_id: String(r.seller_id ?? ''), product_id: String(r.product_id ?? ''), name: String(r.name ?? '') });
  return diffStatements(db, 'stats_daily_seller_product', keyOf, SELLER_PRODUCT_COLUMNS, range, rows, existing, now);
}

/** Khóa app_settings: tháng cũ của stats_daily_seller_product đã điền xong (bộ hẹn giờ ghi giá trị = SELLER_PRODUCT_EPOCH). */
export const SELLER_PRODUCT_READY_KEY = 'stats_seller_product_ready';
export const SELLER_PRODUCT_EPOCH = 1;
let sellerProductReady = { value: false, at: 0 };
/** Đọc báo cáo sản phẩm từ bảng tính sẵn khi đã điền đủ lịch sử; chưa đủ thì nơi gọi đọc đơn gốc như cũ. Nhớ 60 giây mỗi isolate. */
export async function sellerProductStatsReady(db: D1Database) {
  if (Date.now() - sellerProductReady.at < 60000) return sellerProductReady.value;
  let value = false;
  try {
    const r = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(SELLER_PRODUCT_READY_KEY).first<{ value: string }>();
    value = r?.value === String(SELLER_PRODUCT_EPOCH);
  } catch { value = false; }
  sellerProductReady = { value, at: Date.now() };
  return value;
}

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
  // Ngày chốt (lần đầu vào Chờ xác nhận trở đi); đánh dấu thêm ngày xác nhận cho chắc khi lịch sử thiếu.
  const closedIn = (h: { status?: number; old_status?: number }) => [h.status, h.old_status].some((c) => c !== undefined && c !== null && !NOT_CLOSED_CODES.includes(c));
  const closed = (o.status_history ?? []).filter((h) => closedIn(h) && h.updated_at).map((h) => h.updated_at!).sort()[0];
  const confirmed = (o.status_history ?? []).filter((h) => h.status === 1 && h.updated_at)
    .map((h) => h.updated_at!).sort()[0];
  markDirty(dirty, posId, closed);
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

/** Tính lại số liệu cho các (POS, ngày) đã đổi. Trả về số dòng ghi. */
export async function rebuildStats(db: D1Database, dirty: DirtyBuckets) {
  await ensureStatsSchema(db);
  await ensureMktSchema(db);
  const now = new Date().toISOString();
  let writes = 0;
  for (const [posId, days] of dirty) {
    for (const range of dayRanges(days)) {
      const startUtc = vnDayStartUtc(range.start), endUtc = vnDayStartUtc(addDays(range.end, 1));
      const [createdRows, closedRows, closedQty, assignedRows, sellerProductRows, sellerProductOld, mktRows, mktOld, ...segmentResults] = await db.batch([
        db.prepare(`SELECT ${dayExpr('created_at')} AS day, COALESCE(seller_id,'') AS seller_id, ${createdSelect}
          FROM raw_pos_orders WHERE pos_id=? AND created_at>=? AND created_at<? GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${dayExpr('first_closed_at')} AS day, COALESCE(seller_id,'') AS seller_id, ${closedSelect}
          FROM raw_pos_orders WHERE pos_id=? AND first_closed_at>=? AND first_closed_at<? AND ${CLOSED} GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${dayExpr('o.first_closed_at')} AS day, COALESCE(o.seller_id,'') AS seller_id, SUM(i.quantity) AS quantity
          FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
          WHERE o.pos_id=? AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED} AND i.is_bonus=0 GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        db.prepare(`SELECT ${dayExpr('seller_assigned_at')} AS day, COALESCE(seller_id,'') AS seller_id, COUNT(*) AS assigned_orders, SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS assigned_closed_orders
          FROM raw_pos_orders WHERE pos_id=? AND seller_assigned_at>=? AND seller_assigned_at<? AND status_code<>7 GROUP BY 1, 2`).bind(posId, startUtc, endUtc),
        // Sản phẩm theo ngày chốt của đơn (đơn chốt), giống "SL sản phẩm" trên Pancake; theo người bán + tên dòng hàng,
        // stats_daily_product cộng lại từ đây.
        db.prepare(sellerProductSql).bind(posId, startUtc, endUtc),
        db.prepare(sellerProductExisting).bind(posId, range.start, range.end),
        // Số MKT theo ngày xác nhận (stats_daily_mkt, 0050).
        ...mktReads(db, posId, range),
        ...segmentReads(db, posId, range),
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
      for (const r of assignedRows.results as Row[]) { const b = bucket(String(r.day), String(r.seller_id ?? '')); b.assigned_orders = Number(r.assigned_orders ?? 0); b.assigned_closed_orders = Number(r.assigned_closed_orders ?? 0); }

      const statements: D1PreparedStatement[] = segmentStatements(db, posId, range, segmentResults, now);
      const keepSellers = new Map<string, string[]>(), keepProducts = new Map<string, string[]>();
      for (const [key, values] of merged) {
        const [day, seller] = key.split(' ');
        if (day < range.start || day > range.end) continue; // ngoài khoảng đang tính (an toàn)
        statements.push(upsertStatement(db, 'stats_daily', { pos_id: posId, day, seller_id: seller }, values, now));
        keepSellers.set(day, [...(keepSellers.get(day) ?? []), seller]);
      }
      // stats_daily_product = cộng các người bán / tên dòng hàng của cùng (ngày, sản phẩm); tên = tên lớn nhất như MAX(i.name).
      const products = new Map<string, Map<string, { name: string; values: Record<string, number> }>>();
      for (const r of sellerProductRows.results as Row[]) {
        const day = String(r.day), product = String(r.product_id ?? ''), name = String(r.name ?? '');
        if (!products.has(day)) products.set(day, new Map());
        const byProduct = products.get(day)!;
        let p = byProduct.get(product);
        if (!p) byProduct.set(product, p = { name, values: Object.fromEntries(PRODUCT_COLUMNS.map((c) => [c, 0])) });
        if (name > p.name) p.name = name;
        for (const c of PRODUCT_COLUMNS) p.values[c] += Number(r[c] ?? 0);
      }
      for (const [day, byProduct] of products) {
        if (day < range.start || day > range.end) continue;
        for (const [product, p] of byProduct) {
          statements.push(upsertStatement(db, 'stats_daily_product', { pos_id: posId, day, product_id: product }, { name: p.name, ...p.values }, now));
          keepProducts.set(day, [...(keepProducts.get(day) ?? []), product]);
        }
      }
      statements.push(...sellerProductStatements(db, posId, range, sellerProductRows.results as Row[], sellerProductOld.results as Row[], now));
      statements.push(...mktStatements(db, posId, range, mktRows.results as Row[], mktOld.results as Row[], now));
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

/** Điền stats_daily_seller_product cho một (POS, tháng) đã có đơn trước khi bảng ra đời (bộ hẹn giờ gọi dần, mới trước cũ sau). */
export async function buildSellerProductMonth(db: D1Database, posId: string, month: string) {
  const days = [...monthDays(month)];
  const range = { start: days[0], end: days[days.length - 1] };
  const [rows, existing] = await db.batch([
    db.prepare(sellerProductSql).bind(posId, vnDayStartUtc(range.start), vnDayStartUtc(addDays(range.end, 1))),
    db.prepare(sellerProductExisting).bind(posId, range.start, range.end),
  ]);
  return run(db, sellerProductStatements(db, posId, range, rows.results as Row[], existing.results as Row[], new Date().toISOString()));
}

/** Điền riêng cột assigned_closed_orders cho một (POS, tháng) — nhẹ hơn nhiều so với dựng lại cả bảng:
 * một câu đọc theo chỉ mục (pos_id, seller_assigned_at) và chỉ ghi những dòng có số > 0. Dùng cho STATS_EPOCH 6. */
export async function fillAssignedClosedMonth(db: D1Database, posId: string, month: string) {
  await ensureStatsSchema(db);
  const startUtc = vnDayStartUtc(`${month}-01`), endUtc = vnDayStartUtc(addDays([...monthDays(month)].pop()!, 1));
  const rows = await db.prepare(`SELECT ${dayExpr('seller_assigned_at')} AS day, COALESCE(seller_id,'') AS seller_id, SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS n
    FROM raw_pos_orders INDEXED BY idx_raw_orders_pos_assignment WHERE pos_id=? AND seller_assigned_at>=? AND seller_assigned_at<? AND status_code<>7 GROUP BY 1, 2`)
    .bind(posId, startUtc, endUtc).all<{ day: string; seller_id: string; n: number }>();
  const statements = rows.results.filter((r) => Number(r.n) > 0).map((r) =>
    db.prepare('UPDATE stats_daily SET assigned_closed_orders=? WHERE id=? AND assigned_closed_orders<>?').bind(Number(r.n), `${posId}:${r.day}:${r.seller_id}`, Number(r.n)));
  return run(db, statements);
}

/**
 * Điền giờ chốt first_closed_at cho đơn tạo trong một (POS, tháng) còn trống (đơn cũ trước migration 0037), từ lịch sử trạng thái:
 * lần đầu vào Chờ xác nhận hoặc sau đó; mục lịch sử đầu tiên có trạng thái cũ đã là chốt (đơn tạo thẳng ở Chờ XN) thì lấy giờ tạo đơn; thiếu lịch sử thì giờ xác nhận / cập nhật.
 */
export async function fillClosedAtMonth(db: D1Database, posId: string, month: string, deadline = Date.now() + 5000) {
  const startUtc = vnDayStartUtc(`${month}-01`), endUtc = vnDayStartUtc(addDays([...monthDays(month)].pop()!, 1));
  const nc = inList(NOT_CLOSED);
  // Từng lô 500 đơn: một câu lớn làm D1 quá thời gian (migration 08/10/2026, code 7429).
  const LOT = 500;
  let writes = 0;
  while (Date.now() < deadline) {
    const r = await db.prepare(`UPDATE raw_pos_orders SET first_closed_at = COALESCE(
        (SELECT MIN(CASE WHEN h.key=0 AND json_extract(h.value,'$.old_status') NOT IN (${nc}) THEN created_at
          WHEN json_extract(h.value,'$.status') NOT IN (${nc}) THEN json_extract(h.value,'$.updated_at') END) FROM json_each(status_history_json) h),
        first_confirmed_at, updated_at, created_at)
      WHERE rowid IN (SELECT rowid FROM raw_pos_orders WHERE pos_id=? AND created_at>=? AND created_at<? AND first_closed_at IS NULL AND status_code NOT IN (${nc}) LIMIT ${LOT})`)
      .bind(posId, startUtc, endUtc).run();
    const n = Number(r.meta?.changes ?? 0);
    writes += n;
    if (n < LOT) return { writes, done: true };
  }
  return { writes, done: false };
}

/** Khóa app_settings: giờ gửi first_sent_at của đơn cũ đã điền xong (giá trị = SENT_AT_EPOCH); có cờ thì Vận đơn tính theo ngày gửi. */
export const SENT_AT_READY_KEY = 'van_don_sent_ready';
export const SENT_AT_EPOCH = 1;
/**
 * Vận đơn đọc theo ngày gửi khi đã điền đủ giờ gửi cho đơn cũ; chưa đủ thì nơi gọi tính theo ngày vào Chờ xác nhận như cũ.
 * Đọc thẳng mỗi lần tính báo cáo, không nhớ trong isolate: cờ bật là phiên bản dữ liệu đổi ngay (worker.ts), nếu cờ còn nhớ giá trị cũ
 * thì lượt tính đầu của phiên bản mới ra số cách cũ và bị lưu dưới khóa mới tới lần đồng bộ sau (QA 10/10/2026). Báo cáo đã qua cache
 * theo phiên bản nên câu này chỉ chạy khi thật sự tính lại.
 */
export async function sentAtReady(db: D1Database) {
  try {
    const r = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(SENT_AT_READY_KEY).first<{ value: string }>();
    return r?.value === String(SENT_AT_EPOCH);
  } catch { return false; }
}

/** Điền giờ gửi (lần đầu giao cho đơn vị vận chuyển) cho đơn cũ đang ở trạng thái đã gửi, từng lô 500 như fillClosedAtMonth. */
export async function fillSentAtMonth(db: D1Database, posId: string, month: string, deadline = Date.now() + 5000) {
  const startUtc = vnDayStartUtc(`${month}-01`), endUtc = vnDayStartUtc(addDays([...monthDays(month)].pop()!, 1));
  const sent = inList(SENT_CODES);
  const LOT = 500;
  let writes = 0;
  while (Date.now() < deadline) {
    // Cùng thứ tự với lúc đồng bộ (lib/sync.ts): lịch sử (tạo thẳng ở trạng thái gửi thì giờ tạo), giờ xác nhận, giờ đổi trạng thái cuối,
    // giờ cập nhật, giờ tạo. Cuối cùng là giờ tải về và một mốc cố định để đơn đã chọn luôn được điền, lượt sau không chọn lại mãi (QA 10/10).
    const r = await db.prepare(`UPDATE raw_pos_orders SET first_sent_at = COALESCE(
        (SELECT MIN(CASE WHEN h.key=0 AND json_extract(h.value,'$.old_status') IN (${sent}) THEN created_at
          WHEN json_extract(h.value,'$.status') IN (${sent}) THEN json_extract(h.value,'$.updated_at') END)
          FROM json_each(CASE WHEN json_valid(status_history_json) THEN status_history_json ELSE '[]' END) h),
        first_confirmed_at, last_status_at, updated_at, created_at, fetched_at, '1970-01-01T00:00:00')
      WHERE rowid IN (SELECT rowid FROM raw_pos_orders WHERE pos_id=? AND created_at>=? AND created_at<? AND first_sent_at IS NULL AND status_code IN (${sent}) LIMIT ${LOT})`)
      .bind(posId, startUtc, endUtc).run();
    const n = Number(r.meta?.changes ?? 0);
    writes += n;
    if (n < LOT) return { writes, done: true };
  }
  return { writes, done: false };
}

/** Khóa app_settings: số đơn ở trạng thái gửi mà lịch sử không ghi bước gửi (giờ gửi là ước tính), theo tháng tạo đơn: {"2026-09": 12}. */
export const SENT_ESTIMATED_KEY = 'van_don_sent_estimated';
/** Đếm đơn của (POS, tháng tạo) có giờ gửi ước tính, cộng vào app_settings (QA 10/10/2026: ghi số này để biết số theo ngày có đáng tin). */
export async function countSentEstimatedMonth(db: D1Database, posId: string, month: string) {
  const startUtc = vnDayStartUtc(`${month}-01`), endUtc = vnDayStartUtc(addDays([...monthDays(month)].pop()!, 1));
  const sent = inList(SENT_CODES);
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM raw_pos_orders o WHERE o.pos_id=? AND o.created_at>=? AND o.created_at<? AND o.status_code IN (${sent})
      AND NOT EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(o.status_history_json) THEN o.status_history_json ELSE '[]' END) h
        WHERE json_extract(h.value,'$.status') IN (${sent}) OR (h.key=0 AND json_extract(h.value,'$.old_status') IN (${sent})))`)
    .bind(posId, startUtc, endUtc).first<{ n: number }>();
  const n = Number(row?.n ?? 0);
  if (!n) return 0;
  const cur = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(SENT_ESTIMATED_KEY).first<{ value: string }>();
  let map: Record<string, number> = {};
  try { map = JSON.parse(cur?.value ?? '{}') as Record<string, number>; } catch { map = {}; }
  map[month] = (map[month] ?? 0) + n;
  await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at WHERE app_settings.value IS NOT excluded.value')
    .bind(SENT_ESTIMATED_KEY, JSON.stringify(map), new Date().toISOString()).run();
  return 1;
}

export function monthDays(month: string) {
  const days = new Set<string>();
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) days.add(d);
  return days;
}

/** Tạo bảng trên PC chưa áp migration; nhớ riêng từng DB demo/test. */
const segmentSchemas = new WeakSet<D1Database>();
export async function ensureSegmentSchema(db: D1Database) {
  if (segmentSchemas.has(db)) return;
  const exists = await db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='stats_daily_segment'").first();
  if (exists) { segmentSchemas.add(db); return; }
  await db.prepare(`CREATE TABLE IF NOT EXISTS stats_daily_segment (
    id TEXT PRIMARY KEY NOT NULL, pos_id TEXT NOT NULL, day TEXT NOT NULL,
    seller_id TEXT NOT NULL DEFAULT '', segment TEXT NOT NULL, marketer_id TEXT NOT NULL DEFAULT '',
    ${STAT_COLUMNS.map(c => `${c} INTEGER NOT NULL DEFAULT 0`).join(',')}, updated_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_stats_daily_segment_pos_day ON stats_daily_segment(pos_id, day)').run();
  segmentSchemas.add(db);
}

export const SEGMENT_READY_KEY = 'stats_segment_epoch';
export const SEGMENT_EPOCH = 1;
/** Chưa điền đủ lịch sử luôn đọc đường cũ; đọc cờ trực tiếp mỗi lượt báo cáo. */
export async function segmentStatsReady(db: D1Database) {
  try {
    const r = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(SEGMENT_READY_KEY).first<{ value: string }>();
    return r?.value === String(SEGMENT_EPOCH);
  } catch { return false; }
}

function segmentReads(db: D1Database, posId: string, range: { start: string; end: string }) {
  const dimensions = `COALESCE(o.seller_id,'') AS seller_id, ${segmentKeyExpr('o')} AS segment, COALESCE(${marketerValue('o')},'') AS marketer_id`;
  const start = vnDayStartUtc(range.start), end = vnDayStartUtc(addDays(range.end, 1));
  const event = (date: string, values: string, where = '') => db.prepare(`SELECT ${dayExpr(date)} AS day, ${dimensions}, ${values}
    FROM raw_pos_orders o WHERE o.pos_id=? AND ${date}>=? AND ${date}<? ${where} GROUP BY 1,2,3,4`).bind(posId, start, end);
  return [
    event('o.created_at', createdSelect),
    event('o.first_closed_at', closedSelect, `AND o.${CLOSED}`),
    db.prepare(`SELECT ${dayExpr('o.first_closed_at')} AS day, ${dimensions}, SUM(i.quantity) AS closed_quantity
      FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
      WHERE o.pos_id=? AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED} AND i.is_bonus=0 GROUP BY 1,2,3,4`).bind(posId, start, end),
    event('o.seller_assigned_at', `COUNT(*) AS assigned_orders, SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS assigned_closed_orders`, 'AND status_code<>7'),
    db.prepare(`SELECT id, ${STAT_COLUMNS.join(',')} FROM stats_daily_segment WHERE pos_id=? AND day>=? AND day<=?`).bind(posId, range.start, range.end),
  ];
}
function segmentStatements(db: D1Database, posId: string, range: { start: string; end: string }, results: D1Result[], now: string) {
  const merged = new Map<string, Row>();
  for (const result of results.slice(0, 4)) for (const r of result.results as Row[]) {
    const key = JSON.stringify([r.day, r.seller_id, r.segment, r.marketer_id]);
    let row = merged.get(key);
    if (!row) { row = { day: r.day, seller_id: r.seller_id, segment: r.segment, marketer_id: r.marketer_id }; merged.set(key, row); }
    for (const c of STAT_COLUMNS) if (c in r) row[c] = Number(r[c] ?? 0);
  }
  return diffStatements(db, 'stats_daily_segment', r => ({ pos_id: posId, day: String(r.day), seller_id: String(r.seller_id), segment: String(r.segment), marketer_id: String(r.marketer_id) }),
    STAT_COLUMNS, range, [...merged.values()], results[4].results as Row[], now);
}
/** Điền theo tháng sự kiện, gồm cả đơn tạo tháng trước nhưng chốt/chia trong tháng này. */
export async function backfillSegmentMonth(db: D1Database, posId: string, month: string) {
  await ensureSegmentSchema(db);
  const days = [...monthDays(month)], range = { start: days[0], end: days[days.length - 1] };
  const results = await db.batch(segmentReads(db, posId, range));
  return run(db, segmentStatements(db, posId, range, results, new Date().toISOString()));
}
/** Liệt kê cả ba cơ sở ngày để không bỏ sót tháng chốt/chia sau tháng tạo cuối cùng. */
export async function segmentMonths(db: D1Database) {
  const rows = await db.prepare(`SELECT pos_id, substr(day,1,7) AS month FROM (
    SELECT pos_id, ${dayExpr('created_at')} AS day FROM raw_pos_orders
    UNION SELECT pos_id, ${dayExpr('first_closed_at')} AS day FROM raw_pos_orders
    UNION SELECT pos_id, ${dayExpr('seller_assigned_at')} AS day FROM raw_pos_orders
  ) WHERE day IS NOT NULL GROUP BY pos_id, month ORDER BY month DESC, pos_id`).all<{pos_id: string; month: string}>();
  return rows.results.map(r => `${r.pos_id}:${r.month}`);
}

/** Một lần mỗi ngày sau 02:30 VN; chỉ kiểm bảng đã điền đủ, sửa đúng các ngày lệch. Không gửi tin ra ngoài. */
export async function checkSegmentStatsNightly(db: D1Database, now = new Date()) {
  const vn = new Date(now.getTime() + VN_OFFSET_HOURS * 3600000).toISOString();
  const day = vn.slice(0, 10), key = 'stats_segment_checked_day';
  if (vn.slice(11, 16) < '02:30' || !await segmentStatsReady(db)) return 0;
  const checked = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{value: string}>();
  if (checked?.value === day) return 0;
  const start = addDays(day, -6);
  const sums = STAT_COLUMNS.map(c => `SUM(${c}) AS ${c}`).join(',');
  const [daily, segments] = await db.batch(['stats_daily', 'stats_daily_segment'].map(table =>
    db.prepare(`SELECT pos_id, day, ${sums} FROM ${table} WHERE day>=? AND day<=? GROUP BY pos_id,day`).bind(start, day)));
  const old = new Map((daily.results as Row[]).map(r => [JSON.stringify([r.pos_id, r.day]), r]));
  const next = new Map((segments.results as Row[]).map(r => [JSON.stringify([r.pos_id, r.day]), r]));
  const dirty: DirtyBuckets = new Map();
  for (const k of new Set([...old.keys(), ...next.keys()])) {
    const a = old.get(k), b = next.get(k);
    if (STAT_COLUMNS.every(c => Number(a?.[c] ?? 0) === Number(b?.[c] ?? 0))) continue;
    const r = a ?? b!;
    const pos = String(r.pos_id);
    if (!dirty.has(pos)) dirty.set(pos, new Set());
    dirty.get(pos)!.add(String(r.day));
  }
  let writes = 0;
  if (dirty.size) {
    writes += await rebuildStats(db, dirty);
    const count = [...dirty.values()].reduce((n, days) => n + days.size, 0);
    const message = `Đối chiếu bảng nhóm sản phẩm: đã tính lại ${count} ngày POS bị lệch trong 7 ngày gần nhất.`;
    console.warn(message);
    const r = await db.prepare('INSERT INTO alert_log (id,owner_id,kind,employee_id,day,sent_at,message,ok,error) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), 'system', 'stats_segment_mismatch', null, day, now.toISOString(), message, 1, null).run();
    writes += Number(r.meta?.rows_written ?? 0);
  }
  const r = await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE app_settings.value IS NOT excluded.value')
    .bind(key, day, now.toISOString()).run();
  return writes + Number(r.meta?.rows_written ?? 0);
}
