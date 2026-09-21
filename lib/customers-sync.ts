// Đồng bộ KHÁCH HÀNG Pancake (mục Khách hàng): người được phân công và các ghi chú (mỗi ghi chú = một lần chăm sóc / cuộc gọi).
// - Gần đây: khách có updated_at trong cửa sổ từ lần đồng bộ trước (trừ 30 phút chồng lấn).
// - Lịch sử: duyệt toàn bộ danh sách theo trang, con trỏ lưu ở pos_shops.customer_cursor.
// - Chỉ tạo câu lệnh cho khách có thay đổi (so với bản đã lưu bằng một SELECT mỗi trang): vòng duyệt lại 200k khách
//   trước đây bắn ~430k câu lệnh/giờ vào D1 làm web chậm và tra phiên đăng nhập lỗi (hiện 401).
// - Ngoài ra ghi chú còn được lấy từ trường customer.notes trong mỗi đơn hàng khi đồng bộ đơn (lib/sync.ts).
import { normalizePhone } from '@/lib/customer-stats';
import { listCustomersPage, loadCustomerNotes, type SourceCustomer, type SourceNote } from '@/lib/pancake';

const PAGE_SIZE = 100;
const OVERLAP_MS = 30 * 60000;
export type CustomerCursor = {
  page: number; completed?: boolean; startedAt?: string; completedAt?: string;
  /** Lần đầu duyệt xong toàn bộ (giữ qua các vòng duyệt lại). */ firstCompletedAt?: string;
  /** Tổng số khách Pancake báo (để hiện tiến độ). */ total?: number;
  /** Duyệt theo cửa sổ thời gian cập nhật (giây Unix): mốc cuối cửa sổ hiện tại, độ rộng cửa sổ (ngày), số khách đã duyệt trong vòng này. */
  windowEnd?: number; windowDays?: number; fetched?: number;
};
// Mốc dừng duyệt lùi: trước ngày này không còn khách (Pancake POS của công ty dùng từ 2024).
const WALK_STOP_SEC = Math.floor(Date.UTC(2023, 0, 1) / 1000);
const str = (v: unknown) => v === null || v === undefined ? null : String(v);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isoFromMs = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n) || !n) return null; return new Date(n > 1e12 ? n : n * 1000).toISOString().slice(0, 19); };
const isoOf = (v: unknown) => typeof v === 'number' ? isoFromMs(v) : typeof v === 'string' && v ? v.replace(/Z$/, '').slice(0, 19) : null;

export function parseCustomerCursor(raw: string | null): CustomerCursor | null {
  if (!raw) return null;
  try { const c = JSON.parse(raw) as CustomerCursor; return typeof c.page === 'number' ? c : null; } catch { return null; }
}

/** Câu lệnh upsert ghi chú (dùng chung cho đồng bộ khách và đồng bộ đơn). */
export function noteStatements(db: D1Database, posId: string, customerId: string | null, phone: string | null, notes: SourceNote[] | null | undefined, now: string, source: 'customer' | 'order') {
  if (!Array.isArray(notes)) return [];
  const out: D1PreparedStatement[] = [];
  for (const n of notes) {
    if (!n?.id || n.removed_at) continue;
    const createdAt = isoFromMs(n.created_at);
    if (!createdAt) continue;
    out.push(db.prepare(
      `INSERT INTO customer_notes (id,pos_id,customer_id,phone,author_id,author_name,message,order_id,created_at,updated_at,fetched_at,source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET customer_id=COALESCE(excluded.customer_id,customer_notes.customer_id),phone=COALESCE(excluded.phone,customer_notes.phone),
         author_id=excluded.author_id,author_name=excluded.author_name,message=excluded.message,order_id=excluded.order_id,updated_at=excluded.updated_at,fetched_at=excluded.fetched_at
       WHERE customer_notes.message<>excluded.message OR COALESCE(customer_notes.updated_at,'')<>COALESCE(excluded.updated_at,'') OR customer_notes.customer_id IS NULL`,
    ).bind(String(n.id), posId, customerId, phone, str(n.created_by?.id ?? n.created_by?.uid), str(n.created_by?.fb_name ?? n.created_by?.name), String(n.message ?? '').slice(0, 4000),
      str(n.order_id) || null, createdAt, isoFromMs(n.updated_at), now, source));
  }
  return out;
}

