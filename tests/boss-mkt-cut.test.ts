import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { POS } from '../lib/shared/report-model';

// Số MKT báo cáo sếp (anh Vũ 16/11/2026): cắt đúng khoảng giờ; loại tài khoản bộ phận Sàn; chú thích khi cộng team lớn hơn tổng.
const vn = (s: string) => Date.parse(`${s}+07:00`);

void test('báo cáo "0h tới 8h" chạy lúc 10h vẫn ra số như lúc 8h; DT MKT không vượt DT Sale cùng khoảng', async () => {
  const { raw, db } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { bossReportData } = await import('../lib/zalo/boss-data');
  const at8 = await bossReportData('2026-10-16', '08', false, vn('2026-10-16T08:00:00'), db);
  const at10 = await bossReportData('2026-10-16', '08', false, vn('2026-10-16T10:00:00'), db);
  const pick = (d: typeof at8) => ({ leads: d.mkt.leads, mktNet: d.mkt.kpi.todayNet, sale: d.sale.kpi.todayNet, cskh: d.cskh.kpi.todayNet, company: d.company.net, teams: d.mkt.teams.map((t) => [t.name, t.leads, t.closed, t.newNet]),
    // TL chốt Sale cả bộ phận và từng team (đơn lên + đã chốt trước giờ cắt), hôm qua để so; đơn đi & vận đơn.
    saleRate: [d.sale.base, d.sale.closed, d.sale.prevBase, d.sale.prevClosed], saleTeams: d.sale.teams.map((t) => [t.name, t.base, t.closed]), cskhRate: [d.cskh.base, d.cskh.closed],
    ship: [d.ship.packed, d.ship.vtp, d.ship.spx, JSON.stringify(d.ship.others ?? [])] });
  assert.deepEqual(pick(at10), pick(at8), 'chạy lúc 10h vẫn cắt đúng 8h');
  const full = await bossReportData('2026-10-16', '22', false, vn('2026-10-16T22:00:00'), db);
  assert.ok(full.mkt.leads > at8.mkt.leads, 'cả ngày nhiều số về hơn 0h–8h (cắt giờ có tác dụng)');
  assert.ok(full.sale.base > at8.sale.base, 'số lên Sale cả ngày nhiều hơn 0h–8h (TL chốt cắt giờ có tác dụng)');
  assert.ok(at8.sale.teams.some((t) => t.base > 0), 'có team Sale có số lên trong 0h–8h để so');
  // Ngày đã đóng không trôi: đơn bị huỷ về sau vẫn tính đã chốt (chốt lần đầu trước giờ cắt).
  raw.prepare("UPDATE raw_pos_orders SET status_code=6 WHERE id IN (SELECT id FROM raw_pos_orders WHERE first_closed_at IS NOT NULL AND created_at>='2026-10-15T17:00:00' AND created_at<'2026-10-16T01:00:00' LIMIT 3)").run();
  const later = await bossReportData('2026-10-16', '08', false, vn('2026-10-17T15:00:00'), db);
  assert.deepEqual([later.sale.base, later.sale.closed], [at8.sale.base, at8.sale.closed], 'đơn đổi trạng thái về sau không làm trôi TL chốt ngày đã qua');
  for (const d of [at8, full]) assert.ok(d.mkt.kpi.todayNet <= d.sale.kpi.todayNet, `DT MKT (${d.mkt.kpi.todayNet}) không vượt DT Sale (${d.sale.kpi.todayNet}) cùng khoảng`);
});

void test('tài khoản bộ phận Sàn luôn bị loại khỏi mọi số Marketing (web và báo cáo sếp)', async () => {
  const { raw, db } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { mktAnalytics } = await import('../lib/reports/mkt-analytics');
  const { marketingOverview } = await import('../lib/reports/marketing-overview');
  const posIds = POS.map((p) => p.id);
  // Marketer có nhiều số về nhất trong ngày.
  const top = raw.prepare("SELECT marketer_id m, COUNT(DISTINCT phone) n FROM raw_pos_orders WHERE NULLIF(TRIM(marketer_id),'') IS NOT NULL AND created_at>='2026-10-15T17:00:00' AND created_at<'2026-10-16T17:00:00' GROUP BY 1 ORDER BY 2 DESC LIMIT 1").get() as { m: string; n: number };
  const before = await mktAnalytics({ posIds, start: '2026-10-16', end: '2026-10-16', db });
  const p = () => new URLSearchParams({ basis: 'confirmed', stage: 'confirmed', team: 'all', until: '2026-10-16T16:59:59' });
  const webBefore = await marketingOverview({ role: 'owner' }, p(), posIds, '2026-10-16', '2026-10-16', null);
  const had = before.people.find((x) => x.id === top.m);
  assert.ok(had && had.phones > 0, 'marketer này có số về trước khi đổi');
  raw.prepare("UPDATE pos_users SET name='Hưng Sàn' WHERE user_id=?").run(top.m);
  const after = await mktAnalytics({ posIds, start: '2026-10-16', end: '2026-10-16', db });
  const webAfter = await marketingOverview({ role: 'owner' }, new URLSearchParams({ basis: 'confirmed', stage: 'confirmed', team: 'all', until: '2026-10-16T16:59:58' }), posIds, '2026-10-16', '2026-10-16', null);
  assert.equal(after.people.find((x) => x.id === top.m), undefined, 'tài khoản Sàn không còn trong số MKT');
  assert.equal(after.current.phones, before.current.phones - had.phones, 'số về bỏ đúng phần của tài khoản Sàn');
  assert.ok(!webAfter!.byMarketer.some((x) => x.marketerId === top.m), 'trang Marketing cũng bỏ');
  assert.ok(webBefore!.summary.createdNewPhones >= webAfter!.summary.createdNewPhones);
});

