// KPI team (Giao việc → KPI team, anh Vũ 28/10/2026): KPI doanh thu, TB đơn, tỉ lệ chốt cho cả team, lưu chung một chỗ với trang KPI và
// tiến độ ở Tổng quan. Kiểm quy KPI tháng về kỳ, cộng số thật của team, và TB đơn lưu ở app_settings target_aov không bị trang cũ xoá.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { mergeTargetAov, withTargetAov, type TargetRow } from '../lib/kpi/targets';
import {
  dayCount, elapsedShare, matchQuick, monthsBetween, percentOf, periodLabel, periodTarget, quickPeriod, teamActual, validPeriod, type QuickPeriod,
} from '../lib/kpi/team-kpi';
import { GET, PUT } from '../app/api/targets/route';

void test('kỳ bấm nhanh theo hôm nay (giờ VN), tuần bắt đầu thứ Hai', () => {
  const today = '2026-11-05'; // thứ Năm
  const expect: Record<QuickPeriod, [string, string]> = {
    today: ['2026-11-05', '2026-11-05'], week: ['2026-11-02', '2026-11-08'], month: ['2026-11-01', '2026-11-30'],
    'last-month': ['2026-10-01', '2026-10-31'], 'next-month': ['2026-12-01', '2026-12-31'], quarter: ['2026-10-01', '2026-12-31'],
  };
  for (const [kind, [start, end]] of Object.entries(expect) as [QuickPeriod, [string, string]][]) {
    assert.deepEqual(quickPeriod(kind, today), { start, end }, kind);
    assert.equal(matchQuick({ start, end }, today), kind);
  }
  assert.deepEqual(quickPeriod('week', '2026-11-08'), { start: '2026-11-02', end: '2026-11-08' }, 'Chủ nhật vẫn thuộc tuần bắt đầu thứ Hai trước đó');
  assert.deepEqual(quickPeriod('last-month', '2026-01-15'), { start: '2025-12-01', end: '2025-12-31' });
  assert.deepEqual(quickPeriod('quarter', '2026-02-28'), { start: '2026-01-01', end: '2026-03-31' });
  assert.deepEqual(quickPeriod('next-month', '2026-01-31'), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(matchQuick({ start: '2026-11-03', end: '2026-11-20' }, today), null);
});

void test('kỳ chọn tay: kiểm ngày, đếm ngày, các tháng đi qua, nhãn kỳ', () => {
  assert.equal(validPeriod({ start: '2026-11-01', end: '2026-11-30' }), true);
  assert.equal(validPeriod({ start: '2026-11-30', end: '2026-11-01' }), false);
  assert.equal(validPeriod({ start: '2026-02-30', end: '2026-03-01' }), false, 'ngày không có thật');
  assert.equal(validPeriod({ start: '2026-01-01', end: '2027-01-01' }), true);
  assert.equal(validPeriod({ start: '2026-01-01', end: '2027-01-02' }), false, 'quá 366 ngày');
  assert.equal(dayCount('2026-10-30', '2026-11-02'), 4);
  assert.deepEqual(monthsBetween('2026-10-15', '2027-01-02'), ['2026-10', '2026-11', '2026-12', '2027-01']);
  assert.equal(periodLabel({ start: '2026-11-01', end: '2026-11-30' }), 'Tháng 11/2026');
  assert.equal(periodLabel({ start: '2026-11-05', end: '2026-11-05' }), '05/11/2026');
  assert.equal(periodLabel({ start: '2026-11-02', end: '2026-11-08' }), '02/11 – 08/11/2026');
  assert.equal(periodLabel({ start: '2026-12-29', end: '2027-01-04' }), '29/12/2026 – 04/01/2027');
});

void test('KPI kỳ: doanh thu chia theo ngày của tháng, TB đơn và tỉ lệ chốt trung bình theo ngày; thiếu tháng thì để trống', () => {
  const nov = { revenue: 300_000_000, aov: 500_000, closeRate: 40 }, oct = { revenue: 310_000_000, aov: 400_000, closeRate: 30 };
  assert.deepEqual(periodTarget({ '2026-11': nov }, { start: '2026-11-01', end: '2026-11-30' }), { revenue: 300_000_000, aov: 500_000, closeRate: 40 });
  assert.deepEqual(periodTarget({ '2026-11': nov }, { start: '2026-11-02', end: '2026-11-08' }), { revenue: 70_000_000, aov: 500_000, closeRate: 40 });
  // 30–31/10 (2/31 KPI tháng 10) + 01–02/11 (2/30 KPI tháng 11).
  const cross = periodTarget({ '2026-10': oct, '2026-11': nov }, { start: '2026-10-30', end: '2026-11-02' });
  assert.equal(Math.round(cross.revenue!), 40_000_000);
  assert.equal(cross.aov, 450_000);
  assert.equal(cross.closeRate, 35);
  // Tháng 12 chưa đặt: mọi chỉ số của kỳ để trống, không đoán.
  assert.deepEqual(periodTarget({ '2026-11': nov }, { start: '2026-11-15', end: '2026-12-15' }), { revenue: null, aov: null, closeRate: null });
  // Có doanh thu, chưa có TB đơn / tỉ lệ chốt.
  assert.deepEqual(periodTarget({ '2026-11': { revenue: 300_000_000 } }, { start: '2026-11-01', end: '2026-11-15' }), { revenue: 150_000_000, aov: null, closeRate: null });
});

void test('số thật của team: cộng người trong team, TB đơn = doanh thu chốt ÷ đơn chốt, tỉ lệ chốt gộp tử và mẫu', () => {
  const rows = [
    { sellerId: 'a', closedNet: 6_000_000, closedOrders: 12, orders: 30, createdClosedOrders: 12 },
    { sellerId: 'b', closedNet: 4_000_000, closedOrders: 8, orders: 10, createdClosedOrders: 8 },
    { sellerId: 'x', closedNet: 99_000_000, closedOrders: 99, orders: 99, createdClosedOrders: 99 },
  ];
  assert.deepEqual(teamActual(rows, ['a', 'b', 'nghi-viec'], 'created'), { revenue: 10_000_000, orders: 20, aov: 500_000, closeRate: 50, people: 2 });
  assert.deepEqual(teamActual(rows, ['nghi-viec'], 'created'), { revenue: 0, orders: 0, aov: null, closeRate: null, people: 0 });
  assert.equal(elapsedShare({ start: '2026-11-01', end: '2026-11-30' }, '2026-11-05'), 5 / 30);
  assert.equal(elapsedShare({ start: '2026-12-01', end: '2026-12-31' }, '2026-11-05'), 0);
  assert.equal(elapsedShare({ start: '2026-10-01', end: '2026-10-31' }, '2026-11-05'), 1);
  assert.equal(percentOf(50, 200), 25);
  assert.equal(percentOf(50, null), null);
  assert.equal(percentOf(null, 200), null);
});

void test('TB đơn KPI: chỉ thay khi dòng có trường aov; chỉ cho team; gắn vào dòng team', () => {
  const stored = { 'team:a': 400_000 };
  assert.deepEqual(mergeTargetAov(stored, [{ scope: 'team', refId: 'a' }], ['team:a']), stored, 'trang cũ không gửi aov: giữ nguyên');
  assert.deepEqual(mergeTargetAov(stored, [{ scope: 'team', refId: 'b', aov: 450_000.4 }], null), { 'team:a': 400_000, 'team:b': 450_000 });
  assert.deepEqual(mergeTargetAov(stored, [{ scope: 'team', refId: 'a', aov: null }], ['team:a']), {});
  assert.deepEqual(mergeTargetAov(stored, [{ scope: 'team', refId: 'a', aov: 0 }], null), {});
  assert.deepEqual(mergeTargetAov(stored, [{ scope: 'team', refId: 'a', aov: 1 }], ['team:b']), stored, 'ngoài phạm vi only');
  assert.deepEqual(mergeTargetAov(stored, [{ scope: 'employee', refId: 'a', aov: 1 }], null), stored);
  const rows: TargetRow[] = [
    { scope: 'team', refId: 'a', revenue: 1, closedOrders: 0, workingDays: null, updatedAt: 'x' },
    { scope: 'pos', refId: 'p', revenue: 2, closedOrders: 0, workingDays: null, updatedAt: 'x' },
  ];
  const out = withTargetAov(rows, { 'team:a': 400_000, 'team:c': 500_000 }, 'y');
  assert.equal(out[0].aov, 400_000);
  assert.equal('aov' in out[1], false, 'dòng POS không có TB đơn');
  assert.deepEqual(out[2], { scope: 'team', refId: 'c', revenue: 0, closedOrders: 0, workingDays: null, updatedAt: 'y', closeRate: null, aov: 500_000 });
});

void test('API KPI: chủ lưu TB đơn team; trang KPI cũ lưu doanh thu không làm mất TB đơn; người khác không thấy KPI team', async () => {
  const { raw } = emptyDb();
  const put = (month: string, items: unknown[], only?: string[]) => PUT(new Request('http://local/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, items, ...(only ? { only } : {}) }) }));
  type Item = { scope: string; refId: string; revenue: number; closeRate?: number | null; aov?: number | null; costCeiling?: number | null };
  const get = async (month: string) => (await (await GET(new Request(`http://local/api/targets?month=${month}`))).json() as { items: Item[] }).items;
  const team = (items: Item[], id: string) => items.find((i) => i.scope === 'team' && i.refId === id);
  const settingKeys = () => (raw.prepare("SELECT key FROM app_settings WHERE key LIKE 'target_%' ORDER BY key").all() as { key: string }[]).map((r) => r.key);
  try {
    await loginAs(raw, 'owner');
    // Trang KPI team mới: doanh thu + TB đơn + tỉ lệ chốt, giữ chi phí trần đã có.
    assert.equal((await put('2026-11', [{ scope: 'team', refId: 'team-a', revenue: 300_000_000, closedOrders: 0, costCeiling: 5_000_000, closeRate: 35, aov: 450_000 }], ['team:team-a'])).status, 200);
    let items = await get('2026-11');
    assert.deepEqual([team(items, 'team-a')?.revenue, team(items, 'team-a')?.aov, team(items, 'team-a')?.closeRate, team(items, 'team-a')?.costCeiling], [300_000_000, 450_000, 35, 5_000_000]);
    // Trang KPI → Theo team (chưa biết TB đơn) lưu lại doanh thu: TB đơn giữ nguyên.
    assert.equal((await put('2026-11', [{ scope: 'team', refId: 'team-a', revenue: 320_000_000, closedOrders: 0, closeRate: 35 }], ['team:team-a'])).status, 200);
    items = await get('2026-11');
    assert.equal(team(items, 'team-a')?.revenue, 320_000_000);
    assert.equal(team(items, 'team-a')?.aov, 450_000);
    // Trang Mục tiêu lưu cả tháng (không có only) bằng đúng các dòng vừa đọc: vẫn giữ TB đơn.
    assert.equal((await put('2026-11', items)).status, 200);
    assert.equal(team(await get('2026-11'), 'team-a')?.aov, 450_000);
    // Bỏ KPI TB đơn: gửi aov null.
    assert.equal((await put('2026-11', [{ scope: 'team', refId: 'team-a', revenue: 320_000_000, closeRate: 35, aov: null }], ['team:team-a'])).status, 200);
    assert.equal(team(await get('2026-11'), 'team-a')?.aov ?? null, null);
    // Tháng chưa từng có TB đơn: lưu KPI khác không tạo khoá target_aov rỗng.
    assert.equal((await put('2026-12', [{ scope: 'employee', refId: 'staff-a', revenue: 10 }], ['employee:staff-a'])).status, 200);
    assert.deepEqual(settingKeys().filter((k) => k.endsWith('2026-12')), ['target_cost:2026-12', 'target_rate:2026-12']);
    // TB đơn chỉ cho cả team, không âm.
    assert.equal((await put('2026-11', [{ scope: 'employee', refId: 'staff-a', revenue: 1, aov: 100 }], ['employee:staff-a'])).status, 400);
    assert.equal((await put('2026-11', [{ scope: 'team', refId: 'team-a', revenue: 1, aov: -1 }], ['team:team-a'])).status, 400);
    // Người không phải chủ: không thấy dòng team (quyền xem giữ như cũ), không ghi được KPI team.
    assert.equal((await put('2026-11', [{ scope: 'team', refId: 'team-a', revenue: 320_000_000, aov: 500_000 }], ['team:team-a'])).status, 200);
    logout(); await loginAs(raw, 'lead');
    assert.equal(team(await get('2026-11'), 'team-a'), undefined);
    assert.equal((await put('2026-11', [{ scope: 'team', refId: 'team-a', revenue: 1, aov: 1 }], ['team:team-a'])).status, 403);
  } finally { logout(); raw.close(); }
});

void test('API KPI: leader thấy KPI team mình cầm (chỉ xem), không thấy team khác; nhân viên không thấy team nào', async () => {
  const { raw } = emptyDb();
  const put = (items: unknown[], only: string[]) => PUT(new Request('http://local/api/targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-11', items, only }) }));
  type Body = { items: { scope: string; refId: string; revenue: number; aov?: number | null }[]; teams: string[] | null };
  const get = async () => (await (await GET(new Request('http://local/api/targets?month=2026-11'))).json()) as Body;
  try {
    await loginAs(raw, 'owner');
    assert.equal((await put([{ scope: 'team', refId: 'team-a', revenue: 300_000_000, aov: 450_000 }, { scope: 'team', refId: 'team-b', revenue: 200_000_000 }], ['team:team-a', 'team:team-b'])).status, 200);
    assert.equal((await get()).teams ?? null, null, 'chủ: mọi team');
    logout();
    const lead = await loginAs(raw, 'lead', { team: 'sale' });
    raw.prepare("INSERT INTO hr_employees (id,code,full_name,status,main_user_id) VALUES ('e-lead','L1','Leader ảo','dang_lam',?)").run(lead);
    raw.prepare("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,department_id,leader_employee_id,status) VALUES ('p1','e1','Nhân viên ảo 1','sale','team-a','e-lead','dang_lam'), ('p2','e2','Nhân viên ảo 2','sale','team-b','e-khac','dang_lam')").run();
    const body = await get();
    assert.deepEqual(body.teams, ['team-a']);
    assert.deepEqual(body.items.filter((i) => i.scope === 'team').map((i) => [i.refId, i.revenue, i.aov]), [['team-a', 300_000_000, 450_000]]);
    assert.equal((await put([{ scope: 'team', refId: 'team-a', revenue: 1 }], ['team:team-a'])).status, 403, 'leader không đặt KPI team');
    logout(); await loginAs(raw, 'staff');
    const staff = await get();
    assert.deepEqual(staff.teams, []);
    assert.equal(staff.items.some((i) => i.scope === 'team'), false);
  } finally { logout(); raw.close(); }
});
