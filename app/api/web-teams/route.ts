import { env } from 'cloudflare:workers';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner } from '@/lib/auth/access';
import { auditHeaders } from '@/lib/ops/audit';
import { MARKETING_TEAMS_KEY, parseMarketingTeams, validateMarketingTeams } from '@/lib/teams/marketing-teams';
import { TEAM_SOURCE_KEY, refreshTeamSource } from '@/lib/teams/team-source';
import { WEB_TEAMS_BACKUP_KEY, WEB_TEAMS_KEY, parseWebTeams, validateWebTeams } from '@/lib/teams/web-teams';

// Trang Chia team (Cài đặt, chỉ chủ hệ thống): team Sale / CSKH / MKT chia ngay trên web tổng, thay web nhân sự (anh Vũ 21/10/2026).
// Lưu xong thì nguồn team chuyển sang web tổng (team_source='pancake'); bản cũ giữ ở WEB_TEAMS_BACKUP_KEY.
async function owner() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  return null;
}

async function settings() {
  const rows = await env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?,?)').bind(WEB_TEAMS_KEY, MARKETING_TEAMS_KEY, TEAM_SOURCE_KEY).all<{ key: string; value: string }>();
  return new Map(rows.results.map((r) => [r.key, r.value]));
}

export async function GET() {
  const denied = await owner();
  if (denied) return denied;
  const values = await settings();
  const staff = await env.DB.prepare("SELECT user_id,MAX(name) AS name,MAX(COALESCE(department,'')) AS department FROM pos_users WHERE user_id<>'' AND name<>'' GROUP BY user_id ORDER BY name")
    .all<{ user_id: string; name: string; department: string }>();
  // Tài khoản đăng nhập vai trò Mentor / Trưởng nhóm để gán phụ trách team (31/10/2026).
  const accounts = await env.DB.prepare("SELECT id,COALESCE(NULLIF(name,''),email) AS name,role FROM users WHERE role IN ('mentor','lead') AND disabled=0 ORDER BY name")
    .all<{ id: string; name: string; role: string }>();
  return Response.json({
    accounts: accounts.results,
    source: values.get(TEAM_SOURCE_KEY) === 'hr' ? 'hr' : 'web',
    teams: parseWebTeams(values.get(WEB_TEAMS_KEY)),
    mkt: parseMarketingTeams(values.get(MARKETING_TEAMS_KEY)),
    people: staff.results.map((r) => ({ id: r.user_id, name: r.name, department: r.department || null })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** { teams: WebTeam[], mkt: MarketingTeam[] } → lưu cả hai, chuyển nguồn team sang web tổng. */
export async function PUT(request: Request) {
  const denied = await owner();
  if (denied) return denied;
  let body: { teams?: unknown; mkt?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const web = validateWebTeams(body.teams);
  if (!web.teams) return Response.json({ error: web.error }, { status: 400 });
  const mkt = validateMarketingTeams(body.mkt);
  if (!mkt.teams) return Response.json({ error: mkt.error }, { status: 400 });
  const before = await settings(), now = new Date().toISOString();
  const put = (key: string, value: string) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, value, now);
  await env.DB.batch([
    put(WEB_TEAMS_BACKUP_KEY, JSON.stringify({ savedAt: now, teams: before.get(WEB_TEAMS_KEY) ?? null, mkt: before.get(MARKETING_TEAMS_KEY) ?? null, source: before.get(TEAM_SOURCE_KEY) ?? null })),
    put(WEB_TEAMS_KEY, JSON.stringify(web.teams)),
    put(MARKETING_TEAMS_KEY, JSON.stringify(mkt.teams)),
    put(TEAM_SOURCE_KEY, 'pancake'),
  ]);
  await refreshTeamSource(true);
  return Response.json({ ok: true, teams: web.teams, mkt: mkt.teams, source: 'web' }, { headers: auditHeaders(`Chia team trên web tổng: ${web.teams.length} team Sale/CSKH, ${mkt.teams.length} team MKT`) });
}
