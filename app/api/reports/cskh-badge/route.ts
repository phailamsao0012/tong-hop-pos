import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { todayVn, vnRangeUtc } from '@/lib/report-time';
import { teamFilter } from '@/lib/team';

// Hai con số nhỏ hiện dưới nhóm CSKH trên menu: cuộc gọi (ghi chú) hôm nay và khách quá 20 ngày chưa note (của nhân viên CSKH).
export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  const today = todayVn();
  const { startUtc, endUtc } = vnRangeUtc(today, today);
  const cutoff = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 19);
  const [calls, over] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM customer_notes WHERE created_at>=? AND created_at<?${teamFilter('author_id', 'cskh')}`).bind(startUtc, endUtc),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM pos_customers WHERE assigned_user_id IS NOT NULL${teamFilter('assigned_user_id', 'cskh')} AND (last_note_at IS NULL OR last_note_at<?)`).bind(cutoff),
  ]);
  return Response.json({ callsToday: Number((calls.results[0] as { n: number })?.n ?? 0), over20: Number((over.results[0] as { n: number })?.n ?? 0) }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
