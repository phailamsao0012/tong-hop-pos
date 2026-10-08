// Xu hướng 10 tuần theo bộ phận, team, sản phẩm (anh Vũ 08/10/2026: "xem từng con sản phẩm xu hướng ntn, từng team xu hướng ntn").
// Luôn lấy 10 tuần đến ngày cuối kỳ đang chọn (thêm 4 tuần trước đó để vẽ đường cùng kỳ tháng trước), kể cả khi kỳ chỉ là "Hôm nay".
// File thuần (không phụ thuộc Cloudflare) để test được và dùng chung cho trình duyệt, API và nhận xét AI.
import { ORDER_LINES, OTHER_LINE } from './shipping-lines';
import type { GroupKey } from './stats';

export const TREND_WEEKS = 10;
/** 10 tuần + 4 tuần trước đó (đường cùng kỳ tháng trước = lùi 28 ngày). */
export const TREND_DAYS = (TREND_WEEKS + 4) * 7;
export type TrendDim = 'dept' | 'team' | 'product';
export const TREND_DIMS: Record<TrendDim, string> = { dept: 'Bộ phận', team: 'Team', product: 'Sản phẩm' };
export type DeptKey = 'company' | 'sale' | 'cskh' | 'mkt' | 'vandon';
export const DEPT_LABELS: Record<DeptKey, string> = { company: 'Cả công ty', sale: 'Sale', cskh: 'CSKH', mkt: 'MKT', vandon: 'Vận đơn' };

/** Một đường xu hướng: tiền và số đơn (sản phẩm: số lượng bán) từng ngày, dài TREND_DAYS. */
export type TrendSeries = {
  key: string; label: string; dim: TrendDim; dept?: DeptKey; net: number[]; n: number[];
  /** Vận đơn: số đơn hoàn trong số đơn đi mỗi ngày (Vận đơn không bán hàng nên không có doanh thu, anh Vũ 08/10). */ ret?: number[];
};
/** Vận đơn chỉ đo bằng số đơn gửi đi; các bộ phận khác mặc định doanh thu. */
export const isOrdersOnly = (s: Pick<TrendSeries, 'dept' | 'dim'>) => s.dim === 'dept' && s.dept === 'vandon';
export type TrendReport = {
  days: string[]; selected: { start: string; end: string };
  /** Ô cuối cùng là ngày đủ (hôm nay chưa hết ngày thì là hôm qua): mốc tính tuần và tăng giảm. */ fullIndex: number;
  depts: TrendSeries[]; teams: TrendSeries[]; products: TrendSeries[];
  cohort: { day: string; groups: Record<GroupKey, number> }[];
};

// ---- dựng từ các dòng gom ở SQL ----
export type ClosedTrendRow = { day: string; seller_id: string | null; team: 'sale' | 'cskh' | 'other'; sent: number; ret?: number; n: number; net: number };
export type MktTrendRow = { day: string; marketer_id: string | null; n: number; net: number };
export type ProductTrendRow = { day: string; name: string | null; qty: number; net: number };
export type CohortRow = { day: string; grp: GroupKey; n: number };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
/** Dòng sản phẩm của một tên sản phẩm (cùng cách chia loại đơn ở Vận đơn theo dòng sản phẩm). */
export const productLine = (name: string) => ORDER_LINES.find((l) => l.patterns.some((re) => re.test(fold(name))))?.label ?? OTHER_LINE;

