import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { ORDER_STATUS } from '@/lib/pancake';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { EMPTY_ORDER_FILTERS, orderFilterSql } from '@/lib/order-segments';
import { DRILL_NET, drillOf, isDrillKey } from '@/lib/section-drill';

// Danh sách đơn đứng sau một số ở 4 bảng Tổng quan POS, kèm cách tính và nguồn (lib/section-drill.ts). Cùng bộ lọc kỳ, POS, nhóm đơn.
const SIZE = 50;
type Row = {
  id: string; source_order_id: string | null; pos_id: string; customer_name: string | null; created_at: string | null; first_closed_at: string | null;
  first_confirmed_at: string | null; status_code: number; seller: string | null; marketer: string | null; net: number; hit: number;
};

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const key = p.get('metric');
  if (!isDrillKey(key)) return Response.json({ error: 'Chỉ số không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const page = Math.max(1, Math.min(500, Number(p.get('page') ?? '1') || 1));
  const pp = p.get('productSegment');
  const productSegment = pp === 'gentadox' || pp === 'skgk' ? pp : 'all';
  // Nhóm đơn lọc cả danh sách, trừ mẫu số tỷ lệ chốt (đơn mới chưa có sản phẩm, như /api/reports/sections).
  const d = drillOf(key);
  const seg = orderFilterSql({ ...EMPTY_ORDER_FILTERS, productSegment }, 'all', 'o').sql;
  const cohort = d.dateCol === 'created_at';
  const hit = d.hit ? `${d.hit}${cohort ? seg : ''}` : '1';
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const where = `o.pos_id IN (${ph}) AND o.${d.dateCol}>=? AND o.${d.dateCol}<? AND ${d.where}${cohort ? '' : seg}`;
  const binds = [...posIds, startUtc, endUtc];
  const [sum, rows, shops] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(${DRILL_NET}),0) AS net, SUM(CASE WHEN ${hit} THEN 1 ELSE 0 END) AS hits,
        COALESCE(SUM(CASE WHEN ${hit} THEN ${DRILL_NET} END),0) AS hit_net FROM raw_pos_orders o WHERE ${where}`).bind(...binds),
    env.DB.prepare(`SELECT o.id, o.source_order_id, o.pos_id, o.customer_name, o.created_at, o.first_closed_at, o.first_confirmed_at, o.status_code,
        (SELECT MAX(u.name) FROM pos_users u WHERE u.user_id=o.seller_id) AS seller, (SELECT MAX(u.name) FROM pos_users u WHERE u.user_id=o.marketer_id) AS marketer,
        ${DRILL_NET} AS net, CASE WHEN ${hit} THEN 1 ELSE 0 END AS hit
      FROM raw_pos_orders o WHERE ${where} ORDER BY o.${d.dateCol} DESC LIMIT ${SIZE} OFFSET ?`).bind(...binds, (page - 1) * SIZE),
    env.DB.prepare('SELECT id, shop_id FROM pos_shops'),
  ]);
  const shopOf = new Map((shops.results as { id: string; shop_id: string | null }[]).map((x) => [x.id, x.shop_id]));
  const s = (sum.results[0] ?? {}) as { orders?: number; net?: number; hits?: number; hit_net?: number };
  const orders = Number(s.orders ?? 0);
  return Response.json({
    metric: key, title: d.title, formula: d.formula, source: d.source, view: d.view, dateCol: d.dateCol, hasHit: !!d.hit, hitLabel: d.hitLabel ?? null,
    period: { start, end }, productSegment,
    total: { orders, net: Number(s.net ?? 0), hits: Number(s.hits ?? 0), hitNet: Number(s.hit_net ?? 0) },
    page, pages: Math.max(1, Math.ceil(orders / SIZE)),
    rows: (rows.results as Row[]).map((r) => {
      const code = r.source_order_id ?? r.id.split(':').pop(), shopId = shopOf.get(r.pos_id);
      return {
        id: r.id, code, pancakeUrl: shopId ? `https://pos.pancake.vn/shop/${shopId}/orders?order_id=${code}` : null, posId: r.pos_id, customer: r.customer_name,
        createdAt: r.created_at, closedAt: r.first_closed_at, confirmedAt: r.first_confirmed_at, status: ORDER_STATUS[Number(r.status_code)] ?? String(r.status_code),
        seller: r.seller, marketer: r.marketer, net: Number(r.net), hit: !!r.hit,
      };
    }),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
