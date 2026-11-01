import assert from 'node:assert/strict';
import test from 'node:test';
import { vanDonLabel } from '../lib/shared/van-don-label';

void test('Vận đơn: đổi nhãn dùng chung, giữ số và ngoại lệ tên thẻ', () => {
  assert.equal(vanDonLabel('Doanh thu 120 · người bán · ngày chốt'), 'Doanh số chuyển đi 120 · Người lên đơn · ngày vào Chờ xác nhận');
  assert.equal(vanDonLabel('Đơn chốt · 96,9% so với Đơn chốt'), 'Đơn chốt · 96,9% so với Đơn chốt');
  assert.equal(vanDonLabel('Bán · bảng · bán hàng'), 'lên đơn · bảng · lên đơn hàng');
});

void test('Vận đơn: lý do dùng ngày vào Chờ xác nhận và giữ nguyên nội dung hợp lệ', () => {
  assert.equal(vanDonLabel('Chưa bao gồm số được chia chưa chốt và đơn chưa có ngày chốt.'), 'Chưa bao gồm số được chia chưa vào Chờ xác nhận và đơn chưa có ngày vào Chờ xác nhận.');
  const text = 'Đơn chuyển đi · Doanh số chuyển đi · Người lên đơn · 12,5%';
  assert.equal(vanDonLabel(text), text);
});
