import { parseOrderFilters } from '@/lib/order-segments';
import { parseTeam } from '@/lib/team';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { overviewReport } from '@/lib/overview-report';
import { POS } from '@/lib/report-model';
import { DATE_RE } from '@/lib/report-time';

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
  const team = parseTeam(params.get('team'));
  const report = await overviewReport({ posIds: requested, start, end, groupBy, employeeIds, compare, team, filters: parseOrderFilters(params, team) });
  // Đơn chia của CSKH chỉ chủ hệ thống và giám đốc được xem (yêu cầu 19/09/2026): các tài khoản khác không nhận số này từ máy chủ.
  const assignedVisible = user.role === 'owner' || user.role === 'director';
  if (!assignedVisible) hideCskhAssigned(report, team);
  return Response.json({ ...report, assignedVisible }, { headers: { 'Cache-Control': 'private, no-store' } });
}
