import { observeD1 } from '@/lib/d1-usage';
import { normalizePhone } from '@/lib/customer-stats';
import { noteStatements, parseCustomerCursor, syncCustomersBackfill, syncCustomersRecent } from '@/lib/customers-sync';
const REWALK_EVERY_MS = 12 * 3600000;
import {
  CANCELLED_STATUSES, DELIVERED_STATUSES, RETURNED_STATUSES,
  listOrdersPage, listUsers, listVariationsPage,
  type SourceOrder, type SourcePage,
} from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { SENT_CODES } from '@/lib/shipping-lines';
import { COMPANY_START_MONTH, addDays, todayVn, vnDayStartUtc } from '@/lib/report-time';
import { autoMapShops } from '@/lib/shop-map';
import { NOT_CLOSED_CODES, markDirtyOrder, monthDays, rebuildStats, type DirtyBuckets } from '@/lib/stats';
import { markDirtyCustomer, rebuildCustomerStats, type DirtyCustomers } from '@/lib/customer-stats';
import { toIso } from '@/lib/hr-link';

// Lịch sử được lấy từ tháng hiện tại lùi dần về `oldestMonth` (đơn mới ưu tiên trước).
export type BackfillCursor = { month: string; page: number; pageSize?: number; completed?: boolean; oldestMonth?: string };
export const WRITE_LIMIT_ERROR = /daily row write limit|exceeded D1's free tier/i;
export class WriteLimitError extends Error {}
export type ShopRow = {
  id: string; shop_id: string | null; enabled: number; cursor: string | null;
  last_sync_at: string | null; users_synced_at: string | null; products_synced_at: string | null;
  customers_synced_at?: string | null; customer_cursor?: string | null;
  recent_watermark?: string | null; recent_cursor?: string | null;
};

const PAGE_SIZE = 100;
const RECENT_OVERLAP_MS = 30 * 60000;
// Đơn sửa sát giờ gọi có thể chưa kịp hiện trong danh sách Pancake: mốc nước khi chưa theo kịp luôn lùi sau giờ gọi 2 phút.
const RECENT_SETTLE_MS = 2 * 60000;

export const currentMonth = () => new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date());
export const nextMonth = (month: string, step = 1) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + step);
  return date.toISOString().slice(0, 7);
};
export const prevMonth = (month: string) => nextMonth(month, -1);
const monthBounds = (month: string) => ({
  startDateTime: String(Date.parse(`${month}-01T00:00:00Z`) / 1000),
  endDateTime: String(Date.parse(`${nextMonth(month)}-01T00:00:00Z`) / 1000 - 1),
});
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function parseCursor(raw: string | null): BackfillCursor | null {
  if (!raw) return null;
  try {
    const cursor = JSON.parse(raw) as BackfillCursor;
    if (!/^\d{4}-\d{2}$/.test(cursor.month) || !Number.isInteger(cursor.page) || cursor.page < 1) return null;
    return cursor;
  } catch { return null; }
}

type Cell = string | number | null;
type StoredRow = Record<string, Cell>;
const ORDER_COLUMNS = ['id', 'pos_id', 'shop_id', 'source_order_id', 'phone', 'created_at', 'updated_at', 'status_code', 'seller_id', 'seller_assigned_at', 'care_id', 'current_total', 'first_confirmed_at', 'first_confirmed_by', 'status_history_json', 'other_history_json', 'item_json', 'history_limited', 'fetched_at', 'customer_name', 'customer_id', 'total_discount', 'shipping_fee', 'cod', 'money_to_collect', 'total_quantity', 'sub_status', 'creator_id', 'last_editor_id', 'marketer_id', 'care_assigned_at', 'delivered_at', 'returned_at', 'cancelled_at', 'last_status_at', 'order_source', 'warehouse_id', 'tags_json', 'note', 'is_removed', 'raw_json', 'net_total', 'first_closed_at', 'first_sent_at'];
const ITEM_COLUMNS = ['id', 'order_id', 'pos_id', 'product_id', 'variation_id', 'name', 'quantity', 'returned_count', 'retail_price', 'discount', 'line_total', 'seller_id', 'is_bonus', 'is_composite', 'one_time'];
/** Các giá trị nguồn giống hệt các bind của upsert cũ. */
export function orderRow(posId: string, shopId: string, o: SourceOrder, now: string) {
  if (o.id === undefined || o.id === null) return null;
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
  const values: Cell[] = [
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
  ];
  return Object.fromEntries(ORDER_COLUMNS.map((c, i) => [c, values[i]])) as StoredRow;
}

