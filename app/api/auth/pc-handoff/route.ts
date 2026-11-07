import { getSessionUser } from '@/lib/auth/auth';
import { mfaBlocks } from '@/lib/auth/mfa-gate';
import { newPcCode, pcClaimUrl } from '@/lib/auth/pc-link';
import { isReadOnly } from '@/lib/ops/read-only';
import { saveHandoff } from '@/lib/teams/hr-api';

// Web chính: cấp mã đăng nhập một lần cho bản PC (lib/auth/pc-link.ts). Chưa đăng nhập thì đi qua trang đăng nhập rồi quay lại.
export async function GET(request: Request) {
  if (isReadOnly()) return new Response('Không có ở bản PC.', { status: 404 });
  const user = await getSessionUser();
  if (!user) return Response.redirect(new URL('/login?next=%2Fapi%2Fauth%2Fpc-handoff', request.url).toString(), 302);
  if (mfaBlocks(user)) return Response.redirect(new URL('/', request.url).toString(), 302);
  const code = newPcCode();
  // Đang xem thay người khác thì PC vẫn mở phiên của chính chủ hệ thống.
  await saveHandoff(code, { userId: user.actingAs?.ownerId ?? user.userId }, Date.now());
  return new Response(null, { status: 302, headers: { Location: pcClaimUrl(code), 'Cache-Control': 'no-store' } });
}
