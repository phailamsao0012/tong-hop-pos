import { getSessionUser, unauthorized } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { VIEW_LABELS } from '@/lib/access';

// Trình duyệt báo trang vừa mở (để nhật ký biết ai xem gì). Mỗi lần đổi trang một dòng.
const EXTRA: Record<string, string> = { config: 'Cấu hình & kết nối', security: 'Bảo mật tài khoản', audit: 'Nhật ký hoạt động', 'cskh-kpi': 'KPI CSKH', 'sale-kpi': 'KPI Sale' };
export async function POST(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  let body: { view?: unknown; posIds?: unknown; team?: unknown; export?: { file?: unknown; rows?: unknown; sheets?: unknown } };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const view = typeof body.view === 'string' ? body.view.slice(0, 40) : '';
  if (!view) return Response.json({ error: 'Thiếu trang.' }, { status: 400 });
  const label = VIEW_LABELS[view] ?? EXTRA[view] ?? view;
  // Xuất Excel trên trình duyệt (mọi cỡ): ghi tên file + số dòng, không ghi nội dung (luật dữ liệu cá nhân, QA 11/10/2026).
  if (body.export && typeof body.export === 'object') {
    const file = typeof body.export.file === 'string' ? body.export.file.slice(0, 160) : '';
    const rows = Math.max(0, Math.floor(Number(body.export.rows) || 0));
    await audit({ action: 'export.file', target: view, detail: `${label} · ${file} · ${rows} dòng`, userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
    return Response.json({ ok: true });
  }
  await audit({ action: 'view', target: view, detail: label, userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
  return Response.json({ ok: true });
}
