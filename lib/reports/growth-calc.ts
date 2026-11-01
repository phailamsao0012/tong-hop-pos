// Tăng trưởng nhân viên (anh Vũ 28/10/2026): hàm thuần dựng lịch, gom theo giai đoạn và so với người cùng bộ phận.
// Máy chủ chỉ trả số theo ngày của từng người (lib/growth.ts); mọi cách gom và so sánh tính ở trình duyệt.
import { addDays, daysBetween } from '@/lib/shared/report-time';

export const GROWTH_DEPTS = ['sale', 'cskh', 'mkt', 'vandon'] as const;
export type GrowthDept = typeof GROWTH_DEPTS[number];
export const GROWTH_DEPT_LABELS: Record<GrowthDept, string> = { sale: 'Sale', cskh: 'CSKH', mkt: 'Marketing', vandon: 'Vận đơn' };
/** Ngày vào lấy theo thứ tự: sửa tay → web nhân sự → ngày tạo tài khoản Pancake → ngày có đơn đầu tiên trong khoảng xem. */
export type JoinSource = 'tay' | 'nhan-su' | 'pancake' | 'don-dau';
export const JOIN_SOURCE_LABELS: Record<JoinSource, string> = { tay: 'sửa tay', 'nhan-su': 'web nhân sự', pancake: 'tạo tài khoản Pancake', 'don-dau': 'ngày có đơn đầu tiên' };
export type GrowthPerson = { id: string; name: string; joined: string | null; source: JoinSource | null; left: string | null };
/** d: số ngày tính từ start, v: giá trị chính (doanh số; Vận đơn là số đơn xác nhận), n: số đơn. */
export type GrowthSeries = { d: number[]; v: number[]; n: number[] };
export type GrowthData = { dept: GrowthDept; start: string; end: string; today: string; unit: 'money' | 'orders'; people: GrowthPerson[]; series: Record<string, GrowthSeries> };

export type Metric = 'v' | 'n';
export type Mode = 'dow' | 'dom' | 'wom' | 'moq' | 'moy' | 'qoy';
export const MODES: [Mode, string][] = [['moy', 'Tháng trong năm'], ['qoy', 'Quý trong năm'], ['dow', 'Thứ trong tuần'], ['dom', 'Ngày trong tháng'], ['wom', 'Tuần trong tháng'], ['moq', 'Tháng trong quý']];
/** Tháng / quý là chuỗi nối tiếp; các cách gom còn lại là "hình dáng" (gộp mọi tháng lại). */
export const isSeries = (m: Mode) => m === 'moy' || m === 'qoy';
/** prev: chính người đó (kỳ liền trước, hoặc trung bình của chính mình); same: mọi người cùng bộ phận đang làm trong cùng các ngày;
 *  new: trung bình mọi người ở cùng thâm niên; batch: người vào cách dưới 30 ngày, cùng thâm niên; pick: người tự chọn, cùng các ngày. */
export type Cmp = 'prev' | 'same' | 'new' | 'batch' | 'pick';
export const BATCH_DAYS = 30;

type Day = { v: number; n: number };
export type Index = Map<string, Map<string, Day>>;
export function indexSeries(data: GrowthData): Index {
  const out: Index = new Map();
  for (const [id, s] of Object.entries(data.series)) {
    const m = new Map<string, Day>();
    s.d.forEach((d, i) => m.set(addDays(data.start, d), { v: s.v[i] ?? 0, n: s.n[i] ?? 0 }));
    out.set(id, m);
  }
  return out;
}

