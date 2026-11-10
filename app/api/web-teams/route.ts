import { env } from 'cloudflare:workers';
import { saveWebTeams, settings, teamOwnerAccounts, teamPeople, viewerAccounts } from '@/lib/teams/web-teams-admin';
import { forbidden, getSessionUser, unauthorized } from '@/lib/auth/auth';
import { isOwner, parseAccess } from '@/lib/auth/access';
import { auditHeaders } from '@/lib/ops/audit';
import { MARKETING_TEAMS_KEY, VANDON_TEAMS_KEY, parseMarketingTeams, validateMarketingTeams } from '@/lib/teams/marketing-teams';
import { TEAM_SOURCE_KEY, refreshTeamSource } from '@/lib/teams/team-source';
import { teamZaloStates } from '@/lib/zalo/team-link';
import { WEB_TEAMS_KEY, parseWebTeams, validateWebTeams } from '@/lib/teams/web-teams';

// Trang Chia team (Cài đặt, chỉ chủ hệ thống): team Sale / CSKH / MKT chia ngay trên web tổng, thay web nhân sự (anh Vũ 21/10/2026).
// Lưu xong thì nguồn team chuyển sang web tổng (team_source='pancake'); bản cũ giữ ở WEB_TEAMS_BACKUP_KEY.
async function owner() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  return null;
}

export async function GET() {
  const denied = await owner();
  if (denied) return denied;
  const values = await settings();
  const staff = await teamPeople();
  // Tài khoản đăng nhập vai trò Mentor / Trưởng nhóm để gán phụ trách team (31/10/2026).
  const accounts = await teamOwnerAccounts();
  // Sơ đồ quyền (03/11/2026): mọi tài khoản đang mở trừ chủ hệ thống, với bộ phận và POS được cấp.
  const viewerRows = await viewerAccounts();
  return Response.json({
    accounts: accounts.results,
    viewers: viewerRows.results.map((r) => { const a = parseAccess(r); return { id: r.id, name: r.name, role: a.role, team: a.team === 'all' ? null : a.team, posIds: a.posIds }; }),
    source: values.get(TEAM_SOURCE_KEY) === 'hr' ? 'hr' : 'web',
    teams: parseWebTeams(values.get(WEB_TEAMS_KEY)),
    mkt: parseMarketingTeams(values.get(MARKETING_TEAMS_KEY)),
    vandon: parseMarketingTeams(values.get(VANDON_TEAMS_KEY)),
    // Zalo của Mentor / Leader (03/11/2026): ai đã nối, ai chưa.
    zalo: await teamZaloStates(env.DB),
    people: staff.results.map((r) => ({ id: r.user_id, name: r.name, department: r.department || null })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** { teams: WebTeam[], mkt: MarketingTeam[], vandon?: MarketingTeam[] } → lưu hết, chuyển nguồn team sang web tổng. */
export async function PUT(request: Request) {
  const denied = await owner();
  if (denied) return denied;
  let body: { teams?: unknown; mkt?: unknown; vandon?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const web = validateWebTeams(body.teams);
  if (!web.teams) return Response.json({ error: web.error }, { status: 400 });
  const mkt = validateMarketingTeams(body.mkt);
  if (!mkt.teams) return Response.json({ error: mkt.error }, { status: 400 });
  const vandon = validateMarketingTeams(body.vandon ?? [], 'vd', 'Vận đơn');
  if (!vandon.teams) return Response.json({ error: vandon.error }, { status: 400 });
  const before = await settings(), now = new Date().toISOString();
  await saveWebTeams(before, now, web, mkt, vandon);
  await refreshTeamSource(true);
  return Response.json({ ok: true, teams: web.teams, mkt: mkt.teams, vandon: vandon.teams, source: 'web' }, { headers: auditHeaders(`Chia team trên web tổng: ${web.teams.length} team Sale/CSKH, ${mkt.teams.length} team MKT, ${vandon.teams.length} team Vận đơn`) });
}
