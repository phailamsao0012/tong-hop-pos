import { env } from 'cloudflare:workers';
import { parseRole } from '@/lib/access';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';

// Danh sách tài khoản web chính cho web nhân sự gắn vào hồ sơ nhân viên (không có mật khẩu, quyền xem).
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const rows = await env.DB.prepare('SELECT id,email,name,role,disabled FROM users ORDER BY name').all<{ id: string; email: string; name: string; role: string; disabled: number }>();
  const users = rows.results.map((r) => ({ userId: r.id, email: r.email, name: r.name || r.email, role: parseRole(r.role), disabled: !!r.disabled }));
  return Response.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
}
