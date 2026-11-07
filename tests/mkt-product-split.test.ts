import assert from 'node:assert/strict';
import { test } from 'node:test';

// Tách số MKT theo sản phẩm (07/11/2026): số ảo, D1 giả trên node:sqlite.
void test('mktProductSplit: đếm theo dòng sản phẩm, chỉ đơn chia Sale, tiền và SL chỉ đơn XN, bỏ quà tặng', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { mktProductSplit, lineCaseSql } = await import('../lib/reports/mkt-product-split');
  const { raw, db } = emptyDb();
  const now = '2026-11-07T00:00:00Z';
  const user = raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)");
  user.run('u1', 'p1', 'mkt1', 'Mai MKT', now);
  user.run('u2', 'p1', 'mkt2', 'Lan', now); // không hậu tố: không tính
  user.run('u3', 'p1', 'sale1', 'Hà SALE', now);
  user.run('u4', 'p1', 'cskh1', 'Thu CSKH', now);
  const order = raw.prepare("INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,created_at,status_code,seller_id,marketer_id,first_confirmed_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  const item = raw.prepare("INSERT INTO raw_pos_order_items (id,order_id,pos_id,name,quantity,line_total,is_bonus) VALUES (?,?,?,?,?,?,?)");
  // o1: Gentadox + Oxy, đã XN.
  order.run('o1', 'p1', 's', '1', '0900000001', '2026-11-06T02:00:00Z', 1, 'sale1', 'mkt1', '2026-11-06T03:00:00Z', now);
  item.run('i1', 'o1', 'p1', 'GENTADOX 100ml', 2, 600_000, 0);
  item.run('i2', 'o1', 'p1', 'Oxy + Bổ huyết', 1, 200_000, 0);
  item.run('i3', 'o1', 'p1', 'Quà tặng áo', 1, 0, 0);
  // o2: Gentadox chưa XN, cùng SĐT khác.
  order.run('o2', 'p1', 's', '2', '0900000002', '2026-11-06T04:00:00Z', 0, 'sale1', 'mkt1', null, now);
  item.run('i4', 'o2', 'p1', 'Gentadox', 1, 300_000, 0);
  // o3: GodKill, chia CSKH: không vào số Sale.
  order.run('o3', 'p1', 's', '3', '0900000003', '2026-11-06T04:00:00Z', 1, 'cskh1', 'mkt1', '2026-11-06T05:00:00Z', now);
  item.run('i5', 'o3', 'p1', 'GODKILL', 1, 500_000, 0);
  // o4: marketer không hậu tố.
  order.run('o4', 'p1', 's', '4', '0900000004', '2026-11-06T04:00:00Z', 1, 'sale1', 'mkt2', '2026-11-06T05:00:00Z', now);
  item.run('i6', 'o4', 'p1', 'Gentadox', 1, 300_000, 0);
  // o5: Sp lạ + hàng tặng is_bonus, ngoài kỳ thì không tính.
  order.run('o5', 'p1', 's', '5', '0900000005', '2026-11-08T04:00:00Z', 1, 'sale1', 'mkt1', '2026-11-08T05:00:00Z', now);
  item.run('i7', 'o5', 'p1', 'Gentadox', 1, 300_000, 0);

  const scope = { posIds: ['p1'], startUtc: '2026-11-05T17:00:00Z', endUtc: '2026-11-06T17:00:00Z', team: 'all' as const };
  const out = await mktProductSplit(db, scope);
  assert.deepEqual(Object.keys(out.byMarketer), ['mkt1']);
  assert.deepEqual(out.byMarketer.mkt1.gentadox, { orders: 2, phones: 2, confirmed: 1, revenue: 600_000, quantity: 2 });
  assert.deepEqual(out.byMarketer.mkt1.oxy, { orders: 1, phones: 1, confirmed: 1, revenue: 200_000, quantity: 1 });
  assert.equal(out.byMarketer.mkt1['sk-gk'], undefined);
  assert.deepEqual(out.total.gentadox, out.byMarketer.mkt1.gentadox);

  // Nút CSKH: chỉ đơn chia CSKH.
  const cskh = await mktProductSplit(db, { ...scope, team: 'cskh' });
  assert.deepEqual(cskh.byMarketer.mkt1, { 'sk-gk': { orders: 1, phones: 1, confirmed: 1, revenue: 500_000, quantity: 1 } });

  // Phân dòng theo tên.
  const line = (name: string) => (raw.prepare(`SELECT ${lineCaseSql('n')} AS l FROM (SELECT ? AS n)`).get(name) as { l: string }).l;
  assert.equal(line('BIO NANO SHIELD'), 'nano-shield');
  assert.equal(line('SK + GK combo'), 'sk-gk');
  assert.equal(line('Bio Nano Clean'), 'nano-clean');
  assert.equal(line('Men vi sinh'), 'khac');
});