export function buildTrends(input: {
  days: string[]; selected: { start: string; end: string }; fullIndex: number;
  closed: ClosedTrendRow[]; mkt: MktTrendRow[]; products: ProductTrendRow[]; cohort: CohortRow[];
  /** Team của người bán (Sale / CSKH): tên đơn vị trên web nhân sự. */ sellerTeam: (id: string) => string | null;
  /** Team MKT của Marketer. */ mktTeam: (id: string) => string | null;
}): TrendReport {
  const idx = new Map(input.days.map((d, i) => [d, i]));
  const L = input.days.length;
  const map = new Map<string, TrendSeries>();
  const series = (key: string, label: string, dim: TrendDim, dept?: DeptKey) => {
    let s = map.get(key);
    if (!s) { s = { key, label, dim, dept, net: Array(L).fill(0), n: Array(L).fill(0) }; map.set(key, s); }
    return s;
  };
  const add = (s: TrendSeries, i: number, n: number, net: number) => { s.n[i] += Number(n) || 0; s.net[i] += Number(net) || 0; };
  for (const k of ['company', 'sale', 'cskh', 'mkt', 'vandon'] as DeptKey[]) series(`dept:${k}`, DEPT_LABELS[k], 'dept', k);
  for (const r of input.closed) {
    const i = idx.get(r.day); if (i === undefined) continue;
    add(map.get('dept:company')!, i, r.n, r.net);
    if (r.sent) {
      const vd = map.get('dept:vandon')!;
      add(vd, i, r.n, r.net);
      if (r.ret) { vd.ret ??= Array(L).fill(0); vd.ret[i] += Number(r.n) || 0; }
    }
    if (r.team === 'other') continue;
    add(map.get(`dept:${r.team}`)!, i, r.n, r.net);
    const unit = (r.seller_id && input.sellerTeam(r.seller_id)) || 'Chưa gắn team';
    const label = unit.toLowerCase().startsWith(DEPT_LABELS[r.team].toLowerCase()) ? unit : `${DEPT_LABELS[r.team]} · ${unit}`;
    add(series(`team:${r.team}:${unit}`, label, 'team', r.team), i, r.n, r.net);
  }
  for (const r of input.mkt) {
    const i = idx.get(r.day); if (i === undefined) continue;
    add(map.get('dept:mkt')!, i, r.n, r.net);
    const team = (r.marketer_id && input.mktTeam(r.marketer_id)) || 'Chưa xếp team';
    add(series(`team:mkt:${team}`, `MKT · ${team}`, 'team', 'mkt'), i, r.n, r.net);
  }
  for (const r of input.products) {
    const i = idx.get(r.day); if (i === undefined) continue;
    const line = productLine(r.name ?? '');
    add(series(`product:${line}`, line, 'product'), i, r.qty, r.net);
  }
  // Trạng thái theo ngày tạo: 14 ngày cuối cửa sổ (gồm cả hôm nay).
  const cohort = input.days.slice(-14).map((day) => ({ day, groups: { new: 0, confirmed: 0, shipping: 0, delivered: 0, returned: 0, cancelled: 0 } as Record<GroupKey, number> }));
  const cIdx = new Map(cohort.map((c, i) => [c.day, i]));
  for (const r of input.cohort) { const i = cIdx.get(r.day); if (i !== undefined && r.grp in cohort[i].groups) cohort[i].groups[r.grp] += Number(r.n) || 0; }
  const all = [...map.values()];
  // Bỏ đường trống trong 10 tuần; team và sản phẩm sắp theo doanh thu 10 tuần, "Khác" / "Chưa gắn" xuống cuối.
  const tenWeeks = (s: TrendSeries) => s.net.slice(-TREND_WEEKS * 7).reduce((a, b) => a + b, 0);
  const tail = (s: TrendSeries) => /Khác$|Chưa (gắn|xếp) team$/.test(s.label) ? 1 : 0;
  const pick = (dim: TrendDim) => all.filter((s) => s.dim === dim && tenWeeks(s) > 0).sort((a, b) => tail(a) - tail(b) || tenWeeks(b) - tenWeeks(a));
  return { days: input.days, selected: input.selected, fullIndex: input.fullIndex, depts: all.filter((s) => s.dim === 'dept'), teams: pick('team'), products: pick('product'), cohort };
}

// ---- đọc xu hướng (dùng chung trình duyệt và AI) ----
/** Tổng 10 tuần, tuần cuối kết thúc ở fullIndex. */
export function weekly(values: number[], fullIndex: number, weeks = TREND_WEEKS) {
  return Array.from({ length: weeks }, (_, w) => {
    const endI = fullIndex - (weeks - 1 - w) * 7;
    let sum = 0;
    for (let i = endI - 6; i <= endI; i++) sum += values[i] ?? 0;
    return sum;
  });
}
export type Change = { now: number; before: number; pct: number | null; dir: 'up' | 'down' | 'flat' };
/** Tuần gần nhất so với trung bình 4 tuần trước đó; lệch dưới 3% coi là đi ngang. */
export function weekChange(w: number[]): Change {
  const now = w[w.length - 1] ?? 0;
  const prev = w.slice(-5, -1);
  const before = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
  const pct = before > 0 ? (now - before) / before * 100 : null;
  return { now, before, pct, dir: pct === null ? (now > 0 ? 'up' : 'flat') : pct > 3 ? 'up' : pct < -3 ? 'down' : 'flat' };
}
/** Trung bình 7 ngày (null khi chưa đủ 7 ngày). */
export const movingAvg = (values: number[]) => values.map((_, i) => i < 6 ? null : values.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7);
/** Số tuần giảm liên tiếp tính từ tuần gần nhất. */
export function fallingWeeks(w: number[]) { let k = 0; for (let i = w.length - 1; i > 0 && w[i] < w[i - 1]; i--) k++; return k; }

