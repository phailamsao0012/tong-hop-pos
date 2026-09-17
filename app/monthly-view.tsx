'use client';

// Báo cáo cuối tháng: tổng kết một tháng (so với tháng trước) từ báo cáo tổng quan theo tuần.
// Mọi khoản trong thác nước tính theo ngày TẠO đơn (trạng thái lúc đồng bộ) nên cộng dồn khớp nhau.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts';
import { BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, Coins, PackageCheck, Truck, Undo2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';
import { PosChips, type OverviewReport } from './overview-view';
import { ChartCard, DeltaPill, ErrorBox, KpiCard, PageHeader, StatusChip, Toolbar, delta, dmy, dt, money, pct, posColor, posName, short, vi } from './ui-kit';

type Metrics = OverviewReport['current']['total'];
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
function endOfMonth(month: string, today: string) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
  return end > today ? today : end;
}

export function MonthlyView() {
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [report, setReport] = useState<OverviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = monthStart(`${month}-01`), end = endOfMonth(month, today);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy: 'week', compare: 'previous' });
      const response = await fetch(`/api/reports/overview?${params}`, { cache: 'no-store' });
      const result = await response.json() as OverviewReport & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Không tải được báo cáo.');
      setReport(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được báo cáo.'); }
    finally { setLoading(false); }
  }, [start, end, posIds]);
  useEffect(() => { void load(); }, [load]);

  const cur = report?.current.total, prev = report?.compare?.total;
  const returnRate = (m?: Metrics) => m && m.closedOrders ? m.groups.returned.orders / m.closedOrders * 100 : null;
  const cancelRate = (m?: Metrics) => m && m.orders ? m.groups.cancelled.orders / m.orders * 100 : null;

  // Thác nước: tiền hàng đơn tạo trong tháng → trừ dần các nhóm chưa giao thành công.
  const waterfall = useMemo(() => {
    if (!cur) return [];
    const steps = [
      { key: 'net', label: 'Tiền hàng đơn tạo', value: cur.net, kind: 'total' as const },
      { key: 'cancelled', label: 'Hủy', value: -cur.groups.cancelled.net, kind: 'minus' as const },
      { key: 'new', label: 'Mới / chờ XN', value: -cur.groups.new.net, kind: 'minus' as const },
      { key: 'confirmed', label: 'Đang xử lý', value: -cur.groups.confirmed.net, kind: 'minus' as const },
      { key: 'shipping', label: 'Đang giao', value: -cur.groups.shipping.net, kind: 'minus' as const },
      { key: 'returned', label: 'Hoàn', value: -cur.groups.returned.net, kind: 'minus' as const },
      { key: 'delivered', label: 'Giao thành công', value: cur.groups.delivered.net, kind: 'total' as const },
    ];
    let running = 0;
    return steps.map((s) => {
      if (s.kind === 'total') { running = s.value; return { ...s, base: 0, bar: s.value }; }
      const top = running; running += s.value;
      return { ...s, base: running, bar: top - running };
    });
  }, [cur]);

  const weekly = useMemo(() => {
    if (!report) return [];
    const map = new Map<string, { bucket: string; deliveredNet: number; deliveredOrders: number; closedNet: number; closedOrders: number }>();
    for (const s of report.current.series) {
      const row = map.get(s.bucket) ?? { bucket: s.bucket, deliveredNet: 0, deliveredOrders: 0, closedNet: 0, closedOrders: 0 };
      row.deliveredNet += s.groups.delivered.net; row.deliveredOrders += s.groups.delivered.orders; row.closedNet += s.closedNet; row.closedOrders += s.closedOrders;
      map.set(s.bucket, row);
    }
    return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)).map((r, i) => ({ ...r, label: `Tuần ${i + 1}`, sub: `${dmy(r.bucket)}–${dmy(addDays(r.bucket, 6) > end ? end : addDays(r.bucket, 6))}`, deliveredM: Math.round(r.deliveredNet / 1e4) / 100, closedM: Math.round(r.closedNet / 1e4) / 100 }));
  }, [report, end]);

  const byPos = (report ? posIds.map((id) => ({ id, row: report.current.byPos.find((r) => r.posId === id), prev: report.compare?.byPos.find((r) => r.posId === id) })) : [])
    .filter((x) => x.row).sort((a, b) => (b.row!.groups.delivered.net) - (a.row!.groups.delivered.net));
  const posChart = byPos.map(({ id, row }) => ({ id, name: posName(id), delivered: Math.round(row!.groups.delivered.net / 1e4) / 100, closed: Math.round(row!.closedNet / 1e4) / 100 }));
  const chartConfig = { deliveredM: { label: 'Doanh thu giao TC (triệu đ)', color: '#17684b' }, deliveredOrders: { label: 'Đơn giao TC', color: '#8fbfa5' }, closedM: { label: 'Doanh thu đơn chốt (triệu đ)', color: '#2a78d6' }, delivered: { label: 'Giao thành công', color: '#17684b' }, closed: { label: 'Đơn chốt', color: '#9fd8b8' } };
  const employees = (report?.current.byEmployee ?? []).filter((r) => r.closedOrders || r.groups.delivered.orders).sort((a, b) => b.groups.delivered.net - a.groups.delivered.net).slice(0, 30);

  const exportExcel = async () => {
    if (!report || !cur) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Báo cáo cuối tháng', month], ['POS', posIds.map(posName).join(', ')], ['Đồng bộ lúc', dt(report.syncedAt, true)], [],
      ['Chỉ số', 'Tháng này', 'Tháng trước'],
      ['Doanh thu giao thành công', cur.groups.delivered.net, prev?.groups.delivered.net ?? ''],
      ['Đơn giao thành công', cur.groups.delivered.orders, prev?.groups.delivered.orders ?? ''],
      ['GTTB đơn giao thành công', Math.round(cur.deliveredAverage ?? 0), Math.round(prev?.deliveredAverage ?? 0)],
      ['Đơn chốt', cur.closedOrders, prev?.closedOrders ?? ''], ['Doanh thu đơn chốt', cur.closedNet, prev?.closedNet ?? ''], ['Doanh số đơn chốt', cur.closedGross, prev?.closedGross ?? ''],
      ['Tỷ lệ hoàn %', returnRate(cur) ?? '', returnRate(prev) ?? ''], ['Tỷ lệ hủy %', cancelRate(cur) ?? '', cancelRate(prev) ?? ''],
      [], ['Thác nước (theo ngày tạo đơn)'], ...waterfall.map((w) => [w.label, w.value]),
    ]), 'Tổng kết');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tuần', 'Từ', 'Doanh thu giao TC', 'Đơn giao TC', 'Doanh thu đơn chốt', 'Đơn chốt'], ...weekly.map((w) => [w.label, w.bucket, w.deliveredNet, w.deliveredOrders, w.closedNet, w.closedOrders])]), 'Theo tuần');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['POS', 'Đơn tạo', 'Đơn chốt', 'Doanh thu đơn chốt', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn', 'Hủy', 'Tháng trước (giao TC)'],
      ...byPos.map(({ id, row, prev: p }) => [posName(id), row!.orders, row!.closedOrders, row!.closedNet, row!.groups.delivered.orders, row!.groups.delivered.net, row!.groups.returned.orders, row!.groups.cancelled.orders, p?.groups.delivered.net ?? ''])]), 'Theo POS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nhân viên', 'Bộ phận', 'Đơn chia', 'Đơn chốt', 'Tỷ lệ chốt %', 'Doanh thu đơn chốt', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn', 'Hủy'],
      ...employees.map((r) => [r.name, r.department ?? '', r.assignedOrders, r.closedOrders, r.assignedCloseRate ?? '', r.closedNet, r.groups.delivered.orders, r.groups.delivered.net, r.groups.returned.orders, r.groups.cancelled.orders])]), 'Nhân viên');
    XLSX.writeFile(wb, `bao-cao-thang_${month}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Báo cáo cuối tháng" subtitle="Tổng kết hiệu quả kinh doanh tháng, so với tháng trước. Số liệu Pancake POS tại thời điểm đồng bộ."
        badge={end < endOfMonth(month, '9999-12-31') ? <StatusChip tone="orange">Tháng chưa kết thúc</StatusChip> : <StatusChip tone="green">Đã khép tháng</StatusChip>}
        actions={<Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button>} />
      <Toolbar>
        <span className="px-1 text-sm font-semibold text-[#62796d]">Tháng</span>
        <Input type="month" className="w-44" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <div className="flex gap-1">
          {[0, 1, 2].map((back) => {
            const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1)).toISOString().slice(0, 7);
            return <Button key={d} size="sm" variant={month === d ? 'default' : 'outline'} onClick={() => setMonth(d)}>{back === 0 ? 'Tháng này' : back === 1 ? 'Tháng trước' : `${d.slice(5)}/${d.slice(0, 4)}`}</Button>;
          })}
        </div>
        <Button className="ml-auto" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {report && cur && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={BarChart3} tone="green" label="Doanh thu giao thành công" value={money(cur.groups.delivered.net)} delta={delta(cur.groups.delivered.net, prev?.groups.delivered.net)} deltaLabel="So với tháng trước" note={prev ? `Tháng trước: ${money(prev.groups.delivered.net)}` : undefined} />
            <KpiCard icon={PackageCheck} tone="teal" label="Đơn giao thành công" value={vi.format(cur.groups.delivered.orders)} delta={delta(cur.groups.delivered.orders, prev?.groups.delivered.orders)} deltaLabel="So với tháng trước" note={prev ? `Tháng trước: ${vi.format(prev.groups.delivered.orders)} đơn` : undefined} />
            <KpiCard icon={Coins} tone="blue" label="Giá trị trung bình đơn" value={cur.deliveredAverage ? money(cur.deliveredAverage) : '—'} delta={cur.deliveredAverage && prev?.deliveredAverage ? delta(cur.deliveredAverage, prev.deliveredAverage) : null} deltaLabel="So với tháng trước" note="Doanh thu giao TC ÷ đơn giao TC" />
            <KpiCard icon={Undo2} tone="orange" label="Tỷ lệ hoàn" value={pct(returnRate(cur))} delta={returnRate(cur) !== null && returnRate(prev) !== null ? (returnRate(cur)! - returnRate(prev)!) : null} deltaLabel="điểm % so với tháng trước" invert note={`${vi.format(cur.groups.returned.orders)} đơn hoàn / ${vi.format(cur.closedOrders)} đơn chốt`} />
            <KpiCard icon={XCircle} tone="red" label="Tỷ lệ hủy" value={pct(cancelRate(cur))} delta={cancelRate(cur) !== null && cancelRate(prev) !== null ? (cancelRate(cur)! - cancelRate(prev)!) : null} deltaLabel="điểm % so với tháng trước" invert note={`${vi.format(cur.groups.cancelled.orders)} đơn hủy / ${vi.format(cur.orders)} đơn tạo`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard icon={Coins} title="Từ tiền hàng đơn tạo đến doanh thu giao thành công" subtitle={`Bóc tách theo trạng thái hiện tại của đơn tạo trong ${month.slice(5)}/${month.slice(0, 4)} (triệu đồng)`}>
              <ChartContainer className="h-72 w-full aspect-auto" config={{ bar: { label: 'Giá trị', color: '#17684b' } }}>
                <BarChart data={waterfall.map((w) => ({ ...w, baseM: Math.round(w.base / 1e4) / 100, barM: Math.round(w.bar / 1e4) / 100 }))} barCategoryGap="22%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${vi.format(v)}`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(_v, _n, item) => <span className="flex w-full justify-between gap-4"><span>{item.payload?.label}</span><strong>{money(Number(item.payload?.value))}</strong></span>} />} />
                  <Bar dataKey="baseM" stackId="w" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="barM" stackId="w" radius={[4, 4, 0, 0]}>
                    {waterfall.map((w) => <Cell key={w.key} fill={w.kind === 'total' ? '#17684b' : '#eb6834'} />)}
                    <LabelList dataKey="value" position="top" formatter={(v) => short(Math.abs(Number(v)))} fontSize={10} fill="#547467" />
                  </Bar>
                </BarChart>
              </ChartContainer>
              <p className="mt-2 text-xs text-[#7d9184]">Cột xanh: mốc tổng; cột cam: khoản chưa thành doanh thu giao thành công. Tổng các cột cam + giao thành công = tiền hàng đơn tạo.</p>
            </ChartCard>
            <ChartCard icon={BarChart3} title="Doanh thu theo POS" subtitle="Giao thành công và đơn chốt trong tháng (triệu đồng)">
              <ChartContainer className="h-72 w-full aspect-auto" config={chartConfig}>
                <BarChart data={posChart} barGap={2}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tickLine={false} axisLine={false} width={44} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{chartConfig[String(name) as keyof typeof chartConfig]?.label ?? name}</span><strong>{vi.format(Number(value))} tr</strong></span>} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="closed" fill="var(--color-closed)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delivered" radius={[4, 4, 0, 0]}>
                    {posChart.map((p) => <Cell key={p.id} fill={posColor(p.id)} />)}
                    <LabelList dataKey="delivered" position="top" formatter={(v) => `${vi.format(Math.round(Number(v)))} tr`} fontSize={11} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard icon={CalendarDays} title="Xu hướng theo tuần" subtitle="Doanh thu giao thành công (triệu đồng) và số đơn giao thành công theo tuần trong tháng">
              <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
                <LineChart data={weekly}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickFormatter={(v: string) => v} />
                  <YAxis yAxisId="m" tickLine={false} axisLine={false} width={44} />
                  <YAxis yAxisId="n" orientation="right" tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(_l, payload) => `${payload?.[0]?.payload?.label} (${payload?.[0]?.payload?.sub})`} formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{chartConfig[String(name) as keyof typeof chartConfig]?.label ?? name}</span><strong>{vi.format(Number(value))}</strong></span>} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line yAxisId="m" type="monotone" dataKey="deliveredM" stroke="var(--color-deliveredM)" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line yAxisId="m" type="monotone" dataKey="closedM" stroke="var(--color-closedM)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  <Line yAxisId="n" type="monotone" dataKey="deliveredOrders" stroke="var(--color-deliveredOrders)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            </ChartCard>
            <ChartCard icon={ClipboardCheck} title="Đối chiếu cuối kỳ" subtitle="Kiểm tra dữ liệu trước khi chốt số">
              <ul className="space-y-2 text-sm">
                {report.pos.filter((p) => posIds.includes(p.id)).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                    <span className="flex items-center gap-2"><span className="inline-block size-2.5 rounded-full" style={{ background: posColor(p.id) }} />{p.name}<span className="text-xs text-[#7d9184]">đồng bộ {dt(p.syncedAt, true)}</span></span>
                    {p.lastError ? <StatusChip tone="red"><XCircle size={11} />Lỗi đồng bộ</StatusChip> : !p.connected ? <StatusChip tone="gray">Chưa kết nối</StatusChip> : p.backfillDone ? <StatusChip tone="green"><CheckCircle2 size={11} />Đủ lịch sử</StatusChip> : <StatusChip tone="orange">Đang lấy lịch sử {p.backfillMonth ? `${p.backfillMonth.slice(5)}/${p.backfillMonth.slice(0, 4)}` : ''}</StatusChip>}
                  </li>
                ))}
                <li className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"><span className="flex items-center gap-2"><Truck size={14} className="text-[#7d9184]" />Đơn đang giao chưa có kết quả</span><strong>{vi.format(cur.groups.shipping.orders)} đơn · {short(cur.groups.shipping.net)} đ</strong></li>
                <li className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"><span className="flex items-center gap-2"><ClipboardCheck size={14} className="text-[#7d9184]" />Đơn mới / chờ xác nhận</span><strong>{vi.format(cur.groups.new.orders)} đơn</strong></li>
                <li className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"><span className="flex items-center gap-2"><Undo2 size={14} className="text-[#7d9184]" />Giá trị đơn hoàn</span><strong>{money(cur.groups.returned.net)}</strong></li>
              </ul>
              <p className="mt-3 text-xs text-[#7d9184]">Số của tháng chỉ ổn định khi đơn đang giao đã có kết quả và các POS đã lấy đủ lịch sử.</p>
            </ChartCard>
          </div>

          <ChartCard icon={PackageCheck} title="Hiệu suất theo POS" subtitle="So với tháng trước · giao thành công theo ngày tạo đơn; đơn chốt theo giờ chốt">
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>POS</th><th className="text-right">Đơn tạo</th><th className="text-right">Đơn chốt</th><th className="text-right">Doanh thu đơn chốt</th><th className="text-right">Giao TC</th><th className="text-right">Doanh thu giao TC</th><th>Tỷ trọng</th><th className="text-right">Hoàn</th><th className="text-right">Hủy</th><th className="text-right">So với tháng trước</th></tr></thead>
                <tbody>
                  {byPos.map(({ id, row, prev: p }, i) => (
                    <tr key={id} className="border-t">
                      <td className="py-2.5 text-xs text-[#7d9184]">{i + 1}</td>
                      <td className="whitespace-nowrap font-medium"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(id) }} />{posName(id)}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(row!.orders)}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(row!.closedOrders)}</td>
                      <td className="whitespace-nowrap text-right">{money(row!.closedNet)}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(row!.groups.delivered.orders)}</td>
                      <td className="whitespace-nowrap text-right font-semibold">{money(row!.groups.delivered.net)}</td>
                      <td><span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${cur.groups.delivered.net ? row!.groups.delivered.net / cur.groups.delivered.net * 100 : 0}%`, background: posColor(id) }} /></span> <span className="text-xs text-[#7d9184]">{pct(cur.groups.delivered.net ? row!.groups.delivered.net / cur.groups.delivered.net * 100 : null)}</span></td>
                      <td className="whitespace-nowrap text-right">{vi.format(row!.groups.returned.orders)} <span className="text-xs text-[#7d9184]">({pct(returnRate(row!))})</span></td>
                      <td className="whitespace-nowrap text-right">{vi.format(row!.groups.cancelled.orders)} <span className="text-xs text-[#7d9184]">({pct(cancelRate(row!))})</span></td>
                      <td className="whitespace-nowrap text-right"><DeltaPill value={delta(row!.groups.delivered.net, p?.groups.delivered.net)} /></td>
                    </tr>
                  ))}
                  <tr className="border-t bg-[#f8faf8] font-semibold"><td className="py-2.5" /><td>Tổng</td><td className="text-right">{vi.format(cur.orders)}</td><td className="text-right">{vi.format(cur.closedOrders)}</td><td className="whitespace-nowrap text-right">{money(cur.closedNet)}</td><td className="text-right">{vi.format(cur.groups.delivered.orders)}</td><td className="whitespace-nowrap text-right">{money(cur.groups.delivered.net)}</td><td /><td className="text-right">{vi.format(cur.groups.returned.orders)}</td><td className="text-right">{vi.format(cur.groups.cancelled.orders)}</td><td className="text-right"><DeltaPill value={delta(cur.groups.delivered.net, prev?.groups.delivered.net)} /></td></tr>
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard icon={CheckCircle2} title="Hiệu suất nhân viên trong tháng" subtitle="Top 30 theo doanh thu giao thành công">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Nhân viên</th><th>Bộ phận</th><th className="text-right">Đơn chia</th><th className="text-right">Đơn chốt</th><th className="text-right">Tỷ lệ chốt</th><th className="text-right">Doanh thu đơn chốt</th><th className="text-right">Giao TC</th><th className="text-right">Doanh thu giao TC</th><th className="text-right">Hoàn / Hủy</th><th className="text-right">So với tháng trước</th></tr></thead>
                <tbody>
                  {employees.map((r, i) => {
                    const p = report.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
                    return (
                      <tr key={r.sellerId || 'none'} className="border-t">
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td><td className="whitespace-nowrap font-medium">{r.name}</td><td className="text-xs text-[#7d9184]">{r.department ?? '—'}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.assignedOrders)}</td><td className="whitespace-nowrap text-right">{vi.format(r.closedOrders)}</td><td className="whitespace-nowrap text-right">{pct(r.assignedCloseRate, 2)}</td>
                        <td className="whitespace-nowrap text-right">{money(r.closedNet)}</td><td className="whitespace-nowrap text-right">{vi.format(r.groups.delivered.orders)}</td><td className="whitespace-nowrap text-right font-semibold">{money(r.groups.delivered.net)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                        <td className="whitespace-nowrap text-right"><DeltaPill value={delta(r.groups.delivered.net, p?.groups.delivered.net)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
