// B10 (cải tổ): test cho các file lib/ có đọc / ghi D1 mà chưa có test nào import trực tiếp. D1 giả trên node:sqlite :memory:
// (tests/support/d1-sqlite.ts), dữ liệu ảo. Không gọi mạng: fetch được thay bằng hàm giả, web nhân sự không có bí mật nên không gọi.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { env } from 'cloudflare:workers';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { DEFAULT_METRICS } from '../lib/reports/metrics';
import { clearUserMetrics, companyMetrics, saveCompanyMetrics, saveUserMetrics, userMetrics } from '../lib/reports/metric-prefs';
import { readStaffStatus, saveStaffStatus } from '../lib/teams/staff-status-db';
import { STAFF_STATUS_KEY } from '../lib/teams/staff-status';
import { TEAM_SOURCE_KEY, refreshTeamSource } from '../lib/teams/team-source';
import { setHrTeams, usingHrTeams } from '../lib/teams/team';
import { primaryOwnerId } from '../lib/auth/primary-owner';
import { DEFAULT_WEB_ORIGIN, webOrigin } from '../lib/notify/origin';
import { hotCloseByEmployee } from '../lib/kpi/hot-close';
import { peopleGet, peoplePut } from '../lib/teams/people-api';
import { EMPTY_LEVELS, LEVEL_METRICS, getMeta } from '../lib/teams/people';
import { CHART_KINDS, buildChart, renderChart } from '../lib/bot/bot-charts';
import { hrGet } from '../lib/ops/sat-proxy';
import { HR_FORBIDDEN } from '../lib/ops/satellites';
import { diffStatements, run, upsertStatement } from '../lib/reports/stats-write';
import { createLoginRequest, decideLoginRequest, pendingForUser, pollLoginRequest, requestForApproval } from '../lib/auth/login-requests';
import { productsReport } from '../lib/reports/products-report';
import { groupsOf } from '../lib/reports/product-groups';

const setting = (raw: ReturnType<typeof emptyDb>['raw'], key: string, value: string) =>
  raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value, '2026-11-05T00:00:00Z');

void test('metric-prefs: mặc định công ty, lựa chọn riêng từng tài khoản, xoá thì về mặc định', async () => {
  const { raw } = emptyDb();
  assert.deepEqual(await companyMetrics(), DEFAULT_METRICS);
  const company = { ...DEFAULT_METRICS, rateBase: 'assigned' as const };
  await saveCompanyMetrics(company);
  assert.deepEqual(await companyMetrics(), company);
  assert.deepEqual(await userMetrics('u1'), { settings: company, own: false });
  const own = { ...DEFAULT_METRICS, returnBase: 'closed' as const };
  await saveUserMetrics('u1', own);
  assert.deepEqual(await userMetrics('u1'), { settings: own, own: true });
  await clearUserMetrics('u1');
  assert.deepEqual(await userMetrics('u1'), { settings: company, own: false });
  // Giá trị hỏng trong D1: bỏ qua, dùng mặc định.
  setting(raw, 'metrics:default', '{không phải json');
  assert.deepEqual(await companyMetrics(), DEFAULT_METRICS);
});

void test('staff-status-db: chỉ lưu Tạm nghỉ / Đã nghỉ, "Đang làm" là xoá, giá trị lạ bỏ qua', async () => {
  const { raw } = emptyDb();
  assert.deepEqual(await readStaffStatus(), {});
  assert.deepEqual(await saveStaffStatus({ a: 'paused', b: 'left', c: 'nghi-han' }), { a: 'paused', b: 'left' });
  assert.deepEqual(await saveStaffStatus({ a: 'working' }), { b: 'left' });
  assert.deepEqual(JSON.parse(String(raw.prepare('SELECT value FROM app_settings WHERE key=?').get(STAFF_STATUS_KEY)!.value)), { b: 'left' });
  assert.deepEqual(await saveStaffStatus('sai kiểu'), { b: 'left' });
});

