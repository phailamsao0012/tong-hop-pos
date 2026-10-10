import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupTeams, NO_TEAM, type DeptRow, type TeamRow } from '../lib/hr-teams';

const depts: DeptRow[] = [
  { id: 'kd', name: 'Phòng Kinh doanh', parent_id: null, kind: 'department', office_id: null },
  { id: 't1', name: 'CSKH Thái Nguyên', parent_id: 'kd', kind: 'team', office_id: 'tn' },
  { id: 't2', name: 'Sale Thái Nguyên', parent_id: 'kd', kind: 'team', office_id: 'tn' },
];
const row = (p: Partial<TeamRow> & { pos_user_id: string; employee_id: string }): TeamRow => ({
  employee_name: p.pos_user_id, team: 'cskh', department: null, department_id: null, level: null, title: null, leader_employee_id: null, leader_name: null, head_name: null, status: 'chinh_thuc', ...p,
});

test('gom theo team, tìm Leader và Trưởng phòng, người chưa vào team xuống cuối', () => {
  const rows = [
    row({ pos_user_id: 'a', employee_id: 'ea', department_id: 't1', department: 'CSKH Thái Nguyên', leader_employee_id: 'el', leader_name: 'Lan', head_name: 'Nghĩa' }),
    row({ pos_user_id: 'l', employee_id: 'el', department_id: 't1', department: 'CSKH Thái Nguyên', leader_name: 'Nghĩa', head_name: 'Nghĩa' }),
    // Chưa có department_id: không đoán theo tên nữa (10/10/2026, cùng quy tắc với bộ lọc team), về "Chưa vào team".
    row({ pos_user_id: 'b', employee_id: 'eb', department: 'CSKH Thái Nguyên', leader_employee_id: 'el', leader_name: 'Lan', head_name: 'Nghĩa' }),
    row({ pos_user_id: 'c', employee_id: 'ec', department_id: 'kd', department: 'Phòng Kinh doanh' }),
    row({ pos_user_id: 's', employee_id: 'es', team: 'sale', department_id: 't2' }),
  ];
  const g = groupTeams(rows, depts, new Map([['tn', 'Thái Nguyên']]), 'cskh');
  assert.deepEqual(g.map((x) => x.id), ['t1', NO_TEAM]);
  assert.equal(g[0].leader, 'Lan');
  assert.equal(g[0].head, 'Nghĩa');
  assert.equal(g[0].office, 'Thái Nguyên');
  assert.equal(g[0].parent, 'Phòng Kinh doanh');
  assert.deepEqual(g[0].members.map((m) => m.posUserId), ['l', 'a']);
  assert.ok(g[0].members[0].isLeader);
  assert.deepEqual(g[1].members.map((m) => m.posUserId), ['b', 'c']);
});
