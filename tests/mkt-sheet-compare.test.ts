import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareSheet, gapOf, verdict, zeroRow, type SheetCheckData } from '../lib/shared/mkt-sheet-compare';

const row = (sheet: Partial<{ phones: number; orders: number; revenue: number; cost: number }>, pos: Partial<{ net: number; closed: number; sale: number; saleClosed: number; phones: number }>) => {
  const r = zeroRow();
  Object.assign(r.sheet, sheet);
  Object.assign(r.confirmed, pos);
  r.created.phones = pos.phones ?? 0;
  return r;
};

void test('verdict / gapOf: ngưỡng ±2 % / ±10 %', () => {
  assert.equal(verdict(gapOf(102, 100).pct).text, 'Khớp');
  assert.equal(verdict(gapOf(110, 100).pct).text, 'Lệch nhẹ');
  assert.equal(verdict(gapOf(111, 100).pct).text, 'Lệch nhiều');
  assert.equal(gapOf(5, 0).pct, 100);
});

void test('compareSheet: chỉ cộng tới ngày cuối sheet có số; chọn cột New; tên sheet chưa ghép', () => {
  const data: SheetCheckData = {
    period: { start: '2026-11-01', end: '2026-11-03' },
    sheet: { connected: true, receivedAt: null, hasStats: true },
    total: zeroRow(),
    marketers: [{ id: 'a', name: 'A', counted: true, ...zeroRow() }, { id: 'sheet:X', name: 'X', counted: false, ...zeroRow() }],
    days: [],
    detail: [
      { marketerId: 'a', day: '2026-11-01', ...row({ revenue: 100, orders: 2, phones: 5, cost: 30 }, { net: 120, closed: 2, sale: 90, saleClosed: 1, phones: 5 }) },
      { marketerId: 'a', day: '2026-11-02', ...row({ revenue: 50, orders: 1, phones: 3, cost: 10 }, { net: 40, closed: 1, sale: 40, saleClosed: 1, phones: 3 }) },
      // Ngày 03 sheet chưa ghi: không cộng POS ngày này.
      { marketerId: 'a', day: '2026-11-03', ...row({}, { net: 999, closed: 9, sale: 999, saleClosed: 9, phones: 9 }) },
      { marketerId: 'sheet:X', day: '2026-11-02', ...row({ revenue: 70, cost: 20 }, {}) },
    ],
  };
  const all = compareSheet(data, 'net');
  assert.equal(all.cutoff, '2026-11-02');
  assert.deepEqual(all.byMarketer.get('a'), { sheet: { phones: 8, orders: 3, revenue: 150, cost: 40 }, posNet: 160, posClosed: 3, posPhones: 8, counted: true, noSheet: false });
  assert.equal(all.total.posNet, 160, 'tổng chỉ gồm marketer counted');
  assert.deepEqual(all.unmatched, [{ id: 'sheet:X', name: 'X', cost: 20, revenue: 70 }]);
  assert.equal(compareSheet(data, 'sale').byMarketer.get('a')?.posNet, 130);
});
