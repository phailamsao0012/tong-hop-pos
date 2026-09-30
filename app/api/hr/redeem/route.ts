import { env } from 'cloudflare:workers';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { hrUser } from '../user/route';

const sha256 = async (value: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))));

// Web nhân sự đổi mã chuyển đăng nhập (một lần, 2 phút) lấy thông tin tài khoản. Chỉ web nhân sự có bí mật HR_SHARED_SECRET mới gọi được.
export async function POST(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!code || code.length > 100) return Response.json({ error: 'Thiếu mã.' }, { status: 400 });
  const key = await sha256(code);
  const row = await env.DB.prepare('DELETE FROM hr_handoffs WHERE id=? RETURNING user_id,expires_at').bind(key).first<{ user_id: string; expires_at: string }>();
  if (!row || row.expires_at < new Date().toISOString()) return Response.json({ error: 'Mã đã hết hạn hoặc đã dùng.' }, { status: 410 });
  const user = await hrUser(row.user_id);
  if (!user || user.disabled) return Response.json({ error: 'Tài khoản không còn hoạt động.' }, { status: 403 });
  return Response.json(user, { headers: { 'Cache-Control': 'no-store' } });
}
