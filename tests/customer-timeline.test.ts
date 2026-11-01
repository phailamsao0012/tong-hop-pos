import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { customerIdPosAllowed, customerAuditTarget, customerPhone, customerTimeline, loadCustomerTimeline, type TimelineData } from '../lib/reports/customer-timeline';
import { d1, emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { GET } from '../app/api/reports/customer-detail/route';

const phone = '0900000001';
const data = (): TimelineData => ({
  notes: [{ id: 'n', created_at: '2026-10-15T01:00:00', author_name: 'NV A', message: 'Gọi ' + phone }],
  orders: [{ id: 'o', source_order_id: 'D1', status_history_json: JSON.stringify([{ old_status: 0, status: 17, updated_at: '2026-10-15T02:00:00Z' }]) }],
  audits: [{ id: 'a', at: '2026-10-15T10:00:00+07:00', action: 'customer.view', name: 'NV A' }],
});
void test('gộp lịch sử và sắp xếp mới nhất trước theo UTC', () => {
  assert.deepEqual(customerTimeline(data(), 'owner').map((i) => i.kind), ['audit', 'status', 'note']);
  assert.match(customerTimeline(data(), 'owner')[1].text, /→/);
});
void test('che SĐT trong ghi chú; chỉ owner thấy nhật ký', () => {
  for (const role of ['lead', 'staff'] as const) {
    assert.equal(customerPhone(phone, role), '•••••••001');
    const list = customerTimeline(data(), role);
    assert.equal(list.some((i) => i.kind === 'audit'), false);
    assert.equal(JSON.stringify(list).includes(phone), false);
    assert.match(list.find((i) => i.kind === 'note')!.text, /•••••••001/);
  }
  assert.equal(customerPhone(phone, 'director'), phone);
  assert.equal(customerTimeline(data(), 'director').some((i) => i.kind === 'audit'), false);
});
void test('bỏ JSON và ngày hỏng; giới hạn lịch sử 20 đơn', () => {
  const rows = data();
  rows.notes.push({ id: 'bad', created_at: 'bad', message: '', author_name: null });
  rows.orders = [{ ...rows.orders[0], id: 'bad', status_history_json: '{}' }, ...Array.from({ length: 21 }, (_, i) => ({ ...data().orders[0], id: String(i) }))];
  const list = customerTimeline(rows, 'owner');
  assert.equal(list.filter((i) => i.kind === 'status').length, 19);
  assert.equal(list.some((i) => i.id === 'note:bad'), false);
});
void test('D1: đúng POS và tổng customer_stats; 20 đơn mới; không đọc raw_json', async () => {
  const raw = new DatabaseSync(':memory:');
  try {
    raw.exec('CREATE TABLE customer_stats (pos_id TEXT,phone TEXT,name TEXT,seller_id TEXT,orders INTEGER,success_orders INTEGER,success_net INTEGER,returned_orders INTEGER,cancelled_orders INTEGER);'
      + 'CREATE TABLE raw_pos_orders (id TEXT,source_order_id TEXT,pos_id TEXT,phone TEXT,seller_id TEXT,created_at TEXT,status_history_json TEXT);'
      + 'CREATE TABLE customer_notes (id TEXT,pos_id TEXT,phone TEXT,customer_id TEXT,created_at TEXT,message TEXT,author_name TEXT);'
      + 'CREATE TABLE pos_customers (pos_id TEXT,customer_id TEXT,phone TEXT);'
      + 'CREATE TABLE audit_log (id TEXT,at TEXT,action TEXT,name TEXT,target TEXT);');
    for (const pos of ['thuy-san', 'other']) raw.prepare('INSERT INTO customer_stats VALUES (?,?,?,?,?,?,?,?,?)').run(pos, phone, 'Khách A', 'nv-a', 25, 10, 1000, 2, 3);
    raw.prepare('INSERT INTO customer_notes VALUES (?,?,?,?,?,?,?)').run('n', 'thuy-san', phone, null, '2026-10-15', 'Ghi chú A', 'NV A');
    raw.prepare('INSERT INTO customer_notes VALUES (?,?,?,?,?,?,?)').run('hidden', 'other', phone, null, '2026-10-15', 'Ngoài POS', 'NV A');
    for (let i = 1; i <= 21; i++) raw.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?,?)').run(String(i), 'D' + i, 'thuy-san', phone, 'nv-a', '2026-10-' + String(i).padStart(2, '0'), JSON.stringify([{ old_status: 0, status: 17, updated_at: '2026-10-15T01:00:00Z' }]));
    const target = await customerAuditTarget(phone, ['thuy-san']);
    raw.prepare('INSERT INTO audit_log VALUES (?,?,?,?,?)').run('a', '2026-10-15T03:00:00Z', 'customer.view', 'NV A', target);
    const access = { role: 'owner' as const, posIds: ['thuy-san'], team: 'all' as const, views: null };
    const result = await loadCustomerTimeline(d1(raw), access, phone, []);
    assert.deepEqual(result?.stats, { orders: 25, success: 10, net: 1000, returned: 2, cancelled: 3 });
    assert.equal(result?.notes, 1);
    assert.equal(result?.timeline.filter((i) => i.kind === 'status').length, 20);
    assert.equal(result?.timeline.some((i) => i.id.startsWith('status:1:')), false);
    assert.equal(result?.timeline.some((i) => i.id === 'note:hidden'), false);
    assert.equal(result?.timeline.filter((i) => i.kind === 'audit').length, 1);
    assert.equal(await loadCustomerTimeline(d1(raw), access, phone, ['other']), null);
    const staff = await loadCustomerTimeline(d1(raw), { ...access, role: 'staff' }, phone, []);
    assert.equal(staff?.phone, '•••••••001');
    assert.equal(staff?.timeline.some((i) => i.kind === 'audit'), false);
  } finally { raw.close(); }
});
void test('route: đăng nhập, quyền xem khách, tham số không hợp lệ', async () => {
  const { raw } = emptyDb();
  const request = (query = 'phone=' + phone) => new Request('http://local/api/reports/customer-detail?' + query);
  try {
    logout(); assert.equal((await GET(request())).status, 401);
    await loginAs(raw, 'staff', { views: [] }); assert.equal((await GET(request())).status, 403);
    await loginAs(raw, 'owner'); assert.equal((await GET(request('phone=bad'))).status, 400);
    assert.equal((await GET(request('phone=' + phone + '&posIds=invalid'))).status, 400);
    assert.equal((await GET(request())).status, 404);
  } finally { logout(); raw.close(); }
});

