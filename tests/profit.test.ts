import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { buildProfit, type PfOrder } from '../lib/profit';
import { GET } from '../app/api/reports/lai-that/route';
import { roasReport, ensureAdCostSchema } from '../lib/ad-costs';
import { SENT_AT_READY_KEY, COST_READY_KEY } from '../lib/stats';
import { POS } from '../lib/report-model';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';

const order = (extra: Partial<PfOrder> = {}): PfOrder => ({ status: 3, net: 100, cost: 40, missing: 0, fee: 10, marketerId: 'mkt-demo', posId: 'pos-demo', lines: ['Oxy'], ...extra });
const options = (allPos = true) => ({ adCostByMarketer: new Map([['mkt-demo', 200]]), roasClosedByMarketer: new Map([['mkt-demo', 3]]),
  roasClosedTotal: 3, allPos, teamOf: () => 'team-demo', teamNames: new Map([['team-demo', 'Team demo']]) });
void test('đã nhận, hoàn và trên đường: lãi, biên và ROAS; hoàn một phần tính hoàn cả đơn', () => {
  const r = buildProfit([order(), order({ status: 16 }), order({ status: 4, cost: null, missing: -1 }), order({ status: 15 }), order({ status: 5 }), order({ status: 2 }), order({ status: 17 })], options());
  assert.equal(r.total.sent, 6); assert.equal(r.total.delivered, 2); assert.equal(r.total.returned, 3);
  assert.equal(r.total.inTransit, 1); assert.equal(r.total.inTransitNet, 100);
  assert.equal(r.total.revenue, 200); assert.equal(r.total.cogs, 80); assert.equal(r.total.shipOut, 50); assert.equal(r.total.shipBack, 30);
  assert.equal(r.total.gross, 40); assert.equal(r.total.margin, 20); assert.equal(r.total.afterAds, -160); assert.equal(r.total.roasAfterReturn, 1);
  assert.deepEqual(r.warnings, [{ marketerId: 'mkt-demo', roasClosed: 3, afterAds: -160 }]);
  assert.equal(r.byTeam[0].afterAds, -160);
});
void test('thiếu giá vốn bị loại; thiếu phí tính 0 và đếm; mẫu rỗng và chi phí 0', () => {
  const r = buildProfit([order({ missing: 1 }), order({ missing: -1 }), order({ cost: null }), order({ missing: null }), order({ fee: null })], options());
  assert.equal(r.total.missingCost, 4); assert.equal(r.total.revenue, 100); assert.equal(r.total.cogs, 40);
  assert.equal(r.total.missingFee, 1); assert.equal(r.total.shipOut, 0); assert.equal(r.total.gross, 60);
  const empty = buildProfit([], { ...options(), adCostByMarketer: new Map() });
  assert.equal(empty.total.margin, null); assert.equal(empty.total.roasAfterReturn, null);
});
void test('POS không đủ thì ẩn chi phí, lãi sau QC và ROAS sau hoàn ở mọi bảng', () => {
  const r = buildProfit([order()], options(false));
  for (const c of [r.total, ...r.byPos, ...r.byLine, ...r.byMarketer, ...r.byTeam]) {
    assert.equal(c.adCost, null); assert.equal(c.afterAds, null); assert.equal(c.roasAfterReturn, null);
  }
  assert.deepEqual(r.warnings, []);
});
void test('hai loại chia đều, bỏ loại lặp và tổng từng cột bằng tổng; người chỉ có chi phí vẫn tính', () => {
  const r = buildProfit([order({ lines: ['Oxy', 'SK + GK', 'Oxy'] }), order({ status: 4, lines: [] })], options());
  assert.equal(r.byLine.find((c) => c.line === 'Oxy')?.revenue, 50);
  for (const k of ['sent', 'delivered', 'returned', 'revenue', 'cogs', 'shipOut', 'shipBack', 'gross'] as const)
    assert.equal(r.byLine.reduce((n, c) => n + c[k], 0), r.total[k]);
  const onlyCost = buildProfit([], options());
  assert.equal(onlyCost.byMarketer[0].afterAds, -200); assert.equal(onlyCost.byTeam[0].afterAds, -200);
});

