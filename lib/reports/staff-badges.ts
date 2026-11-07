// Bộ huy hiệu thành tích theo phòng (anh Vũ 07/11/2026: "bộ nhận diện các thành tích của nhân sự theo từng phòng ban ... nhân viên
// đạt 1000 đơn sớm nhất, đạt doanh thu 1 tỷ sớm nhất ... huy hiệu huy chương để mọi người có động lực").
// Năm loại: Mốc (Đồng, Bạc, Vàng, Kim cương), Kỷ lục nhanh nhất phòng, Quán quân tháng / Top 3 tháng, Bền bỉ, Ngày bùng nổ.
// Tính theo tháng từ bảng tính sẵn (stats_daily, stats_daily_mkt), cả công ty một lần mỗi ngày, lưu ở app_settings.
// Phần tính thuần (computeBadges) tách riêng để test.
import { POS } from '@/lib/shared/report-model';
import { teamSubquery } from '@/lib/teams/team';
import { staffTenure } from '@/lib/teams/tenure';
import { RATE_THRESHOLDS } from '@/lib/reports/metrics';
import { cskhUpsell } from '@/lib/reports/cskh-upsell';
import { vnRangeUtc } from '@/lib/shared/report-time';

export type BadgeDept = 'sale' | 'cskh' | 'mkt';
export type BadgeTier = 'dong' | 'bac' | 'vang' | 'kim-cuong' | 'ky-luc' | 'quan-quan' | 'top' | 'ben-bi' | 'bung-no' | 'vua' | 'don-to' | 'tan-binh' | 'but-pha' | 'chuoi';
export type Badge = { key: string; tier: BadgeTier; label: string; note: string; month?: string };
export type BadgePerson = { id: string; dept: BadgeDept; joined: string | null; months: { month: string; orders: number; net: number; base: number; closedOfBase: number }[] };
/** Số thêm theo phòng cho các giải (anh Vũ 07/11/2026 "nghiên cứu mở rộng ra cho có nhiều giải"). */
export type DeptExtras = {
  bestDay?: { id: string; day: string; net: number };
  bestWeek?: { id: string; week: string; net: number };
  bigOrder?: { id: string; net: number; day: string };
  streak?: { id: string; days: number; end: string };
  /** Sale: đơn chốt từ số MKT theo tháng × người. */ mktOrders?: { month: string; id: string; orders: number }[];
  /** CSKH: tỷ lệ tự upsell tháng vừa xong. */ upsell?: { month: string; id: string; rate: number; handed: number }[];
};
export type BadgeBook = { day: string; people: Record<string, Badge[]> };

export const TIERS = ['dong', 'bac', 'vang', 'kim-cuong'] as const;
export const TIER_LABEL: Record<BadgeTier, string> = {
  dong: 'Đồng', bac: 'Bạc', vang: 'Vàng', 'kim-cuong': 'Kim cương', 'ky-luc': 'Kỷ lục', 'quan-quan': 'Quán quân', top: 'Top 3', 'ben-bi': 'Bền bỉ', 'bung-no': 'Bùng nổ',
  vua: 'Danh hiệu', 'don-to': 'Đơn to nhất', 'tan-binh': 'Tân binh', 'but-pha': 'Bứt phá', chuoi: 'Không nghỉ tay',
};
/** Mốc số đơn và doanh số cộng dồn của từng phòng. MKT tính đơn xác nhận mang về và doanh số mang về. */
export const MILESTONES: Record<BadgeDept, { orders: number[]; net: number[]; ordersLabel: string; netLabel: string }> = {
  sale: { orders: [100, 500, 1000, 5000], net: [1e8, 5e8, 1e9, 5e9], ordersLabel: 'đơn chốt', netLabel: 'doanh số' },
  cskh: { orders: [100, 500, 1000, 5000], net: [1e8, 5e8, 1e9, 5e9], ordersLabel: 'đơn chốt', netLabel: 'doanh số' },
  mkt: { orders: [300, 1000, 3000, 10000], net: [5e8, 1e9, 5e9, 1e10], ordersLabel: 'đơn mang về', netLabel: 'doanh số mang về' },
};
const RATE_MIN = 30, STREAK = 3;

