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
export type TrendSeries = { key: string; label: string; dim: TrendDim; dept?: DeptKey; net: number[]; n: number[] };
export type TrendReport = {
  days: string[]; selected: { start: string; end: string };
  /** Ô cuối cùng là ngày đủ (hôm nay chưa hết ngày thì là hôm qua): mốc tính tuần và tăng giảm. */ fullIndex: number;
  depts: TrendSeries[]; teams: TrendSeries[]; products: TrendSeries[];
  cohort: { day: string; groups: Record<GroupKey, number> }[];
};

// ---- dựng từ các dòng gom ở SQL ----
export type ClosedTrendRow = { day: string; seller_id: string | null; team: 'sale' | 'cskh' | 'other'; sent: number; n: number; net: number };
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
    if (r.sent) add(map.get('dept:vandon')!, i, r.n, r.net);
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

const tr = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(2).replace('.', ',')} tỷ` : `${Math.round(v / 1e6).toLocaleString('vi-VN')} triệu`;
const signed = (c: Change) => c.pct === null ? 'mới có số' : `${c.pct > 0 ? '+' : '−'}${Math.abs(Math.round(c.pct))}%`;
const pctText = (c: Change) => c.pct === null ? 'mới có số' : `${c.pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(Math.round(c.pct))}%`;

/** Số gọn gửi AI và dùng cho nhận xét tự tính: mỗi bộ phận 10 tuần, team và sản phẩm tăng / giảm mạnh nhất. */
export function trendFacts(r: TrendReport) {
  const one = (s: TrendSeries) => { const w = weekly(s.net, r.fullIndex); const c = weekChange(w); return { ten: s.label, tuanNay: Math.round(c.now), tb4TuanTruoc: Math.round(c.before), thayDoi: c.pct === null ? null : Math.round(c.pct), tuanGiamLienTiep: fallingWeeks(w), w, c }; };
  const ranked = (list: TrendSeries[]) => list.map(one).filter((x) => x.tb4TuanTruoc > 0 || x.tuanNay > 0).sort((a, b) => (b.thayDoi ?? 0) - (a.thayDoi ?? 0));
  const depts = Object.fromEntries(r.depts.map((s) => [s.dept!, one(s)])) as Record<DeptKey, ReturnType<typeof one>>;
  const teamsOf = (d: DeptKey) => ranked(r.teams.filter((t) => t.dept === d));
  return { depts, teams: { sale: teamsOf('sale'), cskh: teamsOf('cskh'), mkt: teamsOf('mkt') }, products: ranked(r.products), weekEnd: r.days[r.fullIndex] };
}

export type TrendNotes = Record<Exclude<DeptKey, 'company'>, string[]>;
/** Nhận xét tự tính từ số (khi chưa có AI hoặc AI lỗi): 2 câu mỗi bộ phận, câu đầu là tuần này so 4 tuần trước. */
export function ruleNotes(f: ReturnType<typeof trendFacts>): TrendNotes {
  const head = (k: DeptKey, what: string) => {
    const d = f.depts[k];
    const streak = d.tuanGiamLienTiep >= 2 ? `, giảm ${d.tuanGiamLienTiep} tuần liền` : '';
    return `${what} tuần này ${tr(d.c.now)}, ${pctText(d.c)} so với trung bình 4 tuần trước${streak}.`;
  };
  const teamLine = (list: ReturnType<typeof trendFacts>['teams']['sale']) => {
    if (list.length < 2) return list.length ? `${list[0].ten.split(' · ').pop()} ${pctText(list[0].c)}.` : 'Chưa đủ số theo team.';
    const best = list[0], worst = list[list.length - 1];
    const short = (s: string) => s.split(' · ').pop();
    const tail = worst.c.dir === 'down' ? `${short(worst.ten)} ${pctText(worst.c)}, nên xem lại.` : `${short(worst.ten)} tăng ít nhất (${signed(worst.c)}).`;
    return `${short(best.ten)} ${best.c.dir === 'down' ? 'giảm ít nhất' : 'tăng tốt nhất'} (${signed(best.c)}); ${tail}`;
  };
  // Bỏ nhóm "Khác" khi nêu sản phẩm tăng nhanh / chậm nhất.
  const p = f.products.filter((x) => x.ten !== OTHER_LINE);
  const slow = p[p.length - 1];
  return {
    sale: [head('sale', 'Doanh thu chốt'), teamLine(f.teams.sale)],
    cskh: [head('cskh', 'Doanh thu chốt'), teamLine(f.teams.cskh)],
    mkt: [head('mkt', 'Doanh thu đơn đã xác nhận'), p.length ? `Sản phẩm tăng nhanh nhất: ${p[0].ten} (${signed(p[0].c)}). Chưa có chi phí nên chưa tính ROAS.` : 'Chưa có số theo sản phẩm.'],
    vandon: [head('vandon', 'Doanh số đi'), p.length > 1 ? `${slow.ten} ${slow.c.dir === 'down' ? `đi chậm lại (${signed(slow.c)}), nên xem tồn và đơn chờ gửi` : `tăng ít nhất (${signed(slow.c)})`}.` : 'Chưa có số theo sản phẩm.'],
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
    const lines = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().replace(/\*\*/g, '')).slice(0, 3) : [];
    if (!lines.length) complete = false;
    return [d, lines.length ? lines : fallback[d]];
  })) as TrendNotes;
  return { notes, complete };
}
