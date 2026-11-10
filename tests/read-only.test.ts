import assert from 'node:assert/strict';
import { test } from 'node:test';
import { READ_ONLY_MESSAGE, readOnlyBlocked } from '../lib/ops/read-only';

void test('read-only: bản PC cho xem và đăng nhập, chặn mọi lệnh sửa và webhook', () => {
  for (const m of ['GET', 'HEAD', 'OPTIONS']) assert.equal(readOnlyBlocked(m, '/api/users'), null);
  assert.equal(readOnlyBlocked('POST', '/api/auth/login'), null);
  assert.equal(readOnlyBlocked('POST', '/api/auth/logout'), null);
  assert.equal(readOnlyBlocked('POST', '/api/reports/batch'), null);
  assert.equal(readOnlyBlocked('POST', '/api/activity'), null);
  for (const [m, p] of [['POST', '/api/users'], ['PUT', '/api/targets'], ['DELETE', '/api/web-teams'], ['PATCH', '/api/config'],
    ['POST', '/api/telegram/webhook'], ['POST', '/api/zalo/webhook'], ['POST', '/api/marketing/sheet-webhook'], ['POST', '/api/reports/batch/x'], ['POST', '/api/activity2']]) {
    assert.equal(readOnlyBlocked(m, p), READ_ONLY_MESSAGE, `${m} ${p}`);
  }
  assert.equal(readOnlyBlocked('POST', '/login'), null);
});
