// Tách khỏi app/api/reports/marketing/route.ts (cải tổ B4, 05/11/2026): chỉ dời chỗ, câu SQL và số liệu giữ nguyên.
import { env } from 'cloudflare:workers';
import type { Role } from '@/lib/auth/access';
import type { resolveMktLens } from '@/lib/shared/scope-filter';
import { mktTeams } from '@/lib/teams/mkt-teams-source';
import { branchFilter } from '@/lib/teams/branch';
import { maskPhone } from '@/lib/bot/bot-guard-core';
import { POS } from '@/lib/shared/report-model';
import { vnRangeUtc } from '@/lib/shared/report-time';
import { NET } from '@/lib/reports/stats';
import { ORDER_STATUS } from '@/lib/pancake/pancake';
import { STAGES, SOURCE_FIELD, itemKey, productExists, saleItemPredicate, stageSql, type MarketingStage } from '@/lib/reports/marketing-report';
import { MARKETING_TEAMS_KEY, parseMarketingTeams, UNASSIGNED_TEAM, marketingTeamFilter, marketingTeamGroupSql } from '@/lib/teams/marketing-teams';
import { parseTeam, MKT_STAFF, teamFilter, teamSubquery, leadSellerFilter, notSan } from '@/lib/teams/team';
import { RANK_STAGES, type RankStage } from '@/lib/reports/mkt-rank';
import { mktReadSource, withItems, type MktSource } from '@/lib/reports/mkt-source';
import { saleTeamSql } from '@/lib/teams/sale-team-filter';
import { mktClosedSql } from '@/lib/reports/mkt-closed';

/** Đã xác nhận lần đầu, kể cả sau đó hủy / hoàn (chỉ trừ mới / chờ / xoá). */
const EVER_CONFIRMED = "(o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,7))";

const BASES = ['created', 'confirmed'] as const;
type Basis = typeof BASES[number];

type AggregateRow = {
  orders: number; phones: number; gross: number; net: number;
  confirmed: number; shipped: number; delivered: number; returned: number; cancelled: number; refund_net: number;
  cskh_orders: number; cskh_net: number; cskh_refund_net: number; sale_orders: number; sale_net: number; sale_refund_net: number; sale_phones: number; sale_closed_phones?: number;
};
type MarketerRow = AggregateRow & { marketer_id: string };
type MarketingTeamRow = AggregateRow & { marketing_team_id: string };
type ProductRow = { product_key: string; product_name: string; orders: number; phones: number; quantity: number; line_total: number };
type RecentOrder = { id: string; source_order_id: string; pos_id: string; phone: string | null; created_at: string; first_confirmed_at: string | null; status_code: number; marketer_id: string | null; seller_id: string | null; care_id: string | null; net: number; source: string | null; note: string | null };

const num = (v: unknown) => Number(v ?? 0);
const aggregate = (r?: Partial<AggregateRow>) => ({
  orders: num(r?.orders), phones: num(r?.phones), gross: num(r?.gross), net: num(r?.net),
  confirmed: num(r?.confirmed), shipped: num(r?.shipped), delivered: num(r?.delivered), returned: num(r?.returned), cancelled: num(r?.cancelled), refundNet: num(r?.refund_net),
  // Tách New / CSKH theo người bán trên đơn: CSKH = người bán thuộc bộ phận CSKH; New = người bán thuộc bộ phận Sale (anh Vũ 12/10/2026
  // "doanh thu sale là doanh thu new"; trước đây New = mọi người không thuộc CSKH). Cùng cách với số chính Marketing (lib/mkt-analytics.ts),
  // nên người bán chưa có hậu tố SALE / CSKH không vào New hay CSKH (có trong cột Doanh thu).
  cskhOrders: num(r?.cskh_orders), cskhNet: num(r?.cskh_net), cskhAfterRefund: num(r?.cskh_net) - num(r?.cskh_refund_net),
  newOrders: num(r?.sale_orders), newNet: num(r?.sale_net), newAfterRefund: num(r?.sale_net) - num(r?.sale_refund_net),
  /** SĐT trên đơn chia cho Sale (mẫu số TL chốt New). */ newPhones: num(r?.sale_phones),
  /** Trong đó SĐT đã chốt: có ít nhất một đơn đã chốt (kể cả hủy sau đó), như dòng "Số đã chốt" của khung tách sản phẩm (25/11/2026). */ newClosedPhones: num(r?.sale_closed_phones),
});