void test('team-source: đọc nguồn team, nhớ 1 phút, force thì đọc lại', async () => {
  const { raw } = emptyDb();
  try {
    setting(raw, TEAM_SOURCE_KEY, 'hr');
    await refreshTeamSource(true);
    assert.equal(usingHrTeams(), true);
    setting(raw, TEAM_SOURCE_KEY, 'pancake');
    await refreshTeamSource();
    assert.equal(usingHrTeams(), true, 'trong 1 phút chưa đọc lại');
    await refreshTeamSource(true);
    assert.equal(usingHrTeams(), false);
  } finally { setHrTeams(false); }
});

void test('primary-owner: chủ hệ thống tạo sớm nhất; chưa có chủ thì null', async () => {
  const { raw } = emptyDb();
  assert.equal(await primaryOwnerId(), null);
  const user = raw.prepare("INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,'x',?,0,?,?)");
  user.run('o-late', 'o2@test', 'Chủ 2', 'owner', '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z');
  user.run('d-first', 'd@test', 'Giám đốc', 'director', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
  user.run('o-early', 'o1@test', 'Chủ 1', 'owner', '2026-09-30T00:00:00Z', '2026-09-30T00:00:00Z');
  assert.equal(await primaryOwnerId(), 'o-early');
});

void test('notify/origin: mặc định tên miền chính, biến WEB_ORIGIN thay được và bỏ dấu / cuối', () => {
  emptyDb();
  assert.equal(webOrigin(), DEFAULT_WEB_ORIGIN);
  Object.assign(env as object, { WEB_ORIGIN: ' https://web.example/// ' });
  try { assert.equal(webOrigin(), 'https://web.example'); } finally { Object.assign(env as object, { WEB_ORIGIN: undefined }); }
});

void test('hot-close: số nhận, số chốt theo SĐT, đơn chốt nóng và đơn hoạt động trong khung', async () => {
  const { raw, db } = emptyDb();
  const S = '2026-11-05T01:00:00', E = '2026-11-05T11:00:00';
  const order = raw.prepare(`INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,phone,seller_id,seller_assigned_at,first_closed_at,first_confirmed_by,status_code,net_total,created_at,fetched_at)
    VALUES (?,?,'1',?,?,?,?,?,?,?,?,?,'x')`);
  order.run('o1', 'p1', 'o1', '0900000001', 'e1', '2026-11-05T02:00:00', '2026-11-05T03:00:00', null, 1, 100, '2026-11-05T02:00:00');
  order.run('o2', 'p1', 'o2', '0900000002', 'e1', '2026-11-05T02:30:00', null, null, 17, 50, '2026-11-05T02:30:00');
  order.run('o3', 'p1', 'o3', '0900000003', 'e2', '2026-11-04T09:00:00', '2026-11-05T04:00:00', null, 1, 70, '2026-11-04T09:00:00');
  order.run('o4', 'p1', 'o4', '0900000001', 'e1', '2026-11-05T05:00:00', '2026-11-05T05:30:00', null, 1, 40, '2026-11-05T05:00:00');
  order.run('o5', 'p1', 'o5', '0900000004', 'e1', '2026-11-05T06:00:00', '2026-11-05T06:30:00', null, 7, 999, '2026-11-05T06:00:00');
  const rows = await hotCloseByEmployee(db, ['p1'], S, E);
  assert.deepEqual(rows.map((r) => r.employeeId), ['e1', 'e2']);
  // e1: nhận 2 SĐT (đơn xoá o5 không tính), chốt 1 SĐT qua 2 đơn (o1, o4).
  assert.deepEqual(rows[0], { employeeId: 'e1', received: 2, closed: 1, rate: 50, hotOrders: 2, hotValue: 140, activityOrders: 2, activityValue: 140 });
  // e2: số được chia trước khung, chốt trong khung → chỉ là đơn hoạt động.
  assert.deepEqual(rows[1], { employeeId: 'e2', received: 0, closed: 0, rate: null, hotOrders: 0, hotValue: 0, activityOrders: 1, activityValue: 70 });
  // Lọc nhân viên và ca riêng: e1 chỉ tính 01:00–03:30 thì o4 (05:30) ra ngoài ca.
  const e1 = await hotCloseByEmployee(db, ['p1'], S, E, ['e1'], '', (id) => id === 'e1' ? [S, '2026-11-05T03:30:00'] : null);
  assert.deepEqual(e1.map((r) => [r.employeeId, r.received, r.closed, r.hotOrders, r.hotValue]), [['e1', 2, 1, 1, 100]]);
});

void test('people-api: đọc cấu hình cấp bậc, lưu có làm sạch, lưu thông tin một người, thiếu dữ liệu thì 400', async () => {
  emptyDb();
  const get = async (q: string) => (await peopleGet(new Request(`http://local/api/hr/people?${q}`))).json() as Promise<{ levels: unknown; metrics: unknown }>;
  assert.deepEqual(await get('levels=1'), { levels: EMPTY_LEVELS, metrics: LEVEL_METRICS });
  const put = (body: unknown) => peoplePut(new Request('http://local/api/hr/people', { method: 'PUT', body: JSON.stringify(body) }));
  const saved = await (await put({ levels: { sale: [{ id: '  lv1 ', name: '', conditions: [{ metric: 'revenue', min: -5, months: 99 }, { metric: 'khong-co', min: 1, months: 1 }] }], cskh: 'sai' } })).json() as { levels: unknown };
  assert.deepEqual(saved.levels, { sale: [{ id: 'lv1', name: 'Bậc 1', conditions: [{ metric: 'revenue', min: 0, months: 12 }] }], cskh: [], mkt: [] });
  assert.deepEqual((await get('levels=1')).levels, saved.levels);
  assert.equal((await put({ id: 'nv-1', meta: { title: '  Leader  ', note: 'x'.repeat(1200), joinedAt: '' } })).status, 200);
  const meta = (await getMeta())['nv-1'];
  assert.deepEqual([meta.title, meta.note?.length, meta.joinedAt, meta.managerId], ['Leader', 1000, null, null]);
  assert.equal((await put({})).status, 400);
});

void test('bot-charts: dựng biểu đồ từ báo cáo rồi nhờ QuickChart (fetch giả); QuickChart lỗi thì báo lỗi', async () => {
  emptyDb();
  const calls: { url: string; body: { chart: { type: string } } }[] = [];
  const fake = mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') });
    return Response.json({ success: true, url: 'https://chart.example/a.png' });
  });
  try {
    const period = { start: '2026-11-01', end: '2026-11-05', label: 'tháng này' } as Parameters<typeof buildChart>[1];
    const out = await buildChart('pos', period, []);
    assert.equal(out.url, 'https://chart.example/a.png');
    assert.ok(out.caption.startsWith(`${CHART_KINDS.pos} · tháng này · tất cả POS`));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://quickchart.io/chart/create');
    assert.ok(calls[0].body.chart.type);
    fake.mock.mockImplementation(async () => Response.json({ success: false }));
    await assert.rejects(renderChart({ type: 'bar' }), /Không tạo được ảnh biểu đồ/);
  } finally { fake.mock.restore(); }
});

