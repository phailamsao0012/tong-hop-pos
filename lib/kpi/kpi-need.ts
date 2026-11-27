// Cột "Cần/ngày" bảng KPI theo đầu người (anh Vũ 27/11/2026 8h38: "còn thiếu bao nhiêu doanh thu / số ngày còn lại của tháng,
// ví dụ tháng này họ đạt 80tr, kpi 200tr, còn thiếu 120tr, chia cho số ngày còn lại của tháng 11 là 4 ngày, ra 30tr 1 ngày").
// Số ngày còn lại TÍNH CẢ HÔM NAY theo giờ Việt Nam (27/11 → 27, 28, 29, 30 = 4 ngày). Hàm thuần để test.

export type KpiNeed =
  | { state: 'none' }                                   // chưa đặt KPI
  | { state: 'past' }                                   // tháng đã qua: hết ngày
  | { state: 'reached'; goal: number; done: number }    // đã đủ hoặc vượt
  | { state: 'need'; goal: number; done: number; remaining: number; daysLeft: number; from: string; to: string; perDay: number };

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** Ngày còn lại của `month` (YYYY-MM) tính từ `today` (YYYY-MM-DD, giờ VN), gồm cả hôm nay. Tháng tương lai: cả tháng; tháng đã qua: 0. */
export function daysLeftInMonth(month: string, today: string) {
  const dim = daysIn(month), cur = today.slice(0, 7);
  if (month < cur) return { daysLeft: 0, from: '', to: '' };
  const first = month > cur ? 1 : Number(today.slice(8, 10));
  return { daysLeft: dim - first + 1, from: `${month}-${pad(first)}`, to: `${month}-${pad(dim)}` };
}

/** Còn thiếu ÷ số ngày còn lại. goal: KPI doanh thu tháng (0 / null = chưa đặt); done: đã đạt trong tháng. */
export function kpiNeedPerDay(goal: number | null | undefined, done: number, month: string, today: string): KpiNeed {
  if (!goal || goal <= 0) return { state: 'none' };
  if (done >= goal) return { state: 'reached', goal, done };
  const { daysLeft, from, to } = daysLeftInMonth(month, today);
  if (daysLeft <= 0) return { state: 'past' };
  const remaining = goal - done;
  return { state: 'need', goal, done, remaining, daysLeft, from, to, perDay: remaining / daysLeft };
}

/** Dòng Tổng: tổng phần còn thiếu của những người chưa đạt ÷ số ngày còn lại. */
export function kpiNeedTotal(rows: { goal: number | null | undefined; done: number }[], month: string, today: string) {
  const { daysLeft, from, to } = daysLeftInMonth(month, today);
  const remaining = rows.reduce((s, r) => s + (r.goal && r.goal > 0 && r.done < r.goal ? r.goal - r.done : 0), 0);
  const people = rows.filter((r) => r.goal && r.goal > 0 && r.done < r.goal).length;
  return { daysLeft, from, to, remaining, people, perDay: daysLeft > 0 ? remaining / daysLeft : null };
}
