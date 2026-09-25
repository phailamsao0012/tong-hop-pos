import { env } from 'cloudflare:workers';
import { getSessionUser, loginBlocked, recordLoginFailure, clearLoginFailures, unauthorized, verifyPassword } from '@/lib/auth';

// Mở khóa màn hình web (tự khóa sau 30 phút không dùng) bằng mật khẩu của tài khoản đang đăng nhập.
export async function POST(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  let body: { password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const key = `reauth:${user.userId}`;
  if (loginBlocked(key)) return Response.json({ error: 'Sai quá nhiều lần. Thử lại sau 15 phút hoặc đăng xuất.' }, { status: 429 });
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.userId).first<{ password_hash: string }>();
  if (!row || typeof body.password !== 'string' || !(await verifyPassword(body.password, row.password_hash))) { recordLoginFailure(key); return Response.json({ error: 'Mật khẩu không đúng.' }, { status: 401 }); }
  clearLoginFailures(key);
  return Response.json({ ok: true });
}
