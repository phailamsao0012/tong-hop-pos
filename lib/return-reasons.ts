import { STATUS_PRESETS } from './order-status';
import { addDays, vnRangeUtc, vnDayStartUtc } from './report-time';
import { teamFilter, type Team } from './team';

export type ReturnOrder = { reason: string | null; pos: string; seller: string; product: string; net: number };
export const normalizeReason = (reason: string | null) => (reason ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi') || 'Không ghi lý do';
export function returnReasons(rows: ReturnOrder[], dimension: 'reason' | 'pos' | 'seller' | 'product' = 'reason') {
  const groups = new Map<string, { label: string; orders: number; net: number; rate: number }>();
  for (const row of rows) {
    const label = dimension === 'reason' ? (row.reason ?? '').trim().replace(/\s+/g, ' ') || 'Không ghi lý do' : row[dimension] || 'Không rõ';
    const key = dimension === 'reason' ? normalizeReason(row.reason) : label;
    const group = groups.get(key) ?? { label, orders: 0, net: 0, rate: 0 };
    group.orders++; group.net += Number(row.net); groups.set(key, group);
  }
  return [...groups.values()].map(g => ({ ...g, rate: rows.length ? g.orders / rows.length * 100 : 0 })).sort((a,b) => b.orders - a.orders || a.label.localeCompare(b.label, 'vi'));
}
export function returnsQuery(posIds: string[], start: string, end: string, team: Team) {
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  return { sql: `WITH selected AS MATERIALIZED (
    SELECT o.id,o.pos_id,o.seller_id,o.net_total,o.current_total,o.total_discount,o.raw_json
    FROM raw_pos_orders o WHERE o.pos_id IN (${posIds.map(() => '?').join(',')})
    AND o.created_at>=? AND o.created_at<? AND o.status_code IN (${STATUS_PRESETS.returned.codes.join(',')})
    AND o.returned_at>=? AND o.returned_at<?${teamFilter('o.seller_id', team)}
    ORDER BY o.returned_at DESC,o.id LIMIT 5001)
    SELECT json_extract(CASE WHEN json_valid(o.raw_json) THEN o.raw_json ELSE '{}' END,'$.returned_reason_name') AS reason,
    o.pos_id AS pos, COALESCE((SELECT MAX(name) FROM pos_users WHERE user_id=o.seller_id), 'Chưa gán người lên đơn') AS seller,
    COALESCE(json_extract(CASE WHEN json_valid(o.raw_json) THEN o.raw_json ELSE '{}' END,'$.items[0].variation_info.name'),
      (SELECT name FROM raw_pos_order_items WHERE order_id=o.id ORDER BY id LIMIT 1), 'Không rõ') AS product,
    COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0)) AS net FROM selected o`,
    binds: [...posIds, vnDayStartUtc(addDays(start,-60)), endUtc, startUtc, endUtc] };
}
export function packReturns(rows: ReturnOrder[]) {
  const limited = rows.length > 5000, list = rows.slice(0,5000);
  return { limited, total: list.length, reasons: returnReasons(list), byPos: returnReasons(list,'pos'), bySeller: returnReasons(list,'seller'), byProduct: returnReasons(list,'product') };
}
export type ReturnsReport = ReturnType<typeof packReturns>;