export const moneyLabel = (n: number) => (n >= 1e9 ? `${String(n / 1e9).replace('.', ',')} tỷ` : `${n / 1e6} triệu`);
const countLabel = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
const mLabel = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;
const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/** Tháng đầu tiên tổng cộng dồn chạm mốc. */
function reachMonth(months: BadgePerson['months'], pick: (m: BadgePerson['months'][number]) => number, goal: number) {
  let sum = 0;
  for (const m of months) { sum += pick(m); if (sum >= goal) return m.month; }
  return null;
}

/** Huy hiệu của mọi người. thisMonth: tháng đang chạy (không tính vào Quán quân / Top / Bền bỉ vì chưa xong). */
export function computeBadges(people: BadgePerson[], thisMonth: string, extras: Partial<Record<BadgeDept, DeptExtras>> = {}): Record<string, Badge[]> {
  const out: Record<string, Badge[]> = {};
  const add = (id: string, b: Badge) => (out[id] ??= []).push(b);
  const sorted = people.map((p) => ({ ...p, months: [...p.months].sort((a, b) => a.month.localeCompare(b.month)) }));

  for (const dept of ['sale', 'cskh', 'mkt'] as const) {
    const list = sorted.filter((p) => p.dept === dept), ms = MILESTONES[dept];
    // 1. Mốc: chỉ giữ hạng cao nhất đã đạt của mỗi loại.
    // 2. Kỷ lục nhanh nhất: mỗi mốc, người chạm sau ít tháng làm nhất (cùng số tháng thì người chạm trước).
    for (const [kind, goals, pick, fmt, what] of [
      ['orders', ms.orders, (m: BadgePerson['months'][number]) => m.orders, countLabel, ms.ordersLabel],
      ['net', ms.net, (m: BadgePerson['months'][number]) => m.net, moneyLabel, ms.netLabel],
    ] as const) {
      for (const p of list) {
        let top = -1, at: string | null = null;
        goals.forEach((g, i) => { const r = reachMonth(p.months, pick, g); if (r) { top = i; at = r; } });
        if (top >= 0) add(p.id, { key: `${kind}-${top}`, tier: TIERS[top], label: `${fmt(goals[top])} ${what}`, note: `Chạm mốc tháng ${mLabel(at!)}`, month: at! });
      }
      goals.forEach((g, i) => {
        const reached = list.flatMap((p) => {
          const r = reachMonth(p.months, pick, g);
          const start = p.joined?.slice(0, 7) ?? p.months.find((m) => m.orders > 0 || m.net > 0)?.month;
          return r && start ? [{ id: p.id, r, after: Math.max(0, monthIndex(r) - monthIndex(start)) }] : [];
        }).sort((a, b) => a.after - b.after || a.r.localeCompare(b.r));
        const best = reached[0];
        if (best && i >= 1) add(best.id, { key: `fast-${kind}-${i}`, tier: 'ky-luc', label: `${fmt(g)} ${what} nhanh nhất phòng`, note: best.after ? `Sau ${best.after} tháng làm việc` : 'Ngay trong tháng đầu làm việc', month: best.r });
      });
    }
    // 3. Quán quân / Top 3 tháng theo doanh số, chỉ tháng đã xong.
    const months = [...new Set(list.flatMap((p) => p.months.map((m) => m.month)))].filter((m) => m < thisMonth);
    const wins = new Map<string, string[]>(), tops = new Map<string, string[]>();
    for (const month of months) {
      const ranked = list.map((p) => ({ id: p.id, net: p.months.find((m) => m.month === month)?.net ?? 0 })).filter((r) => r.net > 0).sort((a, b) => b.net - a.net);
      ranked.slice(0, 3).forEach((r, i) => { (i === 0 ? wins : tops).set(r.id, [...((i === 0 ? wins : tops).get(r.id) ?? []), month]); });
    }
    for (const [id, ms2] of wins) add(id, { key: 'champion', tier: 'quan-quan', label: `Quán quân tháng ×${ms2.length}`, note: `Hạng 1 phòng: ${ms2.slice(-4).map(mLabel).join(', ')}`, month: ms2.at(-1) });
    for (const [id, ms2] of tops) add(id, { key: 'top3', tier: 'top', label: `Top 3 tháng ×${ms2.length}`, note: `Hạng 2–3 phòng: ${ms2.slice(-4).map(mLabel).join(', ')}`, month: ms2.at(-1) });
    // 4. Bền bỉ: Sale có tỷ lệ chốt từ 42% liền 3 tháng; CSKH, MKT có doanh số tăng liền 3 tháng.
    for (const p of list) {
      const done = p.months.filter((m) => m.month < thisMonth);
      let run = 0, bestRun = 0, end: string | null = null;
      done.forEach((m, i) => {
        const ok = dept === 'sale'
          ? m.base >= RATE_MIN && m.closedOfBase / m.base * 100 >= RATE_THRESHOLDS.good
          : i > 0 && m.net > done[i - 1].net && monthIndex(m.month) === monthIndex(done[i - 1].month) + 1;
        run = ok ? run + 1 : 0;
        if (run > bestRun) { bestRun = run; end = m.month; }
      });
      const need = dept === 'sale' ? STREAK : STREAK - 1;
      if (bestRun >= need) add(p.id, { key: 'streak', tier: 'ben-bi', label: dept === 'sale' ? `Tỷ lệ chốt từ ${RATE_THRESHOLDS.good}% liền ${bestRun} tháng` : `Doanh số tăng liền ${bestRun + 1} tháng`, note: `Tới tháng ${mLabel(end!)}`, month: end! });
    }
    const ex = extras[dept] ?? {}, inDept = (id: string) => list.some((p) => p.id === id);
    const dmyOf = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
    const mm = (n: number) => moneyLabel(Math.max(1e6, Math.round(n / 1e6) * 1e6));
    // 5. Kỷ lục ngày, tuần, tháng của cả phòng.
    const bd = ex.bestDay;
    if (bd && inDept(bd.id)) add(bd.id, { key: 'best-day', tier: 'bung-no', label: 'Kỷ lục doanh số ngày của phòng', note: `${dmyOf(bd.day)}: ${mm(bd.net)}`, month: bd.day.slice(0, 7) });
    const bw = ex.bestWeek;
    if (bw && inDept(bw.id)) add(bw.id, { key: 'best-week', tier: 'bung-no', label: 'Kỷ lục doanh số tuần của phòng', note: `Tuần ${bw.week.slice(5)}/${bw.week.slice(0, 4)}: ${mm(bw.net)}` });
    const bm = list.flatMap((p) => p.months.map((m) => ({ id: p.id, ...m }))).sort((a, b) => b.net - a.net)[0];
    if (bm && bm.net > 0) add(bm.id, { key: 'best-month', tier: 'ky-luc', label: 'Kỷ lục doanh số tháng của phòng', note: `Tháng ${mLabel(bm.month)}: ${mm(bm.net)}`, month: bm.month });
    // 6. Đơn to nhất phòng.
    const bo = ex.bigOrder;
    if (bo && inDept(bo.id)) add(bo.id, { key: 'big-order', tier: 'don-to', label: 'Đơn to nhất phòng', note: `${dmyOf(bo.day)}: ${new Intl.NumberFormat('vi-VN').format(Math.round(bo.net))} ₫`, month: bo.day.slice(0, 7) });
    // 7. Không nghỉ tay: chuỗi ngày liền có đơn dài nhất phòng (từ 7 ngày).
    const st = ex.streak;
    if (st && inDept(st.id) && st.days >= 7) add(st.id, { key: 'streak-days', tier: 'chuoi', label: `${st.days} ngày liền có đơn`, note: `Chuỗi dài nhất phòng, tới ${dmyOf(st.end)}`, month: st.end.slice(0, 7) });
    // 8. Danh hiệu theo tháng đã xong (đếm số lần): Sale = Vua chốt đơn (tỷ lệ chốt cao nhất, từ 30 đơn lên) và Chiến thần số MKT;
    //    CSKH = Vua bán lại (nhiều đơn chốt nhất); MKT = Vua ra số (nhiều đơn mang về nhất).
    const monthKing = (key: string, label: string, pick: (month: string) => { id: string; v: number }[], note: (v: number) => string) => {
      const won = new Map<string, { months: string[]; last: number }>();
      for (const month of months) {
        const top = pick(month).filter((r) => r.v > 0 && inDept(r.id)).sort((a, b) => b.v - a.v)[0];
        if (top) won.set(top.id, { months: [...(won.get(top.id)?.months ?? []), month], last: top.v });
      }
      for (const [id, w] of won) add(id, { key, tier: 'vua', label: `${label} ×${w.months.length}`, note: `${w.months.slice(-4).map(mLabel).join(', ')} · gần nhất ${note(w.last)}`, month: w.months.at(-1) });
    };
    const rows = (month: string) => list.map((p) => ({ p, m: p.months.find((x) => x.month === month) })).filter((r) => !!r.m);
    if (dept === 'sale') {
      monthKing('king-rate', 'Vua chốt đơn', (month) => rows(month).filter((r) => r.m!.base >= RATE_MIN).map((r) => ({ id: r.p.id, v: r.m!.closedOfBase / r.m!.base * 100 })), (v) => `${Math.round(v)}%`);
      monthKing('king-mkt', 'Chiến thần số MKT', (month) => (ex.mktOrders ?? []).filter((r) => r.month === month).map((r) => ({ id: r.id, v: r.orders })), (v) => `${v} đơn từ số MKT`);
    }
    if (dept === 'cskh') {
      monthKing('king-resale', 'Vua bán lại', (month) => rows(month).map((r) => ({ id: r.p.id, v: r.m!.orders })), (v) => `${v} đơn`);
      const up = (ex.upsell ?? []).filter((r) => r.handed >= 10 && inDept(r.id)).sort((a, b) => b.rate - a.rate)[0];
      if (up) add(up.id, { key: 'king-upsell', tier: 'vua', label: 'Vua upsell', note: `Tháng ${mLabel(up.month)}: tự upsell ${Math.round(up.rate)}% khách MKT`, month: up.month });
    }
    if (dept === 'mkt') monthKing('king-leads', 'Vua ra số', (month) => rows(month).map((r) => ({ id: r.p.id, v: r.m!.orders })), (v) => `${v} đơn mang về`);
    // 9. Tân binh xuất sắc: doanh số tháng đầu làm việc (tháng vào làm hoặc tháng đầu có số) cao nhất phòng, trong 12 tháng gần đây.
    const rookie = list.flatMap((p) => {
      const first = p.joined?.slice(0, 7) ?? p.months.find((m) => m.net > 0)?.month;
      const m = first ? p.months.find((x) => x.month === first) : undefined;
      return m && m.month < thisMonth && monthIndex(thisMonth) - monthIndex(m.month) <= 12 ? [{ id: p.id, month: m.month, net: m.net }] : [];
    }).sort((a, b) => b.net - a.net)[0];
    if (rookie && rookie.net > 0) add(rookie.id, { key: 'rookie', tier: 'tan-binh', label: 'Tân binh xuất sắc', note: `Tháng đầu ${mLabel(rookie.month)}: ${mm(rookie.net)}`, month: rookie.month });
    // 10. Bứt phá: tăng doanh số mạnh nhất tháng vừa xong so tháng trước (tháng trước từ 30 triệu).
    const last = months.at(-1);
    if (last) {
      const prevM = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
      const grow = list.flatMap((p) => {
        const a = p.months.find((m) => m.month === prevM), b = p.months.find((m) => m.month === last);
        return a && b && a.net >= 3e7 && b.net > a.net ? [{ id: p.id, pct: (b.net - a.net) / a.net * 100 }] : [];
      }).sort((x, y) => y.pct - x.pct)[0];
      if (grow) add(grow.id, { key: 'breakout', tier: 'but-pha', label: 'Bứt phá tháng', note: `Tháng ${mLabel(last)} tăng ${Math.round(grow.pct)}% so tháng trước`, month: last });
    }
  }
  const order: BadgeTier[] = ['ky-luc', 'quan-quan', 'vua', 'don-to', 'bung-no', 'kim-cuong', 'vang', 'but-pha', 'tan-binh', 'top', 'chuoi', 'ben-bi', 'bac', 'dong'];
  for (const id of Object.keys(out)) out[id].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  return out;
}

