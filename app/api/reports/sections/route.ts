import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { teamSubquery } from '@/lib/team';
import { buildSections, type ClosedAgg, type CohortAgg } from '@/lib/sections';
import { RETURNED_CODES, SENT_CODES } from '@/lib/shipping-lines';

// Tổng quan 4 mục (Sale / CSKH / MKT / Vận đơn), xem lib/sections.ts. Nhóm theo người bán trên đơn (bộ phận Sale / CSKH);
// MKT = đơn có Marketer. Đơn chốt = đã xác nhận trở đi theo ngày xác nhận lần đầu (cùng Tổng quan POS), MKT cũng tính đã xác nhận.
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
const CLOSED = 'o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,6,7)';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const team = `CASE WHEN o.seller_id IN ${teamSubquery('sale')} THEN 'sale' WHEN o.seller_id IN ${teamSubquery('cskh')} THEN 'cskh' ELSE 'other' END`;
  const mkt = "CASE WHEN NULLIF(TRIM(o.marketer_id),'') IS NULL THEN 0 ELSE 1 END";
  const sent = `o.status_code IN (${SENT_CODES.join(',')})`, returned = `o.status_code IN (${RETURNED_CODES.join(',')})`;
  const [closed, cohort] = await env.DB.batch([
    env.DB.prepare(`SELECT ${team} AS team, ${mkt} AS mkt, COUNT(*) AS closed, COALESCE(SUM(${NET}),0) AS net,
        SUM(CASE WHEN ${sent} THEN 1 ELSE 0 END) AS sent, COALESCE(SUM(CASE WHEN ${sent} THEN ${NET} END),0) AS sent_net,
        SUM(CASE WHEN ${returned} THEN 1 ELSE 0 END) AS returned, COALESCE(SUM(CASE WHEN ${returned} THEN ${NET} END),0) AS returned_net
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND ${CLOSED} GROUP BY 1, 2`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare(`SELECT ${team} AS team, ${mkt} AS mkt, COUNT(*) AS created, SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS closed_now
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 GROUP BY 1, 2`).bind(...posIds, startUtc, endUtc),
  ]);
  return Response.json({
    period: { start, end },
    ...buildSections(closed.results as ClosedAgg[], cohort.results as CohortAgg[]),
    definitions: {
      'Sale': 'Đơn có người bán thuộc bộ phận Sale. Đơn chốt, doanh thu theo ngày xác nhận lần đầu. Tỷ lệ chốt = đơn tạo trong kỳ của Sale nay đã chốt ÷ đơn tạo trong kỳ của Sale.',
      'CSKH': 'Đơn có người bán thuộc bộ phận CSKH. Tự upsell = đơn không có Marketer; Từ MKT = đơn có Marketer (khách MKT đưa về).',
      'MKT': 'Đơn có Marketer. Chốt = đã xác nhận trên Pancake. Tỷ lệ chốt = đơn MKT tạo trong kỳ nay đã xác nhận ÷ đơn MKT tạo trong kỳ. Chi phí chưa có trên Pancake.',
      'Vận đơn': 'Đơn chốt trong kỳ, xét trạng thái hiện tại: đi = đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, đã thu tiền, hoàn); hoàn = đang hoàn, hoàn một phần, đã hoàn. Tỷ lệ hoàn theo đơn và theo doanh số.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
