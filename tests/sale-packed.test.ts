import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb, demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { POS } from '../lib/shared/report-model';
import { packedBySeller, packedOrderPage, packedQuery } from '../lib/reports/sale-packed';
import { PACKED_SQL, isPacked } from '../lib/reports/van-don';
import { saleAnalytics } from '../lib/reports/sale-analytics';
import type { overviewReport } from '../lib/reports/overview-report';
import type { PackedSeller } from '../lib/reports/sale-packed';

type TestOverview = Awaited<ReturnType<typeof overviewReport>> & { packedStaff: PackedSeller[] };
type TestSections = { sale: { packedNet: number }; cskh: Record<string, unknown> };
type TestPage = { orders: { net: number }[]; more: boolean };

void test('sale-packed: CLOSED, trạng thái 1/8/9/2/3/6 và lịch sử qua 8', async () => {
  const { db, raw } = emptyDb();
  try {
    for (const [id, name, department] of [['s', 'NV A SALE', 'Sale'], ['c', 'NV B CSKH', 'CSKH'], ['s2', 'NV C SALE', 'Sale']]) {
      raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,fetched_at) VALUES (?,?,?,?,?,?)').run(id, 'p', id, name, department, '2026-10-17');
    }
    const insert = (id: string, status: number, history: string, seller = 's', pos = 'p', at = '2026-10-17T03:00:00') => {
      raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,status_code,status_history_json,net_total,created_at,first_closed_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, pos, pos, id, seller, status, history, 100, at, at, '2026-10-17');
    };
    for (const status of [1, 8, 9, 2, 3, 6]) {
      for (const history of ['[]', '[{"status":8}]']) {
        const id = `${status}-${history.length}`;
        insert(id, status, history);
        const sqlPacked = raw.prepare(`SELECT ${PACKED_SQL()} AS packed FROM raw_pos_orders o WHERE id=?`).get(id) as { packed: number };
        assert.equal(Boolean(sqlPacked.packed), isPacked({ status_code: status, status_history_json: history }));
      }
    }
    insert('care', 8, '[]', 'c');
    insert('other-pos', 8, '[]', 's', 'q');
    insert('before', 8, '[]', 's', 'p', '2026-10-16T16:59:59');
    insert('after', 8, '[]', 's', 'p', '2026-10-17T17:00:00');
    insert('second', 8, '[]', 's2');
    const opts = { posIds: ['p'], start: '2026-10-17', end: '2026-10-17' };
    const rows = await packedBySeller(db, opts);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ sellerId: 's', packedOrders: 8, packedNet: 800 }, { sellerId: 's2', packedOrders: 1, packedNet: 100 }]);
    const analytics = await saleAnalytics(opts);
    for (const r of analytics.staff) {
      assert.equal(r.packedNet, rows.find((p) => p.sellerId === r.staffId)?.packedNet);
      assert.ok(r.packedNet <= r.net);
    }
    const scoped = { ...opts, scope: { employeeIds: ['s'] } };
    const list = await packedOrderPage(db, scoped, 0);
    assert.equal(list.length, 8);
    assert.equal(list.reduce((n, o) => n + o.net, 0), 800);
    assert.deepEqual(await packedOrderPage(db, scoped, 1), []);
    assert.deepEqual(await packedBySeller(db, { ...opts, posIds: [] }), []);
    const { where, binds } = packedQuery(scoped);
    const plan = raw.prepare(`EXPLAIN QUERY PLAN SELECT o.seller_id, SUM(${PACKED_SQL()}) FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money WHERE ${where} GROUP BY o.seller_id`).all(...binds);
    assert.ok(JSON.stringify(plan).includes('idx_raw_orders_pos_closed_status_money'));
  } finally { raw.close(); }
});

