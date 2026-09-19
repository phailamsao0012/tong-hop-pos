import { normalizePhone } from '@/lib/customer-stats';
import { noteStatements, parseCustomerCursor, syncCustomersBackfill, syncCustomersRecent } from '@/lib/customers-sync';
const REWALK_PAUSE_MS = 10 * 60000;
import {
  CANCELLED_STATUSES, DELIVERED_STATUSES, RETURNED_STATUSES,
  listOrdersPage, listUsers, listVariationsPage,
  type SourceOrder, type SourcePage,
} from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { COMPANY_START_MONTH, addDays, todayVn, vnDayStartUtc } from '@/lib/report-time';
import { autoMapShops } from '@/lib/shop-map';
import { markDirtyOrder, monthDays, rebuildStats, type DirtyBuckets } from '@/lib/stats';
import { markDirtyCustomer, rebuildCustomerStats, type DirtyCustomers } from '@/lib/customer-stats';

// Lịch sử được lấy từ tháng hiện tại lùi dần về `oldestMonth` (đơn mới ưu tiên trước).
export type BackfillCursor = { month: string; page: number; pageSize?: number; completed?: boolean; oldestMonth?: string };
export const WRITE_LIMIT_ERROR = /daily row write limit|exceeded D1's free tier/i;
export class WriteLimitError extends Error {}
export type ShopRow = {
  id: string; shop_id: string | null; enabled: number; cursor: string | null;
  last_sync_at: string | null; users_synced_at: string | null; products_synced_at: string | null;
  customers_synced_at?: string | null; customer_cursor?: string | null;
};

const PAGE_SIZE = 100;
const RECENT_OVERLAP_MS = 30 * 60000;

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

