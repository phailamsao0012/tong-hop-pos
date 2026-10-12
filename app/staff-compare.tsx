'use client';

// So cùng kỳ ở bảng Từng nhân viên (Tổng quan Sale / CSKH), anh Vũ 12/10/2026: "biểu đồ mini để xem so với cùng kì… hôm nay so hôm qua,
// tuần này so tuần trước, tháng này so tháng trước… thứ 2 so với thứ 2 của tuần trước, ngày 2 so với ngày 2 tháng trước… tôi muốn tùy biến sâu".
// Kiểu so và số lần lùi nhớ trên máy (usePref); số lấy /api/reports/staff-compare, cùng phạm vi đơn với bảng.
import { useMemo, useState } from 'react';
import { ArrowRight, GitCompareArrows } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addDays, daysBetween, shiftPeriod, todayVn, type CompareMode } from '@/lib/report-time';
import { usePref } from './overview-trends';
import { useApi } from './use-api';
import { DeltaPill, SegmentedControl, delta, dmy, pct, shortMoney, vi } from './ui-kit';

export type CmpMetric = 'closed' | 'closedNet' | 'closeRate';
type CmpCell = { closed: number; closedNet: number; created: number; createdClosed: number; closeRate: number | null };
type Point = { i: number; closed: number; closedNet: number };
export type StaffCompareReport = {
  mode: string; step: number; bucket: 'hour' | 'day';
  period: { start: string; end: string }; compare: { start: string; end: string; cutoff: string | null };
  current: { total: CmpCell; points: Point[] }; previous: { total: CmpCell; points: Point[] };
  staff: { sellerId: string; current: CmpCell; previous: CmpCell }[];
};

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
const show = (v: number | null, metric: CmpMetric) => v === null ? '—' : metric === 'closed' ? vi.format(v) : metric === 'closedNet' ? shortMoney(v) : pct(v);
/** Đổi giữa hai kỳ: tiền, đơn theo %; tỷ lệ chốt theo điểm. */
function Change({ a, b, metric, className = '' }: { a: number | null; b: number | null; metric: CmpMetric; className?: string }) {
  if (a === null || b === null) return <span className={`text-[11px] text-ink-4 ${className}`}>—</span>;
  if (metric === 'closeRate') {
    const d = a - b;
    return <span className={`num whitespace-nowrap text-[11.5px] ${d >= 0 ? 'text-good' : 'text-bad'} ${className}`}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1).replace('.', ',')} điểm</span>;
  }
  return <DeltaPill value={delta(a, b)} variant="plain" className={className} />;
}

export function useStaffCompare(base: { start: string; end: string; posIds: string[]; team: string; by: string; tag: string; hrTeam: string | null; staffIds: string[] }) {
  const [mode, setMode] = usePref<Mode>('thp_cmp_mode', 'previous', MODES);
  const [stepPref, setStep] = usePref<(typeof STEP_VALUES)[number]>('thp_cmp_step', '1', STEP_VALUES);
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
    api, byStaff, len: daysBetween(base.start, base.end),
  };
}
export type StaffCompare = ReturnType<typeof useStaffCompare>;

