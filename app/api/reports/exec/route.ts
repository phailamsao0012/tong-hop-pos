import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { addDays, compareWindow, todayVn, vnRangeUtc } from '@/lib/report-time';
import { CLOSED, NET } from '@/lib/stats';
import { teamFilter } from '@/lib/team';

// Màn Điều hành (kế hoạch quản trị, giai đoạn 2b · 26/09/2026): tiến độ tháng và ba bộ phận.
// - daily: doanh thu đơn chốt từng ngày từ đầu tháng tới hôm nay (để vẽ cộng dồn so mục tiêu và dự báo cuối tháng).
// - teams: doanh thu đơn chốt từ đầu tháng của Sale, CSKH (theo người bán thuộc bộ phận) và đơn có Marketer (số MKT đưa về),
//   so với cùng số ngày đầu tháng trước. Đơn chốt = đã xác nhận trở đi, theo ngày xác nhận lần đầu (như Pancake).
export async function GET(request: Request) {
  if (!(await getSessionUser())) return unauthorized();
  const p = new URL(request.url).searchParams;
  const valid = new Set<string>(POS.map((x) => x.id));
  const requested = (p.get('posIds') ?? '').split(',').filter(Boolean);
  if (requested.some((id) => !valid.has(id))) return Response.json({ error: 'POS không hợp lệ.' }, { status: 400 });
  const posIds = requested.length ? requested : [...valid];
  const today = todayVn();
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const day = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const prevStart = (() => { const d = new Date(`${monthStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const prevDays = new Date(Date.UTC(Number(prevStart.slice(0, 4)), Number(prevStart.slice(5, 7)), 0)).getUTCDate();
  const prevEnd = addDays(prevStart, Math.min(day, prevDays) - 1);
  // Tháng trước lấy tới cùng giờ hiện tại của ngày tương ứng (yêu cầu 30/09/2026), nên kỳ trước đọc thẳng đơn gốc.
  const cur = vnRangeUtc(monthStart, today), prev = compareWindow(today, { start: prevStart, end: prevEnd });
  const ph = posIds.map(() => '?').join(',');
  // Tổng, theo ngày và Sale đọc bảng tổng hợp theo ngày (stats_daily, closed_* theo ngày xác nhận lần đầu) — nhẹ, cùng nguồn với Tổng quan.
  // CSKH (NV chăm sóc) và số MKT (có Marketer) không có trong bảng tổng hợp nên vẫn đọc đơn gốc, chỉ 4 câu.
  const statsWhere = `pos_id IN (${ph}) AND day>=? AND day<=?`;
  const stat = (extra: string, from: string, to: string) =>
    env.DB.prepare(`SELECT COALESCE(SUM(closed_orders),0) AS n, COALESCE(SUM(closed_net),0) AS net FROM stats_daily WHERE ${statsWhere}${extra}`).bind(...posIds, from, to);
  const base = `pos_id IN (${ph}) AND ${CLOSED} AND first_confirmed_at>=? AND first_confirmed_at<?`;
  const raw = (extra: string, r: { startUtc: string; endUtc: string }) =>
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders WHERE ${base}${extra}`).bind(...posIds, r.startUtc, r.endUtc);
  const MKT = " AND NULLIF(TRIM(marketer_id),'') IS NOT NULL";
  const saleF = teamFilter('seller_id', 'sale');
  const parts = [
    { key: 'sale', label: 'Sale', cur: stat(saleF, monthStart, today), prev: raw(saleF, prev) },
    { key: 'cskh', label: 'CSKH', cur: raw(teamFilter("COALESCE(NULLIF(care_id,''),seller_id)", 'cskh'), cur), prev: raw(teamFilter("COALESCE(NULLIF(care_id,''),seller_id)", 'cskh'), prev) },
    { key: 'mkt', label: 'Số MKT đưa về', cur: raw(MKT, cur), prev: raw(MKT, prev) },
  ];
  const [daily, total, prevTotal, ...rest] = await env.DB.batch([
    env.DB.prepare(`SELECT day, COALESCE(SUM(closed_orders),0) AS n, COALESCE(SUM(closed_net),0) AS net FROM stats_daily WHERE ${statsWhere} GROUP BY day ORDER BY day`).bind(...posIds, monthStart, today),
    stat('', monthStart, today), raw('', prev),
    ...parts.flatMap((t) => [t.cur, t.prev]),
  ]);
  const one = (r: D1Result) => { const x = (r.results[0] ?? {}) as { n?: number; net?: number }; return { orders: Number(x.n ?? 0), net: Number(x.net ?? 0) }; };
  return Response.json({
    month, today, day, daysInMonth, prevStart, prevEnd, prevCutoff: prev.cutoff,
    daily: (daily.results as { day: string; n: number; net: number }[]).map((r) => ({ day: r.day, orders: Number(r.n), net: Number(r.net) })),
    total: one(total), prevTotal: one(prevTotal),
    teams: parts.map((t, i) => ({ key: t.key, label: t.label, current: one(rest[i * 2]), previous: one(rest[i * 2 + 1]) })),
    definitions: {
      teams: 'Sale = đơn của người bán thuộc bộ phận Sale; CSKH = đơn có NV chăm sóc (trống thì người bán) thuộc CSKH; Số MKT = mọi đơn có Marketer. Một đơn có thể vừa là số MKT vừa thuộc Sale / CSKH, nên ba thanh không cộng thành tổng.',
      pace: 'So cùng số ngày đầu tháng trước, ngày cuối tính tới cùng giờ hiện tại. Dự báo cuối tháng = doanh thu trung bình mỗi ngày đã qua × số ngày của tháng.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