const signed = (c: Change) => c.pct === null ? 'mới có số' : `${c.pct > 0 ? '+' : '−'}${Math.abs(Math.round(c.pct))}%`;
const pctText = (c: Change) => c.pct === null ? 'mới có số' : `${c.pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(Math.round(c.pct))}%`;

/** Số gọn gửi AI và dùng cho nhận xét tự tính: mỗi bộ phận 10 tuần, team và sản phẩm tăng / giảm mạnh nhất. */
export function trendFacts(r: TrendReport) {
  // Vận đơn: số đơn đi (không có doanh thu); còn lại: doanh thu.
  const one = (s: TrendSeries) => { const w = weekly(isOrdersOnly(s) ? s.n : s.net, r.fullIndex); const c = weekChange(w); return { ten: s.label, tuanNay: Math.round(c.now), tb4TuanTruoc: Math.round(c.before), thayDoi: c.pct === null ? null : Math.round(c.pct), tuanGiamLienTiep: fallingWeeks(w), w, c }; };
  const ranked = (list: TrendSeries[]) => list.map(one).filter((x) => x.tb4TuanTruoc > 0 || x.tuanNay > 0).sort((a, b) => (b.thayDoi ?? 0) - (a.thayDoi ?? 0));
  const depts = Object.fromEntries(r.depts.map((s) => [s.dept!, one(s)])) as Record<DeptKey, ReturnType<typeof one>>;
  const teamsOf = (d: DeptKey) => ranked(r.teams.filter((t) => t.dept === d));
  // Hoàn của Vận đơn: % đơn hoàn trên đơn đi, tuần này và trung bình 4 tuần trước.
  const vd = r.depts.find((s) => s.dept === 'vandon');
  const sentW = vd ? weekly(vd.n, r.fullIndex) : [], retW = vd?.ret ? weekly(vd.ret, r.fullIndex) : sentW.map(() => 0);
  const rate = (a: number, b: number) => b ? a / b * 100 : null;
  const returns = {
    now: rate(retW.at(-1) ?? 0, sentW.at(-1) ?? 0),
    before: rate(retW.slice(-5, -1).reduce((a, b) => a + b, 0), sentW.slice(-5, -1).reduce((a, b) => a + b, 0)),
    returnedNow: retW.at(-1) ?? 0,
  };
  // Sản phẩm theo số lượng cho Vận đơn (đơn đi), theo tiền cho MKT.
  const productsQty = r.products.map((s) => ({ ...s, net: s.n })).map(one).filter((x) => x.tb4TuanTruoc > 0 || x.tuanNay > 0).sort((a, b) => (b.thayDoi ?? 0) - (a.thayDoi ?? 0));
  return { depts, teams: { sale: teamsOf('sale'), cskh: teamsOf('cskh'), mkt: teamsOf('mkt') }, products: ranked(r.products), productsQty, returns, weekEnd: r.days[r.fullIndex] };
}

export type TrendNotes = Record<Exclude<DeptKey, 'company'>, string[]>;
type Ranked = ReturnType<typeof trendFacts>['products'];
const shortName = (s: string) => s.split(' · ').pop() ?? s;
const isFiller = (label: string) => label === OTHER_LINE || /Chưa (gắn|xếp) team$/.test(label);
/**
 * Nhận xét tự tính từ số (khi chưa có AI hoặc AI lỗi): một câu ngắn mỗi bộ phận về team / sản phẩm đáng chú ý
 * (số tăng giảm của bộ phận đã có trên biểu đồ). Chỉ khuyên "nên xem lại" khi đang giảm.
 */
