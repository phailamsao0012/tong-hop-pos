// Con người (kế hoạch quản trị, giai đoạn 5 · 26/09/2026): danh sách nhân viên, hồ sơ 360, thành tựu tự tính, cấp bậc & lộ trình.
// Số theo người bán trên đơn (bảng tổng hợp theo ngày stats_daily: closed_* theo ngày xác nhận lần đầu, assigned_orders theo ngày chia số),
// cùng nguồn với KPI CSKH, So sánh nhân viên, Tổng quan bộ phận. Không có lương, hợp đồng (đã chốt 26/09/2026).
import { env } from 'cloudflare:workers';
import { POS } from '@/lib/report-model';
import { teamOf } from '@/lib/team';
import { todayVn } from '@/lib/report-time';

export type Dept = 'sale' | 'cskh' | 'mkt' | 'other';
export const DEPT_LABELS: Record<Dept, string> = { sale: 'Sale', cskh: 'CSKH', mkt: 'Marketing', other: 'Khác' };
export const deptOf = (department: string | null | undefined, name = ''): Dept => {
  const t = teamOf(department);
  if (t) return t;
  return /mkt|marketing/i.test(`${department ?? ''} ${name}`) ? 'mkt' : 'other';
};

// ---- Cấp bậc & lộ trình (sếp tự tạo) ----
export const LEVEL_METRICS = {
  revenue: { label: 'Doanh thu tháng', unit: '₫' },
  closedOrders: { label: 'Đơn chốt tháng', unit: 'đơn' },
  aov: { label: 'GTTB', unit: '₫' },
  dataRate: { label: 'Tỷ lệ chốt data', unit: '%' },
} as const;
export type LevelMetric = keyof typeof LEVEL_METRICS;
export type LevelCondition = { metric: LevelMetric; min: number; months: number };
export type Level = { id: string; name: string; conditions: LevelCondition[] };
export type LevelConfig = Record<Exclude<Dept, 'other'>, Level[]>;
export const EMPTY_LEVELS: LevelConfig = { sale: [], cskh: [], mkt: [] };
export type PersonMeta = { joinedAt?: string | null; managerId?: string | null; title?: string | null; note?: string | null; level?: string | null };

