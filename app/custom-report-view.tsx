'use client';

// Báo cáo tùy chỉnh (giai đoạn 6c · 26/09/2026): viết lại trên báo cáo tổng quan (cùng hàm tính, cùng "Cách tính", cùng bộ lọc trạng thái),
// bỏ đường tính cũ. Người xem chọn chiều (nhân viên / POS / ngày / tuần / tháng), chỉ số, dạng bảng / cột / đường, lưu cấu hình, xuất Excel, gói AI.
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileDown, Save, SlidersHorizontal, Table2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { AiPackButton } from './ai-pack';
import { useMetricSettings } from './metric-settings';
import { closeRateOf, returnRateOf, cancelRateOf, METRIC_DEFS } from '@/lib/metrics';
import { PeriodToolbar, PosChips, presetRange, type OverviewReport } from './overview-view';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { ChartCard, EmptyState, ErrorBox, PageHeader, SegmentedControl, SkeletonTable, SortTh, TableWrap, dmy, pct, posName, shortMoney, toast, useSort, vi } from './ui-kit';

type M = OverviewReport['current']['total'];
type Dim = 'employee' | 'pos' | 'day' | 'week' | 'month';
type Display = 'table' | 'bar' | 'line';
const DIMS: { value: Dim; label: string }[] = [{ value: 'employee', label: 'Nhân viên' }, { value: 'pos', label: 'POS' }, { value: 'day', label: 'Ngày' }, { value: 'week', label: 'Tuần' }, { value: 'month', label: 'Tháng' }];
type MetricKey = 'orders' | 'closedOrders' | 'rate' | 'closedNet' | 'aov' | 'closedDiscount' | 'delivered' | 'returnRate' | 'cancelRate' | 'assignedOrders' | 'customers';
const COLORS = ['var(--primary)', 'var(--ai-3)', 'var(--ai-5)', 'var(--warn)', 'var(--ai-2)', 'var(--bad)'];
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
type Preset = { id: string; title: string; config: { v?: number; dim?: Dim; metrics?: MetricKey[]; display?: Display; sort?: MetricKey } };

