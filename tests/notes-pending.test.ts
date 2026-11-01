import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import {
  customerStatements,
  drainPendingNotes,
  NOTES_DRAIN_CAP,
  syncCustomersBackfill,
  syncCustomersRecent,
} from '../lib/pancake/customers-sync';
import {
  countPendingNotes,
  enqueueNotes,
  enqueueNotesGaps,
  loadNotesPending,
  NOTES_GAP_LIMIT,
  NOTES_GAP_SQL,
  NOTES_PENDING_LIMIT,
  saveNotesPending,
} from '../lib/pancake/notes-pending';
import {
  setPancakeTransport,
  type SourceCustomer,
  type SourceNote,
} from '../lib/pancake/pancake';
import { runScheduledSync } from '../lib/pancake/sync';
import { POS } from '../lib/shared/report-model';

const at = '2026-10-27T03:00:00.000Z';
const noteTime = Date.parse('2026-10-26T02:00:00Z') / 1000;
const shop = { id: 'p', shop_id: '1' };
const note = (id: string, suffix = 'a'): SourceNote => ({
  id: `${id}-${suffix}`,
  message: 'Ghi chú ảo',
  created_at: noteTime + (suffix === 'a' ? 0 : 60),
});
const customer = (id: string): SourceCustomer => ({
  id,
  name: 'Khách ảo',
  notes: [note(id)],
});
const count = (f: ReturnType<typeof emptyDb>) =>
  Number(f.raw.prepare('SELECT COUNT(*) AS n FROM customer_notes').get()!.n);

function fixture(t: { after: (fn: () => void) => void }) {
  const f = emptyDb();
  f.raw.exec(
    "INSERT INTO pos_shops (id,name,shop_id,enabled) VALUES ('p','POS ảo','1',1)",
  );
  t.after(() => {
    f.raw.close();
    setPancakeTransport(async () => {
      throw new Error('Transport closed');
    });
  });
  return f;
}

function transport(
  rows: SourceCustomer[],
  fail = new Set<string>(),
  calls: string[] = [],
) {
  setPancakeTransport(async (url) => {
    if (url.pathname.endsWith('/load_customer_notes')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-2)!);
      calls.push(id);
      if (fail.has(id)) return new Response('', { status: 403 });
      return Response.json({ notes: [note(id), note(id, 'b')] });
    }
    return Response.json({
      success: true,
      data: rows,
      total_entries: rows.length,
    });
  });
}

void test('60 khách đổi: 25 lấy đủ, 35 chờ; lượt sau lấy bù đủ và hàng chờ rỗng', async (t) => {
  const f = fixture(t),
    calls: string[] = [];
  transport(
    Array.from({ length: 60 }, (_, i) => customer(`c${i}`)),
    new Set(),
    calls,
  );
  const first = await syncCustomersRecent(f.db, shop, 'fake');
  assert.equal(first.fullNotes, 25);
  assert.equal(count(f), 85);
  const queue = await loadNotesPending(f.db);
  assert.equal(queue.customers.p.length, 35);
  calls.length = 0;
  const second = await drainPendingNotes(f.db, shop, 'fake', queue);
  await saveNotesPending(f.db, queue);
  assert.equal(second.fetched, 35);
  assert.equal(calls[0], 'c59');
  assert.equal(count(f), 120);
  assert.deepEqual((await loadNotesPending(f.db)).customers.p, []);
  // Nguồn lặp không đổi không tạo thêm hàng chờ hoặc ghi chú.
  await syncCustomersRecent(f.db, shop, 'fake');
  assert.equal(count(f), 120);
  assert.deepEqual((await loadNotesPending(f.db)).customers.p, []);
});

