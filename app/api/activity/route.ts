import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { audit } from '@/lib/ops/audit';
import { VIEW_LABELS, canView } from '@/lib/auth/access';

// Trình duyệt báo trang vừa mở (để nhật ký biết ai xem gì). Mỗi lần đổi trang một dòng.
const EXTRA: Record<string, string> = { config: 'Cấu hình & kết nối', security: 'Bảo mật tài khoản', audit: 'Nhật ký hoạt động', 'cskh-kpi': 'KPI CSKH', 'sale-kpi': 'KPI Sale' };
export async function POST(request: Request) {
  const user = await getSessionUser(); if (!user) return unauthorized();
  let body: { view?: unknown; posIds?: unknown; team?: unknown; export?: { file?: unknown; rows?: unknown; sheets?: unknown } };
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON không hợp lệ.' }, { status: 400 }); }
  const view = typeof body.view === 'string' ? body.view.slice(0, 40) : '';
  // Chỉ nhận mã trang dạng chữ thường, số, gạch ngang (QA 11/10 N3): nhật ký không nhận chuỗi tuỳ ý từ trình duyệt.
  if (!/^[a-z0-9-]{1,40}$/.test(view)) return Response.json({ error: 'Thiếu trang.' }, { status: 400 });
  const label = (Object.hasOwn(VIEW_LABELS, view) ? VIEW_LABELS[view] : Object.hasOwn(EXTRA, view) ? EXTRA[view] : null) ?? view;
  // Xuất Excel trên trình duyệt (mọi cỡ): ghi tên file + số dòng, không ghi nội dung (luật dữ liệu cá nhân, QA 11/10/2026).
  if (body.export && typeof body.export === 'object') {
    // Trình duyệt tự khai (QA M2): chỉ nhận trang có thật mà tài khoản được xem, số dòng là số nguyên hữu hạn ≤ 1.000.000.
    const known = view === 'export' || Object.hasOwn(VIEW_LABELS, view) || Object.hasOwn(EXTRA, view);
    if (!known || (view !== 'export' && !canView(user, view))) return Response.json({ error: 'Trang không hợp lệ.' }, { status: 400 });
    const file = typeof body.export.file === 'string' ? Array.from(body.export.file).filter((ch) => ch.charCodeAt(0) >= 32).join('').slice(0, 160) : '';
    const n = Number(body.export.rows);
    const rows = Number.isFinite(n) ? Math.min(1_000_000, Math.max(0, Math.floor(n))) : 0;
    await audit({ action: 'export.file', target: view, detail: `${label} · ${file} · ${rows} dòng (trình duyệt báo)`, userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
    return Response.json({ ok: true });
  }
  await audit({ action: 'view', target: view, detail: label, userId: user.userId, email: user.email, name: user.displayName, request, status: 200 });
  return Response.json({ ok: true });
}