export function itemRows(id: string, posId: string, o: SourceOrder): StoredRow[] {
  return (o.items ?? []).map((i, index) => {
    const quantity = num(i.quantity) ?? 0;
    const price = num(i.variation_info?.retail_price) ?? 0;
    const rawDiscount = num(i.discount_each_product) ?? 0;
    const discount = i.is_discount_percent ? Math.round(price * rawDiscount / 100) : rawDiscount;
    const values: Cell[] = [
      `${id}:${index}`, id, posId, str(i.product_id) ?? str(i.variation_info?.product_id), str(i.variation_id),
      variationName(i), quantity, num(i.returned_count) ?? 0, price, discount,
      Math.max(0, (price - discount) * quantity), str(i.assigning_seller_id),
      i.is_bonus_product ? 1 : 0, i.is_composite ? 1 : 0, i.one_time_product ? 1 : 0,
    ];
    return Object.fromEntries(ITEM_COLUMNS.map((c, n) => [c, values[n]]));
  });
}
function insertItem(db: D1Database, row: StoredRow, replace: boolean) {
  return db.prepare(`INSERT ${replace ? 'OR REPLACE ' : ''}INTO raw_pos_order_items (${ITEM_COLUMNS.join(',')}) VALUES (${ITEM_COLUMNS.map(() => '?').join(',')})`).bind(...ITEM_COLUMNS.map((c) => row[c]));
}
function updateRow(db: D1Database, table: string, row: StoredRow, stored: StoredRow, skip: string[] = []) {
  const cols = Object.keys(row).filter((c) => c !== 'id' && !skip.includes(c) &&
    (typeof row[c] === 'number' && stored[c] !== null ? Number(stored[c]) !== row[c] : stored[c] !== row[c]));
  if (table === 'raw_pos_orders') {
    if (!cols.some((c) => c !== 'fetched_at')) return [];
    if (!cols.includes('fetched_at')) cols.push('fetched_at');
  }
  return cols.length ? [db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`).bind(...cols.map((c) => row[c]), row.id)] : [];
}
type StoredOrder = { row: StoredRow; items: StoredRow[] };
export function orderStatements(db: D1Database, posId: string, shopId: string, o: SourceOrder, now: string, stored?: StoredOrder, includeNotes = true, pending?: Map<string, StoredOrder>) {
  const row = orderRow(posId, shopId, o, now);
  if (!row) return [];
  let statements: D1PreparedStatement[];
  if (!stored) {
    statements = [db.prepare(LEGACY_INSERT).bind(...ORDER_COLUMNS.map((c) => row[c])),
      db.prepare('DELETE FROM raw_pos_order_items WHERE order_id=?').bind(row.id)];
  } else {
    for (const c of ['first_confirmed_at', 'first_confirmed_by', 'delivered_at', 'returned_at', 'cancelled_at']) row[c] = stored.row[c] ?? row[c];
    for (const c of ['first_closed_at', 'first_sent_at']) {
      const prior = stored.row[c];
      if (prior !== null && (row[c] === null || String(prior) < String(row[c]))) row[c] = prior;
    }
    statements = updateRow(db, 'raw_pos_orders', row, stored.row, ['pos_id', 'shop_id', 'source_order_id', 'other_history_json']);
  }
  const orderChanged = statements.length > 0;
  const previous = new Map((stored?.items ?? []).map((i) => [i.id, i]));
  for (const item of itemRows(String(row.id), posId, o)) {
    const prior = previous.get(item.id);
    if (prior) statements.push(...updateRow(db, 'raw_pos_order_items', item, prior));
    // OR REPLACE cho đơn mới: bấm tay và lập lịch có thể chạy chồng.
    else statements.push(insertItem(db, item, !stored));
    previous.delete(item.id);
  }
  for (const id of previous.keys()) statements.push(db.prepare('DELETE FROM raw_pos_order_items WHERE id=?').bind(id));
  if (includeNotes) statements.push(...noteStatements(db, posId, str(o.customer?.id) ?? str(o.customer?.customer_id), normalizePhone(str(o.bill_phone_number) ?? '') || null, o.customer?.notes ?? null, now, 'order'));
  if (pending) {
    // Mirror the sequential upsert, including columns intentionally absent from SET.
    const next = { ...row };
    if (stored) {
      for (const c of ['pos_id', 'shop_id', 'source_order_id', 'other_history_json']) next[c] = stored.row[c];
      if (!orderChanged) next.fetched_at = stored.row.fetched_at;
    }
    pending.set(String(row.id), { row: next, items: itemRows(String(row.id), posId, o) });
  }
  return statements;
}
const LEGACY_INSERT = `INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,created_at,updated_at,status_code,seller_id,seller_assigned_at,care_id,current_total,first_confirmed_at,first_confirmed_by,status_history_json,other_history_json,item_json,history_limited,fetched_at,
        customer_name,customer_id,total_discount,shipping_fee,cod,money_to_collect,total_quantity,sub_status,creator_id,last_editor_id,marketer_id,care_assigned_at,delivered_at,returned_at,cancelled_at,last_status_at,order_source,warehouse_id,tags_json,note,is_removed,raw_json,net_total,first_closed_at,first_sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,created_at=excluded.created_at,updated_at=excluded.updated_at,status_code=excluded.status_code,seller_id=excluded.seller_id,seller_assigned_at=excluded.seller_assigned_at,care_id=excluded.care_id,current_total=excluded.current_total,
        first_confirmed_at=COALESCE(raw_pos_orders.first_confirmed_at,excluded.first_confirmed_at),first_confirmed_by=COALESCE(raw_pos_orders.first_confirmed_by,excluded.first_confirmed_by),
        status_history_json=excluded.status_history_json,item_json=excluded.item_json,history_limited=excluded.history_limited,fetched_at=excluded.fetched_at,
        customer_name=excluded.customer_name,customer_id=excluded.customer_id,total_discount=excluded.total_discount,shipping_fee=excluded.shipping_fee,cod=excluded.cod,money_to_collect=excluded.money_to_collect,total_quantity=excluded.total_quantity,sub_status=excluded.sub_status,creator_id=excluded.creator_id,last_editor_id=excluded.last_editor_id,marketer_id=excluded.marketer_id,care_assigned_at=excluded.care_assigned_at,
        delivered_at=COALESCE(raw_pos_orders.delivered_at,excluded.delivered_at),returned_at=COALESCE(raw_pos_orders.returned_at,excluded.returned_at),cancelled_at=COALESCE(raw_pos_orders.cancelled_at,excluded.cancelled_at),last_status_at=excluded.last_status_at,
        order_source=excluded.order_source,warehouse_id=excluded.warehouse_id,tags_json=excluded.tags_json,note=excluded.note,is_removed=excluded.is_removed,raw_json=excluded.raw_json,net_total=excluded.net_total,
        first_closed_at=COALESCE(MIN(raw_pos_orders.first_closed_at,excluded.first_closed_at),raw_pos_orders.first_closed_at,excluded.first_closed_at),
        first_sent_at=COALESCE(MIN(raw_pos_orders.first_sent_at,excluded.first_sent_at),raw_pos_orders.first_sent_at,excluded.first_sent_at)`;

function variationName(i: SourceOrder['items'] extends (infer T)[] | undefined ? T : never) {
  const base = i.variation_info?.name?.trim() ?? '';
  const fields = (i.variation_info?.fields ?? []).map((f) => f.value).filter(Boolean).join(' / ');
  return fields ? `${base} (${fields})` : base;
}

/** Đọc đơn và dòng hàng theo khối 90 id, kể cả khi updated_at nguồn không đổi. */
export async function loadStored(db: D1Database, posId: string, orders: SourceOrder[], existing = new Map<string, StoredOrder>()) {
  const ids = [...new Set(orders.filter((o) => o.id !== undefined && o.id !== null).map((o) => `${posId}:${o.id}`))].filter((id) => !existing.has(id));
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90), ph = chunk.map(() => '?').join(',');
    const [rows, items] = await Promise.all([
      db.prepare(`SELECT ${ORDER_COLUMNS.join(',')} FROM raw_pos_orders WHERE id IN (${ph})`).bind(...chunk).all<StoredRow>(),
      db.prepare(`SELECT ${ITEM_COLUMNS.join(',')} FROM raw_pos_order_items WHERE order_id IN (${ph})`).bind(...chunk).all<StoredRow>(),
    ]);
    for (const row of rows.results) existing.set(String(row.id), { row, items: [] });
    for (const item of items.results) existing.get(String(item.order_id))?.items.push(item);
  }
  return existing;
}
function dirtyStored(dirty: DirtyBuckets, customers: DirtyCustomers, posId: string, row: StoredRow) {
  markDirtyOrder(dirty, posId, {
    inserted_at: row.created_at as string | undefined, time_assign_seller: row.seller_assigned_at as string | undefined,
    status_history: [row.first_closed_at, row.first_confirmed_at].filter((v) => v !== null).map((v) => ({ status: 1, updated_at: String(v) })),
  });
  markDirtyCustomer(customers, posId, row.phone as string | null);
}

/** Ghi theo lô; trả về tổng số dòng đã ghi (D1 tính cả index) để theo dõi hạn mức. */
async function writeBatched(db: D1Database, statements: D1PreparedStatement[]) {
  let writes = 0;
  try {
    for (let i = 0; i < statements.length; i += 100) {
      const results = await db.batch(statements.slice(i, i + 100));
      for (const r of results) writes += Number(r.meta?.rows_written ?? 0);
    }
  } catch (error) {
    if (error instanceof Error && WRITE_LIMIT_ERROR.test(error.message)) throw new WriteLimitError(error.message);
    throw error;
  }
  return writes;
}

function validatePage(page: SourcePage) {
  if (!page.success || !Array.isArray(page.data)) throw new Error('Trang đơn từ Pancake POS không hợp lệ.');
}

/** Giờ Pancake → ms. Chuỗi không múi giờ là giờ UTC (như timeVn ở bot.ts), có thể kèm phần lẻ micro giây. */
export function pancakeMs(value: unknown) {
  const iso = toIso(value);
  return iso ? Date.parse(iso) : null;
}

/** Con trỏ đơn vừa sửa (cột recent_cursor): null = đã theo kịp, lượt sau lùi 30 phút chờm; {} = chưa theo kịp, đi tiếp đúng từ mốc;
 *  offset/total = đang lật trang trong giây của mốc (hơn 100 đơn cùng một giây), offset = số đơn đầu giây đó đã chắc chắn đọc. */
export type RecentCursor = { offset?: number; total?: number | null };
export function parseRecentCursor(raw: string | null | undefined): RecentCursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as RecentCursor;
    if (!c || typeof c !== 'object') return null;
    return Number.isInteger(c.offset) && c.offset! >= 0 ? { offset: c.offset, total: Number.isInteger(c.total) ? c.total : null } : {};
  } catch { return null; }
}

/** Lấy các đơn mới/sửa (theo updated_at), cũ trước mới sau, đi theo mốc nước (rủi ro 1, QA 11/10/2026 điểm 4–6).
 *  - Mỗi trang gọi lại từ giây `updated_at` của đơn cuối trang trước (không lật page_number), bỏ đơn trùng: đơn bị sửa giữa hai
 *    trang chỉ nhảy về cuối danh sách, không làm đơn khác bị bỏ qua.
 *  - Hơn 100 đơn cùng một giây: lật trang trong đúng giây đó; tổng số đơn giảm (đơn bị sửa rời khỏi giây) thì lùi lại cho chắc.
 *  - Ghi D1 và tiến mốc theo từng trang; lỗi giữa chừng thì mốc dừng ở trang cuối đã ghi. Mốc không vượt quá giờ hiện tại.
 *  - Đọc hết trang: mốc = giờ chạy (độ trễ 0). last_sync_at vẫn là giờ chạy xong (Cập nhật lúc, cảnh báo, bộ nhớ đệm). */
export async function syncRecent(db: D1Database, shop: ShopRow, apiKey: string, maxPages = 5, deadline = Number.POSITIVE_INFINITY) {
  const shopId = shop.shop_id!;
  const runMs = Date.now();
  const now = new Date(runMs).toISOString();
  const endDateTime = String(Math.floor(runMs / 1000) + 3600);
  let writes = 0, records = 0, pages = 0, total: number | null = null;
  const seen = new Set<string>();
  const dirty: DirtyBuckets = new Map();
  const dirtyCustomers: DirtyCustomers = new Map();
  /** Ghi một trang và gom ngày/khách bị ảnh hưởng để dựng số liệu cuối lượt. */
  const stored = new Map<string, StoredOrder>();
  const savePage = async (orders: SourceOrder[]) => {
    const fresh = orders.filter((o) => {
      const key = `${o.id}@${o.updated_at ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await loadStored(db, shop.id, fresh, stored);
    let changed = 0;
    const statements: D1PreparedStatement[] = [];
    for (const order of fresh) {
      if (order.id === undefined || order.id === null) continue;
      const prior = stored.get(`${shop.id}:${order.id}`);
      const changes = orderStatements(db, shop.id, shopId, order, now, prior, false, stored);
      statements.push(...noteStatements(db, shop.id, str(order.customer?.id) ?? str(order.customer?.customer_id), normalizePhone(str(order.bill_phone_number) ?? '') || null, order.customer?.notes ?? null, now, 'order'));
      if (!changes.length) continue;
      changed++;
      statements.push(...changes);
      if (prior) dirtyStored(dirty, dirtyCustomers, shop.id, prior.row);
      markDirtyOrder(dirty, shop.id, order);
      markDirtyCustomer(dirtyCustomers, shop.id, order.bill_phone_number);
    }
    writes += await writeBatched(db, statements);
    records += changed;
  };
  const fetchPage = async (params: Record<string, string>) => {
    const result = await listOrdersPage(shopId, apiKey, { page_size: String(PAGE_SIZE), ...params });
    validatePage(result);
    pages++;
    return { data: result.data!, total: typeof result.total_entries === 'number' ? result.total_entries : null };
  };
  const more = () => pages < maxPages && (pages === 0 || Date.now() < deadline);

  let mark = pancakeMs(shop.recent_watermark) ?? pancakeMs(shop.last_sync_at);
  let caughtUp = false;
  let cluster: { sec: number; offset: number; total: number | null } | null = null;
  // Chỉ lưu vị trí lật trang khi mốc đúng bằng giây đang lật (giây nằm trong phần chờm 30 phút thì đã đọc ở lượt trước).
  const cursorJson = () => (cluster && cluster.offset > 0 && mark === cluster.sec * 1000
    ? JSON.stringify({ offset: cluster.offset, total: cluster.total }) : '{}');
  try {
    if (mark === null) {
      // Lần đầu: lấy trọn mọi đơn tạo từ đầu ngày hôm qua (giờ VN) để số hôm nay đủ ngay; xong thì coi như đã theo kịp lúc chạy.
      const base = { updateStatus: 'inserted_at', option_sort: 'inserted_at_desc',
        startDateTime: String(Math.floor((Date.parse(vnDayStartUtc(addDays(todayVn(), -1)) + 'Z')) / 1000)), endDateTime };
      for (let page = 1; page <= 20; page++) {
        const r = await fetchPage({ ...base, page_number: String(page) });
        total = r.total ?? total;
        await savePage(r.data);
        if (!(total !== null ? page * PAGE_SIZE < total : r.data.length === PAGE_SIZE)) break;
      }
      mark = runMs;
      caughtUp = true;
    } else {
      const cursor = shop.recent_watermark ? parseRecentCursor(shop.recent_cursor) : null;
      // Theo kịp (hoặc chưa có cột mốc): lùi 30 phút chờm. Chưa theo kịp: đi tiếp đúng từ mốc (mốc lấy từ chính đơn đã đọc).
      let start = Math.floor((cursor ? mark : mark - RECENT_OVERLAP_MS) / 1000);
      if (cursor?.offset !== undefined && mark === start * 1000) cluster = { sec: start, offset: cursor.offset, total: cursor.total ?? null };
      let saved = { mark: shop.recent_watermark ?? null, cursor: shop.recent_cursor ?? null };
      /** Tiến mốc tới `candidateMs` (tròn giây, không vượt giờ gọi trừ 2 phút, không lùi) và lưu ngay nếu đổi. */
      const advance = async (candidateMs: number, fetchMs: number) => {
        const capped = Math.floor(Math.min(candidateMs, fetchMs - RECENT_SETTLE_MS) / 1000) * 1000;
        if (capped > mark!) mark = capped;
        const next = { mark: new Date(mark!).toISOString(), cursor: cursorJson() };
        const clusterChanged = next.cursor !== '{}' && next.cursor !== saved.cursor;
        if (next.mark === saved.mark && !clusterChanged) return;
        writes += await writeBatched(db, [db.prepare('UPDATE pos_shops SET recent_watermark=?,recent_cursor=? WHERE id=?').bind(next.mark, next.cursor, shop.id)]);
        saved = next;
      };
      const base = { updateStatus: 'updated_at', option_sort: 'last_updated_order_asc' };
      while (more()) {
        const fetchMs = Date.now();
        if (cluster) {
          // Giây quá sát hiện tại: đơn mới sửa còn có thể rơi vào giây này, chờ lượt sau.
          if ((cluster.sec + 1) * 1000 > fetchMs - RECENT_SETTLE_MS) break;
          const c: { sec: number; offset: number; total: number | null } = cluster;
          const pageNumber = Math.floor(c.offset / PAGE_SIZE) + 1;
          const r = await fetchPage({ ...base, startDateTime: String(c.sec), endDateTime: String(c.sec + 1), page_number: String(pageNumber) });
          await savePage(r.data);
          // Trong cửa sổ đã qua, đơn chỉ có thể rời đi (bị sửa sang giờ mới); tổng giảm d thì d đơn chưa đọc có thể đã dịch lên trước.
          const safe = Math.max(0, c.offset - (c.total !== null && r.total !== null ? Math.max(0, c.total - r.total) : 0));
          const pageStart = (pageNumber - 1) * PAGE_SIZE;
          c.offset = pageStart <= safe ? pageStart + r.data.length : safe;
          c.total = r.total;
          total = r.total ?? total;
          if (r.data.length < PAGE_SIZE || (r.total !== null && c.offset >= r.total)) {
            cluster = null;
            start = c.sec + 1;
            await advance(start * 1000, fetchMs);
          } else await advance(mark!, fetchMs);
          continue;
        }
        const r = await fetchPage({ ...base, startDateTime: String(start), endDateTime, page_number: '1' });
        total = r.total;
        await savePage(r.data);
        if (r.data.length < PAGE_SIZE || (r.total !== null && r.total <= r.data.length)) { caughtUp = true; break; }
        const lastMs = pancakeMs(r.data.at(-1)?.updated_at);
        if (lastMs === null) { console.warn(`recent ${shop.id}: đơn cuối trang không có giờ sửa, dừng lượt`); break; }
        const last = Math.floor(lastMs / 1000);
        if (last <= start) cluster = { sec: start, offset: 0, total: null };
        else start = last;
        await advance(start * 1000, fetchMs);
      }
      if (caughtUp) { mark = runMs; cluster = null; }
    }
  } finally {
    writes += await rebuildStats(db, dirty);
    writes += await rebuildCustomerStats(db, dirtyCustomers);
  }
  const watermark = new Date(Math.min(mark!, Date.now())).toISOString();
  const recentCursor = caughtUp ? null : cursorJson();
  const finalStatements = [
    db.prepare("UPDATE pos_shops SET last_sync_at=?,status='connected',last_error=NULL,recent_watermark=?,recent_cursor=? WHERE id=?")
      .bind(now, watermark, recentCursor, shop.id),
  ];
  if (records > 0) finalStatements.push(
    db.prepare('INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES (?,?,?,?,?,?,NULL)')
      .bind(crypto.randomUUID(), shop.id, now, new Date().toISOString(), 'source_recent', records),
  );
  writes += await writeBatched(db, finalStatements);
  return { records, pages, fetchedAt: now, sourceTotalEntries: total, writes, caughtUp, watermark };
}

/** Xác định tháng có đơn cũ nhất; lịch sử lấy từ tháng hiện tại lùi dần về tháng đó. */
export async function startBackfillCursor(shopId: string, apiKey: string): Promise<BackfillCursor> {
  const oldest = await listOrdersPage(shopId, apiKey, {
    page_size: '1', page_number: '1', option_sort: 'inserted_at_asc',
  });
  const oldestMonth = oldest.data?.[0]?.inserted_at?.slice(0, 7);
  if (!oldest.success || !oldestMonth || !/^\d{4}-\d{2}$/.test(oldestMonth))
    throw new Error('Không xác định được đơn cũ nhất của POS.');
  // Không lùi quá tháng thành lập (đơn cũ hơn là đơn thử nghiệm trước khi bán).
  return { month: currentMonth(), page: 1, pageSize: PAGE_SIZE, oldestMonth: oldestMonth > COMPANY_START_MONTH ? oldestMonth : COMPANY_START_MONTH };
}

/** Lấy lịch sử theo từng tháng; mỗi lần gọi xử lý tối đa `maxPages` trang và lưu tiến độ. */
export async function syncBackfill(db: D1Database, shop: ShopRow, apiKey: string, cursor: BackfillCursor, maxPages = 4) {
  const shopId = shop.shop_id!;
  const pageSize = cursor.pageSize ?? PAGE_SIZE;
  const now = new Date().toISOString();
  const params = {
    page_size: String(pageSize), updateStatus: 'inserted_at', option_sort: 'inserted_at_asc', ...monthBounds(cursor.month),
  };
  const first = await listOrdersPage(shopId, apiKey, { ...params, page_number: String(cursor.page) });
  validatePage(first);
  const total = typeof first.total_entries === 'number' && Number.isFinite(first.total_entries) ? first.total_entries : null;
  const additional = total !== null
    ? Math.min(maxPages - 1, Math.max(0, Math.ceil(total / pageSize) - cursor.page)) : 0;
  const rest = additional > 0
    ? await Promise.all(Array.from({ length: additional }, (_, index) =>
        listOrdersPage(shopId, apiKey, { ...params, page_number: String(cursor.page + index + 1) })))
    : [];
  const statements: D1PreparedStatement[] = [];
  const dirty: DirtyBuckets = new Map();
  const dirtyCustomers: DirtyCustomers = new Map();
  const stored = new Map<string, StoredOrder>();
  let used = 0, exhausted = false, records = 0;
  for (const page of [first, ...rest]) {
    validatePage(page);
    const pageNumber = cursor.page + used;
    used++;
    await loadStored(db, shop.id, page.data!, stored);
    let changed = 0;
    for (const order of page.data!) {
      if (order.id === undefined || order.id === null) continue;
      const prior = stored.get(`${shop.id}:${order.id}`);
      const changes = orderStatements(db, shop.id, shopId, order, now, prior, false, stored);
      statements.push(...noteStatements(db, shop.id, str(order.customer?.id) ?? str(order.customer?.customer_id), normalizePhone(str(order.bill_phone_number) ?? '') || null, order.customer?.notes ?? null, now, 'order'));
      if (!changes.length) continue;
      changed++;
      statements.push(...changes);
      if (prior) dirtyStored(dirty, dirtyCustomers, shop.id, prior.row);
      markDirtyOrder(dirty, shop.id, order);
      markDirtyCustomer(dirtyCustomers, shop.id, order.bill_phone_number);
    }
    records += changed;
    const hasMore = page.data!.length > 0 && (total !== null ? pageNumber * pageSize < total : page.data!.length === pageSize);
    if (!hasMore) { exhausted = true; break; }
  }
  // Con trỏ cũ có thể ghi tháng cũ hơn mốc thành lập: luôn dừng ở tháng thành lập.
  const oldestMonth = cursor.oldestMonth && cursor.oldestMonth > COMPANY_START_MONTH ? cursor.oldestMonth : COMPANY_START_MONTH;
  const next: BackfillCursor = exhausted
    ? { month: prevMonth(cursor.month), page: 1, pageSize, oldestMonth }
    : { month: cursor.month, page: cursor.page + used, pageSize, oldestMonth };
  if (next.month < oldestMonth) next.completed = true;
  let writes = await writeBatched(db, statements);
  writes += await rebuildStats(db, dirty);
  writes += await rebuildCustomerStats(db, dirtyCustomers);
  const finalStatements = [
    // history_start chỉ lùi về trước, không tiến lên (khi duyệt lại lịch sử từ tháng hiện tại).
    db.prepare("UPDATE pos_shops SET cursor=?,status='connected',last_error=NULL,history_start=MIN(COALESCE(history_start,?),?) WHERE id=?")
      .bind(JSON.stringify(next), `${next.completed ? oldestMonth : cursor.month}-01`, `${next.completed ? oldestMonth : cursor.month}-01`, shop.id),
  ];
  if (records > 0 || exhausted) finalStatements.push(
    db.prepare('INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES (?,?,?,?,?,?,NULL)')
      .bind(crypto.randomUUID(), shop.id, now, new Date().toISOString(), 'source_backfill', records),
  );
  writes += await writeBatched(db, finalStatements);
  return { records, pagesFetched: used, cursor: next, completed: !!next.completed, sourceTotalEntries: total, writes };
}

export async function syncUsers(db: D1Database, shop: ShopRow, apiKey: string) {
  const now = new Date().toISOString();
  const rows = await listUsers(shop.shop_id!, apiKey);
  const statements = rows.flatMap((row) => {
    const id = row.user_id ?? row.user?.id;
    if (!id) return [];
    return [db.prepare(
      'INSERT INTO pos_users (id,pos_id,user_id,name,email,phone,is_active,fetched_at,department,sale_group,source_created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,is_active=excluded.is_active,fetched_at=excluded.fetched_at,department=excluded.department,sale_group=excluded.sale_group,source_created_at=COALESCE(excluded.source_created_at,pos_users.source_created_at) WHERE pos_users.name IS NOT excluded.name OR pos_users.email IS NOT excluded.email OR pos_users.phone IS NOT excluded.phone OR pos_users.is_active IS NOT excluded.is_active OR pos_users.department IS NOT excluded.department OR pos_users.sale_group IS NOT excluded.sale_group OR pos_users.source_created_at IS NOT COALESCE(excluded.source_created_at,pos_users.source_created_at)',
    ).bind(`${shop.id}:${id}`, shop.id, id, row.user?.name?.trim() ?? '', str(row.user?.email), str(row.user?.phone_number), row.is_active === false ? 0 : 1, now,
      str(row.department?.name?.trim()), str(row.sale_group?.name?.trim()), toIso(row.inserted_at ?? row.created_at ?? row.user?.inserted_at))];
  });
  statements.push(db.prepare('UPDATE pos_shops SET users_synced_at=? WHERE id=?').bind(now, shop.id));
  const writes = await writeBatched(db, statements);
  return { records: statements.length - 1, writes };
}

export async function syncProducts(db: D1Database, shop: ShopRow, apiKey: string, maxPages = 20) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let records = 0;
  for (let page = 1; page <= maxPages; page++) {
    const result = await listVariationsPage(shop.shop_id!, apiKey, page);
    for (const v of result.data!) {
      const variationId = str(v.id);
      const productId = str(v.product_id) ?? str(v.product?.id);
      if (!variationId || !productId) continue;
      const fields = (v.fields ?? []).map((f) => f.value).filter(Boolean).join(' / ');
      statements.push(db.prepare(
        'INSERT INTO pos_products (id,pos_id,product_id,variation_id,product_name,variation_name,sku,retail_price,category_json,is_hidden,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET product_name=excluded.product_name,variation_name=excluded.variation_name,sku=excluded.sku,retail_price=excluded.retail_price,category_json=excluded.category_json,is_hidden=excluded.is_hidden,fetched_at=excluded.fetched_at WHERE pos_products.product_name IS NOT excluded.product_name OR pos_products.variation_name IS NOT excluded.variation_name OR pos_products.sku IS NOT excluded.sku OR pos_products.retail_price IS NOT excluded.retail_price OR pos_products.category_json IS NOT excluded.category_json OR pos_products.is_hidden IS NOT excluded.is_hidden',
      ).bind(
        `${shop.id}:${variationId}`, shop.id, productId, variationId,
        v.product?.name?.trim() ?? v.name?.trim() ?? '', fields || (v.name?.trim() ?? ''),
        str(v.display_id) ?? str(v.product?.display_id), num(v.retail_price),
        JSON.stringify((v.product?.categories ?? []).map((c) => c.name).filter(Boolean)),
        v.is_hidden || v.product?.is_hidden || v.is_removed ? 1 : 0, now,
      ));
      records++;
    }
    const total = typeof result.total_entries === 'number' ? result.total_entries : null;
    const hasMore = total !== null ? page * 100 < total : result.data!.length === 100;
    if (!hasMore) break;
  }
  statements.push(db.prepare('UPDATE pos_shops SET products_synced_at=? WHERE id=?').bind(now, shop.id));
  const writes = await writeBatched(db, statements);
  return { records, writes };
}