export function customerStatements(db: D1Database, posId: string, c: SourceCustomer, now: string) {
  const customerId = str(c.id) ?? str(c.customer_id);
  if (!customerId) return [];
  const phones = (Array.isArray(c.phone_numbers) ? c.phone_numbers : []).map((p) => normalizePhone(String(p))).filter(Boolean);
  const phone = phones[0] ?? null;
  const tags = (Array.isArray(c.tags) ? c.tags : []).map((t) => (typeof t === 'string' ? t : (t as { name?: string; text?: string })?.name ?? (t as { text?: string })?.text ?? '')).filter(Boolean);
  const statements = [db.prepare(
    `INSERT INTO pos_customers (id,pos_id,customer_id,name,phone,phones_json,assigned_user_id,level,order_count,succeed_order_count,purchased_amount,last_order_at,inserted_at,updated_at,tags_json,note_count,last_note_at,fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,phones_json=excluded.phones_json,assigned_user_id=excluded.assigned_user_id,level=excluded.level,
       order_count=excluded.order_count,succeed_order_count=excluded.succeed_order_count,purchased_amount=excluded.purchased_amount,last_order_at=excluded.last_order_at,
       inserted_at=COALESCE(pos_customers.inserted_at,excluded.inserted_at),updated_at=excluded.updated_at,tags_json=excluded.tags_json,note_count=excluded.note_count,last_note_at=excluded.last_note_at,fetched_at=excluded.fetched_at
     WHERE pos_customers.updated_at IS NOT excluded.updated_at OR pos_customers.assigned_user_id IS NOT excluded.assigned_user_id OR pos_customers.note_count<>excluded.note_count
       OR pos_customers.last_note_at IS NOT excluded.last_note_at OR pos_customers.succeed_order_count<>excluded.succeed_order_count OR pos_customers.purchased_amount<>excluded.purchased_amount
       OR pos_customers.order_count<>excluded.order_count OR pos_customers.name<>excluded.name OR pos_customers.phone IS NOT excluded.phone OR pos_customers.tags_json<>excluded.tags_json OR pos_customers.level IS NOT excluded.level`,
  ).bind(`${posId}:${customerId}`, posId, customerId, String(c.name ?? '').slice(0, 200), phone, JSON.stringify(phones), str(c.assigned_user_id), str(c.level ?? c.level_id),
    num(c.order_count) ?? 0, num(c.succeed_order_count) ?? 0, num(c.purchased_amount) ?? 0, isoOf(c.last_order_at), isoOf(c.inserted_at), isoOf(c.updated_at), JSON.stringify(tags),
    Array.isArray(c.notes) ? c.notes.filter((n) => !n.removed_at).length : 0,
    Array.isArray(c.notes) ? (c.notes.map((n) => isoFromMs(n.created_at)).filter(Boolean).sort().at(-1) ?? null) : null, now)];
  statements.push(...noteStatements(db, posId, customerId, phone, c.notes, now, 'customer'));
  return statements;
}

