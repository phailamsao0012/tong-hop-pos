// Báo cáo tổng quan cho sếp qua Zalo (anh Vũ 14/11/2026, mẫu đã chốt: https://claude.ai/artifact/TyXGkhnrCa3f3NpneSPsMs).
// 2 ảnh: ảnh 1 tổng quan (3 số lớn Sale / CSKH / MKT kèm số đưa về, KPI ngày + tháng từng bộ phận, từng team Sale / CSKH,
// khối Marketing, bảng POS); ảnh 2 chi tiết & cảnh báo. Luôn giao diện sáng. Gửi 8h / 12h / 17h / 22h cho người nhận loại 'boss'.
// Phần này thuần (không đụng cloudflare:workers) để test được; số lấy ở lib/zalo/boss-data.ts.
import { daysInMonthOf, kpiDay, type KpiDay } from '@/lib/kpi/kpi-day';

export const BOSS_CLOSE_RED = 40; // tỉ lệ chốt dưới 40% tô đỏ (mọi trang)
export const BOSS_RETURN_RED = 7; // hoàn từ 7%
export const BOSS_CANCEL_RED = 5; // hủy từ 5%
export const COACH_MIN_BASE = 20; // "cần kèm": chốt thấp nhất trong người có từ 20 số
export const OUTSIDE_TEAM = 'Ngoài team';

export type Money = { today: number; month: number; yesterday: number };
/** Dòng team Sale / CSKH. kpi: KPI tháng của team (cộng KPI người); null = chưa đặt. */
export type TeamRow = { name: string; net: number; orders: number; base: number; closed: number; monthNet: number; goal: number | null };
export type PersonRow = { name: string; team: string; net: number; orders: number; base: number; closed: number };
export type MktTeamRow = { name: string; cost: number; newNet: number; leads: number; closed: number; leadsGoal: number | null; monthLeads: number;
  /** Cùng khoảng giờ hôm qua (báo cáo trọn ngày: trọn ngày trước). */ prevNewNet?: number; prevLeads?: number };
/** Sale theo POS (mẫu rút gọn 17/11/2026): doanh thu, đơn, tỉ lệ chốt hôm nay và cùng khoảng giờ hôm qua. Cộng các dòng = ô SALE. */
export type SalePosRow = { name: string; net: number; prevNet: number; orders: number; base: number; closed: number; prevBase: number; prevClosed: number };
/** CSKH theo POS: doanh thu, đơn, doanh thu cùng khoảng giờ hôm qua. Cộng các dòng = ô CSKH. */
export type CskhPosRow = { name: string; net: number; prevNet: number; orders: number };
export type MktPersonRow = { name: string; team: string; cost: number; newNet: number; leads: number; /** Đơn New chốt (trang Marketing). */ closed?: number };
export type PosRow = { name: string; net: number; orders: number; yesterday: number };
export type DeptKpi = { goal: number | null; monthNet: number; todayNet: number };

export type BossData = {
  /** Ngày của số (VN). Báo cáo sáng: hôm qua (trọn ngày). */ day: string;
  /** "17h" … hoặc null = trọn ngày (báo cáo sáng). */ until: string | null;
  /** Nhãn gửi: "17h thứ Bảy 14/11" / "sáng thứ Bảy 14/11". */ title: string;
  /** Khoảng số: "số từ 0h tới 17h" / "số trọn ngày 13/11". */ range: string;
  company: { net: number; orders: number; yesterday: number };
  sale: { kpi: DeptKpi; base: number; closed: number; prevBase: number; prevClosed: number; packed: number; returned: number; cancelled: number; teams: TeamRow[]; people: PersonRow[]; prevNet?: number; byPos?: SalePosRow[] };
  cskh: { kpi: DeptKpi; orders: number; prevOrders: number; base: number; closed: number; prevBase: number; prevClosed: number; teams: TeamRow[]; people: PersonRow[]; prevNet?: number; byPos?: CskhPosRow[] };
  mkt: { kpi: DeptKpi; leads: number; monthLeads: number; leadsGoal: number | null; cost: number; prevNewNet?: number; prevLeads?: number; /** Lúc chi phí QC của ngày được nhập lần cuối (ISO), null = chưa có. */ costAt?: string | null; teams: MktTeamRow[]; people: MktPersonRow[] };
  pos: PosRow[];
  ship: { packed: number; closed: number; vtp: number; spx: number; others?: { name: string; orders: number }[] };
  overdueTasks: number;
};

