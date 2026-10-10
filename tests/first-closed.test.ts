import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderStatements } from '../lib/sync';
import type { SourceOrder } from '../lib/pancake';

// Bắt câu lệnh đầu tiên (upsert đơn) để đọc giờ chốt first_closed_at và giờ gửi first_sent_at (hai tham số cuối).
const fakeDb = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ sql, args }) }) } as unknown as D1Database;
const upsertArgs = (o: SourceOrder) => (orderStatements(fakeDb, 'p', 's', o, 'NOW')[0] as unknown as { args: unknown[] }).args;
const closedAt = (o: SourceOrder) => upsertArgs(o).at(-2);
const sentAt = (o: SourceOrder) => upsertArgs(o).at(-1);

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

test('giờ gửi = lần đầu giao cho đơn vị vận chuyển; chưa gửi thì trống; thiếu lịch sử lấy giờ đổi trạng thái gần nhất', () => {
  const base = { id: 1, inserted_at: '2026-10-08T01:00:00', updated_at: '2026-10-09T05:00:00' };
  const h = (status: number, at: string) => ({ status, updated_at: at });
  // Vào Chờ XN hôm qua, hôm nay mới gửi: giờ gửi là hôm nay.
  assert.equal(sentAt({ ...base, status: 3, status_history: [h(17, '2026-10-08T02:00:00'), h(1, '2026-10-08T03:00:00'), h(2, '2026-10-09T01:00:00'), h(3, '2026-10-09T04:00:00')] }), '2026-10-09T01:00:00');
  // Gửi rồi hoàn: vẫn lấy lần gửi đầu.
  assert.equal(sentAt({ ...base, status: 5, status_history: [h(2, '2026-10-08T05:00:00'), h(4, '2026-10-09T01:00:00'), h(5, '2026-10-09T03:00:00')] }), '2026-10-08T05:00:00');
  assert.equal(sentAt({ ...base, status: 1, status_history: [h(17, '2026-10-08T02:00:00'), h(1, '2026-10-08T03:00:00')] }), null);
  assert.equal(sentAt({ ...base, status: 2 }), '2026-10-09T05:00:00');
  assert.equal(sentAt({ ...base, status: 6 }), null);
});
