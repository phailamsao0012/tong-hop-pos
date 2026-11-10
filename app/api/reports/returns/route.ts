import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { canView, scopeApi } from '@/lib/auth/access';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';
import { returnsReport } from '@/lib/reports/returns-report';
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user,'returns')) return Response.json({ error: 'Không có quyền xem lý do hoàn.' },{status:403});
  const scoped = scopeApi(user,'GET',new URL(request.url));
  if (scoped.blocked) return Response.json({error:scoped.blocked},{status:403});
  const p = scoped.url.searchParams, start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (![start,end].every(d => DATE_RE.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d) || start>end) return Response.json({error:'Khoảng ngày không hợp lệ.'},{status:400});
  const requested = [...new Set((p.get('posIds') ?? '').split(',').filter(Boolean))];
  if (requested.some(id => !POS.some(pos => pos.id===id))) return Response.json({error:'POS không hợp lệ.'},{status:400});
  const posIds = requested.length ? requested : POS.map(p => p.id), team = parseTeam(p.get('team'));
  const key = JSON.stringify([user.role,user.views,user.posIds,user.team,posIds.sort(),team,start,end]);
  return Response.json(await returnsReport(key, posIds, start, end, team),{headers:{'Cache-Control':'private, max-age=600'}});
}
