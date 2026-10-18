import { vnRangeUtc } from './report-time';
import { CLOSED } from './stats';
import { teamFilter, type HrUnit } from './team';
import { EMPTY_ORDER_FILTERS, orderFilterSql, type OrderFilters } from './order-segments';
import { PACKED_SQL } from './van-don';

export type PackedSeller = { sellerId: string; packedOrders: number; packedNet: number };
export type PackedOptions = { posIds: string[]; start: string; end: string; scope?: { unit?: HrUnit | null; employeeIds?: string[]; filters?: OrderFilters } };

export function packedQuery(opts: PackedOptions) {
  const { startUtc, endUtc } = vnRangeUtc(opts.start, opts.end);
  const ids = opts.scope?.employeeIds ?? [];
  const filter = orderFilterSql(opts.scope?.filters ?? EMPTY_ORDER_FILTERS, 'sale');
  return {
    where: `o.pos_id IN (${opts.posIds.map(() => '?').join(',')}) AND o.first_closed_at>=? AND o.first_closed_at<? AND o.${CLOSED}${teamFilter('o.seller_id', 'sale', true, opts.scope?.unit)}${ids.length ? ` AND o.seller_id IN (${ids.map(() => '?').join(',')})` : ''}${filter.sql}`,
    binds: [...opts.posIds, startUtc, endUtc, ...ids, ...filter.binds],
  };
}

export async function packedBySeller(db: D1Database, opts: PackedOptions): Promise<PackedSeller[]> {
  if (!opts.posIds.length) return [];
  const { where, binds } = packedQuery(opts);
  return (await db.prepare(`SELECT o.seller_id AS sellerId, SUM(${PACKED_SQL('o')}) AS packedOrders,
    COALESCE(SUM(CASE WHEN ${PACKED_SQL('o')} THEN o.net_total END),0) AS packedNet
    FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money WHERE ${where} GROUP BY o.seller_id`).bind(...binds).all<PackedSeller>()).results;
}

export async function packedOrderPage(db: D1Database, opts: PackedOptions, page: number) {
  const { where, binds } = packedQuery(opts);
  return (await db.prepare(`SELECT o.id, o.source_order_id AS code, o.status_code AS status, o.net_total AS net
    FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money
    WHERE ${where} AND ${PACKED_SQL('o')} ORDER BY o.first_closed_at DESC, o.id LIMIT 101 OFFSET ?`)
    .bind(...binds, page * 100).all<{ id: string; code: string; status: number; net: number }>()).results;
}
