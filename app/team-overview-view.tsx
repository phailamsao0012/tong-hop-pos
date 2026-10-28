'use client';
import { AdvisorPanel } from './advisor-panel';

// Tổng quan từng bộ phận (Sale / CSKH): tình hình kinh doanh của riêng bộ phận đó — doanh thu, đơn chốt, GTTB, tỷ lệ chốt,
// đơn chốt theo nhóm sản phẩm (thay chi phí giảm giá & ship từ 29/09/2026), hủy/hoàn, theo ngày, theo POS, theo nhân viên (yêu cầu 24/09/2026).
// Số lấy từ cùng báo cáo Tổng quan POS (lọc đội), nên khớp các trang khác; trạng thái đơn theo bộ lọc chung trên thanh trên cùng.
import { PackedRevenue, PACKED_HELP } from './sale-analytics-view';
import type { PackedSeller } from '@/lib/sale-packed';
import { type MonthForecast } from '@/lib/forecast';
import { todayVn } from '@/lib/report-time';
import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { ICON } from './icons';
import { PancakeReference } from './pancake-reference';
import {
  METRIC_DEFS,
  cancelRateOf,
  closeRateBase,
  closeRateOf,
  closeRateTop,
  returnRateOf,
} from '@/lib/metrics';
import { useMetricSettings } from './metric-settings';
import { useMemo } from 'react';
import { PosTile } from './pos-badge';
import { CskhFocusBar, useCskhFocus } from './cskh-focus';
import {
  CskhOriginBlock,
  RateCells,
  SaleGroupBlock,
  type StaffRates,
  useTagPref,
} from './product-group-blocks';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  Layers,
  Megaphone,
  PhoneCall,
  Receipt,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { POS } from '@/lib/report-model';
import { PeriodToolbar, PosChips, type OverviewReport } from './overview-view';
import { GlobalStatusFilter } from './status-filter';
import { parseStatus } from '@/lib/order-status';
import { useOrderStatus } from './status-store';
import { LazyBlock } from './lazy-block';
import { useApi } from './use-api';
import { unitFor, useHrUnit, withUnit, useMktTeam } from './team-store';
import { PeriodBars, TrendNotes } from './overview-trends';
import { StaleChip } from './stale-chip';
import { TeamKpiProgress } from './team-kpi-progress';
import {
  ChartCard,
  EmptyState,
  ErrorBox,
  KpiCard,
  PageHeader,
  SkeletonKpis,
  SkeletonTable,
  SortTh,
  TableWrap,
  delta,
  dmy,
  money,
  pct,
  posName,
  posVar,
  shortMoney,
  useSort,
  vi,
} from './ui-kit';

type Team = 'sale' | 'cskh';
type Metrics = OverviewReport['current']['total'];
type Calls = {
  staff: {
    authorId: string;
    notes: number;
    customers: number;
    activeDays: number;
  }[];
  period: { days: string[] };
};
const TITLE: Record<Team, string> = {
  sale: 'Tổng quan Sale',
  cskh: 'Tổng quan CSKH',
};
const SUB: Record<Team, string> = {
  sale: 'Tình hình kinh doanh của đội Sale: doanh thu, đơn chốt, tỷ lệ chốt trên đơn được chia, đơn chốt theo nhóm sản phẩm',
  cskh: 'Tình hình kinh doanh của đội CSKH: doanh thu, đơn chốt, tự ups và từ MKT, cuộc gọi, nhóm sản phẩm',
};