/** Giá trị "dấu vân tay" của một khách (đúng các cột dùng ở mệnh đề WHERE của upsert) để so với bản đã lưu trước khi tạo câu lệnh. */
function customerFingerprint(c: SourceCustomer) {
  const phones = (Array.isArray(c.phone_numbers) ? c.phone_numbers : []).map((p) => normalizePhone(String(p))).filter(Boolean);
  const tags = (Array.isArray(c.tags) ? c.tags : []).map((t) => (typeof t === 'string' ? t : (t as { name?: string; text?: string })?.name ?? (t as { text?: string })?.text ?? '')).filter(Boolean);
  const notes = Array.isArray(c.notes) ? c.notes.filter((n) => !n.removed_at) : [];
  return {
    updated_at: isoOf(c.updated_at), assigned_user_id: str(c.assigned_user_id), note_count: notes.length,
    last_note_at: notes.map((n) => isoFromMs(n.created_at)).filter(Boolean).sort().at(-1) ?? null,
    succeed_order_count: num(c.succeed_order_count) ?? 0, purchased_amount: num(c.purchased_amount) ?? 0, order_count: num(c.order_count) ?? 0,
    name: String(c.name ?? '').slice(0, 200), phone: phones[0] ?? null, tags_json: JSON.stringify(tags), level: str(c.level ?? c.level_id),
  };
}
type StoredRow = { id: string; updated_at: string | null; assigned_user_id: string | null; note_count: number; last_note_at: string | null; succeed_order_count: number; purchased_amount: number; order_count: number; name: string; phone: string | null; tags_json: string; level: string | null };

/** Lọc ra những khách khác bản đã lưu (một câu SELECT cho cả trang), để vòng duyệt lại không tốn hàng trăm câu lệnh cho khách không đổi. */
export async function changedCustomers(db: D1Database, posId: string, rows: SourceCustomer[]) {
  const ids = rows.map((c) => str(c.id) ?? str(c.customer_id)).filter((x): x is string => !!x);
  if (!ids.length) return rows;
  const stored = new Map<string, StoredRow>();
  // D1 tối đa 100 tham số mỗi câu.
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const r = await db.prepare(`SELECT id, updated_at, assigned_user_id, note_count, last_note_at, succeed_order_count, purchased_amount, order_count, name, phone, tags_json, level FROM pos_customers WHERE id IN (${chunk.map(() => '?').join(',')})`)
      // Không thêm pos_id=? : với danh sách IN dài, D1 bỏ chỉ mục khóa chính và quét ~150k dòng (đo thực tế: 157.250 so với 180 dòng).
      .bind(...chunk.map((id) => `${posId}:${id}`)).all<StoredRow>();
    for (const row of r.results) stored.set(row.id, row);
  }
  return rows.filter((c) => {
    const id = str(c.id) ?? str(c.customer_id); if (!id) return false;
    const s = stored.get(`${posId}:${id}`); if (!s) return true;
    const f = customerFingerprint(c);
    return f.updated_at !== (s.updated_at ?? null) || f.assigned_user_id !== (s.assigned_user_id ?? null) || f.note_count !== Number(s.note_count) || f.last_note_at !== (s.last_note_at ?? null)
      || f.succeed_order_count !== Number(s.succeed_order_count) || f.purchased_amount !== Number(s.purchased_amount) || f.order_count !== Number(s.order_count)
      || f.name !== s.name || f.phone !== (s.phone ?? null) || f.tags_json !== s.tags_json || f.level !== (s.level ?? null);
  });
}

async function write(db: D1Database, statements: D1PreparedStatement[]) {
  let writes = 0;
  for (let i = 0; i < statements.length; i += 60) {
    const results = await db.batch(statements.slice(i, i + 60));
    for (const r of results) writes += Number(r.meta?.rows_written ?? 0);
  }
  return writes;
}

const noteSummary = (c: SourceCustomer) => {
  const notes = Array.isArray(c.notes) ? c.notes.filter((n) => !n.removed_at) : [];
  return { count: notes.length, last: notes.map((n) => isoFromMs(n.created_at)).filter((v): v is string => !!v).sort((a, b) => a.localeCompare(b)).at(-1) ?? null };
};

