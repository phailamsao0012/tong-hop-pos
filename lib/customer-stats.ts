// Dựng bảng số liệu theo khách (customer_stats) từ đơn nguồn cho các (POS, SĐT) có đơn thay đổi.
// Mua thành công = trạng thái Đã nhận (3) hoặc Đã thu tiền (16). Khách nhận diện theo SĐT trong một POS.
import { CLOSED, NET } from '@/lib/stats';

export const SUCCESS = 'status_code IN (3,16)';
export type DirtyCustomers = Map<string, Set<string>>; // posId -> phones

export const normalizePhone = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
};

export function markDirtyCustomer(dirty: DirtyCustomers, posId: string, phone: string | null | undefined) {
  if (!phone) return;
  if (!dirty.has(posId)) dirty.set(posId, new Set());
  dirty.get(posId)!.add(phone);
}

type Row = Record<string, string | number | null>;

async function run(db: D1Database, statements: D1PreparedStatement[]) {
  let writes = 0;
  for (let i = 0; i < statements.length; i += 100) {
    const results = await db.batch(statements.slice(i, i + 100));
    for (const r of results) writes += Number(r.meta?.rows_written ?? 0);
  }
  return writes;
}

const COLUMNS = [
  'name', 'customer_id', 'seller_id', 'first_order_at', 'last_order_at', 'first_assigned_at', 'orders', 'closed_orders',
  'success_orders', 'success_gross', 'success_net', 'success_quantity', 'returned_orders', 'cancelled_orders',
  'first_success_at', 'last_success_at', 'product_kinds', 'products_json',
] as const;

