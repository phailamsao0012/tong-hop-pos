import { env } from 'cloudflare:workers';
import { parseRole } from '@/lib/access';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';

export async function hrUser(id: string) {
  const row = await env.DB.prepare('SELECT id,email,name,role,title,disabled FROM users WHERE id=?').bind(id)
    .first<{ id: string; email: string; name: string; role: string; title: string | null; disabled: number }>();
  return row ? { userId: row.id, email: row.email, name: row.name || row.email, role: parseRole(row.role), title: row.title ?? '', disabled: !!row.disabled } : null;
}

// Web nhân sự kiểm tra lại tài khoản (bị khóa, đổi vai trò) trong lúc phiên bên đó còn hạn.
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const user = id ? await hrUser(id) : null;
  if (!user) return Response.json({ error: 'Không có tài khoản.' }, { status: 404 });
  return Response.json(user, { headers: { 'Cache-Control': 'no-store' } });
}
