import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { trendChartRows, defaultBucket, groupTrend, metrics, mktTrend, trendNotes, trendQueries } from '../lib/mkt-trend';
import { ensureAdCostSchema } from '../lib/ad-costs';
import { mktAnalytics } from '../lib/mkt-analytics';
import { scopeApi, type Access } from '../lib/access';

void test('mkt-trend: mặc định, tuần thứ Hai, tổng không đổi và chia cho 0', () => {
  assert.equal(defaultBucket('2026-01-01', '2026-01-31'), 'day');
  assert.equal(defaultBucket('2026-01-01', '2026-02-01'), 'week');
  assert.equal(defaultBucket('2026-01-01', '2026-05-01'), 'month');
  const base = { cost: 100, phones: 2, newOrders: 1, newNet: 400, coveredNet: 400, coveredPhones: 2 };
  const days = [{ key: '2026-01-31', ...base }, { key: '2026-02-01', ...base }];
  for (const bucket of ['day', 'week', 'month'] as const) {
    const rows = groupTrend(days, '2026-01-31', '2026-02-02', bucket);
    for (const key of Object.keys(base) as (keyof typeof base)[]) assert.equal(rows.reduce((s, r) => s + r[key], 0), base[key] * 2);
  }
  assert.equal(groupTrend(days, '2026-01-31', '2026-02-02', 'week')[0].key, '2026-01-26');
  assert.equal(metrics({ cost: 0, phones: 0, newOrders: 0, newNet: 0, coveredNet: 0, coveredPhones: 0 }).roas, null);
});

void test('mkt-trend: nhận định chuỗi, ngưỡng, thiếu số và quá tải', () => {
  const rows = [5, 4, 3, 2, 1].map((v, i) => ({ key: `2026-01-0${i + 1}`, ...metrics({ cost: 100, phones: 10, newOrders: 5, newNet: v * 100, coveredNet: v * 100, coveredPhones: 10 }) }));
  assert.ok(trendNotes(rows).some(n => n.includes('giảm 3 đoạn')));
  assert.ok(trendNotes(rows).some(n => n.includes('trung bình 4')));
  assert.deepEqual(trendNotes(rows.slice(0, 2)), []);
  const flat = rows.map(r => ({ ...r, roas: 1, costPerLead: 10 }));
  assert.deepEqual(trendNotes(flat), []);
  flat[4] = { ...flat[4], phones: 20, closeRate: 10 };
  assert.ok(trendNotes(flat)[0].includes('quá tải'));
  assert.ok(trendNotes(rows).length <= 4);
});

void test('mkt-trend: SQL khớp số chính, SĐT lặp, POS, marketer, team và chỉ mục local', async () => {
  const { raw } = emptyDb();
  try {
    await ensureAdCostSchema();
    for (const [id, name] of [['s', 'NV A SALE'], ['m', 'NV B MKT'], ['u', 'NV C MKT']]) raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)').run(id, 'p', id, name, '2026-10-17');
    raw.prepare('INSERT INTO ad_costs (id,day,marketer_id,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('c', '2026-10-01', 'm', 100, '2026-10-17', '2026-10-17');
    for (const [id, day, marketer, pos] of [['1', '01', 'm', 'p'], ['2', '02', 'm', 'p'], ['3', '03', 'u', 'p'], ['4', '04', 'm', 'q']]) {
      raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,seller_id,marketer_id,status_code,net_total,phone,created_at,first_confirmed_at,fetched_at) VALUES (?,?,?,?,?,?,2,400,?,?,?,?)').run(id, pos, pos, id, 's', marketer, '0900000001', `2026-10-${day}T02:00:00`, `2026-10-${day}T03:00:00`, '2026-10-17');
    }
    const opts = { posIds: ['p'], start: '2026-10-01', end: '2026-10-31' };
    const main = await mktAnalytics(opts);
    for (const bucket of ['day', 'week', 'month'] as const) {
      const result = await mktTrend({ ...opts, bucket });
      const current = main.current as typeof main.current & { newOrders: number; newNet: number };
      for (const key of ['cost', 'phones', 'newOrders', 'newNet', 'roas', 'costPerLead'] as const) assert.equal(result.total[key], current[key]);
      assert.equal(result.total.phones, 2);
      assert.equal(result.rows.reduce((s, r) => s + r.phones, 0), 2);
    }
    assert.equal((await mktTrend({ ...opts, bucket: 'day', marketerId: 'u' })).total.newOrders, 1);
    assert.equal((await mktTrend({ ...opts, bucket: 'day', teamId: 'missing' })).total.cost, 0);
    assert.equal((await mktTrend({ ...opts, bucket: 'day', team: 'cskh' })).total.roas, null);
    for (const q of trendQueries(opts.posIds, opts.start, opts.end)) {
      const plan = raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.binds) as { detail: string }[];
      console.log('EXPLAIN mkt-trend:', plan.map(r => r.detail).join(' | '));
      assert.ok(plan.some(r => /idx_raw_orders_pos_(created|confirmed)/.test(r.detail)));
    }
  } finally { raw.close(); }
});

