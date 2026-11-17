import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teamAov } from '../lib/kpi/team-kpi';
import { mergeTargetAov, withTargetAov, type TargetRow } from '../lib/kpi/targets';

// TB đơn đặt cho từng người, team tính từ người (plan Đầu não 14/11/2026, bước 3).
void test('team cùng một số: lấy đúng số đó', () => {
  assert.deepEqual(teamAov([{ aov: 850000, revenue: 300e6 }, { aov: 850000, revenue: 200e6 }]), { aov: 850000, set: 2, total: 2, fromPeople: true });
});

void test('khác số: trọng số theo KPI doanh thu = tổng doanh thu ÷ tổng số đơn cần có', () => {
  // A: 400tr / 800k = 500 đơn; B: 100tr / 500k = 200 đơn → 500tr / 700 đơn ≈ 714.286
  assert.equal(teamAov([{ aov: 800000, revenue: 400e6 }, { aov: 500000, revenue: 100e6 }]).aov, 714286);
  // Thiếu KPI doanh thu → trung bình thường.
  assert.equal(teamAov([{ aov: 800000, revenue: null }, { aov: 500000, revenue: 100e6 }]).aov, 650000);
});

void test('có người chưa đặt: không tính người đó, ghi đã đặt k/n; chưa ai đặt thì dùng TB đơn team cũ', () => {
  assert.deepEqual(teamAov([{ aov: 900000, revenue: 1e8 }, { aov: null, revenue: 1e8 }, {}]), { aov: 900000, set: 1, total: 3, fromPeople: true });
  assert.deepEqual(teamAov([{ aov: null }, {}], 850000), { aov: 850000, set: 0, total: 2, fromPeople: false });
  assert.deepEqual(teamAov([{}], null), { aov: null, set: 0, total: 1, fromPeople: false });
});

void test('lưu và đọc TB đơn từng người (khoá employee:), giữ khoá team cũ', () => {
  const next = mergeTargetAov({ 'team:t1': 850000 }, [{ scope: 'employee', refId: 'u1', aov: 900000 }], ['employee:u1']);
  assert.deepEqual(next, { 'team:t1': 850000, 'employee:u1': 900000 });
  const rows: TargetRow[] = [{ scope: 'employee', refId: 'u1', revenue: 3e8, closedOrders: 0, workingDays: null, updatedAt: '' }];
  const out = withTargetAov(rows, next) as (TargetRow & { aov?: number | null })[];
  assert.equal(out.find((r) => r.scope === 'employee' && r.refId === 'u1')?.aov, 900000);
  assert.equal(out.find((r) => r.scope === 'team' && r.refId === 't1')?.aov, 850000);
});
