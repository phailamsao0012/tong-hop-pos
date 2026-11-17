import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { bossReportData } from '../lib/zalo/boss-data';
import { buildSplit, multiTeamMembers, splitAmount, type PosW } from '../lib/zalo/team-pos-split';
import { bossKpiCommand } from '../lib/zalo/kpi-bot';
import type { TeamRow } from '../lib/zalo/boss-report';

// Người ở nhiều team: bảng team ảnh sếp tách theo POS của team (anh Vũ 14/11/2026, Hạ Vy CSKH ở "CSKH - Hạ Vy" và "CSKH Nấm").
const SVG = 'sieu-vo-gao', OXY = 'oxytetra';
const tr = 1e6;

function world() {
  const { raw, db } = emptyDb();
  raw.prepare('INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('owner-1', 'a@x.vn', 'Anh Vũ', 'x', 'owner', '2026-11-01', '2026-11-01');
  raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run('web_teams_v1', JSON.stringify([
    { id: 'wt_th', name: 'CSKH - Hạ Vy', dept: 'cskh', office: null, memberIds: ['h', 'a', 'g'] },
    { id: 'wt_my', name: 'CSKH Nấm', dept: 'cskh', office: null, memberIds: ['b', 'h', 'g'] },
    { id: 'wt_cu', name: 'CSKH Cũ', dept: 'cskh', office: null, memberIds: ['m'] },
    { id: 'wt_sl', name: 'Sale Lợn', dept: 'sale', office: null, memberIds: ['s1', 'd2'] },
    { id: 'wt_sm', name: 'Sale Nấm', dept: 'sale', office: null, memberIds: ['s2', 'd2'] },
  ]), '2026-11-01');
  const pu = raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)');
  for (const [id, pos, name] of [['h', SVG, 'Hạ Vy CSKH'], ['h', OXY, 'Hạ Vy CSKH'], ['a', SVG, 'Lan CSKH'], ['b', OXY, 'Mai CSKH'], ['g', SVG, 'Giang CSKH'], ['o', SVG, 'Ổn CSKH'], ['m', SVG, 'Minh CSKH'],
    ['s1', SVG, 'Sơn Sale'], ['s2', OXY, 'Sen Sale'], ['d2', SVG, 'Dung Sale'], ['d2', OXY, 'Dung Sale'], ['s3', SVG, 'Sáu Sale']])
    pu.run(`${pos}:${id}`, pos, id, name, '2026-11-01');
  // KPI tháng 11 (đồng). h có KPI theo POS 200 Siêu Vô Gạo / 150 Oxytetra. g ở 2 team, chưa bán bao giờ, chưa có KPI theo POS → cả KPI vào team đầu.
  // d2 ở 2 team Sale, chưa có KPI theo POS, tháng trước chỉ bán Oxytetra → KPI vào Sale Nấm. o, s3 không thuộc team nào → Ngoài team.
  const goals: Record<string, number> = { h: 420 * tr, a: 300 * tr, b: 280 * tr, g: 90 * tr, o: 120 * tr, s1: 500 * tr, s2: 400 * tr, d2: 210 * tr, s3: 100 * tr };
  const tg = raw.prepare("INSERT INTO targets (id,month,scope,ref_id,revenue,closed_orders,updated_by,updated_at) VALUES (?,'2026-11','employee',?,?,0,'web','2026-11-01')");
  for (const [id, v] of Object.entries(goals)) tg.run(`2026-11:employee:${id}`, id, v);
  raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run('target_emp_pos:2026-11', JSON.stringify({ h: { [SVG]: 240 * tr, [OXY]: 180 * tr } }), '2026-11-01');
  let n = 0;
  const order = (seller: string, pos: string, at: string, net: number) => raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,fetched_at,seller_id,first_closed_at,created_at,status_code,net_total) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(`o${++n}`, pos, pos, `s${n}`, '2026-11-14', seller, at, at, 3, net);
  const today = '2026-11-14T03:00:00', earlier = '2026-11-05T03:00:00', lastMonth = '2026-10-10T03:00:00';
  for (const [s, pos, at, v] of [
    ['h', SVG, today, 10], ['h', SVG, today, 2], ['h', OXY, today, 4], ['h', OXY, earlier, 30], ['h', SVG, earlier, 50],
    ['a', SVG, today, 7], ['a', SVG, earlier, 40], ['b', OXY, today, 9], ['b', OXY, earlier, 60], ['o', SVG, today, 3], ['m', SVG, earlier, 11],
    ['s1', SVG, today, 20], ['s2', OXY, today, 15], ['d2', SVG, today, 6], ['d2', OXY, today, 8], ['d2', OXY, lastMonth, 70], ['s3', SVG, today, 5],
    ['s1', SVG, lastMonth, 90], ['s2', OXY, lastMonth, 80],
  ] as const) order(s, pos, at, v * tr);
  const st = raw.prepare('INSERT INTO stats_daily (id,pos_id,day,updated_at,seller_id,orders,confirmed_orders) VALUES (?,?,?,?,?,?,?)');
  for (const [s, pos, base, closed] of [['h', SVG, 10, 5], ['h', OXY, 6, 3], ['a', SVG, 8, 4], ['b', OXY, 12, 6], ['o', SVG, 4, 1], ['s1', SVG, 30, 12], ['s2', OXY, 20, 9], ['d2', SVG, 5, 2], ['d2', OXY, 7, 3], ['s3', SVG, 3, 1]] as const)
    st.run(`${pos}:${s}`, pos, '2026-11-14', '2026-11-14', s, base, closed);
  return { raw, db };
}
const sum = (rows: TeamRow[], f: (t: TeamRow) => number) => rows.reduce((a, t) => a + f(t), 0);
const byName = (rows: TeamRow[]) => Object.fromEntries(rows.map((t) => [t.name, t]));

