import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffGap, bucketBars, reasonBars, advisorLeadsQuery, advisorReasonQuery, advisorReport, careCapacity, classifyReason, reasonKeywords, reasonSummary, saleCapacity } from '../lib/bot/advisor';
import { emptyDb, demoWorld } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { scopeApi } from '../lib/auth/access';
import { POS } from '../lib/shared/report-model';

void test('advisor: từ khóa bỏ dấu, chữ hoa, ranh giới từ và cấu hình hỏng', () => {
  assert.equal(classifyReason('GIÁ CAO quá'), 'Giá cao');
  assert.equal(classifyReason('Khách chưa cần'), 'Không có nhu cầu');
  assert.equal(classifyReason('database'), 'Khác');
  assert.equal(classifyReason('KHÔNG ĐẶT'), 'Sai số / không đặt');
  assert.equal(classifyReason('hẹn lại tuần sau'), 'Để suy nghĩ / hẹn lại');
  assert.equal(classifyReason('chưa có tiền'), 'Chưa có tiền');
  assert.equal(classifyReason('đã mua nơi khác'), 'Đã mua chỗ khác');
  assert.equal(classifyReason('thuê bao'), 'Không nghe máy / thuê bao');
  assert.equal(classifyReason('chất lượng hàng'), 'Hàng / hiệu quả');
  assert.equal(classifyReason('khác'), 'Khác');
  assert.equal(classifyReason('chưa cần', reasonKeywords('{')), 'Không có nhu cầu');
  assert.equal(classifyReason('thử lại', reasonKeywords('{"Hẹn":["thu lai"]}')), 'Hẹn');
});
void test('advisor: sức chứa Sale chọn khoảng có đủ mẫu; không tuyển khi thiếu số', () => {
  const rows = [...Array.from({ length: 10 }, () => ({ assigned: 20, closed: 10 })), ...Array.from({ length: 10 }, () => ({ assigned: 35, closed: 7 }))];
  const result = saleCapacity(rows, 3, 100);
  assert.equal(result.need, 5); assert.equal(result.best, '1–20');
  assert.equal(result.load, 100 / 3);
  assert.equal(saleCapacity(rows.slice(0, 2), 3, 100).need, null);
  assert.equal(saleCapacity(rows, 0, 100).need, null);
  assert.equal(saleCapacity(rows, 3, null).need, null);
  assert.equal(saleCapacity([{ assigned: 20, closed: 21 }], 1, 10).buckets[0].days, 0);
  assert.equal(saleCapacity(Array.from({ length: 20 }, () => ({ assigned: 60, closed: 40 })), 3, 100).need, null);
});
void test('advisor: CSKH chỉ đề nghị thêm khi tồn đọng tăng đủ ba tuần liên tiếp', () => {
  assert.equal(careCapacity(2, 100, 280, 14, [10, 20, 30, 40]).hire, 8);
  assert.equal(careCapacity(2, 100, 280, 14, [10, 20, 15, 40]).hire, null);
  assert.equal(careCapacity(2, null, 280, 14, []).hire, null);
  assert.equal(careCapacity(0, 100, 0, 14, [10, 20, 30, 40]).hire, null);
});
void test('advisor: độ phủ đếm theo đơn, so công ty cần >=10 và >=1.5 lần', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i), staff: 'nv_a', team: 'team_a', messages: i < 10 ? 'giá cao' : '' }));
  const baseline = [...rows, ...Array.from({ length: 80 }, (_, i) => ({ id: `b${i}`, staff: 'nv_b', team: 'team_b', messages: '' }))];
  const result = reasonSummary([...rows, rows[0]], undefined, baseline);
  assert.equal(result.total, 20); assert.equal(result.classified, 10); assert.equal(result.coverage, .5);
  assert.equal(result.groups.find((g) => g.reason === 'Giá cao')?.outliers.length, 2);
  assert.equal(reasonSummary(rows).groups[0].outliers.length, 0);
  assert.equal(reasonSummary([]).coverage, null);
  assert.ok(!JSON.stringify(result).includes('messages'));
});
void test('advisor: query lý do dùng chỉ mục đóng hàng trên D1 giả local', () => {
  const { raw } = emptyDb();
  try {
    const q = advisorReasonQuery(['p'], '2026-10-01', '2026-10-16', '');
    const plans = raw.prepare('EXPLAIN QUERY PLAN ' + q.sql).all(...q.binds);
    assert.ok(plans.some((r) => String(r.detail).includes('idx_raw_orders_pos_closed_status_money')));
    console.log('ADVISOR EXPLAIN', JSON.stringify(plans));
    const leads = advisorLeadsQuery(['p'], '2026-10-01', '2026-10-16', '');
    const leadPlans = raw.prepare('EXPLAIN QUERY PLAN ' + leads.sql).all(...leads.binds);
    assert.ok(leadPlans.some((r) => String(r.detail).includes('idx_raw_orders_pos_created_status_phone')));
    console.log('ADVISOR LEADS EXPLAIN', JSON.stringify(leadPlans));
  } finally { raw.close(); }
});
void test('advisor: Mentor bị chặn; người không có trang bị chặn', () => {
  for (const role of ['mentor', 'staff'] as const) assert.ok(scopeApi({ role, views: [], posIds: null, team: 'all' }, 'GET', new URL('http://local/api/reports/advisor')).blocked);
});
void test('advisor: demo dùng bản sao local, không trả note thô; API kiểm ngày và bộ phận', async () => {
  const { db, raw } = await demoWorld(['2026-10-15', '2026-10-16'], Date.parse('2026-10-17T03:00:00Z'));
  try {
    const report = await advisorReport(db, { start: '2026-10-15', end: '2026-10-16', posIds: [POS[0].id], team: 'all', unit: null }, ['sale', 'cskh', 'vandon']);
    assert.ok(report.items.length >= 6);
    assert.ok(report.reasons);
    assert.ok(report.viz.sale);
    assert.ok(report.viz.cskh);
    assert.equal(report.viz.mkt, null);
    const marketing = await advisorReport(db, { start: '2026-10-15', end: '2026-10-16', posIds: [POS[0].id], team: 'all', unit: null, preset: 'custom' }, ['mkt']);
    assert.equal(marketing.items.length, 2);
    assert.equal(marketing.reasons, null);
    assert.equal(marketing.viz.sale, null);
    assert.equal(marketing.viz.cskh, null);
    assert.ok(marketing.viz.mkt);
    assert.ok(!marketing.items[0].value.includes('NaN'));
    assert.ok(!JSON.stringify(report).includes('messages'));
    await loginAs(raw, 'owner');
    const { GET } = await import('../app/api/reports/advisor/route');
    const path = 'http://local/api/reports/advisor?';
    assert.equal((await GET(new Request(path + 'start=2026-02-30&end=2026-03-01&depts=sale'))).status, 400);
    assert.equal((await GET(new Request(path + 'start=2026-10-15&end=2026-10-16&depts=no'))).status, 403);
    assert.equal((await GET(new Request(path + 'start=2026-10-15&end=2026-10-16&depts=sale'))).status, 200);
  } finally { logout(); raw.close(); }
});

