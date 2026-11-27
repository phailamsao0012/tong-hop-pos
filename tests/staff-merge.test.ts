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

void test('người chỉ có ở báo cáo tổng quan vẫn có một dòng (cột riêng rỗng); đang chọn người thì chỉ thêm người được chọn', async () => {
  const { staffRowsWithCommon } = await import('../lib/reports/staff-merge');
  const m = overviewStaffCommon([{ ...A, name: 'Người A' }, { ...B, name: 'Người B' }], undefined, 'created', dept.closedNet);
  const blank = (sellerId: string, name: string) => ({ sellerId, name, closedNet: 0 });
  const rows = staffRowsWithCommon([{ sellerId: 'a', name: 'Người A', closedNet: 9 }, { sellerId: 'x', name: 'Người X', closedNet: 3 }], m, blank);
  assert.deepEqual(rows.map((r) => [r.sellerId, r.onlyCommon ?? false]), [['a', false], ['x', false], ['b', true]]);
  assert.equal(rows[2].name, 'Người B');
  const total = staffCommonTotal(rows.map((r) => m.get(r.sellerId)).filter((x) => !!x), dept.closedNet);
  assert.equal(total.closedNet, dept.closedNet, 'dòng Tổng = ô đầu trang dù bảng nhóm sản phẩm thiếu người');
  assert.deepEqual(staffRowsWithCommon([], m, blank, ['a']).map((r) => r.sellerId), ['a']);
  assert.equal(staffRowsWithCommon([{ sellerId: 'a', name: '', closedNet: 0 }], undefined, blank).length, 1, 'không có số chung: giữ nguyên');
});

void test('CSKH (số ảo): dòng Tổng bảng gộp = ô Doanh thu CSKH đầu trang, tỷ trọng không quá 100%', async () => {
  const { demoWorld } = await import('./support/d1-sqlite');
  const { overviewReport } = await import('../lib/reports/overview-report');
  const { POS } = await import('../lib/shared/report-model');
  const { raw } = await demoWorld(['2026-10-14', '2026-10-15'], Date.parse('2026-10-16T03:00:00Z'));
  try {
    for (const team of ['cskh', 'sale'] as const) {
      const r = await overviewReport({ posIds: POS.map((p) => p.id), start: '2026-10-14', end: '2026-10-15', team });
      const deptNet = r.current.total.closedNet;
      assert.ok(deptNet > 0, `${team}: có số`);
      const m = overviewStaffCommon(r.current.byEmployee, undefined, 'created', deptNet);
      const total = staffCommonTotal([...m.values()], deptNet);
      assert.equal(Math.round(total.closedNet), Math.round(deptNet), `${team}: tổng bảng = ô đầu trang`);
      assert.ok((total.share ?? 0) <= 100.0001, `${team}: tỷ trọng ${total.share}`);
    }
  } finally { raw.close(); }
});
