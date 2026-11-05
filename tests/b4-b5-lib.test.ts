// Cải tổ B4/B5 (05/11/2026): SQL và logic dời từ app/api/**/route.ts sang lib/. Test các phần logic thuần đã tách ra
// (không cần D1) và một vòng ghi / đọc ca làm trên D1 giả. Số ảo, không có dữ liệu thật.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketOf } from '../lib/reports/pipeline-report';
import { estimatedIn } from '../lib/reports/van-don-report';
import { normalizedPhone } from '../lib/reports/live-report';
import { uncountedScope } from '../lib/reports/uncounted-report';
import { hideCskhAssigned } from '../lib/reports/overview-api';
import { cleanPos, cleanRole, cleanTeam, cleanViews } from '../lib/auth/user-admin';
import { POS } from '../lib/shared/report-model';

void test('pipeline: mỗi trạng thái đơn vào đúng các bậc của Vận hành đơn', () => {
  assert.deepEqual(bucketOf(0), ['unconfirmed']);
  assert.deepEqual(bucketOf(17), ['closed', 'processing', 'pending']);
  assert.deepEqual(bucketOf(6), ['closed', 'cancelled']);
  assert.deepEqual(bucketOf(2), ['closed', 'shipped', 'shipping']);
  for (const c of [3, 16]) assert.deepEqual(bucketOf(c), ['closed', 'shipped', 'delivered']);
  for (const c of [4, 5, 15]) assert.deepEqual(bucketOf(c), ['closed', 'shipped', 'returned']);
  assert.deepEqual(bucketOf(1), ['closed', 'processing', 'confirmed']);
  assert.deepEqual(bucketOf(8), ['closed', 'processing', 'packing']);
  assert.deepEqual(bucketOf(9), ['closed', 'processing', 'waiting']);
  for (const c of [11, 12, 13, 20]) assert.deepEqual(bucketOf(c), ['closed', 'processing', 'other']);
});

void test('van-don: số đơn ước tính giờ gửi chỉ cộng các tháng chạm kỳ; JSON hỏng thì 0', () => {
  const row = { value: JSON.stringify({ '2026-08': 3, '2026-09': 5, '2026-10': 7 }) };
  assert.equal(estimatedIn(row, '2026-09-15', '2026-10-02'), 12);
  assert.equal(estimatedIn(row, '2026-10-01', '2026-10-31'), 7);
  assert.equal(estimatedIn(undefined, '2026-09-01', '2026-09-30'), 0);
  assert.equal(estimatedIn({ value: '{hỏng' }, '2026-09-01', '2026-09-30'), 0);
});

void test('live: SĐT chuẩn hoá về đầu 0, bỏ ký tự lạ', () => {
  assert.equal(normalizedPhone('+84 901 000 001'), '0901000001');
  assert.equal(normalizedPhone('84901000001'), '0901000001');
  assert.equal(normalizedPhone('090.100.0001'), '0901000001');
  assert.equal(normalizedPhone('abc'), '');
});

void test('uncounted: kiểm khoảng ngày và POS trước khi đọc D1', () => {
  assert.deepEqual(uncountedScope(new URLSearchParams('start=2026-10-02&end=2026-10-01')), { error: 'Khoảng ngày không hợp lệ.' });
  assert.deepEqual(uncountedScope(new URLSearchParams('start=2026-10-01&end=2026-10-02&posIds=khong-co')), { error: 'POS không hợp lệ.' });
  const s = uncountedScope(new URLSearchParams(`start=2026-10-01&end=2026-10-02&posIds=${POS[0].id}`));
  assert.ok(!('error' in s));
  assert.deepEqual(s.posIds, [POS[0].id]);
  assert.equal(s.ph, '?');
  const all = uncountedScope(new URLSearchParams('start=2026-10-01&end=2026-10-01'));
  assert.ok(!('error' in all));
  assert.equal(all.posIds.length, POS.length);
  assert.ok(all.startUtc < all.endUtc);
});

void test('overview: che số chia của người CSKH; xem bộ phận CSKH thì che cả tổng', () => {
  type R = { department?: string | null; assignedOrders: number; assignedCloseRate: number | null; assignedHidden: boolean };
  const row = (department: string | null): R => ({ department, assignedOrders: 9, assignedCloseRate: 50, assignedHidden: false });
  const part = () => ({ byEmployee: [row('Sale HN'), row('CSKH HN')], byEmployeePos: [row('Chăm sóc khách hàng')], total: row(null), byPos: [row(null)], series: [row(null)], byEmployeeDay: [{ assignedOrders: 4 }] });
  const make = () => ({ current: part(), compare: part(), origins: [row(null)] });
  const sale = make();
  hideCskhAssigned(sale as never, 'sale');
  assert.equal(sale.current.byEmployee[0].assignedOrders, 9, 'người Sale giữ số');
  assert.equal(sale.current.byEmployee[1].assignedHidden, true);
  assert.equal(sale.compare.byEmployeePos[0].assignedOrders, 0);
  assert.equal(sale.current.total.assignedOrders, 9, 'xem Sale thì tổng giữ nguyên');
  const cskh = make();
  hideCskhAssigned(cskh as never, 'cskh');
  for (const r of [cskh.current.total, cskh.current.byPos[0], cskh.current.series[0], cskh.origins[0]]) assert.equal(r.assignedHidden, true);
  assert.equal(cskh.current.byEmployeeDay[0].assignedOrders, 0);
});

void test('tài khoản: chỉ nhận trang, POS, nhóm, vai trò hợp lệ', () => {
  assert.deepEqual(cleanViews(['overview', 'trang-la', 'overview']), ['overview']);
  assert.equal(cleanViews('overview'), null);
  assert.deepEqual(cleanPos([POS[0].id, 'khong-co']), [POS[0].id]);
  assert.equal(cleanTeam('sale'), 'sale');
  assert.equal(cleanTeam('all'), 'all');
  assert.equal(cleanTeam('x'), null);
  assert.equal(cleanRole('director'), 'director');
  assert.equal(cleanRole('admin'), null);
});

void test('ca làm: ghi rồi đọc lại; giờ bị kẹp trong ngày; trống cả hai thì xoá', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { raw } = emptyDb();
  const { listStaffSettings, saveStaffSettings } = await import('../lib/teams/staff-settings');
  await saveStaffSettings({ items: [{ userId: 'nv-a', shiftStart: 8, shiftEnd: 30 }, { userId: 'nv-b', shiftStart: -3, shiftEnd: 12.6 }, { userId: '', shiftStart: 1, shiftEnd: 2 }] }, { email: 'chu@ao.vn' });
  assert.deepEqual((await listStaffSettings()).sort((a, b) => a.userId.localeCompare(b.userId)), [
    { userId: 'nv-a', shiftStart: 8, shiftEnd: 24 },
    { userId: 'nv-b', shiftStart: 0, shiftEnd: 13 },
  ]);
  await saveStaffSettings({ items: [{ userId: 'nv-a', shiftStart: null, shiftEnd: null }] }, { email: 'chu@ao.vn' });
  assert.deepEqual((await listStaffSettings()).map((s) => s.userId), ['nv-b']);
  raw.close();
});