/** Chuẩn hóa một đơn nguồn thành các câu lệnh upsert (đơn + dòng sản phẩm). */
export function orderStatements(db: D1Database, posId: string, shopId: string, o: SourceOrder, now: string) {
  if (o.id === undefined || o.id === null) return [];
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
  const delivered = firstWith(DELIVERED_STATUSES);
  const returned = firstWith(RETURNED_STATUSES);
  const cancelled = firstWith(CANCELLED_STATUSES);
  const lastStatusAt = history.at(-1)?.updated_at ?? null;
  const items = Array.isArray(o.items) ? o.items : [];
  const compactItems = items.map((i) => ({
    product_id: i.product_id ?? null, variation_id: i.variation_id ?? null,
    quantity: i.quantity ?? null, returned_count: i.returned_count ?? null,
    retail_price: i.variation_info?.retail_price ?? null,
  }));
  const status = Number.isInteger(o.status) ? o.status! : null;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,created_at,updated_at,status_code,seller_id,seller_assigned_at,care_id,current_total,first_confirmed_at,first_confirmed_by,status_history_json,other_history_json,item_json,history_limited,fetched_at,
        customer_name,customer_id,total_discount,shipping_fee,cod,money_to_collect,total_quantity,sub_status,creator_id,last_editor_id,marketer_id,care_assigned_at,delivered_at,returned_at,cancelled_at,last_status_at,order_source,warehouse_id,tags_json,note,is_removed,raw_json,net_total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,created_at=excluded.created_at,updated_at=excluded.updated_at,status_code=excluded.status_code,seller_id=excluded.seller_id,seller_assigned_at=excluded.seller_assigned_at,care_id=excluded.care_id,current_total=excluded.current_total,
        first_confirmed_at=COALESCE(raw_pos_orders.first_confirmed_at,excluded.first_confirmed_at),first_confirmed_by=COALESCE(raw_pos_orders.first_confirmed_by,excluded.first_confirmed_by),
        status_history_json=excluded.status_history_json,item_json=excluded.item_json,history_limited=excluded.history_limited,fetched_at=excluded.fetched_at,
        customer_name=excluded.customer_name,customer_id=excluded.customer_id,total_discount=excluded.total_discount,shipping_fee=excluded.shipping_fee,cod=excluded.cod,money_to_collect=excluded.money_to_collect,total_quantity=excluded.total_quantity,sub_status=excluded.sub_status,creator_id=excluded.creator_id,last_editor_id=excluded.last_editor_id,marketer_id=excluded.marketer_id,care_assigned_at=excluded.care_assigned_at,
        delivered_at=COALESCE(raw_pos_orders.delivered_at,excluded.delivered_at),returned_at=COALESCE(raw_pos_orders.returned_at,excluded.returned_at),cancelled_at=COALESCE(raw_pos_orders.cancelled_at,excluded.cancelled_at),last_status_at=excluded.last_status_at,
        order_source=excluded.order_source,warehouse_id=excluded.warehouse_id,tags_json=excluded.tags_json,note=excluded.note,is_removed=excluded.is_removed,raw_json=excluded.raw_json,net_total=excluded.net_total`,
    ).bind(
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
      num(o.total_price_after_sub_discount),
    ),
    db.prepare('DELETE FROM raw_pos_order_items WHERE order_id=?').bind(id),
  ];
  // Ghi chú khách hàng kèm trong đơn (mỗi ghi chú = một lần chăm sóc).
  statements.push(...noteStatements(db, posId, str(o.customer?.id) ?? str(o.customer?.customer_id), normalizePhone(str(o.bill_phone_number) ?? '') || null, o.customer?.notes ?? null, now, 'order'));
  items.forEach((i, index) => {
    const quantity = num(i.quantity) ?? 0;
    const price = num(i.variation_info?.retail_price) ?? 0;
    const rawDiscount = num(i.discount_each_product) ?? 0;
    const discount = i.is_discount_percent ? Math.round(price * rawDiscount / 100) : rawDiscount;
    statements.push(db.prepare(
      // OR REPLACE: hai lượt đồng bộ (bấm tay + lập lịch) có thể ghi cùng một đơn gần như đồng thời.
      'INSERT OR REPLACE INTO raw_pos_order_items (id,order_id,pos_id,product_id,variation_id,name,quantity,returned_count,retail_price,discount,line_total,seller_id,is_bonus,is_composite,one_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(
      `${id}:${index}`, id, posId, str(i.product_id) ?? str(i.variation_info?.product_id), str(i.variation_id),
      variationName(i), quantity, num(i.returned_count) ?? 0, price, discount,
      Math.max(0, (price - discount) * quantity), str(i.assigning_seller_id),
      i.is_bonus_product ? 1 : 0, i.is_composite ? 1 : 0, i.one_time_product ? 1 : 0,
    ));
  });
  return statements;
}

function variationName(i: SourceOrder['items'] extends (infer T)[] | undefined ? T : never) {
  const base = i.variation_info?.name?.trim() ?? '';
  const fields = (i.variation_info?.fields ?? []).map((f) => f.value).filter(Boolean).join(' / ');
  return fields ? `${base} (${fields})` : base;
}

/** Bỏ các đơn chưa đổi (updated_at giống bản đã lưu) để tiết kiệm lượt ghi D1. */
async function onlyChanged(db: D1Database, posId: string, orders: SourceOrder[]) {
  const ids = orders.filter((o) => o.id !== undefined && o.id !== null).map((o) => `${posId}:${o.id}`);
  const existing = new Map<string, { updatedAt: string | null; hasRaw: boolean }>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await db.prepare(`SELECT id,updated_at,(raw_json IS NOT NULL) AS has_raw FROM raw_pos_orders WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk).all<{ id: string; updated_at: string | null; has_raw: number }>();
    for (const row of rows.results) existing.set(row.id, { updatedAt: row.updated_at, hasRaw: !!row.has_raw });
  }
  // Ghi lại khi đơn đổi, hoặc khi bản đã lưu chưa có JSON gốc (đơn nạp trước khi thêm cột raw_json).
  return orders.filter((o) => {
    const found = existing.get(`${posId}:${o.id}`);
    return !found || !found.hasRaw || found.updatedAt !== (o.updated_at ?? null);
  });
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

