// KPI tháng chia theo ngày (anh Vũ 31/10/2026: "300tr → 10tr/ngày, hiện −2tr / +3tr", "cập nhật từng tiếng một").
// KPI ngày = mục tiêu tháng ÷ số ngày làm (bỏ trống = số ngày của tháng). Tiến độ đến hôm nay = KPI ngày × số ngày đã qua (không quá số ngày làm).
export type KpiPace = { daily: number; todayDiff: number; paceTarget: number; paceDiff: number };

export function kpiPace(p: { goal: number; workingDays: number | null; daysInMonth: number; daysElapsed: number; monthNet: number; todayNet: number }): KpiPace | null {
  if (!(p.goal > 0)) return null;
  const days = p.workingDays && p.workingDays > 0 ? p.workingDays : p.daysInMonth;
  const daily = p.goal / days;
  const paceTarget = daily * Math.max(0, Math.min(p.daysElapsed, days));
  return { daily, todayDiff: p.todayNet - daily, paceTarget, paceDiff: p.monthNet - paceTarget };
}

/** Triệu, một số lẻ: 527.692 → "0,5 tr", 3.000.000 → "3 tr". */
export const millions = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2).replace('.', ',')} tỷ` : `${(Math.round(n / 1e5) / 10).toLocaleString('vi-VN')} tr`;
/** "+3 tr" / "−2 tr" / "0": chênh lệch ngắn gọn, dấu trừ là dấu trừ thật. */
export function signedShort(value: number, short: (n: number) => string = millions): string {
  const r = Math.round(value);
  if (!r) return '0';
  return `${r > 0 ? '+' : '−'}${short(Math.abs(r))}`;
}

/** Ô nhập KPI tỉ lệ chốt: "35", "35%", "35,5" → 35.5; rỗng, 0 hay chữ → null (chưa đặt); trên 100 → 100 (anh Vũ 02/11/2026). */
export function parseRate(v: string): number | null {
  const n = Number(v.replace('%', '').replace(',', '.').trim());
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n * 10) / 10) : null;
}
