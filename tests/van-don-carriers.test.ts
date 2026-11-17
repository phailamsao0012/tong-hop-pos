import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carrierKey, vanDonCarriers } from '../lib/reports/van-don-carriers';
import { demoWorld } from './support/d1-sqlite';
import { POS } from '../lib/shared/report-model';

void test('carrierKey: chuẩn hoá tên ĐVVC trên Pancake', () => {
  assert.deepEqual(['VTP', 'Viettel Post', 'SPX Express', 'Shopee Xpress', 'J&T', 'J&T Express', 'GHN', 'Giao Hàng Tiết Kiệm', '', null].map(carrierKey),
    ['VTP', 'VTP', 'SPX', 'SPX', 'J&T', 'J&T', 'GHN', 'GHTK', 'Khác', 'Khác']);
});

void test('vanDonCarriers chạy được trên thế giới demo, tổng = cộng các dòng', async () => {
  const days = ['2026-10-15', '2026-10-16'];
  await demoWorld(days, Date.parse('2026-10-17T03:00:00Z'));
  const r = await vanDonCarriers(POS.map((p) => p.id), days[0], days[1]);
  assert.equal(r.total.orders, r.rows.reduce((a, x) => a + x.orders, 0));
});
