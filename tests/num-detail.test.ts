import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Rê chuột vào số ra chi tiết (đợt 1: Marketing, Chi phí & ROAS). Số giả, tên giả.
const rows = [
  { marketerId: 'mk-1', cost: 12_000_000, net: 30_000_000, closed: 40, orders: 90, phones: 80, newNet: 24_000_000, newOrders: 30, cskhNet: 5_000_000, cskhOrders: 8, otherNet: 1_000_000 },
  { marketerId: 'mk-2', cost: 0, net: 9_000_000, closed: 10, orders: 30, phones: 25, newNet: 9_000_000, newOrders: 10, cskhNet: 0, cskhOrders: 0, otherNet: 0 },
  { marketerId: 'mk-3', cost: 7_500_000, net: 4_000_000, closed: 6, orders: 40, phones: 33, newNet: 3_000_000, newOrders: 5, cskhNet: 1_000_000, cskhOrders: 1, otherNet: 0 },
];

void test('khung chi tiết MKT: các dòng cộng / chia ra đúng số đang hiện, ở từng dòng và dòng tổng', async () => {
  const { mktTotal } = await import('../lib/ops/ad-costs');
  const { mktCellDetail, detailAddsUp } = await import('../lib/shared/num-detail');
  const cells = ['cost', 'net', 'newNet', 'cskhNet', 'roas', 'closed', 'phones', 'rate', 'cpc', 'cpl', 'share'] as const;
  const lines = [...rows.map((r) => ({ ...r, ...mktTotal([r as never]) })), { ...mktTotal(rows as never[]) }];
  for (const m of lines) for (const cell of cells) {
    const spec = mktCellDetail(cell, m as never, { name: 'Marketer giả', scope: '01/11–21/11 · mọi POS', prevNet: 1_000_000 });
    assert.ok(spec.title && spec.scope?.includes('Marketer giả'), `${cell}: có tên và phạm vi`);
    assert.ok(detailAddsUp(spec), `${cell}: số trong khung khớp số đang hiện (${JSON.stringify(spec.parts)})`);
    const strong = spec.parts.find((p) => p.strong);
    assert.ok(strong, `${cell}: có dòng kết quả`);
  }
  // Doanh thu: New + CSKH + Khác = Doanh thu; ROAS = DT chốt người có chi phí ÷ chi phí (không tính người chưa có chi phí).
  const t = mktTotal(rows as never[]);
  const net = mktCellDetail('net', t as never, { name: 'Tổng', scope: 'x' });
  assert.equal(net.parts.find((p) => p.strong)!.value, 43_000_000);
  const roas = mktCellDetail('roas', t as never, { name: 'Tổng', scope: 'x' });
  assert.deepEqual(roas.parts.map((p) => p.value), [27_000_000, 19_500_000, 27_000_000 / 19_500_000]);
  // So kỳ trước có ở ô doanh thu.
  assert.equal(mktCellDetail('net', t as never, { name: 'Tổng', scope: 'x', prevNet: 30_000_000 }).prev?.value, 30_000_000);
});

void test('khung chi tiết: phát hiện được khi số trong khung không khớp', async () => {
  const { detailAddsUp } = await import('../lib/shared/num-detail');
  assert.equal(detailAddsUp({ title: 'x', op: 'sum', parts: [{ label: 'a', value: 1, kind: 'money' }, { label: 'b', value: 2, kind: 'money' }, { label: 'c', value: 4, kind: 'money', strong: true }] }), false);
  assert.equal(detailAddsUp({ title: 'x', op: 'div', parts: [{ label: 'a', value: 10, kind: 'count' }, { label: 'b', value: 40, kind: 'count' }, { label: 'r', value: 25, kind: 'pct', strong: true }] }), true);
});

// Bài dò: ô số nào trong các bảng đợt 1 chưa có khung chi tiết. Ô được để lại có lý do ghi rõ; thêm ô số mới mà quên khung thì bài này báo.
const LEFT_ON_PURPOSE: Record<string, string[]> = {
  'app/mkt-roas-view.tsx': [
    'newOrders', // Đơn New / Đơn CSKH: đã bấm được mở danh sách đơn ở trang Marketing
    'closeRate', // Chốt số = đơn tạo đã chốt ÷ đơn tạo, chưa có khung riêng (đợt sau)
    'returnRate', // Hoàn, chưa có khung riêng (đợt sau)
    'tfoot', // dòng Tổng
  ],
  'app/mkt-headline.tsx': [],
};
void test('đợt 1: liệt kê ô số chưa có khung chi tiết', () => {
  const report: string[] = [];
  for (const [file, allowed] of Object.entries(LEFT_ON_PURPOSE)) {
    const src = readFileSync(file, 'utf8');
    const body = file.endsWith('mkt-headline.tsx') ? src.slice(src.indexOf('function BreakdownTable'), src.indexOf('function SplitStrip')) : src.slice(src.indexOf('<tbody>{rows.map((x) =>'), src.indexOf('</tbody>', src.indexOf('<tbody>{rows.map((x) =>')));
    const cells = body.split('<td').slice(1).filter((c) => /className=\{?[`"]n\b/.test(c));
    for (const c of cells) {
      const cell = c.slice(0, c.indexOf('</td>') >= 0 ? c.indexOf('</td>') : 200);
      if (cell.includes('NumDetail')) continue;
      const key = /newOrders|closed\b/.test(cell) ? 'newOrders' : /closeRate/.test(cell) ? 'closeRate' : /returnRate/.test(cell) ? 'returnRate' : cell.slice(0, 60);
      if (!allowed.includes(key)) report.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(report, [], `Ô số chưa có khung chi tiết:\n${report.join('\n')}`);
});
