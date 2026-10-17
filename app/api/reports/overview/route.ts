import { packedBySeller, packedOrderPage } from '@/lib/sale-packed';
import { parseOrderFilters } from '@/lib/order-segments';
import { parseTeam, teamFilter, teamSubquery } from '@/lib/team';
import { env } from 'cloudflare:workers';
import { isOwner } from '@/lib/access';
import { listTargets } from '@/lib/targets';
import { forecastTargetAllowed, monthForecast, type MonthForecast } from '@/lib/forecast';
import { resolveHrUnit } from '@/lib/hr-unit';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { overviewReport } from '@/lib/overview-report';
import { POS } from '@/lib/report-model';
import { DATE_RE, todayVn } from '@/lib/report-time';
import { parseMetricSettings } from '@/lib/metrics';
import { annotateRates } from '@/lib/overview-rates';

const isCskh = (d: string | null | undefined) => /cskh|chăm sóc/i.test(d ?? '');
type Maskable = { assignedOrders: number; assignedCloseRate: number | null; assignedHidden: boolean };
const mask = (r: Maskable) => { r.assignedOrders = 0; r.assignedCloseRate = null; r.assignedHidden = true; };
export function hideCskhAssigned(report: Awaited<ReturnType<typeof overviewReport>>, team: ReturnType<typeof parseTeam>) {
  for (const part of [report.current, report.compare]) {
    if (!part) continue;
    for (const r of part.byEmployee) if (isCskh(r.department)) mask(r);
    for (const r of part.byEmployeePos) if (isCskh(r.department)) mask(r);
    if (team === 'cskh') { report.origins.forEach(mask); mask(part.total); part.byPos.forEach(mask); part.series.forEach(mask); for (const d of part.byEmployeeDay) d.assignedOrders = 0; }
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để xem báo cáo.');
  const params = new URL(request.url).searchParams;
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end)
    return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((p) => p.id));
  const requested = (params.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id)))
    return Response.json({ error: 'Bộ lọc POS không hợp lệ.' }, { status: 400 });
  const employeeIds = (params.get('employeeIds') ?? '').split(',').filter(Boolean).slice(0, 50);
  const groupBy = (['day', 'week', 'month'] as const).find((g) => g === params.get('groupBy')) ?? 'day';
  const compareParam = params.get('compare') ?? 'none';
  let compare: 'none' | 'previous' | 'year' | { start: string; end: string } = 'none';
  if (compareParam === 'previous' || compareParam === 'year') compare = compareParam;
  else if (compareParam === 'custom') {
    const cs = params.get('cstart') ?? '', ce = params.get('cend') ?? '';
    if (!DATE_RE.test(cs) || !DATE_RE.test(ce) || cs > ce)
      return Response.json({ error: 'Kỳ so sánh không hợp lệ.' }, { status: 400 });
    compare = { start: cs, end: ce };
  }
  // ?hrTeam=<mã team web nhân sự>: team đó thuộc bộ phận nào thì báo cáo đi theo bộ phận đó (che đơn chia CSKH, lọc nguồn đơn CSKH…).
  const scope = await resolveHrUnit(params, parseTeam(params.get('team')));
  if (scope instanceof Response) return scope;
  const { team, unit } = scope;
  const packedOpts = { posIds: requested.length ? requested : POS.map((p) => p.id), start, end,
    scope: { unit, employeeIds, filters: parseOrderFilters(params, team) } };
  if (team === 'sale' && params.get('packed') === '1') {
    const page = Math.min(100000, Math.max(0, Math.floor(Number(params.get('page')) || 0)));
    const rows = await packedOrderPage(env.DB, packedOpts, page);
    return Response.json({ orders: rows.slice(0, 100), more: rows.length > 100 }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const packedStaff = team === 'sale' ? await packedBySeller(env.DB, packedOpts) : undefined;
  const report = await overviewReport({ posIds: requested, start, end, groupBy, employeeIds, compare, team, unit, filters: parseOrderFilters(params, team) });
  // Đơn chia của CSKH chỉ chủ hệ thống và giám đốc được xem (yêu cầu 19/09/2026): các tài khoản khác không nhận số này từ máy chủ.
  const assignedVisible = user.role === 'owner' || user.role === 'director';
  if (!assignedVisible) hideCskhAssigned(report, team);
  // App iOS/Android đọc thẳng rate / returnRatio / cancelRatio theo tham số rateBase, returnBase trên URL.
  annotateRates(report, parseMetricSettings(params));
  let forecast: MonthForecast | null = null;
  const today = todayVn();
  if (params.get('forecast') === 'month' && team !== 'all'
    && start === today.slice(0, 7) + '-01' && end === today) {
    let target: number | null = null;
    // KPI CSKH và team vẫn chỉ chủ hệ thống được xem. Không chia KPI đầu người theo POS bằng ước lượng.
    const allPos = requested.length === 0 || POS.every((p) => requested.includes(p.id));
    if (allPos && forecastTargetAllowed(user.role)) {
      const targets = await listTargets(today.slice(0, 7));
      const members = await env.DB.prepare(`SELECT DISTINCT user_id FROM pos_users WHERE 1=1${teamFilter('user_id', team, true, unit)}`).all<{ user_id: string }>();
      const hidden = isOwner(user) ? new Set<string>() : new Set((await env.DB.prepare(`SELECT user_id FROM ${teamSubquery('cskh', false)} AS t`).all<{ user_id: string }>()).results.map((m) => m.user_id));
      const ids = new Set(members.results.map((r) => r.user_id).filter((id) => !hidden.has(id) && (!employeeIds.length || employeeIds.includes(id))));
      const teamGoal = unit && !employeeIds.length ? targets.find((t) => t.scope === 'team' && t.refId === unit.id)?.revenue : null;
      const employeeGoal = targets.filter((t) => t.scope === 'employee' && ids.has(t.refId)).reduce((sum, t) => sum + t.revenue, 0);
      target = teamGoal || employeeGoal || null;
    }
    forecast = monthForecast({ actual: report.current.total.closedNet, start, end, today, target });
  }
  return Response.json({ ...report, ...(packedStaff ? { packedStaff } : {}), ...(params.get('forecast') === 'month' ? { forecast } : {}), assignedVisible, hrTeam: unit ? { id: unit.id, name: unit.name, dept: unit.dept } : null, hrTeamDropped: scope.dropped }, { headers: { 'Cache-Control': 'private, no-store' } });
}
