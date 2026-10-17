import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { selectMktTeams } from '../lib/mkt-teams-source';
import { marketingTeamFilter } from '../lib/marketing-teams';
import { computePosTeams } from '../lib/hr-copy';
import { hrSnapshot } from '../lib/demo/world';
import type { DeptRow, TeamRow } from '../lib/hr-teams';

const saved = JSON.stringify([{ id: 'mkt_old', name: 'Team MKT 1', memberIds: ['m1'] }]);
const snapshot = hrSnapshot();
const rows = computePosTeams(snapshot, '2026-10-17');
const offices = new Map(snapshot.offices.map((o) => [o.id, o.name]));
const select = (source = 'hr', members: TeamRow[] = rows, depts: DeptRow[] = snapshot.departments) => selectMktTeams(source, saved, members, depts, offices, new Map([['dept-mkt-hn', 'NV A']]));

void test('HR has two demo MKT teams with POS membership, office and mentor', () => {
  const result = select();
  assert.equal(result.source, 'hr');
  assert.equal(result.teams.length, 2);
  assert.equal(result.teams.find((t) => t.id === 'hr:dept-mkt-hn')?.mentor, 'NV A');
  assert.deepEqual(new Set(result.teams.map((t) => t.office)), new Set(['Hà Nội', 'Thái Nguyên']));
  assert.deepEqual(new Set(result.teams.flatMap((t) => t.memberIds)), new Set(rows.filter((r) => r.team === 'mkt').map((r) => r.pos_user_id)));
});

void test('disabled HR, empty copy, non-team departments or missing POS fall back without changing saved teams', () => {
  for (const result of [select('pancake'), select('hr', []), select('hr', rows, snapshot.departments.map((d) => ({ ...d, kind: 'department' }))), select('hr', rows.map((r) => ({ ...r, pos_user_id: '' }))), select('hr', rows.map((r) => ({ ...r, status: 'da_nghi' })))]) {
    assert.equal(result.source, 'local');
    assert.deepEqual(result.teams.map(({ id, name, memberIds }) => ({ id, name, memberIds })), JSON.parse(saved));
  }
});

void test('HR marketer filter uses POS ids, excludes inactive members, and respects source', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE app_settings (key TEXT,value TEXT);
    INSERT INTO app_settings VALUES ('team_source','hr');
    CREATE TABLE hr_departments (id TEXT,kind TEXT,active INTEGER);
    INSERT INTO hr_departments VALUES ('d1','team',1);
    CREATE TABLE hr_pos_team (pos_user_id TEXT,department_id TEXT,team TEXT,status TEXT);
    INSERT INTO hr_pos_team VALUES ('m1','d1','mkt','dang_lam'),('m2','d1','mkt','da_nghi'),('s1','d1','sale','dang_lam');
    CREATE TABLE orders (marketer_id TEXT,amount INTEGER);
    INSERT INTO orders VALUES ('m1',100),('m2',200),('s1',300),('m3',400);`);
  const filter = marketingTeamFilter('hr:d1', [], 'marketer_id');
  assert.ok(filter);
  const total = () => db.prepare(`SELECT COALESCE(SUM(amount),0) AS net FROM orders WHERE 1=1${filter.sql}`).get(...filter.binds)?.net;
  assert.equal(total(), 100);
  db.exec("UPDATE app_settings SET value='pancake'");
  assert.equal(total(), 0);
  const legacy = marketingTeamFilter('mkt_old', JSON.parse(saved), 'marketer_id');
  assert.ok(legacy);
  assert.equal(db.prepare(`SELECT SUM(amount) AS net FROM orders WHERE 1=1${legacy.sql}`).get(...legacy.binds)?.net, 100);
  assert.equal(marketingTeamFilter('__all', [], 'marketer_id')?.sql, '');
  db.close();
});
