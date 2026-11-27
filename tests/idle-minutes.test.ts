import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickIdleMinutes } from '../lib/auth/idle-minutes';

void test('tự khoá màn hình: chủ hệ thống mặc định không khoá, người khác 30 phút; lựa chọn đã lưu vẫn theo', () => {
  assert.equal(pickIdleMinutes(null, true), 0);
  assert.equal(pickIdleMinutes(null, false), 30);
  assert.equal(pickIdleMinutes('60', true), 60);
  assert.equal(pickIdleMinutes('240', false), 240);
  assert.equal(pickIdleMinutes('0', false), 30, 'người khác không được tắt');
  assert.equal(pickIdleMinutes('0', true), 0);
  assert.equal(pickIdleMinutes('17', true), 30, 'giá trị lạ');
});
