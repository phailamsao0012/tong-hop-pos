'use client';

// Tổng quan từng bộ phận (Sale / CSKH): tình hình kinh doanh của riêng bộ phận đó — doanh thu, đơn chốt, GTTB, tỷ lệ chốt,
// chi phí giảm giá & vận chuyển, hủy/hoàn, theo ngày, theo POS, theo nhân viên (yêu cầu 24/09/2026).
// Số lấy từ cùng báo cáo Tổng quan POS (lọc đội), nên khớp các trang khác; trạng thái đơn theo bộ lọc chung trên thanh trên cùng.
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ArrowRight, Ban, Coins, Megaphone, PhoneCall, Receipt, ShoppingCart, Target, Truck, UserCheck, Users, Wallet } from 'lucide-react';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange, type OverviewReport } from './overview-view';
import { GlobalStatusFilter } from './status-filter';
import { parseStatus } from '@/lib/order-status';
import { useOrderStatus } from './status-store';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import {
  ChartCard, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, delta, dmy, money, pct, posName, posVar, shortMoney, useSort, vi,
} from './ui-kit';

type Team = 'sale' | 'cskh';
type Metrics = OverviewReport['current']['total'];
type Calls = { staff: { authorId: string; notes: number; customers: number; activeDays: number }[]; period: { days: string[] } };
const TITLE: Record<Team, string> = { sale: 'Tổng quan Sale', cskh: 'Tổng quan CSKH' };
const SUB: Record<Team, string> = {
  sale: 'Tình hình kinh doanh của đội Sale: doanh thu, đơn chốt, tỷ lệ chốt trên đơn được chia, chi phí',
  cskh: 'Tình hình kinh doanh của đội CSKH: doanh thu, đơn chốt, tự ups và từ MKT, cuộc gọi, chi phí',
};
const cancelRate = (m: Metrics) => m.orders ? m.groups.cancelled.orders / m.orders * 100 : null;
const returnRate = (m: Metrics) => m.orders ? m.groups.returned.orders / m.orders * 100 : null;

