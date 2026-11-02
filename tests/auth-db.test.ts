import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDb } from './support/d1-sqlite';
import { loginAs, logout } from './support/session';
import {
  activePasskey,
  deletePasskey,
  deleteTrustedDevice,
  disableTotp,
  enableTotp,
  insertOwner,
  insertPasskey,
  listSessions,
  markPasskeyUsed,
  passkeyOfLockedUser,
  passkeysForExclude,
  passwordHashOf,
  pendingApproveRequest,
  revokeSessions,
  saveTotpSecret,
  securityOverview,
  setPasswordDropSessions,
  totpRow,
  userByEmail,
  userById,
} from '../lib/auth/auth-db';
import { verifyPassword } from '../lib/auth/auth';
import { ensureAuthSchema } from '../lib/auth/auth-schema';

// Câu SQL tách khỏi app/api/auth/* (cải tổ B3): chạy thật trên D1 giả để chắc câu đúng bảng, đúng điều kiện.
const T0 = '2026-11-02T00:00:00.000Z',
  LATER = '2099-01-01T00:00:00.000Z';
function addUser(
  raw: ReturnType<typeof emptyDb>['raw'],
  id: string,
  role = 'staff',
  disabled = 0,
) {
  raw
    .prepare(
      'INSERT INTO users (id,email,name,password_hash,role,disabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(id, `${id}@test`, `Tên ${id}`, 'h-' + id, role, disabled, T0, T0);
}
const addSession = (
  raw: ReturnType<typeof emptyDb>['raw'],
  id: string,
  user: string,
) =>
  raw
    .prepare(
      'INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES (?,?,?,?)',
    )
    .run(id, user, T0, LATER);
const sessionIds = (raw: ReturnType<typeof emptyDb>['raw']) =>
  (
    raw.prepare('SELECT id FROM sessions ORDER BY id').all() as { id: string }[]
  ).map((r) => r.id);

void test('users: tìm theo email/id, đổi mật khẩu huỷ mọi phiên, chỉ đổi mật khẩu thì ghi updated_at', async () => {
  const { raw } = emptyDb();
  addUser(raw, 'a');
  addUser(raw, 'b');
  addSession(raw, 's-a1', 'a');
  addSession(raw, 's-a2', 'a');
  addSession(raw, 's-b', 'b');
  assert.equal((await userByEmail('a@test'))?.id, 'a');
  assert.equal(await userByEmail('khong@test'), null);
  assert.equal((await userById('b'))?.email, 'b@test');
  assert.equal(await passwordHashOf('a'), 'h-a');
  assert.equal(await passwordHashOf('khong'), null);
  await setPasswordDropSessions('a', 'h-moi', '2026-11-02T05:00:00.000Z');
  assert.deepEqual(
    {
      ...raw
        .prepare("SELECT password_hash,updated_at FROM users WHERE id='a'")
        .get(),
    },
    { password_hash: 'h-moi', updated_at: '2026-11-02T05:00:00.000Z' },
  );
  assert.deepEqual(sessionIds(raw), ['s-b']);
  await setPasswordDropSessions('b', 'h-quen');
  assert.deepEqual(
    {
      ...raw
        .prepare("SELECT password_hash,updated_at FROM users WHERE id='b'")
        .get(),
    },
    { password_hash: 'h-quen', updated_at: T0 },
  );
  assert.deepEqual(sessionIds(raw), []);
  await insertOwner('o', 'o@test', 'Chủ', 'h-o', T0);
  assert.deepEqual(
    { ...raw.prepare("SELECT role,disabled FROM users WHERE id='o'").get() },
    { role: 'owner', disabled: 0 },
  );
});

void test('phiên: liệt kê một người / mọi người; chủ hệ thống không gốc không xoá được phiên chủ hệ thống khác', async () => {
  const { raw } = emptyDb();
  addUser(raw, 'goc', 'owner');
  addUser(raw, 'chu2', 'owner');
  addUser(raw, 'nv');
  await ensureAuthSchema(); // cột client, method, ip… do lib/auth/auth-schema.ts thêm (route gọi trước khi liệt kê)
  for (const [s, u] of [
    ['g1', 'goc'],
    ['c1', 'chu2'],
    ['c2', 'chu2'],
    ['n1', 'nv'],
    ['n2', 'nv'],
  ])
    addSession(raw, s, u);
  assert.equal((await listSessions(T0, null)).length, 5);
  assert.deepEqual((await listSessions(T0, 'nv')).map((r) => r.id).sort(), [
    'n1',
    'n2',
  ]);
  assert.equal((await listSessions(T0, 'nv'))[0].name, 'Tên nv');
  // chu2 (không gốc): không xoá phiên của chủ gốc; xoá được phiên nhân viên và của chính mình
  assert.equal(await revokeSessions({ one: { id: 'g1' } }, 'chu2'), 0);
  assert.equal(
    await revokeSessions({ userAll: { userId: 'goc', keep: '' } }, 'chu2'),
    0,
  );
  assert.equal(await revokeSessions({ one: { id: 'n1' } }, 'chu2'), 1);
  assert.equal(await revokeSessions({ one: { id: 'c1' } }, 'chu2'), 1);
  // chủ gốc: xoá được của chu2, giữ phiên đang dùng
  addSession(raw, 'c3', 'chu2');
  assert.equal(
    await revokeSessions({ userAll: { userId: 'chu2', keep: 'c3' } }, null),
    1,
  );
  // nhân viên: chỉ phiên của mình
  assert.equal(
    await revokeSessions({ one: { id: 'g1', ownerOf: 'nv' } }, null),
    0,
  );
  assert.equal(
    await revokeSessions({ others: { userId: 'nv', keep: 'n2' } }, null),
    0,
  );
  assert.deepEqual(sessionIds(raw), ['c3', 'g1', 'n2']);
});

void test('mã ứng dụng: lưu bí mật (chưa bật) → bật → tắt', async () => {
  const { raw } = emptyDb();
  addUser(raw, 'a');
  assert.equal(await totpRow('a'), null);
  await saveTotpSecret('a', 'enc1', T0);
  assert.deepEqual(
    { ...(await totpRow('a')) },
    { totp_secret: 'enc1', totp_enabled_at: null },
  );
  await enableTotp('a', T0);
  assert.equal((await totpRow('a'))?.totp_enabled_at, T0);
  assert.equal((await securityOverview('a', T0)).totpEnabled, true);
  await saveTotpSecret('a', 'enc2', T0); // tạo lại thì tắt bật
  assert.deepEqual(
    { ...(await totpRow('a')) },
    { totp_secret: 'enc2', totp_enabled_at: null },
  );
  await disableTotp('a', T0);
  assert.deepEqual(
    { ...(await totpRow('a')) },
    { totp_secret: null, totp_enabled_at: null },
  );
});

void test('passkey: thêm, tìm (người bị khoá thì báo khoá), cập nhật lần dùng, xoá chỉ của mình; thiết bị tin cậy', async () => {
  const { raw } = emptyDb();
  addUser(raw, 'a');
  addUser(raw, 'khoa', 'staff', 1);
  await insertPasskey({
    id: 'pk1',
    userId: 'a',
    publicKey: 'AAA=',
    counter: 0,
    transports: '["internal"]',
    deviceType: 'multiDevice',
    backedUp: true,
    name: 'Điện thoại',
    createdAt: T0,
  });
  await insertPasskey({
    id: 'pk2',
    userId: 'khoa',
    publicKey: 'BBB=',
    counter: 0,
    transports: '[]',
    deviceType: 'singleDevice',
    backedUp: false,
    name: 'Passkey',
    createdAt: T0,
  });
  assert.deepEqual(
    (await passkeysForExclude('a')).map((r) => ({ ...r })),
    [{ id: 'pk1', transports: '["internal"]' }],
  );
  assert.equal((await activePasskey('pk1'))?.user_id, 'a');
  assert.equal(await activePasskey('pk2'), null);
  assert.equal(await passkeyOfLockedUser('pk2'), true);
  assert.equal(await passkeyOfLockedUser('pk1'), false);
  await markPasskeyUsed('pk1', 'a', 7, '2026-11-02T06:00:00.000Z');
  assert.deepEqual(
    {
      ...raw
        .prepare("SELECT counter,last_used_at FROM passkeys WHERE id='pk1'")
        .get(),
    },
    { counter: 7, last_used_at: '2026-11-02T06:00:00.000Z' },
  );
  assert.equal(
    (
      raw.prepare("SELECT last_login_at FROM users WHERE id='a'").get() as {
        last_login_at: string;
      }
    ).last_login_at,
    '2026-11-02T06:00:00.000Z',
  );
  assert.equal((await securityOverview('a', T0)).passkeys.length, 1);
  await deletePasskey('pk1', 'khoa');
  assert.equal((await securityOverview('a', T0)).passkeys.length, 1);
  await deletePasskey('pk1', 'a');
  assert.equal((await securityOverview('a', T0)).passkeys.length, 0);
  raw
    .prepare(
      'INSERT INTO trusted_devices (id,user_id,created_at,last_used_at,expires_at) VALUES (?,?,?,?,?)',
    )
    .run('d1', 'a', T0, T0, LATER);
  raw
    .prepare(
      'INSERT INTO trusted_devices (id,user_id,created_at,last_used_at,expires_at) VALUES (?,?,?,?,?)',
    )
    .run('d-cu', 'a', T0, T0, '2020-01-01T00:00:00.000Z');
  assert.deepEqual(
    (await securityOverview('a', T0)).devices.map((d) => d.id),
    ['d1'],
  );
  await deleteTrustedDevice('d1', 'a');
  assert.equal((await securityOverview('a', T0)).devices.length, 0);
});

void test('duyệt trên app: chỉ yêu cầu approve còn chờ, chưa hết hạn', async () => {
  const { raw } = emptyDb();
  addUser(raw, 'a');
  const cols = raw.prepare('PRAGMA table_info(login_requests)').all() as {
    name: string;
    notnull: number;
    dflt_value: unknown;
  }[];
  const add = (id: string, kind: string, status: string, expires: string) => {
    const v: Record<string, unknown> = {
      id,
      kind,
      status,
      user_id: 'a',
      poll_hash: 'ph',
      expires_at: expires,
      created_at: T0,
    };
    for (const c of cols)
      if (c.notnull && c.dflt_value === null && !(c.name in v)) v[c.name] = '';
    const names = Object.keys(v).filter((k) => cols.some((c) => c.name === k));
    raw
      .prepare(
        `INSERT INTO login_requests (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
      )
      .run(...names.map((k) => v[k] as string));
  };
  add('r-ok', 'approve', 'pending', LATER);
  add('r-qr', 'qr', 'pending', LATER);
  add('r-het', 'approve', 'pending', '2020-01-01');
  add('r-xong', 'approve', 'approved', LATER);
  assert.deepEqual(
    { ...(await pendingApproveRequest('r-ok', T0)) },
    { user_id: 'a', poll_hash: 'ph', email: 'a@test' },
  );
  for (const id of ['r-qr', 'r-het', 'r-xong'])
    assert.equal(await pendingApproveRequest(id, T0), null);
});

void test('route đổi mật khẩu vẫn chạy qua lib: sai mật khẩu cũ thì 400, đúng thì đăng xuất mọi máy', async () => {
  const { raw } = emptyDb({
    AUTH_SECRET: 'bi-mat-thu-chi-de-test-0123456789abcdef',
  });
  const id = await loginAs(raw, 'staff');
  const { hashPassword } = await import('../lib/auth/auth');
  raw
    .prepare('UPDATE users SET password_hash=? WHERE id=?')
    .run(await hashPassword('Cu-mat-khau-2026!'), id);
  const { PUT } = await import('../app/api/auth/password/route');
  const call = (current: string) =>
    PUT(
      new Request('https://x.test/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ current, next: 'Mat-khau-moi-2026!x' }),
      }),
    );
  assert.equal((await call('sai')).status, 400);
  const ok = await call('Cu-mat-khau-2026!');
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.ok(
    await verifyPassword('Mat-khau-moi-2026!x', (await passwordHashOf(id))!),
  );
  assert.equal(
    (
      raw
        .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?')
        .get(id) as { n: number }
    ).n,
    0,
  );
  logout();
});
