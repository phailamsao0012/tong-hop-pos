import { resolveMktLens } from '@/lib/shared/scope-filter';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { marketingOverview } from '@/lib/reports/marketing-overview';

// Tổng quan MKT (lib/reports/marketing-overview.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  const validPos = new Set<string>(POS.map((x) => x.id));
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const checkedLens = await resolveMktLens(env.DB, p);
  if (checkedLens instanceof Response) return checkedLens;
  const body = await marketingOverview(user, p, posIds, start, end, checkedLens);
  if (!body) return Response.json({ error: 'Team Marketing không còn tồn tại.' }, { status: 400 });
  return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}
