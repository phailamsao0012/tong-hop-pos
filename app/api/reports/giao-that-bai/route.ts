import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { scopeApi } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { DATE_RE, daysBetween, vnRangeUtc } from '@/lib/report-time';
import { parseTeam, teamFilter } from '@/lib/team';
import { resolveHrUnit } from '@/lib/hr-unit';

import { buildFailedDelivery, type FdOrder } from '@/lib/failed-delivery';
import { DELIVERED_CODES, RETURNED_CODES } from '@/lib/shipping-lines';
import { NO_CARRIER } from '@/lib/ship-fields';
import { maskPhone } from '@/lib/bot-guard-core';

const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return Response.json({ error: scoped.blocked }, { status: 403 });
  const p = scoped.url.searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  const validDate = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!validDate(start) || !validDate(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  if (daysBetween(start, end) > 93) return Response.json({ error: 'Chọn tối đa 3 tháng.' }, { status: 400 });
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !POS.some((pos) => pos.id === id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((pos) => pos.id);
  const scope = await resolveHrUnit(p, parseTeam(p.get('team')));
  if (scope instanceof Response) return scope;
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const nowMs = Date.now();
  const ph = posIds.map(() => '?').join(',');
  const tf = teamFilter('o.seller_id', scope.team, false, scope.unit);
  const [openResult, counts, users] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id, o.pos_id AS posId, o.source_order_id AS sourceOrderId, o.status_code AS status, ${NET} AS net,
      o.carrier_name AS carrier, o.province_name AS province, o.partner_status AS partnerStatus, o.first_undeliverable_at AS undeliverableAt,
      o.first_sent_at AS sentAt, o.seller_id AS sellerId, o.care_id AS careId, o.customer_name AS customerName, o.phone
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_undeliverable_at>=? AND o.status_code=2${tf}
      ORDER BY net DESC, o.first_undeliverable_at ASC LIMIT 500`).bind(...posIds, new Date(nowMs - 30 * 86400000).toISOString()),
    env.DB.prepare(`SELECT o.status_code AS status, o.carrier_name AS carrier, COUNT(*) AS n FROM raw_pos_orders o
      WHERE o.pos_id IN (${ph}) AND o.first_undeliverable_at>=? AND o.first_undeliverable_at<?${tf}
      GROUP BY o.status_code, o.carrier_name`).bind(...posIds, startUtc, endUtc),
    env.DB.prepare(`SELECT user_id, MAX(name) AS name FROM pos_users WHERE pos_id IN (${ph}) GROUP BY user_id`).bind(...posIds),
  ]);
  const names = new Map((users.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const open = buildFailedDelivery(openResult.results as FdOrder[], names, nowMs).open;
  const stats = { failed: 0, saved: 0, lost: 0, pending: 0, saveRate: null as number | null };
  const byCarrier = new Map<string, { key: string; failed: number; saved: number; lost: number; saveRate: number | null }>();
  for (const r of counts.results as { status: number; carrier: string | null; n: number }[]) {
    const key = r.carrier?.trim() || NO_CARRIER;
    const group = byCarrier.get(key) ?? { key, failed: 0, saved: 0, lost: 0, saveRate: null };
    const saved = DELIVERED_CODES.includes(r.status) ? r.n : 0;
    const lost = RETURNED_CODES.includes(r.status) ? r.n : 0;
    stats.failed += r.n; stats.saved += saved; stats.lost += lost;
    if (r.status === 2) stats.pending += r.n;
    group.failed += r.n; group.saved += saved; group.lost += lost;
    byCarrier.set(key, group);
  }
  const rate = (saved: number, lost: number) => saved + lost ? saved / (saved + lost) * 100 : null;
  stats.saveRate = rate(stats.saved, stats.lost);
  const fullPhone = user.role === 'owner' || user.role === 'director';
  const phoneOut = (p: string | null) => (p && !fullPhone ? maskPhone(p) : p);
  return Response.json({ open: open.map((o) => ({ ...o, phone: phoneOut(o.phone) })), stats,
    byCarrier: [...byCarrier.values()].map(({ lost, ...c }) => ({ ...c, saveRate: rate(c.saved, lost) })).sort((a, b) => b.failed - a.failed),
    truncated: open.length === 500, period: { start, end }, hrTeam: scope.unit, hrTeamDropped: scope.dropped,
    definitions: {
      'Giao thất bại lần 1': 'Hãng ship báo giao không thành lần đầu, theo Pancake. Thống kê theo ngày thất bại lần đầu trong kỳ đang chọn.',
      'Đang chờ cứu': 'Đơn còn ở Đã gửi hàng, thất bại trong 30 ngày gần nhất, không theo kỳ đang chọn; danh sách tối đa 500 đơn giá trị cao nhất.',
      'Cứu được': 'Đơn từng giao thất bại trong kỳ, sau đó khách nhận.',
      'Mất': 'Đơn từng giao thất bại trong kỳ, sau đó hoàn.',
      'Tỷ lệ cứu được': 'Cứu được ÷ (cứu được + mất) × 100; chưa tính đơn còn chờ kết quả.',
      'Trạng thái hãng': 'Cập nhật theo lần đồng bộ đơn gần nhất; hãng đổi trạng thái mà Pancake không đổi giờ sửa đơn thì có thể trễ.',
    },
  });
}