export function ruleNotes(f: ReturnType<typeof trendFacts>): TrendNotes {
  const line = (list: Ranked, what: string) => {
    const l = list.filter((x) => !isFiller(x.ten));
    if (!l.length) return `Chưa đủ số theo ${what}.`;
    const best = l[0], worst = l[l.length - 1];
    if (worst.c.dir === 'down') return `${shortName(worst.ten)} ${pctText(worst.c)}, nên xem lại${l.length > 1 && best.c.dir === 'up' ? `; ${shortName(best.ten)} kéo lên ${signed(best.c)}` : ''}.`;
    if (l.length === 1) return `${shortName(best.ten)} ${pctText(best.c)}.`;
    return `${shortName(best.ten)} kéo lên mạnh nhất (${signed(best.c)}); ${shortName(worst.ten)} tăng ít nhất (${signed(worst.c)}).`;
  };
  return {
    sale: [line(f.teams.sale, 'team')],
    cskh: [line(f.teams.cskh, 'team')],
    mkt: [line(f.teams.mkt.some((x) => !isFiller(x.ten)) ? f.teams.mkt : f.products, 'sản phẩm')],
    vandon: [vandonLine(f)],
  };
}

/** Vận đơn: câu về hoàn (chỉ khuyên xem lại khi % hoàn tăng), không nói doanh thu. */
function vandonLine(f: ReturnType<typeof trendFacts>) {
  const { now, before, returnedNow } = f.returns;
  if (now === null) return 'Tuần này chưa có đơn gửi đi.';
  const p = (v: number) => `${v.toFixed(1).replace('.', ',')}%`;
  const base = `Tuần này hoàn ${returnedNow.toLocaleString('vi-VN')} đơn, ${p(now)} số đơn đi`;
  if (before === null) return `${base}.`;
  return now > before + 0.5 ? `${base}, cao hơn 4 tuần trước (${p(before)}), nên xem lại.` : `${base}, 4 tuần trước ${p(before)}.`;
}

export type DeptChart = {
  /** money = doanh thu; orders = số đơn đi (Vận đơn). */ unit: 'money' | 'orders';
  weeks: number[]; now: number; pct: number | null; dir: Change['dir']; moversOf: 'team' | 'product'; movers: { label: string; pct: number }[];
  /** Vận đơn: % hoàn tuần này và trung bình 4 tuần trước. */ returns?: { now: number | null; before: number | null };
};
/** Số cho ô biểu đồ của từng bộ phận: 10 tuần, % so 4 tuần trước, tối đa 4 team / sản phẩm kéo lên hoặc kéo xuống nhiều nhất. */
export function deptCharts(f: ReturnType<typeof trendFacts>): Record<Exclude<DeptKey, 'company'>, DeptChart> {
  const movers = (list: Ranked) => {
    const l = list.filter((x) => !isFiller(x.ten) && x.thayDoi !== null);
    const pick = l.length <= 4 ? l : [...l.slice(0, 2), ...l.slice(-2)];
    return pick.map((x) => ({ label: shortName(x.ten), pct: x.thayDoi! }));
  };
  const one = (d: Exclude<DeptKey, 'company'>, of: 'team' | 'product', list: Ranked): DeptChart => {
    const x = f.depts[d];
    return { unit: d === 'vandon' ? 'orders' : 'money', weeks: x.w.map(Math.round), now: Math.round(x.c.now), pct: x.c.pct, dir: x.c.dir, moversOf: of, movers: movers(list),
      returns: d === 'vandon' ? { now: f.returns.now, before: f.returns.before } : undefined };
  };
  const mktTeams = f.teams.mkt.some((x) => !isFiller(x.ten));
  return {
    sale: one('sale', 'team', f.teams.sale), cskh: one('cskh', 'team', f.teams.cskh),
    mkt: mktTeams ? one('mkt', 'team', f.teams.mkt) : one('mkt', 'product', f.products), vandon: one('vandon', 'product', f.productsQty),
  };
}

const NOTE_DEPTS = ['sale', 'cskh', 'mkt', 'vandon'] as const;
/** Lấy JSON đầu tiên trong câu trả lời; thiếu bộ phận nào thì bộ phận đó dùng nhận xét tự tính. */
export function parseNotes(raw: string, fallback: TrendNotes): { notes: TrendNotes; complete: boolean } {
  const m = raw.match(/\{[\s\S]*\}/);
  let obj: Record<string, unknown> = {};
  try { obj = m ? JSON.parse(m[0]) as Record<string, unknown> : {}; } catch { obj = {}; }
  let complete = true;
  const notes = Object.fromEntries(NOTE_DEPTS.map((d) => {
    const v = obj[d];
    const lines = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().replace(/\*\*/g, '')).slice(0, 1) : [];
    if (!lines.length) complete = false;
    return [d, lines.length ? lines : fallback[d]];
  })) as TrendNotes;
  return { notes, complete };
}
