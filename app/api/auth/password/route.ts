import { passwordHashOf, setPasswordDropSessions } from '@/lib/auth/auth-db';
import { audit } from '@/lib/ops/audit';
import { getSessionUser, hashPassword, passwordProblem, unauthorized, verifyPassword } from '@/lib/auth/auth';

// Đổi mật khẩu của chính mình.
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: { current?: unknown; next?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const problem = await passwordProblem(body.next, user.email);
  if (problem || typeof body.next !== 'string') return Response.json({ error: problem ?? 'Mật khẩu không hợp lệ.' }, { status: 400 });
  const hash = await passwordHashOf(user.userId);
  if (!hash || typeof body.current !== 'string' || !(await verifyPassword(body.current, hash)))
    return Response.json({ error: 'Mật khẩu hiện tại không đúng.' }, { status: 400 });
  await setPasswordDropSessions(user.userId, await hashPassword(body.next), new Date().toISOString());
  await audit({ action: 'password.change', userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
  return Response.json({ ok: true, reLogin: true });
}
