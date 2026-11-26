// Nguồn đọc của bốn báo cáo Marketing (plan Marketing kỳ dài nhanh, BƯỚC 3): bảng đơn gốc (mặc định) hoặc bảng gọn mkt_orders_slim /
// mkt_order_items_slim. Chỉ đọc bảng gọn khi: kỳ dài hơn 62 ngày (isLongRange, như hàng chờ kỳ dài) VÀ THP_MKT_SLIM=1 VÀ mốc
// "đã điền đủ" (mkt_slim_ready_v1, lib/reports/mkt-slim-fill.ts) còn hiệu lực. Mọi câu giữ nguyên, chỉ đổi:
// - tên bảng đơn / món (bảng gọn chỉ có đơn có Marketer, mọi câu của bốn báo cáo đều đã lọc Marketer khác rỗng);
// - bỏ INDEXED BY (chỉ mục của bảng gốc);
// - biểu thức lịch sử (PACKED_SQL, AFTER_PACK_*, NEVER_SENT_CANCELLED_SQL) đọc cờ tính sẵn was_packed / was_sent thay vì mở
//   status_history_json; cùng nghĩa với historyHas(a,'8') và historyHas(a,'2,3,16,4,15,5') lúc chép (lib/reports/mkt-slim.ts).
import { AFTER_PACK_CANCELLED_SQL, AFTER_PACK_RETURNED_SQL, NEVER_SENT_CANCELLED_SQL, PACKED_SQL } from '@/lib/reports/van-don';
import { isLongRange } from '@/lib/ops/long-job';
import { SLIM_ITEMS, SLIM_ORDERS } from '@/lib/reports/mkt-slim';
import { slimReady } from '@/lib/reports/mkt-slim-fill';

export type MktSource = {
  slim: boolean;
  /** Bảng đơn (dùng như `FROM ${orders} o`). */
  orders: string;
  /** Bảng món (dùng như `JOIN ${items} i`). */
  items: string;
  /** `FROM` bảng đơn kèm chỉ mục bắt buộc (chỉ bảng gốc). */
  from: (alias: string, index?: string) => string;
  packed: (a?: string) => string;
  afterPackCancelled: (a?: string) => string;
  afterPackReturned: (a?: string) => string;
  neverSentCancelled: (a?: string) => string;
};

export const RAW_SOURCE: MktSource = {
  slim: false, orders: 'raw_pos_orders', items: 'raw_pos_order_items',
  from: (alias, index) => `raw_pos_orders ${alias}${index ? ` INDEXED BY ${index}` : ''}`,
  packed: PACKED_SQL, afterPackCancelled: AFTER_PACK_CANCELLED_SQL, afterPackReturned: AFTER_PACK_RETURNED_SQL, neverSentCancelled: NEVER_SENT_CANCELLED_SQL,
};

export const SLIM_SOURCE: MktSource = {
  slim: true, orders: SLIM_ORDERS, items: SLIM_ITEMS,
  from: (alias) => `${SLIM_ORDERS} ${alias}`,
  // Cùng cấu trúc PACKED_SQL: trạng thái từ đóng hàng trở đi là 1; đơn hủy thì xem lịch sử từng vào Đang đóng hàng (8).
  packed: (a = 'o') => `(CASE WHEN ${a}.status_code IN (8,9,2,3,16,4,15,5) THEN 1 WHEN ${a}.status_code=6 THEN ${a}.was_packed ELSE 0 END)`,
  afterPackCancelled: (a = 'o') => `(${a}.status_code=6 AND ${a}.was_packed AND NOT ${a}.was_sent)`,
  afterPackReturned: (a = 'o') => `(${a}.status_code IN (4,15,5) OR (${a}.status_code=6 AND ${a}.was_packed AND ${a}.was_sent))`,
  neverSentCancelled: (a = 'o') => `(${a}.status_code=6 AND NOT ${a}.was_sent)`,
};

/** Đổi tên bảng món trong một đoạn SQL dựng sẵn (productExists, mainGroupSql) sang nguồn đang đọc. */
export const withItems = (sql: string, src: MktSource) => src.slim ? sql.replaceAll('raw_pos_order_items', src.items) : sql;

/** Chọn nguồn đọc cho kỳ [start, end] (ngày VN). flags: env (THP_MKT_SLIM). */
export async function mktReadSource(db: D1Database, flags: { THP_MKT_SLIM?: string }, start: string, end: string): Promise<MktSource> {
  if (flags.THP_MKT_SLIM !== '1' || !isLongRange(start, end)) return RAW_SOURCE;
  return await slimReady(db) ? SLIM_SOURCE : RAW_SOURCE;
}
