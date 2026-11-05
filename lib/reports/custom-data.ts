// Tách khỏi app/api/data/route.ts (cải tổ B4/B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

/** Dữ liệu nhập tay cho Báo cáo tuỳ chỉnh (phân công, đơn, khách; mỗi loại tối đa 5.001 dòng) và độ phủ đồng bộ. */
export async function customDataSources() {
  const db = env.DB;
  const [assignmentRows, orderRows, customerRows, shops, coverage] =
    await Promise.all([
      db
        .prepare(
          'SELECT * FROM assignments ORDER BY assigned_at DESC LIMIT 5001',
        )
        .all<Record<string, unknown>>(),
      db
        .prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5001')
        .all<Record<string, unknown>>(),
      db
        .prepare('SELECT * FROM customers LIMIT 5001')
        .all<Record<string, unknown>>(),
      db
        .prepare(
          'SELECT last_sync_at, history_start FROM pos_shops WHERE last_sync_at IS NOT NULL ORDER BY last_sync_at DESC LIMIT 1',
        )
        .first<{ last_sync_at: string; history_start: string | null }>(),
      db
        .prepare(
          'SELECT COUNT(*) AS connected_pos, MIN(last_sync_at) AS oldest_sync_at, MAX(history_start) AS latest_history_start, SUM(CASE WHEN history_start IS NULL THEN 1 ELSE 0 END) AS missing_history_start FROM pos_shops WHERE status=?',
        )
        .bind('connected')
        .first<{
          connected_pos: number;
          oldest_sync_at: string | null;
          latest_history_start: string | null;
          missing_history_start: number;
        }>(),
    ]);
  return { assignmentRows, orderRows, customerRows, shops, coverage };
}