type Lens = Exclude<Awaited<ReturnType<typeof resolveMktLens>>, Response>;
/** Giữ kết quả 60 giây theo đúng tham số (anh Vũ 16/11/2026: báo cáo sếp lấy số trên web, giảm tải): web vừa tính thì báo cáo dùng lại và ngược lại. */
const CACHE_MS = 60_000;
// Theo từng DB (test dựng DB riêng mỗi bài, không dùng lẫn kết quả).
const caches = new WeakMap<object, Map<string, { at: number; value: Promise<Awaited<ReturnType<typeof marketingOverviewRaw>>> }>>();
/** Trang Tổng quan MKT. Trả null khi team Marketing trên URL không còn tồn tại. */
export function marketingOverview(user: { role: Role }, p: URLSearchParams, posIds: string[], start: string, end: string, checkedLens: Lens) {
  const q = new URLSearchParams(p); q.sort();
  const key = JSON.stringify([user.role, q.toString(), [...posIds].sort(), start, end, checkedLens ? JSON.stringify(checkedLens) : '']);
  const now = Date.now(), db = env.DB as unknown as object;
  let cache = caches.get(db);
  if (!cache) caches.set(db, cache = new Map());
  for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
  const hit = cache.get(key);
  if (hit) return hit.value;
  // Nguồn đọc (bảng gốc / bảng gọn kỳ dài, lib/reports/mkt-source.ts): hai nguồn cho cùng số nên dùng chung khoá bộ nhớ 60 giây.
  const value = mktReadSource(env.DB, env, start, end).then((src) => marketingOverviewRaw(user, p, posIds, start, end, checkedLens, src));
  cache.set(key, { at: now, value });
  value.catch(() => cache!.delete(key));
  return value;
}
/** src: nguồn đọc; test gọi thẳng để so hai nguồn. */
export async function marketingOverviewRaw(user: { role: Role }, p: URLSearchParams, posIds: string[], start: string, end: string, checkedLens: Lens, src: MktSource) {
  const PACKED_SQL = src.packed, AFTER_PACK_CANCELLED_SQL = src.afterPackCancelled, AFTER_PACK_RETURNED_SQL = src.afterPackReturned, NEVER_SENT_CANCELLED_SQL = src.neverSentCancelled;
  // SĐT khách đầy đủ chỉ cho chủ hệ thống, giám đốc; người khác thấy 3 số cuối (bảo vệ dữ liệu cá nhân, 10/10/2026).
  const phoneOut = (v: string | null) => (v && user.role !== 'owner' && user.role !== 'director' ? maskPhone(v) : v);
  const basis = BASES.includes(p.get('basis') as Basis) ? p.get('basis') as Basis : 'created';
  const stage = STAGES.includes(p.get('stage') as MarketingStage) ? p.get('stage') as MarketingStage : 'all';
  const marketerId = (p.get('marketerId') ?? '').trim().slice(0, 100);
  const sellerId = (p.get('sellerId') ?? '').trim().slice(0, 100);
  const careId = (p.get('careId') ?? '').trim().slice(0, 100);
  const productKey = (p.get('productKey') ?? '').trim().slice(0, 180);
  const source = (p.get('source') ?? '').trim().slice(0, 180);
  const marketingTeamId = (p.get('mktTeam') ?? p.get('marketingTeamId') ?? '__all').trim();
  const team = parseTeam(p.get('team'));
  // until (UTC ISO): cắt số tới giờ này (báo cáo sếp "0h tới 8h"); web không gửi tham số này.
  const range = vnRangeUtc(start, end), until = p.get('until') ?? '';
  const startUtc = range.startUtc, endUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(until) && until < range.endUtc ? until : range.endUtc;
  const ph = posIds.map(() => '?').join(',');
  const marketer = `NULLIF(TRIM(o.marketer_id),'')`;
  const resolvedTeams = await mktTeams(env.DB);
  // URL cũ trỏ thẳng team local vẫn hoạt động; lens mới luôn theo nguồn team B1.
  const legacyLocal = !p.has('mktTeam') && marketingTeamId.startsWith('mkt_');
  const saved = legacyLocal ? await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY).first<{ value: string }>() : null;
  const marketingTeams = legacyLocal ? parseMarketingTeams(saved?.value) : resolvedTeams.teams;
  const teamByMember = new Map(marketingTeams.flatMap((t) => t.memberIds.map((id) => [id, t.name] as const)));
  const marketingTeam = marketingTeamFilter(marketingTeamId, marketingTeams, marketer);
  if (!marketingTeam) return null;
  if (checkedLens) marketingTeam.sql += branchFilter('o.marketer_id', p.get('branch'));
  const teamGroup = marketingTeamGroupSql(marketingTeams, marketer);
  const namesSql = "SELECT user_id,MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id";
  const timeCol = basis === 'confirmed' ? 'o.first_confirmed_at' : 'o.created_at';

  const extra: string[] = [];
  const extraBinds: string[] = [];
  if (marketerId) { extra.push(`${marketer}=?`); extraBinds.push(marketerId); }
  if (sellerId) { extra.push('o.seller_id=?'); extraBinds.push(sellerId); }
  if (careId) { extra.push('o.care_id=?'); extraBinds.push(careId); }
  if (productKey) { extra.push(withItems(productExists('o'), src)); extraBinds.push(productKey); }
  if (source) { extra.push(`${SOURCE_FIELD}=?`); extraBinds.push(source); }
  // Team Sale (anh Vũ 12/11/2026): đơn của người bấm xác nhận thuộc team; chưa xác nhận thì theo Sale được gán.
  const saleTeam = saleTeamSql(p.get('saleTeam'));
  if (saleTeam) extra.push(saleTeam.closer);
  // Chỉ Marketer được tính doanh số (tên có hậu tố MKT…, lib/team.ts).
  const scopeWith = (sellerSql: string) => `o.pos_id IN (${ph}) AND ${marketer} IS NOT NULL AND ${marketer} IN ${MKT_STAFF}${notSan('o.marketer_id')}${marketingTeam.sql}${sellerSql}${extra.length ? ` AND ${extra.join(' AND ')}` : ''}`;
  const scoped = scopeWith(teamFilter('o.seller_id', team));
  const period = `${timeCol}>=? AND ${timeCol}<?`;
  const selectedWhere = `${scoped} AND ${period} AND ${stageSql(stage, 'o', PACKED_SQL)}`;
  const selectedBinds = [...posIds, ...marketingTeam.binds, ...extraBinds, startUtc, endUtc];

  // Phễu luôn là cohort đơn tạo trong kỳ. Đây là phần Pancake có đủ trên đơn, không suy ra lead chưa tạo đơn.
  // Số về: đơn chia cho Sale là số Sale, chia cho CSKH là số CSKH, chưa chia / người khác không tính (anh Vũ 04/11/2026, ý sếp).
  const cohortWhere = `${scopeWith(leadSellerFilter('o.seller_id', team))} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
  const cohortBinds = [...posIds, ...marketingTeam.binds, ...extraBinds, startUtc, endUtc];
  const cskhSellers = teamSubquery('cskh')!, saleSellers = teamSubquery('sale')!;
  const sums = `COUNT(*) AS orders,COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones,COALESCE(SUM(COALESCE(o.current_total,0)),0) AS gross,COALESCE(SUM(${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')}),0) AS net,
    SUM(${mktClosedSql('o')}) AS confirmed,SUM(o.status_code IN (2,3,16,4,5,15)) AS shipped,SUM(o.status_code IN (3,16)) AS delivered,SUM(o.status_code IN (4,5,15)) AS returned,SUM(o.status_code=6) AS cancelled,
    COALESCE(SUM(CASE WHEN o.status_code IN (4,5,15,6) THEN ${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')} ELSE 0 END),0) AS refund_net,
    SUM(o.seller_id IN ${cskhSellers}) AS cskh_orders,
    COALESCE(SUM(CASE WHEN o.seller_id IN ${cskhSellers} THEN ${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')} ELSE 0 END),0) AS cskh_net,
    COALESCE(SUM(CASE WHEN o.seller_id IN ${cskhSellers} AND o.status_code IN (4,5,15,6) THEN ${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')} ELSE 0 END),0) AS cskh_refund_net,
    SUM(o.seller_id IN ${saleSellers}) AS sale_orders,
    COALESCE(SUM(CASE WHEN o.seller_id IN ${saleSellers} THEN ${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')} ELSE 0 END),0) AS sale_net,
    COALESCE(SUM(CASE WHEN o.seller_id IN ${saleSellers} AND o.status_code IN (4,5,15,6) THEN ${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')} ELSE 0 END),0) AS sale_refund_net,
    COUNT(DISTINCT CASE WHEN o.seller_id IN ${saleSellers} THEN NULLIF(TRIM(o.phone),'') END) AS sale_phones,
    COUNT(DISTINCT CASE WHEN o.seller_id IN ${saleSellers} AND ${EVER_CONFIRMED} THEN NULLIF(TRIM(o.phone),'') END) AS sale_closed_phones`;

  const optionScope = `o.pos_id IN (${ph}) AND ${marketer} IS NOT NULL${marketingTeam.sql}${teamFilter('o.seller_id', team)} AND o.created_at>=? AND o.created_at<? AND o.status_code<>7`;
  const optionBinds = [...posIds, ...marketingTeam.binds, startUtc, endUtc];
  // Ba lượt đọc có giới hạn kỳ: tổng, marketer, team. Mỗi lượt tính đủ bốn mốc.
  const rankNet = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const rankSums = RANK_STAGES.flatMap((key) => {
    const condition = stageSql(key, 'o', PACKED_SQL);
    const count = (extra = '1') => `COALESCE(SUM(CASE WHEN (${condition}) AND (${extra}) THEN 1 ELSE 0 END),0)`;
    const sum = (value: string, extra = '1') => `COALESCE(SUM(CASE WHEN (${condition}) AND (${extra}) THEN ${value} ELSE 0 END),0)`;
    const refund = 'o.status_code IN (4,5,15,6)';
    const fields = {
      orders: count(), phones: `COUNT(DISTINCT CASE WHEN ${condition} THEN NULLIF(TRIM(o.phone),'') END)`,
      gross: sum('COALESCE(o.current_total,0)'), net: sum(rankNet), refund_net: sum(rankNet, refund),
      sale_orders: count(`o.seller_id IN ${saleSellers}`), sale_net: sum(rankNet, `o.seller_id IN ${saleSellers}`),
      sale_refund_net: sum(rankNet, `o.seller_id IN ${saleSellers} AND ${refund}`),
      cskh_orders: count(`o.seller_id IN ${cskhSellers}`), cskh_net: sum(rankNet, `o.seller_id IN ${cskhSellers}`),
      cskh_refund_net: sum(rankNet, `o.seller_id IN ${cskhSellers} AND ${refund}`),
    };
    return Object.entries(fields).map(([field, expression]) => `${expression} AS ${key}_${field}`);
  }).concat([
    // Đơn chốt / đơn đi / kết cục (anh Vũ 12/11/2026): "đã chốt là chốt" — đơn chốt = mọi đơn đã xác nhận lần đầu (kể cả sau đó hủy / hoàn, trừ xoá),
    // đơn đi = trong đó đã vào Đang đóng hàng trở đi (PACKED_SQL, gồm hủy sau đóng hàng). Hủy khi chưa giao ĐVVC → hủy; hoàn / hủy sau khi đã giao → hoàn.
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} THEN 1 ELSE 0 END),0) AS xp_confirmed`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND ${PACKED_SQL('o')} THEN 1 ELSE 0 END),0) AS xp_packed`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND ${AFTER_PACK_CANCELLED_SQL('o')} THEN 1 ELSE 0 END),0) AS xp_cancelled`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND ${PACKED_SQL('o')} AND ${AFTER_PACK_RETURNED_SQL('o')} THEN 1 ELSE 0 END),0) AS xp_returned`,
    // Tách New (người bán Sale) / CSKH (anh Vũ 14/11/2026, ý sếp: số đơn không gộp). Các tỉ lệ ở bảng xếp hạng chỉ tính đơn New.
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} THEN 1 ELSE 0 END),0) AS xp_confirmed_new`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${cskhSellers} THEN 1 ELSE 0 END),0) AS xp_confirmed_cskh`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} AND ${PACKED_SQL('o')} THEN 1 ELSE 0 END),0) AS xp_packed_new`,
    // Tỉ lệ hủy MKT (anh Vũ 24/11/2026: "hủy trên tổng cả chốt cả hủy"): mọi đơn New đã chốt rồi hủy mà chưa từng giao ĐVVC ÷ Đơn New.
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} AND ${NEVER_SENT_CANCELLED_SQL('o')} THEN 1 ELSE 0 END),0) AS xp_cancelled_new`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} AND ${PACKED_SQL('o')} AND ${AFTER_PACK_RETURNED_SQL('o')} THEN 1 ELSE 0 END),0) AS xp_returned_new`,
    // Tiền đơn hủy / hoàn New (anh Vũ 25/11/2026: ô Tỉ lệ hủy / hoàn hiện tiền ở trên, % ở dưới). Cùng điều kiện với hai số đơn ngay trên.
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} AND ${NEVER_SENT_CANCELLED_SQL('o')} THEN ${rankNet} ELSE 0 END),0) AS xp_cancelled_net_new`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} AND ${PACKED_SQL('o')} AND ${AFTER_PACK_RETURNED_SQL('o')} THEN ${rankNet} ELSE 0 END),0) AS xp_returned_net_new`,
    // DT chuyển (anh Vũ 19/11/2026: "đóng hàng trở đi là doanh thu chuyển"): tiền các đơn của cột Đơn đi (New); dòng nhỏ trừ đơn đang hoàn / đã hoàn / hủy.
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} AND ${PACKED_SQL('o')} THEN ${rankNet} ELSE 0 END),0) AS xp_ship_net_new`,
    `COALESCE(SUM(CASE WHEN ${EVER_CONFIRMED} AND o.seller_id IN ${saleSellers} AND ${PACKED_SQL('o')} AND o.status_code IN (4,5,15,6) THEN ${rankNet} ELSE 0 END),0) AS xp_ship_refund_new`,
  ]).join(',');
  const rankFrom = basis === 'confirmed'
    ? src.from('o', 'idx_raw_orders_pos_confirmed_status_money')
    : src.from('o', 'idx_raw_orders_pos_created_status_phone');
  const rankWhere = `${scoped} AND ${period}`;
  const [selected, cohort, selectedMarketers, cohortMarketers, selectedTeams, cohortTeams, products, productOptions, peopleOptions, sourceOptions, recentOrders, names, ...rankResults] = await env.DB.batch([
    env.DB.prepare(`SELECT ${sums} FROM ${src.orders} o WHERE ${selectedWhere}`).bind(...selectedBinds),
    env.DB.prepare(`SELECT ${sums} FROM ${src.orders} o WHERE ${cohortWhere}`).bind(...cohortBinds),
    env.DB.prepare(`SELECT ${marketer} AS marketer_id,${sums} FROM ${src.orders} o WHERE ${selectedWhere} GROUP BY 1`).bind(...selectedBinds),
    env.DB.prepare(`SELECT ${marketer} AS marketer_id,${sums} FROM ${src.orders} o WHERE ${cohortWhere} GROUP BY 1`).bind(...cohortBinds),
    env.DB.prepare(`SELECT ${teamGroup.sql} AS marketing_team_id,${sums} FROM ${src.orders} o WHERE ${selectedWhere} GROUP BY 1`).bind(...teamGroup.binds, ...selectedBinds),
    env.DB.prepare(`SELECT ${teamGroup.sql} AS marketing_team_id,${sums} FROM ${src.orders} o WHERE ${cohortWhere} GROUP BY 1`).bind(...teamGroup.binds, ...cohortBinds),
    env.DB.prepare(`SELECT ${itemKey('i')} AS product_key,MAX(i.name) AS product_name,COUNT(DISTINCT o.id) AS orders,COUNT(DISTINCT NULLIF(TRIM(o.phone),'')) AS phones,COALESCE(SUM(COALESCE(i.quantity,0)),0) AS quantity,COALESCE(SUM(COALESCE(i.line_total,0)),0) AS line_total
      FROM ${src.orders} o JOIN ${src.items} i ON i.order_id=o.id
      WHERE ${selectedWhere} AND ${saleItemPredicate('i')}${productKey ? ` AND ${itemKey('i')}=?` : ''}
      GROUP BY 1 ORDER BY line_total DESC,quantity DESC`).bind(...selectedBinds, ...(productKey ? [productKey] : [])),
    env.DB.prepare(`SELECT ${itemKey('i')} AS product_key,MAX(i.name) AS product_name,COUNT(DISTINCT o.id) AS orders
      FROM ${src.orders} o JOIN ${src.items} i ON i.order_id=o.id
      WHERE ${optionScope} AND ${saleItemPredicate('i')}
      GROUP BY 1 ORDER BY orders DESC,product_name`).bind(...optionBinds),
    env.DB.prepare(`SELECT ${marketer} AS marketer_id,o.seller_id,o.care_id FROM ${src.orders} o WHERE ${optionScope} GROUP BY 1,2,3`).bind(...optionBinds),
    env.DB.prepare(`SELECT ${SOURCE_FIELD} AS source FROM ${src.orders} o WHERE ${optionScope} AND ${SOURCE_FIELD} IS NOT NULL GROUP BY 1`).bind(...optionBinds),
    env.DB.prepare(`SELECT o.id,o.source_order_id,o.pos_id,o.phone,o.created_at,o.first_confirmed_at,o.status_code,o.marketer_id,o.seller_id,o.care_id,
      ${NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1')} AS net,${SOURCE_FIELD} AS source,o.note
      FROM ${src.orders} o WHERE ${selectedWhere} ORDER BY ${timeCol} DESC,o.id DESC LIMIT 60`).bind(...selectedBinds),
    env.DB.prepare(namesSql),
    env.DB.prepare(`SELECT ${rankSums} FROM ${rankFrom} WHERE ${rankWhere}`).bind(...selectedBinds),
    env.DB.prepare(`SELECT ${marketer} AS marketer_id,${rankSums} FROM ${rankFrom} WHERE ${rankWhere} GROUP BY 1`).bind(...selectedBinds),
    env.DB.prepare(`SELECT ${teamGroup.sql} AS marketing_team_id,${rankSums} FROM ${rankFrom} WHERE ${rankWhere} GROUP BY 1`).bind(...teamGroup.binds, ...selectedBinds),
  ]);

  type RankAggregate = Record<string, string | number | null>;
  const rankMaps = [
    new Map((rankResults[1].results as RankAggregate[]).map((r) => [String(r.marketer_id), r])),
    new Map((rankResults[2].results as RankAggregate[]).map((r) => [String(r.marketing_team_id), r])),
  ];
  const rankFields = (row?: RankAggregate) => {
    const stageMetrics = Object.fromEntries(RANK_STAGES.map((key) => {
      const r = aggregate(Object.fromEntries(Object.entries(row ?? {}).filter(([field]) => field.startsWith(`${key}_`)).map(([field, value]) => [field.slice(key.length + 1), num(value)])));
      return [key, { ...r, averageOrder: r.orders ? r.net / r.orders : null, revenuePerPhone: r.phones ? r.net / r.phones : null, netAfterRefund: r.net - r.refundNet }];
    })) as Record<RankStage, ReturnType<typeof aggregate> & { averageOrder: number | null; revenuePerPhone: number | null; netAfterRefund: number }>;
    return {
      stageMetrics, atConfirmed: stageMetrics.confirmed.orders, atPacked: stageMetrics.packed.orders, atShipped: stageMetrics.shipped.orders, atDelivered: stageMetrics.delivered.orders,
      everConfirmed: num(row?.xp_confirmed), everPacked: num(row?.xp_packed),
      packedCancelled: num(row?.xp_cancelled), packedReturned: num(row?.xp_returned),
      newConfirmed: num(row?.xp_confirmed_new), cskhConfirmed: num(row?.xp_confirmed_cskh), newPacked: num(row?.xp_packed_new),
      newCancelled: num(row?.xp_cancelled_new), newReturned: num(row?.xp_returned_new),
      newCancelledNet: num(row?.xp_cancelled_net_new), newReturnedNet: num(row?.xp_returned_net_new),
      shipNet: num(row?.xp_ship_net_new), shipAfterRefund: num(row?.xp_ship_net_new) - num(row?.xp_ship_refund_new),
    };
  };

  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [String(r.user_id), r.name]));
  const selectedMap = new Map((selectedMarketers.results as MarketerRow[]).map((r) => [String(r.marketer_id), aggregate(r)]));
  const cohortMap = new Map((cohortMarketers.results as MarketerRow[]).map((r) => [String(r.marketer_id), aggregate(r)]));
  const selectedTeamMap = new Map((selectedTeams.results as MarketingTeamRow[]).map((r) => [String(r.marketing_team_id), aggregate(r)]));
  const cohortTeamMap = new Map((cohortTeams.results as MarketingTeamRow[]).map((r) => [String(r.marketing_team_id), aggregate(r)]));
  const people = peopleOptions.results as { marketer_id: string | null; seller_id: string | null; care_id: string | null }[];
  const ids = [...new Set([...selectedMap.keys(), ...cohortMap.keys(), ...rankMaps[0].keys()])];
  const personOptions = (field: 'marketer_id' | 'seller_id' | 'care_id') => [...new Set(people.map((r) => r[field]).filter((id): id is string => !!id))]
    .map((id) => ({ id, name: nameMap.get(id) ?? `NV ${id.slice(0, 8)}` })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const sources = sourceOptions.results as { source: string | null }[];
  const byMarketer = ids.map((id) => {
    const current = selectedMap.get(id) ?? aggregate();
    const base = cohortMap.get(id) ?? aggregate();
    return {
      ...rankFields(rankMaps[0].get(id)),
      marketerId: id, marketerName: nameMap.get(id) ?? `MKT ${id.slice(0, 8)}`, marketingTeamName: teamByMember.get(id) ?? 'Chưa phân nhóm',
      ...current, createdOrders: base.orders, createdPhones: base.phones, createdNewPhones: base.newPhones, createdNewClosedPhones: base.newClosedPhones, confirmedOrders: base.confirmed,
      confirmationRate: base.orders ? base.confirmed / base.orders * 100 : null,
      shippedOrders: base.shipped, shippingRate: base.confirmed ? base.shipped / base.confirmed * 100 : null,
      deliveredOrders: base.delivered, deliveryRate: base.shipped ? base.delivered / base.shipped * 100 : null,
      returnedOrders: base.returned, cancelledOrders: base.cancelled,
      averageOrder: current.orders ? current.net / current.orders : null,
      revenuePerPhone: current.phones ? current.net / current.phones : null,
      // Doanh thu sau hoàn hủy = doanh thu theo mốc − tiền các đơn trong đó đang hoàn / đã hoàn / đã hủy.
      netAfterRefund: current.net - current.refundNet,
    };
  });
  const teamIds = marketingTeamId === '__all'
    ? [...new Set([...marketingTeams.map((t) => t.id), ...selectedTeamMap.keys(), ...cohortTeamMap.keys(), ...rankMaps[1].keys()])]
    : [marketingTeamId];
  const byTeam = teamIds.map((id) => {
    const current = selectedTeamMap.get(id) ?? aggregate();
    const base = cohortTeamMap.get(id) ?? aggregate();
    const configured = marketingTeams.find((t) => t.id === id);
    return {
      ...rankFields(rankMaps[1].get(id)),
      marketingTeamId: id, marketingTeamName: configured?.name ?? (id === UNASSIGNED_TEAM ? 'Chưa phân nhóm' : id),
      marketerCount: byMarketer.filter((m) => id === UNASSIGNED_TEAM ? !teamByMember.has(m.marketerId) : configured?.memberIds.includes(m.marketerId)).length,
      ...current, createdOrders: base.orders, createdPhones: base.phones, createdNewPhones: base.newPhones, createdNewClosedPhones: base.newClosedPhones, confirmedOrders: base.confirmed,
      confirmationRate: base.orders ? base.confirmed / base.orders * 100 : null,
      shippedOrders: base.shipped, shippingRate: base.confirmed ? base.shipped / base.confirmed * 100 : null,
      deliveredOrders: base.delivered, deliveryRate: base.shipped ? base.delivered / base.shipped * 100 : null,
      returnedOrders: base.returned, cancelledOrders: base.cancelled,
      averageOrder: current.orders ? current.net / current.orders : null,
      revenuePerPhone: current.phones ? current.net / current.phones : null,
      // Doanh thu sau hoàn hủy = doanh thu theo mốc − tiền các đơn trong đó đang hoàn / đã hoàn / đã hủy.
      netAfterRefund: current.net - current.refundNet,
      selectedRate: base.orders ? current.orders / base.orders * 100 : null,
    };
  });

  const current = aggregate(selected.results[0] as AggregateRow | undefined);
  const base = aggregate(cohort.results[0] as AggregateRow | undefined);
  return {
    period: { start, end }, basis, stage,
    filters: { marketerId, sellerId, careId, productKey, source, marketingTeamId },
    summary: {
      ...current, createdOrders: base.orders, createdPhones: base.phones, createdNewPhones: base.newPhones, createdNewClosedPhones: base.newClosedPhones, confirmedOrders: base.confirmed,
      confirmationRate: base.orders ? base.confirmed / base.orders * 100 : null,
      shippedOrders: base.shipped, shippingRate: base.confirmed ? base.shipped / base.confirmed * 100 : null,
      deliveredOrders: base.delivered, deliveryRate: base.shipped ? base.delivered / base.shipped * 100 : null,
      returnedOrders: base.returned, cancelledOrders: base.cancelled,
      averageOrder: current.orders ? current.net / current.orders : null,
      revenuePerPhone: current.phones ? current.net / current.phones : null,
      // Doanh thu sau hoàn hủy = doanh thu theo mốc − tiền các đơn trong đó đang hoàn / đã hoàn / đã hủy.
      netAfterRefund: current.net - current.refundNet,
      selectedRate: base.orders ? current.orders / base.orders * 100 : null,
    },
    byMarketer, byTeam, stageSummary: rankFields(rankResults[0].results[0] as RankAggregate).stageMetrics,
    afterPackSummary: (({ everConfirmed, everPacked, packedCancelled, packedReturned, newConfirmed, cskhConfirmed, newPacked, newCancelled, newReturned, newCancelledNet, newReturnedNet, shipNet, shipAfterRefund }) => ({ everConfirmed, everPacked, packedCancelled, packedReturned, newConfirmed, cskhConfirmed, newPacked, newCancelled, newReturned, newCancelledNet, newReturnedNet, shipNet, shipAfterRefund }))(rankFields(rankResults[0].results[0] as RankAggregate)),
    byProduct: (products.results as ProductRow[]).map((r) => ({ productKey: r.product_key, productName: r.product_name, orders: num(r.orders), phones: num(r.phones), quantity: num(r.quantity), lineTotal: num(r.line_total) })),
    recentOrders: (recentOrders.results as RecentOrder[]).map((r) => ({
      id: r.id, orderId: r.source_order_id, posId: r.pos_id, posName: POS.find((x) => x.id === r.pos_id)?.name ?? r.pos_id,
      phone: phoneOut(r.phone), createdAt: r.created_at, confirmedAt: r.first_confirmed_at,
      status: ORDER_STATUS[Number(r.status_code)] ?? String(r.status_code),
      marketer: r.marketer_id ? nameMap.get(r.marketer_id) ?? `MKT ${r.marketer_id.slice(0, 8)}` : null,
      seller: r.seller_id ? nameMap.get(r.seller_id) ?? `NV ${r.seller_id.slice(0, 8)}` : null,
      care: r.care_id ? nameMap.get(r.care_id) ?? `NV ${r.care_id.slice(0, 8)}` : null,
      net: num(r.net), source: r.source, note: r.note,
    })),
    marketerOptions: personOptions('marketer_id'), sellerOptions: personOptions('seller_id'), careOptions: personOptions('care_id'),
    sourceOptions: [...new Set(sources.map((r) => r.source).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'vi')),
    productOptions: (productOptions.results as ProductRow[]).map((r) => ({ key: r.product_key, name: r.product_name, orders: num(r.orders) })),
    definitions: {
      scope: 'Chỉ tính đơn Pancake có trường Marketer. Không suy ra khách chưa tạo đơn và không dùng số chi phí quảng cáo bên ngoài Pancake.',
      cohort: 'Phễu và tỷ lệ dùng các đơn do marketer mang về, tạo trong kỳ đang chọn. SĐT là số duy nhất có trên các đơn này.',
      selected: basis === 'confirmed' ? 'Chỉ số chính xếp theo ngày xác nhận lần đầu và trạng thái/mốc đang chọn.' : 'Chỉ số chính xếp theo ngày tạo đơn và trạng thái/mốc đang chọn.',
      products: 'Sản phẩm lấy từ dòng hàng bán trên Pancake, loại dòng được đánh dấu quà tặng hoặc có tên bắt đầu bằng Quà Tặng. Một đơn có nhiều sản phẩm được tính vào từng dòng liên quan; hàng tổng đơn dùng số đơn duy nhất.',
      split: 'DT chốt (trước gọi DT New) = tiền mọi đơn do nhân viên Sale chốt (khách mới từ quảng cáo), kể cả đơn hủy / hoàn sau đó; DT chuyển = tiền các đơn ở cột Đơn đi (đã đóng hàng trở đi), kể cả hủy / hoàn sau đó, luôn không quá DT chốt; tỉ lệ hủy, hoàn chia cho Đơn New; dòng nhỏ đã trừ hoàn hủy; DT CSKH = đơn do nhân viên CSKH đứng tên bán (khách cũ mua lại trên data Marketing). Doanh thu = DT chốt + DT CSKH + đơn của người bán chưa có hậu tố SALE / CSKH. Dòng nhỏ: sau hoàn hủy.',
      attribution: 'Sale và CSKH lấy từ người bán và người chăm sóc gắn trên đơn. Nguồn đơn lấy từ trường order_sources của Pancake. Page, bài viết và mã quảng cáo chưa có trường chuẩn đủ để lập bộ lọc toàn bộ lịch sử. Bảng đơn chỉ hiện ghi chú của đơn; ghi chú khách chi tiết xem tại Cuộc gọi CSKH.',
    },
  };
}
