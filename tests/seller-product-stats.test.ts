// Bảng tính sẵn stats_daily_seller_product (0042) phải cho đúng số như đọc thẳng đơn gốc: Xu hướng theo dòng sản phẩm, bảng sản phẩm
// ở Tổng quan (chỉ người được tính doanh số, theo team / nhân viên) và stats_daily_product cũ. Dữ liệu: thế giới demo vài ngày, 6 POS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SHOPS, dayData, listUsers, toSourceOrder } from '../lib/demo/world';
import { orderStatements } from '../lib/sync';
import { PRODUCT_COLUMNS, buildSellerProductMonth, markDirtyOrder, rebuildStats, type DirtyBuckets } from '../lib/stats';
import { segmentedStats, EMPTY_ORDER_FILTERS } from '../lib/order-segments';
import { countedFilter, teamFilter, type Team } from '../lib/team';
import { dayExpr, CLOSED } from '../lib/stats';
import { productLine } from '../lib/trends';
import { vnRangeUtc } from '../lib/report-time';

type Args = (string | number | null)[];
/** D1 tối giản trên node:sqlite (đủ cho prepare/bind/all/first/run/batch). */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: Args = []) => ({
    sql, args,
    bind: (...a: Args) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])), meta: {} }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => { const r = db.prepare(sql).run(...(args as never[])); return { meta: { rows_written: Number(r.changes) } }; },
  });
  const isRead = (sql: string) => /^\s*(SELECT|WITH)/i.test(sql);
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: ReturnType<typeof stmt>[]) => { const out = []; for (const s of list) out.push(isRead(s.sql) ? await s.all() : await s.run()); return out; },
  } as unknown as D1Database;
}

const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
const NOW = Date.parse('2026-10-02T05:00:00Z');
const posIds = SHOPS.map((p) => p.posId);

async function world() {
  const raw = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) raw.exec(readFileSync(`drizzle/${f}`, 'utf8').replaceAll('--> statement-breakpoint', ''));
  const db = d1(raw);
  const now = new Date(NOW).toISOString();
  const dirty: DirtyBuckets = new Map();
  for (const posId of posIds) {
    for (const u of listUsers(posId)) {
      raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,is_active,fetched_at,department) VALUES (?,?,?,?,1,?,?)').run(`${posId}:${u.user_id}`, posId, u.user_id!, u.user!.name!, now, u.department!.name!);
    }
    for (const day of DAYS) for (const o of dayData(posId, day).orders) {
      const src = toSourceOrder(o, NOW);
      if (!src) continue;
      await db.batch(orderStatements(db, posId, '1', src, now));
      markDirtyOrder(dirty, posId, src);
    }
  }
  await rebuildStats(db, dirty);
  return { raw, db };
}

const norm = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));

