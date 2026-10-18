import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSheet } from '../lib/sheet-costs';

// Tab CPQC Daily (BC MKT Agri): Ngày, Trang (= tên MKT), Sản phẩm, Chi phí QC Tổng, SĐT, Đơn, DT (anh Vũ 12/10/2026 đối chiếu POS với sheet).
const match = (n: string) => ({ 'Hà Thương': 'u1', 'Dương': 'u2' } as Record<string, string>)[n];
const tab = (values: string[][]) => ({ file: { id: 'f' }, tabs: [{ name: 'CPQC Daily', values }] });

void test('Sheet: đọc SĐT, Đơn, DT bên cạnh chi phí, cộng theo ngày + người + sản phẩm', () => {
  const r = parseSheet(tab([
    ['Ngày', 'Trang', 'Sản phẩm', 'Chi phí QC Tổng', 'SĐT', 'Đơn', 'DT'],
    ['09/10/2026', 'Hà Thương', 'Gentadox', '1.200.000', '12', '5', '4.500.000'],
    ['09/10/2026', 'Hà Thương', 'Gentadox', '300.000', '3', '1', '900.000'],
    ['09/10/2026', 'Dương', 'Apex', '0', '4', '2', '1,5tr'],
    ['10/10/2026', 'Người lạ', 'Apex', '500.000', '', '', ''],
    ['Tổng', '', '', '2.000.000', '19', '8', '6.900.000'],
  ]), match);
  assert.equal(r.rows.length, 3, 'chi phí: dòng 0đ vẫn bỏ như cũ');
  assert.equal(r.rows.reduce((t, x) => t + x.amount, 0), 2_000_000);
  const by = new Map(r.stats.map((s) => [`${s.day}|${s.marketerId}|${s.product}`, s]));
  assert.equal(r.stats.length, 2, 'dòng tổng và dòng không có số đối chiếu không vào');
  assert.deepEqual(by.get('2026-10-09|u1|Gentadox'), { day: '2026-10-09', marketerId: 'u1', product: 'Gentadox', phones: 15, orders: 6, revenue: 5_400_000 });
  assert.deepEqual(by.get('2026-10-09|u2|Apex'), { day: '2026-10-09', marketerId: 'u2', product: 'Apex', phones: 4, orders: 2, revenue: 1_500_000 });
  const cols = r.layouts[0].columns;
  assert.equal(cols.amount, 'Chi phí QC Tổng');
  assert.equal(cols.phones, 'SĐT');
  assert.equal(cols.orders, 'Đơn');
  assert.equal(cols.revenue, 'DT');
});

void test('Sheet không có cột SĐT / Đơn / DT: chi phí đọc như cũ, không có số đối chiếu', () => {
  const r = parseSheet(tab([
    ['Ngày', 'Marketer', 'Chi phí', 'Đơn giá', 'Ghi chú'],
    ['09/10/2026', 'Hà Thương', '1.000.000', '250.000', 'x'],
  ]), match);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].amount, 1_000_000);
  assert.equal(r.stats.length, 0, '"Đơn giá" không phải cột Đơn');
});
