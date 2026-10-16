import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { GET } from '../app/api/reports/staff-detail/route';
import { GET as overview } from '../app/api/reports/overview/route';
import { aggregateReasons, noteBatches, reasonOf } from '../lib/staff-detail';
import { closeRateBase, closeRateTop } from '../lib/metrics';
import { scopeApi } from '../lib/access';
import type { OverviewReport, Metrics } from '../lib/overview-report';
import { maskPhone } from '../lib/bot-guard-core';

void test('W1: lý do, thẻ hỏng, thẻ trùng, gom nhóm và lô tối đa 90 tham số', () => {
  assert.equal(reasonOf('[{"name":" Không nghe máy "},{"name":"Hẹn gọi lại"}]',null).reason,'Không nghe máy');
  assert.deepEqual(reasonOf('[{"name":"Giá đắt"},{"name":"Giá đắt"}]',null).tags,['Giá đắt']);
  assert.equal(reasonOf('[{"name":"Team A"}]','Gọi lại').kind,'note');
  for (const tags of [null,'hỏng','null','{}','[null,12,{"name":12}]']) assert.equal(reasonOf(tags,null).kind,'none');
  const r = aggregateReasons([{tags_json:null,note:null,status_code:0},{tags_json:'[{"name":"Không nghe máy"},{"name":"Team A"}]',note:null,status_code:6}]);
  assert.equal(r.reasons.reduce((s,r) => s+r.n,0),2);
  assert.equal(r.reasons.at(-1)?.kind,'none');
  assert.deepEqual(r.otherTags,[{tag:'Team A',n:1}]);
  const batches = noteBatches(Array.from({length:100},(_,i) => ({pos_id:'pos-a',customer_id:`customer-${i}`})));
  assert.deepEqual(batches.map(b => b.length),[45,45,10]);
});

type Detail = {
  summary: Metrics & { assignedPhones: number | null };
  base: { total: number; closed: number; open: number; kind: string };
  reasons: {n: number}[];
  orders: {id: string; phone: string | null; note: string; customerNote: {text: string} | null}[];
};
const days = ['2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-13'];
const query = (params: Record<string,string> = {}) => new URLSearchParams({start:days[0],end:days[6],team:'all',...params});
const request = (params: Record<string,string> = {}) => GET(new Request(`https://test.invalid/api/reports/staff-detail?${query(params)}`));
void test('W1: D1 giả — khớp overview, quyền và bộ lọc', async () => {
  const {raw} = await demoWorld(days,Date.parse('2026-10-14T05:00:00Z'));
  try {
    await loginAs(raw,'owner');
    assert.equal((await request()).status,400);
    for (const start of ['2026-02-30','sai','2024-01-01']) assert.equal((await request({sellerId:'nv-a',start})).status,400);
    assert.equal((await request({sellerId:'nv-a',posIds:'unknown'})).status,400);
    const missing = await (await request({sellerId:'nv-khong-co'})).json() as Detail;
    assert.equal(missing.summary,null);
    assert.equal(missing.base.total,0);
    const seller = raw.prepare("SELECT seller_id FROM raw_pos_orders WHERE status_code=0 AND seller_id IN (SELECT pos_user_id FROM hr_pos_team WHERE team='cskh') LIMIT 1").get() as {seller_id:string};
    for (const rateBase of ['created','assigned'] as const) {
      const params = {sellerId:seller.seller_id,rateBase};
      const response = await request(params);
      assert.equal(response.status,200);
      assert.equal(response.headers.get('Cache-Control'),'private, no-store');
      const body = await response.json() as Detail;
      assert.ok(body.summary);
      assert.equal(body.base.open,body.base.total-body.base.closed);
      assert.equal(body.base.open,body.reasons.reduce((s:number,r:{n:number}) => s+r.n,0));
      assert.equal(body.base.total,rateBase === 'created' ? body.summary.orders : body.summary.assignedOrders);
      assert.equal(body.base.closed,body.summary.rateTop);
      const ov = await (await overview(new Request(`https://test.invalid/api/reports/overview?${query({...params,employeeIds:seller.seller_id,compare:'previous'})}`))).json() as OverviewReport;
      const row = ov.current.byEmployee.find((r:{sellerId:string}) => r.sellerId === seller.seller_id)!;
      for (const key of ['orders','closedOrders','assignedOrders','closedNet'] as const) assert.equal(body.summary[key],row[key]);
      for (const metric of [ov.current.total,row]) {
        assert.equal(metric.rateTop,closeRateTop(metric,rateBase));
        assert.equal(metric.rateDen,closeRateBase(metric,rateBase));
      }
    }
    const order = raw.prepare("SELECT id,pos_id,customer_id,phone FROM raw_pos_orders WHERE seller_id=? AND status_code=0 ORDER BY created_at DESC,id DESC LIMIT 1").get(seller.seller_id) as {id:string;pos_id:string;customer_id:string|null;phone:string};
    const fakePhone = ['090','000','0123'].join('');
    raw.prepare('UPDATE raw_pos_orders SET phone=?,note=? WHERE id=?').run(fakePhone,`Gọi ${fakePhone}`,order.id);
    raw.prepare('UPDATE pos_users SET department=? WHERE user_id=?').run('CSKH',seller.seller_id);
    if (order.customer_id) raw.prepare('INSERT INTO customer_notes (id,pos_id,customer_id,message,author_name,created_at,fetched_at) VALUES (?,?,?,?,?,?,?)').run('note-w1',order.pos_id,order.customer_id,`Gọi ${fakePhone}`,'NV A','2026-10-13T10:00:00Z','2026-10-13T10:00:00Z');
    await loginAs(raw,'staff',{views:['overview']});
    const masked = await (await request({sellerId:seller.seller_id,rateBase:'assigned'})).json() as Detail;
    assert.equal(masked.summary.assignedHidden,true);
    assert.equal(masked.summary.assignedPhones,null);
    assert.equal(masked.summary.rateTop,null);
    assert.equal(masked.summary.rateDen,null);
    assert.equal(masked.base.kind,'created');
    const picked = masked.orders.find((o:{id:string}) => o.id === order.id);
    assert.ok(picked);
    assert.equal(picked.phone,maskPhone(fakePhone));
    assert.ok(!picked.note.includes(fakePhone));
    if (order.customer_id) { assert.ok(picked.customerNote); assert.ok(!picked.customerNote.text.includes(fakePhone)); }
    const denied = scopeApi({role:'staff',views:['products'],posIds:null,team:'all'},'GET',new URL('https://test.invalid/api/reports/staff-detail'));
    assert.ok(denied.blocked);
    for (const view of ['overview','center','compare','cskh-overview','sale-overview']) assert.ok(!scopeApi({role:'staff',views:[view],posIds:null,team:'all'},'GET',denied.url).blocked);
    logout();
    assert.equal((await request({sellerId:seller.seller_id})).status,401);
  } finally {raw.close();}
});