import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { scopeApi } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { DATE_RE, daysBetween, vnRangeUtc } from '@/lib/report-time';
import { sentAtReady, costReady, NET } from '@/lib/stats';
import { SENT_CODES, orderLines } from '@/lib/shipping-lines';
import { itemNames } from '@/lib/product-groups';
import { COUNTED_STAFF } from '@/lib/team';
import { ensureAdCostSchema, roasReport } from '@/lib/ad-costs';
import { MARKETING_TEAMS_KEY, parseMarketingTeams, UNASSIGNED_TEAM } from '@/lib/marketing-teams';
import { buildProfit } from '@/lib/profit';

const definitions = {
  cohort: 'Đơn chuyển đi theo first_sent_at trong kỳ, xét trạng thái hiện tại. Đã nhận: 3, 16; hoàn: 4, 5, 15; còn trên đường: 2 (không vào lãi).',
  revenue: 'Doanh thu khách đã nhận = NET sau giảm trừ trên đơn đủ giá vốn. Chỉ tính người có marketer_id thuộc COUNTED_STAFF.',
  cost: 'Giá vốn = số lượng × đơn giá: avg_price > 0, rồi last_imported_price > 0, rồi tổng giá vốn × số lượng thành phần combo. Combo có giá riêng dùng giá riêng. Quà tặng tính đủ giá vốn. Đơn đã nhận thiếu giá vốn hoặc chưa tính bị loại khỏi doanh thu, giá vốn và lãi; đếm Đơn thiếu giá vốn.',
  fee: 'Phí hãng ship chiều đi lấy partner.total_fee > 0, rồi partner_fee > 0. Thiếu phí coi là 0 và đếm Đơn thiếu phí ship. Không dùng phí khách trả.',
  returns: 'Đơn hoàn có doanh thu và giá vốn bằng 0; phí chiều hoàn giả định bằng phí chiều đi (RETURN_FEE_FACTOR = 1). Hoàn một phần tạm tính như hoàn cả đơn, không loại vì thiếu giá vốn.',
  gross: 'Lãi gộp = doanh thu khách đã nhận − giá vốn − phí chiều đi − phí chiều hoàn. Biên % = lãi gộp ÷ doanh thu × 100; doanh thu 0 thì không có biên.',
  ads: 'Chi phí quảng cáo = tổng ad_costs.amount theo ngày trong kỳ, gồm cả người chỉ có chi phí. Chi phí không có POS: chỉ tính lãi sau quảng cáo và ROAS sau hoàn khi chọn đủ 6 POS. Theo POS và loại đơn chỉ tính lãi gộp, không phân bổ quảng cáo.',
  roas: 'Lãi sau quảng cáo = lãi gộp − chi phí. ROAS sau hoàn = doanh thu khách đã nhận ÷ chi phí (chi phí 0 thì không có ROAS). ROAS chốt lấy nguyên từ roasReport cùng kỳ và POS; khác nhóm thời gian với đơn chuyển đi. Theo team không tự tính lại ROAS chốt.',
  lines: 'Đơn nhiều loại được chia đều số đơn, doanh thu, giá vốn và phí cho các loại để tổng các dòng bằng tổng. Theo marketer chỉ lấy COUNTED_STAFF; team cộng các marketer theo thành viên hiện tại. Cảnh báo khi ROAS chốt ≥ 2 và lãi sau quảng cáo âm.',
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== 'owner') return Response.json({ error: 'Chỉ chủ hệ thống được xem Lãi thật.' }, { status: 403 });
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return Response.json({ error: scoped.blocked }, { status: 403 });
  const p = scoped.url.searchParams, start = p.get('start') ?? '', end = p.get('end') ?? '';
  const validDate = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!validDate(start) || !validDate(end) || start > end || daysBetween(start, end) > 93) return Response.json({ error: 'Chọn khoảng ngày hợp lệ, tối đa 93 ngày.' }, { status: 400 });
  const requested = [...new Set((p.get('posIds') ?? '').split(',').filter(Boolean))];
  if (requested.some((id) => !POS.some((pos) => pos.id === id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((pos) => pos.id);
  const allPos = POS.every((pos) => posIds.includes(pos.id)), ready = await costReady(env.DB);
  const empty = () => buildProfit([], { adCostByMarketer: new Map(), roasClosedByMarketer: new Map(), roasClosedTotal: null, allPos: false, teamOf: () => UNASSIGNED_TEAM, teamNames: new Map() });
  if (!await sentAtReady(env.DB)) return Response.json({ ...empty(), period: { start, end }, posIds, allPos, ready, notReady: 'sent', definitions });
  await ensureAdCostSchema();
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const rows = await env.DB.prepare(`SELECT o.id, o.pos_id, o.status_code, ${NET} AS net, o.cost_total, o.cost_missing, o.carrier_fee,
    CASE WHEN o.marketer_id IN ${COUNTED_STAFF} THEN o.marketer_id ELSE NULL END AS marketer_id, o.tags_json
    FROM raw_pos_orders o WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND o.first_sent_at>=? AND o.first_sent_at<? AND o.status_code IN (${SENT_CODES.join(',')})
    AND o.marketer_id IN ${COUNTED_STAFF}`)
    .bind(...posIds, startUtc, endUtc).all<{ id: string; pos_id: string; status_code: number; net: number; cost_total: number | null; cost_missing: number | null; carrier_fee: number | null; marketer_id: string | null; tags_json: string | null }>();
  const items = await itemNames(env.DB, rows.results.map((r) => r.id));
  const costs = await env.DB.prepare('SELECT marketer_id, SUM(amount) AS amount FROM ad_costs WHERE day>=? AND day<=? GROUP BY 1').bind(start, end).all<{ marketer_id: string; amount: number }>();
  const closed = await roasReport({ posIds, start, end });
  const setting = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY).first<{ value: string }>();
  const teams = parseMarketingTeams(setting?.value), membership = new Map(teams.flatMap((t) => t.memberIds.map((id) => [id, t.id] as const)));
  const report = buildProfit(rows.results.map((r) => ({ status: r.status_code, net: Number(r.net), cost: r.cost_total, missing: r.cost_missing,
    fee: r.carrier_fee, marketerId: r.marketer_id, posId: r.pos_id, lines: orderLines(items.get(r.id) ?? [], r.tags_json) })), {
    adCostByMarketer: new Map(costs.results.map((r) => [r.marketer_id, Number(r.amount)])),
    roasClosedByMarketer: new Map(closed.rows.map((r) => [r.marketerId, r.roas])), roasClosedTotal: closed.total.roas, allPos,
    teamOf: (id) => membership.get(id) ?? UNASSIGNED_TEAM, teamNames: new Map([...teams.map((t) => [t.id, t.name] as const), [UNASSIGNED_TEAM, 'Chưa vào team']]),
  });
  return Response.json({ ...report, period: { start, end }, posIds, allPos, ready, definitions });
}
