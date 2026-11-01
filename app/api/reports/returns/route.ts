import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { canView, scopeApi } from '@/lib/auth/access';
import { POS } from '@/lib/shared/report-model';
import { DATE_RE } from '@/lib/shared/report-time';
import { parseTeam } from '@/lib/teams/team';
import { returnsQuery, packReturns, type ReturnOrder, type ReturnsReport } from '@/lib/reports/return-reasons';
const cache = new Map<string, { at: number; report: ReturnsReport }>();
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
  let entry = cache.get(key);
  if (!entry || Date.now()-entry.at>=600000) {
    const query = returnsQuery(posIds,start,end,team);
    const result = await env.DB.prepare(query.sql).bind(...query.binds).all<ReturnOrder>();
    entry = { at:Date.now(), report:packReturns(result.results) };
    if (cache.size>=80) cache.delete(cache.keys().next().value!);
    cache.set(key,entry);
  }
  return Response.json(entry.report,{headers:{'Cache-Control':'private, max-age=600'}});
}
