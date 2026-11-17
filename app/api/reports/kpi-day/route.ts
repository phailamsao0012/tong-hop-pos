import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { kpiDayReport } from '@/lib/kpi/kpi-day-report';

// KPI tháng hiện tại theo bộ phận × POS, chia ngày (lib/kpi/kpi-day-report.ts). Thiếu posIds = mọi POS.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  return Response.json(await kpiDayReport(posIds), { headers: { 'Cache-Control': 'private, no-store' } });
}