/**
 * Khách vừa thay đổi (kể cả có ghi chú mới) từ lần đồng bộ trước. Với khách mà số ghi chú / ghi chú mới nhất khác
 * bản đã lưu, gọi thêm load_customer_notes để lấy ĐỦ ghi chú (danh sách khách có thể chỉ kèm vài ghi chú gần nhất),
 * tối đa `fullNotesCap` khách mỗi lượt để không kéo dài lượt đồng bộ.
 * Tối đa 3 trang mỗi lượt để không "ăn" hết thời gian của vòng duyệt toàn bộ; phần dư sẽ được vòng duyệt toàn bộ lấy bù.
 */
export async function syncCustomersRecent(db: D1Database, shop: { id: string; shop_id: string | null; customers_synced_at?: string | null }, apiKey: string, maxPages = 3, fullNotesCap = 25) {
  const now = new Date();
  const since = shop.customers_synced_at ? new Date(Date.parse(shop.customers_synced_at) - OVERLAP_MS) : new Date(now.getTime() - 24 * 3600000);
  const statements: D1PreparedStatement[] = [];
  const customers: SourceCustomer[] = [];
  let records = 0;
  for (let page = 1; page <= maxPages; page++) {
    const result = await listCustomersPage(shop.shop_id!, apiKey, { page_size: String(PAGE_SIZE), page_number: String(page), start_time_updated_at: String(Math.floor(since.getTime() / 1000)), end_time_updated_at: String(Math.floor(now.getTime() / 1000) + 60) });
    const rows = result.data ?? [];
    // Chỉ tạo câu lệnh cho khách khác bản đã lưu (tránh bắn hàng trăm câu lệnh không đổi vào D1); vẫn gom đủ rows để so ghi chú bên dưới.
    for (const c of await changedCustomers(db, shop.id, rows)) statements.push(...customerStatements(db, shop.id, c, now.toISOString()));
    customers.push(...rows);
    records += rows.length;
    if (rows.length < PAGE_SIZE) break;
    if (page === maxPages) console.warn(`customers recent ${shop.id}: quá ${maxPages} trang, phần còn lại chờ vòng duyệt toàn bộ`);
  }
  // Khách có ghi chú thay đổi so với bản đã lưu → lấy đủ ghi chú.
  const idOf = (c: SourceCustomer) => str(c.id) ?? str(c.customer_id);
  const ids = customers.map(idOf).filter((id): id is string => !!id);
  const stored = new Map<string, { note_count: number; last_note_at: string | null }>();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const rows = await db.prepare(`SELECT customer_id, note_count, last_note_at FROM pos_customers WHERE pos_id=? AND customer_id IN (${chunk.map(() => '?').join(',')})`)
      .bind(shop.id, ...chunk).all<{ customer_id: string; note_count: number; last_note_at: string | null }>();
    for (const r of rows.results) stored.set(r.customer_id, { note_count: Number(r.note_count), last_note_at: r.last_note_at });
  }
  const changed = customers.filter((c) => {
    const id = idOf(c);
    if (!id) return false;
    const s = noteSummary(c), prev = stored.get(id);
    return prev ? prev.note_count !== s.count || prev.last_note_at !== s.last : s.count > 0;
  });
  let fullNotes = 0, fullNoteRows = 0;
  for (const c of changed.slice(0, fullNotesCap)) {
    const id = idOf(c)!;
    const phone = (Array.isArray(c.phone_numbers) ? c.phone_numbers : []).map((p) => normalizePhone(String(p))).find(Boolean) ?? null;
    try {
      const notes = await loadCustomerNotes(shop.shop_id!, id, apiKey);
      statements.push(...noteStatements(db, shop.id, id, phone, notes, now.toISOString(), 'customer'));
      fullNotes++; fullNoteRows += notes.length;
    } catch (error) {
      // Endpoint lỗi (hoặc không có quyền): vẫn còn ghi chú từ danh sách khách; ghi log để đối chiếu, không dừng lượt.
      console.warn(`load_customer_notes ${shop.id}/${id} failed`, error instanceof Error ? error.message : error);
      break;
    }
  }
  statements.push(db.prepare('UPDATE pos_shops SET customers_synced_at=? WHERE id=?').bind(now.toISOString(), shop.id));
  const writes = await write(db, statements);
  return { records, writes, fullNotes, fullNoteRows, changedNotes: changed.length };
}

