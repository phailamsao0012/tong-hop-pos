import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { branchFilter, branchSubquery } from '../lib/branch';
import { teamFilter } from '../lib/team';
import { scopeFromParams, scopeSql } from '../lib/scope-filter';
import { setBranch, unitFor, withUnit } from '../app/team-store';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE hr_departments(id TEXT,kind TEXT,office_id TEXT);
    CREATE TABLE hr_employees(id TEXT,office_id TEXT);
    CREATE TABLE hr_pos_team(pos_user_id TEXT,employee_id TEXT,department_id TEXT);
    CREATE TABLE orders(seller_id TEXT,marketer_id TEXT,net INTEGER);
    INSERT INTO hr_departments VALUES ('team_a','team','office_a'),('team_b','team','office_b');
    INSERT INTO hr_employees VALUES ('e1','office_b'),('e2','office_a'),('e3','office_b'),('e4',NULL);
    INSERT INTO hr_pos_team VALUES ('s1','e1','team_a'),('s2','e2','team_b'),('s3','e3',NULL),('s4','e4',NULL);
    INSERT INTO orders VALUES ('s1','s2',100),('s2','s1',200),('s3','s1',300),('s4',NULL,400),('unknown',NULL,500);`);
  return db;
}

void test('branch: primary team office wins; no team uses employee office; unknown remains in total', () => {
  const db = fixture();
  try {
    const ids = (office: string) => db.prepare(`SELECT pos_user_id FROM ${branchSubquery(office)} ORDER BY pos_user_id`).all().map((r) => r.pos_user_id);
    assert.deepEqual(ids('office_a'), ['s1']);
    assert.deepEqual(ids('office_b'), ['s2', 's3']);
    const sum = (office: string | null) => Number(db.prepare(`SELECT SUM(net) AS n FROM orders WHERE 1=1${branchFilter('seller_id', office)}`).get()?.n);
    assert.equal(sum(null), sum('office_a') + sum('office_b') + 900);
    assert.equal(sum('missing'), 0);
  } finally { db.close(); }
});

void test('branch: SQL rejects malformed identifiers and keeps total unchanged', () => {
  assert.equal(branchFilter('seller_id', null), '');
  assert.equal(teamFilter('seller_id', 'all'), '');
  for (const id of ["x' OR 1=1--", 'a b', '', 'x'.repeat(81)]) assert.throws(() => branchSubquery(id));
  assert.throws(() => scopeFromParams(new URLSearchParams('branch=a%27')));
});

void test('branch: seller and marketer scopes are independent', () => {
  const db = fixture();
  try {
    const scope = scopeFromParams(new URLSearchParams('branch=office_a'));
    const sum = (marketing: boolean) => db.prepare(`SELECT SUM(net) AS n FROM orders WHERE 1=1${scopeSql(scope, { seller: 'seller_id', marketer: 'marketer_id' }, marketing)}`).get()?.n;
    assert.equal(sum(false), 100);
    assert.equal(sum(true), 500);
    assert.equal(teamFilter('seller_id', 'all', true, { id: 'branch_office_a', name: 'Chi nhánh A', dept: 'sale', branch: 'office_a', branchOnly: true }), branchFilter('seller_id', 'office_a'));
  } finally { db.close(); }
});

void test('branch: detail URLs preserve date, POS, department and team filters', () => {
  try {
    setBranch('office_a');
    const unit = { id: 'team_a', name: 'Team Sale 1', dept: 'sale' as const };
    const url = new URL(withUnit('/api/reports/overview?start=2026-10-01&end=2026-10-17&posIds=pos_demo&team=sale', unit), 'http://localhost');
    assert.deepEqual(Object.fromEntries(url.searchParams), { start: '2026-10-01', end: '2026-10-17', posIds: 'pos_demo', team: 'sale', hrTeam: 'team_a', branch: 'office_a' });
    const branchUnit = { id: 'branch_office_a', name: '', dept: 'sale' as const, branch: 'office_a', branchOnly: true };
    assert.equal(unitFor(branchUnit, 'cskh'), branchUnit);
    assert.equal(withUnit('/api/reports/overview', branchUnit), '/api/reports/overview?branch=office_a');
    setBranch(null);
    assert.equal(withUnit('/api/reports/overview', null), '/api/reports/overview');
  } finally { setBranch(null); }
});