void test('customerId: POS access', () => {
 const user = { role: 'staff' as const, views: [], posIds: ['thuy-san'], team: 'all' as const };
 assert.equal(customerIdPosAllowed(user, 'thuy-san'), true);
 assert.equal(customerIdPosAllowed(user, 'other'), false);
});

void test('customerId route: POS, assignment, seller, masking and audit', async () => {
  const { raw } = emptyDb();
  const request = (id: string) => new Request('http://local/api/reports/customer-detail?customerId=' + id);
  try {
    const userId = await loginAs(raw, 'staff', { views: [], posIds: ['thuy-san'] });
    raw.prepare('INSERT INTO pos_users (id,pos_id,user_id,email,name,fetched_at) VALUES (?,?,?,?,?,?)').run('u', 'thuy-san', 'seller-a', (userId + '@test').toUpperCase(), 'NV A', '2026-10-15');
    const add = raw.prepare('INSERT INTO pos_customers (id,pos_id,customer_id,phone,assigned_user_id,fetched_at) VALUES (?,?,?,?,?,?)');
    add.run('foreign', 'other', 'c', '0900000001', 'seller-a', '2026-10-15');
    add.run('own', 'thuy-san', 'c', '0900000001', 'seller-a', '2026-10-15');
    raw.prepare('INSERT INTO customer_stats (id,pos_id,phone,name,seller_id,updated_at) VALUES (?,?,?,?,?,?)').run('s', 'thuy-san', '0900000001', 'Customer A', 'other-seller', '2026-10-15');
    assert.equal((await GET(request('foreign'))).status, 403);
    assert.equal((await GET(request('missing'))).status, 403);
    const response = await GET(request('own'));
    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(await response.json()).includes('0900000001'), false);
    assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='customer.view'").get() as { n: number }).n, 1);
    raw.exec("UPDATE pos_customers SET assigned_user_id='other-seller'");
    assert.equal((await GET(request('own'))).status, 403);
    raw.exec("UPDATE customer_stats SET seller_id='seller-a'");
    assert.equal((await GET(request('own'))).status, 200);
    await loginAs(raw, 'staff', { views: ['customer360'], posIds: ['thuy-san'] });
    assert.equal((await GET(request('own'))).status, 200);
    assert.equal((await GET(request('foreign'))).status, 403);
  } finally { logout(); raw.close(); }
});