void test('advisor S4: staffGap thiếu, dư, vừa đủ và chưa biết', () => {
  assert.deepEqual(staffGap(3, null), { kind: 'unknown' });
  assert.deepEqual(staffGap(5, 3), { kind: 'over', n: 2 });
  assert.deepEqual(staffGap(3, 5), { kind: 'short', n: 2 });
  assert.deepEqual(staffGap(3, 3), { kind: 'even' });
});
void test('advisor S4: bucketBars chuẩn hóa chiều cao, giữ hai khoảng thiếu số', () => {
  const rows = bucketBars([{ label: '1–20', rate: .4 }, { label: '21–35', rate: .2 }, { label: '36–50', rate: null }, { label: '>50', rate: null }], '1–20');
  assert.deepEqual(rows.map(b => b.height), [1, .5, 0, 0]);
  assert.deepEqual(rows.map(b => b.enough), [true, true, false, false]);
  assert.deepEqual(rows.map(b => b.best), [true, false, false, false]);
  assert.equal(bucketBars([{ label: '1–20', rate: 0 }], null)[0].height, 0);
});
void test('advisor S4: reasonBars giữ năm nhóm, gộp phần dư và Khác ở cuối', () => {
  const groups = [1, 7, 3, 6, 2, 5, 4].map(n => ({ reason: `Nhóm ${n}`, count: n }));
  groups.push({ reason: 'Khác', count: 8 }, { reason: 'Rỗng', count: 0 });
  const rows = reasonBars(groups);
  assert.deepEqual(rows.map(g => g.count), [7, 6, 5, 4, 3, 11]);
  assert.equal(rows.at(-1)?.reason, 'Khác');
  assert.equal(rows.at(-1)?.share, 1);
  assert.equal(rows.reduce((n, g) => n + g.count, 0), 36);
  assert.deepEqual(reasonBars([]), []);
});
