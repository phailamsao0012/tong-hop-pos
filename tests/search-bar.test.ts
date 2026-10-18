import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRows, searchParams, readSearchState } from '../app/search-bar';

void test('search-bar: không nhóm giữ nguyên thứ tự và số dòng', () => {
  const rows = [{ pos: 'A', net: 10 }, { pos: 'B', net: 20 }, { pos: 'A', net: 5 }];
  assert.deepEqual(groupRows(rows), [{ key: '', items: rows }]);
  const groups = groupRows(rows, r => r.pos);
  assert.deepEqual(groups.map(g => [g.key, g.items.length, g.items.reduce((n, r) => n + r.net, 0)]), [['A', 2, 15], ['B', 1, 20]]);
  assert.equal(groups.flatMap(g => g.items).length, rows.length);
  assert.deepEqual(rows.map(r => r.net), [10, 20, 5]);
});
void test('search-bar: nhóm rỗng và giá trị chưa có không mất dòng', () => {
  assert.deepEqual(groupRows([], () => ''), []);
  assert.equal(groupRows([{ seller: '' }, { seller: '' }], r => r.seller)[0].items.length, 2);
});
void test('search-bar: tham số giữ giá trị rỗng, số, nguồn, ngày và ký tự đặc biệt', () => {
  const params = searchParams({ posIds: 'a,b', q: 'Khách A & B', page: 2, size: 25, group: '', sellerId: '', team: 'cskh', orderOrigin: 'mkt', marketerId: 'nv-a', start: '2026-10-01', end: undefined });
  assert.equal(params.get('q'), 'Khách A & B'); assert.equal(params.get('group'), '');
  assert.equal(params.get('posIds'), 'a,b'); assert.equal(params.get('page'), '2');
  assert.equal(params.get('orderOrigin'), 'mkt'); assert.equal(params.get('marketerId'), 'nv-a');
  assert.equal(params.has('end'), false); assert.equal(params.get('start'), '2026-10-01');
});
void test('search-bar: Yêu thích chỉ áp giá trị và nhóm được trang hỗ trợ', () => {
  const filters = [{ key: 'posIds', label: 'POS', multiple: true, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }];
  assert.deepEqual(readSearchState({ text: 'Khách A', filters: { posIds: 'a,unknown,b', other: 'x' }, groupBy: 'unknown' }, filters, [{ value: 'pos' }]), { text: 'Khách A', filters: { posIds: 'a,b' }, groupBy: '' });
  assert.equal(readSearchState(null, filters, []), null);
  assert.equal(readSearchState({ text: 123 }, filters, []), null);
});
