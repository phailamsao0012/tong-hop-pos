// Phân tích Sale (kế hoạch quản trị, giai đoạn 3b · 26/09/2026): chốt nhanh, chốt đúng.
// - Theo số được chia (seller_assigned_at trong kỳ): tỷ lệ chốt data, thời gian từ lúc nhận số tới lúc chốt.
// - Giờ vàng (05/10/2026): 24 khung giờ của từng ngày trong kỳ (số được chia, chốt từ số, đơn chốt, doanh thu); trang tự gộp theo thứ.
// - Theo đơn chốt (ngày xác nhận lần đầu trong kỳ): doanh thu, GTTB, tỷ lệ hoàn và hủy sau chốt theo người chốt.
// Chỉ đọc cột đầu bảng / chỉ mục phủ (idx_raw_orders_pos_assignment, idx_raw_orders_pos_confirmed_status_money), không đọc JSON gốc.
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { vnRangeUtc } from '@/lib/report-time';
import { dayRows, vnDayHour } from '@/lib/sale-hours';
import { STATUS_GROUPS } from '@/lib/stats';
import { teamFilter } from '@/lib/team';

const NET = 'COALESCE(net_total,COALESCE(current_total,0)-COALESCE(total_discount,0))';
const NOT_CLOSED = [...STATUS_GROUPS.new, ...STATUS_GROUPS.cancelled].join(',');
const RETURNED = STATUS_GROUPS.returned.join(',');
const toMs = (s: string) => Date.parse(s.endsWith('Z') || s.includes('+') ? s : `${s}Z`);
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const CLOSE_BUCKETS = [
  { key: 'm15', label: 'Dưới 15 phút', max: 15 }, { key: 'h1', label: '15–60 phút', max: 60 }, { key: 'h3', label: '1–3 giờ', max: 180 },
  { key: 'd1', label: '3–24 giờ', max: 1440 }, { key: 'more', label: 'Trên 1 ngày', max: Infinity },
] as const;

export type SaleAnalytics = Awaited<ReturnType<typeof saleAnalytics>>;

