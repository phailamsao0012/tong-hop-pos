'use client';

// So cùng kỳ ở bảng Từng nhân viên (Tổng quan Sale / CSKH), anh Vũ 12/10/2026: "biểu đồ mini để xem so với cùng kì… hôm nay so hôm qua,
// tuần này so tuần trước, tháng này so tháng trước… thứ 2 so với thứ 2 của tuần trước, ngày 2 so với ngày 2 tháng trước… tôi muốn tùy biến sâu".
// Kiểu so và số lần lùi nhớ trên máy (usePref); số lấy /api/reports/staff-compare, cùng phạm vi đơn với bảng.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, GitCompareArrows } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addDays, daysBetween, shiftPeriod, todayVn, type CompareMode } from '@/lib/report-time';
import { usePref } from './overview-trends';
import { useApi } from './use-api';
import { DeltaPill, SegmentedControl, delta, dmy, pct, shortMoney, vi } from './ui-kit';

export type CmpMetric = 'closed' | 'closedNet' | 'closeRate';
type CmpCell = { closed: number; closedNet: number; created: number; createdClosed: number; closeRate: number | null };
type Point = { i: number; closed: number; closedNet: number; created: number; createdClosed: number };
/** Một điểm chuỗi từng người: [đơn chốt, doanh thu, số chia, số chia đã chốt]. */
type Tuple = number[];
export type StaffCompareReport = {
  mode: string; step: number; bucket: 'hour' | 'day'; group?: number;
  period: { start: string; end: string }; compare: { start: string; end: string; cutoff: string | null };
  current: { total: CmpCell; points: Point[] }; previous: { total: CmpCell; points: Point[] };
  staff: { sellerId: string; current: CmpCell; previous: CmpCell; series?: { current: Tuple[]; previous: Tuple[] } }[];
};
/** Kiểu biểu đồ so (anh Vũ 12/10/2026: "có thể làm khác không, như dạng lên xuống ấy"):
 * lên xuống = từng ngày/giờ kỳ này và kỳ so; chênh lệch = cột lên (hơn kỳ so) xuống (kém kỳ so); cộng dồn = cách cũ. */
export type CmpKind = 'wave' | 'diff' | 'cum';
const KINDS: CmpKind[] = ['wave', 'diff', 'cum'];
const KIND_LABEL: Record<CmpKind, string> = { wave: 'Lên xuống', diff: 'Chênh lệch', cum: 'Cộng dồn' };
const KIND_TITLE: Record<CmpKind, string> = { wave: 'Từng ngày (xem một ngày thì từng giờ) của kỳ này và kỳ so', diff: 'Mỗi cột là kỳ này trừ kỳ so: xanh lên là hơn, đỏ xuống là kém', cum: 'Cộng dồn từ đầu kỳ' };
const pointValue = (p: { closed: number; closedNet: number; created: number; createdClosed: number } | undefined, metric: CmpMetric) =>
  !p ? null : metric === 'closed' ? p.closed : metric === 'closedNet' ? p.closedNet : p.created ? Math.min(p.created, p.createdClosed) / p.created * 100 : null;
const tupleValue = (t: Tuple | undefined, metric: CmpMetric) => t ? pointValue({ closed: t[0], closedNet: t[1], created: t[2], createdClosed: t[3] }, metric) : null;
/** Xem hôm nay theo giờ: chỉ vẽ tới giờ hiện tại (kỳ so cũng cắt cùng giờ). */
export const seriesCut = (r: StaffCompareReport | null | undefined) => r && r.bucket === 'hour' && r.compare.cutoff ? vnHourNow() + 1 : null;

