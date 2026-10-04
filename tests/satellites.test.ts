import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccess, scopeApi } from '../lib/access';
import { HR_DOWN, SATELLITES, actorHeader, decisionSummary, performanceOf, posAccountsOf, relay, satModule, visibleSatellites } from '../lib/satellites';

const owner = parseAccess({ role: 'owner' });
const director = parseAccess({ role: 'director' });
const lead = parseAccess({ role: 'lead', views_json: JSON.stringify(['overview', 'people', 'recruit']) });
const staff = parseAccess({ role: 'staff', views_json: JSON.stringify(['overview']) });
const req = (a: ReturnType<typeof parseAccess>, method: string, path: string) => scopeApi(a, method, new URL(`https://x${path}`)).blocked;

void test('actor header is ASCII and round-trips Vietnamese names', () => {
  const h = actorHeader({ userId: 'u1', email: 'sep@megatech.vn', displayName: 'Nguyễn Văn Sếp', role: 'director', title: 'Giám đốc chi nhánh' });
  assert.match(h, /^[\x20-\x7e]+$/);
  assert.deepEqual(JSON.parse(decodeURIComponent(h)), { userId: 'u1', email: 'sep@megatech.vn', name: 'Nguyễn Văn Sếp', role: 'director', title: 'Giám đốc chi nhánh' });
});

void test('actor header is byte-for-byte what the HR web test parses', () => {
  // Same literal is pinned in megatech-crm tests/app-actor.test.ts (parseActor): keep both in sync.
  const h = actorHeader({ userId: 'u_sep', email: 'sep@megatech.vn', displayName: 'Nguyễn Thị Ánh', role: 'director', title: 'Giám đốc · Hà Nội' });
  assert.equal(h, '%7B%22userId%22%3A%22u_sep%22%2C%22email%22%3A%22sep%40megatech.vn%22%2C%22name%22%3A%22Nguy%E1%BB%85n%20Th%E1%BB%8B%20%C3%81nh%22%2C%22role%22%3A%22director%22%2C%22title%22%3A%22Gi%C3%A1m%20%C4%91%E1%BB%91c%20%C2%B7%20H%C3%A0%20N%E1%BB%99i%22%7D');
});

void test('HR module and /api/sat/hr are only for owner and director', () => {
  assert.deepEqual(visibleSatellites(owner).map((s) => s.id), ['hr']);
  assert.deepEqual(visibleSatellites(director).map((s) => s.id), ['hr']);
  assert.deepEqual(visibleSatellites(lead), []);
  assert.deepEqual(visibleSatellites(staff), []);
  for (const path of ['/api/sat/hr/overview', '/api/sat/hr/person?id=1', '/api/sat/hr/approvals']) {
    assert.equal(req(owner, 'GET', path), undefined);
    assert.equal(req(director, 'POST', path), undefined);
    assert.ok(req(lead, 'GET', path));
    assert.ok(req(staff, 'POST', path));
  }
  // Danh sách module: ai đăng nhập cũng gọi được (chỉ trả module mình thấy).
  assert.equal(req(staff, 'GET', '/api/app/modules'), undefined);
  assert.ok(req(lead, 'GET', '/api/recruit/candidates'));
  assert.equal(req(director, 'GET', '/api/recruit/cv?id=1'), undefined);
});

void test('module status comes from the badge answer', () => {
  const hr = SATELLITES[0];
  assert.deepEqual(satModule(hr, { pending: 3 }), { id: 'hr', title: 'Nhân sự', subtitle: hr.subtitle, icon: 'person.3.fill', status: 'ok', badge: 3 });
  assert.equal(satModule(hr, { pending: 0 }).badge, 0);
  for (const bad of [null, {}, { pending: '2' }, { pending: -1 }, { pending: Number.NaN }]) {
    const m = satModule(hr, bad);
    assert.equal(m.status, 'down');
    assert.equal(m.badge, null);
  }
});