void test('khách thứ 3 lỗi: recent và lượt rút đều tiếp tục khách 4..n, giữ khách lỗi', async (t) => {
  const f = fixture(t),
    calls: string[] = [];
  transport(
    Array.from({ length: 6 }, (_, i) => customer(`c${i + 1}`)),
    new Set(['c3']),
    calls,
  );
  const result = await syncCustomersRecent(f.db, shop, 'fake');
  assert.equal(result.fullNotes, 5);
  assert.deepEqual(calls, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  const queue = await loadNotesPending(f.db);
  assert.deepEqual(queue.customers.p, ['c3']);
  enqueueNotes(queue, 'p', ['c6', 'c5', 'c4', 'c3', 'c2', 'c1']);
  calls.length = 0;
  assert.equal((await drainPendingNotes(f.db, shop, 'fake', queue)).fetched, 5);
  assert.deepEqual(calls, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  assert.deepEqual(queue.customers.p, ['c3']);
});

void test('duyệt toàn bộ so ghi chú trước khi cập nhật bản lưu, không xếp lại khách không đổi', async (t) => {
  const f = fixture(t);
  await f.db.batch(
    customerStatements(f.db, 'p', { ...customer('changed'), notes: [] }, at),
  );
  await f.db.batch(customerStatements(f.db, 'p', customer('same'), at));
  transport([customer('changed'), customer('same'), customer('new')]);
  await syncCustomersBackfill(
    f.db,
    shop,
    'fake',
    { page: 1, windowEnd: Date.parse(at) / 1000, total: 3 },
    1,
  );
  const queue = await loadNotesPending(f.db);
  assert.deepEqual(queue.customers.p, ['changed', 'new']);
  assert.equal(
    f.raw
      .prepare(
        "SELECT note_count FROM pos_customers WHERE customer_id='changed'",
      )
      .get()!.note_count,
    1,
  );
  assert.equal(count(f), 3);
});

void test('tìm thiếu chỉ trong 45 ngày, đếm source customer, đúng POS, mỗi ngày một lần và dùng chỉ mục', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const f = fixture(t);
  for (const id of [
    'missing',
    'full',
    'old',
    'order-only',
    'null-assigned',
    'other-pos',
  ]) {
    const c = {
      ...customer(id),
      assigned_user_id: id === 'null-assigned' ? null : 'staff-fake',
    };
    await f.db.batch(
      customerStatements(f.db, id === 'other-pos' ? 'other' : 'p', c, at),
    );
  }
  f.raw.exec(
    "UPDATE pos_customers SET note_count=2 WHERE customer_id<>'full'; UPDATE pos_customers SET last_note_at='2026-08-01T00:00:00' WHERE customer_id='old'; UPDATE customer_notes SET source='order' WHERE customer_id='order-only'",
  );
  const queue = await loadNotesPending(f.db);
  assert.equal(await enqueueNotesGaps(f.db, queue, 'p'), 3);
  assert.deepEqual(
    new Set(queue.customers.p),
    new Set(['missing', 'order-only', 'null-assigned']),
  );
  // Khách đủ vừa trở thành thiếu: cùng ngày không dò lại; ngày sau có dò.
  f.raw.exec("UPDATE pos_customers SET note_count=2 WHERE customer_id='full'");
  assert.equal(await enqueueNotesGaps(f.db, queue, 'p'), 0);
  assert.equal(await enqueueNotesGaps(f.db, queue, 'other'), 1);
  await saveNotesPending(f.db, queue);
  const restored = await loadNotesPending(f.db);
  assert.equal(await enqueueNotesGaps(f.db, restored, 'p'), 0);
  assert.equal(
    await enqueueNotesGaps(
      f.db,
      restored,
      'p',
      new Date('2026-10-28T03:00:00Z'),
    ),
    4,
  );
  const plan = f.raw
    .prepare(`EXPLAIN QUERY PLAN ${NOTES_GAP_SQL}`)
    .all('p', 'p', '2026-09-12', at, 'p', NOTES_GAP_LIMIT)
    .map((r) => String(r.detail));
  assert.ok(
    plan.some((line) =>
      /SEARCH c USING INDEX idx_pos_customers_assigned_note \(assigned_user_id=\? AND last_note_at>\? AND last_note_at<\?\)/.test(
        line,
      ),
    ),
    plan.join('\n'),
  );
  assert.ok(
    plan.some((line) =>
      /SEARCH n USING INDEX idx_customer_notes_customer/.test(line),
    ),
  );
  assert.ok(
    !plan.some((line) =>
      /SCAN (?:pos_customers|customer_notes|c|n)\b/.test(line),
    ),
    plan.join('\n'),
  );
});

void test('hàng chờ không trùng, bỏ cũ khi quá 5.000, chỉ ghi khi đổi và giữ các POS khác', async (t) => {
  assert.equal(NOTES_PENDING_LIMIT, 5_000);
  const f = fixture(t),
    queue = await loadNotesPending(f.db);
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => {
    warnings.push(args);
  });
  enqueueNotes(queue, 'other', ['preserved']);
  enqueueNotes(
    queue,
    'p',
    Array.from({ length: NOTES_PENDING_LIMIT + 2 }, (_, i) => `c${i}`),
  );
  assert.equal(queue.customers.p.length, NOTES_PENDING_LIMIT);
  assert.equal(queue.customers.p[0], 'c2');
  assert.match(String(warnings[0][0]), /bỏ 2 mã/);
  enqueueNotes(queue, 'p', ['c2', 'c2']);
  assert.equal(queue.customers.p.at(-1), 'c2');
  assert.equal(queue.customers.p.length, NOTES_PENDING_LIMIT);
  assert.equal(await saveNotesPending(f.db, queue), 1);
  assert.equal(await saveNotesPending(f.db, queue), 0);
  assert.deepEqual((await loadNotesPending(f.db)).customers.other, [
    'preserved',
  ]);
  assert.equal(await countPendingNotes(f.db, ['p']), NOTES_PENDING_LIMIT);
  assert.equal(await countPendingNotes(f.db, ['other']), 1);
  assert.equal(
    await countPendingNotes(f.db, ['p', 'other']),
    NOTES_PENDING_LIMIT + 1,
  );
  assert.equal(await countPendingNotes(f.db, []), 0);
});

