import { officeList, teamOwnerPeople } from '@/lib/teams/web-teams';
export type MarketingTeam = { id: string; name: string; memberIds: string[]; office?: string | null; mentor?: string | null; /** Tên thành viên theo web nhân sự, gồm cả người chưa gắn tài khoản POS. */ memberNames?: string[];
  /** Tài khoản đăng nhập phụ trách team, để gắn Zalo (anh Vũ 03/11/2026). Không đổi quyền xem. */
  mentorUserId?: string | null; leaderUserId?: string | null;
  /** Người trong team làm Mentor / Leader (mã người POS), tài khoản gắn sau (anh Vũ 06/11/2026). */
  mentorPosId?: string | null; leaderPosId?: string | null };

export const MARKETING_TEAMS_KEY = 'marketing_teams_v1';
/** Team Vận đơn chia trên web tổng (anh Vũ 06/11/2026), cùng dạng team Marketing, mã vd_<uuid>. */
export const VANDON_TEAMS_KEY = 'vandon_teams_v1';
export const UNASSIGNED_TEAM = '__unassigned';
const hasControl = (value: string) => { for (const char of value) if (char.charCodeAt(0) < 32) return true; return false; };

export function parseMarketingTeams(value: string | null | undefined): MarketingTeam[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is MarketingTeam => !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.memberIds));
  } catch { return []; }
}

export function validateMarketingTeams(input: unknown, prefix = 'mkt', label = 'Marketing'): { teams?: MarketingTeam[]; error?: string } {
  if (!Array.isArray(input) || input.length > 30) return { error: `Tối đa 30 team ${label}.` };
  const idRe = new RegExp(`^${prefix}_[a-f0-9-]{36}$`);
  const teams: MarketingTeam[] = [];
  const ids = new Set<string>(), names = new Set<string>(), members = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') return { error: 'Team không hợp lệ.' };
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!idRe.test(id) || !name || name.length > 60 || hasControl(name) || ids.has(id) || names.has(name.toLocaleLowerCase('vi'))) return { error: 'Tên hoặc mã team bị trùng/không hợp lệ.' };
    if (!Array.isArray(row.memberIds) || row.memberIds.length > 300) return { error: 'Danh sách thành viên không hợp lệ.' };
    const memberIds: string[] = [];
    for (const raw of row.memberIds) {
      const userId = typeof raw === 'string' ? raw.trim() : '';
      if (!userId || userId.length > 100 || hasControl(userId) || members.has(userId)) return { error: `Một nhân viên chỉ được thuộc một team ${label}.` };
      members.add(userId); memberIds.push(userId);
    }
    const account = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
    const mentorUserId = account(row.mentorUserId), leaderUserId = account(row.leaderUserId);
    if ([mentorUserId, leaderUserId].some((x) => x && (x.length > 100 || hasControl(x)))) return { error: `Team ${name}: tài khoản phụ trách không hợp lệ.` };
    const owners = teamOwnerPeople(row, memberIds);
    if (!owners) return { error: `Team ${name}: Mentor, Leader phải là người trong team.` };
    // Chi nhánh, chọn được cả Hà Nội lẫn Thái Nguyên như team Sale/CSKH (anh Vũ 06/11/2026).
    const office = typeof row.office === 'string' && officeList(row.office).length ? officeList(row.office).map((o) => o.slice(0, 40)).slice(0, 4).join(',') : null;
    ids.add(id); names.add(name.toLocaleLowerCase('vi')); teams.push({ id, name, memberIds, ...(office ? { office } : {}), ...(mentorUserId ? { mentorUserId } : {}), ...(leaderUserId ? { leaderUserId } : {}), ...owners });
  }
  return { teams };
}

export function marketingTeamFilter(teamId: string, teams: MarketingTeam[], column: string) {
  if (!teamId || teamId === '__all') return { sql: '', binds: [] as string[] };
  if (teamId.startsWith('hr:')) {
    return { sql: ` AND ${column} IN (SELECT t.pos_user_id FROM hr_pos_team t JOIN hr_departments d ON d.id=t.department_id WHERE d.id=? AND d.kind='team' AND d.active=1 AND t.team='mkt' AND t.status<>'da_nghi' AND TRIM(t.pos_user_id)<>'' AND (EXISTS (SELECT 1 FROM app_settings WHERE key='team_source' AND value='hr') OR NOT EXISTS (SELECT 1 FROM app_settings WHERE key='web_teams_v1' AND json_valid(value) AND json_array_length(value)>0)))`, binds: [teamId.slice(3)] };
  }
  const memberIds = teamId === UNASSIGNED_TEAM ? teams.flatMap((t) => t.memberIds) : teams.find((t) => t.id === teamId)?.memberIds;
  if (!memberIds) return null;
  if (!memberIds.length) return { sql: teamId === UNASSIGNED_TEAM ? '' : ' AND 0', binds: [] as string[] };
  return { sql: ` AND ${column} ${teamId === UNASSIGNED_TEAM ? 'NOT IN' : 'IN'} (SELECT value FROM json_each(?))`, binds: [JSON.stringify(memberIds)] };
}

/** Group orders by saved team membership; SQLite counts distinct phones inside each team. */
export function marketingTeamGroupSql(teams: MarketingTeam[], column: string) {
  const active = teams.filter((team) => team.memberIds.length);
  if (!active.length) return { sql: `'${UNASSIGNED_TEAM}'`, binds: [] as string[] };
  return {
    sql: `CASE ${active.map(() => `WHEN ${column} IN (SELECT value FROM json_each(?)) THEN ?`).join(' ')} ELSE '${UNASSIGNED_TEAM}' END`,
    binds: active.flatMap((team) => [JSON.stringify(team.memberIds), team.id]),
  };
}
