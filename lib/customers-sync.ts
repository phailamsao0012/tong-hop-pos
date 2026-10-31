// Đồng bộ KHÁCH HÀNG Pancake (mục Khách hàng): người được phân công và các ghi chú (mỗi ghi chú = một lần chăm sóc / cuộc gọi).
// - Gần đây: khách có updated_at trong cửa sổ từ lần đồng bộ trước (trừ 30 phút chồng lấn).
// - Lịch sử: duyệt toàn bộ danh sách theo trang, con trỏ lưu ở pos_shops.customer_cursor.
// - Chỉ tạo câu lệnh cho khách có thay đổi (so với bản đã lưu bằng một SELECT mỗi trang): vòng duyệt lại 200k khách
//   trước đây bắn ~430k câu lệnh/giờ vào D1 làm web chậm và tra phiên đăng nhập lỗi (hiện 401).
// - Ngoài ra ghi chú còn được lấy từ trường customer.notes trong mỗi đơn hàng khi đồng bộ đơn (lib/sync.ts).
import { normalizePhone } from '@/lib/customer-stats';
import { listCustomersPage, loadCustomerNotes, type SourceCustomer, type SourceNote } from '@/lib/pancake';
import { enqueueNotes, loadNotesPending, removePendingNotes, saveNotesPending, type NotesPending } from '@/lib/notes-pending';

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
const str = (v: unknown) => v === null || v === undefined ? null : String(v as string | number | boolean);
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
       WHERE customer_notes.message<>excluded.message OR COALESCE(customer_notes.updated_at,'')<>COALESCE(excluded.updated_at,'') OR (customer_notes.customer_id IS NULL AND excluded.customer_id IS NOT NULL)`,
    ).bind(String(n.id), posId, customerId, phone, str(n.created_by?.id ?? n.created_by?.uid), str(n.created_by?.fb_name ?? n.created_by?.name), String(n.message ?? '').slice(0, 4000),
      str(n.order_id) || null, createdAt, isoFromMs(n.updated_at), now, source));
  }
  return out;
}

type StoredRow = Record<string, string | number | null>;

function customerRow(posId: string, c: SourceCustomer, now: string): StoredRow | null {
  const customerId = str(c.id) ?? str(c.customer_id);
  if (!customerId) return null;
  const phones = (Array.isArray(c.phone_numbers) ? c.phone_numbers : []).map((p) => normalizePhone(String(p))).filter(Boolean);
  const tags = (Array.isArray(c.tags) ? c.tags : []).map((t) => (typeof t === 'string' ? t : (t as { name?: string; text?: string })?.name ?? (t as { text?: string })?.text ?? '')).filter(Boolean);
  return {
    id: `${posId}:${customerId}`, pos_id: posId, customer_id: customerId,
    name: String(c.name ?? '').slice(0, 200), phone: phones[0] ?? null, phones_json: JSON.stringify(phones),
    assigned_user_id: str(c.assigned_user_id), level: str(c.level ?? c.level_id),
    order_count: num(c.order_count) ?? 0, succeed_order_count: num(c.succeed_order_count) ?? 0, purchased_amount: num(c.purchased_amount) ?? 0,
    last_order_at: isoOf(c.last_order_at), inserted_at: isoOf(c.inserted_at), updated_at: isoOf(c.updated_at), tags_json: JSON.stringify(tags),
    note_count: Array.isArray(c.notes) ? c.notes.filter((n) => !n.removed_at).length : 0,
    last_note_at: Array.isArray(c.notes) ? (c.notes.map((n) => isoFromMs(n.created_at)).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))).at(-1) ?? null) : null,
    fetched_at: now,
  };
}

function customerChanges(row: StoredRow, stored: StoredRow) {
  return Object.keys(row).filter((c) => !['id', 'pos_id', 'customer_id', 'fetched_at'].includes(c)
    && (c === 'inserted_at' ? stored[c] ?? row[c] : row[c]) !== stored[c]);
}

export function customerStatements(db: D1Database, posId: string, c: SourceCustomer, now: string, stored?: StoredRow, pending?: Map<string, StoredRow>) {
  const row = customerRow(posId, c, now);
  if (!row) return [];
  const statements: D1PreparedStatement[] = [];
  if (stored) {
    row.inserted_at = stored.inserted_at ?? row.inserted_at;
    const changed = customerChanges(row, stored);
    if (pending && !changed.length) return [];
    if (changed.length) {
      changed.push('fetched_at');
      statements.push(db.prepare(`UPDATE pos_customers SET ${changed.map((c) => `${c}=?`).join(',')} WHERE id=?`).bind(...changed.map((c) => row[c]), row.id));
    }
  } else {
    const cols = Object.keys(row);
    // Một khách mới có thể xuất hiện lại ở trang khác trước khi batch được ghi.
    const values = cols.filter((c) => !['id', 'pos_id', 'customer_id'].includes(c));
    const incoming = (c: string) => c === 'inserted_at' ? 'COALESCE(pos_customers.inserted_at,excluded.inserted_at)' : `excluded.${c}`;
    statements.push(db.prepare(`INSERT INTO pos_customers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
      ON CONFLICT(id) DO UPDATE SET ${values.map((c) => `${c}=${incoming(c)}`).join(',')}
      WHERE ${values.filter((c) => c !== 'fetched_at').map((c) => `pos_customers.${c} IS NOT ${incoming(c)}`).join(' OR ')}`).bind(...Object.values(row)));
  }
  if (pending) pending.set(String(row.id), statements.length ? row : stored ?? row);
  statements.push(...noteStatements(db, posId, String(row.customer_id), row.phone as string | null, c.notes, now, 'customer'));
  return statements;
}

/** Read unseen IDs once; allRows lets callers compare duplicates sequentially as pending writes advance. */
export async function changedCustomers(db: D1Database, posId: string, rows: SourceCustomer[], stored = new Map<string, StoredRow>(), allRows = false) {
  const ids = [...new Set(rows.map((c) => str(c.id) ?? str(c.customer_id)).filter((x): x is string => !!x))].filter((id) => !stored.has(`${posId}:${id}`));
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const r = await db.prepare(`SELECT * FROM pos_customers WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk.map((id) => `${posId}:${id}`)).all<StoredRow>();
    for (const row of r.results) stored.set(String(row.id), row);
  }
  if (allRows) return rows;
  return rows.filter((c) => {
    const row = customerRow(posId, c, '');
    if (!row) return false;
    const prev = stored.get(String(row.id));
    return !prev || customerChanges(row, prev).length > 0;
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
export async function syncCustomersRecent(db: D1Database, shop: { id: string; shop_id: string | null; customers_synced_at?: string | null }, apiKey: string, maxPages = 3, fullNotesCap = 25, pending?: NotesPending) {
  const now = new Date();
  const since = shop.customers_synced_at ? new Date(Date.parse(shop.customers_synced_at) - OVERLAP_MS) : new Date(now.getTime() - 24 * 3600000);
  const statements: D1PreparedStatement[] = [];
  const customers: SourceCustomer[] = [];
  let records = 0;
  const storedPage = new Map<string, StoredRow>();
  for (let page = 1; page <= maxPages; page++) {
    const result = await listCustomersPage(shop.shop_id!, apiKey, { page_size: String(PAGE_SIZE), page_number: String(page), start_time_updated_at: String(Math.floor(since.getTime() / 1000)), end_time_updated_at: String(Math.floor(now.getTime() / 1000) + 60) });
    const rows = result.data ?? [];
    // Chỉ tạo câu lệnh cho khách khác bản đã lưu (tránh bắn hàng trăm câu lệnh không đổi vào D1); vẫn gom đủ rows để so ghi chú bên dưới.
    for (const c of await changedCustomers(db, shop.id, rows, storedPage, true)) statements.push(...customerStatements(db, shop.id, c, now.toISOString(), storedPage.get(`${shop.id}:${str(c.id) ?? str(c.customer_id)}`), storedPage));
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
  const queue = pending ?? await loadNotesPending(db);
  const uniqueChanged = [...new Map(changed.map((c) => [idOf(c)!, c])).values()];
  enqueueNotes(queue, shop.id, uniqueChanged.map((c) => idOf(c)!));
  let fullNotes = 0, fullNoteRows = 0;
  const completed: string[] = [];
  for (const c of uniqueChanged.slice(0, fullNotesCap)) {
    const id = idOf(c)!;
    const phone = (Array.isArray(c.phone_numbers) ? c.phone_numbers : []).map((p) => normalizePhone(String(p))).find(Boolean) ?? null;
    try {
      const notes = await loadCustomerNotes(shop.shop_id!, id, apiKey);
      statements.push(...noteStatements(db, shop.id, id, phone, notes, now.toISOString(), 'customer'));
      completed.push(id);
      fullNotes++; fullNoteRows += notes.length;
    } catch (error) {
      // Endpoint lỗi (hoặc không có quyền): vẫn còn ghi chú từ danh sách khách; ghi log để đối chiếu, không dừng lượt.
      console.warn(`load_customer_notes ${shop.id}/${id} failed`, error instanceof Error ? error.message : error);
      continue;
    }
  }
  statements.push(db.prepare('UPDATE pos_shops SET customers_synced_at=? WHERE id=?').bind(now.toISOString(), shop.id));
  let writes = await write(db, statements);
  removePendingNotes(queue, shop.id, completed);
  if (!pending) writes += await saveNotesPending(db, queue);
  return { records, writes, fullNotes, fullNoteRows, changedNotes: changed.length };
}

/** Duyệt toàn bộ danh sách khách theo CỬA SỔ THỜI GIAN CẬP NHẬT, lùi dần từ hiện tại về quá khứ.
 *  Mỗi cửa sổ chỉ vài trang nên không có trang "sâu" (offset lớn làm Pancake trả chậm/timeout).
 *  Cửa sổ tự co giãn: ít khách thì nới rộng (tối đa 30 ngày), nhiều khách thì thu hẹp (tối thiểu 1 ngày). */
export async function syncCustomersBackfill(db: D1Database, shop: { id: string; shop_id: string | null }, apiKey: string, cursor: CustomerCursor, maxPages = 5, pending?: NotesPending) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let windowEnd = cursor.windowEnd ?? Math.floor(Date.now() / 1000) + 60;
  let windowDays = cursor.windowDays ?? 1;
  let page = cursor.windowEnd ? (cursor.page || 1) : 1;
  let fetched = cursor.fetched ?? 0, total = cursor.total, records = 0, completed = false;
  // Tổng số khách toàn cửa hàng (để hiện tiến độ) lấy bằng một lời gọi không cửa sổ, chỉ khi chưa biết.
  if (!total) { try { const t = await listCustomersPage(shop.shop_id!, apiKey, { page_size: '1', page_number: '1' }); if (typeof t.total_entries === 'number') total = t.total_entries; } catch { /* bỏ qua */ } }
  const storedPage = new Map<string, StoredRow>();
  const queue = pending ?? await loadNotesPending(db);
  for (let i = 0; i < maxPages; i++) {
    const windowStart = windowEnd - windowDays * 86400;
    const result = await listCustomersPage(shop.shop_id!, apiKey, { page_size: String(PAGE_SIZE), page_number: String(page), start_time_updated_at: String(windowStart), end_time_updated_at: String(windowEnd) });
    const rows = result.data ?? [];
    const pendingIds: string[] = [];
    for (const c of await changedCustomers(db, shop.id, rows, storedPage, true)) {
      const id = str(c.id) ?? str(c.customer_id);
      if (!id) continue;
      const prev = storedPage.get(`${shop.id}:${id}`), summary = noteSummary(c);
      // So trước khi customerStatements cập nhật cả bản lưu tạm của trang.
      if (prev ? Number(prev.note_count) !== summary.count || prev.last_note_at !== summary.last : summary.count > 0) pendingIds.push(id);
      statements.push(...customerStatements(db, shop.id, c, now, prev, storedPage));
    }
    enqueueNotes(queue, shop.id, pendingIds);
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
  let writes = await write(db, statements);
  if (!pending) writes += await saveNotesPending(db, queue);
  return { records, writes, cursor: next, completed };
}

export const NOTES_DRAIN_CAP = 40;

/** Chỉ bỏ mã sau khi đã ghi đủ ghi chú. Lỗi một khách không chặn khách tiếp theo. */
export async function drainPendingNotes(db: D1Database, shop: { id: string; shop_id: string | null }, apiKey: string, pending: NotesPending, deadline = Infinity, canWrite: (writes: number) => boolean = () => true) {
  const ids = (pending.customers[shop.id] ?? []).slice(-NOTES_DRAIN_CAP).reverse();
  let writes = 0, fetched = 0, consecutiveErrors = 0;
  if (!ids.length || Date.now() >= deadline || !canWrite(writes)) return { writes, fetched };
  const rows = await db.prepare(`SELECT customer_id,phone FROM pos_customers WHERE pos_id=? AND customer_id IN (${ids.map(() => '?').join(',')})`)
    .bind(shop.id, ...ids).all<{ customer_id: string; phone: string | null }>();
  const phones = new Map(rows.results.map((r) => [r.customer_id, r.phone]));
  for (const id of ids) {
    if (Date.now() >= deadline || !canWrite(writes)) break;
    let notes: SourceNote[];
    try {
      notes = await loadCustomerNotes(shop.shop_id!, id, apiKey, deadline);
    } catch (error) {
      console.warn(`load_customer_notes pending ${shop.id}/${id} failed`, error instanceof Error ? error.message : error);
      // Quá 3 lỗi liền: dừng POS này; mã lỗi vẫn nằm trong hàng chờ.
      if (++consecutiveErrors > 3) break;
      continue;
    }
    // Lỗi ghi D1 phải truyền ra ngoài, không coi là lỗi Pancake rồi tiếp tục ghi.
    writes += await write(db, noteStatements(db, shop.id, id, phones.get(id) ?? null, notes, new Date().toISOString(), 'customer'));
    removePendingNotes(pending, shop.id, [id]);
    fetched++;
    consecutiveErrors = 0;
  }
  return { writes, fetched };
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

// Canh khách CSKH (anh Vũ 28/10/2026: "riêng mục cskh, số liệu được cập nhật nhanh nhất, chuẩn nhất"). Khoảng 1/5 ghi chú mới
// không làm đổi updated_at của khách nên lượt "gần đây" không thấy, phải chờ vòng duyệt toàn bộ (12 giờ). Ở đây hỏi thẳng Pancake
// theo customer_ids (100 khách/lời gọi) xoay vòng các khách đang giao cho nhân viên CSKH; ghi chú đổi thì vào hàng chờ lấy đủ ngay.
export const CSKH_WATCH_KEY = 'cskh_watch_v1';
export const CSKH_WATCH_BATCHES = 5;
/** Vị trí xoay vòng mỗi POS: thứ tự nhân viên (u) và rowid khách cuối đã hỏi (r); lapAt = lúc xong vòng gần nhất. */
export type CskhWatchCursor = { u: number; r: number; lapAt?: string; lapStartedAt?: string };
export type CskhWatchState = { cursors: Record<string, CskhWatchCursor>; saved: string };

export async function loadCskhWatch(db: D1Database): Promise<CskhWatchState> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(CSKH_WATCH_KEY).first<{ value: string }>();
  let cursors: Record<string, CskhWatchCursor> = {};
  try { const v: unknown = row ? JSON.parse(row.value) : {}; if (v && typeof v === 'object' && !Array.isArray(v)) cursors = v as Record<string, CskhWatchCursor>; } catch { /* hỏng thì xoay lại từ đầu */ }
  return { cursors, saved: JSON.stringify(cursors) };
}

export async function saveCskhWatch(db: D1Database, state: CskhWatchState) {
  const value = JSON.stringify(state.cursors);
  if (value === state.saved) return 0;
  const r = await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(CSKH_WATCH_KEY, value, new Date().toISOString()).run();
  state.saved = value;
  return Number(r.meta?.rows_written ?? 0);
}

/**
 * Hỏi lại tối đa `maxBatches` × 100 khách đang giao cho nhân viên CSKH (`staffIds`, đã sắp xếp), đi tiếp từ con trỏ.
 * Mỗi lô: một SELECT theo chỉ mục (pos_id, assigned_user_id) (~100 dòng), một lời gọi Pancake, ghi chỉ khách đổi.
 */
export async function syncCskhWatch(db: D1Database, shop: { id: string; shop_id: string | null }, apiKey: string, staffIds: string[], state: CskhWatchState, pending: NotesPending, deadline = Infinity, maxBatches = CSKH_WATCH_BATCHES) {
  const now = new Date().toISOString();
  const cur: CskhWatchCursor = state.cursors[shop.id] ? { ...state.cursors[shop.id] } : { u: 0, r: 0 };
  if (cur.u >= staffIds.length) { cur.u = 0; cur.r = 0; }
  let writes = 0, checked = 0, changed = 0, batches = 0, skips = 0;
  const storedPage = new Map<string, StoredRow>();
  if (!cur.lapStartedAt) cur.lapStartedAt = now;
  while (staffIds.length && batches < maxBatches && Date.now() < deadline && skips <= staffIds.length) {
    const rows = (await db.prepare('SELECT rowid AS r, customer_id FROM pos_customers WHERE pos_id=? AND assigned_user_id=? AND rowid>? ORDER BY rowid LIMIT 100')
      .bind(shop.id, staffIds[cur.u], cur.r).all<{ r: number; customer_id: string }>()).results;
    if (!rows.length) {
      // Hết khách của người này: sang người tiếp theo; hết danh sách là xong một vòng.
      skips++; cur.u++; cur.r = 0;
      if (cur.u >= staffIds.length) { cur.u = 0; cur.lapAt = now; cur.lapStartedAt = now; }
      continue;
    }
    skips = 0; batches++;
    const ids = rows.map((x) => x.customer_id);
    const result = await listCustomersPage(shop.shop_id!, apiKey, { page_size: String(PAGE_SIZE), page_number: '1', customer_ids: ids.join(',') });
    const wanted = new Set(ids);
    const got = (result.data ?? []).filter((c) => wanted.has(str(c.id) ?? str(c.customer_id) ?? ''));
    // Pancake bỏ qua customer_ids (trả cả cửa hàng): dừng, không coi khách lạ là khách CSKH.
    if (!got.length && (result.data ?? []).length) { console.warn(`cskh watch ${shop.id}: Pancake không lọc theo customer_ids`); break; }
    const statements: D1PreparedStatement[] = [], pendingIds: string[] = [];
    for (const c of await changedCustomers(db, shop.id, got, storedPage, true)) {
      const id = str(c.id) ?? str(c.customer_id);
      if (!id) continue;
      const prev = storedPage.get(`${shop.id}:${id}`), summary = noteSummary(c);
      if (prev ? Number(prev.note_count) !== summary.count || prev.last_note_at !== summary.last : summary.count > 0) pendingIds.push(id);
      statements.push(...customerStatements(db, shop.id, c, now, prev, storedPage));
    }
    writes += await write(db, statements);
    enqueueNotes(pending, shop.id, pendingIds);
    checked += got.length; changed += pendingIds.length;
    cur.r = rows[rows.length - 1].r;
  }
  state.cursors[shop.id] = cur;
  return { writes, checked, changed, batches };
}

// Khách CSKH vừa ghi chú nhưng KHÔNG giao cho nhân viên CSKH (khách của Sale, khách chưa giao ai): lượt canh ở trên không hỏi tới,
// nên ghi chú không làm đổi updated_at phải chờ vòng duyệt 12 giờ (anh Vũ 31/10/2026: cuộc gọi "mấy người ở cuối" thiếu so với thật).
// Mỗi 30 phút lập danh sách khách được CSKH ghi chú trong 3 ngày gần nhất, rồi hỏi lại Pancake theo customer_ids, 100 khách một lần.
export const NOTED_WATCH_DAYS = 3;
export const NOTED_WATCH_EVERY_MS = 30 * 60000;
export type NotedWatchCursor = { at: string; after: string };

/** Mã khách cần hỏi lại, theo thứ tự customer_id sau `after` (con trỏ xoay vòng). */
export const NOTED_WATCH_SQL = `SELECT DISTINCT n.customer_id FROM customer_notes n INDEXED BY idx_customer_notes_pos_created
  WHERE n.pos_id=? AND n.created_at>=? AND n.customer_id IS NOT NULL AND n.customer_id>?
    AND n.author_id IN (SELECT value FROM json_each(?))
    AND NOT EXISTS (SELECT 1 FROM pos_customers c INDEXED BY idx_pos_customers_customer WHERE c.pos_id=n.pos_id AND c.customer_id=n.customer_id
      AND c.assigned_user_id IN (SELECT value FROM json_each(?)))
  ORDER BY n.customer_id LIMIT ?`;

/** Vòng mới khi đã quá 30 phút từ vòng trước; vòng đang chạy thì đi tiếp từ con trỏ. null = chưa tới lượt. */
export function notedWatchStart(cur: NotedWatchCursor | undefined, now: Date): NotedWatchCursor | null {
  if (cur && cur.after) return cur;
  if (cur && now.getTime() - Date.parse(cur.at) < NOTED_WATCH_EVERY_MS) return null;
  return { at: now.toISOString(), after: '' };
}

export async function syncCskhNotedWatch(db: D1Database, shop: { id: string; shop_id: string | null }, apiKey: string, staffIds: string[], state: CskhWatchState, pending: NotesPending, now = new Date(), deadline = Infinity, maxBatches = CSKH_WATCH_BATCHES) {
  const key = `noted:${shop.id}`;
  const saved = state.cursors[key] as unknown as NotedWatchCursor | undefined;
  const cur = notedWatchStart(saved, now);
  let writes = 0, checked = 0, changed = 0, batches = 0;
  if (!cur || !staffIds.length) return { writes, checked, changed, batches };
  const since = new Date(now.getTime() - NOTED_WATCH_DAYS * 86400000).toISOString();
  const staff = JSON.stringify(staffIds);
  const storedPage = new Map<string, StoredRow>();
  while (batches < maxBatches && Date.now() < deadline) {
    const ids = (await db.prepare(NOTED_WATCH_SQL).bind(shop.id, since, cur.after, staff, staff, 100).all<{ customer_id: string }>()).results.map((r) => r.customer_id);
    if (!ids.length) { cur.after = ''; break; }
    batches++;
    const result = await listCustomersPage(shop.shop_id!, apiKey, { page_size: String(PAGE_SIZE), page_number: '1', customer_ids: ids.join(',') });
    const wanted = new Set(ids);
    const got = (result.data ?? []).filter((c) => wanted.has(str(c.id) ?? str(c.customer_id) ?? ''));
    if (!got.length && (result.data ?? []).length) { console.warn(`cskh noted watch ${shop.id}: Pancake không lọc theo customer_ids`); break; }
    const statements: D1PreparedStatement[] = [], pendingIds: string[] = [];
    for (const c of await changedCustomers(db, shop.id, got, storedPage, true)) {
      const id = str(c.id) ?? str(c.customer_id);
      if (!id) continue;
      const prev = storedPage.get(`${shop.id}:${id}`), summary = noteSummary(c);
      if (prev ? Number(prev.note_count) !== summary.count || prev.last_note_at !== summary.last : summary.count > 0) pendingIds.push(id);
      statements.push(...customerStatements(db, shop.id, c, now.toISOString(), prev, storedPage));
    }
    writes += await write(db, statements);
    enqueueNotes(pending, shop.id, pendingIds);
    checked += got.length; changed += pendingIds.length;
    cur.after = ids[ids.length - 1];
    if (ids.length < 100) { cur.after = ''; break; }
  }
  state.cursors[key] = cur as unknown as CskhWatchCursor;
  return { writes, checked, changed, batches };
}