void test('sale-packed: phân trang không mất đơn, team và nhóm sản phẩm giữ phạm vi', async () => {
  const { db, raw } = emptyDb();
  try {
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,department,fetched_at) VALUES (?,?,?,?,?,?)').run('s', 'p', 's', 'NV A SALE', 'Sale', '2026-10-17');
    for (let i = 0; i < 105; i++) raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,status_code,net_total,created_at,first_closed_at,fetched_at,tags_json) VALUES (?,?,?,?,?,8,100,?,?,?,?)')
      .run(String(i), 'p', 'p', String(i), 's', '2026-10-17T03:00:00', '2026-10-17T03:00:00', '2026-10-17', '[{"name":"SK + GK"}]');
    const opts = { posIds: ['p'], start: '2026-10-17', end: '2026-10-17' };
    const first = await packedOrderPage(db, opts, 0), second = await packedOrderPage(db, opts, 1);
    assert.equal(first.length, 101);
    assert.equal(second.length, 5);
    assert.equal(new Set([...first.slice(0, 100), ...second].map((o) => o.id)).size, 105);
    const { EMPTY_ORDER_FILTERS } = await import('../lib/pancake/order-segments');
    assert.equal((await packedBySeller(db, { ...opts, scope: { filters: { ...EMPTY_ORDER_FILTERS, productSegment: 'skgk' } } }))[0].packedNet, 10500);
    assert.equal((await packedBySeller(db, { ...opts, scope: { filters: { ...EMPTY_ORDER_FILTERS, productSegment: 'gentadox' } } }))[0]?.packedNet ?? 0, 0);
    assert.deepEqual(await packedBySeller(db, { ...opts, scope: { unit: { id: 'empty-team', name: 'Team MKT 1', dept: 'sale' } } }), []);
  } finally { raw.close(); }
});

void test('sale-packed: demo tổng cột = khối Sale, danh sách giữ POS/người/nhóm; CSKH không thêm số', async () => {
  const { raw } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  try {
    await loginAs(raw, 'owner');
    const { GET: overview } = await import('../app/api/reports/overview/route');
    const { GET: sections } = await import('../app/api/reports/sections/route');
    const base = new URLSearchParams({ start: '2026-10-16', end: '2026-10-16', team: 'sale', posIds: POS[0].id });
    const report = await (await overview(new Request('http://local/api/reports/overview?' + base))).json() as TestOverview;
    const cards = await (await sections(new Request('http://local/api/reports/sections?' + base))).json() as TestSections;
    const sum = report.packedStaff.reduce((n: number, r: { packedNet: number }) => n + r.packedNet, 0);
    assert.equal(sum, cards.sale.packedNet);
    assert.ok(sum > 0);
    assert.equal('packedNet' in cards.cskh, false);
    const analytics = await saleAnalytics({ posIds: [POS[0].id], start: '2026-10-16', end: '2026-10-16' });
    assert.equal(analytics.staff.reduce((n, r) => n + r.packedNet, 0), sum);
    for (const r of report.packedStaff) {
      const employee = report.current.byEmployee.find((e: { sellerId: string }) => e.sellerId === r.sellerId);
      assert.ok(employee);
      assert.ok(r.packedNet <= employee.closedNet);
    }
    for (const segment of ['all', 'skgk', 'gentadox']) {
      const q = new URLSearchParams(base); q.set('productSegment', segment);
      const grouped = await (await overview(new Request('http://local/api/reports/overview?' + q))).json() as TestOverview;
      const groupedCards = await (await sections(new Request('http://local/api/reports/sections?' + q))).json() as TestSections;
      assert.equal(grouped.packedStaff.reduce((n: number, r: { packedNet: number }) => n + r.packedNet, 0), groupedCards.sale.packedNet);
      const seller = grouped.packedStaff.find((r: { packedNet: number }) => r.packedNet > 0);
      if (!seller) continue;
      q.set('employeeIds', seller.sellerId); q.set('packed', '1');
      let count = 0, net = 0;
      for (let page = 0; ; page++) {
        q.set('page', String(page));
        const list = await (await overview(new Request('http://local/api/reports/overview?' + q))).json() as TestPage;
        count += list.orders.length;
        net += list.orders.reduce((n: number, r: { net: number }) => n + r.net, 0);
        if (!list.more) break;
      }
      assert.equal(count, seller.packedOrders); assert.equal(net, seller.packedNet);
    }
    base.set('team', 'cskh');
    const care = await (await overview(new Request('http://local/api/reports/overview?' + base))).json() as Record<string, unknown>;
    assert.equal('packedStaff' in care, false);
  } finally { logout(); raw.close(); }
});
