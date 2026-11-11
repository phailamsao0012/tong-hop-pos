import { COLUMN_LABELS, colLabel } from '../lib/shared/column-labels';
import assert from 'node:assert/strict';
import test from 'node:test';

void test('từ điển cột có tên đủ, giải thích và chữ tắt ngắn hơn, không trùng', () => {
  const shorts = new Set<string>();
  for (const [key, entry] of Object.entries(COLUMN_LABELS)) {
    assert.equal(entry.full, key);
    assert.ok(entry.hint.trim());
    assert.ok(entry.short.length < entry.full.length, key);
    assert.ok(!shorts.has(entry.short), entry.short);
    shorts.add(entry.short);
    assert.deepEqual(colLabel(key), entry);
  }
});
void test('cột ngoài từ điển giữ tên đủ', () => {
  assert.equal(colLabel('SĐT').full, 'Số điện thoại');
  assert.equal(colLabel('constructor').full, 'constructor');
  assert.deepEqual(colLabel('Nhân viên'), { full: 'Nhân viên', short: 'Nhân viên', hint: '' });
});

