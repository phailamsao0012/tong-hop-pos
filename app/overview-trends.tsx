'use client';

// Xu hướng và Trạng thái đơn kiểu mới (anh Vũ 08/10/2026, xem mẫu rồi trả lời "chọn cả, gì cũng muốn chọn"): mỗi thẻ có nút chọn kiểu, nhớ theo máy.
// Xu hướng: Ô nhỏ (mặc định, bấm ô mở biểu đồ to), Biểu đồ to, Bảng màu theo tuần, hoặc Theo kỳ (biểu đồ cũ). Luôn đủ 10 tuần, kỳ đang chọn tô nền.
// Trạng thái đơn: Phễu (mặc định), Theo ngày tạo, Một thanh + 6 ô, hoặc Tròn (cũ). Nhận xét AI theo bộ phận: TrendNotes.
// Số: /api/reports/trends (lib/trends.ts), /api/ai/trends (lib/ai-trends.ts).
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Bot, RotateCw, Sparkles } from 'lucide-react';
import { DEPT_LABELS, TREND_DIMS, TREND_WEEKS, isOrdersOnly, movingAvg, weekChange, weekly, type Change, type DeptChart, type DeptKey, type TrendDim, type TrendReport, type TrendSeries } from '@/lib/trends';
import type { GroupKey } from '@/lib/stats';
import { useApi } from './use-api';
import { CountUp } from './ui/count-up';
import { drawIn, useGlide, useInView, useTween } from './ui/chart-motion';
import { EmptyState, ErrorBox, STATUS_LABELS, STATUS_VARS, SegmentedControl, Skeleton, dmy, pct, short, timeOnly, toast, vi } from './ui-kit';

export type TrendsData = TrendReport & { definitions: Record<string, string> };
type Metric = 'net' | 'n';
type Groups = Record<GroupKey, { orders: number; net: number }>;
const GROUP_KEYS: GroupKey[] = ['new', 'confirmed', 'shipping', 'delivered', 'returned', 'cancelled'];

// ---- lựa chọn kiểu, nhớ theo máy (localStorage) ----
const prefEvent = 'thp-pref';
export function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const read = () => { try { const v = localStorage.getItem(key) as T | null; return v && allowed.includes(v) ? v : initial; } catch { return initial; } };
  const value = useSyncExternalStore((cb) => { window.addEventListener(prefEvent, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(prefEvent, cb); window.removeEventListener('storage', cb); }; }, read, () => initial);
  const set = (v: T) => { try { localStorage.setItem(key, v); } catch { /* bỏ qua */ } window.dispatchEvent(new Event(prefEvent)); };
  return [value, set];
}

