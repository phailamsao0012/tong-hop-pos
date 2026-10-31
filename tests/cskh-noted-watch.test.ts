import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { customerStatements, loadCskhWatch, notedWatchStart, syncCskhNotedWatch } from '../lib/customers-sync';
import { loadNotesPending } from '../lib/notes-pending';
import { setPancakeTransport, type SourceCustomer, type SourceNote } from '../lib/pancake';

// Khách CSKH vừa ghi chú nhưng giao cho người khác (31/10/2026): vẫn được hỏi lại để bắt ghi chú mới. Số và tên ảo.
const now = new Date('2026-10-31T10:00:00Z');
const t0 = Date.parse('2026-10-30T02:00:00Z') / 1000;
const shop = { id: 'p', shop_id: '1' };
const note = (id: string, n: number, author: string): SourceNote => ({ id: `${id}-${n}`, message: 'Ghi chú ảo', created_at: t0 + n * 60, created_by: { id: author, name: author } });
const cust = (id: string, owner: string | null, notes: number, author = 'cs1'): SourceCustomer => ({ id, name: 'Khách ảo', assigned_user_id: owner, notes: Array.from({ length: notes }, (_, i) => note(id, i, author)) });

void test('canh khách CSKH vừa ghi chú: hỏi khách của Sale / chưa giao, bỏ khách đã giao CSKH và khách chỉ Sale ghi chú', async (t) => {
  const f = emptyDb();
  t.after(() => { f.raw.close(); setPancakeTransport(async () => { throw new Error('Transport closed'); }); });
  const stored = [cust('s1', 'sale1', 1), cust('s2', null, 1), cust('c1', 'cs1', 1), cust('x1', 'sale1', 1, 'sale1')];
  for (const c of stored) await f.db.batch(customerStatements(f.db, 'p', c, now.toISOString()));
  const live = new Map(stored.map((c) => [String(c.id), c]));
  live.set('s1', cust('s1', 'sale1', 3));
  const asked: string[] = [];
  setPancakeTransport(async (url) => {
    const ids = (url.searchParams.get('customer_ids') ?? '').split(',').filter(Boolean);
    asked.push(...ids);
    return Response.json({ success: true, data: ids.map((id) => live.get(id)!).filter(Boolean) });
  });
  const watch = await loadCskhWatch(f.db), pending = await loadNotesPending(f.db);
  const r = await syncCskhNotedWatch(f.db, shop, 'fake', ['cs1', 'cs2'], watch, pending, now);
  assert.deepEqual(asked.sort(), ['s1', 's2']);
  assert.deepEqual(pending.customers.p, ['s1']);
  assert.equal(r.changed, 1);
  // Xong vòng: 30 phút sau mới chạy lại.
  asked.length = 0;
  await syncCskhNotedWatch(f.db, shop, 'fake', ['cs1', 'cs2'], watch, pending, new Date(now.getTime() + 10 * 60000));
  assert.equal(asked.length, 0);
  assert.ok(notedWatchStart({ at: now.toISOString(), after: '' }, new Date(now.getTime() + 31 * 60000)));
  assert.equal(notedWatchStart({ at: now.toISOString(), after: '' }, new Date(now.getTime() + 29 * 60000)), null);
});
