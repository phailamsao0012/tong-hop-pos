// Bảng gọn Marketing, bước 3: bốn báo cáo (Tổng quan MKT, số chính MKT, bảng chéo Sale × MKT, xu hướng) đọc bảng gốc hay bảng gọn
// phải ra JSON GIỐNG HỆT, trên cùng DB ảo (demoWorld, số ảo) và nhiều tổ hợp bộ lọc. Bảng gọn dựng bằng việc điền lịch sử (bước 2).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { SHOPS } from '../lib/demo/world';
import { runSlimFill, resetSlimReadyMemo, SLIM_READY_KEY } from '../lib/reports/mkt-slim-fill';
import { RAW_SOURCE, SLIM_SOURCE, mktReadSource, type MktSource } from '../lib/reports/mkt-source';
import { marketingOverviewRaw } from '../lib/reports/marketing-overview';
import { mktAnalytics, NO_PRODUCT } from '../lib/reports/mkt-analytics';
import { mktCross } from '../lib/reports/mkt-cross';
import { mktTrend } from '../lib/reports/mkt-trend';
import { mktTeams } from '../lib/teams/mkt-teams-source';
import { itemKey } from '../lib/reports/marketing-report';
import { UNASSIGNED_TEAM } from '../lib/teams/marketing-teams';

const DAYS = ['2026-08-05', '2026-08-28', '2026-09-14', '2026-10-02', '2026-10-16'];
const START = '2026-08-01', END = '2026-10-31'; // 92 ngày: kỳ dài
const NOW = Date.parse('2026-10-17T03:00:00Z');

type World = Awaited<ReturnType<typeof demoWorld>>;
let world: World | null = null;
async function setup() {
  if (world) return world;
  world = await demoWorld(DAYS, NOW);
  const r = await runSlimFill(world.db, { now: new Date('2026-10-17T16:00:00Z') });
  assert.equal(r.ready, true, 'điền đủ bảng gọn');
  assert.equal(r.bad, 0);
  return world;
}

/** Ghi lại câu SQL đã chạy để kiểm nguồn đọc (bảng gọn không được đụng bảng gốc / INDEXED BY). */
function recordSql(db: D1Database) {
  const seen: string[] = [];
  const prepare = db.prepare.bind(db);
  db.prepare = ((sql: string) => { seen.push(sql); return prepare(sql); }) as typeof db.prepare;
  return { seen, restore: () => { db.prepare = prepare; } };
}
async function both<T>(db: D1Database, run: (src: MktSource) => Promise<T>, label: string) {
  const a = await run(RAW_SOURCE);
  const rec = recordSql(db);
  let b: T;
  try { b = await run(SLIM_SOURCE); } finally { rec.restore(); }
  const orderSql = rec.seen.filter((s) => /mkt_orders_slim|raw_pos_order/.test(s));
  assert.ok(orderSql.length > 0, `${label}: có đọc đơn`);
  for (const s of orderSql) {
    assert.doesNotMatch(s, /raw_pos_order/, `${label}: bảng gọn không đọc bảng gốc`);
    assert.doesNotMatch(s, /INDEXED BY/, `${label}: bảng gọn không dùng INDEXED BY`);
    assert.doesNotMatch(s, /status_history_json/, `${label}: bảng gọn dùng was_packed / was_sent`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), label);
  return a;
}

