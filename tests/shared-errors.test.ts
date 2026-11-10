import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError, errorBody, errorLabel, isAppError, isErrorCode, layerOf, newRequestId } from '../lib/shared/errors';

void test('AppError mang mã tầng, status mặc định theo tầng, chi tiết không ra ngoài', () => {
  const e = new AppError('PK-12', 'Pancake không trả lời.', { detail: 'GET /shops/x timeout' });
  assert.equal(e.code, 'PK-12');
  assert.equal(e.status, 502);
  assert.equal(layerOf(e.code), 'PK');
  assert.ok(isAppError(e));
  const r = errorBody(e, 'RP-0', 'ab12');
  assert.deepEqual(r, { status: 502, body: { error: 'Pancake không trả lời.', code: 'PK-12', requestId: 'ab12' } });
  assert.ok(!JSON.stringify(r).includes('timeout'));
  assert.equal(new AppError('AUTH-1', 'Không có quyền.', { status: 401 }).status, 401);
});

void test('mã sai dạng bị chặn; lỗi lạ thành mã dự phòng không lộ chi tiết', () => {
  assert.throws(() => new AppError('XX-1' as never, 'x'), TypeError);
  assert.ok(!isErrorCode('PK12') && !isErrorCode('pk-1') && isErrorCode('OPS-999'));
  const r = errorBody(new Error('SQLITE_BUSY near users'), 'DB-0', 'c0de');
  assert.equal(r.status, 500);
  assert.equal(r.body.code, 'DB-0');
  assert.ok(!r.body.error.includes('SQLITE'));
  assert.equal(errorLabel(r.body), 'Lỗi DB-0 · mã c0de');
});

void test('mã yêu cầu 4 ký tự hex, khác nhau giữa các lần', () => {
  const ids = new Set(Array.from({ length: 50 }, newRequestId));
  for (const id of ids) assert.match(id, /^[0-9a-f]{4}$/);
  assert.ok(ids.size > 40);
});
