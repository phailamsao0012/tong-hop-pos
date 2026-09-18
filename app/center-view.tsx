'use client';

// Điều khiển trung tâm: gom chỉ số quan trọng của mọi trang con; mỗi khối có "Xem chi tiết" sang trang tương ứng.
// Hai kiểu hiển thị: cuộn dọc (mặc định) và màn hình TV (vừa khít một màn hình, chữ to, không cuộn).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis, ComposedChart } from 'recharts';
import {
  AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ClipboardList, Coins, Database, Flame, Monitor, PackageCheck, Repeat, ShoppingCart, Target, Truck, Users, Wifi, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { POS } from '@/lib/report-model';
import { addDays, comparePeriod, todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange, type OverviewReport } from './overview-view';
import { fetchTargets, type TargetItem } from './targets-panel';
import { TEAM_LABELS, setTeam, useTeam, type Team } from './team-store';
import { ChartCard, DeltaPill, Donut, ErrorBox, KpiCard, PageHeader, STATUS_COLORS, STATUS_LABELS, StatusChip, delta, dmy, dt, money, pct, posColor, posName, short, timeOnly, vi } from './ui-kit';

type Metrics = OverviewReport['current']['total'];
type Shift = { shift: string; hours: { start: number; end: number }; syncedAt: string | null; total: { received: number; closed: number; hotOrders: number; hotValue: number; rate: number | null }; yesterday: { received: number; closed: number; rate: number | null }; alerts: { level: 'high' | 'medium'; title: string; detail: string }[]; staff: { name: string; received: number; closed: number; rate: number | null }[] };
type Pipeline = { total: Record<'closed' | 'processing' | 'shipping' | 'delivered' | 'returned' | 'cancelled' | 'shipped', { orders: number; net: number; gross: number }> };
type Customers = { groups: Record<string, number> | null; segments?: { vip: number; loyal: number; active: number; new: number; risk: number; potential: number; dormant: number; never: number; buyers: number; ltvTotal: number } };
type Repurchase = { funnel: { once: number; twice: number; thrice: number }; summary: { repurchase: { customers: number; orders: number; net: number }; successOrders: number } };
type Batches = { batches: { received: number; buyers: number; repeatBuyers: number; net: number; sellerId: string }[] };
type SyncRow = { posId: string; lastSyncAt: string | null; lastError: string | null; backfillCursor: { month: string; completed?: boolean } | null };
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const SHIFT_LABELS: Record<string, string> = { morning: 'Ca sáng', afternoon: 'Ca chiều', evening: 'Ca tối', day: 'Cả ngày' };

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() as T : null; } catch { return null; }
}

