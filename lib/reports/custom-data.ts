// Tách khỏi app/api/data/route.ts (cải tổ B4/B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { teamSubquery, type Team } from '@/lib/teams/team';

/** Dữ liệu nhập tay cho Báo cáo tuỳ chỉnh (phân công, đơn, khách; mỗi loại tối đa 5.001 dòng) và độ phủ đồng bộ.
 *  Chỉ dữ liệu thuộc POS và nhóm của tài khoản (người cấp số / người chốt thuộc nhóm), như các báo cáo khác. */
export async function customDataSources(posIds: string[], team: Team) {
  const db = env.DB;
  const posIn = `pos_id IN (${posIds.map(() => '?').join(',') || "''"})`;
  const sub = teamSubquery(team, false);
  const [assignmentRows, orderRows, customerRows, shops, coverage] =
    await Promise.all([
      db
        .prepare(
          `SELECT * FROM assignments WHERE ${posIn}${sub ? ` AND employee_id IN ${sub}` : ''} ORDER BY assigned_at DESC LIMIT 5001`,
        )
        .bind(...posIds)
        .all<Record<string, unknown>>(),
      db
        .prepare(`SELECT * FROM orders WHERE ${posIn}${sub ? ` AND closer_id IN ${sub}` : ''} ORDER BY created_at DESC LIMIT 5001`)
        .bind(...posIds)
        .all<Record<string, unknown>>(),
      db
        .prepare(`SELECT * FROM customers WHERE ${posIn} LIMIT 5001`)
        .bind(...posIds)
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
