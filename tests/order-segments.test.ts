import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { EMPTY_ORDER_FILTERS, orderFilterSql, parseOrderFilters, parseSegment, segmentKeyExpr, segmentedStats, segmentsFor, type OrderFilters, type ProductSegment } from '../lib/pancake/order-segments';
import type { Team } from '../lib/teams/team';

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
  const add = (id: string, seller: string, mkt: string | null, status: number, created = day, confirmed: string | null = day, tags = '[]', pos = 'sieu-vo-gao') => {
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
  const v = segmentedStats(['sieu-vo-gao'],'2026-09-21T17:00:00','2026-09-22T17:00:00',team,{ ...EMPTY_ORDER_FILTERS, ...filters });
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
void test('Thẻ theo thuốc chính từng POS (27/11/2026): bảng tên món ảo cho từng luật; món đi kèm không quyết định thẻ; bỏ SK GK', () => {
  const db = fixture();
  const order = (id: string, pos: string, items: string[]) => {
    db.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,pos,'care',null,'[]','2026-09-22T03:00:00','2026-09-22T03:00:00','2026-09-22T03:00:00',1,1000,800,200,20,820,'2026-09-22T03:00:00');
    for (const [i, name] of items.entries()) db.prepare('INSERT INTO raw_pos_order_items VALUES (?,?,?,?,?,?,?)').run(id,'p'+i,name,0,1,400,0);
  };
  const CASES: [string, string, string[], string][] = [
    ['t1','sieu-vo-gao',['THUỐC THÚ Y GENTADOX','Men tỏi ảo 100g'],'gentadox'],
    ['t2','sieu-vo-gao',['Thuốc thú y Gentadox 1kg'],'gentadox'],
    ['t3','sieu-vo-gao',['NANO01 - GENTADOX hỗ trợ hô hấp'],'gentadox'],
    ['t4','sieu-vo-gao',['OXY + BỔ HUYẾT 1kg'],'gentadox'],
    ['t5','sieu-vo-gao',['Bổ đậm đặc (1kg)','Thuốc thú y Oxytetra'],'oxy'],
    ['t6','sieu-vo-gao',['Thuốc thú y Oxytetra','THUỐC THÚ Y GENTADOX'],'gentadox'],
    ['t7','sieu-vo-gao',['SÁT TRÙNG BENCID','Vitamin Glucan ảo 1kg','Điện giải Gluco ảo'],'sat-trung'],
    ['t8','sieu-vo-gao',['Giải độc gan Detox Powder'],'khac'],
    ['t9','sieu-vo-gao',['Diệt ruồi Goodkill 800ml'],'khac'],
    ['t10','sieu-vo-gao',['SK + GK 500ml'],'khac'],
    ['t11','bio-nano',['Thuốc thú y Doxytylo 10g','Men tỏi ảo 100g'],'doxytylo'],
    ['t12','bio-nano',['Giải độc gan Detox Powder','Thuốc thú y Doxytylo 150g'],'doxytylo'],
    ['t13','bio-nano',['THUỐC THÚ Y GENTADOX'],'khac'],
    ['t14','bio-nano',['HEPA ảo 500ml'],'khac'],
    ['t15','oxytetra',['THUỐC THÚ Y GENTADOX'],'oxy'],
    ['t16','mgt-apex',['Thuốc thú y Oxytetra'],'khac'],
  ];
  for (const [id, pos, items] of CASES) order(id, pos, items);
  const keyOf = (id: string) => (db.prepare(`SELECT ${segmentKeyExpr('o')} AS k FROM raw_pos_orders o WHERE o.id=?`).get(id) as { k: string }).k;
  for (const [id, pos, items, want] of CASES) assert.equal(keyOf(id), want, `${pos}: ${items.join(' + ')}`);
  // Bộ lọc thẻ dùng đúng luật trên; các thẻ của một POS cộng lại bằng tổng.
  const closed = (pos: string, k: ProductSegment) => {
    const v = segmentedStats([pos],'2026-09-21T17:00:00','2026-09-22T17:00:00','cskh',{ ...EMPTY_ORDER_FILTERS, productSegment: k });
    return Number((db.prepare(v.sql + 'SELECT SUM(closed_orders) AS closed FROM stats_daily').get(...v.binds) as { closed: number | null }).closed ?? 0);
  };
  for (const pos of ['sieu-vo-gao','bio-nano','oxytetra','mgt-apex']) {
    assert.equal(segmentsFor([pos]).map((k) => closed(pos, k)).reduce((x, y) => x + y, 0), closed(pos, 'all'), pos);
  }
  assert.equal(closed('sieu-vo-gao','sat-trung'), 2, 'đơn mẫu mkt (Bencid) và t7');
  assert.equal(closed('bio-nano','doxytylo'), 2);
  // Khoá cũ skgk (URL cũ) đọc như Khác.
  assert.equal(parseOrderFilters(new URLSearchParams('productSegment=skgk'), 'sale').productSegment, 'khac');
  assert.equal(parseSegment('skgk'), 'khac');
  assert.equal(parseSegment('lạ'), null);
  db.close();
});
void test('Oxy + Bổ huyết và Bio Nano Shield (tên cũ) chỉ vào thẻ Gentadox ở POS Siêu Vô Gạo (anh Vũ 31/10/2026)', () => {
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
  // Cộng thêm đơn mẫu của fixture (self: Gentadox → Gentadox; old: chưa có món → Khác).
  assert.equal(seg('sieu-vo-gao','gentadox'),3);
  assert.equal(seg('sieu-vo-gao','khac'),1);
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

void test('POS Oxytetra chỉ có một nhóm Combo Oxytetra + Bổ đậm đặc; bốn nhóm cộng lại bằng tổng (anh Vũ 04/11/2026)', () => {
  const db = fixture();
  const add = (id: string, pos: string, item: string) => {
    db.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,pos,'care',null,'[]','2026-09-22T03:00:00','2026-09-22T03:00:00','2026-09-22T03:00:00',1,1000,800,200,20,820,'2026-09-22T03:00:00');
    db.prepare('INSERT INTO raw_pos_order_items VALUES (?,?,?,?,?,?,?)').run(id,'p',item,0,1,800,0);
  };
  add('oxy-1','oxytetra','GENTADOX'); add('oxy-2','oxytetra','COMBO OXYTETRA + BỔ ĐẬM ĐẶC');
  const net = (pos: string[], k: ProductSegment) => {
    const v = segmentedStats(pos,'2026-09-21T17:00:00','2026-09-22T17:00:00','cskh',{ ...EMPTY_ORDER_FILTERS, productSegment: k });
    return Number((db.prepare(v.sql + 'SELECT SUM(closed_orders) AS closed FROM stats_daily').get(...v.binds) as { closed: number | null }).closed ?? 0);
  };
  assert.equal(net(['oxytetra'],'oxy'),2);
  assert.equal(net(['oxytetra'],'gentadox'),0);
  assert.equal(net(['oxytetra'],'khac'),0);
  assert.equal(net(['sieu-vo-gao'],'oxy'),0);
  const both = ['sieu-vo-gao','oxytetra'];
  const parts = segmentsFor(both).map((k) => net(both,k)).reduce((a,b)=>a+b,0);
  assert.equal(parts,net(both,'all'));
  assert.deepEqual(segmentsFor(['oxytetra']),['oxy']);
  assert.deepEqual(segmentsFor(['sieu-vo-gao']),['gentadox','oxy','sat-trung','khac']);
  assert.deepEqual(segmentsFor(['bio-nano']),['doxytylo','khac']);
  assert.deepEqual(segmentsFor(['mgt-apex']),['khac']);
  assert.deepEqual(segmentsFor(both),['gentadox','oxy','sat-trung','khac']);
  assert.deepEqual(segmentsFor(['bio-nano','oxytetra']),['oxy','doxytylo','khac']);
  db.close();
});
