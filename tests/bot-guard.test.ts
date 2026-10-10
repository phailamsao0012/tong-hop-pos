// Bảo vệ dữ liệu cá nhân qua bot Telegram (10/10/2026): ai tra được khách, cách tìm khách, che SĐT, khoá dò mã.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAIL_LIMIT_ALL, FAIL_LIMIT_CHAT, FAIL_WINDOW_MS, LOCK_CHAT_MS, addFailure, canLookupCustomers, escapeLike, isGroupChat, isLocked, maskPhone, parseCustomerQuery } from '../lib/bot-guard-core';

void test('chỉ chat riêng tin cậy được tra khách; nhóm chat không bao giờ', () => {
  assert.equal(canLookupCustomers('123456789', true), true);
  assert.equal(canLookupCustomers('123456789', false), false);
  assert.equal(canLookupCustomers('-1001234567890', true), false);
  assert.equal(canLookupCustomers('-4567', true), false);
  assert.equal(isGroupChat('-1'), true);
  assert.equal(isGroupChat('42'), false);
});

void test('tìm khách: SĐT phải đủ 9 số, tên từ 3 chữ, không dò bằng một ký tự', () => {
  assert.equal(parseCustomerQuery('9').kind, 'invalid');
  assert.equal(parseCustomerQuery('090').kind, 'invalid');
  assert.equal(parseCustomerQuery('0912 345').kind, 'invalid');
  assert.equal(parseCustomerQuery('a').kind, 'invalid');
  assert.equal(parseCustomerQuery('Lê').kind, 'invalid');
  assert.equal(parseCustomerQuery('%').kind, 'invalid');
  assert.equal(parseCustomerQuery('__').kind, 'invalid');
  assert.deepEqual(parseCustomerQuery('0912345678'), { kind: 'phone', digits: '912345678' });
  assert.deepEqual(parseCustomerQuery('+84 912 345 678'), { kind: 'phone', digits: '912345678' });
  assert.deepEqual(parseCustomerQuery('912345678'), { kind: 'phone', digits: '912345678' });
  assert.deepEqual(parseCustomerQuery('Nguyễn Văn An'), { kind: 'name', pattern: '%Nguyễn Văn An%' });
  // Tên lẫn số vẫn tìm theo tên, không đổi sang dò mảnh số điện thoại.
  assert.equal(parseCustomerQuery('Lan 09').kind, 'name');
});

void test('ký tự đại diện LIKE được thoát', () => {
  assert.equal(escapeLike('a%b_c\\d'), 'a\\%b\\_c\\\\d');
  assert.deepEqual(parseCustomerQuery('ab%%'), { kind: 'name', pattern: '%ab\\%\\%%' });
});

void test('che SĐT chỉ để 3 số cuối', () => {
  assert.equal(maskPhone('0912345678'), '•••••••678');
  assert.equal(maskPhone('12'), '•••');
  assert.ok(!maskPhone('0912345678').includes('0912'));
});

void test('khoá sau 5 lần sai trong 15 phút, hết cửa sổ thì đếm lại', () => {
  const t0 = 1_000_000;
  let s = null as ReturnType<typeof addFailure> | null;
  for (let i = 1; i < FAIL_LIMIT_CHAT; i++) { s = addFailure(s, t0 + i * 1000, FAIL_LIMIT_CHAT, LOCK_CHAT_MS); assert.equal(isLocked(s, t0 + i * 1000), false); }
  s = addFailure(s, t0 + 10_000, FAIL_LIMIT_CHAT, LOCK_CHAT_MS);
  assert.equal(isLocked(s, t0 + 10_001), true);
  assert.equal(isLocked(s, t0 + 10_000 + LOCK_CHAT_MS + 1), false);
  const fresh = addFailure({ n: 4, since: t0 }, t0 + FAIL_WINDOW_MS + 1, FAIL_LIMIT_CHAT, LOCK_CHAT_MS);
  assert.deepEqual(fresh, { n: 1, since: t0 + FAIL_WINDOW_MS + 1 });
  assert.ok(FAIL_LIMIT_ALL > FAIL_LIMIT_CHAT);
});
