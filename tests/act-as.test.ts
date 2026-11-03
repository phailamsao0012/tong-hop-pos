import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs } from './support/session';
import { getRealSessionUserFromRequest, getSessionUserFromRequest } from '../lib/auth/auth';
import { POST } from '../app/api/auth/act-as/route';

// "Xem như tài khoản này" (anh Vũ 03/11/2026): chủ hệ thống thấy web y hệt tài khoản kia; người khác đặt cookie cũng vô tác dụng.
const req = (cookie: string, body?: unknown) => new Request('http://local/api/auth/act-as', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

void test('chủ hệ thống xem như tài khoản khác: ra đúng quyền người đó; không áp cho chủ hệ thống khác, tài khoản khoá, hay người không phải chủ', async () => {
  const { raw } = emptyDb();
  const staff = await loginAs(raw, 'staff', { posIds: ['sieu-vo-gao'], team: 'sale', views: ['compare'] });
  const staffCookie = (globalThis as { __testCookie?: string }).__testCookie!;
  const owner2 = await loginAs(raw, 'owner');
  const locked = await loginAs(raw, 'lead');
  raw.prepare('UPDATE users SET disabled=1 WHERE id=?').run(locked);
  const owner = await loginAs(raw, 'owner');
  const ownerCookie = (globalThis as { __testCookie?: string }).__testCookie!;

  const acting = await getSessionUserFromRequest(new Request('http://local/', { headers: { cookie: `${ownerCookie}; thp_as=${staff}` } }));
  assert.equal(acting?.userId, staff);
  assert.equal(acting?.role, 'staff');
  assert.deepEqual(acting?.posIds, ['sieu-vo-gao']);
  assert.equal(acting?.team, 'sale');
  assert.equal(acting?.actingAs?.ownerId, owner);
  assert.equal((await getRealSessionUserFromRequest(new Request('http://local/', { headers: { cookie: `${ownerCookie}; thp_as=${staff}` } })))?.userId, owner);

  for (const other of [owner2, locked]) assert.equal((await getSessionUserFromRequest(new Request('http://local/', { headers: { cookie: `${ownerCookie}; thp_as=${other}` } })))?.userId, owner);
  assert.equal((await getSessionUserFromRequest(new Request('http://local/', { headers: { cookie: `${staffCookie}; thp_as=${owner}` } })))?.userId, staff);

  const ok = await POST(req(ownerCookie, { userId: staff }));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie') ?? '', /thp_as=/);
  assert.equal((await POST(req(ownerCookie, { userId: owner2 }))).status, 400);
  assert.equal((await POST(req(staffCookie, { userId: owner }))).status, 403);
  raw.close();
});
