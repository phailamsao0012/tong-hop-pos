// Bảng tính sẵn stats_daily_mkt (0050) phải cho đúng số như quét đơn gốc theo ngày xác nhận: Xu hướng (trends-report) và
// Xu hướng MKT (mkt-trend). Dữ liệu: thế giới demo vài ngày, 6 POS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SHOPS, dayData, listUsers, toSourceOrder } from '../lib/demo/world';
import { orderStatements } from '../lib/pancake/sync';
import {
  markDirty,
  markDirtyOrder,
  rebuildStats,
  dayExpr,
  NET,
  type DirtyBuckets,
} from '../lib/reports/stats';
import { buildMktMonth } from '../lib/reports/stats-mkt';
import { trendQueries } from '../lib/reports/mkt-trend';
import { COUNTED_STAFF } from '../lib/teams/team';
import { vnRangeUtc } from '../lib/shared/report-time';

type Args = (string | number | null)[];
/** D1 tối giản trên node:sqlite (đủ cho prepare/bind/all/first/run/batch). */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: Args = []) => ({
    sql,
    args,
    bind: (...a: Args) => stmt(sql, a),
    all: async () => ({
      results: db.prepare(sql).all(...(args as never[])),
      meta: {},
    }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => {
      const r = db.prepare(sql).run(...(args as never[]));
      return { meta: { rows_written: Number(r.changes) } };
    },
  });
  const isRead = (sql: string) => /^\s*(SELECT|WITH)/i.test(sql);
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      const out = [];
      for (const s of list)
        out.push(isRead(s.sql) ? await s.all() : await s.run());
      return out;
    },
  } as unknown as D1Database;
}

const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
const NOW = Date.parse('2026-10-02T05:00:00Z');
const posIds = SHOPS.map((p) => p.posId);

async function world() {
  const raw = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    raw.exec(
      readFileSync(`drizzle/${f}`, 'utf8').replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    );
  const db = d1(raw);
  const now = new Date(NOW).toISOString();
  const dirty: DirtyBuckets = new Map();
  for (const posId of posIds) {
    for (const u of listUsers(posId)) {
      raw
        .prepare(
          'INSERT INTO pos_users (id,pos_id,user_id,name,is_active,fetched_at,department) VALUES (?,?,?,?,1,?,?)',
        )
        .run(
          `${posId}:${u.user_id}`,
          posId,
          u.user_id!,
          u.user!.name!,
          now,
          u.department!.name!,
        );
    }
    for (const day of DAYS)
      for (const o of dayData(posId, day).orders) {
        const src = toSourceOrder(o, NOW);
        if (!src) continue;
        await db.batch(orderStatements(db, posId, '1', src, now));
        markDirtyOrder(dirty, posId, src);
      }
  }
  await rebuildStats(db, dirty);
  return { raw, db };
}

const norm = (rows: Record<string, unknown>[]) =>
  rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        typeof v === 'bigint' ? Number(v) : v,
      ]),
    ),
  );