export async function saleAnalytics(opts: { posIds: string[]; start: string; end: string }) {
  const db = env.DB;
  const { startUtc, endUtc } = vnRangeUtc(opts.start, opts.end);
  const ph = opts.posIds.map(() => '?').join(',');
  const binds = [...opts.posIds, startUtc, endUtc];
  const sale = teamFilter('seller_id', 'sale');
  const [assigned, closed, names, hourly] = await db.batch([
    db.prepare(`SELECT seller_id, seller_assigned_at AS at, first_confirmed_at AS closed_at, status_code FROM raw_pos_orders
      WHERE pos_id IN (${ph}) AND seller_assigned_at>=? AND seller_assigned_at<? AND seller_id IS NOT NULL${sale}`).bind(...binds),
    db.prepare(`SELECT seller_id, COUNT(*) AS closed, COALESCE(SUM(CASE WHEN status_code<>6 THEN ${NET} END),0) AS net, SUM(status_code IN (${RETURNED})) AS returned, SUM(status_code=6) AS cancelled
      FROM raw_pos_orders WHERE pos_id IN (${ph}) AND first_confirmed_at>=? AND first_confirmed_at<? AND status_code NOT IN (0,17,7) AND seller_id IS NOT NULL${sale}
      GROUP BY seller_id`).bind(...binds),
    db.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department FROM pos_users WHERE name<>'' GROUP BY user_id"),
    // Đơn chốt và doanh thu theo ngày + giờ xác nhận lần đầu (giờ Việt Nam), cùng điều kiện với truy vấn đơn chốt ở trên.
    db.prepare(`SELECT strftime('%Y-%m-%d %H', first_confirmed_at, '+7 hours') AS dh, COUNT(*) - SUM(status_code=6) AS closed, COALESCE(SUM(CASE WHEN status_code<>6 THEN ${NET} END),0) AS net
      FROM raw_pos_orders WHERE pos_id IN (${ph}) AND first_confirmed_at>=? AND first_confirmed_at<? AND status_code NOT IN (0,17,7) AND seller_id IS NOT NULL${sale}
      GROUP BY dh`).bind(...binds),
  ]);
  const nameMap = new Map((names.results as { user_id: string; name: string; department: string | null }[]).map((r) => [r.user_id, r]));
  type S = { assigned: number; closedFromAssigned: number; minutes: number[] };
  const per = new Map<string, S>();
  const days = dayRows(opts.start, opts.end);
  const dayIndex = new Map(days.map((d, i) => [d.day, i]));
  const buckets = CLOSE_BUCKETS.map(() => 0);
  const allMinutes: number[] = [];
  for (const r of assigned.results as { seller_id: string; at: string; closed_at: string | null; status_code: number }[]) {
    const s = per.get(r.seller_id) ?? { assigned: 0, closedFromAssigned: 0, minutes: [] };
    s.assigned++;
    const t = toMs(r.at);
    const { day, hour } = vnDayHour(t);
    const row = days[dayIndex.get(day) ?? -1];
    if (row) row.a[hour]++;
    const isClosed = !!r.closed_at && !NOT_CLOSED.split(',').includes(String(r.status_code));
    if (isClosed) {
      s.closedFromAssigned++;
      if (row) row.c[hour]++;
      const m = (toMs(r.closed_at!) - t) / 60000;
      if (m >= 0) { s.minutes.push(m); allMinutes.push(m); buckets[CLOSE_BUCKETS.findIndex((b) => m < b.max)]++; }
    }
    per.set(r.seller_id, s);
  }
  for (const r of hourly.results as { dh: string | null; closed: number; net: number }[]) {
    const row = r.dh ? days[dayIndex.get(r.dh.slice(0, 10)) ?? -1] : undefined, hour = Number(r.dh?.slice(11, 13));
    if (row && hour >= 0 && hour < 24) { row.o[hour] += Number(r.closed); row.net[hour] += Number(r.net); }
  }
  const closedMap = new Map((closed.results as { seller_id: string; closed: number; net: number; returned: number; cancelled: number }[]).map((r) => [r.seller_id, r]));
  const ids = new Set([...per.keys(), ...closedMap.keys()]);
  const staff = [...ids].map((id) => {
    const a = per.get(id), c = closedMap.get(id);
    const closedN = Number(c?.closed ?? 0) - Number(c?.cancelled ?? 0);
    return {
      staffId: id, name: nameMap.get(id)?.name ?? `NV ${id.slice(0, 8)}`, department: nameMap.get(id)?.department ?? null,
      assigned: a?.assigned ?? 0, closedFromAssigned: a?.closedFromAssigned ?? 0,
      dataRate: a?.assigned ? a.closedFromAssigned / a.assigned * 100 : null,
      medianMinutes: median(a?.minutes ?? []),
      closed: closedN, net: Number(c?.net ?? 0), aov: closedN ? Number(c?.net ?? 0) / closedN : null,
      returnRate: closedN ? Number(c?.returned ?? 0) / closedN * 100 : null,
      cancelAfterClose: Number(c?.closed ?? 0) ? Number(c?.cancelled ?? 0) / Number(c?.closed ?? 0) * 100 : null,
    };
  }).filter((s) => s.assigned || s.closed).sort((a, b) => b.net - a.net).map((s, i) => ({ ...s, rank: i + 1 }));
  const sum = (k: 'assigned' | 'closedFromAssigned' | 'closed' | 'net') => staff.reduce((t, s) => t + s[k], 0);
  const totalReturned = [...closedMap.values()].reduce((t, r) => t + Number(r.returned), 0);
  const totalCancelled = [...closedMap.values()].reduce((t, r) => t + Number(r.cancelled), 0);
  const totalClosed = sum('closed');
  return {
    period: { start: opts.start, end: opts.end },
    total: {
      assigned: sum('assigned'), closedFromAssigned: sum('closedFromAssigned'), dataRate: sum('assigned') ? sum('closedFromAssigned') / sum('assigned') * 100 : null,
      medianMinutes: median(allMinutes), closed: totalClosed, net: sum('net'), aov: totalClosed ? sum('net') / totalClosed : null,
      returnRate: totalClosed ? totalReturned / totalClosed * 100 : null, cancelAfterClose: totalClosed + totalCancelled ? totalCancelled / (totalClosed + totalCancelled) * 100 : null,
    },
    days, buckets: CLOSE_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, n: buckets[i] })),
    staff, posIds: opts.posIds.length === POS.length ? null : opts.posIds,
    definitions: {
      dataRate: 'Tỷ lệ chốt data = số được chia trong kỳ đã chốt (xác nhận trở đi) ÷ số được chia trong kỳ, theo lúc chia số cho người bán.',
      time: 'Thời gian chốt = từ lúc chia số cho người bán tới lúc xác nhận lần đầu. Trung vị = một nửa số đơn chốt nhanh hơn mức này.',
      heat: 'Giờ vàng: 24 khung giờ (giờ Việt Nam, mỗi khung 1 tiếng, vd 9h = 9:00–9:59) của từng ngày. Số được chia, chốt từ số và % chốt data tính theo giờ chia số cho người bán; đơn chốt và doanh thu tính theo giờ xác nhận lần đầu (không tính đơn hủy sau chốt). Màu càng đậm số càng cao; % chốt ở ô ít hơn 5 số được làm mờ.',
      quality: 'Hoàn = đơn chốt trong kỳ hiện ở trạng thái hoàn; Hủy sau chốt = đơn đã xác nhận rồi bị hủy ÷ mọi đơn đã xác nhận trong kỳ. Theo người bán trên đơn.',
      scope: 'Chỉ nhân viên thuộc bộ phận Sale (người bán trên đơn).',
    },
  };
}
