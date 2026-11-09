// Danh sách Marketer trên đơn, duy trì cùng batch đồng bộ trong marketer_ids.
// Chưa điền bảng xong thì giữ cache/đường DISTINCT cũ để không trả thiếu người.
export const MARKETER_IDS_KEY = 'marketer_ids_v1';
export const MARKETER_IDS_TTL_MS = 6 * 3600 * 1000;

type Cached = { at: number; ids: string[] };
export function parseCachedIds(
  value: string | null | undefined,
  now: number,
): string[] | null {
  if (!value) return null;
  try {
    const c = JSON.parse(value) as Partial<Cached>;
    if (
      typeof c.at !== 'number' ||
      !Array.isArray(c.ids) ||
      now - c.at > MARKETER_IDS_TTL_MS ||
      c.at > now
    )
      return null;
    return c.ids.filter((x): x is string => typeof x === 'string');
  } catch {
    return null;
  }
}

// Vá nóng 09/11/2026: nhớ trong isolate 10 phút và gộp các lượt gọi cùng lúc (trước đây hết hạn là nhiều request cùng quét cả bảng).
const MEMO_MS = 10 * 60000;
const memo = new WeakMap<D1Database, { at: number; ids: Set<string> }>();
export const MARKETER_READY_KEY = 'marketer_ids_ready_v2';
export function forgetMarketerIds(db: D1Database) { memo.delete(db); }

/** Một POS mỗi lượt, chỉ chạy bởi bộ hẹn giờ ngoài giờ xem (00–05h VN). */
export async function backfillMarketerIds(db: D1Database, now = new Date()): Promise<number> {
  if ((now.getUTCHours() + 7) % 24 >= 5) return 0;
  const ready = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETER_READY_KEY).first<{ value: string }>();
  if (ready?.value === '1') return 0;
  const next = await db.prepare("SELECT id FROM pos_shops WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key='marketer_ids_filled:'||pos_shops.id) ORDER BY id LIMIT 1").first<{ id: string }>();
  const at = now.toISOString();
  if (next) {
    const results = await db.batch([
      db.prepare("INSERT INTO marketer_ids (marketer_id,first_seen_at,last_seen_at) SELECT DISTINCT TRIM(marketer_id),?,? FROM raw_pos_orders WHERE pos_id=? AND marketer_id IS NOT NULL AND TRIM(marketer_id)<>'' ON CONFLICT(marketer_id) DO NOTHING").bind(at, at, next.id),
      db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').bind(`marketer_ids_filled:${next.id}`, '1', at),
    ]);
    return results.reduce((n, r) => n + Number(r.meta.rows_written ?? r.meta.changes ?? 0), 0);
  } else {
    const result = await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(MARKETER_READY_KEY, '1', at).run();
    forgetMarketerIds(db);
    return Number(result.meta.rows_written ?? result.meta.changes ?? 0);
  }
}

/** Gọi cùng batch ghi đơn; lặp nguồn không đổi không tạo câu ghi mới. */
export function marketerStatements(db: D1Database, current: string | number | null | undefined, previous: string | number | null | undefined, now: string) {
  const id = String(current ?? '').trim(), old = String(previous ?? '').trim();
  if (id === old) return [];
  forgetMarketerIds(db);
  return [
    ...(id ? [db.prepare('INSERT INTO marketer_ids (marketer_id,first_seen_at,last_seen_at) VALUES (?,?,?) ON CONFLICT(marketer_id) DO NOTHING').bind(id, now, now)] : []),
    // DISTINCT cũ chỉ chứa marketer còn xuất hiện trên ít nhất một đơn, kể cả đơn đã xoá mềm.
    ...(old ? [db.prepare("DELETE FROM marketer_ids WHERE marketer_id=? AND NOT EXISTS (SELECT 1 FROM raw_pos_orders WHERE TRIM(marketer_id)=?)").bind(old, old)] : []),
  ];
}
export async function marketerIds(
  db: D1Database,
  now = Date.now(),
): Promise<Set<string>> {
  const m = memo.get(db);
  if (m && now - m.at < MEMO_MS && m.at <= now) return m.ids;
  const ids = await loadMarketerIds(db, now);
  memo.set(db, { at: now, ids });
  return ids;
}
async function loadMarketerIds(
  db: D1Database,
  now: number,
): Promise<Set<string>> {
  const ready = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETER_READY_KEY).first<{ value: string }>();
  if (ready?.value === '1') {
    const rows = await db.prepare('SELECT marketer_id FROM marketer_ids').all<{ marketer_id: string }>();
    return new Set(rows.results.map(r => r.marketer_id));
  }
  const saved = await db
    .prepare('SELECT value FROM app_settings WHERE key=?')
    .bind(MARKETER_IDS_KEY)
    .first<{ value: string }>();
  const cached = parseCachedIds(saved?.value, now);
  if (cached) return new Set(cached);
  const rows = await db
    .prepare(
      "SELECT DISTINCT TRIM(marketer_id) AS user_id FROM raw_pos_orders WHERE marketer_id IS NOT NULL AND TRIM(marketer_id)<>''",
    )
    .all<{ user_id: string }>();
  const ids = rows.results.map((r) => r.user_id);
  await db
    .prepare(
      'INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
    )
    .bind(
      MARKETER_IDS_KEY,
      JSON.stringify({ at: now, ids }),
      new Date(now).toISOString(),
    )
    .run();
  return new Set(ids);
}
