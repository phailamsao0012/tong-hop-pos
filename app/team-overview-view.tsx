'use client';
import { StaffName } from './staff-name';
import { AdvisorPanel } from './advisor-panel';

// Tổng quan từng bộ phận (Sale / CSKH): tình hình kinh doanh của riêng bộ phận đó — doanh thu, đơn chốt, GTTB, tỷ lệ chốt,
// đơn chốt theo nhóm sản phẩm (thay chi phí giảm giá & ship từ 29/09/2026), hủy/hoàn, theo ngày, theo POS, theo nhân viên (yêu cầu 24/09/2026).
// Số lấy từ cùng báo cáo Tổng quan POS (lọc đội), nên khớp các trang khác; trạng thái đơn theo bộ lọc chung trên thanh trên cùng.
import { PackedRevenue, PACKED_HELP } from './sale-analytics-view';
import { overviewStaffCommon } from '@/lib/reports/staff-merge';
import type { PackedSeller } from '@/lib/reports/sale-packed';
import { type MonthForecast } from '@/lib/kpi/forecast';
import { todayVn } from '@/lib/shared/report-time';
import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { ICON } from './icons';
import { PancakeReference } from './pancake-reference';
import { SaleSegmentBlock } from './sale-segment-block';
import {
  METRIC_DEFS,
  cancelRateOf,
  closeRateBase,
  closeRateOf,
  closeRateTop,
  returnRateOf,
  closeRateOfMany,
  RATE_BASES,
  RETURN_BASES,
} from '@/lib/reports/metrics';
import { BOSS_CANCEL_RED, BOSS_CLOSE_RED, BOSS_RETURN_RED, COACH_MIN_BASE } from '@/lib/zalo/boss-report';
import { CanXemStrip, DuoSpark, KPI_RED, KPI_TIGHT, PageHeadMoi, WhySheet, type CanXemItem, type WhySpec } from './trang-moi';
import { useMetricSettings } from './metric-settings';
import { useMemo, useState } from 'react';
import { takeNavHint } from './nav-focus';
import { SEGMENT_HINT, segmentFromHint } from '@/lib/shared/drill-hint';
import { PRODUCT_SEGMENTS } from '@/lib/pancake/order-segments';
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
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
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
  BookOpen,
  Lightbulb,
  Percent,
  Target,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { POS } from '@/lib/shared/report-model';
