import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';
import { parseGroupOptions } from '@/lib/reports/product-groups';
import type { LineDim } from '@/lib/reports/shipping-lines';
import { shippingLinesReport } from '@/lib/reports/shipping-lines-report';

// Vận đơn theo dòng sản phẩm và team MKT (lib/reports/shipping-lines-report.ts).
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
  const parsed = parseGroupOptions(new URLSearchParams({ dim: p.get('dim') ?? 'tag', basis: p.get('groupBasis') ?? 'both' }));
  const dim: LineDim = (p.get('dim') ?? 'line') === 'line' ? 'line' : parsed.dim;
  const groupBasis = parsed.basis;
  return Response.json(await shippingLinesReport(posIds, start, end, basis, team, dim, groupBasis));
}
