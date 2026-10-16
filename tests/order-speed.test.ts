import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { buildSpeed, closeRateByWait, percentileFromHist, speedQueries, type SpeedRow } from '../lib/order-speed';
import { GET } from '../app/api/reports/toc-do/route';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';

void test('percentileFromHist: một ô, nhiều ô, rỗng, ô cuối', () => {
  assert.equal(percentileFromHist([10], 0.5), 2.5);
  assert.equal(percentileFromHist([10], 0.9), 4.5);
  assert.equal(percentileFromHist([2, 6, 2], 0.5), 10);
  assert.equal(percentileFromHist([], 0.5), null);
  assert.equal(percentileFromHist(Array<number>(12).fill(0), 0.9), null);
  const last = Array<number>(12).fill(0); last[11] = 10;
  assert.equal(percentileFromHist(last, 0.5), 7200);
  assert.equal(percentileFromHist(last, 0.9), 7200);
});
void test('closeRateByWait: gộp đúng 4 nhóm và mẫu số rỗng', () => {
  const rows = closeRateByWait([{ bucket: 0, leads: 2, closed: 1 }, { bucket: 2, leads: 3, closed: 1 }, { bucket: 3, leads: 7, closed: 4 }, { bucket: 4, leads: 5, closed: 2 }, { bucket: 11, leads: 5, closed: 3 }]);
  assert.deepEqual(rows.map(({ leads, closed, rate }) => ({ leads, closed, rate })), [{ leads: 2, closed: 1, rate: 50 }, { leads: 0, closed: 0, rate: null }, { leads: 10, closed: 5, rate: 50 }, { leads: 10, closed: 5, rate: 50 }]);
});
void test('buildSpeed: bỏ người n < 10, gộp nhiều POS, giữ skipped theo POS', () => {
  const rows: SpeedRow[] = [{ stage: 'assign', posId: 'a', who: 'demo-small', bucket: 0, n: 9 }, { stage: 'assign', posId: 'a', who: 'demo-large', bucket: 1, n: 5 }, { stage: 'assign', posId: 'b', who: 'demo-large', bucket: 2, n: 5 }, { stage: 'assign', posId: 'a', who: null, bucket: -1, n: 3 }];
  const r = buildSpeed(rows, { assign: 3, confirm: 0, ship: 0, deliver: 0 });
  assert.equal(r.byPerson.length, 1);
  assert.equal(r.byPerson[0].who, 'demo-large');
  assert.equal(r.byPerson[0].n, 10);
  assert.equal(r.stages[0].n, 19);
  assert.equal(r.stages[0].skipped, 3);
  assert.equal(r.byPos[0].stages[0].skipped, 3);
});

