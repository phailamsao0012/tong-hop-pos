// Danh sách người từng là Marketer trên đơn (đánh dấu "MKT" ở trang chia team MKT). Câu DISTINCT quét toàn bộ bảng đơn
// (số đo D1 04/11/2026: hơn 100 lần mỗi ngày, mỗi lần quét cả bảng) nên lưu sẵn trong app_settings, làm mới sau 6 giờ.
// Danh sách gần như không đổi; người mới chỉ chậm hiện dấu "MKT" tối đa 6 giờ (vẫn nhận ra qua bộ phận có chữ MKT / marketing).
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
