import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { customerStatements, loadCskhWatch, saveCskhWatch, syncCskhWatch } from '../lib/pancake/customers-sync';
import { loadNotesPending } from '../lib/pancake/notes-pending';
import { setPancakeTransport, type SourceCustomer, type SourceNote } from '../lib/pancake/pancake';

const at = '2026-10-28T03:00:00.000Z';
const t0 = Date.parse('2026-10-28T02:00:00Z') / 1000;
const shop = { id: 'p', shop_id: '1' };
const note = (id: string, n: number): SourceNote => ({ id: `${id}-${n}`, message: 'Ghi chú ảo', created_at: t0 + n * 60 });
const cust = (id: string, owner: string, notes: number): SourceCustomer => ({ id, name: 'Khách ảo', assigned_user_id: owner, notes: Array.from({ length: notes }, (_, i) => note(id, i)) });

function fixture(t: { after: (fn: () => void) => void }) {
  const f = emptyDb();
  t.after(() => { f.raw.close(); setPancakeTransport(async () => { throw new Error('Transport closed'); }); });
  return f;
}

void test('canh CSKH: hỏi theo customer_ids, xếp khách có ghi chú mới vào hàng chờ, xoay hết vòng rồi quay lại', async (t) => {
  const f = fixture(t);
  // 150 khách của cs1, 30 khách của cs2, 20 khách của người Sale (không được hỏi).
  const stored = [...Array.from({ length: 150 }, (_, i) => cust(`a${i}`, 'cs1', 1)), ...Array.from({ length: 30 }, (_, i) => cust(`b${i}`, 'cs2', 1)), ...Array.from({ length: 20 }, (_, i) => cust(`s${i}`, 'sale1', 1))];
  for (const c of stored) await f.db.batch(customerStatements(f.db, 'p', c, at));
  // Trên Pancake: a5, a120, b7 có thêm ghi chú mà updated_at không đổi.
  const live = new Map(stored.map((c) => [String(c.id), c]));
  for (const id of ['a5', 'a120', 'b7']) live.set(id, cust(id, id.startsWith('b') ? 'cs2' : 'cs1', 2));
  const asked: string[][] = [];
  setPancakeTransport(async (url) => {
    const ids = (url.searchParams.get('customer_ids') ?? '').split(',').filter(Boolean);
    asked.push(ids);
    return Response.json({ success: true, data: ids.map((id) => live.get(id)!).filter(Boolean) });
  });
  const watch = await loadCskhWatch(f.db), pending = await loadNotesPending(f.db);
  const first = await syncCskhWatch(f.db, shop, 'fake', ['cs1', 'cs2'], watch, pending, Infinity, 2);
  assert.equal(first.batches, 2);
  assert.equal(first.checked, 150);
  assert.deepEqual(asked.map((x) => x.length), [100, 50]);
  assert.ok(asked.flat().every((id) => id.startsWith('a')));
  assert.deepEqual(pending.customers.p.sort(), ['a120', 'a5']);
  await saveCskhWatch(f.db, watch);
  // Lượt sau đi tiếp sang cs2, hết danh sách thì đánh dấu xong vòng và quay lại đầu.
  const w2 = await loadCskhWatch(f.db);
  const second = await syncCskhWatch(f.db, shop, 'fake', ['cs1', 'cs2'], w2, pending, Infinity, 2);
  assert.equal(second.checked, 30 + 100);
  assert.ok(pending.customers.p.includes('b7'));
  assert.ok(w2.cursors.p.lapAt);
  assert.ok(!asked.flat().some((id) => id.startsWith('s')), 'không hỏi khách của người Sale');
  // Bản lưu đã cập nhật số ghi chú: vòng sau không xếp lại khách đã thấy.
  const before = pending.customers.p.length;
  await syncCskhWatch(f.db, shop, 'fake', ['cs1', 'cs2'], w2, pending, Infinity, 5);
  assert.equal(pending.customers.p.length, before);
});

void test('canh CSKH: Pancake bỏ qua customer_ids thì dừng, không đụng khách lạ', async (t) => {
  const f = fixture(t);
  await f.db.batch(customerStatements(f.db, 'p', cust('a1', 'cs1', 1), at));
  setPancakeTransport(async () => Response.json({ success: true, data: [cust('x1', 'other', 3)] }));
  const watch = await loadCskhWatch(f.db), pending = await loadNotesPending(f.db);
  const r = await syncCskhWatch(f.db, shop, 'fake', ['cs1'], watch, pending);
  assert.equal(r.checked, 0);
  assert.deepEqual(pending.customers.p ?? [], []);
  assert.equal(Number(f.raw.prepare("SELECT COUNT(*) AS n FROM pos_customers WHERE customer_id='x1'").get()!.n), 0);
});
