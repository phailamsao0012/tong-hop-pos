'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ArrowRight, BarChart3, CalendarDays, CheckCircle2, ClipboardList, Coins, Eye, FileCheck2, PackageCheck, RotateCcw, ShoppingCart, Truck, Undo2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { COMPANY_START, addDays, comparePeriod, todayVn } from '@/lib/report-time';
import {
  ChartCard, Definitions, DeltaPill, Donut, ErrorBox, HoverReveal, KpiCard, MiniStat, PageHeader, ProgressBar, SegmentedControl, SkeletonKpis, SortTh, Sparkline,
  STATUS_COLORS, STATUS_LABELS, STATUS_VARS, TableWrap, Toolbar, Tooltip,
  delta, dmy, dt, money, pct, posColor, posName, posVar, short, shortMoney, timeOnly, toast, useMotionOK, vi, type SortState, type TipRows,
} from './ui-kit';
import { fetchTargets, type TargetItem } from './targets-panel';
import { useTeam } from './team-store';
import { scopedPos, useScope } from './access-store';
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
  byEmployee: (Metrics & { sellerId: string; name: string; department: string | null; saleGroup: string | null; assignedHidden?: boolean })[];
  byEmployeePos: (Metrics & { posId: string; sellerId: string; name: string; department: string | null; saleGroup: string | null; assignedHidden?: boolean })[];
  byProduct: { posId: string; productId: string; name: string; orders: number; quantity: number; total: number; closedQuantity: number; closedTotal: number; deliveredQuantity: number; deliveredTotal: number; returnedQuantity: number }[];
};
export type OverviewReport = {
  generatedAt: string; groupBy: 'day' | 'week' | 'month'; syncedAt: string | null;
  pos: { id: string; name: string; connected: boolean; status: string; syncedAt: string | null; historyStart: string | null; backfillDone: boolean; backfillMonth: string | null; lastError: string | null }[];
  current: Period; compare: Period | null; definitions: Record<string, string>; departments: string[];
  comparePeriod: { start: string; end: string } | null; assignedVisible?: boolean;
};

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const PRESETS = { today: 'Hôm nay', yesterday: 'Hôm qua', week: '7 ngày qua', month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày qua', all: 'Từ đầu (03/2025)', custom: 'Tùy chọn' };
// Nhãn ngắn cho bộ chọn phân đoạn trên màn hình rộng (nhãn đầy đủ nằm trong title).
const PRESET_SHORT: Record<keyof typeof PRESETS, string> = { today: 'Hôm nay', yesterday: 'Hôm qua', week: '7 ngày', month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày', all: 'Từ đầu', custom: 'Tùy chọn' };
const PRESET_OPTIONS = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => ({ value: k as string, label: PRESET_SHORT[k], title: PRESETS[k], icon: k === 'custom' ? CalendarDays : undefined }));
const GROUPS = { day: 'Theo ngày', week: 'Theo tuần', month: 'Theo tháng' };
const COMPARES = { none: 'Không so sánh', previous: 'Kỳ liền trước', year: 'Cùng kỳ năm trước', custom: 'Kỳ tùy chọn' };
export function presetRange(value: string, today: string): { start: string; end: string } | null {
  if (value === 'today') return { start: today, end: today };
  if (value === 'yesterday') return { start: addDays(today, -1), end: addDays(today, -1) };
  if (value === 'week') return { start: addDays(today, -6), end: today };
  if (value === 'month') return { start: monthStart(today), end: today };
  if (value === 'lastMonth') { const e = addDays(monthStart(today), -1); return { start: monthStart(e), end: e }; }
  if (value === 'quarter') return { start: addDays(today, -89), end: today };
  if (value === 'all') return { start: COMPANY_START, end: today };
  return null;
}
const deltaText = (d: number | null) => d === null ? '' : d === Infinity ? 'mới' : `${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%`;
/** Tiền rút gọn kèm một ký hiệu duy nhất: "7,18 tỷ ₫" (khoảng trắng không ngắt). */
/** Dòng "Chênh lệch" của tooltip KPI: "+963 tr ₫ · +3,8%". */
const diffText = (c: number, p: number, fmt: (n: number) => string) => { const d = c - p; return `${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))} · ${deltaText(delta(c, p))}`; };

type MetricKey = 'closedNet' | 'closedOrders' | 'orders' | 'deliveredNet';
const METRIC_LABEL: Record<MetricKey, string> = { closedNet: 'Doanh thu đơn chốt', closedOrders: 'Đơn chốt', orders: 'Đơn tạo mới', deliveredNet: 'Tiền hàng giao thành công' };
const metricOf = (m: Metrics, key: MetricKey) => key === 'closedNet' ? m.closedNet : key === 'closedOrders' ? m.closedOrders : key === 'orders' ? m.orders : m.groups.delivered.net;
// Cách tính ngắn gọn cho tooltip từng thẻ KPI (bản đầy đủ nằm trong "Cách tính và nguồn số liệu").
const DEFS = {
  orders: 'Đơn tạo trong kỳ, xếp theo ngày tạo đơn (giờ Việt Nam), trạng thái hiện tại lúc đồng bộ.',
  closed: 'Đơn đã bàn giao đơn vị vận chuyển (Đã gửi hàng trở đi, kể cả hoàn), xếp theo ngày chốt; không tính đơn chưa xuất kho, hủy, xóa.',
  revenue: 'Tổng tiền đơn chốt sau khi trừ giảm giá / quà tặng, chưa gồm phí vận chuyển. AOV = doanh thu ÷ đơn chốt.',
  discount: 'Giảm giá và quà tặng trên đơn chốt; khoản này đã được trừ khỏi doanh thu.',
};

/** Ô "mục tiêu" trong bảng: thanh tiến độ + % hoàn thành + dòng phụ. */
export function GoalCell({ value, goal, sub }: { value: number; goal: number; sub: string }) {
  if (!goal) return <span className="text-xs text-ink-4">—</span>;
  const d = value / goal * 100;
  return (
    <span className="inline-flex flex-col gap-0.5 align-middle">
      <span className="flex items-center gap-2"><ProgressBar value={value} max={goal} width={56} size="sm" color={d >= 100 ? 'var(--good)' : d >= 70 ? 'var(--warn)' : 'var(--bad)'} /><span className="num text-xs">{pct(d, 0)}</span></span>
      <span className="whitespace-nowrap text-[11px] font-normal text-ink-3">{sub}</span>
    </span>
  );
}

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
      <span className="px-1 text-[12.5px] font-semibold text-ink-2">Kỳ</span>
      {/* Màn hình rộng: bộ chọn phân đoạn (mũi tên ←→); màn hình hẹp: menu chọn gọn hơn. Cùng một state. */}
      <SegmentedControl<string> ariaLabel="Kỳ báo cáo" className="hidden lg:inline-flex" value={props.preset} onChange={props.onPreset} options={PRESET_OPTIONS} />
      <Select value={props.preset} items={PRESETS} onValueChange={(v) => props.onPreset(String(v))}>
        <SelectTrigger className="min-w-32 lg:hidden" aria-label="Kỳ báo cáo"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(PRESETS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
      {/* Cặp ngày đi chung một nhóm để mũi tên không bao giờ rớt thành dòng lẻ trên điện thoại. */}
      <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
        <Input aria-label="Từ ngày" type="date" className="w-auto" value={props.start} max={props.end} onChange={(e) => props.onStart(e.target.value)} />
        <ArrowRight size={14} className="shrink-0 text-ink-4" aria-hidden="true" />
        <Input aria-label="Đến ngày" type="date" className="w-auto" value={props.end} min={props.start} max={today} onChange={(e) => props.onEnd(e.target.value)} />
      </div>
      {props.groupBy && props.onGroupBy && (
        <Select value={props.groupBy} items={GROUPS} onValueChange={(v) => props.onGroupBy!(v as 'day' | 'week' | 'month')}>
          <SelectTrigger className="min-w-32" aria-label="Nhóm theo"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(GROUPS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {props.compare !== undefined && props.onCompare && (
        <>
          <span className="px-1 text-[12.5px] font-semibold text-ink-2">So với</span>
          <Select value={props.compare} items={COMPARES} onValueChange={(v) => props.onCompare!(String(v))}>
            <SelectTrigger className="min-w-40" aria-label="Kỳ so sánh"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(COMPARES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          {props.compare === 'custom' && (
            <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
              <Input aria-label="So sánh từ" type="date" className="w-auto" value={props.cstart} onChange={(e) => props.onCstart?.(e.target.value)} />
              <ArrowRight size={14} className="shrink-0 text-ink-4" aria-hidden="true" />
              <Input aria-label="So sánh đến" type="date" className="w-auto" value={props.cend} onChange={(e) => props.onCend?.(e.target.value)} />
            </div>
          )}
        </>
      )}
      {props.extra}
      <div className="ml-auto flex gap-2">
        {props.onReload && (
          <Button variant="outline" onClick={props.onReload} disabled={props.loading} aria-busy={props.loading || undefined}>
            <RotateCcw size={14} className={props.loading ? 'animate-spin' : ''} aria-hidden="true" />{props.loading ? 'Đang tải…' : 'Tải lại'}
          </Button>
        )}
        {props.onExport && <Button onClick={props.onExport} disabled={props.exportDisabled}>Xuất Excel</Button>}
      </div>
    </Toolbar>
  );
}

const CHIP_BASE = 'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-[background-color,border-color,color,box-shadow,translate] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-px hover:shadow-card active:translate-y-0 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export function PosChips({ posIds, onChange, info }: { posIds: string[]; onChange: (v: string[]) => void; info?: OverviewReport['pos'] }) {
  const scope = useScope();
  const visible = scopedPos(scope);
  if (visible.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] font-semibold text-ink-2">POS:</span>
      {visible.map((p) => {
        const on = posIds.includes(p.id);
        const i = info?.find((x) => x.id === p.id);
        // Trạng thái kết nối / đồng bộ / lịch sử hiện trong tooltip (rê chuột, focus, chạm) thay vì title chỉ hiện khi rê chuột.
        const tip = i ? (
          <>
            <b>{p.name}</b>
            <span className="r"><span>Trạng thái</span><span>{i.lastError ? 'Lỗi đồng bộ' : i.status === 'connected' ? 'Đã kết nối' : i.status}</span></span>
            <span className="r"><span>Đồng bộ</span><span className="num">{dt(i.syncedAt, true)}</span></span>
            <span className="r"><span>Lịch sử</span><span>{i.backfillDone ? 'Đã lấy đủ' : i.backfillMonth ? `đang lấy tháng ${i.backfillMonth.slice(5)}/${i.backfillMonth.slice(0, 4)}` : 'chưa lấy'}</span></span>
            {i.lastError && <span className="how block whitespace-normal">Lỗi: {i.lastError}</span>}
          </>
        ) : null;
        return (
          <Tooltip key={p.id} content={tip}>
            <button type="button" aria-pressed={on}
              onClick={() => onChange(on ? (posIds.length > 1 ? posIds.filter((id) => id !== p.id) : posIds) : [...posIds, p.id])}
              className={`${CHIP_BASE} ${on ? 'bg-surface font-medium text-ink' : 'border-line bg-surface-2 text-ink-3 hover:border-line-3 hover:text-ink-2'}`}
              style={on ? { borderColor: posVar(p.id) } : undefined}>
              <span className="inline-block size-2.5 shrink-0 rounded-full transition-colors duration-[var(--dur)]" style={{ background: on ? posVar(p.id) : 'var(--ink-4)' }} aria-hidden="true" />
              {p.name}
              {i?.lastError ? <span className="text-[11px] font-semibold text-bad">lỗi</span> : i && !i.backfillDone && on ? <span className="text-[11px] text-warn">lịch sử…</span> : null}
            </button>
          </Tooltip>
        );
      })}
      <button type="button" className="link text-[12.5px]" onClick={() => onChange(visible.map((p) => p.id))}>Tất cả</button>
    </div>
  );
}

export function OverviewView() {
  const today = todayVn();
  const team = useTeam();
  const motionOn = useMotionOK();
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
  // Bảng sản phẩm: gộp cùng tên sản phẩm ở nhiều POS thành một dòng (xem gọn) hoặc tách theo POS.
  const [mergePos, setMergePos] = useState(false);
  // Sắp xếp bảng nhân viên: bấm tiêu đề cột (hoặc chọn trên điện thoại). Mặc định: CSKH theo AOV, còn lại theo tỷ lệ chốt.
  type EmpSort = 'closeRate' | 'closedNet' | 'closedOrders' | 'assignedOrders' | 'averageOrder' | 'closedQuantity' | 'delivered' | 'returned';
  const [empSort, setEmpSort] = useState<EmpSort | null>(null);
  const [empDesc, setEmpDesc] = useState(true);
  const EMP_SORT_LABELS: Record<EmpSort, string> = { closedNet: 'Doanh thu', closeRate: 'Tỷ lệ chốt', closedOrders: 'Đơn chốt', assignedOrders: 'Đơn chia', averageOrder: 'AOV', closedQuantity: 'SL bán', delivered: 'Giao TC', returned: 'Hoàn / hủy' };
  const empSortKey: EmpSort = empSort ?? (team === 'cskh' ? 'averageOrder' : 'closeRate');
  const toggleEmpSort = (k: EmpSort) => { if (empSortKey === k) setEmpDesc((d) => !d); else { setEmpSort(k); setEmpDesc(true); } };
  // Trạng thái cho SortTh (tiêu đề cột có aria-sort, bấm được bằng bàn phím).
  const empSortState: SortState = { key: empSortKey, desc: empDesc, toggle: toggleEmpSort, mark: () => '' };
  // Tên bộ phận rút gọn để không xuống dòng trên điện thoại.
  const deptShort = (d: string | null) => !d ? '—' : /cskh|chăm sóc/i.test(d) ? 'CSKH' : /sale|bán hàng/i.test(d) ? 'Sale' : /page/i.test(d) ? 'Trực page' : /mkt|marketing/i.test(d) ? 'MKT' : /quản trị/i.test(d) ? 'Quản trị' : d.length > 14 ? `${d.slice(0, 14)}…` : d;
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
  // Mỗi lần tải hủy request trước (đổi kỳ / POS nhanh hoặc tự làm mới không đè kết quả cũ lên mới). Trả về true khi tải xong.
  const reqRef = useRef<AbortController | null>(null);
  const load = useCallback(async (): Promise<boolean> => {
    reqRef.current?.abort();
    const ctrl = new AbortController();
    reqRef.current = ctrl;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy, compare, team });
    if (compare === 'custom') { params.set('cstart', cstart); params.set('cend', cend); }
    try {
      const response = await fetch(`/api/reports/overview?${params}`, { cache: 'no-store', signal: ctrl.signal });
      const result = await response.json() as OverviewReport & { error?: string };
      if (ctrl.signal.aborted) return false;
      if (!response.ok) throw new Error(result.error ?? 'Không tải được báo cáo.');
      setReport(result);
      if (!departmentTouched) {
        const sale = result.departments.find((d) => /sale/i.test(d));
        if (sale) setDepartment(sale);
      }
      return true;
    } catch (e) {
      if (ctrl.signal.aborted) return false;
      setError(e instanceof Error ? e.message : 'Không tải được báo cáo.');
      return false;
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, posIds, groupBy, compare, cstart, cend, team]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => reqRef.current?.abort(), []);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10 * 60000);
    return () => clearInterval(timer);
  }, [load]);
  const reload = () => { void load().then((ok) => { if (ok) toast('Đã tải lại số liệu'); }); };

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
  // Sparkline trên thẻ KPI: tổng mọi POS theo bucket, 14 kỳ gần nhất (ẩn khi chỉ có một kỳ).
  const spark = useMemo(() => {
    const empty = { orders: [] as number[], closedOrders: [] as number[], closedNet: [] as number[], closedDiscount: [] as number[] };
    if (!report) return empty;
    const map = new Map<string, { orders: number; closedOrders: number; closedNet: number; closedDiscount: number }>();
    for (const s of report.current.series) {
      const e = map.get(s.bucket) ?? { orders: 0, closedOrders: 0, closedNet: 0, closedDiscount: 0 };
      e.orders += s.orders; e.closedOrders += s.closedOrders; e.closedNet += s.closedNet; e.closedDiscount += s.closedDiscount;
      map.set(s.bucket, e);
    }
    const rows = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([, v]) => v);
    return { orders: rows.map((r) => r.orders), closedOrders: rows.map((r) => r.closedOrders), closedNet: rows.map((r) => r.closedNet), closedDiscount: rows.map((r) => r.closedDiscount) };
  }, [report]);

  const chartConfig = useMemo(() => Object.fromEntries([
    ['orders', { label: 'Đơn tạo mới', color: 'var(--t-blue)' }],
    ['closedOrders', { label: 'Đơn chốt', color: 'var(--primary)' }],
    ['compareOrders', { label: 'Kỳ trước (tạo mới)', color: 'var(--line-3)' }],
    ['compareClosed', { label: 'Kỳ trước (đơn chốt)', color: 'var(--ink-4)' }],
    ['total', { label: 'Kỳ này', color: 'var(--primary)' }],
    ['compare', { label: 'Kỳ so sánh', color: 'var(--ink-4)' }],
    ...POS.map((p) => [p.id, { label: p.name, color: posVar(p.id) }]),
  ]), []);

  const cur = report?.current.total;
  const prev = report?.compare?.total;
  // Nhiều POS: tách dòng theo POS (mỗi POS chỉ có số của nhân viên POS đó); một POS: dòng của POS đó.
  const splitPos = posIds.length > 1;
  const empSource = splitPos ? (report?.current.byEmployeePos ?? []) : (report?.current.byEmployee ?? []).map((r) => ({ ...r, posId: posIds[0] ?? '' }));
  const prevEmp = (r: { sellerId: string; posId: string }) => splitPos ? report?.compare?.byEmployeePos.find((x) => x.sellerId === r.sellerId && x.posId === r.posId) : report?.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
  const cmpLabel = report?.comparePeriod ? `so với ${dmy(report.comparePeriod.start)}–${dmy(report.comparePeriod.end)}` : 'so kỳ trước';
  const employees = empSource
    .filter((r) => department === 'all' || (department === '__none' ? !r.department : r.department === department))
    .filter((r) => r.assignedOrders || r.closedOrders || r.orders)
    .sort((a, b) => {
      const v = (r: typeof a): number => empSortKey === 'closeRate' ? (r.assignedCloseRate ?? -1) : empSortKey === 'averageOrder' ? (r.averageOrder ?? 0) : empSortKey === 'delivered' ? r.groups.delivered.orders : empSortKey === 'returned' ? r.groups.returned.orders + r.groups.cancelled.orders : r[empSortKey];
      const posOrder = splitPos ? POS.findIndex((x) => x.id === a.posId) - POS.findIndex((x) => x.id === b.posId) : 0;
      return posOrder || (empDesc ? v(b) - v(a) : v(a) - v(b)) || b.closedNet - a.closedNet;
    });
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
        ['Đơn tạo mới', 'orders'], ['Đơn chốt', 'closedOrders'], ['Giảm giá / quà tặng (đơn chốt, đã trừ khỏi doanh thu)', 'closedDiscount'],
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
    const posSheet = [['POS', 'Đơn tạo mới', 'Đơn chốt', 'Tỷ lệ chốt %', 'Doanh thu', 'GTTB', 'SL bán thực', 'Khách', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn (đơn)', 'Hủy (đơn)', 'Doanh thu kỳ so sánh', 'Chênh lệch %']];
    for (const row of report.current.byPos) {
      const p = cmp?.byPos.find((x) => x.posId === row.posId);
      posSheet.push([posName(row.posId), row.orders, row.closedOrders, row.closeRate === null ? '' : Number(row.closeRate.toFixed(1)), row.closedNet,
        Math.round(row.averageOrder ?? 0), row.closedQuantity, row.closedCustomers ?? '', row.groups.delivered.orders, row.groups.delivered.net,
        row.groups.returned.orders, row.groups.cancelled.orders, p?.closedNet ?? '', p ? deltaText(delta(row.closedNet, p.closedNet)) : ''] as never);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(posSheet), 'Theo POS');
    const seriesSheet = [['Kỳ', 'Đơn tạo mới', 'Đơn chốt', METRIC_LABEL[metric], ...posIds.map(posName), 'Kỳ so sánh', 'Bucket so sánh']];
    for (const row of series) seriesSheet.push([row.bucket, row.orders, row.closedOrders, row.total, ...posIds.map((id) => row[id] ?? 0), row.compare ?? '', row.compareBucket ?? ''] as never);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(seriesSheet), 'Theo thời gian');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nhân viên', 'POS', 'Bộ phận', 'Đơn chia', 'Đơn chốt', 'Tỷ lệ chốt %', 'Doanh thu', 'SL bán thực', 'Giao TC (đơn)', 'Giao TC (tiền)', 'Hoàn (đơn)', 'Hủy (đơn)'],
      ...employees.map((r) => [r.name, posName(r.posId), r.department ?? '', r.assignedHidden ? '' : r.assignedOrders, r.closedOrders, r.assignedCloseRate === null ? '' : Number(r.assignedCloseRate.toFixed(2)), r.closedNet, r.closedQuantity, r.groups.delivered.orders, r.groups.delivered.net, r.groups.returned.orders, r.groups.cancelled.orders]),
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
            { label: 'Đơn tạo mới', value: vnNum(cur.orders), delta: delta(cur.orders, prev?.orders), deltaLabel: cmpLabel, note: `${cur.customers === null ? '—' : vnNum(cur.customers)} khách`, tone: 'blue' },
            { label: 'Đơn chốt', value: vnNum(cur.closedOrders), delta: delta(cur.closedOrders, prev?.closedOrders), deltaLabel: cmpLabel, note: `SL bán thực ${vnNum(cur.closedQuantity)}`, tone: 'green' },
            { label: 'Doanh thu đơn chốt', value: vnMoney(cur.closedNet), delta: delta(cur.closedNet, prev?.closedNet), deltaLabel: cmpLabel, note: `GTTB ${cur.averageOrder ? vnMoney(cur.averageOrder) : '—'}`, tone: 'teal' },
            { label: 'Giao thành công', value: vnMoney(cur.groups.delivered.net), delta: delta(cur.groups.delivered.net, prev?.groups.delivered.net), deltaLabel: cmpLabel, note: `${vnNum(cur.groups.delivered.orders)} đơn`, tone: 'orange' },
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
          { type: 'table', columns: [{ label: 'POS' }, { label: 'Đơn tạo', align: 'right' }, { label: 'Đơn chốt', align: 'right' }, { label: 'Tỷ lệ chốt', align: 'right' }, { label: 'Doanh thu đơn chốt', align: 'right' }, { label: 'GTTB', align: 'right' }, { label: 'Khách', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'Hoàn', align: 'right' }, { label: 'Hủy', align: 'right' }, { label: 'So kỳ trước', align: 'right' }],
            rows: topPos.map(({ id, row, prev: p }) => [posName(id), vnNum(row!.orders), vnNum(row!.closedOrders), pctText(row!.closeRate), vnMoney(row!.closedNet), row!.averageOrder ? vnMoney(row!.averageOrder) : '—', row!.closedCustomers === null ? '—' : vnNum(row!.closedCustomers), vnNum(row!.groups.delivered.orders), vnNum(row!.groups.returned.orders), vnNum(row!.groups.cancelled.orders), p ? `${delta(row!.closedNet, p.closedNet)! >= 0 ? '↑' : '↓'} ${pctText(Math.abs(delta(row!.closedNet, p.closedNet)!))}` : '—']),
            total: ['Tổng', vnNum(cur.orders), vnNum(cur.closedOrders), pctText(cur.closeRate), vnMoney(cur.closedNet), cur.averageOrder ? vnMoney(cur.averageOrder) : '—', cur.closedCustomers === null ? '—' : vnNum(cur.closedCustomers), vnNum(cur.groups.delivered.orders), vnNum(cur.groups.returned.orders), vnNum(cur.groups.cancelled.orders), ''] },
        ] },
        { title: 'Tỷ lệ chốt theo nhân viên', subtitle: `${department === 'all' ? 'Tất cả bộ phận' : department} · Đơn chia = đơn được giao trong kỳ; Đơn chốt theo giờ chốt; Tỷ lệ = chốt ÷ chia`, blocks: [
          { type: 'chart', height: Math.min(520, 40 + employees.slice(0, 20).length * 24), config: { type: 'bar', data: { labels: employees.slice(0, 20).map((e) => e.name), datasets: [{ label: 'Tỷ lệ chốt %', data: employees.slice(0, 20).map((e) => Number((e.assignedCloseRate ?? 0).toFixed(1))), backgroundColor: employees.slice(0, 20).map((e) => (e.assignedCloseRate ?? 0) >= 40 ? SLIDE_COLORS.green : (e.assignedCloseRate ?? 0) >= 25 ? SLIDE_COLORS.amber : SLIDE_COLORS.red), borderRadius: 4, unit: '%' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } } } },
          { type: 'table', columns: [{ label: '#' }, { label: 'Nhân viên' }, { label: 'Bộ phận' }, { label: 'Đơn chia', align: 'right' }, { label: 'Đơn chốt', align: 'right' }, { label: 'Tỷ lệ chốt', align: 'right' }, { label: 'Doanh thu', align: 'right' }, { label: 'SL bán thực', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'Hoàn / Hủy', align: 'right' }],
            rows: employees.map((r, i) => [i + 1, splitPos ? `${r.name} · ${posName(r.posId)}` : r.name, r.department ?? '—', r.assignedHidden ? '—' : vnNum(r.assignedOrders), vnNum(r.closedOrders), pctText(r.assignedCloseRate, 2), vnMoney(r.closedNet), vnNum(r.closedQuantity), vnNum(r.groups.delivered.orders), `${vnNum(r.groups.returned.orders)} / ${vnNum(r.groups.cancelled.orders)}`]),
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
  const goal = targetMonth ? posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.revenue ?? 0), 0) : 0;

  // Tooltip KPI: kỳ này / kỳ so sánh / chênh lệch / cách tính.
  const periodLabel = `${dmy(start)}–${dmy(end)}`;
  const prevLabel = cmpRange ? `Kỳ so sánh ${dmy(cmpRange.start)}–${dmy(cmpRange.end)}` : 'Kỳ so sánh';
  const tipOf = (c: number, p: number | null | undefined, fmt: (n: number) => string, definition: string): TipRows => ({
    period: periodLabel, current: fmt(c),
    previous: p === null || p === undefined ? undefined : fmt(p), previousLabel: prevLabel,
    diff: p === null || p === undefined ? undefined : diffText(c, p, fmt), definition,
  });
  const fmtInt = (n: number) => vi.format(Math.round(n));
  const rateColor = (rate: number | null) => (rate ?? 0) >= 40 ? 'var(--good)' : (rate ?? 0) >= 25 ? 'var(--warn)' : 'var(--bad)';
  const revealOnPhone = 'max-sm:opacity-100 max-sm:transform-none';

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}${cmpRange ? ` · so với ${dmy(cmpRange.start)} – ${dmy(cmpRange.end)}` : ''}`} title="Tổng quan POS"
        subtitle={`Số liệu Pancake${report?.syncedAt ? ` · đồng bộ ${timeOnly(report.syncedAt)} ${dt(report.syncedAt)}` : ''}`}
        actions={<><Button variant="outline" onClick={exportSlides} disabled={!report}>Xuất slide</Button><Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button></>} />
      <PeriodToolbar preset={preset} start={start} end={end} groupBy={groupBy} compare={compare} cstart={cstart} cend={cend}
        onPreset={applyPreset} onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }}
        onGroupBy={setGroupBy} onCompare={setCompare} onCstart={setCstart} onCend={setCend} loading={loading} onReload={reload} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {report?.pos.some((p) => posIds.includes(p.id) && !p.backfillDone) && (
        <p className="notice warn">Lịch sử cũ đang được lấy dần; số liệu các tháng trước có thể chưa đủ.</p>
      )}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!report && !error && (
        <>
          <SkeletonKpis count={4} className="xl:grid-cols-4" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" aria-busy="true">
            <ChartCard icon={BarChart3} title="Xu hướng" loading><div className="h-72" /></ChartCard>
            <ChartCard icon={ClipboardList} title="Trạng thái đơn" loading><div className="h-72" /></ChartCard>
          </div>
        </>
      )}

      {report && cur && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-busy={loading || undefined}>
            <KpiCard icon={ShoppingCart} tone="blue" label="Đơn tạo mới" value={vi.format(cur.orders)} countUp rawValue={cur.orders} format={fmtInt}
              delta={delta(cur.orders, prev?.orders)} deltaLabel={cmpLabel} note={`${cur.customers === null ? '—' : vi.format(cur.customers)} khách`}
              tooltip={tipOf(cur.orders, prev?.orders, fmtInt, DEFS.orders)} sparkline={spark.orders}
              onClick={() => setMetric('orders')} active={metric === 'orders'} />
            <KpiCard icon={CheckCircle2} tone="green" label="Đơn chốt" value={vi.format(cur.closedOrders)} countUp rawValue={cur.closedOrders} format={fmtInt}
              delta={delta(cur.closedOrders, prev?.closedOrders)} deltaLabel={cmpLabel}
              note={`${cur.closedCustomers === null ? '—' : vi.format(cur.closedCustomers)} khách · ${vi.format(cur.closedQuantity)} sp`}
              tooltip={tipOf(cur.closedOrders, prev?.closedOrders, fmtInt, DEFS.closed)} sparkline={spark.closedOrders}
              onClick={() => setMetric('closedOrders')} active={metric === 'closedOrders'} />
            <KpiCard icon={BarChart3} tone="teal" label="Doanh thu đơn chốt" value={short(cur.closedNet)} unit="₫" countUp rawValue={cur.closedNet} format={short}
              delta={delta(cur.closedNet, prev?.closedNet)} deltaLabel={cmpLabel}
              note={`AOV ${cur.averageOrder ? money(cur.averageOrder) : '—'}${goal ? ` · ${pct(cur.closedNet / goal * 100, 0)} mục tiêu ${shortMoney(goal)}` : ''}`}
              tooltip={tipOf(cur.closedNet, prev?.closedNet, money, DEFS.revenue)} sparkline={spark.closedNet}
              progress={goal ? { value: cur.closedNet, max: goal } : undefined}
              onClick={() => setMetric('closedNet')} active={metric === 'closedNet'} />
            <KpiCard icon={Coins} tone="orange" label="Giảm giá / quà tặng" value={short(cur.closedDiscount)} unit="₫" countUp rawValue={cur.closedDiscount} format={short}
              delta={delta(cur.closedDiscount, prev?.closedDiscount)} deltaLabel={cmpLabel} note="Đã trừ khỏi doanh thu"
              tooltip={tipOf(cur.closedDiscount, prev?.closedDiscount, money, DEFS.discount)} sparkline={spark.closedDiscount} />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-[repeat(auto-fit,minmax(228px,1fr))]">
            {(Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => (
              <MiniStat key={k} icon={groupIcon[k]} tone={groupTone[k]} label={STATUS_LABELS[k]} value={`${vi.format(cur.groups[k].orders)} đơn`}
                delta={['delivered', 'returned', 'cancelled'].includes(k) ? delta(cur.groups[k].orders, prev?.groups[k].orders) : null} invert={k === 'returned' || k === 'cancelled'} note={money(cur.groups[k].net)}
                onClick={k === 'delivered' ? () => setMetric('deliveredNet') : undefined} active={k === 'delivered' ? metric === 'deliveredNet' : undefined} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ChartCard icon={BarChart3} title="Xu hướng" subtitle={`Đơn tạo và đơn chốt ${groupBy === 'day' ? 'theo ngày' : groupBy === 'week' ? 'theo tuần' : 'theo tháng'}${report.compare ? ' · nét đứt: kỳ trước' : ''}`}>
              <ChartContainer className="h-72 w-full aspect-auto" config={chartConfig}>
                <LineChart data={series}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => groupBy === 'month' ? v : dmy(v)} />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => vi.format(v)} />
                  <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={<ChartTooltipContent labelFormatter={(v) => groupBy === 'month' ? String(v) : dmy(String(v))} formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-4"><span>{chartConfig[String(name)]?.label ?? name}</span><strong className="num">{vi.format(Number(value))}</strong></span>
                  )} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {report.compare && <Line type="monotone" dataKey="compareOrders" stroke="var(--color-compareOrders)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3.5, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls isAnimationActive={motionOn} />}
                  {report.compare && <Line type="monotone" dataKey="compareClosed" stroke="var(--color-compareClosed)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3.5, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls isAnimationActive={motionOn} />}
                  <Line type="monotone" dataKey="orders" stroke="var(--color-orders)" strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={motionOn} />
                  <Line type="monotone" dataKey="closedOrders" stroke="var(--color-closedOrders)" strokeWidth={2.5} strokeLinecap="round" dot={false} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={motionOn} />
                </LineChart>
              </ChartContainer>
            </ChartCard>
            <ChartCard icon={ClipboardList} title="Trạng thái đơn" subtitle="Đơn tạo trong kỳ">
              <Donut centerValue={vi.format(cur.orders)} centerRaw={cur.orders} centerLabel="đơn hàng" size={170}
                slices={(Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => ({ key: k, label: STATUS_LABELS[k], value: cur.groups[k].orders, color: STATUS_VARS[k] }))} />
            </ChartCard>
          </div>

          <ChartCard icon={BarChart3} title={`${METRIC_LABEL[metric]} theo ${groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng'} · từng POS`}
            subtitle="Bấm thẻ chỉ số phía trên để đổi chỉ số">
            <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
              <LineChart data={series}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => groupBy === 'month' ? v : dmy(v)} />
                <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => isMoney ? short(v) : vi.format(v)} />
                <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={<ChartTooltipContent labelFormatter={(v) => groupBy === 'month' ? String(v) : dmy(String(v))} formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4"><span>{name === 'compare' ? 'Kỳ so sánh' : posName(String(name))}</span><strong className="num">{isMoney ? money(Number(value)) : vi.format(Number(value))}</strong></span>
                )} />} />
                <ChartLegend content={<ChartLegendContent />} />
                {report.compare && <Line type="monotone" dataKey="compare" stroke="var(--color-compare)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3.5, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls isAnimationActive={motionOn} />}
                {posIds.map((id) => <Line key={id} type="monotone" dataKey={id} stroke={`var(--color-${id})`} strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls isAnimationActive={motionOn} />)}
              </LineChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard icon={PackageCheck} title="Hiệu suất theo POS" subtitle="Trong kỳ, so với kỳ trước"
            action={
              <Select value={posSort} items={{ closedNet: 'Doanh thu đơn chốt', closedOrders: 'Đơn chốt', orders: 'Đơn tạo mới', closeRate: 'Tỷ lệ chốt' }} onValueChange={(v) => setPosSort(v as typeof posSort)}>
                <SelectTrigger className="min-w-44 text-xs" aria-label="Sắp xếp POS theo"><span className="text-ink-3">Sắp xếp:</span>&nbsp;<SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="closedNet">Doanh thu đơn chốt</SelectItem><SelectItem value="closedOrders">Đơn chốt</SelectItem><SelectItem value="orders">Đơn tạo mới</SelectItem><SelectItem value="closeRate">Tỷ lệ chốt</SelectItem>
                </SelectContent>
              </Select>
            }>
            <TableWrap minWidth={980} stickyFirst>
              <table className="tbl compact">
                <thead>
                  <tr><th>POS</th><th className="n">Đơn tạo</th><th className="n">Đơn chốt</th><th className="n">Tỷ lệ</th><th className="n">Doanh thu</th><th className="n">AOV</th><th className="n">Khách</th><th className="n">Giao TC</th><th className="n">Hoàn / Hủy</th><th>7 kỳ</th>{targetMonth && <th>Mục tiêu</th>}<th className="n">± kỳ trước</th></tr>
                </thead>
                <tbody>
                  {posRows.map(({ id, row, prev: p }, i) => row ? (
                    <tr key={id}>
                      <td className="font-medium">
                        <span className="flex items-center gap-2 whitespace-nowrap"><span className="num text-[11px] text-ink-4">{i + 1}</span><span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: posVar(id) }} aria-hidden="true" /><span className="truncate" title={posName(id)}>{posName(id)}</span>
                          {splitPos && <HoverReveal from="left" className={`ml-auto ${revealOnPhone}`}><button type="button" className="btn sm" title="Chỉ xem POS này" aria-label={`Chỉ xem ${posName(id)}`} onClick={() => setPosIds([id])}><Eye size={12} aria-hidden="true" />Xem</button></HoverReveal>}
                        </span>
                      </td>
                      <td className="n">{vi.format(row.orders)}</td>
                      <td className="n">{vi.format(row.closedOrders)}</td>
                      <td className="n">{pct(row.closeRate)}</td>
                      <td className="n">{money(row.closedNet)}</td>
                      <td className="n">{row.averageOrder ? money(row.averageOrder) : '—'}</td>
                      <td className="n">{row.closedCustomers === null ? '—' : vi.format(row.closedCustomers)}</td>
                      <td className="n">{vi.format(row.groups.delivered.orders)} <span className="text-[11px] text-ink-3">· {short(row.groups.delivered.net)}</span></td>
                      <td className="n">{vi.format(row.groups.returned.orders)} / {vi.format(row.groups.cancelled.orders)}</td>
                      <td><Sparkline data={sparkOf(id)} color={posVar(id)} width={72} height={22} reveal className={revealOnPhone} /></td>
                      {targetMonth && <td><GoalCell value={row.closedNet} goal={targets[`pos:${id}`]?.revenue ?? 0} sub={`mục tiêu ${shortMoney(targets[`pos:${id}`]?.revenue ?? 0)}`} /></td>}
                      <td className="n"><DeltaPill value={delta(row.closedNet, p?.closedNet)} /></td>
                    </tr>
                  ) : (
                    <tr key={id} className="text-ink-3"><td><span className="num mr-2 text-[11px] text-ink-4">{i + 1}</span><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: posVar(id) }} aria-hidden="true" />{posName(id)}</td><td colSpan={targetMonth ? 11 : 10} className="text-xs">Không có đơn trong kỳ</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="bg-surface-2">Tổng</td>
                    <td className="n">{vi.format(cur.orders)}</td><td className="n">{vi.format(cur.closedOrders)}</td>
                    <td className="n">{pct(cur.closeRate)}</td><td className="n">{money(cur.closedNet)}</td>
                    <td className="n">{cur.averageOrder ? money(cur.averageOrder) : '—'}</td>
                    <td className="n">{cur.closedCustomers === null ? '—' : vi.format(cur.closedCustomers)}</td>
                    <td className="n">{vi.format(cur.groups.delivered.orders)}</td>
                    <td className="n">{vi.format(cur.groups.returned.orders)} / {vi.format(cur.groups.cancelled.orders)}</td>
                    <td />
                    {targetMonth && <td>{goal ? <span className="num text-xs">{pct(cur.closedNet / goal * 100, 0)} · {short(cur.closedNet)} / {shortMoney(goal)}</span> : <span className="text-xs text-ink-4">—</span>}</td>}
                    <td className="n"><DeltaPill value={delta(cur.closedNet, prev?.closedNet)} /></td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </ChartCard>

          <ChartCard icon={CheckCircle2} title="Nhân viên" subtitle="Tỷ lệ chốt = đơn chốt ÷ đơn chia (như Pancake)" info="Đơn chia = đơn được giao cho nhân viên trong kỳ; Đơn chốt = đơn của nhân viên chốt trong kỳ (theo giờ chốt); Tỷ lệ = chốt ÷ chia. Giống Thống kê → Đơn hàng → SALE trên Pancake."
            action={<div className="flex flex-wrap items-center gap-2">
              <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(report.departments.map((d) => [d, d])), __none: 'Chưa có bộ phận' }} onValueChange={(v) => { setDepartmentTouched(true); setDepartment(String(v)); }}>
                <SelectTrigger className="min-w-40" aria-label="Bộ phận"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả bộ phận</SelectItem>
                  {report.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  <SelectItem value="__none">Chưa có bộ phận</SelectItem>
                </SelectContent>
              </Select>
              <Select value={empSortKey} items={EMP_SORT_LABELS} onValueChange={(v) => { setEmpSort(v as EmpSort); setEmpDesc(true); }}>
                <SelectTrigger className="min-w-32" aria-label="Sắp xếp nhân viên theo"><span className="text-ink-3">Xếp:&nbsp;</span><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(EMP_SORT_LABELS) as EmpSort[]).filter((k) => team !== 'cskh' || !['closeRate', 'closedOrders', 'assignedOrders'].includes(k)).map((k) => <SelectItem key={k} value={k}>{EMP_SORT_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setEmpDesc((d) => !d)} title="Đảo chiều sắp xếp" aria-label={`Đang xếp ${empDesc ? 'cao → thấp' : 'thấp → cao'}, bấm để đảo chiều`}>{empDesc ? 'Cao → thấp' : 'Thấp → cao'}</Button>
            </div>}>
            <TableWrap minWidth={splitPos ? 900 : 780} maxHeight="32rem" stickyFirst>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nhân viên</th>{splitPos && <th>POS</th>}<th className="hidden sm:table-cell">Bộ phận</th>
                    {team !== 'cskh' && <><SortTh k="assignedOrders" label="Đơn chia" sort={empSortState} /><SortTh k="closedOrders" label="Đơn chốt" sort={empSortState} /><SortTh k="closeRate" label="Tỷ lệ chốt" sort={empSortState} /></>}
                    <SortTh k="closedNet" label="Doanh thu" sort={empSortState} /><SortTh k="averageOrder" label="AOV" sort={empSortState} /><SortTh k="closedQuantity" label="SL bán" sort={empSortState} /><SortTh k="delivered" label="Giao TC" sort={empSortState} /><SortTh k="returned" label="Hoàn / Hủy" sort={empSortState} />
                  </tr>
                </thead>
                <tbody>
                  {employees.map((r, i) => {
                    const p = prevEmp(r);
                    const rate = r.assignedCloseRate;
                    return (
                      <tr key={`${r.posId}:${r.sellerId || 'none'}`}>
                        <td className="font-medium"><span className="num mr-2 text-[11px] text-ink-4">{i + 1}</span>{r.name}<span className="ml-1.5 text-[10px] font-normal text-ink-3 sm:hidden">{deptShort(r.department)}</span></td>
                        {splitPos && <td className="text-xs"><span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: posVar(r.posId) }} aria-hidden="true" />{posName(r.posId)}</td>}
                        <td className="mut hidden text-xs sm:table-cell" title={r.department ?? ''}>{deptShort(r.department)}</td>
                        {team !== 'cskh' && <><td className="n">{r.assignedHidden ? '—' : vi.format(r.assignedOrders)}</td>
                        <td className="n">{vi.format(r.closedOrders)}</td>
                        <td className="n">{r.assignedHidden ? '—' : <><ProgressBar value={rate ?? 0} max={100} width={56} size="sm" color={rateColor(rate)} className="mr-2" />{pct(rate, 2)}</>}</td></>}
                        <td className="n">{money(r.closedNet)} <DeltaPill value={delta(r.closedNet, p?.closedNet)} /></td>
                        <td className="n">{r.averageOrder ? money(r.averageOrder) : '—'}</td>
                        <td className="n">{vi.format(r.closedQuantity)}</td>
                        <td className="n">{vi.format(r.groups.delivered.orders)} <span className="text-[11px] text-ink-3">· {short(r.groups.delivered.net)}</span></td>
                        <td className="n">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="bg-surface-2">Tổng</td>{splitPos && <td />}<td className="hidden sm:table-cell" />
                    {team !== 'cskh' && <><td className="n">{vi.format(empTotal.assignedOrders)}</td>
                    <td className="n">{vi.format(empTotal.closedOrders)}</td>
                    <td className="n">{empTotal.assignedOrders ? pct(empTotal.closedOrders / empTotal.assignedOrders * 100, 2) : '—'}</td></>}
                    <td className="n">{money(empTotal.closedNet)}</td>
                    <td className="n">{empTotal.closedOrders ? money(empTotal.closedNet / empTotal.closedOrders) : '—'}</td>
                    <td className="n">{vi.format(empTotal.closedQuantity)}</td><td /><td />
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </ChartCard>

          <ChartCard icon={ShoppingCart} title="Sản phẩm bán chạy" subtitle={mergePos ? 'Trên đơn chốt · gộp cùng tên ở mọi POS' : 'Trên đơn chốt · tách theo POS'} info="Thành tiền = giá bán × số lượng − giảm giá dòng, tính trên đơn chốt."
            action={<Button size="sm" variant="outline" onClick={() => setMergePos(!mergePos)} aria-pressed={mergePos}>{mergePos ? 'Tách theo POS' : 'Gộp POS'}</Button>}>
            <TableWrap minWidth={760} maxHeight="24rem" stickyFirst>
              <table className="tbl">
                <thead><tr><th>Sản phẩm</th><th>POS</th><th className="n">Đơn</th><th className="n">SL bán thực</th><th className="n">Thành tiền</th><th>Tỷ trọng</th><th className="n">Giao TC</th><th className="n">SL hoàn</th></tr></thead>
                <tbody>
                  {(mergePos ? (() => {
                    const m = new Map<string, typeof report.current.byProduct[number] & { posCount: number }>();
                    for (const r of report.current.byProduct) {
                      const key = r.name.trim().toLowerCase();
                      const cur = m.get(key);
                      if (!cur) m.set(key, { ...r, posCount: 1 });
                      else m.set(key, { ...cur, orders: cur.orders + r.orders, quantity: cur.quantity + r.quantity, total: cur.total + r.total, closedQuantity: cur.closedQuantity + r.closedQuantity, closedTotal: cur.closedTotal + r.closedTotal, deliveredQuantity: cur.deliveredQuantity + r.deliveredQuantity, deliveredTotal: cur.deliveredTotal + r.deliveredTotal, returnedQuantity: cur.returnedQuantity + r.returnedQuantity, posCount: cur.posCount + 1 });
                    }
                    return [...m.values()].sort((a, b) => b.closedTotal - a.closedTotal);
                  })() : report.current.byProduct.map((r) => ({ ...r, posCount: 1 }))).map((r, i, arr) => {
                    const max = arr[0]?.closedTotal || 1;
                    return (
                      <tr key={`${r.posId}:${r.productId}`}>
                        <td className="font-medium"><span className="flex items-start gap-2"><span className="num mt-px text-[11px] text-ink-4">{i + 1}</span><span className="line-clamp-2 max-w-[26rem] max-sm:max-w-[9rem]" title={r.name}>{r.name}</span></span></td>
                        <td className="mut text-xs">{mergePos && r.posCount > 1 ? `${r.posCount} POS` : posName(r.posId)}</td>
                        <td className="n">{vi.format(r.orders)}</td>
                        <td className="n">{vi.format(r.closedQuantity)}</td>
                        <td className="n">{money(r.closedTotal)}</td>
                        <td><ProgressBar value={r.closedTotal} max={max} width={96} size="sm" color={mergePos && r.posCount > 1 ? 'var(--primary)' : posVar(r.posId)} /></td>
                        <td className="n">{vi.format(r.deliveredQuantity)} <span className="text-[11px] text-ink-3">· {short(r.deliveredTotal)}</span></td>
                        <td className="n">{vi.format(r.returnedQuantity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </ChartCard>
          <Definitions items={report.definitions} />
        </>
      )}
    </div>
  );
}
