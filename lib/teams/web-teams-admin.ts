// Tách khỏi app/api/web-teams/route.ts (cải tổ B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';
import { MARKETING_TEAMS_KEY, VANDON_TEAMS_KEY, type MarketingTeam } from '@/lib/teams/marketing-teams';
import { TEAM_SOURCE_KEY } from '@/lib/teams/team-source';
import { WEB_TEAMS_BACKUP_KEY, WEB_TEAMS_KEY, type WebTeam } from '@/lib/teams/web-teams';

/** Team web tổng, team Marketing và nguồn team đang lưu. */
export async function settings() {
  const rows = await env.DB.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?,?,?)').bind(WEB_TEAMS_KEY, MARKETING_TEAMS_KEY, VANDON_TEAMS_KEY, TEAM_SOURCE_KEY).all<{ key: string; value: string }>();
  return new Map(rows.results.map((r) => [r.key, r.value]));
}

/** Người trên POS (gộp theo mã) để chia team. */
export const teamPeople = () => env.DB.prepare("SELECT user_id,MAX(name) AS name,MAX(COALESCE(department,'')) AS department FROM pos_users WHERE user_id<>'' AND name<>'' GROUP BY user_id ORDER BY name")
    .all<{ user_id: string; name: string; department: string }>();
/** Tài khoản Mentor / Trưởng nhóm để gán phụ trách team. */
export const teamOwnerAccounts = () => env.DB.prepare("SELECT id,COALESCE(NULLIF(name,''),email) AS name,role FROM users WHERE role IN ('mentor','lead') AND disabled=0 ORDER BY name")
    .all<{ id: string; name: string; role: string }>();
/** Mọi tài khoản đang mở trừ chủ hệ thống (sơ đồ quyền). */
export const viewerAccounts = () => env.DB.prepare("SELECT id,COALESCE(NULLIF(name,''),email) AS name,role,team,pos_ids_json FROM users WHERE disabled=0 AND role<>'owner' ORDER BY name")
    .all<{ id: string; name: string; role: string; team: string | null; pos_ids_json: string | null }>();

/** Lưu team Sale/CSKH và MKT chia trên web tổng (giữ bản cũ ở WEB_TEAMS_BACKUP_KEY), chuyển nguồn team sang web tổng. */
export async function saveWebTeams(before: Map<string, string>, now: string, web: { teams?: WebTeam[] }, mkt: { teams?: MarketingTeam[] }, vandon: { teams?: MarketingTeam[] } = { teams: [] }) {
  const put = (key: string, value: string) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, value, now);
  await env.DB.batch([
    put(WEB_TEAMS_BACKUP_KEY, JSON.stringify({ savedAt: now, teams: before.get(WEB_TEAMS_KEY) ?? null, mkt: before.get(MARKETING_TEAMS_KEY) ?? null, vandon: before.get(VANDON_TEAMS_KEY) ?? null, source: before.get(TEAM_SOURCE_KEY) ?? null })),
    put(WEB_TEAMS_KEY, JSON.stringify(web.teams)),
    put(MARKETING_TEAMS_KEY, JSON.stringify(mkt.teams)),
    put(VANDON_TEAMS_KEY, JSON.stringify(vandon.teams ?? [])),
    put(TEAM_SOURCE_KEY, 'pancake'),
  ]);
}
