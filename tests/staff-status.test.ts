import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyStatusChanges, cleanStatusMap, parseStatusJson } from '../lib/teams/staff-status';

void test('trạng thái nhân viên: chỉ giữ tạm nghỉ / đã nghỉ, "đang làm" là xoá (anh Vũ 04/11/2026)', () => {
  assert.deepEqual(cleanStatusMap({ a: 'paused', b: 'left', c: 'working', d: 'xyz', ['x'.repeat(101)]: 'left' }), { a: 'paused', b: 'left' });
  assert.deepEqual(cleanStatusMap([1, 2]), {});
  assert.deepEqual(parseStatusJson('không phải json'), {});
  assert.deepEqual(parseStatusJson(null), {});
  const prev = { a: 'paused', b: 'left' } as const;
  assert.deepEqual(applyStatusChanges(prev, { a: 'working', c: 'left', d: 'nghỉ' }), { b: 'left', c: 'left' });
  assert.deepEqual(applyStatusChanges(prev, 'rác'), prev);
});
