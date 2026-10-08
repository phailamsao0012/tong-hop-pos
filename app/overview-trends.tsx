'use client';

// Xu hướng và Trạng thái đơn kiểu mới (anh Vũ 08/10/2026, xem mẫu rồi trả lời "chọn cả, gì cũng muốn chọn"): mỗi thẻ có nút chọn kiểu, nhớ theo máy.
// Xu hướng: Ô nhỏ (mặc định, bấm ô mở biểu đồ to), Biểu đồ to, Bảng màu theo tuần, hoặc Theo kỳ (biểu đồ cũ). Luôn đủ 10 tuần, kỳ đang chọn tô nền.
// Trạng thái đơn: Phễu (mặc định), Theo ngày tạo, Một thanh + 6 ô, hoặc Tròn (cũ). Nhận xét AI theo bộ phận: TrendNotes.
// Số: /api/reports/trends (lib/trends.ts), /api/ai/trends (lib/ai-trends.ts).
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Bot, RotateCw, Sparkles } from 'lucide-react';
import { DEPT_LABELS, TREND_DIMS, TREND_WEEKS, movingAvg, weekChange, weekly, type Change, type DeptKey, type TrendDim, type TrendReport, type TrendSeries } from '@/lib/trends';
import type { GroupKey } from '@/lib/stats';
import { useApi } from './use-api';
import { EmptyState, ErrorBox, STATUS_LABELS, STATUS_VARS, SegmentedControl, Skeleton, dmy, pct, short, timeOnly, toast, vi } from './ui-kit';

export type TrendsData = TrendReport & { definitions: Record<string, string> };
type Metric = 'net' | 'n';
type Groups = Record<GroupKey, { orders: number; net: number }>;
const GROUP_KEYS: GroupKey[] = ['new', 'confirmed', 'shipping', 'delivered', 'returned', 'cancelled'];

// ---- lựa chọn kiểu, nhớ theo máy (localStorage) ----
const prefEvent = 'thp-pref';
function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const read = () => { try { const v = localStorage.getItem(key) as T | null; return v && allowed.includes(v) ? v : initial; } catch { return initial; } };
  const value = useSyncExternalStore((cb) => { window.addEventListener(prefEvent, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(prefEvent, cb); window.removeEventListener('storage', cb); }; }, read, () => initial);
  const set = (v: T) => { try { localStorage.setItem(key, v); } catch { /* bỏ qua */ } window.dispatchEvent(new Event(prefEvent)); };
  return [value, set];
}