import { PeriodToolbar, PosChips, type OverviewReport } from './overview-view';
import { GlobalStatusFilter } from './status-filter';
import { parseStatus } from '@/lib/pancake/order-status';
import { useOrderStatus } from './status-store';
import { LazyBlock } from './lazy-block';
import { useApi } from './use-api';
import { unitFor, useHrUnit, withUnit, useMktTeam } from './team-store';
import { PeriodBars, TrendNotes } from './overview-trends';
import { StaleChip } from './stale-chip';
import { TeamKpiProgress } from './team-kpi-progress';
import { Th,
  ChartCard,
  EmptyState,
  ErrorBox,
  FoldBlock,
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
  vi, barRadius,
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
  uiMoi = false,
}: {
  team: Team;
  onNavigate: (view: string) => void;
  /** Chủ hệ thống: hiện tiến độ KPI tháng ở đầu trang. */ kpi?: boolean;
  /** Cờ THP_UI_MOI (dashboard truyền xuống): bật thì dựng bố cục trang kiểu mới; tắt thì y như cũ. */ uiMoi?: boolean;
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
  // Bấm số ở Tổng quan POS khi đang lọc nhóm đơn: giữ nhóm đó cho báo cáo chính của trang (đánh giá 21/10/2026), có nút bỏ lọc.
  const [segment, setSegment] = useState(() => segmentFromHint(takeNavHint(SEGMENT_HINT)));
  // Giao diện mới: khung "Vì sao ra số này" đang mở (null = đóng). Cờ tắt thì không bao giờ mở.
  const [why, setWhy] = useState<WhySpec | null>(null);
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
      () => `/api/reports/overview?${q}&groupBy=day&compare=previous&forecast=month${segment ? `&productSegment=${segment}` : ''}`,
      [q, segment],
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

  // Các khối dùng chung cho bố cục cũ và bố cục kiểu mới (cờ THP_UI_MOI): cùng JSX, chỉ chỗ đặt khác nhau.
  // fold: chỉ bố cục mới truyền (thu gọn thẻ); bố cục cũ không truyền nên thẻ y như trước.
  type Rep = NonNullable<typeof report>;
  type Fold = { storageKey: string; summary?: string } | undefined;
  const extraTiles = (cur: Metrics, report: Rep) => (
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
  );
  const callsCard = (fold?: Fold) => (
            <div className="grid gap-4">
              <ChartCard collapse={fold}
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
                    <div data-ui="tile-in" className="rounded-xl border border-line p-3">
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
                    <div data-ui="tile-in" className="rounded-xl border border-line p-3">
                      <div className="text-xs font-semibold text-ink-2">
                        Khách đã gọi
                      </div>
                      <div className="num mt-1 text-2xl font-bold text-ink">
                        {vi.format(calls.customers)}
                      </div>
                      <div className="text-xs text-ink-3">khách khác nhau</div>
                    </div>
                    <div data-ui="tile-in" className="rounded-xl border border-line p-3">
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
  );
  const saleStaffBlock = (cur: Metrics, report: Rep) => (
            // Bảng nhân viên gộp (27/11/2026, plan gọn trang đợt 2): một bảng thay cho "Từng nhân viên" + "Theo nhân viên"; số chung từ báo cáo tổng quan.
            <LazyBlock className="h-72"><SaleGroupBlock start={start} end={end} posIds={posIds} rates={staffRates}
              common={overviewStaffCommon(report.current.byEmployee, report.packedStaff, ms.rateBase, cur?.closedNet ?? 0)} deptNet={cur?.closedNet ?? 0}
              renderPacked={(id, net) => <PackedRevenue params={id ? new URLSearchParams({ ...Object.fromEntries(q), employeeIds: id }) : q} net={net} />}
              onCompare={() => onNavigate('compare')} /></LazyBlock>
  );
  const cskhStaffBlock = (cur: Metrics, report: Rep) => (
            <LazyBlock className="h-72"><SaleGroupBlock
              start={start}
              end={end}
              posIds={posIds}
              team="cskh"
              // Bảng gộp CSKH (Đầu não 27/11/2026): MỌI cột theo người bán, cùng nguồn ô Doanh thu đầu trang (trước đây cột riêng theo NV chăm sóc
              // nên một dòng có Tiền khách trả lớn hơn Doanh thu). Muốn quay về NV chăm sóc: đặt lại by="care" và bỏ common.
              by="seller"
              focusId={focusId}
              rates={staffRates}
              common={overviewStaffCommon(report.current.byEmployee, undefined, ms.rateBase, cur?.closedNet ?? 0)}
              deptNet={cur?.closedNet ?? 0}
              onCompare={() => onNavigate('compare')}
              title="Đơn theo nhóm sản phẩm · từng nhân viên CSKH"
              plainTitle="Từng nhân viên CSKH"
              plainSubtitle="Đơn chốt trong kỳ của từng nhân viên CSKH theo người bán trên đơn, cùng số ô Doanh thu đầu trang · bấm số để xem từng đơn"
              subtitle="Đơn chốt trong kỳ của từng nhân viên CSKH theo người bán trên đơn, cùng số ô Doanh thu đầu trang; cột thẻ đơn xếp theo sản phẩm của CHÍNH đơn đó · bấm số để xem từng đơn"
            /></LazyBlock>
  );
  const posCard = (cur: Metrics, report: Rep, fold?: Fold) => (
          <ChartCard collapse={fold}
            icon={Receipt}
            title="Theo POS"
            subtitle={`Số của riêng bộ phận này · ${periodLabel}`}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
                      rate={team === 'cskh' ? undefined : rateOf(p)}
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
  );
  const lensStaffCard = (cur: Metrics, report: Rep) => (
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
                      <Th className="w-8">#</Th>
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
                      {team === 'sale' && <SortTh k="rate" label="Tỷ lệ chốt" sort={staffSort} />}
                      <SortTh k="ret" label="Hoàn" title="Đỏ từ 7%, vàng từ 5%, xanh dưới 5%" sort={staffSort} />
                      <SortTh k="cancel" label="Hủy" title="Đỏ từ 7%, vàng từ 5%, xanh dưới 5%" sort={staffSort} />
                      <Th>Tỷ trọng doanh thu</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((r, i) => (
                      <tr key={r.sellerId}>
                        <td className="num text-[11px] text-ink-4">{i + 1}</td>
                        <td className="text-left font-medium text-ink">
                          <StaffName id={r.sellerId} name={r.name} />
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
                        {team === 'sale' && (
                          <td className="n">
                            {r.assignedHidden ? '—' : pct(rateOf(r))}
                          </td>
                        )}
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
                            {team === 'sale' && (
                              <td className="n">
                                {staff.some((r) => r.assignedHidden)
                                  ? '—'
                                  : pct(den ? (top / den) * 100 : null)}
                              </td>
                            )}
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
  );

  // ===== Bố cục kiểu mới (cờ THP_UI_MOI; plan "giao diện mới cả trang trong" anh duyệt 27/11/2026) =====
  // Trên xuống: đầu trang một hàng (tên + một dòng phạm vi, chọn kỳ, hàng POS) → dải "Cần xem" (chỉ khi có số vượt mốc)
  // → MỘT hàng 6 ô số (bấm ô mở khung giữa màn "Vì sao ra số này") → biểu đồ theo ngày (kỳ này đậm, kỳ trước xám, đỏ khi vượt mốc)
  // → một bảng chính (từng nhân viên) → các khối phụ thu gọn, bấm mới mở. Số lấy đúng các biến của bố cục cũ; không tính số mới.
  // Cờ tắt thì nhánh này không chạy: bố cục cũ bên dưới giữ nguyên từng khối.
  if (uiMoi) {
    const name = team === 'sale' ? 'Sale' : 'CSKH';
    const title = unit ? `${TITLE[team]} · ${unit.name}` : TITLE[team];
    const posScope = posIds.length <= 3 ? posIds.map(posName).join(', ') : `${vi.format(posIds.length)} POS`;
    const scope = [periodLabel, posScope, statusNote, ...(team === 'sale' ? [`tỷ lệ chốt = ${RATE_BASES[ms.rateBase].short}`] : [])].join(' · ');
    const bad = (on: boolean) => (on ? ('bad' as const) : undefined);
    const overClose = (r: number | null) => r != null && r < BOSS_CLOSE_RED;
    const overRet = (r: number | null) => r != null && r >= BOSS_RETURN_RED;
    const overCancel = (r: number | null) => r != null && r >= BOSS_CANCEL_RED;
    // Nội dung khung "Vì sao ra số này" cho tỷ lệ chốt / hoàn / hủy của một phạm vi (cả đội hoặc một POS).
    const whyRate = (kind: 'close' | 'ret' | 'cancel', m: Metrics, who: string, pm: Metrics | null): WhySpec => {
      const sc = `${who} · ${periodLabel} · ${statusNote}`;
      if (kind === 'close') {
        const r = closeRateOf(m, ms.rateBase);
        return {
          title: `Tỷ lệ chốt · ${who}`, value: pct(r), tone: bad(overClose(r)), scope: sc,
          previous: pm ? pct(closeRateOf(pm, ms.rateBase)) : undefined, mark: `Đỏ khi dưới ${BOSS_CLOSE_RED}%`,
          rows: [
            { label: 'Đã chốt (tử số)', value: vi.format(closeRateTop(m, ms.rateBase)) },
            { label: `${ms.rateBase === 'assigned' ? 'Đơn được chia' : 'Đơn lên'} (mẫu số)`, value: vi.format(closeRateBase(m, ms.rateBase)) },
            { label: '= Tỷ lệ chốt', value: pct(r), strong: true, tone: bad(overClose(r)) },
            { label: 'Số được chia trong kỳ', value: vi.format(m.assignedOrders) },
          ],
          definition: METRIC_DEFS.rate(ms.rateBase).def,
        };
      }
      if (kind === 'ret') {
        const r = returnRate(m);
        return {
          title: `Hoàn · ${who}`, value: pct(r), tone: bad(overRet(r)), scope: sc,
          previous: pm ? pct(returnRate(pm)) : undefined, mark: `Đỏ từ ${BOSS_RETURN_RED}%`,
          rows: [
            { label: 'Đơn hoàn', value: vi.format(m.groups.returned.orders) },
            { label: 'Đang giao', value: vi.format(m.groups.shipping.orders) },
            { label: 'Giao thành công', value: vi.format(m.groups.delivered.orders) },
            { label: 'Đơn chốt', value: vi.format(m.closedOrders) },
            { label: 'Đơn lên', value: vi.format(m.orders) },
            { label: '= Tỷ lệ hoàn', value: pct(r), strong: true, tone: bad(overRet(r)) },
          ],
          definition: METRIC_DEFS.returned(ms.returnBase).def,
        };
      }
      const r = cancelRate(m);
      return {
        title: `Hủy · ${who}`, value: pct(r), tone: bad(overCancel(r)), scope: sc,
        previous: pm ? pct(cancelRate(pm)) : undefined, mark: `Đỏ từ ${BOSS_CANCEL_RED}%`,
        rows: [
          { label: 'Đơn hủy', value: vi.format(m.groups.cancelled.orders) },
          { label: 'Trong đó đã xóa (không tính)', value: vi.format(m.deletedOrders ?? 0) },
          { label: 'Đơn lên (mẫu số)', value: vi.format(m.orders) },
          { label: '= Tỷ lệ hủy', value: pct(r), strong: true, tone: bad(overCancel(r)) },
        ],
        definition: METRIC_DEFS.cancelled.def,
      };
    };
    // Dải "Cần xem": cả đội, và từng POS khi chọn nhiều POS (POS cần từ COACH_MIN_BASE đơn ở mẫu số để không báo vì vài đơn lẻ).
    const need: CanXemItem[] = [];
    if (cur && report) {
      const many = report.current.byPos.length > 1;
      const scopes: { key: string; who: string; m: Metrics; pm: Metrics | null; pos: boolean }[] = [
        { key: 'all', who: `Đội ${name}`, m: cur, pm: prev, pos: false },
        ...(many ? report.current.byPos.map((p) => ({ key: p.posId, who: posName(p.posId), m: p as Metrics, pm: (report.compare?.byPos.find((x) => x.posId === p.posId) ?? null) as Metrics | null, pos: true })) : []),
      ];
      for (const s of scopes) {
        const add = (kind: 'close' | 'ret' | 'cancel', text: string, gap: number) => need.push({ key: `${kind}-${s.key}`, text, team: !s.pos, gap, onClick: () => setWhy(whyRate(kind, s.m, s.who, s.pm)) });
        if (team === 'sale') {
          const r = closeRateOf(s.m, ms.rateBase);
          if (overClose(r) && (!s.pos || closeRateBase(s.m, ms.rateBase) >= COACH_MIN_BASE)) add('close', `${s.who}: chốt ${pct(r)}`, BOSS_CLOSE_RED - (r ?? 0));
        }
        const rr = returnRate(s.m);
        if (overRet(rr) && (!s.pos || s.m.closedOrders >= COACH_MIN_BASE)) add('ret', `${s.who}: hoàn ${pct(rr)}`, (rr ?? 0) - BOSS_RETURN_RED);
        const cr = cancelRate(s.m);
        if (overCancel(cr) && (!s.pos || s.m.orders >= COACH_MIN_BASE)) add('cancel', `${s.who}: hủy ${pct(cr)}`, (cr ?? 0) - BOSS_CANCEL_RED);
      }
    }
    // Theo ngày: kỳ này đặt cạnh ngày cùng thứ tự của kỳ trước (như biểu đồ trong ô số). Doanh thu triệu ₫ làm tròn như biểu đồ cũ.
    const groupDays = (rows: Rep['current']['series']) => {
      const m = new Map<string, Rep['current']['series']>();
      for (const r of rows) { const a = m.get(r.bucket); if (a) a.push(r); else m.set(r.bucket, [r]); }
      return [...m].sort((a, b) => a[0].localeCompare(b[0]));
    };
    const sumOf = (rs: Rep['current']['series'], f: (r: Rep['current']['series'][number]) => number) => rs.reduce((t, r) => t + f(r), 0);
    // Cộng số của một ngày (mọi POS) rồi tính tỷ lệ bằng đúng các hàm của ô số (closeRateOfMany / cancelRateOf / returnRateOf).
    const dayIn = (rs: Rep['current']['series']) => ({ orders: sumOf(rs, (x) => x.orders), closedOrders: sumOf(rs, (x) => x.closedOrders), deletedOrders: sumOf(rs, (x) => x.deletedOrders ?? 0),
      groups: { cancelled: { orders: sumOf(rs, (x) => x.groups.cancelled.orders) }, returned: { orders: sumOf(rs, (x) => x.groups.returned.orders) }, shipping: { orders: sumOf(rs, (x) => x.groups.shipping.orders) }, delivered: { orders: sumOf(rs, (x) => x.groups.delivered.orders) } } });
    const r1 = (r: number | null) => r == null ? null : Math.round(r * 10) / 10;
    const closeDay = (rs: Rep['current']['series']) => r1(closeRateOfMany(rs, ms.rateBase));
    const cancelDay = (rs: Rep['current']['series']) => r1(cancelRateOf(dayIn(rs)));
    const retDay = (rs: Rep['current']['series']) => r1(returnRateOf(dayIn(rs), ms.returnBase));
    const rateDay = (rs: Rep['current']['series']) => team === 'sale' ? closeDay(rs) : cancelDay(rs);
    const curDays = groupDays(report?.current.series ?? []), prevDays = groupDays(report?.compare?.series ?? []);
    const dayRows = curDays.map(([day, rs], i) => {
      const p = prevDays[i]?.[1];
      const net = sumOf(rs, (x) => x.closedNet), n = sumOf(rs, (x) => x.closedOrders), pNet = p ? sumOf(p, (x) => x.closedNet) : null, pN = p ? sumOf(p, (x) => x.closedOrders) : null;
      return { day, netM: Math.round(net / 1e5) / 10, prevM: pNet == null ? null : Math.round(pNet / 1e5) / 10, rate: rateDay(rs), prevRate: p ? rateDay(p) : null,
        net, prevNet: pNet, orders: n, prevOrders: pN, aov: n ? net / n : null, prevAov: pN ? (pNet ?? 0) / pN : null,
        close: closeDay(rs), prevClose: p ? closeDay(p) : null, cancel: cancelDay(rs), prevCancel: p ? cancelDay(p) : null, ret: retDay(rs), prevRet: p ? retDay(p) : null };
    });
    const rateChart = team === 'sale'
      ? { title: 'Tỷ lệ chốt Sale theo ngày', mark: BOSS_CLOSE_RED, over: overClose, note: `cột đỏ khi dưới ${BOSS_CLOSE_RED}% · ${RATE_BASES[ms.rateBase].short}` }
      : { title: 'Tỷ lệ hủy CSKH theo ngày', mark: BOSS_CANCEL_RED, over: overCancel, note: `cột đỏ từ ${BOSS_CANCEL_RED}% · đơn hủy ÷ đơn lên` };
    const red = KPI_RED;
    // Ô số bằng nhau, thấp gọn (sửa 27/11/2026): mọi ô có đường nhỏ kỳ này / kỳ trước từ số theo ngày đã tải (DuoSpark).
    const spark = (a: (number | null)[], b: (number | null)[], bad?: (v: number | null) => boolean) => <DuoSpark cur={a} prev={report?.compare ? b : undefined} bad={bad} />;
    const k = (s: string) => `ui-moi:${team}-overview:${s}`;

    return (
      <div className="min-w-0 space-y-4">
        {/* 1. Đầu trang (PageHeadMoi): tên, dòng phạm vi, chọn kỳ; hàng POS chỉ chung dòng khi đủ chỗ, thiếu chỗ xuống dòng riêng. */}
        <PageHeadMoi title={title} hint={SUB[team]} scope={scope}
          tools={<PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd}
            loading={api.loading} onReload={api.reload} extra={<GlobalStatusFilter size="md" />} />}
          right={<StaleChip stale={api.stale} at={api.at} loading={api.loading} error={report ? api.error : null} onRetry={api.reload} />}
          pos={<PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />} />
        {segment && (
          <output className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/40 bg-tint px-3 py-2 text-[13px] text-ink">
            <span>Đang lọc nhóm đơn <b>{PRODUCT_SEGMENTS[segment]}</b> như ở Tổng quan POS: ô số, biểu đồ và bảng nhân viên tính theo nhóm này; các khối khác vẫn tính mọi nhóm.</span>
            <button type="button" className="link" onClick={() => setSegment(null)}>Bỏ lọc nhóm</button>
          </output>
        )}
        {team === 'cskh' && <CskhFocusBar />}
        {api.error && !report && <ErrorBox error={api.error} onRetry={api.reload} />}
        {!cur && !api.error && <SkeletonKpis count={6} className="sm:grid-cols-3 xl:grid-cols-6" />}
        {cur && report && (
          <>
            {/* 2. Cần xem: chỉ hiện khi có số vượt mốc. */}
            <CanXemStrip items={need} note={`Mốc: ${team === 'sale' ? `chốt dưới ${BOSS_CLOSE_RED}%, ` : ''}hoàn từ ${BOSS_RETURN_RED}%, hủy từ ${BOSS_CANCEL_RED}% · bấm để xem vì sao`} />

            {/* 3. Một hàng 6 ô số: điện thoại 2 cột, máy tính bảng 3 cột, từ 1280px đủ 6 ô một hàng (không ô trống). */}
            <div className="stagger grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-busy={api.loading}>
              <KpiCard id={`${team}-revenue`} icon={ICON.revenue} tone="green" label={`Doanh thu ${name}`} className={KPI_TIGHT}
                chart={spark(dayRows.map((d) => d.net), dayRows.map((d) => d.prevNet))}
                value={shortMoney(cur.closedNet)} countUp rawValue={cur.closedNet} format={shortMoney}
                delta={prev ? delta(cur.closedNet, prev.closedNet) : undefined}
                note={`Đơn chốt · ${statusNote}${forecast ? ` · dự báo cuối tháng ${shortMoney(forecast.revenue)}` : ''}`}
                onClick={() => setWhy({
                  title: `Doanh thu ${name}`, value: money(cur.closedNet), scope, previous: prev ? money(prev.closedNet) : undefined,
                  rows: [
                    { label: 'Đơn chốt', value: vi.format(cur.closedOrders) },
                    { label: 'AOV (doanh thu ÷ đơn chốt)', value: money(cur.averageOrder) },
                    ...(forecast ? [{ label: 'Dự báo cuối tháng (theo tốc độ từ đầu tháng)', value: shortMoney(forecast.revenue) }] : []),
                    ...(forecast?.targetPercent != null ? [{ label: `So mục tiêu ${shortMoney(forecast.target)}`, value: pct(forecast.targetPercent) }] : []),
                  ],
                  definition: report.definitions.revenue,
                  more: team === 'sale' ? (
                    <div className="rounded-xl border border-line p-3 text-[12.5px] text-ink-2">
                      <div className="flex flex-wrap items-center justify-between gap-2"><b className="font-semibold text-ink">DT đóng hàng trở đi</b><PackedRevenue params={q} net={packedNet} /></div>
                      <p className="mt-1 text-[11.5px] text-ink-3">{PACKED_HELP} Bấm số để xem từng đơn.</p>
                    </div>
                  ) : undefined,
                })} />
              <KpiCard id={`${team}-closed`} icon={ICON.closed} tone="blue" label={`Đơn chốt ${name}`} className={KPI_TIGHT}
                value={vi.format(cur.closedOrders)} countUp rawValue={cur.closedOrders}
                delta={prev ? delta(cur.closedOrders, prev.closedOrders) : undefined}
                note={`${vi.format(cur.closedCustomers ?? 0)} khách · ${vi.format(cur.closedQuantity)} sản phẩm`}
                chart={spark(dayRows.map((d) => d.orders), dayRows.map((d) => d.prevOrders))}
                onClick={() => setWhy({
                  title: `Đơn chốt ${name}`, value: `${vi.format(cur.closedOrders)} đơn`, scope, previous: prev ? `${vi.format(prev.closedOrders)} đơn` : undefined,
                  rows: [
                    { label: 'Khách', value: vi.format(cur.closedCustomers ?? 0) },
                    { label: 'Sản phẩm', value: vi.format(cur.closedQuantity) },
                    { label: 'Đơn lên trong kỳ', value: vi.format(cur.orders) },
                    { label: 'Còn mới chưa chốt', value: vi.format(cur.groups.new.orders) },
                    ...(groupCounts ?? []).filter((x) => x.closed).sort((a, b) => b.closed - a.closed)
                      .map((x) => ({ label: `Thẻ ${x.label}`, value: `${vi.format(x.closed)} đơn${cur.closedOrders ? ` (${pct((x.closed / cur.closedOrders) * 100, 0)})` : ''}` })),
                  ],
                  definition: report.definitions.closed,
                })} />
              <KpiCard id={`${team}-aov`} icon={ICON.aov} tone="teal" label={`AOV ${name}`} className={KPI_TIGHT}
                value={shortMoney(cur.averageOrder)}
                delta={prev?.averageOrder && cur.averageOrder ? delta(cur.averageOrder, prev.averageOrder) : undefined}
                note={`Giao thành công TB ${shortMoney(cur.deliveredAverage)}`}
                chart={spark(dayRows.map((d) => d.aov), dayRows.map((d) => d.prevAov))}
                onClick={() => setWhy({
                  title: `AOV ${name}`, value: money(cur.averageOrder), scope, previous: prev ? money(prev.averageOrder) : undefined,
                  rows: [
                    { label: 'Doanh thu', value: money(cur.closedNet) },
                    { label: 'Đơn chốt', value: vi.format(cur.closedOrders) },
                    { label: '= AOV', value: money(cur.averageOrder), strong: true },
                    { label: 'Giao thành công TB', value: money(cur.deliveredAverage) },
                  ],
                  definition: 'Doanh thu ÷ đơn chốt.',
                })} />
              {team === 'sale' ? (() => {
                const r = closeRateOf(cur, ms.rateBase), pr = prev ? closeRateOf(prev, ms.rateBase) : null, den = closeRateBase(cur, ms.rateBase);
                return (
                  <KpiCard id={`${team}-rate`} icon={ICON.rate} tone="purple" label="Tỷ lệ chốt Sale" className={`${KPI_TIGHT} ${overClose(r) ? red : ''}`}
                    chart={spark(dayRows.map((d) => d.close), dayRows.map((d) => d.prevClose), overClose)}
                    value={pct(r)} delta={r != null && pr != null ? r - pr : undefined} deltaLabel="điểm so kỳ trước"
                    note={`${vi.format(closeRateTop(cur, ms.rateBase))} đã chốt / ${vi.format(den)} ${ms.rateBase === 'assigned' ? 'đơn được chia' : 'đơn lên'}`}
                    progress={den ? { value: closeRateTop(cur, ms.rateBase), max: den } : undefined}
                    onClick={() => setWhy(whyRate('close', cur, 'Đội Sale', prev))} />
                );
              })() : (
                <KpiCard id="cskh-origin" icon={UserCheck} tone="green" label="Tự upsell CSKH" className={KPI_TIGHT}
                  value={vi.format(self.n)} unit="đơn" note={`${shortMoney(self.net)} · từ MKT ${vi.format(mkt.n)} đơn`}
                  chart={<OriginShare n={self.n} net={self.net} totalN={self.n + mkt.n} totalNet={self.net + mkt.net} tone="var(--t-green)" />}
                  onClick={() => setWhy({
                    title: 'Tự upsell và từ MKT', value: `${vi.format(self.n)} đơn tự upsell`, scope,
                    rows: [
                      { label: 'Tự upsell (không có Marketer)', value: `${vi.format(self.n)} đơn · ${shortMoney(self.net)}` },
                      { label: 'Từ MKT (có Marketer)', value: `${vi.format(mkt.n)} đơn · ${shortMoney(mkt.net)}` },
                      { label: 'Cộng', value: `${vi.format(self.n + mkt.n)} đơn · ${shortMoney(self.net + mkt.net)}`, strong: true },
                    ],
                    definition: 'Đơn chốt trong kỳ và phạm vi đang chọn, tách theo đơn có hay không có Marketer; doanh thu từ cùng các đơn đó.',
                    more: <button type="button" className="btn sm self-start" onClick={() => { setWhy(null); onNavigate('origin'); }}>Mở trang Nguồn đơn<ArrowRight size={13} /></button>,
                  })} />
              )}
              <KpiCard icon={ICON.cancelled} tone="red" label={`Hủy ${name}`} className={`${KPI_TIGHT} ${overCancel(cancelRate(cur)) ? red : ''}`}
                value={pct(cancelRate(cur))} invert
                delta={(() => { const a = cancelRate(cur), b = prev ? cancelRate(prev) : null; return a != null && b != null ? a - b : undefined; })()} deltaLabel="điểm so kỳ trước"
                chart={spark(dayRows.map((d) => d.cancel), dayRows.map((d) => d.prevCancel), overCancel)}
                note={`÷ đơn lên · ${vi.format(cur.groups.cancelled.orders)} đơn · ${shortMoney(cur.groups.cancelled.net)}`}
                onClick={() => setWhy(whyRate('cancel', cur, `Đội ${name}`, prev))} />
              <KpiCard icon={ICON.returned} tone="orange" label={`Hoàn ${name}`} className={`${KPI_TIGHT} ${overRet(returnRate(cur)) ? red : ''}`}
                value={pct(returnRate(cur))} invert
                delta={(() => { const a = returnRate(cur), b = prev ? returnRate(prev) : null; return a != null && b != null ? a - b : undefined; })()} deltaLabel="điểm so kỳ trước"
                chart={spark(dayRows.map((d) => d.ret), dayRows.map((d) => d.prevRet), overRet)}
                note={`${RETURN_BASES[ms.returnBase].short} · ${vi.format(cur.groups.returned.orders)} đơn`}
                onClick={() => setWhy(whyRate('ret', cur, `Đội ${name}`, prev))} />
            </div>

            {/* 4. Biểu đồ theo ngày: cột đậm kỳ này, cột / nét xám kỳ trước, cột đỏ khi vượt mốc. */}
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <ChartCard icon={Wallet} title={`Doanh thu ${name} theo ngày`} subtitle={`${periodLabel} · đậm: kỳ này, xám: kỳ trước cùng thứ tự ngày · triệu ₫`}>
                {dayRows.length ? (
                  <ChartContainer className="h-64 w-full aspect-auto" config={{ netM: { label: 'Kỳ này', color: 'var(--primary)' }, prevM: { label: 'Kỳ trước', color: 'var(--ink-4)' } }}>
                    <ComposedChart data={dayRows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} width={44} />
                      <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      {report.compare && <Bar dataKey="prevM" fill="var(--color-prevM)" fillOpacity={0.45} radius={barRadius([4, 4, 0, 0])} maxBarSize={20} />}
                      <Bar dataKey="netM" fill="var(--color-netM)" radius={barRadius([4, 4, 0, 0])} maxBarSize={20} />
                    </ComposedChart>
                  </ChartContainer>
                ) : <EmptyState text="Chưa có đơn chốt trong kỳ." />}
              </ChartCard>
              <ChartCard icon={Percent} title={rateChart.title} subtitle={rateChart.note}>
                {dayRows.length ? (
                  <ChartContainer className="h-64 w-full aspect-auto" config={{ rate: { label: 'Kỳ này (%)', color: 'var(--primary)' }, prevRate: { label: 'Kỳ trước (%)', color: 'var(--ink-4)' } }}>
                    <ComposedChart data={dayRows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} width={36} unit="%" />
                      <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <ReferenceLine y={rateChart.mark} stroke="var(--bad)" strokeDasharray="4 4" ifOverflow="extendDomain" />
                      <Bar dataKey="rate" fill="var(--color-rate)" radius={barRadius([4, 4, 0, 0])} maxBarSize={20}>
                        {dayRows.map((d) => <Cell key={d.day} fill={rateChart.over(d.rate) ? 'var(--bad)' : 'var(--color-rate)'} />)}
                      </Bar>
                      {report.compare && <Line dataKey="prevRate" type="monotone" stroke="var(--color-prevRate)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />}
                    </ComposedChart>
                  </ChartContainer>
                ) : <EmptyState text="Chưa có đơn trong kỳ." />}
              </ChartCard>
            </div>

            {/* 5. Một bảng chính: từng nhân viên (đang lọc team MKT thì bảng gộp không chạy, dùng bảng Theo nhân viên như bố cục cũ). */}
            {mktLens ? lensStaffCard(cur, report) : team === 'sale' ? saleStaffBlock(cur, report) : cskhStaffBlock(cur, report)}

            {/* Khối phụ: thu gọn, bấm mới mở (khối đóng không tải số). */}
            <div className="grid min-w-0 gap-3">
              {posCard(cur, report, { storageKey: k('pos'), summary: `${vi.format(report.current.byPos.length)} POS` })}
              {team === 'sale' && !mktLens && (
                <FoldBlock icon={Layers} title="Đơn chốt theo nhóm sản phẩm" storageKey={k('segment')}><SaleSegmentBlock q={q.toString()} periodLabel={periodLabel} /></FoldBlock>
              )}
              {team === 'cskh' && !mktLens && callsCard({ storageKey: k('calls'), summary: calls ? `${vi.format(calls.notes)} cuộc gọi · ${vi.format(calls.customers)} khách` : undefined })}
              {team === 'cskh' && !mktLens && (
                <FoldBlock icon={UsersRound} title="Khách bắt nguồn từ đâu" storageKey={k('origin')}>
                  <LazyBlock className="h-72"><CskhOriginBlock start={start} end={end} posIds={posIds} focusId={focusId} /></LazyBlock>
                </FoldBlock>
              )}
              {kpi && team === 'cskh' && !mktLens && (
                <FoldBlock icon={Target} title="Tiến độ KPI tháng" storageKey={k('kpi')}>
                  <LazyBlock><TeamKpiProgress team="cskh" focusId={focusId} onOpen={() => onNavigate('cskh-kpi')} /></LazyBlock>
                </FoldBlock>
              )}
              <FoldBlock icon={ICON.orders} title="Đơn lên trong kỳ và đơn theo thẻ đơn" summary={`${vi.format(cur.orders)} đơn lên`} storageKey={k('orders')}>{extraTiles(cur, report)}</FoldBlock>
              {!focusId && !mktLens && (
                <FoldBlock icon={TrendingUp} title="Xu hướng" storageKey={k('trend')}><TrendNotes depts={[team]} team={team} /></FoldBlock>
              )}
              {!focusId && (
                <FoldBlock icon={Lightbulb} title="Gợi ý" storageKey={k('advisor')}><AdvisorPanel dept={team} /></FoldBlock>
              )}
              {!focusId && !mktLens && (
                <FoldBlock icon={BookOpen} title="Số tham chiếu Pancake · cả cửa hàng" storageKey={k('pancake')}>
                  <LazyBlock><PancakeReference posIds={posIds} start={start} end={end} title="Số tham chiếu Pancake · cả cửa hàng"
                    note={`Toàn bộ đơn của POS đang chọn (mọi bộ phận), như màn Thống kê Pancake · % so kỳ trước`} /></LazyBlock>
                </FoldBlock>
              )}
            </div>
          </>
        )}
        <WhySheet spec={why} onClose={() => setWhy(null)} />
      </div>
    );
  }

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
      {segment && (
        <output className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/40 bg-tint px-3 py-2 text-[13px] text-ink">
          <span>Đang lọc nhóm đơn <b>{PRODUCT_SEGMENTS[segment]}</b> như ở Tổng quan POS: ô số, biểu đồ và bảng nhân viên tính theo nhóm này; các khối khác vẫn tính mọi nhóm.</span>
          <button type="button" className="link" onClick={() => setSegment(null)}>Bỏ lọc nhóm</button>
        </output>
      )}
      {team === 'cskh' && <CskhFocusBar />}
      {api.error && !report && (
        <ErrorBox error={api.error} onRetry={api.reload} />
      )}
      {!cur && !api.error && (
        <>
          <SkeletonKpis count={6} className="lg:grid-cols-3 2xl:grid-cols-6" />
          <ChartCard title="Theo ngày" subtitle="Đang tải…">
            <SkeletonTable rows={5} cols={5} />
          </ChartCard>
        </>
      )}
      {cur && report && (
        <>
          <div
            className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6 transition-opacity"
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
            {/* CSKH không xem tỷ lệ chốt (anh Vũ 31/10/2026). */}
            {team === 'sale' && (() => {
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
          {team === 'sale' && !mktLens && <SaleSegmentBlock q={q.toString()} periodLabel={periodLabel} />}
          {extraTiles(cur, report)}
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
            callsCard()
          )}

          {team === 'sale' && !mktLens && (
            saleStaffBlock(cur, report)
          )}
          {team === 'cskh' && !mktLens && (
            cskhStaffBlock(cur, report)
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
                    radius={barRadius([4, 4, 0, 0])}
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

          {posCard(cur, report)}

          {/* Bảng gộp ở trên đã gồm các cột này (27/11/2026); chỉ hiện khi đang lọc team MKT (bảng gộp không chạy với lens). */}
          {mktLens && (
            lensStaffCard(cur, report)
          )}
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
