import { env } from 'cloudflare:workers';
import { actAsCookie, clearActAsCookie, forbidden, getRealSessionUserFromRequest, unauthorized } from '@/lib/auth/auth';
import { parseRole } from '@/lib/auth/access';
import { audit } from '@/lib/ops/audit';

// "Xem như tài khoản này" (anh Vũ 03/11/2026): chủ hệ thống mở web y hệt một tài khoản khác để kiểm lỗi. Không xem như chủ hệ thống khác hay tài khoản đã khoá.
export async function POST(request: Request) {
  const owner = await getRealSessionUserFromRequest(request);
  if (!owner) return unauthorized();
  if (owner.role !== 'owner') return forbidden();
  let body: { userId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const target = userId ? await env.DB.prepare('SELECT id,email,name,role,disabled FROM users WHERE id=?').bind(userId).first<{ id: string; email: string; name: string; role: string; disabled: number }>() : null;
  if (!target || target.id === owner.userId) return Response.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  if (target.disabled) return Response.json({ error: 'Tài khoản đang khoá.' }, { status: 400 });
  if (parseRole(target.role) === 'owner') return Response.json({ error: 'Không xem như chủ hệ thống khác được.' }, { status: 400 });
  await audit({ action: 'act_as', userId: owner.userId, email: owner.email, name: owner.displayName, detail: `Xem như ${target.name || target.email}`, request, status: 200 });
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': actAsCookie(target.id) } });
}

export function DELETE() {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearActAsCookie() } });
}