export const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
export const rateText = (v: number | null, digits = 1) => (v == null ? '–' : `${v.toFixed(digits).replace('.', ',')}%`);
const nf = new Intl.NumberFormat('vi-VN');
export const num = (n: number) => nf.format(Math.round(n));
/** 412 tr · 1,24 tỷ · 650k (gọn, đúng kiểu web). */
export function money(n: number) {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2).replace('.', ',').replace(/,?0+$/, '')} tỷ`;
  if (a >= 1e6) return `${s}${Math.round(a / 1e6)} tr`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}k`;
  return `${s}${Math.round(a)}`;
}
/** Thiếu / dư có dấu: "+18 tr", "−58 tr", số: "+420", "−116". */
export const signed = (n: number, fmt: (n: number) => string = money) => (n >= 0 ? `+${fmt(n)}` : `−${fmt(Math.abs(n))}`);

/** KPI ghi bằng tiền, không ghi % (anh Vũ 15/11/2026: "kpi ghi theo số còn dư hoặc thiếu trong ngày, ví dụ ngày 10tr, từ 0h đến 8h đc 1tr thì ghi
 *  thiếu 9tr, còn nếu hôm qua hoặc các ngày trước đang nợ hoặc dư thì ghi thêm 1 số bên cạnh là - hoặc + bao tiền").
 *  today = đạt trong ngày − KPI ngày (âm = thiếu). month = "từ đầu tháng" (anh Vũ 15/11: "đầu tháng đến giờ") = đạt từ ngày 1 tới giờ − KPI ngày × số ngày
 *  tính cả ngày của số (âm = đang nợ). before = phần của các ngày trước (month − today).
 *  day: ngày của số; monthNet: đạt từ đầu tháng gồm cả ngày đó; dayNet: đạt trong ngày đó. */
export type KpiGap = { daily: number; today: number; before: number; month: number };
export function kpiGap(goal: number | null | undefined, day: string, monthNet: number, dayNet: number): KpiGap | null {
  if (!goal || !(goal > 0)) return null;
  const daily = goal / daysInMonthOf(day.slice(0, 7)), n = Number(day.slice(8, 10)) - 1;
  return { daily, today: dayNet - daily, before: monthNet - dayNet - daily * n, month: monthNet - daily * (n + 1) };
}
/** "−9 tr" (thiếu) / "+2 tr" (dư) / "0" — anh Vũ 15/11/2026: "đừng thiếu với dư, cho + với − cho đồng bộ". */
export const gapWord = (v: number, fmt: (n: number) => string = money) => (fmt(Math.abs(v)) === '0' ? '0' : signed(v, fmt));

/** KPI ngày cho báo cáo: goal tháng, đã đạt từ đầu tháng (gồm hôm nay), đạt hôm nay. day: ngày của số. */
export function deptKpi(k: DeptKpi, day: string | BossData): KpiDay | null {
  return bossPace(k.goal, day, k.monthNet, k.todayNet);
}

/** Tiến độ KPI tháng cho báo cáo sếp. Báo cáo ca (12h/17h/22h, until có giờ): như web — phải đạt tới hết hôm qua, đã đạt gồm hôm nay.
 *  Báo cáo 8h (until = null, số trọn ngày hôm qua): phải đạt = KPI ngày × số ngày TÍNH TỚI HẾT HÔM QUA (sửa lỗi lệch 1 ngày, Đầu não 14/11). */
export function bossPace(goal: number | null | undefined, d: string | Pick<BossData, 'day' | 'until'>, achieved: number, achievedToday: number): KpiDay | null {
  if (!goal) return null;
  const day = typeof d === 'string' ? d : d.day, fullDay = typeof d !== 'string' && d.until == null;
  const k = kpiDay({ goal, today: day, achieved, achievedToday });
  if (!k || !fullDay) return k;
  const must = k.daily * k.dayOfMonth, diff = achieved - must;
  return { ...k, mustByYesterday: must, diff, needToday: Math.max(0, k.daily - diff) };
}

/** Tỉ lệ chốt = đơn lên trong kỳ đã chốt ÷ đơn lên trong kỳ (cách tính mặc định của web). */
export const closeRate = (r: { base: number; closed: number }) => pct(Math.min(r.base, r.closed), r.base);

/** Người không thuộc team nào của bộ phận gom vào 1 hàng "Ngoài team" (anh Vũ 14/11/2026). Hàng rỗng thì bỏ. */
export function withOutside<T extends { name: string }>(teams: T[], outside: T | null): T[] {
  return outside ? [...teams, { ...outside, name: OUTSIDE_TEAM }] : teams;
}

