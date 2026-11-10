import assert from 'node:assert/strict';
import { test } from 'node:test';
import { managedBy } from '../lib/teams/managed-by';

void test('managed-by: cộng người các team cùng quản lý, bỏ trùng, bỏ team chưa gán', () => {
  const teams = [
    { leader: 'L1', mentor: 'M1', people: ['A', 'B'] },
    { leader: 'L1', mentor: 'M2', people: ['B', 'C'] },
    { leader: null, mentor: 'M2', people: ['D'] },
  ];
  const leaders = managedBy(teams, (t) => t.leader, (t) => t.people);
  assert.deepEqual([...leaders], [['L1', ['A', 'B', 'C']]]);
  const mentors = managedBy(teams, (t) => t.mentor, (t) => t.people);
  assert.deepEqual(mentors.get('M1'), ['A', 'B']);
  assert.deepEqual(mentors.get('M2'), ['B', 'C', 'D']);
});
