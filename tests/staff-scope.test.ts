import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync } from 'node:fs';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { MENTOR_REPORTS, canView, parseAccess, parseRole, scopeApi } from '../lib/access';
import { mentorOrdersQuery, mentorReport, staffOrderFilter, staffScope, type MentorReport } from '../lib/staff-scope';
import { scopeFromParams, scopeSql } from '../lib/scope-filter';
import { POS } from '../lib/report-model';
import { todayVn } from '../lib/report-time';

const user = { ...parseAccess({ role: 'mentor' }), userId: 'mentor-user' };
const pos = POS[0].id, day = todayVn(), stamp = `${day} 03:00:00`;
function fixture() {
  const { raw, db } = emptyDb();
  raw.exec(`INSERT INTO hr_levels (id,name,rank) VALUES ('lv_mt','Mentor',2),('member','Nhân viên',1);
    INSERT INTO hr_departments (id,name,kind) VALUES ('team-a','Team MKT 1','team'),('team-b','Team Sale TN 1','team');`);
  for (const [employee, staff, name, department] of [
    ['employee-a', 'staff-a', 'NV A', 'team-b'], ['employee-b', 'staff-b', 'NV B', 'team-a'], ['employee-c', 'staff-c', 'NV C', 'team-b'],
  ]) {
    raw.prepare("INSERT INTO hr_employees (id,code,full_name,status,main_user_id) VALUES (?,?,?,'dang_lam',?)").run(employee, employee, name, employee === 'employee-a' ? user.userId : null);
    raw.prepare("INSERT INTO hr_pos_team (pos_user_id,employee_id,employee_name,team,department_id,status) VALUES (?,?,?,'sale',?,'dang_lam')").run(staff, employee, name, department);
    raw.prepare('INSERT INTO hr_assignments (id,employee_id,department_id,level_id,is_primary) VALUES (?,?,?,\'member\',1)').run(`primary-${employee}`, employee, department);
    raw.prepare("INSERT INTO pos_users (id,pos_id,user_id,name,fetched_at) VALUES (?,?,?,?,?)").run(staff, pos, staff, `${name} SALE`, stamp);
  }
  raw.prepare("INSERT INTO hr_assignments (id,employee_id,department_id,level_id,is_primary) VALUES ('mentor-seat','employee-a','team-a','lv_mt',0)").run();
  for (const [id, seller, care, amount, phone] of [
    ['customer-a', 'staff-a', null, 100, '0900000001'], ['customer-b', 'staff-b', null, 200, '0900000002'],
    ['customer-c', 'staff-c', null, 900, '0900000003'], ['customer-d', 'staff-c', 'staff-b', 300, '0900000004'],
  ] as const) {
    raw.prepare('INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,customer_id,customer_name,phone,seller_id,care_id,created_at,first_closed_at,status_code,net_total,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,3,?,?)')
      .run(`order-${id}`, pos, 'shop', `order-${id}`, id, 'Khách ảo', phone, seller, care, stamp, stamp, amount, stamp);
    raw.prepare('INSERT INTO pos_customers (id,pos_id,customer_id,name,phone,assigned_user_id,fetched_at) VALUES (?,?,?,?,?,?,?)').run(id, pos, id, 'Khách ảo', phone, seller, stamp);
    raw.prepare('INSERT INTO stats_daily (id,pos_id,day,seller_id,orders,closed_orders,closed_net,delivered_orders,updated_at) VALUES (?,?,?,?,1,1,?,1,?) ON CONFLICT(id) DO UPDATE SET orders=orders+1,closed_orders=closed_orders+1,closed_net=closed_net+excluded.closed_net,delivered_orders=delivered_orders+1')
      .run(`stats-${seller}`, pos, day, seller, amount, stamp);
  }
  for (const [id, author] of [['note-in', 'staff-b'], ['note-out', 'staff-c']]) raw.prepare('INSERT INTO customer_notes (id,pos_id,customer_id,author_id,message,created_at,fetched_at) VALUES (?,?,?,?,?,?,?)').run(id, pos, 'customer-b', author, 'Gọi số 0900000002', stamp, stamp);
  raw.prepare("INSERT INTO targets (id,month,scope,ref_id,revenue,updated_at) VALUES ('target',?,'employee','staff-b',1000,?)").run(day.slice(0, 7), stamp);
  return { raw, db };
}
const request = (path = '/api/reports/customers', extra: Record<string, string> = {}) => new Request(`http://local${path}?${new URLSearchParams({ start: day, end: day, posIds: pos, ...extra })}`);

