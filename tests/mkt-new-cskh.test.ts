import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoWorld } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { POS } from '../lib/shared/report-model';
import { teamSubquery } from '../lib/teams/team';

// Bảng Xếp hạng marketer tách New / CSKH (anh Vũ 14/11/2026, ý sếp: "số đơn không được gộp, doanh thu cũng phải tách new và cskh").
type Row = { marketerId?: string; everConfirmed: number; newConfirmed: number; cskhConfirmed: number; newPacked: number; everPacked: number; newCancelled: number; newReturned: number; createdNewPhones: number; createdPhones: number };
type Report = { byMarketer: Row[]; byTeam: Row[]; summary: { createdNewPhones: number; createdPhones: number }; afterPackSummary: Omit<Row, 'createdNewPhones' | 'createdPhones'> };

void test('xếp hạng marketer: Đơn New / Đơn CSKH tách theo người bán, tổng khớp; tỉ lệ chỉ tính đơn New', async () => {
  const { raw } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { GET } = await import('../app/api/reports/marketing/route');
  const params = new URLSearchParams({ start: '2026-10-16', end: '2026-10-16', posIds: POS[0].id, basis: 'confirmed', stage: 'confirmed', team: 'all' });
  const r = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as Report;
  assert.ok(r.byMarketer.length);
  const sum = (rows: Row[], k: keyof Row) => rows.reduce((a, x) => a + Number(x[k]), 0);
  for (const k of ['newConfirmed', 'cskhConfirmed', 'newPacked', 'newCancelled', 'newReturned'] as const) {
    assert.equal(sum(r.byMarketer, k), r.afterPackSummary[k], `${k}: cộng marketer = tổng`);
  }
  for (const x of [...r.byMarketer, ...r.byTeam, r.afterPackSummary]) {
    assert.ok(x.newConfirmed + x.cskhConfirmed <= x.everConfirmed, 'New + CSKH không vượt đơn chốt gộp');
    assert.ok(x.newPacked <= x.newConfirmed && x.newPacked <= x.everPacked);
  }
  // Đối chiếu SQL trực tiếp: đơn chốt New = đơn xác nhận lần đầu trong ngày, người bán thuộc Sale.
  const sale = teamSubquery('sale')!, cskh = teamSubquery('cskh')!;
  const q = (seller: string) => (raw.prepare(`SELECT COUNT(*) n FROM raw_pos_orders o WHERE o.pos_id=? AND o.first_confirmed_at>='2026-10-15T17:00:00' AND o.first_confirmed_at<'2026-10-16T17:00:00'
    AND o.first_confirmed_at IS NOT NULL AND o.status_code NOT IN (0,17,7) AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND o.seller_id IN ${seller}`).get(POS[0].id) as { n: number }).n;
  const direct = { n: q(sale), c: q(cskh) };
  assert.ok(direct.n > 0 && direct.c > 0, 'demo có cả đơn New lẫn CSKH');
  assert.ok(r.afterPackSummary.newConfirmed <= direct.n && r.afterPackSummary.cskhConfirmed <= direct.c);
  assert.ok(r.afterPackSummary.cskhConfirmed > 0, 'có đơn CSKH tách riêng');
  assert.ok(r.summary.createdNewPhones <= r.summary.createdPhones);
});

void test('xếp hạng marketer: by=net xếp theo doanh thu (DT New) rồi số đơn', async () => {
  const { rankByStage } = await import('../lib/reports/mkt-rank');
  const row = (rankName: string, orders: number, net: number) => ({ rankName, atConfirmed: orders, atPacked: 0, atShipped: 0, atDelivered: 0,
    stageMetrics: { confirmed: { orders, net }, packed: { orders: 0, net: 0 }, shipped: { orders: 0, net: 0 }, delivered: { orders: 0, net: 0 } } });
  const rows = [row('A', 10, 5e6), row('B', 3, 9e6), row('C', 3, 5e6)];
  assert.deepEqual(rankByStage(rows, 'confirmed', 'net').map((r) => r.rankName), ['B', 'A', 'C']);
  assert.deepEqual(rankByStage(rows, 'confirmed').map((r) => r.rankName), ['A', 'B', 'C']);
});

void test('báo cáo sếp: số về, đơn New, TL chốt Marketing lấy đúng số trang Marketing trên web (anh Vũ 16/11/2026)', async () => {
  const { raw, db } = await demoWorld(['2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { GET } = await import('../app/api/reports/marketing/route');
  const { bossReportData } = await import('../lib/zalo/boss-data');
  const params = new URLSearchParams({ start: '2026-10-16', end: '2026-10-16', posIds: POS.map((p) => p.id).join(','), basis: 'created', stage: 'confirmed', team: 'all' });
  type Web = { summary: { createdNewPhones: number }; byTeam: { marketingTeamName: string; createdNewPhones: number; newConfirmed: number }[] };
  const web = await (await GET(new Request(`http://local/api/reports/marketing?${params}`))).json() as Web;
  const d = await bossReportData('2026-10-17', '08', true, Date.parse('2026-10-17T01:00:00Z'), db);
  assert.equal(d.day, '2026-10-16');
  assert.equal(d.mkt.leads, web.summary.createdNewPhones, 'số đưa về = SĐT chia Sale trên trang Marketing');
  assert.ok(d.mkt.leads > 0);
  let matched = 0;
  for (const t of d.mkt.teams) {
    const w = web.byTeam.find((x) => (x.marketingTeamName === t.name) || (t.name === 'Ngoài team' && x.marketingTeamName === 'Chưa phân nhóm'));
    if (!w) continue;
    matched++;
    assert.equal(t.leads, w.createdNewPhones, `${t.name}: số về`);
    assert.equal(t.closed, w.newConfirmed, `${t.name}: đơn New (TL chốt = đơn New ÷ số về, không lẫn CSKH)`);
  }
  assert.ok(matched > 0, 'có team để so');
});