/** Bề rộng thật của khung (để chữ trên biểu đồ SVG không bị co nhỏ). */
function useWidth<T extends HTMLElement>() {
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
const DIR_CLS = { up: 'bg-good-bg text-good', down: 'bg-bad-bg text-bad', flat: 'bg-surface-3 text-ink-2' } as const;
const DIR_COLOR = { up: 'var(--good)', down: 'var(--bad)', flat: 'var(--ink-3)' } as const;
function ChangeChip({ c, suffix = ' so 4 tuần trước' }: { c: Pick<Change, 'pct' | 'dir'>; suffix?: string }) {
  const arrow = c.dir === 'up' ? '▲' : c.dir === 'down' ? '▼' : '■';
  return <span className={`num inline-flex w-fit items-center gap-1 rounded-full px-2 py-px text-[11px] font-semibold ${DIR_CLS[c.dir]}`}>{arrow} {c.pct === null ? 'mới có số' : `${c.pct > 0 ? '+' : ''}${Math.round(c.pct)}%`}{suffix}</span>;
}

/** Hộp gợi ý nổi theo con trỏ trong khung biểu đồ. */
function FloatTip({ at, children }: { at: { x: number; y: number; w: number } | null; children: ReactNode }) {
  if (!at) return null;
  const left = Math.max(4, Math.min(at.x + 12, at.w - 200));
  return <div aria-hidden="true" className="pointer-events-none absolute z-10 w-[190px] rounded-lg bg-ink px-2.5 py-1.5 text-[11.5px] leading-snug text-surface shadow-float" style={{ left, top: Math.max(0, at.y - 10) }}>{children}</div>;
}

// ---- A: biểu đồ to: cột từng ngày, trung bình 7 ngày, nét đứt cùng kỳ tháng trước, nền kỳ đang chọn ----
export function BigTrendChart({ data, series, metric, height = 260 }: { data: TrendReport; series: TrendSeries; metric: Metric; height?: number }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const values = series[metric];
  const from = values.length - TREND_WEEKS * 7;
  // Hôm nay chưa hết ngày: không đưa vào trung bình 7 ngày (đường sẽ chúc xuống giả).
  const partial = data.fullIndex < values.length - 1;
  const ma = movingAvg(partial ? values.slice(0, data.fullIndex + 1) : values).concat(partial ? Array(values.length - 1 - data.fullIndex).fill(null) : []);
  const shown = values.slice(from);
  const L = 52, R = 8, T = 14, B = 24, H = height;
  const max = niceMax(Math.max(1, ...shown, ...ma.slice(from).map((v) => v ?? 0), ...ma.slice(from - 28, values.length - 28).map((v) => v ?? 0)));
  const N = shown.length;
  const step = W > 0 ? (W - L - R) / N : 0;
  const x = (k: number) => L + (k + 0.5) * step, y = (v: number) => T + (H - T - B) * (1 - v / max);
  const bw = Math.max(1, step - (step > 6 ? 2 : 1));
  const line = (arr: (number | null)[]) => arr.map((v, k) => v === null ? null : `${x(k).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).map((p, k) => `${k ? 'L' : 'M'}${p}`).join(' ');
  const maShown = ma.slice(from), prevShown = shown.map((_, k) => ma[from + k - 28] ?? null);
  const selFrom = data.days.indexOf(data.selected.start) - from, selTo = data.days.indexOf(data.selected.end) - from;
  const lastMa = maShown[data.fullIndex - from];
  return (
    <div ref={box} className="relative w-full" onPointerLeave={() => setHover(null)}>
      {W > 0 && (
        <svg width={W} height={H} aria-label={`${series.label}: ${metric === 'net' ? 'doanh thu' : nLabel(series.dim).toLowerCase()} từng ngày, 10 tuần`} className="block overflow-visible">
          {selFrom >= 0 && selTo >= selFrom && <rect x={x(Math.max(0, selFrom)) - step / 2} y={T} width={(selTo - Math.max(0, selFrom) + 1) * step} height={H - T - B} fill="var(--t-blue-bg)" rx={4} />}
          {[0, 1, 2, 3, 4].map((k) => { const v = max * k / 4; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-3 text-[10.5px]">{metric === 'net' ? short(v) : vi.format(v)}</text></g>; })}
          {shown.map((v, k) => {
            const h = Math.max(v > 0 ? 1.5 : 0, (H - T - B) * v / max);
            const isPartial = partial && k === N - 1;
            return <rect key={k} x={x(k) - bw / 2} y={y(0) - h} width={bw} height={h} rx={Math.min(3, bw / 2)} fill="var(--t-blue)" opacity={hover?.i === k ? 0.85 : isPartial ? 0.25 : 0.45} />;
          })}
          <path d={line(prevShown)} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="5 4" />
          <path d={line(maShown)} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {lastMa !== null && lastMa !== undefined && <>
            <circle cx={x(data.fullIndex - from)} cy={y(lastMa)} r={4.5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(data.fullIndex - from) - 8} y={y(lastMa) - 9} textAnchor="end" className="fill-ink text-[11px] font-semibold">TB 7 ngày {fmtVal(lastMa, metric)}</text>
          </>}
          {Array.from({ length: TREND_WEEKS }, (_, w) => w * 7).filter((k) => step * 7 >= 44 || k % 14 === 0).map((k) => <text key={k} x={x(k)} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[10.5px]">{dmy(data.days[from + k])}</text>)}
          {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={T} y2={H - B} stroke="var(--ink-3)" />}
          <rect x={L} y={T} width={Math.max(0, W - L - R)} height={H - T - B} fill="transparent"
            onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - r.left) / step))); setHover({ i, x: e.clientX - r.left + L, y: e.clientY - r.top + T }); }} />
        </svg>
      )}
      <FloatTip at={hover ? { x: hover.x, y: hover.y, w: W } : null}>
        {hover && <>
          <b>{dmy(data.days[from + hover.i])}{partial && hover.i === N - 1 ? ' (chưa hết ngày)' : ''}</b><br />
          {metric === 'net' ? 'Doanh thu' : nLabel(series.dim)}: {fmtVal(shown[hover.i], metric)}<br />
          TB 7 ngày: {maShown[hover.i] === null ? '—' : fmtVal(maShown[hover.i]!, metric)}<br />
          Cùng kỳ tháng trước: {prevShown[hover.i] === null ? '—' : fmtVal(prevShown[hover.i]!, metric)}
        </>}
      </FloatTip>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-t-blue opacity-50" />{metric === 'net' ? 'Doanh thu' : nLabel(series.dim)} từng ngày</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-3.5 rounded bg-primary" />Trung bình 7 ngày</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3.5 border-t-2 border-dashed border-ink-3" />Cùng kỳ tháng trước</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-t-blue-bg ring-1 ring-line" />Kỳ đang chọn</span>
      </div>
    </div>
  );
}
function niceMax(m: number) { const p = Math.pow(10, Math.floor(Math.log10(m))); return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * p).find((v) => v >= m) ?? m; }

// ---- B: ô nhỏ ----
function MiniLine({ w, color }: { w: number[]; color: string }) {
  const W = 200, H = 40;
  const mx = Math.max(...w), mn = Math.min(...w);
  const px = (i: number) => 3 + i * (W - 6) / (w.length - 1), py = (v: number) => H - 4 - (H - 10) * (v - mn) / (mx - mn || 1);
  const d = w.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${px(w.length - 1)},${H} L${px(0)},${H} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function MiniTile({ s, data, metric, active, onClick }: { s: TrendSeries; data: TrendReport; metric: Metric; active: boolean; onClick: () => void }) {
  const w = weekly(s[metric], data.fullIndex);
  const c = weekChange(w);
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      title={`${s.label}: 4 tuần gần nhất ${w.slice(-4).map((v) => fmtVal(v, metric)).join(' · ')}. Bấm để xem biểu đồ to.`}
      className={`min-w-0 cursor-pointer rounded-xl px-3 py-2 text-left transition-colors ${active ? 'bg-tint ring-2 ring-primary' : 'bg-surface-2 hover:bg-surface-3'}`}>
      <span className="block truncate text-[12px] text-ink-2">{s.label}</span>
      <span className="num block text-[17px] font-semibold leading-tight text-ink">{fmtVal(c.now, metric)}<span className="ml-1 text-[11px] font-normal text-ink-3">tuần này</span></span>
      <ChangeChip c={c} suffix="" />
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
              <td className="max-w-[220px] truncate pr-2 text-left text-ink-2" title={s.label}>{s.label}</td>
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
const STATUS_STYLES = ['funnel', 'days', 'bar', 'donut'] as const;
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
  return (
    <div className="grid gap-1.5">
      {steps.map((s) => (
        <div key={s.label}>
          {s.drop && <p className="pl-[100px] text-[11px] text-ink-3">↓ rơi {s.drop}</p>}
          <div className="grid grid-cols-[92px_1fr_64px] items-center gap-2">
            <span className="text-[12.5px] text-ink-2">{s.label}</span>
            <span className="block h-6 rounded-md" style={{ width: `${Math.max(3, created ? s.n / created * 100 : 0)}%`, background: s.color }} title={`${s.label}: ${vi.format(s.n)} đơn`} />
            <span className="num text-right text-[13px] font-semibold text-ink">{vi.format(s.n)}<span className="block text-[11px] font-normal text-ink-3">{share(s.n, created)}</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBar({ g, created }: { g: Groups; created: number }) {
  return <>
    <div className="flex h-8 gap-0.5 overflow-hidden rounded-lg" aria-hidden="true">
      {GROUP_KEYS.filter((k) => g[k].orders > 0).map((k) => <span key={k} style={{ flex: g[k].orders, background: STATUS_VARS[k] }} title={`${STATUS_LABELS[k]}: ${vi.format(g[k].orders)} đơn (${share(g[k].orders, created)})`} />)}
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {GROUP_KEYS.map((k) => (
        <div key={k} className="rounded-lg bg-surface-2 px-2.5 py-2">
          <p className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-2"><i className="inline-block size-2 shrink-0 rounded-sm" style={{ background: STATUS_VARS[k] }} />{STATUS_LABELS[k].split(' (')[0]}</p>
          <p className="num text-[17px] font-semibold leading-tight text-ink">{vi.format(g[k].orders)}</p>
          <p className="num truncate text-[11px] text-ink-3">{share(g[k].orders, created)}{g[k].net ? ` · ${short(g[k].net)} ₫` : ''}</p>
        </div>
      ))}
    </div>
  </>;
}

function CohortBars({ cohort }: { cohort: TrendReport['cohort'] }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const H = 220, L = 34, R = 14, T = 8, B = 22;
  const totals = cohort.map((c) => GROUP_KEYS.reduce((a, k) => a + c.groups[k], 0));
  const max = niceMax(Math.max(1, ...totals));
  const N = cohort.length, step = W > 0 ? (W - L - R) / N : 0, bw = Math.max(2, step - 4);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <div ref={box} className="relative w-full" onPointerLeave={() => setHover(null)}>
      {W > 0 && (
        <svg width={W} height={H} aria-label="Đơn tạo mỗi ngày, chia theo trạng thái hiện tại" className="block overflow-visible">
          {[0, 1, 2, 3, 4].map((k) => { const v = max * k / 4; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" /><text x={L - 4} y={y(v) + 4} textAnchor="end" className="fill-ink-3 text-[10px]">{vi.format(v)}</text></g>; })}
          {cohort.map((c, i) => {
            let acc = 0;
            const x0 = L + i * step + (step - bw) / 2;
            return (
              <g key={c.day} opacity={hover && hover.i !== i ? 0.55 : 1}>
                {GROUP_KEYS.map((k) => { const v = c.groups[k]; if (!v) return null; const y1 = y(acc + v), h = Math.max(1, y(acc) - y(acc + v) - 1); acc += v; return <rect key={k} x={x0} y={y1} width={bw} height={h} rx={1.5} fill={STATUS_VARS[k]} />; })}
                {(N <= 8 || i % 2 === (N - 1) % 2) && <text x={x0 + bw / 2} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[10px]">{dmy(c.day)}</text>}
                <rect x={L + i * step} y={T} width={step} height={H - T - B} fill="transparent" onPointerMove={(e) => { const r = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect(); setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top }); }} />
              </g>
            );
          })}
        </svg>
      )}
      <FloatTip at={hover ? { x: hover.x, y: hover.y, w: W } : null}>
        {hover && <><b>Đơn tạo {dmy(cohort[hover.i].day)}: {vi.format(totals[hover.i])}</b>{GROUP_KEYS.map((k) => <span key={k} className="block">{STATUS_LABELS[k].split(' (')[0]}: {vi.format(cohort[hover.i].groups[k])}</span>)}</>}
      </FloatTip>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
        {GROUP_KEYS.map((k) => <span key={k} className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: STATUS_VARS[k] }} />{STATUS_LABELS[k].split(' (')[0]}</span>)}
      </div>
    </div>
  );
}

/** Thẻ Trạng thái đơn: số theo kỳ (groups, created) cho phễu / thanh; `cohort` 14 ngày từ xu hướng; `legacy` là biểu đồ tròn cũ. */
export function StatusPanel({ groups, created, cohort, legacy }: { groups: Groups; created: number; cohort: TrendReport['cohort'] | null; legacy: ReactNode }) {
  const [style, setStyle] = usePref<StatusStyle>('thp_status_style', 'funnel', STATUS_STYLES);
  const subtitle = style === 'days' ? 'Đơn tạo 14 ngày gần nhất, chia theo trạng thái hiện tại. Ngày cũ còn nhiều đơn chưa xong là có đơn kẹt'
    : style === 'funnel' ? 'Đơn tạo trong kỳ đi qua từng bước, mỗi bước rơi bao nhiêu' : 'Đơn tạo trong kỳ';
  return (
    <section className="card flex min-w-0 flex-col gap-3 self-start p-4" aria-label="Trạng thái đơn">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="text-base font-semibold text-ink">Trạng thái đơn</h2><p className="text-[12px] text-ink-3">{subtitle}</p></div>
        <SegmentedControl<StatusStyle> size="sm" ariaLabel="Kiểu trạng thái đơn" value={style} onChange={setStyle}
          options={[{ value: 'funnel', label: 'Phễu' }, { value: 'days', label: 'Theo ngày' }, { value: 'bar', label: 'Một thanh' }, { value: 'donut', label: 'Tròn' }]} />
      </header>
      {style === 'funnel' && <Funnel g={groups} created={created} />}
      {style === 'bar' && <StatusBar g={groups} created={created} />}
      {style === 'donut' && legacy}
      {style === 'days' && (cohort ? <CohortBars cohort={cohort} /> : <Skeleton className="h-56 w-full" />)}
    </section>
  );
}

// ---- Nhận xét AI theo bộ phận ----
type NoteDept = Exclude<DeptKey, 'company'>;
type NotesResponse = { date: string; source?: 'ai' | 'rule'; notes?: Partial<Record<NoteDept, string[]>>; changes?: Partial<Record<NoteDept, { pct: number | null; dir: Change['dir'] }>>; weekEnd?: string; at: string; error?: string };
const NOTE_DEPTS: NoteDept[] = ['sale', 'cskh', 'mkt', 'vandon'];

/** Nhận xét xu hướng mỗi sáng. `depts` rỗng = cả 4 bộ phận (đầu Tổng quan POS); một bộ phận = đầu trang bộ phận đó. */
export function TrendNotes({ depts = NOTE_DEPTS, canRewrite = false, className = '' }: { depts?: NoteDept[]; canRewrite?: boolean; className?: string }) {
  const { data, error, reload } = useApi<NotesResponse>('/api/ai/trends', { refreshMs: 30 * 60000, keep: false });
  const [busy, setBusy] = useState(false);
  const shown = depts.filter((d) => data?.notes?.[d]?.length);
  if (error && !data) return null;
  if (!data) return <Skeleton className={`h-20 w-full ${className}`} />;
  if (!shown.length) return null;
  const rewrite = async () => {
    setBusy(true);
    try { const r = await fetch('/api/ai/trends', { method: 'POST' }); if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Lỗi'); reload(); toast('Đã viết lại nhận xét'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Không viết lại được', { kind: 'error' }); }
    finally { setBusy(false); }
  };
  const one = shown.length === 1;
  return (
    <section className={`card p-3 ${className}`} aria-label="Nhận xét xu hướng">
      <header className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1 font-semibold text-ink">{data.source === 'ai' ? <Sparkles size={13} aria-hidden="true" className="text-primary" /> : <Bot size={13} aria-hidden="true" />}Nhận xét xu hướng{one ? ` ${DEPT_LABELS[shown[0]]}` : ' theo bộ phận'}</span>
        <span>· cả công ty, tuần đến {data.weekEnd ? dmy(data.weekEnd) : '—'} so với trung bình 4 tuần trước · {data.source === 'ai' ? `AI viết lúc ${timeOnly(data.at)}` : 'tự tính từ số (AI chưa viết)'}</span>
        {canRewrite && <button type="button" className={`btn sm ml-auto ${busy ? 'is-busy' : ''}`} onClick={rewrite} disabled={busy} title={data.error ?? undefined}><RotateCw size={12} />{busy ? 'Đang viết…' : 'Viết lại'}</button>}
      </header>
      <div className={`grid gap-2 ${one ? '' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        {shown.map((d) => {
          const c = data.changes?.[d];
          return (
            <div key={d} className="min-w-0 rounded-lg border border-line px-3 py-2">
              {!one && <p className="mb-1 flex items-center justify-between gap-2 text-[13px] font-semibold text-ink">{DEPT_LABELS[d]}{c && <ChangeChip c={c} suffix="" />}</p>}
              <ul className="grid list-disc gap-0.5 pl-4 text-[12.5px] leading-snug text-ink-2">{data.notes![d]!.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Lấy xu hướng theo bộ lọc đang chọn (một lần cho cả hai thẻ). */
export function useTrends(start: string, end: string, posIds: string[], productSegment: string) {
  const params = new URLSearchParams({ start, end, posIds: posIds.join(','), productSegment });
  return useApi<TrendsData>(`/api/reports/trends?${params}`, { refreshMs: 10 * 60000, keep: false });
}

