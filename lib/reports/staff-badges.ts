// Bộ huy hiệu thành tích theo phòng (anh Vũ 07/11/2026: "bộ nhận diện các thành tích của nhân sự theo từng phòng ban ... nhân viên
// đạt 1000 đơn sớm nhất, đạt doanh thu 1 tỷ sớm nhất ... huy hiệu huy chương để mọi người có động lực").
// Năm loại: Mốc (Đồng, Bạc, Vàng, Kim cương), Kỷ lục nhanh nhất phòng, Quán quân tháng / Top 3 tháng, Bền bỉ, Ngày bùng nổ.
// Tính theo tháng từ bảng tính sẵn (stats_daily, stats_daily_mkt), cả công ty một lần mỗi ngày, lưu ở app_settings.
// Phần tính thuần (computeBadges) tách riêng để test.
import { POS } from '@/lib/shared/report-model';
import { teamSubquery } from '@/lib/teams/team';
import { staffTenure } from '@/lib/teams/tenure';
import { RATE_THRESHOLDS } from '@/lib/reports/metrics';

export type BadgeDept = 'sale' | 'cskh' | 'mkt';
export type BadgeTier = 'dong' | 'bac' | 'vang' | 'kim-cuong' | 'ky-luc' | 'quan-quan' | 'top' | 'ben-bi' | 'bung-no';
export type Badge = { key: string; tier: BadgeTier; label: string; note: string; month?: string };
export type BadgePerson = { id: string; dept: BadgeDept; joined: string | null; months: { month: string; orders: number; net: number; base: number; closedOfBase: number }[] };
export type BadgeBook = { day: string; people: Record<string, Badge[]> };

export const TIERS = ['dong', 'bac', 'vang', 'kim-cuong'] as const;
export const TIER_LABEL: Record<BadgeTier, string> = {
  dong: 'Đồng', bac: 'Bạc', vang: 'Vàng', 'kim-cuong': 'Kim cương', 'ky-luc': 'Kỷ lục', 'quan-quan': 'Quán quân', top: 'Top 3', 'ben-bi': 'Bền bỉ', 'bung-no': 'Bùng nổ',
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
export function computeBadges(people: BadgePerson[], thisMonth: string, bestDays: Partial<Record<BadgeDept, { id: string; day: string; net: number }>> = {}): Record<string, Badge[]> {
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
    // 5. Ngày bùng nổ: ngày doanh số cao nhất cả phòng.
    const bd = bestDays[dept];
    if (bd && list.some((p) => p.id === bd.id)) add(bd.id, { key: 'best-day', tier: 'bung-no', label: 'Ngày bùng nổ của phòng', note: `${bd.day.slice(8, 10)}/${bd.day.slice(5, 7)}/${bd.day.slice(0, 4)}: ${moneyLabel(Math.round(bd.net / 1e6) * 1e6)}`, month: bd.day.slice(0, 7) });
  }
  const order: BadgeTier[] = ['ky-luc', 'quan-quan', 'bung-no', 'kim-cuong', 'vang', 'top', 'ben-bi', 'bac', 'dong'];
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
  const [sales, mkt, saleDay, cskhDay, mktDay] = await db.batch([
    db.prepare(`SELECT substr(day,1,7) AS month, seller_id AS id, ${deptCase} AS dept, SUM(closed_orders) AS orders, SUM(closed_net) AS net, SUM(orders) AS base, SUM(${CC}) AS cob
      FROM stats_daily WHERE pos_id IN (${ph}) AND seller_id<>'' GROUP BY 1,2 HAVING dept IS NOT NULL`).bind(...posIds),
    db.prepare(`SELECT substr(day,1,7) AS month, marketer_id AS id, SUM(orders) AS orders, SUM(net) AS net FROM stats_daily_mkt
      WHERE pos_id IN (${ph}) AND marketer_id<>'' AND marketer_id IN (SELECT user_id FROM pos_users WHERE name LIKE '%mkt%') GROUP BY 1,2`).bind(...posIds),
    ...(['sale', 'cskh'] as const).map((d) => db.prepare(`SELECT seller_id AS id, day, SUM(closed_net) AS net FROM stats_daily WHERE pos_id IN (${ph}) AND seller_id IN ${teamSubquery(d)} GROUP BY 1,2 ORDER BY net DESC LIMIT 1`).bind(...posIds)),
    db.prepare(`SELECT marketer_id AS id, day, SUM(net) AS net FROM stats_daily_mkt WHERE pos_id IN (${ph}) AND marketer_id IN (SELECT user_id FROM pos_users WHERE name LIKE '%mkt%') GROUP BY 1,2 ORDER BY net DESC LIMIT 1`).bind(...posIds),
  ]);
  const tenure = await staffTenure(db, today).catch(() => ({} as Awaited<ReturnType<typeof staffTenure>>));
  const people = new Map<string, BadgePerson>();
  const person = (id: string, dept: BadgeDept) => people.get(`${dept}:${id}`) ?? people.set(`${dept}:${id}`, { id, dept, joined: tenure[id]?.joined ?? null, months: [] }).get(`${dept}:${id}`)!;
  for (const r of sales.results as { month: string; id: string; dept: 'sale' | 'cskh'; orders: number; net: number; base: number; cob: number }[])
    person(String(r.id), r.dept).months.push({ month: r.month, orders: Number(r.orders), net: Number(r.net), base: Number(r.base), closedOfBase: Math.min(Number(r.base), Number(r.cob)) });
  for (const r of mkt.results as { month: string; id: string; orders: number; net: number }[])
    person(String(r.id), 'mkt').months.push({ month: r.month, orders: Number(r.orders), net: Number(r.net), base: 0, closedOfBase: 0 });
  const day = (res: D1Result) => { const r = res.results[0] as { id: string; day: string; net: number } | undefined; return r && Number(r.net) > 0 ? { id: String(r.id), day: r.day, net: Number(r.net) } : undefined; };
  const book: BadgeBook = { day: today, people: computeBadges([...people.values()], today.slice(0, 7), { sale: day(saleDay), cskh: day(cskhDay), mkt: day(mktDay) }) };
  await db.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(BADGES_KEY, JSON.stringify(book), new Date().toISOString()).run();
  return book;
}
