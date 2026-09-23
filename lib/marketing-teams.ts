export type MarketingTeam = { id: string; name: string; memberIds: string[] };

export const MARKETING_TEAMS_KEY = 'marketing_teams_v1';
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

export function validateMarketingTeams(input: unknown): { teams?: MarketingTeam[]; error?: string } {
  if (!Array.isArray(input) || input.length > 30) return { error: 'Tối đa 30 team Marketing.' };
  const teams: MarketingTeam[] = [];
  const ids = new Set<string>(), names = new Set<string>(), members = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') return { error: 'Team không hợp lệ.' };
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!/^mkt_[a-f0-9-]{36}$/.test(id) || !name || name.length > 60 || hasControl(name) || ids.has(id) || names.has(name.toLocaleLowerCase('vi'))) return { error: 'Tên hoặc mã team bị trùng/không hợp lệ.' };
    if (!Array.isArray(row.memberIds) || row.memberIds.length > 300) return { error: 'Danh sách thành viên không hợp lệ.' };
    const memberIds: string[] = [];
    for (const raw of row.memberIds) {
      const userId = typeof raw === 'string' ? raw.trim() : '';
      if (!userId || userId.length > 100 || hasControl(userId) || members.has(userId)) return { error: 'Một nhân viên chỉ được thuộc một team Marketing.' };
      members.add(userId); memberIds.push(userId);
    }
    ids.add(id); names.add(name.toLocaleLowerCase('vi')); teams.push({ id, name, memberIds });
  }
  return { teams };
}

export function marketingTeamFilter(teamId: string, teams: MarketingTeam[], column: string) {
  if (!teamId || teamId === '__all') return { sql: '', binds: [] as string[] };
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