/** Thanh chọn kiểu so + biểu đồ mini lũy kế kỳ này / kỳ so. */
export function CompareStrip({ c, metric }: { c: StaffCompare; metric: CmpMetric }) {
  const r = c.api.data;
  const today = todayVn();
  // Biểu đồ: tiền khi đang xem doanh thu hoặc tỷ lệ chốt (tỷ lệ không cộng dồn theo giờ được), đơn khi đang xem đơn chốt.
  const chartKey = metric === 'closed' ? 'closed' : 'closedNet';
  const rows = useMemo(() => {
    if (!r) return [];
    const nowHour = vnHourNow();
    const curLen = r.bucket === 'hour' ? (r.period.end === today ? nowHour + 1 : 24) : r.current.points.length;
    const len = r.bucket === 'hour' ? 24 : Math.max(r.current.points.length, r.previous.points.length);
    let a = 0, b = 0;
    return Array.from({ length: len }, (_, i) => {
      a += r.current.points[i]?.[chartKey] ?? 0; b += r.previous.points[i]?.[chartKey] ?? 0;
      const prevLen = r.bucket === 'hour' && r.compare.cutoff ? curLen : r.previous.points.length;
      return { i, cur: i < curLen ? a : null, prev: i < prevLen ? b : null };
    });
  }, [r, chartKey, today]);
  const curText = r ? `${r.period.start === today && r.period.end === today ? 'Hôm nay' : span(r.period.start, r.period.end)}${r.compare.cutoff ? ` tới ${r.compare.cutoff}` : ''}` : '';
  const cmpText = r ? `${span(r.compare.start, r.compare.end)}${r.compare.cutoff ? ` tới ${r.compare.cutoff}` : ''}` : '';
  const xLabel = (i: number) => r?.bucket === 'hour' ? `${i + 1}h` : r ? `${dmy(addDays(r.period.start, i))}` : '';
  const a = r ? cmpValue(r.current.total, metric) : null, b = r ? cmpValue(r.previous.total, metric) : null;
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
            <span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 rounded bg-[var(--primary)]" />Kỳ này</span>
            <span className="inline-flex items-center gap-1"><i className="h-0 w-4 border-t-2 border-dashed border-[var(--ink-4)]" />Kỳ so</span>
            <span>· {chartKey === 'closed' ? 'đơn chốt' : 'doanh thu'} cộng dồn {r?.bucket === 'hour' ? 'theo giờ' : 'theo ngày'}</span>
          </div>
          {c.api.error && !r ? <p className="text-xs text-bad">{c.api.error}</p> : !rows.length ? <div className="h-32 animate-pulse rounded-lg bg-surface-2" /> : (
            <ChartContainer className="aspect-auto h-32 w-full" config={CMP_CONFIG}>
              <LineChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="i" tickLine={false} axisLine={false} tickFormatter={(v: number) => xLabel(v)} minTickGap={18} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={(v: number) => chartKey === 'closed' ? vi.format(v) : shortMoney(v).replace(' ₫', '')} />
                <ChartTooltip content={({ active, payload }) => {
                  const row = active ? payload?.[0]?.payload as (typeof rows)[number] | undefined : undefined;
                  if (!row || !r) return null;
                  const at = (from: string) => r.bucket === 'hour' ? `tới ${row.i + 1}:00` : `tới ${weekday(addDays(from, row.i))} ${dmy(addDays(from, row.i))}`;
                  return (
                    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
                      <div className="flex items-center gap-2"><i className="size-2 rounded-full bg-[var(--primary)]" /><span className="text-ink-3">Kỳ này {at(r.period.start)}</span><b className="num ml-auto pl-3 text-ink">{row.cur === null ? '—' : show(row.cur, chartKey)}</b></div>
                      <div className="flex items-center gap-2"><i className="size-2 rounded-full bg-[var(--ink-4)]" /><span className="text-ink-3">Kỳ so {at(r.compare.start)}</span><b className="num ml-auto pl-3 text-ink">{row.prev === null ? '—' : show(row.prev, chartKey)}</b></div>
                    </div>
                  );
                }} />
                <Line dataKey="prev" stroke="var(--color-prev)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
                <Line dataKey="cur" stroke="var(--color-cur)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ô mini trong bảng: hai vạch kỳ này / kỳ so cùng thang, kèm mức đổi. */
export function CompareCell({ cur, prev, metric, max, title }: { cur: CmpCell | undefined; prev: CmpCell | undefined; metric: CmpMetric; max: number; title: string }) {
  const a = cmpValue(cur, metric), b = cmpValue(prev, metric);
  if (a === null && b === null) return <span className="text-ink-4">—</span>;
  const w = (v: number | null) => `${max > 0 && v ? Math.max(3, v / max * 100) : 0}%`;
  return (
    <span className="inline-flex w-32 flex-col items-stretch gap-0.5 align-middle" title={`${title}\nKỳ này: ${show(a, metric)}\nKỳ so: ${show(b, metric)}`}>
      <span className="block h-1.5 rounded-full bg-surface-2"><i className="block h-full rounded-full bg-[var(--primary)]" style={{ width: w(a) }} /></span>
      <span className="block h-1.5 rounded-full bg-surface-2"><i className="block h-full rounded-full bg-[var(--ink-4)]" style={{ width: w(b) }} /></span>
      <span className="flex items-center justify-between gap-1 text-[11px] text-ink-3"><span className="num whitespace-nowrap">trước {show(b, metric).replace(' ₫', '')}</span><Change a={a} b={b} metric={metric} /></span>
    </span>
  );
}