type Report = ReturnType<typeof buildSpeed> & { stuck: { key: string; total: number; counts: { posId: string; who: string | null; n: number }[]; orders: { posId: string; sourceOrderId: string; who: string | null; minutes: number }[] }[] };
let raw: DatabaseSync;
const nowMs = Date.parse('2026-10-16T05:00:00Z');
const url = 'https://test.invalid/api/reports/toc-do?start=2026-10-01&end=2026-10-15';
before(async () => {
  mock.timers.enable({ apis: ['Date'], now: nowMs });
  ({ raw } = await demoWorld(['2026-10-01', '2026-10-13'], nowMs));
});
after(() => { raw.close(); mock.timers.reset(); });
function noPersonal(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(key !== 'phone' && key !== 'customerName', `Không được trả ${key}`);
    noPersonal(child);
  }
}
void test('route demo: 4 chặng có mẫu, p50 ≤ p90, không dữ liệu khách; chỉ một batch', async () => {
  await loginAs(raw, 'owner');
  const original = env.DB.batch.bind(env.DB);
  let calls = 0;
  const spy = mock.method(env.DB, 'batch', (...args: Parameters<D1Database['batch']>) => { calls++; return original(...args); });
  try {
    const response = await GET(new Request(url));
    assert.equal(response.status, 200);
    const r = await response.json() as Report;
    for (const s of r.stages) { assert.ok(s.n > 0, s.key); assert.ok(s.p50! <= s.p90!); }
    noPersonal(r);
    assert.equal(calls, 1);
    for (const s of r.stages) assert.equal(r.byPos.reduce((n, p) => n + p.stages.find((x) => x.key === s.key)!.n, 0), s.n);
  } finally { spy.mock.restore(); }
});
void test('route: 32 ngày, ngày sai, POS sai và overview bị từ chối; 31 ngày hợp lệ', async () => {
  await loginAs(raw, 'owner');
  for (const query of ['start=2026-09-01&end=2026-10-02', 'start=2026-02-30&end=2026-03-01', 'start=2026-10-15&end=2026-10-01', 'start=2026-10-01&end=2026-10-15&posIds=invalid']) assert.equal((await GET(new Request(`https://test.invalid/api/reports/toc-do?${query}`))).status, 400);
  assert.equal((await GET(new Request(url.replace('2026-10-15', '2026-10-31')))).status, 200);
  await loginAs(raw, 'staff', { views: ['overview'] });
  assert.equal((await GET(new Request(url))).status, 403);
});
void test('SQL: dùng chỉ mục theo POS, skipped cho giờ thiếu/âm và 50 đơn kẹt lâu nhất', async () => {
  const posId = (raw.prepare('SELECT pos_id FROM raw_pos_orders LIMIT 1').get() as { pos_id: string }).pos_id;
  const queries = speedQueries(env.DB, [posId], '2026-09-30T17:00:00Z', '2026-10-15T17:00:00Z', new Date(nowMs).toISOString(), 'all', null);
  for (const [i, query] of queries.entries()) {
    const q = query as unknown as { sql: string; args: (string | number | null)[] };
    const plan = raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.args).map((r) => String(r.detail)).join('\n');
    assert.doesNotMatch(plan, /SCAN o\b/);
    assert.match(plan, /SEARCH o USING/);
    if (i === 6) assert.match(plan, /first_closed_at>\??/);
    if (i === 7) assert.match(plan, /first_confirmed_at>\??/);
  }
  raw.exec('SAVEPOINT speed_fixture');
  try {
    raw.prepare("UPDATE raw_pos_orders SET status_code=0,seller_id=NULL,created_at='2026-10-15T00:00:00Z',seller_assigned_at=NULL WHERE pos_id=?").run(posId);
    await loginAs(raw, 'owner');
    const r = await (await GET(new Request(`${url}&posIds=${posId}`))).json() as Report;
    const assign = r.stages.find((s) => s.key === 'assign')!;
    assert.equal(assign.n, 0); assert.ok(assign.skipped > 50);
    const stuck = r.stuck.find((s) => s.key === 'assign')!;
    assert.ok(stuck.total > 50); assert.equal(stuck.orders.length, 50);
    assert.equal(stuck.counts.reduce((n, c) => n + c.n, 0), stuck.total);
    assert.ok(stuck.orders.every((o) => o.posId === posId && o.minutes > 15));
    raw.prepare("UPDATE raw_pos_orders SET created_at='2026-10-01T00:00:00Z' WHERE pos_id=?").run(posId);
    const old = await (await GET(new Request(`${url}&posIds=${posId}`))).json() as Report;
    assert.equal(old.stuck.find((s) => s.key === 'assign')!.total, 0);
    raw.prepare("UPDATE raw_pos_orders SET seller_assigned_at='2026-09-30T00:00:00Z' WHERE pos_id=?").run(posId);
    const negative = await (await GET(new Request(`${url}&posIds=${posId}`))).json() as Report;
    assert.equal(negative.stages.find((s) => s.key === 'assign')!.n, 0);
  } finally { raw.exec('ROLLBACK TO speed_fixture; RELEASE speed_fixture'); }
});
void test('SQL: confirm và ship chỉ xét mốc trong 30 ngày gần nhất', async () => {
  const posId = (raw.prepare('SELECT pos_id FROM raw_pos_orders LIMIT 1').get() as { pos_id: string }).pos_id;
  const ids = raw.prepare('SELECT source_order_id FROM raw_pos_orders WHERE pos_id=? LIMIT 2').all(posId) as { source_order_id: string }[];
  assert.equal(ids.length, 2);
  raw.exec('SAVEPOINT speed_recent_fixture');
  try {
    raw.prepare('UPDATE raw_pos_orders SET status_code=6 WHERE pos_id=?').run(posId);
    for (const [key, status, column, hours] of [
      ['confirm', 17, 'first_closed_at', 5],
      ['ship', 1, 'first_confirmed_at', 25],
    ] as const) {
      const update = raw.prepare(`UPDATE raw_pos_orders SET status_code=?,${column}=? WHERE pos_id=? AND source_order_id=?`);
      update.run(status, new Date(nowMs - 31 * 86400000).toISOString(), posId, ids[0].source_order_id);
      update.run(status, new Date(nowMs - hours * 3600000).toISOString(), posId, ids[1].source_order_id);
      await loginAs(raw, 'owner');
      const r = await (await GET(new Request(`${url}&posIds=${posId}`))).json() as Report;
      const stuck = r.stuck.find((s) => s.key === key)!;
      assert.equal(stuck.total, 1, key);
      assert.deepEqual(stuck.orders.map((o) => o.sourceOrderId), [ids[1].source_order_id], key);
      assert.ok(Math.abs(stuck.orders[0].minutes - hours * 60) < 0.000001, key);
    }
  } finally { raw.exec('ROLLBACK TO speed_recent_fixture; RELEASE speed_recent_fixture'); }
});
void test('route: quyền van-don kế thừa và thu hẹp POS', async () => {
  const posId = (raw.prepare('SELECT pos_id FROM raw_pos_orders LIMIT 1').get() as { pos_id: string }).pos_id;
  await loginAs(raw, 'lead', { views: ['van-don'], posIds: [posId] });
  const response = await GET(new Request(url));
  assert.equal(response.status, 200);
  const r = await response.json() as Report;
  assert.ok(r.byPos.length > 0);
  assert.ok(r.byPos.every((p) => p.posId === posId));
  noPersonal(r);
});
void test('route: team bị khóa áp lên mọi chặng và danh sách kẹt', async () => {
  await loginAs(raw, 'lead', { views: ['pipeline'], team: 'sale' });
  const a = await (await GET(new Request(`${url}&team=cskh`))).json() as Report;
  const b = await (await GET(new Request(`${url}&team=sale`))).json() as Report;
  assert.deepEqual(a, b);
  assert.equal(a.stuck.find((s) => s.key === 'assign')!.total, 0);
  for (const group of a.stuck) for (const row of group.orders) {
    assert.ok(row.who);
    const person = raw.prepare('SELECT department,name FROM pos_users WHERE user_id=? LIMIT 1').get(row.who) as { department: string; name: string };
    assert.match(`${person.department} ${person.name}`, /sale|bán hàng/i);
  }
});