void test('ảnh sếp: cộng doanh thu, đơn, số lên, KPI các hàng team (cả Ngoài team) = ô to bộ phận; người 2 team tách theo POS', async () => {
  const { db } = world();
  const d = await bossReportData('2026-11-14', '17', false, Date.parse('2026-11-14T10:00:00Z'), db);
  for (const [dept, x] of [['Sale', d.sale], ['CSKH', d.cskh]] as const) {
    assert.equal(sum(x.teams, (t) => t.net), x.kpi.todayNet, `${dept}: doanh thu`);
    assert.equal(sum(x.teams, (t) => t.monthNet), x.kpi.monthNet, `${dept}: doanh thu tháng`);
    assert.equal(sum(x.teams, (t) => t.orders), x.people.reduce((a, p) => a + p.orders, 0), `${dept}: đơn`);
    assert.equal(sum(x.teams, (t) => t.base), x.base, `${dept}: số lên`);
    assert.equal(sum(x.teams, (t) => t.closed), x.closed, `${dept}: số chốt`);
    assert.equal(sum(x.teams, (t) => t.goal ?? 0), x.kpi.goal, `${dept}: KPI`);
  }
  assert.equal(d.cskh.orders, sum(d.cskh.teams, (t) => t.orders));
  const c = byName(d.cskh.teams);
  // CSKH - Hạ Vy chỉ lấy phần Siêu Vô Gạo của Hạ Vy; CSKH Nấm chỉ phần Oxytetra.
  assert.equal(c['CSKH - Hạ Vy'].net, (7 + 10 + 2) * tr);
  assert.equal(c['CSKH Nấm'].net, (9 + 4) * tr);
  assert.equal(c['CSKH - Hạ Vy'].orders, 3);
  assert.equal(c['CSKH Nấm'].base, 2, 'số lên = đơn tạo trong khoảng giờ (b + phần Oxytetra của Hạ Vy)');
  assert.equal(c['CSKH - Hạ Vy'].goal, (300 + 240 + 90) * tr, 'KPI Hạ Vy 240 Siêu Vô Gạo + Giang (chưa có tỉ lệ) cả 90 vào team đầu');
  assert.equal(c['CSKH Nấm'].goal, (280 + 180) * tr);
  assert.equal(c['Ngoài team'].goal, 120 * tr);
  assert.equal(c['CSKH Cũ'].monthNet, 11 * tr, 'team hôm nay chưa bán, chưa KPI vẫn có hàng để cộng đủ doanh thu tháng');
  assert.equal(d.cskh.kpi.goal, (420 + 300 + 280 + 90 + 120) * tr, 'KPI bộ phận không mất phần nào');
  const s = byName(d.sale.teams);
  assert.equal(s['Sale Lợn'].net, (20 + 6) * tr);
  assert.equal(s['Sale Nấm'].net, (15 + 8) * tr);
  assert.equal(s['Sale Nấm'].goal, (400 + 210) * tr, 'Dung chưa có KPI theo POS: theo doanh thu tháng trước (chỉ Oxytetra)');
  assert.equal(s['Sale Lợn'].goal, 500 * tr);
  assert.equal(d.sale.teams.at(-1)!.name, 'Ngoài team');
  assert.equal(s['Ngoài team'].net, 5 * tr);
});

