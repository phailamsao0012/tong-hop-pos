'use client';

// Báo cáo cuối tháng: tổng kết một tháng (so với tháng trước) từ báo cáo tổng quan theo tuần.
// Mọi khoản trong thác nước tính theo ngày TẠO đơn (trạng thái lúc đồng bộ) nên cộng dồn khớp nhau.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts';
import { BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, Coins, PackageCheck, RotateCcw, Target, Truck, Undo2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';
import { GoalCell, PosChips, type OverviewReport } from './overview-view';
import {
  ChartCard, DeltaPill, ErrorBox, KpiCard, PageHeader, ProgressBar, SegmentedControl, SkeletonKpis, SortTh, STATUS_VARS, StatusChip, TableWrap, Toolbar,
  delta, dmy, dt, money, pct, posColor, posName, posVar, short, shortMoney, toast, useMotionOK, useSort, vi, type TipRows,
} from './ui-kit';

// Nhãn trục X ngắn gọn cho biểu đồ cột ("Oxytetra - Megatech" → "Oxytetra"), tên đầy đủ vẫn hiện ở tooltip.
const shortPosName = (n: string) => { const h = n.split(' - ')[0].trim(); return h.length > 13 ? `${h.slice(0, 12)}…` : h; };
import { fetchTargets, type TargetItem } from './targets-panel';
import { useTeam } from './team-store';
import { downloadDeck, pctText, trieu, vnMoney, vnNum, SLIDE_COLORS, type Deck } from './slide-export';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';

type Metrics = OverviewReport['current']['total'];
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
function endOfMonth(month: string, today: string) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
  return end > today ? today : end;
}
/** Tiền rút gọn kèm một ký hiệu duy nhất: "7,18 tỷ ₫" (khoảng trắng không ngắt). */
const deltaText = (d: number | null) => d === null ? '' : d === Infinity ? 'mới' : `${d >= 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%`;
const diffText = (c: number, p: number, fmt: (n: number) => string) => { const d = c - p; return `${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))} · ${deltaText(delta(c, p))}`; };
const fmtInt = (n: number) => vi.format(Math.round(n));
// Cột sắp xếp được của bảng nhân viên.
type EmpKey = 'name' | 'assignedOrders' | 'closedOrders' | 'closeRate' | 'closedNet' | 'averageOrder' | 'deliveredOrders' | 'deliveredNet' | 'returned';

