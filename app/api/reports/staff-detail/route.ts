import { mentorReport } from '@/lib/teams/staff-scope';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { resolveBranchUnit as resolveHrUnit } from '@/lib/shared/scope-filter';
import { parseTeam } from '@/lib/teams/team';
import { staffDetailReport } from '@/lib/reports/staff-detail-report';

// Chi tiết một nhân viên (lib/reports/staff-detail-report.ts).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  const validDay = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!validDay(start) || !validDay(end) || start > end || (Date.parse(end)-Date.parse(start))/86400000 >= 400)
    return Response.json({error: 'Khoảng ngày không hợp lệ.'}, {status: 400});
  const sellerId = (p.get('sellerId') ?? '').trim().slice(0,100);
  if (!sellerId) return Response.json({error: 'Thiếu mã nhân viên.'}, {status: 400});
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some(id => !POS.some(pos => pos.id === id))) return Response.json({error: 'Bộ lọc POS không hợp lệ.'}, {status: 400});
  const posIds = requested.length ? requested : POS.map(pos => pos.id);
  const scope = await resolveHrUnit(p, parseTeam(p.get('team')));
  if (scope instanceof Response) return scope;
  return Response.json(await staffDetailReport(user, p, posIds, start, end, sellerId, scope), {headers: {'Cache-Control': 'private, no-store'}});
}