const lastDay = (data: GrowthData) => data.end < data.today ? data.end : data.today;
/** Khoảng ngày làm của một người trong khoảng đang xem: từ ngày vào (hoặc đầu khoảng) tới hôm nay / ngày nghỉ. */
export function workSpan(p: GrowthPerson, data: GrowthData): { from: string; to: string } | null {
  const from = p.joined && p.joined > data.start ? p.joined : data.start;
  const to = p.left && p.left < lastDay(data) ? p.left : lastDay(data);
  return from <= to ? { from, to } : null;
}
export const tenureDays = (p: GrowthPerson, today: string) => p.joined && p.joined <= today ? daysBetween(p.joined, p.left && p.left < today ? p.left : today) : null;

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
function keyOf(mode: Mode, day: string): { key: string; label: string; order: number } {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)), d = Number(day.slice(8, 10));
  switch (mode) {
    case 'dow': { const w = new Date(`${day}T00:00:00Z`).getUTCDay(); const o = (w + 6) % 7; return { key: String(o), label: WD[w], order: o }; }
    case 'dom': return { key: String(d), label: String(d), order: d };
    case 'wom': { const w = Math.ceil(d / 7); return { key: String(w), label: `Tuần ${w}`, order: w }; }
    case 'moq': { const q = (m - 1) % 3 + 1; return { key: String(q), label: `Tháng ${q} của quý`, order: q }; }
    case 'moy': return { key: day.slice(0, 7), label: `T${m}/${y}`, order: y * 12 + m };
    case 'qoy': { const q = Math.ceil(m / 3); return { key: `${y}-Q${q}`, label: `Q${q}/${y}`, order: y * 4 + q }; }
  }
}

export type Bucket = { key: string; label: string; days: string[] };
export function buckets(mode: Mode, from: string, to: string): Bucket[] {
  const map = new Map<string, Bucket & { order: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = keyOf(mode, d);
    if (!map.has(k.key)) map.set(k.key, { key: k.key, label: k.label, order: k.order, days: [] });
    map.get(k.key)!.days.push(d);
  }
  return [...map.values()].sort((a, b) => a.order - b.order).map(({ order: _, ...b }) => b);
}

const sumDays = (idx: Index, id: string, days: string[], metric: Metric) => {
  const m = idx.get(id);
  if (!m) return 0;
  let s = 0;
  for (const d of days) s += m.get(d)?.[metric] ?? 0;
  return s;
};

/** Người cùng bộ phận được đem ra so (không gồm chính người đó) cho một nhóm ngày của người đó. */
export function peersFor(cmp: Cmp, me: GrowthPerson, data: GrowthData, picks: string[] = []) {
  const others = data.people.filter((p) => p.id !== me.id);
  if (cmp === 'pick') return others.filter((p) => picks.includes(p.id));
  if (cmp === 'new') return others.filter((p) => p.joined && p.joined >= data.start);
  if (cmp === 'batch') return others.filter((p) => p.joined && p.joined >= data.start && me.joined && Math.abs(daysBetween(me.joined, p.joined) - 1) <= BATCH_DAYS);
  return others;
}

/** Giá trị so sánh của một nhóm ngày: trung bình mỗi người trong nhóm so (null nếu không ai đủ dữ liệu). */
export function compareValue(cmp: Exclude<Cmp, 'prev'>, me: GrowthPerson, days: string[], data: GrowthData, idx: Index, metric: Metric, picks: string[] = []) {
  if (!days.length) return { value: null as number | null, people: 0 };
  const peers = peersFor(cmp, me, data, picks);
  const last = lastDay(data);
  let total = 0, count = 0;
  if (cmp === 'same' || cmp === 'pick') {
    for (const p of peers) {
      const span = workSpan(p, data);
      // Đang làm suốt các ngày đó: đã vào trước ngày đầu, chưa nghỉ trước ngày cuối.
      if (!span || span.from > days[0] || span.to < days[days.length - 1]) continue;
      if (cmp === 'same' && !idx.has(p.id)) continue;
      total += sumDays(idx, p.id, days, metric); count++;
    }
  } else {
    if (!me.joined) return { value: null, people: 0 };
    const offsets = days.map((d) => daysBetween(me.joined!, d) - 1);
    const maxOff = Math.max(...offsets);
    for (const p of peers) {
      const end = addDays(p.joined!, maxOff);
      if (end > last || (p.left && p.left < end)) continue;
      total += sumDays(idx, p.id, offsets.map((o) => addDays(p.joined!, o)), metric); count++;
    }
  }
  return { value: count ? total / count : null, people: count };
}

