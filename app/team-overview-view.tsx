'use client';

// Tổng quan từng bộ phận (Sale / CSKH): tình hình kinh doanh của riêng bộ phận đó — doanh thu, đơn chốt, GTTB, tỷ lệ chốt,
// đơn chốt theo nhóm sản phẩm (thay chi phí giảm giá & ship từ 29/09/2026), hủy/hoàn, theo ngày, theo POS, theo nhân viên (yêu cầu 24/09/2026).
// Số lấy từ cùng báo cáo Tổng quan POS (lọc đội), nên khớp các trang khác; trạng thái đơn theo bộ lọc chung trên thanh trên cùng.
import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { ICON } from './icons';
import { PancakeReference } from './pancake-reference';
import { METRIC_DEFS, cancelRateOf, closeRateBase, closeRateOf, closeRateTop, returnRateOf } from '@/lib/metrics';
import { useMetricSettings } from './metric-settings';
import { useMemo } from 'react';
import { PosTile } from './pos-badge';
import { CskhFocusBar, useCskhFocus } from './cskh-focus';
import { CskhOriginBlock, SaleGroupBlock } from './product-group-blocks';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ArrowRight, Layers, Megaphone, PhoneCall, Receipt, UserCheck, Users, Wallet } from 'lucide-react';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { POS } from '@/lib/report-model';
import { PeriodToolbar, PosChips, type OverviewReport } from './overview-view';
import { GlobalStatusFilter } from './status-filter';
import { parseStatus } from '@/lib/order-status';
import { useOrderStatus } from './status-store';
import { useApi } from './use-api';
import { TrendNotes } from './overview-trends';
import { StaleChip } from './stale-chip';
import { TeamKpiProgress } from './team-kpi-progress';
import {
  ChartCard, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, delta, dmy, money, pct, posName, posVar, shortMoney, useSort, vi,
} from './ui-kit';

type Team = 'sale' | 'cskh';
type Metrics = OverviewReport['current']['total'];
type Calls = { staff: { authorId: string; notes: number; customers: number; activeDays: number }[]; period: { days: string[] } };
const TITLE: Record<Team, string> = { sale: 'Tổng quan Sale', cskh: 'Tổng quan CSKH' };
const SUB: Record<Team, string> = {
  sale: 'Tình hình kinh doanh của đội Sale: doanh thu, đơn chốt, tỷ lệ chốt trên đơn được chia, đơn chốt theo nhóm sản phẩm',
  cskh: 'Tình hình kinh doanh của đội CSKH: doanh thu, đơn chốt, tự ups và từ MKT, cuộc gọi, nhóm sản phẩm',
};

