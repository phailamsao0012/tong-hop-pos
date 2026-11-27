// Bảng gọn Marketing, bước 3 cho /api/reports/trend-cards: nhánh MKT đọc bảng gọn khi kỳ dài ra JSON giống hệt bảng gốc;
// Sale, CSKH, Vận đơn không đổi một ký tự câu SQL. Dữ liệu ảo (demoWorld).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { SHOPS } from '../lib/demo/world';
import { runSlimFill } from '../lib/reports/mkt-slim-fill';
import { RAW_SOURCE, SLIM_SOURCE } from '../lib/reports/mkt-source';
import { trendCards, trendOrderPage, trendQuery, type TrendDept, type TrendOptions } from '../lib/reports/trend-period';

const DAYS = ['2026-08-05', '2026-09-14', '2026-10-02', '2026-10-15', '2026-10-16'];
const NOW = Date.parse('2026-10-16T09:00:00Z');
const START = '2026-08-01', END = '2026-10-31';
const ALL_POS = SHOPS.map((s) => s.posId);

let world: Awaited<ReturnType<typeof demoWorld>> | null = null;
async function setup() {
  if (world) return world;
  world = await demoWorld(DAYS, NOW);
  const r = await runSlimFill(world.db, { now: new Date('2026-10-16T16:00:00Z') });
  assert.equal(r.ready, true);
  return world;
}
function recordSql(db: D1Database) {
  const seen: string[] = [];
  const prepare = db.prepare.bind(db);
  db.prepare = ((sql: string) => { seen.push(sql); return prepare(sql); }) as typeof db.prepare;
  return { seen, restore: () => { db.prepare = prepare; } };
}

void test('trendQuery: sale, cskh, vận đơn giữ nguyên từng ký tự câu SQL dù nguồn là bảng gọn; chỉ mkt đổi bảng và bỏ INDEXED BY', () => {
  for (const dept of ['sale', 'cskh', 'vandon'] as TrendDept[]) for (const bySent of [false, true]) for (const byDay of [false, true]) {
    const a = trendQuery(dept, ['p', 'q'], '2026-08-01', '2026-10-31', ' AND x=?', ['1'], bySent, byDay);
    const b = trendQuery(dept, ['p', 'q'], '2026-08-01', '2026-10-31', ' AND x=?', ['1'], bySent, byDay, SLIM_SOURCE);
    assert.equal(b.sql, a.sql, `${dept} ${bySent} ${byDay}`);
    assert.deepEqual(b.binds, a.binds);
    // Sale / CSKH theo ngày tạo đơn từ 27/11/2026 (chỉ mục created); Vận đơn giữ ngày chốt / ngày gửi.
    assert.match(a.sql, /FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_(created|closed_status_money|sent_status_money) WHERE/);
  }
  const raw = trendQuery('mkt', ['p'], '2026-08-01', '2026-10-31', '', [], false);
  const slim = trendQuery('mkt', ['p'], '2026-08-01', '2026-10-31', '', [], false, false, SLIM_SOURCE);
  assert.match(raw.sql, /FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_created WHERE/);
  assert.match(slim.sql, /FROM mkt_orders_slim o WHERE/);
  assert.doesNotMatch(slim.sql, /INDEXED BY|raw_pos_orders/);
  assert.equal(slim.sql.replace('FROM mkt_orders_slim o WHERE', 'X'), raw.sql.replace('FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_created WHERE', 'X'), 'phần còn lại của câu mkt giữ nguyên');
});

void test('trend-cards MKT kỳ dài: bảng gốc và bảng gọn cho JSON giống hệt; bộ phận khác vẫn đọc bảng gốc', async () => {
  const w = await setup();
  const optsList: TrendOptions[] = [];
  for (const posIds of [ALL_POS, [ALL_POS[0]]]) for (const team of ['all', 'sale', 'cskh'] as const) optsList.push({ start: START, end: END, posIds, team, unit: null });
  optsList.push({ start: '2026-07-20', end: '2026-10-16', posIds: ALL_POS, team: 'all', unit: null });
  for (const opts of optsList) {
    const run = async (src: typeof RAW_SOURCE) => {
      // Hồ sơ giờ lưu trong app_settings: xoá trước mỗi lượt để hai nguồn đều tự tính.
      w.raw.prepare("DELETE FROM app_settings WHERE key LIKE 'trend_profile:%'").run();
      return trendCards(w.db, opts, ['sale', 'cskh', 'mkt', 'vandon'], NOW, src);
    };
    const a = await run(RAW_SOURCE);
    const rec = recordSql(w.db);
    let b: Awaited<ReturnType<typeof run>>;
    try { b = await run(SLIM_SOURCE); } finally { rec.restore(); }
    assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), JSON.stringify(opts));
    const orderSql = rec.seen.filter((s) => /FROM (raw_pos_orders|mkt_orders_slim) o/.test(s));
    assert.ok(orderSql.some((s) => /FROM mkt_orders_slim o WHERE/.test(s)), 'mkt đọc bảng gọn');
    assert.ok(orderSql.filter((s) => /FROM raw_pos_orders o INDEXED BY/.test(s)).length >= 3 * 3, 'sale, cskh, vận đơn vẫn đọc bảng gốc (3 câu mỗi bộ phận)');
    assert.ok(!orderSql.some((s) => /mkt_orders_slim/.test(s) && /INDEXED BY|status_history_json/.test(s)));
    if (opts.posIds === ALL_POS && opts.team === 'all' && opts.end === END) assert.ok((a.cards.mkt?.actual ?? 0) > 0, 'mkt có số');
  }
});

void test('trend-cards danh sách đơn: MKT hai nguồn giống hệt (cả lọc theo marketer); Sale giữ nguyên câu SQL', async () => {
  const w = await setup();
  const opts: TrendOptions = { start: START, end: END, posIds: ALL_POS, team: 'all', unit: null };
  const top = (w.raw.prepare("SELECT marketer_id AS m FROM raw_pos_orders WHERE TRIM(COALESCE(marketer_id,''))<>'' AND first_confirmed_at IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1").get() as { m: string }).m;
  for (const staff of [null, top]) for (const page of [0, 1]) {
    const a = await trendOrderPage(w.db, opts, 'mkt', staff, page, NOW, RAW_SOURCE);
    const b = await trendOrderPage(w.db, opts, 'mkt', staff, page, NOW, SLIM_SOURCE);
    assert.deepEqual(b, a, `mkt ${staff} ${page}`);
    if (page === 0 && staff === null) assert.ok(a.length > 0);
  }
  for (const dept of ['sale', 'cskh', 'vandon'] as TrendDept[]) {
    const run = async (src: typeof RAW_SOURCE) => {
      const rec = recordSql(w.db);
      try { return { rows: await trendOrderPage(w.db, opts, dept, null, 0, NOW, src), sql: rec.seen }; } finally { rec.restore(); }
    };
    const a = await run(RAW_SOURCE), b = await run(SLIM_SOURCE);
    assert.deepEqual(b.sql, a.sql, `${dept}: cùng câu SQL`);
    assert.ok(a.sql.some((x) => /FROM raw_pos_orders o INDEXED BY/.test(x)));
    assert.deepEqual(b.rows, a.rows);
  }
});
