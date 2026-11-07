// Danh sách đơn sau ô "x đơn" ở cột DT New / DT CSKH của bảng Marketer (anh Vũ 07/11/2026: bấm vào ra chi tiết số đơn).
// Cùng điều kiện với số trên bảng (lib/ops/ad-costs.ts newSplitSql, lib/reports/mkt-analytics.ts closedWhere):
// đơn chốt theo ngày xác nhận lần đầu, bỏ trạng thái 0/17/6/7, marketer được tính doanh số, người bán thuộc Sale (New) hoặc CSKH.
import { NET } from '@/lib/reports/stats';
import { COUNTED_STAFF, teamSubquery } from '@/lib/teams/team';

export type MktOrderKind = 'new' | 'cskh';
export const MKT_ORDER_LIMIT = 500;

export function mktOrdersSql(opts: { posIds: string[]; marketerIds: string[]; kind: MktOrderKind; startUtc: string; endUtc: string }) {
  const ph = (xs: unknown[]) => xs.map(() => '?').join(',');
  const net = NET.replaceAll(/\b(net_total|current_total|total_discount)\b/g, 'o.$1');
  const sellers = teamSubquery(opts.kind === 'new' ? 'sale' : 'cskh');
  return {
    sql: `SELECT o.id, o.source_order_id, o.pos_id, o.phone, o.first_confirmed_at, o.status_code, o.marketer_id, o.seller_id, ${net} AS net
      FROM raw_pos_orders o WHERE o.pos_id IN (${ph(opts.posIds)}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<?
      AND o.status_code NOT IN (0,17,6,7) AND NULLIF(TRIM(o.marketer_id),'') IN (${ph(opts.marketerIds)}) AND o.marketer_id IN ${COUNTED_STAFF}
      AND o.seller_id IN ${sellers} ORDER BY o.first_confirmed_at DESC, o.id DESC LIMIT ${MKT_ORDER_LIMIT + 1}`,
    binds: [...opts.posIds, opts.startUtc, opts.endUtc, ...opts.marketerIds],
  };
}

type Raw = { id: string; source_order_id: string; pos_id: string; phone: string | null; first_confirmed_at: string; status_code: number; marketer_id: string; seller_id: string | null; net: number };
/** Chạy câu trên D1 và gắn tên người, tên POS, chữ trạng thái. */
export async function mktOrders(db: D1Database, opts: { posIds: string[]; marketerIds: string[]; kind: MktOrderKind; startUtc: string; endUtc: string; posName: (id: string) => string; status: (code: number) => string }) {
  const q = mktOrdersSql(opts);
  const [rows, names] = await db.batch([
    db.prepare(q.sql).bind(...q.binds),
    db.prepare("SELECT user_id, MAX(name) AS name FROM pos_users WHERE name<>'' GROUP BY user_id"),
  ]);
  const nameOf = new Map((names.results as { user_id: string; name: string }[]).map((r) => [r.user_id, r.name]));
  const list = rows.results as Raw[];
  return {
    more: list.length > MKT_ORDER_LIMIT,
    orders: list.slice(0, MKT_ORDER_LIMIT).map((r) => ({
      id: r.id, orderId: r.source_order_id, posName: opts.posName(r.pos_id), phone: r.phone, confirmedAt: r.first_confirmed_at, status: opts.status(Number(r.status_code)), statusCode: Number(r.status_code),
      marketer: nameOf.get(r.marketer_id) ?? null, seller: r.seller_id ? nameOf.get(r.seller_id) ?? null : null, net: Number(r.net),
    })),
  };
}
