// Số lượng sản phẩm bán theo từng người bán (anh Vũ 07/11/2026: "các sale - cskh tháng này bán bao nhiêu số lượng sản phẩm,
// để cân đo nên bán gì"). Đếm hộp / chai trên đơn chốt trong kỳ (từ Chờ xác nhận trở đi, theo ngày chốt, không tính hủy / xóa),
// bỏ quà tặng, cùng phạm vi trang Sản phẩm (lib/reports/products-report.ts). Gom theo dòng sản phẩm (lib/reports/mkt-product-split.ts).
import { lineCaseSql, type LineKey } from '@/lib/reports/mkt-product-split';

export type QtyBySeller = Record<string, Partial<Record<LineKey, number>>>;

export function sellerQtySql(posIds: string[], startUtc: string, endUtc: string) {
  const ph = posIds.map(() => '?').join(',');
  const sql = `SELECT o.seller_id AS seller_id, ${lineCaseSql('i.name')} AS line, SUM(i.quantity) AS qty
    FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
    WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.status_code NOT IN (0,6,7)
      AND NULLIF(o.seller_id,'') IS NOT NULL AND i.is_bonus=0 AND i.quantity>0 AND TRIM(i.name)<>'' AND LOWER(TRIM(i.name)) NOT LIKE 'quà tặng%'
    GROUP BY 1,2`;
  return { sql, binds: [...posIds, startUtc, endUtc] };
}

export async function sellerProductQty(db: D1Database, posIds: string[], startUtc: string, endUtc: string): Promise<QtyBySeller> {
  const { sql, binds } = sellerQtySql(posIds, startUtc, endUtc);
  const out: QtyBySeller = {};
  for (const r of (await db.prepare(sql).bind(...binds).all<{ seller_id: string; line: LineKey; qty: number }>()).results) (out[String(r.seller_id)] ??= {})[r.line] = Number(r.qty);
  return out;
}

/** Cộng số lượng của một nhóm người theo dòng sản phẩm. */
export function qtyOf(map: QtyBySeller, ids: Iterable<string>) {
  const out: Partial<Record<LineKey, number>> = {};
  for (const id of ids) for (const [k, v] of Object.entries(map[id] ?? {})) out[k as LineKey] = (out[k as LineKey] ?? 0) + (v ?? 0);
  return out;
}