export function MonthlyView() {
  const today = todayVn();
  const team = useTeam();
  const motionOn = useMotionOK();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [targets, setTargets] = useState<Record<string, TargetItem>>({});
  const start = monthStart(`${month}-01`), end = endOfMonth(month, today);
  useEffect(() => { void fetchTargets(month).then(setTargets); }, [month]);
  const sort = useSort<EmpKey>('deliveredNet');

  // Số "lần cuối" hiện ngay từ trình duyệt (useApi), máy chủ trả số mới thì thay; đổi tháng / POS thì tải lại theo URL mới.
  const url = useMemo(() => {
    const params = new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy: 'week', compare: 'previous', team });
    return `/api/reports/overview?${params}`;
  }, [start, end, posIds, team]);
  const { data: report, at, stale, loading, error, reload: refetch } = useApi<OverviewReport>(url);
  // "Tải lại" báo toast khi tải xong không lỗi (như trước).
  const manualRef = useRef(false);
  const reload = () => { manualRef.current = true; refetch(); };
  useEffect(() => { if (!loading && manualRef.current) { manualRef.current = false; if (!error) toast('Đã tải lại số liệu'); } }, [loading, error]);

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
  const chartConfig = {
    deliveredM: { label: 'Doanh thu giao TC (triệu đ)', color: 'var(--primary)' }, deliveredOrders: { label: 'Đơn giao TC', color: 'var(--t-teal)' }, closedM: { label: 'Doanh thu đơn chốt (triệu đ)', color: 'var(--t-blue)' },
    delivered: { label: 'Giao thành công', color: 'var(--primary)' }, closed: { label: 'Đơn chốt', color: 'color-mix(in srgb, var(--primary) 40%, var(--surface))' },
  };
  const employees = (report?.current.byEmployee ?? []).filter((r) => r.closedOrders || r.groups.delivered.orders).sort((a, b) => b.groups.delivered.net - a.groups.delivered.net).slice(0, 30);
  // Bảng hiển thị sắp xếp theo cột đang chọn (top 30 vẫn chọn theo doanh thu giao TC; xuất Excel / slide giữ thứ tự gốc).
  const empRows = sort.apply(employees, (r, k) => k === 'name' ? r.name : k === 'closeRate' ? r.assignedCloseRate : k === 'averageOrder' ? r.averageOrder
    : k === 'deliveredOrders' ? r.groups.delivered.orders : k === 'deliveredNet' ? r.groups.delivered.net : k === 'returned' ? r.groups.returned.orders + r.groups.cancelled.orders : r[k]);

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
      ['Đơn chốt', cur.closedOrders, prev?.closedOrders ?? ''], ['Doanh thu đơn chốt', cur.closedNet, prev?.closedNet ?? ''],
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

  const exportSlides = async () => {
    if (!report || !cur) return;
    const goal = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.revenue ?? 0), 0);
    const deck: Deck = {
      title: `Báo cáo tháng ${month.slice(5)}/${month.slice(0, 4)}`, subtitle: `Tổng kết hiệu quả kinh doanh · ${dmy(start)} – ${dmy(end)} · so với tháng trước`,
      meta: [{ label: 'POS', value: posIds.length === POS.length ? 'Tất cả 6 POS' : posIds.map(posName).join(', ') }, { label: 'Đồng bộ lúc', value: dt(report.syncedAt, true) }, { label: 'Doanh thu giao thành công', value: vnMoney(cur.groups.delivered.net) }, { label: 'Đơn chốt', value: vnNum(cur.closedOrders) }],
      slides: [
        { title: 'Chỉ số chính', subtitle: 'So với tháng trước', blocks: [
          { type: 'kpis', columns: 5, items: [
            { label: 'Doanh thu giao thành công', value: vnMoney(cur.groups.delivered.net), delta: delta(cur.groups.delivered.net, prev?.groups.delivered.net), deltaLabel: 'so tháng trước', note: prev ? `Tháng trước ${vnMoney(prev.groups.delivered.net)}` : undefined, tone: 'green' },
            { label: 'Đơn giao thành công', value: vnNum(cur.groups.delivered.orders), delta: delta(cur.groups.delivered.orders, prev?.groups.delivered.orders), deltaLabel: 'so tháng trước', tone: 'teal' },
            { label: 'Giá trị trung bình đơn', value: cur.deliveredAverage ? vnMoney(cur.deliveredAverage) : '—', delta: cur.deliveredAverage && prev?.deliveredAverage ? delta(cur.deliveredAverage, prev.deliveredAverage) : null, deltaLabel: 'so tháng trước', tone: 'blue' },
            { label: 'Tỷ lệ hoàn', value: pctText(returnRate(cur)), note: `${vnNum(cur.groups.returned.orders)} đơn hoàn / ${vnNum(cur.closedOrders)} đơn chốt`, tone: 'orange' },
            { label: 'Tỷ lệ hủy', value: pctText(cancelRate(cur)), note: `${vnNum(cur.groups.cancelled.orders)} đơn hủy / ${vnNum(cur.orders)} đơn tạo`, tone: 'red' },
          ] },
          ...(goal ? [{ type: 'kpis' as const, columns: 2, items: [{ label: 'Hoàn thành mục tiêu doanh thu đơn chốt', value: pctText(cur.closedNet / goal * 100), note: `${vnMoney(cur.closedNet)} / mục tiêu ${vnMoney(goal)}`, tone: 'lime' }, { label: 'Doanh thu đơn chốt', value: vnMoney(cur.closedNet), delta: delta(cur.closedNet, prev?.closedNet), deltaLabel: 'so tháng trước', tone: 'green' }] }] : []),
        ] },
        { title: 'Từ tiền hàng đơn tạo đến doanh thu giao thành công', subtitle: 'Bóc tách theo trạng thái hiện tại của đơn tạo trong tháng (triệu đồng)', blocks: [
          { type: 'chart', height: 420, config: { type: 'bar', data: { labels: waterfall.map((w) => w.label), datasets: [{ label: 'Giá trị', data: waterfall.map((w) => [trieu(w.base), trieu(w.base + w.bar)]), backgroundColor: waterfall.map((w) => w.kind === 'total' ? SLIDE_COLORS.green : SLIDE_COLORS.orange), borderRadius: 4, unit: 'tr' }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: unknown) => { const ctx = c as { raw: [number, number]; dataIndex: number }; return `${new Intl.NumberFormat('vi-VN').format(Math.round(Math.abs(ctx.raw[1] - ctx.raw[0]) * 100) / 100)} triệu đ`; } } } }, scales: { y: { beginAtZero: true } } } }, note: 'Cột xanh: mốc tổng; cột cam: khoản chưa thành doanh thu giao thành công.' },
        ] },
        { title: 'Doanh thu theo POS', subtitle: 'Giao thành công và đơn chốt trong tháng (triệu đồng)', layout: 'two', blocks: [
          { type: 'chart', height: 380, config: { type: 'bar', data: { labels: posChart.map((p) => p.name), datasets: [{ label: 'Đơn chốt (tr)', data: posChart.map((p) => p.closed), backgroundColor: '#9fd8b8', borderRadius: 4, unit: 'tr' }, { label: 'Giao thành công (tr)', data: posChart.map((p) => p.delivered), backgroundColor: posChart.map((p) => posColor(p.id)), borderRadius: 4, unit: 'tr' }] }, options: { scales: { y: { beginAtZero: true } } } } },
          { type: 'chart', height: 380, config: { type: 'line', data: { labels: weekly.map((w) => `${w.label} (${w.sub})`), datasets: [{ label: 'Doanh thu giao TC (tr)', data: weekly.map((w) => w.deliveredM), borderColor: SLIDE_COLORS.green, backgroundColor: SLIDE_COLORS.green, borderWidth: 2.5, tension: .3, unit: 'tr' }, { label: 'Doanh thu đơn chốt (tr)', data: weekly.map((w) => w.closedM), borderColor: SLIDE_COLORS.blue, borderDash: [4, 4], tension: .3, unit: 'tr' }] }, options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } } } }, note: 'Xu hướng theo tuần trong tháng' },
        ] },
        { title: 'Hiệu suất theo POS', subtitle: 'So với tháng trước · giao thành công theo ngày tạo đơn; đơn chốt theo giờ chốt', blocks: [
          { type: 'table', columns: [{ label: 'POS' }, { label: 'Đơn tạo', align: 'right' }, { label: 'Đơn chốt', align: 'right' }, { label: 'Doanh thu đơn chốt', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'Doanh thu giao TC', align: 'right' }, { label: 'Tỷ trọng', align: 'right' }, { label: 'Hoàn', align: 'right' }, { label: 'Hủy', align: 'right' }, { label: 'Mục tiêu tháng', align: 'right' }, { label: 'So tháng trước', align: 'right' }],
            rows: byPos.map(({ id, row, prev: p }) => { const g = targets[`pos:${id}`]?.revenue ?? 0; const d = delta(row!.groups.delivered.net, p?.groups.delivered.net); return [posName(id), vnNum(row!.orders), vnNum(row!.closedOrders), vnMoney(row!.closedNet), vnNum(row!.groups.delivered.orders), vnMoney(row!.groups.delivered.net), pctText(cur.groups.delivered.net ? row!.groups.delivered.net / cur.groups.delivered.net * 100 : null), `${vnNum(row!.groups.returned.orders)} (${pctText(returnRate(row!))})`, `${vnNum(row!.groups.cancelled.orders)} (${pctText(cancelRate(row!))})`, g ? `${pctText(row!.closedNet / g * 100, 0)} của ${vnMoney(g)}` : '—', d === null ? '—' : `${d >= 0 ? '↑' : '↓'} ${pctText(Math.abs(d))}`]; }),
            total: ['Tổng', vnNum(cur.orders), vnNum(cur.closedOrders), vnMoney(cur.closedNet), vnNum(cur.groups.delivered.orders), vnMoney(cur.groups.delivered.net), '', vnNum(cur.groups.returned.orders), vnNum(cur.groups.cancelled.orders), goal ? pctText(cur.closedNet / goal * 100, 0) : '—', ''] },
        ] },
        { title: 'Hiệu suất nhân viên trong tháng', subtitle: 'Top 30 theo doanh thu giao thành công', blocks: [
          { type: 'table', columns: [{ label: '#' }, { label: 'Nhân viên' }, { label: 'Bộ phận' }, { label: 'Đơn chia', align: 'right' }, { label: 'Đơn chốt', align: 'right' }, { label: 'Tỷ lệ chốt', align: 'right' }, { label: 'Doanh thu đơn chốt', align: 'right' }, { label: 'Giao TC', align: 'right' }, { label: 'Doanh thu giao TC', align: 'right' }, { label: 'Hoàn / Hủy', align: 'right' }, { label: 'Mục tiêu', align: 'right' }],
            rows: employees.map((r, i) => { const t = targets[`employee:${r.sellerId}`]; return [i + 1, r.name, r.department ?? '—', vnNum(r.assignedOrders), vnNum(r.closedOrders), pctText(r.assignedCloseRate, 2), vnMoney(r.closedNet), vnNum(r.groups.delivered.orders), vnMoney(r.groups.delivered.net), `${vnNum(r.groups.returned.orders)} / ${vnNum(r.groups.cancelled.orders)}`, t?.revenue ? pctText(r.closedNet / t.revenue * 100, 0) : '—']; }) },
        ] },
        { title: 'Đối chiếu cuối kỳ', subtitle: 'Tình trạng đồng bộ và các khoản chưa ổn định', blocks: [
          { type: 'list', items: [
            ...report.pos.filter((p) => posIds.includes(p.id)).map((p) => ({ label: `${p.name} · đồng bộ ${dt(p.syncedAt, true)}`, value: p.lastError ? 'Lỗi đồng bộ' : !p.connected ? 'Chưa kết nối' : p.backfillDone ? 'Đủ lịch sử' : `Đang lấy lịch sử ${p.backfillMonth ?? ''}`, tone: p.lastError ? 'red' : p.backfillDone ? 'green' : 'orange' })),
            { label: 'Đơn đang giao chưa có kết quả', value: `${vnNum(cur.groups.shipping.orders)} đơn · ${vnMoney(cur.groups.shipping.net)}`, tone: 'orange' },
            { label: 'Đơn mới / chờ xác nhận', value: `${vnNum(cur.groups.new.orders)} đơn`, tone: 'gray' },
            { label: 'Giá trị đơn hoàn', value: vnMoney(cur.groups.returned.net), tone: 'purple' },
          ] },
        ] },
      ],
    };
    await downloadDeck(deck, `slide-bao-cao-thang_${month}`);
  };

  // Chọn nhanh: tháng này / tháng trước / tháng trước nữa (cùng state với ô tháng).
  const quickMonths = [0, 1, 2].map((back) => {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1)).toISOString().slice(0, 7);
    return { value: d, label: back === 0 ? 'Tháng này' : back === 1 ? 'Tháng trước' : `${d.slice(5)}/${d.slice(0, 4)}` };
  });
  const goal = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.revenue ?? 0), 0);
  const goalOrders = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.closedOrders ?? 0), 0);
  // Tooltip KPI: tháng này / tháng trước / chênh lệch / cách tính.
  const periodLabel = `${dmy(start)}–${dmy(end)}`;
  const tipOf = (c: number, p: number | null | undefined, fmt: (n: number) => string, definition: string): TipRows => ({
    period: periodLabel, current: fmt(c),
    previous: p === null || p === undefined ? undefined : fmt(p), previousLabel: 'Tháng trước',
    diff: p === null || p === undefined ? undefined : diffText(c, p, fmt), definition,
  });
  const rr = returnRate(cur), rrPrev = returnRate(prev), cr = cancelRate(cur), crPrev = cancelRate(prev);
  const listItem = 'flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:bg-surface-2';

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Báo cáo cuối tháng" subtitle="So với tháng trước · số liệu Pancake tại lúc đồng bộ"
        badge={end < endOfMonth(month, '9999-12-31') ? <StatusChip tone="orange">Tháng chưa kết thúc</StatusChip> : <StatusChip tone="green">Đã khép tháng</StatusChip>}
        actions={<><StaleChip stale={stale} at={at} loading={loading} error={report ? error : null} onRetry={reload} /><Button variant="outline" onClick={exportSlides} disabled={!report}>Xuất slide</Button><Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button></>} />
      <Toolbar>
        <span className="px-1 text-[12.5px] font-semibold text-ink-2">Tháng</span>
        <Input type="month" aria-label="Chọn tháng" className="w-auto" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <SegmentedControl<string> ariaLabel="Chọn nhanh tháng" value={month} onChange={setMonth} options={quickMonths} />
        <Button className="ml-auto" variant="outline" onClick={reload} disabled={loading} aria-busy={loading || undefined}>
          <RotateCcw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />{loading ? 'Đang tải…' : 'Tải lại'}
        </Button>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {error && !report && <ErrorBox error={error} onRetry={reload} />}
      {!report && !error && (
        <>
          <SkeletonKpis count={5} className="xl:grid-cols-5" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" aria-busy="true">
            <ChartCard icon={Coins} title="Từ đơn tạo đến giao thành công" loading><div className="h-56" /></ChartCard>
            <ChartCard icon={BarChart3} title="Doanh thu theo POS" loading><div className="h-72" /></ChartCard>
          </div>
        </>
      )}
      {report && cur && (
        <>
          {goal || goalOrders ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {goal > 0 && <KpiCard icon={Target} tone="lime" label="Hoàn thành mục tiêu doanh thu đơn chốt" value={pct(cur.closedNet / goal * 100)} countUp rawValue={cur.closedNet / goal * 100} format={(n) => pct(n)}
                note={`${money(cur.closedNet)} / mục tiêu ${money(goal)} · còn ${money(Math.max(0, goal - cur.closedNet))}`} progress={{ value: cur.closedNet, max: goal }}
                tooltip={{ period: periodLabel, current: money(cur.closedNet), previous: money(goal), previousLabel: 'Mục tiêu tháng', diff: `còn ${money(Math.max(0, goal - cur.closedNet))}`, definition: 'Doanh thu đơn chốt trong tháng ÷ tổng mục tiêu doanh thu của các POS đang chọn.' }} />}
              {goalOrders > 0 && <KpiCard icon={Target} tone="teal" label="Hoàn thành mục tiêu đơn chốt" value={pct(cur.closedOrders / goalOrders * 100)} countUp rawValue={cur.closedOrders / goalOrders * 100} format={(n) => pct(n)}
                note={`${vi.format(cur.closedOrders)} / mục tiêu ${vi.format(goalOrders)} đơn`} progress={{ value: cur.closedOrders, max: goalOrders }}
                tooltip={{ period: periodLabel, current: `${vi.format(cur.closedOrders)} đơn`, previous: `${vi.format(goalOrders)} đơn`, previousLabel: 'Mục tiêu tháng', diff: `còn ${vi.format(Math.max(0, goalOrders - cur.closedOrders))} đơn`, definition: 'Đơn chốt trong tháng ÷ tổng mục tiêu đơn chốt của các POS đang chọn.' }} />}
            </div>
          ) : <p className="text-xs text-ink-3">Chưa đặt mục tiêu tháng này. Vào Cấu hình & kết nối → Mục tiêu tháng để đặt.</p>}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5" aria-busy={loading || undefined}>
            <KpiCard icon={BarChart3} tone="green" label="Doanh thu giao thành công" value={short(cur.groups.delivered.net)} unit="₫" countUp rawValue={cur.groups.delivered.net} format={short}
              delta={delta(cur.groups.delivered.net, prev?.groups.delivered.net)} deltaLabel="So với tháng trước" note={prev ? `Tháng trước: ${money(prev.groups.delivered.net)}` : undefined}
              tooltip={tipOf(cur.groups.delivered.net, prev?.groups.delivered.net, money, 'Tiền hàng (sau giảm giá) của đơn tạo trong tháng đang ở trạng thái giao thành công lúc đồng bộ.')} sparkline={weekly.map((w) => w.deliveredNet)} />
            <KpiCard icon={PackageCheck} tone="teal" label="Đơn giao thành công" value={vi.format(cur.groups.delivered.orders)} countUp rawValue={cur.groups.delivered.orders} format={fmtInt}
              delta={delta(cur.groups.delivered.orders, prev?.groups.delivered.orders)} deltaLabel="So với tháng trước" note={prev ? `Tháng trước: ${vi.format(prev.groups.delivered.orders)} đơn` : undefined}
              tooltip={tipOf(cur.groups.delivered.orders, prev?.groups.delivered.orders, fmtInt, 'Số đơn tạo trong tháng đang ở trạng thái giao thành công lúc đồng bộ.')} sparkline={weekly.map((w) => w.deliveredOrders)} />
            <KpiCard icon={Coins} tone="blue" label="Giá trị trung bình đơn" value={cur.deliveredAverage ? short(cur.deliveredAverage) : '—'} unit={cur.deliveredAverage ? '₫' : undefined}
              countUp={!!cur.deliveredAverage} rawValue={cur.deliveredAverage ?? undefined} format={short}
              delta={cur.deliveredAverage && prev?.deliveredAverage ? delta(cur.deliveredAverage, prev.deliveredAverage) : null} deltaLabel="So với tháng trước" note="Doanh thu giao TC ÷ đơn giao TC"
              tooltip={cur.deliveredAverage ? tipOf(cur.deliveredAverage, prev?.deliveredAverage, money, 'Doanh thu giao thành công ÷ số đơn giao thành công.') : undefined} />
            <KpiCard icon={Undo2} tone="orange" label="Tỷ lệ hoàn" value={pct(rr)} countUp={rr !== null} rawValue={rr ?? undefined} format={(n) => pct(n)}
              delta={rr !== null && rrPrev !== null ? rr - rrPrev : null} deltaLabel="điểm % so với tháng trước" invert note={`${vi.format(cur.groups.returned.orders)} đơn hoàn / ${vi.format(cur.closedOrders)} đơn chốt`}
              tooltip={{ period: periodLabel, current: pct(rr), previous: pct(rrPrev), previousLabel: 'Tháng trước', definition: 'Đơn hoàn ÷ đơn chốt trong tháng (đơn hoàn tính theo ngày tạo).' }} />
            <KpiCard icon={XCircle} tone="red" label="Tỷ lệ hủy" value={pct(cr)} countUp={cr !== null} rawValue={cr ?? undefined} format={(n) => pct(n)}
              delta={cr !== null && crPrev !== null ? cr - crPrev : null} deltaLabel="điểm % so với tháng trước" invert note={`${vi.format(cur.groups.cancelled.orders)} đơn hủy / ${vi.format(cur.orders)} đơn tạo`}
              tooltip={{ period: periodLabel, current: pct(cr), previous: pct(crPrev), previousLabel: 'Tháng trước', definition: 'Đơn hủy ÷ đơn tạo trong tháng (theo ngày tạo đơn).' }} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard icon={Coins} title="Từ đơn tạo đến giao thành công" subtitle={`Đơn tạo trong ${month.slice(5)}/${month.slice(0, 4)} · triệu đồng`}>
              {(() => {
                // Thanh cấu phần: tiền hàng đơn tạo = giao thành công + các khoản chưa thành doanh thu. Đọc được ngay cả khi khoản nhỏ.
                const total = Math.max(1, cur.net);
                const parts = [
                  { key: 'delivered', label: 'Giao thành công', value: cur.groups.delivered.net, color: STATUS_VARS.delivered },
                  { key: 'shipping', label: 'Đang giao', value: cur.groups.shipping.net, color: STATUS_VARS.shipping },
                  { key: 'confirmed', label: 'Đang xử lý', value: cur.groups.confirmed.net, color: STATUS_VARS.confirmed },
                  { key: 'new', label: 'Mới / chờ XN', value: cur.groups.new.net, color: STATUS_VARS.new },
                  { key: 'returned', label: 'Hoàn', value: cur.groups.returned.net, color: STATUS_VARS.returned },
                  { key: 'cancelled', label: 'Hủy', value: cur.groups.cancelled.net, color: STATUS_VARS.cancelled },
                ];
                return (
                  <div>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm"><span className="font-semibold">Tiền hàng đơn tạo <span className="num">{money(cur.net)}</span></span><span className="text-xs text-ink-3">= giao thành công + các khoản còn lại</span></div>
                    <div className="flex h-8 w-full overflow-hidden rounded-lg bg-surface-3" aria-hidden="true">
                      {parts.map((p) => p.value > 0 && <div key={p.key} title={`${p.label}: ${money(p.value)} · ${pct(p.value / total * 100)}`} style={{ width: `${Math.max(0.4, p.value / total * 100)}%`, background: p.color }} className="h-full border-r border-surface/70 transition-[filter] duration-[var(--dur)] ease-[var(--ease)] last:border-r-0 hover:brightness-110" />)}
                    </div>
                    <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                      {parts.map((p) => (
                        <li key={p.key} className="flex items-center gap-2">
                          <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{p.label}</span>
                          <span className="num whitespace-nowrap">{money(p.value)}</span>
                          <span className="num w-12 whitespace-nowrap text-right text-xs text-ink-3">{pct(p.value / total * 100)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              <p className="mt-2 text-xs text-ink-3">Thanh trên chia tiền hàng đơn tạo thành giao thành công (xanh) và các khoản chưa thành doanh thu; tỷ lệ tính trên tiền hàng đơn tạo.</p>
            </ChartCard>
            <ChartCard icon={BarChart3} title="Doanh thu theo POS" subtitle="Triệu đồng">
              <ChartContainer className="h-72 w-full aspect-auto" config={chartConfig}>
                <BarChart data={posChart} barGap={2} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} tickFormatter={shortPosName} />
                  <YAxis tickLine={false} axisLine={false} width={44} />
                  <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltipContent formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{chartConfig[String(name) as keyof typeof chartConfig]?.label ?? name}</span><strong className="num">{vi.format(Number(value))} tr</strong></span>} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="closed" fill="var(--color-closed)" radius={[4, 4, 0, 0]} isAnimationActive={motionOn} />
                  <Bar dataKey="delivered" radius={[4, 4, 0, 0]} isAnimationActive={motionOn}>
                    {posChart.map((p) => <Cell key={p.id} fill={posVar(p.id)} />)}
                    <LabelList dataKey="delivered" position="top" formatter={(v) => vi.format(Math.round(Number(v)))} fontSize={11} fontWeight={700} fill="var(--ink-2)" className="num" />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard icon={CalendarDays} title="Theo tuần" subtitle="Doanh thu và đơn giao thành công">
              <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
                <LineChart data={weekly}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickFormatter={(v: string) => v} />
                  <YAxis yAxisId="m" tickLine={false} axisLine={false} width={44} />
                  <YAxis yAxisId="n" orientation="right" tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={<ChartTooltipContent labelFormatter={(_l, payload) => `${payload?.[0]?.payload?.label} (${payload?.[0]?.payload?.sub})`} formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{chartConfig[String(name) as keyof typeof chartConfig]?.label ?? name}</span><strong className="num">{vi.format(Number(value))}</strong></span>} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line yAxisId="m" type="monotone" dataKey="deliveredM" stroke="var(--color-deliveredM)" strokeWidth={2.5} strokeLinecap="round" dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={motionOn} />
                  <Line yAxisId="m" type="monotone" dataKey="closedM" stroke="var(--color-closedM)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3.5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={motionOn} />
                  <Line yAxisId="n" type="monotone" dataKey="deliveredOrders" stroke="var(--color-deliveredOrders)" strokeWidth={2} strokeLinecap="round" dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={motionOn} />
                </LineChart>
              </ChartContainer>
            </ChartCard>
            <ChartCard icon={ClipboardCheck} title="Đối chiếu cuối kỳ" subtitle="Kiểm tra dữ liệu trước khi chốt số">
              <ul className="space-y-2 text-sm">
                {report.pos.filter((p) => posIds.includes(p.id)).map((p) => (
                  <li key={p.id} className={listItem}>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"><span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: posVar(p.id) }} aria-hidden="true" />{p.name}<span className="text-xs text-ink-3">đồng bộ <span className="num">{dt(p.syncedAt, true)}</span></span></span>
                    {p.lastError ? <StatusChip tone="red"><XCircle size={11} />Lỗi đồng bộ</StatusChip> : !p.connected ? <StatusChip tone="gray">Chưa kết nối</StatusChip> : p.backfillDone ? <StatusChip tone="green"><CheckCircle2 size={11} />Đủ lịch sử</StatusChip> : <StatusChip tone="orange">Đang lấy lịch sử {p.backfillMonth ? `${p.backfillMonth.slice(5)}/${p.backfillMonth.slice(0, 4)}` : ''}</StatusChip>}
                  </li>
                ))}
                <li className={listItem}><span className="flex items-center gap-2"><Truck size={14} className="text-ink-3" aria-hidden="true" />Đơn đang giao chưa có kết quả</span><strong className="num whitespace-nowrap">{vi.format(cur.groups.shipping.orders)} đơn · {shortMoney(cur.groups.shipping.net)}</strong></li>
                <li className={listItem}><span className="flex items-center gap-2"><ClipboardCheck size={14} className="text-ink-3" aria-hidden="true" />Đơn mới / chờ xác nhận</span><strong className="num whitespace-nowrap">{vi.format(cur.groups.new.orders)} đơn</strong></li>
                <li className={listItem}><span className="flex items-center gap-2"><Undo2 size={14} className="text-ink-3" aria-hidden="true" />Giá trị đơn hoàn</span><strong className="num whitespace-nowrap">{money(cur.groups.returned.net)}</strong></li>
              </ul>
              <p className="mt-3 text-xs text-ink-3">Số của tháng chỉ ổn định khi đơn đang giao đã có kết quả và các POS đã lấy đủ lịch sử.</p>
            </ChartCard>
          </div>

          <ChartCard icon={PackageCheck} title="Theo POS" subtitle="So với tháng trước">
            <TableWrap minWidth={1040} stickyFirst>
              <table className="tbl">
                <thead><tr><th>POS</th><th className="n">Đơn tạo</th><th className="n">Đơn chốt</th><th className="n">Doanh thu đơn chốt</th><th className="n">Giao TC</th><th className="n">Doanh thu giao TC</th><th>Tỷ trọng</th><th className="n">Hoàn</th><th className="n">Hủy</th><th>Mục tiêu tháng</th><th className="n">So với tháng trước</th></tr></thead>
                <tbody>
                  {byPos.map(({ id, row, prev: p }, i) => (
                    <tr key={id}>
                      <td className="font-medium"><span className="num mr-2 text-[11px] text-ink-4">{i + 1}</span><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: posVar(id) }} aria-hidden="true" />{posName(id)}</td>
                      <td className="n">{vi.format(row!.orders)}</td>
                      <td className="n">{vi.format(row!.closedOrders)}</td>
                      <td className="n">{money(row!.closedNet)}</td>
                      <td className="n">{vi.format(row!.groups.delivered.orders)}</td>
                      <td className="n">{money(row!.groups.delivered.net)}</td>
                      <td><ProgressBar value={row!.groups.delivered.net} max={cur.groups.delivered.net} width={96} size="sm" color={posVar(id)} className="mr-2" /><span className="num text-xs text-ink-3">{pct(cur.groups.delivered.net ? row!.groups.delivered.net / cur.groups.delivered.net * 100 : null)}</span></td>
                      <td className="n">{vi.format(row!.groups.returned.orders)} <span className="text-[11px] text-ink-3">({pct(returnRate(row!))})</span></td>
                      <td className="n">{vi.format(row!.groups.cancelled.orders)} <span className="text-[11px] text-ink-3">({pct(cancelRate(row!))})</span></td>
                      <td><GoalCell value={row!.closedNet} goal={targets[`pos:${id}`]?.revenue ?? 0} sub={`${money(row!.closedNet)} / ${shortMoney(targets[`pos:${id}`]?.revenue ?? 0)}`} /></td>
                      <td className="n"><DeltaPill value={delta(row!.groups.delivered.net, p?.groups.delivered.net)} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td className="bg-surface-2">Tổng</td><td className="n">{vi.format(cur.orders)}</td><td className="n">{vi.format(cur.closedOrders)}</td><td className="n">{money(cur.closedNet)}</td><td className="n">{vi.format(cur.groups.delivered.orders)}</td><td className="n">{money(cur.groups.delivered.net)}</td><td /><td className="n">{vi.format(cur.groups.returned.orders)}</td><td className="n">{vi.format(cur.groups.cancelled.orders)}</td><td>{goal ? <span className="num text-xs">{pct(cur.closedNet / goal * 100, 0)} · {short(cur.closedNet)} / {shortMoney(goal)}</span> : <span className="text-xs text-ink-4">—</span>}</td><td className="n"><DeltaPill value={delta(cur.groups.delivered.net, prev?.groups.delivered.net)} /></td></tr>
                </tfoot>
              </table>
            </TableWrap>
          </ChartCard>

          <ChartCard icon={CheckCircle2} title="Nhân viên" subtitle="Top 30 theo doanh thu giao thành công · bấm tiêu đề cột để sắp xếp">
            <TableWrap minWidth={team !== 'cskh' ? 1080 : 880} maxHeight="32rem" stickyFirst>
              <table className="tbl">
                <thead>
                  <tr>
                    <SortTh k="name" label="Nhân viên" sort={sort} align="left" /><th>Bộ phận</th>
                    {team !== 'cskh' && <><SortTh k="assignedOrders" label="Đơn chia" sort={sort} /><SortTh k="closedOrders" label="Đơn chốt" sort={sort} /><SortTh k="closeRate" label="Tỷ lệ chốt" sort={sort} /></>}
                    <SortTh k="closedNet" label="Doanh thu đơn chốt" sort={sort} /><SortTh k="averageOrder" label="GTTB (AOV)" sort={sort} /><SortTh k="deliveredOrders" label="Giao TC" sort={sort} /><SortTh k="deliveredNet" label="Doanh thu giao TC" sort={sort} /><SortTh k="returned" label="Hoàn / Hủy" sort={sort} />
                    <th>Mục tiêu tháng</th><th className="n">So với tháng trước</th>
                  </tr>
                </thead>
                <tbody>
                  {empRows.map((r, i) => {
                    const p = report.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
                    const t = targets[`employee:${r.sellerId}`];
                    return (
                      <tr key={r.sellerId || 'none'}>
                        <td className="font-medium"><span className="num mr-2 text-[11px] text-ink-4">{i + 1}</span>{r.name}</td><td className="mut text-xs">{r.department ?? '—'}</td>
                        {team !== 'cskh' && <><td className="n">{vi.format(r.assignedOrders)}</td><td className="n">{vi.format(r.closedOrders)}</td><td className="n">{pct(r.assignedCloseRate, 2)}</td></>}
                        <td className="n">{money(r.closedNet)}</td><td className="n">{r.averageOrder ? money(r.averageOrder) : '—'}</td><td className="n">{vi.format(r.groups.delivered.orders)}</td><td className="n">{money(r.groups.delivered.net)}</td>
                        <td className="n">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                        <td>{!t?.revenue && !t?.closedOrders ? <span className="text-xs text-ink-4">—</span> : t.revenue
                          ? <GoalCell value={r.closedNet} goal={t.revenue} sub={`${short(r.closedNet)} / ${shortMoney(t.revenue)}`} />
                          : <GoalCell value={r.closedOrders} goal={t.closedOrders} sub={`${vi.format(r.closedOrders)} / ${vi.format(t.closedOrders)} đơn`} />}</td>
                        <td className="n"><DeltaPill value={delta(r.groups.delivered.net, p?.groups.delivered.net)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </ChartCard>
        </>
      )}
    </div>
  );
}
