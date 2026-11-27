// Bảng gọn Marketing, bước 2: điền lịch sử theo (POS, tháng), đối chiếu, mốc "đã điền đủ", việc đêm. Dữ liệu ảo hoàn toàn.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { orderStatements, loadStored } from '../lib/pancake/sync';
import { SLIM_ITEM_COLUMNS, SLIM_ORDER_COLUMNS, setSlimWrite } from '../lib/reports/mkt-slim';
import {
  SLIM_READY_KEY, compareSlimMonth, dropSlimReadyIfOff, fillSlimMonth, inSlimNightWindow, maybeSlimFillNightly, readFillState,
  resetSlimOffCheck, resetSlimReadyMemo, runSlimFill, slimMonths, slimReady,
} from '../lib/reports/mkt-slim-fill';
import { historyHas } from '../lib/reports/van-don';
import type { SourceOrder } from '../lib/pancake/pancake';

const item = (n: number, qty = 1) => ({ product_id: `sp${n}`, variation_id: `bt${n}`, quantity: qty, variation_info: { name: `Sản phẩm ảo ${n}`, retail_price: 100000 } });
const order = (id: string, at: string, over: Partial<SourceOrder> = {}): SourceOrder => ({
  id, status: 1, marketer: { id: 'm1' }, assigning_seller: { id: 's1' }, bill_phone_number: '0900000001', inserted_at: at, updated_at: at,
  total_price: 200000, total_price_after_sub_discount: 200000, status_history: [{ status: 0, updated_at: at }, { old_status: 0, status: 1, updated_at: at }],
  items: [item(1), item(2, 2)], ...over,
});

function fixture() {
  setSlimWrite(false); // dữ liệu cũ nạp khi chưa bật ghi kèm: bảng gọn rỗng, phải điền lịch sử
  resetSlimReadyMemo();
  const f = emptyDb();
  f.raw.exec("INSERT INTO pos_shops(id,name,shop_id) VALUES ('p','POS ảo','1'),('q','POS ảo 2','2')");
  const save = async (pos: 'p' | 'q', o: SourceOrder) => {
    const s = orderStatements(f.db, pos, pos === 'p' ? '1' : '2', o, o.updated_at!, (await loadStored(f.db, pos, [o])).get(`${pos}:${o.id}`));
    if (s.length) await f.db.batch(s);
  };
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
  return { ...f, save, expected, actual };
}

async function seed(f: ReturnType<typeof fixture>) {
  await f.save('p', order('a1', '2026-09-03T02:00:00.000Z'));
  await f.save('p', order('a2', '2026-09-28T16:59:00.000Z', { status: 2, status_history: [{ status: 0, updated_at: '2026-09-28T16:59:00.000Z' }, { old_status: 0, status: 8, updated_at: '2026-09-29T01:00:00.000Z' }, { old_status: 8, status: 2, updated_at: '2026-09-29T02:00:00.000Z' }] }));
  await f.save('p', order('a3', '2026-10-01T00:00:00.000Z', { marketer: null }));
  await f.save('p', order('a4', '2026-10-15T05:00:00.000Z', { status: 7, marketer: { id: 'm2' } }));
  await f.save('p', order('a5', '2026-11-20T05:00:00.000Z', { items: [item(3, 4)] }));
  await f.save('q', order('b1', '2026-10-02T05:00:00.000Z', { marketer: { id: 'm3' } }));
  await f.save('q', order('b2', '2026-11-02T05:00:00.000Z', { marketer: { id: ' ' } }));
}
const night = new Date('2026-11-26T16:00:00.000Z'); // 23h00 giờ VN

void test('điền đủ lịch sử theo (POS, tháng): khớp bảng gốc, có mốc đã điền đủ, chạy lại không trùng', async () => {
  const f = fixture();
  try {
    await seed(f);
    assert.deepEqual(await slimMonths(f.db), ['p:2026-11', 'p:2026-10', 'q:2026-10', 'p:2026-09'], 'mới trước cũ sau, chỉ tháng có đơn có Marketer');
    // Lượt đầu chỉ cho 2 tháng: chưa đủ, chưa có mốc.
    const r1 = await runSlimFill(f.db, { now: night, maxMonths: 2 });
    assert.equal(r1.steps.length, 2);
    assert.equal(r1.pending, 2);
    assert.equal(r1.ready, false);
    assert.equal(await slimReady(f.db), false);
    const r2 = await runSlimFill(f.db, { now: night });
    assert.equal(r2.pending, 0);
    assert.equal(r2.bad, 0);
    assert.equal(r2.ready, true);
    assert.deepEqual(f.actual(), f.expected());
    // Chạy lại: không có tháng nào phải điền, không trùng dòng.
    const r3 = await runSlimFill(f.db, { now: night });
    assert.equal(r3.steps.length, 0);
    for (const k of ['p:2026-09', 'p:2026-10']) { const [pos, m] = k.split(':'); await fillSlimMonth(f.db, pos, m); }
    assert.deepEqual(f.actual(), f.expected(), 'điền lại tháng đã đủ không tạo trùng');
    assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM mkt_orders_slim').get()?.n, 5);
  } finally { f.raw.close(); }
});

