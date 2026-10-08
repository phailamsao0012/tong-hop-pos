import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderStatements } from '../lib/sync';
import type { SourceOrder } from '../lib/pancake';

// Bắt câu lệnh đầu tiên (upsert đơn) để đọc giờ chốt first_closed_at (tham số cuối).
const fakeDb = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ sql, args }) }) } as unknown as D1Database;
const closedAt = (o: SourceOrder) => (orderStatements(fakeDb, 'p', 's', o, 'NOW')[0] as unknown as { args: unknown[] }).args.at(-1);

test('giờ chốt = lần đầu vào Chờ xác nhận hoặc sau đó; đơn mới chưa chốt', () => {
  const base = { id: 1, inserted_at: '2026-10-08T01:00:00', updated_at: '2026-10-08T05:00:00' };
  assert.equal(closedAt({ ...base, status: 1, status_history: [
    { old_status: 0, status: 17, updated_at: '2026-10-08T02:00:00' }, { old_status: 17, status: 1, updated_at: '2026-10-08T03:00:00' }] }), '2026-10-08T02:00:00');
  // Tạo thẳng ở Chờ xác nhận: chốt từ lúc tạo đơn.
  assert.equal(closedAt({ ...base, status: 1, status_history: [{ old_status: 17, status: 1, updated_at: '2026-10-08T03:00:00' }] }), '2026-10-08T01:00:00');
  assert.equal(closedAt({ ...base, status: 0, status_history: [] }), null);
  // Thiếu lịch sử nhưng đang Chờ xác nhận: lấy giờ cập nhật.
  assert.equal(closedAt({ ...base, status: 17 }), '2026-10-08T05:00:00');
});
