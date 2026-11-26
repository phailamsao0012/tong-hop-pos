import assert from 'node:assert/strict';
import { test } from 'node:test';
import { env } from 'cloudflare:workers';

// Tổng quan kiểu mới (cờ THP_UI_MOI, plan docs/plans/2026-11-26-tong-quan-kieu-moi): luật việc cần xem, câu tóm tắt, số khớp trang cũ. Số giả.
const base = { sale: { cancelRate: 2, returnRate: 3, closeRate: 45, closed: 100, assigned: 220 }, cancelStaff: [], lowRoas: [] };

void test('việc cần xem: chỉ hiện khi vượt mốc hủy 5%, hoàn 7%, TL chốt dưới 40%, ROAS dưới 1', async () => {
  const { needItems } = await import('../lib/shared/overview-moi-rules');
  assert.deepEqual(needItems(base), [], 'dưới mọi mốc: không có việc');
  const all = needItems({
    sale: { cancelRate: 5, returnRate: 7, closeRate: 39.9, closed: 100, assigned: 220 },
    cancelStaff: [{ name: 'NV901 - Người giả', rate: 9.8 }],
    lowRoas: [{ name: 'NV902 - Người giả', cost: 20_000_000, net: 16_000_000, roas: 0.8 }, { name: 'NV903 - Người giả', cost: 18_000_000, net: 15_000_000, roas: 0.83 }],
  });
  assert.deepEqual(all.map((n) => n.key), ['cancel', 'return', 'close', 'roas'], 'đúng mốc là vượt, xếp theo mức ảnh hưởng');
  assert.match(all[0].title, /5,0%/);
  assert.match(all[0].detail, /1 người bán/);
  assert.equal(all[3].title, '2 marketer ROAS dưới 1');
  assert.equal(all[3].detail, 'chi 38,0tr, DT chốt 31,0tr');
  assert.ok(all.every((n) => n.view), 'mỗi việc mở được một trang');
  // Chưa có số (null) hoặc chưa có số chia: không báo; không có quyền xem chi phí (null): không báo ROAS.
  assert.deepEqual(needItems({ ...base, sale: { cancelRate: null, returnRate: null, closeRate: 10, closed: 0, assigned: 0 }, lowRoas: null }), []);
});

void test('câu tóm tắt: so kỳ trước và đếm việc cần xem', async () => {
  const { briefSentence } = await import('../lib/shared/overview-moi-rules');
  assert.equal(briefSentence({ net: 109.4, prevNet: 100, needs: 2, closed: 10 }), 'Doanh thu chốt tăng 9,4% so với kỳ trước. Có 2 việc cần anh xem.');
  assert.equal(briefSentence({ net: 90, prevNet: 100, needs: 0, closed: 10 }), 'Doanh thu chốt giảm 10,0% so với kỳ trước. Chưa có việc nào vượt mốc.');
  assert.equal(briefSentence({ net: 100, prevNet: 100, needs: 1, closed: 10 }), 'Doanh thu chốt ngang kỳ trước. Có 1 việc cần anh xem.');
  assert.equal(briefSentence({ net: 0, prevNet: null, needs: 0, closed: 0 }), 'Chưa có đơn chốt trong kỳ. Chưa có việc nào vượt mốc.');
});

void test('API Tổng quan mới: cờ tắt trả 404; cờ bật số doanh thu chốt khớp Tổng quan POS cùng bộ lọc', async () => {
  const { demoWorld } = await import('./support/d1-sqlite');
  const { loginAs } = await import('./support/session');
  const { POS } = await import('../lib/shared/report-model');
  const { raw } = await demoWorld(['2026-10-15', '2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  await loginAs(raw, 'owner');
  const { GET } = await import('../app/api/reports/overview-moi/route');
  const q = new URLSearchParams({ start: '2026-10-15', end: '2026-10-16', posIds: POS.map((p) => p.id).join(','), team: 'all' });
  const call = () => GET(new Request(`http://local/api/reports/overview-moi?${q}`));
  const before = env.THP_UI_MOI;
  try {
    delete env.THP_UI_MOI;
    assert.equal((await call()).status, 404, 'web thật không đặt cờ: không có trang này');
    env.THP_UI_MOI = '1';
    const res = await call();
    assert.equal(res.status, 200);
    const body = await res.json() as { revenue: { closedNet: number; closedOrders: number }; sale: { assigned: number; closedFromAssigned: number }; hours: unknown[]; heat: { cells: number[] }[]; needs: unknown[] };
    const { overviewReport } = await import('../lib/reports/overview-report');
    const old = await overviewReport({ posIds: POS.map((p) => p.id), start: '2026-10-15', end: '2026-10-16', team: 'all' });
    assert.equal(body.revenue.closedNet, old.current.total.closedNet, 'doanh thu chốt = Tổng quan POS');
    assert.equal(body.revenue.closedOrders, old.current.total.closedOrders, 'đơn chốt = Tổng quan POS');
    assert.ok(body.sale.closedFromAssigned <= body.sale.assigned);
    assert.equal(body.hours.length, 15);
    assert.equal(body.heat.length, 7);
    assert.ok(body.heat.every((w) => w.cells.length === 8));
  } finally {
    if (before === undefined) delete env.THP_UI_MOI; else env.THP_UI_MOI = before;
  }
});
