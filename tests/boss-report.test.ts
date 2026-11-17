import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bossPace, closeRate, coach, money, signed, warnings, withOutside, type BossData } from '../lib/zalo/boss-report';
import { MSG_BREAK, parseAmount, parseKpiCommand, parseUnitValue, splitMessages, unitText } from '../lib/zalo/kpi-bot';

// Báo cáo tổng quan cho sếp (anh Vũ 14/11/2026) và lệnh đặt KPI qua Zalo.
const base: BossData = {
  day: '2026-11-14', until: '17h', title: '17h thứ Bảy 14/11', range: 'số từ 0h tới 17h',
  company: { net: 580e6, orders: 742, yesterday: 546e6 },
  sale: { kpi: { goal: 14.1e9, monthNet: 5.62e9, todayNet: 412e6 }, base: 900, closed: 425, prevBase: 800, prevClosed: 360, packed: 1000, returned: 31, cancelled: 54,
    teams: [{ name: 'Sale Heo HN', net: 43e6, orders: 58, base: 158, closed: 58, monthNet: 1e9, goal: 3e9 }],
    people: [{ name: 'Trường Sơn', team: 'Sale Nấm', net: 5e6, orders: 8, base: 26, closed: 8 }, { name: 'Ít số', team: 'Sale Nấm', net: 0, orders: 0, base: 5, closed: 0 }],
    byPos: [{ name: 'Siêu Vô Gạo', net: 43e6, prevNet: 50e6, orders: 58, base: 158, closed: 58, prevBase: 150, prevClosed: 60 }, { name: 'MEGAROOT', net: 9e6, prevNet: 0, orders: 9, base: 12, closed: 3, prevBase: 0, prevClosed: 0 }] },
  cskh: { kpi: { goal: null, monthNet: 2.31e9, todayNet: 168e6 }, orders: 201, prevOrders: 0, base: 300, closed: 174, prevBase: 0, prevClosed: 0, teams: [], people: [] },
  mkt: { kpi: { goal: null, monthNet: 4.1e9, todayNet: 311e6 }, leads: 1084, monthLeads: 15400, leadsGoal: null, cost: 96e6,
    teams: [{ name: 'MKT Đông Phong', cost: 18e6, newNet: 0, leads: 210, closed: 9, leadsGoal: null, monthLeads: 2000 }], people: [] },
  pos: [{ name: 'Bio Nano', net: 30e6, orders: 40, yesterday: 50e6 }],
  ship: { packed: 689, closed: 742, vtp: 352, spx: 281 },
  overdueTasks: 3,
};

void test('tiền và số có dấu', () => {
  assert.equal(money(412e6), '412 tr');
  assert.equal(money(1.24e9), '1,24 tỷ');
  assert.equal(signed(-58e6), '−58 tr');
  assert.equal(signed(18e6), '+18 tr');
});

void test('tỉ lệ chốt = đơn lên đã chốt ÷ đơn lên, không quá 100%', () => {
  assert.equal(closeRate({ base: 200, closed: 100 }), 50);
  assert.equal(closeRate({ base: 10, closed: 30 }), 100);
  assert.equal(closeRate({ base: 0, closed: 0 }), null);
});

void test('cần kèm: chỉ người có từ 20 số và dưới 40%', () => {
  const c = coach(base.sale.people);
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'Trường Sơn');
});

void test('người ngoài team gom 1 hàng "Ngoài team"', () => {
  const rows = withOutside([{ name: 'A' }], { name: 'x' });
  assert.deepEqual(rows.map((r) => r.name), ['A', 'Ngoài team']);
  assert.deepEqual(withOutside([{ name: 'A' }], null).map((r) => r.name), ['A']);
});

void test('cảnh báo: POS chốt thấp (không theo team), không còn dòng KPI, người chốt thấp, hủy vượt 5%, MKT chi không ra đơn, POS giảm, việc quá hạn', () => {
  const w = warnings(base);
  // Mẫu rút gọn 17/11/2026: cảnh báo tỉ lệ chốt theo POS; POS dưới 20 số không cảnh báo; không còn dòng KPI.
  assert.ok(w.some((x) => x.startsWith('Sale Siêu Vô Gạo: tỉ lệ chốt 36,7%')));
  assert.ok(!w.some((x) => x.includes('MEGAROOT')), 'POS dưới 20 số không cảnh báo');
  assert.ok(!w.some((x) => x.includes('Sale Heo HN')), 'không còn cảnh báo theo team');
  assert.ok(!w.some((x) => /KPI/.test(x)), 'không còn dòng KPI');
  assert.ok(w.some((x) => x.includes('Trường Sơn')));
  assert.ok(w.some((x) => x.includes('tỉ lệ hủy 5,4%')));
  assert.ok(!w.some((x) => x.includes('tỉ lệ hoàn')), 'hoàn 3,1% chưa tới 7%');
  assert.ok(w.some((x) => x.startsWith('MKT Đông Phong: chi 18 tr')));
  assert.ok(w.some((x) => x.startsWith('Bio Nano: doanh thu giảm 40%')));
  assert.ok(w.some((x) => x.startsWith('3 việc quá hạn')));
  assert.ok(w.length <= 8);
});

