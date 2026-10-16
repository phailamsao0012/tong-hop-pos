import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { buildMyTasks, dueState, loadTaskData, scopeAllowed, stuckState, type TaskData, type TaskUser } from '../lib/my-tasks';
import { demoTaskData } from '../lib/demo/my-tasks';
import { d1, emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import { GET } from '../app/api/tasks/route';

const DAY = 86400000;
const now = Date.parse('2026-10-15T03:00:00Z');
const at = (days: number) => new Date(now - days * DAY).toISOString();
const user: TaskUser = { role: 'staff', email: 'nv-a', views: [], posIds: ['thuy-san'], team: 'all' };
const empty = (): TaskData => ({ stuck: [], callback: [], dormant: [] });

void test('stuck: đúng biên 24h, 48h và thời gian UTC không hậu tố', () => {
  assert.equal(stuckState(at(1), now), null);
  assert.equal(stuckState(new Date(now - DAY - 1).toISOString(), now), 'today');
  assert.equal(stuckState(at(2).slice(0, 19), now), 'today');
  assert.equal(stuckState(new Date(now - 2 * DAY - 1).toISOString(), now), 'overdue');
  assert.equal(stuckState('invalid', now), null);
});
void test('dueState: đổi ngày lúc nửa đêm Việt Nam, không phải UTC', () => {
  const midnight = Date.parse('2026-10-14T17:00:00Z');
  assert.equal(dueState('2026-10-14T16:59:59', midnight), 'overdue');
  assert.equal(dueState('2026-10-14T17:00:00', midnight), 'today');
  assert.equal(dueState('2026-10-15T16:59:59Z', midnight), 'today');
  assert.equal(dueState('2026-10-15T17:00:00Z', midnight), 'planned');
});
void test('callback: 15/20 ngày, tới hạn trong ngày và chưa từng ghi chú', () => {
  const data = empty();
  data.callback = [14.9, 15, 19.9, 20, 20.1].map((days, i) => ({ id: 'c' + i, phone: '0900000001', lastNoteAt: at(days) }));
  data.callback.push({ id: 'never', phone: '0900000001', lastNoteAt: null });
  const result = buildMyTasks(data, user, now);
  assert.deepEqual(result.counts, { overdue: 2, today: 2, planned: 1 });
  assert.equal(result.items.find((i) => i.id === 'c1')?.dueAt, at(-5));
});
void test('dormant: quá hạn, hôm nay, bảy ngày tới và loại ngoài cửa sổ', () => {
  const data = empty();
  data.dormant = [21, 20, 13, 12, 51].map((days) => ({ customerId: 'c1', phone: '0900000001', lastAt: at(days), gap: 20 }));
  assert.deepEqual(buildMyTasks(data, user, now).counts, { overdue: 1, today: 1, planned: 1 });
});
void test('che SĐT ở mọi trường trả về cho staff/lead, giữ số cho owner/director', () => {
  const data = empty();
  data.callback.push({ id: 'c1', phone: '0900000001', lastNoteAt: null });
  data.dormant.push({ customerId: 'c1', phone: '0900000001', lastAt: at(20), gap: 20 });
  for (const role of ['staff', 'lead', 'owner', 'director'] as const) {
    const result = buildMyTasks(data, { ...user, role }, now);
    assert.equal(JSON.stringify(result).includes('0900000001'), role === 'owner' || role === 'director');
    for (const item of result.items) assert.equal(item.subtitle, item.link.hint['customer360.phone']);
  }
});
void test('counts và thứ tự quá hạn trước; link đơn có mã đơn', () => {
  const data = demoTaskData(user, 'mine', now);
  const result = buildMyTasks(data, user, now);
  assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), result.items.length);
  assert.equal(result.items[0].state, 'overdue');
  assert.equal(result.items.find((i) => i.kind === 'stuck')?.link.hint['raw.q'], 'DEMO-1');
  for (const item of result.items.filter((i) => i.kind !== 'stuck')) assert.ok(item.customerId);
});
void test('scope: staff chỉ mine; lead thêm team; owner/director thêm all', () => {
  for (const role of ['staff', 'lead', 'owner', 'director'] as const) {
    const a = { ...user, role };
    assert.equal(scopeAllowed(a, 'mine'), true);
    assert.equal(scopeAllowed(a, 'team'), role !== 'staff');
    assert.equal(scopeAllowed(a, 'all'), role === 'owner' || role === 'director');
  }
});
void test('SQL: email không phân biệt hoa thường, đúng POS, seller/creator, trạng thái, cửa sổ và LIMIT 200', async () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE pos_users(pos_id TEXT,user_id TEXT,email TEXT,department TEXT,name TEXT);
    CREATE TABLE raw_pos_orders(id TEXT,pos_id TEXT,source_order_id TEXT,status_code INTEGER,created_at TEXT,seller_id TEXT,creator_id TEXT);
    CREATE INDEX idx_raw_orders_pos_status_origin ON raw_pos_orders(pos_id,status_code,seller_id,created_at);
    CREATE TABLE pos_customers(id TEXT,pos_id TEXT,phone TEXT,last_note_at TEXT,assigned_user_id TEXT);
    CREATE TABLE customer_stats(pos_id TEXT,phone TEXT,success_orders INTEGER,first_success_at TEXT,last_success_at TEXT,seller_id TEXT,success_net INTEGER);
    CREATE TABLE hr_pos_team(pos_user_id TEXT,status TEXT);`);
  raw.prepare('INSERT INTO pos_users VALUES (?,?,?,?,?)').run('thuy-san', 'a', 'NV-A', 'sale', 'NV A SALE');
  raw.prepare('INSERT INTO pos_users VALUES (?,?,?,?,?)').run('thuy-san', 'b', 'nv-b', 'cskh', 'NV B CSKH');
  const insert = raw.prepare('INSERT INTO raw_pos_orders VALUES (?,?,?,?,?,?,?)');
  for (let i = 0; i < 205; i++) insert.run('o' + i, 'thuy-san', 'CODE-' + i, i % 2 ? 17 : 0, at(3).slice(0, 19), i % 2 ? 'a' : 'b', 'a');
  insert.run('other-pos', 'other', 'NO', 0, at(4), 'a', null);
  insert.run('other-user', 'thuy-san', 'NO', 0, at(4), 'b', null);
  insert.run('old', 'thuy-san', 'NO', 0, at(31), 'a', null);
  insert.run('confirmed', 'thuy-san', 'NO', 1, at(4), 'a', null);
  insert.run('fresh', 'thuy-san', 'NO', 0, at(0.5), 'a', null);
  raw.prepare('INSERT INTO pos_customers VALUES (?,?,?,?,?)').run('c1', 'thuy-san', '0900000001', null, 'a');
  raw.prepare('INSERT INTO pos_customers VALUES (?,?,?,?,?)').run('c2', 'other', '0900000001', null, 'a');
  raw.prepare('INSERT INTO customer_stats VALUES (?,?,?,?,?,?,?)').run('thuy-san', '0900000001', 2, at(40), at(20), 'a', 100);
  const data = await loadTaskData(d1(raw), user, 'mine', now);
  assert.equal(data.stuck.length, 200);
  assert.ok(data.stuck.every((r) => r.code.startsWith('CODE-')));
  assert.deepEqual(data.callback.map((r) => r.id), ['c1']);
  assert.equal(data.dormant.length, 1);
  assert.equal(data.dormant[0].customerId, 'c1');
  const lead = { ...user, role: 'lead' as const, team: 'cskh' as const };
  const scoped = await loadTaskData(d1(raw), lead, 'team', now);
  assert.ok(scoped.stuck.some((r) => r.id === 'other-user'));
  assert.equal(scoped.callback.length, 0);
  assert.equal(scoped.dormant.length, 0);
  raw.prepare('INSERT INTO pos_customers VALUES (?,?,?,?,?)').run('c9', 'thuy-san', '0900000001', null, 'b');
  raw.prepare('INSERT INTO pos_customers VALUES (?,?,?,?,?)').run('z-foreign', 'other', '0900000001', null, 'a');
  assert.equal((await loadTaskData(d1(raw), user, 'mine', now)).dormant[0].customerId, 'c9');
  const multiPosUser = { ...user, posIds: ['thuy-san', 'other'] };
  assert.equal((await loadTaskData(d1(raw), multiPosUser, 'mine', now)).dormant[0].customerId, 'c9');
  raw.prepare('INSERT INTO pos_users VALUES (?,?,?,?,?)').run('other', 'a', 'NV-A', 'sale', 'NV A SALE');
  assert.equal((await loadTaskData(d1(raw), multiPosUser, 'mine', now)).dormant[0].customerId, 'z-foreign');
  assert.equal((await loadTaskData(d1(raw), user, 'mine', now)).dormant[0].customerId, 'c9');
  const addCustomer = raw.prepare('INSERT INTO pos_customers VALUES (?,?,?,?,?)');
  for (let i = 0; i < 305; i++) addCustomer.run('extra-' + i, 'thuy-san', '0900000002', null, 'a');
  assert.equal((await loadTaskData(d1(raw), user, 'mine', now)).callback.length, 300);
  await assert.rejects(loadTaskData(d1(raw), user, 'all', now));
  raw.close();
});
void test('API demo: 401, scope 400/403, trả đủ ba loại và cache riêng 60s', async () => {
  const { raw } = emptyDb({ DEMO_MODE: '1' });
  logout();
  assert.equal((await GET(new Request('http://localhost/api/tasks'))).status, 401);
  await loginAs(raw, 'staff', { posIds: ['thuy-san'] });
  assert.equal((await GET(new Request('http://localhost/api/tasks?scope=all'))).status, 403);
  assert.equal((await GET(new Request('http://localhost/api/tasks?scope=team'))).status, 403);
  assert.equal((await GET(new Request('http://localhost/api/tasks?scope=bad'))).status, 400);
  const response = await GET(new Request('http://localhost/api/tasks'));
  assert.equal(response.headers.get('Cache-Control'), 'private, max-age=60');
  const result = await response.json() as ReturnType<typeof buildMyTasks>;
  assert.deepEqual(new Set(result.items.map((r) => r.kind)), new Set(['stuck', 'callback', 'dormant']));
  assert.equal(JSON.stringify(result).includes('0900000001'), false);
  await loginAs(raw, 'lead');
  assert.equal((await GET(new Request('http://localhost/api/tasks?scope=team'))).status, 200);
  assert.equal((await GET(new Request('http://localhost/api/tasks?scope=all'))).status, 403);
  await loginAs(raw, 'director');
  assert.equal((await GET(new Request('http://localhost/api/tasks?scope=all'))).status, 200);
  logout();
  Object.assign(env, { DEMO_MODE: '0' });
  raw.close();
});
