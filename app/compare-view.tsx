'use client';

// So sánh nhân viên: hiệu suất đội ngũ (tỷ lệ chốt, đơn chia), scatter đơn chia × tỷ lệ chốt,
// góc nhìn nhanh (nổi bật / cần hỗ trợ / cân bằng data) và bảng chi tiết có sparkline.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from 'recharts';
import { Award, BarChart3, CheckCircle2, ClipboardList, Plus, Scale, Search, Trophy, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange, type OverviewReport } from './overview-view';
import { posName } from './ui-kit-pos';
import { Avatar, ChartCard, ContextLine, Definitions, DeltaPill, ErrorBox, EmptyState, HoverReveal, KpiCard, PageHeader, ProgressBar, SkeletonKpis, SortTh, Sparkline, StatusChip, TableWrap, Toolbar, Tooltip, delta, dmy, money, pct, posVar, short, toast, useMotionOK, useSort, vi } from './ui-kit';
import { daysInMonth, fetchTargets, type TargetItem } from './targets-panel';
import { useTeam } from './team-store';
import { downloadDeck, pctText, vnMoney, vnNum, SLIDE_COLORS, type Deck } from './slide-export';

type CallsStaff = { authorId: string; notes: number; customers: number; activeDays: number; orders: number; net: number };

type Report = OverviewReport & { current: OverviewReport['current'] & { byEmployeeDay: { sellerId: string; day: string; closedOrders: number; assignedOrders: number; closedNet: number }[] } };
type Emp = Report['current']['byEmployeePos'][number] & { spark: number[]; prevRate: number | null; prevClosed: number | null; tag: { tone: 'green' | 'red' | 'orange' | 'blue' | 'gray'; label: string } };
type SortKey = 'name' | 'department' | 'assigned' | 'closed' | 'rate' | 'prev' | 'aov' | 'net' | 'delivered' | 'returned' | 'customers' | 'notes' | 'perDay' | 'goal';
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const TARGET = 40;
/** Bỏ dấu để tìm tên không phân biệt dấu / hoa thường. */
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
/** Chênh lệch "+963 · +3,8%" cho tooltip KPI. */
const diffText = (cur: number, prev: number | null, fmt: (n: number) => string = vi.format) => {
  if (prev === null) return '—';
  const d = cur - prev, sign = d >= 0 ? '+' : '−';
  return `${sign}${fmt(Math.abs(d))} · ${prev ? `${sign}${Math.abs(d / prev * 100).toFixed(1).replace('.', ',')}%` : 'mới'}`;
};
/** Màu thanh hoàn thành mục tiêu theo mức %. */
const doneColor = (p: number) => p >= 100 ? 'var(--good)' : p >= 75 ? 'var(--t-lime)' : p >= 50 ? 'var(--warn)' : 'var(--bad)';
const dayTone = (p: number) => p >= 100 ? 'text-good' : p >= 50 ? 'text-warn' : 'text-bad';

/** Hộp tooltip biểu đồ (Recharts) theo token, cùng kiểu với ChartTooltipContent. */
function TipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-w-[150px] gap-1 rounded-[7px] border border-line-2 bg-surface px-2.5 py-2 text-[11.5px] text-ink shadow-float">
      <div className="text-[11px] font-medium text-ink-3">{title}</div>
      {children}
    </div>
  );
}
const TipRow = ({ label, value }: { label: string; value: ReactNode }) => <div className="flex items-center justify-between gap-3"><span className="text-ink-3">{label}</span><span className="num text-[12.5px]">{value}</span></div>;

