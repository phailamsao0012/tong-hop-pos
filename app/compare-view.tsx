'use client';

// So sánh nhân viên: hiệu suất đội ngũ (tỷ lệ chốt, đơn chia), scatter đơn chia × tỷ lệ chốt,
// góc nhìn nhanh (nổi bật / cần hỗ trợ / cân bằng data) và bảng chi tiết có sparkline.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from 'recharts';
import { Award, BarChart3, CheckCircle2, ClipboardList, Scale, Trophy, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange, type OverviewReport } from './overview-view';
import { ChartCard, DeltaPill, ErrorBox, EmptyState, KpiCard, PageHeader, Sparkline, StatusChip, delta, dmy, money, pct, posColor, vi } from './ui-kit';

type Report = OverviewReport & { current: OverviewReport['current'] & { byEmployeeDay: { sellerId: string; day: string; closedOrders: number; assignedOrders: number; closedNet: number }[] } };
type Emp = Report['current']['byEmployee'][number] & { spark: number[]; prevRate: number | null; prevClosed: number | null; tag: { tone: 'green' | 'red' | 'orange' | 'blue' | 'gray'; label: string } };
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const TARGET = 40;

export function CompareView() {
  const today = todayVn();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [department, setDepartment] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<'rate' | 'assigned' | 'closed' | 'net'>('rate');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reports/overview?${new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy: 'day', compare: 'previous' })}`, { cache: 'no-store' });
      const body = await r.json() as Report & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được báo cáo.');
      setReport(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được báo cáo.'); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, posIds]);
  useEffect(() => { void load(); }, [load]);

  const employees: Emp[] = useMemo(() => {
    if (!report) return [];
    const days = [...new Set(report.current.byEmployeeDay.map((d) => d.day))].sort().slice(-7);
    const rows = report.current.byEmployee
      .filter((r) => r.sellerId && (department === 'all' || (department === '__none' ? !r.department : r.department === department)))
      .filter((r) => r.assignedOrders || r.closedOrders);
    const rates = rows.map((r) => r.assignedCloseRate).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
    const assignedSorted = rows.map((r) => r.assignedOrders).sort((a, b) => a - b);
    const medAssigned = assignedSorted.length ? assignedSorted[Math.floor(assignedSorted.length / 2)] : 0;
    return rows.map((r) => {
      const prev = report.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
      const rate = r.assignedCloseRate ?? 0;
      const tag: Emp['tag'] = r.assignedOrders >= 10 && rate < Math.min(TARGET, median) * 0.8 ? { tone: 'red', label: 'Cần hỗ trợ' }
        : rate >= Math.max(TARGET, median) && r.assignedOrders >= medAssigned ? { tone: 'green', label: 'Hiệu suất cao' }
        : rate >= Math.max(TARGET, median) && r.assignedOrders < medAssigned ? { tone: 'blue', label: 'Chốt tốt, cần thêm data' }
        : r.assignedOrders > medAssigned * 1.5 && rate < median ? { tone: 'orange', label: 'Cân bằng data' }
        : { tone: 'gray', label: 'Duy trì' };
      return { ...r, spark: days.map((d) => report.current.byEmployeeDay.find((x) => x.sellerId === r.sellerId && x.day === d)?.closedOrders ?? 0), prevRate: prev?.assignedCloseRate ?? null, prevClosed: prev?.closedOrders ?? null, tag };
    }).sort((a, b) => sortKey === 'rate' ? (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1) : sortKey === 'assigned' ? b.assignedOrders - a.assignedOrders : sortKey === 'closed' ? b.closedOrders - a.closedOrders : b.closedNet - a.closedNet);
  }, [report, department, sortKey]);

  const active = selected.length ? employees.filter((e) => selected.includes(e.sellerId)) : employees;
  const totals = useMemo(() => {
    const assigned = active.reduce((a, r) => a + r.assignedOrders, 0), closed = active.reduce((a, r) => a + r.closedOrders, 0);
    const rates = active.map((r) => r.assignedCloseRate).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : null;
    const prevAssigned = active.reduce((a, r) => a + (report?.compare?.byEmployee.find((x) => x.sellerId === r.sellerId)?.assignedOrders ?? 0), 0);
    const prevClosed = active.reduce((a, r) => a + (r.prevClosed ?? 0), 0);
    const prevRates = active.map((r) => r.prevRate).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const prevMedian = prevRates.length ? prevRates[Math.floor(prevRates.length / 2)] : null;
    const best = [...active].filter((r) => r.assignedOrders >= 10).sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1))[0] ?? [...active].sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1))[0];
    return { assigned, closed, rate: assigned ? closed / assigned * 100 : null, median, prevAssigned, prevClosed, prevMedian, best, avgAssigned: active.length ? assigned / active.length : 0 };
  }, [active, report]);
  const chartRows = [...active].sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1)).slice(0, 15).map((e) => ({ name: e.name.length > 22 ? `${e.name.slice(0, 21)}…` : e.name, rate: Number((e.assignedCloseRate ?? 0).toFixed(1)), assigned: e.assignedOrders, id: e.sellerId }));
  const scatterRows = employees.map((e) => ({ x: e.assignedOrders, y: Number((e.assignedCloseRate ?? 0).toFixed(1)), z: e.closedNet, name: e.name, id: e.sellerId, picked: selected.includes(e.sellerId) }));
  const quick = {
    top: [...active].filter((r) => r.assignedOrders >= 10).sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1)).slice(0, 3),
    support: [...active].filter((r) => r.assignedOrders >= 10).sort((a, b) => (a.assignedCloseRate ?? 999) - (b.assignedCloseRate ?? 999)).slice(0, 3),
    balance: [...active].filter((r) => r.tag.label === 'Cân bằng data' || r.tag.label === 'Chốt tốt, cần thêm data').slice(0, 3),
  };
  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 8 ? s : [...s, id]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nhân viên', 'Bộ phận', 'Đơn chia', 'Đơn chốt', 'Tỷ lệ chốt %', 'Doanh thu đơn chốt', 'Giao TC', 'Hoàn', 'Hủy', 'Kỳ trước: tỷ lệ %', 'Kỳ trước: đơn chốt', 'Nhận xét'],
      ...active.map((r) => [r.name, r.department ?? '', r.assignedOrders, r.closedOrders, r.assignedCloseRate === null ? '' : Number(r.assignedCloseRate.toFixed(2)), r.closedNet, r.groups.delivered.orders, r.groups.returned.orders, r.groups.cancelled.orders, r.prevRate === null ? '' : Number(r.prevRate.toFixed(2)), r.prevClosed ?? '', r.tag.label]),
    ]), 'So sánh nhân viên');
    XLSX.writeFile(wb, `so-sanh-nhan-vien_${start}_${end}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)} · so với kỳ liền trước`} title="So sánh nhân viên" subtitle="Phân tích hiệu suất chốt đơn, tìm điểm mạnh và điểm cần hỗ trợ. Tỷ lệ chốt = đơn chốt ÷ đơn chia (như Pancake)."
        actions={<Button onClick={exportExcel} disabled={!report}>Xuất báo cáo</Button>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={() => void load()}
        extra={report ? (
          <>
            <span className="px-1 text-sm font-semibold text-[#62796d]">Bộ phận</span>
            <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(report.departments.map((d) => [d, d])), __none: 'Chưa có bộ phận' }} onValueChange={(v) => { setDepartment(String(v)); setSelected([]); }}>
              <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tất cả bộ phận</SelectItem>{report.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}<SelectItem value="__none">Chưa có bộ phận</SelectItem></SelectContent>
            </Select>
          </>
        ) : null} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {report && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3">
          <span className="text-sm font-semibold text-[#62796d]">So sánh nhân viên{selected.length ? ` (đã chọn ${selected.length}/8)` : ' · bấm tên trong bảng hoặc chọn ở đây'}</span>
          {selected.map((id) => { const e = employees.find((x) => x.sellerId === id); return e ? <button key={id} type="button" onClick={() => toggle(id)} className="flex items-center gap-1 rounded-full border border-[#9fc5b0] bg-[#e4f5ea] px-2.5 py-1 text-xs font-medium text-[#17684b]">{e.name}<X size={12} /></button> : null; })}
          <Select value="__pick" items={{ __pick: '+ Thêm nhân viên', ...Object.fromEntries(employees.map((e) => [e.sellerId, e.name])) }} onValueChange={(v) => { if (v && v !== '__pick') toggle(String(v)); }}>
            <SelectTrigger className="min-w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{employees.filter((e) => !selected.includes(e.sellerId)).map((e) => <SelectItem key={e.sellerId} value={e.sellerId}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
          {selected.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Bỏ chọn</Button>}
        </div>
      )}
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Users} tone="green" label="Tổng nhân sự" value={vi.format(active.length)} note={`Có đơn chia hoặc đơn chốt trong kỳ${selected.length ? ' (đang so sánh)' : ''}`} />
            <KpiCard icon={ClipboardList} tone="blue" label="Tổng đơn chia" value={vi.format(totals.assigned)} delta={delta(totals.assigned, totals.prevAssigned)} note={`Trung bình ${vi.format(Math.round(totals.avgAssigned))} đơn/người`} />
            <KpiCard icon={CheckCircle2} tone="teal" label="Tổng đơn chốt" value={vi.format(totals.closed)} delta={delta(totals.closed, totals.prevClosed)} note={`Tỷ lệ chốt chung ${pct(totals.rate)}`} />
            <KpiCard icon={BarChart3} tone="orange" label="Trung vị tỷ lệ chốt" value={pct(totals.median)} delta={totals.median !== null && totals.prevMedian !== null ? totals.median - totals.prevMedian : null} deltaLabel="điểm % so với kỳ trước" note={`Mục tiêu tham chiếu ${TARGET}%`} />
            <KpiCard icon={Trophy} tone="lime" label="Nhân viên nổi bật" value={totals.best?.name ?? '—'} note={totals.best ? `${pct(totals.best.assignedCloseRate)} (${totals.best.closedOrders} / ${totals.best.assignedOrders} đơn)` : 'Chưa đủ dữ liệu'} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
            <ChartCard icon={BarChart3} title="Hiệu suất đội ngũ" subtitle={`Tỷ lệ chốt (%) của ${chartRows.length} nhân viên cao nhất · vạch xám: trung vị ${pct(totals.median)} · vạch xanh: mục tiêu ${TARGET}%`}>
              {chartRows.length ? (
                <ChartContainer className="w-full aspect-auto" style={{ height: Math.max(220, chartRows.length * 30) }} config={{ rate: { label: 'Tỷ lệ chốt %', color: '#17684b' } }}>
                  <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 36 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={({ active: a, payload }) => a && payload?.length ? <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow"><div className="font-semibold">{payload[0].payload.name}</div><div>Tỷ lệ chốt: <strong>{payload[0].payload.rate}%</strong></div><div>Đơn chia: {vi.format(payload[0].payload.assigned)}</div></div> : null} />
                    {totals.median !== null && <ReferenceLine x={Number(totals.median.toFixed(1))} stroke="#9db3a5" strokeDasharray="4 4" />}
                    <ReferenceLine x={TARGET} stroke="#1a9c5b" strokeDasharray="4 4" />
                    <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={16}>
                      {chartRows.map((r) => <Cell key={r.id} fill={r.rate >= TARGET ? '#17684b' : r.rate >= (totals.median ?? 0) ? '#5bbf91' : '#eb6834'} />)}
                      <LabelList dataKey="rate" position="right" formatter={(v) => `${v}%`} fontSize={11} />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : <EmptyState text="Không có nhân viên có đơn trong kỳ." />}
            </ChartCard>
            <ChartCard icon={Scale} title="Số đã nhận vs. tỷ lệ chốt" subtitle="Mỗi chấm một nhân viên; kích thước theo doanh thu đơn chốt. Vạch: trung vị đơn chia và mục tiêu tỷ lệ.">
              {scatterRows.length ? (
                <ChartContainer className="h-72 w-full aspect-auto" config={{ y: { label: 'Tỷ lệ chốt', color: '#17684b' } }}>
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" name="Đơn chia" tickLine={false} axisLine={false} label={{ value: 'Đơn chia', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
                    <YAxis type="number" dataKey="y" name="Tỷ lệ chốt" domain={[0, 100]} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
                    <ZAxis type="number" dataKey="z" range={[40, 400]} />
                    <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={({ active: a, payload }) => a && payload?.length ? <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow"><div className="font-semibold">{payload[0].payload.name}</div><div>Đơn chia: {vi.format(payload[0].payload.x)} · Tỷ lệ: <strong>{payload[0].payload.y}%</strong></div><div>Doanh thu: {money(payload[0].payload.z)}</div></div> : null} />
                    <ReferenceLine y={TARGET} stroke="#1a9c5b" strokeDasharray="4 4" />
                    <ReferenceLine x={Math.round(totals.avgAssigned)} stroke="#9db3a5" strokeDasharray="4 4" />
                    <Scatter data={scatterRows} onClick={(d) => { const id = (d as { payload?: { id?: string } })?.payload?.id; if (id) toggle(id); }}>
                      {scatterRows.map((r) => <Cell key={r.id} fill={r.picked || !selected.length ? '#17684b' : '#c3d5c9'} stroke={r.picked ? '#0f3328' : 'none'} />)}
                    </Scatter>
                  </ScatterChart>
                </ChartContainer>
              ) : <EmptyState text="Không có dữ liệu." />}
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-[#547467]"><span>↖ Chốt tốt, cần thêm data</span><span className="text-right">Hiệu suất cao ↗</span><span>↙ Cần hỗ trợ, ưu tiên coaching</span><span className="text-right">Cân bằng data ↘</span></div>
            </ChartCard>
            <div className="space-y-3">
              {[
                { icon: Award, title: 'Nhân viên nổi bật', tone: 'green' as const, rows: quick.top },
                { icon: Users, title: 'Cần hỗ trợ', tone: 'red' as const, rows: quick.support },
                { icon: Scale, title: 'Cân bằng data', tone: 'orange' as const, rows: quick.balance },
              ].map((b) => (
                <ChartCard key={b.title} icon={b.icon} title={b.title} subtitle={b.title === 'Cần hỗ trợ' ? 'Tỷ lệ thấp nhất, ≥ 10 đơn chia' : b.title === 'Nhân viên nổi bật' ? 'Tỷ lệ cao nhất, ≥ 10 đơn chia' : 'Chốt tốt nhưng ít data, hoặc nhiều data chốt thấp'}>
                  {b.rows.length ? (
                    <ol className="space-y-1.5 text-sm">
                      {b.rows.map((r, i) => (
                        <li key={r.sellerId} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-[#f5faf5]" onClick={() => toggle(r.sellerId)}>
                          <span className="w-4 text-xs text-[#7d9184]">{i + 1}</span><span className="flex-1 truncate">{r.name}</span><strong>{pct(r.assignedCloseRate)}</strong><span className="text-xs text-[#7d9184]">{r.closedOrders} / {r.assignedOrders}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-xs text-[#7d9184]">Không có.</p>}
                </ChartCard>
              ))}
            </div>
          </div>
          <ChartCard icon={Users} title={`So sánh chi tiết nhân viên (${active.length} nhân viên)`} subtitle="Bấm vào tên để thêm vào nhóm so sánh. Sparkline: đơn chốt 7 ngày gần nhất trong kỳ."
            action={
              <Select value={sortKey} items={{ rate: 'Tỷ lệ chốt', assigned: 'Đơn chia', closed: 'Đơn chốt', net: 'Doanh thu' }} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
                <SelectTrigger className="min-w-40 text-xs"><span className="text-[#7d9184]">Sắp xếp:</span>&nbsp;<SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="rate">Tỷ lệ chốt</SelectItem><SelectItem value="assigned">Đơn chia</SelectItem><SelectItem value="closed">Đơn chốt</SelectItem><SelectItem value="net">Doanh thu</SelectItem></SelectContent>
              </Select>
            }>
            <div className="max-h-[36rem] overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Nhân viên</th><th>Bộ phận</th><th className="text-right">Đơn chia</th><th className="text-right">Đơn chốt</th><th className="text-right">Tỷ lệ chốt</th><th className="text-right">Kỳ trước</th><th className="text-right">Doanh thu đơn chốt</th><th className="text-right">Giao TC</th><th className="text-right">Hoàn / Hủy</th><th>7 ngày</th><th>So với mục tiêu</th><th>Nhận xét</th></tr></thead>
                <tbody>
                  {active.map((r, i) => {
                    const rate = r.assignedCloseRate ?? 0;
                    const done = Math.min(150, rate / TARGET * 100);
                    return (
                      <tr key={r.sellerId} className={`border-t ${selected.includes(r.sellerId) ? 'bg-[#f1f8f3]' : ''}`}>
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td>
                        <td className="whitespace-nowrap"><button type="button" className="flex items-center gap-2 font-medium hover:underline" onClick={() => toggle(r.sellerId)}><span className="grid size-6 place-items-center rounded-full bg-[#17684b] text-[10px] font-semibold text-white">{r.name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase()).join('')}</span>{r.name}</button></td>
                        <td className="text-xs text-[#7d9184]">{r.department ?? '—'}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.assignedOrders)}</td>
                        <td className="whitespace-nowrap text-right font-medium">{vi.format(r.closedOrders)}</td>
                        <td className="whitespace-nowrap text-right font-semibold">{pct(r.assignedCloseRate)}</td>
                        <td className="whitespace-nowrap text-right text-xs text-[#547467]">{pct(r.prevRate)} {r.assignedCloseRate !== null && r.prevRate !== null && <DeltaPill value={r.assignedCloseRate - r.prevRate} suffix=" đ%" />}</td>
                        <td className="whitespace-nowrap text-right">{money(r.closedNet)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.groups.delivered.orders)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                        <td><Sparkline data={r.spark} color={rate >= TARGET ? '#17684b' : '#eb6834'} /></td>
                        <td className="whitespace-nowrap"><span className="inline-block h-2 w-20 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, done)}%`, background: done >= 100 ? '#1a9c5b' : done >= 75 ? '#9bcf5a' : done >= 50 ? '#eda100' : '#d24b4b' }} /></span> <span className="text-xs">{Math.round(done)}%</span></td>
                        <td><StatusChip tone={r.tag.tone}>{r.tag.label}</StatusChip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#7d9184]">Nhận xét dựa trên trung vị đội ngũ và mục tiêu tham chiếu {TARGET}%: Hiệu suất cao = tỷ lệ ≥ mục tiêu với lượng đơn chia từ trung vị trở lên; Cần hỗ trợ = ≥ 10 đơn chia nhưng tỷ lệ dưới 80% trung vị; Cân bằng data = nhận nhiều hơn 150% trung vị mà tỷ lệ dưới trung vị.</p>
          </ChartCard>
        </>
      )}
    </div>
  );
}