export async function loadShop(db: D1Database, posId: string) {
  return db.prepare(
    'SELECT id,shop_id,enabled,cursor,last_sync_at,users_synced_at,products_synced_at,customers_synced_at,customer_cursor,recent_watermark,recent_cursor FROM pos_shops WHERE id=?',
  ).bind(posId).first<ShopRow>();
}

async function recordFailure(db: D1Database, posId: string, stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();
  if (error instanceof WriteLimitError) throw error; // hết hạn mức ghi: không ghi thêm gì nữa
  await db.batch([
    db.prepare("UPDATE pos_shops SET status='error',last_error=? WHERE id=?").bind(message.slice(0, 500), posId),
    db.prepare('INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES (?,?,?,?,?,0,?)')
      .bind(crypto.randomUUID(), posId, now, now, stage, message.slice(0, 500)),
  ]);
}

/** Dựng số liệu ngày cho một (POS, tháng) từ đơn đã lưu (dùng khi bảng tổng hợp mới được thêm). */
export async function buildStatsMonth(db: D1Database, posId: string, month: string) {
  return rebuildStats(db, new Map([[posId, monthDays(month)]]));
}

export type SyncBudget = {
  /** Số dòng đã ghi trong ngày (UTC) trước lượt này. */
  writesUsed: number;
  /** Trần cho lịch sử (chừa phần cho đơn mới và đăng nhập). */
  backfillCap: number;
  /** Trần cứng cho mọi thao tác. */
  hardCap: number;
  /** Số trang đơn vừa sửa tối đa mỗi POS mỗi lượt (mặc định 10 = 1.000 đơn; nhánh bị khoá ghi giữ 3). */
  recentPages?: number;
};
// 50 triệu dòng ghi/tháng cho cả tài khoản (web thật + demo + demo2); bản thật giữ ≤ 1,2 triệu/ngày.
export const DEFAULT_BUDGET: SyncBudget = { writesUsed: 0, backfillCap: 800_000, hardCap: 1_200_000 };