export function CompareView() {
  const today = todayVn();
  const team = useTeam();
  const motionOn = useMotionOK();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [department, setDepartment] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const sort = useSort<SortKey>('rate');
  const { setKey: setSortKey, setDesc: setSortDesc } = sort;
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, TargetItem>>({});
  const ctrlRef = useRef<AbortController | null>(null);
  const splitPos = posIds.length > 1;
  const cmpPeriod = report?.comparePeriod ? `${dmy(report.comparePeriod.start)}–${dmy(report.comparePeriod.end)}` : null;
  const cmpLabel = cmpPeriod ? `so với ${cmpPeriod}` : 'so kỳ trước';
  const prevLabel = cmpPeriod ? `Kỳ so sánh ${cmpPeriod}` : 'Kỳ trước';
  const periodText = `${dmy(start)}–${dmy(end)}/${end.slice(0, 4)}`;
  const hasCmp = !!report?.compare;
  useEffect(() => { void fetchTargets(start.slice(0, 7)).then(setTargets); }, [start]);
  // CSKH: ưu tiên AOV và số đã gọi; ẩn đơn chia / chốt / tỷ lệ (bấm để hiện lại).
  const [showClose, setShowClose] = useState(false);
  const compact = team === 'cskh' && !showClose;
  const [calls, setCalls] = useState<Record<string, CallsStaff>>({});
  useEffect(() => { setSortKey(team === 'cskh' ? 'aov' : 'rate'); setSortDesc(true); }, [team, setSortKey, setSortDesc]);
  useEffect(() => {
    if (team !== 'cskh') { setCalls({}); return; }
    const c = new AbortController();
    void fetch(`/api/reports/calls?${new URLSearchParams({ start, end, posIds: posIds.join(','), team })}`, { cache: 'no-store', signal: c.signal })
      .then((r) => r.ok ? r.json() as Promise<{ staff: CallsStaff[] }> : null)
      .then((b) => { if (!c.signal.aborted) setCalls(Object.fromEntries((b?.staff ?? []).map((s) => [s.authorId, s]))); })
      .catch(() => undefined);
    return () => c.abort();
  }, [team, start, end, posIds]);

  // Huỷ request cũ khi đổi kỳ / POS / nhóm để số liệu kỳ trước không đè lên kỳ mới; tải thủ công thì báo toast.
  const load = useCallback(async (manual = false) => {
    ctrlRef.current?.abort();
    const c = new AbortController();
    ctrlRef.current = c;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reports/overview?${new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy: 'day', compare: 'previous', team })}`, { cache: 'no-store', signal: c.signal });
      const body = await r.json() as Report & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được báo cáo.');
      if (c.signal.aborted) return;
      setReport(body);
      if (manual) toast(`Đã cập nhật số liệu từ ${posIds.length} POS`);
    } catch (e) { if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được báo cáo.'); }
    finally { if (!c.signal.aborted) setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, posIds, team]);
  useEffect(() => { void load(); return () => ctrlRef.current?.abort(); }, [load]);

  const goalOf = useCallback((r: Emp) => {
    const t = targets[`employee:${r.sellerId}`];
    const hasGoal = !!(t?.revenue || t?.closedOrders);
    const done = hasGoal ? Math.min(150, t.revenue ? r.closedNet / t.revenue * 100 : r.closedOrders / t.closedOrders * 100) : Math.min(150, (r.assignedCloseRate ?? 0) / TARGET * 100);
    return { t, hasGoal, done };
  }, [targets]);

  const employees: Emp[] = useMemo(() => {
    if (!report) return [];
    const days = [...new Set(report.current.byEmployeeDay.map((d) => d.day))].sort().slice(-7);
    // Nhiều POS: tách dòng theo POS (mỗi POS chỉ có số của nhân viên POS đó).
    const source = splitPos ? report.current.byEmployeePos : report.current.byEmployee.map((r) => ({ ...r, posId: posIds[0] ?? '' }));
    const rows = source
      .filter((r) => r.sellerId && (department === 'all' || (department === '__none' ? !r.department : r.department === department)))
      .filter((r) => r.assignedOrders || r.closedOrders);
    const rates = rows.map((r) => r.assignedCloseRate).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
    const assignedSorted = rows.map((r) => r.assignedOrders).sort((a, b) => a - b);
    const medAssigned = assignedSorted.length ? assignedSorted[Math.floor(assignedSorted.length / 2)] : 0;
    const emps: Emp[] = rows.map((r) => {
      const prev = splitPos ? report.compare?.byEmployeePos.find((x) => x.sellerId === r.sellerId && x.posId === r.posId) : report.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
      const rate = r.assignedCloseRate ?? 0;
      const tag: Emp['tag'] = r.assignedOrders >= 10 && rate < Math.min(TARGET, median) * 0.8 ? { tone: 'red', label: 'Cần hỗ trợ' }
        : rate >= Math.max(TARGET, median) && r.assignedOrders >= medAssigned ? { tone: 'green', label: 'Hiệu suất cao' }
        : rate >= Math.max(TARGET, median) && r.assignedOrders < medAssigned ? { tone: 'blue', label: 'Chốt tốt, cần thêm data' }
        : r.assignedOrders > medAssigned * 1.5 && rate < median ? { tone: 'orange', label: 'Cân bằng data' }
        : { tone: 'gray', label: 'Duy trì' };
      return { ...r, spark: days.map((d) => report.current.byEmployeeDay.find((x) => x.sellerId === r.sellerId && x.day === d)?.closedOrders ?? 0), prevRate: prev?.assignedCloseRate ?? null, prevClosed: prev?.closedOrders ?? null, tag };
    });
    return sort.apply(emps, (r, k) => {
      const c = calls[r.sellerId];
      switch (k) {
        case 'name': return r.name;
        case 'department': return r.department ?? '';
        case 'assigned': return r.assignedOrders;
        case 'closed': return r.closedOrders;
        case 'rate': return r.assignedCloseRate;
        case 'prev': return r.prevRate;
        case 'aov': return r.averageOrder ?? 0;
        case 'net': return r.closedNet;
        case 'delivered': return r.groups.delivered.orders;
        case 'returned': return r.groups.returned.orders + r.groups.cancelled.orders;
        case 'customers': return c?.customers ?? 0;
        case 'notes': return c?.notes ?? 0;
        case 'perDay': return c && c.activeDays ? c.customers / c.activeDays : 0;
        case 'goal': return goalOf(r).done;
        default: return null;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, department, sort.key, sort.desc, calls, splitPos, posIds, goalOf]);

  const active = useMemo(() => selected.length ? employees.filter((e) => selected.includes(e.sellerId)) : employees, [employees, selected]);
  const totals = useMemo(() => {
    const assigned = active.reduce((a, r) => a + r.assignedOrders, 0), closed = active.reduce((a, r) => a + r.closedOrders, 0);
    const rates = active.map((r) => r.assignedCloseRate).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : null;
    const prevAssigned = active.reduce((a, r) => a + ((splitPos ? report?.compare?.byEmployeePos.find((x) => x.sellerId === r.sellerId && x.posId === r.posId) : report?.compare?.byEmployee.find((x) => x.sellerId === r.sellerId))?.assignedOrders ?? 0), 0);
    const prevClosed = active.reduce((a, r) => a + (r.prevClosed ?? 0), 0);
    const prevRates = active.map((r) => r.prevRate).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const prevMedian = prevRates.length ? prevRates[Math.floor(prevRates.length / 2)] : null;
    const best = [...active].filter((r) => r.assignedOrders >= 10).sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1))[0] ?? [...active].sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1))[0];
    return { assigned, closed, rate: assigned ? closed / assigned * 100 : null, median, prevAssigned, prevClosed, prevMedian, best, avgAssigned: active.length ? assigned / active.length : 0 };
  }, [active, report, splitPos]);
  // Sparkline thẻ "Tổng đơn chốt": đơn chốt mỗi ngày của những người đang xem (14 ngày gần nhất).
  const closedByDay = useMemo(() => {
    if (!report) return [];
    const ids = new Set(active.map((e) => e.sellerId));
    const m = new Map<string, number>();
    for (const d of report.current.byEmployeeDay) if (ids.has(d.sellerId)) m.set(d.day, (m.get(d.day) ?? 0) + d.closedOrders);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([, v]) => v);
  }, [report, active]);
  const chartRows = [...active].sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1)).slice(0, 15).map((e) => ({ name: e.name.length > 22 ? `${e.name.slice(0, 21)}…` : e.name, rate: Number((e.assignedCloseRate ?? 0).toFixed(1)), assigned: e.assignedOrders, id: e.sellerId, key: `${e.posId}:${e.sellerId}` }));
  const scatterRows = employees.map((e) => ({ x: e.assignedOrders, y: Number((e.assignedCloseRate ?? 0).toFixed(1)), z: e.closedNet, name: e.name, id: e.sellerId, key: `${e.posId}:${e.sellerId}`, picked: selected.includes(e.sellerId) }));
  // Bảng xếp hạng nhanh chỉ xét Sale/CSKH (bỏ quản trị, MKT, trực page — họ được chia đơn nhưng không phải người chốt).
  const frontline = (d: string | null) => !d || /sale|bán hàng|cskh|chăm sóc/i.test(d);
  const quick = {
    top: [...active].filter((r) => r.assignedOrders >= 10 && frontline(r.department)).sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1)).slice(0, 3),
    support: [...active].filter((r) => r.assignedOrders >= 10 && frontline(r.department)).sort((a, b) => (a.assignedCloseRate ?? 999) - (b.assignedCloseRate ?? 999)).slice(0, 3),
    balance: [...active].filter((r) => r.tag.label === 'Cân bằng data' || r.tag.label === 'Chốt tốt, cần thêm data').slice(0, 3),
  };
  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 8 ? s : [...s, id]);
  // Ô tìm tên chỉ lọc bảng chi tiết (KPI, biểu đồ và xuất file vẫn theo lựa chọn so sánh).
  const q = norm(query);
  const rows = q ? active.filter((r) => norm(r.name).includes(q)) : active;
  const colCount = 2 + (splitPos ? 1 : 0) + (compact ? 3 : 4) + 4 + 1 + (compact ? 0 : (splitPos ? 1 : 2));

  const exportSlides = async () => {
    if (!report) return;
    const deck: Deck = {
      title: 'So sánh nhân viên', subtitle: `Kỳ ${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)} · so với kỳ liền trước · ${department === 'all' ? 'tất cả bộ phận' : department}`,
      meta: [{ label: 'Nhân sự', value: `${active.length} người` }, { label: 'Tổng đơn chia', value: vnNum(totals.assigned) }, { label: 'Tổng đơn chốt', value: vnNum(totals.closed) }, { label: 'Trung vị tỷ lệ chốt', value: pctText(totals.median) }],
      slides: [
        { title: 'Chỉ số đội ngũ', blocks: [{ type: 'kpis', columns: 5, items: [
          { label: 'Tổng nhân sự', value: vnNum(active.length), note: 'Có đơn chia hoặc đơn chốt trong kỳ', tone: 'green' },
          { label: 'Tổng đơn chia', value: vnNum(totals.assigned), delta: delta(totals.assigned, totals.prevAssigned), deltaLabel: cmpLabel, tone: 'blue' },
          { label: 'Tổng đơn chốt', value: vnNum(totals.closed), delta: delta(totals.closed, totals.prevClosed), deltaLabel: cmpLabel, note: `Tỷ lệ chốt chung ${pctText(totals.rate)}`, tone: 'teal' },
          { label: 'Trung vị tỷ lệ chốt', value: pctText(totals.median), note: `Mục tiêu tham chiếu ${TARGET}%`, tone: 'orange' },
          { label: 'Nhân viên nổi bật', value: totals.best?.name ?? '—', note: totals.best ? `${pctText(totals.best.assignedCloseRate)} (${totals.best.closedOrders} / ${totals.best.assignedOrders})` : '', tone: 'lime' },
        ] }] },
        { title: 'Hiệu suất đội ngũ', subtitle: `Tỷ lệ chốt (%) · xanh đậm ≥ ${TARGET}%, xanh nhạt ≥ trung vị, cam dưới trung vị`, blocks: [
          { type: 'chart', height: Math.min(560, 60 + chartRows.length * 28), config: { type: 'bar', data: { labels: chartRows.map((r) => r.name), datasets: [{ label: 'Tỷ lệ chốt %', data: chartRows.map((r) => r.rate), backgroundColor: chartRows.map((r) => r.rate >= TARGET ? SLIDE_COLORS.green : r.rate >= (totals.median ?? 0) ? '#5bbf91' : SLIDE_COLORS.orange), borderRadius: 4, unit: '%' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } } } },
        ] },
        { title: 'Số đã nhận vs. tỷ lệ chốt', subtitle: 'Mỗi chấm một nhân viên; kích thước theo doanh thu đơn chốt', blocks: [
          { type: 'chart', height: 440, config: { type: 'bubble', data: { datasets: [{ label: 'Nhân viên', data: scatterRows.map((r) => ({ x: r.x, y: r.y, r: Math.max(5, Math.min(24, Math.sqrt(r.z / 1e6) * 2)), name: r.name })), backgroundColor: 'rgba(23,104,75,.55)', borderColor: SLIDE_COLORS.green }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: unknown) => { const ctx = c as { raw: { x: number; y: number; name: string } }; return `${ctx.raw.name}: ${ctx.raw.x} đơn chia · ${ctx.raw.y}%`; } } } }, scales: { x: { title: { display: true, text: 'Đơn chia' }, beginAtZero: true }, y: { title: { display: true, text: 'Tỷ lệ chốt (%)' }, min: 0, max: 100 } } } } },
        ] },
        { title: 'Góc nhìn nhanh', layout: 'two', blocks: [
          { type: 'list', items: [{ label: 'NỔI BẬT', value: '', tone: 'green' }, ...quick.top.map((r) => ({ label: r.name, value: `${pctText(r.assignedCloseRate)} · ${r.closedOrders}/${r.assignedOrders}`, tone: 'green' }))] },
          { type: 'list', items: [{ label: 'CẦN HỖ TRỢ', value: '', tone: 'red' }, ...quick.support.map((r) => ({ label: r.name, value: `${pctText(r.assignedCloseRate)} · ${r.closedOrders}/${r.assignedOrders}`, tone: 'red' })), { label: 'CÂN BẰNG DATA', value: '', tone: 'orange' }, ...quick.balance.map((r) => ({ label: r.name, value: `${pctText(r.assignedCloseRate)} · ${r.closedOrders}/${r.assignedOrders}`, tone: 'orange' }))] },
        ] },
        { title: 'So sánh chi tiết nhân viên', subtitle: 'Sắp xếp theo lựa chọn hiện tại trên web', blocks: [
          { type: 'table', columns: [{ label: '#' }, { label: 'Nhân viên' }, { label: 'Bộ phận' }, { label: 'Đơn chia', align: 'right' }, { label: 'Đơn chốt', align: 'right' }, { label: 'Tỷ lệ chốt', align: 'right' }, { label: 'Kỳ trước', align: 'right' }, { label: 'Doanh thu đơn chốt', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'Hoàn / Hủy', align: 'right' }, { label: 'Nhận xét' }],
            rows: active.map((r, i) => [i + 1, splitPos ? `${r.name} · ${posName(r.posId)}` : r.name, r.department ?? '—', r.assignedHidden ? '—' : vnNum(r.assignedOrders), vnNum(r.closedOrders), pctText(r.assignedCloseRate), pctText(r.prevRate), vnMoney(r.closedNet), vnNum(r.groups.delivered.orders), `${vnNum(r.groups.returned.orders)} / ${vnNum(r.groups.cancelled.orders)}`, r.tag.label]) },
        ] },
      ],
    };
    await downloadDeck(deck, `slide-so-sanh-nhan-vien_${start}_${end}`);
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nhân viên', 'POS', 'Bộ phận', 'Đơn chia', 'Đơn chốt', 'Tỷ lệ chốt %', 'Doanh thu đơn chốt', 'GTTB (AOV)', 'Giao TC', 'Hoàn', 'Hủy', 'Kỳ trước: tỷ lệ %', 'Kỳ trước: đơn chốt', 'Nhận xét'],
      ...active.map((r) => [r.name, posName(r.posId), r.department ?? '', r.assignedHidden ? '' : r.assignedOrders, r.closedOrders, r.assignedCloseRate === null ? '' : Number(r.assignedCloseRate.toFixed(2)), r.closedNet, Math.round(r.averageOrder ?? 0), r.groups.delivered.orders, r.groups.returned.orders, r.groups.cancelled.orders, r.prevRate === null ? '' : Number(r.prevRate.toFixed(2)), r.prevClosed ?? '', r.tag.label]),
    ]), 'So sánh nhân viên');
    XLSX.writeFile(wb, `so-sanh-nhan-vien_${start}_${end}.xlsx`);
  };

  const quickBlocks = [
    { icon: Award, title: 'Nhân viên nổi bật', subtitle: 'Tỷ lệ cao nhất, ≥ 10 đơn chia', rows: quick.top },
    { icon: Users, title: 'Cần hỗ trợ', subtitle: 'Tỷ lệ thấp nhất, ≥ 10 đơn chia', rows: quick.support },
    { icon: Scale, title: 'Cân bằng data', subtitle: 'Chốt tốt nhưng ít data, hoặc nhiều data chốt thấp', rows: quick.balance },
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)} · so với kỳ liền trước`} title="So sánh nhân viên" subtitle="Tỷ lệ chốt = đơn chốt ÷ đơn chia (như Pancake)"
        actions={<><Button variant="outline" onClick={exportSlides} disabled={!report}>Xuất slide</Button><Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button></>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={() => void load(true)} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {report && (
        <Toolbar>
          <span className="px-1 text-[12.5px] font-semibold text-ink-2">Bộ phận</span>
          <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(report.departments.map((d) => [d, d])), __none: 'Chưa có bộ phận' }} onValueChange={(v) => { setDepartment(String(v)); setSelected([]); }}>
            <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tất cả bộ phận</SelectItem>{report.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}<SelectItem value="__none">Chưa có bộ phận</SelectItem></SelectContent>
          </Select>
          <label className="relative flex min-w-0 flex-1 basis-52 items-center sm:max-w-72">
            <Search size={14} className="pointer-events-none absolute left-3 text-ink-4" aria-hidden="true" />
            <input type="search" className="field pl-8" placeholder="Tìm tên nhân viên" aria-label="Tìm tên nhân viên trong bảng" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <span className="hidden h-6 w-px bg-line-2 sm:block" aria-hidden="true" />
          <span className="text-[12.5px] font-semibold text-ink-2">So sánh{selected.length ? <span className="num ml-1 text-ink-3">{selected.length}/8</span> : <span className="ml-1 font-normal text-ink-3">· bấm tên trong bảng hoặc chọn ở đây</span>}</span>
          {selected.map((id) => { const e = employees.find((x) => x.sellerId === id); return e ? (
            <button key={id} type="button" onClick={() => toggle(id)} aria-label={`Bỏ ${e.name} khỏi so sánh`}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-tint px-2.5 py-1 text-xs font-medium text-primary transition-[background-color,border-color,color] duration-[var(--dur)] ease-[var(--ease)] hover:border-primary hover:text-primary-2">
              {e.name}<X size={12} />
            </button>
          ) : null; })}
          <Select value="__pick" items={{ __pick: '+ Thêm nhân viên', ...Object.fromEntries(employees.map((e) => [e.sellerId, e.name])) }} onValueChange={(v) => { if (v && v !== '__pick') toggle(String(v)); }}>
            <SelectTrigger className="min-w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{employees.filter((e) => !selected.includes(e.sellerId)).map((e) => <SelectItem key={e.sellerId} value={e.sellerId}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
          {selected.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Bỏ chọn</Button>}
        </Toolbar>
      )}
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && (
        <>
          <SkeletonKpis count={5} className="xl:grid-cols-5" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
            <ChartCard icon={BarChart3} title="Hiệu suất đội ngũ" loading><div className="h-56" /></ChartCard>
            <ChartCard icon={Scale} title="Đơn chia vs. tỷ lệ chốt" loading><div className="h-56" /></ChartCard>
            <ChartCard icon={Award} title="Góc nhìn nhanh" loading><div className="h-56" /></ChartCard>
          </div>
          <ChartCard icon={Users} title="So sánh chi tiết nhân viên" loading><div className="h-64" /></ChartCard>
        </>
      )}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            <KpiCard icon={Users} tone="green" label="Tổng nhân sự" value={vi.format(active.length)} countUp rawValue={active.length} format={(n) => vi.format(Math.round(n))} note={`Có đơn chia hoặc đơn chốt trong kỳ${selected.length ? ' · đang so sánh' : ''}`}
              tooltip={{ period: periodText, current: `${vi.format(active.length)} người`, definition: 'Nhân viên có đơn chia hoặc đơn chốt trong kỳ, theo bộ phận và POS đã chọn (đang so sánh thì chỉ tính người đã chọn).' }} />
            <KpiCard icon={ClipboardList} tone="blue" label="Tổng đơn chia" value={vi.format(totals.assigned)} countUp rawValue={totals.assigned} format={(n) => vi.format(Math.round(n))} delta={delta(totals.assigned, totals.prevAssigned)} deltaLabel={cmpLabel} note={`Trung bình ${vi.format(Math.round(totals.avgAssigned))} đơn/người`}
              tooltip={{ period: periodText, current: vi.format(totals.assigned), previous: hasCmp ? vi.format(totals.prevAssigned) : undefined, previousLabel: prevLabel, diff: hasCmp ? diffText(totals.assigned, totals.prevAssigned) : undefined, definition: 'Số đơn được chia cho nhân viên trong kỳ (Pancake "Phân công cho NV").' }} />
            <KpiCard icon={CheckCircle2} tone="teal" label="Tổng đơn chốt" value={vi.format(totals.closed)} countUp rawValue={totals.closed} format={(n) => vi.format(Math.round(n))} delta={delta(totals.closed, totals.prevClosed)} deltaLabel={cmpLabel} note={`Tỷ lệ chốt chung ${pct(totals.rate)}`} sparkline={closedByDay}
              tooltip={{ period: periodText, current: vi.format(totals.closed), previous: hasCmp ? vi.format(totals.prevClosed) : undefined, previousLabel: prevLabel, diff: hasCmp ? diffText(totals.closed, totals.prevClosed) : undefined, definition: 'Đơn đã bàn giao đơn vị vận chuyển trong kỳ. Tỷ lệ chốt chung = đơn chốt ÷ đơn chia.' }} />
            <KpiCard icon={BarChart3} tone="orange" label="Trung vị tỷ lệ chốt" value={pct(totals.median)} countUp rawValue={totals.median ?? undefined} format={(n) => pct(n)} delta={totals.median !== null && totals.prevMedian !== null ? totals.median - totals.prevMedian : null} deltaLabel={`điểm % ${cmpLabel}`} note={`Mục tiêu tham chiếu ${TARGET}%`}
              tooltip={{ period: periodText, current: pct(totals.median), previous: hasCmp ? pct(totals.prevMedian) : undefined, previousLabel: prevLabel, diff: totals.median !== null && totals.prevMedian !== null ? `${totals.median - totals.prevMedian >= 0 ? '+' : '−'}${Math.abs(totals.median - totals.prevMedian).toFixed(1).replace('.', ',')} điểm` : undefined, definition: `Trung vị tỷ lệ chốt của từng nhân viên (đơn chốt ÷ đơn chia); mục tiêu tham chiếu ${TARGET}%.` }} />
            <KpiCard icon={Trophy} tone="lime" label="Nhân viên nổi bật" className="max-xl:col-span-2" value={totals.best ? pct(totals.best.assignedCloseRate) : '—'} countUp rawValue={totals.best?.assignedCloseRate ?? undefined} format={(n) => pct(n)}
              note={totals.best ? `${totals.best.name} · ${totals.best.closedOrders} / ${totals.best.assignedOrders} đơn` : 'Chưa đủ dữ liệu'}
              tooltip={{ period: periodText, current: totals.best?.name ?? '—', definition: 'Người có tỷ lệ chốt cao nhất trong số nhân viên có ≥ 10 đơn chia (không đủ thì lấy cao nhất chung).' }} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
            <ChartCard icon={BarChart3} title="Hiệu suất đội ngũ" subtitle={`Tỷ lệ chốt (%) của ${chartRows.length} nhân viên cao nhất · vạch xám: trung vị ${pct(totals.median)} · vạch xanh: mục tiêu ${TARGET}%`}>
              {chartRows.length ? (
                <ChartContainer className="w-full aspect-auto" style={{ height: Math.max(220, chartRows.length * 30) }} config={{ rate: { label: 'Tỷ lệ chốt %', color: 'var(--primary)' } }}>
                  <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 36 }}>
                    <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={({ active: a, payload }) => a && payload?.length ? (
                      <TipBox title={payload[0].payload.name}><TipRow label="Tỷ lệ chốt" value={`${payload[0].payload.rate}%`} /><TipRow label="Đơn chia" value={vi.format(payload[0].payload.assigned)} /></TipBox>
                    ) : null} />
                    {totals.median !== null && <ReferenceLine x={Number(totals.median.toFixed(1))} stroke="var(--ink-4)" strokeDasharray="4 4" />}
                    <ReferenceLine x={TARGET} stroke="var(--good)" strokeDasharray="4 4" />
                    <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={motionOn}>
                      {chartRows.map((r) => <Cell key={r.key} fill={r.rate >= TARGET ? 'var(--primary)' : r.rate >= (totals.median ?? 0) ? 'var(--ring)' : 'var(--t-orange)'} />)}
                      <LabelList dataKey="rate" position="right" formatter={(v) => pct(Number(v))} fontSize={11} fill="var(--ink-2)" className="num" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : <EmptyState text="Không có nhân viên có đơn trong kỳ." />}
            </ChartCard>
            <ChartCard icon={Scale} title="Đơn chia vs. tỷ lệ chốt" subtitle="Mỗi chấm một người · cỡ chấm theo doanh thu · bấm chấm để so sánh">
              {scatterRows.length ? (
                <ChartContainer className="h-72 w-full aspect-auto" config={{ y: { label: 'Tỷ lệ chốt', color: 'var(--primary)' } }}>
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" name="Đơn chia" tickLine={false} axisLine={false} label={{ value: 'Đơn chia', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: 'var(--ink-3)' }} />
                    <YAxis type="number" dataKey="y" name="Tỷ lệ chốt" domain={[0, 100]} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
                    <ZAxis type="number" dataKey="z" range={[40, 400]} />
                    <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '3 3' }} content={({ active: a, payload }) => a && payload?.length ? (
                      <TipBox title={payload[0].payload.name}><TipRow label="Đơn chia" value={vi.format(payload[0].payload.x)} /><TipRow label="Tỷ lệ chốt" value={`${payload[0].payload.y}%`} /><TipRow label="Doanh thu" value={money(payload[0].payload.z)} /></TipBox>
                    ) : null} />
                    <ReferenceLine y={TARGET} stroke="var(--good)" strokeDasharray="4 4" />
                    <ReferenceLine x={Math.round(totals.avgAssigned)} stroke="var(--ink-4)" strokeDasharray="4 4" />
                    <Scatter data={scatterRows} isAnimationActive={motionOn} className="cursor-pointer" onClick={(d) => { const id = (d as { payload?: { id?: string } })?.payload?.id; if (id) toggle(id); }}>
                      {scatterRows.map((r) => <Cell key={r.key} fill={r.picked || !selected.length ? 'var(--primary)' : 'var(--line-3)'} stroke={r.picked ? 'var(--primary-2)' : 'none'} strokeWidth={r.picked ? 2 : 0} />)}
                    </Scatter>
                  </ScatterChart>
                </ChartContainer>
              ) : <EmptyState text="Không có dữ liệu." />}
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-ink-3"><span>↖ Chốt tốt, cần thêm data</span><span className="text-right">Hiệu suất cao ↗</span><span>↙ Cần hỗ trợ, ưu tiên coaching</span><span className="text-right">Cân bằng data ↘</span></div>
            </ChartCard>
            <div className="space-y-3">
              {quickBlocks.map((b) => (
                <ChartCard key={b.title} icon={b.icon} title={b.title} subtitle={b.subtitle}>
                  {b.rows.length ? (
                    <ol className="-mx-1 space-y-0.5">
                      {b.rows.map((r, i) => {
                        const picked = selected.includes(r.sellerId);
                        return (
                          <li key={`${r.posId}:${r.sellerId}`} className="ctx-row rounded-lg transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:bg-surface-2 focus-within:bg-surface-2">
                            <button type="button" aria-pressed={picked} onClick={() => toggle(r.sellerId)} title={picked ? 'Bỏ khỏi so sánh' : 'Thêm vào so sánh'}
                              className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]">
                              <span className="num text-[11px] text-ink-4">{i + 1}</span>
                              <span className={`truncate transition-colors duration-[var(--dur)] ${picked ? 'font-medium text-primary' : 'text-ink'}`}>{r.name}</span>
                              <span className="num text-[13px]">{pct(r.assignedCloseRate)}</span>
                              <span className="num text-[11px] text-ink-3">{vi.format(r.closedOrders)} / {vi.format(r.assignedOrders)}</span>
                              <ContextLine className="col-span-full" indent={28}>Kỳ trước {pct(r.prevRate)} · {money(r.closedNet)}{splitPos ? ` · ${posName(r.posId)}` : ''}{picked ? ' · đang so sánh' : ''}</ContextLine>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  ) : <p className="text-xs text-ink-3">Không có.</p>}
                </ChartCard>
              ))}
            </div>
          </div>
          <ChartCard icon={Users} title={`So sánh chi tiết nhân viên (${rows.length} nhân viên)`} subtitle="Bấm tên để so sánh · bấm tiêu đề cột để sắp xếp · rê chuột vào dòng xem 7 ngày đơn chốt gần nhất"
            action={team === 'cskh' ? <Button size="sm" variant="outline" onClick={() => setShowClose(!showClose)} aria-pressed={showClose}>{showClose ? 'Ẩn cột chốt' : 'Hiện cột chốt'}</Button> : undefined}>
            <TableWrap maxHeight="36rem" sticky minWidth={720}>
              <table className="tbl sticky-first">
                <thead><tr>
                  <SortTh k="name" label="Nhân viên" sort={sort} align="left" />
                  {splitPos && <th>POS</th>}
                  <SortTh k="department" label="Bộ phận" sort={sort} align="left" />
                  {compact ? <>
                    <SortTh k="customers" label="Khách đã gọi" sort={sort} />
                    <SortTh k="notes" label="Cuộc gọi" sort={sort} />
                    <SortTh k="perDay" label="Khách/ngày" sort={sort} />
                  </> : <>
                    <SortTh k="assigned" label="Đơn chia" sort={sort} />
                    <SortTh k="closed" label="Đơn chốt" sort={sort} />
                    <SortTh k="rate" label="Tỷ lệ chốt" sort={sort} />
                    <SortTh k="prev" label="Kỳ trước" sort={sort} />
                  </>}
                  <SortTh k="aov" label="GTTB (AOV)" sort={sort} />
                  <SortTh k="net" label="Doanh thu đơn chốt" sort={sort} />
                  <SortTh k="delivered" label="Giao TC" sort={sort} />
                  <SortTh k="returned" label="Hoàn / Hủy" sort={sort} />
                  <th>7 ngày</th>
                  {!compact && <>{!splitPos && <SortTh k="goal" label="Hoàn thành mục tiêu" sort={sort} align="left" />}<th>Nhận xét</th></>}
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const rate = r.assignedCloseRate ?? 0;
                    const picked = selected.includes(r.sellerId);
                    const { t, hasGoal, done } = goalOf(r);
                    const goalText = hasGoal ? (t.revenue ? `${short(r.closedNet)} / ${short(t.revenue)} ₫` : `${vi.format(r.closedOrders)} / ${vi.format(t.closedOrders)} đơn`) : `tỷ lệ ${pct(rate, 0)} / ${TARGET}%`;
                    const c = calls[r.sellerId];
                    return (
                      <tr key={`${r.posId}:${r.sellerId}`} className={picked ? 'bg-tint-2 [&>td:first-child]:bg-tint-2' : ''}>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className="num w-5 shrink-0 text-right text-[11px] text-ink-4">{i + 1}</span>
                            <button type="button" aria-pressed={picked} onClick={() => toggle(r.sellerId)}
                              className={`flex min-w-0 items-center gap-2 rounded-md text-[13px] font-medium transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:text-primary ${picked ? 'text-primary' : 'text-ink'}`}>
                              <Avatar name={r.name} size="sm" /><span className="truncate">{r.name}</span>
                            </button>
                            <HoverReveal>
                              <Tooltip content={picked ? 'Bỏ khỏi so sánh' : 'Thêm vào so sánh (tối đa 8 người)'}>
                                <button type="button" aria-label={picked ? `Bỏ ${r.name} khỏi so sánh` : `Thêm ${r.name} vào so sánh`} onClick={() => toggle(r.sellerId)}
                                  className="grid size-6 place-items-center rounded-[5px] text-ink-3 transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:bg-tint hover:text-primary">
                                  {picked ? <X size={13} /> : <Plus size={13} />}
                                </button>
                              </Tooltip>
                            </HoverReveal>
                          </span>
                        </td>
                        {splitPos && <td className="text-xs"><span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: posVar(r.posId) }} />{posName(r.posId)}</td>}
                        <td className="mut text-xs">{r.department ?? '—'}</td>
                        {compact ? <>
                          <td className="n">{c ? vi.format(c.customers) : '—'}</td>
                          <td className="n">{c ? vi.format(c.notes) : '—'}</td>
                          <td className="n">{c && c.activeDays ? vi.format(Math.round(c.customers / c.activeDays)) : '—'}</td>
                        </> : <>
                          <td className="n">{r.assignedHidden ? '—' : vi.format(r.assignedOrders)}</td>
                          <td className="n">{vi.format(r.closedOrders)}</td>
                          <td className={`n ${rate >= TARGET ? 'text-primary' : ''}`}>{r.assignedHidden ? '—' : pct(r.assignedCloseRate)}</td>
                          <td className="n mut text-xs"><span className="inline-flex items-center gap-1.5">{pct(r.prevRate)}{r.assignedCloseRate !== null && r.prevRate !== null && <DeltaPill value={r.assignedCloseRate - r.prevRate} suffix=" điểm" />}</span></td>
                        </>}
                        <td className="n">{r.averageOrder ? money(r.averageOrder) : '—'}</td>
                        <td className="n">{money(r.closedNet)}</td>
                        <td className="n">{vi.format(r.groups.delivered.orders)}</td>
                        <td className="n">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                        <td><Sparkline data={r.spark} width={72} height={22} reveal color={rate >= TARGET ? 'var(--primary)' : 'var(--t-orange)'} /></td>
                        {!compact && <>
                          {!splitPos && <td>
                            <span className="flex items-center gap-2"><ProgressBar value={Math.min(100, done)} max={100} width={64} color={doneColor(done)} /><span className="num text-xs">{Math.round(done)}%</span></span>
                            <span className="num block text-[11px] font-semibold text-ink-3">{goalText}</span>
                            {(() => {
                              if (!t?.revenue || today < start || today > end) return null;
                              const days = t.workingDays || daysInMonth(start.slice(0, 7));
                              const daily = t.revenue / days;
                              const todayNet = report.current.byEmployeeDay.filter((d) => d.sellerId === r.sellerId && d.day === today).reduce((a, d) => a + d.closedNet, 0);
                              const dp = todayNet / daily * 100;
                              return (
                                <Tooltip content={<><b>KPI ngày</b><span className="r"><span>Mục tiêu tháng</span><span className="num">{money(t.revenue)}</span></span><span className="r"><span>Ngày làm việc</span><span className="num">{days}</span></span><span className="r"><span>KPI mỗi ngày</span><span className="num">{money(daily)}</span></span><span className="how block">Hôm nay {money(todayNet)} ÷ {money(daily)} = {pct(dp, 0)}</span></>}>
                                  <span className="mt-0.5 block text-[11px] text-ink-2">Hôm nay <span className={`num ${dayTone(dp)}`}>{pct(dp, 0)}</span> · <span className="num">{short(todayNet)} / {short(daily)} ₫</span></span>
                                </Tooltip>
                              );
                            })()}
                          </td>}
                          <td><StatusChip tone={r.tag.tone}>{r.tag.label}</StatusChip></td>
                        </>}
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={colCount} className="py-6 text-center text-xs text-ink-3">{q ? `Không có nhân viên tên "${query.trim()}".` : 'Không có nhân viên có đơn trong kỳ.'}</td></tr>}
                </tbody>
                {rows.length > 0 && (() => {
                  const T = rows.reduce((a, r) => ({ assigned: a.assigned + r.assignedOrders, closed: a.closed + r.closedOrders, net: a.net + r.closedNet, delivered: a.delivered + r.groups.delivered.orders, returned: a.returned + r.groups.returned.orders, cancelled: a.cancelled + r.groups.cancelled.orders, calls: a.calls + (calls[r.sellerId]?.notes ?? 0), customers: a.customers + (calls[r.sellerId]?.customers ?? 0) }), { assigned: 0, closed: 0, net: 0, delivered: 0, returned: 0, cancelled: 0, calls: 0, customers: 0 });
                  const hidden = rows.some((r) => r.assignedHidden);
                  return (
                    <tfoot><tr>
                      <td className="bg-surface-2">Tổng · <span className="num">{vi.format(rows.length)}</span> người</td>{splitPos && <td />}<td />
                      {compact ? <><td className="n">{vi.format(T.customers)}</td><td className="n">{vi.format(T.calls)}</td><td /></>
                        : <><td className="n">{hidden ? '—' : vi.format(T.assigned)}</td><td className="n">{vi.format(T.closed)}</td><td className="n">{hidden || !T.assigned ? '—' : pct(T.closed / T.assigned * 100)}</td><td /></>}
                      <td className="n">{T.closed ? money(T.net / T.closed) : '—'}</td>
                      <td className="n">{money(T.net)}</td>
                      <td className="n">{vi.format(T.delivered)}</td>
                      <td className="n">{vi.format(T.returned)} / {vi.format(T.cancelled)}</td>
                      <td />{!compact && <>{!splitPos && <td />}<td /></>}
                    </tr></tfoot>
                  );
                })()}
              </table>
            </TableWrap>
          </ChartCard>
          <Definitions items={[
            `Hoàn thành mục tiêu = doanh thu đơn chốt so với mục tiêu tháng đã đặt trong Cấu hình (chưa đặt thì dùng tỷ lệ chốt so với ${TARGET}%).`,
            `Nhận xét dựa trên trung vị đội ngũ và mục tiêu tham chiếu ${TARGET}%: Hiệu suất cao = tỷ lệ ≥ mục tiêu với lượng đơn chia từ trung vị trở lên; Cần hỗ trợ = ≥ 10 đơn chia nhưng tỷ lệ dưới 80% trung vị; Cân bằng data = nhận nhiều hơn 150% trung vị mà tỷ lệ dưới trung vị.`,
            'Tỷ lệ chốt = đơn chốt ÷ đơn chia (như Pancake). Đơn chốt = đơn đã bàn giao đơn vị vận chuyển; doanh thu sau giảm giá và quà.',
            'Ô tìm tên chỉ lọc bảng chi tiết; thẻ số, biểu đồ và file xuất theo lựa chọn so sánh (tối đa 8 người).',
          ]} />
        </>
      )}
    </div>
  );
}