export function TeamOverviewView({ team, onNavigate }: { team: Team; onNavigate: (view: string) => void }) {
  const today = todayVn();
  const [preset, setPreset] = useState('today');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const status = parseStatus(useOrderStatus());
  const q = useMemo(() => new URLSearchParams({ start, end, posIds: posIds.join(','), team }), [start, end, posIds, team]);
  const api = useApi<OverviewReport>(useMemo(() => `/api/reports/overview?${q}&groupBy=day&compare=previous`, [q]));
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
    const v = (r: typeof a) => staffSort.key === 'name' ? 0 : staffSort.key === 'rate' ? (team === 'sale' ? r.assignedCloseRate : r.closeRate) ?? -1 : staffSort.key === 'cancel' ? cancelRate(r) ?? -1 : (r[staffSort.key] ?? -1) as number;
    const c = staffSort.key === 'name' ? a.name.localeCompare(b.name, 'vi') : v(a) - v(b);
    return staffSort.desc ? -c : c;
  }), [report, staffSort.key, staffSort.desc, team]);
  const origins = report?.origins ?? [];
  const self = origins.filter((o) => !o.marketerId).reduce((a, o) => ({ n: a.n + o.closedOrders, net: a.net + o.closedNet }), { n: 0, net: 0 });
  const mkt = origins.filter((o) => o.marketerId).reduce((a, o) => ({ n: a.n + o.closedOrders, net: a.net + o.closedNet }), { n: 0, net: 0 });
  const calls = callsApi.data ? callsApi.data.staff.reduce((a, s) => ({ notes: a.notes + s.notes, customers: a.customers + s.customers, people: a.people + (s.notes ? 1 : 0), personDays: a.personDays + s.activeDays }), { notes: 0, customers: 0, people: 0, personDays: 0 }) : null;
  const periodLabel = `${dmy(start)} – ${dmy(end)}`;
  const statusNote = status.isDefault ? 'đơn đã xác nhận trở đi' : `trạng thái: ${status.label.toLowerCase()}`;
  const rateOf = (m: Metrics) => team === 'sale' ? m.assignedCloseRate : m.closeRate;
  const cost = (m: Metrics) => m.closedDiscount + m.closedShippingFee;
  const tip = (definition: string, current: string, previous?: string) => ({ period: periodLabel, current, ...(previous ? { previous, previousLabel: 'Kỳ trước' } : {}), definition });

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title={TITLE[team]} subtitle={SUB[team]}
        actions={<StaleChip stale={api.stale} at={api.at} loading={api.loading} error={report ? api.error : null} onRetry={api.reload} />} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={api.loading} onReload={api.reload}
        extra={<GlobalStatusFilter size="md" />} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {api.error && !report && <ErrorBox error={api.error} onRetry={api.reload} />}
      {!cur && !api.error && <><SkeletonKpis count={8} className="xl:grid-cols-4" /><ChartCard title="Theo ngày" subtitle="Đang tải…"><SkeletonTable rows={5} cols={5} /></ChartCard></>}
      {cur && report && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 transition-opacity ${api.loading ? 'opacity-70' : ''}`} aria-busy={api.loading}>
            <KpiCard icon={Wallet} tone="green" label="Doanh thu" value={shortMoney(cur.closedNet)} countUp rawValue={cur.closedNet} format={shortMoney}
              delta={prev ? delta(cur.closedNet, prev.closedNet) : undefined} note={`Đơn chốt · ${statusNote}`}
              tooltip={tip(report.definitions.revenue, money(cur.closedNet), prev ? money(prev.closedNet) : undefined)} />
            <KpiCard icon={ShoppingCart} tone="blue" label="Đơn chốt" value={vi.format(cur.closedOrders)} countUp rawValue={cur.closedOrders}
              delta={prev ? delta(cur.closedOrders, prev.closedOrders) : undefined} note={`${vi.format(cur.closedCustomers ?? 0)} khách · ${vi.format(cur.closedQuantity)} sản phẩm`}
              tooltip={tip(report.definitions.closed, `${vi.format(cur.closedOrders)} đơn`, prev ? `${vi.format(prev.closedOrders)} đơn` : undefined)} />
            <KpiCard icon={Receipt} tone="teal" label="Giá trị TB đơn" value={shortMoney(cur.averageOrder)} delta={prev?.averageOrder && cur.averageOrder ? delta(cur.averageOrder, prev.averageOrder) : undefined}
              note={`Giao thành công TB ${shortMoney(cur.deliveredAverage)}`} tooltip={tip('Doanh thu ÷ đơn chốt.', money(cur.averageOrder), prev ? money(prev.averageOrder) : undefined)} />
            {team === 'sale'
              ? <KpiCard icon={Target} tone="purple" label="Tỷ lệ chốt" value={pct(cur.assignedCloseRate)} note={`${vi.format(cur.closedOrders)} chốt / ${vi.format(cur.assignedOrders)} đơn được chia`}
                  delta={prev?.assignedCloseRate != null && cur.assignedCloseRate != null ? cur.assignedCloseRate - prev.assignedCloseRate : undefined} deltaLabel="điểm so kỳ trước"
                  progress={cur.assignedOrders ? { value: cur.closedOrders, max: cur.assignedOrders } : undefined} tooltip={tip(report.definitions.rate, pct(cur.assignedCloseRate))} />
              : <KpiCard icon={Target} tone="purple" label="Tỷ lệ chốt" value={pct(cur.closeRate)} note={`${vi.format(cur.closedOrders)} chốt / ${vi.format(cur.orders)} đơn lên`}
                  delta={prev?.closeRate != null && cur.closeRate != null ? cur.closeRate - prev.closeRate : undefined} deltaLabel="điểm so kỳ trước"
                  tooltip={tip(report.definitions.overviewRate, pct(cur.closeRate))} />}
            <KpiCard icon={Coins} tone="orange" label="Chi phí giảm giá + ship" value={shortMoney(cost(cur))} delta={prev ? delta(cost(cur), cost(prev)) : undefined} invert
              note={`${pct(cur.closedNet ? cost(cur) / cur.closedNet * 100 : null)} doanh thu · giảm ${shortMoney(cur.closedDiscount)} · ship ${shortMoney(cur.closedShippingFee)}`}
              tooltip={tip('Giảm giá / quà tặng + phí vận chuyển trên đơn chốt (số có trên Pancake). Chưa gồm chi phí quảng cáo, lương — Pancake không có các số này.', money(cost(cur)), prev ? money(cost(prev)) : undefined)} />
            <KpiCard icon={Users} tone="gray" label="Đơn lên trong kỳ" value={vi.format(cur.orders)} countUp rawValue={cur.orders} delta={prev ? delta(cur.orders, prev.orders) : undefined}
              note={`${shortMoney(cur.net)} · ${vi.format(cur.groups.new.orders)} còn mới / chờ XN`} tooltip={tip(report.definitions.basis, `${vi.format(cur.orders)} đơn`, prev ? `${vi.format(prev.orders)} đơn` : undefined)} />
            <KpiCard icon={Ban} tone="red" label="Hủy" value={pct(cancelRate(cur))} note={`${vi.format(cur.groups.cancelled.orders)} đơn · ${shortMoney(cur.groups.cancelled.net)}`} invert
              tooltip={tip('Đơn tạo trong kỳ đang ở trạng thái Hủy ÷ đơn lên trong kỳ.', `${vi.format(cur.groups.cancelled.orders)} đơn`)} />
            <KpiCard icon={Truck} tone="orange" label="Hoàn" value={pct(returnRate(cur))} note={`${vi.format(cur.groups.returned.orders)} đơn · giao TC ${vi.format(cur.groups.delivered.orders)}`} invert
              tooltip={tip('Đơn tạo trong kỳ đang hoàn / đã hoàn ÷ đơn lên trong kỳ.', `${vi.format(cur.groups.returned.orders)} đơn`)} />
          </div>

          {team === 'cskh' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard icon={Megaphone} title="Tự ups và từ MKT" subtitle={`Đơn chốt theo nguồn · ${periodLabel}`}
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

          {team === 'sale' && !!report.productSegments?.length && (
            <ChartCard icon={ShoppingCart} title="Theo nhóm đơn" subtitle="Gentadox và SK + GK · đơn có cả hai tiêu chí nằm ở cả hai nhóm">
              <div className="grid gap-3 sm:grid-cols-2">
                {report.productSegments.map((r) => (
                  <div key={r.key} className="rounded-xl border border-line p-3">
                    <div className="text-xs font-semibold text-ink-2">{r.key === 'gentadox' ? 'Gentadox' : 'SK + GK'}</div>
                    <div className="num mt-1 text-xl font-bold text-ink">{shortMoney(r.closedNet)}</div>
                    <div className="text-xs text-ink-3">{vi.format(r.closedOrders)} đơn · GTTB {shortMoney(r.averageOrder)} · chốt {pct(r.assignedCloseRate)}</div>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}

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

          <ChartCard icon={Receipt} title="Theo POS" subtitle="Bấm tên cột để so sánh · số của riêng bộ phận này">
            <TableWrap minWidth={720}>
              <table className="tbl">
                <thead><tr><th className="text-left">POS</th><th>Doanh thu</th><th>Đơn chốt</th><th>GTTB</th><th>{team === 'sale' ? 'Tỷ lệ chốt' : 'Chốt / đơn lên'}</th><th>Đơn lên</th><th>Hủy</th><th>Hoàn</th><th>Chi phí</th></tr></thead>
                <tbody>
                  {[...report.current.byPos].sort((a, b) => b.closedNet - a.closedNet).map((p) => (
                    <tr key={p.posId}>
                      <td className="text-left font-medium text-ink"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posVar(p.posId) }} />{posName(p.posId)}</td>
                      <td className="n">{shortMoney(p.closedNet)}</td><td className="n">{vi.format(p.closedOrders)}</td><td className="n">{shortMoney(p.averageOrder)}</td>
                      <td className="n">{pct(rateOf(p))}</td><td className="n">{vi.format(p.orders)}</td><td className="n">{pct(cancelRate(p))}</td><td className="n">{pct(returnRate(p))}</td><td className="n">{shortMoney(cost(p))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
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
                    <SortTh k="rate" label={team === 'sale' ? 'Tỷ lệ chốt' : 'Chốt / đơn lên'} sort={staffSort} />
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
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có nhân viên nào có số trong kỳ." />}
          </ChartCard>
        </>
      )}
    </div>
  );
}
