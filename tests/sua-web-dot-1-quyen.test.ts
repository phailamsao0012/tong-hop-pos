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

void test('1.4 danh sách nhân viên chỉ gồm người ở POS người xem được cấp, chỉ kèm POS đó; chủ hệ thống thấy đủ', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { loginAs, logout } = await import('./support/session');
  const { POS } = await import('../lib/shared/report-model');
  const { raw } = emptyDb();
  const [a, b] = [POS[0].id, POS[1].id], now = '2026-11-01T00:00:00Z';
  const add = (pos: string, id: string, name: string) => raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,is_active,fetched_at,department) VALUES (?,?,?,?,1,?,'Sale')").run(`${pos}:${id}`, pos, id, name, now);
  add(a, 'nv-1', 'NV Mot SALE'); add(b, 'nv-2', 'NV Hai SALE'); add(a, 'nv-3', 'NV Ba SALE'); add(b, 'nv-3', 'NV Ba SALE');
  const { GET } = await import('../app/api/employees/route');
  const list = async () => (await (await GET(new Request('http://local/api/employees'))).json() as { id: string; posIds: string[] }[]).map((e) => `${e.id}:${e.posIds.sort().join('+')}`).sort();
  await loginAs(raw, 'staff', { posIds: [a] });
  assert.deepEqual(await list(), [`nv-1:${a}`, `nv-3:${a}`], 'nhân viên POS A chỉ thấy người POS A, người 2 POS chỉ kèm POS A');
  await loginAs(raw, 'lead', { posIds: [b] });
  assert.deepEqual(await list(), [`nv-2:${b}`, `nv-3:${b}`]);
  await loginAs(raw, 'owner');
  assert.deepEqual(await list(), [`nv-1:${a}`, `nv-2:${b}`, `nv-3:${[a, b].sort().join('+')}`]);
  logout();
  raw.close();
});

void test('1.4 webhook tuyển dụng: không nhận mã bí mật trên địa chỉ, chỉ nhận header X-Recruit-Secret', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { raw } = emptyDb({ RECRUIT_WEBHOOK_SECRET: 'ma-gia-0123456789' });
  const { POST } = await import('../app/api/recruit/webhook/route');
  const body = JSON.stringify({ file: {}, tabs: 'x' });
  assert.equal((await POST(new Request('http://local/api/recruit/webhook?secret=ma-gia-0123456789', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }))).status, 401, 'mã trên địa chỉ bị từ chối');
  assert.equal((await POST(new Request('http://local/api/recruit/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recruit-Secret': 'sai' }, body }))).status, 401);
  assert.equal((await POST(new Request('http://local/api/recruit/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recruit-Secret': 'ma-gia-0123456789' }, body }))).status, 400, 'đúng mã qua header thì qua bước xác thực (dữ liệu thiếu nên 400)');
  raw.close();
});

void test('1.4 thâm niên, ca làm việc, trạng thái nghỉ: chỉ người ở POS người xem; không giữ ở trình duyệt (no-store)', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { loginAs, logout } = await import('./support/session');
  const { POS } = await import('../lib/shared/report-model');
  const { raw } = emptyDb();
  const [a, b] = [POS[0].id, POS[1].id], now = '2026-11-01T00:00:00Z';
  for (const [pos, id] of [[a, 'nv-a'], [b, 'nv-b']]) raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,is_active,fetched_at,source_created_at) VALUES (?,?,?,?,1,?,'2026-01-01')").run(`${pos}:${id}`, pos, id, `NV ${id} SALE`, now);
  for (const id of ['nv-a', 'nv-b']) raw.prepare('INSERT INTO staff_settings (user_id,shift_start,shift_end,updated_by,updated_at) VALUES (?,8,17,?,?)').run(id, 'test', now);
  raw.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('staff_status_v1',?,?)").run(JSON.stringify({ 'nv-a': 'paused', 'nv-b': 'left' }), now);
  const tenure = (await import('../app/api/staff-tenure/route')).GET, settings = (await import('../app/api/staff-settings/route')).GET, status = (await import('../app/api/staff-status/route')).GET;
  const ids = async () => {
    const rs = [await tenure(), await settings(), await status()];
    for (const r of rs) assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
    const [t, s, st] = await Promise.all(rs.map((r) => r.json())) as [{ people: Record<string, unknown> }, { items: { userId: string }[] }, { people: Record<string, unknown> }];
    return [Object.keys(t.people).sort(), s.items.map((i) => i.userId).sort(), Object.keys(st.people).sort()];
  };
  await loginAs(raw, 'staff', { posIds: [a] });
  assert.deepEqual(await ids(), [['nv-a'], ['nv-a'], ['nv-a']], 'tài khoản chỉ POS A: chỉ người POS A');
  await loginAs(raw, 'director', { posIds: [b] });
  assert.deepEqual(await ids(), [['nv-b'], ['nv-b'], ['nv-b']], 'giám đốc chỉ POS B: chỉ người POS B');
  await loginAs(raw, 'owner');
  assert.deepEqual(await ids(), [['nv-a', 'nv-b'], ['nv-a', 'nv-b'], ['nv-a', 'nv-b']]);
  logout();
  raw.close();
});

