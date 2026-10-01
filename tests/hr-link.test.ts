import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPosStaff, safeNext, secretMatches, toIso } from '../lib/hr-link';

test('secretMatches needs a long server secret and an exact match', () => {
  const s = 'abcdefghijklmnop-123';
  assert.equal(secretMatches(s, s), true);
  assert.equal(secretMatches(s, `${s}x`), false);
  assert.equal(secretMatches(s, null), false);
  assert.equal(secretMatches('short', 'short'), false);
  assert.equal(secretMatches(undefined, ''), false);
});

test('safeNext only keeps local paths', () => {
  assert.equal(safeNext('/nhan-su?x=1'), '/nhan-su?x=1');
  assert.equal(safeNext('https://evil.example'), '/');
  assert.equal(safeNext('//evil.example'), '/');
  assert.equal(safeNext(null), '/');
});

test('toIso reads unix seconds, milliseconds and UTC strings without suffix', () => {
  assert.equal(toIso(1700000000), '2023-11-14T22:13:20.000Z');
  assert.equal(toIso(1700000000000), '2023-11-14T22:13:20.000Z');
  assert.equal(toIso('1700000000'), '2023-11-14T22:13:20.000Z');
  assert.equal(toIso('2024-03-01T08:00:00'), '2024-03-01T08:00:00.000Z');
  assert.equal(toIso('2024-03-01T08:00:00+07:00'), '2024-03-01T01:00:00.000Z');
  assert.equal(toIso(''), null);
  assert.equal(toIso('không phải ngày'), null);
});

test('groupPosStaff merges one Pancake account across POS and keeps the earliest creation date', () => {
  const base = { email: null, phone: null, is_active: 1, department: 'Sale', sale_group: null, source_created_at: null };
  const staff = groupPosStaff([
    { ...base, user_id: 'u1', pos_id: 'bio-nano', name: 'Lan', source_created_at: '2024-05-02T00:00:00' },
    { ...base, user_id: 'u1', pos_id: 'mgt-apex', name: 'Lan', department: 'CSKH', phone: '0901', source_created_at: '2023-01-10T00:00:00' },
    { ...base, user_id: 'u2', pos_id: 'bio-nano', name: 'An', is_active: 0 },
    { ...base, user_id: 'sys', pos_id: 'bio-nano', name: 'API_CONNECTION' },
  ], new Map([['u2', '2024-02-03']]), new Map([['u2', '2024-09-30']]));
  assert.equal(staff.length, 2);
  const lan = staff.find((s) => s.posUserId === 'u1')!;
  assert.deepEqual(lan.posIds, ['bio-nano', 'mgt-apex']);
  assert.deepEqual(lan.departments, ['Sale', 'CSKH']);
  assert.equal(lan.phone, '0901');
  assert.equal(lan.createdAt, '2023-01-10T00:00:00.000Z');
  const an = staff.find((s) => s.posUserId === 'u2')!;
  assert.equal(an.active, false);
  assert.equal(an.createdAt, null);
  assert.equal(an.firstActivityDay, '2024-02-03');
  assert.equal(an.lastActivityDay, '2024-09-30');
  assert.equal(lan.lastActivityDay, null);
});
