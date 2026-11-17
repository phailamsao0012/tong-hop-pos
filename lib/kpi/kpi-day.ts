// KPI tháng chia đều theo đúng số ngày của tháng (anh Vũ 12/11/2026):
// "tháng 30 ngày, kpi 200tr thì lấy 200 chia 30 … hôm nay tính đến hết 23h59'59s đạt được 8tr thì ngày mai sẽ báo đỏ là thiếu -2tr,
//  còn nếu được 12tr ngày mai sẽ báo là +2tr, và con số đó liên tục thay đổi khi họ có đơn chốt mới".
// Chủ nhật, lễ cũng làm: chia cho mọi ngày. Đã chốt là chốt: đơn hoàn / hủy về sau không trừ.

export type KpiDay = {
  goal: number;
  /** KPI một ngày = goal ÷ số ngày của tháng. */ daily: number;
  /** Phải đạt tới hết hôm qua = daily × số ngày trọn đã qua. */ mustByYesterday: number;
  /** Đã đạt từ ngày 1 tới lúc này (gồm cả hôm nay). */ achieved: number;
  /** Đã đạt riêng hôm nay. */ achievedToday: number;
  /** Thiếu (âm) / dư (dương) = achieved − mustByYesterday. */ diff: number;
  /** Hôm nay cần = daily − diff (không âm). */ needToday: number;
  /** % KPI tháng đã đạt. */ pctMonth: number;
  daysInMonth: number; dayOfMonth: number;
};

export const daysInMonthOf = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** today: 'YYYY-MM-DD' giờ VN, cùng tháng với KPI. */
export function kpiDay(p: { goal: number; today: string; achieved: number; achievedToday: number }): KpiDay | null {
  if (!(p.goal > 0)) return null;
  const month = p.today.slice(0, 7);
  const daysInMonth = daysInMonthOf(month);
  const dayOfMonth = Number(p.today.slice(8, 10));
  const daily = p.goal / daysInMonth;
  const mustByYesterday = daily * Math.max(0, Math.min(dayOfMonth - 1, daysInMonth));
  const diff = p.achieved - mustByYesterday;
  return { goal: p.goal, daily, mustByYesterday, achieved: p.achieved, achievedToday: p.achievedToday, diff, needToday: Math.max(0, daily - diff), pctMonth: p.achieved / p.goal * 100, daysInMonth, dayOfMonth };
}
