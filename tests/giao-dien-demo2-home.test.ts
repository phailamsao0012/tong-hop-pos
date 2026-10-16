import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { D2Home } from '../app/ui/d2-home';
import type { OverviewReport } from '../app/overview-view';

const totals = { orders: 1640, closedOrders: 1080, closedNet: 428600000, groups: { delivered: { net: 356200000 } } };
const report = {
  groupBy: 'day', syncedAt: null,
  current: { total: totals, byPos: [{ ...totals, posId: 'test-pos' }], series: [{ bucket: '2026-10-16', posId: 'test-pos', closedNet: 428600000 }] },
  compare: null,
  pos: [{ id: 'test-pos', connected: true, backfillDone: true, syncedAt: '2026-10-16T01:00:00Z', lastError: null }],
} as unknown as OverviewReport;

void test('T2 home renders four detail buttons, trend, then POS table using report values', () => {
  const html = renderToStaticMarkup(createElement(D2Home, { report, posIds: ['test-pos'], onOpen: () => {} }));
  assert.equal((html.match(/class="d2-kpi"/g) ?? []).length, 4);
  assert.ok(html.indexOf('d2-tray') < html.indexOf('d2-trend'));
  assert.ok(html.indexOf('d2-trend') < html.indexOf('d2-table-card'));
  assert.ok(html.includes('1.640'));
  assert.ok(html.includes('1.080'));
  assert.ok(html.includes('Tiền hàng giao thành công'));
  assert.ok(html.includes('Đã đồng bộ'));
  assert.ok(html.includes('Chưa chọn kỳ so sánh'));
});

void test('T2 home keeps missing POS metrics distinct from zero and reports sync errors', () => {
  const html = renderToStaticMarkup(createElement(D2Home, {
    report: { ...report, current: { ...report.current, byPos: [] }, pos: [{ ...report.pos[0], lastError: 'synthetic failure' }] },
    posIds: ['test-pos'], onOpen: () => {},
  }));
  assert.ok(html.includes('Lỗi đồng bộ'));
  assert.ok(html.includes('—'));
  assert.ok(!html.includes('synthetic failure'));
});