export const BADGES_KEY = 'staff_badges_v1';
const CC = 'confirmed_orders+shipping_orders+delivered_orders+returned_orders';

/** Huy hiệu cả công ty; tính lại tối đa một lần mỗi ngày (lưu ở app_settings), các lần mở hồ sơ sau chỉ đọc một dòng. */
export async function badgeBook(db: D1Database, today: string): Promise<BadgeBook> {
  const saved = await db.prepare('SELECT value FROM app_settings WHERE key=?').bind(BADGES_KEY).first<{ value: string }>();
  try { const b = saved ? JSON.parse(saved.value) as BadgeBook : null; if (b?.day === today) return b; } catch { /* tính lại */ }
  const posIds = POS.map((p) => p.id), ph = posIds.map(() => '?').join(',');
  const deptCase = `CASE WHEN seller_id IN ${teamSubquery('sale')} THEN 'sale' WHEN seller_id IN ${teamSubquery('cskh')} THEN 'cskh' END`;
  const MKT_IDS = "(SELECT user_id FROM pos_users WHERE name LIKE '%mkt%')";
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 10)}`;
  const thisMonth = today.slice(0, 7), lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const NET = 'COALESCE(o.net_total,COALESCE(o.current_total,0)-COALESCE(o.total_discount,0))';
  // Chuỗi ngày liền có đơn: nhóm ngày liên tiếp bằng julianday(ngày) − số thứ tự (gaps and islands).
  const streakSql = (table: string, who: string, has: string, where: string) => `WITH d AS (SELECT ${who} AS id, day FROM ${table} WHERE pos_id IN (${ph}) AND ${where} GROUP BY 1,2 HAVING ${has}),
      g AS (SELECT id, day, julianday(day) - ROW_NUMBER() OVER (PARTITION BY id ORDER BY day) AS grp FROM d)
    SELECT id, COUNT(*) AS days, MAX(day) AS end FROM g GROUP BY id, grp ORDER BY days DESC, end DESC LIMIT 1`;
  const deptStat = (d: 'sale' | 'cskh') => [
    db.prepare(`SELECT seller_id AS id, day, SUM(closed_net) AS net FROM stats_daily WHERE pos_id IN (${ph}) AND seller_id IN ${teamSubquery(d)} GROUP BY 1,2 ORDER BY net DESC LIMIT 1`).bind(...posIds),
    db.prepare(`SELECT seller_id AS id, strftime('%Y-%W', day) AS week, SUM(closed_net) AS net FROM stats_daily WHERE pos_id IN (${ph}) AND seller_id IN ${teamSubquery(d)} GROUP BY 1,2 ORDER BY net DESC LIMIT 1`).bind(...posIds),
    db.prepare(`SELECT o.seller_id AS id, MAX(${NET}) AS net, substr(MAX(o.first_closed_at),1,10) AS day FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_closed_status_money
      WHERE o.pos_id IN (${ph}) AND o.first_closed_at>=? AND o.status_code NOT IN (0,6,7) AND o.seller_id IN ${teamSubquery(d)} GROUP BY 1 ORDER BY net DESC LIMIT 1`).bind(...posIds, yearAgo),
    db.prepare(streakSql('stats_daily', 'seller_id', 'SUM(closed_orders)>0', `seller_id IN ${teamSubquery(d)} AND day>='${yearAgo}'`)).bind(...posIds),
  ];
  const results = await db.batch([
    db.prepare(`SELECT substr(day,1,7) AS month, seller_id AS id, ${deptCase} AS dept, SUM(closed_orders) AS orders, SUM(closed_net) AS net, SUM(orders) AS base, SUM(${CC}) AS cob
      FROM stats_daily WHERE pos_id IN (${ph}) AND seller_id<>'' GROUP BY 1,2 HAVING dept IS NOT NULL`).bind(...posIds),
    db.prepare(`SELECT substr(day,1,7) AS month, marketer_id AS id, SUM(orders) AS orders, SUM(net) AS net FROM stats_daily_mkt
      WHERE pos_id IN (${ph}) AND marketer_id<>'' AND marketer_id IN ${MKT_IDS} GROUP BY 1,2`).bind(...posIds),
    db.prepare(`SELECT substr(day,1,7) AS month, seller_id AS id, SUM(orders) AS orders FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND seller_id IN ${teamSubquery('sale')} GROUP BY 1,2`).bind(...posIds),
    ...deptStat('sale'), ...deptStat('cskh'),
    db.prepare(`SELECT marketer_id AS id, day, SUM(net) AS net FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND marketer_id IN ${MKT_IDS} GROUP BY 1,2 ORDER BY net DESC LIMIT 1`).bind(...posIds),
    db.prepare(`SELECT marketer_id AS id, strftime('%Y-%W', day) AS week, SUM(net) AS net FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND marketer_id IN ${MKT_IDS} GROUP BY 1,2 ORDER BY net DESC LIMIT 1`).bind(...posIds),
    db.prepare(`SELECT o.marketer_id AS id, MAX(${NET}) AS net, substr(MAX(o.first_sent_at),1,10) AS day FROM raw_pos_orders o INDEXED BY idx_raw_orders_pos_sent_status_money
      WHERE o.pos_id IN (${ph}) AND o.first_sent_at IS NOT NULL AND o.first_sent_at>=? AND o.status_code NOT IN (6,7) AND o.marketer_id IN ${MKT_IDS} GROUP BY 1 ORDER BY net DESC LIMIT 1`).bind(...posIds, yearAgo),
  ]);
  const [sales, mkt, mktBySale, ...rest] = results;
  const tenure = await staffTenure(db, today).catch(() => ({} as Awaited<ReturnType<typeof staffTenure>>));
  const upsell = await cskhUpsell(db, posIds, vnRangeUtc(`${lastMonth}-01`, `${lastMonth}-01`).startUtc, vnRangeUtc(`${thisMonth}-01`, `${thisMonth}-01`).startUtc).catch(() => []);
  const people = new Map<string, BadgePerson>();
  const person = (id: string, dept: BadgeDept) => people.get(`${dept}:${id}`) ?? people.set(`${dept}:${id}`, { id, dept, joined: tenure[id]?.joined ?? null, months: [] }).get(`${dept}:${id}`)!;
  for (const r of sales.results as { month: string; id: string; dept: 'sale' | 'cskh'; orders: number; net: number; base: number; cob: number }[])
    person(String(r.id), r.dept).months.push({ month: r.month, orders: Number(r.orders), net: Number(r.net), base: Number(r.base), closedOfBase: Math.min(Number(r.base), Number(r.cob)) });
  for (const r of mkt.results as { month: string; id: string; orders: number; net: number }[])
    person(String(r.id), 'mkt').months.push({ month: r.month, orders: Number(r.orders), net: Number(r.net), base: 0, closedOfBase: 0 });
  type One = { id: string; day?: string; week?: string; net?: number; days?: number; end?: string };
  const one = (res: D1Result | undefined) => { const r = res?.results[0] as One | undefined; return r && r.id ? r : undefined; };
  const dayOf = (r?: One) => (r && Number(r.net) > 0 && r.day ? { id: String(r.id), day: r.day, net: Number(r.net) } : undefined);
  const weekOf = (r?: One) => (r && Number(r.net) > 0 && r.week ? { id: String(r.id), week: r.week, net: Number(r.net) } : undefined);
  const streakOf = (r?: One) => (r && r.days && r.end ? { id: String(r.id), days: Number(r.days), end: r.end } : undefined);
  const extras: Partial<Record<BadgeDept, DeptExtras>> = {
    sale: { bestDay: dayOf(one(rest[0])), bestWeek: weekOf(one(rest[1])), bigOrder: dayOf(one(rest[2])), streak: streakOf(one(rest[3])),
      mktOrders: (mktBySale.results as { month: string; id: string; orders: number }[]).map((r) => ({ month: r.month, id: String(r.id), orders: Number(r.orders) })) },
    cskh: { bestDay: dayOf(one(rest[4])), bestWeek: weekOf(one(rest[5])), bigOrder: dayOf(one(rest[6])), streak: streakOf(one(rest[7])),
      upsell: upsell.flatMap((r) => (r.rate === null ? [] : [{ month: lastMonth, id: r.cskhId, rate: r.rate, handed: r.handed }])) },
    mkt: { bestDay: dayOf(one(rest[8])), bestWeek: weekOf(one(rest[9])), bigOrder: dayOf(one(rest[10])) },
  };
  const book: BadgeBook = { day: today, people: computeBadges([...people.values()], thisMonth, extras) };
  await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(BADGES_KEY, JSON.stringify(book), new Date().toISOString()).run();
  return book;
}
