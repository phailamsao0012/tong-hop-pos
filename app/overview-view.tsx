'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  BarChart3, CheckCircle2, ClipboardList, Coins, FileCheck2, PackageCheck, RotateCcw, ShoppingCart, Truck, Undo2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { addDays, comparePeriod, todayVn } from '@/lib/report-time';
import {
  ChartCard, DeltaPill, Donut, ErrorBox, KpiCard, MiniStat, PageHeader, Sparkline, STATUS_COLORS, STATUS_LABELS, Toolbar,
  delta, dmy, dt, money, pct, posColor, posName, short, timeOnly, vi,
} from './ui-kit';
import { fetchTargets, type TargetItem } from './targets-panel';
import { useTeam } from './team-store';
import { downloadDeck, pctText, trieu, vnMoney, vnNum, SLIDE_COLORS, type Deck } from './slide-export';

type Metrics = {
  orders: number; deletedOrders: number; gross: number; discount: number; net: number; shippingFee: number; cod: number; customers: number;
  closedOrders: number; closedGross: number; closedDiscount: number; closedNet: number; closedShippingFee: number;
  closedCustomers: number | null; closedQuantity: number; closeRate: number | null; assignedOrders: number; assignedCloseRate: number | null;
  averageOrder: number | null; deliveredAverage: number | null;
  groups: Record<'new' | 'confirmed' | 'shipping' | 'delivered' | 'returned' | 'cancelled', { orders: number; net: number }>;
};
type Period = {
  period: { start: string; end: string };
  total: Metrics;
  byPos: (Metrics & { posId: string })[];
  series: (Metrics & { bucket: string; posId: string })[];
  byEmployee: (Metrics & { sellerId: string; name: string; department: string | null; saleGroup: string | null })[];
  byProduct: { posId: string; productId: string; name: string; orders: number; quantity: number; total: number; closedQuantity: number; closedTotal: number; deliveredQuantity: number; deliveredTotal: number; returnedQuantity: number }[];
};
export type OverviewReport = {
  generatedAt: string; groupBy: 'day' | 'week' | 'month'; syncedAt: string | null;
  pos: { id: string; name: string; connected: boolean; status: string; syncedAt: string | null; historyStart: string | null; backfillDone: boolean; backfillMonth: string | null; lastError: string | null }[];
  current: Period; compare: Period | null; definitions: Record<string, string>; departments: string[];
};

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const PRESETS = { today: 'Hôm nay', yesterday: 'Hôm qua', week: '7 ngày qua', month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày qua', custom: 'Tùy chọn' };
const GROUPS = { day: 'Theo ngày', week: 'Theo tuần', month: 'Theo tháng' };
const COMPARES = { none: 'Không so sánh', previous: 'Kỳ liền trước', year: 'Cùng kỳ năm trước', custom: 'Kỳ tùy chọn' };
export function presetRange(value: string, today: string): { start: string; end: string } | null {
  if (value === 'today') return { start: today, end: today };
  if (value === 'yesterday') return { start: addDays(today, -1), end: addDays(today, -1) };
  if (value === 'week') return { start: addDays(today, -6), end: today };
  if (value === 'month') return { start: monthStart(today), end: today };
  if (value === 'lastMonth') { const e = addDays(monthStart(today), -1); return { start: monthStart(e), end: e }; }
  if (value === 'quarter') return { start: addDays(today, -89), end: today };
  return null;
}
const deltaText = (d: number | null) => d === null ? '' : d === Infinity ? 'mới' : `${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%`;

type MetricKey = 'closedNet' | 'closedOrders' | 'orders' | 'deliveredNet';
const METRIC_LABEL: Record<MetricKey, string> = { closedNet: 'Doanh thu đơn chốt', closedOrders: 'Đơn chốt', orders: 'Đơn tạo mới', deliveredNet: 'Tiền hàng giao thành công' };
const metricOf = (m: Metrics, key: MetricKey) => key === 'closedNet' ? m.closedNet : key === 'closedOrders' ? m.closedOrders : key === 'orders' ? m.orders : m.groups.delivered.net;

/** Thanh chọn kỳ + so sánh + POS, dùng chung cho các trang có kỳ. */
export function PeriodToolbar(props: {
  preset: string; start: string; end: string; groupBy?: 'day' | 'week' | 'month'; compare?: string; cstart?: string; cend?: string;
  onPreset: (v: string) => void; onStart: (v: string) => void; onEnd: (v: string) => void;
  onGroupBy?: (v: 'day' | 'week' | 'month') => void; onCompare?: (v: string) => void; onCstart?: (v: string) => void; onCend?: (v: string) => void;
  loading?: boolean; onReload?: () => void; onExport?: () => void; exportDisabled?: boolean; extra?: React.ReactNode;
}) {
  const today = todayVn();
  return (
    <Toolbar>
      <span className="px-1 text-sm font-semibold text-[#62796d]">Kỳ</span>
      <Select value={props.preset} items={PRESETS} onValueChange={(v) => props.onPreset(String(v))}>
        <SelectTrigger className="min-w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(PRESETS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
      <Input aria-label="Từ ngày" type="date" className="w-40" value={props.start} max={props.end} onChange={(e) => props.onStart(e.target.value)} />
      <span className="text-sm text-[#7d9184]">→</span>
      <Input aria-label="Đến ngày" type="date" className="w-40" value={props.end} min={props.start} max={today} onChange={(e) => props.onEnd(e.target.value)} />
      {props.groupBy && props.onGroupBy && (
        <Select value={props.groupBy} items={GROUPS} onValueChange={(v) => props.onGroupBy!(v as 'day' | 'week' | 'month')}>
          <SelectTrigger className="min-w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(GROUPS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {props.compare !== undefined && props.onCompare && (
        <>
          <span className="px-1 text-sm font-semibold text-[#62796d]">So với</span>
          <Select value={props.compare} items={COMPARES} onValueChange={(v) => props.onCompare!(String(v))}>
            <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(COMPARES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          {props.compare === 'custom' && (
            <>
              <Input aria-label="So sánh từ" type="date" className="w-40" value={props.cstart} onChange={(e) => props.onCstart?.(e.target.value)} />
              <span className="text-sm text-[#7d9184]">→</span>
              <Input aria-label="So sánh đến" type="date" className="w-40" value={props.cend} onChange={(e) => props.onCend?.(e.target.value)} />
            </>
          )}
        </>
      )}
      {props.extra}
      <div className="ml-auto flex gap-2">
        {props.onReload && <Button variant="outline" onClick={props.onReload} disabled={props.loading}><RotateCcw size={14} />{props.loading ? 'Đang tải…' : 'Tải lại'}</Button>}
        {props.onExport && <Button onClick={props.onExport} disabled={props.exportDisabled}>Xuất Excel</Button>}
      </div>
    </Toolbar>
  );
}

export function PosChips({ posIds, onChange, info }: { posIds: string[]; onChange: (v: string[]) => void; info?: OverviewReport['pos'] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-[#62796d]">POS:</span>
      {POS.map((p) => {
        const on = posIds.includes(p.id);
        const i = info?.find((x) => x.id === p.id);
        return (
          <button key={p.id} type="button"
            onClick={() => onChange(on ? (posIds.length > 1 ? posIds.filter((id) => id !== p.id) : posIds) : [...posIds, p.id])}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${on ? 'bg-white font-medium' : 'bg-[#f1f4f0] text-[#7d9184]'}`}
            style={on ? { borderColor: posColor(p.id) } : undefined}
            title={i ? `${i.status === 'connected' ? 'Đã kết nối' : i.status} · đồng bộ ${dt(i.syncedAt, true)}${i.backfillDone ? '' : i.backfillMonth ? ` · đang lấy lịch sử tháng ${i.backfillMonth}` : ' · chưa lấy lịch sử'}` : ''}>
            <span className="inline-block size-2.5 rounded-full" style={{ background: on ? posColor(p.id) : '#c3c2b7' }} />
            {p.name}
            {i && !i.backfillDone && on && <span className="text-xs text-[#a36b00]">lịch sử…</span>}
          </button>
        );
      })}
      <button type="button" className="text-sm text-primary underline" onClick={() => onChange(POS.map((p) => p.id))}>Tất cả</button>
    </div>
  );
}

export function OverviewView() {
  const today = todayVn();
  const team = useTeam();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [compare, setCompare] = useState('previous');
  const [cstart, setCstart] = useState(addDays(monthStart(today), -30));
  const [cend, setCend] = useState(addDays(monthStart(today), -1));
  const [report, setReport] = useState<OverviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('closedNet');
  const [department, setDepartment] = useState('all');
  const [departmentTouched, setDepartmentTouched] = useState(false);
  const [posSort, setPosSort] = useState<'closedNet' | 'closedOrders' | 'orders' | 'closeRate'>('closedNet');
  const [targets, setTargets] = useState<Record<string, TargetItem>>({});
  const targetMonth = start.slice(0, 7) === end.slice(0, 7) ? start.slice(0, 7) : null;
  useEffect(() => { if (targetMonth) void fetchTargets(targetMonth).then(setTargets); else setTargets({}); }, [targetMonth]);

  const applyPreset = (value: string) => {
    setPreset(value);
    const r = presetRange(value, today);
    if (r) { setStart(r.start); setEnd(r.end); }
  };
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy, compare, team });
    if (compare === 'custom') { params.set('cstart', cstart); params.set('cend', cend); }
    try {
      const response = await fetch(`/api/reports/overview?${params}`, { cache: 'no-store' });
      const result = await response.json() as OverviewReport & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Không tải được báo cáo.');
      setReport(result);
      if (!departmentTouched) {
        const sale = result.departments.find((d) => /sale/i.test(d));
        if (sale) setDepartment(sale);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được báo cáo.');
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, posIds, groupBy, compare, cstart, cend, team]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10 * 60000);
    return () => clearInterval(timer);
  }, [load]);

  const cmpRange = compare === 'custom' ? { start: cstart, end: cend } : compare === 'none' ? null : comparePeriod(start, end, compare as 'previous' | 'year');
  const isMoney = metric === 'closedNet' || metric === 'deliveredNet';

  // Chuỗi theo kỳ: mỗi bucket gồm tổng (đơn tạo, đơn chốt, chỉ số đang chọn) và từng POS; kỳ so sánh ghép theo thứ tự.
  const series = useMemo(() => {
    if (!report) return [];
    const build = (p: Period) => {
      const map = new Map<string, Record<string, number>>();
      for (const row of p.series) {
        const entry = map.get(row.bucket) ?? { total: 0, orders: 0, closedOrders: 0 };
        entry[row.posId] = (entry[row.posId] ?? 0) + metricOf(row, metric);
        entry.total += metricOf(row, metric);
        entry.orders += row.orders;
        entry.closedOrders += row.closedOrders;
        map.set(row.bucket, entry);
      }
      return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, v]) => ({ bucket, ...v } as Record<string, number | string> & { bucket: string; total: number; orders: number; closedOrders: number }));
    };
    const cur = build(report.current);
    const prev = report.compare ? build(report.compare) : [];
    return cur.map((row, i) => ({
      ...row, compare: prev[i]?.total ?? null, compareOrders: prev[i]?.orders ?? null, compareClosed: prev[i]?.closedOrders ?? null, compareBucket: prev[i]?.bucket ?? null,
    })) as (Record<string, number | string | null> & { bucket: string; total: number; orders: number; closedOrders: number; compare: number | null; compareOrders: number | null; compareClosed: number | null; compareBucket: string | null })[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, metric]);

  const sparkOf = (posId: string) => {
    if (!report) return [];
    const buckets = [...new Set(report.current.series.map((s) => s.bucket))].sort().slice(-7);
    return buckets.map((b) => report.current.series.find((s) => s.bucket === b && s.posId === posId)?.closedNet ?? 0);
  };

  const chartConfig = useMemo(() => Object.fromEntries([
    ['orders', { label: 'Đơn tạo mới', color: '#8fbfa5' }],
    ['closedOrders', { label: 'Đơn chốt', color: '#17684b' }],
    ['compareOrders', { label: 'Kỳ trước (tạo mới)', color: '#c9d9cf' }],
    ['compareClosed', { label: 'Kỳ trước (đơn chốt)', color: '#9db3a5' }],
    ['total', { label: 'Kỳ này', color: '#2a78d6' }],
    ['compare', { label: 'Kỳ so sánh', color: '#c3c2b7' }],
    ...POS.map((p) => [p.id, { label: p.name, color: posColor(p.id) }]),
  ]), []);

  const cur = report?.current.total;
  const prev = report?.compare?.total;
  const employees = (report?.current.byEmployee ?? [])
    .filter((r) => department === 'all' || (department === '__none' ? !r.department : r.department === department))
    .filter((r) => r.assignedOrders || r.closedOrders || r.orders)
    .sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1) || b.closedOrders - a.closedOrders);
  const empTotal = employees.reduce((acc, r) => ({
    orders: acc.orders + r.orders, assignedOrders: acc.assignedOrders + r.assignedOrders, closedOrders: acc.closedOrders + r.closedOrders, closedNet: acc.closedNet + r.closedNet, closedQuantity: acc.closedQuantity + r.closedQuantity,
  }), { orders: 0, assignedOrders: 0, closedOrders: 0, closedNet: 0, closedQuantity: 0 });

  const exportExcel = async () => {
    if (!report) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const cmp = report.compare;
    const metricRows = (label: string, c: Metrics, p?: Metrics) => [
      [label, 'Kỳ này', cmp ? 'Kỳ so sánh' : '', cmp ? 'Chênh lệch %' : ''],
      ...([
        ['Đơn tạo mới', 'orders'], ['Đơn chốt', 'closedOrders'], ['Doanh số (đơn chốt, chưa trừ giảm giá)', 'closedGross'], ['Giảm giá (đơn chốt)', 'closedDiscount'],
        ['Doanh thu (đơn chốt)', 'closedNet'], ['SL bán thực', 'closedQuantity'], ['Số khách (đơn chốt)', 'closedCustomers'],
        ['Phí vận chuyển (đơn chốt)', 'closedShippingFee'], ['Đơn xóa', 'deletedOrders'],
      ] as const).map(([l, k]) => [l, c[k], p ? p[k] : '', p ? deltaText(delta(Number(c[k]), Number(p[k]))) : '']),
      ['GTTB (doanh thu ÷ đơn chốt)', Math.round(c.averageOrder ?? 0), p ? Math.round(p.averageOrder ?? 0) : '', ''],
      ...(Object.entries(STATUS_LABELS) as [keyof Metrics['groups'], string][]).flatMap(([k, l]) => [
        [`${l} — đơn`, c.groups[k].orders, p ? p.groups[k].orders : '', p ? deltaText(delta(c.groups[k].orders, p.groups[k].orders)) : ''],
        [`${l} — tiền hàng thuần`, c.groups[k].net, p ? p.groups[k].net : '', p ? deltaText(delta(c.groups[k].net, p.groups[k].net)) : ''],
      ]),
    ];
    const header = [
      ['Tổng hợp POS', `Kỳ ${report.current.period.start} → ${report.current.period.end}`],
      ['POS', posIds.map(posName).join(', ')],
      ['Số liệu tính đến lúc đồng bộ', dt(report.syncedAt, true)],
      ['Xuất lúc', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
      ...(cmp ? [['Kỳ so sánh', `${cmp.period.start} → ${cmp.period.end}`]] : []),
      [],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...header, ...metricRows('Chỉ số', report.current.total, cmp?.total)]), 'Tổng quan');
    const posSheet = [['POS', 'Đơn tạo mới', 'Đơn chốt', 'Tỷ lệ chốt %', 'Doanh số', 'Doanh thu', 'GTTB', 'SL bán thực', 'Khách', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn (đơn)', 'Hủy (đơn)', 'Doanh thu kỳ so sánh', 'Chênh lệch %']];
    for (const row of report.current.byPos) {
      const p = cmp?.byPos.find((x) => x.posId === row.posId);
      posSheet.push([posName(row.posId), row.orders, row.closedOrders, row.closeRate === null ? '' : Number(row.closeRate.toFixed(1)), row.closedGross, row.closedNet,
        Math.round(row.averageOrder ?? 0), row.closedQuantity, row.closedCustomers ?? '', row.groups.delivered.orders, row.groups.delivered.net,
        row.groups.returned.orders, row.groups.cancelled.orders, p?.closedNet ?? '', p ? deltaText(delta(row.closedNet, p.closedNet)) : ''] as never);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(posSheet), 'Theo POS');
    const seriesSheet = [['Kỳ', 'Đơn tạo mới', 'Đơn chốt', METRIC_LABEL[metric], ...posIds.map(posName), 'Kỳ so sánh', 'Bucket so sánh']];
    for (const row of series) seriesSheet.push([row.bucket, row.orders, row.closedOrders, row.total, ...posIds.map((id) => row[id] ?? 0), row.compare ?? '', row.compareBucket ?? ''] as never);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(seriesSheet), 'Theo thời gian');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nhân viên', 'Bộ phận', 'Đơn chia', 'Đơn chốt', 'Tỷ lệ chốt %', 'Doanh thu', 'SL bán thực', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn (đơn)', 'Hủy (đơn)'],
      ...employees.map((r) => [r.name, r.department ?? '', r.assignedOrders, r.closedOrders, r.assignedCloseRate === null ? '' : Number(r.assignedCloseRate.toFixed(2)), r.closedNet, r.closedQuantity, r.groups.delivered.orders, r.groups.delivered.net, r.groups.returned.orders, r.groups.cancelled.orders]),
    ]), 'Nhân viên');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['POS', 'Sản phẩm', 'Số đơn', 'SL đặt', 'SL bán thực (đơn chốt)', 'Thành tiền (đơn chốt)', 'SL giao TC', 'Thành tiền giao TC', 'SL hoàn'],
      ...report.current.byProduct.map((r) => [posName(r.posId), r.name, r.orders, r.quantity, r.closedQuantity, r.closedTotal, r.deliveredQuantity, r.deliveredTotal, r.returnedQuantity]),
    ]), 'Sản phẩm');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(report.definitions).map(([k, v]) => [k, v])), 'Cách tính');
    XLSX.writeFile(wb, `tong-hop-pos_${report.current.period.start}_${report.current.period.end}.xlsx`);
  };

  const exportSlides = async () => {
    if (!report || !cur) return;
    const posLabel = posIds.length === POS.length ? 'Tất cả 6 POS' : posIds.map(posName).join(', ');
    const labels = series.map((r) => groupBy === 'month' ? r.bucket : dmy(r.bucket));
    const topPos = posRows.filter((x) => x.row);
    const deck: Deck = {
      title: 'Tổng quan POS', subtitle: `Kỳ ${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}${cmpRange ? ` · so với ${dmy(cmpRange.start)} – ${dmy(cmpRange.end)}` : ''}`,
      meta: [{ label: 'POS', value: posLabel }, { label: 'Đồng bộ lúc', value: dt(report.syncedAt, true) }, { label: 'Xuất lúc', value: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) }, { label: 'Nhóm', value: team === 'all' ? 'Tất cả' : team === 'sale' ? 'Sale' : 'CSKH' }],
      slides: [
        { title: 'Chỉ số chính', subtitle: 'Đơn chốt, doanh thu tính theo giờ chốt (như Pancake); đơn tạo và trạng thái theo ngày tạo', blocks: [
          { type: 'kpis', items: [
            { label: 'Đơn tạo mới', value: vnNum(cur.orders), delta: delta(cur.orders, prev?.orders), deltaLabel: 'so kỳ trước', note: `${cur.customers === null ? '—' : vnNum(cur.customers)} khách`, tone: 'blue' },
            { label: 'Đơn chốt', value: vnNum(cur.closedOrders), delta: delta(cur.closedOrders, prev?.closedOrders), deltaLabel: 'so kỳ trước', note: `SL bán thực ${vnNum(cur.closedQuantity)}`, tone: 'green' },
            { label: 'Doanh thu đơn chốt', value: vnMoney(cur.closedNet), delta: delta(cur.closedNet, prev?.closedNet), deltaLabel: 'so kỳ trước', note: `GTTB ${cur.averageOrder ? vnMoney(cur.averageOrder) : '—'}`, tone: 'teal' },
            { label: 'Doanh số', value: vnMoney(cur.closedGross), delta: delta(cur.closedGross, prev?.closedGross), deltaLabel: 'so kỳ trước', note: `Giảm giá ${vnMoney(cur.closedDiscount)}`, tone: 'orange' },
          ] },
          { type: 'kpis', columns: 6, items: (Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => ({ label: STATUS_LABELS[k], value: `${vnNum(cur.groups[k].orders)} đơn`, delta: delta(cur.groups[k].orders, prev?.groups[k].orders), note: vnMoney(cur.groups[k].net), tone: k === 'delivered' ? 'green' : k === 'cancelled' ? 'red' : k === 'returned' ? 'purple' : k === 'shipping' ? 'orange' : k === 'confirmed' ? 'blue' : 'gray' })) },
        ] },
        { title: 'Xu hướng theo kỳ', subtitle: `Đơn tạo mới và đơn chốt ${groupBy === 'day' ? 'theo ngày' : groupBy === 'week' ? 'theo tuần' : 'theo tháng'}${report.compare ? ' · nét đứt: kỳ so sánh' : ''}`, blocks: [
          { type: 'chart', height: 420, config: { type: 'line', data: { labels, datasets: [
            { label: 'Đơn tạo mới', data: series.map((r) => r.orders), borderColor: SLIDE_COLORS.light, backgroundColor: SLIDE_COLORS.light, tension: .3, pointRadius: 2 },
            { label: 'Đơn chốt', data: series.map((r) => r.closedOrders), borderColor: SLIDE_COLORS.green, backgroundColor: SLIDE_COLORS.green, borderWidth: 2.5, tension: .3, pointRadius: 2 },
            ...(report.compare ? [{ label: 'Kỳ trước: đơn tạo', data: series.map((r) => r.compareOrders), borderColor: '#c9d9cf', borderDash: [4, 4], pointRadius: 0, tension: .3 }, { label: 'Kỳ trước: đơn chốt', data: series.map((r) => r.compareClosed), borderColor: '#9db3a5', borderDash: [4, 4], pointRadius: 0, tension: .3 }] : []),
          ] }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } } } } },
        ] },
        { title: 'Cơ cấu trạng thái đơn', subtitle: 'Đơn tạo trong kỳ, trạng thái lúc đồng bộ', layout: 'two', blocks: [
          { type: 'chart', height: 380, config: { type: 'doughnut', data: { labels: Object.values(STATUS_LABELS), datasets: [{ data: (Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => cur.groups[k].orders), backgroundColor: (Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => STATUS_COLORS[k]), unit: 'đơn' }] }, options: { cutout: '62%', plugins: { legend: { position: 'right' } } } } },
          { type: 'list', items: (Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => ({ label: STATUS_LABELS[k], value: `${vnNum(cur.groups[k].orders)} đơn · ${vnMoney(cur.groups[k].net)}`, tone: k === 'delivered' ? 'green' : k === 'cancelled' ? 'red' : 'gray' })) },
        ] },
        { title: `${METRIC_LABEL[metric]} theo từng POS`, subtitle: isMoney ? 'Đơn vị: triệu đồng' : 'Số đơn', blocks: [
          { type: 'chart', height: 420, config: { type: 'line', data: { labels, datasets: posIds.map((id) => ({ label: posName(id), data: series.map((r) => isMoney ? trieu(Number(r[id] ?? 0)) : Number(r[id] ?? 0)), borderColor: posColor(id), backgroundColor: posColor(id), tension: .3, pointRadius: 0, unit: isMoney ? 'tr' : '' })) }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } } } } },
        ] },
        { title: 'Hiệu suất theo POS', subtitle: 'Sắp xếp theo doanh thu đơn chốt', blocks: [
          { type: 'chart', height: 260, config: { type: 'bar', data: { labels: topPos.map((x) => posName(x.id)), datasets: [{ label: 'Doanh thu đơn chốt (triệu đ)', data: topPos.map((x) => trieu(x.row!.closedNet)), backgroundColor: topPos.map((x) => posColor(x.id)), borderRadius: 6, unit: 'tr' }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } } },
          { type: 'table', columns: [{ label: 'POS' }, { label: 'Đơn tạo', align: 'right' }, { label: 'Đơn chốt', align: 'right' }, { label: 'Tỷ lệ chốt', align: 'right' }, { label: 'Doanh thu đơn chốt', align: 'right' }, { label: 'Doanh số', align: 'right' }, { label: 'GTTB', align: 'right' }, { label: 'Khách', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'Hoàn', align: 'right' }, { label: 'Hủy', align: 'right' }, { label: 'So kỳ trước', align: 'right' }],
            rows: topPos.map(({ id, row, prev: p }) => [posName(id), vnNum(row!.orders), vnNum(row!.closedOrders), pctText(row!.closeRate), vnMoney(row!.closedNet), vnMoney(row!.closedGross), row!.averageOrder ? vnMoney(row!.averageOrder) : '—', row!.closedCustomers === null ? '—' : vnNum(row!.closedCustomers), vnNum(row!.groups.delivered.orders), vnNum(row!.groups.returned.orders), vnNum(row!.groups.cancelled.orders), p ? `${delta(row!.closedNet, p.closedNet)! >= 0 ? '↑' : '↓'} ${pctText(Math.abs(delta(row!.closedNet, p.closedNet)!))}` : '—']),
            total: ['Tổng', vnNum(cur.orders), vnNum(cur.closedOrders), pctText(cur.closeRate), vnMoney(cur.closedNet), vnMoney(cur.closedGross), cur.averageOrder ? vnMoney(cur.averageOrder) : '—', cur.closedCustomers === null ? '—' : vnNum(cur.closedCustomers), vnNum(cur.groups.delivered.orders), vnNum(cur.groups.returned.orders), vnNum(cur.groups.cancelled.orders), ''] },
        ] },
        { title: 'Tỷ lệ chốt theo nhân viên', subtitle: `${department === 'all' ? 'Tất cả bộ phận' : department} · Đơn chia = đơn được giao trong kỳ; Đơn chốt theo giờ chốt; Tỷ lệ = chốt ÷ chia`, blocks: [
          { type: 'chart', height: Math.min(520, 40 + employees.slice(0, 20).length * 24), config: { type: 'bar', data: { labels: employees.slice(0, 20).map((e) => e.name), datasets: [{ label: 'Tỷ lệ chốt %', data: employees.slice(0, 20).map((e) => Number((e.assignedCloseRate ?? 0).toFixed(1))), backgroundColor: employees.slice(0, 20).map((e) => (e.assignedCloseRate ?? 0) >= 40 ? SLIDE_COLORS.green : (e.assignedCloseRate ?? 0) >= 25 ? SLIDE_COLORS.amber : SLIDE_COLORS.red), borderRadius: 4, unit: '%' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } } } },
          { type: 'table', columns: [{ label: '#' }, { label: 'Nhân viên' }, { label: 'Bộ phận' }, { label: 'Đơn chia', align: 'right' }, { label: 'Đơn chốt', align: 'right' }, { label: 'Tỷ lệ chốt', align: 'right' }, { label: 'Doanh thu', align: 'right' }, { label: 'SL bán thực', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'Hoàn / Hủy', align: 'right' }],
            rows: employees.map((r, i) => [i + 1, r.name, r.department ?? '—', vnNum(r.assignedOrders), vnNum(r.closedOrders), pctText(r.assignedCloseRate, 2), vnMoney(r.closedNet), vnNum(r.closedQuantity), vnNum(r.groups.delivered.orders), `${vnNum(r.groups.returned.orders)} / ${vnNum(r.groups.cancelled.orders)}`]),
            total: ['', 'Tổng', '', vnNum(empTotal.assignedOrders), vnNum(empTotal.closedOrders), empTotal.assignedOrders ? pctText(empTotal.closedOrders / empTotal.assignedOrders * 100, 2) : '—', vnMoney(empTotal.closedNet), vnNum(empTotal.closedQuantity), '', ''] },
        ] },
        { title: 'Sản phẩm bán chạy', subtitle: 'Thành tiền trên đơn chốt · top 25', blocks: [
          { type: 'table', columns: [{ label: '#' }, { label: 'Sản phẩm' }, { label: 'POS' }, { label: 'Đơn', align: 'right' }, { label: 'SL bán thực', align: 'right' }, { label: 'Thành tiền', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'SL hoàn', align: 'right' }],
            rows: report.current.byProduct.slice(0, 25).map((r, i) => [i + 1, r.name, posName(r.posId), vnNum(r.orders), vnNum(r.closedQuantity), vnMoney(r.closedTotal), vnNum(r.deliveredQuantity), vnNum(r.returnedQuantity)]) },
        ] },
        { title: 'Cách tính', blocks: [{ type: 'text', html: `<ul>${Object.values(report.definitions).map((v) => `<li>${v}</li>`).join('')}</ul>` }] },
      ],
    };
    await downloadDeck(deck, `slide-tong-quan_${start}_${end}`);
  };

  const posRows = (report ? posIds.map((id) => ({ id, row: report.current.byPos.find((r) => r.posId === id), prev: report.compare?.byPos.find((r) => r.posId === id) })) : [])
    .sort((a, b) => {
      const v = (x: Metrics | undefined) => !x ? -1 : posSort === 'closeRate' ? (x.closeRate ?? -1) : x[posSort];
      return v(b.row) - v(a.row);
    });
  const groupTone = { new: 'gray', confirmed: 'blue', shipping: 'orange', delivered: 'green', returned: 'purple', cancelled: 'red' } as const;
  const groupIcon = { new: ClipboardList, confirmed: FileCheck2, shipping: Truck, delivered: PackageCheck, returned: Undo2, cancelled: XCircle } as const;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}${cmpRange ? ` · so với ${dmy(cmpRange.start)} – ${dmy(cmpRange.end)}` : ''}`} title="Tổng quan POS"
        subtitle={`Số liệu Pancake POS tại thời điểm đồng bộ${report?.syncedAt ? ` · đồng bộ lúc ${timeOnly(report.syncedAt)} ${dt(report.syncedAt)}` : ''}`}
        actions={<><Button variant="outline" onClick={exportSlides} disabled={!report}>Xuất slide</Button><Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button></>} />
      <PeriodToolbar preset={preset} start={start} end={end} groupBy={groupBy} compare={compare} cstart={cstart} cend={cend}
        onPreset={applyPreset} onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }}
        onGroupBy={setGroupBy} onCompare={setCompare} onCstart={setCstart} onCend={setCend} loading={loading} onReload={() => void load()} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {report?.pos.some((p) => posIds.includes(p.id) && !p.backfillDone) && (
        <p className="text-sm text-[#a36b00]">Lịch sử cũ đang được lấy dần; số liệu các tháng trước có thể chưa đủ.</p>
      )}
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && <p className="text-sm text-[#7d9184]">Đang tải báo cáo…</p>}

      {report && cur && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
            <KpiCard icon={ShoppingCart} tone="blue" label="Đơn tạo mới" value={vi.format(cur.orders)} delta={delta(cur.orders, prev?.orders)}
              note={`${cur.customers === null ? '—' : vi.format(cur.customers)} khách · ${vi.format(cur.deletedOrders)} đơn xóa`} onClick={() => setMetric('orders')} active={metric === 'orders'} />
            <KpiCard icon={CheckCircle2} tone="green" label="Đơn chốt" value={vi.format(cur.closedOrders)} delta={delta(cur.closedOrders, prev?.closedOrders)}
              note={`${cur.closedCustomers === null ? '—' : vi.format(cur.closedCustomers)} khách · SL bán thực ${vi.format(cur.closedQuantity)}`} onClick={() => setMetric('closedOrders')} active={metric === 'closedOrders'} />
            <KpiCard icon={BarChart3} tone="teal" label="Doanh thu đơn chốt" value={money(cur.closedNet)} delta={delta(cur.closedNet, prev?.closedNet)}
              note={`GTTB ${cur.averageOrder ? money(cur.averageOrder) : '—'} · giảm giá ${money(cur.closedDiscount)}`} onClick={() => setMetric('closedNet')} active={metric === 'closedNet'} />
            <KpiCard icon={Coins} tone="orange" label="Doanh số" value={money(cur.closedGross)} delta={delta(cur.closedGross, prev?.closedGross)}
              note={`Phí ship ${money(cur.closedShippingFee)} · COD ${money(cur.cod)}`} />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
            {(Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => (
              <MiniStat key={k} icon={groupIcon[k]} tone={groupTone[k]} label={STATUS_LABELS[k]} value={`${vi.format(cur.groups[k].orders)} đơn`}
                delta={delta(cur.groups[k].orders, prev?.groups[k].orders)} invert={k === 'returned' || k === 'cancelled'} note={money(cur.groups[k].net)}
                onClick={() => k === 'delivered' && setMetric('deliveredNet')} active={k === 'delivered' && metric === 'deliveredNet'} />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ChartCard icon={BarChart3} title="Xu hướng theo kỳ" subtitle={`Đơn tạo mới và đơn chốt ${groupBy === 'day' ? 'theo ngày' : groupBy === 'week' ? 'theo tuần' : 'theo tháng'}${report.compare ? ' · nét đứt: kỳ so sánh' : ''}`}>
              <ChartContainer className="h-72 w-full aspect-auto" config={chartConfig}>
                <LineChart data={series}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => groupBy === 'month' ? v : dmy(v)} />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => vi.format(v)} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => groupBy === 'month' ? String(v) : dmy(String(v))} formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-4"><span>{chartConfig[String(name)]?.label ?? name}</span><strong>{vi.format(Number(value))}</strong></span>
                  )} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {report.compare && <Line type="monotone" dataKey="compareOrders" stroke="var(--color-compareOrders)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />}
                  {report.compare && <Line type="monotone" dataKey="compareClosed" stroke="var(--color-compareClosed)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />}
                  <Line type="monotone" dataKey="orders" stroke="var(--color-orders)" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="closedOrders" stroke="var(--color-closedOrders)" strokeWidth={2.5} dot={{ r: 2.5 }} />
                </LineChart>
              </ChartContainer>
            </ChartCard>
            <ChartCard icon={ClipboardList} title="Cơ cấu trạng thái đơn" subtitle="Đơn tạo trong kỳ, trạng thái lúc đồng bộ">
              <Donut centerValue={vi.format(cur.orders)} centerLabel="đơn hàng" size={170}
                slices={(Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => ({ key: k, label: STATUS_LABELS[k], value: cur.groups[k].orders, color: STATUS_COLORS[k] }))} />
            </ChartCard>
          </div>

          <ChartCard icon={BarChart3} title={`${METRIC_LABEL[metric]} theo ${groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng'} · từng POS`}
            subtitle="Bấm vào thẻ chỉ số phía trên để đổi chỉ số vẽ. Mỗi đường một POS, cùng kỳ.">
            <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
              <LineChart data={series}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => groupBy === 'month' ? v : dmy(v)} />
                <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => isMoney ? short(v) : vi.format(v)} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => groupBy === 'month' ? String(v) : dmy(String(v))} formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4"><span>{name === 'compare' ? 'Kỳ so sánh' : posName(String(name))}</span><strong>{isMoney ? money(Number(value)) : vi.format(Number(value))}</strong></span>
                )} />} />
                <ChartLegend content={<ChartLegendContent />} />
                {report.compare && <Line type="monotone" dataKey="compare" stroke="var(--color-compare)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />}
                {posIds.map((id) => <Line key={id} type="monotone" dataKey={id} stroke={`var(--color-${id})`} strokeWidth={2} dot={false} connectNulls />)}
              </LineChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard icon={PackageCheck} title="Hiệu suất theo POS" subtitle="So sánh hiệu quả các POS trong kỳ · đơn chốt = đã xác nhận trở đi, theo giờ chốt"
            action={
              <Select value={posSort} items={{ closedNet: 'Doanh thu đơn chốt', closedOrders: 'Đơn chốt', orders: 'Đơn tạo mới', closeRate: 'Tỷ lệ chốt' }} onValueChange={(v) => setPosSort(v as typeof posSort)}>
                <SelectTrigger className="min-w-44 text-xs"><span className="text-[#7d9184]">Sắp xếp:</span>&nbsp;<SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="closedNet">Doanh thu đơn chốt</SelectItem><SelectItem value="closedOrders">Đơn chốt</SelectItem><SelectItem value="orders">Đơn tạo mới</SelectItem><SelectItem value="closeRate">Tỷ lệ chốt</SelectItem>
                </SelectContent>
              </Select>
            }>
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="text-left text-xs text-[#7d9184]">
                  <tr><th className="py-2">#</th><th>POS</th><th className="text-right">Đơn tạo mới</th><th className="text-right">Đơn chốt</th><th className="text-right">Tỷ lệ chốt</th><th className="text-right">Doanh thu đơn chốt</th><th className="text-right">Doanh số</th><th className="text-right">GTTB</th><th className="text-right">Khách</th><th className="text-right">Giao TC</th><th className="text-right">Hoàn / Hủy</th><th>Biểu đồ 7 kỳ</th>{targetMonth && <th>Mục tiêu tháng</th>}<th className="text-right">So với kỳ trước</th></tr>
                </thead>
                <tbody>
                  {posRows.map(({ id, row, prev: p }, i) => row ? (
                    <tr key={id} className="border-t">
                      <td className="py-2.5 text-xs text-[#7d9184]">{i + 1}</td>
                      <td className="whitespace-nowrap font-medium"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(id) }} />{posName(id)}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(row.orders)}</td>
                      <td className="whitespace-nowrap text-right font-medium">{vi.format(row.closedOrders)}</td>
                      <td className="whitespace-nowrap text-right">{pct(row.closeRate)}</td>
                      <td className="whitespace-nowrap text-right font-semibold">{money(row.closedNet)}</td>
                      <td className="whitespace-nowrap text-right">{money(row.closedGross)}</td>
                      <td className="whitespace-nowrap text-right">{row.averageOrder ? money(row.averageOrder) : '—'}</td>
                      <td className="whitespace-nowrap text-right">{row.closedCustomers === null ? '—' : vi.format(row.closedCustomers)}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(row.groups.delivered.orders)} <span className="text-xs text-[#7d9184]">· {short(row.groups.delivered.net)}</span></td>
                      <td className="whitespace-nowrap text-right">{vi.format(row.groups.returned.orders)} / {vi.format(row.groups.cancelled.orders)}</td>
                      <td><Sparkline data={sparkOf(id)} color={posColor(id)} /></td>
                      {targetMonth && <td className="whitespace-nowrap">{(() => { const g = targets[`pos:${id}`]?.revenue ?? 0; if (!g) return <span className="text-xs text-[#9db3a5]">—</span>; const d = row.closedNet / g * 100; return <><span className="inline-block h-2 w-20 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, d)}%`, background: d >= 100 ? '#1a9c5b' : d >= 70 ? '#eda100' : '#d24b4b' }} /></span> <span className="text-xs font-medium">{pct(d, 0)}</span><div className="text-[11px] text-[#7d9184]">mục tiêu {short(g)} đ</div></>; })()}</td>}
                      <td className="whitespace-nowrap text-right"><DeltaPill value={delta(row.closedNet, p?.closedNet)} /></td>
                    </tr>
                  ) : (
                    <tr key={id} className="border-t text-[#7d9184]"><td className="py-2.5 text-xs">{i + 1}</td><td className="whitespace-nowrap"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(id) }} />{posName(id)}</td><td colSpan={targetMonth ? 12 : 11} className="text-right text-xs">Không có đơn trong kỳ</td></tr>
                  ))}
                  <tr className="border-t bg-[#f8faf8] font-semibold">
                    <td className="py-2.5" /><td>Tổng</td>
                    <td className="whitespace-nowrap text-right">{vi.format(cur.orders)}</td><td className="whitespace-nowrap text-right">{vi.format(cur.closedOrders)}</td>
                    <td className="whitespace-nowrap text-right">{pct(cur.closeRate)}</td><td className="whitespace-nowrap text-right">{money(cur.closedNet)}</td>
                    <td className="whitespace-nowrap text-right">{money(cur.closedGross)}</td><td className="whitespace-nowrap text-right">{cur.averageOrder ? money(cur.averageOrder) : '—'}</td>
                    <td className="whitespace-nowrap text-right">{cur.closedCustomers === null ? '—' : vi.format(cur.closedCustomers)}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(cur.groups.delivered.orders)}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(cur.groups.returned.orders)} / {vi.format(cur.groups.cancelled.orders)}</td>
                    <td />{targetMonth && <td className="whitespace-nowrap">{(() => { const g = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.revenue ?? 0), 0); return g ? <span className="text-xs">{pct(cur.closedNet / g * 100, 0)} · {short(cur.closedNet)} / {short(g)} đ</span> : <span className="text-xs text-[#9db3a5]">—</span>; })()}</td>}<td className="whitespace-nowrap text-right"><DeltaPill value={delta(cur.closedNet, prev?.closedNet)} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard icon={CheckCircle2} title="Tỷ lệ chốt theo nhân viên" subtitle="Như Thống kê → Đơn hàng → SALE trên Pancake: Đơn chia = đơn được giao trong kỳ; Đơn chốt = đơn chốt trong kỳ (theo giờ chốt); Tỷ lệ = chốt ÷ chia"
            action={
              <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(report.departments.map((d) => [d, d])), __none: 'Chưa có bộ phận' }} onValueChange={(v) => { setDepartmentTouched(true); setDepartment(String(v)); }}>
                <SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả bộ phận</SelectItem>
                  {report.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  <SelectItem value="__none">Chưa có bộ phận</SelectItem>
                </SelectContent>
              </Select>
            }>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Nhân viên</th><th>Bộ phận</th><th className="text-right">Đơn chia</th><th className="text-right">Đơn chốt</th><th className="text-right">Tỷ lệ chốt</th><th className="text-right">Doanh thu</th><th className="text-right">SL bán thực</th><th className="text-right">Giao TC</th><th className="text-right">Hoàn / Hủy</th></tr></thead>
                <tbody>
                  {employees.map((r, i) => {
                    const p = report.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
                    const rate = r.assignedCloseRate;
                    return (
                      <tr key={r.sellerId || 'none'} className="border-t">
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td>
                        <td className="whitespace-nowrap font-medium">{r.name}</td>
                        <td className="text-xs text-[#7d9184]">{r.department ?? '—'}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.assignedOrders)}</td>
                        <td className="whitespace-nowrap text-right font-medium">{vi.format(r.closedOrders)}</td>
                        <td className="whitespace-nowrap text-right"><span className="mr-2 inline-block h-2 w-16 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, rate ?? 0)}%`, background: (rate ?? 0) >= 40 ? '#1a9c5b' : (rate ?? 0) >= 25 ? '#eda100' : '#d24b4b' }} /></span>{pct(rate, 2)}</td>
                        <td className="whitespace-nowrap text-right">{money(r.closedNet)} <DeltaPill value={delta(r.closedNet, p?.closedNet)} /></td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.closedQuantity)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.groups.delivered.orders)} <span className="text-xs text-[#7d9184]">· {short(r.groups.delivered.net)}</span></td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-[#f8faf8] font-semibold">
                    <td className="py-2" /><td>Tổng</td><td />
                    <td className="whitespace-nowrap text-right">{vi.format(empTotal.assignedOrders)}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(empTotal.closedOrders)}</td>
                    <td className="whitespace-nowrap text-right">{empTotal.assignedOrders ? pct(empTotal.closedOrders / empTotal.assignedOrders * 100, 2) : '—'}</td>
                    <td className="whitespace-nowrap text-right">{money(empTotal.closedNet)}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(empTotal.closedQuantity)}</td><td /><td />
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard icon={ShoppingCart} title="Sản phẩm bán chạy" subtitle="Thành tiền = giá bán × số lượng − giảm giá dòng, tính trên đơn chốt">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Sản phẩm</th><th>POS</th><th className="text-right">Đơn</th><th className="text-right">SL bán thực</th><th className="text-right">Thành tiền</th><th>Tỷ trọng</th><th className="text-right">Giao TC</th><th className="text-right">SL hoàn</th></tr></thead>
                <tbody>
                  {report.current.byProduct.map((r, i) => {
                    const max = report.current.byProduct[0]?.closedTotal || 1;
                    return (
                      <tr key={`${r.posId}:${r.productId}`} className="border-t">
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td>
                        <td className="font-medium">{r.name}</td>
                        <td className="whitespace-nowrap text-xs text-[#7d9184]">{posName(r.posId)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.orders)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.closedQuantity)}</td>
                        <td className="whitespace-nowrap text-right font-medium">{money(r.closedTotal)}</td>
                        <td><span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${r.closedTotal / max * 100}%`, background: posColor(r.posId) }} /></span></td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.deliveredQuantity)} <span className="text-xs text-[#7d9184]">· {short(r.deliveredTotal)}</span></td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.returnedQuantity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
          <p className="text-xs text-[#7d9184]">{Object.values(report.definitions).join(' ')}</p>
        </>
      )}
    </div>
  );
}
