import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { emptyDb } from './support/d1-sqlite';
import { computePosTeams, type HrSnapshot } from '../lib/teams/hr-copy';
import { hrSyncState, pullHr } from '../lib/teams/hr-sync';

void test('HR incremental copy matches replacement, writes only changed rows and throttles state', async (t) => {
  const { raw, db } = emptyDb({ DEMO_MODE: '' });
  t.after(() => raw.close());
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-18T03:00:00Z') });
  const snapshot: HrSnapshot = {
    offices: [{ id: 'o', name: 'Office demo' }],
    departments: [{ id: 'd', name: 'Sale demo', parent_id: null, kind: 'department', office_id: 'o', director_employee_id: null, active: 1 },
      { id: 'unused', name: 'Department demo', parent_id: null, kind: 'department', office_id: null, director_employee_id: null, active: 0 }],
    levels: [{ id: 'l', name: 'Level demo', rank: 1, is_manager: 0 }],
    titles: [{ id: 't', name: 'Title demo' }],
    employees: [{ id: 'e', code: 'DEMO', full_name: 'Employee demo', email: null, phone: null, office_id: 'o', joined_on: null, status: 'active', left_on: null, main_user_id: null }],
    assignments: [{ id: 'a', employee_id: 'e', department_id: 'd', level_id: 'l', title_id: 't', manager_employee_id: null, is_primary: 1, start_on: null, end_on: null }],
    posAccounts: [{ pos_user_id: 'p', employee_id: 'e' }],
  };
  Object.assign(env, { HR_SHARED_SECRET: 'synthetic-test-value', CRM_URL: 'https://hr.invalid', HR: { fetch: async () => Response.json(snapshot) } });
  const writes: { sql: string; rows: number }[] = [];
  let batches = 0;
  const wrap = (sql: string, stmt: D1PreparedStatement): D1PreparedStatement => ({
    bind: (...args: unknown[]) => wrap(sql, stmt.bind(...args)),
    all: stmt.all.bind(stmt), first: stmt.first.bind(stmt),
    run: async () => { const result = await stmt.run(); writes.push({ sql, rows: result.meta.rows_written }); return result; },
  } as D1PreparedStatement);
  Object.assign(env, { DB: {
    prepare: (sql: string) => wrap(sql, db.prepare(sql)),
    batch: async (list: D1PreparedStatement[]) => { batches++; return Promise.all(list.map((s) => s.run())); },
  } });
  const tables = ['hr_offices', 'hr_departments', 'hr_levels', 'hr_titles', 'hr_employees', 'hr_assignments', 'hr_pos_team'];
  const replacement = new DatabaseSync(':memory:');
  t.after(() => replacement.close());
  for (const table of tables) {
    const schema = raw.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get('table', table)!;
    replacement.exec(String(schema.sql));
  }
  let replacementWrites = 0;
  const count = () => writes.filter((w) => /(?:INTO|UPDATE|FROM) hr_/.test(w.sql)).reduce((sum, w) => sum + w.rows, 0);
  // Independent replacement oracle: normalize exactly the original INSERT bindings.
  const equalReplacement = () => {
    const expected = [snapshot.offices, snapshot.departments.map((d) => ({ ...d, director_employee_id: d.director_employee_id ?? null, active: d.active ? 1 : 0 })),
      snapshot.levels.map((l) => ({ ...l, is_manager: l.is_manager ? 1 : 0 })), snapshot.titles, snapshot.employees,
      snapshot.assignments.map((a) => ({ ...a, is_primary: a.is_primary ? 1 : 0 })), computePosTeams(snapshot, new Date().toISOString().slice(0, 10))];
    tables.forEach((table, i) => {
      const key = table === 'hr_pos_team' ? 'pos_user_id' : 'id';
      replacementWrites += Number(replacement.prepare(`DELETE FROM ${table}`).run().changes);
      for (const row of expected[i]) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        replacementWrites += Number(replacement.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...values).changes);
      }
      const sort = (rows: object[]) => rows.map((r) => ({ ...r })).sort((a, b) => String((a as Record<string, unknown>)[key]).localeCompare(String((b as Record<string, unknown>)[key])));
      assert.deepEqual(sort(raw.prepare(`SELECT * FROM ${table}`).all()), sort(replacement.prepare(`SELECT * FROM ${table}`).all()));
    });
  };
  assert.equal((await pullHr()).error, null);
  equalReplacement();
  assert.equal(count(), 8);
  writes.length = 0;
  await pullHr();
  assert.equal(writes.length, 0);
  await pullHr(true);
  assert.equal(count(), 0);
  writes.length = 0;
  snapshot.employees[0].full_name = 'Employee demo revised';
  await pullHr();
  equalReplacement();
  assert.equal(count(), 2);
  assert.deepEqual(writes.filter((w) => w.sql.startsWith('UPDATE hr_')).map((w) => w.sql), [
    'UPDATE hr_employees SET full_name=? WHERE id=?', 'UPDATE hr_pos_team SET employee_name=? WHERE pos_user_id=?',
  ]);
  writes.length = 0;
  snapshot.departments.pop();
  await pullHr();
  equalReplacement();
  assert.equal(count(), 1);
  assert.ok(writes.some((w) => w.sql === 'DELETE FROM hr_departments WHERE id=?'));
  writes.length = 0;
  t.mock.timers.tick(30 * 60_000);
  await pullHr();
  assert.equal(writes.length, 0);
  t.mock.timers.tick(1);
  await pullHr();
  assert.equal(writes.length, 1);
  assert.equal((await hrSyncState()).pulledAt, new Date().toISOString());
  writes.length = 0;
  t.mock.timers.tick(24 * 60 * 60_000);
  await pullHr();
  equalReplacement();
  assert.equal(count(), 0);
  assert.equal(batches, 5);
  assert.equal(replacementWrites, 53);
  // Clearing every table and reinserting: 8 + 16 + 15 + 14 = 53 HR rows.
  // Incremental: initial 8 + rename 2 + removal 1 + next day 0 = 11.
  t.diagnostic('HR row writes, replacement / incremental: 53 / 11 (excluding state and indexes)');
});
