import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prevMonthOf, shareOf, type GoalShare } from '../lib/kpi/goal-share';

// Câu 2 chọn A (anh Vũ 12/11/2026): mục tiêu chia theo tỉ lệ doanh thu tháng trước của từng POS.
const g: GoalShare = { month: '2026-11', prevMonth: '2026-10', company: { sel: 300, all: 1000 }, byUser: { a: { sel: 80, all: 100 }, b: { sel: 0, all: 50 } } };

void test('shareOf: theo người, cộng cho team, người chưa có doanh thu dùng tỉ lệ công ty', () => {
  assert.equal(shareOf(g, ['a']), 0.8);
  assert.equal(shareOf(g, ['b']), 0);
  assert.equal(shareOf(g, ['a', 'b']), 80 / 150);
  assert.equal(shareOf(g, ['moi']), 0.3);
  assert.equal(shareOf({ ...g, company: { sel: 0, all: 0 } }, ['moi']), 1);
});

void test('prevMonthOf: qua năm', () => {
  assert.equal(prevMonthOf('2026-11'), '2026-10');
  assert.equal(prevMonthOf('2027-01'), '2026-12');
});

void test('shareOf: có KPI đặt theo người × POS thì dùng đúng KPI ở POS đang chọn (anh Vũ 12/11/2026)', () => {
  const k: GoalShare = { ...g, empPos: { a: { sel: 200, all: 450 } } };
  assert.equal(shareOf(k, ['a']), 200 / 450);
  assert.equal(shareOf(k, ['b']), 0, 'người không có KPI theo POS thì quay về tỉ lệ doanh thu tháng trước');
});