void test('seller-product table gives the same numbers as the raw order queries', async () => {
  const { raw, db } = await world();
  const first = DAYS[0], end = DAYS[DAYS.length - 1];
  const ph = posIds.map(() => '?').join(',');
  assert.ok(Number((raw.prepare('SELECT COUNT(*) AS n FROM stats_daily_seller_product').get() as { n: number }).n) > 50);

  // Xu hướng theo dòng sản phẩm: cùng tổng mỗi (ngày, dòng sản phẩm).
  const { startUtc, endUtc } = vnRangeUtc(first, end);
  const byLine = (rows: Record<string, unknown>[]) => {
    const m = new Map<string, [number, number]>();
    for (const r of rows) { const k = `${r.day as string}|${productLine((r.name as string | null) ?? '')}`; const v = m.get(k) ?? [0, 0]; v[0] += Number(r.qty); v[1] += Number(r.net); m.set(k, v); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const trendRaw = raw.prepare(`SELECT ${dayExpr('o.first_closed_at')} AS day, i.name, COALESCE(SUM(i.quantity),0) AS qty, COALESCE(SUM(i.line_total),0) AS net
    FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
    WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED} AND i.is_bonus=0 AND i.quantity>0 GROUP BY 1, 2`).all(...posIds, startUtc, endUtc);
  const trendPre = raw.prepare(`SELECT day, name, SUM(sale_quantity) AS qty, SUM(sale_total) AS net FROM stats_daily_seller_product
    WHERE pos_id IN (${ph}) AND day>=? AND day<=? GROUP BY day, name HAVING SUM(sale_quantity)>0`).all(...posIds, first, end);
  assert.ok(trendRaw.length > 10);
  assert.deepEqual(byLine(trendPre), byLine(trendRaw));
  // Cùng từng tên dòng hàng (không chỉ theo dòng sản phẩm).
  const byName = (rows: Record<string, unknown>[]) => norm(rows).map((r) => [r.day, r.name ?? '', r.qty, r.net].map(String).join('|')).sort();
  assert.deepEqual(byName(trendPre), byName(trendRaw));

  // Bảng sản phẩm ở Tổng quan: theo team và nhân viên, chỉ người được tính.
  const sums = PRODUCT_COLUMNS.map((c) => `SUM(${c}) AS ${c}`).join(',');
  const sellers = (raw.prepare("SELECT DISTINCT seller_id FROM raw_pos_orders WHERE seller_id<>'' LIMIT 3").all() as { seller_id: string }[]).map((r) => r.seller_id);
  for (const [team, employees] of [['all', []], ['sale', []], ['all', sellers]] as [Team, string[]][]) {
    const v = segmentedStats(posIds, startUtc, endUtc, team, EMPTY_ORDER_FILTERS, employees);
    const rawRows = raw.prepare(v.sql + `SELECT pos_id, product_id, MAX(name) AS name, ${sums} FROM stats_daily_product WHERE pos_id IN (${ph}) AND day>=? AND day<=? GROUP BY pos_id, product_id ORDER BY pos_id, product_id`)
      .all(...(v.binds as never[]), ...posIds, first, end);
    const employeeFilter = (employees.length ? ` AND seller_id IN (${employees.map(() => '?').join(',')})` : '') + teamFilter('seller_id', team) + countedFilter('seller_id');
    const preRows = raw.prepare(`SELECT pos_id, product_id, MAX(name) AS name, ${sums} FROM stats_daily_seller_product WHERE pos_id IN (${ph}) AND day>=? AND day<=?${employeeFilter} GROUP BY pos_id, product_id ORDER BY pos_id, product_id`)
      .all(...posIds, first, end, ...employees);
    assert.ok(rawRows.length > 0, team);
    assert.deepEqual(norm(preRows), norm(rawRows), `${team} ${employees.length}`);
  }

  // stats_daily_product (cộng từ bảng mới) đúng như câu cũ trên đơn gốc.
  const oldProduct = raw.prepare(`SELECT ${dayExpr('o.first_closed_at')} AS day, COALESCE(i.product_id,'') AS product_id, MAX(i.name) AS name,
      COUNT(DISTINCT i.order_id) AS orders, SUM(i.quantity) AS quantity, SUM(i.line_total) AS total,
      SUM(CASE WHEN i.is_bonus=0 THEN i.quantity ELSE 0 END) AS closed_quantity, SUM(i.line_total) AS closed_total,
      SUM(CASE WHEN o.status_code IN (3,16) THEN i.quantity ELSE 0 END) AS delivered_quantity,
      SUM(CASE WHEN o.status_code IN (3,16) THEN i.line_total ELSE 0 END) AS delivered_total, SUM(i.returned_count) AS returned_quantity
    FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
    WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED} GROUP BY o.pos_id, 1, 2 ORDER BY o.pos_id, 1, 2`).all(...posIds, startUtc, endUtc);
  const stored = raw.prepare(`SELECT day, product_id, name, ${PRODUCT_COLUMNS.join(',')} FROM stats_daily_product WHERE pos_id IN (${ph}) AND day>=? AND day<=? ORDER BY pos_id, day, product_id`).all(...posIds, first, end);
  assert.deepEqual(norm(stored), norm(oldProduct));

  // Điền lại theo tháng (bộ hẹn giờ) trên bảng đã đủ: không ghi gì; xóa một ngày rồi điền lại: trở về như cũ.
  const snapshot = norm(raw.prepare('SELECT * FROM stats_daily_seller_product ORDER BY id').all()).map((r) => ({ ...r, updated_at: '' }));
  assert.equal(await buildSellerProductMonth(db, posIds[0], '2026-09'), 0);
  raw.prepare("DELETE FROM stats_daily_seller_product WHERE day='2026-09-29'").run();
  raw.prepare("UPDATE stats_daily_seller_product SET sale_total=sale_total+1 WHERE day='2026-09-30'").run();
  raw.prepare("INSERT INTO stats_daily_seller_product (id,pos_id,day,updated_at) VALUES ('x',?,'2026-09-30','')").run(posIds[0]);
  for (const posId of posIds) for (const m of ['2026-09', '2026-10']) await buildSellerProductMonth(db, posId, m);
  assert.deepEqual(norm(raw.prepare('SELECT * FROM stats_daily_seller_product ORDER BY id').all()).map((r) => ({ ...r, updated_at: '' })), snapshot);
  raw.close();
});
