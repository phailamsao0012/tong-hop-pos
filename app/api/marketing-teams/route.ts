import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { validateMarketingTeams } from '@/lib/teams/marketing-teams';
import { mktPeople, saveMarketingTeams } from '@/lib/teams/mkt-teams-admin';
import { mktTeams } from '@/lib/teams/mkt-teams-source';
import { marketerIds } from '@/lib/teams/marketer-ids';

export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  const resolved = await mktTeams(env.DB);
  const [staff, marketerIdSet] = await Promise.all([
    mktPeople(),
    marketerIds(env.DB),
  ]);
  return Response.json({
    teams: resolved.teams, source: resolved.source,
    people: (staff.results as { user_id: string; name: string; department: string; active: number }[]).map((r) => ({ id: r.user_id, name: r.name || `NV ${r.user_id.slice(0, 8)}`, department: r.department || null, active: !!r.active, marketer: marketerIdSet.has(r.user_id) || /mkt|marketing/i.test(r.department) })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  if ((await mktTeams(env.DB)).source === 'hr') return Response.json({ error: 'Đang dùng team từ web nhân sự. Vui lòng sửa ở web nhân sự.' }, { status: 409 });
  let body: { teams?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const checked = validateMarketingTeams(body.teams);
  if (!checked.teams) return Response.json({ error: checked.error }, { status: 400 });
  await saveMarketingTeams(checked);
  return Response.json({ ok: true, teams: checked.teams }, { headers: { 'Cache-Control': 'private, no-store' } });
}
