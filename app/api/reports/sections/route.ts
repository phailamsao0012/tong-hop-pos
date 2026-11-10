import { resolveMktLens } from '@/lib/shared/scope-filter';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { sectionsReport } from '@/lib/reports/sections-report';

// Tổng quan 4 mục (Sale / CSKH / MKT / Vận đơn), xem lib/reports/sections-report.ts.
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const lens = await resolveMktLens(env.DB, p);
  if (lens instanceof Response) return lens;
  return Response.json(await sectionsReport(p, posIds, start, end, lens), { headers: { 'Cache-Control': 'private, no-store' } });
}
