import { env } from 'cloudflare:workers';
import { createSession, sessionCookie } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { bumpChallenge, decryptText, dropChallenge, loadChallenge, mfaState, sha256b64, trustDevice, verifyTotp } from '@/lib/mfa';

// Bước 2 đăng nhập: xác minh mã OTP email hoặc mã ứng dụng, rồi tạo phiên và ghi nhớ thiết bị.
export async function POST(request: Request) {
  let body: { challengeId?: unknown; code?: unknown; kind?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const id = typeof body.challengeId === 'string' ? body.challengeId : '';
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  const kind = body.kind === 'totp' ? 'totp' : 'otp';
  const c = await loadChallenge(id, kind);
  if (!c) return Response.json({ error: 'Mã đã hết hạn hoặc nhập sai quá nhiều lần. Đăng nhập lại.' }, { status: 410 });
  let ok = false;
  if (kind === 'otp') ok = code.length === 6 && (await sha256b64(code)) === c.secret;
  else {
    const m = await mfaState(c.user_id);
    ok = !!m.totpSecretEnc && await verifyTotp(await decryptText(m.totpSecretEnc), code);
  }
  const who = await env.DB.prepare('SELECT email,name,disabled FROM users WHERE id=?').bind(c.user_id).first<{ email: string; name: string; disabled: number }>();
  if (!ok) { await bumpChallenge(id); await audit({ action: 'login.fail', userId: c.user_id, email: who?.email, name: who?.name, detail: kind === 'otp' ? 'Sai mã email' : 'Sai mã ứng dụng', request, status: 401 }); return Response.json({ error: 'Mã không đúng.' }, { status: 401 }); }
  await dropChallenge(id);
  if (!who || who.disabled) return Response.json({ error: 'Tài khoản đã bị khóa.' }, { status: 403 });
  await audit({ action: 'login', userId: c.user_id, email: who.email, name: who.name, detail: kind === 'otp' ? 'Mật khẩu + mã email (thiết bị mới)' : 'Mật khẩu + mã ứng dụng', request, status: 200 });
  const ua = request.headers.get('user-agent');
  const { token, expires } = await createSession(c.user_id, ua);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', sessionCookie(token, expires));
  headers.append('Set-Cookie', await trustDevice(c.user_id, ua));
  return new Response(JSON.stringify({ step: 'done' }), { headers });
}
