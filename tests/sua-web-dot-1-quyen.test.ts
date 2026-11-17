// Plan sửa web 1.4 (17/11/2026): API chưa khai báo quyền thì chặn mặc định (trừ chủ hệ thống). Vai trò, tên đều giả.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseAccess, scopeApi } from '../lib/auth/access';

const call = (a: ReturnType<typeof parseAccess>, path: string, method = 'GET') => scopeApi(a, method, new URL(`http://local${path}`)).blocked;
const ROLES = {
  owner: parseAccess({ role: 'owner' }),
  director: parseAccess({ role: 'director', views_json: JSON.stringify(['overview', 'sale-overview', 'van-don', 'people']) }),
  lead: parseAccess({ role: 'lead', views_json: JSON.stringify(['sale-overview', 'calls']) }),
  mentor: { ...parseAccess({ role: 'mentor', views_json: JSON.stringify(['overview']) }), teamScope: { dept: 'sale' as const, ids: ['team-gia'] } },
  staff: parseAccess({ role: 'staff', views_json: JSON.stringify(['sale-overview']) }),
};

// Mọi route trong app/api: đường công khai (đăng nhập, webhook, web nhân sự gọi bằng bí mật, tuyển dụng có kiểm riêng) hoặc đã khai báo.
const routes = (dir: string, base = '/api'): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (!statSync(p).isDirectory()) return n === 'route.ts' ? [base] : [];
  return routes(p, `${base}/${n.replace(/^\[.*\]$/, 'x')}`);
});
const PUBLIC = (p: string) => /^\/api\/(auth|hr)(\/|$)/.test(p) || p.startsWith('/api/zalo/') || ['/api/telegram/webhook', '/api/marketing/sheet-webhook', '/api/recruit/webhook'].includes(p);

void test('1.4 mọi route API đã khai báo quyền: tài khoản không có trang nào chỉ bị chặn vì thiếu quyền, không phải vì "chưa khai báo"', () => {
  const bare = parseAccess({ role: 'staff' });
  const list = routes(join(import.meta.dirname, '../app/api')).filter((p) => !PUBLIC(p));
  assert.ok(list.length > 100, `đọc được ${list.length} route`);
  const missing = list.filter((p) => call(bare, p) === 'Phần này chưa được cấp quyền cho tài khoản của bạn.');
  assert.deepEqual(missing, [], 'route mới phải được thêm vào VIEW_GATES / OWNER_ONLY / SELF_CHECKED_API / ANY_USER_API');
});

void test('1.4 năm vai trò: route chưa khai báo chỉ chủ hệ thống vào được', () => {
  for (const [role, a] of Object.entries(ROLES)) {
    const blocked = call(a, '/api/route-moi-chua-khai-bao');
    if (role === 'owner') assert.equal(blocked, undefined, role);
    else assert.ok(blocked, `${role} bị chặn`);
  }
});

void test('1.4 năm vai trò: route vừa khai báo theo trang', () => {
  const want: Record<string, Record<string, boolean>> = {
    // Mentor phạm vi team Sale chỉ có các trang Sale, không có trang Tổng quan (nơi hiện dải KPI ngày).
    '/api/reports/kpi-day': { owner: true, director: true, lead: false, mentor: false, staff: false },
    '/api/reports/van-don-carriers': { owner: true, director: true, lead: false, mentor: false, staff: false },
    '/api/reports/cskh-badge': { owner: true, director: false, lead: true, mentor: false, staff: false },
    // Dùng chung: ai đăng nhập cũng gọi được.
    '/api/employees': { owner: true, director: true, lead: true, mentor: true, staff: true },
    '/api/staff-tenure': { owner: true, director: true, lead: true, mentor: true, staff: true },
    // Route tự kiểm quyền bên trong: lớp này cho qua, route quyết định.
    '/api/giao-viec/me': { owner: true, director: true, lead: true, mentor: true, staff: true },
    // Đã chặn từ trước: chỉ chủ.
    '/api/users': { owner: true, director: false, lead: false, mentor: false, staff: false },
  };
  for (const [path, roles] of Object.entries(want))
    for (const [role, ok] of Object.entries(roles))
      assert.equal(call(ROLES[role as keyof typeof ROLES], path) === undefined, ok, `${role} ${path} ${ok ? 'vào được' : 'bị chặn'}`);
});