void test('mkt-trend: gate marketing và thu hẹp POS/team', () => {
  const a: Access = { role: 'staff', views: [], posIds: ['p'], team: 'sale' };
  assert.ok(scopeApi(a, 'GET', new URL('https://local/api/marketing/trend')).blocked);
  const result = scopeApi({ ...a, views: ['marketing'] }, 'GET', new URL('https://local/api/marketing/trend?posIds=q&team=all'));
  assert.equal(result.blocked, undefined);
  assert.equal(result.url.searchParams.get('posIds'), 'p');
  assert.equal(result.url.searchParams.get('team'), 'sale');
});

void test('mkt-trend: hôm nay đang chạy, kỳ đã qua đủ và nhận định bỏ đoạn chưa đủ', () => {
 const base = { cost: 100, phones: 10, newOrders: 1, newNet: 100, coveredNet: 100, coveredPhones: 10 };
 for (const bucket of ['day', 'week', 'month'] as const) {
  const rows = groupTrend([], '2026-10-01', '2026-10-17', bucket, '2026-10-17');
  assert.equal(rows.at(-1)?.partial, true);
  assert.equal(rows.filter(r => r.partial).length, 1);
  assert.ok(groupTrend([], '2026-10-01', '2026-10-16', bucket, '2026-10-17').every(r => !r.partial));
 }
 const rows = [3, 2, 1, 0].map((v, i) => ({ key: `2026-10-${14+i}`, ...metrics({ ...base, coveredNet: v * 100 }), partial: i === 3 }));
 assert.ok(trendNotes(rows.map(r => ({ ...r, partial: false }))).some(n => n.includes('giảm 3 đoạn')));
 assert.deepEqual(trendNotes(rows), []);
});

void test('mkt-trend S4: ẩn chi phí chưa cập nhật, giữ chỉ số khác và đoạn có chi phí', () => {
  const rows = groupTrend([{ key: '2026-10-17', cost: 0, phones: 10, newOrders: 2, newNet: 200, coveredNet: 200, coveredPhones: 10 }], '2026-10-16', '2026-10-17', 'day', '2026-10-17');
  for (const key of ['cost', 'costPerLead', 'roas', 'costShare'] as const) {
    const chart = trendChartRows(rows, key);
    assert.equal(chart[1].running, null);
    assert.equal(chart[1].complete, null);
    assert.equal(chart[0].complete, rows[0][key]);
  }
  for (const key of ['phones', 'newOrders', 'newNet', 'closeRate', 'aov'] as const) assert.equal(trendChartRows(rows, key)[1].running, rows[1][key]);
  const paid = rows.map(r => ({ ...r, ...metrics({ ...r, cost: 100 }) }));
  for (const key of ['cost', 'costPerLead', 'roas', 'costShare'] as const) assert.equal(trendChartRows(paid, key)[1].running, paid[1][key]);
  assert.deepEqual(trendChartRows([], 'cost'), []);
});