/** Bề rộng thật của khung (để chữ trên biểu đồ SVG không bị co nhỏ). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const fmtVal = (v: number, metric: Metric) => metric === 'net' ? `${short(v)} ₫` : vi.format(Math.round(v));
const nLabel = (dim: TrendDim) => dim === 'product' ? 'Số lượng' : 'Số đơn';
/** Vận đơn không trực tiếp bán nên không gọi là doanh thu (anh Vũ 09/10/2026): tiền của Vận đơn là "giá trị đơn chuyển", đơn là "số đơn chuyển". */
const netLabel = (s: TrendSeries) => isOrdersOnly(s) ? 'Giá trị đơn chuyển' : 'Doanh thu';
const unitLabel = (s: TrendSeries) => isOrdersOnly(s) ? 'Số đơn chuyển' : nLabel(s.dim);
/** % đơn hoàn trên đơn đi của một tuần (Vận đơn). */
const returnRate = (s: TrendSeries, fullIndex: number) => {
  if (!s.ret) return null;
  const sent = weekly(s.n, fullIndex), ret = weekly(s.ret, fullIndex);
  const before = sent.slice(-5, -1).reduce((a, b) => a + b, 0);
  return { now: sent.at(-1) ? ret.at(-1)! / sent.at(-1)! * 100 : null, before: before ? ret.slice(-5, -1).reduce((a, b) => a + b, 0) / before * 100 : null };
};
const pct1 = (v: number | null) => v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`;
const DIR_CLS = { up: 'bg-good-bg text-good', down: 'bg-bad-bg text-bad', flat: 'bg-surface-3 text-ink-2' } as const;
const DIR_COLOR = { up: 'var(--good)', down: 'var(--bad)', flat: 'var(--ink-3)' } as const;
function ChangeChip({ c, suffix = ' so 4 tuần trước' }: { c: Pick<Change, 'pct' | 'dir'>; suffix?: string }) {
  const arrow = c.dir === 'up' ? '▲' : c.dir === 'down' ? '▼' : '■';
  return <span className={`num inline-flex w-fit items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold ${DIR_CLS[c.dir]}`}>{arrow} {c.pct === null ? 'mới có số' : `${c.pct > 0 ? '+' : ''}${Math.round(c.pct)}%`}{suffix}</span>;
}

/** Hộp gợi ý nổi theo con trỏ trong khung biểu đồ. */
export function FloatTip({ at, children, width = 190 }: { at: { x: number; y: number; w: number } | null; children: ReactNode; width?: number }) {
  if (!at) return null;
  // Gần mép phải thì lật sang bên trái con trỏ (theo Arc UI), không đè lên điểm đang xem.
  const left = at.x + 14 + width > at.w ? Math.max(4, at.x - 14 - width) : at.x + 14;
  return <div aria-hidden="true" className="pointer-events-none absolute z-10 rounded-lg bg-ink px-2.5 py-1.5 text-[11.5px] leading-snug text-surface shadow-float" style={{ left, top: Math.max(0, at.y - 10), width }}>{children}</div>;
}

// ---- A: biểu đồ to: cột từng ngày, trung bình 7 ngày, nét đứt cùng kỳ tháng trước, nền kỳ đang chọn ----
export function BigTrendChart({ data, series, metric, height = 260 }: { data: TrendReport; series: TrendSeries; metric: Metric; height?: number }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const seen = useInView(box);
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null);
  const values = series[metric];
  const from = values.length - TREND_WEEKS * 7;
  // Hôm nay chưa hết ngày: không đưa vào trung bình 7 ngày (đường sẽ chúc xuống giả).
  const partial = data.fullIndex < values.length - 1;
  const ma = movingAvg(partial ? values.slice(0, data.fullIndex + 1) : values).concat(partial ? Array(values.length - 1 - data.fullIndex).fill(null) : []);
  const shown = values.slice(from);
  const L = 52, R = 8, T = 14, B = 24, H = height;
  const max = niceMax(Math.max(1, ...shown, ...ma.slice(from).map((v) => v ?? 0), ...ma.slice(from - 28, values.length - 28).map((v) => v ?? 0)));
  // Thang chia cũng trượt khi đổi số (lưới và nhãn trục chạy theo), cột mọc từ đáy khi vào tầm nhìn, đường vẽ dần.
  const [maxT] = useTween([max], { grow: false });
  const N = shown.length;
  const step = W > 0 ? (W - L - R) / N : 0;
  const x = (k: number) => L + (k + 0.5) * step, y = (v: number) => T + (H - T - B) * (1 - v / (maxT ?? max));
  const bw = Math.max(1, step - (step > 6 ? 2 : 1));
  const line = (arr: (number | null)[]) => arr.map((v, k) => v === null ? null : `${x(k).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).map((p, k) => `${k ? 'L' : 'M'}${p}`).join(' ');
  const maShown = ma.slice(from), prevShown = shown.map((_, k) => ma[from + k - 28] ?? null);
  const bars = useTween(shown, { active: seen });
  const maT = useTween(maShown, { grow: false }), prevT = useTween(prevShown, { grow: false });
  const selFrom = data.days.indexOf(data.selected.start) - from, selTo = data.days.indexOf(data.selected.end) - from;
  const lastIdx = data.fullIndex - from;
  const lastMa = maShown[lastIdx];
  // Con trỏ dọc và hộp gợi ý trượt theo chuột; số to phía trên đổi theo ngày đang trỏ (không trỏ thì là ngày đủ gần nhất).
  const gx = useGlide(hover && step ? x(hover.i) : null);
  const at = hover?.i ?? lastIdx;
  const label = metric === 'net' ? netLabel(series) : unitLabel(series);
  return (
    <div ref={box} className="relative w-full" onPointerLeave={() => setHover(null)}>
      <div className="mb-1 flex flex-wrap items-end gap-x-4 gap-y-1" aria-live="polite">
        <div>
          <div className="text-[11px] font-medium text-ink-3">{label} · {dmy(data.days[from + at])}{partial && at === N - 1 ? ' (chưa hết ngày)' : ''}</div>
          <div className="num text-[26px] font-semibold leading-tight tracking-[-.02em] text-ink"><CountUp value={shown[at] ?? 0} format={(v) => fmtVal(v, metric)} /></div>
        </div>
        <div className="pb-1 text-[11.5px] text-ink-2">TB 7 ngày <b className="num text-ink">{maShown[at] === null || maShown[at] === undefined ? '—' : fmtVal(maShown[at]!, metric)}</b>
          {prevShown[at] !== null && prevShown[at] !== undefined && <> · cùng kỳ tháng trước <b className="num text-ink">{fmtVal(prevShown[at]!, metric)}</b></>}</div>
      </div>
      {W > 0 && (
        <svg width={W} height={H} aria-label={`${series.label}: ${label.toLowerCase()} từng ngày, 10 tuần`} className="block overflow-visible">
          {selFrom >= 0 && selTo >= selFrom && <rect x={x(Math.max(0, selFrom)) - step / 2} y={T} width={(selTo - Math.max(0, selFrom) + 1) * step} height={H - T - B} fill="var(--t-blue-bg)" rx={4} />}
          {[0, 1, 2, 3, 4].map((k) => { const v = max * k / 4; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-3 text-[10.5px]">{metric === 'net' ? short(v) : vi.format(v)}</text></g>; })}
          {bars.map((v, k) => {
            const h = Math.max((v ?? 0) > 0 ? 1.5 : 0, (H - T - B) * (v ?? 0) / (maxT ?? max));
            const isPartial = partial && k === N - 1;
            const on = hover?.i === k;
            return <rect key={k} x={x(k) - bw / 2} y={y(0) - h} width={bw} height={h} rx={Math.min(3, bw / 2)} fill={on ? 'var(--primary)' : 'var(--t-blue)'}
              style={{ transition: 'opacity .25s var(--ease), fill .25s var(--ease)' }} opacity={on ? 0.95 : hover ? 0.22 : isPartial ? 0.25 : 0.45} />;
          })}
          <path d={line(prevT)} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="5 4" className={seen ? 'chart-fade' : 'opacity-0'} />
          <path d={line(maT)} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" {...drawIn(seen, 250)} />
          {lastMa !== null && lastMa !== undefined && maT[lastIdx] !== null && <g className={seen ? 'chart-fade' : 'opacity-0'} style={{ animationDelay: '1.2s' }}>
            <circle cx={x(lastIdx)} cy={y(maT[lastIdx]!)} r={4.5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(lastIdx) - 8} y={y(maT[lastIdx]!) - 9} textAnchor="end" className="fill-ink text-[11px] font-semibold">TB 7 ngày {fmtVal(lastMa, metric)}</text>
          </g>}
          {Array.from({ length: TREND_WEEKS }, (_, w) => w * 7).filter((k) => step * 7 >= 44 || k % 14 === 0).map((k) => <text key={k} x={x(k)} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[10.5px]">{dmy(data.days[from + k])}</text>)}
          {gx !== null && <g pointerEvents="none">
            <line x1={gx} x2={gx} y1={T} y2={H - B} stroke="var(--ink-2)" strokeWidth={1} />
            {hover && maT[hover.i] !== null && <circle cx={gx} cy={y(maT[hover.i]!)} r={4} fill="var(--surface)" stroke="var(--primary)" strokeWidth={2} />}
          </g>}
          <rect x={L} y={T} width={Math.max(0, W - L - R)} height={H - T - B} fill="transparent" style={{ touchAction: 'pan-y' }}
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - r.left) / step))); setHover({ i, y: e.clientY - r.top + T }); }} />
        </svg>
      )}
      <FloatTip at={hover && gx !== null ? { x: gx, y: hover.y, w: W } : null}>
        {hover && <>
          <b>{dmy(data.days[from + hover.i])}{partial && hover.i === N - 1 ? ' (chưa hết ngày)' : ''}</b><br />
          {label}: {fmtVal(shown[hover.i], metric)}<br />
          TB 7 ngày: {maShown[hover.i] === null ? '—' : fmtVal(maShown[hover.i]!, metric)}<br />
          Cùng kỳ tháng trước: {prevShown[hover.i] === null ? '—' : fmtVal(prevShown[hover.i]!, metric)}
        </>}
      </FloatTip>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-t-blue opacity-50" />{label} từng ngày</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-3.5 rounded bg-primary" />Trung bình 7 ngày</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3.5 border-t-2 border-dashed border-ink-3" />Cùng kỳ tháng trước</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-t-blue-bg ring-1 ring-line" />Kỳ đang chọn</span>
      </div>
    </div>
  );
}
export function niceMax(m: number) { const p = Math.pow(10, Math.floor(Math.log10(m))); return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * p).find((v) => v >= m) ?? m; }