void test('lưu hàng chờ lỗi: ghi log, giữ bản chưa lưu để thử lại và vẫn lưu mốc dò thiếu', async (t) => {
  const f = fixture(t),
    queue = await loadNotesPending(f.db);
  enqueueNotes(queue, 'p', ['pending']);
  queue.checked.p = at.slice(0, 10);
  f.raw.exec(`CREATE TRIGGER fail_notes_pending BEFORE INSERT ON app_settings
    WHEN NEW.key='notes_pending_v1'
    BEGIN SELECT RAISE(FAIL, 'synthetic D1 row limit'); END`);
  const errors = t.mock.method(console, 'error', () => {});
  assert.equal(await saveNotesPending(f.db, queue), 1);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(
    String(errors.mock.calls[0].arguments[0]),
    /saveNotesPending notes_pending_v1 failed/,
  );
  assert.equal(queue.savedCustomers, '{}');
  assert.equal(queue.savedChecked, JSON.stringify(queue.checked));
  assert.deepEqual((await loadNotesPending(f.db)).customers, {});
  f.raw.exec('DROP TRIGGER fail_notes_pending');
  assert.equal(await saveNotesPending(f.db, queue), 1);
  assert.deepEqual((await loadNotesPending(f.db)).customers.p, ['pending']);
  assert.equal(await saveNotesPending(f.db, queue), 0);
});

