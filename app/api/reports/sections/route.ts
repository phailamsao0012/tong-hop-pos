import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { COUNTED_STAFF, teamSubquery } from '@/lib/team';
import { buildSections, type ClosedAgg, type CohortAgg, type MktAgg } from '@/lib/sections';
import { CLOSED } from '@/lib/stats';
import { EMPTY_ORDER_FILTERS, orderFilterSql } from '@/lib/order-segments';
import { RETURNED_CODES, SENT_CODES } from '@/lib/shipping-lines';
import { mktSummary } from '@/lib/ad-costs';

// Tổng quan 4 mục (Sale / CSKH / MKT / Vận đơn), xem lib/sections.ts. Nhóm theo người bán trên đơn (bộ phận Sale / CSKH);
// MKT = đơn có Marketer. Đơn chốt Sale / CSKH = từ Chờ xác nhận trở đi theo ngày chốt (cùng Tổng quan POS); MKT chốt = đã xác nhận.
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
const IS_CLOSED = `o.first_closed_at IS NOT NULL AND o.${CLOSED}`;
const IS_CONFIRMED = 'o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,6,7)';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  // Nhóm đơn (Gentadox / SK + GK): lọc đơn chốt; tỷ lệ chốt = đơn của nhóm nay đã chốt ÷ mọi đơn lên (như #36, đơn mới chưa có sản phẩm).
  const pp = p.get('productSegment');
  const productSegment = pp === 'gentadox' || pp === 'skgk' ? pp : 'all';
  const seg = orderFilterSql({ ...EMPTY_ORDER_FILTERS, productSegment }, 'all', 'o').sql;
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const team = `CASE WHEN o.seller_id IN ${teamSubquery('sale')} THEN 'sale' WHEN o.seller_id IN ${teamSubquery('cskh')} THEN 'cskh' ELSE 'other' END`;
  // MKT: chỉ Marketer được tính doanh số (tên có hậu tố MKT…); Sale / CSKH đã lọc trong teamSubquery.
  const mkt = `CASE WHEN NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.marketer_id IN ${COUNTED_STAFF} THEN 1 ELSE 0 END`;
  const sent = `o.status_code IN (${SENT_CODES.join(',')})`, returned = `o.status_code IN (${RETURNED_CODES.join(',')})`;
  // MKT khi xem mọi nhóm đơn: số về, đơn chốt, doanh thu, chi phí, chi phí / số, / đơn lấy chung với trang Chi phí & ROAS (lib/ad-costs.ts mktSummary)
  // để mọi trang ra một số MKT. Lọc nhóm đơn (Gentadox / SK + GK): chi phí không tách được theo nhóm đơn nên chỉ có đơn và doanh thu.
  const whole = productSegment === 'all';
  const [[closed, cohort, sync, mktRows], summary] = await Promise.all([
    env.DB.batch([
      env.DB.prepare(`SELECT ${team} AS team, ${mkt} AS mkt, COUNT(*) AS closed, COALESCE(SUM(${NET}),0) AS net,
          SUM(CASE WHEN ${sent} THEN 1 ELSE 0 END) AS sent, COALESCE(SUM(CASE WHEN ${sent} THEN ${NET} END),0) AS sent_net,
          SUM(CASE WHEN ${returned} THEN 1 ELSE 0 END) AS returned, COALESCE(SUM(CASE WHEN ${returned} THEN ${NET} END),0) AS returned_net
        FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND ${IS_CLOSED}${seg} GROUP BY 1, 2`).bind(...posIds, startUtc, endUtc),
      env.DB.prepare(`SELECT ${team} AS team, ${mkt} AS mkt, COUNT(*) AS created, SUM(CASE WHEN ${IS_CLOSED}${seg} THEN 1 ELSE 0 END) AS closed_now, SUM(CASE WHEN ${IS_CONFIRMED}${seg} THEN 1 ELSE 0 END) AS confirmed_now
        FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.created_at>=? AND o.created_at<? AND o.status_code<>7 GROUP BY 1, 2`).bind(...posIds, startUtc, endUtc),
      env.DB.prepare(`SELECT MAX(last_sync_at) AS at FROM pos_shops WHERE id IN (${ph})`).bind(...posIds),
      ...(whole ? [] : [env.DB.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders o
        WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND ${IS_CONFIRMED} AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.marketer_id IN ${COUNTED_STAFF}${seg}`).bind(...posIds, startUtc, endUtc)]),
    ]),
    whole ? mktSummary({ posIds, start, end }) : Promise.resolve(null),
  ]);
  const mktAgg: MktAgg = summary ? { orders: summary.closed, net: summary.net } : (mktRows?.results[0] ?? { orders: 0, net: 0 }) as MktAgg;
  const sections = buildSections(closed.results as ClosedAgg[], cohort.results as CohortAgg[], mktAgg);
  if (summary) Object.assign(sections.mkt, {
    cost: summary.hasCost ? summary.cost : null, phones: summary.phones, leadOrders: summary.orders,
    costPerLead: summary.costPerLead, costPerClosed: summary.costPerClosed, roas: summary.roas,
  });
  return Response.json({
    period: { start, end }, productSegment, syncedAt: (sync.results[0] as { at?: string | null } | undefined)?.at ?? null,
    ...sections,
    definitions: {
      'Sale': 'Đơn có người bán thuộc bộ phận Sale. Đơn chốt = từ Chờ xác nhận trở đi; đơn chốt, doanh thu theo ngày chốt. Tỷ lệ chốt = đơn tạo trong kỳ của Sale nay đã chốt ÷ đơn tạo trong kỳ của Sale.',
      'CSKH': 'Đơn có người bán thuộc bộ phận CSKH. Tự upsell = đơn không có Marketer; Từ MKT = đơn có Marketer (khách MKT đưa về).',
      'MKT': 'Đơn có Marketer. Chốt = đã xác nhận trên Pancake, doanh thu theo ngày xác nhận lần đầu. Tỷ lệ chốt = đơn MKT tạo trong kỳ nay đã xác nhận ÷ đơn MKT tạo trong kỳ. Doanh thu chỉ tính Marketer được tính doanh số (tên có hậu tố MKT…). Số về = SĐT khác nhau trên đơn tạo trong kỳ của từng Marketer. Chi phí = số nhập ở trang Chi phí & ROAS (tay, Excel hoặc Google Sheet nối sẵn), tính cho mọi POS; chi phí / số, / đơn và ROAS chỉ tính Marketer đã có chi phí, giống trang Chi phí & ROAS.',
      'Vận đơn': 'Vận đơn không bán hàng nên không có doanh thu. Đơn nhận về trong kỳ (Sale, CSKH đưa sang, theo ngày vào Chờ xác nhận), xét trạng thái hiện tại: đơn chuyển đi = đã giao cho đơn vị vận chuyển (đã gửi, đã nhận, đã thu tiền, hoàn); doanh số chuyển đi = tiền hàng của các đơn đó; hoàn = đang hoàn, hoàn một phần, đã hoàn. Tỷ lệ hoàn theo đơn và theo giá trị.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
