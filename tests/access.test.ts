import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_POS, allowedPos, canView, parseAccess, scopeApi } from '../lib/auth/access';
import { classifyApi } from '../lib/ops/audit';

const owner = parseAccess({ role: 'owner' });
const director = parseAccess({ role: 'director', views_json: JSON.stringify(['overview', 'cskh-kpi', 'sale-kpi']) });
const req = (a: ReturnType<typeof parseAccess>, method: string, path: string) => scopeApi(a, method, new URL(`https://x${path}`)).blocked;

test('KPI pages are owner-only, even for a director granted them', () => {
  assert.equal(canView(owner, 'cskh-kpi'), true);
  assert.equal(canView(owner, 'sale-kpi'), true);
  assert.equal(canView(director, 'cskh-kpi'), false);
  assert.equal(canView(director, 'sale-kpi'), false);
  assert.equal(canView(director, 'overview'), true);
});

test('director passes the KPI gate; staff settings and shifts remain owner-only', () => {
  assert.equal(req(owner, 'PUT', '/api/targets'), undefined);
  assert.equal(req(owner, 'PUT', '/api/staff-settings'), undefined);
  assert.equal(req(director, 'PUT', '/api/targets'), undefined);
  assert.ok(req(director, 'PUT', '/api/staff-settings'));
});

test('Marketing cost numbers follow the Chi phí & ROAS permission and the account POS scope', () => {
  const mkt = parseAccess({ role: 'staff', views_json: JSON.stringify(['overview', 'sale-overview']) });
  const roas = parseAccess({ role: 'staff', views_json: JSON.stringify(['marketing', 'mkt-roas']), pos_ids_json: JSON.stringify(['thuy-san']) });
  assert.ok(req(mkt, 'GET', '/api/marketing/analytics?start=2026-10-01&end=2026-10-09'));
  assert.equal(req(roas, 'GET', '/api/marketing/analytics?start=2026-10-01&end=2026-10-09'), undefined);
  const scoped = scopeApi(roas, 'GET', new URL('https://x/api/marketing/analytics?start=2026-10-01&end=2026-10-09'));
  assert.equal(scoped.url.searchParams.get('posIds'), 'thuy-san');
});

test('POS được cấp đều đã gỡ: không thành "mọi POS" (bảo vệ dữ liệu, 10/10/2026)', () => {
  const a = parseAccess({ role: 'staff', views_json: '["raw-orders"]', pos_ids_json: '["pos-da-xoa"]', team: 'all' });
  assert.deepEqual(a.posIds, [NO_POS]);
  assert.deepEqual(allowedPos(a), [NO_POS]);
  const scoped = scopeApi(a, 'GET', new URL('https://x/api/raw/orders'));
  assert.equal(scoped.url.searchParams.get('posIds'), NO_POS);
  // Không cấp POS nào (để trống) vẫn là mọi POS như trước.
  assert.equal(parseAccess({ role: 'staff', views_json: '[]', pos_ids_json: '', team: 'all' }).posIds, null);
});

test('mở hồ sơ khách, chi tiết đơn, xuất danh sách đều vào nhật ký', () => {
  assert.equal(classifyApi('GET', '/api/raw/orders/detail', new URLSearchParams('id=p1:1'))?.action, 'order.view');
  assert.equal(classifyApi('GET', '/api/reports/customers/detail', new URLSearchParams('phone=1'))?.action, 'customer.view');
  assert.equal(classifyApi('GET', '/api/reports/customer360', new URLSearchParams('phone=1'))?.action, 'customer.view');
  assert.equal(classifyApi('GET', '/api/reports/customer360', new URLSearchParams('start=2026-10-01')), null);
  assert.equal(classifyApi('GET', '/api/reports/customers', new URLSearchParams('size=20000'))?.action, 'export');
});

void test('tasks is available to every signed-in role without a page grant', () => {
  for (const role of ['owner', 'director', 'lead', 'staff']) {
    assert.equal(canView(parseAccess({ role, views_json: '[]' }), 'tasks'), true);
  }
});

void test('returns follows its explicit grant or each N2 implied permission', () => {
  for (const view of ['returns', 'van-don', 'pipeline', 'sale-overview']) {
    assert.equal(canView(parseAccess({ role: 'staff', views_json: JSON.stringify([view]) }), 'returns'), true);
  }
  for (const view of [undefined, 'calls', 'marketing', 'customers']) {
    assert.equal(canView(parseAccess({ role: 'staff', views_json: JSON.stringify(view ? [view] : []) }), 'returns'), false);
  }
  assert.equal(canView(owner, 'returns'), true);
});

void test('Giao việc: quyền thật ở route, owner và sếp trong D1; thu hồi có hiệu lực ngay', async () => {
  const { emptyDb } = await import('./support/d1-sqlite');
  const { loginAs, logout } = await import('./support/session');
  const { writeZaloSetting } = await import('../lib/zalo/zalo-work');
  const { GET, POST } = await import('../app/api/giao-viec/route');
  const { GET: me } = await import('../app/api/giao-viec/me/route');
  const { GET: directory, PUT } = await import('../app/api/giao-viec/zalo/route');
  const { GET: meetings } = await import('../app/api/giao-viec/hop/route');
  const { POST: trial } = await import('../app/api/giao-viec/zalo/thu/route');
  const { POST: setup } = await import('../app/api/giao-viec/zalo/webhook-setup/route');
  const { raw, db } = emptyDb({ DEMO_MODE: '1' });
  const request = (path: string, method = 'GET', body?: unknown) => {
    const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
    if (method !== 'GET' && body !== undefined) init.body = JSON.stringify(body);
    return new Request(`http://localhost/api/giao-viec${path}`, init);
  };
  logout(); assert.equal((await GET(request(''))).status, 401);
  await loginAs(raw, 'owner'); assert.equal((await GET(request(''))).status, 200);
  for (const role of ['director', 'lead', 'staff'] as const) {
    const id = await loginAs(raw, role);
    assert.equal((await GET(request(''))).status, 403);
    assert.deepEqual(await (await me()).json(), { boss: false });
    await writeZaloSetting(db, 'zalo_bosses_v1', [id]);
    if (role === 'staff') { assert.equal((await GET(request(''))).status, 403); continue; }
    assert.equal((await GET(request(''))).status, 200);
    assert.equal((await directory(request('/zalo'))).status, 200);
    assert.equal((await meetings(request('/hop'))).status, 200);
    assert.equal((await setup(request('/zalo/webhook-setup', 'POST', {}))).status, 403);
    assert.equal((await PUT(request('/zalo', 'PUT', { bosses: [] }))).status, 400);
    await writeZaloSetting(db, 'zalo_bosses_v1', []);
    for (const r of [await GET(request('')), await directory(request('/zalo')), await meetings(request('/hop')), await POST(request('', 'POST', {})), await trial(request('/zalo/thu', 'POST', {}))]) assert.equal(r.status, 403);
  }
  const mentorId = await loginAs(raw, 'lead');
  raw.prepare("UPDATE users SET role='mentor' WHERE id=?").run(mentorId);
  const { forgetSession } = await import('../lib/auth/auth');
  await forgetSession((globalThis as { __testCookie?: string }).__testCookie ?? null);
  assert.equal((await GET(request(''))).status, 403);
  logout(); raw.close();
});