// ---- B: ô nhỏ ----
function MiniLine({ w, color }: { w: number[]; color: string }) {
  const W = 200, H = 40;
  const mx = Math.max(...w), mn = Math.min(...w);
  const px = (i: number) => 3 + i * (W - 6) / (w.length - 1), py = (v: number) => H - 4 - (H - 10) * (v - mn) / (mx - mn || 1);
  const d = w.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${px(w.length - 1)},${H} L${px(0)},${H} Z`} fill={color} fillOpacity={0.12} className={seen ? 'chart-fade' : 'opacity-0'} style={{ animationDelay: '.5s' }} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" {...drawIn(seen)} />
    </svg>
  );
}
function MiniTile({ s, data, metric, active, onClick }: { s: TrendSeries; data: TrendReport; metric: Metric; active: boolean; onClick: () => void }) {
  const w = weekly(s[metric], data.fullIndex);
  const c = weekChange(w);
  const ret = returnRate(s, data.fullIndex);
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      title={`${s.label}: 4 tuần gần nhất ${w.slice(-4).map((v) => fmtVal(v, metric)).join(' · ')}. Bấm để xem biểu đồ to.`}
      className={`min-w-0 cursor-pointer rounded-xl px-3 py-2 text-left transition-colors ${active ? 'bg-tint ring-2 ring-primary' : 'bg-surface-2 hover:bg-surface-3'}`}>
      <span className="block truncate text-[12px] text-ink-2">{s.label}</span>
      <span className="num block text-[17px] font-semibold leading-tight text-ink">{fmtVal(c.now, metric)}<span className="ml-1 text-[11px] font-normal text-ink-3">{isOrdersOnly(s) ? (metric === 'net' ? 'giá trị chuyển ' : 'đơn chuyển ') : ''}tuần này</span></span>
      <ChangeChip c={c} suffix="" />
      {ret && <span className="num mt-0.5 block text-[11px] text-ink-3">hoàn {pct1(ret.now)} · 4 tuần trước {pct1(ret.before)}</span>}
      <MiniLine w={w} color={DIR_COLOR[c.dir] === 'var(--ink-3)' ? 'var(--primary)' : DIR_COLOR[c.dir]} />
    </button>
  );
}

// ---- C: bảng màu theo tuần ----
function HeatTable({ data, list, metric, dim }: { data: TrendReport; list: TrendSeries[]; metric: Metric; dim: TrendDim }) {
  const rows = list.map((s) => ({ s, w: weekly(s[metric], data.fullIndex) }));
  const all = rows.flatMap((r) => r.w);
  const mx = Math.max(1, ...all), mn = Math.min(...all, 0);
  const STEPS = [10, 24, 40, 58, 76, 94];
  const step = (v: number) => Math.min(5, Math.floor((v - mn) / (mx - mn || 1) * 6));
  const weekStart = (w: number) => data.days[data.fullIndex - (TREND_WEEKS - 1 - w) * 7 - 6];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-[12px]">
        <thead><tr><th className="px-1 text-left font-medium text-ink-3">{TREND_DIMS[dim]}</th>{Array.from({ length: TREND_WEEKS }, (_, w) => <th key={w} className="px-1 text-center font-medium text-ink-3">{dmy(weekStart(w))}</th>)}</tr></thead>
        <tbody>
          {rows.map(({ s, w }) => (
            <tr key={s.key}>
              <td className="max-w-[220px] truncate pr-2 text-left text-ink-2" title={s.label}>{s.label}{isOrdersOnly(s) && metric === 'net' && <span className="text-[11px] text-ink-3"> · giá trị chuyển</span>}</td>
              {w.map((v, i) => { const k = step(v); return (
                <td key={i} title={`${s.label} · tuần từ ${dmy(weekStart(i))}: ${fmtVal(v, metric)}`} className="num h-7 rounded-[5px] text-center"
                  style={{ background: `color-mix(in srgb, var(--t-blue) ${STEPS[k]}%, var(--surface))`, color: k >= 4 ? 'var(--surface)' : 'var(--ink)' }}>
                  {metric === 'net' ? (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: v < 1e7 ? 1 : 0 }) : vi.format(v)}
                </td>
              ); })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
        <span>{metric === 'net' ? 'Số trong ô: triệu đồng mỗi tuần' : `Số trong ô: ${nLabel(dim).toLowerCase()} mỗi tuần`}</span>
        <span className="inline-flex items-center gap-0.5">thấp{STEPS.map((p) => <i key={p} className="inline-block size-3 rounded-sm" style={{ background: `color-mix(in srgb, var(--t-blue) ${p}%, var(--surface))` }} />)}cao</span>
      </p>
    </div>
  );
}

const TREND_STYLES = ['tiles', 'big', 'heat', 'period'] as const;
type TrendStyle = typeof TREND_STYLES[number];
const DIMS = ['dept', 'team', 'product'] as const;
const METRICS = ['net', 'n'] as const;

/** Thẻ Xu hướng: chọn kiểu ở đầu thẻ; `legacy` là biểu đồ cũ theo kỳ (kiểu "Theo kỳ"). */
export function TrendPanel({ data, error, onRetry, legacy, legacySubtitle }: { data: TrendsData | null; error: string | null; onRetry: () => void; legacy: ReactNode; legacySubtitle: string }) {
  const [style, setStyle] = usePref<TrendStyle>('thp_trend_style', 'tiles', TREND_STYLES);
  const [dim, setDim] = usePref<TrendDim>('thp_trend_dim', 'dept', DIMS);
  const [metric, setMetric] = usePref<Metric>('thp_trend_metric', 'net', METRICS);
  const [pick, setPick] = useState<string>('dept:company');
  const list = !data ? [] : dim === 'dept' ? data.depts : dim === 'team' ? data.teams : data.products;
  const selected = data ? [...data.depts, ...data.teams, ...data.products].find((s) => s.key === pick) ?? data.depts[0] : null;
  const vdNote = metric === 'net' && (style === 'heat' ? list.some(isOrdersOnly) : !!selected && isOrdersOnly(selected));
  const subtitle = style === 'period' ? legacySubtitle
    : style === 'heat' ? 'Mỗi hàng một dòng, mỗi cột một tuần, màu càng đậm số càng cao'
    : style === 'big' ? 'Cột từng ngày, đường đậm là trung bình 7 ngày, nét đứt là cùng kỳ tháng trước'
    : 'Tuần gần nhất so với trung bình 4 tuần trước. Bấm một ô để xem biểu đồ to';
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" aria-label="Xu hướng">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Xu hướng {style !== 'period' && <span className="text-[12px] font-normal text-ink-3">· 10 tuần</span>}</h2>
          <p className="text-[12px] text-ink-3">{subtitle}</p>
        </div>
        <SegmentedControl<TrendStyle> size="sm" ariaLabel="Kiểu xu hướng" value={style} onChange={setStyle}
          options={[{ value: 'tiles', label: 'Ô nhỏ' }, { value: 'big', label: 'Biểu đồ to' }, { value: 'heat', label: 'Bảng màu' }, { value: 'period', label: 'Theo kỳ' }]} />
      </header>
      {style === 'period' ? legacy : error && !data ? <ErrorBox error={error} onRetry={onRetry} /> : !data || !selected ? <Skeleton className="h-72 w-full" /> : <>
        <div className="flex flex-wrap items-center gap-2">
          {style === 'big'
            ? <SegmentedControl<string> size="sm" ariaLabel="Phạm vi" value={selected.dim === 'dept' ? selected.key : 'dept:company'} onChange={setPick}
                options={data.depts.map((s) => ({ value: s.key, label: s.label }))} />
            : <SegmentedControl<TrendDim> size="sm" ariaLabel="Xem theo" value={dim} onChange={setDim} options={DIMS.map((d) => ({ value: d, label: TREND_DIMS[d] }))} />}
          <SegmentedControl<Metric> size="sm" ariaLabel="Chỉ số" value={metric} onChange={setMetric}
            options={[{ value: 'net', label: 'Doanh thu' }, { value: 'n', label: dim === 'product' && style !== 'big' ? 'Số lượng' : 'Số đơn' }]} />
        </div>
        {vdNote && <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2">Vận đơn không trực tiếp bán hàng nên không tính doanh thu: số của Vận đơn là giá trị đơn chuyển, không cộng vào doanh thu cả công ty.</p>}
        {style === 'big' && <BigTrendChart data={data} series={selected.dim === 'dept' ? selected : data.depts[0]} metric={metric} />}
        {style === 'heat' && (list.length ? <HeatTable data={data} list={list} metric={metric} dim={dim} /> : <EmptyState text="Chưa có số trong 10 tuần." />)}
        {style === 'tiles' && <>
          <div className="rounded-xl border border-line p-3">
            <p className="mb-1 text-[12.5px] font-semibold text-ink">{selected.label}</p>
            <BigTrendChart data={data} series={selected} metric={metric} height={220} />
          </div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))]">
            {dim === 'dept' && <MiniTile s={data.depts[0]} data={data} metric={metric} active={pick === data.depts[0].key} onClick={() => setPick(data.depts[0].key)} />}
            {(dim === 'dept' ? list.slice(1) : list).map((s) => <MiniTile key={s.key} s={s} data={data} metric={metric} active={pick === s.key} onClick={() => setPick(s.key)} />)}
          </div>
          {!list.length && <EmptyState text="Chưa có số trong 10 tuần." />}
        </>}
      </>}
    </section>
  );
}

// ---- Trạng thái đơn ----
const STATUS_STYLES = ['funnel', 'days', 'stream', 'bar', 'donut'] as const;
type StatusStyle = typeof STATUS_STYLES[number];
const share = (n: number, total: number) => pct(total ? n / total * 100 : null);

function Funnel({ g, created }: { g: Groups; created: number }) {
  const closed = created - g.new.orders - g.cancelled.orders;
  const moving = g.shipping.orders + g.delivered.orders + g.returned.orders;
  const steps = [
    { label: 'Đơn tạo', n: created, color: 'var(--st-new)' },
    { label: 'Đã chốt', n: closed, color: 'var(--st-confirmed)', drop: `${vi.format(g.new.orders)} chưa chốt · ${vi.format(g.cancelled.orders)} hủy` },
    { label: 'Chuyển hàng', n: moving, color: 'var(--st-shipping)', drop: `${vi.format(g.confirmed.orders)} còn chờ / đã xác nhận` },
    { label: 'Giao thành công', n: g.delivered.orders, color: 'var(--st-delivered)', drop: `${vi.format(g.shipping.orders)} đang đóng gói, đang giao · ${vi.format(g.returned.orders)} hoàn` },
  ];
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} className="grid gap-1.5">
      {steps.map((s, i) => (
        <div key={s.label}>
          {s.drop && <p className="pl-[100px] text-[11px] text-ink-3">↓ rơi {s.drop}</p>}
          <div className="grid grid-cols-[92px_1fr_64px] items-center gap-2">
            <span className="text-[12.5px] text-ink-2">{s.label}</span>
            <span className="block h-6 rounded-md" style={{ width: seen ? `${Math.max(3, created ? s.n / created * 100 : 0)}%` : '0%', background: s.color, transition: `width .9s cubic-bezier(.16,1,.3,1) ${i * 90}ms` }} title={`${s.label}: ${vi.format(s.n)} đơn`} />
            <span className="num text-right text-[13px] font-semibold text-ink">{vi.format(s.n)}<span className="block text-[11px] font-normal text-ink-3">{share(s.n, created)}</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBar({ g, created }: { g: Groups; created: number }) {
  return <>
    <div className="chart-grow-x flex h-8 gap-0.5 overflow-hidden rounded-lg" aria-hidden="true">
      {GROUP_KEYS.filter((k) => g[k].orders > 0).map((k) => <span key={k} style={{ flex: g[k].orders, background: STATUS_VARS[k] }} title={`${STATUS_LABELS[k]}: ${vi.format(g[k].orders)} đơn (${share(g[k].orders, created)})`} />)}
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {GROUP_KEYS.map((k) => (
        <div key={k} className="rounded-lg bg-surface-2 px-2.5 py-2">
          <p className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-2"><i className="inline-block size-2 shrink-0 rounded-sm" style={{ background: STATUS_VARS[k] }} />{STATUS_LABELS[k].split(' (')[0]}</p>
          <p className="num text-[17px] font-semibold leading-tight text-ink"><CountUp value={g[k].orders} /></p>
          <p className="num truncate text-[11px] text-ink-3">{share(g[k].orders, created)}{g[k].net ? ` · ${short(g[k].net)} ₫` : ''}</p>
        </div>
      ))}
    </div>
  </>;
}

// Chữ trên đoạn cột: nền vàng / xám dùng chữ tối, còn lại chữ trắng (màu cố định, giống nhau ở chế độ sáng và tối).
const SEG_TEXT: Record<GroupKey, string> = { new: '#1b1f1d', confirmed: '#fff', shipping: '#1b1f1d', delivered: '#fff', returned: '#fff', cancelled: '#fff' };

/** Đơn tạo 14 ngày, mỗi cột chia theo trạng thái hiện tại. Bấm một đoạn mở danh sách đơn của ngày và trạng thái đó; bấm chỗ trống của cột mở cả ngày. */
function CohortBars({ cohort, onOpen }: { cohort: TrendReport['cohort']; onOpen?: (day: string, group?: GroupKey) => void }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; k?: GroupKey; x: number; y: number } | null>(null);
  const seen = useInView(box);
  const H = 340, L = 40, R = 8, T = 22, B = 26;
  const totals = cohort.map((c) => GROUP_KEYS.reduce((a, k) => a + c.groups[k], 0));
  const max = niceMax(Math.max(1, ...totals) * 1.06);
  const N = cohort.length, step = W > 0 ? (W - L - R) / N : 0, bw = Math.max(4, Math.min(64, step - Math.max(4, step * 0.22)));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const allDates = step >= 36;
  const move = (i: number, k?: GroupKey) => (e: PointerEvent<SVGElement>) => {
    const r = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    setHover({ i, k, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const click = (day: string, k?: GroupKey) => onOpen ? (e: MouseEvent) => { e.stopPropagation(); onOpen(day, k); } : undefined;
  return (
    <div ref={box} className="relative w-full" onPointerLeave={() => setHover(null)}>
      {W > 0 && (
        <svg width={W} height={H} aria-label="Đơn tạo mỗi ngày, chia theo trạng thái hiện tại" className="block overflow-visible">
          {[0, 1, 2, 3, 4].map((k) => { const v = max * k / 4; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-3 text-[10.5px]">{vi.format(v)}</text></g>; })}
          {cohort.map((c, i) => {
            let acc = 0;
            const x0 = L + i * step + (step - bw) / 2;
            const dim = hover && hover.i !== i;
            return (
              <g key={c.day} className={onOpen ? 'cursor-pointer' : undefined}>
                <g className={seen ? 'chart-rise' : 'opacity-0'} style={{ animationDelay: `${i * 35}ms` }}>
                <rect x={L + i * step} y={T} width={step} height={H - T - B} fill={hover?.i === i ? 'var(--surface-2)' : 'transparent'} onPointerMove={move(i)} onClick={click(c.day)} />
                {GROUP_KEYS.map((k) => {
                  const v = c.groups[k]; if (!v) return null;
                  const y1 = y(acc + v), h = Math.max(1, y(acc) - y(acc + v) - 2); acc += v;
                  const label = h >= 15 && bw >= 22;
                  return (
                    <g key={k} opacity={dim || (hover?.i === i && hover.k && hover.k !== k) ? 0.45 : 1} onPointerMove={move(i, k)} onClick={click(c.day, k)}>
                      <rect x={x0} y={y1} width={bw} height={h} rx={Math.min(3, h / 2)} fill={STATUS_VARS[k]} />
                      {label && <text x={x0 + bw / 2} y={y1 + h / 2 + 4} textAnchor="middle" fill={SEG_TEXT[k]} className="pointer-events-none text-[11px] font-semibold">{vi.format(v)}</text>}
                    </g>
                  );
                })}
                </g>
                {totals[i] > 0 && <text x={x0 + bw / 2} y={y(totals[i]) - 7} textAnchor="middle" className="pointer-events-none fill-ink text-[11.5px] font-semibold">{vi.format(totals[i])}</text>}
                {(allDates || i % 2 === (N - 1) % 2) && <text x={x0 + bw / 2} y={H - 8} textAnchor="middle" className="pointer-events-none fill-ink-3 text-[11px]">{dmy(c.day)}</text>}
              </g>
            );
          })}
        </svg>
      )}
      <FloatTip at={hover ? { x: hover.x, y: hover.y, w: W } : null}>
        {hover && <>
          <b>Đơn tạo {dmy(cohort[hover.i].day)}: {vi.format(totals[hover.i])}</b>
          {GROUP_KEYS.map((k) => <span key={k} className={`flex justify-between gap-2 ${hover.k === k ? 'font-semibold' : ''}`}><span>{STATUS_LABELS[k].split(' (')[0]}</span><span className="num">{vi.format(cohort[hover.i].groups[k])} · {share(cohort[hover.i].groups[k], totals[hover.i])}</span></span>)}
          {onOpen && <span className="mt-1 block opacity-80">Bấm để xem danh sách đơn{hover.k ? ` ${STATUS_LABELS[hover.k].split(' (')[0].toLowerCase()}` : ''}</span>}
        </>}
      </FloatTip>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
        {GROUP_KEYS.map((k) => <span key={k} className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: STATUS_VARS[k] }} />{STATUS_LABELS[k].split(' (')[0]}</span>)}
      </div>
    </div>
  );
}

/** Đường cong mềm (monotone, không vượt quá điểm) qua các điểm cách đều. */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length, dx = pts.map((p, i) => i < n - 1 ? pts[i + 1][0] - p[0] : 0), m = pts.map((p, i) => i < n - 1 ? (pts[i + 1][1] - p[1]) / dx[i] : 0);
  const t = pts.map((_, i) => i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`; }
  return d;
}

