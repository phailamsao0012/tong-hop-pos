// Tra D1 cho trang Kết nối Pancake. Tách khỏi app/api/connection/catalog/route.ts và app/api/connection/inspect/route.ts (cải tổ B5, 05/11/2026), câu SQL giữ nguyên.
import { env } from 'cloudflare:workers';

/** Shop ID đã lưu của một POS. */
export const shopIdRow = (posId: string | null) => env.DB.prepare('SELECT shop_id FROM pos_shops WHERE id=?').bind(posId).first<{ shop_id: string | null }>();
/** Mã đơn Pancake mới nhất của một POS (để thử endpoint chi tiết đơn). */
export const latestSourceOrder = (posId: string | null) => env.DB.prepare('SELECT source_order_id FROM raw_pos_orders WHERE pos_id=? ORDER BY created_at DESC LIMIT 1').bind(posId).first<{ source_order_id: string }>();
