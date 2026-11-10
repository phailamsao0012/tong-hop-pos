import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { GET } from '../app/api/reports/staff-detail/route';
import { GET as overview } from '../app/api/reports/overview/route';
import { aggregateReasons, noteBatches, reasonOf } from '../lib/reports/staff-detail';
import { closeRateBase, closeRateTop } from '../lib/reports/metrics';
import { scopeApi } from '../lib/auth/access';
import type { OverviewReport, Metrics } from '../lib/reports/overview-report';
import { maskPhone } from '../lib/bot/bot-guard-core';
import { POS } from '../lib/shared/report-model';
import { vnRangeUtc } from '../lib/shared/report-time';

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
  person: { name: string; department: string | null };
  summary: Metrics & { createdPhones: number; assignedPhones: number | null };
  base: { total: number; closed: number; open: number; kind: string };
  reasons: {n: number}[];
  orders: {id: string; phone: string | null; note: string; customerNote: {text: string} | null}[];
};
const days = ['2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-13'];
const query = (params: Record<string,string> = {}) => new URLSearchParams({start:days[0],end:days[6],team:'all',...params});
const request = (params: Record<string,string> = {}) => GET(new Request(`https://test.invalid/api/reports/staff-detail?${query(params)}`));
void test('S1W: ghi chú có chữ, quyền số chia, đếm trong kỳ, phạm vi người và limit rỗng', async () => {
  const {raw} = await demoWorld(days,Date.parse('2026-10-14T05:00:00Z'));
  try {
    await loginAs(raw,'owner');
    const seller = raw.prepare("SELECT seller_id FROM raw_pos_orders WHERE status_code=0 AND seller_id IN (SELECT pos_user_id FROM hr_pos_team WHERE team='cskh') GROUP BY seller_id HAVING COUNT(*)>=2 LIMIT 1").get() as {seller_id:string};
    assert.ok(seller);
    const params = {sellerId:seller.seller_id};
    const initial = await (await request(params)).json() as Detail;
    assert.ok(initial.orders.length > 1);
    const picked = initial.orders.slice(0,2);
    const insertNote = raw.prepare('INSERT INTO customer_notes (id,pos_id,customer_id,message,author_name,created_at,fetched_at) VALUES (?,?,?,?,?,?,?)');
    for (const [i,order] of picked.entries()) {
      const customerId = `customer-s1w-${i}`;
      raw.prepare('UPDATE raw_pos_orders SET customer_id=? WHERE id=?').run(customerId,order.id);
      const pos = raw.prepare('SELECT pos_id FROM raw_pos_orders WHERE id=?').get(order.id) as {pos_id:string};
      if (i === 0) insertNote.run('s1w-text',pos.pos_id,customerId,'Hẹn gọi lại','NV A','2026-10-12T10:00:00Z','2026-10-13T10:00:00Z');
      insertNote.run(`s1w-empty-${i}`,pos.pos_id,customerId,'','NV A','2026-10-13T10:00:00Z','2026-10-13T10:00:00Z');
      insertNote.run(`s1w-space-${i}`,pos.pos_id,customerId,'   ','NV A','2026-10-13T11:00:00Z','2026-10-13T11:00:00Z');
      for (const [j,message] of ['\n','\t ','\u00a0'].entries()) {
        insertNote.run(`s2w-whitespace-${i}-${j}`,pos.pos_id,customerId,message,'NV A',`2026-10-13T${12+j}:00:00Z`,'2026-10-13T15:00:00Z');
      }
    }
    const notes = await (await request(params)).json() as Detail;
    assert.equal(notes.orders.find(o => o.id === picked[0].id)?.customerNote?.text,'Hẹn gọi lại');
    assert.equal(notes.orders.find(o => o.id === picked[1].id)?.customerNote,null);
    const {startUtc,endUtc} = vnRangeUtc(days[0],days[6]);
    const posIds = POS.map(p => p.id);
    for (const rateBase of ['created','assigned']) {
      const body = await (await request({...params,rateBase})).json() as Detail;
      for (const [column,key] of [['created_at','createdPhones'],['seller_assigned_at','assignedPhones']] as const) {
        const expected = raw.prepare(`SELECT COUNT(DISTINCT NULLIF(phone,'')) AS n FROM raw_pos_orders WHERE pos_id IN (${posIds.map(() => '?').join(',')}) AND seller_id=? AND status_code<>7 AND ${column}>=? AND ${column}<?`).get(...posIds,seller.seller_id,startUtc,endUtc) as {n:number};
        assert.equal(body.summary[key],expected.n);
      }
    }
    const emptyLimit = await (await request({...params,limit:''})).json() as Detail;
    assert.deepEqual(emptyLimit.orders,notes.orders);
    assert.ok(emptyLimit.orders.length > 1 && emptyLimit.orders.length <= 200);
    const outside = await (await request({...params,team:'sale'})).json() as Detail;
    assert.equal(outside.person.name,'Nhân viên');
    assert.equal(outside.person.department,null);
    // Cùng mã người chỉ tồn tại ngoài POS được chọn cũng không lộ tên.
    const otherPos = POS.find(p => p.id !== posIds[0])!.id;
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,is_active,fetched_at) VALUES (?,?,?,?,?,1,?)').run('s1w-outside',otherPos,'nv-s1w-outside','NV A SALE','SALE','2026-10-13T10:00:00Z');
    const outsidePos = await (await request({sellerId:'nv-s1w-outside',posIds:posIds[0]})).json() as Detail;
    assert.equal(outsidePos.person.name,'Nhân viên');
    assert.equal(outsidePos.person.department,null);
    raw.prepare('UPDATE pos_users SET name=?,department=? WHERE user_id=?').run('NV A CSKH','Quản trị viên',seller.seller_id);
    await loginAs(raw,'staff',{views:['cskh-overview']});
    const visible = await (await request({...params,team:'cskh',rateBase:'assigned'})).json() as Detail;
    assert.equal(visible.summary.assignedHidden,false);
    assert.equal(visible.base.kind,'assigned');
    assert.equal(visible.base.total,visible.summary.assignedOrders);
    assert.equal(visible.base.closed,visible.summary.rateTop);
    assert.equal(typeof visible.summary.assignedPhones,'number');
    raw.prepare('UPDATE pos_users SET department=? WHERE user_id=?').run('CSKH',seller.seller_id);
    const hidden = await (await request({...params,team:'cskh',rateBase:'assigned'})).json() as Detail;
    assert.equal(hidden.summary.assignedHidden,true);
    assert.equal(hidden.summary.assignedPhones,null);
    assert.equal(hidden.base.kind,'created');
  } finally { logout(); raw.close(); }
});
void test('S2W: ẩn số chia CSKH khi không có dòng tổng quan và người chỉ ở POS khác', async () => {
  const {raw} = await demoWorld(days,Date.parse('2026-10-14T05:00:00Z'));
  try {
    const [posA,posB] = POS;
    const sellerId = 'nv-s2w-outside';
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,is_active,fetched_at) VALUES (?,?,?,?,?,1,?)').run('s2w-outside',posB.id,sellerId,'NV A','CSKH','2026-10-13T10:00:00Z');
    const order = raw.prepare('SELECT id FROM raw_pos_orders WHERE pos_id=? AND status_code=0 LIMIT 1').get(posA.id) as {id:string};
    assert.ok(order);
    raw.prepare('UPDATE raw_pos_orders SET seller_id=? WHERE id=?').run(sellerId,order.id);
    await loginAs(raw,'staff',{views:['cskh-overview']});
    const response = await request({sellerId,posIds:posA.id,rateBase:'assigned'});
    assert.equal(response.status,200);
    const body = await response.json() as Detail;
    assert.equal(body.summary,null);
    assert.equal(body.base.kind,'created');
    assert.ok(body.base.total > 0);
    assert.equal(body.person.name,'Nhân viên');
    assert.equal(body.person.department,null);
  } finally { logout(); raw.close(); }
});
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