/** Kiểu "Dòng" (anh Vũ 08/10/2026, theo streamgraph trong video mẫu): đơn tạo 14 ngày xếp lớp theo trạng thái hiện tại, tên lớp nằm ngay chỗ dày nhất,
 *  rê chuột có con trỏ trượt và bảng số từng lớp; bấm mở Đơn nguồn đúng ngày (và trạng thái nếu đang trỏ vào lớp đó). */
function StatusStream({ cohort, onOpen }: { cohort: TrendReport['cohort']; onOpen?: (day: string, group?: GroupKey) => void }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const seen = useInView(box);
  const [hover, setHover] = useState<{ i: number; k?: GroupKey; y: number } | null>(null);
  const H = 300, L = 40, R = 12, T = 12, B = 26;
  const N = cohort.length;
  const totals = cohort.map((c) => GROUP_KEYS.reduce((a, k) => a + c.groups[k], 0));
  const flat = useTween(cohort.flatMap((c) => GROUP_KEYS.map((k) => c.groups[k])), { active: seen }).map((v) => v ?? 0);
  const val = (i: number, j: number) => flat[i * GROUP_KEYS.length + j] ?? 0;
  const max = niceMax(Math.max(1, ...totals) * 1.05);
  const x = (i: number) => N <= 1 ? L : L + i * (W - L - R) / (N - 1), y = (v: number) => T + (H - T - B) * (1 - v / max);
  // Lớp dưới cùng là Giao thành công, rồi Hoàn, Chuyển hàng, Đã chốt, Mới; Hủy nằm trên cùng.
  const order: GroupKey[] = ['delivered', 'returned', 'shipping', 'confirmed', 'new', 'cancelled'];
  const layers = order.map((k) => {
    const j = GROUP_KEYS.indexOf(k);
    const lo: number[] = [], hi: number[] = [];
    for (let i = 0; i < N; i++) { let below = 0; for (const k2 of order) { if (k2 === k) break; below += val(i, GROUP_KEYS.indexOf(k2)); } lo.push(below); hi.push(below + val(i, j)); }
    const top = smooth(hi.map((v, i) => [x(i), y(v)]));
    const bottom = smooth(lo.map((v, i) => [x(i), y(v)]).reverse() as [number, number][]).replace(/^M/, 'L');
    // Chỗ dày nhất để đặt tên lớp (chỉ khi đủ dày).
    let best = -1, bestH = 0; for (let i = 1; i < N - 1; i++) { const h = y(lo[i]) - y(hi[i]); if (h > bestH) { bestH = h; best = i; } }
    return { k, d: `${top} ${bottom} Z`, label: best >= 0 && bestH >= 18 ? { x: x(best), y: (y(lo[best]) + y(hi[best])) / 2 } : null };
  });
  const gx = useGlide(hover && W ? x(hover.i) : null);
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const k = ((e.target as Element).getAttribute('data-k') ?? undefined) as GroupKey | undefined;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(N - 1, Math.round((e.clientX - r.left - L) / ((W - L - R) / Math.max(1, N - 1)))));
    setHover({ i, k, y: e.clientY - r.top });
  };
  return (
    <div ref={box} className="relative w-full" onPointerLeave={() => setHover(null)}>
      {W > 0 && N > 1 && (
        <svg width={W} height={H} aria-label="Đơn tạo 14 ngày xếp lớp theo trạng thái hiện tại" className={`block overflow-visible ${onOpen ? 'cursor-pointer' : ''}`}
          onPointerMove={pick} onClick={onOpen && hover ? () => onOpen(cohort[hover.i].day, hover.k) : undefined}
          role="slider" tabIndex={0} aria-valuemin={0} aria-valuemax={N - 1} aria-valuenow={hover?.i ?? N - 1}
          aria-valuetext={`${dmy(cohort[hover?.i ?? N - 1].day)}: ${vi.format(totals[hover?.i ?? N - 1])} đơn tạo`}
          onKeyDown={(e) => {
            const i = hover?.i ?? N - 1;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setHover({ i: Math.max(0, Math.min(N - 1, i + (e.key === 'ArrowLeft' ? -1 : 1))), y: 40 }); }
            else if (e.key === 'Escape') setHover(null);
            else if (e.key === 'Enter' && onOpen) onOpen(cohort[i].day);
          }}>
          <defs><clipPath id="stream-reveal"><rect x={0} y={0} height={H} width={seen ? W : 0} style={{ transition: 'width 1.1s cubic-bezier(.65,0,.35,1)' }} /></clipPath></defs>
          {[0, 1, 2, 3, 4].map((k) => { const v = max * k / 4; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-3 text-[10.5px]">{vi.format(v)}</text></g>; })}
          <g clipPath="url(#stream-reveal)">
            {layers.map((l) => (
              <path key={l.k} d={l.d} fill={STATUS_VARS[l.k]} fillOpacity={hover?.k && hover.k !== l.k ? 0.35 : 0.88} stroke="var(--surface)" strokeWidth={1.5}
                style={{ transition: 'fill-opacity .25s var(--ease)' }} data-k={l.k} />
            ))}
            {layers.map((l) => l.label && <text key={`t${l.k}`} x={l.label.x} y={l.label.y + 4} textAnchor="middle" fill={SEG_TEXT[l.k]} className="pointer-events-none text-[11px] font-semibold">{STATUS_LABELS[l.k].split(' (')[0]}</text>)}
          </g>
          {cohort.map((c, i) => (i % 2 === (N - 1) % 2) && <text key={c.day} x={x(i)} y={H - 8} textAnchor="middle" className="pointer-events-none fill-ink-3 text-[11px]">{dmy(c.day)}</text>)}
          {gx !== null && <line x1={gx} x2={gx} y1={T} y2={H - B} stroke="var(--ink)" strokeOpacity={0.55} pointerEvents="none" />}
        </svg>
      )}
      <FloatTip width={232} at={hover && gx !== null ? { x: gx, y: hover.y, w: W } : null}>
        {hover && <>
          <b>Đơn tạo {dmy(cohort[hover.i].day)}: {vi.format(totals[hover.i])}</b>
          {GROUP_KEYS.map((k) => <span key={k} className={`flex items-center justify-between gap-2 ${hover.k === k ? 'font-semibold' : ''}`}><span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-sm" style={{ background: STATUS_VARS[k] }} />{STATUS_LABELS[k].split(' (')[0]}</span><span className="num">{vi.format(cohort[hover.i].groups[k])} · {share(cohort[hover.i].groups[k], totals[hover.i])}</span></span>)}
          {onOpen && <span className="mt-1 block opacity-80">Bấm để xem danh sách đơn</span>}
        </>}
      </FloatTip>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
        {GROUP_KEYS.map((k) => <span key={k} className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: STATUS_VARS[k] }} />{STATUS_LABELS[k].split(' (')[0]}</span>)}
      </div>
    </div>
  );
}

/** Kiểu đang chọn của thẻ Trạng thái đơn (Tổng quan POS dùng để cho thẻ rộng cả hàng khi xem Theo ngày). */
export const useStatusStyle = () => usePref<StatusStyle>('thp_status_style', 'funnel', STATUS_STYLES);

/** Thẻ Trạng thái đơn: số theo kỳ (groups, created) cho phễu / thanh; `cohort` 14 ngày từ xu hướng; `legacy` là biểu đồ tròn cũ. */
export function StatusPanel({ groups, created, cohort, legacy, onOpenDay }: { groups: Groups; created: number; cohort: TrendReport['cohort'] | null; legacy: ReactNode; onOpenDay?: (day: string, group?: GroupKey) => void }) {
  const [style, setStyle] = useStatusStyle();
  const subtitle = style === 'stream' ? `Đơn tạo 14 ngày gần nhất xếp lớp theo trạng thái hiện tại${onOpenDay ? '. Bấm vào lớp để xem danh sách đơn' : ''}` : style === 'days' ? `Đơn tạo 14 ngày gần nhất, chia theo trạng thái hiện tại. Ngày cũ còn nhiều đơn chưa xong là có đơn kẹt${onOpenDay ? '. Bấm một đoạn để xem danh sách đơn' : ''}`
    : style === 'funnel' ? 'Đơn tạo trong kỳ đi qua từng bước, mỗi bước rơi bao nhiêu' : 'Đơn tạo trong kỳ';
  return (
    <section className="card flex min-w-0 flex-col gap-3 self-start p-4" aria-label="Trạng thái đơn">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="text-base font-semibold text-ink">Trạng thái đơn</h2><p className="text-[12px] text-ink-3">{subtitle}</p></div>
        <SegmentedControl<StatusStyle> size="sm" ariaLabel="Kiểu trạng thái đơn" value={style} onChange={setStyle}
          options={[{ value: 'funnel', label: 'Phễu' }, { value: 'days', label: 'Theo ngày' }, { value: 'stream', label: 'Dòng' }, { value: 'bar', label: 'Một thanh' }, { value: 'donut', label: 'Tròn' }]} />
      </header>
      {style === 'funnel' && <Funnel g={groups} created={created} />}
      {style === 'bar' && <StatusBar g={groups} created={created} />}
      {style === 'donut' && legacy}
      {style === 'days' && (cohort ? <CohortBars cohort={cohort} onOpen={onOpenDay} /> : <Skeleton className="h-80 w-full" />)}
      {style === 'stream' && (cohort ? <StatusStream cohort={cohort} onOpen={onOpenDay} /> : <Skeleton className="h-72 w-full" />)}
    </section>
  );
}

// ---- Xu hướng từng bộ phận: ô biểu đồ + một câu AI (anh Vũ 08/10/2026: "muốn xem bằng biểu đồ, chữ ít ai đọc lắm") ----
type NoteDept = Exclude<DeptKey, 'company'>;
type NotesResponse = {
  date: string; source?: 'ai' | 'rule'; notes?: Partial<Record<NoteDept, string[]>>; changes?: Partial<Record<NoteDept, { pct: number | null; dir: Change['dir'] }>>;
  charts?: Partial<Record<NoteDept, DeptChart>>; weekEnd?: string; at: string; error?: string;
};
const NOTE_DEPTS: NoteDept[] = ['sale', 'cskh', 'mkt', 'vandon'];
const chartVal = (v: number, unit: DeptChart['unit']) => unit === 'money' ? `${short(v)} ₫` : `${vi.format(v)} đơn`;

/** Đường 10 tuần có chấm tuần gần nhất. */
function WeekLine({ weeks, color, unit }: { weeks: number[]; color: string; unit: DeptChart['unit'] }) {
  const W = 240, H = 56;
  const mx = Math.max(...weeks), mn = Math.min(...weeks, mx * 0.6);
  const px = (i: number) => 4 + i * (W - 8) / Math.max(1, weeks.length - 1), py = (v: number) => H - 5 - (H - 12) * (v - mn) / (mx - mn || 1);
  const d = weeks.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const last = weeks.length - 1;
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref);
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-14 w-full" preserveAspectRatio="none" aria-label={`10 tuần: ${weeks.map((v) => chartVal(v, unit)).join(', ')}`}>
      <path d={`${d} L${px(last)},${H} L${px(0)},${H} Z`} fill={color} fillOpacity={0.12} className={seen ? 'chart-fade' : 'opacity-0'} style={{ animationDelay: '.5s' }} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" {...drawIn(seen)} />
      {/* Chấm cuối vẽ bằng nét dài 0, đầu tròn, không co giãn: hình tròn thật dù khung bị kéo giãn ngang. */}
      <g className={seen ? 'chart-pop' : 'opacity-0'}>
        <path d={`M${px(last)},${py(weeks[last])}h0`} stroke="var(--surface)" strokeWidth={10} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={`M${px(last)},${py(weeks[last])}h0`} stroke={color} strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/** Thanh hai phía: team / sản phẩm kéo lên (phải, xanh) và kéo xuống (trái, đỏ). */
function Movers({ movers, of }: { movers: DeptChart['movers']; of: DeptChart['moversOf'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  if (!movers.length) return null;
  const m = Math.max(10, ...movers.map((x) => Math.min(100, Math.abs(x.pct))));
  return (
    <div ref={ref} className="grid gap-1" aria-label={`${of === 'team' ? 'Team' : 'Sản phẩm'} tăng giảm nhiều nhất so với 4 tuần trước`}>
      {movers.map((x, i) => {
        const w = Math.min(100, Math.abs(x.pct)) / m * 50;
        const up = x.pct >= 0;
        return (
          <div key={x.label} className="grid grid-cols-[minmax(0,1fr)_76px_40px] items-center gap-1.5 text-[11.5px]" title={`${x.label}: ${x.pct > 0 ? '+' : ''}${x.pct}% so với trung bình 4 tuần trước`}>
            <span className="truncate text-ink-2">{x.label}</span>
            <span className="relative h-2.5 rounded-sm bg-surface-2">
              <i className="absolute inset-y-0 left-1/2 w-px bg-line-3" />
              <i className="absolute inset-y-0 rounded-sm" style={{ width: seen ? `${Math.max(2, w)}%` : '0%', [up ? 'left' : 'right']: '50%', background: up ? 'var(--good)' : 'var(--bad)', transition: `width .8s cubic-bezier(.16,1,.3,1) ${300 + i * 80}ms` }} />
            </span>
            <span className="num text-right font-semibold text-ink">{x.pct > 0 ? '+' : ''}{x.pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function DeptTile({ d, chart, note, one, onOpen }: { d: NoteDept; chart: DeptChart; note?: string; one: boolean; onOpen?: () => void }) {
  const r = chart.returns;
  const retUp = r?.now != null && r.before != null && r.now > r.before + 0.5;
  const color = chart.dir === 'up' ? 'var(--good)' : chart.dir === 'down' ? 'var(--bad)' : 'var(--primary)';
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line px-3 py-2.5 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-raise">
      <p className="flex items-center justify-between gap-2">
        {onOpen ? <button type="button" onClick={onOpen} className="cursor-pointer text-[13.5px] font-semibold text-ink hover:text-primary hover:underline" title={`Mở trang ${DEPT_LABELS[d]}`}>{DEPT_LABELS[d]} →</button>
          : <span className="text-[13.5px] font-semibold text-ink">{one ? `Xu hướng ${DEPT_LABELS[d]}` : DEPT_LABELS[d]}</span>}
        <ChangeChip c={chart} suffix="" />
      </p>
      <p className="num text-[20px] font-semibold leading-none text-ink"><CountUp value={chart.now} format={(v) => chartVal(Math.round(v), chart.unit)} /><span className="ml-1.5 text-[11.5px] font-normal text-ink-3">{chart.unit === 'orders' ? 'đi tuần này' : 'tuần này'}</span></p>
      <WeekLine weeks={chart.weeks} color={color} unit={chart.unit} />
      {r && (
        <p className="num flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-2">
          <span className={`rounded-full px-2 py-px font-semibold ${retUp ? 'bg-bad-bg text-bad' : 'bg-surface-3 text-ink-2'}`}>Hoàn {pct1(r.now)}</span>
          <span className="text-ink-3">4 tuần trước {pct1(r.before)}</span>
        </p>
      )}
      <Movers movers={chart.movers} of={chart.moversOf} />
      {note && <p className="line-clamp-2 text-[12px] leading-snug text-ink-2" title={note}>{note}</p>}
    </div>
  );
}

/** Xu hướng từng bộ phận mỗi sáng. Mặc định cả 4 bộ phận (đầu Tổng quan POS); một bộ phận = đầu trang bộ phận đó. `onOpen` = bấm tên bộ phận mở trang của bộ phận. */
export function TrendNotes({ depts = NOTE_DEPTS, canRewrite = false, className = '', onOpen }: { depts?: NoteDept[]; canRewrite?: boolean; className?: string; onOpen?: (d: NoteDept) => void }) {
  const { data, error, reload } = useApi<NotesResponse>('/api/ai/trends', { refreshMs: 30 * 60000, keep: false });
  const [busy, setBusy] = useState(false);
  const shown = depts.filter((d) => data?.charts?.[d]);
  if (error && !data) return null;
  if (!data) return <Skeleton className={`h-44 w-full ${className}`} />;
  if (!shown.length) return null;
  const rewrite = async () => {
    setBusy(true);
    try { const r = await fetch('/api/ai/trends', { method: 'POST' }); if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Lỗi'); reload(); toast('Đã viết lại nhận xét'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Không viết lại được', { kind: 'error' }); }
    finally { setBusy(false); }
  };
  const one = shown.length === 1;
  return (
    <section className={`card p-3 ${className}`} aria-label="Xu hướng từng bộ phận">
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
        {!one && <span className="font-semibold text-ink">Xu hướng từng bộ phận</span>}
        <span>Cả công ty, tuần đến {data.weekEnd ? dmy(data.weekEnd) : '—'} so với trung bình 4 tuần trước</span>
        <span className="inline-flex items-center gap-1">· {data.source === 'ai' ? <><Sparkles size={12} aria-hidden="true" className="text-primary" />câu nhận xét do AI viết lúc {timeOnly(data.at)}</> : <><Bot size={12} aria-hidden="true" />câu nhận xét tự tính từ số</>}</span>
        {canRewrite && <button type="button" className={`btn sm ml-auto ${busy ? 'is-busy' : ''}`} onClick={rewrite} disabled={busy} title={data.error ?? undefined}><RotateCw size={12} />{busy ? 'Đang viết…' : 'Viết lại'}</button>}
      </header>
      <div className={`stagger grid gap-2 ${one ? 'sm:max-w-md' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        {shown.map((d) => <DeptTile key={d} d={d} chart={data.charts![d]!} note={data.notes?.[d]?.[0]} one={one} onOpen={onOpen ? () => onOpen(d) : undefined} />)}
      </div>
    </section>
  );
}

/** Lấy xu hướng theo bộ lọc đang chọn (một lần cho cả hai thẻ). */
export function useTrends(start: string, end: string, posIds: string[], productSegment: string) {
  const params = new URLSearchParams({ start, end, posIds: posIds.join(','), productSegment });
  return useApi<TrendsData>(`/api/reports/trends?${params}`, { refreshMs: 10 * 60000, keep: false });
}

