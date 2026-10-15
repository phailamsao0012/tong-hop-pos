import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_POS, allowedPos, canView, parseAccess, scopeApi } from '../lib/access';
import { classifyApi } from '../lib/audit';

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

test('only the owner can set KPI and shifts', () => {
  assert.equal(req(owner, 'PUT', '/api/targets'), undefined);
  assert.equal(req(owner, 'PUT', '/api/staff-settings'), undefined);
  assert.ok(req(director, 'PUT', '/api/targets'));
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
