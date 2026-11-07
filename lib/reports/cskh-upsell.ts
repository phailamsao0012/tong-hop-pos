// Tỷ lệ tự upsell của CSKH (anh Vũ 07/11/2026: "tỉ lệ từ mkt đưa về tự ups"): khách do Marketing mang về, có CSKH nhận chăm sóc
// trên đơn (cột CSKH của đơn), rồi chính CSKH đó bán thêm được đơn chốt sau đơn đầu.
// Tỷ lệ = khách có thêm đơn chốt do CSKH đó bán ÷ khách MKT đã giao cho CSKH đó. Khách tính theo POS + SĐT, khách giao trong kỳ,
// đơn bán thêm tính tới hết kỳ. Đơn chốt = đã xác nhận, không mới / hủy / xóa / chờ hàng (cùng cách ô Đơn XN).
import { teamSubquery } from '@/lib/teams/team';

export type UpsellRow = { cskhId: string; handed: number; upsold: number; rate: number | null };

export function cskhUpsellSql(posIds: string[], startUtc: string, endUtc: string) {
  const ph = posIds.map(() => '?').join(',');
  const sql = `WITH handed AS (
      SELECT o.care_id AS cskh, o.pos_id, o.phone, MIN(o.created_at) AS first_at FROM raw_pos_orders o
      WHERE o.pos_id IN (${ph}) AND o.created_at>=? AND o.created_at<? AND o.status_code<>7
        AND NULLIF(TRIM(o.marketer_id),'') IS NOT NULL AND NULLIF(TRIM(o.phone),'') IS NOT NULL AND o.care_id IN ${teamSubquery('cskh')}
      GROUP BY 1,2,3)
    SELECT h.cskh AS cskh_id, COUNT(*) AS handed,
      SUM(EXISTS (SELECT 1 FROM raw_pos_orders u WHERE u.pos_id=h.pos_id AND u.phone=h.phone AND u.seller_id=h.cskh
        AND u.created_at>h.first_at AND u.created_at<? AND u.first_confirmed_at IS NOT NULL AND u.status_code NOT IN (0,6,7,17))) AS upsold
    FROM handed h GROUP BY 1`;
  return { sql, binds: [...posIds, startUtc, endUtc, endUtc] };
}

export async function cskhUpsell(db: D1Database, posIds: string[], startUtc: string, endUtc: string): Promise<UpsellRow[]> {
  const { sql, binds } = cskhUpsellSql(posIds, startUtc, endUtc);
  const rows = (await db.prepare(sql).bind(...binds).all<{ cskh_id: string; handed: number; upsold: number }>()).results;
  return rows.map((r) => ({ cskhId: String(r.cskh_id), handed: Number(r.handed), upsold: Number(r.upsold), rate: Number(r.handed) ? Number(r.upsold) / Number(r.handed) * 100 : null }));
}

/** Tỷ lệ của một nhóm CSKH (cộng khách giao và khách bán thêm của từng người). */
export function upsellOf(rows: UpsellRow[], ids: Iterable<string>) {
  const want = new Set(ids), mine = rows.filter((r) => want.has(r.cskhId));
  const handed = mine.reduce((a, r) => a + r.handed, 0), upsold = mine.reduce((a, r) => a + r.upsold, 0);
  return { handed, upsold, rate: handed ? upsold / handed * 100 : null };
}