void test('sat-proxy: hrGet chặn khi chưa đăng nhập hoặc không có quyền Nhân sự; web nhân sự không gọi được thì 502', async () => {
  const { raw } = emptyDb();
  const req = new Request('http://local/api/app/hr/people?q=a&khac=b');
  logout();
  assert.equal((await hrGet(req, '/api/v1/app/people', ['q'])).status, 401);
  await loginAs(raw, 'staff', { views: ['shift'] });
  const denied = await hrGet(req, '/api/v1/app/people', ['q']);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json() as { error: string }).error, HR_FORBIDDEN);
  // Chủ hệ thống: chưa có bí mật web nhân sự nên không gọi đi đâu, trả 502 và không cho lưu đệm.
  await loginAs(raw, 'owner');
  const down = await hrGet(req, '/api/v1/app/people', ['q']);
  assert.equal(down.status, 502);
  assert.equal(down.headers.get('Cache-Control'), 'private, no-store');
  logout();
});

void test('stats-write: ghi theo khoá, dòng không đổi thì không ghi, so khoảng ngày để thêm / xoá', async () => {
  const { raw, db } = emptyDb();
  raw.exec('CREATE TABLE t_stats (id TEXT PRIMARY KEY, pos_id TEXT, day TEXT, n INTEGER, net INTEGER, updated_at TEXT)');
  const key = { pos_id: 'p', day: '2026-11-01' };
  assert.equal(await run(db, [upsertStatement(db, 't_stats', key, { n: 2, net: 100 }, 'T1')]), 1);
  assert.equal(await run(db, [upsertStatement(db, 't_stats', key, { n: 2, net: 100 }, 'T2')]), 0, 'không đổi thì không ghi');
  assert.equal(raw.prepare('SELECT updated_at FROM t_stats WHERE id=?').get('p:2026-11-01')!.updated_at, 'T1');
  raw.prepare("INSERT INTO t_stats (id,pos_id,day,n,net,updated_at) VALUES ('p:2026-10-30','p','2026-10-30',9,9,'T0')").run();
  const existing = raw.prepare('SELECT id,n,net FROM t_stats').all() as Record<string, string | number>[];
  const rows = [
    { pos_id: 'p', day: '2026-11-01', n: 2, net: 100 },
    { pos_id: 'p', day: '2026-11-02', n: 1, net: 50 },
    { pos_id: 'p', day: '2026-10-29', n: 5, net: 5 },
  ];
  const statements = diffStatements(db, 't_stats', (r) => ({ pos_id: String(r.pos_id), day: String(r.day) }), ['n', 'net'], { start: '2026-11-01', end: '2026-11-02' }, rows, existing, 'T3');
  assert.equal(statements.length, 2, 'một dòng mới + một câu xoá dòng không còn');
  assert.equal(await run(db, statements), 2);
  assert.deepEqual((raw.prepare('SELECT id,n FROM t_stats ORDER BY id').all() as { id: string; n: number }[]).map((r) => [r.id, r.n]), [['p:2026-11-01', 2], ['p:2026-11-02', 1]]);
});

