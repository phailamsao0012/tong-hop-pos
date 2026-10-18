import { mentorReport } from '@/lib/staff-scope';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { canView, scopeApi } from '@/lib/access';
import { audit } from '@/lib/audit';
import { customerIdPosAllowed, loadCustomerTimeline } from '@/lib/customer-timeline';
import { POS } from '@/lib/report-model';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor') return mentorReport(env.DB, user, request);
  const canReadCustomers = canView(user, 'customers') || canView(user, 'customer360');
  const customerId = new URL(request.url).searchParams.get('customerId');
  if (!canReadCustomers && !customerId) return Response.json({ error: 'Không có quyền xem khách hàng.' }, { status: 403 });
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return Response.json({ error: scoped.blocked }, { status: 403 });
  const p = scoped.url.searchParams;
  let phone = (p.get('phone') ?? '').trim();
  let posIds = [...new Set((p.get('posIds') ?? '').split(',').filter(Boolean))];
  if (customerId) {
    const customer = await env.DB.prepare('SELECT phone,pos_id,assigned_user_id FROM pos_customers WHERE id=?').bind(customerId)
      .first<{ phone: string; pos_id: string; assigned_user_id: string | null }>();
    if (!customer || !customerIdPosAllowed(user, customer.pos_id)) return Response.json({ error: 'Không có quyền xem khách hàng.' }, { status: 403 });
    if (!canReadCustomers && env.DEMO_MODE !== '1') {
      const own = await env.DB.prepare('SELECT 1 AS ok FROM pos_users u WHERE u.pos_id=? AND lower(u.email)=lower(?) AND (u.user_id=? OR EXISTS (SELECT 1 FROM customer_stats s WHERE s.pos_id=u.pos_id AND s.phone=? AND s.seller_id=u.user_id)) LIMIT 1')
        .bind(customer.pos_id, user.email, customer.assigned_user_id, customer.phone).first();
      if (!own) return Response.json({ error: 'Không có quyền xem khách hàng.' }, { status: 403 });
    }
    phone = customer.phone;
    posIds = [customer.pos_id];
  }
  if (!/^\+?\d{9,12}$/.test(phone) || posIds.some((id) => !POS.some((pos) => pos.id === id))) return Response.json({ error: 'SĐT hoặc POS không hợp lệ.' }, { status: 400 });
  const detail = await loadCustomerTimeline(env.DB, user, phone, posIds);
  if (!detail) return Response.json({ error: 'Không tìm thấy khách.' }, { status: 404 });
  await audit({ action: 'customer.view', target: detail.target, userId: user.userId, name: user.displayName, request, status: 200 });
  const { target: _target, ...body } = detail;
  // Cache báo cáo dùng chung theo vai trò chưa có gate cho route mới; không đưa hồ sơ vào cache đó.
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/vnd.megatech.customer-detail+json', 'Cache-Control': 'private, no-store' } });
}
