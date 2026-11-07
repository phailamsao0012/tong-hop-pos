import assert from 'node:assert/strict';
import { test } from 'node:test';

// Tỷ lệ tự upsell CSKH và số lượng sản phẩm theo người bán (07/11/2026), khách ảo trên D1 giả.
void test('cskhUpsell: khách MKT giao CSKH, có / không / nhiều lần bán thêm', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { cskhUpsell, upsellOf } = await import('../lib/reports/cskh-upsell');
  const { sellerProductQty, qtyOf } = await import('../lib/reports/seller-product-qty');
  const { raw, db } = emptyDb();
  const now = '2026-11-07T00:00:00Z';
  const user = raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)');
  user.run('u1', 'p1', 'mkt1', 'Mai MKT', now); user.run('u2', 'p1', 'sale1', 'Hà SALE', now);
  user.run('u3', 'p1', 'cskh1', 'Thu CSKH', now); user.run('u4', 'p1', 'cskh2', 'Vy CSKH', now);
  const order = raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,created_at,status_code,seller_id,care_id,marketer_id,first_confirmed_at,first_closed_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const item = raw.prepare('INSERT INTO raw_pos_order_items (id,order_id,pos_id,name,quantity,line_total,is_bonus) VALUES (?,?,?,?,?,?,?)');
  const c = '2026-11-03T05:00:00Z';
  // Khách A: MKT về, giao cskh1, cskh1 bán thêm 2 lần → đếm 1 khách.
  order.run('a1', 'p1', 's', '1', '0900000001', '2026-11-02T02:00:00Z', 3, 'sale1', 'cskh1', 'mkt1', c, c, now);
  order.run('a2', 'p1', 's', '2', '0900000001', '2026-11-04T02:00:00Z', 3, 'cskh1', 'cskh1', null, c, c, now);
  order.run('a3', 'p1', 's', '3', '0900000001', '2026-11-05T02:00:00Z', 1, 'cskh1', 'cskh1', null, c, c, now);
  // Khách B: giao cskh1, chưa bán thêm (đơn sau bị hủy).
  order.run('b1', 'p1', 's', '4', '0900000002', '2026-11-02T03:00:00Z', 3, 'sale1', 'cskh1', 'mkt1', c, c, now);
  order.run('b2', 'p1', 's', '5', '0900000002', '2026-11-04T03:00:00Z', 6, 'cskh1', 'cskh1', null, c, null, now);
  // Khách C: giao cskh2, nhưng cskh1 bán → không tính cho ai.
  order.run('c1', 'p1', 's', '6', '0900000003', '2026-11-02T04:00:00Z', 3, 'sale1', 'cskh2', 'mkt1', c, c, now);
  order.run('c2', 'p1', 's', '7', '0900000003', '2026-11-04T04:00:00Z', 3, 'cskh1', 'cskh1', null, c, c, now);
  // Khách D: không qua MKT → không vào mẫu số.
  order.run('d1', 'p1', 's', '8', '0900000004', '2026-11-02T04:00:00Z', 3, 'cskh2', 'cskh2', null, c, c, now);
  item.run('i1', 'a1', 'p1', 'GENTADOX', 2, 600_000, 0); item.run('i2', 'a2', 'p1', 'Oxy', 3, 300_000, 0);
  item.run('i3', 'a2', 'p1', 'Quà tặng', 1, 0, 0); item.run('i4', 'b2', 'p1', 'Gentadox', 9, 0, 0); item.run('i5', 'a3', 'p1', 'Gentadox', 1, 0, 1);

  const rows = await cskhUpsell(db, ['p1'], '2026-10-31T17:00:00Z', '2026-11-30T17:00:00Z');
  const by = Object.fromEntries(rows.map((r) => [r.cskhId, r]));
  assert.deepEqual(by.cskh1, { cskhId: 'cskh1', handed: 2, upsold: 1, rate: 50 });
  assert.deepEqual(by.cskh2, { cskhId: 'cskh2', handed: 1, upsold: 0, rate: 0 });
  assert.deepEqual(upsellOf(rows, ['cskh1', 'cskh2']), { handed: 3, upsold: 1, rate: 1 / 3 * 100 });

  const qty = await sellerProductQty(db, ['p1'], '2026-10-31T17:00:00Z', '2026-11-30T17:00:00Z');
  assert.deepEqual(qty, { sale1: { gentadox: 2 }, cskh1: { oxy: 3 } });
  assert.deepEqual(qtyOf(qty, ['sale1', 'cskh1', 'ai']), { gentadox: 2, oxy: 3 });
});
