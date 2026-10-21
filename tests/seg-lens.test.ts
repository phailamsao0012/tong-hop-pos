import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { setHrTeams, teamFilter } from '../lib/team';
import { withSegLens } from '../lib/seg-lens';

// Trang Sale mà thanh trên chọn CSKH: chỉ tính người thuộc cả hai bộ phận, số ra từ phép tính chứ không ép 0 (anh Vũ 21/10/2026).
function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE pos_users (user_id TEXT, name TEXT, department TEXT);
    CREATE TABLE hr_pos_team (pos_user_id TEXT, employee_id TEXT, team TEXT, status TEXT, department_id TEXT);
    CREATE TABLE app_settings (key TEXT, value TEXT);
    CREATE TABLE o (seller_id TEXT, net INTEGER);
    INSERT INTO pos_users VALUES ('s1','An SALE','Sale'),('c1','Bình CSKH','CSKH'),('x1','Cường SALE CSKH','Sale');
    INSERT INTO o VALUES ('s1',100),('c1',40),('x1',7);`);
  return d;
}
const total = (d: DatabaseSync, team: 'all' | 'sale' | 'cskh', seg: string | null) => withSegLens(new URL(`https://x/api/r${seg ? `?seg=${seg}` : ''}`), () =>
  (d.prepare(`SELECT COALESCE(SUM(net),0) AS n FROM o WHERE 1=1${teamFilter('seller_id', team)}`).get() as { n: number }).n);

test('page department intersected with the selected one', () => {
  setHrTeams(false);
  const d = db();
  assert.equal(total(d, 'sale', null), 107);
  assert.equal(total(d, 'cskh', null), 47);
  // Người tên có cả SALE và CSKH thuộc cả hai nhóm Pancake: chỉ còn người đó.
  assert.equal(total(d, 'sale', 'cskh'), 7);
  assert.equal(total(d, 'all', 'cskh'), 47);
  d.exec("DELETE FROM o WHERE seller_id='x1'");
  assert.equal(total(d, 'sale', 'cskh'), 0);
  assert.equal(total(d, 'cskh', 'sale'), 0);
});

test('hr teams: one team per person, so the other department gives 0', () => {
  setHrTeams(true);
  const d = db();
  d.exec("INSERT INTO hr_pos_team VALUES ('s1','e1','sale','chinh_thuc','t1'),('c1','e2','cskh','chinh_thuc','t2'),('x1','e3','sale','chinh_thuc','t1')");
  assert.equal(total(d, 'sale', null), 107);
  assert.equal(total(d, 'sale', 'cskh'), 0);
  assert.equal(total(d, 'cskh', 'sale'), 0);
  assert.equal(total(d, 'sale', 'sale'), 107);
  setHrTeams(false);
});
