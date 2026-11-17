// Tách khỏi app/api/reports/cskh-badge/route.ts (cải tổ B4, 05/11/2026): chỉ dời chỗ, câu SQL và số liệu giữ nguyên.
import { env } from 'cloudflare:workers';
import { todayVn, vnRangeUtc } from '@/lib/shared/report-time';
import { teamFilter } from '@/lib/teams/team';

// Hai con số nhỏ hiện dưới nhóm CSKH trên menu: cuộc gọi (ghi chú) hôm nay và khách quá 20 ngày chưa note (của nhân viên CSKH).
/** posIds: POS đang chọn (quy tắc POS 12/11/2026); rỗng = mọi POS. */
export async function cskhBadge(posIds: string[] = []) {
  const pos = posIds.length ? ` AND pos_id IN (${posIds.map(() => '?').join(',')})` : '';
  const today = todayVn();
  const { startUtc, endUtc } = vnRangeUtc(today, today);
  const cutoff = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 19);
  const [calls, over] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM customer_notes WHERE created_at>=? AND created_at<?${pos}${teamFilter('author_id', 'cskh', false)}`).bind(startUtc, endUtc, ...posIds),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM pos_customers WHERE assigned_user_id IS NOT NULL${pos}${teamFilter('assigned_user_id', 'cskh', false)} AND (last_note_at IS NULL OR last_note_at<?)`).bind(...posIds, cutoff),
  ]);
  return { callsToday: Number((calls.results[0] as { n: number })?.n ?? 0), over20: Number((over.results[0] as { n: number })?.n ?? 0) };
}
