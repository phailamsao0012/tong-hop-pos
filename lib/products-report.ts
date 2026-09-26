// Trang Sản phẩm (kế hoạch quản trị, giai đoạn 4b · 26/09/2026): sản phẩm bán chạy, so kỳ trước, hoàn theo sản phẩm, xu hướng theo ngày.
// Phạm vi: dòng sản phẩm (không tính quà tặng) của đơn chốt trong kỳ (đã xác nhận trở đi, theo ngày xác nhận lần đầu, không tính hủy / xóa).
// Tiền hàng = (giá bán lẻ − giảm từng sản phẩm) × số lượng, trước giảm giá cả đơn, nên cộng lại có thể lớn hơn doanh thu đơn.
import { env } from 'cloudflare:workers';
import { groupsOf } from '@/lib/product-groups';
import { comparePeriod, vnRangeUtc } from '@/lib/report-time';
import { dayExpr } from '@/lib/stats';

type Row = { name: string; orders: number; qty: number; ret_qty: number; revenue: number };

async function aggregate(posIds: string[], start: string, end: string) {
  const { startUtc, endUtc } = vnRangeUtc(start, end);
  const ph = posIds.map(() => '?').join(',');
  const res = await env.DB.prepare(`SELECT TRIM(i.name) AS name, COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS qty,
      SUM(CASE WHEN o.status_code IN (4,5,15) THEN i.quantity ELSE MIN(i.returned_count, i.quantity) END) AS ret_qty, SUM(i.line_total) AS revenue
    FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
    WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)
      AND i.is_bonus=0 AND i.quantity>0 AND TRIM(i.name)<>'' AND TRIM(i.name) NOT LIKE 'quà tặng%'
    GROUP BY 1`).bind(...posIds, startUtc, endUtc).all<Row>();
  return res.results;
}

export type ProductsReport = Awaited<ReturnType<typeof productsReport>>;

export async function productsReport(opts: { posIds: string[]; start: string; end: string }) {
  const prev = comparePeriod(opts.start, opts.end, 'previous');
  const [cur, before] = await Promise.all([aggregate(opts.posIds, opts.start, opts.end), aggregate(opts.posIds, prev.start, prev.end)]);
  const prevMap = new Map(before.map((r) => [r.name, r]));
  const rows = cur.map((r) => {
    const p = prevMap.get(r.name);
    return {
      name: r.name, group: groupsOf(null, [r.name], 'main', 'product')[0], orders: Number(r.orders), qty: Number(r.qty), revenue: Number(r.revenue),
      returnedQty: Number(r.ret_qty ?? 0), returnRate: Number(r.qty) ? Number(r.ret_qty ?? 0) / Number(r.qty) * 100 : null,
      prevRevenue: p ? Number(p.revenue) : 0, prevQty: p ? Number(p.qty) : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);
  // Xu hướng theo ngày cho 8 sản phẩm doanh thu cao nhất.
  const top = rows.slice(0, 8).map((r) => r.name);
  const { startUtc, endUtc } = vnRangeUtc(opts.start, opts.end);
  const ph = opts.posIds.map(() => '?').join(',');
  const series = top.length ? (await env.DB.prepare(`SELECT TRIM(i.name) AS name, ${dayExpr('o.first_confirmed_at')} AS day, SUM(i.line_total) AS revenue, SUM(i.quantity) AS qty
      FROM raw_pos_orders o JOIN raw_pos_order_items i ON i.order_id=o.id
      WHERE o.pos_id IN (${ph}) AND o.first_confirmed_at>=? AND o.first_confirmed_at<? AND o.status_code NOT IN (0,17,6,7)
        AND i.is_bonus=0 AND i.quantity>0 AND TRIM(i.name) IN (${top.map(() => '?').join(',')})
      GROUP BY 1,2 ORDER BY 2`).bind(...opts.posIds, startUtc, endUtc, ...top).all<{ name: string; day: string; revenue: number; qty: number }>()).results : [];
  const groups = new Map<string, { revenue: number; qty: number; prevRevenue: number }>();
  for (const r of rows) { const g = groups.get(r.group) ?? { revenue: 0, qty: 0, prevRevenue: 0 }; g.revenue += r.revenue; g.qty += r.qty; g.prevRevenue += r.prevRevenue; groups.set(r.group, g); }
  const sum = (k: 'revenue' | 'qty' | 'returnedQty' | 'prevRevenue') => rows.reduce((t, r) => t + r[k], 0);
  // Kỳ trước tính trọn (kể cả sản phẩm kỳ này không bán), để % tăng giảm không bị thổi phồng.
  const prevTotal = before.reduce((t, r) => t + Number(r.revenue), 0);
  for (const r of before) { if (cur.some((c) => c.name === r.name)) continue; const g = groupsOf(null, [r.name], 'main', 'product')[0]; const x = groups.get(g) ?? { revenue: 0, qty: 0, prevRevenue: 0 }; x.prevRevenue += Number(r.revenue); groups.set(g, x); }
  return {
    period: { start: opts.start, end: opts.end }, prevPeriod: prev,
    total: { products: rows.length, qty: sum('qty'), revenue: sum('revenue'), returnedQty: sum('returnedQty'), prevRevenue: prevTotal,
      returnRate: sum('qty') ? sum('returnedQty') / sum('qty') * 100 : null },
    groups: [...groups.entries()].map(([label, g]) => ({ label, ...g })).sort((a, b) => b.revenue - a.revenue),
    rows: rows.slice(0, 300),
    series: top.map((name) => ({ name, points: series.filter((s) => s.name === name).map((s) => ({ day: s.day, revenue: Number(s.revenue), qty: Number(s.qty) })) })),
    definitions: {
      scope: 'Dòng sản phẩm của đơn chốt trong kỳ (đã xác nhận trở đi, theo ngày xác nhận lần đầu, không tính hủy / xóa), bỏ quà tặng. Gộp theo tên sản phẩm trên đơn.',
      revenue: 'Tiền hàng = (giá bán lẻ − giảm từng sản phẩm) × số lượng, trước giảm giá cả đơn, nên tổng có thể lớn hơn doanh thu đơn chốt.',
      returned: 'Hoàn = số lượng của đơn đang ở trạng thái hoàn, cộng số lượng trả lại một phần của đơn khác; tỷ lệ hoàn = SL hoàn ÷ SL bán.',
      group: 'Nhóm theo tên sản phẩm: Kháng sinh = BIO NANO SHIELD, GENTADOX, OXY + BỔ HUYẾT; SK + GK = Godkill / SK + GK; còn lại là Khác.',
    },
  };
}
