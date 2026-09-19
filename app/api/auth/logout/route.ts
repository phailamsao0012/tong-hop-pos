import { clearSessionCookie, destroySession, getSessionUserFromRequest } from '@/lib/auth';
import { audit } from '@/lib/audit';

export async function POST(request: Request) {
  const user = await getSessionUserFromRequest(request).catch(() => null);
  await destroySession(request.headers.get('cookie'));
  if (user) await audit({ action: 'logout', userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
