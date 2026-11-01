import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RANK_STAGES, rankByStage, type RankRow } from '../lib/reports/mkt-rank';
import { stageSql } from '../lib/reports/marketing-report';
import { PACKED_SQL } from '../lib/reports/van-don';
import { demoWorld, emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { POS } from '../lib/shared/report-model';

void test('mkt-rank-stage: hạng theo đơn, hòa theo doanh thu rồi tên; đổi hạng và không sửa đầu vào', () => {
  const row = (rankName: string, confirmed: number, packed: number, net = 100): RankRow => ({
    rankName, atConfirmed: confirmed, atPacked: packed, atShipped: 0, atDelivered: 0,
    stageMetrics: { confirmed: { orders: confirmed, net }, packed: { orders: packed, net }, shipped: { orders: 0, net: 0 }, delivered: { orders: 0, net: 0 } },
  });
  const rows = [row('NV C', 10, 1), row('NV B', 5, 4), row('NV A', 5, 4), row('NV D', 5, 4, 200)];
  const before = structuredClone(rows);
  const ranked = rankByStage(rows, 'packed');
  assert.deepEqual(ranked.map((r) => [r.rankName, r.rank, r.rankShift]), [['NV D', 1, 1], ['NV A', 2, 1], ['NV B', 3, 1], ['NV C', 4, -3]]);
  assert.equal(ranked[0].stageRate, 80);
  assert.ok(rankByStage(rows, 'confirmed').every((r) => r.rankShift === 0));
  assert.equal(rankByStage([row('NV A', 0, 0)], 'packed')[0].stageRate, null);
  assert.deepEqual(rankByStage([], 'delivered'), []);
  assert.deepEqual(rows, before);
});

void test('mkt-rank-stage: packed dùng PACKED_SQL nhưng loại đơn hủy đã qua 8 khỏi tập MKT chốt', () => {
  const { raw } = emptyDb();
  try {
    const insert = raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,status_code,status_history_json,first_confirmed_at,created_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const status of [0, 17, 1, 8, 9, 2, 3, 16, 4, 15, 5, 6, 7]) {
      insert.run(String(status), 'p', 'p', String(status), status, '[{"status":8}]', '2026-10-17T03:00:00', '2026-10-17T03:00:00', '2026-10-17');
    }
    const cancelled = raw.prepare(`SELECT ${PACKED_SQL()} AS packed, (${stageSql('packed')}) AS mktPacked FROM raw_pos_orders o WHERE status_code=6`).get() as { packed: number; mktPacked: number };
    assert.equal(cancelled.packed, 1);
    assert.equal(cancelled.mktPacked, 0);
    const counts = RANK_STAGES.map((stage) => (raw.prepare(`SELECT COUNT(*) AS n FROM raw_pos_orders o WHERE ${stageSql(stage)}`).get() as { n: number }).n);
    assert.deepEqual(counts, [9, 8, 6, 2]);
    assert.match(stageSql('packed', 'x'), /x\.status_history_json/);
  } finally { raw.close(); }
});

type Line = RankRow & { marketerId: string; marketingTeamId: string; orders: number; net: number };
type Report = { byMarketer: Line[]; byTeam: Line[]; stageSummary: RankRow['stageMetrics']; summary: { orders: number; net: number } };

