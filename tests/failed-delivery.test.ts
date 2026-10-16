import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { buildFailedDelivery, type FdOrder, type FdReport } from '../lib/failed-delivery';
import { GET } from '../app/api/reports/giao-that-bai/route';
import { classifyApi } from '../lib/audit';
import { AUDIT_ACTIONS, AUDIT_GROUPS } from '../lib/audit-labels';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';

const nowMs = Date.parse('2026-10-14T05:00:00Z');
const order = (extra: Partial<FdOrder> = {}): FdOrder => ({ id: 'demo', posId: 'demo', sourceOrderId: 'demo', status: 2, net: 100, carrier: 'Hãng A Express', province: null, partnerStatus: 'undeliverable', undeliverableAt: '2026-10-13T04:00:00Z', sentAt: null, sellerId: 'seller-demo', careId: null, customerName: 'Khách demo', phone: '0900000001', ...extra });
void test('saved/lost/pending/saveRate; mẫu rỗng, hãng rỗng và trạng thái khác', () => {
  const r = buildFailedDelivery([2, 3, 16, 4, 15, 5, 7].map((status) => order({ status })), new Map(), nowMs);
  assert.deepEqual(r.stats, { failed: 7, saved: 2, lost: 3, pending: 1, saveRate: 40 });
  assert.equal(r.byCarrier[0].saveRate, 40);
  assert.equal(buildFailedDelivery([], new Map(), nowMs).stats.saveRate, null);
  const pending = buildFailedDelivery([order({ carrier: ' ' })], new Map(), nowMs);
  assert.equal(pending.byCarrier[0].key, 'Chưa có hãng');
  assert.equal(pending.byCarrier[0].saveRate, null);
});
void test('open xếp net giảm, cùng net lấy thất bại cũ trước; hoursSince và tên', () => {
  const r = buildFailedDelivery([order({ id: 'low', net: 1 }), order({ id: 'new', undeliverableAt: '2026-10-14T04:00:00Z' }), order({ id: 'old' }), order({ status: 3 })], new Map([['seller-demo', 'Người demo SALE']]), nowMs);
  assert.deepEqual(r.open.map((o) => o.id), ['old', 'new', 'low']);
  assert.equal(r.open[0].hoursSince, 25);
  assert.equal(r.open[0].sellerName, 'Người demo SALE');
  assert.equal(r.open[0].partnerStatusLabel, 'Giao không thành');
  assert.equal(buildFailedDelivery([order({ undeliverableAt: '2026-10-14T03:35:00Z' })], new Map(), nowMs).open[0].hoursSince, 1.4);
});
let raw: DatabaseSync;
before(async () => {
  // Cố định cả new Date() và Date.now(): phiên đăng nhập và kiểm tra hết hạn dùng cùng giờ.
  mock.timers.enable({ apis: ['Date'], now: nowMs });
  ({ raw } = await demoWorld(['2026-10-13'], nowMs));
  // Tạo rõ một đơn chờ cứu, không phụ thuộc giờ chạy hay phân bổ trạng thái demo.
  const fixture = raw.prepare("UPDATE raw_pos_orders SET status_code=2, first_undeliverable_at=?, phone='0900000001' WHERE id=(SELECT id FROM raw_pos_orders ORDER BY id LIMIT 1)").run(new Date(nowMs - 3600000).toISOString());
  assert.equal(fixture.changes, 1);
});
after(() => { raw.close(); mock.timers.reset(); });
const url = 'https://test.invalid/api/reports/giao-that-bai?start=2026-10-01&end=2026-10-12';
void test('route demo: owner thấy đủ, lead thấy SĐT che; open không theo kỳ', async () => {
  await loginAs(raw, 'owner');
  const response = await GET(new Request(url));
  assert.equal(response.status, 200);
  const owner = await response.json() as FdReport;
  assert.ok(owner.open.length > 0);
  assert.ok(owner.open.some((o) => o.phone === '0900000001'));
  await loginAs(raw, 'lead', { views: ['van-don'] });
  const lead = await (await GET(new Request(url))).json() as FdReport;
  assert.equal(lead.open.length, owner.open.length);
  assert.ok(lead.open.every((o) => !/\d{10}/.test(o.phone ?? '')));
});
void test('route từ chối ngày sai, quá 93 ngày và overview; ghi nhật ký danh sách khách', async () => {
  await loginAs(raw, 'owner');
  assert.equal((await GET(new Request(url.replace('2026-10-01', '2026-02-30')))).status, 400);
  assert.equal((await GET(new Request(url.replace('2026-10-01', '2026-01-01')))).status, 400);
  await loginAs(raw, 'staff', { views: ['overview'] });
  assert.equal((await GET(new Request(url))).status, 403);
  assert.equal(classifyApi('GET', '/api/reports/giao-that-bai', new URLSearchParams())?.action, 'orders.list');
  assert.equal(AUDIT_ACTIONS['orders.list'], 'Xem danh sách đơn kèm khách');
  assert.ok(AUDIT_GROUPS.find((g) => g.id === 'personal')?.actions.includes('orders.list'));
});