export function CustomReportView() {
  const ms = useMetricSettings();
  const team = useTeam();
  const today = todayVn();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [dim, setDim] = useState<Dim>('employee');
  const [display, setDisplay] = useState<Display>('table');
  const [metrics, setMetrics] = useState<MetricKey[]>(['closedOrders', 'rate', 'closedNet', 'aov']);
  const [title, setTitle] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => { void fetch('/api/presets').then((r) => (r.ok ? r.json() : []) as Promise<Preset[] | { items?: Preset[] }>).then((x) => setPresets((Array.isArray(x) ? x : x.items ?? []).filter((p) => p.config?.v === 2))).catch(() => undefined); }, []);

  const METRICS: Record<MetricKey, { label: string; value: (m: M) => number | null; fmt: (v: number | null) => string; def?: string }> = useMemo(() => ({
    orders: { label: 'Đơn lên', value: (m) => m.orders, fmt: (v) => v === null ? '—' : vi.format(v), def: METRIC_DEFS.orders.def },
    closedOrders: { label: 'Đơn chốt', value: (m) => m.closedOrders, fmt: (v) => v === null ? '—' : vi.format(v), def: METRIC_DEFS.closed.def },
    rate: { label: 'Tỷ lệ chốt', value: (m) => closeRateOf(m, ms.rateBase), fmt: (v) => pct(v), def: METRIC_DEFS.rate(ms.rateBase).def },
    closedNet: { label: 'Doanh thu', value: (m) => m.closedNet, fmt: (v) => shortMoney(v), def: METRIC_DEFS.revenue.def },
    aov: { label: 'GTTB', value: (m) => m.averageOrder, fmt: (v) => shortMoney(v), def: METRIC_DEFS.aov.def },
    closedDiscount: { label: 'Giảm giá / quà', value: (m) => m.closedDiscount, fmt: (v) => shortMoney(v) },
    delivered: { label: 'Giao thành công', value: (m) => m.groups.delivered.orders, fmt: (v) => v === null ? '—' : vi.format(v) },
    returnRate: { label: 'Tỷ lệ hoàn', value: (m) => returnRateOf(m, ms.returnBase), fmt: (v) => pct(v), def: METRIC_DEFS.returned(ms.returnBase).def },
    cancelRate: { label: 'Tỷ lệ hủy', value: (m) => cancelRateOf(m), fmt: (v) => pct(v), def: METRIC_DEFS.cancelled.def },
    assignedOrders: { label: 'Đơn được chia', value: (m) => (m as M & { assignedHidden?: boolean }).assignedHidden ? null : m.assignedOrders, fmt: (v) => v === null ? '—' : vi.format(v) },
    customers: { label: 'Khách', value: (m) => m.closedCustomers, fmt: (v) => v === null ? '—' : vi.format(v) },
  }), [ms.rateBase, ms.returnBase]);

  const groupBy = dim === 'week' ? 'week' : dim === 'month' ? 'month' : 'day';
  const url = useMemo(() => `/api/reports/overview?${new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy, compare: 'none', team })}`, [start, end, posIds, groupBy, team]);
  const { data: r, loading, error, reload } = useApi<OverviewReport>(url, { keep: false });
  // Mỗi dòng = một nhóm theo chiều đang chọn; chiều thời gian cộng các POS lại (các cột cộng được, tỷ lệ tính lại từ tổng).
  const rows = useMemo(() => {
    if (!r) return [] as { key: string; label: string; m: M }[];
    if (dim === 'employee') return r.current.byEmployee.filter((e) => e.sellerId).map((e) => ({ key: e.sellerId, label: e.name, m: e as unknown as M }));
    if (dim === 'pos') return r.current.byPos.map((p) => ({ key: p.posId, label: posName(p.posId), m: p as unknown as M }));
    const acc = new Map<string, M>();
    for (const s of r.current.series) {
      const cur = acc.get(s.bucket);
      if (!cur) { acc.set(s.bucket, JSON.parse(JSON.stringify(s)) as M); continue; }
      for (const k of ['orders', 'deletedOrders', 'closedOrders', 'closedNet', 'closedGross', 'closedDiscount', 'assignedOrders', 'closedQuantity'] as const) (cur as unknown as Record<string, number>)[k] = Number(cur[k] ?? 0) + Number(s[k] ?? 0);
      for (const g of Object.keys(cur.groups) as (keyof M['groups'])[]) { cur.groups[g].orders += s.groups[g].orders; cur.groups[g].net += s.groups[g].net; }
    }
    return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([b, m]) => { m.averageOrder = m.closedOrders ? m.closedNet / m.closedOrders : null; m.closedCustomers = null; return { key: b, label: dim === 'month' ? `${b.slice(5, 7)}/${b.slice(0, 4)}` : dmy(b), m }; });
  }, [r, dim]);
  const sort = useSort<string>(metrics[0] ?? 'closedNet');
  const sorted = useMemo(() => dim === 'employee' || dim === 'pos' ? sort.apply(rows, (x, k) => k === 'label' ? x.label : METRICS[k as MetricKey]?.value(x.m) ?? null) : rows, [rows, sort, dim, METRICS]);
  const chart = sorted.slice(0, dim === 'employee' ? 25 : 400).map((x) => ({ label: x.label, ...Object.fromEntries(metrics.map((k) => [k, METRICS[k].value(x.m)])) }));
  const toggle = (k: MetricKey) => {
    const next = metrics.includes(k) ? metrics.filter((x) => x !== k) : [...metrics, k];
    setMetrics(next);
    if (!next.includes(sort.key as MetricKey) && next[0]) sort.setKey(next[0]);
  };
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const dimLabel = DIMS.find((d) => d.value === dim)!.label;

  const savePreset = async () => {
    if (!title.trim()) { toast('Đặt tên báo cáo trước khi lưu', { kind: 'error' }); return; }
    const res = await fetch('/api/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), config: { v: 2, dim, metrics, display, sort: sort.key } }) });
    if (!res.ok) { toast('Không lưu được', { kind: 'error' }); return; }
    const p = await res.json() as Preset; setPresets([p, ...presets]); setTitle(''); toast('Đã lưu báo cáo');
  };
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`Báo cáo tùy chỉnh · theo ${dimLabel.toLowerCase()} · ${periodLabel}`], [],
      [dimLabel, ...metrics.map((k) => METRICS[k].label)], ...sorted.map((x) => [x.label, ...metrics.map((k) => { const v = METRICS[k].value(x.m); return v === null ? '' : Math.round(v * 100) / 100; })])]), 'Báo cáo');
    XLSX.writeFile(wb, `bao-cao-tuy-chinh_${start}_${end}.xlsx`);
  };
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={periodLabel} title="Báo cáo tùy chỉnh" subtitle="Tự chọn chiều xem, chỉ số và dạng hiển thị · cùng cách tính với các trang khác (theo Cách tính và bộ lọc Trạng thái trên thanh trên cùng)"
        actions={<>
          <AiPackButton disabled={!sorted.length} pack={() => ({ page: `Báo cáo tùy chỉnh theo ${dimLabel.toLowerCase()}`, period: periodLabel,
            tables: [{ title: `Theo ${dimLabel.toLowerCase()}`, staffCol: dim === 'employee' ? 0 : undefined, columns: [dimLabel, ...metrics.map((k) => METRICS[k].label)], rows: sorted.slice(0, 80).map((x) => [x.label, ...metrics.map((k) => METRICS[k].fmt(METRICS[k].value(x.m)))]) }],
            definitions: metrics.map((k) => METRICS[k].def).filter((d): d is string => !!d),
            questions: ['Điểm nổi bật và bất thường trong bảng này là gì?', 'Nhóm nào tốt nhất / kém nhất, chênh bao nhiêu?', 'Nên làm gì tiếp theo?'] })} />
          <Button variant="outline" onClick={() => void exportExcel()} disabled={!sorted.length}><FileDown size={14} />Xuất Excel</Button>
        </>} />
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={(v) => { setPreset(v); const x = presetRange(v, today); if (x) { setStart(x.start); setEnd(x.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <ChartCard icon={SlidersHorizontal} title="Tùy chỉnh" subtitle="Chọn chiều, chỉ số, cách hiện">
          <div className="space-y-4 text-[13px]">
            <div><p className="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Xem theo</p><SegmentedControl size="sm" value={dim} onChange={setDim} options={DIMS} ariaLabel="Chiều xem" /></div>
            <div>
              <p className="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Chỉ số</p>
              <div className="grid gap-1">{(Object.keys(METRICS) as MetricKey[]).map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"><input id={`cm-${k}`} type="checkbox" checked={metrics.includes(k)} onChange={() => toggle(k)} />{METRICS[k].label}</label>
              ))}</div>
            </div>
            <div><p className="m-0 mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Hiện dạng</p>
              <SegmentedControl size="sm" value={display} onChange={setDisplay} ariaLabel="Dạng hiển thị" options={[{ value: 'table', label: 'Bảng', icon: Table2 }, { value: 'bar', label: 'Cột', icon: BarChart3 }, { value: 'line', label: 'Đường' }]} /></div>
            <div className="grid gap-2 border-t border-line pt-3">
              <Input id="cr-title" placeholder="Tên báo cáo để lưu" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Button onClick={() => void savePreset()}><Save size={14} />Lưu cấu hình</Button>
              {presets.length > 0 && <div className="grid gap-0.5"><p className="m-0 mt-1 text-[11.5px] text-ink-3">Đã lưu</p>{presets.map((p) => (
                <button key={p.id} type="button" className="rounded-md px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => { if (p.config.dim) setDim(p.config.dim); if (p.config.metrics) setMetrics(p.config.metrics); if (p.config.display) setDisplay(p.config.display); if (p.config.sort) sort.setKey(p.config.sort); }}>{p.title}</button>
              ))}</div>}
            </div>
          </div>
        </ChartCard>
        <ChartCard icon={display === 'table' ? Table2 : BarChart3} title={`Theo ${dimLabel.toLowerCase()} · ${vi.format(sorted.length)} dòng`} subtitle={dim === 'employee' || dim === 'pos' ? 'Bấm tiêu đề cột để sắp xếp' : 'Theo thứ tự thời gian'}>
          {error && !r ? <ErrorBox error={error} onRetry={reload} /> : !r ? <SkeletonTable rows={6} cols={1 + metrics.length} /> : !metrics.length ? <EmptyState text="Chọn ít nhất một chỉ số." /> : !sorted.length ? <EmptyState text="Không có số trong kỳ." /> : display === 'table' ? (
            <TableWrap minWidth={320 + metrics.length * 120} maxHeight="40rem" stickyFirst>
              <table className={`tbl ${loading ? 'opacity-70' : ''}`}>
                <thead><tr><th className="text-left">{dimLabel}</th>{metrics.map((k) => dim === 'employee' || dim === 'pos' ? <SortTh key={k} k={k} label={METRICS[k].label} sort={sort} /> : <th key={k}>{METRICS[k].label}</th>)}</tr></thead>
                <tbody>{sorted.map((x) => (
                  <tr key={x.key}><td className="text-left font-medium text-ink">{x.label}</td>{metrics.map((k) => <td key={k} className="n">{METRICS[k].fmt(METRICS[k].value(x.m))}</td>)}</tr>
                ))}</tbody>
              </table>
            </TableWrap>
          ) : (
            <ChartContainer className="h-[26rem] w-full aspect-auto" config={Object.fromEntries(metrics.map((k, i) => [k, { label: METRICS[k].label, color: COLORS[i % COLORS.length] }]))}>
              {display === 'bar' ? (
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} angle={chart.length > 8 ? -35 : 0} textAnchor={chart.length > 8 ? 'end' : 'middle'} height={chart.length > 8 ? 70 : 30} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => Math.abs(v) >= 1e6 ? `${Math.round(v / 1e6)}tr` : vi.format(v)} />
                  <ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} />
                  {metrics.map((k) => <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={[4, 4, 0, 0]} />)}
                </BarChart>
              ) : (
                <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => Math.abs(v) >= 1e6 ? `${Math.round(v / 1e6)}tr` : vi.format(v)} />
                  <ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} />
                  {metrics.map((k) => <Line key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} strokeWidth={2} dot={false} />)}
                </LineChart>
              )}
            </ChartContainer>
          )}
          {display !== 'table' && metrics.length > 1 && <p className="m-0 mt-2 text-[11.5px] text-ink-3">Các chỉ số khác đơn vị (tiền, số đơn, %) dùng chung một trục; nên chọn 1–2 chỉ số cùng loại khi xem biểu đồ.</p>}
        </ChartCard>
      </div>
    </div>
  );
}