void test('tách theo POS: chưa có tỉ lệ → cả KPI vào team đầu; có tỉ lệ → làm tròn cộng đúng bằng số gốc', () => {
  const teams = [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }];
  const teamPos = new Map<string, PosW>([['t1', { [SVG]: 100 }], ['t2', { [OXY]: 50 }]]);
  const none = buildSplit('x', teams, teamPos, [SVG, OXY], {});
  assert.deepEqual(none.share, { t1: 1, t2: 0 });
  assert.equal(none.source, 'team-dau');
  const s = buildSplit('x', teams, teamPos, [SVG, OXY], { empPos: { [SVG]: 1, [OXY]: 2 } });
  assert.deepEqual(s.owner, { [SVG]: 't1', [OXY]: 't2' });
  const parts = splitAmount(100_000_001, s.share);
  assert.equal(parts.t1 + parts.t2, 100_000_001);
  // POS chưa team nào bán (Bio Nano) → về team đầu, không mất.
  const bn = buildSplit('x', teams, teamPos, [SVG, OXY, 'bio-nano'], { prev: { 'bio-nano': 10, [OXY]: 10 } });
  assert.deepEqual(bn.share, { t1: 0.5, t2: 0.5 });
  assert.deepEqual(multiTeamMembers([{ id: 't1', name: 'A', dept: 'cskh', memberIds: ['u'] }, { id: 't2', name: 'B', dept: 'sale', memberIds: ['u'] }], 'cskh').size, 0, 'khác bộ phận không tính là 2 team');
});

void test('bot đặt KPI: người 2 team vẫn 1 dòng số tổng, ghi phần mỗi team theo tỉ lệ POS như ảnh sếp; lưu xong ảnh sếp tách đúng', async () => {
  const { raw, db } = world();
  const now = Date.parse('2026-11-14T02:00:00Z'), boss = { name: 'Anh Vũ', user_id: 'owner-1' };
  const preview = String(await bossKpiCommand(db, boss, 'chat', 'kpi doanh thu Hạ Vy 700', now));
  assert.match(preview, /\(1 dòng\)/);
  assert.match(preview, /• Hạ Vy CSKH: 420 triệu → 700 triệu\n {3}↳ chia theo POS: CSKH - Hạ Vy \(Siêu Vô Gạo\) 400 triệu · CSKH Nấm \(Oxytetra - Megatech\) 300 triệu/);
  assert.match(String(await bossKpiCommand(db, boss, 'chat', 'OK', now)), /^Đã lưu/);
  assert.equal((raw.prepare("SELECT revenue FROM targets WHERE id='2026-11:employee:h'").get() as { revenue: number }).revenue, 700 * tr);
  const d = await bossReportData('2026-11-14', '17', false, Date.parse('2026-11-14T10:00:00Z'), db);
  const c = byName(d.cskh.teams);
  assert.equal(c['CSKH - Hạ Vy'].goal, (300 + 400 + 90) * tr);
  assert.equal(c['CSKH Nấm'].goal, (280 + 300) * tr);
});