export function TeamOverviewView({ team, onNavigate, kpi = false }: { team: Team; onNavigate: (view: string) => void; /** Chủ hệ thống: hiện tiến độ KPI tháng ở đầu trang. */ kpi?: boolean }) {
  const ms = useMetricSettings();
  const cancelRate = (m: Metrics) => cancelRateOf(m);
  const returnRate = (m: Metrics) => returnRateOf(m, ms.returnBase);
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const status = parseStatus(useOrderStatus());
  const focus = useCskhFocus();
  const focusId = team === 'cskh' ? focus?.id ?? null : null;
  const q = useMemo(() => new URLSearchParams({ start, end, posIds: posIds.join(','), team, ...(focusId ? { employeeIds: focusId } : {}) }), [start, end, posIds, team, focusId]);
  const api = useApi<OverviewReport>(useMemo(() => `/api/reports/overview?${q}&groupBy=day&compare=previous`, [q]));
  // Đơn chốt theo nhóm sản phẩm (cùng lời gọi với bảng Chốt theo nhóm sản phẩm bên dưới).
  // Theo từng thẻ đơn (nhãn dòng sản phẩm trên Pancake) + "Chưa gắn thẻ", không gộp "Khác" (29/09/2026).
  type GroupCell = { closed: number; closedNet: number; created: number };
  const groupsApi = useApi<{ groups: (GroupCell & { label: string })[]; staff: { sellerId: string; byGroup: Record<string, GroupCell> }[] }>(
    `/api/reports/product-groups?${new URLSearchParams({ start, end, posIds: posIds.join(','), team, dim: 'tag', basis: 'both', by: team === 'cskh' ? 'care' : 'seller' })}`);
  const groupCounts = useMemo(() => {
    const d = groupsApi.data; if (!d) return null;
    const me = focusId ? d.staff.find((x) => x.sellerId === focusId) : null;
    const pick = (g: GroupCell & { label: string }) => focusId ? (me?.byGroup[g.label] ?? { closed: 0, closedNet: 0, created: 0 }) : g;
    return d.groups.map((g) => ({ label: g.label, ...pick(g) })).filter((g) => g.closed || g.created);
  }, [groupsApi.data, focusId]);
  const tagChips = (items: { label: string; n: number }[], total: number) => (
    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
      {items.filter((x) => x.n).map((x) => <span key={x.label} className="whitespace-nowrap"><b className="font-semibold text-ink-2">{x.label}</b> {vi.format(x.n)}{total ? ` (${pct(x.n / total * 100, 0)})` : ''}</span>)}
    </span>
  );
  const callsApi = useApi<Calls>(team === 'cskh' ? `/api/reports/calls?${q}` : null);
  const report = api.data, cur = report?.current.total, prev = report?.compare?.total ?? null;
  const days = useMemo(() => {
    const m = new Map<string, { day: string; net: number; orders: number }>();
    for (const r of report?.current.series ?? []) {
      const d = m.get(r.bucket) ?? { day: r.bucket, net: 0, orders: 0 };
      d.net += r.closedNet; d.orders += r.closedOrders; m.set(r.bucket, d);
    }
    return [...m.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, netM: Math.round(d.net / 1e5) / 10 }));
  }, [report]);
  const staffSort = useSort<'name' | 'closedOrders' | 'closedNet' | 'averageOrder' | 'rate' | 'cancel'>('closedNet');
  const staff = useMemo(() => [...(report?.current.byEmployee ?? [])].filter((r) => r.sellerId).sort((a, b) => {
    const v = (r: typeof a) => staffSort.key === 'name' ? 0 : staffSort.key === 'rate' ? closeRateOf(r, ms.rateBase) ?? -1 : staffSort.key === 'cancel' ? cancelRate(r) ?? -1 : (r[staffSort.key] ?? -1) as number;
    const c = staffSort.key === 'name' ? a.name.localeCompare(b.name, 'vi') : v(a) - v(b);
    return staffSort.desc ? -c : c;
  }), [report, staffSort.key, staffSort.desc, team, ms.rateBase]);
  const origins = report?.origins ?? [];
  const self = origins.filter((o) => !o.marketerId).reduce((a, o) => ({ n: a.n + o.closedOrders, net: a.net + o.closedNet }), { n: 0, net: 0 });
  const mkt = origins.filter((o) => o.marketerId).reduce((a, o) => ({ n: a.n + o.closedOrders, net: a.net + o.closedNet }), { n: 0, net: 0 });
  const calls = callsApi.data ? callsApi.data.staff.filter((s) => !focusId || s.authorId === focusId).reduce((a, s) => ({ notes: a.notes + s.notes, customers: a.customers + s.customers, people: a.people + (s.notes ? 1 : 0), personDays: a.personDays + s.activeDays }), { notes: 0, customers: 0, people: 0, personDays: 0 }) : null;
  const periodLabel = `${dmy(start)} – ${dmy(end)}`;
  const statusNote = status.isDefault ? 'đơn đã xác nhận trở đi' : `trạng thái: ${status.label.toLowerCase()}`;
  const rateOf = (m: Metrics) => team === 'sale' ? closeRateOf(m, ms.rateBase) : closeRateOf(m, ms.rateBase);
  const tip = (definition: string, current: string, previous?: string) => ({ period: periodLabel, current, ...(previous ? { previous, previousLabel: 'Kỳ trước' } : {}), definition });

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title={TITLE[team]} subtitle={SUB[team]}
        actions={<StaleChip stale={api.stale} at={api.at} loading={api.loading} error={report ? api.error : null} onRetry={api.reload} />} />
      {team === 'cskh' && <CskhFocusBar />}
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset}
        onStart={setStart} onEnd={setEnd} loading={api.loading} onReload={api.reload}
        extra={<GlobalStatusFilter size="md" />} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      <TrendNotes depts={[team]} />
      {kpi && team === 'cskh' && <TeamKpiProgress team="cskh" focusId={focusId} onOpen={() => onNavigate('cskh-kpi')} />}
      {api.error && !report && <ErrorBox error={api.error} onRetry={api.reload} />}
      {!cur && !api.error && <><SkeletonKpis count={8} className="xl:grid-cols-4" /><ChartCard title="Theo ngày" subtitle="Đang tải…"><SkeletonTable rows={5} cols={5} /></ChartCard></>}
      {cur && report && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 transition-opacity ${api.loading ? 'opacity-70' : ''}`} aria-busy={api.loading}>
            <KpiCard id={`${team}-revenue`} icon={ICON.revenue} tone="green" label="Doanh thu" value={shortMoney(cur.closedNet)} countUp rawValue={cur.closedNet} format={shortMoney}
              delta={prev ? delta(cur.closedNet, prev.closedNet) : undefined} note={`Đơn chốt · ${statusNote}`}
              tooltip={tip(report.definitions.revenue, money(cur.closedNet), prev ? money(prev.closedNet) : undefined)} />
            <KpiCard id={`${team}-closed`} icon={ICON.closed} tone="blue" label="Đơn chốt" value={vi.format(cur.closedOrders)} countUp rawValue={cur.closedOrders}
              delta={prev ? delta(cur.closedOrders, prev.closedOrders) : undefined} note={`${vi.format(cur.closedCustomers ?? 0)} khách · ${vi.format(cur.closedQuantity)} sản phẩm`}
              tooltip={{ ...tip(report.definitions.closed, `${vi.format(cur.closedOrders)} đơn`, prev ? `${vi.format(prev.closedOrders)} đơn` : undefined), rows: groupCounts?.filter((x) => x.closed).sort((a, b) => b.closed - a.closed).map((x): [string, string] => [x.label, `${vi.format(x.closed)} đơn${cur.closedOrders ? ` (${pct(x.closed / cur.closedOrders * 100, 0)})` : ''}`]) }} />
            <KpiCard id={`${team}-aov`} icon={ICON.aov} tone="teal" label="Giá trị TB đơn" value={shortMoney(cur.averageOrder)} delta={prev?.averageOrder && cur.averageOrder ? delta(cur.averageOrder, prev.averageOrder) : undefined}
              note={`Giao thành công TB ${shortMoney(cur.deliveredAverage)}`} tooltip={tip('Doanh thu ÷ đơn chốt.', money(cur.averageOrder), prev ? money(prev.averageOrder) : undefined)} />
            {(() => {
              const r = closeRateOf(cur, ms.rateBase), pr = prev ? closeRateOf(prev, ms.rateBase) : null, den = closeRateBase(cur, ms.rateBase);
              return <KpiCard id={`${team}-rate`} icon={ICON.rate} tone="purple" label="Tỷ lệ chốt" value={pct(r)} note={`${vi.format(closeRateTop(cur, ms.rateBase))} đã chốt / ${vi.format(den)} ${ms.rateBase === 'assigned' ? 'đơn được chia' : 'đơn lên'}`}
                delta={r != null && pr != null ? r - pr : undefined} deltaLabel="điểm so kỳ trước" progress={den ? { value: closeRateTop(cur, ms.rateBase), max: den } : undefined}
                tooltip={tip(METRIC_DEFS.rate(ms.rateBase).def, pct(r), pr != null ? pct(pr) : undefined)} />;
            })()}
            {(() => {
              // Thay thẻ "Chi phí giảm giá + ship" (29/09/2026): đơn chốt theo từng thẻ đơn.
              const g = groupCounts;
              const noTag = g?.find((x) => x.label === 'Chưa gắn thẻ')?.closed ?? 0;
              return <KpiCard icon={Layers} tone="orange" label="Đơn chốt theo thẻ đơn" value={g ? vi.format(Math.max(0, cur.closedOrders - noTag)) : '—'} unit="đơn có thẻ" loading={!g && groupsApi.loading}
                note={g ? tagChips(g.map((x) => ({ label: x.label, n: x.closed })).sort((a, b) => b.n - a.n), cur.closedOrders) : 'Đang tải thẻ đơn…'}
                tooltip={g ? { period: periodLabel, rows: g.filter((x) => x.closed).sort((a, b) => b.closed - a.closed).map((x): [string, string] => [x.label, `${vi.format(x.closed)} đơn · ${shortMoney(x.closedNet)}`]), definition: 'Đơn chốt trong kỳ theo từng thẻ đơn trên Pancake (nhãn dòng sản phẩm, bỏ nhãn vận hành như đối soát, hẹn gọi…). Đơn gắn nhiều thẻ tính ở mỗi thẻ nên cộng lại có thể lớn hơn tổng. Chưa gắn thẻ = đơn không có nhãn dòng sản phẩm nào.' } : undefined} />;
            })()}
            <KpiCard icon={ICON.orders} tone="gray" label="Đơn lên trong kỳ" value={vi.format(cur.orders)} countUp rawValue={cur.orders} delta={prev ? delta(cur.orders, prev.orders) : undefined}
              note={<>{shortMoney(cur.net)} · {vi.format(cur.groups.new.orders)} còn mới chưa chốt{groupCounts && tagChips(groupCounts.map((x) => ({ label: x.label, n: x.created })).sort((a, b) => b.n - a.n), cur.orders)}</>}
              tooltip={{ ...tip(report.definitions.basis, `${vi.format(cur.orders)} đơn`, prev ? `${vi.format(prev.orders)} đơn` : undefined), rows: groupCounts?.filter((x) => x.created).sort((a, b) => b.created - a.created).map((x): [string, string] => [x.label, `${vi.format(x.created)} đơn${cur.orders ? ` (${pct(x.created / cur.orders * 100, 0)})` : ''}`]) }} />
            <KpiCard icon={ICON.cancelled} tone="red" label="Hủy" value={pct(cancelRate(cur))} note={`${vi.format(cur.groups.cancelled.orders)} đơn · ${shortMoney(cur.groups.cancelled.net)}`} invert
              tooltip={tip(METRIC_DEFS.cancelled.def, `${vi.format(cur.groups.cancelled.orders)} đơn`)} />
            <KpiCard icon={ICON.returned} tone="orange" label="Hoàn" value={pct(returnRate(cur))} note={`${vi.format(cur.groups.returned.orders)} đơn · giao TC ${vi.format(cur.groups.delivered.orders)}`} invert
              tooltip={tip(METRIC_DEFS.returned(ms.returnBase).def, `${vi.format(cur.groups.returned.orders)} đơn`)} />
          </div>
          {/* Số cả cửa hàng: ẩn khi đang xem riêng một nhân viên để ảnh chụp không lộ số người khác. */}
          {!focusId && <PancakeReference posIds={posIds} start={start} end={end} title="Số tham chiếu Pancake · cả cửa hàng" note={`Toàn bộ đơn của POS đang chọn (mọi bộ phận), như màn Thống kê Pancake · % so kỳ trước`} />}

          {team === 'cskh' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard id="cskh-origin" icon={Megaphone} title="Tự ups và từ MKT" subtitle={`Đơn chốt theo nguồn · ${periodLabel}`}
                action={<button type="button" className="btn sm" onClick={() => onNavigate('origin')}>Theo nhân viên<ArrowRight size={13} /></button>}>
                <div className="grid grid-cols-2 gap-3">
                  {[{ k: 'Tự ups', v: self, c: 'var(--good)', icon: UserCheck }, { k: 'Từ MKT', v: mkt, c: 'var(--st-confirmed)', icon: Megaphone }].map(({ k, v, c, icon: Icon }) => (
                    <div key={k} className="rounded-xl border border-line p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><Icon size={14} style={{ color: c }} />{k}</div>
                      <div className="num mt-1 text-2xl font-bold text-ink">{vi.format(v.n)}</div>
                      <div className="text-xs text-ink-3">{shortMoney(v.net)} · {pct(self.n + mkt.n ? v.n / (self.n + mkt.n) * 100 : null, 0)}</div>
                    </div>
                  ))}
                </div>
                <span className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <i className="block h-full bg-[var(--good)]" style={{ width: `${self.n + mkt.n ? self.n / (self.n + mkt.n) * 100 : 0}%` }} />
                  <i className="block h-full bg-[var(--st-confirmed)]" style={{ width: `${self.n + mkt.n ? mkt.n / (self.n + mkt.n) * 100 : 0}%` }} />
                </span>
              </ChartCard>
              <ChartCard icon={PhoneCall} title="Cuộc gọi" subtitle={`Ghi chú chăm sóc trên hồ sơ khách · ${periodLabel}`}
                action={<button type="button" className="btn sm" onClick={() => onNavigate('calls')}>Chi tiết cuộc gọi<ArrowRight size={13} /></button>}>
                {calls ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-line p-3"><div className="text-xs font-semibold text-ink-2">Cuộc gọi</div><div className="num mt-1 text-2xl font-bold text-ink">{vi.format(calls.notes)}</div><div className="text-xs text-ink-3">{calls.people} người gọi</div></div>
                    <div className="rounded-xl border border-line p-3"><div className="text-xs font-semibold text-ink-2">Khách đã gọi</div><div className="num mt-1 text-2xl font-bold text-ink">{vi.format(calls.customers)}</div><div className="text-xs text-ink-3">khách khác nhau</div></div>
                    <div className="rounded-xl border border-line p-3"><div className="text-xs font-semibold text-ink-2">TB / người / ngày</div><div className="num mt-1 text-2xl font-bold text-ink">{calls.personDays ? vi.format(Math.round(calls.notes / calls.personDays)) : '—'}</div><div className="text-xs text-ink-3">cuộc gọi</div></div>
                  </div>
                ) : callsApi.error ? <ErrorBox error={callsApi.error} onRetry={callsApi.reload} /> : <SkeletonTable rows={2} cols={3} />}
              </ChartCard>
            </div>
          )}

          {team === 'sale' && <SaleGroupBlock start={start} end={end} posIds={posIds} />}
          {team === 'cskh' && <SaleGroupBlock start={start} end={end} posIds={posIds} team="cskh" by="care" focusId={focusId} title="Đơn theo nhóm sản phẩm · từng nhân viên CSKH"
            subtitle="Đơn chốt trong kỳ của từng người (NV chăm sóc trên đơn, trống thì người bán), xếp theo sản phẩm của CHÍNH đơn đó · một đơn có cả hai loại tính ở cả hai nhóm · bấm số để xem từng đơn" />}
          {team === 'cskh' && <CskhOriginBlock start={start} end={end} posIds={posIds} focusId={focusId} />}

          <ChartCard icon={Wallet} title="Doanh thu và đơn chốt theo ngày" subtitle={`${periodLabel} · ${statusNote}`}>
            {days.length ? (
              <ChartContainer className="h-64 w-full aspect-auto" config={{ netM: { label: 'Doanh thu (triệu ₫)', color: 'var(--primary)' }, orders: { label: 'Đơn chốt', color: 'var(--st-confirmed)' } }}>
                <ComposedChart data={days} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={24} />
                  <YAxis yAxisId="m" tickLine={false} axisLine={false} width={44} />
                  <YAxis yAxisId="n" orientation="right" tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar yAxisId="m" dataKey="netM" fill="var(--color-netM)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="n" type="monotone" dataKey="orders" stroke="var(--color-orders)" strokeWidth={2} dot={days.length < 20} />
                </ComposedChart>
              </ChartContainer>
            ) : <EmptyState text="Chưa có đơn chốt trong kỳ." />}
          </ChartCard>

          <ChartCard icon={Receipt} title="Theo POS" subtitle={`Số của riêng bộ phận này · ${periodLabel}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...report.current.byPos].sort((a, b) => b.closedNet - a.closedNet).map((p) => {
                const prevPos = report.compare?.byPos.find((x) => x.posId === p.posId);
                const buckets = [...new Set(report.current.series.map((x) => x.bucket))].sort().slice(-7);
                return (
                  <PosTile key={p.posId} posId={p.posId} name={posName(p.posId)} revenue={p.closedNet} orders={p.closedOrders} aov={p.averageOrder}
                    rate={rateOf(p)} rateLabel="Tỷ lệ chốt" share={cur.closedNet ? p.closedNet / cur.closedNet * 100 : null}
                    change={prevPos ? delta(p.closedNet, prevPos.closedNet) : null}
                    spark={buckets.map((bk) => report.current.series.find((x) => x.bucket === bk && x.posId === p.posId)?.closedNet ?? 0)}
                    note={`${vi.format(p.orders)} đơn lên · hủy ${pct(cancelRate(p))} · hoàn ${pct(returnRate(p))}`} />
                );
              })}
            </div>
          </ChartCard>

          <ChartCard icon={Users} title={`Theo nhân viên · ${staff.length} người`} subtitle="Bấm tiêu đề cột để sắp xếp"
            action={<button type="button" className="btn sm" onClick={() => onNavigate('compare')}>So sánh nhân viên<ArrowRight size={13} /></button>}>
            {staff.length ? (
              <TableWrap minWidth={720} maxHeight="36rem" stickyFirst>
                <table className="tbl">
                  <thead><tr>
                    <th className="w-8">#</th>
                    <SortTh k="name" label="Nhân viên" sort={staffSort} align="left" />
                    <SortTh k="closedNet" label="Doanh thu" sort={staffSort} />
                    <SortTh k="closedOrders" label="Đơn chốt" sort={staffSort} />
                    <SortTh k="averageOrder" label="GTTB" sort={staffSort} />
                    <SortTh k="rate" label="Tỷ lệ chốt" sort={staffSort} />
                    <SortTh k="cancel" label="Hủy" sort={staffSort} />
                    <th>Tỷ trọng doanh thu</th>
                  </tr></thead>
                  <tbody>
                    {staff.map((r, i) => (
                      <tr key={r.sellerId}>
                        <td className="num text-[11px] text-ink-4">{i + 1}</td>
                        <td className="text-left font-medium text-ink">{r.name}{r.department && <span className="block text-[11px] font-normal text-ink-3">{r.department}</span>}</td>
                        <td className="n">{shortMoney(r.closedNet)}</td><td className="n">{vi.format(r.closedOrders)}</td><td className="n">{shortMoney(r.averageOrder)}</td>
                        <td className="n">{r.assignedHidden && team === 'sale' ? '—' : pct(rateOf(r))}</td><td className="n">{pct(cancelRate(r))}</td>
                        <td><span className="block h-2 rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(2, cur.closedNet ? r.closedNet / cur.closedNet * 140 : 0)}px` }} title={pct(cur.closedNet ? r.closedNet / cur.closedNet * 100 : null)} /></td>
                      </tr>
                    ))}
                  </tbody>
                  {staff.length > 1 && (() => {
                    const net = staff.reduce((t, r) => t + r.closedNet, 0), closed = staff.reduce((t, r) => t + r.closedOrders, 0);
                    const top = staff.reduce((t, r) => t + closeRateTop(r, ms.rateBase), 0), den = staff.reduce((t, r) => t + closeRateBase(r, ms.rateBase), 0);
                    const orders = staff.reduce((t, r) => t + r.orders, 0), cancelled = staff.reduce((t, r) => t + r.groups.cancelled.orders - (r.deletedOrders ?? 0), 0);
                    return (
                      <tfoot><tr>
                        <td /><td className="text-left">Tổng · {vi.format(staff.length)} người</td>
                        <td className="n">{shortMoney(net)}</td><td className="n">{vi.format(closed)}</td><td className="n">{shortMoney(closed ? net / closed : null)}</td>
                        <td className="n">{staff.some((r) => r.assignedHidden) && team === 'sale' ? '—' : pct(den ? top / den * 100 : null)}</td><td className="n">{pct(orders ? cancelled / orders * 100 : null)}</td>
                        <td className="text-[11px] font-normal text-ink-3">{pct(cur.closedNet ? net / cur.closedNet * 100 : null, 0)} doanh thu bộ phận</td>
                      </tr></tfoot>
                    );
                  })()}
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có nhân viên nào có số trong kỳ." />}
          </ChartCard>
        </>
      )}
    </div>
  );
}
