// B10 (cải tổ): test cho các file lib/ chưa có test nào import trực tiếp — phần logic thuần (không đọc D1, không gọi mạng).
// Chỉ ghi lại hành vi hiện có, không đổi code lib.
import test from 'node:test';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { cn } from '../lib/shared/utils';
import { POS_ICONS, posIcon } from '../lib/shared/pos-icons';
import { METRIC_ICONS } from '../lib/shared/metric-icons';
import { POS } from '../lib/shared/report-model';
import { addBlock, addPart, emptyRefBlock, emptyRefPart } from '../lib/pancake/pancake-ref-types';
import { annotateRates, rateFraction, rateLabel } from '../lib/reports/overview-rates';
import { DEFAULT_METRICS } from '../lib/reports/metrics';
import { AUDIT_ACTIONS, AUDIT_GROUPS, auditLabel } from '../lib/ops/audit-labels';
import { STATUS_NAMES, STATUS_PRESETS, describeStatus, parseStatus, statusSql } from '../lib/pancake/order-status';
import { sheetCostScript } from '../lib/ops/sheet-cost-script';
import { CHART_KINDS, parseChartArgs } from '../lib/bot/bot-charts';
import { NO_STORE, satResponse } from '../lib/ops/sat-proxy';
import { demoData } from '../lib/shared/demo-data';

void test('utils: cn gộp lớp Tailwind, lớp sau thắng lớp trước', () => {
  assert.equal(cn('px-2 text-sm', false, null, 'px-4'), 'text-sm px-4');
  assert.equal(cn(['rounded', { hidden: false, block: true }]), 'rounded block');
});

void test('pos-icons: đủ 6 POS, đúng mã POS, màu hex, nét vẽ không rỗng', () => {
  assert.deepEqual(POS_ICONS.map((p) => p.id), POS.map((p) => p.id));
  for (const p of POS_ICONS) {
    assert.match(p.color, /^#[0-9a-f]{6}$/);
    assert.ok(p.short && p.meaning && p.paths.length > 0, p.id);
    for (const d of p.paths) assert.match(d, /^[Mm]/, `${p.id}: nét phải bắt đầu bằng M`);
  }
  assert.equal(posIcon('mgt-apex')?.short, 'APEX');
  assert.equal(posIcon('khong-co'), undefined);
});

void test('metric-icons: mã không trùng, có nhãn tiếng Việt, nét bắt đầu bằng M', () => {
  const ids = METRIC_ICONS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('closed') && ids.includes('revenue'));
  for (const m of METRIC_ICONS) {
    assert.ok(m.label.trim(), m.id);
    for (const d of m.paths) assert.match(d, /^[Mm]/, m.id);
  }
});

void test('pancake-ref-types: cộng khối và phần, lợi nhuận thiếu một bên thì là null', () => {
  const a = { orders: 2, sales: 300, revenue: 250, profit: 50, quantity: 3 };
  assert.deepEqual(addBlock(a, { orders: 1, sales: 100, revenue: 90, profit: 10, quantity: 1 }), { orders: 3, sales: 400, revenue: 340, profit: 60, quantity: 4 });
  assert.equal(addBlock(a, { ...emptyRefBlock(), profit: null }).profit, null);
  const p = emptyRefPart(), q = emptyRefPart();
  p.total = a; p.returned = { orders: 1, revenue: 20, quantity: 1 };
  q.split = false; q.hasReturned = true;
  const sum = addPart(p, q);
  assert.deepEqual(sum.total, { ...a, profit: 50 });
  assert.deepEqual(sum.returned, { orders: 1, revenue: 20, quantity: 1 });
  // Chưa ghi split / hasReturned thì coi như có; một bên không tách thì cả tổng không tách.
  assert.equal(sum.split, false);
  assert.equal(sum.hasReturned, true);
  // Mỗi lần gọi là một bản mới (sửa bản này không ảnh hưởng bản khác).
  assert.notEqual(emptyRefPart().total, emptyRefPart().total);
});

type M = Parameters<typeof rateFraction>[0];
const metrics = (x: Partial<M>) => ({ orders: 30, closedOrders: 12, createdClosedOrders: 12, assignedOrders: 20, assignedClosedOrders: 9, groups: {}, ...x }) as M;

void test('overview-rates: nhãn và phân số tỷ lệ chốt theo mẫu số đang chọn', () => {
  assert.equal(rateLabel(DEFAULT_METRICS), 'Tỷ lệ chốt (÷ đơn lên)');
  assert.equal(rateLabel({ ...DEFAULT_METRICS, rateBase: 'assigned' }), 'Tỷ lệ chốt (÷ data chia)');
  assert.equal(rateFraction(metrics({}), DEFAULT_METRICS, String), '12 đã chốt / 30 tạo');
  assert.equal(rateFraction(metrics({}), { ...DEFAULT_METRICS, rateBase: 'assigned' }, String), '9 đã chốt / 20 chia');
});

void test('overview-rates: annotateRates điền tỷ lệ cho tổng và từng dòng, ẩn tử/mẫu khi số chia bị che', () => {
  const total = metrics({ groups: { returned: { orders: 3 }, shipping: { orders: 5 }, delivered: { orders: 12 }, cancelled: { orders: 6 } } as M['groups'] });
  const row = metrics({ orders: 10, closedOrders: 5, createdClosedOrders: 5 });
  const report = { current: { total, byPos: [row], byEmployee: [], byEmployeePos: [], series: [] }, compare: null } as unknown as Parameters<typeof annotateRates>[0];
  const out = annotateRates(report, DEFAULT_METRICS);
  assert.equal(out.metricSettings, DEFAULT_METRICS);
  assert.equal(total.rate, 40);
  assert.equal(row.rate, 50);
  assert.equal(total.returnRatio, 3 / 20 * 100);
  assert.equal(total.cancelRatio, 20);
  const hidden = metrics({ assignedHidden: true } as Partial<M>);
  annotateRates({ current: { total: hidden, byPos: [], byEmployee: [], byEmployeePos: [], series: [] }, compare: null } as unknown as Parameters<typeof annotateRates>[0], { ...DEFAULT_METRICS, rateBase: 'assigned' });
  assert.deepEqual([hidden.rate, hidden.rateTop, hidden.rateDen], [null, null, null]);
});

