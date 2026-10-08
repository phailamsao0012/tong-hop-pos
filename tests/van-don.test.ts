import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_REASON, buildVanDon, deptFor, type VdPerson, type VdRow } from '../lib/van-don';

const people = new Map<string, VdPerson>([
  ['s1', { id: 's1', name: 'Sale Một', team: 'Team A', dept: 'Sale' }],
  ['c1', { id: 'c1', name: 'CSKH Một', team: 'Team C', dept: 'CSKH' }],
  ['v1', { id: 'v1', name: 'VĐ Một', team: 'Team VĐ', dept: 'Vận đơn' }],
  ['v2', { id: 'v2', name: 'VĐ Hai', team: 'Team VĐ', dept: 'Vận đơn' }],
]);
const row = (r: Partial<VdRow>): VdRow => ({ seller_id: 's1', confirm_by: null, cancel_by: null, confirmed: 0, status_code: 17, reason: null, n: 1, net: 100, ...r });

test('vận đơn: hoàn tính cho cả người chốt và người xác nhận, không xác nhận được theo lý do', () => {
  const r = buildVanDon([
    row({ confirm_by: 'v1', confirmed: 1, status_code: 3, n: 8, net: 800 }),
    row({ confirm_by: 'v1', confirmed: 1, status_code: 5, n: 2, net: 200 }),
    row({ seller_id: 'c1', confirm_by: 'v2', confirmed: 1, status_code: 3, n: 5, net: 500 }),
    row({ cancel_by: 'v2', status_code: 6, reason: 'Không nghe máy', n: 3, net: 300 }),
    row({ cancel_by: 'v1', status_code: 6, reason: null, n: 1, net: 100 }),
    row({ status_code: 17, n: 4, net: 400 }),
    row({ confirm_by: 's1', confirmed: 1, status_code: 2, n: 1, net: 100 }),
  ], people);
  assert.equal(r.total.closed, 24);
  assert.equal(r.total.confirmed, 16);
  assert.equal(r.total.failed, 4);
  assert.equal(r.total.waiting, 4);
  assert.equal(r.total.sent, 16);
  assert.equal(r.total.returned, 2);
  assert.equal(r.total.returnRate, 12.5);
  assert.equal(r.total.confirmRate, 80);
  const s1 = r.sellers.find((x) => x.key === 's1')!;
  assert.equal(s1.closed, 19);
  assert.equal(s1.failed, 4);
  assert.equal(s1.self, 1);
  assert.equal(s1.returnRate, 2 / 11 * 100);
  const v1 = r.confirmers.find((x) => x.key === 'v1')!;
  assert.equal(v1.confirmed, 10);
  assert.equal(v1.failed, 1);
  assert.equal(v1.returnRate, 20);
  assert.equal(v1.dept, 'Vận đơn');
  // Đơn đang chờ không thuộc ai bên xác nhận.
  assert.equal(r.confirmers.reduce((a, c) => a + c.closed, 0), 20);
  assert.deepEqual(r.confirmerDepts.map((d) => [d.label, d.closed]), [['Vận đơn', 19], ['Sale', 1]]);
  assert.deepEqual(r.sellerDepts.map((d) => [d.label, d.closed]), [['Sale', 19], ['CSKH', 5]]);
  assert.deepEqual(r.reasons.map((x) => [x.reason, x.n]), [['Không nghe máy', 3], [NO_REASON, 1]]);
  assert.deepEqual(r.reasons[0].byConfirmer, [{ key: 'v2', label: 'VĐ Hai', n: 3 }]);
});

test('vận đơn: bộ phận theo team nhân sự hoặc tên phòng', () => {
  assert.equal(deptFor('sale', []), 'Sale');
  assert.equal(deptFor('cskh', ['x']), 'CSKH');
  assert.equal(deptFor('other', ['Vận đơn HN · Team Xác nhận', 'Phòng Vận đơn và Kho']), 'Vận đơn');
  assert.equal(deptFor('mkt', ['Phòng Marketing']), 'Khác');
});
