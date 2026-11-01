import test from 'node:test';
import assert from 'node:assert/strict';
import { staffInPos } from '../lib/teams/pos-staff';

const ALL = ['p1', 'p2', 'p3'];
const staff = [
  { id: 'a', posIds: ['p1'] },
  { id: 'b', posIds: ['p2'] },
  { id: 'c', posIds: ['p1', 'p2'] },
  { id: 'd' },
];

void test('pos-staff: chọn một POS chỉ còn người của POS đó, người ở 2 POS vẫn hiện', () => {
  assert.deepEqual(staffInPos(staff, ['p1'], ALL).map((s) => s.id), ['a', 'c', 'd']);
  assert.deepEqual(staffInPos(staff, ['p2'], ALL).map((s) => s.id), ['b', 'c', 'd']);
  assert.deepEqual(staffInPos(staff, ['p3'], ALL).map((s) => s.id), ['d']);
});

void test('pos-staff: chọn đủ POS hoặc chưa chọn thì giữ nguyên', () => {
  assert.equal(staffInPos(staff, ALL, ALL).length, 4);
  assert.equal(staffInPos(staff, [], ALL).length, 4);
});
