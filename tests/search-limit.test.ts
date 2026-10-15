import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { env } from 'cloudflare:workers';
import { checkSearchLimit } from '../lib/search-limit';
import { GET as orders } from '../app/api/raw/orders/route';
import { GET as customers } from '../app/api/reports/customers/route';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';

let raw: DatabaseSync;
let userId: string;
const dataQueries: string[] = [];
const routes = [
  { get: orders, path: '/api/raw/orders', params: {} },
  { get: customers, path: '/api/reports/customers', params: {} },
  { get: customers, path: '/api/reports/customers', params: { start: '2026-10-01', end: '2026-10-15' } },
] as const;
const request = (route: typeof routes[number], q?: string, ip = '192.0.2.1') => {
  const params = new URLSearchParams({ posIds: 'thuy-san', ...route.params });
  if (q !== undefined) params.set('q', q);
  return new Request(`https://x${route.path}?${params}`, { headers: { 'CF-Connecting-IP': ip } });
};

beforeEach(async () => {
  delete env.SEARCH_LIMIT;
  const setup = emptyDb();
  raw = setup.raw;
  const prepare = setup.db.prepare.bind(setup.db);
  env.DB.prepare = (sql: string) => {
    if (/\b(raw_pos_orders|customer_stats)\b/.test(sql)) dataQueries.push(sql);
    return prepare(sql);
  };
  userId = await loginAs(raw, 'owner');
  dataQueries.length = 0;
});
afterEach(() => { delete env.SEARCH_LIMIT; logout(); raw.close(); });

void test('checkSearchLimit: thiếu binding cho qua; binding nhận đúng mã người dùng và trả lỗi 429', async () => {
  assert.equal(await checkSearchLimit({}, 'u-a'), null);
  const keys: string[] = [];
  const binding: RateLimit = { limit: async ({ key }) => { keys.push(key); return { success: key === 'u-a' }; } };
  assert.equal(await checkSearchLimit({ SEARCH_LIMIT: binding }, 'u-a'), null);
  const response = await checkSearchLimit({ SEARCH_LIMIT: binding }, 'u-b');
  assert.equal(response?.status, 429);
  assert.deepEqual(await response?.json(), { error: 'Tìm quá nhanh, thử lại sau ít giây.' });
  assert.deepEqual(keys, ['u-a', 'u-b']);
});

void test('hai route dùng chung 30 lượt/phút: lượt 31 trả 429 trước khi đọc dữ liệu, phút sau tìm lại được', async () => {
  let now = 0;
  const counts = new Map<string, number>();
  const keys: string[] = [];
  env.SEARCH_LIMIT = {
    limit: async ({ key }) => {
      keys.push(key);
      const bucket = `${key}:${Math.floor(now / 60000)}`;
      const count = (counts.get(bucket) ?? 0) + 1;
      counts.set(bucket, count);
      return { success: count <= 30 };
    },
  };
  for (let i = 0; i < 30; i++) {
    const route = routes[i % routes.length];
    assert.equal((await route.get(request(route, 'Khách A'))).status, 200);
  }
  dataQueries.length = 0;
  for (const route of routes) {
    const response = await route.get(request(route, 'Khách B', '192.0.2.2'));
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'Tìm quá nhanh, thử lại sau ít giây.' });
  }
  assert.equal(dataQueries.length, 0);
  assert.ok(keys.every((key) => key === userId));
  now = 60000;
  assert.equal((await orders(request(routes[0], 'Khách A'))).status, 200);
});

void test('hạn mức theo từng người: người khác cùng IP vẫn tìm được khi người trước hết lượt', async () => {
  const blockedUser = userId;
  const keys: string[] = [];
  env.SEARCH_LIMIT = { limit: async ({ key }) => { keys.push(key); return { success: key !== blockedUser }; } };
  assert.equal((await orders(request(routes[0], 'Khách A'))).status, 429);
  const otherUser = await loginAs(raw, 'owner');
  assert.equal((await customers(request(routes[1], 'Khách A'))).status, 200);
  assert.deepEqual(keys, [blockedUser, otherUser]);
});

void test('GET thiếu q, q rỗng hoặc chỉ khoảng trắng không gọi binding ở cả hai route', async () => {
  let calls = 0;
  env.SEARCH_LIMIT = { limit: async () => { calls++; return { success: false }; } };
  for (const route of routes) {
    for (const q of [undefined, '', '   ']) assert.equal((await route.get(request(route, q))).status, 200);
  }
  assert.equal(calls, 0);
});

void test('GET có q khi thiếu binding vẫn trả dữ liệu ở cả hai route', async () => {
  for (const route of routes) assert.equal((await route.get(request(route, 'Khách A'))).status, 200);
});

void test('chưa đăng nhập: trả 401 và không gọi binding tìm kiếm', async () => {
  logout();
  let calls = 0;
  env.SEARCH_LIMIT = { limit: async () => { calls++; return { success: false }; } };
  for (const route of routes) assert.equal((await route.get(request(route, 'Khách A'))).status, 401);
  assert.equal(calls, 0);
  assert.equal(dataQueries.length, 0);
});