/** Giá trị lọc thật có trong DB ảo: Marketer, Sale, CSKH, sản phẩm, nguồn đơn, team MKT, team Sale. */
async function pick(w: World) {
  const one = (sql: string) => (w.raw.prepare(sql).get() as { v: string } | undefined)?.v ?? '';
  const marketer = one("SELECT TRIM(marketer_id) AS v FROM raw_pos_orders WHERE TRIM(COALESCE(marketer_id,''))<>'' GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1");
  const seller = one("SELECT seller_id AS v FROM raw_pos_orders WHERE TRIM(COALESCE(marketer_id,''))<>'' AND seller_id IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1");
  const care = one("SELECT care_id AS v FROM raw_pos_orders WHERE TRIM(COALESCE(marketer_id,''))<>'' AND care_id IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1");
  const product = one(`SELECT ${itemKey('i')} AS v FROM raw_pos_order_items i JOIN raw_pos_orders o ON o.id=i.order_id WHERE TRIM(COALESCE(o.marketer_id,''))<>'' AND i.is_bonus=0 GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1`);
  const productName = one("SELECT TRIM(i.name) AS v FROM raw_pos_order_items i WHERE i.is_bonus=0 GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1");
  const source = one("SELECT NULLIF(TRIM(order_source),'') AS v FROM raw_pos_orders WHERE TRIM(COALESCE(marketer_id,''))<>'' AND NULLIF(TRIM(order_source),'') IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1");
  const saleTeam = one("SELECT department_id AS v FROM hr_pos_team WHERE team='sale' AND department_id IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1");
  const { teams } = await mktTeams(w.db);
  assert.ok(marketer && seller && product && saleTeam, 'DB ảo có đủ giá trị lọc');
  return { marketer, seller, care, product, productName, source, saleTeam, mktTeam: teams[0]?.id ?? '' };
}

const ALL_POS = SHOPS.map((s) => s.posId);
const ONE_POS = [SHOPS[0].posId];

void test('Tổng quan MKT: bảng gốc và bảng gọn cho JSON giống hệt (cơ sở ngày, mốc, Sale/CSKH, team MKT, team Sale, Marketer, Sale, CSKH, sản phẩm, nguồn đơn)', async () => {
  const w = await setup();
  const f = await pick(w);
  const user = { role: 'owner' as const };
  const cases: Record<string, string>[] = [];
  for (const basis of ['created', 'confirmed']) for (const stage of ['all', 'confirmed', 'packed', 'shipped', 'delivered', 'returned', 'cancelled', 'deleted', 'unconfirmed']) cases.push({ basis, stage });
  for (const team of ['sale', 'cskh']) cases.push({ basis: 'confirmed', stage: 'confirmed', team });
  cases.push({ marketerId: f.marketer }, { sellerId: f.seller }, { productKey: f.product }, { saleTeam: f.saleTeam }, { basis: 'confirmed', stage: 'packed', saleTeam: f.saleTeam });
  if (f.care) cases.push({ careId: f.care });
  if (f.source) cases.push({ source: f.source, basis: 'confirmed' });
  if (f.mktTeam) cases.push({ mktTeam: f.mktTeam }, { mktTeam: f.mktTeam, stage: 'packed', basis: 'confirmed' });
  cases.push({ mktTeam: UNASSIGNED_TEAM }, { until: '2026-10-16T05:00:00' });
  for (const c of cases) for (const posIds of [ALL_POS, ONE_POS]) {
    const p = new URLSearchParams({ team: 'all', ...c });
    const out = await both(w.db, (src) => marketingOverviewRaw(user, p, posIds, START, END, null, src), `overview ${p} ${posIds.length}`);
    if (!c.mktTeam && posIds === ALL_POS && (c.stage === 'confirmed' || c.stage === 'all')) assert.ok(out && out.summary.orders > 0, `overview có số ${p}`);
  }
});

void test('Số chính MKT: bảng gốc và bảng gọn cho JSON giống hệt (Sale/CSKH, Marketer, team, sản phẩm, team Sale, cắt giờ)', async () => {
  const w = await setup();
  const f = await pick(w);
  const cases: Parameters<typeof mktAnalytics>[0][] = [];
  for (const posIds of [ALL_POS, ONE_POS]) for (const team of ['all', 'sale', 'cskh'] as const) cases.push({ posIds, start: START, end: END, team });
  cases.push(
    { posIds: ALL_POS, start: START, end: END, marketerId: f.marketer },
    { posIds: ALL_POS, start: START, end: END, teamId: UNASSIGNED_TEAM },
    { posIds: ALL_POS, start: START, end: END, product: 'Kháng sinh' },
    { posIds: ALL_POS, start: START, end: END, product: 'Combo', team: 'sale' },
    { posIds: ALL_POS, start: START, end: END, product: NO_PRODUCT },
    { posIds: ALL_POS, start: START, end: END, saleTeam: f.saleTeam },
    { posIds: ALL_POS, start: START, end: END, untilUtc: '2026-10-16T05:00:00.000Z' },
  );
  if (f.productName) cases.push({ posIds: ALL_POS, start: START, end: END, product: f.productName });
  if (f.mktTeam) cases.push({ posIds: ALL_POS, start: START, end: END, teamId: f.mktTeam, team: 'sale' });
  for (const c of cases) {
    const out = await both(w.db, (source) => mktAnalytics({ ...c, db: w.db, source }), `analytics ${JSON.stringify(c)}`);
    if (!c.product && !c.marketerId && !c.teamId && c.team === 'all' && c.posIds === ALL_POS) assert.ok(out.current.closed > 0, 'analytics có số');
  }
});

