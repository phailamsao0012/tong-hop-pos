-- Doanh thu đơn chốt theo khách × người bán (01/10/2026): để đo đúng doanh thu nhân viên TỰ chốt trên data mình cầm,
-- không tính đơn người khác bán cho cùng khách. Dựng lại cùng customer_stats mỗi khi đơn của khách đổi (lib/customer-stats.ts).
-- Đơn chốt = mọi trạng thái trừ Mới (0, 17) và Hủy/Xóa (6, 7), như lib/stats.ts CLOSED; tiền = sau giảm giá như NET.
CREATE TABLE IF NOT EXISTS customer_seller_stats (
  id TEXT PRIMARY KEY NOT NULL, -- pos:phone:seller
  pos_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  closed_orders INTEGER NOT NULL DEFAULT 0,
  closed_net INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customer_seller_stats_phone ON customer_seller_stats (pos_id, phone);
INSERT OR REPLACE INTO customer_seller_stats (id, pos_id, phone, seller_id, closed_orders, closed_net)
  SELECT pos_id || ':' || phone || ':' || seller_id, pos_id, phone, seller_id, COUNT(*),
    COALESCE(SUM(COALESCE(net_total, COALESCE(current_total, 0) - COALESCE(total_discount, 0))), 0)
  FROM raw_pos_orders
  WHERE phone IS NOT NULL AND phone <> '' AND seller_id IS NOT NULL AND seller_id <> '' AND status_code NOT IN (0, 17, 6, 7)
  GROUP BY pos_id, phone, seller_id;
