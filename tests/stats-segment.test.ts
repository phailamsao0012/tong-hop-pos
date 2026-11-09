import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { STAT_COLUMNS, STATUS_GROUPS, rebuildStats, markDirtyOrder, backfillSegmentMonth, segmentMonths, segmentStatsReady, checkSegmentStatsNightly, SEGMENT_READY_KEY, SEGMENT_EPOCH, type DirtyBuckets } from '../lib/reports/stats';
import { EMPTY_ORDER_FILTERS, segmentedStats, type ProductSegment, type OrderOrigin } from '../lib/pancake/order-segments';
import { parseStatus } from '../lib/pancake/order-status';
import { vnRangeUtc } from '../lib/shared/report-time';
import type { Team } from '../lib/teams/team';
import { env } from 'cloudflare:workers';
import { overviewReport } from '../lib/reports/overview-report';
import { SyncScheduler } from '../lib/ops/scheduler';

const POS = ['oxytetra', 'sieu-vo-gao', 'demo-a', 'demo-b', 'demo-c', 'demo-d'];
const START = '2026-09-30', END = '2026-10-02';
const sums = STAT_COLUMNS.map(c => `COALESCE(SUM(${c}),0) AS ${c}`).join(',');
async function fixture() {
  const { raw, db } = emptyDb();
  for (const [id, name, department] of [['sale', 'Demo SALE', 'Sale'], ['care', 'Demo CSKH', 'CSKH'], ['excluded', 'Demo kho', 'Kho']])
    raw.prepare('INSERT INTO pos_users(id,pos_id,user_id,name,department,fetched_at) VALUES (?,?,?,?,?,?)').run(id, POS[0], id, name, department, START);
  const names = ['gentadox', 'detox', 'oxy bo huyet', 'nano shield', 'SK', 'GK', 'godkill', 'god kill', 'khac'];
  let n = 0;
  for (const pos of POS) for (const status of Object.values(STATUS_GROUPS).flat()) for (let i = 0; i < names.length; i++) {
    const id = `demo-${n++}`;
    raw.prepare(`INSERT INTO raw_pos_orders(id,pos_id,shop_id,source_order_id,fetched_at,created_at,first_closed_at,first_confirmed_at,seller_assigned_at,
      seller_id,marketer_id,tags_json,status_code,current_total,total_discount,net_total,shipping_fee,cod)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,pos,'demo',id,START,`${START}T17:15:00`,`${END}T03:00:00`,`${END}T03:00:00`,`${START}T04:00:00`,
        ['sale','care','excluded','',null][i % 5], [null,'','  ',' demo-mkt ','demo-other'][i % 5], i === 8 ? '[{"name":"SK + GK"}]' : '[]',status,1200,100,i % 2 ? null : 1050,20,1070);
    for (let j = 0; j < 2; j++) raw.prepare(`INSERT INTO raw_pos_order_items(id,order_id,pos_id,product_id,name,quantity,line_total,is_bonus,returned_count)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(`${id}-${j}`,id,pos,'demo-product',j ? 'gentadox' : names[i],j ? 9 : i % 3 === 0 ? 0 : 2,j ? 0 : 1200,j,0);
  }
  const dirty: DirtyBuckets = new Map(POS.map(p => [p, new Set([START,'2026-10-01',END])]));
  await rebuildStats(db, dirty);
  return { raw, db, dirty };
}
function compare(raw: ReturnType<typeof emptyDb>['raw']) {
  const { startUtc, endUtc } = vnRangeUtc(START, END);
  for (const productSegment of ['all','gentadox','skgk','khac','oxy'] as ProductSegment[])
    for (const team of ['all','sale','cskh'] as Team[])
      for (const [orderOrigin, marketerId] of [['all',''],['self',''],['mkt',''],['mkt','demo-mkt']] as [OrderOrigin,string][])
        for (const employees of [[],['care'],['sale','care']]) {
          const f = { ...EMPTY_ORDER_FILTERS, productSegment, orderOrigin, marketerId };
          const old = segmentedStats(POS,startUtc,endUtc,team,f,employees);
          const next = segmentedStats(POS,startUtc,endUtc,team,f,employees,null,null,{ start: START,end: END,ready: true,withProducts: false });
          assert.doesNotMatch(next.sql, /segment_orders|raw_pos_orders/);
          const query = (v: typeof old) => raw.prepare(v.sql + `SELECT pos_id,day,seller_id,marketer_id,${sums} FROM stats_daily GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`).all(...v.binds);
          assert.deepEqual(query(next),query(old), JSON.stringify([productSegment,team,orderOrigin,marketerId,employees]));
        }
  const group = 'pos_id,day,seller_id';
  const query = (table: string) => raw.prepare(`SELECT ${group},${sums} FROM ${table} GROUP BY ${group} ORDER BY ${group}`).all();
  assert.deepEqual(query('stats_daily_segment'), query('stats_daily'));
}

void test('segment stats: all columns, filters and dirty updates equal the original event SQL', async () => {
  const { raw, db } = await fixture();
  try {
    compare(raw);
    for (const status of [3,4,6,7]) {
      raw.prepare("UPDATE raw_pos_orders SET status_code=?,marketer_id='',tags_json='[]' WHERE id='demo-1'").run(status);
      const dirty: DirtyBuckets = new Map();
      markDirtyOrder(dirty,POS[0],{ inserted_at: `${START}T17:15:00`, time_assign_seller: `${START}T04:00:00`, status_history: [{status:1,updated_at:`${END}T03:00:00`}] });
      await rebuildStats(db,dirty);
      compare(raw);
    }
    // Diff unchanged rows: no writes; moving dimensions removes old buckets.
    const before = raw.prepare('SELECT * FROM stats_daily_segment ORDER BY id').all();
    await backfillSegmentMonth(db, POS[0], '2026-10');
    assert.deepEqual(raw.prepare('SELECT * FROM stats_daily_segment ORDER BY id').all(), before);
    assert.ok((await segmentMonths(db)).includes(`${POS[0]}:2026-10`));
    assert.equal(await segmentStatsReady(db),false);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(SEGMENT_READY_KEY,String(SEGMENT_EPOCH),START);
    assert.equal(await segmentStatsReady(db),true);
  } finally { raw.close(); }
});

void test('segment reads preserve products and fall back for custom status, missing history and partial days', async () => {
  const { raw } = await fixture();
  try {
    const { startUtc,endUtc } = vnRangeUtc(START,END);
    const read = { start: START,end: END,ready: true };
    const old = segmentedStats(POS,startUtc,endUtc,'cskh',EMPTY_ORDER_FILTERS);
    const next = segmentedStats(POS,startUtc,endUtc,'cskh',EMPTY_ORDER_FILTERS,[],null,null,read);
    const product = (v: typeof old) => raw.prepare(v.sql+'SELECT * FROM stats_daily_product ORDER BY pos_id,day,product_id,quantity').all(...v.binds);
    assert.deepEqual(product(next),product(old));
    for (const [f,end,opts] of [[EMPTY_ORDER_FILTERS,endUtc,{...read,ready:false}], [{...EMPTY_ORDER_FILTERS,status:parseStatus('c:3')},endUtc,read], [EMPTY_ORDER_FILTERS,'2026-10-02T05:00:00',read]] as const) {
      const v = segmentedStats(POS,startUtc,end,'all',f,[],null,null,{...opts,withProducts:false});
      assert.match(v.sql,/segment_orders/);
      assert.doesNotMatch(v.sql,/main.stats_daily_segment/);
      raw.prepare(v.sql+`SELECT ${sums} FROM stats_daily`).all(...v.binds);
    }
  } finally { raw.close(); }
});

void test('nightly reconciliation gates time/readiness, repairs both missing and extra buckets, and logs once', async () => {
  const { raw, db } = await fixture();
  try {
    const now = new Date('2026-10-02T19:30:00Z'); // 02:30 VN ngày 03
    assert.equal(await checkSegmentStatsNightly(db,now),0);
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(SEGMENT_READY_KEY,String(SEGMENT_EPOCH),START);
    raw.exec("UPDATE stats_daily_segment SET net=net+1 WHERE pos_id='demo-a'; DELETE FROM stats_daily_segment WHERE pos_id='demo-b';");
    // Bucket thừa có đủ số để phép so tổng phát hiện.
    raw.exec("INSERT INTO stats_daily_segment(id,pos_id,day,seller_id,segment,marketer_id,orders,updated_at) VALUES ('extra','demo-c','2026-10-03','','khac','',1,'demo')");
    assert.equal(await checkSegmentStatsNightly(db,new Date('2026-10-02T19:29:00Z')),0);
    assert.ok(await checkSegmentStatsNightly(db,now) > 0);
    compare(raw);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM alert_log WHERE kind='stats_segment_mismatch'").get()!.n,1);
    assert.equal(await checkSegmentStatsNightly(db,now),0);
    assert.equal(await checkSegmentStatsNightly(db,new Date('2026-10-03T19:30:00Z')),1); // chỉ ghi mốc kiểm
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM alert_log').get()!.n,1);
  } finally { raw.close(); }
});

void test('overview totals and summaries stop using segment_orders after readiness; products keep the original query', async () => {
  const { raw, db } = await fixture();
  const statements: string[] = [];
  const observed = new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => { statements.push(sql); return target.prepare(sql); };
    const value = Reflect.get(target,property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  Object.assign(env,{DB:observed});
  try {
    const options = { posIds: POS,start: START,end: END,team: 'sale' as const, filters: {...EMPTY_ORDER_FILTERS,productSegment:'gentadox' as const} };
    const before = await overviewReport(options);
    const rawCount = statements.filter(s => s.includes('segment_orders')).length;
    raw.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)').run(SEGMENT_READY_KEY,String(SEGMENT_EPOCH),START);
    statements.length = 0;
    const after = await overviewReport(options);
    assert.deepEqual(after.current,before.current);
    assert.deepEqual(after.productSegments,before.productSegments);
    assert.ok(rawCount > 10);
    const rawQueries = statements.filter(s => s.includes('segment_orders'));
    assert.equal(rawQueries.length,2); // báo cáo nhóm và mẫu số mọi sản phẩm: chỉ hai câu sản phẩm
    assert.ok(rawQueries.every(s => /SELECT pos_id, product_id, MAX\(name\)/.test(s)));
    assert.equal(statements.filter(s => s.includes('main.stats_daily_segment') && !s.includes('segment_orders')).length,10);
  } finally { Object.assign(env,{DB:db}); raw.close(); }
});

void test('scheduler backfills event months newest first and publishes readiness only after successful writes', async () => {
  const { raw, db } = await fixture();
  try {
    raw.exec('DELETE FROM stats_daily_segment');
    const saved: unknown[] = [];
    const scheduler = new SyncScheduler({ storage: { put: async (_key: string, value: unknown) => { saved.push(structuredClone(value)); } } } as unknown as DurableObjectState,
      { DB: db } as Cloudflare.Env);
    const state = { statsPending: [],customerPending: [],sellerProductPending: [],mktPending: [],sentPending: [],segmentPending: null as string[] | null,writesUsed:0 };
    const build = (scheduler as unknown as {buildPendingStats(s: typeof state, db: D1Database): Promise<number>}).buildPendingStats.bind(scheduler);
    let fail = true;
    const observed = new Proxy(db,{ get(target,property) {
      if (property === 'batch') return (batch: D1PreparedStatement[]) => { if (fail) throw new Error('demo write failure'); return target.batch(batch); };
      const value = Reflect.get(target,property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await assert.rejects(build(state,observed),/demo write failure/);
    assert.equal(await segmentStatsReady(db),false);
    assert.match(state.segmentPending![0],/:2026-10$/);
    fail = false;
    await build(state,observed);
    assert.equal(state.segmentPending!.length,0);
    assert.ok(saved.length >= POS.length * 2);
    assert.equal(await segmentStatsReady(db),true);
    compare(raw);
  } finally { raw.close(); }
});
