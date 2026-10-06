import test from 'node:test';
import assert from 'node:assert/strict';
import { googleAuthUrl, resetGoogleKeyCache, verifyGoogleIdToken } from '../lib/google-id';

const CLIENT = '123-abc.apps.googleusercontent.com';
const NOW = Date.UTC(2026, 9, 6, 8, 0, 0);
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const enc = (o: unknown) => b64(new TextEncoder().encode(JSON.stringify(o)));

async function setup() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
  let fetches = 0;
  const fetchKeys = async () => { fetches++; return { keys: [jwk], maxAge: 3600 }; };
  const sign = async (claims: Record<string, unknown>, head: Record<string, unknown> = { alg: 'RS256', kid: 'k1', typ: 'JWT' }) => {
    const data = `${enc(head)}.${enc(claims)}`;
    return `${data}.${b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(data))))}`;
  };
  const base = { iss: 'https://accounts.google.com', aud: CLIENT, sub: '42', email: 'Vu@Gmail.com', email_verified: true, exp: NOW / 1000 + 3600, iat: NOW / 1000, nonce: 'n1' };
  return { sign, base, fetchKeys, fetches: () => fetches };
}

test('ID token Google hợp lệ được chấp nhận, khoá Google được giữ trong bộ nhớ', async () => {
  resetGoogleKeyCache();
  const { sign, base, fetchKeys, fetches } = await setup();
  const c = await verifyGoogleIdToken(await sign(base), CLIENT, { nonce: 'n1', now: NOW, fetchKeys });
  assert.equal(c?.email, 'Vu@Gmail.com');
  await verifyGoogleIdToken(await sign(base), CLIENT, { nonce: 'n1', now: NOW + 1000, fetchKeys });
  assert.equal(fetches(), 1);
});

test('ID token sai client, hết hạn, sai nonce, email chưa xác minh, sai chữ ký hoặc sai thuật toán bị từ chối', async () => {
  resetGoogleKeyCache();
  const { sign, base, fetchKeys } = await setup();
  const v = async (token: string, nonce = 'n1') => verifyGoogleIdToken(token, CLIENT, { nonce, now: NOW, fetchKeys });
  assert.equal(await v(await sign({ ...base, aud: 'other.apps.googleusercontent.com' })), null);
  assert.equal(await v(await sign({ ...base, iss: 'https://evil.example' })), null);
  assert.equal(await v(await sign({ ...base, exp: NOW / 1000 - 120 })), null);
  assert.equal(await v(await sign(base), 'n2'), null);
  assert.equal(await v(await sign(base), ''), null);
  assert.equal(await v(await sign({ ...base, email_verified: false })), null);
  assert.equal(await v(await sign(base, { alg: 'none', kid: 'k1' })), null);
  const good = await sign(base);
  const [h, p] = good.split('.');
  assert.equal(await v(`${h}.${enc({ ...base, email: 'sep@megatech.vn' })}.${good.split('.')[2]}`), null);
  assert.equal(await v(`${h}.${p}`), null);
  assert.equal(await v('rác'), null);
});

test('kid lạ thì tải lại khoá Google một lần rồi thôi', async () => {
  resetGoogleKeyCache();
  const { sign, base, fetchKeys, fetches } = await setup();
  assert.equal(await verifyGoogleIdToken(await sign(base, { alg: 'RS256', kid: 'k9' }), CLIENT, { nonce: 'n1', now: NOW, fetchKeys }), null);
  assert.equal(fetches(), 2);
});

test('đường dẫn chọn tài khoản Google mang đủ nonce, state, chỉ xin email', () => {
  const u = new URL(googleAuthUrl(CLIENT, 'https://tonghopposmegatech.io.vn/login', 'n1', 's1'));
  assert.equal(u.origin, 'https://accounts.google.com');
  assert.equal(u.searchParams.get('response_type'), 'id_token');
  assert.equal(u.searchParams.get('scope'), 'openid email profile');
  assert.equal(u.searchParams.get('nonce'), 'n1');
  assert.equal(u.searchParams.get('state'), 's1');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://tonghopposmegatech.io.vn/login');
});
