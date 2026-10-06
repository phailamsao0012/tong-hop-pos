import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTeams, computePosTeams, isSnapshot, primaryAssignment, teamFor, type HrDepartment, type HrSnapshot } from '../lib/hr-copy';
import { LEFT_STAFF_SQL, setHrTeams, teamSubquery } from '../lib/team';

const snap: HrSnapshot = {
  offices: [{ id: 'of_hn', name: 'Hà Nội' }],
  departments: [
    { id: 'kd', name: 'Phòng Kinh doanh', parent_id: null, kind: 'department', office_id: null, director_employee_id: null, active: 1 },
    { id: 'sale', name: 'Sale Hà Nội', parent_id: 'kd', kind: 'team', office_id: 'of_hn', director_employee_id: null, active: 1 },
    { id: 'cskh', name: 'CSKH Hà Nội', parent_id: 'kd', kind: 'team', office_id: 'of_hn', director_employee_id: null, active: 1 },
    { id: 'mkt', name: 'Marketing', parent_id: null, kind: 'department', office_id: null, director_employee_id: null, active: 1 },
  ],
  levels: [{ id: 'tp', name: 'Trưởng phòng', rank: 20, is_manager: 1 }, { id: 'ld', name: 'Leader', rank: 30, is_manager: 1 }, { id: 'nv', name: 'Nhân viên', rank: 50, is_manager: 0 }],
  titles: [{ id: 'jt_sale', name: 'Sale' }],
  employees: ['tp', 'ld', 'a', 'b', 'm'].map((id) => ({ id, code: id, full_name: `Người ${id}`, email: null, phone: null, office_id: null, joined_on: null, status: 'chinh_thuc', left_on: null, main_user_id: null })),
  assignments: [
    { id: '1', employee_id: 'tp', department_id: 'kd', level_id: 'tp', title_id: null, manager_employee_id: null, is_primary: 1, start_on: '2025-01-01', end_on: null },
    { id: '2', employee_id: 'ld', department_id: 'sale', level_id: 'ld', title_id: null, manager_employee_id: 'tp', is_primary: 1, start_on: '2025-01-01', end_on: null },
    // a: kiêm nhiệm CSKH nhưng vai trò chính là Sale → tính Sale.
    { id: '3', employee_id: 'a', department_id: 'sale', level_id: 'nv', title_id: null, manager_employee_id: 'ld', is_primary: 1, start_on: '2025-01-01', end_on: null },
    { id: '4', employee_id: 'a', department_id: 'cskh', level_id: 'nv', title_id: null, manager_employee_id: null, is_primary: 0, start_on: '2025-06-01', end_on: null },
    // b: đã chuyển từ Sale sang CSKH.
    { id: '5', employee_id: 'b', department_id: 'sale', level_id: 'nv', title_id: null, manager_employee_id: 'ld', is_primary: 1, start_on: '2025-01-01', end_on: '2026-08-31' },
    { id: '6', employee_id: 'b', department_id: 'cskh', level_id: 'nv', title_id: null, manager_employee_id: null, is_primary: 1, start_on: '2026-09-01', end_on: null },
    { id: '7', employee_id: 'm', department_id: 'mkt', level_id: 'nv', title_id: null, manager_employee_id: null, is_primary: 1, start_on: '2025-01-01', end_on: null },
  ],
  posAccounts: [{ pos_user_id: 'p_ld', employee_id: 'ld' }, { pos_user_id: 'p_a', employee_id: 'a' }, { pos_user_id: 'p_b', employee_id: 'b' }, { pos_user_id: 'p_m', employee_id: 'm' }, { pos_user_id: 'p_tp', employee_id: 'tp' }],
};

test('isSnapshot checks every list', () => {
  assert.equal(isSnapshot(snap), true);
  assert.equal(isSnapshot({ ...snap, employees: null }), false);
});

test('primary role wins over concurrent roles, and moves follow dates', () => {
  const byPos = new Map(computePosTeams(snap, '2026-09-30').map((r) => [r.pos_user_id, r]));
  assert.equal(byPos.get('p_a')?.team, 'sale');
  assert.equal(byPos.get('p_b')?.team, 'cskh');
  assert.equal(byPos.get('p_m')?.team, 'mkt');
  assert.equal(computePosTeams(snap, '2026-08-15').find((r) => r.pos_user_id === 'p_b')?.team, 'sale');
});

test('Leader is the direct manager and Trưởng phòng is found up the chain', () => {
  const a = computePosTeams(snap, '2026-09-30').find((r) => r.pos_user_id === 'p_a')!;
  assert.equal(a.leader_name, 'Người ld');
  assert.equal(a.manager_pos_user_id, 'p_ld');
  assert.equal(a.head_name, 'Người tp');
  assert.equal(computePosTeams(snap, '2026-09-30').find((r) => r.pos_user_id === 'p_tp')?.head_name, null);
});

