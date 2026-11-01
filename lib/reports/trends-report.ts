// Đọc số cho xu hướng 10 tuần (lib/trends.ts) từ D1: dùng cho /api/reports/trends và nhận xét AI mỗi sáng.
// Điều kiện giống 4 bảng Tổng quan POS (/api/reports/sections): Sale / CSKH theo ngày chốt, MKT theo ngày xác nhận, Vận đơn = đơn chốt đã gửi đi.
// Doanh thu chỉ của người được tính (tên có hậu tố MKT / CSKH / SALE, lib/team.ts); Vận đơn đếm mọi đơn gửi đi vì không phải doanh số.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { isSegment } from '@/lib/pancake/order-segments';
import { MARKETING_TEAMS_KEY, parseMarketingTeams } from '@/lib/teams/marketing-teams';
import { EMPTY_ORDER_FILTERS, orderFilterSql, type ProductSegment } from '@/lib/pancake/order-segments';
import { addDays, todayVn, vnRangeUtc } from '@/lib/shared/report-time';
import { RETURNED_CODES, SENT_CODES } from '@/lib/reports/shipping-lines';
import { CLOSED, STATUS_GROUPS, dayExpr, sellerProductStatsReady, sentAtReady } from '@/lib/reports/stats';
import { COUNTED_STAFF, countedCase, teamSubquery } from '@/lib/teams/team';
import { TREND_DAYS, buildTrends, type ClosedTrendRow, type CohortRow, type MktTrendRow, type ProductTrendRow } from '@/lib/reports/trends';

const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
const GROUP_CASE = `CASE ${Object.entries(STATUS_GROUPS).map(([k, codes]) => `WHEN o.status_code IN (${codes.join(',')}) THEN '${k}'`).join(' ')} END`;

/** Chú giải hiện dưới trang Xu hướng (route và lượt làm nóng dùng chung). */
export const TRENDS_DEFINITIONS = {
  'Cửa sổ': '10 tuần đến ngày cuối kỳ đang chọn (luôn đủ 10 tuần kể cả khi xem "Hôm nay"). Nền xanh nhạt là kỳ đang chọn. Tuần và % tăng giảm tính đến ngày đủ gần nhất (hôm nay chưa hết ngày thì đến hôm qua).',
  'Tăng / giảm': 'Tuần gần nhất so với trung bình 4 tuần trước đó. Lệch dưới 3% là đi ngang.',
  'Bộ phận': 'Sale, CSKH: doanh thu đơn chốt theo ngày chốt. MKT: doanh thu đơn có Marketer đã xác nhận, theo ngày xác nhận. Vận đơn: đơn chuyển đi và doanh số chuyển đi, theo ngày Sale / CSKH đưa đơn sang (ngày gần đây thấp hơn vì đơn chưa kịp chuyển đi).',
  'Team': 'Sale / CSKH theo team của người bán trên web nhân sự; MKT theo team Marketing đã xếp ở trang Marketing.',
  'Sản phẩm': 'Tiền dòng sản phẩm (sau giảm giá dòng, không tính quà) trên đơn chốt, gộp theo loại: Oxy, SK + GK, Gentadox, Vita Plus, Mega Green, Khác. Số lượng là số sản phẩm bán.',
  'Trạng thái theo ngày tạo': 'Đơn tạo mỗi ngày trong 14 ngày gần nhất, chia theo trạng thái hiện tại. Ngày cũ còn nhiều đơn chưa xong là có đơn bị kẹt.',
};

export type TrendsOpts = { posIds: string[]; productSegment: ProductSegment; start: string; end: string };

/** Đọc bộ lọc từ URL (route và lượt làm nóng cache dùng chung, lib/reports/report-warm.ts); sai thì trả câu báo lỗi. */
export function parseTrendsParams(p: URLSearchParams): TrendsOpts | { error: string } {
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return { error: 'Khoảng ngày không hợp lệ.' };
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return { error: 'POS không hợp lệ.' };
  const pp = p.get('productSegment');
  return { posIds: requested.length ? requested : POS.map((x) => x.id), productSegment: isSegment(pp) ? pp : 'all', start, end };
}

/** Thân JSON mà /api/reports/trends trả: số liệu kèm chú giải. */
export async function trendsBody(opts: TrendsOpts) {
  return { ...(await trendsReport(opts)), definitions: TRENDS_DEFINITIONS };
}

