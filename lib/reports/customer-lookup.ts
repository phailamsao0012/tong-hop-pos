// Tra khách theo mã cho Hồ sơ khách. Tách khỏi app/api/reports/customer-detail/route.ts (cải tổ B4, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

/** Khách theo mã pos_customers. */
export const customerById = (customerId: string) => env.DB.prepare('SELECT phone,pos_id,assigned_user_id FROM pos_customers WHERE id=?').bind(customerId)
  .first<{ phone: string; pos_id: string; assigned_user_id: string | null }>();
/** Tài khoản (theo email) có phải người được giao / người bán của khách này trên POS đó không. */
export const ownsCustomer = (customer: { pos_id: string; assigned_user_id: string | null; phone: string }, user: { email: string }) =>
  env.DB.prepare('SELECT 1 AS ok FROM pos_users u WHERE u.pos_id=? AND lower(u.email)=lower(?) AND (u.user_id=? OR EXISTS (SELECT 1 FROM customer_stats s WHERE s.pos_id=u.pos_id AND s.phone=? AND s.seller_id=u.user_id)) LIMIT 1')
    .bind(customer.pos_id, user.email, customer.assigned_user_id, customer.phone).first();