test('phòng nằm dưới phòng khác không mượn tên phòng cấp trên; team vẫn mượn tên phòng chứa nó', () => {
  const dept = (id: string, name: string, parent_id: string | null, kind: string): HrDepartment => ({ id, name, parent_id, kind, office_id: null, director_employee_id: null, active: 1 });
  const depts = new Map([
    dept('bgd', 'Ban Giám đốc', null, 'board'),
    dept('cskh_tn', 'CSKH Thái Nguyên', 'bgd', 'department'),
    dept('kho', 'Vận đơn và Kho', 'cskh_tn', 'department'),
    dept('kho_a', 'Team Đóng gói', 'kho', 'team'),
    dept('team_huong', 'Team Hương', 'cskh_tn', 'team'),
    dept('nhom', 'Nhóm ca tối', 'team_huong', 'team'),
    dept('sale_khoi', 'Khối Sale', null, 'board'),
    dept('kd', 'Kinh doanh Hà Nội', 'sale_khoi', 'department'),
  ].map((d) => [d.id, d]));
  assert.equal(teamFor('kho', null, depts), 'other');
  assert.equal(teamFor('kho_a', null, depts), 'other');
  assert.equal(teamFor('team_huong', null, depts), 'cskh');
  assert.equal(teamFor('nhom', null, depts), 'cskh');
  assert.equal(teamFor('cskh_tn', null, depts), 'cskh');
  // Ban/khối phía trên phòng cũng không quyết; chức danh vẫn được xét.
  assert.equal(teamFor('kd', null, depts), 'other');
  assert.equal(teamFor('kd', 'Nhân viên Sale', depts), 'sale');
  assert.equal(teamFor('kho', 'Nhân viên CSKH', depts), 'cskh');
});

test('leavers keep their last primary team', () => {
  const ended = { ...snap, assignments: snap.assignments.map((a) => a.employee_id === 'a' ? { ...a, end_on: '2026-09-10' } : a) };
  assert.equal(computePosTeams(ended, '2026-09-30').find((r) => r.pos_user_id === 'p_a')?.team, 'sale');
  assert.equal(primaryAssignment([], '2026-09-30'), null);
});

test('compareTeams reports people and revenue per team, unlinked sellers keep Pancake', () => {
  const sellers = [
    { id: 'p_a', name: 'A', pancake: 'sale' as const, revenue: 100 },
    { id: 'p_b', name: 'B', pancake: 'sale' as const, revenue: 50 },
    { id: 'x', name: 'X', pancake: 'cskh' as const, revenue: 10 },
  ];
  const r = compareTeams(sellers, new Map([['p_a', 'sale'], ['p_b', 'cskh']]));
  assert.equal(r.matched, false);
  assert.deepEqual(r.mismatches.map((m) => m.id), ['p_b']);
  const sale = r.rows.find((x) => x.team === 'sale')!, cskh = r.rows.find((x) => x.team === 'cskh')!;
  assert.deepEqual([sale.pancakeRevenue, sale.hrRevenue, cskh.pancakeRevenue, cskh.hrRevenue], [150, 100, 10, 60]);
  assert.equal(compareTeams(sellers.slice(0, 1), new Map([['p_a', 'sale']])).matched, true);
});

test('team filter only reads the HR copy when switched on', () => {
  assert.ok(!teamSubquery('sale')!.includes("team='sale'"));
  setHrTeams(true);
  assert.ok(teamSubquery('sale')!.includes("team='sale'"));
  setHrTeams(false);
  assert.equal(teamSubquery('all'), null);
});

test('chỉ người web nhân sự ghi đã nghỉ mới thôi đo; chưa gắn hồ sơ vẫn giữ', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE pos_users(user_id TEXT, name TEXT, department TEXT, is_active INTEGER);
    INSERT INTO pos_users VALUES ('dang_lam','A','Sale',0),('da_nghi','B','Sale',1),('moi','C','Sale',1),('tat_pos','D','Sale',0);
    CREATE TABLE hr_pos_team(pos_user_id TEXT PRIMARY KEY, team TEXT, status TEXT);
    INSERT INTO hr_pos_team VALUES ('dang_lam','sale','chinh_thuc'),('da_nghi','sale','da_nghi');`);
  const ids = (sql: string) => (db.prepare(sql).all() as { user_id: string }[]).map((r) => r.user_id).sort();
  assert.deepEqual(ids(teamSubquery('sale')!.slice(1, -1)), ['dang_lam', 'moi', 'tat_pos']);
  setHrTeams(true);
  assert.deepEqual(ids(teamSubquery('sale')!.slice(1, -1)), ['dang_lam', 'moi', 'tat_pos']);
  setHrTeams(false);
  assert.deepEqual(ids(LEFT_STAFF_SQL), ['da_nghi']);
});
