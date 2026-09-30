import { env } from 'cloudflare:workers';
import { parseRole } from '@/lib/access';
import { audit } from '@/lib/audit';
import { HR_SECRET_HEADER, secretMatches } from '@/lib/hr-link';
import { primaryOwnerId } from '@/lib/primary-owner';

// Web nhân sự báo một người đã nghỉ việc (tới ngày nghỉ): khóa tài khoản web chính và đăng xuất mọi phiên.
// Không bao giờ khóa chủ hệ thống: việc đó chỉ làm tay trong Tài khoản.
export async function POST(request: Request) {
  if (!secretMatches(env.HR_SHARED_SECRET, request.headers.get(HR_SECRET_HEADER))) return Response.json({ error: 'Sai bí mật liên kết.' }, { status: 403 });
  let body: { userId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const id = typeof body.userId === 'string' ? body.userId : '';
  const user = id ? await env.DB.prepare('SELECT id,email,name,role,disabled FROM users WHERE id=?').bind(id).first<{ id: string; email: string; name: string; role: string; disabled: number }>() : null;
  if (!user) return Response.json({ error: 'Không có tài khoản.' }, { status: 404 });
  if (parseRole(user.role) === 'owner' || user.id === await primaryOwnerId()) return Response.json({ error: 'Không tự khóa tài khoản chủ hệ thống.' }, { status: 409 });
  if (!user.disabled) {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET disabled=1, updated_at=? WHERE id=?').bind(new Date().toISOString(), id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),
    ]);
    await audit({ action: 'Khóa tài khoản (nghỉ việc)', target: 'users', name: 'Web nhân sự', detail: `${user.email} (${user.name}) · nghỉ việc theo web nhân sự`, status: 200, request });
  }
  return Response.json({ ok: true, alreadyDisabled: !!user.disabled });
}
