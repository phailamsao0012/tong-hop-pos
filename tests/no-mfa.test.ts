// THP_NO_MFA=1 (anh Vũ 10/11/2026 "bỏ tất cả các bước xác thực 2 lớp"): không vai trò nào bắt buộc 2 lớp; bỏ biến là như cũ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from 'cloudflare:workers';
import { mfaRequiredFor, noMfa } from '@/lib/auth/mfa';

void test('THP_NO_MFA=1 tắt bắt buộc 2 lớp cho mọi vai trò, bỏ biến thì như cũ', () => {
  const e = env as unknown as Record<string, string | undefined>;
  const before = e.THP_NO_MFA;
  try {
    delete e.THP_NO_MFA;
    assert.equal(noMfa(), false);
    assert.equal(mfaRequiredFor('owner'), e.DEMO_MODE !== '1');
    assert.equal(mfaRequiredFor('lead'), false);
    e.THP_NO_MFA = '1';
    assert.equal(noMfa(), true);
    for (const role of ['owner', 'director', 'lead', 'mentor'] as const) assert.equal(mfaRequiredFor(role), false);
  } finally {
    if (before === undefined) delete e.THP_NO_MFA; else e.THP_NO_MFA = before;
  }
});