void test('C1: Mentor mặc định chặn mọi API ngoài danh sách trắng, mọi phương thức ghi báo cáo và đường dẫn giả', () => {
  assert.equal(parseRole('mentor'), 'mentor');
  const all = readdirSync(new URL('../app/api/', import.meta.url), { recursive: true }).map(String).filter((file) => file.replaceAll('\\', '/').endsWith('/route.ts'));
  for (const file of all) {
    const path = '/api/' + file.replaceAll('\\', '/').replace(/\/route\.ts$/, '');
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const white = path.startsWith('/api/auth/') || path === '/api/prefs/metrics' || (method === 'GET' && MENTOR_REPORTS.includes(path));
      assert.equal(!scopeApi(user, method, new URL(`http://local${path}`)).blocked, white, `${method} ${path}`);
    }
  }
  for (const path of ['/api/unknown', '/api/tasks?scope=all', '/api/reports/customers/export', '/api/reports/customers-evil', '/api/hr/people', '/api/reports/batch']) assert.ok(scopeApi(user, 'GET', new URL(`http://local${path}`)).blocked);
  for (const view of ['people', 'person', 'marketing', 'config', 'custom', 'raw-orders', 'overview', 'tasks']) assert.equal(canView({ ...user, views: [view] }, view), false);
  assert.equal(canView(user, 'mentor'), true);
  assert.equal(canView(user, 'security'), true);
});

void test('C1: thay staffIds giả, cách ly cache mỗi lượt và giữ POS hợp lệ', () => {
  const asked = new URL(`http://local/api/reports/customers?staffIds=staff-c&mentorScope=other&posIds=${pos}`);
  const scoped = scopeApi({ ...user, posIds: [pos] }, 'GET', asked);
  assert.equal(scoped.blocked, undefined);
  assert.equal(scoped.url.searchParams.get('staffIds'), '__none__');
  assert.notEqual(scoped.url.searchParams.get('mentorScope'), 'other');
  assert.notEqual(scoped.url.toString(), scopeApi(user, 'GET', asked).url.toString());
  assert.ok(scopeApi({ ...user, posIds: [pos] }, 'GET', new URL(`http://local/api/reports/customers?posIds=${POS[1].id}`)).blocked);
  assert.equal(asked.searchParams.get('staffIds'), 'staff-c');
});

void test('C1: scope HR = bản thân + team Mentor kiêm nhiệm còn hiệu lực; hết hạn, tương lai, nghỉ việc đều loại', async () => {
  const { raw, db } = fixture();
  try {
    assert.deepEqual(await staffScope(db, user, day), ['staff-a', 'staff-b']);
    raw.prepare("UPDATE hr_assignments SET start_on='2999-01-01' WHERE id='mentor-seat'").run();
    assert.deepEqual(await staffScope(db, user, day), ['staff-a']);
    raw.prepare("UPDATE hr_assignments SET start_on=NULL,end_on='2000-01-01' WHERE id='mentor-seat'").run();
    assert.deepEqual(await staffScope(db, user, day), ['staff-a']);
    raw.prepare("UPDATE hr_assignments SET end_on=NULL WHERE id='mentor-seat'").run();
    raw.prepare("UPDATE hr_employees SET status='da_nghi' WHERE id='employee-b'").run();
    assert.deepEqual(await staffScope(db, user, day), ['staff-a']);
    raw.prepare("UPDATE hr_employees SET status='da_nghi' WHERE id='employee-a'").run();
    assert.deepEqual(await staffScope(db, user, day), []);
  } finally { raw.close(); }
});

