// Bảng gọn Marketing (lib/reports/mkt-slim.ts, bước 1): sau mỗi lần ghi đơn, bảng gọn phải khớp đúng bảng gốc (đơn có Marketer).
// Dữ liệu ảo hoàn toàn: POS "p", đơn "o1"…, Marketer "m1"/"m2", số tiền tròn.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { orderStatements, loadStored } from '../lib/pancake/sync';
import { clearSlimPos, ensureSlimSchema, setSlimWrite, slimStatements, SLIM_ITEM_COLUMNS, SLIM_ORDER_COLUMNS } from '../lib/reports/mkt-slim';
import { historyHas } from '../lib/reports/van-don';
import type { SourceOrder } from '../lib/pancake/pancake';

const at = '2026-11-08T03:00:00Z';
const later = '2026-11-08T05:00:00Z';

function fixture(on = true) {
  setSlimWrite(on);
  const f = emptyDb();
  f.raw.exec("INSERT INTO pos_shops(id,name,shop_id) VALUES ('p','POS ảo','1')");
  const save = async (o: SourceOrder) => {
    const s = orderStatements(f.db, 'p', '1', o, at, (await loadStored(f.db, 'p', [o])).get(`p:${o.id}`));
    if (s.length) await f.db.batch(s);
    return s.length;
  };
  /** Bảng gọn kỳ vọng: dựng lại từ bảng gốc bằng chính các cột và biểu thức lịch sử của báo cáo hiện nay. */
  const expected = () => ({
    orders: f.raw.prepare(`SELECT ${SLIM_ORDER_COLUMNS.map((c) => `o.${c}`).join(',')},${historyHas('o', '8')} AS was_packed,${historyHas('o', '2,3,16,4,15,5')} AS was_sent
      FROM raw_pos_orders o WHERE NULLIF(TRIM(o.marketer_id),'') IS NOT NULL ORDER BY o.id`).all(),
    items: f.raw.prepare(`SELECT ${SLIM_ITEM_COLUMNS.map((c) => `i.${c}`).join(',')} FROM raw_pos_order_items i JOIN raw_pos_orders o ON o.id=i.order_id
      WHERE NULLIF(TRIM(o.marketer_id),'') IS NOT NULL ORDER BY i.id`).all(),
  });
  const actual = () => ({
    orders: f.raw.prepare(`SELECT ${SLIM_ORDER_COLUMNS.join(',')},was_packed,was_sent FROM mkt_orders_slim ORDER BY id`).all(),
    items: f.raw.prepare(`SELECT ${SLIM_ITEM_COLUMNS.join(',')} FROM mkt_order_items_slim ORDER BY id`).all(),
  });
  const same = (why: string) => assert.deepEqual(actual(), expected(), why);
  return { ...f, save, same, actual };
}

const item = (n: number, qty = 1) => ({ product_id: `sp${n}`, variation_id: `bt${n}`, quantity: qty, variation_info: { name: `Sản phẩm ảo ${n}`, retail_price: 100000 } });
const order = (id: string, over: Partial<SourceOrder> = {}): SourceOrder => ({
  id, status: 0, marketer: { id: 'm1' }, assigning_seller: { id: 's1' }, bill_phone_number: '0900000001', inserted_at: at, updated_at: at,
  total_price: 200000, total_discount: 0, total_price_after_sub_discount: 200000, order_sources: '-1', note: 'ghi chú ảo', tags: [{ id: 1, name: 'Nhãn ảo' }],
  status_history: [{ status: 0, updated_at: at }], items: [item(1), item(2, 2)], ...over,
});

