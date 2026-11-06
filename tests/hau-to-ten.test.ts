// Hậu tố bộ phận ở cuối tên Pancake (anh Vũ 06/11/2026: chỉ tính đúng hậu tố, mỗi người một bộ phận). Tên giả.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { nameSuffix } from '../lib/teams/team';

const match = (name: string, ...words: string[]) => {
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE t (name TEXT)');
  d.prepare('INSERT INTO t VALUES (?)').run(name);
  return (d.prepare(`SELECT COUNT(*) AS n FROM t WHERE ${nameSuffix(...words)}`).get() as { n: number }).n === 1;
};

void test('hậu tố cuối tên: các cách viết hay gặp đều khớp', () => {
  for (const name of ['An SALE', 'Lê Văn A - TP SALE', 'Chi sale', 'Dung SALES', 'Hà SALE HN', 'Khánh Sale - TN']) assert.ok(match(name, 'sale', 'sales'), name);
  for (const name of ['NAMPV-MKT', 'Hà Thương MKT', 'Bình MKT (part tối)']) assert.ok(match(name, 'mkt'), name);
  assert.ok(match('Mai_CSKH', 'cskh'));
});

void test('chữ nằm giữa tên hoặc không phải hậu tố thì không khớp', () => {
  for (const name of ['Rosalee Trần', 'Hà Rosalee CSKH', 'Cường SALE CSKH', 'Tô Hồng Vũ 2', 'Salem Nguyễn']) assert.ok(!match(name, 'sale', 'sales'), name);
  assert.ok(!match('Khúc Văn Long MTK', 'mkt'));
});
