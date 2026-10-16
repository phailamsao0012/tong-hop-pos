import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { buildReturnBreakdown, MIN_SENT, type RbOrder, type RbReport } from '../lib/return-breakdown';
import { NO_CARRIER, NO_PROVINCE, NO_RETURN_REASON } from '../lib/ship-fields';
import { GET } from '../app/api/reports/hoan-theo-hang/route';
import { canView, scopeApi } from '../lib/access';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';

const order = (extra: Partial<RbOrder> = {}): RbOrder => ({ status: 2, net: 100, carrier: 'Hãng A Express', province: 'Tỉnh demo A', reason: null, line: 'Oxy', ...extra });
void test('tỷ lệ theo đơn và giá trị; chỉ tính trạng thái chuyển đi; mẫu rỗng là null', () => {
  const r = buildReturnBreakdown([order(), order({ status: 3 }), order({ status: 16 }), order({ status: 4, net: 300 }), order({ status: 15 }), order({ status: 5 }), order({ status: 17 })]);
  assert.equal(r.total.sent, 6);
  assert.equal(r.total.delivered, 2);
  assert.equal(r.total.returned, 3);
  assert.equal(r.total.rate, 50);
  assert.equal(r.total.rateNet, 500 / 800 * 100);
  assert.equal(buildReturnBreakdown([]).total.rate, null);
  assert.equal(buildReturnBreakdown([]).total.rateNet, null);
  assert.equal(buildReturnBreakdown([order({ net: 0 })]).total.rateNet, null);
});
void test('hãng rỗng dùng nhãn mặc định; tỉnh nhỏ gộp, ngưỡng ma trận đúng', () => {
  const r = buildReturnBreakdown([...Array.from({ length: MIN_SENT }, () => order({ carrier: '  ', province: null })), order({ carrier: null, province: 'Tỉnh demo B' }), order({ status: 4, carrier: 'Hãng B Express', province: 'Tỉnh demo C' })]);
  assert.equal(r.carriers[0].key, NO_CARRIER);
  assert.equal(r.carriers.reduce((n, c) => n + c.sent, 0), r.total.sent);
  assert.equal(r.provinces.find((p) => p.key === 'Tỉnh khác (ít đơn)')?.sent, 2);
  assert.equal(r.provinces.find((p) => p.key === NO_PROVINCE)?.sent, MIN_SENT);
  assert.equal(r.matrix.length, 1);
  assert.equal(r.matrix[0].cell.sent, MIN_SENT);
  assert.equal(r.reasons[0].key, NO_RETURN_REASON);
});
void test('đơn hai loại chỉ đếm hai lần ở reasonByLine, bỏ loại lặp', () => {
  const r = buildReturnBreakdown([order({ status: 4, lines: ['Oxy', 'SK + GK', 'Oxy'] })]);
  assert.equal(r.total.sent, 1);
  assert.equal(r.total.returned, 1);
  assert.equal(r.carriers[0].returned, 1);
  assert.equal(r.provinces[0].returned, 1);
  assert.equal(r.reasons[0].returned, 1);
  assert.equal(r.reasons[0].share, 100);
  assert.deepEqual(r.reasonByLine.map((x) => [x.line, x.returned]), [['Oxy', 1], ['SK + GK', 1]]);
});
let raw: DatabaseSync;
before(async () => {
  ({ raw } = await demoWorld(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'], Date.parse('2026-10-14T05:00:00Z')));
  await loginAs(raw, 'owner');
});
after(() => raw.close());
const url = 'https://test.invalid/api/reports/hoan-theo-hang';
void test('route demo: 200, có số, ít nhất ba hãng và ba lý do, tổng hãng bằng tổng', async () => {
  const response = await GET(new Request(`${url}?start=2026-10-07&end=2026-10-13`));
  assert.equal(response.status, 200);
  const r = await response.json() as RbReport;
  assert.ok(r.total.sent > 0);
  assert.ok(r.carriers.length >= 3);
  assert.ok(r.reasons.length >= 3);
  assert.equal(r.carriers.reduce((n, c) => n + c.sent, 0), r.total.sent);
  assert.ok(r.matrix.every((c) => c.cell.sent >= MIN_SENT));
});
void test('route: từ chối 94 ngày và ngày không tồn tại; nhận 93 ngày', async () => {
  assert.equal((await GET(new Request(`${url}?start=2026-07-01&end=2026-10-02`))).status, 400);
  assert.equal((await GET(new Request(`${url}?start=2026-07-01&end=2026-10-01`))).status, 200);
  assert.equal((await GET(new Request(`${url}?start=2026-02-30&end=2026-03-01`))).status, 400);
});
void test('quyền: overview bị 403 theo scopeApi, Vận đơn và Vận hành đơn được xem', async () => {
  const access = { role: 'staff' as const, views: ['overview'], posIds: null, team: 'all' as const };
  assert.ok(scopeApi(access, 'GET', new URL(url)).blocked);
  for (const view of ['van-don', 'pipeline']) assert.equal(canView({ ...access, views: [view] }, 'hoan-theo-hang'), true);
  await loginAs(raw, 'staff', { views: ['overview'] });
  assert.equal((await GET(new Request(`${url}?start=2026-10-07&end=2026-10-13`))).status, 403);
});
