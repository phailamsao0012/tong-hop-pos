import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { SOURCE_FIELD, productExists, stageSql } from '../lib/marketing-report';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE raw_pos_orders(id TEXT PRIMARY KEY,pos_id TEXT,marketer_id TEXT,seller_id TEXT,care_id TEXT,phone TEXT,created_at TEXT,first_confirmed_at TEXT,status_code INTEGER,order_source TEXT,raw_json TEXT);
    CREATE TABLE raw_pos_order_items(order_id TEXT,product_id TEXT,variation_id TEXT,name TEXT,is_bonus INTEGER,quantity INTEGER);
    INSERT INTO raw_pos_orders VALUES
      ('a','one','m1','s1','c1','0901','2026-09-22','2026-09-22',1,'Facebook','{"page_id":"pg1","post_id":"post1","ads_source":"ad1"}'),
      ('b','one','m1','s1','c1','0902','2026-09-22','2026-09-22',2,'Facebook','{"p_utm_campaign":"camp2"}'),
      ('c','one','m2','s2',NULL,'0903','2026-09-22','2026-09-22',6,'Zalo',NULL),
      ('d','one','m2','s2',NULL,'0904','2026-09-22',NULL,0,'Zalo','{bad'),
      ('e','one',NULL,'s2',NULL,'0905','2026-09-22','2026-09-22',3,'Zalo',NULL);
    INSERT INTO raw_pos_order_items VALUES ('a','p1',NULL,'Gentadox',0,1),('a','gift',NULL,'Quà',1,1),('b','p2',NULL,'SK + GK',0,1);`);
  return db;
}

void test('Marketing trạng thái chốt loại đơn hủy và chưa xác nhận; trạng thái giao vận bao gồm đơn đã nhận', () => {
  const db = fixture();
  const count = (stage: Parameters<typeof stageSql>[0]) => Number((db.prepare(`SELECT COUNT(*) AS n FROM raw_pos_orders o WHERE o.marketer_id IS NOT NULL AND ${stageSql(stage)}`).get() as { n: number }).n);
  assert.equal(count('confirmed'), 2);
  assert.equal(count('shipped'), 1);
  assert.equal(count('unconfirmed'), 1);
  assert.equal(count('cancelled'), 1);
  db.close();
});

void test('Marketing lọc sản phẩm không tính quà và ghép đúng người/nguồn đơn chuẩn', () => {
  const db = fixture();
  const query = `SELECT o.id FROM raw_pos_orders o WHERE o.marketer_id=? AND o.seller_id=? AND o.care_id=? AND ${productExists()} AND ${SOURCE_FIELD}=?`;
  const rows = db.prepare(query).all('m1','s1','c1','p:p1','Facebook') as { id: string }[];
  assert.deepEqual(rows.map((x) => x.id), ['a']);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM raw_pos_orders o WHERE ${productExists()}`).get('p:gift')?.n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM raw_pos_orders o WHERE ${SOURCE_FIELD}=?`).get('Facebook')?.n, 2);
  db.close();
});
