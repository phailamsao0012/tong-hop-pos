import { env } from 'cloudflare:workers';
import { audit } from '@/lib/audit';
import { getSessionUser, hashPassword, unauthorized, validPassword, verifyPassword } from '@/lib/auth';

// Đổi mật khẩu của chính mình.
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: { current?: unknown; next?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  if (!validPassword(body.next))
    return Response.json({ error: 'Mật khẩu mới cần từ 8 ký tự.' }, { status: 400 });
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id=?')
    .bind(user.userId).first<{ password_hash: string }>();
  if (!row || typeof body.current !== 'string' || !(await verifyPassword(body.current, row.password_hash)))
    return Response.json({ error: 'Mật khẩu hiện tại không đúng.' }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?')
      .bind(await hashPassword(body.next), new Date().toISOString(), user.userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.userId),
  ]);
  await audit({ action: 'password.change', userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
  return Response.json({ ok: true, reLogin: true });
}