/** Duyệt toàn bộ danh sách khách theo CỬA SỔ THỜI GIAN CẬP NHẬT, lùi dần từ hiện tại về quá khứ.
 *  Mỗi cửa sổ chỉ vài trang nên không có trang "sâu" (offset lớn làm Pancake trả chậm/timeout).
 *  Cửa sổ tự co giãn: ít khách thì nới rộng (tối đa 30 ngày), nhiều khách thì thu hẹp (tối thiểu 1 ngày). */
export async function syncCustomersBackfill(db: D1Database, shop: { id: string; shop_id: string | null }, apiKey: string, cursor: CustomerCursor, maxPages = 5) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let windowEnd = cursor.windowEnd ?? Math.floor(Date.now() / 1000) + 60;
  let windowDays = cursor.windowDays ?? 1;
  let page = cursor.windowEnd ? (cursor.page || 1) : 1;
  let fetched = cursor.fetched ?? 0, total = cursor.total, records = 0, completed = false;
  // Tổng số khách toàn cửa hàng (để hiện tiến độ) lấy bằng một lời gọi không cửa sổ, chỉ khi chưa biết.
  if (!total) { try { const t = await listCustomersPage(shop.shop_id!, apiKey, { page_size: '1', page_number: '1' }); if (typeof t.total_entries === 'number') total = t.total_entries; } catch { /* bỏ qua */ } }
  for (let i = 0; i < maxPages; i++) {
    const windowStart = windowEnd - windowDays * 86400;
    const result = await listCustomersPage(shop.shop_id!, apiKey, { page_size: String(PAGE_SIZE), page_number: String(page), start_time_updated_at: String(windowStart), end_time_updated_at: String(windowEnd) });
    const rows = result.data ?? [];
    for (const c of await changedCustomers(db, shop.id, rows)) statements.push(...customerStatements(db, shop.id, c, now));
    records += rows.length; fetched += rows.length;
    if (rows.length < PAGE_SIZE) {
      // Hết cửa sổ này → lùi sang cửa sổ trước, co giãn độ rộng theo mật độ khách.
      if (page === 1 && rows.length < 30) windowDays = Math.min(30, windowDays * 2);
      else if (page >= 5) windowDays = Math.max(1, Math.floor(windowDays / 2));
      windowEnd = windowStart; page = 1;
      if (windowEnd < WALK_STOP_SEC) { completed = true; break; }
    } else page++;
  }
  const next: CustomerCursor = { page, windowEnd, windowDays, fetched, completed, startedAt: cursor.startedAt ?? now, completedAt: completed ? now : undefined, firstCompletedAt: cursor.firstCompletedAt ?? (completed ? now : undefined), total };
  statements.push(db.prepare('UPDATE pos_shops SET customer_cursor=? WHERE id=?').bind(JSON.stringify(next), shop.id));
  const writes = await write(db, statements);
  return { records, writes, cursor: next, completed };
}

/** Tiến độ duyệt danh sách khách của từng POS (để báo trên web khi số liệu ghi chú còn thiếu). */
export function customerBackfillProgress(rows: { id: string; customer_cursor: string | null }[]) {
  return rows.map((r) => {
    const c = parseCustomerCursor(r.customer_cursor);
    const done = c ? (c.fetched ?? Math.max(0, (c.page - 1) * PAGE_SIZE)) : 0;
    // initial: chưa từng duyệt xong lần nào → số liệu còn thiếu thật; các vòng duyệt lại sau đó không cần báo.
    return { posId: r.id, completed: !!c?.completed, initial: !c?.firstCompletedAt && !c?.completed, page: c?.page ?? 0, done, total: c?.total ?? null, percent: c?.completed ? 100 : c?.total ? Math.min(99, Math.round(done / c.total * 100)) : null };
  });
}