void test('đọc số tiền / số đếm', () => {
  assert.equal(parseAmount('1,2 tỷ', true), 1.2e9);
  assert.equal(parseAmount('300tr', true), 300e6);
  assert.equal(parseAmount('350 triệu', true), 350e6);
  assert.equal(parseAmount('1.500.000', true), 1.5e6);
  assert.equal(parseAmount('50', false), 50);
  assert.equal(parseAmount('5tr', false), null, 'số đếm không có đơn vị tiền');
});

void test('lệnh KPI số: mặc định theo ngày, mỗi marketer', () => {
  assert.deepEqual(parseKpiCommand('kpi số mkt 50'), { cmd: 'set', metric: 'leads', target: { kind: 'dept', dept: 'mkt' }, value: 50, per: 'day' });
  assert.deepEqual(parseKpiCommand('KPI số toàn team mkt là 50 số 1 người'), { cmd: 'set', metric: 'leads', target: { kind: 'dept', dept: 'mkt' }, value: 50, per: 'day' });
  assert.deepEqual(parseKpiCommand('kpi so bo phan mkt 1200'), { cmd: 'set', metric: 'leads', target: { kind: 'dept-mkt' }, value: 1200, per: 'day' });
  assert.deepEqual(parseKpiCommand('kpi số team MKT Một 60'), { cmd: 'set', metric: 'leads', target: { kind: 'team', name: 'MKT Một', each: true }, value: 60, per: 'day' });
  assert.deepEqual(parseKpiCommand('kpi số cả team MKT Một 1.800 tháng'), { cmd: 'set', metric: 'leads', target: { kind: 'team', name: 'MKT Một', each: false }, value: 1800, per: 'month' });
  assert.deepEqual(parseKpiCommand('kpi số Cẩm Tú 70'), { cmd: 'set', metric: 'leads', target: { kind: 'person', name: 'Cẩm Tú' }, value: 70, per: 'day' });
});

void test('lệnh KPI doanh thu: mặc định theo tháng', () => {
  assert.deepEqual(parseKpiCommand('kpi doanh thu Kim Ngân 350tr'), { cmd: 'set', metric: 'revenue', target: { kind: 'person', name: 'Kim Ngân' }, value: 350e6, per: 'month' });
  assert.deepEqual(parseKpiCommand('kpi doanh thu cả team Sale Nấm 1,2 tỷ'), { cmd: 'set', metric: 'revenue', target: { kind: 'team', name: 'Sale Nấm', each: false }, value: 1.2e9, per: 'month' });
});

void test('Sale / CSKH: doanh thu, tỉ lệ chốt, TB đơn (anh Vũ 14/11/2026)', () => {
  assert.deepEqual(parseKpiCommand('kpi doanh thu sale 300tr'), { cmd: 'set', metric: 'revenue', target: { kind: 'dept', dept: 'sale' }, value: 300e6, per: 'month' });
  assert.deepEqual(parseKpiCommand('kpi doanh thu cskh 12tr ngày'), { cmd: 'set', metric: 'revenue', target: { kind: 'dept', dept: 'cskh' }, value: 12e6, per: 'day' });
  assert.deepEqual(parseKpiCommand('kpi tỉ lệ chốt sale 45'), { cmd: 'set', metric: 'rate', target: { kind: 'dept', dept: 'sale' }, value: 45, per: 'month' });
  assert.deepEqual(parseKpiCommand('KPI TL chốt Kim Ngân 52,5%'), { cmd: 'set', metric: 'rate', target: { kind: 'person', name: 'Kim Ngân' }, value: 52.5, per: 'month' });
  assert.deepEqual(parseKpiCommand('kpi aov cả team Sale Nấm 850k'), { cmd: 'set', metric: 'aov', target: { kind: 'team', name: 'Sale Nấm', each: false }, value: 850000, per: 'month' });
  assert.deepEqual(parseKpiCommand('kpi tb đơn cskh 900k'), { cmd: 'set', metric: 'aov', target: { kind: 'dept', dept: 'cskh' }, value: 900000, per: 'month' });
  assert.equal(parseKpiCommand('kpi tỉ lệ chốt sale 150'), null, 'tỉ lệ quá 100%');
});

void test('đơn vị cố định: doanh thu triệu, TB đơn nghìn, tỉ lệ %, số đưa về số (anh Vũ 14/11/2026)', () => {
  assert.deepEqual(parseUnitValue('300', 'revenue'), { value: 300e6, per: 'month' });
  assert.deepEqual(parseUnitValue('12 ngày', 'revenue'), { value: 12e6, per: 'day' });
  assert.deepEqual(parseUnitValue('1,2 tỷ', 'revenue'), { value: 1.2e9, per: 'month' });
  assert.deepEqual(parseUnitValue('850', 'aov'), { value: 850000, per: 'month' });
  assert.deepEqual(parseUnitValue('45', 'rate'), { value: 45, per: 'month' });
  assert.deepEqual(parseUnitValue('52,5%', 'rate'), { value: 52.5, per: 'month' });
  assert.deepEqual(parseUnitValue('50 ngày', 'leads'), { value: 50, per: 'day' });
  assert.equal(parseUnitValue('120', 'rate'), null);
  assert.deepEqual(parseKpiCommand('kpi doanh thu sale 300'), { cmd: 'set', metric: 'revenue', target: { kind: 'dept', dept: 'sale' }, value: 300e6, per: 'month' });
  assert.equal(unitText('revenue', 300e6), '300 triệu');
  assert.equal(unitText('aov', 850000), '850 nghìn');
});

