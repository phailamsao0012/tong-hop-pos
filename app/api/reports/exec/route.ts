import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { execReport } from '@/lib/reports/exec-report';

// Màn Điều hành: tiến độ tháng và ba bộ phận (lib/reports/exec-report.ts).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : [...valid];
  return Response.json(await execReport(posIds, p.get('month') ?? ''), { headers: { 'Cache-Control': 'private, no-store' } });
}
