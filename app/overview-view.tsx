'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { addDays, comparePeriod, todayVn } from '@/lib/report-time';

type Metrics = {
  orders: number; gross: number; discount: number; net: number; shippingFee: number; cod: number;
  customers: number; validOrders: number; validNet: number; averageOrder: number | null; deliveredAverage: number | null;
  groups: Record<'new' | 'confirmed' | 'shipping' | 'delivered' | 'returned' | 'cancelled', { orders: number; net: number }>;
};
type Period = {
  period: { start: string; end: string };
  total: Metrics;
  byPos: (Metrics & { posId: string })[];
  series: (Metrics & { bucket: string; posId: string })[];
  byEmployee: (Metrics & { sellerId: string; name: string })[];
  byProduct: { posId: string; productId: string; name: string; orders: number; quantity: number; total: number; deliveredQuantity: number; deliveredTotal: number; validTotal: number; returnedQuantity: number }[];
};
type Report = {
  generatedAt: string; groupBy: 'day' | 'week' | 'month'; syncedAt: string | null;
  pos: { id: string; name: string; connected: boolean; status: string; syncedAt: string | null; historyStart: string | null; backfillDone: boolean; backfillMonth: string | null; lastError: string | null }[];
  current: Period; compare: Period | null; definitions: Record<string, string>;
};
type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;

// Màu cố định theo thứ tự POS (bảng màu phân loại đã kiểm tra mù màu).
const POS_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
const posColor = (posId: string) => POS_COLORS[POS.findIndex((p) => p.id === posId)] ?? '#52514e';
const posName = (posId: string) => POS.find((p) => p.id === posId)?.name ?? posId;

