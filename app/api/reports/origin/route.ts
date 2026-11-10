import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { originReport } from '@/lib/reports/origin-report';

// Nguồn đơn của từng nhân viên CSKH: tự ups / từ MKT (lib/reports/origin-report.ts).
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
  return Response.json(await originReport(user, p, posIds, start, end), { headers: { 'Cache-Control': 'private, no-store' } });
}