/** "Cần kèm" MKT (Đầu não kiểm 17–18/11/2026, thay ROAS): marketer chốt thấp nhất, từ 20 số new trở lên, dưới ngưỡng đỏ. TL chốt = đơn New chốt ÷ số new. */
export function coachMkt(people: MktPersonRow[]) {
  return people.filter((p) => p.leads >= COACH_MIN_BASE).map((p) => ({ ...p, rate: closeRate({ base: p.leads, closed: p.closed ?? 0 }) ?? 0 }))
    .filter((p) => p.rate < BOSS_CLOSE_RED).sort((a, b) => a.rate - b.rate);
}
/** "Cần kèm": người chốt thấp nhất, có từ 20 số trở lên, chỉ khi dưới ngưỡng đỏ. */
export function coach(people: PersonRow[]) {
  return people.filter((p) => p.base >= COACH_MIN_BASE).map((p) => ({ ...p, rate: closeRate(p) ?? 0 }))
    .filter((p) => p.rate < BOSS_CLOSE_RED).sort((a, b) => a.rate - b.rate);
}

/** Dòng "Cần chú ý" ở ảnh 2 (tối đa 8), theo thứ tự nặng trước. Mẫu rút gọn 17/11/2026: cảnh báo tỉ lệ chốt theo POS (không theo team),
 *  bỏ dòng thiếu KPI tháng / KPI số vì tin gửi sếp không còn KPI. */
export function warnings(d: BossData): string[] {
  const out: string[] = [];
  for (const p of d.sale.byPos ?? []) {
    const r = closeRate(p);
    if (r != null && p.base >= COACH_MIN_BASE && r < BOSS_CLOSE_RED) out.push(`Sale ${p.name}: tỉ lệ chốt ${rateText(r)} (dưới ${BOSS_CLOSE_RED}%)`);
  }
  for (const p of coach(d.sale.people).slice(0, 3)) out.push(`Sale ${p.name} (${p.team}): chốt ${rateText(p.rate, 0)} trên ${num(p.base)} số`);
  const ret = pct(d.sale.returned, d.sale.packed), can = pct(d.sale.cancelled, d.sale.packed);
  if (ret != null && ret >= BOSS_RETURN_RED) out.push(`Sale: tỉ lệ hoàn ${rateText(ret)} trên đơn đi (từ ${BOSS_RETURN_RED}% là đỏ)`);
  if (can != null && can >= BOSS_CANCEL_RED) out.push(`Sale: tỉ lệ hủy ${rateText(can)} trên đơn đi (từ ${BOSS_CANCEL_RED}% là đỏ)`);
  for (const t of d.mkt.teams) if (t.cost > 0 && t.newNet === 0) out.push(`${t.name}: chi ${money(t.cost)} mà chưa ra doanh thu New`);
  for (const p of d.pos) {
    const ch = pct(p.net - p.yesterday, p.yesterday);
    if (ch != null && ch <= -20 && p.yesterday >= 5e6) out.push(`${p.name}: doanh thu giảm ${Math.round(-ch)}% so ${d.until ? 'cùng giờ hôm qua' : `ngày ${prevDay(d.day)}`}`);
  }
  if (d.overdueTasks) out.push(`${num(d.overdueTasks)} việc quá hạn (Giao việc)`);
  return out.slice(0, 8);
}

