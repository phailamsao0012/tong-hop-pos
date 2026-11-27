// Bậc thang "Data của NV: mua lần đầu gì" theo POS đang chọn (anh Vũ 27/11/2026): chỉ khách có đơn đã nhận đầu tiên ở POS đang chọn,
// đơn ở POS khác không cộng, khách bắt nguồn POS khác chỉ ghi chú theo POS; nhóm = thẻ sản phẩm mới của đơn T0. Số và SĐT ảo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { cskhLadder, ladderResponse } from '../lib/reports/purchase-ladder';

void test('CSKH bậc thang theo POS: bỏ khách bắt nguồn POS khác, ghi chú nguồn, thẻ mới, cộng các thẻ = tổng', async () => {
  const { raw } = emptyDb();
  const order = raw.prepare(`INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,seller_id,care_id,status_code,net_total,created_at,fetched_at)
    VALUES (?,?,'s',?,?,?,?,3,?,?,'x')`);
  const item = raw.prepare(`INSERT INTO raw_pos_order_items (id,order_id,pos_id,name,quantity) VALUES (?,?,?,?,1)`);
  const cust = raw.prepare('INSERT INTO pos_customers (id,pos_id,customer_id,phone,assigned_user_id,fetched_at) VALUES (?,?,?,?,?,?)');
  let n = 0;
  const add = (pos: string, phone: string, at: string, name: string) => { const id = `o${++n}`; order.run(id, pos, id, phone, 'nv-ban', 'nv-cskh', 1_000_000, at); item.run(`${id}:1`, id, pos, name); };
  // Khách A: đầu ở Siêu Vô Gạo (Gentadox), mua tiếp Siêu Vô Gạo (Bencid) và một đơn ở BIO NANO (không cộng khi xem Siêu Vô Gạo).
  add('sieu-vo-gao', '0900000001', '2026-09-01T03:00:00', 'GENTADOX 100g');
  add('sieu-vo-gao', '0900000001', '2026-10-01T03:00:00', 'Bencid 1 lít');
  add('bio-nano', '0900000001', '2026-10-05T03:00:00', 'Doxytylo 100g');
  // Khách B: đầu ở BIO NANO, sau mua Siêu Vô Gạo → bắt nguồn POS khác khi xem Siêu Vô Gạo.
  add('bio-nano', '0900000002', '2026-08-01T03:00:00', 'Doxytylo 100g');
  add('sieu-vo-gao', '0900000002', '2026-09-10T03:00:00', 'GENTADOX 100g');
  // Khách C: chỉ Siêu Vô Gạo, sản phẩm lạ → thẻ Khác (vẫn tính).
  add('sieu-vo-gao', '0900000003', '2026-09-03T03:00:00', 'Men tỏi');
  // Khách D: được giao nhưng chưa có đơn đã nhận.
  for (const [i, phone] of ['0900000001', '0900000002', '0900000003', '0900000004'].entries()) cust.run(`c${i}`, 'sieu-vo-gao', `c${i}`, phone, 'nv-cskh', 'x');

  const r = await cskhLadder({ staffId: 'nv-cskh', posIds: ['sieu-vo-gao'] });
  assert.equal(r.data, 4);
  assert.equal(r.noDelivered, 1);
  assert.deepEqual(r.fromOther.map((x) => [x.posId, x.customers]), [['bio-nano', 1]]);
  assert.equal(r.total.t0, 2, 'chỉ A và C');
  const byLabel = new Map(r.groups.map((g) => [g.label, g]));
  assert.deepEqual(r.groups.map((g) => g.key), ['gentadox', 'oxy', 'sat-trung', 'khac'], 'bộ thẻ của Siêu Vô Gạo');
  assert.equal(byLabel.get('Gentadox')!.t0, 1);
  assert.equal(byLabel.get('Khác')!.t0, 1);
  assert.equal(r.groups.reduce((a, g) => a + g.t0, 0), r.total.t0, 'cộng các thẻ = tổng');
  // A: T1 là đơn Bencid ở Siêu Vô Gạo; đơn BIO NANO không cộng.
  assert.equal(byLabel.get('Gentadox')!.ladder[0].n, 1);
  assert.equal(byLabel.get('Gentadox')!.laterOrders, 1);
  assert.equal(byLabel.get('Gentadox')!.cross, 1, 'up sang thẻ Sát trùng');
  assert.equal(r.steps, 1);
  // Danh sách khách của ô dùng tên thẻ.
  const list = await ladderResponse(r, new URLSearchParams({ step: '0', listGroup: 'Gentadox' })) as { total: number; group: string | null };
  assert.equal(list.group, 'Gentadox');
  assert.equal(list.total, 1);

  // Xem cả hai POS: B đầu ở BIO NANO (đang chọn) nên tính; A đầu ở Siêu Vô Gạo, cả 3 đơn cộng.
  const both = await cskhLadder({ staffId: 'nv-cskh', posIds: ['sieu-vo-gao', 'bio-nano'] });
  assert.equal(both.fromOther.length, 0);
  assert.equal(both.total.t0, 3);
  assert.equal(both.total.laterOrders, 3);
  raw.close();
});
