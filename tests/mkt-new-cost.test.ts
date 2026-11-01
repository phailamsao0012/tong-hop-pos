import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { ensureAdCostSchema, mktSummary, roasReport, mktTotal, emptyNewSplit } from '../lib/ops/ad-costs';
import { mktAnalytics } from '../lib/reports/mkt-analytics';

void test('mkt-new-cost: ba nơi cùng New, nút Sale/CSKH giữ chi phí và số về', async () => {
  const { raw } = emptyDb();
  await ensureAdCostSchema();
  for (const [id, name, dept] of [['sale','NV A SALE','Sale'],['care','NV B CSKH','CSKH'],['other','NV C',''],['m1','NV D MKT','MKT'],['m2','NV E MKT','MKT']]) {
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,fetched_at) VALUES (?,?,?,?,?,?)').run(id,'p',id,name,dept,'2026-10-17');
  }
  for (const m of ['m1','m2']) {
    raw.prepare('INSERT INTO ad_costs (id,day,marketer_id,amount,campaign,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(m,'2026-10-17',m,100,'Sản phẩm A','2026-10-17','2026-10-17');
    for (const [seller,net] of [['sale',1000],['care',600],['other',200]] as const) {
      raw.prepare(`INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,marketer_id,status_code,net_total,created_at,first_confirmed_at,fetched_at,tags_json) VALUES (?,?,?,?,?,?,2,?,?,?,?,?)`).run(m+seller,'p','p',m+seller,seller,m,net,'2026-10-17T02:00:00','2026-10-17T03:00:00','2026-10-17','[{"name":"Sản phẩm A"}]');
    }
  }
  raw.exec("UPDATE raw_pos_orders SET phone=CASE seller_id WHEN 'sale' THEN '0900000001' WHEN 'care' THEN '0900000002' ELSE '0900000003' END");
  const opts = {posIds:['p'],start:'2026-10-17',end:'2026-10-17'};
  for (const team of ['all','sale','cskh'] as const) {
    const summary = await mktSummary({...opts,team});
    const report = await roasReport({...opts,team});
    const analytics = await mktAnalytics({...opts,team});
    assert.equal(summary.net,team==='all'?3600:team==='sale'?2000:1200);
    assert.equal(summary.newNet+summary.cskhNet+summary.otherNet,3600);
    assert.equal(summary.cost,200);
    assert.equal(summary.phones,6);
    for (const x of [report.total,analytics.current]) {
      assert.equal(x.net,summary.net); assert.equal(x.cost,summary.cost); assert.equal(x.phones,summary.phones);
      assert.equal(x.roas,summary.roas); assert.equal(x.costPerClosed,summary.costPerClosed);
    }
    assert.equal(summary.roas,team==='cskh'?null:10);
    assert.equal(summary.costPerClosed,team==='cskh'?null:100);
    for (const x of [...analytics.people,...analytics.teams,...analytics.products,...analytics.timeline]) {
      assert.equal(x.roas,team==='cskh'?null:10);
    }
    assert.equal(report.rows[0].costShare,team==='cskh'?null:0.1);
  }
  raw.close();
});

void test('mkt-new-cost: thiếu chi phí, không có đơn New và marketer chưa nhập', () => {
 const row={cost:100,orders:3,phones:2,closed:2,net:900,...emptyNewSplit(),cskhOrders:2,cskhNet:900};
 assert.equal(mktTotal([row]).roas,0);
 assert.equal(mktTotal([row]).costPerClosed,null);
 assert.equal(mktTotal([{...row,cost:0}]).roas,null);
 const paid={...row,newOrders:1,newNet:1000,net:1900};
 assert.equal(mktTotal([paid,{...paid,cost:0,newNet:9000}]).roas,10);
 assert.equal(mktTotal([]).costShare,null);
});
