import { getSessionUser, unauthorized } from '@/lib/auth';
import { overviewReport } from '@/lib/overview-report';
import { POS } from '@/lib/report-model';
import { DATE_RE } from '@/lib/report-time';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized('Đăng nhập để xem báo cáo.');
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
  const report = await overviewReport({ posIds: requested, start, end, groupBy, employeeIds, compare });
  return Response.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
}
