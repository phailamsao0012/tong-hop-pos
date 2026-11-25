import assert from 'node:assert/strict';
import { test } from 'node:test';

// Bảng xếp hạng marketer gộp (25/11/2026): khung rê chuột dựng từ số dòng, cột cũ bỏ khỏi bảng vẫn có trong khung. Số giả.
const row = {
  createdOrders: 140, createdNewPhones: 118, createdNewClosedPhones: 61,
  newConfirmed: 47, newNet: 41_200_000, newAfterRefund: 37_900_000, newOrders: 47,
  newPacked: 40, newCancelled: 3, newReturned: 4, newCancelledNet: 2_100_000, newReturnedNet: 2_900_000, shipNet: 35_000_000, shipAfterRefund: 32_100_000,
  shippedOrders: 52, deliveredOrders: 39, deliveryRate: 39 / 52 * 100,
  revenuePerPhone: 52_300_000 / 118, averageOrder: 52_300_000 / 59,
};
const ctx = { name: 'NV901 - Người giả', scope: '01/11–21/11' };

void test('bảng gộp: khung Số đã chốt = đã chốt + chưa chốt = tổng số về, kèm Đơn tạo', async () => {
  const { closedPhonesDetail, extraLabels } = await import('../lib/shared/mkt-rank-groups');
  const { detailAddsUp } = await import('../lib/shared/num-detail');
  const s = closedPhonesDetail(row, ctx);
  assert.ok(detailAddsUp(s));
  assert.deepEqual(s.parts.map((p) => p.value), [61, 57, 118]);
  assert.equal(s.parts.find((p) => p.strong)?.value, row.createdNewPhones);
  assert.deepEqual(extraLabels(s), ['Đơn tạo trong kỳ']);
  assert.equal(s.extra?.[0].value, 140);
  // Số cũ chưa có trường mới: coi như 0 đã chốt, không âm.
  const old = closedPhonesDetail({ ...row, createdNewClosedPhones: undefined }, ctx);
  assert.deepEqual(old.parts.map((p) => p.value), [0, 118, 118]);
});

void test('bảng gộp: mọi khung cộng / chia ra đúng số đang hiện; cột cũ nằm trong khung', async () => {
  const g = await import('../lib/shared/mkt-rank-groups');
  const { detailAddsUp } = await import('../lib/shared/num-detail');
  const specs = { net: g.newNetDetail(row, ctx), packed: g.packedDetail(row, ctx), cancel: g.cancelReturnDetail('cancel', row, ctx), ret: g.cancelReturnDetail('return', row, ctx), delivered: g.deliveredDetail(row, ctx) };
  for (const [k, s] of Object.entries(specs)) assert.ok(detailAddsUp(s), `${k} cộng / chia đúng`);
  // Tiền hoàn hủy = DT chốt − sau hoàn hủy.
  assert.equal(specs.net.parts[1].value, 3_300_000);
  assert.equal(specs.net.parts.find((p) => p.strong)?.value, row.newNet);
  assert.ok(g.extraLabels(specs.net).some((l) => l.startsWith('AOV')) && g.extraLabels(specs.net).some((l) => l.startsWith('DT / SĐT')));
  assert.ok(g.extraLabels(specs.packed).some((l) => l.startsWith('Đã cho ĐVVC')));
  assert.deepEqual(g.extraLabels(specs.cancel), ['Tiền đơn hủy', 'Tiền đơn hoàn', 'Đơn hủy', 'Đơn hoàn']);
  assert.deepEqual(specs.cancel.extra?.slice(0, 2).map((p) => p.value), [2_100_000, 2_900_000], 'tiền hủy / hoàn trong khung = số lớn của ô');
  assert.equal(g.cancelReturnDetail('cancel', { ...row, newCancelledNet: undefined }, ctx).extra?.[0].value, 0, 'số lưu cũ chưa có tiền: 0');
  assert.equal(specs.delivered.parts.find((p) => p.strong)?.label, '% giao thành công');
  // Tỉ lệ hủy, hoàn chia trên mọi đơn New đã chốt; tô đỏ từ 5% / 7%.
  assert.equal(specs.cancel.parts[2].value, 3 / 47 * 100);
  assert.equal(specs.cancel.parts[2].tone, 'bad');
  assert.equal(specs.ret.parts[2].tone, 'bad', '4 / 47 = 8,5% hoàn: từ 7% tô đỏ');
  assert.equal(g.cancelReturnDetail('return', { ...row, newReturned: 3 }, ctx).parts[2].tone, undefined, '3 / 47 = 6,4% hoàn: chưa tô đỏ');
  assert.equal(g.cancelReturnDetail('cancel', { ...row, newCancelled: 2 }, ctx).parts[2].tone, undefined, '2 / 47 = 4,3% hủy: chưa tô đỏ');
  // Không có đơn New: tỉ lệ trống, không chia cho 0.
  assert.equal(g.cancelReturnDetail('cancel', { ...row, newConfirmed: 0, newCancelled: 0 }, ctx).parts[2].value, null);
  assert.deepEqual(g.COL_GROUPS.map((x) => x.label), ['Chốt', 'Chi phí', 'Giao hàng']);
  assert.equal(g.costIndex([{ id: 'a', cost: 1 }, { id: 'b', cost: 2 }]).get('b')?.cost, 2);
  assert.equal(g.costIndex(undefined).size, 0);
});

void test('báo cáo Marketing: Số đã chốt không vượt số về, tổng không vượt cộng các marketer', async () => {
  const { demoWorld } = await import('./support/d1-sqlite');
  const { loginAs } = await import('./support/session');
  const { POS } = await import('../lib/shared/report-model');
  const { raw } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { GET } = await import('../app/api/reports/marketing/route');
  const params = new URLSearchParams({ start: '2026-10-16', end: '2026-10-16', posIds: POS[0].id, basis: 'confirmed', stage: 'confirmed', team: 'all' });
  type R = { createdNewPhones: number; createdNewClosedPhones: number; newCancelled: number; newReturned: number; newCancelledNet: number; newReturnedNet: number };
  const r = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as { summary: R; byMarketer: R[]; byTeam: R[] };
  assert.ok(r.byMarketer.length);
  for (const x of [r.summary, ...r.byMarketer, ...r.byTeam]) {
    assert.equal(typeof x.createdNewClosedPhones, 'number');
    assert.ok(x.createdNewClosedPhones >= 0 && x.createdNewClosedPhones <= x.createdNewPhones, 'đã chốt ≤ số về');
  }
  // Tiền hủy / hoàn New: không âm, không có đơn thì không có tiền; cộng từng marketer = tổng.
  const after = (await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as { afterPackSummary: R; byMarketer: R[] });
  for (const x of after.byMarketer) {
    assert.ok(x.newCancelledNet >= 0 && x.newReturnedNet >= 0);
    if (!x.newCancelled) assert.equal(x.newCancelledNet, 0);
    if (!x.newReturned) assert.equal(x.newReturnedNet, 0);
  }
  for (const k of ['newCancelledNet', 'newReturnedNet'] as const) assert.equal(after.byMarketer.reduce((a, x) => a + x[k], 0), after.afterPackSummary[k], `${k}: cộng marketer = tổng`);
  assert.ok(r.summary.createdNewClosedPhones > 0, 'demo có số đã chốt');
  assert.ok(r.byMarketer.reduce((a, x) => a + x.createdNewClosedPhones, 0) >= r.summary.createdNewClosedPhones, 'tổng đếm duy nhất ≤ cộng từng người');
});