export type Row = { key: string; label: string; days: number; total: number; perDay: number; cmpTotal: number | null; cmpPerDay: number | null; pct: number | null; people: number };
/** Bảng theo giai đoạn của một người. pct so trên tổng (agg 'sum') hoặc trên trung bình mỗi ngày làm (agg 'avg'). */
export function periodRows(me: GrowthPerson, data: GrowthData, idx: Index, mode: Mode, cmp: Cmp, metric: Metric, agg: 'sum' | 'avg', picks: string[] = []): Row[] {
  const span = workSpan(me, data);
  if (!span) return [];
  const list = buckets(mode, span.from, span.to);
  const rows = list.map((b) => {
    const total = sumDays(idx, me.id, b.days, metric);
    return { key: b.key, label: b.label, days: b.days.length, total, perDay: total / b.days.length, b };
  });
  const allDays = rows.reduce((s, r) => s + r.days, 0), allTotal = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r, i) => {
    let cmpTotal: number | null = null, cmpPerDay: number | null = null, people = 0;
    if (cmp === 'prev') {
      // Tháng / quý: so kỳ liền trước. Thứ, ngày, tuần: so trung bình của chính người đó.
      if (isSeries(mode)) { const p = rows[i - 1]; if (p) { cmpTotal = p.total; cmpPerDay = p.perDay; } }
      else if (allDays) { cmpPerDay = allTotal / allDays; cmpTotal = cmpPerDay * r.days; }
      people = 1;
    } else {
      const c = compareValue(cmp, me, r.b.days, data, idx, metric, picks);
      if (c.value !== null) { cmpTotal = c.value; cmpPerDay = c.value / r.days; }
      people = c.people;
    }
    const mine = agg === 'sum' ? r.total : r.perDay, theirs = agg === 'sum' ? cmpTotal : cmpPerDay;
    return { key: r.key, label: r.label, days: r.days, total: r.total, perDay: r.perDay, cmpTotal, cmpPerDay, pct: theirs ? (mine / theirs - 1) * 100 : null, people };
  });
}

/** Cộng dồn theo ngày làm thứ 1, 2, 3… (chỉ khi biết ngày vào). Đường so: cùng thâm niên (new/batch) hoặc cùng các ngày (same/pick). */
export function cumulative(me: GrowthPerson, data: GrowthData, idx: Index, cmp: Cmp, metric: Metric, picks: string[] = []) {
  const span = workSpan(me, data);
  if (!span || !me.joined || me.joined < data.start) return [];
  const mode: Exclude<Cmp, 'prev'> = cmp === 'prev' ? 'new' : cmp;
  const peers = peersFor(mode, me, data, picks);
  const last = lastDay(data);
  const out: { t: number; day: string; mine: number; theirs: number | null; people: number }[] = [];
  let mine = 0;
  const sums = new Map<string, number>();
  for (let d = span.from, t = 1; d <= span.to; d = addDays(d, 1), t++) {
    mine += idx.get(me.id)?.get(d)?.[metric] ?? 0;
    let total = 0, count = 0;
    for (const p of peers) {
      const day = mode === 'new' || mode === 'batch' ? addDays(p.joined!, t - 1) : d;
      const ps = workSpan(p, data);
      if (!ps || day > last || (p.left && p.left < day)) continue;
      if ((mode === 'same' || mode === 'pick') && ps.from > span.from) continue;
      const s = (sums.get(p.id) ?? 0) + (idx.get(p.id)?.get(day)?.[metric] ?? 0);
      sums.set(p.id, s); total += s; count++;
    }
    out.push({ t, day: d, mine, theirs: count ? total / count : null, people: count });
  }
  return out;
}

export type PersonSummary = { id: string; name: string; joined: string | null; source: JoinSource | null; left: string | null; tenure: number | null; first30: number | null; last30: number; prev30: number; pct: number | null };
/** Bảng toàn bộ phận: 30 ngày đầu sau khi vào, 30 ngày gần nhất và so với 30 ngày trước đó. */
export function summaries(data: GrowthData, idx: Index, metric: Metric): PersonSummary[] {
  const last = lastDay(data);
  const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
  return data.people.map((p) => {
    const end = p.left && p.left < last ? p.left : last;
    const last30 = sumDays(idx, p.id, range(addDays(end, -29), 30), metric);
    const prev30 = sumDays(idx, p.id, range(addDays(end, -59), 30), metric);
    const first30 = p.joined && p.joined >= data.start && addDays(p.joined, 29) <= end ? sumDays(idx, p.id, range(p.joined, 30), metric) : null;
    return { id: p.id, name: p.name, joined: p.joined, source: p.source, left: p.left, tenure: tenureDays(p, data.today), first30, last30, prev30, pct: prev30 ? (last30 / prev30 - 1) * 100 : null };
  });
}