void test('bảng gọn khớp bảng gốc sau đơn mới, đổi trạng thái, đổi / mất Marketer, xoá, đổi món', async () => {
  const f = fixture();
  try {
    await ensureSlimSchema(f.db);
    await f.save(order('o1'));
    await f.save(order('o2', { marketer: null }));
    await f.save(order('o3', { marketer: { id: '  ' } }));
    f.same('đơn mới');
    assert.equal(f.actual().orders.length, 1, 'chỉ đơn có Marketer');
    assert.equal(f.actual().items.length, 2);

    // Xác nhận rồi đóng hàng rồi giao: cột giữ giá trị đầu (first_confirmed_at) và cờ lịch sử.
    const h1 = [{ status: 0, updated_at: at }, { old_status: 0, status: 1, updated_at: later }];
    await f.save(order('o1', { status: 1, updated_at: later, status_history: h1 }));
    f.same('xác nhận');
    const h2 = [...h1, { old_status: 1, status: 8, updated_at: later }, { old_status: 8, status: 2, updated_at: later }];
    await f.save(order('o1', { status: 2, updated_at: '2026-11-08T06:00:00Z', status_history: h2 }));
    f.same('đóng hàng, đã gửi');
    assert.deepEqual([f.actual().orders[0].was_packed, f.actual().orders[0].was_sent], [1, 1]);

    // Đổi Marketer; đơn chưa có Marketer được gán; đơn mất Marketer.
    await f.save(order('o1', { status: 2, marketer: { id: 'm2' }, updated_at: '2026-11-08T07:00:00Z', status_history: h2 }));
    await f.save(order('o2', { marketer: { id: 'm1' }, updated_at: later }));
    f.same('đổi / gán Marketer');
    assert.equal(f.actual().orders.length, 2);
    await f.save(order('o2', { marketer: null, updated_at: '2026-11-08T07:00:00Z' }));
    f.same('mất Marketer');
    assert.equal(f.actual().items.filter((i) => i.order_id === 'p:o2').length, 0, 'món của đơn mất Marketer cũng xoá');

    // Đổi món: thêm, bớt số lượng, bỏ món.
    await f.save(order('o1', { status: 2, marketer: { id: 'm2' }, updated_at: '2026-11-08T08:00:00Z', status_history: h2, items: [item(1, 3), item(2, 2), item(3)] }));
    f.same('thêm món, đổi số lượng');
    await f.save(order('o1', { status: 2, marketer: { id: 'm2' }, updated_at: '2026-11-08T09:00:00Z', status_history: h2, items: [item(3)] }));
    f.same('bỏ món');

    // Đơn trạng thái Đã xóa (7) vẫn giữ như bảng gốc (báo cáo có mốc "Đã xóa").
    await f.save(order('o4', { status: 7 }));
    f.same('đơn Đã xóa');

    // Dòng gốc bị xoá hẳn: câu ghi bảng gọn xoá theo.
    f.raw.exec("DELETE FROM raw_pos_order_items WHERE order_id='p:o4'; DELETE FROM raw_pos_orders WHERE id='p:o4'");
    await f.db.batch(slimStatements(f.db, 'p:o4'));
    f.same('xoá dòng gốc');

    // Lặp lại nguồn không đổi: không câu ghi nào (bảng gọn không thêm dòng ghi).
    assert.equal(await f.save(order('o1', { status: 2, marketer: { id: 'm2' }, updated_at: '2026-11-08T09:00:00Z', status_history: h2, items: [item(3)] })), 0);

    // Bản demo dựng lại thế giới ảo: xoá bảng gọn theo POS.
    await clearSlimPos(f.db, 'p');
    assert.deepEqual(f.actual(), { orders: [], items: [] });
  } finally { f.raw.close(); }
});

void test('cờ tắt (mặc định): không có câu ghi bảng gọn nào', async () => {
  const f = fixture(false);
  try {
    const s = orderStatements(f.db, 'p', '1', order('o1'), at);
    assert.ok(s.length > 0);
    await f.db.batch(s);
    assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='mkt_orders_slim'").get()?.n, 0, 'không tạo bảng khi tắt');
  } finally { f.raw.close(); }
});
