// Pancake trả thời gian UTC không hậu tố ("2026-09-13T01:35:44"). Báo cáo theo
// ngày Việt Nam (UTC+7): ngày D bắt đầu lúc (D-1)T17:00:00 UTC.

export const VN_OFFSET_HOURS = 7;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Công ty bán hàng từ 01/03/2025: lịch sử đơn chỉ lấy từ đây, cohort và kỳ "Từ đầu" bắt đầu từ đây.
export const COMPANY_START = '2025-03-01';
export const COMPANY_START_MONTH = '2025-03';

const pad = (n: number) => String(n).padStart(2, '0');

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Chuỗi UTC (không hậu tố) tương ứng 00:00 ngày VN. */
export function vnDayStartUtc(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCHours(d.getUTCHours() - VN_OFFSET_HOURS);
  return d.toISOString().slice(0, 19);
}

/** [startUtc, endUtcExclusive) cho khoảng ngày VN đóng [start, end]. */
export function vnRangeUtc(start: string, end: string) {
  return { startUtc: vnDayStartUtc(start), endUtc: vnDayStartUtc(addDays(end, 1)) };
}

export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
}

const monthLength = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const monthBefore = (month: string) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

/** Kỳ so sánh: kỳ liền trước hoặc cùng kỳ năm trước.
 * Kỳ liền trước bám theo lịch (yêu cầu 30/09/2026): kỳ bắt đầu ngày 1 trong cùng một tháng so với cùng các ngày của tháng trước
 * (cả tháng thì so cả tháng trước); kỳ bắt đầu thứ Hai, dài 2–7 ngày trong cùng tuần, so với cùng các thứ của tuần trước;
 * còn lại lùi đúng số ngày (hôm nay ↔ hôm qua, 7 ngày qua ↔ 7 ngày trước đó). */
export function comparePeriod(start: string, end: string, mode: 'previous' | 'year') {
  if (mode === 'year') {
    const shift = (d: string) => {
      const x = new Date(`${d}T00:00:00Z`);
      x.setUTCFullYear(x.getUTCFullYear() - 1);
      return x.toISOString().slice(0, 10);
    };
    return { start: shift(start), end: shift(end) };
  }
  const length = daysBetween(start, end);
  if (length > 1 && start.endsWith('-01') && start.slice(0, 7) === end.slice(0, 7)) {
    const month = monthBefore(start.slice(0, 7)), last = monthLength(month);
    const endDay = Number(end.slice(8, 10)) === monthLength(end.slice(0, 7)) ? last : Math.min(Number(end.slice(8, 10)), last);
    return { start: `${month}-01`, end: `${month}-${pad(endDay)}` };
  }
  const monday = new Date(`${start}T00:00:00Z`).getUTCDay() === 1;
  if (monday && length > 1 && length <= 7) return { start: addDays(start, -7), end: addDays(end, -7) };
  return { start: addDays(start, -length), end: addDays(start, -1) };
}

/** Khung UTC của kỳ so sánh. Kỳ đang xem kết thúc hôm nay (ngày chưa hết) thì ngày cuối của kỳ so sánh chỉ lấy tới cùng giờ hiện tại:
 * hôm nay lúc 16:21 so với hôm qua 0h–16:21, tháng này so với tháng trước tới 16:21 của ngày tương ứng (yêu cầu 30/09/2026).
 * Kỳ so sánh dài hơn CUTOFF_MAX_DAYS thì so trọn ngày: vài giờ lệch không đáng kể mà cắt giờ buộc đọc thẳng đơn gốc, rất nặng. */
export const CUTOFF_MAX_DAYS = 31;
export function compareWindow(end: string, compare: { start: string; end: string }, now = Date.now()) {
  const range = vnRangeUtc(compare.start, compare.end);
  if (end !== todayVn(now) || daysBetween(compare.start, compare.end) > CUTOFF_MAX_DAYS) return { ...compare, ...range, cutoff: null as string | null };
  const elapsed = now - Date.parse(`${vnDayStartUtc(end)}Z`);
  const endUtc = new Date(Date.parse(`${vnDayStartUtc(compare.end)}Z`) + elapsed).toISOString().slice(0, 19);
  const local = new Date(now + VN_OFFSET_HOURS * 3600000);
  return { ...compare, startUtc: range.startUtc, endUtc, cutoff: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}` };
}

export function todayVn(at = Date.now()) {
  const now = new Date(at + VN_OFFSET_HOURS * 3600000);
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/** Biểu thức SQLite gom nhóm theo ngày/tuần/tháng VN cho cột thời gian UTC. */
export function bucketExpr(column: string, groupBy: 'day' | 'week' | 'month') {
  const local = `datetime(${column},'+${VN_OFFSET_HOURS} hours')`;
  if (groupBy === 'month') return `strftime('%Y-%m',${local})`;
  // Tuần bắt đầu thứ Hai: lùi về thứ Hai gần nhất.
  if (groupBy === 'week') return `date(${local},'-' || ((strftime('%w',${local})+6)%7) || ' days')`;
  return `date(${local})`;
}