void test('cron hàng chờ lớn: chia 25% thời gian còn lại cho POS có hàng chờ, vẫn chạy bước 3 và 4', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const f = fixture(t);
  f.raw.exec('DELETE FROM pos_shops');
  const queue = await loadNotesPending(f.db);
  for (const [i, pos] of POS.entries()) {
    f.raw
      .prepare(`INSERT INTO pos_shops
      (id,name,shop_id,enabled,users_synced_at,products_synced_at,cursor,customer_cursor)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(
        pos.id,
        'POS ảo',
        String(i + 1),
        i < 3 ? 1 : 0,
        at,
        at,
        JSON.stringify({ month: '2026-10', oldestMonth: '2026-10', page: 1 }),
        JSON.stringify({
          page: 1,
          total: 1,
          windowEnd: Date.parse('2023-01-01T00:00:00Z') / 1000,
        }),
      );
    // POS thứ hai không có hàng chờ, không được tính vào mẫu số chia quỹ.
    if (i === 0 || i === 2)
      enqueueNotes(
        queue,
        pos.id,
        Array.from({ length: 5_000 }, (_, n) => `pending-${i}-${n}`),
      );
  }
  await saveNotesPending(f.db, queue);
  const customerCalls = new Map<string, number>();
  const noteCalls: string[] = [],
    backfillTimes: number[] = [];
  setPancakeTransport(async (url) => {
    const shopId = url.pathname.split('/shops/')[1].split('/')[0];
    if (url.pathname.endsWith('/load_customer_notes')) {
      noteCalls.push(shopId);
      t.mock.timers.tick(1_000);
      return Response.json({ notes: [] });
    }
    if (url.pathname.endsWith('/customers')) {
      const calls = (customerCalls.get(shopId) ?? 0) + 1;
      customerCalls.set(shopId, calls);
      if (calls === 1) {
        // Bước 2b đã dùng 10 giây: bước 2c chỉ còn 25% của 40 giây = 10 giây.
        if (shopId === '1') t.mock.timers.tick(10_000);
        return Response.json({ success: true, data: [], total_entries: 1 });
      }
      backfillTimes.push(Date.now());
      return Response.json({
        success: true,
        data: [{ id: `backfill-${shopId}`, name: 'Khách ảo', notes: [] }],
        total_entries: 1,
      });
    }
    return Response.json({ success: true, data: [], total_entries: 0 });
  });
  const result = await runScheduledSync(
    { DB: f.db, PANCAKE_POS_API_KEY: 'fake' } as Cloudflare.Env,
    new Date(at),
  );
  assert.deepEqual(noteCalls, [
    ...Array<string>(5).fill('1'),
    ...Array<string>(5).fill('3'),
  ]);
  assert.equal(backfillTimes.length, 3);
  assert.ok(backfillTimes.every((time) => time === Date.parse(at) + 20_000));
  assert.ok(result.stages.customers_backfill > 0);
  assert.ok(result.stages.backfill > 0);
  const saved = await loadNotesPending(f.db);
  assert.equal(saved.customers[POS[0].id].length, 4_995);
  assert.equal(saved.customers[POS[2].id].length, 4_995);
});

void test('rút tối đa 40 khách, dừng khi hết thời gian/quỹ ghi, quá 3 lỗi liền thì dừng POS', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const f = fixture(t),
    queue = await loadNotesPending(f.db),
    calls: string[] = [];
  enqueueNotes(
    queue,
    'p',
    Array.from({ length: 60 }, (_, i) => `c${i}`),
  );
  transport([], new Set(), calls);
  assert.equal(
    (await drainPendingNotes(f.db, shop, 'fake', queue, Date.now())).fetched,
    0,
  );
  assert.equal(
    (await drainPendingNotes(f.db, shop, 'fake', queue, Infinity, () => false))
      .fetched,
    0,
  );
  assert.equal(calls.length, 0);
  assert.equal(
    (await drainPendingNotes(f.db, shop, 'fake', queue)).fetched,
    NOTES_DRAIN_CAP,
  );
  assert.equal(queue.customers.p.length, 20);
  calls.length = 0;
  transport([], new Set(queue.customers.p), calls);
  assert.equal((await drainPendingNotes(f.db, shop, 'fake', queue)).fetched, 0);
  assert.equal(calls.length, 4);
  assert.equal(queue.customers.p.length, 20);
  transport([], new Set(), calls);
  calls.length = 0;
  assert.equal(
    (
      await drainPendingNotes(
        f.db,
        shop,
        'fake',
        queue,
        Infinity,
        (writes) => writes < 2,
      )
    ).fetched,
    1,
  );
  assert.equal(calls.length, 1);
});

void test('cron đọc hàng chờ một lần, rút sau recent, lưu một lần và không đổi hàng chờ khi hết quỹ', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const f = fixture(t),
    posId = POS[0].id;
  f.raw.exec('DELETE FROM pos_shops');
  for (const [i, pos] of POS.entries())
    f.raw
      .prepare(
        'INSERT INTO pos_shops (id,name,shop_id,enabled,users_synced_at,products_synced_at,cursor,customer_cursor) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        pos.id,
        'POS ảo',
        String(i + 1),
        i === 0 ? 1 : 0,
        at,
        at,
        JSON.stringify({ month: '2026-10', page: 1, completed: true }),
        JSON.stringify({
          page: 1,
          completed: true,
          startedAt: at,
          firstCompletedAt: at,
        }),
      );
  const queue = await loadNotesPending(f.db);
  enqueueNotes(queue, posId, ['pending']);
  await saveNotesPending(f.db, queue);
  let reads = 0,
    saves = 0;
  const prepare = f.db.prepare.bind(f.db);
  f.db.prepare = ((sql: string) => {
    if (sql === 'SELECT key,value FROM app_settings WHERE key IN (?,?)')
      reads++;
    if (sql.startsWith('INSERT INTO app_settings')) saves++;
    return prepare(sql);
  }) as typeof f.db.prepare;
  const calls: string[] = [];
  transport([], new Set(), calls);
  const vars = { DB: f.db, PANCAKE_POS_API_KEY: 'fake' } as Cloudflare.Env;
  await runScheduledSync(vars, new Date(at));
  assert.deepEqual(calls, ['pending']);
  assert.equal(reads, 1);
  assert.equal(saves, 2); // Một dòng hàng chờ + một mốc dò thiếu trong ngày.
  assert.deepEqual((await loadNotesPending(f.db)).customers[posId], []);
  calls.length = 0;
  reads = 0;
  saves = 0;
  await runScheduledSync(vars, new Date(at), 50000, {
    writesUsed: 0,
    backfillCap: 0,
    hardCap: 200000,
  });
  assert.equal(calls.length, 0);
  assert.equal(reads, 0);
  assert.equal(saves, 0);
  f.raw.exec(`DELETE FROM app_settings WHERE key='notes_gap_checked_v1';
    CREATE TRIGGER fail_notes_save BEFORE INSERT ON app_settings
    WHEN NEW.key IN ('notes_pending_v1','notes_gap_checked_v1')
    BEGIN SELECT RAISE(FAIL, 'synthetic D1 save failure'); END`);
  const errors = t.mock.method(console, 'error', () => {});
  const result = await runScheduledSync(vars, new Date(at));
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(result.writeLimitHit, false);
});

void test('dò thiếu giới hạn 3.000 khách/POS và bao gồm biên 45 ngày', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const f = fixture(t),
    queue = await loadNotesPending(f.db);
  const insert = f.raw.prepare(
    'INSERT INTO pos_customers (id,pos_id,customer_id,note_count,last_note_at,fetched_at) VALUES (?,?,?,1,?,?)',
  );
  const boundary = new Date(Date.parse(at) - 45 * 86400000)
    .toISOString()
    .slice(0, 19);
  for (let i = 0; i <= NOTES_GAP_LIMIT; i++)
    insert.run(`p:c${i}`, 'p', `c${i}`, boundary, at);
  assert.equal(await enqueueNotesGaps(f.db, queue, 'p'), NOTES_GAP_LIMIT);
  assert.equal(queue.customers.p.length, NOTES_GAP_LIMIT);
  assert.equal(new Set(queue.customers.p).size, NOTES_GAP_LIMIT);
});

void test('hết hạn trong lúc Pancake treo hoặc trả 429: không retry quá quỹ, giữ khách chờ', async (t) => {
  const f = fixture(t),
    queue = await loadNotesPending(f.db);
  enqueueNotes(queue, 'p', ['pending']);
  for (const mode of ['timeout', 'rate-limit']) {
    let calls = 0;
    setPancakeTransport(async (_url, init) => {
      calls++;
      if (mode === 'rate-limit')
        return new Response('', {
          status: 429,
          headers: { 'retry-after': '5' },
        });
      const signal = init.signal!;
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(Response.json({ notes: [] })),
          2000,
        );
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('synthetic timeout'));
          },
          { once: true },
        );
      });
    });
    const start = Date.now();
    assert.equal(
      (await drainPendingNotes(f.db, shop, 'fake', queue, start + 60)).fetched,
      0,
    );
    assert.equal(calls, 1, mode);
    assert.ok(Date.now() - start < 1500, mode);
    assert.deepEqual(queue.customers.p, ['pending']);
  }
});