/** Lấy các đơn mới/sửa gần đây (theo updated_at) kể từ lần đồng bộ trước. */
export async function syncRecent(db: D1Database, shop: ShopRow, apiKey: string, maxPages = 5) {
  const shopId = shop.shop_id!;
  const now = new Date().toISOString();
  const since = shop.last_sync_at ? Date.parse(shop.last_sync_at) - RECENT_OVERLAP_MS : null;
  // Lần đầu: lấy trọn mọi đơn tạo từ đầu ngày hôm qua (giờ VN) để số hôm nay đủ ngay;
  // các lần sau: đơn có updated_at kể từ lần đồng bộ trước (chờm 30 phút).
  const base: Record<string, string> = since
    ? { page_size: String(PAGE_SIZE), updateStatus: 'updated_at', option_sort: 'last_updated_order_desc',
        startDateTime: String(Math.floor(since / 1000)), endDateTime: String(Math.floor(Date.now() / 1000) + 3600) }
    : { page_size: String(PAGE_SIZE), updateStatus: 'inserted_at', option_sort: 'inserted_at_desc',
        startDateTime: String(Math.floor((Date.parse(vnDayStartUtc(addDays(todayVn(), -1)) + 'Z')) / 1000)),
        endDateTime: String(Math.floor(Date.now() / 1000) + 3600) };
  const statements: D1PreparedStatement[] = [];
  const dirty: DirtyBuckets = new Map();
  const dirtyCustomers: DirtyCustomers = new Map();
  let records = 0, pages = 0, total: number | null = null;
  for (let page = 1; page <= (since ? maxPages : 20); page++) {
    const result = await listOrdersPage(shopId, apiKey, { ...base, page_number: String(page) });
    validatePage(result);
    pages++;
    total = typeof result.total_entries === 'number' ? result.total_entries : total;
    const changed = await onlyChanged(db, shop.id, result.data!);
    for (const order of changed) {
      statements.push(...orderStatements(db, shop.id, shopId, order, now));
      markDirtyOrder(dirty, shop.id, order);
      markDirtyCustomer(dirtyCustomers, shop.id, order.bill_phone_number);
    }
    records += changed.length;
    const hasMore = total !== null ? page * PAGE_SIZE < total : result.data!.length === PAGE_SIZE;
    if (!hasMore) break;
  }
  let writes = await writeBatched(db, statements);
  writes += await rebuildStats(db, dirty);
  writes += await rebuildCustomerStats(db, dirtyCustomers);
  const finalStatements = [
    db.prepare("UPDATE pos_shops SET last_sync_at=?,status='connected',last_error=NULL WHERE id=?").bind(now, shop.id),
  ];
  if (records > 0) finalStatements.push(
    db.prepare('INSERT INTO sync_runs (id,pos_id,started_at,finished_at,status,records,error) VALUES (?,?,?,?,?,?,NULL)')
      .bind(crypto.randomUUID(), shop.id, now, new Date().toISOString(), 'source_recent', records),
  );
  writes += await writeBatched(db, finalStatements);
  return { records, pages, fetchedAt: now, sourceTotalEntries: total, writes };
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
  let used = 0, exhausted = false, records = 0;
  for (const page of [first, ...rest]) {
    validatePage(page);
    const pageNumber = cursor.page + used;
    used++;
    const changed = await onlyChanged(db, shop.id, page.data!);
    for (const order of changed) {
      statements.push(...orderStatements(db, shop.id, shopId, order, now));
      markDirtyOrder(dirty, shop.id, order);
      markDirtyCustomer(dirtyCustomers, shop.id, order.bill_phone_number);
    }
    records += changed.length;
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
      'INSERT INTO pos_users (id,pos_id,user_id,name,email,phone,is_active,fetched_at,department,sale_group) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,is_active=excluded.is_active,fetched_at=excluded.fetched_at,department=excluded.department,sale_group=excluded.sale_group',
    ).bind(`${shop.id}:${id}`, shop.id, id, row.user?.name?.trim() ?? '', str(row.user?.email), str(row.user?.phone_number), row.is_active === false ? 0 : 1, now,
      str(row.department?.name?.trim()), str(row.sale_group?.name?.trim()))];
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
        'INSERT INTO pos_products (id,pos_id,product_id,variation_id,product_name,variation_name,sku,retail_price,category_json,is_hidden,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET product_name=excluded.product_name,variation_name=excluded.variation_name,sku=excluded.sku,retail_price=excluded.retail_price,category_json=excluded.category_json,is_hidden=excluded.is_hidden,fetched_at=excluded.fetched_at',
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
    'SELECT id,shop_id,enabled,cursor,last_sync_at,users_synced_at,products_synced_at,customers_synced_at,customer_cursor FROM pos_shops WHERE id=?',
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
};
// Gói Workers Paid: D1 cho 50 triệu dòng ghi/tháng; giữ trần ngày để không vượt (~1,6 triệu/ngày).
// Bộ đếm ghi của bộ hẹn giờ đếm cao hơn D1 thật (tính cả dòng chỉ mục), nên trần để rộng: 3,5 triệu cho lịch sử/khách, 4 triệu cho tất cả.
export const DEFAULT_BUDGET: SyncBudget = { writesUsed: 0, backfillCap: 3500000, hardCap: 4000000 };