type Mode = CompareMode | 'custom';
const MODES: Mode[] = ['previous', 'weekday', 'monthday', 'year', 'custom'];
const MODE_LABEL: Record<Mode, string> = { previous: 'Kỳ liền trước', weekday: 'Cùng thứ tuần trước', monthday: 'Cùng ngày tháng trước', year: 'Cùng kỳ năm trước', custom: 'Tự chọn ngày' };
const MODE_SHORT: Record<Mode, string> = { previous: 'Kỳ trước', weekday: 'Cùng thứ', monthday: 'Cùng ngày', year: 'Năm trước', custom: 'Tự chọn' };
const MODE_TITLE: Record<Mode, string> = {
  previous: 'Hôm nay so hôm qua, tuần này so tuần trước, tháng này so tháng trước',
  weekday: 'Thứ Hai so thứ Hai tuần trước (cả kỳ lùi đủ số tuần để từng ngày trùng thứ)',
  monthday: 'Ngày 2 so ngày 2 tháng trước (tháng thiếu ngày thì lấy ngày cuối tháng)',
  year: 'Cùng ngày năm trước',
  custom: 'Tự chọn hai ngày của kỳ so',
};
const STEPS: Record<CompareMode, number[]> = { previous: [1, 2, 3, 4], weekday: [1, 2, 3, 4, 8], monthday: [1, 2, 3, 6, 12], year: [1, 2] };
const STEP_VALUES = ['1', '2', '3', '4', '6', '8', '12'] as const;
const vnHourNow = () => Number(new Date(Date.now() + 7 * 3600000).toISOString().slice(11, 13));
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const weekday = (d: string) => WD[new Date(`${d}T00:00:00Z`).getUTCDay()];
const span = (s: string, e: string) => s === e ? `${weekday(s)} ${dmy(s)}` : `${dmy(s)}–${dmy(e)}`;
const stepLabel = (mode: CompareMode, n: number, len: number) =>
  mode === 'previous' ? `${n} kỳ trước` : mode === 'weekday' ? (len <= 7 ? `${n} tuần trước` : `lùi ${n * Math.ceil(len / 7)} tuần`) : mode === 'monthday' ? `${n} tháng trước` : `${n} năm trước`;
// Cấu hình biểu đồ cố định (đổi object mỗi lần vẽ làm recharts chạy lại hiệu ứng, biểu đồ trắng — xem mkt-headline.tsx).
const CMP_CONFIG = { cur: { label: 'Kỳ này', color: 'var(--primary)' }, prev: { label: 'Kỳ so', color: 'var(--ink-4)' } } satisfies ChartConfig;

/** Tên kỳ so kèm mức lùi: "Cùng thứ 2 tuần trước", "Cùng ngày 3 tháng trước". */
const cmpLabel = (mode: Mode, n: number, len: number) => mode === 'custom' ? MODE_LABEL.custom : n === 1 && (mode !== 'weekday' || len <= 7) ? MODE_LABEL[mode]
  : mode === 'previous' ? `Lùi ${n} kỳ` : mode === 'weekday' ? `Cùng thứ, ${stepLabel(mode, n, len)}` : mode === 'monthday' ? `Cùng ngày ${n} tháng trước` : `Cùng kỳ ${n} năm trước`;
/** Giá trị của một ô theo chỉ số đang xem ở bảng. */
export const cmpValue = (c: CmpCell | undefined, metric: CmpMetric) => !c ? null : metric === 'closed' ? c.closed : metric === 'closedNet' ? c.closedNet : c.closeRate;
const METRIC_NOUN: Record<CmpMetric, string> = { closed: 'đơn chốt', closedNet: 'doanh thu', closeRate: 'tỷ lệ chốt' };
const show = (v: number | null, metric: CmpMetric) => v === null ? '—' : metric === 'closed' ? vi.format(v) : metric === 'closedNet' ? shortMoney(v) : pct(v);
/** Màu theo dấu thay đổi: tỷ lệ chốt so điểm %, tiền và đơn so %. */
function trendColor(a: number | null, b: number | null, metric: CmpMetric) {
  if (a === null || b === null) return 'var(--ink-3)';
  const d = metric === 'closeRate' ? a - b : delta(a, b);
  return d === null || d === 0 ? 'var(--ink-3)' : d > 0 ? 'var(--good)' : 'var(--bad)';
}
/** Đổi giữa hai kỳ: tiền, đơn theo %; tỷ lệ chốt theo điểm. */
function Change({ a, b, metric, className = '' }: { a: number | null; b: number | null; metric: CmpMetric; className?: string }) {
  const color = trendColor(a, b, metric);
  if (a === null || b === null) return <span className={`text-[11px] ${className}`} style={{ color }}>—</span>;
  if (metric === 'closeRate') {
    const d = a - b;
    return <span className={`num whitespace-nowrap text-[11.5px] ${className}`} style={{ color }}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1).replace('.', ',')} điểm</span>;
  }
  return <span className="inline-flex [&>span]:text-inherit" style={{ color }}><DeltaPill value={delta(a, b)} variant="plain" className={className} /></span>;
}

