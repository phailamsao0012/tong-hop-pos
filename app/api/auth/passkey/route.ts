import { activePasskey, deletePasskey, insertPasskey, markPasskeyUsed, passkeyOfLockedUser, passkeysForExclude, userById } from '@/lib/auth/auth-db';
import { LOCKED_MESSAGE, forgetSession } from '@/lib/auth/auth';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { getSessionUser, getSessionUserFromRequest, unauthorized } from '@/lib/auth/auth';
import { startSession } from '@/lib/auth/login-session';
import { audit } from '@/lib/ops/audit';
import { createChallenge, dropChallenge, loadChallenge } from '@/lib/auth/mfa';

// Passkey (WebAuthn): đăng ký khi đã đăng nhập; đăng nhập không cần mật khẩu bằng passkey đã đăng ký.
// RP ID = tên miền web hiện tại; đổi tên miền thì phải đăng ký lại passkey.
const RP_NAME = 'MEGATECH POS';
const rp = (request: Request) => { const u = new URL(request.url); return { rpID: u.hostname, origin: u.origin }; };
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function POST(request: Request) {
  let body: { action?: unknown; challengeId?: unknown; response?: unknown; name?: unknown; unlock?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const { rpID, origin } = rp(request);

  // ---- Đăng ký (cần đăng nhập) ----
  if (body.action === 'register-options') {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const existing = await passkeysForExclude(user.userId);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID, userName: user.email, userDisplayName: user.displayName, userID: new TextEncoder().encode(user.userId),
      attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      excludeCredentials: existing.map((r) => ({ id: r.id, transports: r.transports ? JSON.parse(r.transports) : undefined })),
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
      await insertPasskey({ id: cred.id, userId: user.userId, publicKey: toB64(cred.publicKey), counter: cred.counter, transports: JSON.stringify(cred.transports ?? []), deviceType: v.registrationInfo.credentialDeviceType, backedUp: v.registrationInfo.credentialBackedUp, name: (typeof body.name === 'string' ? body.name : '').trim().slice(0, 60) || 'Passkey', createdAt: new Date().toISOString() });
      await dropChallenge(c.id);
      await audit({ action: 'passkey.add', userId: user.userId, email: user.email, name: user.displayName, target: cred.id, request, status: 200 });
      await forgetSession(request.headers.get('cookie'));
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
    const row = await activePasskey(response?.id ?? '');
    if (!row) {
      const locked = await passkeyOfLockedUser(response?.id ?? '');
      return locked ? Response.json({ error: LOCKED_MESSAGE }, { status: 503 }) : Response.json({ error: 'Passkey này chưa được đăng ký.' }, { status: 401 });
    }
    try {
      const v = await verifyAuthenticationResponse({ response, expectedChallenge: c.secret, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
        credential: { id: row.id, publicKey: fromB64(row.public_key), counter: row.counter, transports: row.transports ? JSON.parse(row.transports) : undefined } });
      if (!v.verified) return Response.json({ error: 'Passkey không hợp lệ.' }, { status: 401 });
      const now = new Date().toISOString();
      await markPasskeyUsed(row.id, row.user_id, v.authenticationInfo.newCounter, now);
      await dropChallenge(c.id);
      const who = await userById(row.user_id);
      // Mở khóa màn hình web (đã đăng nhập đúng người này): không tạo phiên mới.
      const current = await getSessionUserFromRequest(request);
      if (body.unlock === true && current?.userId === row.user_id) return Response.json({ step: 'unlocked' });
      await audit({ action: 'login', userId: row.user_id, email: who?.email, name: who?.name, detail: 'Passkey', request, status: 200 });
      return new Response(JSON.stringify({ step: 'done' }), { headers: await startSession(request, { id: row.user_id, name: who?.name, email: who?.email }, 'passkey', { trust: true }) });
    } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Không xác minh được passkey.' }, { status: 401 }); }
  }
  return Response.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get('id') ?? '';
  await deletePasskey(id, user.userId);
  await audit({ action: 'passkey.remove', userId: user.userId, email: user.email, name: user.displayName, target: id, request, status: 200 });
  await forgetSession(request.headers.get('cookie'));
  return Response.json({ ok: true });
}