export function CenterView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const today = todayVn();
  const team = useTeam();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [tv, setTv] = useState(false);
  const [report, setReport] = useState<OverviewReport | null>(null);
  const [trend, setTrend] = useState<OverviewReport | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [customers, setCustomers] = useState<Customers | null>(null);
  const [repurchase, setRepurchase] = useState<Repurchase | null>(null);
  const [batches, setBatches] = useState<Batches | null>(null);
  const [sync, setSync] = useState<SyncRow[]>([]);
  const [targets, setTargets] = useState<Record<string, TargetItem>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const pos = posIds.join(',');
    const base = { posIds: pos, team };
    const [r, t, s, p, c, rp, b, sy, tg] = await Promise.all([
      getJson<OverviewReport & { error?: string }>(`/api/reports/overview?${new URLSearchParams({ ...base, start, end, groupBy: 'day', compare: 'previous' })}`),
      getJson<OverviewReport>(`/api/reports/overview?${new URLSearchParams({ ...base, start: addDays(today, -29), end: today, groupBy: 'day', compare: 'none' })}`),
      getJson<Shift>(`/api/reports/shift?${new URLSearchParams({ ...base, date: today, shift: 'auto' })}`),
      getJson<Pipeline>(`/api/reports/pipeline?${new URLSearchParams({ ...base, start, end, basis: 'confirmed' })}`),
      getJson<Customers>(`/api/reports/customers?${new URLSearchParams({ ...base, group: 'all', page: '1', sort: 'spend' })}`),
      getJson<Repurchase>(`/api/reports/repurchase?${new URLSearchParams({ ...base, start, end })}`),
      getJson<Batches>(`/api/reports/batches?${new URLSearchParams({ ...base, start, end })}`),
      getJson<SyncRow[]>('/api/sync/pos'),
      fetchTargets(end.slice(0, 7)),
    ]);
    if (!r) setError('Không tải được báo cáo tổng quan.');
    setReport(r); setTrend(t); setShift(s); setPipeline(p); setCustomers(c); setRepurchase(rp); setBatches(b); setSync(sy ?? []); setTargets(tg);
    setUpdatedAt(new Date().toISOString()); setLoading(false);
  }, [start, end, posIds, team, today]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5 * 60000); return () => clearInterval(id); }, [load]);

  const cur = report?.current.total, prev = report?.compare?.total;
  const cmp = comparePeriod(start, end, 'previous');
  const trendRows = useMemo(() => {
    if (!trend) return [];
    const map = new Map<string, { day: string; closedOrders: number; closedNet: number; orders: number }>();
    for (const s of trend.current.series) { const row = map.get(s.bucket) ?? { day: s.bucket, closedOrders: 0, closedNet: 0, orders: 0 }; row.closedOrders += s.closedOrders; row.closedNet += s.closedNet; row.orders += s.orders; map.set(s.bucket, row); }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ ...r, closedM: Math.round(r.closedNet / 1e4) / 100 }));
  }, [trend]);
  const posRows = useMemo(() => (report ? posIds.map((id) => ({ id, row: report.current.byPos.find((r) => r.posId === id), prev: report.compare?.byPos.find((r) => r.posId === id) })).filter((x) => x.row).sort((a, b) => b.row!.closedNet - a.row!.closedNet) : []), [report, posIds]);
  const employees = useMemo(() => (report?.current.byEmployee ?? []).filter((e) => e.sellerId && e.assignedOrders >= 10), [report]);
  const topEmp = [...employees].sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1)).slice(0, 5);
  const lowEmp = [...employees].sort((a, b) => (a.assignedCloseRate ?? 999) - (b.assignedCloseRate ?? 999)).slice(0, 5);
  const goal = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.revenue ?? 0), 0);
  const bt = (batches?.batches ?? []).reduce((a, x) => ({ received: a.received + x.received, buyers: a.buyers + x.buyers, net: a.net + x.net }), { received: 0, buyers: 0, net: 0 });
  const seg = customers?.segments, g = customers?.groups;
  const syncBad = sync.filter((s) => posIds.includes(s.posId) && (s.lastError || !s.lastSyncAt || Date.now() - Date.parse(s.lastSyncAt) > 15 * 60000));
  const alerts = shift?.alerts ?? [];
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const Link = ({ view, label = 'Xem chi tiết' }: { view: string; label?: string }) => <button type="button" onClick={() => onNavigate(view)} className="inline-flex items-center gap-1 text-xs font-medium text-[#17684b] hover:underline">{label} <ArrowRight size={12} /></button>;
  const TeamSwitch = () => (
    <div className="flex items-center rounded-full border bg-[#f5f7f3] p-0.5 text-xs">
      {(Object.keys(TEAM_LABELS) as Team[]).map((t) => <button key={t} type="button" onClick={() => setTeam(t)} className={`whitespace-nowrap rounded-full px-3 py-1 font-medium ${team === t ? 'bg-[#17684b] text-white' : 'text-[#547467]'}`}>{TEAM_LABELS[t]}</button>)}
    </div>
  );

  const trendChart = (h: string) => (
    <ChartContainer className={`${h} w-full aspect-auto`} config={{ closedM: { label: 'Doanh thu đơn chốt (triệu đ)', color: '#17684b' }, closedOrders: { label: 'Đơn chốt', color: '#2a78d6' } }}>
      <ComposedChart data={trendRows}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={24} />
        <YAxis yAxisId="m" tickLine={false} axisLine={false} width={44} />
        <YAxis yAxisId="n" orientation="right" tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{name === 'closedM' ? 'Doanh thu' : 'Đơn chốt'}</span><strong>{name === 'closedM' ? `${vi.format(Number(value))} tr` : vi.format(Number(value))}</strong></span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area yAxisId="m" type="monotone" dataKey="closedM" stroke="var(--color-closedM)" fill="var(--color-closedM)" fillOpacity={0.15} strokeWidth={2} />
        <Line yAxisId="n" type="monotone" dataKey="closedOrders" stroke="var(--color-closedOrders)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
  const donut = (size: number) => cur ? <Donut size={size} centerValue={vi.format(cur.orders)} centerLabel="đơn tạo" slices={(Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[]).map((k) => ({ key: k, label: STATUS_LABELS[k], value: cur.groups[k].orders, color: STATUS_COLORS[k] }))} /> : null;
  const funnel = pipeline ? [
    { l: 'Đơn chốt', v: pipeline.total.closed.orders, p: 100 },
    { l: 'Đã xuất đi', v: pipeline.total.shipped.orders, p: pipeline.total.closed.orders ? pipeline.total.shipped.orders / pipeline.total.closed.orders * 100 : 0 },
    { l: 'Đã nhận', v: pipeline.total.delivered.orders, p: pipeline.total.closed.orders ? pipeline.total.delivered.orders / pipeline.total.closed.orders * 100 : 0 },
  ] : [];
  const posBars = (compact: boolean) => (
    <ul className="space-y-1.5">
      {posRows.map(({ id, row, prev: p }) => { const max = posRows[0]?.row?.closedNet || 1; const goalPos = targets[`pos:${id}`]?.revenue ?? 0; return (
        <li key={id} className="text-sm">
          <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-medium"><span className="inline-block size-2.5 rounded-full" style={{ background: posColor(id) }} />{posName(id)}</span><span className="flex items-center gap-2"><span className="font-semibold">{short(row!.closedNet)} đ</span><DeltaPill value={delta(row!.closedNet, p?.closedNet)} /></span></div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#7d9184]"><span className="inline-block h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef1ee]"><span className="block h-1.5 rounded-full" style={{ width: `${row!.closedNet / max * 100}%`, background: posColor(id) }} /></span><span className="w-40 whitespace-nowrap text-right">{vi.format(row!.closedOrders)} chốt · {pct(row!.closeRate, 0)}{goalPos && !compact ? ` · mục tiêu ${pct(row!.closedNet / goalPos * 100, 0)}` : ''}</span></div>
        </li>
      ); })}
    </ul>
  );
  const empList = (rows: typeof topEmp, tone: 'green' | 'red') => (
    <ol className="space-y-1 text-sm">{rows.map((e, i) => <li key={e.sellerId} className="flex items-center gap-2"><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white ${tone === 'green' ? 'bg-[#17684b]' : 'bg-[#c8403f]'}`}>{i + 1}</span><span className="flex-1 truncate">{e.name}</span><strong>{pct(e.assignedCloseRate)}</strong><span className="text-xs text-[#7d9184]">{e.closedOrders}/{e.assignedOrders}</span></li>)}{!rows.length && <li className="text-xs text-[#7d9184]">Chưa đủ dữ liệu (cần ≥ 10 đơn chia).</li>}</ol>
  );
  const syncList = (
    <ul className="space-y-1 text-xs">
      {POS.filter((p) => posIds.includes(p.id)).map((p) => { const s = sync.find((x) => x.posId === p.id); const bad = syncBad.some((x) => x.posId === p.id); return <li key={p.id} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: posColor(p.id) }} />{p.name}</span><span className={`flex items-center gap-1 ${bad ? 'text-[#c8403f]' : 'text-[#1a7a48]'}`}>{bad ? <WifiOff size={12} /> : <Wifi size={12} />}{timeOnly(s?.lastSyncAt)}{s?.backfillCursor && !s.backfillCursor.completed ? ' · lịch sử…' : ''}</span></li>; })}
    </ul>
  );

  const header = (
    <>
      <PageHeader eyebrow={`${periodLabel} · so với ${dmy(cmp.start)} – ${dmy(cmp.end)}`} title="Điều khiển trung tâm" subtitle={`Toàn cảnh 6 POS trong một trang · cập nhật ${updatedAt ? timeOnly(updatedAt) : '…'} · tự làm mới mỗi 5 phút`}
        actions={<><TeamSwitch /><Button variant={tv ? 'default' : 'outline'} onClick={() => setTv(!tv)}><Monitor size={14} />{tv ? 'Thoát màn hình TV' : 'Màn hình TV'}</Button></>} />
      {!tv && <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }} onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={() => void load()} />}
      {!tv && <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />}
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
    </>
  );

  if (tv) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h1 className="text-2xl font-semibold tracking-tight">Điều khiển trung tâm <span className="ml-2 text-base font-normal text-[#547467]">{periodLabel}</span></h1><p className="text-xs text-[#7d9184]">Cập nhật {updatedAt ? timeOnly(updatedAt) : '…'} · nhóm {TEAM_LABELS[team]} · {posIds.length === POS.length ? 'tất cả POS' : posIds.map(posName).join(', ')}</p></div>
          <div className="flex items-center gap-2"><TeamSwitch /><Button size="sm" variant="outline" onClick={() => setTv(false)}>Thoát TV</Button></div>
        </div>
        {error && <ErrorBox error={error} onRetry={() => void load()} />}
        {cur && (
          <div className="grid grid-cols-12 gap-3" style={{ gridAutoRows: 'minmax(0, 1fr)', height: 'calc(100vh - 7.5rem)' }}>
            {[
              { icon: ShoppingCart, tone: 'blue' as const, label: 'Đơn tạo mới', value: vi.format(cur.orders), d: delta(cur.orders, prev?.orders) },
              { icon: CheckCircle2, tone: 'green' as const, label: 'Đơn chốt', value: vi.format(cur.closedOrders), d: delta(cur.closedOrders, prev?.closedOrders) },
              { icon: Coins, tone: 'teal' as const, label: 'Doanh thu đơn chốt', value: short(cur.closedNet) + ' đ', d: delta(cur.closedNet, prev?.closedNet) },
              { icon: PackageCheck, tone: 'lime' as const, label: 'Giao thành công', value: vi.format(cur.groups.delivered.orders), d: delta(cur.groups.delivered.orders, prev?.groups.delivered.orders) },
              { icon: Flame, tone: 'orange' as const, label: `Chốt nóng ${shift ? SHIFT_LABELS[shift.shift] : ''}`, value: shift ? `${shift.total.closed}/${shift.total.received}` : '—', d: shift && shift.total.rate !== null && shift.yesterday.rate !== null ? shift.total.rate - shift.yesterday.rate : null, note: shift ? pct(shift.total.rate) : '' },
              { icon: Target, tone: 'purple' as const, label: 'Mục tiêu tháng', value: goal ? pct(cur.closedNet / goal * 100, 0) : '—', d: null, note: goal ? `${short(cur.closedNet)} / ${short(goal)} đ` : 'chưa đặt' },
            ].map((k) => (
              <div key={k.label} className="col-span-2 row-span-2 flex items-center gap-3 rounded-2xl border bg-white p-4"><span className={`grid size-12 shrink-0 place-items-center rounded-xl ${k.tone === 'blue' ? 'bg-[#e6f0fb] text-[#2a78d6]' : k.tone === 'green' ? 'bg-[#e4f5ea] text-[#17684b]' : k.tone === 'teal' ? 'bg-[#e1f5f0] text-[#0f8f74]' : k.tone === 'lime' ? 'bg-[#f1f8d6] text-[#5a7a12]' : k.tone === 'orange' ? 'bg-[#fdeee4] text-[#d85f2a]' : 'bg-[#ede9f9] text-[#5b48b8]'}`}><k.icon size={24} /></span><div className="min-w-0"><div className="text-xs text-[#6a8575]">{k.label}</div><div className="truncate text-3xl font-semibold tracking-tight">{k.value}</div><div className="text-xs text-[#7d9184]">{k.d !== null && k.d !== undefined ? <DeltaPill value={k.d} /> : null} {k.note ?? ''}</div></div></div>
            ))}
            <div className="col-span-6 row-span-4 rounded-2xl border bg-white p-3"><div className="mb-1 text-sm font-semibold">Xu hướng 30 ngày · đơn chốt và doanh thu</div>{trendChart('h-[calc(100%-1.5rem)]')}</div>
            <div className="col-span-3 row-span-4 rounded-2xl border bg-white p-3"><div className="mb-1 text-sm font-semibold">Trạng thái đơn</div>{donut(150)}</div>
            <div className="col-span-3 row-span-4 rounded-2xl border bg-white p-3"><div className="mb-2 text-sm font-semibold">Vận hành đơn</div>{funnel.map((f) => <div key={f.l} className="mb-2"><div className="flex justify-between text-xs"><span>{f.l}</span><strong>{vi.format(f.v)} · {pct(f.p, 0)}</strong></div><div className="h-2.5 rounded-full bg-[#eef1ee]"><div className="h-2.5 rounded-full bg-[#17684b]" style={{ width: `${f.p}%` }} /></div></div>)}{pipeline && <div className="mt-2 text-xs text-[#7d9184]">Hoàn {vi.format(pipeline.total.returned.orders)} · hủy {vi.format(pipeline.total.cancelled.orders)} · đang giao {vi.format(pipeline.total.shipping.orders)}</div>}</div>
            <div className="col-span-4 row-span-4 overflow-hidden rounded-2xl border bg-white p-3"><div className="mb-2 text-sm font-semibold">Xếp hạng POS · doanh thu đơn chốt</div>{posBars(true)}</div>
            <div className="col-span-4 row-span-4 grid grid-cols-2 gap-3 overflow-hidden rounded-2xl border bg-white p-3"><div><div className="mb-1 text-sm font-semibold text-[#17684b]">Top tỷ lệ chốt</div>{empList(topEmp, 'green')}</div><div><div className="mb-1 text-sm font-semibold text-[#c8403f]">Cần hỗ trợ</div>{empList(lowEmp, 'red')}</div></div>
            <div className="col-span-2 row-span-4 overflow-hidden rounded-2xl border bg-white p-3 text-sm"><div className="mb-2 font-semibold">Khách hàng & data</div><div className="space-y-1.5 text-xs"><div className="flex justify-between"><span>Tổng khách</span><strong>{g ? vi.format(g.total) : '—'}</strong></div><div className="flex justify-between"><span>Hoạt động 30 ngày</span><strong>{seg ? vi.format(seg.active) : '—'}</strong></div><div className="flex justify-between"><span>Nguy cơ rời bỏ</span><strong className="text-[#c8403f]">{seg ? vi.format(seg.risk) : '—'}</strong></div><div className="flex justify-between"><span>Tỷ lệ mua lại</span><strong>{repurchase ? pct(repurchase.funnel.once ? repurchase.funnel.twice / repurchase.funnel.once * 100 : null) : '—'}</strong></div><div className="flex justify-between"><span>Data cấp trong kỳ</span><strong>{vi.format(bt.received)}</strong></div><div className="flex justify-between"><span>Đã mua từ data</span><strong>{pct(bt.received ? bt.buyers / bt.received * 100 : null)}</strong></div></div></div>
            <div className="col-span-2 row-span-4 overflow-hidden rounded-2xl border bg-white p-3 text-sm"><div className="mb-2 flex items-center gap-1 font-semibold"><AlertTriangle size={14} className={alerts.length ? 'text-[#c8403f]' : 'text-[#9db3a5]'} />Cảnh báo ({alerts.length})</div>{alerts.length ? <ul className="space-y-1 text-xs">{alerts.slice(0, 4).map((a, i) => <li key={i} className={a.level === 'high' ? 'text-[#a33a3a]' : 'text-[#8a5a00]'}><strong>{a.title}:</strong> {a.detail}</li>)}</ul> : <p className="text-xs text-[#1a7a48]">Không có cảnh báo.</p>}<div className="mt-2 border-t pt-2">{syncList}</div></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}
      {!report && !error && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {cur && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard icon={ShoppingCart} tone="blue" label="Đơn tạo mới" value={vi.format(cur.orders)} delta={delta(cur.orders, prev?.orders)} note={`${cur.customers === null ? '—' : vi.format(cur.customers)} khách`} onClick={() => onNavigate('overview')} />
            <KpiCard icon={CheckCircle2} tone="green" label="Đơn chốt" value={vi.format(cur.closedOrders)} delta={delta(cur.closedOrders, prev?.closedOrders)} note={`Tỷ lệ chốt/tạo ${pct(cur.closeRate)}`} onClick={() => onNavigate('overview')} />
            <KpiCard icon={Coins} tone="teal" label="Doanh thu đơn chốt" value={money(cur.closedNet)} delta={delta(cur.closedNet, prev?.closedNet)} note={`GTTB ${cur.averageOrder ? money(cur.averageOrder) : '—'}`} onClick={() => onNavigate('overview')} />
            <KpiCard icon={PackageCheck} tone="lime" label="Giao thành công" value={vi.format(cur.groups.delivered.orders)} delta={delta(cur.groups.delivered.orders, prev?.groups.delivered.orders)} note={money(cur.groups.delivered.net)} onClick={() => onNavigate('pipeline')} />
            <KpiCard icon={Flame} tone="orange" label={`Chốt nóng ${shift ? SHIFT_LABELS[shift.shift].toLowerCase() : ''} hôm nay`} value={shift ? pct(shift.total.rate) : '—'} delta={shift && shift.total.rate !== null && shift.yesterday.rate !== null ? shift.total.rate - shift.yesterday.rate : null} deltaLabel="điểm % so cùng ca hôm qua" note={shift ? `${shift.total.closed} chốt / ${shift.total.received} số nhận` : ''} onClick={() => onNavigate('shift')} />
            <KpiCard icon={Target} tone="purple" label="Mục tiêu tháng" value={goal ? pct(cur.closedNet / goal * 100, 0) : '—'} note={goal ? `${short(cur.closedNet)} / ${short(goal)} đ · còn ${short(Math.max(0, goal - cur.closedNet))} đ` : 'Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)'} onClick={() => onNavigate(goal ? 'monthly' : 'config')} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ChartCard icon={BarChart3} title="Xu hướng 30 ngày" subtitle="Doanh thu đơn chốt (triệu đồng) và số đơn chốt theo ngày" action={<Link view="overview" />}>{trendChart('h-72')}</ChartCard>
            <ChartCard icon={ClipboardList} title="Cơ cấu trạng thái đơn" subtitle="Đơn tạo trong kỳ, trạng thái lúc đồng bộ" action={<Link view="overview" />}>{donut(160)}</ChartCard>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard icon={Truck} title="Vận hành đơn" subtitle="Đơn chốt trong kỳ → xuất đi → đã nhận" action={<Link view="pipeline" />}>
              {funnel.map((f) => <div key={f.l} className="mb-3"><div className="flex justify-between text-sm"><span>{f.l}</span><strong>{vi.format(f.v)} <span className="text-xs font-normal text-[#7d9184]">· {pct(f.p, 0)}</span></strong></div><div className="mt-1 h-2.5 rounded-full bg-[#eef1ee]"><div className="h-2.5 rounded-full bg-[#17684b]" style={{ width: `${f.p}%` }} /></div></div>)}
              {pipeline && <div className="flex flex-wrap gap-1.5 text-xs"><StatusChip tone="orange">Đang giao {vi.format(pipeline.total.shipping.orders)}</StatusChip><StatusChip tone="purple">Hoàn {vi.format(pipeline.total.returned.orders)}</StatusChip><StatusChip tone="red">Hủy {vi.format(pipeline.total.cancelled.orders)}</StatusChip><StatusChip tone="gray">Chưa xuất {vi.format(pipeline.total.processing.orders)}</StatusChip></div>}
            </ChartCard>
            <ChartCard icon={BarChart3} title="Xếp hạng POS" subtitle="Doanh thu đơn chốt trong kỳ, so với kỳ trước" action={<Link view="overview" />}>{posBars(false)}</ChartCard>
            <ChartCard icon={Users} title="Nhân viên" subtitle="Tỷ lệ chốt (đơn chốt ÷ đơn chia), nhân viên có ≥ 10 đơn chia" action={<Link view="compare" />}>
              <div className="grid grid-cols-2 gap-4"><div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#17684b]">Top 5</div>{empList(topEmp, 'green')}</div><div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#c8403f]">Cần hỗ trợ</div>{empList(lowEmp, 'red')}</div></div>
            </ChartCard>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard icon={Users} title="Khách hàng" subtitle="Toàn bộ lịch sử · mỗi khách = một SĐT trong một POS" action={<Link view="customers" />}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[['Tổng khách', g ? vi.format(g.total) : '—', 'customers'], ['Hoạt động 30 ngày', seg ? vi.format(seg.active) : '—', 'customers'], ['Thân thiết', seg ? vi.format(seg.loyal) : '—', 'customers'], ['Nguy cơ rời bỏ', seg ? vi.format(seg.risk) : '—', 'dormant'], ['Lâu chưa mua (>90 ngày)', seg ? vi.format(seg.dormant) : '—', 'dormant'], ['Giá trị vòng đời TB', seg && seg.buyers ? money(seg.ltvTotal / seg.buyers) : '—', 'customers']].map(([l, v, view]) => (
                  <button key={l} type="button" onClick={() => onNavigate(view)} className="rounded-xl border p-2.5 text-left hover:bg-[#f5faf5]"><div className="text-[11px] text-[#7d9184]">{l}</div><div className="text-lg font-semibold">{v}</div></button>
                ))}
              </div>
            </ChartCard>
            <ChartCard icon={Repeat} title="Mua lại & data được cấp" subtitle="Trong kỳ đã chọn" action={<><Link view="repurchase" label="Mua lại" /> <Link view="batches" label="Data" /></>}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[['Tỷ lệ mua lại (trọn đời)', repurchase ? pct(repurchase.funnel.once ? repurchase.funnel.twice / repurchase.funnel.once * 100 : null) : '—'], ['Doanh thu mua lại', repurchase ? money(repurchase.summary.repurchase.net) : '—'], ['Đơn mua lại', repurchase ? vi.format(repurchase.summary.repurchase.orders) : '—'], ['Khách mua lại', repurchase ? vi.format(repurchase.summary.repurchase.customers) : '—'], ['Data được cấp', vi.format(bt.received)], ['Đã mua từ data', `${vi.format(bt.buyers)} · ${pct(bt.received ? bt.buyers / bt.received * 100 : null)}`]].map(([l, v]) => (
                  <div key={l} className="rounded-xl border p-2.5"><div className="text-[11px] text-[#7d9184]">{l}</div><div className="text-lg font-semibold">{v}</div></div>
                ))}
              </div>
            </ChartCard>
            <ChartCard icon={AlertTriangle} title={`Cảnh báo & đồng bộ${alerts.length ? ` (${alerts.length})` : ''}`} subtitle="Ca hiện tại và trạng thái kết nối 6 POS" action={<Link view="shift" />}>
              {alerts.length ? <ul className="mb-3 space-y-1.5">{alerts.slice(0, 5).map((a, i) => <li key={i} className={`rounded-lg border px-3 py-1.5 text-xs ${a.level === 'high' ? 'border-[#f1c9c9] bg-[#fdf3f3] text-[#a33a3a]' : 'border-[#f0dcb4] bg-[#fff8e8] text-[#8a5a00]'}`}><strong>{a.title}:</strong> {a.detail}</li>)}</ul> : <p className="mb-3 rounded-lg border border-[#b6e2bd] bg-[#e5f7e8] px-3 py-1.5 text-xs text-[#195b35]">Không có cảnh báo trong ca.</p>}
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-[#7d9184]"><Database size={12} />Đồng bộ Pancake</div>{syncList}
              <p className="mt-2 text-[11px] text-[#7d9184]">Đồng bộ gần nhất {dt(report?.syncedAt, true)}</p>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
