import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { EMPTY_ORDER_FILTERS, orderFilterSql, parseOrderFilters, segmentedStats, type OrderFilters } from '../lib/order-segments';
import type { Team } from '../lib/team';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE pos_users(user_id TEXT, name TEXT, department TEXT, is_active INTEGER NOT NULL DEFAULT 1);
    INSERT INTO pos_users (user_id,name,department) VALUES ('care','Lan CSKH','CSKH'), ('sale','Nam Sale','Sale');
    CREATE TABLE hr_pos_team(pos_user_id TEXT PRIMARY KEY, team TEXT, status TEXT);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE raw_pos_orders(id TEXT PRIMARY KEY,pos_id TEXT,seller_id TEXT,marketer_id TEXT,tags_json TEXT,
      created_at TEXT,first_confirmed_at TEXT,seller_assigned_at TEXT,status_code INTEGER,
      current_total INTEGER,net_total INTEGER,total_discount INTEGER,shipping_fee INTEGER,cod INTEGER,first_closed_at TEXT);
    CREATE TABLE raw_pos_order_items(order_id TEXT,product_id TEXT,name TEXT,is_bonus INTEGER,quantity INTEGER,line_total INTEGER,returned_count INTEGER);`);
  const day = '2026-09-22T03:00:00';
  const add = (id: string, seller: string, mkt: string | null, status: number, created = day, confirmed: string | null = day, tags = '[]', pos = 'one') => {
    db.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,pos,seller,mkt,tags,created,confirmed,created,status,1000,800,200,20,820,confirmed);
  };
  add('self','care',null,1); add('mkt','care','m1',1); add('new','care','  ',0,day,null);
  add('cancel','care','m1',6); add('old','care','m2',2,'2026-09-20T03:00:00');
  add('sale','sale',null,1,day,day,'[{"name":"SK + GK"}]');
  add('otherpos','care','m1',1,day,day,'[]','two');
  db.exec(`INSERT INTO raw_pos_order_items VALUES
    ('self','g','GENTADOX',0,2,1000,0), ('self','g','Gentadox',0,1,0,0),
    ('mkt','b','Bencid',0,1,1000,0), ('mkt','gift','GENTADOX',1,1,0,0),
    ('sale','g','Gentadox',0,1,1000,0);`);
  return db;
}
function metrics(db: DatabaseSync, filters: Partial<OrderFilters> = {}, team: Team = 'cskh', table = 'stats_daily') {
  const v = segmentedStats(['one'],'2026-09-21T17:00:00','2026-09-22T17:00:00',team,{ ...EMPTY_ORDER_FILTERS, ...filters });
  return db.prepare(v.sql + (table === 'stats_daily' ? 'SELECT SUM(orders) AS n, SUM(closed_orders) AS closed, SUM(closed_net) AS net, SUM(assigned_orders) AS assigned FROM stats_daily' : 'SELECT product_id,SUM(orders) AS n,SUM(closed_quantity) AS qty FROM stats_daily_product GROUP BY product_id ORDER BY product_id')).all(...v.binds);
}
void test('CSKH self + MKT partitions totals, old orders use confirmation date, cancellations excluded from closes', () => {
  const db = fixture();
  const all = metrics(db)[0], self = metrics(db,{orderOrigin:'self'})[0], mkt = metrics(db,{orderOrigin:'mkt'})[0];
  assert.deepEqual({...all},{n:4,closed:3,net:2400,assigned:4});
  assert.deepEqual({...self},{n:2,closed:1,net:800,assigned:2});
  assert.deepEqual({...mkt},{n:2,closed:2,net:1600,assigned:2});
  assert.equal(Number(self.net)+Number(mkt.net),all.net);
  assert.deepEqual({...metrics(db,{orderOrigin:'mkt',marketerId:'m2'})[0]},{n:0,closed:1,net:800,assigned:0});
  db.close();
});
void test('Gentadox + Detox là kháng sinh, SK GK theo tên SK / GK, còn lại là Khác; ba nhóm cộng lại bằng tổng', () => {
  const db = fixture();
  const closed = (d: DatabaseSync, f: Partial<OrderFilters>, team: Team = 'cskh') => Number(metrics(d,f,team)[0].closed ?? 0);
  // Đơn Sale có Gentadox → kháng sinh, không phải SK GK dù gắn nhãn SK + GK.
  assert.equal(closed(db,{productSegment:'skgk'},'sale'),0);
  // CSKH: 'mkt' chỉ có Bencid (Gentadox là quà), 'old' chưa có sản phẩm → Khác; không đoán SK GK từ chữ "sk" nằm giữa tên.
  db.exec("INSERT INTO raw_pos_order_items VALUES ('mkt','x','Bencid SKY',0,1,0,0)");
  assert.equal(closed(db,{productSegment:'skgk'}),0);
  assert.equal(closed(db,{productSegment:'khac'}),2);
  db.exec("INSERT INTO raw_pos_order_items VALUES ('old','s','SK+GK 500ml',0,1,500,0)");
  assert.equal(closed(db,{productSegment:'skgk'}),1);
  db.exec("INSERT INTO raw_pos_order_items VALUES ('mkt','d','DETOX gan',0,1,500,0)");
  assert.equal(closed(db,{productSegment:'gentadox'}),2);
  assert.equal(closed(db,{productSegment:'khac'}),0);
  const all = metrics(db)[0], parts = (['gentadox','skgk','khac'] as const).map((k) => Number(metrics(db,{productSegment:k})[0].net ?? 0));
  assert.equal(parts.reduce((a,b)=>a+b,0),all.net);
  db.close();
});
void test('Oxy + Bổ huyết và Bio Nano Shield chỉ là kháng sinh ở POS Siêu Vô Gạo (anh Vũ 31/10/2026)', () => {
  const db = fixture();
  const seg = (pos: string, k: 'gentadox' | 'khac') => {
    const v = segmentedStats([pos],'2026-09-21T17:00:00','2026-09-22T17:00:00','cskh',{ ...EMPTY_ORDER_FILTERS, productSegment: k });
    return Number((db.prepare(v.sql + 'SELECT SUM(closed_orders) AS closed FROM stats_daily').get(...v.binds) as { closed: number | null }).closed ?? 0);
  };
  const add = (id: string, pos: string, item: string) => {
    db.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,pos,'care',null,'[]','2026-09-22T03:00:00','2026-09-22T03:00:00','2026-09-22T03:00:00',1,1000,800,200,20,820,'2026-09-22T03:00:00');
    db.prepare('INSERT INTO raw_pos_order_items VALUES (?,?,?,?,?,?,?)').run(id,'p',item,0,1,800,0);
  };
  add('svg-oxy','sieu-vo-gao','OXY + BỔ HUYẾT'); add('svg-bio','sieu-vo-gao','BIO NANO SHIELD 1L');
  add('apex-oxy','mgt-apex','OXY + BỔ HUYẾT'); add('apex-bio','mgt-apex','BIO NANO SHIELD 1L');
  assert.equal(seg('sieu-vo-gao','gentadox'),2);
  assert.equal(seg('sieu-vo-gao','khac'),0);
  assert.equal(seg('mgt-apex','gentadox'),0);
  assert.equal(seg('mgt-apex','khac'),2);
  db.close();
});
void test('Gentadox ignores bonus items and multiple product lines do not duplicate an order', () => {
  const db = fixture();
  assert.equal(metrics(db,{productSegment:'gentadox'})[0].closed,1);
  const product = metrics(db,{productSegment:'gentadox'},'cskh','stats_daily_product')[0];
  assert.deepEqual({...product},{product_id:'g',n:1,qty:3});
  db.close();
});
void test('Sale ignores CSKH origin and marketer filters even when sent directly to API', () => {
  const db = fixture();
  assert.equal(metrics(db,{orderOrigin:'mkt',marketerId:'unknown'},'sale')[0].closed,1);
  assert.deepEqual(parseOrderFilters(new URLSearchParams('orderOrigin=mkt&marketerId=m1'), 'sale'),EMPTY_ORDER_FILTERS);
  db.close();
});
void test('Source and product filters intersect, marketer IDs stay bound, and other POS are excluded', () => {
  const db = fixture();
  assert.equal(metrics(db,{orderOrigin:'mkt',marketerId:'m1'})[0].closed,1);
  assert.equal(metrics(db,{productSegment:'gentadox',orderOrigin:'mkt'})[0].closed,null);
  const f = orderFilterSql({...EMPTY_ORDER_FILTERS,orderOrigin:'mkt',marketerId:"x' OR 1=1--"},'cskh');
  assert.ok(!f.sql.includes('OR 1=1'));
  assert.deepEqual(f.binds,["x' OR 1=1--"]);
  assert.equal(metrics(db,{orderOrigin:'mkt',marketerId:"x' OR 1=1--"})[0].closed,null);
  db.close();
});
