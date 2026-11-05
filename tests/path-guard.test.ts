// Đường dẫn phải đúng dạng chuẩn trước khi kiểm quyền (lib/auth/path-guard.ts, gọi ở đầu worker.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPath, isCanonicalPath } from '../lib/auth/path-guard';
import { parseAccess, scopeApi } from '../lib/auth/access';

const pathOf = (raw: string) => new URL(`https://x${raw}`).pathname;

void test('đường dẫn thường vẫn đi qua như cũ', () => {
  for (const p of ['/', '/login', '/api/reports/overview', '/api/users', '/api/users/', '/api/giao-viec/abc-123', '/api/zalo/anh/a1b2', '/api/reports/customers/detail'])
    assert.equal(isCanonicalPath(pathOf(p)), true, p);
});

void test('đường dẫn lệch dạng chuẩn bị chặn (trả 404 ở worker)', () => {
  for (const p of ['//api/users', '/api//users', '/api/reports//growth', '/api%2Fusers', '/api/reports%2fgrowth',
    '/API/users', '/Api/reports/overview', '/api/users%00', '/api/users%zz', '/api/us ers', '/api/users"x'])
    assert.equal(isCanonicalPath(pathOf(p)), false, p);
  assert.equal(canonicalPath('/a\\b'), null);
  // Dấu chấm mã hoá (khi chưa được trình phân tích URL rút gọn).
  assert.equal(canonicalPath('/api/%2e%2e/users'), null);
});

void test('mọi đường dẫn đi qua được thì cổng kiểm quyền vẫn chặn đúng', () => {
  const staff = parseAccess({ role: 'staff', views_json: JSON.stringify(['overview']) });
  // Dạng có // bị worker chặn trước; nếu dạng chuẩn thì scopeApi chặn trang chỉ chủ hệ thống.
  for (const p of ['/api//users', '/api/reports//growth']) assert.equal(isCanonicalPath(pathOf(p)), false, p);
  for (const p of ['/api/users', '/api/reports/growth', '/api/users/'])
    assert.ok(scopeApi(staff, 'GET', new URL(`https://x${p}`)).blocked, p);
  const owner = parseAccess({ role: 'owner' });
  assert.equal(scopeApi(owner, 'GET', new URL('https://x/api/users')).blocked, undefined);
});
