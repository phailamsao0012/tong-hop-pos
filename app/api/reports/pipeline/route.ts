import { orderFilterSql, parseOrderFilters } from '@/lib/pancake/order-segments';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';
import { pipelineReport } from '@/lib/reports/pipeline-report';

// Hành trình đơn theo nhân viên (lib/reports/pipeline-report.ts).
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
  const filter = orderFilterSql(parseOrderFilters(p, team), team, 'raw_pos_orders');
  return Response.json(await pipelineReport(posIds, start, end, basis, team, filter), { headers: { 'Cache-Control': 'private, no-store' } });
}
