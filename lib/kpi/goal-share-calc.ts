// Phần tính thuần của chia mục tiêu theo POS (dùng được cả ở trình duyệt). Đọc số ở lib/kpi/goal-share.ts.
export type ShareAmount = { sel: number; all: number };
export type GoalShare = { month: string; prevMonth: string; company: ShareAmount; byUser: Record<string, ShareAmount>;
  /** KPI từng người × POS của tháng (app_settings target_emp_pos:<tháng>), đã tính sẵn ở các POS đang chọn / mọi POS. */ empPos?: Record<string, ShareAmount> };

export const prevMonthOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

/** Tỉ lệ (0–1) của một nhóm người; nhóm chưa có doanh thu tháng trước thì theo cả công ty. */
export function shareOf(g: GoalShare, ids: string[]): number {
  // Có KPI đặt riêng theo POS (anh Vũ 12/11/2026): dùng đúng KPI ở POS đang chọn.
  const k = ids.reduce((a, id) => { const x = g.empPos?.[id]; if (x) { a.sel += x.sel; a.all += x.all; } return a; }, { sel: 0, all: 0 });
  if (k.all > 0) return k.sel / k.all;
  const t = ids.reduce((a, id) => { const x = g.byUser[id]; if (x) { a.sel += x.sel; a.all += x.all; } return a; }, { sel: 0, all: 0 });
  if (t.all > 0) return t.sel / t.all;
  return g.company.all > 0 ? g.company.sel / g.company.all : 1;
}
