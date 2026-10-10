// Đối chiếu lọc theo team (QA 10/10/2026): tổng các team + người ngoài team (Chưa vào team, Chưa gắn hồ sơ) = cả bộ phận, từng đồng,
// không ai nằm ở hai team, số từng người khi lọc team bằng số người đó khi xem cả bộ phận. Chạy báo cáo Tổng quan thật trên D1 giả (node:sqlite).
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { overviewReport } from '../lib/overview-report';
import type { DatabaseSync } from 'node:sqlite';

const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
const PERIODS: [string, string][] = [[DAYS[0], DAYS[3]], [DAYS[2], DAYS[2]]];
type Unit = { id: string; name: string; dept: 'sale' | 'cskh' | null };
let raw: DatabaseSync;
const units = () => raw.prepare(`SELECT d.id, d.name, (SELECT t.team FROM hr_pos_team t WHERE t.department_id=d.id AND t.team IN ('sale','cskh')
  GROUP BY t.team ORDER BY COUNT(*) DESC LIMIT 1) AS dept FROM hr_departments d WHERE d.kind='team' AND d.active=1`).all() as Unit[];
/** Chỉ số cộng được (bỏ tỷ lệ, trung bình). */
const additive = (o: object) => Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof v === 'number' && !/rate|ratio|avg|average|share/i.test(k))) as Record<string, number>;

async function reconcile(team: 'sale' | 'cskh', start: string, end: string) {
  const whole = await overviewReport({ posIds: [], start, end, team });
  const byEmp = new Map(whole.current.byEmployee.map((r) => [r.sellerId, additive(r)]));
  const keys = Object.keys(additive(whole.current.total)).filter((k) => k in (byEmp.values().next().value ?? {}));
  assert.ok(keys.includes('net') && keys.includes('orders') && keys.includes('closedOrders'), `thiếu chỉ số đối chiếu: ${keys.join(",")}`);
  const sum = Object.fromEntries(keys.map((k) => [k, 0]));
  const owner = new Map<string, string>();
  for (const u of units().filter((u) => u.dept === team)) {
    const rep = await overviewReport({ posIds: [], start, end, team, unit: { id: u.id, name: u.name, dept: team } });
    for (const k of keys) sum[k] += additive(rep.current.total)[k];
    for (const e of rep.current.byEmployee) {
      assert.ok(!owner.has(e.sellerId), `${e.sellerId} nằm ở cả ${owner.get(e.sellerId)} và ${u.name}`);
      owner.set(e.sellerId, u.name);
      assert.deepEqual(additive(e), byEmp.get(e.sellerId), `số của ${e.sellerId} trong ${u.name} khác khi xem cả bộ phận`);
    }
  }
  const outside = [...byEmp].filter(([id]) => !owner.has(id));
  for (const [, e] of outside) for (const k of keys) sum[k] += e[k];
  const total = additive(whole.current.total);
  for (const k of keys) assert.equal(Math.round(sum[k]), Math.round(total[k]), `${team} ${start}..${end}: ${k} các team + ngoài team ≠ cả bộ phận`);
  return { inTeams: owner.size, outside: outside.length };
}

before(async () => { ({ raw } = await demoWorld(DAYS, Date.parse('2026-10-02T05:00:00Z'))); });

void test('mọi người đều trong team: tổng các team = cả bộ phận', async () => {
  for (const team of ['sale', 'cskh'] as const) for (const [s, e] of PERIODS) {
    const r = await reconcile(team, s, e);
    assert.ok(r.inTeams > 0);
  }
});

void test('có người chưa vào team và người chưa gắn hồ sơ: vẫn khớp từng đồng', async () => {
  const sale = raw.prepare(`SELECT t.pos_user_id, d.parent_id FROM hr_pos_team t JOIN hr_departments d ON d.id=t.department_id
    WHERE t.team='sale' AND t.pos_user_id IN (SELECT seller_id FROM raw_pos_orders) ORDER BY t.pos_user_id`).all() as { pos_user_id: string; parent_id: string }[];
  raw.prepare('UPDATE hr_pos_team SET department_id=? WHERE pos_user_id=?').run(sale[0].parent_id, sale[0].pos_user_id);
  raw.prepare('DELETE FROM hr_pos_team WHERE pos_user_id=?').run(sale[1].pos_user_id);
  for (const team of ['sale', 'cskh'] as const) for (const [s, e] of PERIODS) {
    const r = await reconcile(team, s, e);
    if (team === 'sale') assert.equal(r.outside, 2);
  }
});
