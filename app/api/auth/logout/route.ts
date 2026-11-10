import { clearActAsCookie, clearSessionCookie, destroySession, getSessionUserFromRequest } from '@/lib/auth/auth';
import { audit } from '@/lib/ops/audit';

export async function POST(request: Request) {
  const user = await getSessionUserFromRequest(request).catch(() => null);
  // Đang "Xem như": Đăng xuất chỉ thoát chế độ này, chủ hệ thống vẫn đăng nhập (03/11/2026).
  if (user?.actingAs) return Response.json({ ok: true, actAs: false }, { headers: { 'Set-Cookie': clearActAsCookie() } });
  await destroySession(request.headers.get('cookie'));
  if (user) await audit({ action: 'logout', userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
