import { lensOrders } from '@/lib/reports/lens-orders';
import { resolveMktLens, lensDatabase } from '@/lib/shared/scope-filter';
import { packedBySeller, packedOrderPage } from '@/lib/reports/sale-packed';
import { parseOrderFilters } from '@/lib/pancake/order-segments';
import { parseTeam } from '@/lib/teams/team';
import { env } from 'cloudflare:workers';
import { forecastTargetAllowed, monthForecast, type MonthForecast } from '@/lib/kpi/forecast';
import { resolveBranchUnit as resolveHrUnit } from '@/lib/shared/scope-filter';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { overviewReport } from '@/lib/reports/overview-report';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, todayVn } from '@/lib/shared/report-time';
import { parseMetricSettings } from '@/lib/reports/metrics';
import { annotateRates } from '@/lib/reports/overview-rates';
import { hideCskhAssigned, overviewBranches, overviewForecastTarget } from '@/lib/reports/overview-api';


export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized('Đăng nhập để xem báo cáo.');
  const params = new URL(request.url).searchParams;
  if (params.get('branches') === '1') {
    return Response.json(await overviewBranches(user.team), { headers: { 'Cache-Control': 'private, no-store' } });
  }
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
  const lens = await resolveMktLens(env.DB, params);
  if (lens instanceof Response) return lens;
  const db = lensDatabase(env.DB, lens);
  const packedOpts = { posIds: requested.length ? requested : POS.map((p) => p.id), start, end,
    scope: { unit, employeeIds, filters: parseOrderFilters(params, team) } };
  if (team === 'sale' && params.get('packed') === '1') {
    const page = Math.min(100000, Math.max(0, Math.floor(Number(params.get('page')) || 0)));
    const rows = await packedOrderPage(db, packedOpts, page);
    return Response.json({ orders: rows.slice(0, 100), more: rows.length > 100 }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const packedStaff = team === 'sale' ? await packedBySeller(db, packedOpts) : undefined;
  const reportOptions = { posIds: requested, start, end, groupBy, employeeIds, compare, team, unit, filters: parseOrderFilters(params, team) };
  const report = lens ? await lensOrders(env.DB, reportOptions, lens) : await overviewReport(reportOptions);
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
      target = await overviewForecastTarget(team, unit, employeeIds, today, user);
    }
    forecast = monthForecast({ actual: report.current.total.closedNet, start, end, today, target });
  }
  return Response.json({ ...report, ...(packedStaff ? { packedStaff } : {}), ...(params.get('forecast') === 'month' ? { forecast } : {}), assignedVisible, hrTeam: unit && !unit.branchOnly ? { id: unit.id, name: unit.name, dept: unit.dept } : null, hrTeamDropped: scope.dropped }, { headers: { 'Cache-Control': 'private, no-store' } });
}