void test('1.4 phần KPI theo POS và KPI thêm: tài khoản 1 POS (kể cả giám đốc) xin POS khác thì bị từ chối, không ra số', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { loginAs, logout } = await import('./support/session');
  const { POS } = await import('../lib/shared/report-model');
  const { raw } = emptyDb();
  const [a, b] = [POS[0].id, POS[1].id];
  const share = (await import('../app/api/targets/pos-share/route')).GET, extra = (await import('../app/api/reports/kpi-extra/route')).GET;
  const call = async (posIds: string) => [
    (await share(new Request(`http://local/api/targets/pos-share?month=2026-11&posIds=${posIds}`))).status,
    (await extra(new Request(`http://local/api/reports/kpi-extra?start=2026-11-01&end=2026-11-02&posIds=${posIds}`))).status,
  ];
  for (const role of ['staff', 'lead', 'director'] as const) {
    await loginAs(raw, role, { posIds: [a] });
    assert.deepEqual(await call(b), [403, 403], `${role} chỉ POS A xin POS B: từ chối`);
    assert.deepEqual(await call(`${a},${b}`), [403, 403], `${role} xin cả POS ngoài phạm vi: từ chối`);
    assert.deepEqual(await call(a), [200, 200], `${role} xin đúng POS của mình: được`);
    assert.deepEqual(await call(''), [200, 200], `${role} không ghi POS: chỉ tính POS được cấp`);
  }
  await loginAs(raw, 'owner');
  assert.deepEqual(await call(b), [200, 200]);
  logout();
  raw.close();
});

void test('1.4 trạng thái đồng bộ POS: người không phải chủ không nhận lỗi thô, chỉ POS được cấp; chủ vẫn thấy lỗi', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { loginAs, logout } = await import('./support/session');
  const { POS } = await import('../lib/shared/report-model');
  const { raw } = emptyDb();
  const [a, b] = [POS[0].id, POS[1].id], raw500 = 'Pancake HTTP 500: chi tiết máy chủ bí mật';
  for (const p of [a, b]) raw.prepare("INSERT INTO pos_shops (id,name,status,last_error) VALUES (?,?,'error',?) ON CONFLICT(id) DO UPDATE SET last_error=excluded.last_error").run(p, p, raw500);
  raw.prepare("INSERT INTO sync_runs (id,pos_id,started_at,status,records,error) VALUES ('r1',?,?,'error',0,?)").run(a, new Date().toISOString(), raw500);
  const { GET } = await import('../app/api/sync/pos/route');
  await loginAs(raw, 'staff', { posIds: [a] });
  const mine = await (await GET()).json() as { posId: string; lastError: string | null; runs: { error: string | null }[] }[];
  assert.deepEqual(mine.map((s) => s.posId), [a], 'chỉ POS được cấp');
  assert.ok(!JSON.stringify(mine).includes('bí mật'), 'không có lỗi thô');
  assert.match(mine[0].lastError ?? '', /chủ hệ thống xem chi tiết/);
  await loginAs(raw, 'owner');
  assert.ok(JSON.stringify(await (await GET()).json()).includes('bí mật'), 'chủ vẫn thấy lỗi chi tiết');
  logout();
  raw.close();
});
