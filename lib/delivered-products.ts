// Đơn khách đã nhận theo sản phẩm, từng ngày, gộp mọi POS đang chọn (anh Vũ 31/10/2026: "xem mỗi ngày nhận bao nhiêu
// đơn thành công của mỗi sản phẩm"; thành công = khách đã nhận hàng).
// Phạm vi: đơn đang ở Đã nhận hoặc Đã thu tiền (3, 16), xếp theo NGÀY KHÁCH NHẬN (delivered_at, giờ VN). Đơn đã nhận rồi
// sau đó hoàn thì không còn tính. Bỏ quà tặng. Một đơn có 2 sản phẩm tính ở cả 2 sản phẩm, nên cột Tổng (đếm đơn) có thể
// nhỏ hơn tổng các cột sản phẩm.
// Đọc theo chỉ mục (pos_id, status_code, created_at): chỉ xét đơn tạo trong 60 ngày trước kỳ trở đi.
import { env } from 'cloudflare:workers';
import { DELIVERED_STATUSES } from '@/lib/pancake';
import { addDays, vnRangeUtc } from '@/lib/report-time';
import { dayExpr } from '@/lib/stats';

export const LOOKBACK_DAYS = 60;
export type DeliveredRow = { day: string; name: string; orders: number; qty: number; revenue: number };
export type DeliveredDay = { day: string; orders: number; net: number };

/** Gom về bảng ngày × sản phẩm: topN sản phẩm nhiều đơn nhất thành cột riêng, còn lại cộng vào "Sản phẩm khác". */
export function pivotDelivered(rows: DeliveredRow[], totals: DeliveredDay[], days: string[], topN = 5) {
  const byName = new Map<string, { name: string; orders: number; qty: number; revenue: number }>();
  for (const r of rows) {
    const p = byName.get(r.name) ?? { name: r.name, orders: 0, qty: 0, revenue: 0 };
    p.orders += r.orders; p.qty += r.qty; p.revenue += r.revenue;
    byName.set(r.name, p);
  }
  const products = [...byName.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue || a.name.localeCompare(b.name, 'vi'));
  const top = products.slice(0, topN).map((p) => p.name);
  const topSet = new Set(top);
  const totalOf = new Map(totals.map((t) => [t.day, t]));
  const table = [...days].reverse().map((day) => {
    const cells: Record<string, number> = Object.fromEntries(top.map((n) => [n, 0]));
    let other = 0;
    for (const r of rows) if (r.day === day) { if (topSet.has(r.name)) cells[r.name] += r.orders; else other += r.orders; }
    return { day, cells, other, orders: totalOf.get(day)?.orders ?? 0, net: totalOf.get(day)?.net ?? 0 };
  });
  return {
    top, products, days: table,
    total: { orders: totals.reduce((t, d) => t + d.orders, 0), net: totals.reduce((t, d) => t + d.net, 0) },
  };
}

export function rangeDays(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export async function deliveredProducts(opts: { posIds: string[]; start: string; end: string }) {
  const { startUtc, endUtc } = vnRangeUtc(opts.start, opts.end);
  const fromCreated = vnRangeUtc(addDays(opts.start, -LOOKBACK_DAYS), opts.end).startUtc;
  const ph = opts.posIds.map(() => '?').join(',');
  const st = DELIVERED_STATUSES.join(',');
  const where = `o.pos_id IN (${ph}) AND o.status_code IN (${st}) AND o.created_at>=? AND o.delivered_at>=? AND o.delivered_at<?`;
  const binds = [...opts.posIds, fromCreated, startUtc, endUtc];
  const [items, totals] = await Promise.all([
    env.DB.prepare(`SELECT ${dayExpr('o.delivered_at')} AS day, TRIM(i.name) AS name, COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS qty, SUM(i.line_total) AS revenue
      FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
      WHERE ${where} AND i.is_bonus=0 AND i.quantity>0 AND TRIM(i.name)<>'' AND LOWER(TRIM(i.name)) NOT LIKE 'quà tặng%'
      GROUP BY 1,2`).bind(...binds).all<DeliveredRow>(),
    env.DB.prepare(`SELECT ${dayExpr('o.delivered_at')} AS day, COUNT(*) AS orders, SUM(o.net_total) AS net FROM raw_pos_orders o WHERE ${where} GROUP BY 1`)
      .bind(...binds).all<DeliveredDay>(),
  ]);
  const rows = items.results.map((r) => ({ day: String(r.day), name: String(r.name), orders: Number(r.orders), qty: Number(r.qty), revenue: Number(r.revenue) }));
  const days = totals.results.map((r) => ({ day: String(r.day), orders: Number(r.orders), net: Number(r.net ?? 0) }));
  return {
    period: { start: opts.start, end: opts.end },
    ...pivotDelivered(rows, days, rangeDays(opts.start, opts.end)),
    definition: `Đơn khách đã nhận hàng (trạng thái Đã nhận hoặc Đã thu tiền), xếp theo ngày khách nhận, gộp các POS đang chọn. Đơn nhận rồi sau đó hoàn thì không tính. Một đơn có nhiều sản phẩm tính ở từng sản phẩm, nên cột Tổng đơn có thể nhỏ hơn tổng các cột. Bỏ quà tặng.`,
  };
}
export type DeliveredProductsReport = Awaited<ReturnType<typeof deliveredProducts>>;