void test('login-requests: QR chờ, chọn sai số là từ chối, chọn đúng thì máy tính vào được đúng một lần', async () => {
  const { raw } = emptyDb();
  const userId = await loginAs(raw, 'staff', { views: ['shift'] });
  logout();
  const req = () => new Request('http://local/api/auth/qr', { headers: { 'user-agent': 'Mozilla/5.0 (Test)' } });
  const a = await createLoginRequest(req(), 'qr', null);
  assert.equal((await pollLoginRequest(req(), a.id, a.pollToken)).status, 'pending');
  assert.equal((await pollLoginRequest(req(), a.id, 'sai-ma')).status, 'invalid');
  const shown = await requestForApproval(a.id, userId);
  assert.ok(shown && shown.choices.length === 3 && shown.choices.includes(a.number));
  const wrong = shown.choices.find((n) => n !== a.number)!;
  assert.deepEqual(await decideLoginRequest(a.id, userId, null, wrong, 'approve'), { ok: false, status: 'wrong-number', kind: 'qr', device: shown.device === 'Máy không rõ' ? null : shown.device });
  assert.equal((await pollLoginRequest(req(), a.id, a.pollToken)).status, 'denied');
  const b = await createLoginRequest(req(), 'approve', userId);
  assert.deepEqual((await pendingForUser(userId)).map((r) => r.id), [b.id]);
  assert.equal((await decideLoginRequest(b.id, userId, null, b.number, 'approve')).ok, true);
  const done = await pollLoginRequest(req(), b.id, b.pollToken);
  assert.equal(done.status, 'done');
  assert.ok(done.headers?.get('set-cookie'));
  assert.equal((await pollLoginRequest(req(), b.id, b.pollToken)).status, 'consumed');
});

