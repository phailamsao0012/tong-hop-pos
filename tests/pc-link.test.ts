import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_ORIGIN, PC_LOGIN_ERRORS, PC_ORIGIN, handoffAlive, mainHandoffUrl, pcLoginError, mainRedeemUrl, newPcCode, pcClaimUrl, validPcCode } from '../lib/auth/pc-link';

void test('mã mới đúng dạng và không trùng', () => {
  const a = newPcCode(), b = newPcCode();
  assert.equal(validPcCode(a), true);
  assert.notEqual(a, b);
});

void test('chỉ nhận mã base64url 32 ký tự', () => {
  assert.equal(validPcCode('a'.repeat(32)), true);
  assert.equal(validPcCode('a'.repeat(31)), false);
  assert.equal(validPcCode(`${'a'.repeat(31)}/`), false);
  assert.equal(validPcCode(null), false);
  assert.equal(validPcCode(42), false);
});

void test('địa chỉ cố định, không lấy từ người dùng', () => {
  assert.equal(mainHandoffUrl(), `${MAIN_ORIGIN}/api/auth/pc-handoff`);
  assert.equal(mainRedeemUrl(), `${MAIN_ORIGIN}/api/auth/pc-redeem`);
  assert.equal(pcClaimUrl('abc_-'), `${PC_ORIGIN}/api/auth/pc-claim?code=abc_-`);
  assert.ok(pcClaimUrl('x&next=//evil').startsWith(`${PC_ORIGIN}/api/auth/pc-claim?code=x%26`));
});

void test('mã hết hạn hoặc không có thì không cho vào', () => {
  const now = Date.parse('2026-11-07T15:00:00Z');
  assert.equal(handoffAlive({ user_id: 'u1', expires_at: '2026-11-07T15:01:00Z' }, now), 'u1');
  assert.equal(handoffAlive({ user_id: 'u1', expires_at: '2026-11-07T14:59:59Z' }, now), null);
  assert.equal(handoffAlive(null, now), null);
});

void test('mỗi lỗi quay về đều có lời báo', () => {
  for (const k of ['het-han', 'khong-noi', 'chua-chep']) assert.ok(PC_LOGIN_ERRORS[k]);
  assert.equal(pcLoginError('constructor'), undefined);
  assert.equal(pcLoginError(undefined), undefined);
  assert.equal(pcLoginError('het-han'), PC_LOGIN_ERRORS['het-han']);
});