/** "So hôm qua" (mẫu rút gọn 17/11/2026): hôm nay trừ cùng khoảng giờ hôm qua; hôm qua bằng 0 thì null (ghi "–"). */
export const vsPrev = (now: number, prev: number | null | undefined) => (prev ? now - prev : null);
/** Tỉ lệ chốt hôm nay trừ cùng giờ hôm qua, đơn vị điểm %: "− 2,1%". Thiếu một bên thì null. */
export const rateVsPrev = (r: { base: number; closed: number; prevBase: number; prevClosed: number }) => {
  const a = closeRate(r), b = closeRate({ base: r.prevBase, closed: r.prevClosed });
  return a == null || b == null ? null : a - b;
};
/** "+18 tr" / "−6 tr" / "–" (hôm qua 0) / "0". */
export const vsText = (v: number | null, fmt: (n: number) => string = money) => (v == null ? '–' : gapWord(v, fmt));
export const rateVsText = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}%`);
/** Chữ "so hôm qua" / "so 15/11" (báo cáo trọn ngày so trọn ngày trước). */
export const prevWordOf = (d: Pick<BossData, 'day' | 'until'>) => (d.until ? 'hôm qua' : prevDay(d.day));

/** Tin chữ kèm ảnh (cũng là bản gửi khi Zalo không tải được ảnh). Mẫu rút gọn 17/11/2026: không còn KPI, so cùng khoảng giờ hôm qua. */
export function bossText(d: BossData) {
  const w = `so ${prevWordOf(d)}`;
  const saleRate = closeRate(d.sale);
  return [
    `📊 MEGATECH · Báo cáo tổng quan ${d.title}`,
    d.range,
    `Sale: ${money(d.sale.kpi.todayNet)} (${vsText(vsPrev(d.sale.kpi.todayNet, d.sale.prevNet))} ${w}) · TL chốt ${rateText(saleRate)} (${rateVsText(rateVsPrev(d.sale))})`,
    `CSKH: ${money(d.cskh.kpi.todayNet)} (${vsText(vsPrev(d.cskh.kpi.todayNet, d.cskh.prevNet))} ${w})`,
    `MKT (DT New): ${money(d.mkt.kpi.todayNet)} (${vsText(vsPrev(d.mkt.kpi.todayNet, d.mkt.prevNewNet))} ${w}) · Số new ${num(d.mkt.leads)} (${vsText(vsPrev(d.mkt.leads, d.mkt.prevLeads), num)})`,
    ...warnings(d).slice(0, 4).map((x) => `⚠️ ${x}`),
  ].join('\n').slice(0, 2000);
}

/** Ảnh báo cáo sếp. Kiểu cũ (14/11/2026): part 1 tổng quan, part 2 chi tiết & cảnh báo.
 *  Kiểu 5 ảnh (anh Vũ 27/11/2026: "gửi 4 ảnh, 1 ảnh sale, 1 ảnh cskh, 1 ảnh mkt, 1 ảnh tổng quan, nếu được thêm vận đơn nữa"): có page. */
export type BossPage = 'tong' | 'sale' | 'cskh' | 'mkt' | 'vandon';
export type BossImage = { kind: 'bossReport'; part: 1 | 2; page?: BossPage; data: BossData };
export const BOSS_PAGES: { page: BossPage; label: string }[] = [
  { page: 'tong', label: 'Tổng quan' }, { page: 'sale', label: 'Sale' }, { page: 'cskh', label: 'CSKH' }, { page: 'mkt', label: 'Marketing' }, { page: 'vandon', label: 'Vận đơn' },
];
export const isBossPage = (v: unknown): v is BossPage => BOSS_PAGES.some((p) => p.page === v);
/** Bật gửi 5 ảnh cho mọi người nhận báo cáo sếp: app_settings key này = '1'. Chưa bật: lịch vẫn gửi 2 ảnh kiểu cũ;
 *  lệnh gửi ngay có "five": true thì gửi thử 5 ảnh (Đầu não 27/11/2026: gửi thử cho anh Vũ trước, chưa bật cho sếp). */
export const BOSS_FIVE_KEY = 'zalo_boss_5_anh_v1';
/** Danh sách ảnh một lượt báo cáo sếp, theo thứ tự gửi: ảnh, chữ kèm, nhãn (hàng chờ gửi lại). */
export function bossImages(data: BossData, five: boolean): { img: BossImage; text: string; label: string }[] {
  if (!five) return [
    { img: { kind: 'bossReport', part: 1, data }, text: bossText(data), label: `tổng quan ${data.title}` },
    { img: { kind: 'bossReport', part: 2, data }, text: `Chi tiết & cảnh báo · ${data.title}`, label: `chi tiết ${data.title}` },
  ];
  return BOSS_PAGES.map(({ page, label }, i) => ({
    img: { kind: 'bossReport', part: 1, page, data },
    text: (i === 0 ? bossText(data) : `${i + 1}/${BOSS_PAGES.length} · ${label} · ${data.title}`).slice(0, 2000),
    label: `${label.toLowerCase()} ${data.title}`,
  }));
}

/** "12/11" của ngày trước ngày d (dùng ở ảnh 8h thay chữ "hôm qua"). */
export function prevDay(day: string) {
  const t = new Date(`${day}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - 1);
  const x = t.toISOString();
  return `${x.slice(8, 10)}/${x.slice(5, 7)}`;
}