void test('C1: liên kết dự phòng, chính thức ưu tiên, thiếu/nhầm/trùng hồ sơ trả rỗng', async () => {
  const { raw, db } = fixture();
  try {
    const fallback = { ...user, userId: 'fallback-user' };
    assert.deepEqual(await staffScope(db, fallback, day), []);
    raw.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?)').run('user_employee:fallback-user', 'employee-a', stamp);
    assert.deepEqual(await staffScope(db, fallback, day), []);
    raw.prepare("UPDATE hr_employees SET main_user_id=NULL WHERE id='employee-a'").run();
    assert.deepEqual(await staffScope(db, fallback, day), ['staff-a', 'staff-b']);
    raw.prepare("UPDATE hr_employees SET main_user_id='fallback-user' WHERE id='employee-c'").run();
    assert.deepEqual(await staffScope(db, fallback, day), ['staff-c']);
    raw.prepare("UPDATE hr_employees SET main_user_id='fallback-user' WHERE id='employee-a'").run();
    assert.deepEqual(await staffScope(db, fallback, day), []);
    assert.equal(staffOrderFilter([]).sql, ' AND 0=1');
    assert.match(scopeSql(scopeFromParams(new URLSearchParams('staffIds=')), { seller: 'o.seller_id', care: 'o.care_id' }), /0=1/);
  } finally { raw.close(); }
});

void test('C1: mọi route khách chặn người ngoài team, lọc seller OR care, che SĐT, không cộng tiền ngoài phạm vi', async () => {
  const { raw, db } = fixture();
  try {
    for (const path of MENTOR_REPORTS.filter((value) => !value.includes('staff-') && !value.endsWith('customer-detail'))) {
      const response = await mentorReport(db, user, request(path, { staffIds: 'staff-c' }));
      assert.equal(response.status, 200);
      const body = await response.json() as MentorReport;
      assert.deepEqual(body.customers.map((row) => row.id).sort(), ['customer-a', 'customer-b', 'customer-d']);
      assert.equal(body.customers.reduce((total, row) => total + row.net, 0), 600);
      assert.doesNotMatch(JSON.stringify(body), /090000000[1-4]/);
      assert.equal((await mentorReport(db, user, request(path, { sellerId: 'staff-c' }))).status, 403);
    }
    raw.prepare("INSERT INTO raw_pos_orders (id,pos_id,shop_id,source_order_id,customer_id,phone,seller_id,first_closed_at,status_code,net_total,fetched_at) VALUES ('outside-same-customer',?,'shop','outside','customer-b','0900000002','staff-c',?,3,9999,?)").run(pos, stamp, stamp);
    const clients = await (await mentorReport(db, user, request())).json() as MentorReport;
    assert.equal(clients.customers.find((row) => row.id === 'customer-b')?.net, 200);
    const detail = await mentorReport(db, user, request('/api/reports/customer-detail', { customerId: 'customer-c' }));
    assert.equal(detail.status, 404);
    const allowed = await mentorReport(db, user, request('/api/reports/customer-detail', { customerId: 'customer-b' }));
    const text = await allowed.text();
    assert.match(text, /note-in/); assert.doesNotMatch(text, /note-out|0900000002/);
    assert.equal((await mentorReport(db, user, request('/api/reports/customers', { posIds: 'unknown' }))).status, 403);
    assert.deepEqual((await (await mentorReport(db, { ...user, userId: 'unlinked' }, request())).json() as MentorReport).customers, []);
    const query = mentorOrdersQuery([pos], ['staff-a', 'staff-b'], day, day);
    const plan = raw.prepare('EXPLAIN QUERY PLAN ' + query.sql).all(...query.binds);
    assert.match(JSON.stringify(plan), /idx_raw_orders_pos_closed_status_money/);
  } finally { raw.close(); }
});