/** Tính lại số liệu khách cho các SĐT đã đổi. Trả về số dòng ghi. */
export async function rebuildCustomerStats(db: D1Database, dirty: DirtyCustomers) {
  const now = new Date().toISOString();
  let writes = 0;
  for (const [posId, phones] of dirty) {
    const list = [...phones];
    for (let i = 0; i < list.length; i += 40) {
      const chunk = list.slice(i, i + 40);
      const ph = chunk.map(() => '?').join(',');
      const [agg, latest, products] = await db.batch([
        db.prepare(`
          SELECT phone,
            MIN(created_at) AS first_order_at, MAX(created_at) AS last_order_at, MIN(seller_assigned_at) AS first_assigned_at,
            SUM(CASE WHEN status_code<>7 THEN 1 ELSE 0 END) AS orders,
            SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS closed_orders,
            SUM(CASE WHEN ${SUCCESS} THEN 1 ELSE 0 END) AS success_orders,
            COALESCE(SUM(CASE WHEN ${SUCCESS} THEN current_total ELSE 0 END),0) AS success_gross,
            COALESCE(SUM(CASE WHEN ${SUCCESS} THEN ${NET} ELSE 0 END),0) AS success_net,
            SUM(CASE WHEN status_code IN (4,5,15) THEN 1 ELSE 0 END) AS returned_orders,
            SUM(CASE WHEN status_code IN (6,7) THEN 1 ELSE 0 END) AS cancelled_orders,
            MIN(CASE WHEN ${SUCCESS} THEN created_at END) AS first_success_at,
            MAX(CASE WHEN ${SUCCESS} THEN created_at END) AS last_success_at
          FROM raw_pos_orders WHERE pos_id=? AND phone IN (${ph}) GROUP BY phone`).bind(posId, ...chunk),
        // Tên, mã khách và người bán theo đơn gần nhất (không tính đơn xóa).
        // SQLite trả các cột "trần" từ đúng dòng có MAX(created_at); chỉ đọc qua chỉ mục (pos_id, phone).
        // (Bản cũ dùng truy vấn con tương quan, quét ~700k dòng mỗi lần và làm D1 quá hạn CPU.)
        db.prepare(`
          SELECT phone, customer_name, customer_id, seller_id, MAX(created_at) AS created_at FROM raw_pos_orders
          WHERE pos_id=? AND phone IN (${ph}) AND status_code<>7 GROUP BY phone
        `).bind(posId, ...chunk),
        db.prepare(`
          SELECT o.phone, COALESCE(i.product_id,'') AS product_id, MAX(i.name) AS name, SUM(i.quantity) AS quantity, SUM(i.line_total) AS total, COUNT(DISTINCT o.id) AS orders
          FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
          WHERE o.pos_id=? AND o.phone IN (${ph}) AND o.${SUCCESS} GROUP BY o.phone, product_id`).bind(posId, ...chunk),
      ]);
      const latestMap = new Map((latest.results as Row[]).map((r) => [String(r.phone), r]));
      const productMap = new Map<string, { productId: string; name: string; quantity: number; total: number; orders: number }[]>();
      for (const r of products.results as Row[]) {
        const phone = String(r.phone);
        if (!productMap.has(phone)) productMap.set(phone, []);
        productMap.get(phone)!.push({ productId: String(r.product_id), name: String(r.name ?? ''), quantity: Number(r.quantity), total: Number(r.total), orders: Number(r.orders) });
      }
      const statements: D1PreparedStatement[] = [];
      const seen = new Set<string>();
      for (const r of agg.results as Row[]) {
        const phone = String(r.phone);
        seen.add(phone);
        const l = latestMap.get(phone);
        const prods = (productMap.get(phone) ?? []).sort((a, b) => b.total - a.total);
        const values: Record<string, string | number | null> = {
          name: String(l?.customer_name ?? ''), customer_id: l?.customer_id ?? null, seller_id: l?.seller_id ?? null,
          first_order_at: r.first_order_at, last_order_at: r.last_order_at, first_assigned_at: r.first_assigned_at,
          orders: Number(r.orders), closed_orders: Number(r.closed_orders), success_orders: Number(r.success_orders),
          success_gross: Number(r.success_gross), success_net: Number(r.success_net),
          success_quantity: prods.reduce((a, p) => a + p.quantity, 0),
          returned_orders: Number(r.returned_orders), cancelled_orders: Number(r.cancelled_orders),
          first_success_at: r.first_success_at, last_success_at: r.last_success_at,
          product_kinds: prods.length, products_json: JSON.stringify(prods.slice(0, 50)),
        };
        statements.push(db.prepare(
          `INSERT INTO customer_stats (id,pos_id,phone,${COLUMNS.join(',')},updated_at) VALUES (?,?,?${COLUMNS.map(() => ',?').join('')},?)
           ON CONFLICT(id) DO UPDATE SET ${COLUMNS.map((c) => `${c}=excluded.${c}`).join(',')},updated_at=excluded.updated_at
           WHERE ${COLUMNS.map((c) => `customer_stats.${c} IS NOT excluded.${c}`).join(' OR ')}`,
        ).bind(`${posId}:${phone}`, posId, phone, ...COLUMNS.map((c) => values[c] ?? null), now));
      }
      // SĐT không còn đơn nào (đơn bị xóa hẳn) → bỏ dòng.
      for (const phone of chunk) if (!seen.has(phone)) statements.push(db.prepare('DELETE FROM customer_stats WHERE id=?').bind(`${posId}:${phone}`));
      writes += await run(db, statements);
    }
  }
  return writes;
}

/** Dựng lại số liệu khách cho các SĐT có đơn tạo trong một (POS, tháng) — dùng khi khởi tạo. */
export async function buildCustomerStatsMonth(db: D1Database, posId: string, month: string) {
  const start = `${month}-01T00:00:00`, end = `${month}-31T23:59:59`;
  const rows = await db.prepare(`SELECT DISTINCT phone FROM raw_pos_orders WHERE pos_id=? AND created_at>=? AND created_at<=? AND phone IS NOT NULL AND phone<>''`)
    .bind(posId, start, end).all<{ phone: string }>();
  return rebuildCustomerStats(db, new Map([[posId, new Set(rows.results.map((r) => r.phone))]]));
}