void test('Bảng chéo Sale × MKT và xu hướng: bảng gốc và bảng gọn cho JSON giống hệt', async () => {
  const w = await setup();
  const f = await pick(w);
  for (const posIds of [ALL_POS, ONE_POS]) {
    const out = await both(w.db, (src) => mktCross(posIds, START, END, src), `cross ${posIds.length}`);
    if (posIds === ALL_POS) assert.ok(out.pairs.some((x) => x.closed > 0 && x.packed > 0), 'cross có số');
  }
  const cases = [
    { team: 'all' }, { team: 'sale' }, { team: 'cskh' }, { marketerId: f.marketer }, { teamId: UNASSIGNED_TEAM },
    ...(f.mktTeam ? [{ teamId: f.mktTeam }] : []),
  ];
  for (const c of cases) for (const bucket of ['day', 'week', 'month'] as const) {
    await both(w.db, (source) => mktTrend({ start: START, end: END, posIds: ALL_POS, bucket, ...c, source }), `trend ${JSON.stringify(c)} ${bucket}`);
  }
});

void test('chọn nguồn: chỉ bảng gọn khi THP_MKT_SLIM=1, kỳ dài hơn 62 ngày và còn mốc đã điền đủ', async () => {
  const w = await setup();
  // env của Worker trong test (tests/support/cf-workers.mjs), không import 'cloudflare:workers' ở file test.
  const e = (globalThis as { __THP_ENV__?: { THP_MKT_SLIM?: string } }).__THP_ENV__!;
  const before = e.THP_MKT_SLIM;
  try {
    resetSlimReadyMemo();
    assert.equal((await mktReadSource(w.db, {}, START, END)).slim, false, 'cờ tắt');
    assert.equal((await mktReadSource(w.db, { THP_MKT_SLIM: '1' }, '2026-09-01', '2026-10-31')).slim, false, '61 ngày');
    assert.equal((await mktReadSource(w.db, { THP_MKT_SLIM: '1' }, '2026-09-01', '2026-11-01')).slim, false, '62 ngày');
    assert.equal((await mktReadSource(w.db, { THP_MKT_SLIM: '1' }, '2026-09-01', '2026-11-02')).slim, true, '63 ngày');
    assert.equal((await mktReadSource(w.db, { THP_MKT_SLIM: '1' }, START, END)).slim, true);
    w.raw.prepare('DELETE FROM app_settings WHERE key=?').run(SLIM_READY_KEY);
    resetSlimReadyMemo();
    assert.equal((await mktReadSource(w.db, { THP_MKT_SLIM: '1' }, START, END)).slim, false, 'mất mốc');
    // Đường mặc định của báo cáo (không truyền nguồn) theo env: bật cờ mà chưa có mốc vẫn đọc bảng gốc.
    e.THP_MKT_SLIM = '1';
    const rec = recordSql(w.db);
    try { await mktCross(ALL_POS, START, END); } finally { rec.restore(); }
    assert.ok(rec.seen.some((s) => /FROM raw_pos_orders o/.test(s)));
    assert.ok(!rec.seen.some((s) => /mkt_orders_slim/.test(s)));
    await runSlimFill(w.db, { now: new Date('2026-10-17T16:00:00Z') });
    resetSlimReadyMemo();
    const rec2 = recordSql(w.db);
    try { await mktCross(ALL_POS, START, END); } finally { rec2.restore(); }
    assert.ok(rec2.seen.some((s) => /FROM mkt_orders_slim o/.test(s)), 'có mốc lại: đọc bảng gọn');
  } finally { e.THP_MKT_SLIM = before; }
});