void test('audit-labels: tên hiển thị, mã lạ giữ nguyên, nhóm lọc không sót không trùng', () => {
  assert.equal(auditLabel('login'), 'Đăng nhập');
  assert.equal(auditLabel('khong.co'), 'khong.co');
  const seen = new Set<string>();
  for (const g of AUDIT_GROUPS) for (const a of g.actions) {
    assert.ok(Object.hasOwn(AUDIT_ACTIONS, a), `${g.id}: ${a} chưa có tên`);
    assert.ok(!seen.has(a), `${a} nằm ở hai nhóm`);
    seen.add(a);
  }
  assert.equal(new Set(AUDIT_GROUPS.map((g) => g.id)).size, AUDIT_GROUPS.length);
});

void test('order-status: mốc có sẵn, mã tự chọn, giá trị sai về mặc định', () => {
  const def = parseStatus(null);
  assert.equal(def.value, 'closed');
  assert.equal(def.isDefault, true);
  assert.ok(def.codes.includes(17) && !def.codes.includes(0) && !def.codes.includes(6) && !def.codes.includes(7));
  assert.equal(parseStatus('confirmed').codes.includes(17), false);
  // Mã tự chọn trùng một mốc thì nhận ra mốc đó.
  assert.equal(parseStatus('c:16,3').value, 'delivered');
  const custom = parseStatus('c:1,0,999');
  assert.equal(custom.value, 'c:0,1');
  assert.equal(custom.label, `${STATUS_NAMES[0]}, ${STATUS_NAMES[1]}`);
  assert.equal(custom.hasUnconfirmed, true);
  assert.equal(parseStatus('c:999').value, 'closed');
  assert.equal(parseStatus('linh-tinh', 'created').value, 'created');
  assert.deepEqual(describeStatus([5, 3, 16, 2]).short, '4 trạng thái');
  assert.equal(statusSql(describeStatus([])), 'status_code IN (-1)');
  assert.equal(statusSql(parseStatus('delivered'), 'o.status_code'), 'o.status_code IN (3,16)');
  for (const [k, p] of Object.entries(STATUS_PRESETS)) assert.equal(describeStatus([...p.codes]).value, k);
});

void test('sheet-cost-script: điền địa chỉ và mã nối, mọi hàm có tiền tố thp, là JavaScript hợp lệ', () => {
  const s = sheetCostScript('https://web.example/api/sheet-costs', 'MA-NOI-AO');
  assert.ok(s.includes("diaChi: 'https://web.example/api/sheet-costs'"));
  assert.ok(s.includes("ma: 'MA-NOI-AO'"));
  assert.ok(s.includes('(https://web.example)'), 'dòng giới thiệu ghi gốc web, bỏ phần /api');
  const fns = [...s.matchAll(/function (\w+)\s*\(/g)].map((m) => m[1]);
  assert.deepEqual(fns, ['thpCaiDat', 'thpKhiSua', 'thpGuiChiPhi']);
  // Chỉ biên dịch để kiểm cú pháp, không chạy.
  assert.doesNotThrow(() => new Script(s));
});

void test('bot-charts: đọc loại biểu đồ (bỏ dấu), kỳ và POS; mặc định doanh thu', () => {
  const noPos = (tokens: string[]) => ({ posIds: [], rest: tokens });
  assert.equal(parseChartArgs([], noPos).kind, 'doanhthu');
  assert.equal(parseChartArgs(['Trạng-thái'], noPos).kind, 'trangthai');
  assert.equal(parseChartArgs(['TOP'], noPos).kind, 'top');
  const r = parseChartArgs(['donchot', 'apex'], (tokens) => ({ posIds: tokens.includes('apex') ? ['mgt-apex'] : [], rest: tokens.filter((t) => t !== 'apex') }));
  assert.deepEqual([r.kind, r.posIds], ['donchot', ['mgt-apex']]);
  assert.ok(r.period.start <= r.period.end);
  assert.ok(Object.keys(CHART_KINDS).every((k) => /^[a-z]+$/.test(k)));
});

void test('sat-proxy: satResponse giữ mã, thân JSON và không cho lưu đệm', async () => {
  const res = satResponse({ status: 404, body: { error: 'Không có' } }, { 'X-Test': '1' });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('Cache-Control'), NO_STORE['Cache-Control']);
  assert.equal(res.headers.get('X-Test'), '1');
  assert.deepEqual(await res.json(), { error: 'Không có' });
});

void test('demo-data: dữ liệu mẫu đúng POS, mã không trùng, có một lần chia lặp để thử gộp theo SĐT', () => {
  const pos = new Set<string>(POS.map((p) => p.id));
  assert.equal(demoData.mode, 'demo');
  assert.ok(demoData.orders.length > 0 && demoData.assignments.length > 1);
  for (const o of demoData.orders) assert.ok(pos.has(o.posId), o.id);
  const ids = demoData.assignments.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  const repeat = demoData.assignments.find((a) => a.id === 'A-REPEAT')!;
  assert.equal(repeat.phone, demoData.assignments[0].phone);
  assert.equal(repeat.posId, demoData.assignments[0].posId);
});
