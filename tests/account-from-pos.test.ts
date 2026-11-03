import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupPosPeople,
  setOwnedTeams,
  teamsOwnedBy,
  teamsWithPerson,
} from '@/lib/teams/account-from-pos';

const teams = [
  { id: 't1', memberIds: ['p1', 'p2'], mentorUserId: 'u-old' },
  { id: 't2', memberIds: ['p3'], leaderUserId: 'u1' },
  { id: 't3', memberIds: ['p1'] },
];

void test('gộp người POS ở nhiều POS thành một', () => {
  const people = groupPosPeople([
    {
      user_id: 'p1',
      name: 'Nhân viên B SALE',
      pos_id: 'pos2',
      department: 'Sale',
      employee_id: null,
    },
    {
      user_id: 'p1',
      name: 'Nhân viên B SALE',
      pos_id: 'pos1',
      department: null,
      employee_id: 'e1',
    },
    {
      user_id: 'p0',
      name: 'Nhân viên A SALE',
      pos_id: 'pos1',
      department: null,
      employee_id: null,
    },
    {
      user_id: '',
      name: 'trống',
      pos_id: 'pos1',
      department: null,
      employee_id: null,
    },
  ]);
  assert.deepEqual(
    people.map((p) => p.id),
    ['p0', 'p1'],
  );
  assert.deepEqual(people[1], {
    id: 'p1',
    name: 'Nhân viên B SALE',
    department: 'Sale',
    posIds: ['pos2', 'pos1'],
    employeeId: 'e1',
  });
});

void test('team có tên người POS được tích sẵn', () => {
  assert.deepEqual(teamsWithPerson(teams, 'p1'), ['t1', 't3']);
  assert.deepEqual(teamsOwnedBy(teams, 'u1'), ['t2']);
});

void test('mentor vào ô Mentor team đã tích, gỡ khỏi team bỏ tích', () => {
  const r = setOwnedTeams(teams, 'u1', 'mentor', ['t1', 't3']);
  assert.equal(r.changed, true);
  assert.equal(r.teams[0].mentorUserId, 'u1');
  assert.equal(r.teams[1].leaderUserId, undefined);
  assert.equal(r.teams[2].mentorUserId, 'u1');
  assert.equal(teams[0].mentorUserId, 'u-old');
});

void test('trưởng nhóm vào ô Leader; vai trò khác chỉ gỡ; không đổi thì changed=false', () => {
  assert.equal(
    setOwnedTeams(teams, 'u2', 'lead', ['t3']).teams[2].leaderUserId,
    'u2',
  );
  assert.equal(setOwnedTeams(teams, 'u1', 'lead', ['t2']).changed, false);
  const staff = setOwnedTeams(teams, 'u1', 'director', ['t1']);
  assert.equal(staff.changed, true);
  assert.equal(staff.teams[0].mentorUserId, 'u-old');
  assert.equal(staff.teams[1].leaderUserId, undefined);
  assert.equal(setOwnedTeams(teams, 'u9', 'staff', []).changed, false);
});
