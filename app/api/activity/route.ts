import { getSessionUser, unauthorized } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { VIEW_LABELS } from '@/lib/access';

// Trình duyệt báo trang vừa mở (để nhật ký biết ai xem gì). Mỗi lần đổi trang một dòng.
const EXTRA: Record<string, string> = { config: 'Cấu hình & kết nối', security: 'Bảo mật tài khoản', audit: 'Nhật ký hoạt động' };
export async function POST(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  let body: { view?: unknown; posIds?: unknown; team?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const view = typeof body.view === 'string' ? body.view.slice(0, 40) : '';
  if (!view) return Response.json({ error: 'Thiếu trang.' }, { status: 400 });
  const label = VIEW_LABELS[view] ?? EXTRA[view] ?? view;
  await audit({ action: 'view', target: view, detail: label, userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
  return Response.json({ ok: true });
}
