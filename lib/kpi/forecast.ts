/** dayOfMonth là số ngày đã tính thực tế; khi truyền workingDaysLeft, dùng số ngày làm việc đã qua. */
export function forecastMonth({ actual, dayOfMonth, daysInMonth, workingDaysLeft }: {
  actual: number; dayOfMonth: number; daysInMonth: number; workingDaysLeft?: number;
}): number | null {
  if (!Number.isFinite(actual) || !Number.isInteger(dayOfMonth) || !Number.isInteger(daysInMonth)
    || dayOfMonth < 1 || dayOfMonth > daysInMonth || daysInMonth < 1 || daysInMonth > 31
    || (workingDaysLeft != null && (!Number.isFinite(workingDaysLeft) || workingDaysLeft < 0))) return null;
  return actual / dayOfMonth * (workingDaysLeft == null ? daysInMonth : dayOfMonth + workingDaysLeft);
}

export const forecastTargetAllowed = (role: string) => role === 'owner';

export type MonthForecast = { revenue: number; target: number | null; targetPercent: number | null };

export function monthForecast({ actual, start, end, today, target }: {
  actual: number; start: string; end: string; today: string; target?: number | null;
}): MonthForecast | null {
  const month = today.slice(0, 7);
  // Chỉ ngoại suy kỳ từ đầu tháng tới hôm nay, tránh dùng số của kỳ thiếu ngày hoặc ngày tương lai.
  if (start !== month + '-01' || end !== today) return null;
  const revenue = forecastMonth({ actual, dayOfMonth: Number(today.slice(8, 10)),
    daysInMonth: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate() });
  if (revenue == null) return null;
  const goal = target != null && Number.isFinite(target) && target > 0 ? target : null;
  return { revenue, target: goal, targetPercent: goal == null ? null : actual / goal * 100 };
}
