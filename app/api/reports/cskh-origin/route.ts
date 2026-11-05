import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { resolveBranchUnit as resolveHrUnit } from '@/lib/shared/scope-filter';
import { cskhOriginReport } from '@/lib/reports/cskh-origin-report';

// Khách của CSKH bắt nguồn từ đâu (lib/reports/cskh-origin-report.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const unitScope = await resolveHrUnit(p, 'cskh');
  if (unitScope instanceof Response) return unitScope;
  const unit = unitScope.unit;
  return Response.json(await cskhOriginReport(user, p, posIds, start, end, unit), { headers: { 'Cache-Control': 'private, no-store' } });
}