void test('cộng số về các team lớn hơn tổng thì có chú thích nhỏ dưới bảng', async () => {
  const { mktLeadsNote } = await import('../app/zalo-boss-image');
  const team = (leads: number) => ({ name: 't', cost: 0, newNet: 0, leads, closed: 0, leadsGoal: null, monthLeads: 0 });
  assert.equal(mktLeadsNote({ mkt: { leads: 10, teams: [team(4), team(6)] } as never }), null);
  assert.match(mktLeadsNote({ mkt: { leads: 10, teams: [team(5), team(7)] } as never })!, /Cộng các team 12 số, lớn hơn tổng 10 số về/);
});

void test('luật Sàn: khớp nguyên từ "Sàn" như hậu tố, không bắt "Sàng"', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { SAN_ACCOUNTS } = await import('../lib/teams/team');
  const { raw } = emptyDb();
  const names: [string, boolean][] = [['Hưng Sàn', true], ['Lan SÀN HN', true], ['Hoa sàn', true], ['Minh-Sàn', true], ['Thu Sàn', true],
    ['Sàng Lọc MKT', false], ['Trần Sàng', false], ['Hưng (Sàn)', false], ['Đông Phong MKT', false], ['Sanh Sale', false]];
  const ins = raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)');
  names.forEach(([n], i) => ins.run(`p:${i}`, 'p', `u${i}`, n, 'x'));
  const hit = new Set((raw.prepare(`SELECT user_id FROM pos_users WHERE user_id IN ${SAN_ACCOUNTS}`).all() as { user_id: string }[]).map((x) => x.user_id));
  assert.deepEqual(names.map(([n], i) => [n, hit.has(`u${i}`)]), names);
});

void test('số MKT 19/11: người chỉ mang hậu tố SALE / CSKH đứng ô Marketer không tính vào Marketing', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { MKT_STAFF, notSan } = await import('../lib/teams/team');
  const { raw } = emptyDb();
  // [tên ở POS 1, tên ở POS 2 (nếu có), có trong MKT_STAFF]
  const people: [string, string | null, boolean][] = [
    ['NV901 - Trần Văn An MKT', null, true], ['NV902 - Lê Thị Bình CSKH', null, false], ['Đỗ Chi SALE', null, false],
    ['NV903 - Hoàng Dũng LEADER MKT', null, true], ['Phạm Em CSKH', 'Phạm Em MKT', true], ['Vũ Giang SALE PART', null, false],
  ];
  const ins = raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)');
  people.forEach(([a, b], i) => { ins.run(`p1:${i}`, 'p1', `u${i}`, a, 'x'); if (b) ins.run(`p2:${i}`, 'p2', `u${i}`, b, 'x'); });
  const inMkt = new Set((raw.prepare(`SELECT user_id FROM pos_users WHERE user_id IN ${MKT_STAFF}`).all() as { user_id: string }[]).map((x) => x.user_id));
  assert.deepEqual(people.map(([a], i) => [a, inMkt.has(`u${i}`)]), people.map(([a, , ok]) => [a, ok]));
  // notSan cũng loại người chỉ Sale / CSKH và chi phí ghi theo tên sheet chưa ghép ("sheet:<tên>"); đơn chưa có marketer giữ nguyên.
  const kept = (raw.prepare(`SELECT v FROM (SELECT 'u1' AS v UNION SELECT 'u0' UNION SELECT '' UNION SELECT 'sheet:NAMX') t WHERE 1=1${notSan('t.v')} ORDER BY v`).all() as { v: string }[]).map((x) => x.v);
  assert.deepEqual(kept, ['', 'u0']);
});
