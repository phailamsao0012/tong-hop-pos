// Đợt 0 (vá an toàn): tham số lạ không làm lỗi 500, route chỉ chủ hệ thống tự chặn (không chỉ dựa vào worker), header bảo vệ.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';

let raw: DatabaseSync;
before(() => { ({ raw } = emptyDb({ AUTH_SECRET: 'x', REPORT_TIMEZONE: 'Asia/Ho_Chi_Minh' })); });
after(logout);

const get = async (mod: string, qs: string) => {
  const { GET } = await import(mod) as { GET: (r: Request) => Promise<Response> };
  return GET(new Request(`https://x/api?${qs}`));
};

void test('sort / group / basis = constructor, __proto__, toString: không lỗi 500 (Object.hasOwn)', async () => {
  await loginAs(raw, 'owner');
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    for (const [mod, qs] of [
      ['../app/api/reports/care/route', `sort=${bad}`],
      ['../app/api/reports/customers/route', `sort=${bad}&segment=${bad}&group=${bad}`],
      ['../app/api/raw/orders/route', `group=${bad}`],
      ['../app/api/reports/origin/route', `basis=${bad}&by=${bad}&start=2026-10-01&end=2026-10-02`],
    ] as const) {
      const res = await get(mod, qs);
      assert.notEqual(res.status, 500, `${mod}?${qs} → 500: ${await res.text()}`);
    }
  }
});

void test('route chỉ chủ hệ thống tự chặn người khác (403), kể cả khi gọi thẳng không qua worker', async () => {
  await loginAs(raw, 'director');
  const { GET: cfg } = await import('../app/api/config/route');
  assert.equal((await cfg()).status, 403);
  const { GET: sched } = await import('../app/api/sync/scheduler/route');
  assert.equal((await sched()).status, 403);
  const inspect = await get('../app/api/connection/inspect/route', 'posId=p1');
  assert.equal(inspect.status, 403);
  const { POST: imp } = await import('../app/api/import/route');
  assert.equal((await imp(new Request('https://x/api/import', { method: 'POST', body: '{}' }))).status, 403);
});
