import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { marketingTeamFilter, UNASSIGNED_TEAM, validateMarketingTeams } from '../lib/marketing-teams';

const teams = [
  { id: 'mkt_11111111-1111-4111-8111-111111111111', name: 'Team A', memberIds: ['m1', 'm2'] },
  { id: 'mkt_22222222-2222-4222-8222-222222222222', name: 'Team B', memberIds: ['m3'] },
];

void test('lọc team Marketing tính lại toàn bộ tập đơn và giữ riêng người chưa phân nhóm', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE orders (marketer_id TEXT, amount INTEGER); INSERT INTO orders VALUES ('m1',100),('m2',200),('m3',300),('m4',400)");
  const total = (id: string) => {
    const scope = marketingTeamFilter(id, teams, 'marketer_id');
    assert.ok(scope);
    const row = db.prepare(`SELECT SUM(amount) AS amount FROM orders WHERE 1=1${scope.sql}`).get(...scope.binds) as { amount: number };
    return row.amount;
  };
  assert.equal(total(teams[0].id), 300);
  assert.equal(total(teams[1].id), 300);
  assert.equal(total(UNASSIGNED_TEAM), 400);
  assert.equal(total('__all'), 1000);
  assert.equal(marketingTeamFilter('mkt_missing', teams, 'marketer_id'), null);
  db.close();
});

void test('không lưu một marketer ở hai team vì sẽ cộng trùng khi so sánh', () => {
  assert.ok(validateMarketingTeams(teams).teams);
  assert.match(validateMarketingTeams([{ ...teams[0], memberIds: ['m1'] }, { ...teams[1], memberIds: ['m1'] }]).error ?? '', /chỉ được thuộc một team/i);
});
