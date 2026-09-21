import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { DATE_RE } from '@/lib/report-time';
import { repurchaseReport } from '@/lib/repurchase-report';
import { parseTeam } from '@/lib/team';

export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const tag = (p.get('tag') ?? '').trim().slice(0, 80), sellerId = (p.get('sellerId') ?? '').trim().slice(0, 100);
  return Response.json(await repurchaseReport(requested, start, end, parseTeam(p.get('team')), { tag, sellerId }), { headers: { 'Cache-Control': 'private, no-store' } });
}
