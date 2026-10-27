const PENDING_KEY = 'notes_pending_v1';
const CHECKED_KEY = 'notes_gap_checked_v1';
export const NOTES_PENDING_LIMIT = 20_000;
export const NOTES_GAP_LIMIT = 3_000;

/** Ghi chú cuối báo cáo: chỉ đọc dòng hàng chờ, không dò thiếu trên trang web. */
export async function countPendingNotes(db: D1Database, posIds: string[]) {
  if (!posIds.length) return 0;
  const row = await db
    .prepare(`SELECT COALESCE(SUM(json_array_length(p.value)),0) AS customers
    FROM app_settings s, json_each(s.value) p WHERE s.key=? AND p.key IN (${posIds.map(() => '?').join(',')})`)
    .bind(PENDING_KEY, ...posIds)
    .first<{ customers: number }>();
  return Number(row?.customers ?? 0);
}

export type NotesPending = {
  customers: Record<string, string[]>;
  checked: Record<string, string>;
  savedCustomers: string;
  savedChecked: string;
};

export async function loadNotesPending(db: D1Database): Promise<NotesPending> {
  const rows = await db
    .prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)')
    .bind(PENDING_KEY, CHECKED_KEY)
    .all<{ key: string; value: string }>();
  const customers: Record<string, string[]> = {},
    checked: Record<string, string> = {};
  for (const row of rows.results) {
    const value: unknown = JSON.parse(row.value);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Hàng chờ ghi chú không hợp lệ: ${row.key}`);
    for (const [posId, entry] of Object.entries(value)) {
      if (row.key === PENDING_KEY) {
        if (!Array.isArray(entry) || entry.some((id) => typeof id !== 'string'))
          throw new Error('Mã khách trong hàng chờ ghi chú không hợp lệ');
        customers[posId] = [...new Set(entry as string[])];
      } else if (typeof entry === 'string') checked[posId] = entry;
    }
  }
  return {
    customers,
    checked,
    savedCustomers: JSON.stringify(customers),
    savedChecked: JSON.stringify(checked),
  };
}

export function enqueueNotes(
  state: NotesPending,
  posId: string,
  ids: string[],
) {
  if (!ids.length) return;
  // Mã được gặp lại chuyển về cuối: lượt rút ưu tiên ghi chú mới.
  const incoming = new Set(ids);
  const next = [
    ...(state.customers[posId] ?? []).filter((id) => !incoming.has(id)),
    ...incoming,
  ];
  const dropped = Math.max(0, next.length - NOTES_PENDING_LIMIT);
  if (dropped)
    console.warn(`notes pending ${posId}: bỏ ${dropped} mã khách cũ nhất`);
  state.customers[posId] = next.slice(dropped);
}

export function removePendingNotes(
  state: NotesPending,
  posId: string,
  ids: string[],
) {
  const removed = new Set(ids);
  if (removed.size && state.customers[posId])
    state.customers[posId] = state.customers[posId].filter(
      (id) => !removed.has(id),
    );
}

/** Mỗi lượt cron chia sẻ một state; chỉ ghi một dòng hàng chờ khi nội dung đổi. */
export async function saveNotesPending(db: D1Database, state: NotesPending) {
  let writes = 0;
  for (const [key, field, saved] of [
    [PENDING_KEY, 'customers', 'savedCustomers'],
    [CHECKED_KEY, 'checked', 'savedChecked'],
  ] as const) {
    const value = JSON.stringify(state[field]);
    if (value === state[saved]) continue;
    const r = await db
      .prepare(
        'INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE app_settings.value IS NOT excluded.value',
      )
      .bind(key, value, new Date().toISOString())
      .run();
    writes += Number(r.meta?.rows_written ?? 0);
    state[saved] = value;
  }
  return writes;
}

// Liệt kê người phụ trách bằng các lần SEEK MIN trên idx_pos_customers_assigned (không DISTINCT quét hết khách).
// Kể cả nhóm NULL và mã không có trong pos_users. Với mỗi nhóm, SEEK đúng khoảng last_note_at 45 ngày
// bằng idx_pos_customers_assigned_note; đếm ghi chú bằng idx_customer_notes_customer.
// Ước đọc/ngày cho 6 POS: số nhóm + khách được ghi chú trong 45 ngày + ghi chú của các khách đó
// (ước <300.000 dòng, tùy mật độ thực tế); không đọc khách cũ, không quét raw_pos_orders.
export const NOTES_GAP_SQL = `WITH RECURSIVE assigned(id) AS (
  SELECT MIN(assigned_user_id) FROM pos_customers INDEXED BY idx_pos_customers_assigned WHERE pos_id=?
  UNION ALL
  SELECT (SELECT MIN(assigned_user_id) FROM pos_customers INDEXED BY idx_pos_customers_assigned WHERE pos_id=? AND assigned_user_id>assigned.id)
  FROM assigned WHERE id IS NOT NULL
)
SELECT c.customer_id FROM assigned a
CROSS JOIN pos_customers c INDEXED BY idx_pos_customers_assigned_note
WHERE c.assigned_user_id IS a.id AND c.last_note_at>=? AND c.last_note_at<=? AND c.pos_id=?
  AND c.note_count > (SELECT COUNT(*) FROM customer_notes n INDEXED BY idx_customer_notes_customer
    WHERE n.pos_id=c.pos_id AND n.customer_id=c.customer_id AND n.source='customer')
LIMIT ?`;

export async function enqueueNotesGaps(
  db: D1Database,
  state: NotesPending,
  posId: string,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  if (state.checked[posId] === day) return 0;
  const since = new Date(now.getTime() - 45 * 86400000)
    .toISOString()
    .slice(0, 19);
  const until = now.toISOString().slice(0, 19);
  const rows = await db
    .prepare(NOTES_GAP_SQL)
    .bind(posId, posId, since, until, posId, NOTES_GAP_LIMIT)
    .all<{ customer_id: string }>();
  enqueueNotes(
    state,
    posId,
    rows.results.map((r) => r.customer_id),
  );
  state.checked[posId] = day;
  return rows.results.length;
}
