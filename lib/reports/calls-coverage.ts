/** Khởi tạo từng POS ngoài giờ xem. Trigger migration 0052 giữ số trong cùng giao dịch đồng bộ. */
export async function backfillCallsCoverage(db: D1Database, now = new Date()) {
  if ((now.getUTCHours() + 7) % 24 >= 5) return 0;
  const next = await db.prepare('SELECT id FROM pos_shops WHERE id NOT IN (SELECT pos_id FROM calls_coverage_pos) ORDER BY id LIMIT 1').first<{ id: string }>();
  if (!next) return 0;
  const result = await db.prepare(`INSERT INTO calls_coverage_pos (pos_id,customers,notes,first_note,last_fetch)
    SELECT ?, (SELECT COUNT(*) FROM pos_customers WHERE pos_id=?), COUNT(*), MIN(created_at), MAX(fetched_at)
    FROM customer_notes WHERE pos_id=? ON CONFLICT(pos_id) DO NOTHING`).bind(next.id, next.id, next.id).run();
  return Number(result.meta.rows_written ?? result.meta.changes ?? 0);
}