let raw: DatabaseSync;
before(async () => {
  ({ raw } = await demoWorld(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'], Date.parse('2026-10-14T05:00:00Z')));
  for (const key of [SENT_AT_READY_KEY, COST_READY_KEY]) raw.prepare('INSERT OR REPLACE INTO app_settings (key,value,updated_at) VALUES (?, ?, ?)').run(key, '1', '2026-10-14T05:00:00Z');
  await ensureAdCostSchema();
  const id = raw.prepare("SELECT user_id FROM pos_users WHERE name LIKE '%MKT%' LIMIT 1").get() as { user_id: string };
  raw.prepare('INSERT INTO ad_costs (id,day,marketer_id,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('cost-demo', '2026-10-10', id.user_id, 100000, '2026-10-10', '2026-10-10');
  await loginAs(raw, 'owner');
});
after(() => raw.close());
const url = 'https://test.invalid/api/reports/lai-that';
const query = '?start=2026-10-07&end=2026-10-13';
type Report = ReturnType<typeof buildProfit> & { ready: boolean; notReady?: string };
void test('route owner trên demo: số dương, công thức lãi và ROAS chốt đúng hàm cũ', async () => {
  const response = await GET(new Request(url + query)); assert.equal(response.status, 200);
  const r = await response.json() as Report;
  assert.ok(r.total.revenue > 0); assert.ok(r.total.cogs > 0);
  assert.equal(r.total.gross, r.total.revenue - r.total.cogs - r.total.shipOut - r.total.shipBack);
  const closed = await roasReport({ start: '2026-10-07', end: '2026-10-13', posIds: POS.map((p) => p.id) });
  assert.equal(r.total.roasClosed, closed.total.roas);
  assert.equal(r.total.adCost, 100000); assert.equal(r.ready, true);
  for (const m of r.byMarketer) assert.equal(m.roasClosed, closed.rows.find((c) => c.marketerId === m.marketerId)?.roas ?? null);
  const partial = await (await GET(new Request(url + query + `&posIds=${POS[0].id},${POS[0].id}`))).json() as Report;
  assert.equal(partial.total.adCost, null);
});
void test('route giữ đơn chưa gắn marketer trong tổng, POS và loại đơn; loại người ngoài nhóm được tính', async () => {
  const report = async () => {
    const response = await GET(new Request(url + query));
    assert.equal(response.status, 200);
    return await response.json() as Report;
  };
  const before = await report(), posId = POS[0].id;
  const userId = 's2-demo-warehouse', now = '2026-10-10T05:00:00Z';
  const ids = ['s2-demo-null', 's2-demo-empty', 's2-demo-excluded'];
  raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)')
    .run(userId, posId, userId, 'Kho demo', now);
  try {
    const insert = raw.prepare(`INSERT INTO raw_pos_orders
      (id,pos_id,shop_id,source_order_id,status_code,marketer_id,net_total,cost_total,cost_missing,carrier_fee,first_sent_at,fetched_at)
      VALUES (?,?,?,?,3,?,?,40000,0,10000,?,?)`);
    insert.run(ids[0], posId, '1', ids[0], null, 100000, now, now);
    const withNull = await report();
    assert.equal(withNull.total.delivered, before.total.delivered + 1);
    assert.equal(withNull.total.revenue, before.total.revenue + 100000);
    assert.equal(withNull.total.gross, before.total.gross + 50000);
    const posBefore = before.byPos.find((p) => p.posId === posId);
    const posAfter = withNull.byPos.find((p) => p.posId === posId);
    assert.equal(posAfter?.delivered, (posBefore?.delivered ?? 0) + 1);
    assert.equal(posAfter?.revenue, (posBefore?.revenue ?? 0) + 100000);
    assert.equal(withNull.byLine.find((l) => l.line === 'Khác')?.revenue,
      (before.byLine.find((l) => l.line === 'Khác')?.revenue ?? 0) + 100000);
    assert.deepEqual(withNull.byMarketer, before.byMarketer);
    assert.deepEqual(withNull.byTeam, before.byTeam);
    insert.run(ids[1], posId, '1', ids[1], '', 200000, now, now);
    const withEmpty = await report();
    assert.equal(withEmpty.total.delivered, withNull.total.delivered + 1);
    assert.equal(withEmpty.total.revenue, withNull.total.revenue + 200000);
    assert.deepEqual(withEmpty.byMarketer, before.byMarketer);
    assert.deepEqual(withEmpty.byTeam, before.byTeam);
    insert.run(ids[2], posId, '1', ids[2], userId, 900000, now, now);
    assert.deepEqual(await report(), withEmpty);
  } finally {
    for (const id of ids) raw.prepare('DELETE FROM raw_pos_orders WHERE id=?').run(id);
    raw.prepare('DELETE FROM pos_users WHERE id=?').run(userId);
  }
});
void test('route kiểm ngày, POS; chưa sẵn giờ gửi không dùng ngày khác; cờ giá vốn', async () => {
  for (const q of ['?start=2026-07-01&end=2026-10-02', '?start=2026-02-30&end=2026-03-01', query + '&posIds=invalid'])
    assert.equal((await GET(new Request(url + q))).status, 400);
  assert.equal((await GET(new Request(url + '?start=2026-07-01&end=2026-10-01'))).status, 200);
  raw.prepare('DELETE FROM app_settings WHERE key=?').run(COST_READY_KEY);
  assert.equal((await (await GET(new Request(url + query))).json() as Report).ready, false);
  raw.prepare('DELETE FROM app_settings WHERE key=?').run(SENT_AT_READY_KEY);
  const r = await (await GET(new Request(url + query))).json() as Report;
  assert.equal(r.notReady, 'sent'); assert.equal(r.total.sent, 0); assert.deepEqual(r.byMarketer, []);
});
void test('route chặn lead, director và staff dù cấp views', async () => {
  for (const role of ['lead', 'director', 'staff'] as const) {
    await loginAs(raw, role, { views: ['lai-that'] });
    assert.equal((await GET(new Request(url + query))).status, 403);
  }
});