void test('đối chiếu phát hiện lệch (thiếu dòng, sai tiền, sai trạng thái, sai món), dựng lại tháng và bật lại mốc khi khớp', async () => {
  const f = fixture();
  try {
    await seed(f);
    await runSlimFill(f.db, { now: night });
    assert.equal(await slimReady(f.db), true);
    const corrupt = [
      "DELETE FROM mkt_orders_slim WHERE id='p:a1'",
      "UPDATE mkt_orders_slim SET current_total=current_total+1 WHERE id='p:a2'",
      "UPDATE mkt_orders_slim SET status_code=1 WHERE id='p:a4'",
      "UPDATE mkt_order_items_slim SET quantity=quantity+1 WHERE order_id='p:a5'",
      "UPDATE mkt_orders_slim SET was_sent=0 WHERE id='p:a2'",
    ];
    const month = { 'p:a1': '2026-09', 'p:a2': '2026-09', 'p:a4': '2026-10', 'p:a5': '2026-11' } as Record<string, string>;
    for (const sql of corrupt) {
      f.raw.exec(sql);
      const id = sql.match(/'(p:a\d)'/)![1];
      const c = await compareSlimMonth(f.db, 'p', month[id]);
      assert.equal(c.ok, false, sql);
      assert.ok(c.diff.length > 0);
      assert.ok(c.diff.every((d) => /^[a-z_]+\.[a-z0-9-]+$/.test(d)), 'chỉ tên chỉ số, không số liệu');
      // Đối chiếu vòng tròn hết các tháng: dựng lại tháng lệch, cuối lượt khớp hết và có lại mốc.
      resetSlimReadyMemo();
      const r = await runSlimFill(f.db, { now: night, verifyMonths: 4 });
      assert.ok(r.steps.some((s) => s.kind === 'verify' && s.key === `p:${month[id]}`));
      assert.equal(r.ready, true);
      assert.deepEqual(f.actual(), f.expected(), `dựng lại sau: ${sql}`);
    }
    // Đơn đổi tháng tạo (sửa ngày trên nguồn) và đơn mất Marketer khi chưa bật ghi kèm: lần đối chiếu sau dọn đúng.
    f.raw.exec("UPDATE raw_pos_orders SET created_at='2026-10-05T00:00:00.000Z' WHERE id='p:a1'; UPDATE raw_pos_orders SET marketer_id=NULL WHERE id='p:a5'");
    assert.equal((await compareSlimMonth(f.db, 'p', '2026-09')).ok, false);
    assert.equal((await compareSlimMonth(f.db, 'p', '2026-11')).ok, false);
    resetSlimReadyMemo();
    await runSlimFill(f.db, { now: night, verifyMonths: 4 });
    assert.deepEqual(f.actual(), f.expected());
    assert.equal(await slimReady(f.db), true);
  } finally { f.raw.close(); }
});

void test('ghi kèm bật trong lúc điền: đơn mới / đổi giữa các lượt vẫn khớp', async () => {
  const f = fixture();
  try {
    await seed(f);
    await runSlimFill(f.db, { now: night, maxMonths: 1 });
    setSlimWrite(true);
    await f.save('p', order('a6', '2026-11-25T05:00:00.000Z'));
    await f.save('p', order('a1', '2026-09-03T02:00:00.000Z', { status: 3, updated_at: '2026-11-25T06:00:00.000Z' }));
    await runSlimFill(f.db, { now: night });
    assert.deepEqual(f.actual(), f.expected());
    assert.equal(await slimReady(f.db), true);
  } finally { setSlimWrite(false); f.raw.close(); }
});

void test('việc đêm: chỉ khi THP_MKT_SLIM_WRITE=1 và trong 22h30–05h30 giờ VN; tắt ghi kèm thì bỏ mốc', async () => {
  const f = fixture();
  try {
    await seed(f);
    assert.equal(inSlimNightWindow(new Date('2026-11-26T15:29:00.000Z')), false, '22h29');
    assert.equal(inSlimNightWindow(new Date('2026-11-26T15:30:00.000Z')), true, '22h30');
    assert.equal(inSlimNightWindow(new Date('2026-11-26T22:29:00.000Z')), true, '05h29');
    assert.equal(inSlimNightWindow(new Date('2026-11-26T22:30:00.000Z')), false, '05h30');
    assert.equal(inSlimNightWindow(new Date('2026-11-26T05:00:00.000Z')), false, '12h');
    assert.equal(await maybeSlimFillNightly(f.db, {}, night), 0, 'cờ tắt');
    assert.equal(await maybeSlimFillNightly(f.db, { THP_MKT_SLIM_WRITE: '1' }, new Date('2026-11-26T10:00:00.000Z')), 0, '17h');
    assert.equal((await readFillState(f.db)).list.length, 0, 'chưa chạy gì');
    assert.ok(await maybeSlimFillNightly(f.db, { THP_MKT_SLIM_WRITE: '1' }, night, 60000) > 0);
    assert.equal(await slimReady(f.db), true);
    resetSlimOffCheck();
    await dropSlimReadyIfOff(f.db, true);
    assert.equal(await slimReady(f.db), true, 'đang bật: giữ mốc');
    await dropSlimReadyIfOff(f.db, false);
    resetSlimReadyMemo();
    assert.equal(await slimReady(f.db), false, 'tắt ghi kèm: bỏ mốc');
    assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM app_settings WHERE key=?').get(SLIM_READY_KEY)?.n, 0);
  } finally { f.raw.close(); }
});
