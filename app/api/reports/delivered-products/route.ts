import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { closedDelivered, deliveredProducts } from '@/lib/reports/delivered-products';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE, daysBetween } from '@/lib/shared/report-time';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  if (daysBetween(start, end) > 93) return Response.json({ error: 'Chọn tối đa 3 tháng.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const run = p.get('basis') === 'closed' ? closedDelivered : deliveredProducts;
  const report = await run({ posIds: requested.length ? requested : [...valid], start, end });
  return Response.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
}
