import { getSessionUser, unauthorized } from '@/lib/auth';
import { mktAnalytics } from '@/lib/mkt-analytics';
import { POS } from '@/lib/report-model';
import { DATE_RE } from '@/lib/report-time';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const text = (k: string, max: number) => { const v = p.get(k); return v === null ? null : v.trim().slice(0, max); };
  const marketerId = text('marketerId', 120) || null, teamId = text('teamId', 120) || null, product = text('product', 200);
  return Response.json(await mktAnalytics({ posIds: requested.length ? requested : [...valid], start, end, marketerId, teamId, product }), { headers: { 'Cache-Control': 'private, no-store' } });
}