void test('relay keeps HR 4xx errors and turns outages into 502', () => {
  assert.deepEqual(relay(200, { people: [] }), { status: 200, body: { people: [] } });
  assert.deepEqual(relay(404, { error: 'Không tìm thấy nhân sự.' }), { status: 404, body: { error: 'Không tìm thấy nhân sự.' } });
  assert.deepEqual(relay(403, { error: 'Sai bí mật liên kết.' }), { status: 403, body: { error: 'Sai bí mật liên kết.' } });
  for (const [status, body] of [[0, null], [500, { error: 'x' }], [503, null], [404, null], [400, '<html>'], [200, null], [200, [1]], [302, null], [401, { error: 'Đăng nhập' }]] as const)
    assert.deepEqual(relay(status, body), { status: 502, body: { error: HR_DOWN } });
});

void test('posAccountsOf keeps unique non-empty ids', () => {
  assert.deepEqual(posAccountsOf({ posAccounts: ['a', ' a ', '', 'b', 3, null] }), ['a', 'b']);
  assert.deepEqual(posAccountsOf({}), []);
  assert.deepEqual(posAccountsOf({ posAccounts: 'a' }), []);
});

void test('performanceOf picks the current month and the last 6 months', () => {
  const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const series = months.map((month, i) => ({ month, revenue: (i + 1) * 1e6, closedOrders: i + 1, rank: i === 11 ? 2 : null, peers: i === 11 ? 9 : 0, aov: null, dataRate: null }));
  const p = performanceOf('pos-1', { month: '2026-10', prevSameDays: 5e6, lifetime: { revenue: 78e6, closedOrders: 78, firstDay: '2025-11-03' }, series });
  assert.equal(p.posUserId, 'pos-1');
  assert.equal(p.revenue, 12e6);
  assert.equal(p.closedOrders, 12);
  assert.equal(p.rank, 2);
  assert.equal(p.peers, 9);
  assert.equal(p.prevSameDays, 5e6);
  assert.deepEqual(p.lifetime, { revenue: 78e6, closedOrders: 78, firstDay: '2025-11-03' });
  assert.deepEqual(p.series.map((s) => s.month), months.slice(-6));
  assert.deepEqual(Object.keys(p.series[0]), ['month', 'revenue', 'closedOrders']);
  const empty = performanceOf('pos-2', { month: '2026-10', prevSameDays: 0, lifetime: { revenue: 0, closedOrders: 0, firstDay: null }, series: [] });
  assert.deepEqual([empty.revenue, empty.closedOrders, empty.rank, empty.peers, empty.series.length], [0, 0, null, 0, 0]);
});

void test('decisionSummary describes the decision for the audit log', () => {
  assert.equal(decisionSummary({ ids: ['a', 'b'], decision: 'approve' }, { done: 2, skipped: 0 }), 'Duyệt 2 yêu cầu thay đổi nhân sự: xong 2, bỏ qua 0');
  assert.equal(decisionSummary({ ids: ['a'], decision: 'reject', note: ' Sai phòng ban ' }, { done: 1, skipped: 0 }), 'Từ chối 1 yêu cầu thay đổi nhân sự: xong 1, bỏ qua 0 · Lý do: Sai phòng ban');
  assert.equal(decisionSummary(null, {}), 'Duyệt 0 yêu cầu thay đổi nhân sự: xong 0, bỏ qua 0');
});

void test('decisionSummary never leaves half an emoji for the audit header', () => {
  const prefix = 'Từ chối 1 yêu cầu thay đổi nhân sự: xong 1, bỏ qua 0 · Lý do: ';
  // Emoji nằm vắt qua vị trí 500.
  const cut = decisionSummary({ ids: ['a'], decision: 'reject', note: `${'a'.repeat(499 - prefix.length)}😀😀` }, { done: 1, skipped: 0 });
  assert.equal(cut, `${prefix}${'a'.repeat(499 - prefix.length)}`);
  assert.doesNotThrow(() => encodeURIComponent(cut));
  // Ghi chú có ký tự hỏng (nửa emoji gửi qua JSON).
  const broken = decisionSummary(JSON.parse('{"ids":["a"],"decision":"reject","note":"sai \\ud83d phòng"}'), { done: 1, skipped: 0 });
  assert.equal(broken, `${prefix}sai \ufffd phòng`);
  assert.doesNotThrow(() => encodeURIComponent(broken));
});