const vi = new Intl.NumberFormat('vi-VN');
const money = (n: number) => `${vi.format(Math.round(n))} ₫`;
const short = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} tỷ` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} tr` : vi.format(Math.round(n));
const dateText = (iso: string | null) =>
  iso ? new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const delta = (a: number, b: number | undefined) => {
  if (b === undefined) return null;
  if (!b) return a ? Infinity : 0;
  return (a - b) / b * 100;
};
const deltaText = (d: number | null) =>
  d === null ? '' : d === Infinity ? 'mới' : `${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%`;
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const PRESETS = { today: 'Hôm nay', yesterday: 'Hôm qua', week: '7 ngày qua', month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày qua', custom: 'Tùy chọn' };
const GROUPS = { day: 'Theo ngày', week: 'Theo tuần', month: 'Theo tháng' };
const COMPARES = { none: 'Không so sánh', previous: 'Kỳ liền trước', year: 'Cùng kỳ năm trước', custom: 'Kỳ tùy chọn' };

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value === Infinity || value >= 0;
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${up ? 'bg-[#e5f7e8] text-[#195b35]' : 'bg-[#fdecec] text-[#a33a3a]'}`}>
      {deltaText(value)}
    </span>
  );
}

function Kpi({ label, value, sub, delta: d, onClick }: { label: string; value: string; sub?: string; delta: number | null; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border bg-white p-4 text-left shadow-[0_4px_18px_rgba(25,65,46,.03)]">
      <p className="text-xs font-medium text-[#6a8575]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}<DeltaBadge value={d} /></p>
      {sub && <p className="mt-1 text-xs text-[#7d9184]">{sub}</p>}
    </button>
  );
}

export function OverviewView({ Surface }: { Surface: SurfaceComponent }) {
  const today = todayVn();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [compare, setCompare] = useState('previous');
  const [cstart, setCstart] = useState(addDays(monthStart(today), -30));
  const [cend, setCend] = useState(addDays(monthStart(today), -1));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<'validNet' | 'validOrders' | 'deliveredNet' | 'deliveredOrders'>('validNet');

  const applyPreset = (value: string) => {
    setPreset(value);
    if (value === 'today') { setStart(today); setEnd(today); }
    if (value === 'yesterday') { setStart(addDays(today, -1)); setEnd(addDays(today, -1)); }
    if (value === 'week') { setStart(addDays(today, -6)); setEnd(today); }
    if (value === 'month') { setStart(monthStart(today)); setEnd(today); }
    if (value === 'lastMonth') {
      const first = monthStart(addDays(monthStart(today), -1));
      setStart(first); setEnd(addDays(monthStart(today), -1));
    }
    if (value === 'quarter') { setStart(addDays(today, -89)); setEnd(today); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy, compare });
    if (compare === 'custom') { params.set('cstart', cstart); params.set('cend', cend); }
    try {
      const response = await fetch(`/api/reports/overview?${params}`, { cache: 'no-store' });
      const result = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Không tải được báo cáo.');
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được báo cáo.');
    } finally { setLoading(false); }
  }, [start, end, posIds, groupBy, compare, cstart, cend]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => { void load(); }, 5 * 60000);
    return () => clearInterval(timer);
  }, [load]);

  const cmpRange = compare === 'custom' ? { start: cstart, end: cend }
    : compare === 'none' ? null : comparePeriod(start, end, compare as 'previous' | 'year');

  const metricOf = (m: Metrics) => metric === 'validNet' ? m.validNet : metric === 'validOrders' ? m.validOrders
    : metric === 'deliveredNet' ? m.groups.delivered.net : m.groups.delivered.orders;
  const metricLabel = { validNet: 'Tiền hàng thuần (đơn hợp lệ)', validOrders: 'Số đơn hợp lệ', deliveredNet: 'Tiền hàng giao thành công', deliveredOrders: 'Đơn giao thành công' }[metric];
  const isMoney = metric === 'validNet' || metric === 'deliveredNet';

  // Chuỗi theo kỳ: mỗi bucket có tổng và từng POS; kỳ so sánh ghép theo thứ tự bucket.
  const series = useMemo(() => {
    if (!report) return [];
    const build = (p: Period) => {
      const map = new Map<string, Record<string, number>>();
      for (const row of p.series) {
        const entry = map.get(row.bucket) ?? { total: 0 };
        entry[row.posId] = (entry[row.posId] ?? 0) + metricOf(row);
        entry.total += metricOf(row);
        map.set(row.bucket, entry);
      }
      return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([bucket, v]) => ({ bucket, ...v } as Record<string, number | string | null> & { bucket: string; total: number }));
    };
    const cur = build(report.current);
    const prev = report.compare ? build(report.compare) : [];
    return cur.map((row, i) => ({ ...row, compare: prev[i]?.total ?? null, compareBucket: prev[i]?.bucket ?? null })) as
      (Record<string, number | string | null> & { bucket: string; total: number; compare: number | null; compareBucket: string | null })[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, metric]);

  const chartConfig = useMemo(() => Object.fromEntries([
    ['total', { label: 'Kỳ này', color: '#2a78d6' }],
    ['compare', { label: 'Kỳ so sánh', color: '#c3c2b7' }],
    ...POS.map((p) => [p.id, { label: p.name, color: posColor(p.id) }]),
  ]), []);

  const exportExcel = async () => {
    if (!report) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const cmp = report.compare;
    const metricRows = (label: string, cur: Metrics, prev?: Metrics) => [
      [label, 'Kỳ này', cmp ? 'Kỳ so sánh' : '', cmp ? 'Chênh lệch %' : ''],
      ...([
        ['Đơn tạo', 'orders'], ['Đơn hợp lệ (trừ hủy)', 'validOrders'], ['Tổng giá trị sản phẩm', 'gross'], ['Giảm giá', 'discount'],
        ['Tiền hàng thuần (hợp lệ)', 'validNet'], ['Phí vận chuyển', 'shippingFee'], ['COD', 'cod'], ['Số khách (SĐT)', 'customers'],
      ] as const).map(([l, k]) => [l, cur[k], prev ? prev[k] : '', prev ? deltaText(delta(Number(cur[k]), Number(prev[k]))) : '']),
      ...(Object.entries({ new: 'Mới', confirmed: 'Đã xác nhận/đang xử lý', shipping: 'Đang giao', delivered: 'Giao thành công', returned: 'Hoàn', cancelled: 'Hủy' }) as [keyof Metrics['groups'], string][])
        .flatMap(([k, l]) => [
          [`${l} — đơn`, cur.groups[k].orders, prev ? prev.groups[k].orders : '', prev ? deltaText(delta(cur.groups[k].orders, prev.groups[k].orders)) : ''],
          [`${l} — tiền hàng thuần`, cur.groups[k].net, prev ? prev.groups[k].net : '', prev ? deltaText(delta(cur.groups[k].net, prev.groups[k].net)) : ''],
        ]),
    ];
    const header = [
      ['Tổng hợp POS', `Kỳ ${report.current.period.start} → ${report.current.period.end}`],
      ['POS', posIds.map(posName).join(', ')],
      ['Số liệu tính đến lúc đồng bộ', dateText(report.syncedAt)],
      ['Xuất lúc', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
      ...(cmp ? [['Kỳ so sánh', `${cmp.period.start} → ${cmp.period.end}`]] : []),
      [],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...header, ...metricRows('Chỉ số', report.current.total, cmp?.total)]), 'Tổng quan');
    const posSheet = [['POS', 'Đơn tạo', 'Đơn hợp lệ', 'Tiền hàng thuần', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn (đơn)', 'Hoàn (tiền)', 'Hủy (đơn)', 'TB/đơn', 'Khách', 'Tiền hàng kỳ so sánh', 'Chênh lệch %']];
    for (const row of report.current.byPos) {
      const prev = cmp?.byPos.find((p) => p.posId === row.posId);
      posSheet.push([posName(row.posId), row.orders, row.validOrders, row.validNet, row.groups.delivered.orders, row.groups.delivered.net,
        row.groups.returned.orders, row.groups.returned.net, row.groups.cancelled.orders, Math.round(row.averageOrder ?? 0), row.customers,
        prev?.validNet ?? '', prev ? deltaText(delta(row.validNet, prev.validNet)) : ''] as never);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(posSheet), 'Theo POS');
    const seriesSheet = [['Kỳ', 'Tổng', ...posIds.map(posName), 'Kỳ so sánh', 'Bucket so sánh']];
    for (const row of series) seriesSheet.push([row.bucket, row.total, ...posIds.map((id) => row[id] ?? 0), row.compare ?? '', row.compareBucket ?? ''] as never);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[metricLabel], ...seriesSheet]), 'Theo thời gian');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nhân viên (người bán trên đơn)', 'Đơn tạo', 'Đơn hợp lệ', 'Tiền hàng thuần', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn (đơn)', 'Hủy (đơn)', 'TB/đơn'],
      ...report.current.byEmployee.map((r) => [r.name, r.orders, r.validOrders, r.validNet, r.groups.delivered.orders, r.groups.delivered.net, r.groups.returned.orders, r.groups.cancelled.orders, Math.round(r.averageOrder ?? 0)]),
    ]), 'Nhân viên');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['POS', 'Sản phẩm', 'Số đơn', 'SL bán', 'Thành tiền (hợp lệ)', 'SL giao TC', 'Thành tiền giao TC', 'SL hoàn'],
      ...report.current.byProduct.map((r) => [posName(r.posId), r.name, r.orders, r.quantity, r.validTotal, r.deliveredQuantity, r.deliveredTotal, r.returnedQuantity]),
    ]), 'Sản phẩm');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(report.definitions).map(([k, v]) => [k, v])), 'Cách tính');
    XLSX.writeFile(wb, `tong-hop-pos_${report.current.period.start}_${report.current.period.end}.xlsx`);
  };

  const cur = report?.current.total;
  const prev = report?.compare?.total;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-[0_4px_18px_rgba(25,65,46,.03)]">
        <span className="px-2 text-sm font-semibold text-[#62796d]">Kỳ</span>
        <Select value={preset} items={PRESETS} onValueChange={(v) => applyPreset(String(v))}>
          <SelectTrigger className="min-w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(PRESETS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input aria-label="Từ ngày" type="date" className="w-40" value={start} max={end}
          onChange={(e) => { setPreset('custom'); setStart(e.target.value); }} />
        <span className="text-sm text-[#7d9184]">→</span>
        <Input aria-label="Đến ngày" type="date" className="w-40" value={end} min={start} max={today}
          onChange={(e) => { setPreset('custom'); setEnd(e.target.value); }} />
        <Select value={groupBy} items={GROUPS} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
          <SelectTrigger className="min-w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(GROUPS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="px-2 text-sm font-semibold text-[#62796d]">So với</span>
        <Select value={compare} items={COMPARES} onValueChange={(v) => setCompare(String(v))}>
          <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(COMPARES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        {compare === 'custom' && (
          <>
            <Input aria-label="So sánh từ" type="date" className="w-40" value={cstart} onChange={(e) => setCstart(e.target.value)} />
            <span className="text-sm text-[#7d9184]">→</span>
            <Input aria-label="So sánh đến" type="date" className="w-40" value={cend} onChange={(e) => setCend(e.target.value)} />
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
          <Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[#62796d]">POS:</span>
        {POS.map((p) => {
          const on = posIds.includes(p.id);
          const info = report?.pos.find((x) => x.id === p.id);
          return (
            <button key={p.id} type="button"
              onClick={() => setPosIds(on ? (posIds.length > 1 ? posIds.filter((id) => id !== p.id) : posIds) : [...posIds, p.id])}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${on ? 'bg-white font-medium' : 'bg-[#f1f4f0] text-[#7d9184]'}`}
              style={on ? { borderColor: posColor(p.id) } : undefined}
              title={info ? `${info.status === 'connected' ? 'Đã kết nối' : info.status} · đồng bộ ${dateText(info.syncedAt)}${info.backfillDone ? '' : info.backfillMonth ? ` · đang lấy lịch sử tháng ${info.backfillMonth}` : ' · chưa lấy lịch sử'}` : ''}
            >
              <span className="inline-block size-2.5 rounded-full" style={{ background: on ? posColor(p.id) : '#c3c2b7' }} />
              {p.name}
              {info && !info.backfillDone && on && <span className="text-xs text-[#a36b00]">lịch sử…</span>}
            </button>
          );
        })}
        <button type="button" className="text-sm text-primary underline" onClick={() => setPosIds(POS.map((p) => p.id))}>Tất cả</button>
      </div>

      {error && <p className="rounded-xl border border-[#f1c9c9] bg-[#fdecec] px-4 py-3 text-sm text-[#a33a3a]">{error}</p>}

      {report && cur && (
        <>
          <p className="text-sm text-[#547467]">
            Số liệu tính đến lúc đồng bộ gần nhất: <strong>{dateText(report.syncedAt)}</strong> · kỳ {report.current.period.start} → {report.current.period.end}
            {cmpRange && <> · so với {cmpRange.start} → {cmpRange.end}</>}
            {report.pos.some((p) => posIds.includes(p.id) && !p.backfillDone) && (
              <span className="ml-2 text-[#a36b00]">Lịch sử cũ đang được lấy dần; số liệu các tháng trước có thể chưa đủ.</span>
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Đơn hợp lệ (trừ hủy)" value={vi.format(cur.validOrders)} sub={`${vi.format(cur.orders)} đơn tạo · ${vi.format(cur.customers)} khách`} delta={delta(cur.validOrders, prev?.validOrders)} onClick={() => setMetric('validOrders')} />
            <Kpi label="Tiền hàng thuần (hợp lệ)" value={money(cur.validNet)} sub={`Giảm giá ${money(cur.discount)} · TB ${cur.averageOrder ? money(cur.averageOrder) : '—'}/đơn`} delta={delta(cur.validNet, prev?.validNet)} onClick={() => setMetric('validNet')} />
            <Kpi label="Giao thành công" value={money(cur.groups.delivered.net)} sub={`${vi.format(cur.groups.delivered.orders)} đơn · TB ${cur.deliveredAverage ? money(cur.deliveredAverage) : '—'}`} delta={delta(cur.groups.delivered.net, prev?.groups.delivered.net)} onClick={() => setMetric('deliveredNet')} />
            <Kpi label="Hoàn / Hủy" value={`${vi.format(cur.groups.returned.orders)} / ${vi.format(cur.groups.cancelled.orders)} đơn`} sub={`Hoàn ${money(cur.groups.returned.net)} · Hủy ${money(cur.groups.cancelled.net)}`} delta={delta(cur.groups.returned.orders + cur.groups.cancelled.orders, prev ? prev.groups.returned.orders + prev.groups.cancelled.orders : undefined)} onClick={() => setMetric('deliveredOrders')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {(Object.entries({ new: 'Mới / chờ XN', confirmed: 'Đã XN / đang xử lý', shipping: 'Đang giao', delivered: 'Giao thành công', returned: 'Hoàn', cancelled: 'Hủy' }) as [keyof Metrics['groups'], string][]).map(([k, label]) => (
              <div key={k} className="rounded-xl border bg-white px-3 py-2 text-sm">
                <span className="text-xs text-[#7d9184]">{label}</span>
                <div className="font-semibold">{vi.format(cur.groups[k].orders)} đơn<DeltaBadge value={delta(cur.groups[k].orders, prev?.groups[k].orders)} /></div>
                <div className="text-xs text-[#547467]">{money(cur.groups[k].net)}</div>
              </div>
            ))}
          </div>

          <Surface title={`${metricLabel} theo ${groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng'}`}
            description={report.compare ? 'Cột xám: kỳ so sánh, ghép theo thứ tự thời gian' : 'Bấm vào ô chỉ số phía trên để đổi chỉ số vẽ'}>
            <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
              <BarChart data={series} barGap={2}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => groupBy === 'month' ? v : v.slice(5)} />
                <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => isMoney ? short(v) : vi.format(v)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value, name, item) => (
                  <span className="flex w-full justify-between gap-4">
                    <span>{name === 'compare' ? `Kỳ so sánh${item.payload?.compareBucket ? ` (${item.payload.compareBucket})` : ''}` : 'Kỳ này'}</span>
                    <strong>{isMoney ? money(Number(value)) : vi.format(Number(value))}</strong>
                  </span>
                )} />} />
                {report.compare && <Bar dataKey="compare" fill="var(--color-compare)" radius={[4, 4, 0, 0]} />}
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </Surface>

          {posIds.length > 1 && (
            <Surface title={`${metricLabel} theo từng POS`} description="Mỗi đường một POS, cùng kỳ">
              <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
                <LineChart data={series}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => groupBy === 'month' ? v : v.slice(5)} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => isMoney ? short(v) : vi.format(v)} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-4"><span>{posName(String(name))}</span><strong>{isMoney ? money(Number(value)) : vi.format(Number(value))}</strong></span>
                  )} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {posIds.map((id) => (
                    <Line key={id} type="monotone" dataKey={id} stroke={`var(--color-${id})`} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ChartContainer>
            </Surface>
          )}

          <Surface title="Theo POS" description="Trạng thái hiện tại của đơn tại thời điểm đồng bộ; tiền hàng thuần = giá trị sản phẩm − giảm giá">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[#7d9184]">
                  <tr><th className="py-2">POS</th><th className="whitespace-nowrap text-right">Đơn tạo</th><th className="whitespace-nowrap text-right">Hợp lệ</th><th className="whitespace-nowrap text-right">Tiền hàng thuần</th>{report.compare && <th className="whitespace-nowrap text-right">Kỳ so sánh</th>}<th className="whitespace-nowrap text-right">Giao TC</th><th className="whitespace-nowrap text-right">Tiền giao TC</th><th className="whitespace-nowrap text-right">Hoàn</th><th className="whitespace-nowrap text-right">Hủy</th><th className="whitespace-nowrap text-right">TB/đơn</th><th className="whitespace-nowrap text-right">Khách</th></tr>
                </thead>
                <tbody>
                  {posIds.map((id) => {
                    const row = report.current.byPos.find((r) => r.posId === id);
                    const p = report.compare?.byPos.find((r) => r.posId === id);
                    if (!row) return <tr key={id} className="border-t text-[#7d9184]"><td className="py-2"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(id) }} />{posName(id)}</td><td colSpan={10} className="text-right">Không có đơn trong kỳ</td></tr>;
                    return (
                      <tr key={id} className="border-t">
                        <td className="py-2"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(id) }} />{posName(id)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(row.orders)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(row.validOrders)}</td>
                        <td className="whitespace-nowrap text-right font-medium">{money(row.validNet)}<DeltaBadge value={delta(row.validNet, p?.validNet)} /></td>
                        {report.compare && <td className="whitespace-nowrap text-right text-[#7d9184]">{p ? money(p.validNet) : '—'}</td>}
                        <td className="whitespace-nowrap text-right">{vi.format(row.groups.delivered.orders)}</td>
                        <td className="whitespace-nowrap text-right">{money(row.groups.delivered.net)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(row.groups.returned.orders)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(row.groups.cancelled.orders)}</td>
                        <td className="whitespace-nowrap text-right">{row.averageOrder ? money(row.averageOrder) : '—'}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(row.customers)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t font-semibold">
                    <td className="py-2">Tổng</td><td className="whitespace-nowrap text-right">{vi.format(cur.orders)}</td><td className="whitespace-nowrap text-right">{vi.format(cur.validOrders)}</td>
                    <td className="whitespace-nowrap text-right">{money(cur.validNet)}</td>{report.compare && <td className="whitespace-nowrap text-right text-[#7d9184]">{prev ? money(prev.validNet) : '—'}</td>}
                    <td className="whitespace-nowrap text-right">{vi.format(cur.groups.delivered.orders)}</td><td className="whitespace-nowrap text-right">{money(cur.groups.delivered.net)}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(cur.groups.returned.orders)}</td><td className="whitespace-nowrap text-right">{vi.format(cur.groups.cancelled.orders)}</td>
                    <td className="whitespace-nowrap text-right">{cur.averageOrder ? money(cur.averageOrder) : '—'}</td><td className="whitespace-nowrap text-right">{vi.format(cur.customers)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Surface>

          <div className="grid gap-5 xl:grid-cols-2">
            <Surface title="Theo nhân viên" description="Người bán đang gán trên đơn (assigning_seller)">
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">Nhân viên</th><th className="whitespace-nowrap text-right">Hợp lệ</th><th className="whitespace-nowrap text-right">Tiền hàng thuần</th><th className="whitespace-nowrap text-right">Giao TC</th><th className="whitespace-nowrap text-right">Hoàn/Hủy</th></tr></thead>
                  <tbody>
                    {report.current.byEmployee.map((r) => {
                      const p = report.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
                      return (
                        <tr key={r.sellerId || 'none'} className="border-t">
                          <td className="py-2">{r.name}</td>
                          <td className="whitespace-nowrap text-right">{vi.format(r.validOrders)}</td>
                          <td className="whitespace-nowrap text-right font-medium">{money(r.validNet)}<DeltaBadge value={delta(r.validNet, p?.validNet)} /></td>
                          <td className="whitespace-nowrap text-right">{vi.format(r.groups.delivered.orders)} · {money(r.groups.delivered.net)}</td>
                          <td className="whitespace-nowrap text-right">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Surface>
            <Surface title="Theo sản phẩm" description="Thành tiền = giá bán × số lượng − giảm giá dòng; theo đơn hợp lệ">
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">Sản phẩm</th><th>POS</th><th className="whitespace-nowrap text-right">Đơn</th><th className="whitespace-nowrap text-right">SL</th><th className="whitespace-nowrap text-right">Thành tiền</th><th className="whitespace-nowrap text-right">Giao TC</th></tr></thead>
                  <tbody>
                    {report.current.byProduct.map((r) => (
                      <tr key={`${r.posId}:${r.productId}`} className="border-t">
                        <td className="py-2">{r.name}</td>
                        <td className="text-xs text-[#7d9184]">{posName(r.posId)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.orders)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.quantity)}</td>
                        <td className="whitespace-nowrap text-right font-medium">{money(r.validTotal)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.deliveredQuantity)} · {money(r.deliveredTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
          </div>
          <p className="text-xs text-[#7d9184]">{Object.values(report.definitions).join(' ')}</p>
        </>
      )}
    </div>
  );
}
