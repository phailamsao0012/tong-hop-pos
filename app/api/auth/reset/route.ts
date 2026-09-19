import { env } from 'cloudflare:workers';
import { createSession, hashPassword, loginBlocked, normalizeEmail, recordLoginFailure, sessionCookie, validPassword } from '@/lib/auth';
import { OTP_MINUTES, bumpChallenge, createChallenge, dropChallenge, loadChallenge, maskEmail, mfaState, otpCode, sha256b64, trustDevice } from '@/lib/mfa';
import { mailConfigured, resetMail, sendMail } from '@/lib/mail';
import { audit } from '@/lib/audit';

// Quên mật khẩu: 'request' gửi mã 6 số về email (luôn trả lời như nhau để không lộ email nào có tài khoản),
// 'confirm' kiểm tra mã rồi đặt mật khẩu mới, hủy mọi phiên cũ. Có mã ứng dụng thì phải đăng nhập lại
// bằng mật khẩu mới + mã ứng dụng; không có thì vào web luôn và ghi nhớ thiết bị.
type UserRow = { id: string; email: string; disabled: number };

export async function POST(request: Request) {
  let body: { action?: unknown; email?: unknown; challengeId?: unknown; code?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }

  if (body.action === 'request') {
    if (!mailConfigured()) return Response.json({ error: 'Web chưa cấu hình gửi thư. Liên hệ quản trị viên để đặt lại mật khẩu.' }, { status: 503 });
    const email = normalizeEmail(body.email);
    if (!email) return Response.json({ error: 'Nhập email đã đăng ký.' }, { status: 400 });
    const key = `reset:${email}`;
    if (loginBlocked(key)) return Response.json({ error: 'Yêu cầu quá nhiều lần. Thử lại sau 15 phút.' }, { status: 429 });
    recordLoginFailure(key);
    const reply = { step: 'code', to: maskEmail(email), minutes: OTP_MINUTES };
    const user = await env.DB.prepare('SELECT id,email,disabled FROM users WHERE email=?').bind(email).first<UserRow>();
    if (!user || user.disabled) return Response.json({ ...reply, challengeId: crypto.randomUUID() });
    await audit({ action: 'password.reset.request', userId: user.id, email: user.email, request, status: 200 });
    const code = otpCode();
    const challengeId = await createChallenge(user.id, 'reset', await sha256b64(code));
    const m = resetMail(code, OTP_MINUTES);
    try { await sendMail(user.email, m.subject, m.html); }
    catch (e) { console.error('reset mail failed', e); return Response.json({ error: 'Không gửi được thư. Thử lại sau hoặc báo quản trị viên.' }, { status: 502 }); }
    return Response.json({ ...reply, challengeId });
  }

  if (body.action === 'confirm') {
    const id = typeof body.challengeId === 'string' ? body.challengeId : '';
    const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
    if (!validPassword(body.password)) return Response.json({ error: 'Mật khẩu mới phải từ 8 ký tự.' }, { status: 400 });
    const c = await loadChallenge(id, 'reset');
    if (!c) return Response.json({ error: 'Mã đã hết hạn hoặc nhập sai quá nhiều lần. Yêu cầu mã mới.' }, { status: 410 });
    if (code.length !== 6 || (await sha256b64(code)) !== c.secret) { await bumpChallenge(id); return Response.json({ error: 'Mã không đúng.' }, { status: 401 }); }
    await dropChallenge(id);
    const user = await env.DB.prepare('SELECT id,email,disabled FROM users WHERE id=?').bind(c.user_id).first<UserRow>();
    if (!user || user.disabled) return Response.json({ error: 'Tài khoản đã bị khóa.' }, { status: 403 });
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(body.password), user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
    ]);
    await audit({ action: 'password.reset', userId: user.id, email: user.email, request, status: 200 });
    const mfa = await mfaState(user.id);
    if (mfa.totpEnabled) return Response.json({ step: 'login' });
    const ua = request.headers.get('user-agent');
    const { token, expires } = await createSession(user.id, ua);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', sessionCookie(token, expires));
    headers.append('Set-Cookie', await trustDevice(user.id, ua));
    return new Response(JSON.stringify({ step: 'done' }), { headers });
  }
  return Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 });
}
