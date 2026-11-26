// Bảng gọn đơn Marketing (plan docs/plans/2026-11-26-marketing-ky-dai-nhanh, bước 1; anh Vũ 26/11/2026 16h28
// "ok plan marketing kỳ dài nhanh, sao lưu, điền bảng gọn ban đêm, build và lên web thật").
// Mỗi đơn có Marketer một dòng, chỉ các cột báo cáo Marketing cần, để kỳ dài quét bảng nhỏ thay vì bảng đơn gốc rộng.
// BƯỚC 1: chỉ GHI KÈM (cờ THP_MKT_SLIM_WRITE=1); CHƯA báo cáo nào đọc bảng này.
// Cách ghi: sau câu ghi bảng gốc của một đơn (cùng lô), chép lại đúng dòng đó TỪ BẢNG GỐC sang bảng gọn bằng SQL, nên bảng gọn luôn
// giống bảng gốc kể cả các cột giữ giá trị cũ khi cập nhật (first_confirmed_at, first_closed_at…). Đơn mất Marketer hoặc không còn
// trong bảng gốc thì xoá dòng gọn và món của nó. Đơn trạng thái Đã xóa (7) vẫn giữ như bảng gốc (báo cáo tự lọc, có mốc "Đã xóa").
import { historyHas } from '@/lib/reports/van-don';

export const SLIM_ORDERS = 'mkt_orders_slim';
export const SLIM_ITEMS = 'mkt_order_items_slim';

/** Cột bảng gọn lấy nguyên từ raw_pos_orders (cùng tên để bước 3 dùng lại câu SQL). */
export const SLIM_ORDER_COLUMNS = [
  'id', 'pos_id', 'source_order_id', 'created_at', 'first_confirmed_at', 'first_closed_at', 'status_code', 'marketer_id', 'seller_id', 'care_id',
  'first_confirmed_by', 'phone', 'current_total', 'total_discount', 'net_total', 'order_source', 'tags_json', 'note',
] as const;
/** Cột món lấy nguyên từ raw_pos_order_items (itemKey cần product_id, variation_id, name). */
export const SLIM_ITEM_COLUMNS = ['id', 'order_id', 'product_id', 'variation_id', 'name', 'quantity', 'line_total', 'is_bonus'] as const;

const DDL = [
  `CREATE TABLE IF NOT EXISTS ${SLIM_ORDERS} (id TEXT PRIMARY KEY NOT NULL, pos_id TEXT NOT NULL, source_order_id TEXT, created_at TEXT, first_confirmed_at TEXT, first_closed_at TEXT,
    status_code INTEGER, marketer_id TEXT, seller_id TEXT, care_id TEXT, first_confirmed_by TEXT, phone TEXT, current_total INTEGER, total_discount INTEGER, net_total INTEGER,
    order_source TEXT, tags_json TEXT, note TEXT, was_packed INTEGER NOT NULL DEFAULT 0, was_sent INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_${SLIM_ORDERS}_pos_created ON ${SLIM_ORDERS} (pos_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_${SLIM_ORDERS}_pos_confirmed ON ${SLIM_ORDERS} (pos_id, first_confirmed_at)`,
  `CREATE TABLE IF NOT EXISTS ${SLIM_ITEMS} (id TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL, product_id TEXT, variation_id TEXT, name TEXT,
    quantity INTEGER, line_total INTEGER, is_bonus INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_${SLIM_ITEMS}_order ON ${SLIM_ITEMS} (order_id)`,
];

/** Ghi kèm chỉ bật khi THP_MKT_SLIM_WRITE=1 (mặc định tắt, kể cả bản demo: Đầu não 26/11 giữ nguyên số câu ghi của các test K1–K3, Z4).
 * Bản demo muốn có bảng gọn thì đặt cờ này; đơn ảo đi qua cùng orderStatements nên tự ghi kèm. */
