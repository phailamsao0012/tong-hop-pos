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
import { fetchTargets, type TargetItem } from './targets-panel';
import { useTeam } from './team-store';
import { Target } from 'lucide-react';
import { downloadDeck, pctText, trieu, vnMoney, vnNum, SLIDE_COLORS, type Deck } from './slide-export';

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
  const team = useTeam();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [report, setReport] = useState<OverviewReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, TargetItem>>({});
  const start = monthStart(`${month}-01`), end = endOfMonth(month, today);
  useEffect(() => { void fetchTargets(month).then(setTargets); }, [month]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ start, end, posIds: posIds.join(','), groupBy: 'week', compare: 'previous', team });
      const response = await fetch(`/api/reports/overview?${params}`, { cache: 'no-store' });
      const result = await response.json() as OverviewReport & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Không tải được báo cáo.');
      setReport(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được báo cáo.'); }
    finally { setLoading(false); }
  }, [start, end, posIds, team]);
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

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Báo cáo cuối tháng" subtitle="So với tháng trước · số liệu Pancake tại lúc đồng bộ"
        badge={end < endOfMonth(month, '9999-12-31') ? <StatusChip tone="orange">Tháng chưa kết thúc</StatusChip> : <StatusChip tone="green">Đã khép tháng</StatusChip>}
        actions={<><Button variant="outline" onClick={exportSlides} disabled={!report}>Xuất slide</Button><Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button></>} />
      <Toolbar>
        <span className="px-1 text-sm font-semibold text-[#62796d]">Tháng</span>
        <Input type="month" className="w-auto" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
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
          {(() => { const goal = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.revenue ?? 0), 0); const goalOrders = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.closedOrders ?? 0), 0); return goal || goalOrders ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {goal > 0 && <KpiCard icon={Target} tone="lime" label="Hoàn thành mục tiêu doanh thu đơn chốt" value={pct(cur.closedNet / goal * 100)} note={<span>{money(cur.closedNet)} / mục tiêu {money(goal)} · còn {money(Math.max(0, goal - cur.closedNet))}<span className="ml-2 inline-block h-2 w-32 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, cur.closedNet / goal * 100)}%`, background: cur.closedNet >= goal ? '#1a9c5b' : '#eda100' }} /></span></span>} />}
              {goalOrders > 0 && <KpiCard icon={Target} tone="teal" label="Hoàn thành mục tiêu đơn chốt" value={pct(cur.closedOrders / goalOrders * 100)} note={`${vi.format(cur.closedOrders)} / mục tiêu ${vi.format(goalOrders)} đơn`} />}
            </div>
          ) : <p className="text-xs text-[#7d9184]">Chưa đặt mục tiêu tháng này. Vào Cấu hình & kết nối → Mục tiêu tháng để đặt.</p>; })()}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5">
            <KpiCard icon={BarChart3} tone="green" label="Doanh thu giao thành công" value={money(cur.groups.delivered.net)} delta={delta(cur.groups.delivered.net, prev?.groups.delivered.net)} deltaLabel="So với tháng trước" note={prev ? `Tháng trước: ${money(prev.groups.delivered.net)}` : undefined} />
            <KpiCard icon={PackageCheck} tone="teal" label="Đơn giao thành công" value={vi.format(cur.groups.delivered.orders)} delta={delta(cur.groups.delivered.orders, prev?.groups.delivered.orders)} deltaLabel="So với tháng trước" note={prev ? `Tháng trước: ${vi.format(prev.groups.delivered.orders)} đơn` : undefined} />
            <KpiCard icon={Coins} tone="blue" label="Giá trị trung bình đơn" value={cur.deliveredAverage ? money(cur.deliveredAverage) : '—'} delta={cur.deliveredAverage && prev?.deliveredAverage ? delta(cur.deliveredAverage, prev.deliveredAverage) : null} deltaLabel="So với tháng trước" note="Doanh thu giao TC ÷ đơn giao TC" />
            <KpiCard icon={Undo2} tone="orange" label="Tỷ lệ hoàn" value={pct(returnRate(cur))} delta={returnRate(cur) !== null && returnRate(prev) !== null ? (returnRate(cur)! - returnRate(prev)!) : null} deltaLabel="điểm % so với tháng trước" invert note={`${vi.format(cur.groups.returned.orders)} đơn hoàn / ${vi.format(cur.closedOrders)} đơn chốt`} />
            <KpiCard icon={XCircle} tone="red" label="Tỷ lệ hủy" value={pct(cancelRate(cur))} delta={cancelRate(cur) !== null && cancelRate(prev) !== null ? (cancelRate(cur)! - cancelRate(prev)!) : null} deltaLabel="điểm % so với tháng trước" invert note={`${vi.format(cur.groups.cancelled.orders)} đơn hủy / ${vi.format(cur.orders)} đơn tạo`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard icon={Coins} title="Từ đơn tạo đến giao thành công" subtitle={`Đơn tạo trong ${month.slice(5)}/${month.slice(0, 4)} · triệu đồng`}>
              {(() => {
                // Thanh cấu phần: tiền hàng đơn tạo = giao thành công + các khoản chưa thành doanh thu. Đọc được ngay cả khi khoản nhỏ.
                const total = Math.max(1, cur.net);
                const parts = [
                  { key: 'delivered', label: 'Giao thành công', value: cur.groups.delivered.net, color: '#17684b' },
                  { key: 'shipping', label: 'Đang giao', value: cur.groups.shipping.net, color: '#eda100' },
                  { key: 'confirmed', label: 'Đang xử lý', value: cur.groups.confirmed.net, color: '#2a78d6' },
                  { key: 'new', label: 'Mới / chờ XN', value: cur.groups.new.net, color: '#8a9a90' },
                  { key: 'returned', label: 'Hoàn', value: cur.groups.returned.net, color: '#eb6834' },
                  { key: 'cancelled', label: 'Hủy', value: cur.groups.cancelled.net, color: '#d24b4b' },
                ];
                return (
                  <div>
                    <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-semibold">Tiền hàng đơn tạo {money(cur.net)}</span><span className="text-xs text-[#7d9184]">= giao thành công + các khoản còn lại</span></div>
                    <div className="flex h-8 w-full overflow-hidden rounded-lg bg-[#eef1ee]">
                      {parts.map((p) => p.value > 0 && <div key={p.key} title={`${p.label}: ${money(p.value)} · ${pct(p.value / total * 100)}`} style={{ width: `${Math.max(0.4, p.value / total * 100)}%`, background: p.color }} className="h-full border-r border-white/70 last:border-r-0" />)}
                    </div>
                    <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                      {parts.map((p) => (
                        <li key={p.key} className="flex items-center gap-2">
                          <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                          <span className="min-w-0 flex-1 truncate">{p.label}</span>
                          <span className="whitespace-nowrap font-medium tabular-nums">{money(p.value)}</span>
                          <span className="w-12 whitespace-nowrap text-right text-xs text-[#7d9184]">{pct(p.value / total * 100)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              <p className="mt-2 text-xs text-[#7d9184]">Thanh trên chia tiền hàng đơn tạo thành giao thành công (xanh) và các khoản chưa thành doanh thu; tỷ lệ tính trên tiền hàng đơn tạo.</p>
            </ChartCard>
            <ChartCard icon={BarChart3} title="Doanh thu theo POS" subtitle="Triệu đồng">
              <ChartContainer className="h-72 w-full aspect-auto" config={chartConfig}>
                <BarChart data={posChart} barGap={2} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tickLine={false} axisLine={false} width={44} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{chartConfig[String(name) as keyof typeof chartConfig]?.label ?? name}</span><strong>{vi.format(Number(value))} tr</strong></span>} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="closed" fill="var(--color-closed)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delivered" radius={[4, 4, 0, 0]}>
                    {posChart.map((p) => <Cell key={p.id} fill={posColor(p.id)} />)}
                    <LabelList dataKey="delivered" position="top" formatter={(v) => `${vi.format(Math.round(Number(v)))}\u00a0tr`} fontSize={11} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ChartCard icon={CalendarDays} title="Theo tuần" subtitle="Doanh thu và đơn giao thành công">
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

          <ChartCard icon={PackageCheck} title="Theo POS" subtitle="So với tháng trước">
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>POS</th><th className="text-right">Đơn tạo</th><th className="text-right">Đơn chốt</th><th className="text-right">Doanh thu đơn chốt</th><th className="text-right">Giao TC</th><th className="text-right">Doanh thu giao TC</th><th>Tỷ trọng</th><th className="text-right">Hoàn</th><th className="text-right">Hủy</th><th>Mục tiêu tháng</th><th className="text-right">So với tháng trước</th></tr></thead>
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
                      <td className="whitespace-nowrap">{(() => { const g = targets[`pos:${id}`]?.revenue ?? 0; if (!g) return <span className="text-xs text-[#9db3a5]">—</span>; const d = row!.closedNet / g * 100; return <><span className="inline-block h-2 w-20 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, d)}%`, background: d >= 100 ? '#1a9c5b' : d >= 70 ? '#eda100' : '#d24b4b' }} /></span> <span className="text-xs font-medium">{pct(d, 0)}</span><div className="text-[11px] text-[#7d9184]">{money(row!.closedNet)} / {short(g)} đ</div></>; })()}</td>
                      <td className="whitespace-nowrap text-right"><DeltaPill value={delta(row!.groups.delivered.net, p?.groups.delivered.net)} /></td>
                    </tr>
                  ))}
                  <tr className="border-t bg-[#f8faf8] font-semibold"><td className="py-2.5" /><td>Tổng</td><td className="text-right">{vi.format(cur.orders)}</td><td className="text-right">{vi.format(cur.closedOrders)}</td><td className="whitespace-nowrap text-right">{money(cur.closedNet)}</td><td className="text-right">{vi.format(cur.groups.delivered.orders)}</td><td className="whitespace-nowrap text-right">{money(cur.groups.delivered.net)}</td><td /><td className="text-right">{vi.format(cur.groups.returned.orders)}</td><td className="text-right">{vi.format(cur.groups.cancelled.orders)}</td><td /><td className="text-right"><DeltaPill value={delta(cur.groups.delivered.net, prev?.groups.delivered.net)} /></td></tr>
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard icon={CheckCircle2} title="Nhân viên" subtitle="Top 30 theo doanh thu giao thành công">
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Nhân viên</th><th>Bộ phận</th>{team !== 'cskh' && <><th className="text-right">Đơn chia</th><th className="text-right">Đơn chốt</th><th className="text-right">Tỷ lệ chốt</th></>}<th className="text-right">Doanh thu đơn chốt</th><th className="text-right">GTTB (AOV)</th><th className="text-right">Giao TC</th><th className="text-right">Doanh thu giao TC</th><th className="text-right">Hoàn / Hủy</th><th>Mục tiêu tháng</th><th className="text-right">So với tháng trước</th></tr></thead>
                <tbody>
                  {employees.map((r, i) => {
                    const p = report.compare?.byEmployee.find((x) => x.sellerId === r.sellerId);
                    return (
                      <tr key={r.sellerId || 'none'} className="border-t">
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td><td className="whitespace-nowrap font-medium">{r.name}</td><td className="text-xs text-[#7d9184]">{r.department ?? '—'}</td>
                        {team !== 'cskh' && <><td className="whitespace-nowrap text-right">{vi.format(r.assignedOrders)}</td><td className="whitespace-nowrap text-right">{vi.format(r.closedOrders)}</td><td className="whitespace-nowrap text-right">{pct(r.assignedCloseRate, 2)}</td></>}
                        <td className="whitespace-nowrap text-right">{money(r.closedNet)}</td><td className="whitespace-nowrap text-right">{r.averageOrder ? money(r.averageOrder) : '—'}</td><td className="whitespace-nowrap text-right">{vi.format(r.groups.delivered.orders)}</td><td className="whitespace-nowrap text-right font-semibold">{money(r.groups.delivered.net)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(r.groups.returned.orders)} / {vi.format(r.groups.cancelled.orders)}</td>
                        <td className="whitespace-nowrap">{(() => { const t = targets[`employee:${r.sellerId}`]; if (!t?.revenue && !t?.closedOrders) return <span className="text-xs text-[#9db3a5]">—</span>; const d = t.revenue ? r.closedNet / t.revenue * 100 : r.closedOrders / t.closedOrders * 100; return <><span className="inline-block h-2 w-20 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, d)}%`, background: d >= 100 ? '#1a9c5b' : d >= 70 ? '#eda100' : '#d24b4b' }} /></span> <span className="text-xs font-medium">{pct(d, 0)}</span><div className="text-[11px] text-[#7d9184]">{t.revenue ? `${short(r.closedNet)} / ${short(t.revenue)} đ` : `${r.closedOrders} / ${t.closedOrders} đơn`}</div></>; })()}</td>
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
