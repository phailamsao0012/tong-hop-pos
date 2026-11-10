import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, todayVn } from '@/lib/shared/report-time';
import { shiftReport } from '@/lib/reports/shift-report';

// Điều hành trong ca (lib/reports/shift-report.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const today = todayVn();
  const date = p.get('date') || today;
  if (!DATE_RE.test(date) || date > today) return Response.json({ error: 'Ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  return Response.json(await shiftReport(user, p, posIds, today, date), { headers: { 'Cache-Control': 'private, no-store' } });
}
