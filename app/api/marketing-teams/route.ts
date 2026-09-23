import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth';
import { isOwner } from '@/lib/access';
import { MARKETING_TEAMS_KEY, parseMarketingTeams, validateMarketingTeams } from '@/lib/marketing-teams';

export async function GET() {
  if (!(await getSessionUser())) return unauthorized();
  const [saved, staff] = await env.DB.batch([
    env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(MARKETING_TEAMS_KEY),
    env.DB.prepare("SELECT user_id,MAX(name) AS name,MAX(COALESCE(department,'')) AS department,MAX(is_active) AS active FROM pos_users WHERE user_id<>'' GROUP BY user_id ORDER BY name"),
  ]);
  return Response.json({
    teams: parseMarketingTeams((saved.results[0] as { value?: string } | undefined)?.value),
    people: (staff.results as { user_id: string; name: string; department: string; active: number }[]).map((r) => ({ id: r.user_id, name: r.name || `NV ${r.user_id.slice(0, 8)}`, department: r.department || null, active: !!r.active })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  let body: { teams?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const checked = validateMarketingTeams(body.teams);
  if (!checked.teams) return Response.json({ error: checked.error }, { status: 400 });
  await env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(MARKETING_TEAMS_KEY, JSON.stringify(checked.teams), new Date().toISOString()).run();
  return Response.json({ ok: true, teams: checked.teams }, { headers: { 'Cache-Control': 'private, no-store' } });
}