// Index cũ không còn trong schema; xóa khi có thể (idempotent, không tốn lượt ghi đáng kể).
const DROP_OLD_INDEXES = [
  'idx_raw_items_pos_product', 'idx_raw_orders_pos_status_created', 'idx_raw_orders_pos_customer', 'idx_raw_orders_pos_updated',
];

/** Đồng bộ nền theo thứ tự ưu tiên: đơn mới/sửa → nhân viên, sản phẩm (mỗi giờ) → lịch sử (tháng mới nhất trước),
 *  trong ngân sách thời gian và hạn mức ghi D1 của ngày. */
export async function runScheduledSync(env: Cloudflare.Env, now: Date, budgetMs = 50000, budget: SyncBudget = DEFAULT_BUDGET, onUsage?: (stage: string, meta: D1Meta) => void) {
  const stages: Record<string, number> = { recent: 0, users: 0, products: 0, customers: 0, customers_backfill: 0, backfill: 0 };
  let stage = 'recent';
  let sizeBytes: number | null = null;
  const db = observeD1(env.DB, (meta) => {
    onUsage?.(stage, meta);
    stages[stage] = (stages[stage] ?? 0) + Number(meta.rows_written ?? 0);
    sizeBytes = typeof meta.size_after === 'number' ? meta.size_after : null;
  });
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  let writes = 0;
  const result = () => ({ backfillPending: pendingLeft(), writes, writeLimitHit, stages, sizeBytes });
  let writeLimitHit = false;
  let pendingLeft = () => false;
  if (!apiKey) return { ...result(), skipped: 'missing_key' as const };
  const used = () => budget.writesUsed + writes;
  try {
    for (const name of DROP_OLD_INDEXES) await db.prepare(`DROP INDEX IF EXISTS ${name}`).run();
  } catch { /* bỏ qua khi bị chặn ghi */ }
  // POS chưa có Shop ID: thử ghép tự động theo tên cửa hàng.
  const missing = await db.prepare(
    "SELECT COUNT(*) AS n FROM pos_shops WHERE shop_id IS NOT NULL AND shop_id GLOB '[0-9]*'",
  ).first<{ n: number }>();
  if (Number(missing?.n ?? 0) < POS.length) {
    try { await autoMapShops(db, apiKey); } catch (e) { console.error('automap failed', e); /* thử lại ở lần sau */ }
  }
  const shops = (await db.prepare(
    'SELECT id,shop_id,enabled,cursor,last_sync_at,users_synced_at,products_synced_at,customers_synced_at,customer_cursor,recent_watermark,recent_cursor FROM pos_shops WHERE enabled=1 AND shop_id IS NOT NULL',
  ).all<ShopRow>()).results.filter((shop) => POS.some((p) => p.id === shop.id) && /^\d+$/.test(shop.shop_id ?? ''));
  const started = Date.now();
  const budgetLeft = () => Date.now() - started < budgetMs;
  const cursors = new Map(shops.map((shop) => [shop.id, parseCursor(shop.cursor)]));
  pendingLeft = () => shops.some((shop) => !cursors.get(shop.id)?.completed);
  console.log(`sync start ${now.toISOString()}: ${shops.length} shops, writes used ${budget.writesUsed}`);

  const guard = async <T>(shop: ShopRow, stageName: string, fn: () => Promise<T & { writes: number }>) => {
    stage = stageName.replace(/^cron_/, '');
    try {
      const r = await fn();
      writes += r.writes;
      return r;
    } catch (error) {
      if (error instanceof WriteLimitError) { writeLimitHit = true; return null; }
      console.error(`${stage} ${shop.id} failed`, error);
      // Ghi nhật ký lỗi thất bại thì bỏ qua (trước đây bị coi là hết hạn mức ghi → khóa cả ngày).
      try { await recordFailure(db, shop.id, stage, error); } catch (e) { console.error('recordFailure failed', e); }
      return null;
    }
  };

  // 1) Đơn mới / vừa sửa (luôn ưu tiên), theo mốc nước. Mỗi POS một quỹ thời gian (chia đều 70% thời gian còn lại cho các POS
  // chưa chạy), để một POS dồn việc không chiếm hết lượt của POS khác; phần chưa đọc đi tiếp ở lượt sau, không bị bỏ.
  const recentPages = budget.recentPages ?? 10;
  for (const [index, shop] of shops.entries()) {
    if (!budgetLeft() || writeLimitHit || used() > budget.hardCap) break;
    const share = Math.floor((budgetMs - (Date.now() - started)) * 0.7 / (shops.length - index));
    const t0 = Date.now();
    const r = await guard(shop, 'cron_recent', () => syncRecent(db, shop, apiKey, recentPages, t0 + Math.max(3000, share)));
    if (r) console.log(`recent ${shop.id}: ${r.records} rows, ${r.pages} pages, ${r.writes} writes, ${Date.now() - t0}ms${r.caughtUp ? '' : `, chưa theo kịp (trễ ${Math.round((Date.now() - Date.parse(r.watermark)) / 60000)} phút)`}`);
  }
  // 2) Nhân viên / sản phẩm mỗi giờ.
  const stale = (iso: string | null) => !iso || now.getTime() - Date.parse(iso) > 60 * 60000;
  for (const shop of shops) {
    if (!budgetLeft() || writeLimitHit || used() > budget.backfillCap) break;
    if (stale(shop.users_synced_at)) await guard(shop, 'cron_users', () => syncUsers(db, shop, apiKey));
    if (stale(shop.products_synced_at)) await guard(shop, 'cron_products', () => syncProducts(db, shop, apiKey));
  }
  // 2b) Khách hàng vừa thay đổi (phân công, ghi chú mới) — mỗi lượt.
  for (const shop of shops) {
    if (!budgetLeft() || writeLimitHit || used() > budget.backfillCap) break;
    const r = await guard(shop, 'cron_customers', () => syncCustomersRecent(db, shop, apiKey));
    if (r && r.records) console.log(`customers ${shop.id}: ${r.records} rows, ${r.writes} writes, notes changed ${r.changedNotes}, full notes fetched ${r.fullNotes} (${r.fullNoteRows} notes)`);
  }
  // 3) Lịch sử khách hàng: duyệt toàn bộ danh sách khách cho tới khi xong — chạy TRƯỚC lịch sử đơn, có quỹ thời gian riêng
  // (tối đa 60% lượt) và song song các POS, để không bị lịch sử đơn "ăn" hết thời gian (trước đây chỉ được ~1 trang/phút).
  // Vòng mới bắt đầu cách lúc bắt đầu vòng trước ít nhất 12 giờ; vòng đang chạy luôn được đi tiếp.
  // Khoảng 1/5 ghi chú mới không làm đổi updated_at của khách trên Pancake nên có thể hiện trễ tới khoảng 12 giờ;
  // mọi số khác không đổi. Con trỏ cũ thiếu startedAt thì dùng completedAt để tránh bắt đầu lại quá sớm.
  const customerCursors = new Map(shops.map((shop) => { const c = parseCustomerCursor(shop.customer_cursor ?? null) ?? { page: 1 }; return [shop.id, c.completed && now.getTime() - Date.parse(c.startedAt ?? c.completedAt ?? '0') >= REWALK_EVERY_MS ? { page: 1, total: c.total, firstCompletedAt: c.firstCompletedAt ?? c.completedAt } : c]; }));
  const customerPending = () => shops.filter((shop) => !customerCursors.get(shop.id)?.completed);
  const customerDeadline = Date.now() + Math.floor((budgetMs - (Date.now() - started)) * 0.6);
  while (Date.now() < customerDeadline && !writeLimitHit && used() < budget.backfillCap && customerPending().length) {
    const t0 = Date.now();
    const results = await Promise.all(customerPending().map(async (shop) => [shop, await guard(shop, 'cron_customers_backfill', () => syncCustomersBackfill(db, shop, apiKey, customerCursors.get(shop.id)!, 12))] as const));
    let progressed = false;
    for (const [shop, r] of results) {
      if (!r) { customerCursors.set(shop.id, { page: 0, completed: true }); continue; }
      customerCursors.set(shop.id, r.cursor); progressed = true;
      console.log(`customers backfill ${shop.id}: ${r.records} rows -> ${r.cursor.fetched ?? 0}${r.cursor.total ? `/${r.cursor.total}` : ''} · cửa sổ tới ${new Date((r.cursor.windowEnd ?? 0) * 1000).toISOString().slice(0, 10)}${r.completed ? ' done' : ''} (${Date.now() - t0}ms)`);
    }
    if (!progressed) break;
  }
  // 4) Lịch sử đơn: tháng mới nhất trước, xoay vòng các POS chưa xong tới khi hết ngân sách.
  const pending = () => shops.filter((shop) => !cursors.get(shop.id)?.completed);
  while (budgetLeft() && !writeLimitHit && used() < budget.backfillCap && pending().length) {
    let progressed = false;
    for (const shop of pending()) {
      if (!budgetLeft() || writeLimitHit || used() >= budget.backfillCap) break;
      const r = await guard(shop, 'cron_backfill', async () => {
        let cursor = cursors.get(shop.id);
        // Con trỏ kiểu cũ (tăng dần) hoặc chưa có: bắt đầu lại từ tháng hiện tại lùi dần.
        if (!cursor || !cursor.oldestMonth) cursor = await startBackfillCursor(shop.shop_id!, apiKey);
        return syncBackfill(db, shop, apiKey, cursor, 10);
      });
      if (!r) { cursors.set(shop.id, { month: '0000-00', page: 1, completed: true }); continue; }
      cursors.set(shop.id, r.cursor);
      progressed = true;
      console.log(`backfill ${shop.id}: ${r.records} rows, ${r.writes} writes -> ${r.cursor.month} p${r.cursor.page}${r.completed ? ' done' : ''}`);
    }
    if (!progressed) break;
  }
  pendingLeft = () => shops.some((shop) => !cursors.get(shop.id)?.completed) || customerPending().length > 0;
  return result();
}
