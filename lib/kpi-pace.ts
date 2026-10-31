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

/** "+3tr" / "−2tr" / "0": chênh lệch ngắn gọn, dấu trừ là dấu trừ thật. */
export function signedShort(value: number, short: (n: number) => string): string {
  const r = Math.round(value);
  if (!r) return '0';
  return `${r > 0 ? '+' : '−'}${short(Math.abs(r))}`;
}
