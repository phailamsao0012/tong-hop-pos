'use client';

// Báo cáo cuối tháng · "Theo tuần" so được với các tháng trước (anh Vũ 09/10/2026: "không so sánh được với các tháng trước hay các tuần trong tháng hả").
// Một lần tải số theo ngày của 6 tháng gần nhất (stats_daily, rẻ), rồi tự gom:
// - Theo tuần: tuần theo ngày trong tháng (1–7, 8–14, 15–21, 22–28, 29–hết) để tuần 1 tháng này so thẳng với tuần 1 tháng trước.
//   Nhãn trên cột = % so với tuần liền trước, cùng số ngày (tuần đang chạy / tuần 5 ngắn chỉ so đúng ngần ấy ngày đầu của tuần trước).
// - Theo tháng: 6 tháng cạnh nhau; tháng đang chạy so với tháng trước tính tới cùng ngày.
// Bấm cột thì mở Tổng quan POS với đúng khoảng ngày đó (bộ lọc ngày chung của cả web).
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { CalendarDays } from 'lucide-react';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { OverviewReport } from './overview-view';
import { setPeriodRange } from './period-store';
import { ChartCard, SegmentedControl, delta, dmy, money, shortMoney, useMotionOK, vi } from './ui-kit';
import { useApi } from './use-api';

type MetricKey = 'deliveredNet' | 'closedNet' | 'deliveredOrders' | 'closedOrders';
type Day = Record<MetricKey, number>;
// Mặc định Doanh thu chốt: giao TC tính theo ngày tạo đơn nên mấy ngày gần nhất luôn thấp (đơn chưa giao xong), so tuần đang chạy dễ hiểu nhầm.
const METRICS: { value: MetricKey; label: string; money: boolean }[] = [
  { value: 'closedNet', label: 'Doanh thu chốt', money: true },
  { value: 'deliveredNet', label: 'Doanh thu giao TC', money: true },
  { value: 'deliveredOrders', label: 'Đơn giao TC', money: false },
  { value: 'closedOrders', label: 'Đơn chốt', money: false },
];
// Tuần theo ngày trong tháng: [ngày đầu, ngày cuối] (tuần 5 cắt theo số ngày của tháng).
const WEEKS: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]];
const MONTH_NAMES = (m: string) => `T${Number(m.slice(5))}/${m.slice(2, 4)}`;
const shiftMonth = (m: string, k: number) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 1 + k, 1)); return d.toISOString().slice(0, 7); };
const daysIn = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate();
const dayOf = (m: string, dom: number) => `${m}-${String(dom).padStart(2, '0')}`;
const pctLabel = (d: number | null) => d === null ? '' : d === Infinity ? 'mới' : `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)}%`;
// Màu tháng cũ: cùng một tông xám, tháng càng xa càng nhạt (tháng đang xem là màu chính).
const PAST = ['color-mix(in srgb, var(--ink-3) 60%, var(--surface))', 'color-mix(in srgb, var(--ink-3) 38%, var(--surface))', 'color-mix(in srgb, var(--ink-3) 22%, var(--surface))'];