void test('C1: bảng người đúng số, KPI chỉ đọc, đổi ghế thu hồi ngay và route trực tiếp vẫn kiểm phạm vi', async () => {
  const { raw, db } = fixture();
  try {
    const response = await mentorReport(db, user, request('/api/reports/staff-compare'));
    const body = await response.json() as MentorReport;
    assert.deepEqual(body.staff.map((row) => row.id).sort(), ['staff-a', 'staff-b']);
    const member = body.staff.find((row) => row.id === 'staff-b')!;
    assert.equal(member.net, 200); assert.equal(member.closedOrders, 1); assert.equal(member.aov, 200);
    assert.equal(member.closeRate, 100); assert.equal(member.returnRate, 0);
    assert.equal(member.target, 1000); assert.equal(member.monthNet, 200);
    const drill = await (await mentorReport(db, user, request('/api/reports/staff-detail', { sellerId: 'staff-b', orders: '1' }))).json() as MentorReport;
    assert.equal(drill.orderRows?.length, member.closedOrders);
    assert.equal(drill.orderRows?.reduce((sum, row) => sum + row.net, 0), member.net);
    assert.equal(drill.start, day); assert.equal(drill.end, day);
    assert.equal(scopeApi(user, 'POST', new URL('http://local/api/targets')).blocked !== undefined, true);
    raw.prepare("UPDATE hr_assignments SET end_on='2000-01-01' WHERE id='mentor-seat'").run();
    const after = await (await mentorReport(db, user, request('/api/reports/staff-compare'))).json() as MentorReport;
    assert.deepEqual(after.staff.map((row) => row.id), ['staff-a']);
    const sessionId = await loginAs(raw, 'staff');
    raw.prepare("UPDATE users SET role='mentor' WHERE id=?").run(sessionId);
    raw.prepare('UPDATE hr_employees SET main_user_id=? WHERE id=\'employee-a\'').run(sessionId);
    for (const path of MENTOR_REPORTS) {
      const { GET } = await import(`../app${path}/route.ts`) as { GET: (request: Request) => Promise<Response> };
      const result = await GET(request(path, { staffIds: 'staff-c', ...(path.endsWith('customer-detail') ? { customerId: 'customer-a' } : {}) }));
      assert.equal(result.status, 200, path);
      assert.doesNotMatch(await result.text(), /customer-c|0900000003/, path);
    }
  } finally { logout(); raw.close(); }
});

void test('C1: chỉ chủ hệ thống chọn hồ sơ và cấp vai trò Mentor', async () => {
  const { raw } = fixture();
  try {
    const route = await import('../app/api/users/route');
    const id = await loginAs(raw, 'staff');
    assert.equal((await route.GET(new Request('http://local/api/users?employees=1'))).status, 403);
    assert.equal((await route.PUT(new Request('http://local/api/users', { method: 'PUT', body: JSON.stringify({ id, role: 'mentor' }) }))).status, 403);
    await loginAs(raw, 'owner');
    const profiles = await route.GET(new Request('http://local/api/users?employees=1'));
    assert.equal(profiles.status, 200);
    assert.doesNotMatch(await profiles.text(), /phone|email|main_user_id/);
    const update = await route.PUT(new Request('http://local/api/users', { method: 'PUT', body: JSON.stringify({ id, role: 'mentor', employeeId: 'employee-b' }) }));
    assert.equal(update.status, 200, await update.clone().text());
    assert.equal(raw.prepare('SELECT role FROM users WHERE id=?').get(id)?.role, 'mentor');
    assert.equal(raw.prepare('SELECT value FROM app_settings WHERE key=?').get(`user_employee:${id}`)?.value, 'employee-b');
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(id)?.n, 0);
    const invalid = await route.PUT(new Request('http://local/api/users', { method: 'PUT', body: JSON.stringify({ id, employeeId: 'missing' }) }));
    assert.equal(invalid.status, 400);
  } finally { logout(); raw.close(); }
});
