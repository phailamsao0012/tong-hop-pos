import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/teams/hr-link';
import { hrUser, redeemHandoff, sha256 } from '@/lib/teams/hr-api';


// Web nhân sự đổi mã chuyển đăng nhập (một lần, 2 phút) lấy thông tin tài khoản. Chỉ web nhân sự có bí mật HR_SHARED_SECRET mới gọi được.
export async function POST(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!code || code.length > 100) return Response.json({ error: 'Thiếu mã.' }, { status: 400 });
  const key = await sha256(code);
  const row = await redeemHandoff(key);
  if (!row || row.expires_at < new Date().toISOString()) return Response.json({ error: 'Mã đã hết hạn hoặc đã dùng.' }, { status: 410 });
  const user = await hrUser(row.user_id);
  if (!user || user.disabled) return Response.json({ error: 'Tài khoản không còn hoạt động.' }, { status: 403 });
  return Response.json(user, { headers: { 'Cache-Control': 'no-store' } });
}
