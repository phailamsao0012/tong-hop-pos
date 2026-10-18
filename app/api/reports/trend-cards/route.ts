import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { canView, scopeApi } from '@/lib/access';
import { POS } from '@/lib/report-model';
import { DATE_RE, todayVn } from '@/lib/report-time';
import { parseTeam } from '@/lib/team';
import { resolveHrUnit } from '@/lib/hr-unit';
import { TREND_DEPTS, trendCards, trendOrderPage } from '@/lib/trend-period';
import { readTrendNotes } from '@/lib/ai-trends';

const DEPT_VIEW = { sale: 'sale-overview', cskh: 'cskh-overview', mkt: 'marketing', vandon: 'van-don' } as const;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return forbidden(scoped.blocked);
  const p = scoped.url.searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  const validDate = (s: string) => DATE_RE.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!validDate(start) || !validDate(end) || start > end || start > todayVn()) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const posIds = (p.get('posIds') || POS.map((x) => x.id).join(',')).split(',').filter(Boolean);
  if (!posIds.length || posIds.some((id) => !POS.some((x) => x.id === id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const unitScope = await resolveHrUnit(p, parseTeam(p.get('team')));
  if (unitScope instanceof Response) return unitScope;
  const requested = (p.get('depts') ?? TREND_DEPTS.join(',')).split(',');
  const depts = TREND_DEPTS.filter((d) => requested.includes(d) && (canView(user, 'overview') || canView(user, DEPT_VIEW[d])) && (unitScope.team === 'all' || d === unitScope.team || d === 'mkt' || d === 'vandon'));
  const opts = { start, end, preset: p.get('preset') ?? undefined, posIds, team: unitScope.team, unit: unitScope.unit, mktTeam: p.get('mktTeam') ?? undefined, branch: p.get('branch') ?? undefined };
  const mktTeam = opts.mktTeam;
  if (mktTeam && mktTeam.length > 100) return Response.json({ error: 'Mã team MKT không hợp lệ.' }, { status: 400 });
  const detail = p.get('detail');
  if (detail) {
    const dept = depts.find((d) => d === detail);
    if (!dept) return forbidden('Không được xem bộ phận này.');
    const page = Number(p.get('page') ?? 0);
    if (!Number.isInteger(page) || page < 0) return Response.json({ error: 'Trang không hợp lệ.' }, { status: 400 });
    const rows = await trendOrderPage(env.DB, opts, dept, p.get('staff'), page);
    return Response.json({ rows: rows.slice(0, 100), more: rows.length > 100 }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const result = await trendCards(env.DB, opts, depts);
  // AI viết cho cả công ty: chỉ hiện đúng kỳ tuần và đúng phạm vi đó, sau 7h30.
  const local = new Date(Date.now() + 7 * 3600000);
  const allScope = unitScope.team === 'all' && !unitScope.unit && !p.get('mktTeam') && !p.get('branch') && POS.every((x) => posIds.includes(x.id));
  const ai = result.period.open && result.period.selected === 'thisWeek' && allScope && local.getUTCHours() * 60 + local.getUTCMinutes() >= 450 ? await readTrendNotes(todayVn()) : null;
  const notes = ai?.source === 'ai' && ai.status === 'done' ? Object.fromEntries(depts.map((d) => [d, ai.notes?.[d]?.[0]])) : undefined;
  return Response.json({ ...result, notes }, { headers: { 'Cache-Control': 'private, no-store' } });
}
