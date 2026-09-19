import { env } from 'cloudflare:workers';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { createSession, getSessionUser, sessionCookie, unauthorized } from '@/lib/auth';
import { createChallenge, dropChallenge, loadChallenge, trustDevice } from '@/lib/mfa';

// Passkey (WebAuthn): đăng ký khi đã đăng nhập; đăng nhập không cần mật khẩu bằng passkey đã đăng ký.
// RP ID = tên miền web hiện tại; đổi tên miền thì phải đăng ký lại passkey.
const RP_NAME = 'MEGATECH POS';
const rp = (request: Request) => { const u = new URL(request.url); return { rpID: u.hostname, origin: u.origin }; };
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
type PasskeyRow = { id: string; user_id: string; public_key: string; counter: number; transports: string | null };

export async function POST(request: Request) {
  let body: { action?: unknown; challengeId?: unknown; response?: unknown; name?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const { rpID, origin } = rp(request);

  // ---- Đăng ký (cần đăng nhập) ----
  if (body.action === 'register-options') {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const existing = await env.DB.prepare('SELECT id,transports FROM passkeys WHERE user_id=?').bind(user.userId).all<{ id: string; transports: string | null }>();
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID, userName: user.email, userDisplayName: user.displayName, userID: new TextEncoder().encode(user.userId),
      attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      excludeCredentials: existing.results.map((r) => ({ id: r.id, transports: r.transports ? JSON.parse(r.transports) : undefined })),
    });
    const challengeId = await createChallenge(user.userId, 'webauthn-reg', options.challenge, undefined, 5);
    return Response.json({ challengeId, options });
  }
  if (body.action === 'register-verify') {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const c = await loadChallenge(typeof body.challengeId === 'string' ? body.challengeId : '', 'webauthn-reg');
    if (!c || c.user_id !== user.userId) return Response.json({ error: 'Phiên đăng ký passkey đã hết hạn, thử lại.' }, { status: 410 });
    try {
      const v = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON, expectedChallenge: c.secret, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
      if (!v.verified) return Response.json({ error: 'Trình duyệt không xác nhận được passkey.' }, { status: 400 });
      const cred = v.registrationInfo.credential;
      await env.DB.prepare('INSERT INTO passkeys (id,user_id,public_key,counter,transports,device_type,backed_up,name,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(cred.id, user.userId, toB64(cred.publicKey), cred.counter, JSON.stringify(cred.transports ?? []), v.registrationInfo.credentialDeviceType, v.registrationInfo.credentialBackedUp ? 1 : 0, (typeof body.name === 'string' ? body.name : '').trim().slice(0, 60) || 'Passkey', new Date().toISOString()).run();
      await dropChallenge(c.id);
      return Response.json({ ok: true });
    } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Không đăng ký được passkey.' }, { status: 400 }); }
  }

  // ---- Đăng nhập bằng passkey (không cần mật khẩu) ----
  if (body.action === 'login-options') {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
    const challengeId = await createChallenge('', 'webauthn', options.challenge, undefined, 5);
    return Response.json({ challengeId, options });
  }
  if (body.action === 'login-verify') {
    const c = await loadChallenge(typeof body.challengeId === 'string' ? body.challengeId : '', 'webauthn');
    if (!c) return Response.json({ error: 'Phiên đăng nhập passkey đã hết hạn, thử lại.' }, { status: 410 });
    const response = body.response as AuthenticationResponseJSON;
    const row = await env.DB.prepare('SELECT p.id,p.user_id,p.public_key,p.counter,p.transports FROM passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.disabled=0').bind(response?.id ?? '').first<PasskeyRow>();
    if (!row) return Response.json({ error: 'Passkey này chưa được đăng ký hoặc tài khoản đã khóa.' }, { status: 401 });
    try {
      const v = await verifyAuthenticationResponse({ response, expectedChallenge: c.secret, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
        credential: { id: row.id, publicKey: fromB64(row.public_key), counter: row.counter, transports: row.transports ? JSON.parse(row.transports) : undefined } });
      if (!v.verified) return Response.json({ error: 'Passkey không hợp lệ.' }, { status: 401 });
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare('UPDATE passkeys SET counter=?,last_used_at=? WHERE id=?').bind(v.authenticationInfo.newCounter, now, row.id),
        env.DB.prepare('UPDATE users SET last_login_at=? WHERE id=?').bind(now, row.user_id),
      ]);
      await dropChallenge(c.id);
      const ua = request.headers.get('user-agent');
      const { token, expires } = await createSession(row.user_id, ua);
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append('Set-Cookie', sessionCookie(token, expires));
      headers.append('Set-Cookie', await trustDevice(row.user_id, ua));
      return new Response(JSON.stringify({ step: 'done' }), { headers });
    } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Không xác minh được passkey.' }, { status: 401 }); }
  }
  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  await env.DB.prepare('DELETE FROM passkeys WHERE id=? AND user_id=?').bind(id, user.userId).run();
  return Response.json({ ok: true });
}