export function useStaffCompare(base: { start: string; end: string; posIds: string[]; team: string; by: string; tag: string; hrTeam: string | null; staffIds: string[] }) {
  const [mode, setMode] = usePref<Mode>('thp_cmp_mode', 'previous', MODES);
  const [stepPref, setStep] = usePref<(typeof STEP_VALUES)[number]>('thp_cmp_step', '1', STEP_VALUES);
  const [kind, setKind] = usePref<CmpKind>('thp_cmp_kind', 'wave', KINDS);
  const auto = shiftPeriod(base.start, base.end, 'previous');
  const [custom, setCustom] = useState<{ start: string; end: string } | null>(null);
  const cstart = custom?.start ?? auto.start, cend = custom?.end ?? auto.end;
  const steps = mode === 'custom' ? [] : STEPS[mode];
  const step = steps.includes(Number(stepPref)) ? Number(stepPref) : 1;
  const okCustom = mode !== 'custom' || (!!cstart && !!cend && cstart <= cend);
  const url = useMemo(() => {
    if (!okCustom) return null;
    const q = new URLSearchParams({ start: base.start, end: base.end, posIds: base.posIds.join(','), team: base.team, by: base.by, mode,
      ...(mode === 'custom' ? { cstart, cend } : { step: String(step) }), ...(base.tag ? { tag: base.tag } : {}), ...(base.hrTeam ? { hrTeam: base.hrTeam } : {}),
      ...(base.staffIds.length ? { staffIds: base.staffIds.join(',') } : {}) });
    return `/api/reports/staff-compare?${q}`;
  }, [base.start, base.end, base.posIds, base.team, base.by, base.tag, base.hrTeam, base.staffIds, mode, step, cstart, cend, okCustom]);
  const api = useApi<StaffCompareReport>(url);
  const byStaff = useMemo(() => new Map((api.data?.staff ?? []).map((s) => [s.sellerId, s])), [api.data]);
  return {
    // Đổi kiểu so thì mức lùi về 1 (QA 12/10/2026: "3 tháng trước" không được thành "3 kỳ trước").
    mode, setMode: (m: Mode) => { setMode(m); setStep('1'); }, step, steps, setStep: (n: number) => setStep(String(n) as (typeof STEP_VALUES)[number]),
    cstart, cend, setCstart: (v: string) => setCustom({ start: v, end: cend }), setCend: (v: string) => setCustom({ start: cstart, end: v }),
    api, byStaff, len: daysBetween(base.start, base.end), kind, setKind,
  };
}
export type StaffCompare = ReturnType<typeof useStaffCompare>;