export function MonthlyCompare({ month, end, posIds, team, onOpenRange }: {
  month: string; end: string; posIds: string[]; team: string;
  /** Mở Tổng quan POS với khoảng ngày của cột vừa bấm. */ onOpenRange?: () => void;
}) {
  const motionOn = useMotionOK();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [metric, setMetric] = useState<MetricKey>('closedNet');
  const [depth, setDepth] = useState<'1' | '3'>('1');
  const isMoney = METRICS.find((m) => m.value === metric)!.money;
  const fmt = (n: number) => isMoney ? money(n) : `${vi.format(n)} đơn`;
  const short = (n: number) => isMoney ? shortMoney(n) : vi.format(n);
  const axis = (n: number) => isMoney ? shortMoney(n).replace(/\s*₫$/, '') : vi.format(n);

  const first = `${shiftMonth(month, -5)}-01`;
  const url = useMemo(() => `/api/reports/overview?${new URLSearchParams({ start: first, end, posIds: posIds.join(','), groupBy: 'day', compare: 'none', team })}`, [first, end, posIds, team]);
  const { data, loading } = useApi<OverviewReport>(url);

  const series = data?.current.series;
  const days = useMemo(() => {
    const map = new Map<string, Day>();
    for (const s of series ?? []) {
      const d = map.get(s.bucket) ?? { deliveredNet: 0, closedNet: 0, deliveredOrders: 0, closedOrders: 0 };
      d.deliveredNet += s.groups.delivered.net; d.deliveredOrders += s.groups.delivered.orders; d.closedNet += s.closedNet; d.closedOrders += s.closedOrders;
      map.set(s.bucket, d);
    }
    return map;
  }, [series]);
  const sum = (m: string, from: number, to: number) => {
    let t = 0;
    for (let d = from; d <= Math.min(to, daysIn(m)); d++) t += days.get(dayOf(m, d))?.[metric] ?? 0;
    return t;
  };
  // Tháng đang xem chạy tới ngày nào (tháng cũ thì đủ tháng).
  const lastDom = end.slice(0, 7) === month ? Number(end.slice(8)) : daysIn(month);
  const past = [1, 2, 3].slice(0, depth === '3' ? 3 : 1).map((k) => shiftMonth(month, -k));

  const weekRows = WEEKS.filter(([a]) => a <= daysIn(month)).map(([a, b], i) => {
    const to = Math.min(b, daysIn(month), lastDom), n = to - a + 1; // n = số ngày đã có của tuần này
    const started = n > 0;
    const cur = started ? sum(month, a, to) : null;
    // Tuần liền trước, cùng số ngày: tuần 1 so với 22–28 tháng trước.
    const [pm, pa] = i === 0 ? [shiftMonth(month, -1), 22] : [month, WEEKS[i - 1][0]];
    const prevWeek = started ? sum(pm, pa, pa + n - 1) : null;
    const row: Record<string, number | string | null> = {
      label: `Tuần ${i + 1}`, range: `${a}–${Math.min(b, daysIn(month))}`, start: dayOf(month, a), end: dayOf(month, Math.min(b, daysIn(month))),
      cur, partial: started && to < Math.min(b, daysIn(month)) ? `${a}–${to}` : null,
      vsPrevWeek: cur === null || prevWeek === null ? null : delta(cur, prevWeek),
      prevWeekText: prevWeek === null ? null : `${i === 0 ? `${pa}–${pa + n - 1}/${Number(pm.slice(5))}` : `${pa}–${pa + n - 1}`}`,
    };
    // Cùng tuần các tháng trước: tuần đang chạy chỉ lấy đúng số ngày đã có, để so cùng kỳ.
    past.forEach((m, k) => { row[`p${k}`] = sum(m, a, started && n < b - a + 1 ? a + n - 1 : b); });
    row.vsLastMonth = cur === null ? null : delta(cur, Number(row.p0));
    return row;
  });

  const monthRows = Array.from({ length: 6 }, (_, k) => shiftMonth(month, k - 5)).map((m, i, all) => {
    const isCur = m === month, cut = isCur ? lastDom : daysIn(m);
    const value = sum(m, 1, cut);
    const prev = i > 0 ? sum(all[i - 1], 1, isCur && lastDom < daysIn(month) ? lastDom : daysIn(all[i - 1])) : null;
    return { label: MONTH_NAMES(m), month: m, value, start: `${m}-01`, end: dayOf(m, cut), partial: isCur && lastDom < daysIn(m) ? `1–${lastDom}` : null, vsPrev: prev === null ? null : delta(value, prev) };
  });

  const open = (start: unknown, stop: unknown) => { if (!onOpenRange || typeof start !== 'string' || typeof stop !== 'string') return; setPeriodRange(start, stop > end ? end : stop); onOpenRange(); };
  const metricLabel = METRICS.find((m) => m.value === metric)!.label;
  const config = {
    cur: { label: `${MONTH_NAMES(month)} (tháng đang xem)`, color: 'var(--primary)' },
    ...Object.fromEntries(past.map((m, k) => [`p${k}`, { label: MONTH_NAMES(m), color: PAST[k] }])),
    value: { label: metricLabel, color: 'var(--primary)' },
  };
  const tipValue = (v: unknown) => fmt(Number(v));
  const deltaFill = (d: unknown) => typeof d !== 'number' ? 'var(--ink-3)' : d >= 0 ? 'var(--good)' : 'var(--bad)';

  return (
    <ChartCard icon={CalendarDays} title={mode === 'week' ? 'Theo tuần' : 'Theo tháng'} loading={loading && !data}
      subtitle={mode === 'week' ? `${metricLabel} từng tuần · % trên cột là so với tuần trước, cùng số ngày` : `${metricLabel} 6 tháng gần nhất · % là so với tháng trước, tháng đang chạy so cùng số ngày`}
      action={<SegmentedControl size="sm" ariaLabel="Xem theo" value={mode} onChange={setMode} options={[{ value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }]} />}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SegmentedControl size="sm" ariaLabel="Chỉ số" value={metric} onChange={setMetric} options={METRICS.map(({ value, label }) => ({ value, label }))} />
        {mode === 'week' && <SegmentedControl size="sm" ariaLabel="So với" value={depth} onChange={setDepth} options={[{ value: '1', label: 'So tháng trước' }, { value: '3', label: 'So 3 tháng trước' }]} />}
      </div>
      {mode === 'week' ? (
        <>
          <ChartContainer className="h-64 w-full aspect-auto" config={config}>
            <BarChart key={depth} data={weekRows} className={onOpenRange ? 'cursor-pointer' : ''} onClick={(st) => { const r = st?.activeIndex == null ? undefined : weekRows[Number(st.activeIndex)]; if (r && r.cur !== null) open(r.start, r.end); }} barGap={2} barCategoryGap="18%" margin={{ top: 22, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={axis} />
              <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltipContent labelFormatter={(_l, p) => { const r = p?.[0]?.payload as Record<string, unknown> | undefined; return r ? `${String(r.label)} (ngày ${String(r.partial ?? r.range)})` : ''; }}
                formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{config[String(name) as keyof typeof config]?.label ?? name}</span><strong className="num">{tipValue(value)}</strong></span>} />} />
              <ChartLegend content={<ChartLegendContent />} />
              {[...past].reverse().map((_, j) => { const k = past.length - 1 - j; return <Bar key={k} dataKey={`p${k}`} fill={PAST[k]} radius={[4, 4, 0, 0]} isAnimationActive={motionOn} />; })}
              <Bar dataKey="cur" fill="var(--color-cur)" radius={[4, 4, 0, 0]} isAnimationActive={motionOn}>
                <LabelList dataKey="vsPrevWeek" position="top" content={(p) => {
                  const { x, y, width, value } = p as { x: number; y: number; width: number; value: unknown };
                  if (typeof value !== 'number') return null;
                  return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={deltaFill(value)} className="num">{pctLabel(value)}</text>;
                }} />
              </Bar>
            </BarChart>
          </ChartContainer>
          <div className="mt-2 overflow-x-auto">
            <table className="tbl text-[12px]">
              <thead><tr><th>Tuần</th><th className="n">{MONTH_NAMES(month)}</th><th className="n">So tuần trước</th><th className="n">{MONTH_NAMES(past[0])}</th><th className="n">So tháng trước</th></tr></thead>
              <tbody>
                {weekRows.map((r) => (
                  <tr key={String(r.label)} className={onOpenRange && r.cur !== null ? 'cursor-pointer hover:bg-surface-2' : ''} onClick={() => r.cur !== null && open(r.start, r.end)}>
                    <td className="whitespace-nowrap"><b>{String(r.label)}</b> <span className="text-ink-3">{String(r.partial ?? r.range)}{r.partial ? ' · đang chạy' : ''}</span></td>
                    <td className="n">{r.cur === null ? '—' : short(Number(r.cur))}</td>
                    <td className="n" style={{ color: deltaFill(r.vsPrevWeek) }} title={r.prevWeekText ? `So với ngày ${String(r.prevWeekText)}` : undefined}>{pctLabel(r.vsPrevWeek as number | null) || '—'}</td>
                    <td className="n">{short(Number(r.p0))}</td>
                    <td className="n" style={{ color: deltaFill(r.vsLastMonth) }}>{pctLabel(r.vsLastMonth as number | null) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <ChartContainer className="h-72 w-full aspect-auto" config={config}>
          <BarChart data={monthRows} className={onOpenRange ? 'cursor-pointer' : ''} onClick={(st) => { const r = st?.activeIndex == null ? undefined : monthRows[Number(st.activeIndex)]; if (r) open(r.start, r.end); }} margin={{ top: 22, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v: string, i: number) => monthRows[i]?.partial ? `${v} (1–${lastDom})` : v} />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={axis} />
            <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltipContent labelFormatter={(_l, p) => { const r = p?.[0]?.payload as (typeof monthRows)[number] | undefined; return r ? `${r.label}${r.partial ? ` (ngày ${r.partial})` : ''} · ${dmy(r.start)}–${dmy(r.end)}` : ''; }}
              formatter={(value) => <span className="flex w-full justify-between gap-4"><span>{metricLabel}</span><strong className="num">{tipValue(value)}</strong></span>} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={motionOn}>
              {monthRows.map((r) => <Cell key={r.month} fill={r.month === month ? 'var(--primary)' : PAST[0]} />)}
              <LabelList dataKey="vsPrev" position="top" content={(p) => {
                const { x, y, width, value } = p as { x: number; y: number; width: number; value: unknown };
                if (typeof value !== 'number') return null;
                return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={deltaFill(value)} className="num">{pctLabel(value)}</text>;
              }} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
      <p className="mt-2 text-xs text-ink-3">
        Tuần tính theo ngày trong tháng (1–7, 8–14, 15–21, 22–28, 29–hết) để tuần nào cũng so được với cùng tuần tháng trước.{onOpenRange ? ' Bấm cột hoặc dòng để mở Tổng quan POS của đúng khoảng ngày đó.' : ''}
      </p>
    </ChartCard>
  );
}
