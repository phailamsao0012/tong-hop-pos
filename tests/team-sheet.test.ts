import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTeamName, matchStaff, nameKey, parseTeamSheet, parseTsv } from '../lib/team-sheet';

// Tên giả, cùng dạng bảng chép từ Google Sheet: 2 khối cạnh nhau, ô gộp chỉ có giá trị ở dòng đầu, ô có xuống dòng nằm trong "…".
const SHEET = [
  'Marketing: 5\tA Lam: 3\t1. Trần Văn A\t\tCSKH: 3\t"Nghĩa\nHà Nội: 2"\t1. Lê Thị B',
  '\t\t2. Phạm Văn C\t\t\t\t2. Đỗ Thị D (part tối)',
  '\t\t3. Vũ Văn E\t\t\tMycos: 1\t1. Hồ Thị F',
  '\tĐắc Lộc: 2 (ngồi vp)\t1. Ngô Văn G\t\tSale Hà Nội: 3\tC Mơ: 2\t1. Mai Thị H',
  '\t\t2. Lý Văn I\t\t\t\t2. Tạ Thị K',
  '\t\t\t\t\t"Xuân Nghĩa:\nOXY - 1"\t1. Bùi Thị L',
  'Văn phòng: 1\tKế toán: 1\t1. Cao Thị M',
].join('\n');

test('đọc TSV có ô nhiều dòng', () => {
  assert.deepEqual(parseTsv('a\t"b\nc"\td\nx'), [['a', 'b\nc', 'd'], ['x']]);
});

test('tên team bỏ số người và ghi chú', () => {
  assert.equal(cleanTeamName('A Đăng: 10'), 'A Đăng');
  assert.equal(cleanTeamName('Đắc Đạt: 4 (ngồi vp BYD)'), 'Đắc Đạt');
  assert.equal(cleanTeamName('Xuân Nghĩa:\nOXY - 5'), 'Xuân Nghĩa OXY');
  assert.equal(cleanTeamName('Sale gà - C Mơ: 4'), 'Sale gà - C Mơ');
});

test('bảng nhiều khối: team, bộ phận, chi nhánh, người', () => {
  const teams = parseTeamSheet(SHEET);
  const by = (name: string) => teams.find((t) => t.name === name);
  assert.deepEqual(by('A Lam')?.members, ['Trần Văn A', 'Phạm Văn C', 'Vũ Văn E']);
  assert.equal(by('A Lam')?.dept, 'mkt');
  assert.deepEqual(by('Đắc Lộc')?.members, ['Ngô Văn G', 'Lý Văn I']);
  assert.equal(by('Nghĩa Hà Nội')?.dept, 'cskh');
  assert.equal(by('Nghĩa Hà Nội')?.office, 'Hà Nội');
  assert.deepEqual(by('Nghĩa Hà Nội')?.members, ['Lê Thị B', 'Đỗ Thị D']);
  assert.equal(by('Mycos')?.dept, 'cskh');
  assert.equal(by('C Mơ')?.dept, 'sale');
  assert.equal(by('C Mơ')?.office, 'Hà Nội');
  assert.deepEqual(by('Xuân Nghĩa OXY')?.members, ['Bùi Thị L']);
  assert.equal(by('Kế toán')?.dept, null);
});

test('khớp tên Pancake: bỏ hậu tố, trùng tên ưu tiên cùng bộ phận, nhiều POS lấy đủ', () => {
  const people = [
    { id: 'u1', name: 'Lê Thị B CSKH', department: 'CSKH' },
    { id: 'u2', name: 'Lê Thị B - CSKH', department: null },
    { id: 'u3', name: 'Lê Thị B', department: 'Kế toán' },
    { id: 'u4', name: 'Mai Thị H SALE', department: 'Bán hàng' },
  ];
  assert.equal(nameKey('Lê Thị B - CSKH'), 'lê thị b');
  assert.deepEqual(matchStaff('Lê Thị B', 'cskh', people), ['u1', 'u2']);
  assert.deepEqual(matchStaff('Mai Thị H', 'sale', people), ['u4']);
  assert.deepEqual(matchStaff('Không Có', 'sale', people), []);
});
