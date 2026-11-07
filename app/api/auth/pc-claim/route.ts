import { startSession } from '@/lib/auth/login-session';
import { mainRedeemUrl, validPcCode } from '@/lib/auth/pc-link';
import { audit } from '@/lib/ops/audit';
import { isReadOnly } from '@/lib/ops/read-only';
import { userById } from '@/lib/teams/hr-api';

// Bản PC: nhận mã từ web chính, hỏi web chính mã thuộc tài khoản nào, rồi mở phiên trên PC (lib/auth/pc-link.ts).
export async function GET(request: Request) {
  if (!isReadOnly()) return new Response('Chỉ có ở bản PC.', { status: 404 });
  // Location tương đối: sau đường hầm, request.url của PC có thể là localhost.
  const back = (err: string) => new Response(null, { status: 302, headers: { Location: `/login?pc=${err}`, 'Cache-Control': 'no-store' } });
  const code = new URL(request.url).searchParams.get('code');
  if (!validPcCode(code)) return back('het-han');
  let res: Response;
  try { res = await fetch(mainRedeemUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); }
  catch (e) { console.error('pc redeem', e); return back('khong-noi'); }
  if (res.status === 400 || res.status === 410) return back('het-han');
  const userId = res.ok ? ((await res.json().catch(() => null)) as { userId?: unknown } | null)?.userId : null;
  if (typeof userId !== 'string') return back('khong-noi');
  const user = await userById(userId);
  if (!user || user.disabled) return back('chua-chep');
  await audit({ action: 'login', userId: user.id, email: user.email, name: user.name, detail: 'Bản PC qua web chính', request, status: 200 }).catch(() => undefined);
  const headers = await startSession(request, user, 'pc');
  headers.set('Location', '/');
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 302, headers });
}
