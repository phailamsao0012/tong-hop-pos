import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idleLockPaused } from '../lib/auth/idle-pause';

void test('tự khoá màn hình: chỉ chủ hệ thống trên bản thử thì không khoá; web thật y như cũ', () => {
  const base = { presenting: false, owner: false, uiMoi: false, demo: false, snapshotAt: null as string | null };
  // Web thật: không cờ, không demo → chỉ dừng khi trình chiếu, kể cả chủ hệ thống.
  assert.equal(idleLockPaused(base), false);
  assert.equal(idleLockPaused({ ...base, owner: true }), false);
  assert.equal(idleLockPaused({ ...base, presenting: true }), true);
  // Bản thử: chủ hệ thống không khoá; người khác vẫn khoá.
  for (const flag of [{ uiMoi: true }, { demo: true }, { snapshotAt: '2026-11-27T03:00:00Z' }]) {
    assert.equal(idleLockPaused({ ...base, ...flag, owner: true }), true, JSON.stringify(flag));
    assert.equal(idleLockPaused({ ...base, ...flag, owner: false }), false, JSON.stringify(flag));
  }
});
