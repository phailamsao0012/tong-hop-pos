import { mentorReport } from '@/lib/teams/staff-scope';
import { resolveMktLens, lensDatabase } from '@/lib/shared/scope-filter';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { POS } from '@/lib/shared/report-model';
import { reportMemoKey } from '@/lib/reports/report-memo';
import { COMPARE_MODES, DATE_RE, daysBetween, shiftPeriod, type CompareMode } from '@/lib/shared/report-time';
import { parseTeam, usingHrTeams } from '@/lib/teams/team';
import { resolveBranchUnit as resolveHrUnit } from '@/lib/shared/scope-filter';
import { staffCompareBody } from '@/lib/reports/staff-compare-report';

// So cùng kỳ cho bảng Từng nhân viên (lib/reports/staff-compare-report.ts).
const MAX_DAYS = 1000;
const memo = new Map<string, { at: number; body: string }>();

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const memoKey = reportMemoKey(
    user.role,
    usingHrTeams() ? 'hr' : 'pc',
    request.url,
  );
  const hit = memo.get(memoKey);
  if (hit && Date.now() - hit.at < 3 * 60000) return new Response(hit.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
  const p = new URL(request.url).searchParams;
  const start = p.get('start') ?? '', end = p.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end || daysBetween(start, end) > MAX_DAYS) return Response.json({ error: 'Khoảng ngày không hợp lệ.' }, { status: 400 });
  const modeParam = p.get('mode') ?? 'previous';
  let range: { start: string; end: string };
  if (modeParam === 'custom') {
    const cs = p.get('cstart') ?? '', ce = p.get('cend') ?? '';
    if (!DATE_RE.test(cs) || !DATE_RE.test(ce) || cs > ce || daysBetween(cs, ce) > MAX_DAYS) return Response.json({ error: 'Kỳ so sánh không hợp lệ.' }, { status: 400 });
    range = { start: cs, end: ce };
  } else if ((COMPARE_MODES as string[]).includes(modeParam)) range = shiftPeriod(start, end, modeParam as CompareMode, Number(p.get('step') ?? 1));
  else return Response.json({ error: 'Kiểu so sánh không hợp lệ.' }, { status: 400 });
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : POS.map((x) => x.id);
  const lens = await resolveMktLens(env.DB, p);
  if (lens instanceof Response) return lens;
  const db = lensDatabase(env.DB, lens);
  const unitScope = await resolveHrUnit(p, parseTeam(p.get('team') ?? 'sale'));
  if (unitScope instanceof Response) return unitScope;
  const { team, unit } = unitScope;
  const body = await staffCompareBody(p, start, end, modeParam, range, posIds, db, team, unit);
  memo.set(memoKey, { at: Date.now(), body });
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}
