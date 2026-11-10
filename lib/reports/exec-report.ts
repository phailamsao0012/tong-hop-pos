// Tách khỏi app/api/reports/exec/route.ts (cải tổ B4, 05/11/2026): chỉ dời chỗ, câu SQL và số liệu giữ nguyên.
import { env } from 'cloudflare:workers';
import { addDays, compareWindow, todayVn, vnRangeUtc } from '@/lib/shared/report-time';
import { CLOSED, NET } from '@/lib/reports/stats';
import { COUNTED_STAFF, countedFilter, teamFilter } from '@/lib/teams/team';

// Màn Điều hành (kế hoạch quản trị, giai đoạn 2b · 26/09/2026): tiến độ tháng và ba bộ phận.
// - daily: doanh thu đơn chốt từng ngày từ đầu tháng tới hôm nay (để vẽ cộng dồn so mục tiêu và dự báo cuối tháng).
// - teams: doanh thu đơn chốt từ đầu tháng của Sale, CSKH (theo người bán thuộc bộ phận) và đơn có Marketer (số MKT đưa về),
//   so với cùng số ngày đầu tháng trước. Đơn chốt = từ Chờ xác nhận trở đi, theo ngày chốt.
// `asked` = ?month=YYYY-MM của kỳ đang chọn.
export async function execReport(posIds: string[], asked: string) {
  // ?month=YYYY-MM: theo tháng của kỳ đang chọn (anh Vũ 04/11/2026 "chọn tháng trước rồi mà xu hướng vẫn tháng 11").
  // Tháng đã qua thì tính trọn tháng; tháng này hoặc sai dạng thì như cũ (tới hôm nay).
  const now = todayVn();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked < now.slice(0, 7) ? asked : now.slice(0, 7);
  const monthStart = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const today = month === now.slice(0, 7) ? now : `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const day = Number(today.slice(8, 10));
  const prevStart = (() => { const d = new Date(`${monthStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const prevDays = new Date(Date.UTC(Number(prevStart.slice(0, 4)), Number(prevStart.slice(5, 7)), 0)).getUTCDate();
  const prevEnd = addDays(prevStart, Math.min(day, prevDays) - 1);
  // Tháng trước lấy tới cùng giờ hiện tại của ngày tương ứng (yêu cầu 30/09/2026), nên kỳ trước đọc thẳng đơn gốc.
  const cur = vnRangeUtc(monthStart, today), prev = compareWindow(today, { start: prevStart, end: prevEnd });
  const ph = posIds.map(() => '?').join(',');
  // Tổng, theo ngày và Sale đọc bảng tổng hợp theo ngày (stats_daily, closed_* theo ngày xác nhận lần đầu) — nhẹ, cùng nguồn với Tổng quan.
  // CSKH (NV chăm sóc) và số MKT (có Marketer) không có trong bảng tổng hợp nên vẫn đọc đơn gốc, chỉ 4 câu.
  // Chỉ người được tính doanh số (tên có hậu tố MKT / CSKH / SALE, lib/team.ts).
  const statsWhere = `pos_id IN (${ph}) AND day>=? AND day<=?${countedFilter('seller_id')}`;
  const stat = (extra: string, from: string, to: string) =>
    env.DB.prepare(`SELECT COALESCE(SUM(closed_orders),0) AS n, COALESCE(SUM(closed_net),0) AS net FROM stats_daily WHERE ${statsWhere}${extra}`).bind(...posIds, from, to);
  // Tổng chỉ người bán được tính; Sale / CSKH đã lọc trong teamFilter, Số MKT lọc theo Marketer (không theo người bán) như các màn khác.
  const base = `pos_id IN (${ph}) AND ${CLOSED} AND first_closed_at>=? AND first_closed_at<?`;
  const SELLER = countedFilter('seller_id');
  const raw = (extra: string, r: { startUtc: string; endUtc: string }) =>
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders WHERE ${base}${extra}`).bind(...posIds, r.startUtc, r.endUtc);
  const MKT = ` AND NULLIF(TRIM(marketer_id),'') IS NOT NULL AND marketer_id IN ${COUNTED_STAFF}`;
  // Số MKT theo ngày xác nhận lần đầu, đơn đã xác nhận (không tính Chờ xác nhận), cùng cách Tổng quan POS / Marketing (anh Vũ 06/11/2026).
  const mkt = (r: { startUtc: string; endUtc: string }) =>
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders WHERE pos_id IN (${ph}) AND first_confirmed_at>=? AND first_confirmed_at<? AND status_code NOT IN (0,17,6,7)${MKT}`).bind(...posIds, r.startUtc, r.endUtc);
  const saleF = teamFilter('seller_id', 'sale');
  const parts = [
    { key: 'sale', label: 'Sale', cur: stat(saleF, monthStart, today), prev: raw(saleF, prev) },
    { key: 'cskh', label: 'CSKH', cur: raw(teamFilter('seller_id', 'cskh'), cur), prev: raw(teamFilter('seller_id', 'cskh'), prev) },
    { key: 'mkt', label: 'Số MKT đưa về', cur: mkt(cur), prev: mkt(prev) },
  ];
  const [daily, total, prevTotal, ...rest] = await env.DB.batch([
    env.DB.prepare(`SELECT day, COALESCE(SUM(closed_orders),0) AS n, COALESCE(SUM(closed_net),0) AS net FROM stats_daily WHERE ${statsWhere} GROUP BY day ORDER BY day`).bind(...posIds, monthStart, today),
    stat('', monthStart, today), raw(SELLER, prev),
    ...parts.flatMap((t) => [t.cur, t.prev]),
  ]);
  const one = (r: D1Result) => { const x = (r.results[0] ?? {}) as { n?: number; net?: number }; return { orders: Number(x.n ?? 0), net: Number(x.net ?? 0) }; };
  return {
    month, today, day, daysInMonth, prevStart, prevEnd, prevCutoff: prev.cutoff,
    daily: (daily.results as { day: string; n: number; net: number }[]).map((r) => ({ day: r.day, orders: Number(r.n), net: Number(r.net) })),
    total: one(total), prevTotal: one(prevTotal),
    teams: parts.map((t, i) => ({ key: t.key, label: t.label, current: one(rest[i * 2]), previous: one(rest[i * 2 + 1]) })),
    definitions: {
      teams: 'Sale = đơn của người bán thuộc bộ phận Sale; CSKH = đơn của người bán thuộc bộ phận CSKH; Số MKT = đơn đã xác nhận có Marketer được tính doanh số (tên có hậu tố MKT…), theo ngày xác nhận. Chỉ tính người có hậu tố MKT, CSKH, SALE trong tên Pancake. Một đơn có thể vừa là số MKT vừa thuộc Sale / CSKH, nên ba thanh không cộng thành tổng.',
      pace: 'So cùng số ngày đầu tháng trước, ngày cuối tính tới cùng giờ hiện tại. Dự báo cuối tháng = doanh thu trung bình mỗi ngày đã qua × số ngày của tháng.',
    },
  };
}
