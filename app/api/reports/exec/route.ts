import { env } from 'cloudflare:workers';
import { getSessionUser, unauthorized } from '@/lib/auth';
import { POS } from '@/lib/report-model';
import { addDays, todayVn, vnRangeUtc } from '@/lib/report-time';
import { CLOSED, NET, dayExpr } from '@/lib/stats';
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
  const cur = vnRangeUtc(monthStart, today), prev = vnRangeUtc(prevStart, prevEnd);
  const ph = posIds.map(() => '?').join(',');
  const base = `pos_id IN (${ph}) AND is_removed=0 AND ${CLOSED} AND first_confirmed_at>=? AND first_confirmed_at<?`;
  const sum = (extra: string, r: { startUtc: string; endUtc: string }) =>
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders WHERE ${base}${extra}`).bind(...posIds, r.startUtc, r.endUtc);
  const MKT = " AND NULLIF(TRIM(marketer_id),'') IS NOT NULL";
  const parts = [
    { key: 'sale', label: 'Sale', extra: teamFilter('seller_id', 'sale') },
    { key: 'cskh', label: 'CSKH', extra: teamFilter("COALESCE(NULLIF(care_id,''),seller_id)", 'cskh') },
    { key: 'mkt', label: 'Số MKT đưa về', extra: MKT },
  ];
  const [daily, total, prevTotal, ...rest] = await env.DB.batch([
    env.DB.prepare(`SELECT ${dayExpr('first_confirmed_at')} AS day, COUNT(*) AS n, COALESCE(SUM(${NET}),0) AS net FROM raw_pos_orders WHERE ${base} GROUP BY 1 ORDER BY 1`).bind(...posIds, cur.startUtc, cur.endUtc),
    sum('', cur), sum('', prev),
    ...parts.flatMap((t) => [sum(t.extra, cur), sum(t.extra, prev)]),
  ]);
  const one = (r: D1Result) => { const x = (r.results[0] ?? {}) as { n?: number; net?: number }; return { orders: Number(x.n ?? 0), net: Number(x.net ?? 0) }; };
  return Response.json({
    month, today, day, daysInMonth, prevStart, prevEnd,
    daily: (daily.results as { day: string; n: number; net: number }[]).map((r) => ({ day: r.day, orders: Number(r.n), net: Number(r.net) })),
    total: one(total), prevTotal: one(prevTotal),
    teams: parts.map((t, i) => ({ key: t.key, label: t.label, current: one(rest[i * 2]), previous: one(rest[i * 2 + 1]) })),
    definitions: {
      teams: 'Sale = đơn của người bán thuộc bộ phận Sale; CSKH = đơn có NV chăm sóc (trống thì người bán) thuộc CSKH; Số MKT = mọi đơn có Marketer. Một đơn có thể vừa là số MKT vừa thuộc Sale / CSKH, nên ba thanh không cộng thành tổng.',
      pace: 'So cùng số ngày đầu tháng trước. Dự báo cuối tháng = doanh thu trung bình mỗi ngày đã qua × số ngày của tháng.',
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
