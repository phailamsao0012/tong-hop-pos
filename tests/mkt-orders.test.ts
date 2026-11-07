import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { setHrTeams } from '../lib/teams/team';
import { mktOrdersSql } from '../lib/reports/mkt-orders';

// Bấm "x đơn" ở cột DT New / DT CSKH ra đúng các đơn đã đếm (anh Vũ 07/11/2026).
void test('danh sách đơn New / CSKH của một marketer khớp điều kiện đếm', () => {
  setHrTeams(false);
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE pos_users (user_id TEXT, name TEXT, department TEXT);
    CREATE TABLE hr_pos_team (pos_user_id TEXT, employee_id TEXT, team TEXT, status TEXT, department_id TEXT);
    CREATE TABLE app_settings (key TEXT, value TEXT);
    CREATE TABLE raw_pos_orders (id TEXT, source_order_id TEXT, pos_id TEXT, phone TEXT, first_confirmed_at TEXT, status_code INTEGER, marketer_id TEXT, seller_id TEXT, net_total INTEGER, current_total INTEGER, total_discount INTEGER);
    INSERT INTO pos_users VALUES ('m1','An MKT','Marketing'),('s1','Bình SALE','Sale'),('c1','Chi CSKH','CSKH');
    INSERT INTO raw_pos_orders VALUES
      ('1','A1','p1','0900','2026-11-06T03:00:00',3,'m1','s1',100,NULL,NULL),
      ('2','A2','p1','0901','2026-11-06T04:00:00',3,'m1','c1',50,NULL,NULL),
      ('3','A3','p1','0902','2026-11-06T05:00:00',6,'m1','s1',70,NULL,NULL),
      ('4','A4','p2','0903','2026-11-06T05:00:00',3,'m1','s1',70,NULL,NULL),
      ('5','A5','p1','0904','2026-11-08T05:00:00',3,'m1','s1',70,NULL,NULL);`);
  const run = (kind: 'new' | 'cskh') => { const q = mktOrdersSql({ posIds: ['p1'], marketerIds: ['m1'], kind, startUtc: '2026-11-05T17:00:00', endUtc: '2026-11-06T17:00:00' }); return (d.prepare(q.sql).all(...q.binds) as { source_order_id: string; net: number }[]).map((r) => [r.source_order_id, r.net]); };
  assert.deepEqual(run('new'), [['A1', 100]]);
  assert.deepEqual(run('cskh'), [['A2', 50]]);
});