void test('mkt-rank-stage: demo bốn mốc khớp số cũ, giữ kỳ/POS/Sale/CSKH/team và chỉ mục', async () => {
  const { raw, db } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  try {
    await loginAs(raw, 'owner');
    const queries: { sql: string; binds: unknown[] }[] = [];
    const original = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const stmt = original(sql);
      const bind = stmt.bind.bind(stmt);
      stmt.bind = (...binds: (string | number | null)[]) => { queries.push({ sql, binds }); return bind(...binds); };
      return stmt;
    };
    const { GET } = await import('../app/api/reports/marketing/route');
    for (const team of ['all', 'sale', 'cskh']) {
      const params = new URLSearchParams({ start: '2026-10-16', end: '2026-10-16', posIds: POS[0].id, basis: 'confirmed', stage: 'confirmed', team });
      const response = await GET(new Request(`http://local/api/reports/marketing?${params}`));
      assert.equal(response.status, 200);
      const base = await response.json() as Report;
      assert.ok(base.byMarketer.length);
      for (const r of [...base.byMarketer, ...base.byTeam]) {
        assert.ok(r.atConfirmed >= r.atPacked && r.atPacked >= r.atShipped && r.atShipped >= r.atDelivered);
      }
      for (const stage of RANK_STAGES) {
        params.set('stage', stage);
        const old = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as Report;
        for (const key of ['byMarketer', 'byTeam'] as const) {
          assert.equal(base[key].reduce((n, r) => n + r.stageMetrics[stage].orders, 0), old.summary.orders);
          assert.equal(base[key].reduce((n, r) => n + r.stageMetrics[stage].net, 0), old.summary.net);
        }
        assert.equal(base.stageSummary[stage].orders, old.summary.orders);
        assert.equal(base.stageSummary[stage].net, old.summary.net);
      }
      const marketerId = base.byMarketer[0].marketerId;
      params.set('marketerId', marketerId);
      const scoped = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as Report;
      assert.ok(scoped.byMarketer.every((r) => r.marketerId === marketerId));
      params.delete('marketerId');
      params.set('marketingTeamId', '__unassigned');
      const unassigned = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as Report;
      assert.ok(unassigned.byTeam.every((r) => r.marketingTeamId === '__unassigned'));
      if (team === 'all') {
        raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
          .run('marketing_teams_v1', JSON.stringify([{ id: 'mkt_demo', name: 'Team MKT 1', memberIds: [marketerId] }]), '2026-10-17');
        params.set('marketingTeamId', 'mkt_demo');
        for (const basis of ['created', 'confirmed']) {
          params.set('basis', basis);
          params.set('stage', 'confirmed');
          const scopedTeam = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as Report;
          assert.ok(scopedTeam.byMarketer.length);
          assert.ok(scopedTeam.byMarketer.every((r) => r.marketerId === marketerId));
          assert.ok(scopedTeam.byTeam.every((r) => r.marketingTeamId === 'mkt_demo'));
          for (const stage of RANK_STAGES) {
            params.set('stage', stage);
            const old = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as Report;
            assert.equal(scopedTeam.stageSummary[stage].orders, old.summary.orders);
            assert.equal(scopedTeam.stageSummary[stage].net, old.summary.net);
          }
        }
      }
    }
    const rankQueries = queries.filter((q) => q.sql.includes('INDEXED BY idx_raw_orders_pos_confirmed_status_money'));
    assert.ok(rankQueries.length >= 3);
    const plans = new Set<string>();
    for (const q of rankQueries.slice(0, 3)) {
      const plan = raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.binds as (string | number | null)[]) as { detail: string }[];
      assert.ok(plan.some((r) => r.detail.includes('SEARCH o USING INDEX idx_raw_orders_pos_confirmed_status_money')));
      for (const r of plan) if (r.detail.includes('idx_raw_orders_pos_confirmed_status_money')) plans.add(r.detail);
    }
    console.log('EXPLAIN D1 local adapter:', [...plans].join('\n'));
    const createdQuery = queries.find((q) => q.sql.includes('INDEXED BY idx_raw_orders_pos_created_status_phone'));
    assert.ok(createdQuery);
    const createdPlan = raw.prepare(`EXPLAIN QUERY PLAN ${createdQuery.sql}`).all(...createdQuery.binds as (string | number | null)[]) as { detail: string }[];
    const createdSearch = createdPlan.find((r) => r.detail.includes('SEARCH o USING INDEX idx_raw_orders_pos_created_status_phone'));
    assert.ok(createdSearch);
    console.log('EXPLAIN D1 local adapter:', createdSearch.detail);
  } finally { logout(); raw.close(); }
});

void test('mkt-rank-stage: nút bốn mốc chỉ đổi trạng thái cục bộ, URL API không phụ thuộc rankStage', () => {
  const source = readFileSync(new URL('../app/marketing-view.tsx', import.meta.url), 'utf8');
  const url = source.slice(source.indexOf('  const url ='), source.indexOf('  const { data, at,'));
  assert.doesNotMatch(url, /rankStage/);
  assert.match(source, /setRankStage\(key\); setOtherStages\(false\)/);
});
