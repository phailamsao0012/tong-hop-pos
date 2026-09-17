// Pancake trả thời gian UTC không hậu tố ("2026-09-13T01:35:44"). Báo cáo theo
// ngày Việt Nam (UTC+7): ngày D bắt đầu lúc (D-1)T17:00:00 UTC.

export const VN_OFFSET_HOURS = 7;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/** Kỳ so sánh: kỳ liền trước (cùng số ngày) hoặc cùng kỳ năm trước. */
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
  return { start: addDays(start, -length), end: addDays(start, -1) };
}

export function todayVn() {
  const now = new Date(Date.now() + VN_OFFSET_HOURS * 3600000);
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