void test('products-report: dòng sản phẩm của đơn chốt (bỏ quà, đơn huỷ), hoàn theo trạng thái hoặc trả một phần, so kỳ trước', async () => {
  const { raw } = emptyDb();
  const order = raw.prepare("INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,status_code,first_closed_at,created_at,fetched_at) VALUES (?,'p1','1',?,?,?,?,'x')");
  const item = raw.prepare("INSERT INTO raw_pos_order_items (id,order_id,pos_id,name,quantity,returned_count,line_total,is_bonus) VALUES (?,?,'p1',?,?,?,?,?)");
  order.run('c1', 'c1', 3, '2026-10-10T03:00:00', '2026-10-10T02:00:00');
  item.run('c1-1', 'c1', 'GENTADOX 100ml', 2, 1, 400, 0); // trả lại 1
  item.run('c1-2', 'c1', 'Men vi sinh', 1, 0, 100, 0);
  item.run('c1-3', 'c1', 'Quà tặng móc khoá', 1, 0, 0, 0); // tên quà tặng: bỏ
  item.run('c1-4', 'c1', 'Men vi sinh', 1, 0, 0, 1); // hàng tặng: bỏ
  order.run('c2', 'c2', 5, '2026-10-10T05:00:00', '2026-10-10T04:00:00'); // đã hoàn: cả số lượng là hoàn
  item.run('c2-1', 'c2', 'GENTADOX 100ml', 1, 0, 200, 0);
  order.run('x1', 'x1', 6, '2026-10-10T06:00:00', '2026-10-10T06:00:00'); // huỷ: bỏ
  item.run('x1-1', 'x1', 'GENTADOX 100ml', 5, 0, 1000, 0);
  order.run('b1', 'b1', 3, '2026-10-09T03:00:00', '2026-10-09T02:00:00'); // kỳ trước
  item.run('b1-1', 'b1', 'Men vi sinh', 3, 0, 300, 0);
  item.run('b1-2', 'b1', 'SK + GK', 1, 0, 80, 0);
  const r = await productsReport({ posIds: ['p1'], start: '2026-10-10', end: '2026-10-10' });
  assert.deepEqual(r.prevPeriod.cutoff, null);
  assert.deepEqual([r.prevPeriod.start, r.prevPeriod.end], ['2026-10-09', '2026-10-09']);
  assert.deepEqual(r.rows.map((x) => [x.name, x.orders, x.qty, x.revenue, x.returnedQty, x.prevRevenue]), [['GENTADOX 100ml', 2, 3, 600, 2, 0], ['Men vi sinh', 1, 1, 100, 0, 300]]);
  assert.equal(r.rows[0].returnRate, 2 / 3 * 100);
  assert.deepEqual(r.total, { products: 2, qty: 4, revenue: 700, returnedQty: 2, prevRevenue: 380, returnRate: 50 });
  // Nhóm: cộng theo nhóm của tên sản phẩm; sản phẩm chỉ có ở kỳ trước vẫn vào doanh thu kỳ trước của nhóm.
  const g = (name: string) => groupsOf(null, [name], 'main', 'product')[0];
  const expected = new Map<string, { revenue: number; qty: number; prevRevenue: number }>();
  const add = (name: string, revenue: number, qty: number, prev: number) => { const x = expected.get(g(name)) ?? { revenue: 0, qty: 0, prevRevenue: 0 }; x.revenue += revenue; x.qty += qty; x.prevRevenue += prev; expected.set(g(name), x); };
  add('GENTADOX 100ml', 600, 3, 0); add('Men vi sinh', 100, 1, 300); add('SK + GK', 0, 0, 80);
  assert.deepEqual(new Map(r.groups.map(({ label, ...x }) => [label, x])), expected);
  assert.deepEqual(r.series.map((x) => [x.name, x.points]), [['GENTADOX 100ml', [{ day: '2026-10-10', revenue: 600, qty: 3 }]], ['Men vi sinh', [{ day: '2026-10-10', revenue: 100, qty: 1 }]]]);
});
