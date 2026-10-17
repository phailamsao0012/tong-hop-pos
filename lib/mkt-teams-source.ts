import { MARKETING_TEAMS_KEY, parseMarketingTeams, type MarketingTeam } from './marketing-teams';
import { groupTeams, MENTOR_SQL, mentorMap, type DeptRow, type TeamRow } from './hr-teams';
import { todayVn } from './report-time';

export function selectMktTeams(source: string | undefined, saved: string | undefined, rows: TeamRow[], depts: DeptRow[], offices: Map<string, string>, mentors = new Map<string, string>()) {
  const teams = groupTeams(rows.filter((r) => r.status !== 'da_nghi' && !!r.pos_user_id.trim()), depts, offices, 'mkt', mentors)
    .filter((t) => t.id !== 'none' && t.members.length)
    .map((t): MarketingTeam => ({ id: `hr:${t.id}`, name: t.name, office: t.office, mentor: t.mentor ?? null, memberIds: [...new Set(t.members.map((m) => m.posUserId))] }));
  return source === 'hr' && teams.length ? { source: 'hr' as const, teams } : { source: 'local' as const, teams: parseMarketingTeams(saved).map((t) => ({ ...t, office: null, mentor: null })) };
}

export async function mktTeams(db: D1Database) {
  const day = todayVn();
  const [settings, rows, depts, offices, mentors] = await db.batch([
    db.prepare('SELECT key,value FROM app_settings WHERE key IN (?,?)').bind('team_source', MARKETING_TEAMS_KEY),
    db.prepare("SELECT * FROM hr_pos_team WHERE status<>'da_nghi'"),
    db.prepare('SELECT id,name,parent_id,kind,office_id FROM hr_departments WHERE active=1'),
    db.prepare('SELECT id,name FROM hr_offices'),
    db.prepare(MENTOR_SQL).bind(day, day),
  ]);
  const values = new Map((settings.results as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return selectMktTeams(values.get('team_source'), values.get(MARKETING_TEAMS_KEY), rows.results as TeamRow[], depts.results as DeptRow[], new Map((offices.results as { id: string; name: string }[]).map((o) => [o.id, o.name])), mentorMap(mentors.results as { team_id: string; name: string }[]));
}