const readJson = async <T,>(key: string, fallback: T): Promise<T> => {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<{ value: string }>();
  try { return row ? { ...fallback, ...JSON.parse(row.value) } as T : fallback; } catch { return fallback; }
};
const writeJson = (key: string, value: unknown) => env.DB.prepare('INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(key, JSON.stringify(value), new Date().toISOString()).run();
export const getLevels = () => readJson<LevelConfig>('people_levels', EMPTY_LEVELS);
export const saveLevels = (c: LevelConfig) => writeJson('people_levels', c);
export const getMeta = () => readJson<Record<string, PersonMeta>>('people_meta', {});
export const saveMeta = (m: Record<string, PersonMeta>) => writeJson('people_meta', m);

type Month = { month: string; revenue: number; closedOrders: number; assigned: number; aov: number | null; dataRate: number | null };
const monthOf = (day: string) => day.slice(0, 7);
const addMonths = (month: string, n: number) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const valueOf = (m: Month | undefined, metric: LevelMetric) => !m ? 0 : metric === 'revenue' ? m.revenue : metric === 'closedOrders' ? m.closedOrders : metric === 'aov' ? m.aov ?? 0 : m.dataRate ?? 0;

/** Bậc hiện tại = bậc cao nhất mà mọi điều kiện đạt đủ N tháng liền gần nhất (tháng đã kết thúc); kèm bậc kế và điều kiện còn thiếu. */
export function evaluateLevel(levels: Level[], months: Map<string, Month>, lastFull: string) {
  const streak = (c: LevelCondition) => { let n = 0; for (let m = lastFull; n < 36; m = addMonths(m, -1)) { if (valueOf(months.get(m), c.metric) >= c.min) n++; else break; } return n; };
  let current = -1;
  levels.forEach((lv, i) => { if (lv.conditions.length && lv.conditions.every((c) => streak(c) >= c.months)) current = i; });
  const next = levels[current + 1] ?? null;
  return {
    current: current >= 0 ? levels[current] : null,
    next: next ? { ...next, progress: next.conditions.map((c) => ({ ...c, streak: streak(c), lastValue: valueOf(months.get(lastFull), c.metric), done: streak(c) >= c.months })) } : null,
    path: levels.map((l, i) => ({ id: l.id, name: l.name, state: i <= current ? 'done' : i === current + 1 ? 'next' : 'later' })),
  };
}

async function directory() {
  const rows = await env.DB.prepare("SELECT user_id, MAX(name) AS name, MAX(department) AS department, GROUP_CONCAT(DISTINCT pos_id) AS pos, MAX(is_active) AS active FROM pos_users WHERE name<>'' GROUP BY user_id")
    .all<{ user_id: string; name: string; department: string | null; pos: string | null; active: number }>();
  return rows.results.map((r) => ({ id: r.user_id, name: r.name.replace(/\s+/g, ' ').trim(), department: r.department, dept: deptOf(r.department, r.name), posIds: String(r.pos ?? '').split(',').filter(Boolean), active: !!r.active }));
}

/** Số từng tháng của mọi người (12 tháng gần nhất) từ bảng tổng hợp theo ngày. */
async function monthly(sinceMonth: string) {
  const rows = await env.DB.prepare(`SELECT seller_id, substr(day,1,7) AS month, SUM(closed_net) AS revenue, SUM(closed_orders) AS closed, SUM(assigned_orders) AS assigned
    FROM stats_daily WHERE day>=? AND seller_id<>'' GROUP BY 1,2`).bind(`${sinceMonth}-01`).all<{ seller_id: string; month: string; revenue: number; closed: number; assigned: number }>();
  const map = new Map<string, Map<string, Month>>();
  for (const r of rows.results) {
    const m: Month = { month: r.month, revenue: Number(r.revenue), closedOrders: Number(r.closed), assigned: Number(r.assigned), aov: Number(r.closed) ? Number(r.revenue) / Number(r.closed) : null, dataRate: Number(r.assigned) ? Number(r.closed) / Number(r.assigned) * 100 : null };
    if (!map.has(r.seller_id)) map.set(r.seller_id, new Map());
    map.get(r.seller_id)!.set(r.month, m);
  }
  return map;
}

export async function peopleList() {
  const month = todayVn().slice(0, 7), since = addMonths(month, -13), lastFull = addMonths(month, -1);
  const day = todayVn().slice(8, 10);
  const [dir, months, levels, meta, lifetime, prevSame] = await Promise.all([
    directory(), monthly(since), getLevels(), getMeta(),
    env.DB.prepare("SELECT seller_id, SUM(closed_net) AS net, MIN(CASE WHEN closed_orders>0 THEN day END) AS first_day FROM stats_daily WHERE seller_id<>'' GROUP BY 1").all<{ seller_id: string; net: number; first_day: string | null }>(),
    // Cùng số ngày đầu tháng trước, để so công bằng khi tháng này chưa hết.
    env.DB.prepare("SELECT seller_id, SUM(closed_net) AS net FROM stats_daily WHERE day>=? AND day<=? AND seller_id<>'' GROUP BY 1").bind(`${lastFull}-01`, `${lastFull}-${day}`).all<{ seller_id: string; net: number }>(),
  ]);
  const prevMap = new Map(prevSame.results.map((r) => [r.seller_id, Number(r.net)]));
  const life = new Map(lifetime.results.map((r) => [r.seller_id, r]));
  const people = dir.map((p) => {
    const m = months.get(p.id) ?? new Map<string, Month>();
    const cur = m.get(month), prev = m.get(lastFull);
    const lv = p.dept !== 'other' ? evaluateLevel(levels[p.dept] ?? [], m, lastFull) : null;
    return {
      ...p, meta: meta[p.id] ?? {}, level: meta[p.id]?.level || lv?.current?.name || null,
      revenue: cur?.revenue ?? 0, closedOrders: cur?.closedOrders ?? 0, dataRate: cur?.dataRate ?? null, prevRevenue: prevMap.get(p.id) ?? 0, prevMonthRevenue: prev?.revenue ?? 0,
      spark: Array.from({ length: 6 }, (_, i) => m.get(addMonths(month, i - 5))?.revenue ?? 0),
      lifetime: Number(life.get(p.id)?.net ?? 0), firstDay: life.get(p.id)?.first_day ?? null,
    };
  }).filter((p) => p.lifetime > 0 || p.dept !== 'other');
  // Hạng trong bộ phận theo doanh thu tháng này.
  for (const d of ['sale', 'cskh', 'mkt', 'other'] as Dept[]) {
    const g = people.filter((p) => p.dept === d).sort((a, b) => b.revenue - a.revenue);
    g.forEach((p, i) => Object.assign(p, { rank: p.revenue > 0 ? i + 1 : null, rankOf: g.filter((x) => x.revenue > 0).length }));
  }
  return { month, people: people as (typeof people[number] & { rank: number | null; rankOf: number })[], deptLabels: DEPT_LABELS };
}

const ACHIEVE_REVENUE = [100e6, 500e6, 1e9, 3e9, 5e9, 10e9];
const ACHIEVE_CUSTOMERS = [100, 500, 1000, 3000];

export async function personDetail(id: string) {
  const month = todayVn().slice(0, 7), since = addMonths(month, -11), lastFull = addMonths(month, -1);
  const [dir, months, levels, meta, life, customers] = await Promise.all([
    directory(), monthly(addMonths(month, -35)), getLevels(), getMeta(),
    env.DB.prepare("SELECT SUM(closed_net) AS net, SUM(closed_orders) AS closed, MIN(CASE WHEN closed_orders>0 THEN day END) AS first_day FROM stats_daily WHERE seller_id=?").bind(id).first<{ net: number; closed: number; first_day: string | null }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(success_orders>0) AS buyers, SUM(success_orders>1) AS repeaters FROM customer_stats WHERE seller_id=? AND pos_id IN (${POS.map(() => '?').join(',')})`).bind(id, ...POS.map((p) => p.id)).first<{ n: number; buyers: number; repeaters: number }>(),
  ]);
  const day = todayVn().slice(8, 10);
  const prevSame = await env.DB.prepare('SELECT SUM(closed_net) AS net FROM stats_daily WHERE seller_id=? AND day>=? AND day<=?').bind(id, `${lastFull}-01`, `${lastFull}-${day}`).first<{ net: number }>();
  const person = dir.find((p) => p.id === id);
  if (!person) return null;
  const mine = months.get(id) ?? new Map<string, Month>();
  const series = Array.from({ length: 12 }, (_, i) => addMonths(since, i)).map((m) => {
    // Hạng trong bộ phận từng tháng.
    const peers = dir.filter((p) => p.dept === person.dept).map((p) => months.get(p.id)?.get(m)?.revenue ?? 0).filter((v) => v > 0).sort((a, b) => b - a);
    const v = mine.get(m);
    return { month: m, revenue: v?.revenue ?? 0, closedOrders: v?.closedOrders ?? 0, aov: v?.aov ?? null, dataRate: v?.dataRate ?? null, rank: v?.revenue ? peers.indexOf(v.revenue) + 1 : null, peers: peers.length,
      // So với bộ phận: trung bình những người có doanh thu trong tháng và người cao nhất.
      deptAvg: peers.length ? peers.reduce((a, b) => a + b, 0) / peers.length : null, deptTop: peers[0] ?? null };
  });
  // Thành tựu tự tính từ số thật.
  const lifetime = Number(life?.net ?? 0);
  const achievements: { key: string; title: string; detail: string }[] = [];
  const topRev = ACHIEVE_REVENUE.filter((v) => lifetime >= v).pop();
  if (topRev) achievements.push({ key: 'rev', title: `${topRev >= 1e9 ? `${topRev / 1e9} tỷ` : `${topRev / 1e6} triệu`} doanh thu`, detail: `Tổng doanh thu đơn chốt từ trước tới nay ${Math.round(lifetime / 1e6).toLocaleString('vi-VN')} triệu` });
  const buyers = Number(customers?.buyers ?? 0);
  const topCus = ACHIEVE_CUSTOMERS.filter((v) => buyers >= v).pop();
  if (topCus) achievements.push({ key: 'cus', title: `${topCus.toLocaleString('vi-VN')} khách đã mua`, detail: `${buyers.toLocaleString('vi-VN')} khách mua thành công từ người này` });
  const tops = series.filter((s) => s.rank && s.rank <= 3 && s.month < month);
  for (const s of tops.slice(-3)) achievements.push({ key: `top-${s.month}`, title: `Top ${s.rank} tháng ${Number(s.month.slice(5))}/${s.month.slice(0, 4)}`, detail: `Hạng ${s.rank}/${s.peers} bộ phận ${DEPT_LABELS[person.dept]} theo doanh thu` });
  let grow = 0; for (let i = series.length - 2; i > 0 && series[i].revenue > series[i - 1].revenue && series[i - 1].revenue > 0; i--) grow++;
  if (grow >= 3) achievements.push({ key: 'grow', title: `${grow} tháng tăng liên tiếp`, detail: 'Doanh thu tháng sau cao hơn tháng trước, liên tục' });
  const lv = person.dept !== 'other' ? evaluateLevel(levels[person.dept] ?? [], mine, lastFull) : null;
  const m = meta[id] ?? {};
  return {
    person: { ...person, meta: m, manager: m.managerId ? dir.find((p) => p.id === m.managerId)?.name ?? null : null },
    month, prevSameDays: Number(prevSame?.net ?? 0), series, lifetime: { revenue: lifetime, closedOrders: Number(life?.closed ?? 0), firstDay: life?.first_day ?? null },
    customers: { total: Number(customers?.n ?? 0), buyers, repeaters: Number(customers?.repeaters ?? 0) },
    achievements, level: lv, levelOverride: m.level ?? null,
    definitions: {
      source: 'Số theo người bán trên đơn, từ bảng tổng hợp theo ngày: doanh thu và đơn chốt theo ngày xác nhận lần đầu, số được chia theo ngày chia. Cùng nguồn với KPI và So sánh nhân viên.',
      rank: 'Hạng = thứ tự doanh thu tháng trong cùng bộ phận (chỉ tính người có doanh thu).',
      level: 'Cấp bậc tự xét theo điều kiện sếp đặt ở Cấp bậc & lộ trình: đạt đủ số tháng liền gần nhất (tháng đã kết thúc). Sếp có thể ghi đè bằng tay.',
      customers: 'Khách = số điện thoại có người này là người bán trên đơn gần nhất (theo từng POS).',
    },
  };
}

/** Sơ đồ tổ chức & mục tiêu phân tầng: Công ty (mục tiêu = tổng mục tiêu POS) → bộ phận → nhóm (theo quản lý trực tiếp) → người (mục tiêu từng người). */
export async function orgTree() {
  const { month, people } = await peopleList();
  const { listTargets } = await import('@/lib/targets');
  const targets = await listTargets(month);
  const empTarget = new Map(targets.filter((t) => t.scope === 'employee').map((t) => [t.refId, t.revenue]));
  const company = targets.filter((t) => t.scope === 'pos').reduce((a, t) => a + t.revenue, 0);
  const day = Number(todayVn().slice(8, 10));
  const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const nodes = people.map((p) => ({ id: p.id, name: p.name, dept: p.dept, managerId: p.meta.managerId ?? null, title: p.meta.title ?? p.department ?? null, level: p.level,
    revenue: p.revenue, target: empTarget.get(p.id) ?? 0, forecast: day ? p.revenue / day * dim : p.revenue }));
  return { month, day, daysInMonth: dim, company: { target: company, revenue: nodes.reduce((a, n) => a + n.revenue, 0) }, people: nodes, deptLabels: DEPT_LABELS };
}
