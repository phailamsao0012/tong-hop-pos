import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE, vnRangeUtc } from '@/lib/report-time';
import { parseTeam, teamFilter } from '@/lib/team';
import { MARKETING_TEAMS_KEY, parseMarketingTeams } from '@/lib/marketing-teams';
import { itemNames, parseGroupOptions } from '@/lib/product-groups';
import { NO_TEAM, shippingByLine } from '@/lib/shipping-lines';

// Vận đơn theo dòng sản phẩm và team MKT (08/10/2026). Đơn đã chốt trong kỳ (theo giờ chốt, hoặc ngày tạo) và trạng thái hiện tại:
// đi (đã giao ĐVVC) / hoàn / đã nhận / chưa gửi / hủy. Dòng sản phẩm theo nhãn đơn Pancake (mặc định), nhóm chính, hoặc từng sản phẩm.
const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const basis = p.get('basis') === 'created' ? 'created' : 'confirmed';
  const team = parseTeam(p.get('team'));
  const { dim, basis: groupBasis } = parseGroupOptions(new URLSearchParams({ dim: p.get('dim') ?? 'tag', basis: p.get('groupBasis') ?? 'both' }));
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const timeCol = basis === 'created' ? 'o.created_at' : 'o.first_confirmed_at';
  // Chỉ đơn đã từng chốt (xác nhận); hủy sau khi chốt vẫn đếm vào cột Hủy.
  const [rows, saved, names] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id, o.status_code, ${NET} AS net, o.tags_json, NULLIF(TRIM(o.marketer_id),'') AS marketer_id FROM raw_pos_orders o
      WHERE o.pos_id IN (${ph}) AND ${timeCol}>=? AND ${timeCol}<? AND o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,7)${teamFilter('o.seller_id', team)}`)
      .bind(...posIds, startUtc, endUtc),
    env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY),
    env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const list = rows.results as { id: string; status_code: number; net: number | null; tags_json: string | null; marketer_id: string | null }[];
  const items = dim === 'tag' ? new Map<string, string[]>() : await itemNames(env.DB, list.map((r) => r.id));
  const teams = parseMarketingTeams((saved.results[0] as { value?: string } | undefined)?.value);
  const teamByMember = new Map(teams.flatMap((t) => t.memberIds.map((id) => [id, t.id] as const)));
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const report = shippingByLine(
    list.map((r) => ({ id: r.id, status: Number(r.status_code), net: Number(r.net ?? 0), tagsJson: r.tags_json, marketerId: r.marketer_id, items: items.get(r.id) ?? [] })),
    { dim, basis: groupBasis, teamOf: (id) => (id && teamByMember.get(id)) || NO_TEAM, teamNames },
  );
  const nameMap = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  return Response.json({
    period: { start, end }, basis, dim, groupBasis, ...report,
    teamMembers: Object.fromEntries(teams.map((t) => [t.id, t.memberIds.map((id) => nameMap.get(id) ?? id)])),
    definitions: {
      'Đơn chốt': 'Đơn đã chốt (xác nhận) trong kỳ, theo giờ chốt hoặc ngày tạo đơn; không tính đơn mới, chờ xác nhận, xóa.',
      'Đơn đi': 'Đơn đã giao cho đơn vị vận chuyển: đã gửi hàng, đã nhận, đã thu tiền, đang hoàn, hoàn một phần, đã hoàn.',
      'Đơn hoàn': 'Đang hoàn, hoàn một phần, đã hoàn.',
      'Tỷ lệ hoàn': 'Theo đơn: đơn hoàn ÷ đơn đi. Theo doanh số: doanh số hoàn ÷ doanh số đi.',
      'Doanh số': 'Tiền hàng sau giảm giá / quà tặng, chưa gồm phí vận chuyển.',
      'Dòng sản phẩm': 'Theo nhãn đơn trên Pancake (bỏ nhãn vận hành), hoặc nhóm chính, hoặc từng sản phẩm. Một đơn nhiều dòng tính ở mỗi dòng; dòng Tổng đếm mỗi đơn một lần.',
      'Team MKT': 'Theo người Marketer trên đơn và team Marketing ở Cấu hình. Đơn không có Marketer hoặc Marketer chưa vào team nằm ở nhóm cuối.',
    },
  });
}
