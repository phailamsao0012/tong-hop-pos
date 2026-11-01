import { env } from 'cloudflare:workers';
import { mentorReport } from '@/lib/teams/staff-scope';
import { parseOrderFilters } from '@/lib/pancake/order-segments';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { repurchaseReport } from '@/lib/reports/repurchase-report';
import { parseGroupOptions } from '@/lib/reports/product-groups';
import { parseMetricSettings } from '@/lib/reports/metrics';
import { parseTeam } from '@/lib/teams/team';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const validPos = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !validPos.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const tag = (p.get('tag') ?? '').trim().slice(0, 80), sellerId = (p.get('sellerId') ?? '').trim().slice(0, 100);
  return Response.json(await repurchaseReport(requested, start, end, parseTeam(p.get('team')), { tag, sellerId, filters: parseOrderFilters(p, parseTeam(p.get('team'))), ...parseGroupOptions(p), success: parseMetricSettings(p).success }), { headers: { 'Cache-Control': 'private, no-store' } });
}
