import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { scopeApi } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { DATE_RE, daysBetween, vnRangeUtc } from '@/lib/report-time';
import { parseTeam, teamFilter } from '@/lib/team';
import { resolveHrUnit } from '@/lib/hr-unit';
import { itemNames } from '@/lib/product-groups';
import { SENT_CODES, orderLines } from '@/lib/shipping-lines';
import { sentAtReady, shipFieldsReady } from '@/lib/stats';
import { buildReturnBreakdown } from '@/lib/return-breakdown';

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
  const bySent = await sentAtReady(env.DB), ready = await shipFieldsReady(env.DB);
  const time = bySent ? 'o.first_sent_at' : 'o.first_closed_at';
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const rows = await env.DB.prepare(`SELECT o.id, o.status_code, ${NET} AS net, o.carrier_name, o.province_name, o.returned_reason, o.tags_json
    FROM raw_pos_orders o WHERE o.pos_id IN (${posIds.map(() => '?').join(',')}) AND ${time}>=? AND ${time}<? AND o.status_code IN (${SENT_CODES.join(',')})${teamFilter('o.seller_id', scope.team, false, scope.unit)}`)
    .bind(...posIds, startUtc, endUtc).all<{ id: string; status_code: number; net: number; carrier_name: string | null; province_name: string | null; returned_reason: string | null; tags_json: string | null }>();
  const items = await itemNames(env.DB, rows.results.map((r) => r.id));
  const report = buildReturnBreakdown(rows.results.map((r) => {
    const lines = orderLines(items.get(r.id) ?? [], r.tags_json);
    return { status: r.status_code, net: Number(r.net), carrier: r.carrier_name, province: r.province_name, reason: r.returned_reason, line: lines[0], lines };
  }));
  return Response.json({ ...report, period: { start, end }, basis: bySent ? 'sent' : 'closed', ready, hrTeam: scope.unit, hrTeamDropped: scope.dropped,
    definitions: {
      'Đơn chuyển đi': bySent ? 'Đơn giao cho đơn vị vận chuyển lần đầu trong kỳ, theo ngày gửi hàng; xét trạng thái hiện tại.' : 'Đơn đã giao cho đơn vị vận chuyển trong các đơn vào Chờ xác nhận trong kỳ; chưa điền xong giờ gửi đơn cũ.',
      'Đơn hoàn': 'Đơn chuyển đi hiện đang hoàn, hoàn một phần hoặc đã hoàn. Giá trị là tiền hàng sau giảm giá, chưa gồm phí vận chuyển.',
      'Tỷ lệ hoàn': 'Đơn hoàn ÷ đơn chuyển đi × 100; theo giá trị = giá trị hoàn ÷ giá trị chuyển đi × 100. Kỳ mới (vd hôm nay) tỷ lệ còn thấp vì đơn chưa kịp hoàn.',
      'Hãng ship': 'Hãng vận chuyển ghi trên đơn Pancake. Hãng hoàn cao nhất chỉ xét hãng có ít nhất 20 đơn chuyển đi.',
      'Tỉnh': 'Theo địa chỉ nhận trên Pancake; từ 1/7/2025 cả nước còn 34 tỉnh, đơn cũ có thể mang tên tỉnh cũ. Tỉnh dưới 20 đơn được gộp vào Tỉnh khác (ít đơn).',
      'Hãng × tỉnh': 'Tối đa 15 tỉnh nhiều đơn chuyển đi nhất. Ô dưới 20 đơn hiện —.',
      'Lý do hoàn': 'Lý do kho chọn trên Pancake khi hoàn. Một đơn nhiều loại được đếm ở mỗi loại trong bảng Lý do × loại đơn; các bảng khác chỉ đếm một lần.',
    },
  });
}
