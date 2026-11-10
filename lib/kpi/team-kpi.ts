// KPI team theo kỳ (Giao việc → KPI team, anh Vũ 28/10/2026): KPI doanh thu, trung bình đơn, tỉ lệ chốt đặt cho cả team; leader tự chia
// cho nhân sự, web không chia. KPI vẫn lưu theo tháng ở một chỗ (bảng targets + app_settings target_rate / target_aov, lib/kpi/targets.ts),
// nên trang Tổng quan, trang KPI theo team và báo cáo Zalo đọc cùng số. Chọn kỳ tự do thì quy KPI tháng về kỳ:
// - doanh thu = KPI tháng × số ngày của tháng nằm trong kỳ ÷ số ngày của tháng (như vạch tiến độ ở Tổng quan: KPI × ngày ÷ ngày của tháng);
// - TB đơn và tỉ lệ chốt là tỉ số nên lấy trung bình theo số ngày.
// Một chỉ số chỉ có KPI kỳ khi mọi tháng trong kỳ đều đã đặt; thiếu tháng thì để trống, không đoán. Logic thuần cho trang và test.
import { closeRateOfMany, type RateBase } from '@/lib/reports/metrics';

export type Period = { start: string; end: string };
export type QuickPeriod = 'today' | 'week' | 'month' | 'last-month' | 'next-month' | 'quarter';
export const QUICK_PERIODS: { value: QuickPeriod; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'month', label: 'Tháng này' },
  { value: 'last-month', label: 'Tháng trước' },
  { value: 'next-month', label: 'Tháng sau' },
  { value: 'quarter', label: 'Quý này' },
];
/** Kỳ dài nhất chọn tay: một năm (giữ báo cáo nhẹ). */
export const MAX_PERIOD_DAYS = 366;

const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY_MS).toISOString().slice(0, 10);
/** Số ngày từ start tới end, tính cả hai đầu. */
export const dayCount = (start: string, end: string) => Math.round((toMs(end) - toMs(start)) / DAY_MS) + 1;
export const monthDays = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const monthEnd = (month: string) => `${month}-${String(monthDays(month)).padStart(2, '0')}`;
const shiftMonth = (month: string, n: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

/** Kỳ của nút bấm nhanh, tính theo ngày hôm nay (giờ VN). Tuần bắt đầu thứ Hai. */
export function quickPeriod(kind: QuickPeriod, today: string): Period {
  const month = today.slice(0, 7);
  if (kind === 'today') return { start: today, end: today };
  if (kind === 'week') {
    const start = addDays(today, -((new Date(toMs(today)).getUTCDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  if (kind === 'last-month' || kind === 'next-month') {
    const m = shiftMonth(month, kind === 'last-month' ? -1 : 1);
    return { start: `${m}-01`, end: monthEnd(m) };
  }
  if (kind === 'quarter') {
    const first = shiftMonth(`${month.slice(0, 4)}-01`, Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3);
    return { start: `${first}-01`, end: monthEnd(shiftMonth(first, 2)) };
  }
  return { start: `${month}-01`, end: monthEnd(month) };
}

/** Nút nhanh đang khớp kỳ (để tô đậm); null = kỳ chọn tay. */
export function matchQuick(p: Period, today: string): QuickPeriod | null {
  return QUICK_PERIODS.find((q) => { const x = quickPeriod(q.value, today); return x.start === p.start && x.end === p.end; })?.value ?? null;
}

/** Ngày đúng dạng và có thật (không nhận 31/02), bắt đầu ≤ kết thúc, dài tối đa MAX_PERIOD_DAYS ngày. */
export function validPeriod(p: Period) {
  const real = (d: string) => DATE_RE.test(d) && addDays(d, 0) === d;
  return real(p.start) && real(p.end) && p.start <= p.end && dayCount(p.start, p.end) <= MAX_PERIOD_DAYS;
}

/** Các tháng (YYYY-MM) mà kỳ đi qua. */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let m = start.slice(0, 7); m <= end.slice(0, 7) && out.length < 24; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/** "Tháng 11/2026", "05/11/2026", "03/11 – 09/11/2026". */
export function periodLabel(p: Period) {
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`, y = (d: string) => d.slice(0, 4);
  const m = p.start.slice(0, 7);
  if (p.start === `${m}-01` && p.end === monthEnd(m)) return `Tháng ${m.slice(5)}/${y(m)}`;
  if (p.start === p.end) return `${dm(p.start)}/${y(p.start)}`;
  return y(p.start) === y(p.end) ? `${dm(p.start)} – ${dm(p.end)}/${y(p.end)}` : `${dm(p.start)}/${y(p.start)} – ${dm(p.end)}/${y(p.end)}`;
}

export type MonthKpi = { revenue?: number | null; aov?: number | null; closeRate?: number | null };
export type PeriodKpi = { revenue: number | null; aov: number | null; closeRate: number | null };

/** KPI của kỳ từ KPI các tháng (khoá YYYY-MM). Chỉ số nào có tháng chưa đặt thì để null. */
export function periodTarget(byMonth: Record<string, MonthKpi | undefined>, p: Period): PeriodKpi {
  let revenue: number | null = 0, aov: number | null = 0, rate: number | null = 0, days = 0;
  for (const m of monthsBetween(p.start, p.end)) {
    const from = p.start > `${m}-01` ? p.start : `${m}-01`, to = p.end < monthEnd(m) ? p.end : monthEnd(m);
    const overlap = dayCount(from, to), k = byMonth[m];
    days += overlap;
    revenue = revenue !== null && k?.revenue ? revenue + k.revenue * overlap / monthDays(m) : null;
    aov = aov !== null && k?.aov ? aov + k.aov * overlap : null;
    rate = rate !== null && k?.closeRate ? rate + k.closeRate * overlap : null;
  }
  if (!days) return { revenue: null, aov: null, closeRate: null };
  return { revenue, aov: aov === null ? null : aov / days, closeRate: rate === null ? null : rate / days };
}

export type SellerRow = { sellerId: string; closedNet: number; closedOrders: number; orders: number; assignedOrders?: number; assignedHidden?: boolean; createdClosedOrders?: number; assignedClosedOrders?: number };
export type TeamActual = { revenue: number; orders: number; aov: number | null; closeRate: number | null; people: number };

/** Số thật của một nhóm người trong kỳ (cộng mọi POS của từng người). TB đơn = doanh thu đơn chốt ÷ số đơn chốt, như ô TB đơn
 *  ở báo cáo; tỉ lệ chốt theo cách tính đang chọn (lib/reports/metrics.ts closeRateOfMany). */
export function teamActual(rows: SellerRow[], ids: Iterable<string>, rateBase: RateBase): TeamActual {
  const want = new Set(ids), mine = rows.filter((r) => want.has(r.sellerId));
  const revenue = mine.reduce((a, r) => a + r.closedNet, 0), orders = mine.reduce((a, r) => a + r.closedOrders, 0);
  return { revenue, orders, aov: orders ? revenue / orders : null, closeRate: closeRateOfMany(mine, rateBase), people: mine.length };
}

/** Phần kỳ đã qua tính hết hôm nay (0–1), cho vạch "đúng tiến độ" của doanh thu. Kỳ chưa tới = 0, kỳ đã qua = 1. */
export function elapsedShare(p: Period, today: string) {
  if (today < p.start) return 0;
  if (today >= p.end) return 1;
  return dayCount(p.start, today) / dayCount(p.start, p.end);
}

/** Phần trăm đạt KPI; chưa có KPI hoặc chưa có số thì null. */
export const percentOf = (actual: number | null, target: number | null) => (actual === null || !target ? null : (actual / target) * 100);
