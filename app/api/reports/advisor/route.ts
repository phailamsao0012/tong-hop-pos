import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { canView, scopeApi } from '@/lib/access';
import { advisorReport } from '@/lib/advisor';
import { POS } from '@/lib/report-model';
import { DATE_RE, todayVn } from '@/lib/report-time';
import { parseTeam } from '@/lib/team';
import { resolveBranchUnit, resolveMktLens, lensDatabase } from '@/lib/scope-filter';
import { TREND_DEPTS } from '@/lib/trend-period';
const VIEWS = { sale: 'sale-overview', cskh: 'cskh-overview', mkt: 'marketing', vandon: 'van-don' } as const;
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return forbidden(scoped.blocked);
  const p = scoped.url.searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  const valid = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end) || start > end || start > todayVn() || (Date.parse(end) - Date.parse(start)) / 86400000 >= 120) return Response.json({ error: 'Chọn kỳ hợp lệ, tối đa 120 ngày.' }, { status: 400 });
  const posIds = [...new Set((p.get('posIds') || POS.map((x) => x.id).join(',')).split(',').filter(Boolean))];
  if (!posIds.length || posIds.some((id) => !POS.some((x) => x.id === id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const unit = await resolveBranchUnit(p, parseTeam(p.get('team')));
  if (unit instanceof Response) return unit;
  const lens = await resolveMktLens(env.DB, p);
  if (lens instanceof Response) return lens;
  const requested = (p.get('depts') ?? '').split(',');
  const depts = TREND_DEPTS.filter((d) => requested.includes(d) && (canView(user, 'overview') || canView(user, VIEWS[d])) && (unit.team === 'all' || d === unit.team || d === 'mkt' || d === 'vandon'));
  if (!depts.length) return forbidden('Không được xem bộ phận này.');
  // Các nhánh chỉ đọc thống kê nội bộ, không gọi dịch vụ ngoài.
  const result = await advisorReport(lensDatabase(env.DB, lens), { start, end, posIds, team: unit.team, unit: unit.unit, branch: p.get('branch') ?? undefined, mktTeam: lens?.id, preset: p.get('preset') ?? undefined }, depts);
  return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}
