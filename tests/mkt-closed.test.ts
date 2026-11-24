import test from 'node:test';
import assert from 'node:assert/strict';

// DT chốt MKT kể cả đơn hủy (anh Vũ 24/11/2026). Đơn giả: mỗi trạng thái một đơn, tiền giả.
void test('đơn MKT đã chốt gồm cả hủy / hoàn; hủy chưa giao ĐVVC + đơn đi + còn chờ = Đơn chốt; DT chuyển không quá DT chốt', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { mktClosedSql } = await import('../lib/reports/mkt-closed');
  const { PACKED_SQL, NEVER_SENT_CANCELLED_SQL, AFTER_PACK_RETURNED_SQL } = await import('../lib/reports/van-don');
  const { raw } = emptyDb();
  const h = (...codes: number[]) => JSON.stringify(codes.map((status, i) => ({ old_status: i ? codes[i - 1] : null, status, updated_at: `2026-11-0${i + 1}T00:00:00` })));
  // [mã trạng thái, lịch sử, tiền, đã chốt?]
  const orders: [number, string, number, boolean][] = [
    [0, h(0), 100, false], // mới, chưa chốt
    [17, h(0, 17), 100, false], // chờ, chưa chốt
    [1, h(0, 1), 200, true], // đã chốt, chưa đóng hàng
    [8, h(0, 1, 8), 300, true], // đang đóng hàng
    [2, h(0, 1, 8, 9, 2), 400, true], // đang giao
    [3, h(0, 1, 8, 9, 2, 3), 500, true], // đã nhận
    [5, h(0, 1, 8, 9, 2, 4, 5), 600, true], // đã hoàn
    [6, h(0, 1, 6), 700, true], // hủy trước đóng hàng
    [6, h(0, 1, 8, 6), 800, true], // hủy sau đóng hàng, chưa gửi
    [6, h(0, 1, 8, 9, 2, 6), 900, true], // hủy sau khi đã gửi (tính là hoàn)
  ];
  orders.forEach(([s, hist, net], i) => raw.prepare("INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,status_code,status_history_json,net_total,first_confirmed_at,created_at,updated_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(`o${i}`, 'pos-gia', 'shop', `${i}`, s, hist, net, s === 0 || s === 17 ? null : '2026-11-02T00:00:00', '2026-11-01T00:00:00', '2026-11-03T00:00:00', '2026-11-03T00:00:00'));
  const one = (where: string) => raw.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(o.net_total),0) AS t FROM raw_pos_orders o WHERE ${where}`).get() as { n: number; t: number };
  const closed = one(mktClosedSql('o')), packed = one(`${mktClosedSql('o')} AND ${PACKED_SQL('o')}`);
  const cancelled = one(`${mktClosedSql('o')} AND ${NEVER_SENT_CANCELLED_SQL('o')}`), returned = one(`${mktClosedSql('o')} AND ${PACKED_SQL('o')} AND ${AFTER_PACK_RETURNED_SQL('o')}`);
  const waiting = one(`${mktClosedSql('o')} AND NOT ${PACKED_SQL('o')} AND o.status_code<>6`);
  assert.equal(closed.n, 8, 'đơn chốt: mọi đơn đã xác nhận, kể cả 3 đơn hủy');
  assert.equal(closed.t, 200 + 300 + 400 + 500 + 600 + 700 + 800 + 900);
  assert.equal(cancelled.n, 2, 'hủy chưa từng giao ĐVVC: trước đóng hàng + sau đóng hàng chưa gửi');
  assert.equal(returned.n, 2, 'hoàn: đã hoàn + hủy sau khi đã gửi');
  // Đơn chốt = hủy chưa giao ĐVVC (ngoài đơn đi) + đơn đi (trừ phần hủy sau đóng hàng chưa gửi, đã tính ở hủy) + còn chờ đóng hàng.
  const packedNotCancelled = one(`${mktClosedSql('o')} AND ${PACKED_SQL('o')} AND NOT ${NEVER_SENT_CANCELLED_SQL('o')}`);
  assert.equal(cancelled.n + packedNotCancelled.n + waiting.n, closed.n);
  assert.ok(packed.t <= closed.t, 'DT chuyển không quá DT chốt');
});
