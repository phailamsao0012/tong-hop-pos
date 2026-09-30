import { getSessionUser, unauthorized } from '@/lib/auth';
import { cskhAnalytics } from '@/lib/cskh-analytics';
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
  if (p.get('team') === 'sale') return Response.json({ error: 'Tài khoản chỉ xem bộ phận Sale.' }, { status: 403 });
  const staffIds = (p.get('staffIds') ?? '').split(',').filter(Boolean).slice(0, 50);
  const report = await cskhAnalytics({ posIds: requested.length ? requested : [...valid], start, end, staffIds });
  return Response.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
}
