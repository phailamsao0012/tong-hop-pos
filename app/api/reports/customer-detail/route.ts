import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { canView, scopeApi } from '@/lib/access';
import { audit } from '@/lib/audit';
import { loadCustomerTimeline } from '@/lib/customer-timeline';
import { POS } from '@/lib/report-model';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!canView(user, 'customers') && !canView(user, 'customer360')) return Response.json({ error: 'Không có quyền xem khách hàng.' }, { status: 403 });
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return Response.json({ error: scoped.blocked }, { status: 403 });
  const p = scoped.url.searchParams;
  const phone = (p.get('phone') ?? '').trim();
  const posIds = [...new Set((p.get('posIds') ?? '').split(',').filter(Boolean))];
  if (!/^\+?\d{9,12}$/.test(phone) || posIds.some((id) => !POS.some((pos) => pos.id === id))) return Response.json({ error: 'SĐT hoặc POS không hợp lệ.' }, { status: 400 });
  const detail = await loadCustomerTimeline(env.DB, user, phone, posIds);
  if (!detail) return Response.json({ error: 'Không tìm thấy khách.' }, { status: 404 });
  await audit({ action: 'customer.view', target: detail.target, userId: user.userId, name: user.displayName, request, status: 200 });
  const { target: _target, ...body } = detail;
  // Cache báo cáo dùng chung theo vai trò chưa có gate cho route mới; không đưa hồ sơ vào cache đó.
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/vnd.megatech.customer-detail+json', 'Cache-Control': 'private, no-store' } });
}
