import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPermissionTree, posLabel } from '../lib/teams/permission-tree';
import type { WebTeam } from '../lib/teams/web-teams';

const id = (n: number) => `wt_00000000-0000-0000-0000-00000000000${n}`;
const teams: WebTeam[] = [
  { id: id(1), name: 'CSKH demo 1', dept: 'cskh', office: 'Hà Nội', memberIds: ['a', 'b'], mentorUserId: 'm1', leaderUserId: 'l1' },
  { id: id(2), name: 'CSKH demo 2', dept: 'cskh', office: 'Hà Nội,Thái Nguyên', memberIds: ['c'], mentorUserId: 'm2', leaderUserId: 'l1' },
  { id: id(3), name: 'Sale demo', dept: 'sale', office: null, memberIds: ['d'], mentorUserId: 'm3', leaderUserId: null },
];
const names = new Map([['a', 'NV A CSKH'], ['b', 'NV B CSKH'], ['c', 'NV C CSKH'], ['d', 'NV D SALE']]);

void test('sơ đồ quyền: Giám đốc → Leader → Mentor, mỗi người đúng bộ phận, POS và người xem được', () => {
  const t = buildPermissionTree([
    { id: 'g', name: 'Giám đốc demo', role: 'director', team: null, posIds: null },
    { id: 'l1', name: 'Leader demo', role: 'lead', team: 'cskh', posIds: ['sieu-vo-gao'] },
    { id: 'm1', name: 'Mentor 1', role: 'mentor', team: 'cskh', posIds: ['sieu-vo-gao'] },
    { id: 'm2', name: 'Mentor 2', role: 'mentor', team: 'sale', posIds: [] },
    { id: 'm3', name: 'Mentor 3', role: 'mentor', team: null, posIds: null },
    { id: 'm4', name: 'Mentor 4', role: 'mentor', team: 'cskh', posIds: null },
    { id: 's', name: 'Nhân viên demo', role: 'staff', team: 'sale', posIds: null },
    { id: 'o', name: 'Chủ', role: 'owner', team: null, posIds: null },
  ], teams, names);
  assert.deepEqual(t.top.map((a) => [a.name, a.dept, a.people]), [['Giám đốc demo', 'all', null]]);
  assert.equal(t.leaders.length, 1);
  const l = t.leaders[0];
  assert.equal(l.dept, 'cskh'); assert.deepEqual(l.people, ['NV A CSKH', 'NV B CSKH', 'NV C CSKH']); assert.equal(posLabel(l.pos), 'Siêu Vô Gạo');
  assert.deepEqual(l.mentors.map((m) => m.name), ['Mentor 1', 'Mentor 2']);
  assert.deepEqual(l.mentors[0].people, ['NV A CSKH', 'NV B CSKH']);
  assert.match(l.mentors[1].warnings.join(' '), /bộ phận Sale nhưng team phụ trách là CSKH/);
  assert.match(l.mentors[1].warnings.join(' '), /Chưa cấp POS/);
  assert.deepEqual(t.loneMentors.map((m) => m.name), ['Mentor 3', 'Mentor 4']);
  assert.match(t.loneMentors[1].warnings[0], /Chưa gán team nào/);
  assert.deepEqual(t.others.map((a) => a.name), ['Nhân viên demo']);
  assert.ok(![...t.top, ...t.others].some((a) => a.role === 'owner'));
});
