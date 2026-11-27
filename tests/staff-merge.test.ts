import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overviewStaffCommon, staffCommonTotal, groupStaffCommon } from '../lib/reports/staff-merge';
import { closeRateOf, closeRateOfMany } from '../lib/reports/metrics';

// Hai người ảo; ô đầu trang (tổng bộ phận) = cộng hai người (mọi đơn đều có người bán).
const A = { sellerId: 'a', closedNet: 6_000_000, closedOrders: 12, orders: 30, assignedOrders: 40, createdClosedOrders: 11, assignedClosedOrders: 12 };
const B = { sellerId: 'b', closedNet: 2_000_000, closedOrders: 4, orders: 20, assignedOrders: 10, createdClosedOrders: 4, assignedClosedOrders: 3 };
const dept = { closedNet: 8_000_000, closedOrders: 16, orders: 50, assignedOrders: 50, createdClosedOrders: 15, assignedClosedOrders: 15 };

void test('bảng nhân viên gộp: tổng bảng = ô số đầu trang; mỗi người một tỷ lệ chốt theo Cách tính', () => {
  for (const base of ['created', 'assigned'] as const) {
    const m = overviewStaffCommon([A, B], [{ sellerId: 'a', packedNet: 4_500_000 }], base, dept.closedNet);
    const total = staffCommonTotal([...m.values()], dept.closedNet);
    assert.equal(total.closedNet, dept.closedNet);
    assert.equal(total.closedOrders, dept.closedOrders);
    assert.equal(total.rate, closeRateOf(dept, base), `tỷ lệ chốt dòng tổng = ô đầu trang (${base})`);
    assert.equal(total.rate, closeRateOfMany([A, B], base));
    // Một người một tỷ lệ chốt, đúng công thức ô đầu trang.
    assert.equal(m.get('a')!.rate, closeRateOf(A, base));
    assert.equal(m.get('b')!.rate, closeRateOf(B, base));
    assert.equal(m.get('a')!.share, 75);
    assert.equal(total.share, 100);
  }
  const m = overviewStaffCommon([A, B], [{ sellerId: 'a', packedNet: 4_500_000 }], 'created', dept.closedNet);
  assert.equal(m.get('a')!.averageOrder, 500_000);
  assert.equal(m.get('a')!.packedShare, 75);
  assert.equal(m.get('b')!.packedNet, 0, 'không có trong packedStaff = 0');
  assert.equal(staffCommonTotal([...m.values()], dept.closedNet).packedNet, 4_500_000);
  // Số chia ẩn với tài khoản này: tỷ lệ theo "được chia" là gạch.
  const hidden = overviewStaffCommon([{ ...A, assignedHidden: true }], undefined, 'assigned', A.closedNet);
  assert.equal(hidden.get('a')!.rate, null);
  assert.equal(staffCommonTotal([...hidden.values()], A.closedNet).rate, null);
  assert.equal(hidden.get('a')!.packedNet, undefined, 'CSKH / không có packedStaff');
});

void test('CSKH: số chung lấy từ bảng nhóm sản phẩm, không có tỷ lệ chốt', () => {
  const c = groupStaffCommon({ closed: 5, closedNet: 1_500_000 }, 3_000_000);
  assert.equal(c.averageOrder, 300_000);
  assert.equal(c.share, 50);
  assert.equal(c.rate, null);
});
