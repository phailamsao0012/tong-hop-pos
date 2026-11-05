import { mentorReport } from '@/lib/teams/staff-scope';
import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth/auth';
import { canView, scopeApi } from '@/lib/auth/access';
import { audit } from '@/lib/ops/audit';
import { customerIdPosAllowed, loadCustomerTimeline } from '@/lib/reports/customer-timeline';
import { customerById, ownsCustomer } from '@/lib/reports/customer-lookup';
import { POS } from '@/lib/shared/report-model';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role === 'mentor' && !user.teamScope) return mentorReport(env.DB, user, request);
  const canReadCustomers = canView(user, 'customers') || canView(user, 'customer360');
  const customerId = new URL(request.url).searchParams.get('customerId');
  if (!canReadCustomers && !customerId) return Response.json({ error: 'Không có quyền xem khách hàng.' }, { status: 403 });
  const scoped = scopeApi(user, 'GET', new URL(request.url));
  if (scoped.blocked) return Response.json({ error: scoped.blocked }, { status: 403 });
  const p = scoped.url.searchParams;
  let phone = (p.get('phone') ?? '').trim();
  let posIds = [...new Set((p.get('posIds') ?? '').split(',').filter(Boolean))];
  if (customerId) {
    const customer = await customerById(customerId);
    if (!customer || !customerIdPosAllowed(user, customer.pos_id)) return Response.json({ error: 'Không có quyền xem khách hàng.' }, { status: 403 });
    if (!canReadCustomers && env.DEMO_MODE !== '1') {
      const own = await ownsCustomer(customer, user);
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
