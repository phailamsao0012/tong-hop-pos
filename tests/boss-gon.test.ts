import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { bossText, rateVsPrev, rateVsText, vsPrev, vsText, type BossData } from '../lib/zalo/boss-report';

// Báo cáo sếp rút gọn theo POS (mẫu đã chốt Ftq9ArdTQtozoTj5cVqp68 bản 10, anh Vũ 17/11/2026). Dữ liệu demo, số ảo.
const vn = (s: string) => Date.parse(`${s}+07:00`);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

void test('so hôm qua: hôm qua bằng 0 ghi "–"; TL chốt so hôm qua ghi bằng điểm %', () => {
  assert.equal(vsText(vsPrev(10e6, 0)), '–');
  assert.equal(vsText(vsPrev(10e6, null)), '–');
  assert.equal(vsText(vsPrev(10e6, 25e6)), '−15 tr');
  assert.equal(vsText(vsPrev(30e6, 25e6)), '+5 tr');
  assert.equal(rateVsText(rateVsPrev({ base: 200, closed: 67, prevBase: 100, prevClosed: 356 / 10 })), '−2,1%');
  assert.equal(rateVsText(rateVsPrev({ base: 200, closed: 67, prevBase: 0, prevClosed: 0 })), '–');
});

void test('báo cáo ca: cộng dòng POS bằng ô tổng; so hôm qua = báo cáo cùng giờ của hôm qua; vẽ lúc nào cũng ra cùng số', async () => {
  const { raw, db } = await demoWorld(['2026-10-15', '2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { bossReportData } = await import('../lib/zalo/boss-data');
  const at12 = await bossReportData('2026-10-16', '12', false, vn('2026-10-16T12:00:00'), db);
  const at15 = await bossReportData('2026-10-16', '12', false, vn('2026-10-16T15:00:00'), db);
  const later = await bossReportData('2026-10-16', '12', false, vn('2026-10-17T09:00:00'), db);
  const pick = (d: BossData) => ({ sale: d.sale.byPos, cskh: d.cskh.byPos, sp: d.sale.prevNet, cp: d.cskh.prevNet, mp: [d.mkt.prevNewNet, d.mkt.prevLeads], mt: d.mkt.teams.map((t) => [t.name, t.prevNewNet, t.prevLeads]) });
  assert.deepEqual(pick(at15), pick(at12), 'vẽ lúc 15h vẫn ra đúng số 12h');
  assert.deepEqual(pick(later), pick(at12), 'vẽ hôm sau vẫn ra đúng số');
  // Cộng các dòng POS đúng bằng ô tổng.
  const s = at12.sale.byPos!, c = at12.cskh.byPos!;
  assert.ok(s.length >= 2 && c.length >= 2, 'có từ 2 POS để cộng');
  assert.equal(sum(s.map((r) => r.net)), at12.sale.kpi.todayNet);
  assert.equal(sum(s.map((r) => r.prevNet)), at12.sale.prevNet);
  assert.equal(sum(s.map((r) => r.base)), at12.sale.base);
  assert.equal(sum(s.map((r) => r.closed)), at12.sale.closed);
  assert.equal(sum(s.map((r) => r.prevBase)), at12.sale.prevBase);
  assert.equal(sum(c.map((r) => r.net)), at12.cskh.kpi.todayNet);
  assert.equal(sum(c.map((r) => r.orders)), at12.cskh.orders);
  assert.equal(sum(c.map((r) => r.prevNet)), at12.cskh.prevNet);
  // "So hôm qua" đúng bằng số của báo cáo 12h hôm qua.
  const y = await bossReportData('2026-10-15', '12', false, vn('2026-10-15T12:00:00'), db);
  assert.equal(at12.sale.prevNet, y.sale.kpi.todayNet);
  assert.equal(at12.cskh.prevNet, y.cskh.kpi.todayNet);
  assert.equal(at12.mkt.prevNewNet, y.mkt.kpi.todayNet);
  assert.equal(at12.mkt.prevLeads, y.mkt.leads);
  assert.deepEqual([at12.sale.prevBase, at12.sale.prevClosed], [y.sale.base, y.sale.closed]);
  for (const r of s) {
    const yr = y.sale.byPos!.find((x) => x.name === r.name);
    assert.equal(r.prevNet, yr?.net ?? 0, `DT hôm qua ${r.name}`);
    assert.deepEqual([r.prevBase, r.prevClosed], [yr?.base ?? 0, yr?.closed ?? 0], `TL chốt hôm qua ${r.name}`);
  }
  for (const t of at12.mkt.teams) {
    const yt = y.mkt.teams.find((x) => x.name === t.name);
    assert.equal(t.prevNewNet, yt?.newNet ?? 0, `DT New hôm qua ${t.name}`);
    assert.equal(t.prevLeads, yt?.leads ?? 0, `số new hôm qua ${t.name}`);
  }
  // Tin chữ không còn KPI.
  assert.ok(!/KPI/.test(bossText(at12)));
});

void test('báo cáo tổng kết trọn ngày: so với trọn ngày trước', async () => {
  const { raw, db } = await demoWorld(['2026-10-15', '2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { bossReportData } = await import('../lib/zalo/boss-data');
  const full16 = await bossReportData('2026-10-17', '08', true, vn('2026-10-17T08:00:00'), db);
  const full15 = await bossReportData('2026-10-16', '08', true, vn('2026-10-16T08:00:00'), db);
  assert.equal(full16.day, '2026-10-16');
  assert.equal(full16.sale.prevNet, full15.sale.kpi.todayNet);
  assert.equal(full16.cskh.prevNet, full15.cskh.kpi.todayNet);
  assert.equal(full16.mkt.prevNewNet, full15.mkt.kpi.todayNet);
  assert.equal(sum(full16.sale.byPos!.map((r) => r.net)), full16.sale.kpi.todayNet);
});
