// Tách khỏi app/api/raw/orders/detail/route.ts (cải tổ B4/B5, 05/11/2026): chỉ dời chỗ, câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

/** Đơn nguồn theo mã, dòng hàng, tên nhân viên và Shop ID các POS (một lượt đọc). */
export const rawOrderSources = (id: string) => env.DB.batch([
  env.DB.prepare('SELECT * FROM raw_pos_orders WHERE id=?').bind(id),
  env.DB.prepare('SELECT name,quantity,retail_price,discount,line_total,returned_count,is_bonus,product_id,variation_id FROM raw_pos_order_items WHERE order_id=? ORDER BY id').bind(id),
  env.DB.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
  env.DB.prepare('SELECT id, shop_id FROM pos_shops'),
]);
/** Người bán hoặc NV chăm sóc của đơn có thuộc bộ phận của tài khoản không (`team` = câu con teamSubquery). */
export const inTeam = (team: string, sellerId: string | number | null, careId: string | number | null) => env.DB.prepare(`SELECT 1 AS x WHERE ? IN ${team} OR ? IN ${team}`).bind(sellerId ?? '', careId ?? '').first();
