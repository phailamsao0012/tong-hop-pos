export type Parts = { assigned: number; closed: number; net: number };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Bỏ ngày không có doanh thu và ngày dưới 30% trung vị. */
export function retainedDays(days: number[][]) {
  const totals = days.map(sum).sort((a, b) => a - b);
  const n = totals.length;
  const median = n ? (totals[Math.floor((n - 1) / 2)] + totals[Math.floor(n / 2)]) / 2 : 0;
  return days.filter((d) => sum(d) > 0 && sum(d) >= median * 0.3);
}
export function baselineOf(days: number[][]): number | null {
  const kept = retainedDays(days);
  return kept.length ? sum(kept.map(sum)) / kept.length : null;
}
export function hourShares(days: number[][]) {
  const kept = retainedDays(days);
  const cum = Array.from({ length: 25 }, (_, h) => kept.length
    ? sum(kept.map((d) => sum(d.slice(0, h)) / sum(d))) / kept.length : h / 24);
  cum[0] = 0; cum[24] = 1;
  return cum;
}
export function shareAt(cum: number[], minuteOfDay: number) {
  const minute = Math.max(0, Math.min(1440, minuteOfDay)), h = Math.floor(minute / 60);
  return h === 24 ? cum[24] : cum[h] + (cum[h + 1] - cum[h]) * (minute % 60) / 60;
}
export function forecastToday({ actual, share, baseline }: { actual: number; share: number; baseline: number | null }) {
  if (actual === 0 && baseline === null) return null;
  const predicted = share >= 0.25 ? actual / share : share > 0
    ? actual / 0.25 + (1 - share / 0.25) * (baseline ?? actual) : Math.max(actual, baseline ?? 0);
  return Math.max(actual, predicted);
}
export function forecastWeek({ actualToYesterday, todayForecast, restBaselines }: { actualToYesterday: number; todayForecast: number | null; restBaselines: (number | null)[] }) {
  // Thiếu một ngày thì không biến phần chưa biết thành 0.
  return todayForecast === null || restBaselines.some((n) => n === null) ? null
    : actualToYesterday + todayForecast + sum(restBaselines as number[]);
}
export function decompose(expected: Parts, actual: Parts) {
  const a0 = expected.assigned || 1, a1 = actual.assigned || 1;
  const c0 = expected.closed / a0, c1 = actual.closed / a1;
  const v0 = expected.closed ? expected.net / expected.closed : actual.closed ? actual.net / actual.closed : 0;
  const v1 = actual.closed ? actual.net / actual.closed : v0;
  const soChia = Math.round((a1 - a0) * c0 * v0);
  const tiLeChot = Math.round(a1 * (c1 - c0) * v0);
  const giaTriDon = Math.round(a1 * c1 * (v1 - v0));
  const tong = actual.net - expected.net;
  return { soChia, tiLeChot, giaTriDon, khac: tong - (soChia + tiLeChot + giaTriDon), tong };
}
export function personExpected(rows28: Parts[], companyWeekdayFactor: number): Parts | null {
  const worked = rows28.filter((r) => r.assigned > 0 || r.closed > 0);
  if (worked.length < 3) return null;
  const mean = (key: keyof Parts) => sum(worked.map((r) => r[key])) / worked.length * companyWeekdayFactor;
  return { assigned: mean('assigned'), closed: mean('closed'), net: mean('net') };
}