void test('xác nhận, huỷ, xem; tin thường không phải lệnh KPI', () => {
  assert.deepEqual(parseKpiCommand('OK'), { cmd: 'confirm' });
  assert.deepEqual(parseKpiCommand('hủy'), { cmd: 'cancel' });
  assert.deepEqual(parseKpiCommand('xem kpi số'), { cmd: 'view', metric: 'leads' });
  assert.equal(parseKpiCommand('việc của tôi'), null);
  assert.deepEqual(parseKpiCommand('kpi số mkt'), { cmd: 'view', metric: 'leads' }, 'thiếu số thì là xem');
  assert.equal(parseKpiCommand('kpi số Cẩm Tú'), null);
});

void test('tiến độ tháng: báo cáo 8h phải đạt tính tới HẾT hôm qua; báo cáo ca như web (Đầu não 14/11/2026)', () => {
  // KPI 300 triệu tháng 11 (30 ngày) → 10 triệu/ngày.
  const mid = bossPace(300e6, { day: '2026-11-13', until: null }, 130e6, 10e6)!;
  assert.equal(mid.mustByYesterday, 130e6, 'báo cáo 8h ngày 14: phải đạt 13 ngày KPI');
  assert.equal(mid.diff, 0);
  const first = bossPace(300e6, { day: '2026-11-01', until: null }, 12e6, 12e6)!;
  assert.equal(first.mustByYesterday, 10e6, 'báo cáo 8h ngày 2: phải đạt 1 ngày');
  assert.equal(first.diff, 2e6);
  const last = bossPace(300e6, { day: '2026-11-30', until: null }, 290e6, 5e6)!;
  assert.equal(last.mustByYesterday, 300e6, 'báo cáo 8h ngày 1/12 (số ngày 30/11): phải đạt cả tháng');
  assert.equal(last.diff, -10e6);
  const slot = bossPace(300e6, { day: '2026-11-14', until: '12h' }, 135e6, 5e6)!;
  assert.equal(slot.mustByYesterday, 130e6, 'báo cáo 12h ngày 14: phải đạt tới hết hôm qua (13 ngày), đã đạt gồm hôm nay');
  assert.equal(slot.diff, 5e6);
  assert.equal(bossPace(null, { day: '2026-11-14', until: null }, 1, 1), null);
});

void test('bản xem trước không cắt "… và N dòng khác": tách nhiều tin ≤ 1.800 ký tự, đủ mọi dòng (Đầu não 14/11/2026)', () => {
  const lines = Array.from({ length: 120 }, (_, i) => `• Nhân viên số ${i + 1}: 200 triệu → 300 triệu`);
  const parts = splitMessages(['Sẽ đặt KPI…', ...lines, 'Nhắn OK để lưu']).split(MSG_BREAK);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 1800));
  for (let i = 1; i <= 120; i++) assert.ok(parts.some((p) => p.includes(`Nhân viên số ${i}:`)), `thiếu dòng ${i}`);
  assert.ok(parts.slice(1).every((p) => p.startsWith('(tiếp)')));
});


void test('KPI ghi bằng tiền (anh Vũ 15/11/2026): KPI ngày 10 tr, tới 8h đạt 1 tr → thiếu 9 tr; các ngày trước nợ / dư ghi −/+', async () => {
  const { kpiGap, gapWord } = await import('../lib/zalo/boss-report');
  // Tháng 11 có 30 ngày, KPI 300 tr → 10 tr/ngày. Ngày 15: 14 ngày trước phải đạt 140 tr, đã đạt 120 tr → nợ 20 tr.
  const g = kpiGap(300e6, '2026-11-15', 121e6, 1e6)!;
  assert.equal(g.daily, 10e6);
  assert.equal(gapWord(g.today), '−9 tr');
  assert.equal(Math.round(g.before), -20e6);
  assert.equal(Math.round(g.month), -29e6, 'từ đầu tháng tới giờ = nợ 20 tr các ngày trước + thiếu 9 tr hôm nay');
  assert.equal(gapWord(kpiGap(300e6, '2026-11-01', 12e6, 12e6)!.today), '+2 tr');
  assert.equal(kpiGap(300e6, '2026-11-01', 12e6, 12e6)!.before, 0, 'ngày 1 không có ngày trước');
  assert.equal(gapWord(100_000), '+100k');
  assert.equal(gapWord(0.3), '0');
  assert.equal(kpiGap(null, '2026-11-15', 0, 0), null);
});
