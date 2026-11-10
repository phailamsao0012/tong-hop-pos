import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/lib/auth/auth';
import { safeNext } from '@/lib/teams/hr-link';
import { saveHandoff } from '@/lib/teams/hr-api';


// Chuyển đăng nhập sang web nhân sự: người đã đăng nhập ở đây nhận một mã dùng một lần rồi quay về web nhân sự,
// web nhân sự đổi mã lấy thông tin tài khoản qua /api/hr/redeem. Chưa đăng nhập thì đi qua trang đăng nhập rồi quay lại.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const crm = env.CRM_URL?.trim().replace(/\/+$/, '');
  if (!crm) return Response.json({ error: 'Chưa cấu hình địa chỉ web nhân sự (CRM_URL).' }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return Response.redirect(new URL(`/login?next=${encodeURIComponent(`/api/hr/handoff?next=${encodeURIComponent(next)}`)}`, url).toString(), 302);
  const code = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Date.now();
  await saveHandoff(code, user, now);
  return new Response(null, { status: 302, headers: { Location: `${crm}/auth/callback?code=${code}&next=${encodeURIComponent(next)}`, 'Cache-Control': 'no-store' } });
}