/** Thanh chọn kiểu so + biểu đồ mini lũy kế kỳ này / kỳ so. */
export function CompareStrip({ c, metric }: { c: StaffCompare; metric: CmpMetric }) {
  const r = c.api.data;
  const today = todayVn();
  // Cộng dồn: tiền khi đang xem doanh thu hoặc tỷ lệ chốt (tỷ lệ không cộng dồn được), đơn khi đang xem đơn chốt.
  // Lên xuống / chênh lệch: đúng chỉ số đang xem ở bảng, kể cả tỷ lệ chốt từng ngày (số chia ngày đó đã chốt ÷ số chia ngày đó).
  const kind = c.kind;
  const chartMetric: CmpMetric = kind === 'cum' ? (metric === 'closed' ? 'closed' : 'closedNet') : metric;
  // Tính lại mỗi lần vẽ (tối đa vài chục điểm), không cần useMemo.
  const g = r?.bucket === 'day' ? Math.max(1, r.group ?? 1) : 1;
  const rows = (() => {
    if (!r) return [];
    const cut = seriesCut(r);
    // Kỳ dài: gộp ngày như ô từng người (mỗi điểm `g` ngày), tránh vài trăm điểm răng cưa (QA 12/10/2026).
    const pack = (ps: Point[]) => g === 1 ? ps : Array.from({ length: Math.ceil(ps.length / g) }, (_, k) => ps.slice(k * g, k * g + g)
      .reduce((x, p) => ({ i: k, closed: x.closed + p.closed, closedNet: x.closedNet + p.closedNet, created: x.created + p.created, createdClosed: x.createdClosed + p.createdClosed }), { i: k, closed: 0, closedNet: 0, created: 0, createdClosed: 0 }));
    const curP = pack(r.current.points), prevP = pack(r.previous.points);
    const curLen = cut ?? curP.length;
    const prevLen = cut ?? prevP.length;
    const len = r.bucket === 'hour' ? 24 : Math.max(curP.length, prevP.length);
    let a = 0, b = 0;
    return Array.from({ length: len }, (_, i) => {
      const pa = pointValue(curP[i], chartMetric), pb = pointValue(prevP[i], chartMetric);
      a += pa ?? 0; b += pb ?? 0;
      const cur = i < curLen ? (kind === 'cum' ? a : pa) : null, prev = i < prevLen ? (kind === 'cum' ? b : pb) : null;
      const diff = cur !== null && prev !== null ? cur - prev : null;
      return { i, cur, prev, diff, up: diff !== null && diff >= 0 ? diff : null, down: diff !== null && diff < 0 ? diff : null };
    });
  })();
  const chartKey = chartMetric;
  const curText = r ? `${r.period.start === today && r.period.end === today ? 'Hôm nay' : span(r.period.start, r.period.end)}${r.compare.cutoff ? ` tới ${r.compare.cutoff}` : ''}` : '';
  const cmpText = r ? `${span(r.compare.start, r.compare.end)}${r.compare.cutoff ? ` tới ${r.compare.cutoff}` : ''}` : '';
  const xLabel = (i: number) => r?.bucket === 'hour' ? `${kind === 'cum' ? i + 1 : i}h` : r ? `${dmy(addDays(r.period.start, i * g))}` : '';
  const a = r ? cmpValue(r.current.total, metric) : null, b = r ? cmpValue(r.previous.total, metric) : null;
  const axisFmt = (v: number) => chartKey === 'closed' ? vi.format(v) : chartKey === 'closeRate' ? `${Math.round(v)}%` : shortMoney(v).replace(' ₫', '');
  const tip = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
    const row = active ? payload?.[0]?.payload as (typeof rows)[number] | undefined : undefined;
    if (!row || !r) return null;
    const at = (from: string, to: string) => r.bucket === 'hour' ? (kind === 'cum' ? `tới ${row.i + 1}:00` : `${row.i}:00–${row.i + 1}:00`) : g > 1 ? `${kind === 'cum' ? 'tới ' : ''}${dmy(addDays(from, row.i * g))}–${dmy([addDays(from, row.i * g + g - 1), to].sort()[0])}` : `${kind === 'cum' ? 'tới ' : ''}${weekday(addDays(from, row.i))} ${dmy(addDays(from, row.i))}`;
    return (
      <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
        <div className="flex items-center gap-2"><i className="size-2 rounded-full bg-[var(--primary)]" /><span className="text-ink-3">Kỳ này {at(r.period.start, r.period.end)}</span><b className="num ml-auto pl-3 text-ink">{row.cur === null ? '—' : show(row.cur, chartKey)}</b></div>
        <div className="flex items-center gap-2"><i className="size-2 rounded-full bg-[var(--ink-4)]" /><span className="text-ink-3">Kỳ so {at(r.compare.start, r.compare.end)}</span><b className="num ml-auto pl-3 text-ink">{row.prev === null ? '—' : show(row.prev, chartKey)}</b></div>
        {row.diff !== null && <div className="mt-0.5 flex items-center gap-2 border-t border-line pt-0.5"><span className="text-ink-3">Chênh lệch</span><b className={`num ml-auto pl-3 ${row.diff >= 0 ? 'text-good' : 'text-bad'}`}>{row.diff >= 0 ? '+' : '−'}{show(Math.abs(row.diff), chartKey).replace('%', chartKey === 'closeRate' ? ' điểm' : '%')}</b></div>}
      </div>
    );
  };
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompareArrows size={15} className="text-ink-3" aria-hidden="true" />
        <b className="text-xs text-ink-2">So cùng kỳ</b>
        <SegmentedControl<Mode> size="sm" ariaLabel="Kiểu so cùng kỳ" className="hidden md:inline-flex" value={c.mode} onChange={c.setMode}
          options={MODES.map((m) => ({ value: m, label: MODE_SHORT[m], title: `${MODE_LABEL[m]}: ${MODE_TITLE[m]}` }))} />
        <Select value={c.mode} items={MODE_LABEL} onValueChange={(v) => c.setMode(v as Mode)}>
          <SelectTrigger className="min-w-40 text-xs md:hidden" aria-label="Kiểu so cùng kỳ"><SelectValue /></SelectTrigger>
          <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent>
        </Select>
        {c.mode !== 'custom' && c.steps.length > 1 && (
          <Select value={String(c.step)} items={Object.fromEntries(c.steps.map((n) => [String(n), stepLabel(c.mode as CompareMode, n, c.len)]))} onValueChange={(v) => c.setStep(Number(v))}>
            <SelectTrigger className="min-w-28 text-xs" aria-label="Lùi bao xa"><SelectValue /></SelectTrigger>
            <SelectContent>{c.steps.map((n) => <SelectItem key={n} value={String(n)}>{stepLabel(c.mode as CompareMode, n, c.len)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <SegmentedControl<CmpKind> size="sm" ariaLabel="Kiểu biểu đồ so" className="md:ml-auto" value={kind} onChange={c.setKind}
          options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k], title: KIND_TITLE[k] }))} />
        {c.mode === 'custom' && (
          <span className="flex min-w-0 items-center gap-2">
            <Input aria-label="Kỳ so từ ngày" type="date" className="h-8 w-auto text-xs" value={c.cstart} max={c.cend} onChange={(e) => c.setCstart(e.target.value)} />
            <ArrowRight size={13} className="shrink-0 text-ink-4" aria-hidden="true" />
            <Input aria-label="Kỳ so đến ngày" type="date" className="h-8 w-auto text-xs" value={c.cend} min={c.cstart} max={today} onChange={(e) => c.setCend(e.target.value)} />
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2 text-xs">
          <div><span className="text-ink-3">Kỳ này · {curText || '…'}</span><b className="num block text-xl text-ink">{r ? show(a, metric) : '…'}</b></div>
          <div><span className="text-ink-3">{cmpLabel(c.mode, c.step, c.len)} · {cmpText || '…'}</span><b className="num block text-base text-ink-2">{r ? show(b, metric) : '…'}</b></div>
          {r && <div className="flex items-center gap-2"><Change a={a} b={b} metric={metric} className="text-[13px]" /><span className="text-ink-3">so với kỳ so</span></div>}
          {r?.compare.cutoff && <p className="text-[11px] text-ink-3">Kỳ đang xem chưa hết ngày nên kỳ so cũng chỉ tính tới {r.compare.cutoff}.</p>}
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
            {kind === 'diff' ? <>
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-[var(--good)]" />Hơn kỳ so</span>
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-[var(--bad)]" />Kém kỳ so</span>
            </> : <>
              <span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 rounded bg-[var(--primary)]" />Kỳ này</span>
              <span className="inline-flex items-center gap-1"><i className="h-0 w-4 border-t-2 border-dashed border-[var(--ink-4)]" />Kỳ so</span>
            </>}
            <span>· {METRIC_NOUN[chartKey]} {kind === 'cum' ? 'cộng dồn ' : kind === 'diff' ? 'chênh lệch ' : ''}{r?.bucket === 'hour' ? 'theo giờ' : g > 1 ? `mỗi điểm ${g} ngày` : 'theo ngày'}</span>
          </div>
          {c.api.error && !r ? <p className="text-xs text-bad">{c.api.error}</p> : !rows.length ? <div className="h-32 animate-pulse rounded-lg bg-surface-2" /> : (
            <ChartContainer className="aspect-auto h-32 w-full" config={CMP_CONFIG}>
              {kind === 'diff' ? (
                <BarChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="i" tickLine={false} axisLine={false} tickFormatter={(v: number) => xLabel(v)} minTickGap={18} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={axisFmt} />
                  <ReferenceLine y={0} stroke="var(--ink-4)" />
                  <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={tip} />
                  <Bar dataKey="up" stackId="d" fill="var(--good)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  <Bar dataKey="down" stackId="d" fill="var(--bad)" radius={[0, 0, 3, 3]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              ) : (
                <LineChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="i" tickLine={false} axisLine={false} tickFormatter={(v: number) => xLabel(v)} minTickGap={18} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={axisFmt} />
                  <ChartTooltip content={tip} />
                  <Line type={kind === 'wave' ? 'monotone' : 'linear'} dataKey="prev" stroke="var(--color-prev)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
                  <Line type={kind === 'wave' ? 'monotone' : 'linear'} dataKey="cur" stroke="var(--color-cur)" strokeWidth={2} dot={kind === 'wave' && rows.length <= 31 ? { r: 2, strokeWidth: 0, fill: 'var(--color-cur)' } : false} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              )}
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ô mini trong bảng. Lên xuống: đường từng ngày kỳ này (liền) và kỳ so (đứt); chênh lệch: cột xanh lên / đỏ xuống quanh vạch 0;
 * cộng dồn: hai vạch kỳ này / kỳ so cùng thang (cách cũ). Dưới là số kỳ so và mức đổi. */
export function CompareCell({ cur, prev, metric, max, title, kind = 'cum', series, cut = null }: {
  cur: CmpCell | undefined; prev: CmpCell | undefined; metric: CmpMetric; max: number; title: string;
  kind?: CmpKind; series?: { current: Tuple[]; previous: Tuple[] }; cut?: number | null;
}) {
  const a = cmpValue(cur, metric), b = cmpValue(prev, metric);
  if (a === null && b === null) return <span className="text-ink-4">—</span>;
  const w = (v: number | null) => `${max > 0 && v ? Math.max(3, v / max * 100) : 0}%`;
  const W = 84, H = 20;
  let chart: ReactNode;
  if (kind !== 'cum' && series) {
    const len = Math.max(series.current.length, series.previous.length);
    const lim = (n: number) => cut === null ? n : Math.min(n, cut);
    const ys = Array.from({ length: len }, (_, i) => ({ c: i < lim(series.current.length) ? tupleValue(series.current[i], metric) : null, p: i < lim(series.previous.length) ? tupleValue(series.previous[i], metric) : null }));
    const x = (i: number) => len <= 1 ? W / 2 : 2 + i / (len - 1) * (W - 4);
    if (kind === 'wave') {
      const color = trendColor(a, b, metric);
      const hi = Math.max(1e-9, ...ys.flatMap((v) => [v.c ?? 0, v.p ?? 0]));
      const y = (v: number) => H - 3 - v / hi * (H - 6);
      const path = (k: 'c' | 'p') => ys.map((v, i) => v[k] === null ? null : `${x(i).toFixed(1)} ${y(v[k]!).toFixed(1)}`).filter(Boolean).map((pt, i) => `${i ? 'L' : 'M'}${pt}`).join('');
      const last = ys.map((v, i) => ({ v: v.c, i })).filter((v) => v.v !== null).pop();
      chart = (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
          <path d={path('p')} fill="none" stroke="var(--ink-4)" strokeWidth={1.3} strokeDasharray="3 2" strokeLinejoin="round" />
          <path d={path('c')} fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
          {last && <circle cx={x(last.i)} cy={y(last.v!)} r={1.8} fill={color} />}
        </svg>
      );
    } else {
      const ds = ys.map((v) => v.c !== null && v.p !== null ? v.c - v.p : null);
      const hi = Math.max(1e-9, ...ds.map((d) => Math.abs(d ?? 0)));
      const mid = H / 2, bw = Math.max(1.5, Math.min(6, (W - 4) / len - 1.5));
      chart = (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
          <line x1={0} x2={W} y1={mid} y2={mid} stroke="var(--line-3)" strokeWidth={1} />
          {ds.map((d, i) => d === null || d === 0 ? null : <rect key={i} x={x(i) - bw / 2} width={bw} y={d > 0 ? mid - d / hi * (mid - 1) : mid} height={Math.max(1, Math.abs(d) / hi * (mid - 1))} rx={1} fill={d > 0 ? 'var(--good)' : 'var(--bad)'} />)}
        </svg>
      );
    }
  } else {
    chart = <>
      <span className="block h-1 rounded-full bg-surface-2"><i className="block h-full rounded-full bg-[var(--primary)]" style={{ width: w(a) }} /></span>
      <span className="block h-1 rounded-full bg-surface-2"><i className="block h-full rounded-full bg-[var(--ink-4)]" style={{ width: w(b) }} /></span>
    </>;
  }
  return (
    <span className="inline-flex w-24 flex-col items-stretch gap-0.5 align-middle" title={`${title}\nKỳ này: ${show(a, metric)}\nKỳ so: ${show(b, metric)}`}>
      {chart}
      <span className="flex items-center justify-between gap-1 text-[11px] text-ink-3"><span className="num min-w-0 truncate">trước {show(b, metric).replace(' ₫', '')}</span><span className="shrink-0 whitespace-nowrap"><Change a={a} b={b} metric={metric} /></span></span>
    </span>
  );
}
