import { env } from 'cloudflare:workers';
import {
  clearLoginFailures, createSession, loginBlocked, normalizeEmail,
  recordLoginFailure, sessionCookie, verifyPassword,
} from '@/lib/auth';

type UserRow = { id: string; password_hash: string; disabled: number };

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password)
    return Response.json({ error: 'Nhập email và mật khẩu.' }, { status: 400 });
  if (loginBlocked(email))
    return Response.json({ error: 'Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút.' }, { status: 429 });
  const user = await env.DB.prepare('SELECT id,password_hash,disabled FROM users WHERE email=?')
    .bind(email).first<UserRow>();
  const ok = !!user && !user.disabled && await verifyPassword(password, user.password_hash);
  if (!ok) {
    recordLoginFailure(email);
    return Response.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 });
  }
  clearLoginFailures(email);
  const { token, expires } = await createSession(user.id, request.headers.get('user-agent'));
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token, expires) } });
}