void test('stats_daily_mkt gives the same MKT numbers as the raw order queries', async () => {
  const { raw, db } = await world();
  const first = DAYS[0],
    end = DAYS[DAYS.length - 1];
  const ph = posIds.map(() => '?').join(',');
  assert.ok(
    Number(
      (
        raw.prepare('SELECT COUNT(*) AS n FROM stats_daily_mkt').get() as {
          n: number;
        }
      ).n,
    ) > 10,
  );
  const { startUtc, endUtc } = vnRangeUtc(first, end);
  const rows = (list: Record<string, unknown>[]) =>
    norm(list)
      .map((r) => Object.values(r).map(String).join('|'))
      .sort();

  // Xu hướng (trends-report): theo (ngày, marketer), chỉ người được tính.
  const trendRaw = raw
    .prepare(`SELECT ${dayExpr('o.first_confirmed_at')} AS day, o.marketer_id, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net
    FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)
      AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.marketer_id IN ${COUNTED_STAFF} GROUP BY 1, 2`)
    .all(...posIds, startUtc, endUtc);
  const trendPre = raw
    .prepare(`SELECT day, marketer_id, SUM(orders) AS n, SUM(net) AS net FROM stats_daily_mkt
    WHERE pos_id IN (${ph}) AND day>=? AND day<=? AND marketer_id IN ${COUNTED_STAFF} GROUP BY 1, 2`)
    .all(...posIds, first, end);
  assert.ok(trendRaw.length > 3);
  assert.deepEqual(rows(trendPre), rows(trendRaw));

  // Xu hướng MKT (mkt-trend): câu đơn chốt từ bảng = câu trên đơn gốc (người bán thuộc Sale).
  const [, oldQ] = trendQueries(posIds, first, end, false),
    [, newQ] = trendQueries(posIds, first, end, true);
  const mktRaw = raw.prepare(oldQ.sql).all(...oldQ.binds),
    mktPre = raw.prepare(newQ.sql).all(...newQ.binds);
  assert.ok(mktRaw.length > 0);
  assert.deepEqual(rows(mktPre), rows(mktRaw));

  // Đơn đổi trạng thái (hủy sau khi xác nhận): dựng lại ngày bẩn thì bảng theo kịp.
  const victim = raw
    .prepare(`SELECT id, pos_id, first_confirmed_at FROM raw_pos_orders WHERE status_code NOT IN (0,17,6,7) AND first_confirmed_at IS NOT NULL
    AND NULLIF(TRIM(marketer_id),'') IS NOT NULL LIMIT 1`)
    .get() as { id: string; pos_id: string; first_confirmed_at: string };
  raw
    .prepare('UPDATE raw_pos_orders SET status_code=6 WHERE id=?')
    .run(victim.id);
  const dirty: DirtyBuckets = new Map();
  markDirty(dirty, victim.pos_id, victim.first_confirmed_at);
  await rebuildStats(db, dirty);
  const again = raw
    .prepare(`SELECT day, marketer_id, SUM(orders) AS n, SUM(net) AS net FROM stats_daily_mkt
    WHERE pos_id IN (${ph}) AND day>=? AND day<=? AND marketer_id IN ${COUNTED_STAFF} GROUP BY 1, 2`)
    .all(...posIds, first, end);
  const rawAgain = raw
    .prepare(`SELECT ${dayExpr('o.first_confirmed_at')} AS day, o.marketer_id, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net
    FROM raw_pos_orders o WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)
      AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.marketer_id IN ${COUNTED_STAFF} GROUP BY 1, 2`)
    .all(...posIds, startUtc, endUtc);
  assert.deepEqual(rows(again), rows(rawAgain));
  assert.notDeepEqual(rows(again), rows(trendPre));

  // Điền theo tháng (bộ hẹn giờ) trên bảng đã đủ: không ghi gì; làm hỏng rồi điền lại: trở về như cũ.
  const snapshot = norm(
    raw.prepare('SELECT * FROM stats_daily_mkt ORDER BY id').all(),
  ).map((r) => ({ ...r, updated_at: '' }));
  assert.equal(await buildMktMonth(db, posIds[0], '2026-09'), 0);
  raw.prepare("DELETE FROM stats_daily_mkt WHERE day='2026-09-29'").run();
  raw
    .prepare("UPDATE stats_daily_mkt SET net=net+1 WHERE day='2026-09-30'")
    .run();
  raw
    .prepare(
      "INSERT INTO stats_daily_mkt (id,pos_id,day,marketer_id,updated_at) VALUES ('x',?,'2026-09-30','m','')",
    )
    .run(posIds[0]);
  for (const posId of posIds)
    for (const m of ['2026-09', '2026-10']) await buildMktMonth(db, posId, m);
  assert.deepEqual(
    norm(raw.prepare('SELECT * FROM stats_daily_mkt ORDER BY id').all()).map(
      (r) => ({ ...r, updated_at: '' }),
    ),
    snapshot,
  );
  raw.close();
});

void test('lưu sẵn danh sách Marketer và số đầu trang Cuộc gọi: hết hạn thì đọc lại', async () => {
  const { parseCachedIds, MARKETER_IDS_TTL_MS } =
    await import('../lib/teams/marketer-ids');
  const { freshCoverage, COVERAGE_TTL_MS } =
    await import('../lib/reports/calls-report');
  const now = Date.parse('2026-11-04T03:00:00Z');
  assert.deepEqual(
    parseCachedIds(JSON.stringify({ at: now - 1000, ids: ['a', 'b'] }), now),
    ['a', 'b'],
  );
  assert.equal(
    parseCachedIds(
      JSON.stringify({ at: now - MARKETER_IDS_TTL_MS - 1, ids: ['a'] }),
      now,
    ),
    null,
  );
  assert.equal(parseCachedIds('hỏng', now), null);
  assert.equal(parseCachedIds(null, now), null);
  const cov = { customers: 5, notes: 9, first_note: null, last_fetch: null };
  assert.deepEqual(
    freshCoverage(JSON.stringify({ at: now - 60000, cov }), now),
    cov,
  );
  assert.equal(
    freshCoverage(JSON.stringify({ at: now - COVERAGE_TTL_MS - 1, cov }), now),
    null,
  );
  assert.equal(
    freshCoverage(JSON.stringify({ at: now + 60000, cov }), now),
    null,
  );
});
