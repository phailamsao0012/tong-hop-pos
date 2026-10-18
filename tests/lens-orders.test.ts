import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { POS } from '../lib/report-model';
import { resolveMktLens, lensDatabase, lensSql } from '../lib/scope-filter';
import { setMktTeam, setBranch, setTeam, withUnit } from '../app/team-store';
import type { OverviewReport } from '../lib/overview-report';
import type { Sections } from '../lib/sections';
import { mktTeams } from '../lib/mkt-teams-source';

void test('lens-orders: URL giữ kỳ, POS, Sale/CSKH, chi nhánh và team MKT khi đổi trang', () => {
  try {
    setMktTeam({ id: 'hr:team_a', name: 'Team MKT 1' });
    setBranch('office_a'); setTeam('cskh');
    const url = new URL(withUnit('/api/reports/overview?start=2026-10-16&end=2026-10-16&posIds=p&team=cskh', null), 'http://local');
    assert.equal(url.searchParams.get('mktTeam'), 'hr:team_a');
    assert.equal(url.searchParams.get('branch'), 'office_a');
    assert.equal(url.searchParams.get('team'), 'cskh');
    setMktTeam(null); setBranch(null);
    assert.equal(withUnit('/api/reports/overview', null), '/api/reports/overview');
  } finally { setMktTeam(null); setBranch(null); setTeam('all'); }
});

void test('lens-orders: team + không thuộc team = tổng; bảng từng người, POS, packed, MKT và Vận đơn cùng phạm vi', async () => {
  const { db, raw } = await demoWorld(['2026-10-15', '2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  try {
    await loginAs(raw, 'owner');
    const { GET: overview } = await import('../app/api/reports/overview/route');
    const { GET: sections } = await import('../app/api/reports/sections/route');
    const { GET: shipping } = await import('../app/api/reports/van-don/route');
    const { GET: marketing } = await import('../app/api/reports/marketing/route');
    const { teams } = await mktTeams(db);
    assert.ok(teams.length > 0);
    const base = new URLSearchParams({ start: '2026-10-16', end: '2026-10-16', posIds: POS[0].id, compare: 'previous' });
    const request = async <T,>(get: (r: Request) => Promise<Response>, params: URLSearchParams): Promise<T> => {
      const response = await get(new Request('http://local/api/reports/overview?' + params));
      assert.equal(response.status, 200, await response.clone().text());
      return response.json() as Promise<T>;
    };
    const all = await request<OverviewReport>(overview, base);
    const cards = await request<Sections>(sections, base);
    const parts: OverviewReport[] = [], sectionParts: Sections[] = [];
    for (const id of [...teams.map((t) => t.id), '__unassigned']) {
      const p = new URLSearchParams(base); p.set('mktTeam', id);
      const lens = await resolveMktLens(db, p);
      assert.ok(lens && !(lens instanceof Response));
      const scoped = lensDatabase(db, lens);
      const part = await request<OverviewReport>(overview, p);
      parts.push(part);
      const section = await request<Sections>(sections, p); sectionParts.push(section);
      const { results } = await scoped.prepare(`SELECT seller_id,COUNT(*) AS n,SUM(net_total) AS net FROM raw_pos_orders WHERE pos_id=? AND first_closed_at>=? AND first_closed_at<? AND status_code NOT IN (0,6,7) GROUP BY seller_id`).bind(POS[0].id, '2026-10-15T17:00:00', '2026-10-16T17:00:00').all<{ seller_id: string; n: number; net: number }>();
      for (const employee of part.current.byEmployee) {
        const expected = results.find((r) => r.seller_id === employee.sellerId);
        assert.equal(employee.closedNet, expected?.net ?? 0);
      }
      assert.equal(part.current.byPos.every((r) => r.posId === POS[0].id), true);
      assert.equal(part.current.byEmployee.reduce((n, r) => n + r.closedNet, 0), part.current.total.closedNet);
      const market = await request<{ summary: { net: number } }>(marketing, new URLSearchParams({ ...Object.fromEntries(p), basis: 'confirmed', stage: 'confirmed' }));
      assert.equal(market.summary.net, section.mkt.net);
      const ship = await request<{ departments: unknown[] }>(shipping, p);
      assert.ok(ship);
      p.set('team', 'sale');
      const sale = await request<OverviewReport & { packedStaff: { packedOrders: number; packedNet: number }[] }>(overview, p);
      assert.equal(sale.current.total.closedNet, section.sale.net);
      const saleCards = await request<Sections & { sale: { packedNet: number } }>(sections, p);
      assert.equal(sale.packedStaff.reduce((n, r) => n + r.packedNet, 0), saleCards.sale.packedNet);
    }
    for (const side of ['current', 'compare'] as const) {
      for (const field of ['orders', 'closedOrders', 'closedNet', 'assignedOrders'] as const)
        assert.equal(parts.reduce((n, r) => n + (r[side]?.total[field] ?? 0), 0), all[side]?.total[field]);
    }
    for (const dept of ['sale', 'cskh', 'mkt'] as const)
      assert.equal(sectionParts.reduce((n, r) => n + r[dept].net, 0), cards[dept].net);
    const p = new URLSearchParams(base); p.set('mktTeam', teams[0].id);
    const lens = await resolveMktLens(db, p);
    assert.ok(lens && !(lens instanceof Response));
    const sql = lensSql('SELECT o.seller_id,SUM(o.net_total) FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money WHERE o.pos_id=? AND o.first_closed_at>=? AND o.first_closed_at<? GROUP BY o.seller_id', lens);
    const plan = raw.prepare('EXPLAIN QUERY PLAN ' + sql).all(POS[0].id, '2026-10-15T17:00:00', '2026-10-16T17:00:00');
    assert.match(JSON.stringify(plan), /idx_raw_orders_pos_closed_status_money/);
    assert.equal(lensDatabase(db, null), db);
    const again = await request<OverviewReport>(overview, base);
    assert.deepEqual(again.current, all.current);
    assert.deepEqual(again.compare, all.compare);
  } finally { logout(); raw.close(); }
});

void test('lens-orders: từ chối team lạ và kỳ quá 120 ngày; không lọc giữ nguyên đường cũ', async () => {
  const { db, raw } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  try {
    assert.equal(await resolveMktLens(db, new URLSearchParams()), null);
    assert.equal((await resolveMktLens(db, new URLSearchParams({ mktTeam: "x' OR 1=1--" })) as Response).status, 400);
    assert.equal((await resolveMktLens(db, new URLSearchParams({ mktTeam: '__unassigned', start: '2026-01-01', end: '2026-10-17' })) as Response).status, 400);
  } finally { raw.close(); }
});