// Không import 'cloudflare:workers' (lib/pancake/sync.ts nạp được ở test chạy Node thuần): syncAll đặt cờ từ env mỗi lượt đồng bộ.
let writeOn = false;
export const setSlimWrite = (on: boolean) => { writeOn = on; };
export const slimWriteOn = () => writeOn;

const ready = new WeakSet<D1Database>();
/** Tạo hai bảng gọn nếu chưa có (PC chạy bản chép DB không qua migration). Nhớ theo từng DB trong tiến trình. */
export async function ensureSlimSchema(db: D1Database) {
  if (ready.has(db)) return;
  for (const sql of DDL) await db.prepare(sql).run();
  ready.add(db);
}

/** Cờ lịch sử tính sẵn (thay việc mở status_history_json ở bước 3): từng vào Đang đóng hàng (8); từng giao ĐVVC trở đi (2,3,16,4,15,5).
 * Cùng biểu thức historyHas của lib/reports/van-don.ts mà AFTER_PACK_* và NEVER_SENT_CANCELLED_SQL dùng. */
export const WAS_PACKED = historyHas('o', '8');
export const WAS_SENT = historyHas('o', '2,3,16,4,15,5');
/** Điều kiện đơn có Marketer trên bảng gốc (bí danh o). */
export const HAS_MARKETER = "NULLIF(TRIM(o.marketer_id),'') IS NOT NULL";
/** Phần đầu câu chép đơn gốc (bí danh o) sang bảng gọn; nối thêm FROM/WHERE. */
export const SLIM_ORDER_INSERT = `INSERT OR REPLACE INTO ${SLIM_ORDERS} (${SLIM_ORDER_COLUMNS.join(',')},was_packed,was_sent) SELECT ${SLIM_ORDER_COLUMNS.map((c) => `o.${c}`).join(',')},${WAS_PACKED},${WAS_SENT}`;
/** Phần đầu câu chép món gốc (bí danh i) sang bảng gọn; nối thêm FROM/WHERE. */
export const SLIM_ITEM_INSERT = `INSERT OR REPLACE INTO ${SLIM_ITEMS} (${SLIM_ITEM_COLUMNS.join(',')}) SELECT ${SLIM_ITEM_COLUMNS.map((c) => `i.${c}`).join(',')}`;

/** Câu ghi bảng gọn cho một đơn (id bảng gốc), đặt NGAY SAU các câu ghi bảng gốc và món của đơn đó trong cùng lô. */
export function slimStatements(db: D1Database, orderId: string): D1PreparedStatement[] {
  return [
    // Đơn mất Marketer / không còn ở bảng gốc: xoá dòng gọn. Món luôn dựng lại theo bảng gốc.
    db.prepare(`DELETE FROM ${SLIM_ITEMS} WHERE order_id=?`).bind(orderId),
    db.prepare(`DELETE FROM ${SLIM_ORDERS} WHERE id=? AND NOT EXISTS (SELECT 1 FROM raw_pos_orders o WHERE o.id=${SLIM_ORDERS}.id AND ${HAS_MARKETER})`).bind(orderId),
    db.prepare(`${SLIM_ORDER_INSERT} FROM raw_pos_orders o WHERE o.id=? AND ${HAS_MARKETER}`).bind(orderId),
    db.prepare(`${SLIM_ITEM_INSERT} FROM raw_pos_order_items i WHERE i.order_id=? AND EXISTS (SELECT 1 FROM ${SLIM_ORDERS} s WHERE s.id=i.order_id)`).bind(orderId),
  ];
}

/** Xoá bảng gọn của một POS (bản demo dựng lại thế giới ảo). Bảng chưa có thì bỏ qua. */
export async function clearSlimPos(db: D1Database, posId: string) {
  try {
    await db.prepare(`DELETE FROM ${SLIM_ITEMS} WHERE order_id IN (SELECT id FROM ${SLIM_ORDERS} WHERE pos_id=?)`).bind(posId).run();
    await db.prepare(`DELETE FROM ${SLIM_ORDERS} WHERE pos_id=?`).bind(posId).run();
  } catch { /* chưa có bảng */ }
}
