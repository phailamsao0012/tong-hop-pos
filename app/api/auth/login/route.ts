import { env } from 'cloudflare:workers';
import { clearLoginFailures, createSession, loginBlocked, normalizeEmail, recordLoginFailure, sessionCookie, verifyPassword } from '@/lib/auth';
import { OTP_MINUTES, createChallenge, deviceTrusted, maskEmail, mfaState, otpCode, sha256b64, sweepChallenges } from '@/lib/mfa';
import { mailConfigured, otpMail, sendMail } from '@/lib/mail';
import { audit } from '@/lib/audit';

// Bước 1 đăng nhập: email + mật khẩu. Sau đó:
// - có mã ứng dụng (TOTP) → bước 'totp';
// - thiết bị chưa tin cậy và đã cấu hình gửi thư → bước 'otp' (mã gửi về email);
// - còn lại → tạo phiên ngay.
type UserRow = { id: string; email: string; name: string; password_hash: string; disabled: number };

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return Response.json({ error: 'Nhập email và mật khẩu.' }, { status: 400 });
  if (loginBlocked(email)) { await audit({ action: 'login.blocked', email, request, status: 429 }); return Response.json({ error: 'Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút.' }, { status: 429 }); }
  const user = await env.DB.prepare('SELECT id,email,name,password_hash,disabled FROM users WHERE email=?').bind(email).first<UserRow>();
  const ok = !!user && !user.disabled && await verifyPassword(password, user.password_hash);
  if (!ok || !user) { recordLoginFailure(email); await audit({ action: 'login.fail', email, userId: user?.id, name: user?.name, detail: user ? (user.disabled ? 'Tài khoản đã khóa' : 'Sai mật khẩu') : 'Email không tồn tại', request, status: 401 }); return Response.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 }); }
  clearLoginFailures(email);
  void sweepChallenges().catch(() => undefined);
  const mfa = await mfaState(user.id);
  if (mfa.totpEnabled) {
    const challengeId = await createChallenge(user.id, 'totp', '');
    return Response.json({ step: 'totp', challengeId });
  }
  const trusted = await deviceTrusted(user.id, request.headers.get('cookie'));
  if (!trusted && mailConfigured()) {
    const code = otpCode();
    const challengeId = await createChallenge(user.id, 'otp', await sha256b64(code));
    const m = otpMail(code, OTP_MINUTES);
    try { await sendMail(user.email, m.subject, m.html); }
    catch (e) { console.error('otp mail failed', e); return Response.json({ error: 'Không gửi được mã xác minh tới email. Thử lại sau hoặc báo quản trị viên.' }, { status: 502 }); }
    return Response.json({ step: 'otp', challengeId, to: maskEmail(user.email), minutes: OTP_MINUTES });
  }
  if (!trusted) console.warn(`login without device verification (mail not configured): ${user.email}`);
  const { token, expires } = await createSession(user.id, request.headers.get('user-agent'));
  await audit({ action: 'login', userId: user.id, email: user.email, name: user.name, detail: trusted ? 'Mật khẩu (thiết bị đã tin cậy)' : 'Mật khẩu (chưa cấu hình gửi thư)', request, status: 200 });
  return Response.json({ step: 'done' }, { headers: { 'Set-Cookie': sessionCookie(token, expires) } });
}
