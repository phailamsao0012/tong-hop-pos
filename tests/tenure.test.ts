import test from 'node:test';
import assert from 'node:assert/strict';
import { pickJoined, tenureMonths } from '../lib/tenure';

void test('tenure: T0 là tháng đầu, đủ tháng mới lên bậc', () => {
  assert.equal(tenureMonths('2026-09-15', '2026-10-14'), 0);
  assert.equal(tenureMonths('2026-09-15', '2026-10-15'), 1);
  assert.equal(tenureMonths('2026-10-31', '2026-10-31'), 0);
  assert.equal(tenureMonths('2025-10-01', '2026-10-31'), 12);
  assert.equal(tenureMonths('2026-11-01', '2026-10-31'), null);
});

void test('tenure: ngày vào theo thứ tự nhân sự → tài khoản POS → đơn đầu', () => {
  assert.deepEqual(pickJoined([[null, 'tay'], ['2026-03-02', 'nhan-su'], ['2026-01-01', 'pancake']]), { joined: '2026-03-02', source: 'nhan-su' });
  assert.deepEqual(pickJoined([[undefined, 'tay'], [null, 'nhan-su'], ['2026-01-01T03:00:00Z', 'pancake']]), { joined: '2026-01-01', source: 'pancake' });
  assert.equal(pickJoined([[null, 'tay'], ['', 'nhan-su']]), null);
});