/** Xu hướng đến ngày `end` (không quá hôm nay); `start` chỉ để tô nền kỳ đang chọn. */
export async function trendsReport(opts: TrendsOpts) {
  const today = todayVn();
  const end = opts.end > today ? today : opts.end;
  const first = addDays(end, -(TREND_DAYS - 1));
  const days = Array.from({ length: TREND_DAYS }, (_, i) => addDays(first, i));
  // Hôm nay chưa hết ngày: tuần và tăng giảm tính đến hôm qua.
  const fullIndex = end === today ? TREND_DAYS - 2 : TREND_DAYS - 1;
  const { startUtc, endUtc } = vnRangeUtc(first, end);
  const cohortStart = vnRangeUtc(addDays(end, -13), end).startUtc;
  const ph = opts.posIds.map(() => '?').join(',');
  const seg = orderFilterSql({ ...EMPTY_ORDER_FILTERS, productSegment: opts.productSegment }, 'all', 'o').sql;
  const sale = teamSubquery('sale'), cskh = teamSubquery('cskh');
  const closedWhere = `o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED}${seg}`;
  const binds = [...opts.posIds, startUtc, endUtc];
  // Dòng sản phẩm: không lọc nhóm hàng thì đọc bảng tính sẵn theo ngày chốt (dựng lại mỗi lượt đồng bộ, cùng điều kiện dòng bán);
  // bảng chưa điền đủ lịch sử hoặc có lọc nhóm hàng thì nối đơn gốc với dòng sản phẩm như trước.
  const products = opts.productSegment === 'all' && await sellerProductStatsReady(env.DB)
    ? env.DB.prepare(`SELECT day, name, SUM(sale_quantity) AS qty, SUM(sale_total) AS net FROM stats_daily_seller_product
        WHERE pos_id IN (${ph}) AND day>=? AND day<=? GROUP BY day, name HAVING SUM(sale_quantity)>0`).bind(...opts.posIds, first, end)
    : env.DB.prepare(`SELECT ${dayExpr('o.first_closed_at')} AS day, i.name, COALESCE(SUM(i.quantity),0) AS qty, COALESCE(SUM(i.line_total),0) AS net
        FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
        WHERE ${closedWhere} AND i.is_bonus=0 AND i.quantity>0 GROUP BY 1, 2`).bind(...binds);
  // Vận đơn theo ngày gửi hàng (anh Vũ 10/10/2026) khi đã điền đủ giờ gửi đơn cũ: đơn đi lấy riêng theo first_sent_at (dòng counted=0 chỉ cộng vào
  // Vận đơn), đơn chốt không còn cờ đi / hoàn. Chưa đủ thì như cũ: đơn đi trong các đơn chốt theo ngày chốt.
  const bySent = await sentAtReady(env.DB);
  const sentFlag = bySent ? '0' : `CASE WHEN o.status_code IN (${SENT_CODES.join(',')}) THEN 1 ELSE 0 END`;
  const retFlag = `CASE WHEN o.status_code IN (${RETURNED_CODES.join(',')}) THEN 1 ELSE 0 END`;
  const [closed, mkt, productRows, cohort, hr, users, mktTeams, sentRows] = await env.DB.batch([
    env.DB.prepare(`SELECT ${dayExpr('o.first_closed_at')} AS day, o.seller_id,
        CASE WHEN o.seller_id IN ${sale} THEN 'sale' WHEN o.seller_id IN ${cskh} THEN 'cskh' ELSE 'other' END AS team,
        ${sentFlag} AS sent, ${bySent ? '0' : retFlag} AS ret,
        ${countedCase('o.seller_id')} AS counted, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net
      FROM raw_pos_orders o WHERE ${closedWhere} GROUP BY 1, 2, 3, 4, 5, 6`).bind(...binds),
    env.DB.prepare(`SELECT ${dayExpr('o.first_confirmed_at')} AS day, o.marketer_id, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)
        AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.marketer_id IN ${COUNTED_STAFF}${seg} GROUP BY 1, 2`).bind(...binds),
    products,
    env.DB.prepare(`SELECT ${dayExpr('o.created_at')} AS day, ${GROUP_CASE} AS grp, COUNT(*) AS n
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.created_at>=? AND o.created_at<? AND o.status_code<>7${seg} GROUP BY 1, 2`).bind(...opts.posIds, cohortStart, endUtc),
    env.DB.prepare('SELECT pos_user_id, department FROM hr_pos_team'),
    env.DB.prepare(`SELECT user_id, MAX(department) AS department FROM pos_users WHERE pos_id IN (${ph}) GROUP BY user_id`).bind(...opts.posIds),
    env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY),
    ...(bySent ? [env.DB.prepare(`SELECT ${dayExpr('o.first_sent_at')} AS day, NULL AS seller_id, 'other' AS team, 1 AS sent, ${retFlag} AS ret, 0 AS counted,
        COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_sent_at IS NOT NULL AND o.first_sent_at>=? AND o.first_sent_at<? AND o.status_code IN (${SENT_CODES.join(',')})${seg} GROUP BY 1, 5`).bind(...binds)] : []),
  ]);
  // Team của người bán: đơn vị trên web nhân sự, chưa gắn thì bộ phận trên Pancake.
  const unit = new Map<string, string>();
  for (const u of users.results as { user_id: string; department: string | null }[]) if (u.department) unit.set(u.user_id, u.department);
  for (const h of hr.results as { pos_user_id: string; department: string | null }[]) if (h.department) unit.set(h.pos_user_id, h.department);
  const mktOf = new Map<string, string>();
  for (const t of parseMarketingTeams((mktTeams.results[0] as { value?: string } | undefined)?.value)) for (const m of t.memberIds) mktOf.set(m, t.name);
  return buildTrends({
    days, selected: { start: opts.start < first ? first : opts.start, end }, fullIndex,
    closed: [...closed.results, ...(sentRows?.results ?? [])] as ClosedTrendRow[], mkt: mkt.results as MktTrendRow[], products: productRows.results as ProductTrendRow[], cohort: cohort.results as CohortRow[],
    sellerTeam: (id) => unit.get(id) ?? null, mktTeam: (id) => mktOf.get(id) ?? null,
  });
}
