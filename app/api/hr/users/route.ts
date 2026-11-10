import { env } from 'cloudflare:workers';
import { parseRole } from '@/lib/auth/access';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/teams/hr-link';
import { hrUserRows } from '@/lib/teams/hr-api';

// Danh sách tài khoản web chính cho web nhân sự gắn vào hồ sơ nhân viên (không có mật khẩu, quyền xem).
export async function GET(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  const rows = await hrUserRows();
  const users = rows.results.map((r) => ({ userId: r.id, email: r.email, name: r.name || r.email, role: parseRole(r.role), disabled: !!r.disabled }));
  return Response.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
}