export function TeamOverviewView({
  team,
  onNavigate,
  kpi = false,
}: {
  team: Team;
  onNavigate: (view: string) => void;
  /** Chủ hệ thống: hiện tiến độ KPI tháng ở đầu trang. */ kpi?: boolean;
}) {
  const ms = useMetricSettings();
  const cancelRate = (m: Metrics) => cancelRateOf(m);
  const returnRate = (m: Metrics) => returnRateOf(m, ms.returnBase);
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const status = parseStatus(useOrderStatus());
  const focus = useCskhFocus();
  const focusId = team === 'cskh' ? (focus?.id ?? null) : null;
  // Đang chọn một team của bộ phận này (thanh trên cùng): mọi số trên trang chỉ tính người thuộc team đó.
  const unit = unitFor(useHrUnit(), team);
  const mktLens = useMktTeam();
  const q = useMemo(
    () =>
      new URLSearchParams(withUnit('/?'+new URLSearchParams({
        start,
        end,
        posIds: posIds.join(','),
        team,
        ...(focusId ? { employeeIds: focusId } : {}),
        ...(unit && !unit.branchOnly ? { hrTeam: unit.id } : {}),
      }).toString(), unit).split('?')[1]),
    [start, end, posIds, team, focusId, unit],
  );
  const api = useApi<OverviewReport & { forecast?: MonthForecast | null; packedStaff?: PackedSeller[] }>(
    useMemo(
      () => `/api/reports/overview?${q}&groupBy=day&compare=previous&forecast=month`,
      [q],
    ),
  );
  // Đơn chốt theo nhóm sản phẩm (cùng lời gọi với bảng Chốt theo nhóm sản phẩm bên dưới).
  // Theo từng thẻ đơn (nhãn dòng sản phẩm trên Pancake), không gộp "Khác" (29/09/2026).
  // CSKH mặc định ẩn thẻ đơn (12/10/2026): khi ẩn thì bỏ thẻ KPI theo thẻ đơn và không tải số thẻ.
  const [tagPref] = useTagPref(team);
  const showTags = tagPref === 'show' && !mktLens;
  type GroupCell = { closed: number; closedNet: number; created: number };
  const groupsApi = useApi<{
    untagged?: { closed: number; created: number };
    groups: (GroupCell & { label: string })[];
    staff: {
      sellerId: string;
      untagged?: { closed: number; created: number };
      byGroup: Record<string, GroupCell>;
    }[];
  }>(
    !showTags
      ? null
      : withUnit(
          `/api/reports/product-groups?${new URLSearchParams({ start, end, posIds: posIds.join(','), team, dim: 'tag', basis: 'both', by: 'seller' })}`,
          unit,
        ),
  );
  const groupCounts = useMemo(() => {
    const d = groupsApi.data;
    if (!d || !showTags) return null;
    const me = focusId ? d.staff.find((x) => x.sellerId === focusId) : null;
    const pick = (g: GroupCell & { label: string }) =>
      focusId
        ? (me?.byGroup[g.label] ?? { closed: 0, closedNet: 0, created: 0 })
        : g;
    return d.groups
      .map((g) => ({ label: g.label, ...pick(g) }))
      .filter((g) => g.closed || g.created);
  }, [groupsApi.data, focusId, showTags]);
  const tagChips = (items: { label: string; n: number }[], total: number) => (
    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
      {items
        .filter((x) => x.n)
        .map((x) => (
          <span key={x.label} className="whitespace-nowrap">
            <b className="font-semibold text-ink-2">{x.label}</b>{' '}
            {vi.format(x.n)}
            {total ? ` (${pct((x.n / total) * 100, 0)})` : ''}
          </span>
        ))}
    </span>
  );
  const callsApi = useApi<Calls>(
    team === 'cskh' && !mktLens ? `/api/reports/calls?${q}` : null,
  );
  const report = api.data,
    cur = report?.current.total,
    prev = report?.compare?.total ?? null;
  // Biểu đồ trong ô số (anh Vũ 21/10/2026): theo ngày, kỳ này đặt cạnh ngày cùng thứ tự của kỳ trước. Kỳ một ngày thì không vẽ.
  const daily = (pick: (closedNet: number, closedOrders: number) => number) => {
    const sum = (rows: { bucket: string; closedNet: number; closedOrders: number }[]) => {
      const m = new Map<string, [number, number]>();
      for (const r of rows) { const v = m.get(r.bucket) ?? [0, 0]; v[0] += r.closedNet; v[1] += r.closedOrders; m.set(r.bucket, v); }
      return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([day, [net, n]]) => ({ day, v: pick(net, n) }));
    };
    const now = sum(report?.current.series ?? []), before = sum(report?.compare?.series ?? []);
    return start === end ? null : now.map((p, i) => ({ label: p.day, actual: p.v, previous: before[i]?.v ?? 0 }));
  };
  const today = todayVn();
  const forecast = start === today.slice(0, 7) + '-01' && end === today ? report?.forecast : null;
  const days = useMemo(() => {
    const m = new Map<string, { day: string; net: number; orders: number }>();
    for (const r of report?.current.series ?? []) {
      const d = m.get(r.bucket) ?? { day: r.bucket, net: 0, orders: 0 };
      d.net += r.closedNet;
      d.orders += r.closedOrders;
      m.set(r.bucket, d);
    }
    return [...m.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({ ...d, netM: Math.round(d.net / 1e5) / 10 }));
  }, [report]);
  const staffSort = useSort<
    'name' | 'closedOrders' | 'closedNet' | 'averageOrder' | 'rate' | 'ret' | 'cancel' | 'packedNet' | 'packedShare'
  >('closedNet');
  const staff = useMemo(
    () =>
      [...(report?.current.byEmployee ?? [])]
        .filter((r) => r.sellerId)
        .map((r) => { const packed = report?.packedStaff?.find((p) => p.sellerId === r.sellerId); return { ...r, packedNet: packed?.packedNet, packedShare: packed && r.closedNet ? packed.packedNet / r.closedNet * 100 : null }; })
        .sort((a, b) => {
          const v = (r: typeof a) =>
            staffSort.key === 'name'
              ? 0
              : staffSort.key === 'rate'
                ? (closeRateOf(r, ms.rateBase) ?? -1)
                : staffSort.key === 'cancel'
                  ? (cancelRate(r) ?? -1)
                  : staffSort.key === 'ret'
                  ? (returnRateOf(r, ms.returnBase) ?? -1)
                  : ((r[staffSort.key] ?? -1) as number);
          const c =
            staffSort.key === 'name'
              ? a.name.localeCompare(b.name, 'vi')
              : v(a) - v(b);
          return staffSort.desc ? -c : c;
        }),
    [report, staffSort.key, staffSort.desc, team, ms.rateBase, ms.returnBase],
  );
  // Cột Hoàn, Hủy ở bảng Từng nhân viên Sale: cùng cách tính hai ô Hoàn, Hủy đầu trang (khóa '' = tổng).
  const staffRates = useMemo(() => {
    const rateOf = (m: Metrics) => ({ ret: returnRateOf(m, ms.returnBase), returned: m.groups.returned.orders, cancel: cancelRateOf(m), cancelled: Math.max(0, m.groups.cancelled.orders - (m.deletedOrders ?? 0)) });
    const map: StaffRates = new Map((report?.current.byEmployee ?? []).filter((r) => r.sellerId).map((r) => [r.sellerId, rateOf(r)]));
    if (report) map.set('', rateOf(report.current.total));
    return map;
  }, [report, ms.returnBase]);
  const origins = report?.origins ?? [];
  const packedNet = report?.packedStaff?.reduce((n, r) => n + r.packedNet, 0);
  const self = origins
    .filter((o) => !o.marketerId)
    .reduce((a, o) => ({ n: a.n + o.closedOrders, net: a.net + o.closedNet }), {
      n: 0,
      net: 0,
    });
  const mkt = origins
    .filter((o) => o.marketerId)
    .reduce((a, o) => ({ n: a.n + o.closedOrders, net: a.net + o.closedNet }), {
      n: 0,
      net: 0,
    });
  const calls = callsApi.data
    ? callsApi.data.staff
        .filter((s) => !focusId || s.authorId === focusId)
        .reduce(
          (a, s) => ({
            notes: a.notes + s.notes,
            customers: a.customers + s.customers,
            people: a.people + (s.notes ? 1 : 0),
            personDays: a.personDays + s.activeDays,
          }),
          { notes: 0, customers: 0, people: 0, personDays: 0 },
        )
    : null;
  const periodLabel = `${dmy(start)} – ${dmy(end)}`;
  const statusNote = status.isDefault
    ? 'đơn đã xác nhận trở đi'
    : `trạng thái: ${status.label.toLowerCase()}`;
  const rateOf = (m: Metrics) =>
    team === 'sale' ? closeRateOf(m, ms.rateBase) : closeRateOf(m, ms.rateBase);
  const tip = (definition: string, current: string, previous?: string) => ({
    period: periodLabel,
    current,
    ...(previous ? { previous, previousLabel: 'Kỳ trước' } : {}),
    definition,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`}
        title={unit ? `${TITLE[team]} · ${unit.name}` : TITLE[team]}
        subtitle={SUB[team]}
        actions={
          <StaleChip
            stale={api.stale}
            at={api.at}
            loading={api.loading}
            error={report ? api.error : null}
            onRetry={api.reload}
          />
        }
      />
      <PeriodToolbar
        preset={preset}
        start={start}
        end={end}
        onPreset={setPreset}
        onStart={setStart}
        onEnd={setEnd}
        loading={api.loading}
        onReload={api.reload}
        extra={<GlobalStatusFilter size="md" />}
      />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {team === 'cskh' && <CskhFocusBar />}
      {api.error && !report && (
        <ErrorBox error={api.error} onRetry={api.reload} />
      )}
      {!cur && !api.error && (
        <>
          <SkeletonKpis count={6} className="lg:grid-cols-3" />
          <ChartCard title="Theo ngày" subtitle="Đang tải…">
            <SkeletonTable rows={5} cols={5} />
          </ChartCard>
        </>
      )}
      {cur && report && (
        <>
          <div
            className={`stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 transition-opacity ${api.loading ? 'opacity-70' : ''}`}
            aria-busy={api.loading}
          >
            <KpiCard
              id={`${team}-revenue`}
              icon={ICON.revenue}
              tone="green"
              label={`Doanh thu ${team === 'sale' ? 'Sale' : 'CSKH'}`}
              value={shortMoney(cur.closedNet)}
              countUp
              rawValue={cur.closedNet}
              format={shortMoney}
              delta={prev ? delta(cur.closedNet, prev.closedNet) : undefined}
              note={
                <>
                  <span className="block">Đơn chốt · {statusNote}</span>
                  {forecast && <span className="mt-1 block">
                    Dự báo cuối tháng: {shortMoney(forecast.revenue)}
                    {forecast.targetPercent != null && <span className="block">{pct(forecast.targetPercent)} mục tiêu · {shortMoney(forecast.target)}</span>}
                    <span className="block text-[11px]">dự báo theo tốc độ từ đầu tháng</span>
                  </span>}
                </>
              }
              tooltip={tip(
                report.definitions.revenue,
                money(cur.closedNet),
                prev ? money(prev.closedNet) : undefined,
              )}
            />
            <KpiCard
              id={`${team}-aov`}
              icon={ICON.aov}
              tone="teal"
              label="AOV"
              value={shortMoney(cur.averageOrder)}
              delta={
                prev?.averageOrder && cur.averageOrder
                  ? delta(cur.averageOrder, prev.averageOrder)
                  : undefined
              }
              note={`Giao thành công TB ${shortMoney(cur.deliveredAverage)}`}
              chart={(() => { const s = daily((net, n) => n ? net / n : 0); return s && s.length > 1 ? <PeriodBars series={s} unit="money" kind="line" fill /> : undefined; })()}
              tooltip={tip(
                'Doanh thu ÷ đơn chốt.',
                money(cur.averageOrder),
                prev ? money(prev.averageOrder) : undefined,
              )}
            />
            <KpiCard
              id={`${team}-closed`}
              icon={ICON.closed}
              tone="blue"
              label="Đơn chốt"
              value={vi.format(cur.closedOrders)}
              countUp
              rawValue={cur.closedOrders}
              delta={
                prev ? delta(cur.closedOrders, prev.closedOrders) : undefined
              }
              note={`${vi.format(cur.closedCustomers ?? 0)} khách · ${vi.format(cur.closedQuantity)} sản phẩm`}
              chart={(() => { const s = daily((_, n) => n); return s?.length ? <PeriodBars series={s} unit="orders" kind="cum" periodEnd={end} fill /> : undefined; })()}
              tooltip={{
                ...tip(
                  report.definitions.closed,
                  `${vi.format(cur.closedOrders)} đơn`,
                  prev ? `${vi.format(prev.closedOrders)} đơn` : undefined,
                ),
                rows: groupCounts
                  ?.filter((x) => x.closed)
                  .sort((a, b) => b.closed - a.closed)
                  .map((x): [string, string] => [
                    x.label,
                    `${vi.format(x.closed)} đơn${cur.closedOrders ? ` (${pct((x.closed / cur.closedOrders) * 100, 0)})` : ''}`,
                  ]),
              }}
            />
            {(() => {
              const r = closeRateOf(cur, ms.rateBase),
                pr = prev ? closeRateOf(prev, ms.rateBase) : null,
                den = closeRateBase(cur, ms.rateBase);
              return (
                <KpiCard
                  id={`${team}-rate`}
                  icon={ICON.rate}
                  tone="purple"
                  label="Tỷ lệ chốt"
                  value={pct(r)}
                  note={`${vi.format(closeRateTop(cur, ms.rateBase))} đã chốt / ${vi.format(den)} ${ms.rateBase === 'assigned' ? 'đơn được chia' : 'đơn lên'}`}
                  delta={r != null && pr != null ? r - pr : undefined}
                  deltaLabel="điểm so kỳ trước"
                  progress={
                    den
                      ? { value: closeRateTop(cur, ms.rateBase), max: den }
                      : undefined
                  }
                  tooltip={tip(
                    METRIC_DEFS.rate(ms.rateBase).def,
                    pct(r),
                    pr != null ? pct(pr) : undefined,
                  )}
                />
              );
            })()}
            {team === 'cskh' ? (
              <>
                <KpiCard id="cskh-origin" icon={UserCheck} tone="green" label="Tự upsell" onClick={() => onNavigate('origin')}
                  value={vi.format(self.n)} unit="đơn" note={shortMoney(self.net)}
                  chart={<OriginShare n={self.n} net={self.net} totalN={self.n + mkt.n} totalNet={self.net + mkt.net} tone="var(--t-green)" />}
                  tooltip={tip('Đơn chốt không có Marketer trong kỳ và phạm vi đang chọn; doanh thu từ cùng các đơn đó.', vi.format(self.n) + ' đơn · ' + money(self.net))} />
                <KpiCard icon={Megaphone} tone="blue" label="Từ MKT" onClick={() => onNavigate('origin')}
                  value={vi.format(mkt.n)} unit="đơn" note={shortMoney(mkt.net)}
                  chart={<OriginShare n={mkt.n} net={mkt.net} totalN={self.n + mkt.n} totalNet={self.net + mkt.net} tone="var(--t-blue)" />}
                  tooltip={tip('Đơn chốt có Marketer trong kỳ và phạm vi đang chọn; doanh thu từ cùng các đơn đó.', vi.format(mkt.n) + ' đơn · ' + money(mkt.net))} />
              </>
            ) : (
              <>
                <KpiCard icon={ICON.revenue} tone="green" label="DT đóng hàng trở đi"
                  value={packedNet == null ? '—' : shortMoney(packedNet)}
                  note={<PackedRevenue params={q} net={packedNet} />}
                  tooltip={tip(PACKED_HELP, packedNet == null ? '—' : money(packedNet))} />
                <KpiCard icon={ICON.orders} tone="gray" label="Số được chia"
                  value={vi.format(cur.assignedOrders)}
                  delta={prev ? delta(cur.assignedOrders, prev.assignedOrders) : undefined}
                  note="Đơn được chia trong kỳ · POS và team đang chọn"
                  tooltip={tip(METRIC_DEFS.rate('assigned').def, vi.format(cur.assignedOrders) + ' đơn')} />
              </>
            )}
          </div>
          {!focusId && <AdvisorPanel dept={team} />}
          {/* Ô tự giãn lấp kín hàng, không để ô lẻ đứng một mình (anh Vũ 21/10/2026). */}
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
            {team === 'cskh' && !mktLens && (
              <KpiCard icon={PhoneCall} tone="gray" label="Cuộc gọi/note trong kỳ"
                className="!p-3 [&_.val]:!text-xl"
                value={calls ? vi.format(calls.notes) : '—'} loading={callsApi.loading && !calls}
                note={callsApi.error ? 'Không tải được ghi chú' : 'Ghi chú chăm sóc trên hồ sơ khách'}
                onClick={() => onNavigate('calls')}
                tooltip={tip('Số ghi chú chăm sóc trên hồ sơ khách trong kỳ và phạm vi đang chọn; cùng dữ liệu khối Cuộc gọi.', calls ? vi.format(calls.notes) + ' ghi chú' : '—')} />
            )}
            <KpiCard
              icon={ICON.cancelled}
              tone="red"
              label="Hủy"
              className="!p-3 [&_.val]:!text-xl"
              value={pct(cancelRate(cur))}
              note={`${vi.format(cur.groups.cancelled.orders)} đơn · ${shortMoney(cur.groups.cancelled.net)}`}
              invert
              tooltip={tip(
                METRIC_DEFS.cancelled.def,
                `${vi.format(cur.groups.cancelled.orders)} đơn`,
              )}
            />
            <KpiCard
              icon={ICON.returned}
              tone="orange"
              label="Hoàn"
              className="!p-3 [&_.val]:!text-xl"
              value={pct(returnRate(cur))}
              note={`${vi.format(cur.groups.returned.orders)} đơn · giao TC ${vi.format(cur.groups.delivered.orders)}`}
              invert
              tooltip={tip(
                METRIC_DEFS.returned(ms.returnBase).def,
                `${vi.format(cur.groups.returned.orders)} đơn`,
              )}
            />
          </div>
          {!focusId && !mktLens && <TrendNotes depts={[team]} team={team} />}
          {kpi && team === 'cskh' && !mktLens && (
            <LazyBlock><TeamKpiProgress
              team="cskh"
              focusId={focusId}
              onOpen={() => onNavigate('cskh-kpi')}
            /></LazyBlock>
          )}
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
            {showTags &&
              (() => {
                // Thay thẻ "Chi phí giảm giá + ship" (29/09/2026): đơn chốt theo từng thẻ đơn.
                const g = groupCounts;
                const d = groupsApi.data;
                const noTag = focusId
                  ? (d?.staff.find((x) => x.sellerId === focusId)?.untagged
                      ?.closed ?? 0)
                  : (d?.untagged?.closed ?? 0);
                return (
                  <KpiCard
                    icon={Layers}
                    tone="orange"
                    label="Đơn chốt theo thẻ đơn"
                    value={
                      g ? vi.format(Math.max(0, cur.closedOrders - noTag)) : '—'
                    }
                    unit="đơn có thẻ"
                    loading={!g && groupsApi.loading}
                    note={
                      g
                        ? tagChips(
                            g
                              .map((x) => ({ label: x.label, n: x.closed }))
                              .sort((a, b) => b.n - a.n),
                            cur.closedOrders,
                          )
                        : 'Đang tải thẻ đơn…'
                    }
                    tooltip={
                      g
                        ? {
                            period: periodLabel,
                            rows: g
                              .filter((x) => x.closed)
                              .sort((a, b) => b.closed - a.closed)
                              .map((x): [string, string] => [
                                x.label,
                                `${vi.format(x.closed)} đơn · ${shortMoney(x.closedNet)}`,
                              ]),
                            definition:
                              'Đơn chốt trong kỳ theo từng thẻ đơn trên Pancake (nhãn dòng sản phẩm, bỏ nhãn vận hành như đối soát, hẹn gọi…). Đơn gắn nhiều thẻ tính ở mỗi thẻ nên cộng lại có thể lớn hơn tổng. Đơn có thẻ = đơn chốt có ít nhất một nhãn dòng sản phẩm.',
                          }
                        : undefined
                    }
                  />
                );
              })()}
            <KpiCard
              icon={ICON.orders}
              tone="gray"
              label="Đơn lên trong kỳ"
              value={vi.format(cur.orders)}
              countUp
              rawValue={cur.orders}
              delta={prev ? delta(cur.orders, prev.orders) : undefined}
              note={
                <>
                  {shortMoney(cur.net)} · {vi.format(cur.groups.new.orders)} còn
                  mới chưa chốt
                  {groupCounts &&
                    tagChips(
                      groupCounts
                        .map((x) => ({ label: x.label, n: x.created }))
                        .sort((a, b) => b.n - a.n),
                      cur.orders,
                    )}
                </>
              }
              tooltip={{
                ...tip(
                  report.definitions.basis,
                  `${vi.format(cur.orders)} đơn`,
                  prev ? `${vi.format(prev.orders)} đơn` : undefined,
                ),
                rows: groupCounts
                  ?.filter((x) => x.created)
                  .sort((a, b) => b.created - a.created)
                  .map((x): [string, string] => [
                    x.label,
                    `${vi.format(x.created)} đơn${cur.orders ? ` (${pct((x.created / cur.orders) * 100, 0)})` : ''}`,
                  ]),
              }}
            />
          </div>
          {/* Số cả cửa hàng: ẩn khi đang xem riêng một nhân viên để ảnh chụp không lộ số người khác. */}
          {!focusId && !mktLens && (
            <LazyBlock><PancakeReference
              posIds={posIds}
              start={start}
              end={end}
              title="Số tham chiếu Pancake · cả cửa hàng"
              note={`Toàn bộ đơn của POS đang chọn (mọi bộ phận), như màn Thống kê Pancake · % so kỳ trước`}
            /></LazyBlock>
          )}

          {team === 'cskh' && !mktLens && (
            <div className="grid gap-4">
              <ChartCard
                icon={PhoneCall}
                title="Cuộc gọi"
                subtitle={`Ghi chú chăm sóc trên hồ sơ khách · ${periodLabel}`}
                action={
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => onNavigate('calls')}
                  >
                    Chi tiết cuộc gọi
                    <ArrowRight size={13} />
                  </button>
                }
              >
                {calls ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-line p-3">
                      <div className="text-xs font-semibold text-ink-2">
                        Cuộc gọi
                      </div>
                      <div className="num mt-1 text-2xl font-bold text-ink">
                        {vi.format(calls.notes)}
                      </div>
                      <div className="text-xs text-ink-3">
                        {calls.people} người gọi
                      </div>
                    </div>
                    <div className="rounded-xl border border-line p-3">
                      <div className="text-xs font-semibold text-ink-2">
                        Khách đã gọi
                      </div>
                      <div className="num mt-1 text-2xl font-bold text-ink">
                        {vi.format(calls.customers)}
                      </div>
                      <div className="text-xs text-ink-3">khách khác nhau</div>
                    </div>
                    <div className="rounded-xl border border-line p-3">
                      <div className="text-xs font-semibold text-ink-2">
                        TB / người / ngày
                      </div>
                      <div className="num mt-1 text-2xl font-bold text-ink">
                        {calls.personDays
                          ? vi.format(
                              Math.round(calls.notes / calls.personDays),
                            )
                          : '—'}
                      </div>
                      <div className="text-xs text-ink-3">cuộc gọi</div>
                    </div>
                  </div>
                ) : callsApi.error ? (
                  <ErrorBox error={callsApi.error} onRetry={callsApi.reload} />
                ) : (
                  <SkeletonTable rows={2} cols={3} />
                )}
              </ChartCard>
            </div>
          )}

          {team === 'sale' && !mktLens && (
            <LazyBlock className="h-72"><SaleGroupBlock start={start} end={end} posIds={posIds} rates={staffRates} /></LazyBlock>
          )}
          {team === 'cskh' && !mktLens && (
            <LazyBlock className="h-72"><SaleGroupBlock
              start={start}
              end={end}
              posIds={posIds}
              team="cskh"
              by="care"
              focusId={focusId}
              title="Đơn theo nhóm sản phẩm · từng nhân viên CSKH"
              plainTitle="Từng nhân viên CSKH"
              plainSubtitle="Đơn chốt trong kỳ của từng người (NV chăm sóc trên đơn, trống thì người bán) · so cùng kỳ chọn ngay dưới · bấm số để xem từng đơn"
              subtitle="Đơn chốt trong kỳ của từng người (NV chăm sóc trên đơn, trống thì người bán), xếp theo sản phẩm của CHÍNH đơn đó · một đơn có cả hai loại tính ở cả hai nhóm · bấm số để xem từng đơn"
            /></LazyBlock>
          )}
          {team === 'cskh' && !mktLens && (
            <LazyBlock className="h-72"><CskhOriginBlock
              start={start}
              end={end}
              posIds={posIds}
              focusId={focusId}
            /></LazyBlock>
          )}

          <ChartCard
            icon={Wallet}
            title="Doanh thu và đơn chốt theo ngày"
            subtitle={`${periodLabel} · ${statusNote}`}
          >
            {days.length ? (
              <ChartContainer
                className="h-64 w-full aspect-auto"
                config={{
                  netM: {
                    label: 'Doanh thu (triệu ₫)',
                    color: 'var(--primary)',
                  },
                  orders: { label: 'Đơn chốt', color: 'var(--st-confirmed)' },
                }}
              >
                <ComposedChart
                  data={days}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => dmy(v)}
                    minTickGap={24}
                  />
                  <YAxis
                    yAxisId="m"
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <YAxis
                    yAxisId="n"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => dmy(String(v))}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    yAxisId="m"
                    dataKey="netM"
                    fill="var(--color-netM)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    yAxisId="n"
                    type="monotone"
                    dataKey="orders"
                    stroke="var(--color-orders)"
                    strokeWidth={2}
                    dot={days.length < 20}
                  />
                </ComposedChart>
              </ChartContainer>
            ) : (
              <EmptyState text="Chưa có đơn chốt trong kỳ." />
            )}
          </ChartCard>

          <ChartCard
            icon={Receipt}
            title="Theo POS"
            subtitle={`Số của riêng bộ phận này · ${periodLabel}`}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[...report.current.byPos]
                .sort((a, b) => b.closedNet - a.closedNet)
                .map((p) => {
                  const prevPos = report.compare?.byPos.find(
                    (x) => x.posId === p.posId,
                  );
                  const buckets = [
                    ...new Set(report.current.series.map((x) => x.bucket)),
                  ]
                    .sort()
                    .slice(-7);
                  return (
                    <PosTile
                      key={p.posId}
                      posId={p.posId}
                      name={posName(p.posId)}
                      revenue={p.closedNet}
                      orders={p.closedOrders}
                      aov={p.averageOrder}
                      rate={rateOf(p)}
                      rateLabel="Tỷ lệ chốt"
                      share={
                        cur.closedNet
                          ? (p.closedNet / cur.closedNet) * 100
                          : null
                      }
                      change={
                        prevPos ? delta(p.closedNet, prevPos.closedNet) : null
                      }
                      spark={buckets.map(
                        (bk) =>
                          report.current.series.find(
                            (x) => x.bucket === bk && x.posId === p.posId,
                          )?.closedNet ?? 0,
                      )}
                      note={`${vi.format(p.orders)} đơn lên · hủy ${pct(cancelRate(p))} · hoàn ${pct(returnRate(p))}`}
                    />
                  );
                })}
            </div>
          </ChartCard>

          <ChartCard
            icon={Users}
            title={`Theo nhân viên · ${staff.length} người`}
            subtitle="Bấm tiêu đề cột để sắp xếp"
            action={
              <button
                type="button"
                className="btn sm"
                onClick={() => onNavigate('compare')}
              >
                So sánh nhân viên
                <ArrowRight size={13} />
              </button>
            }
          >
            {staff.length ? (
              <TableWrap minWidth={720} maxHeight="36rem" stickyFirst>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <SortTh
                        k="name"
                        label="Nhân viên"
                        sort={staffSort}
                        align="left"
                      />
                      <SortTh
                        k="closedNet"
                        label="Doanh thu"
                        sort={staffSort}
                      />
                      <SortTh
                        k="closedOrders"
                        label="Đơn chốt"
                        sort={staffSort}
                      />
                      <SortTh k="averageOrder" label="AOV" title="Doanh thu ÷ đơn chốt" sort={staffSort} />
                      {team === 'sale' && <><SortTh k="packedNet" label="DT đóng hàng trở đi" title={PACKED_HELP} sort={staffSort} /><SortTh k="packedShare" label="% DT đóng hàng" title={PACKED_HELP} sort={staffSort} /></>}
                      <SortTh k="rate" label="Tỷ lệ chốt" sort={staffSort} />
                      <SortTh k="ret" label="Hoàn" title="Đỏ từ 7%, vàng từ 5%, xanh dưới 5%" sort={staffSort} />
                      <SortTh k="cancel" label="Hủy" title="Đỏ từ 7%, vàng từ 5%, xanh dưới 5%" sort={staffSort} />
                      <th>Tỷ trọng doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((r, i) => (
                      <tr key={r.sellerId}>
                        <td className="num text-[11px] text-ink-4">{i + 1}</td>
                        <td className="text-left font-medium text-ink">
                          {r.name}
                          {r.department && (
                            <span className="block text-[11px] font-normal text-ink-3">
                              {r.department}
                            </span>
                          )}
                        </td>
                        <td className="n">{shortMoney(r.closedNet)}</td>
                        <td className="n">{vi.format(r.closedOrders)}</td>
                        <td className="n">{shortMoney(r.averageOrder)}</td>
                        {team === 'sale' && <><td className="n"><PackedRevenue params={new URLSearchParams({ ...Object.fromEntries(q), employeeIds: r.sellerId })} net={r.packedNet} /></td><td className="n" title={PACKED_HELP}>{pct(r.packedShare)}</td></>}
                        <td className="n">
                          {r.assignedHidden && team === 'sale'
                            ? '—'
                            : pct(rateOf(r))}
                        </td>
                        <RateCells v={staffRates.get(r.sellerId)} />
                        <td>
                          <span
                            className="block h-2 rounded-full bg-[var(--primary)]"
                            style={{
                              width: `${Math.max(2, cur.closedNet ? (r.closedNet / cur.closedNet) * 140 : 0)}px`,
                            }}
                            title={pct(
                              cur.closedNet
                                ? (r.closedNet / cur.closedNet) * 100
                                : null,
                            )}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {staff.length > 1 &&
                    (() => {
                      const net = staff.reduce((t, r) => t + r.closedNet, 0),
                        closed = staff.reduce((t, r) => t + r.closedOrders, 0);
                      const top = staff.reduce(
                          (t, r) => t + closeRateTop(r, ms.rateBase),
                          0,
                        ),
                        den = staff.reduce(
                          (t, r) => t + closeRateBase(r, ms.rateBase),
                          0,
                        );
                      // Dòng tổng Hoàn, Hủy: cộng số đơn của những người trong bảng rồi tính như từng người.
                      const sum = (f: (r: (typeof staff)[number]) => number) => staff.reduce((t, r) => t + f(r), 0);
                      const g = (k: 'returned' | 'shipping' | 'delivered' | 'cancelled') => ({ orders: sum((r) => r.groups[k]?.orders ?? 0) });
                      const all = { orders: sum((r) => r.orders), closedOrders: closed, deletedOrders: sum((r) => r.deletedOrders ?? 0), groups: { returned: g('returned'), shipping: g('shipping'), delivered: g('delivered'), cancelled: g('cancelled') } };
                      const totalRates = { ret: returnRateOf(all, ms.returnBase), returned: all.groups.returned.orders, cancel: cancelRateOf(all), cancelled: Math.max(0, all.groups.cancelled.orders - all.deletedOrders) };
                      return (
                        <tfoot>
                          <tr>
                            <td />
                            <td className="text-left">
                              Tổng · {vi.format(staff.length)} người
                            </td>
                            <td className="n">{shortMoney(net)}</td>
                            <td className="n">{vi.format(closed)}</td>
                            <td className="n">
                              {shortMoney(closed ? net / closed : null)}
                            </td>
                            {team === 'sale' && <><td className="n"><PackedRevenue params={q} net={report.packedStaff ? staff.reduce((n, r) => n + (r.packedNet ?? 0), 0) : undefined} /></td><td className="n" title={PACKED_HELP}>{pct(net && report.packedStaff ? staff.reduce((n, r) => n + (r.packedNet ?? 0), 0) / net * 100 : null)}</td></>}
                            <td className="n">
                              {staff.some((r) => r.assignedHidden) &&
                              team === 'sale'
                                ? '—'
                                : pct(den ? (top / den) * 100 : null)}
                            </td>
                            <RateCells v={totalRates} />
                            <td className="text-[11px] font-normal text-ink-3">
                              {pct(
                                cur.closedNet
                                  ? (net / cur.closedNet) * 100
                                  : null,
                                0,
                              )}{' '}
                              doanh thu bộ phận
                            </td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                </table>
              </TableWrap>
            ) : (
              <EmptyState text="Chưa có nhân viên nào có số trong kỳ." />
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}

/** Phần của nguồn đơn (Tự upsell / Từ MKT) trong đơn chốt và doanh thu: hai vòng tròn tỷ lệ. */
function OriginShare({ n, net, totalN, totalNet, tone }: { n: number; net: number; totalN: number; totalNet: number; tone: string }) {
  const ring = (part: number, total: number, label: string) => {
    const p = total ? part / total : 0, r = 15.9, c = 2 * Math.PI * r;
    return (
      <span className="flex items-center gap-2">
        <svg viewBox="0 0 36 36" className="size-12 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={tone} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(p * c).toFixed(2)} ${c.toFixed(2)}`} />
        </svg>
        <span className="min-w-0 leading-tight"><span className="num block text-[15px] font-semibold text-ink">{pct(p * 100, 0)}</span><span className="block text-[11px] text-ink-3">{label}</span></span>
      </span>
    );
  };
  return (
    <span className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2" title="Phần của nguồn này trong tổng đơn chốt Tự upsell + Từ MKT">
      {ring(n, totalN, 'số đơn chốt')}
      {ring(net, totalNet, 'doanh thu')}
    </span>
  );
}
