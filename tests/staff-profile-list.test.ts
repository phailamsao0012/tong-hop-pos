import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPeople, fold, type ProfilePerson } from '../lib/reports/staff-profile-list';
import { OWNER_VIEWS, canView, parseAccess } from '../lib/auth/access';

const people: ProfilePerson[] = [
  { id: '1', name: 'Phạm Quỳnh MKT', dept: 'mkt' },
  { id: '2', name: 'Đức Anh SALE', dept: 'sale' },
  { id: '3', name: 'An CSKH', dept: 'cskh' },
  { id: '4', name: 'Bình SALE', dept: 'sale' },
];

void test('tìm không dấu, chữ đ', () => {
  assert.equal(fold('Đức Quỳnh'), 'duc quynh');
  assert.deepEqual(filterPeople(people, 'quynh', 'all').map((p) => p.id), ['1']);
  assert.deepEqual(filterPeople(people, 'duc', 'all').map((p) => p.id), ['2']);
});

void test('lọc bộ phận, người nghỉ xuống cuối', () => {
  assert.deepEqual(filterPeople(people, '', 'sale').map((p) => p.id), ['4', '2']);
  assert.deepEqual(filterPeople(people, '', 'sale', (id) => id === '4').map((p) => p.id), ['2', '4']);
  assert.equal(filterPeople(people, '', 'all').length, 4);
});

void test('trang Hồ sơ chỉ chủ hệ thống', () => {
  assert.ok(OWNER_VIEWS.includes('ho-so'));
  assert.equal(canView(parseAccess({ role: 'owner' }), 'ho-so'), true);
  assert.equal(canView(parseAccess({ role: 'director', views_json: JSON.stringify(['ho-so']) }), 'ho-so'), false);
  assert.equal(canView(parseAccess({ role: 'lead', views_json: JSON.stringify(['ho-so']) }), 'ho-so'), false);
});
