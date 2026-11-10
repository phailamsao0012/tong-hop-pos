import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { canView, scopeApi, type Access } from '../lib/auth/access';
import { setHrTeams, teamFilter } from '../lib/teams/team';
import { withSegLens } from '../lib/shared/seg-lens';
import { teamScopeFor, validateWebTeams, type WebTeam } from '../lib/teams/web-teams';

// Mentor / Leader gán ở Cài đặt → Team (anh Vũ 31/10/2026): chỉ xem người team mình, chỉ trang bộ phận mình. Số ảo.
const T1 = 'wt_00000000-0000-4000-8000-000000000001', T2 = 'wt_00000000-0000-4000-8000-000000000002', T3 = 'wt_00000000-0000-4000-8000-000000000003';
const teams: WebTeam[] = [
  { id: T1, name: 'Team A', dept: 'cskh', office: null, memberIds: ['c1', 'c2'], mentorUserId: 'u-mentor-a', leaderUserId: 'u-lead' },
  { id: T2, name: 'Team B', dept: 'cskh', office: null, memberIds: ['c3'], mentorUserId: 'u-mentor-b', leaderUserId: 'u-lead' },
  { id: T3, name: 'Team S', dept: 'sale', office: null, memberIds: ['s1'] },
];

void test('scope: mentor gets own team, leader gets every team under them', () => {
  assert.deepEqual(teamScopeFor(teams, 'u-mentor-a'), { ids: [T1], dept: 'cskh' });
  assert.deepEqual(teamScopeFor(teams, 'u-lead'), { ids: [T1, T2], dept: 'cskh' });
  assert.equal(teamScopeFor(teams, 'u-other'), null);
  const saved = validateWebTeams(teams);
  assert.equal(saved.teams?.[0].mentorUserId, 'u-mentor-a');
  assert.equal(saved.teams?.[2].leaderUserId, null);
});

const lead: Access = { role: 'lead', views: ['overview', 'marketing', 'sale-overview'], posIds: null, team: 'all', teamScope: { ids: [T1, T2], dept: 'cskh' } };

void test('scope: only the department pages, whatever views were granted', () => {
  assert.ok(canView(lead, 'cskh-overview'));
  assert.ok(canView(lead, 'calls'));
  for (const v of ['overview', 'marketing', 'sale-overview', 'mentor', 'config']) assert.equal(canView(lead, v), false, v);
  assert.ok(scopeApi(lead, 'GET', new URL('http://x/api/reports/marketing')).blocked);
});

void test('scope: url carries the session scope, not the browser one', () => {
  const r = scopeApi(lead, 'GET', new URL(`http://x/api/reports/calls?team=sale&wscope=${T3}`));
  assert.equal(r.blocked, undefined);
  assert.equal(r.url.searchParams.get('wscope'), `${T1},${T2}`);
  assert.equal(r.url.searchParams.get('team'), 'cskh');
  const none = scopeApi({ ...lead, teamScope: { ids: [], dept: 'cskh' } }, 'GET', new URL('http://x/api/reports/calls'));
  assert.equal(none.url.searchParams.get('wscope'), 'none');
  const plain = scopeApi({ role: 'lead', views: ['calls'], posIds: null, team: 'all' }, 'GET', new URL(`http://x/api/reports/calls?wscope=${T3}`));
  assert.equal(plain.url.searchParams.has('wscope'), false);
});

void test('scope: every team filter keeps only people of the scoped teams', () => {
  setHrTeams(false);
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE pos_users (user_id TEXT, name TEXT, department TEXT);
    CREATE TABLE hr_pos_team (pos_user_id TEXT, employee_id TEXT, team TEXT, status TEXT, department_id TEXT);
    CREATE TABLE app_settings (key TEXT, value TEXT);
    CREATE TABLE o (seller_id TEXT, net INTEGER);
    INSERT INTO pos_users VALUES ('c1','An CSKH','CSKH'),('c2','Bình CSKH','CSKH'),('c3','Chi CSKH','CSKH'),('c4','Dũng CSKH','CSKH'),('s1','Em SALE','Sale');
    INSERT INTO o VALUES ('c1',1),('c2',10),('c3',100),('c4',1000),('s1',10000);`);
  d.prepare('INSERT INTO app_settings VALUES (?,?)').run('web_teams_v1', JSON.stringify(teams));
  const sum = (query: string, team: 'all' | 'cskh' | 'sale') => withSegLens(new URL(`https://x/api/r${query}`), () =>
    (d.prepare(`SELECT COALESCE(SUM(net),0) AS n FROM o WHERE 1=1${teamFilter('seller_id', team, false)}`).get() as { n: number }).n);
  assert.equal(sum('', 'cskh'), 1111);
  assert.equal(sum(`?wscope=${T1}`, 'cskh'), 11);
  assert.equal(sum(`?wscope=${T1},${T2}`, 'cskh'), 111);
  assert.equal(sum(`?wscope=${T1}`, 'all'), 11);
  assert.equal(sum(`?wscope=${T1}`, 'sale'), 0);
  assert.equal(sum('?wscope=none', 'cskh'), 0);
  // Mã lạ không lọt vào SQL: coi như không ai.
  assert.equal(sum("?wscope=x')%20OR%201=1--", 'cskh'), 0);
});