// Index cũ không còn trong schema; xóa khi có thể (idempotent, không tốn lượt ghi đáng kể).
const DROP_OLD_INDEXES = [
  'idx_raw_items_pos_product', 'idx_raw_orders_pos_status_created', 'idx_raw_orders_pos_customer', 'idx_raw_orders_pos_updated',
];

/** Đồng bộ nền theo thứ tự ưu tiên: đơn mới/sửa → nhân viên, sản phẩm (mỗi giờ) → lịch sử (tháng mới nhất trước),
 *  trong ngân sách thời gian và hạn mức ghi D1 của ngày. */
export async function runScheduledSync(env: Cloudflare.Env, now: Date, budgetMs = 50000, budget: SyncBudget = DEFAULT_BUDGET) {
  const db = env.DB;
  const apiKey = env.PANCAKE_POS_API_KEY?.trim();
  let writes = 0;
  const result = () => ({ backfillPending: pendingLeft(), writes, writeLimitHit });
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
    try { await autoMapShops(db, apiKey); } catch { /* thử lại ở lần sau */ }
  }
  const shops = (await db.prepare(
    'SELECT id,shop_id,enabled,cursor,last_sync_at,users_synced_at,products_synced_at,customers_synced_at,customer_cursor FROM pos_shops WHERE enabled=1 AND shop_id IS NOT NULL',
  ).all<ShopRow>()).results.filter((shop) => POS.some((p) => p.id === shop.id) && /^\d+$/.test(shop.shop_id ?? ''));
  const started = Date.now();
  const budgetLeft = () => Date.now() - started < budgetMs;
  const cursors = new Map(shops.map((shop) => [shop.id, parseCursor(shop.cursor)]));
  pendingLeft = () => shops.some((shop) => !cursors.get(shop.id)?.completed);
  console.log(`sync start ${now.toISOString()}: ${shops.length} shops, writes used ${budget.writesUsed}`);

  const guard = async <T>(shop: ShopRow, stage: string, fn: () => Promise<T & { writes: number }>) => {
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

  // 1) Đơn mới / vừa sửa (luôn ưu tiên).
  for (const shop of shops) {
    if (!budgetLeft() || writeLimitHit || used() > budget.hardCap) break;
    const r = await guard(shop, 'cron_recent', () => syncRecent(db, shop, apiKey, 3));
    if (r) console.log(`recent ${shop.id}: ${r.records} rows, ${r.writes} writes`);
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
    if (r && r.records) console.log(`customers ${shop.id}: ${r.records} rows, ${r.writes} writes`);
  }
  // 3) Lịch sử khách hàng: duyệt toàn bộ danh sách khách cho tới khi xong — chạy TRƯỚC lịch sử đơn, có quỹ thời gian riêng
  // (tối đa 60% lượt) và song song các POS, để không bị lịch sử đơn "ăn" hết thời gian (trước đây chỉ được ~1 trang/phút).
  // Khi đã duyệt xong, nghỉ 1 giờ rồi duyệt lại từ đầu: khoảng 1/5 ghi chú mới không làm đổi updated_at của khách trên Pancake,
  // nên chỉ lượt duyệt toàn bộ mới bắt được chúng (mỗi vòng vài giờ; chỉ ghi khi khách có thay đổi nên rẻ).
  const customerCursors = new Map(shops.map((shop) => { const c = parseCustomerCursor(shop.customer_cursor ?? null) ?? { page: 1 }; return [shop.id, c.completed && now.getTime() - Date.parse(c.completedAt ?? c.startedAt ?? '0') > REWALK_PAUSE_MS ? { page: 1, total: c.total, firstCompletedAt: c.firstCompletedAt ?? c.completedAt } : c]; }));
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
