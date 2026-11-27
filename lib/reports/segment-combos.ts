// Combo thực tế của một thẻ nhóm đơn (plan docs/plans/2026-11-27-the-san-pham-moi, bước 2): tổ hợp món trong MỘT đơn chốt,
// xếp theo số đơn. Chỉ đọc; cùng phạm vi với số chốt của Tổng quan (POS, kỳ theo ngày tạo đơn, bộ phận / team, nhân viên, bộ lọc thẻ).
import { vnRangeUtc } from '@/lib/shared/report-time';
import { CLOSED, NET } from '@/lib/reports/stats';
import { countedFilter, teamFilter, type HrUnit, type Team } from '@/lib/teams/team';
import { EMPTY_ORDER_FILTERS, orderFilterSql, type OrderFilters } from '@/lib/pancake/order-segments';

export type SegmentCombo = { items: string[]; orders: number; net: number };
export type ComboOptions = { posIds: string[]; start: string; end: string; team: Team; unit?: HrUnit | null; employeeIds?: string[]; filters?: OrderFilters; limit?: number };

export function comboQuery(opts: ComboOptions) {
  const { startUtc, endUtc } = vnRangeUtc(opts.start, opts.end);
  const ids = opts.employeeIds ?? [];
  const filter = orderFilterSql(opts.filters ?? EMPTY_ORDER_FILTERS, opts.team);
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const where = `o.pos_id IN (${opts.posIds.map(() => '?').join(',')}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED}`
    + `${teamFilter('o.seller_id', opts.team, true, opts.unit ?? null)}${countedFilter('o.seller_id')}`
    + `${ids.length ? ` AND o.seller_id IN (${ids.map(() => '?').join(',')})` : ''}${filter.sql}`;
  // Tên món đã gọn (TRIM), bỏ quà và số lượng 0, không lặp trong một đơn, xếp theo tên để cùng tổ hợp ra cùng một khoá.
  const sql = `WITH od AS (SELECT o.id, ${net} AS net FROM raw_pos_orders o WHERE ${where}),
    it AS (SELECT DISTINCT od.id, TRIM(i.name) AS name FROM od JOIN raw_pos_order_items i ON i.order_id=od.id
      WHERE COALESCE(i.is_bonus,0)=0 AND i.quantity>0 AND TRIM(COALESCE(i.name,''))<>''),
    cb AS (SELECT id, json_group_array(name ORDER BY name) AS items FROM it GROUP BY id)
    SELECT cb.items AS items, COUNT(*) AS orders, COALESCE(SUM(od.net),0) AS net FROM cb JOIN od ON od.id=cb.id
    GROUP BY cb.items ORDER BY orders DESC, net DESC, cb.items LIMIT ?`;
  return { sql, binds: [...opts.posIds, startUtc, endUtc, ...ids, ...filter.binds, opts.limit ?? 10] };
}

export async function segmentCombos(db: D1Database, opts: ComboOptions): Promise<SegmentCombo[]> {
  if (!opts.posIds.length) return [];
  const q = comboQuery(opts);
  const rows = (await db.prepare(q.sql).bind(...q.binds).all<{ items: string; orders: number; net: number }>()).results;
  return rows.map((r) => ({ items: JSON.parse(r.items) as string[], orders: Number(r.orders), net: Number(r.net) }));
}
