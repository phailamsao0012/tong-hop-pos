'use client';

// Điều khiển trung tâm: gom chỉ số quan trọng của mọi trang con; mỗi khối có "Xem chi tiết" sang trang tương ứng.
// Hai kiểu hiển thị: cuộn dọc (mặc định) và màn hình TV (lớp phủ toàn màn hình, vừa khít một màn hình, không cuộn; Esc để thoát).
// Tải dữ liệu: 8 request song song, mỗi khối một useApi (số "lần cuối" của khối hiện ngay từ trình duyệt, máy chủ trả số mới thì thay;
// đổi kỳ / POS / nhóm huỷ request cũ nên số liệu kỳ trước không đè lên kỳ mới); khối nào lỗi thì giữ số cũ và báo riêng trong khối đó thay vì xoá cả trang.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, ArrowRight, BarChart3, CheckCircle2, ClipboardList, Coins, Database, Flame, Monitor, PackageCheck, Repeat, RotateCw, ShoppingCart, Target, Truck, UserX, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from '@/components/ui/chart';
import { POS } from '@/lib/report-model';
import { addDays, comparePeriod, todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange, type OverviewReport } from './overview-view';
import { fetchTargets, type TargetItem } from './targets-panel';
import { useMediaQuery } from './use-media';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { TEAM_LABELS, useTeam } from './team-store';
import {
  ChartCard, ContextLine, DeltaPill, Donut, ErrorBox, HoverReveal, KpiCard, PageHeader, ProgressBar, STATUS_LABELS, STATUS_VARS, SkeletonKpis, StatusChip, TeamSwitch,
  delta, dmy, dt, money, pct, posName, posVar, short, shortMoney, timeOnly, toast, useMotionOK, vi, type TipRows, type Tone,
} from './ui-kit';

type Metrics = OverviewReport['current']['total'];
type Employee = OverviewReport['current']['byEmployee'][number];
type Shift = { shift: string; hours: { start: number; end: number }; syncedAt: string | null; total: { received: number; closed: number; hotOrders: number; hotValue: number; rate: number | null }; yesterday: { received: number; closed: number; rate: number | null }; alerts: { level: 'high' | 'medium'; title: string; detail: string }[]; staff: { name: string; received: number; closed: number; rate: number | null }[] };
type Pipeline = { total: Record<'closed' | 'processing' | 'shipping' | 'delivered' | 'returned' | 'cancelled' | 'shipped', { orders: number; net: number; gross: number }> };
type Bucket = '30-45' | '46-60' | '61-90' | '90+';
type Customers = {
  groups: ({ never: number; active: number; total: number } & Record<Bucket, number>) | null;
  groupNets?: Record<Bucket, number> | null;
  segments?: { vip: number; loyal: number; active: number; new: number; risk: number; potential: number; dormant: number; never: number; buyers: number; ltvTotal: number };
};
type Repurchase = { funnel: { once: number; twice: number; thrice: number }; summary: { repurchase: { customers: number; orders: number; net: number }; successOrders: number } };
type Batches = { batches: { received: number; buyers: number; repeatBuyers: number; net: number; sellerId: string }[] };
type SyncRow = { posId: string; lastSyncAt: string | null; lastError: string | null; backfillCursor: { month: string; completed?: boolean } | null };
type Block = 'overview' | 'trend' | 'shift' | 'pipeline' | 'customers' | 'repurchase' | 'batches' | 'sync' | 'targets';
type TrendRow = { day: string; closedOrders: number; closedNet: number; orders: number; closedM: number };
type KpiDef = {
  key: string; icon: LucideIcon; tone: Tone; label: string; value: string; raw?: number; format?: (n: number) => string; unit?: string;
  delta?: number | null; deltaLabel?: string; note?: string; tip?: TipRows; progress?: { value: number; max: number }; view: string; tv?: boolean;
};

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const SHIFT_LABELS: Record<string, string> = { morning: 'Ca sáng', afternoon: 'Ca chiều', evening: 'Ca tối', day: 'Cả ngày' };
const BLOCK_LABELS: Record<Block, string> = { overview: 'Tổng quan kỳ', trend: 'Xu hướng 30 ngày', shift: 'Ca hiện tại', pipeline: 'Vận hành đơn', customers: 'Khách hàng', repurchase: 'Mua lại', batches: 'Data được cấp', sync: 'Đồng bộ POS', targets: 'Mục tiêu tháng' };
const STATUS_KEYS = Object.keys(STATUS_LABELS) as (keyof Metrics['groups'])[];
const DORMANT_BUCKETS: { k: Bucket; label: string; fill: string }[] = [
  { k: '30-45', label: '30–45 ngày', fill: 'var(--primary)' }, { k: '46-60', label: '46–60 ngày', fill: 'var(--primary)' },
  { k: '61-90', label: '61–90 ngày', fill: 'var(--warn)' }, { k: '90+', label: 'Trên 90 ngày', fill: 'var(--bad)' },
];
/** Tiền rút gọn kèm một ký hiệu duy nhất "₫" (khoảng trắng không ngắt) — thống nhất với money(). */
const fmtInt = (n: number) => vi.format(Math.round(n));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1).replace('.', ',')}`;
/** Dòng "Chênh lệch" trong tooltip KPI: "+963 · +3,8%". */
const diffText = (a: number, b: number | null | undefined, fmt: (n: number) => string) => {
  if (b === null || b === undefined) return undefined;
  const d = delta(a, b);
  const abs = `${a - b >= 0 ? '+' : '−'}${fmt(Math.abs(a - b))}`;
  return d === null ? abs : d === Infinity ? `${abs} · mới` : `${abs} · ${signed(d)}%`;
};
/** Dòng bấm được (nút chiếm cả dòng trong <li>): sáng lên khi rê chuột / focus, mở dòng phụ .ctx. */
const ROW_CLS = 'ctx-row grid w-full items-center gap-x-2.5 rounded-lg px-2 text-left text-[12.5px] text-ink outline-none transition-[background] duration-[var(--dur)] ease-[var(--ease)] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]';

/** Liên kết "Xem chi tiết" sang trang con — component cấp module để không bị gỡ / gắn lại mỗi lần trang cập nhật (mất focus). */
function Link({ view, label = 'Xem chi tiết', onNavigate }: { view: string; label?: string; onNavigate: (view: string) => void }) {
  return (
    <button type="button" onClick={() => onNavigate(view)} className="link group/lnk inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] px-1 py-0.5 text-xs font-medium hover:bg-tint-2">
      {label}<ArrowRight size={12} className="transition-transform duration-[var(--dur)] ease-[var(--ease)] group-hover/lnk:-translate-y-px group-hover/lnk:translate-x-px" />
    </button>
  );
}

/** Ghi chú lỗi của một khối: còn số cũ → cảnh báo vàng "số liệu cũ"; chưa có số → hộp đỏ, đều kèm "Thử lại". */
function BlockNote({ error, hasData, onRetry }: { error?: string; hasData: boolean; onRetry: () => void }) {
  if (!error) return null;
  return (
    <p className={`notice ${hasData ? 'warn' : 'error'} mb-2 items-center py-1.5 text-[11.5px]`} role={hasData ? undefined : 'alert'}>
      <span className="min-w-0 flex-1">{hasData ? 'Số liệu cũ · lần làm mới gần nhất không tải được' : 'Không tải được khối này'} ({error}).</span>
      <button type="button" className="btn sm ml-auto shrink-0" onClick={onRetry}><RotateCw size={12} />Thử lại</button>
    </p>
  );
}

/** Tooltip biểu đồ xu hướng: ngày, hai giá trị và dòng "so hôm trước". Recharts truyền active / payload / label vào phần tử này. */
function TrendTip({ active, payload, label, rows }: { active?: boolean; payload?: ReadonlyArray<unknown>; label?: string | number; rows: TrendRow[] }) {
  if (!active || !payload?.length || label === undefined) return null;
  const i = rows.findIndex((r) => r.day === String(label));
  const row = rows[i], before = i > 0 ? rows[i - 1] : undefined;
  if (!row) return null;
  return (
    <div className="grid min-w-[180px] gap-1 rounded-[7px] border border-line-2 bg-surface px-2.5 py-2 text-[11.5px] text-ink shadow-float">
      <div className="num text-[11px] font-medium text-ink-3">{dmy(row.day)}/{row.day.slice(0, 4)}</div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--primary)' }} />Doanh thu</span><span className="num text-[12.5px]">{shortMoney(row.closedNet)}</span></div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--st-confirmed)' }} />Đơn chốt</span><span className="num text-[12.5px]">{vi.format(row.closedOrders)}</span></div>
      {before && (
        <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-dashed border-line-2 pt-1 text-ink-3">
          <span>so hôm trước ({dmy(before.day)})</span>
          <span className="flex items-center gap-2"><DeltaPill value={delta(row.closedNet, before.closedNet)} variant="plain" /><DeltaPill value={delta(row.closedOrders, before.closedOrders)} variant="plain" /></span>
        </div>
      )}
    </div>
  );
}

/** Bảng nhân viên (Top / Cần hỗ trợ): dòng sáng lên khi rê chuột / focus, lộ thanh tiến độ chốt / chia; tên là nút mở So sánh nhân viên. */
function EmpTable({ rows, tone, compact = false, onNavigate }: { rows: Employee[]; tone: 'green' | 'red'; compact?: boolean; onNavigate: (view: string) => void }) {
  if (!rows.length) return <p className="empty px-2 py-4 text-[11.5px]">Chưa đủ dữ liệu (cần ≥ 10 đơn chia).</p>;
  return (
    <table className={`tbl w-full ${compact ? 'table-fixed [&_td]:px-1.5 [&_td]:py-1 [&_th]:px-1.5 [&_th]:py-1' : ''}`}>
      <thead><tr><th className="w-6">#</th><th>Nhân viên</th><th className={`n ${compact ? 'w-16' : ''}`}>Tỷ lệ</th>{!compact && <th className="n">Chốt / chia</th>}</tr></thead>
      <tbody>
        {rows.map((e, i) => (
          <tr key={e.sellerId}>
            <td className="num text-ink-3">{i + 1}</td>
            <td className="min-w-28 max-w-0">
              <button type="button" onClick={() => onNavigate('compare')} title={`${e.name} · mở So sánh nhân viên`} className="block w-full truncate rounded-[4px] text-left font-medium text-ink outline-none transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:text-primary focus-visible:shadow-[0_0_0_2px_var(--ring)]">{e.name}</button>
              {!compact && e.department && <span className="block truncate text-[10.5px] text-ink-3" title={e.department}>{e.department}</span>}
            </td>
            <td className={`n ${tone === 'green' ? 'text-good' : 'text-bad'}`} title={compact ? `${vi.format(e.closedOrders)} / ${vi.format(e.assignedOrders)} đơn` : undefined}>{pct(e.assignedCloseRate)}</td>
            {!compact && (
              <td className="n">
                <span className="inline-flex items-center justify-end gap-2">
                  <HoverReveal from="left"><ProgressBar value={e.closedOrders} max={e.assignedOrders} size="sm" width={56} low={tone === 'red'} /></HoverReveal>
                  <span className="text-ink-2">{vi.format(e.closedOrders)}<span className="font-normal text-ink-3">/{vi.format(e.assignedOrders)}</span></span>
                </span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ô trong lưới TV: thẻ trắng, tiêu đề một dòng, thân cắt gọn (không bao giờ tràn sang ô kế). */
function TvCell({ title, className = '', children }: { title: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`card flex min-h-0 flex-col overflow-hidden p-3 ${className}`}>
      <h3 className="mb-1.5 flex shrink-0 items-center gap-1 truncate text-[13px] font-semibold leading-tight text-ink">{title}</h3>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

export function CenterView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const today = todayVn();
  const team = useTeam();
  const motionOn = useMotionOK();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [tvWanted, setTv] = useState(false);
  const desktop = useMediaQuery('(min-width: 1280px)');
  const tv = tvWanted && desktop;
  const [targets, setTargets] = useState<Record<string, TargetItem>>({});
  const [openSync, setOpenSync] = useState<string | null>(null); // POS đang mở dòng chi tiết đồng bộ (bàn phím / chạm)
  const [targetsTick, setTargetsTick] = useState(0); // "Tải lại" cũng lấy lại mục tiêu tháng

  // URL từng khối theo bộ lọc hiện tại; useApi hiện số lưu của URL đó ngay rồi tải lại; tự làm mới 5 phút khi tab đang mở.
  const q = useMemo(() => { const base = { posIds: posIds.join(','), team }; return (extra: Record<string, string>) => new URLSearchParams({ ...base, ...extra }).toString(); }, [posIds, team]);
  const REFRESH = 5 * 60000;
  const overviewApi = useApi<OverviewReport>(useMemo(() => `/api/reports/overview?${q({ start, end, groupBy: 'day', compare: 'previous' })}`, [q, start, end]), { refreshMs: REFRESH });
  const trendApi = useApi<OverviewReport>(useMemo(() => `/api/reports/overview?${q({ start: addDays(today, -29), end: today, groupBy: 'day', compare: 'none' })}`, [q, today]), { refreshMs: REFRESH });
  const shiftApi = useApi<Shift>(useMemo(() => `/api/reports/shift?${q({ date: today, shift: 'auto' })}`, [q, today]), { refreshMs: REFRESH });
  const pipelineApi = useApi<Pipeline>(useMemo(() => `/api/reports/pipeline?${q({ start, end, basis: 'confirmed' })}`, [q, start, end]), { refreshMs: REFRESH });
  const customersApi = useApi<Customers>(useMemo(() => `/api/reports/customers?${q({ group: 'all', page: '1', sort: 'spend' })}`, [q]), { refreshMs: REFRESH });
  const repurchaseApi = useApi<Repurchase>(useMemo(() => `/api/reports/repurchase?${q({ start, end })}`, [q, start, end]), { refreshMs: REFRESH });
  const batchesApi = useApi<Batches>(useMemo(() => `/api/reports/batches?${q({ start, end })}`, [q, start, end]), { refreshMs: REFRESH });
  const syncApi = useApi<SyncRow[]>('/api/sync/pos', { refreshMs: REFRESH });
  const targetMonth = end.slice(0, 7);
  useEffect(() => { void fetchTargets(targetMonth).then(setTargets); }, [targetMonth, targetsTick]);
  const report = overviewApi.data, trend = trendApi.data, shift = shiftApi.data, pipeline = pipelineApi.data, customers = customersApi.data, repurchase = repurchaseApi.data, batches = batchesApi.data;
  const sync = syncApi.data ?? [];
  const apis = [overviewApi, trendApi, shiftApi, pipelineApi, customersApi, repurchaseApi, batchesApi, syncApi];
  const loading = apis.some((x) => x.loading);
  const errors: Partial<Record<Block, string>> = {};
  const errOf = (k: Block, x: { error: string | null }) => { if (x.error) errors[k] = x.error; };
  errOf('overview', overviewApi); errOf('trend', trendApi); errOf('shift', shiftApi); errOf('pipeline', pipelineApi); errOf('customers', customersApi); errOf('repurchase', repurchaseApi); errOf('batches', batchesApi); errOf('sync', syncApi);
  const updatedAt = overviewApi.at; // thời điểm lấy số tổng quan đang hiện
  const stale = overviewApi.stale || (!!overviewApi.error && !!report); // đang hiện số lưu / số cũ vì lần làm mới gần nhất lỗi
  const loadedAt = syncApi.at ? Date.parse(syncApi.at) : 0; // mốc lấy trạng thái đồng bộ, dùng làm "bây giờ" khi tính đồng bộ cũ
  // Màn hình TV: Esc để thoát, khoá cuộn trang phía sau lớp phủ.
  useEffect(() => {
    if (!tv) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTv(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [tv]);
  // "Tải lại": tải lại mọi khối, xong thì báo toast (đủ / thiếu khối) như trước.
  const manualRef = useRef(false);
  const reload = () => { manualRef.current = true; setTargetsTick((t) => t + 1); for (const x of apis) x.reload(); };
  const failedCount = Object.keys(errors).length;
  useEffect(() => {
    if (loading || !manualRef.current) return;
    manualRef.current = false;
    if (failedCount) toast(`Cập nhật chưa đầy đủ: ${failedCount} khối không tải được`, { kind: 'error' });
    else toast(`Đã cập nhật số liệu từ ${posIds.length} POS`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const cur = report?.current.total, prev = report?.compare?.total;
  const cmp = report?.comparePeriod ?? comparePeriod(start, end, 'previous');
  const cmpLabel = `${dmy(cmp.start)}–${dmy(cmp.end)}`;
  const defs = report?.definitions ?? {};
  const series = trend?.current.series;
  const trendRows = useMemo<TrendRow[]>(() => {
    if (!series) return [];
    const map = new Map<string, { day: string; closedOrders: number; closedNet: number; orders: number }>();
    for (const s of series) { const row = map.get(s.bucket) ?? { day: s.bucket, closedOrders: 0, closedNet: 0, orders: 0 }; row.closedOrders += s.closedOrders; row.closedNet += s.closedNet; row.orders += s.orders; map.set(s.bucket, row); }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ ...r, closedM: Math.round(r.closedNet / 1e4) / 100 }));
  }, [series]);
  const byPos = report?.current.byPos, cmpByPos = report?.compare?.byPos, byEmployee = report?.current.byEmployee;
  const posRows = useMemo(() => (byPos ? posIds.map((id) => ({ id, row: byPos.find((r) => r.posId === id), prev: cmpByPos?.find((r) => r.posId === id) })).filter((x) => x.row).sort((a, b) => b.row!.closedNet - a.row!.closedNet) : []), [byPos, cmpByPos, posIds]);
  const posTotal = posRows.reduce((a, x) => a + x.row!.closedNet, 0);
  // Xếp hạng chỉ xét Sale/CSKH (bỏ quản trị, MKT, trực page).
  const employees = useMemo(() => (byEmployee ?? []).filter((e) => e.sellerId && e.assignedOrders >= 10 && (!e.department || /sale|bán hàng|cskh|chăm sóc/i.test(e.department))), [byEmployee]);
  const topEmp = [...employees].sort((a, b) => (b.assignedCloseRate ?? -1) - (a.assignedCloseRate ?? -1)).slice(0, 5);
  const lowEmp = [...employees].sort((a, b) => (a.assignedCloseRate ?? 999) - (b.assignedCloseRate ?? 999)).slice(0, 5);
  const goal = posIds.reduce((a, id) => a + (targets[`pos:${id}`]?.revenue ?? 0), 0);
  const goalPct = cur && goal ? cur.closedNet / goal * 100 : null;
  const bt = (batches?.batches ?? []).reduce((a, x) => ({ received: a.received + x.received, buyers: a.buyers + x.buyers, net: a.net + x.net }), { received: 0, buyers: 0, net: 0 });
  const seg = customers?.segments, g = customers?.groups;
  const buyers = g ? g.total - g.never : 0;
  const syncBad = sync.filter((s) => posIds.includes(s.posId) && (s.lastError || !s.lastSyncAt || loadedAt - Date.parse(s.lastSyncAt) > 15 * 60000));
  const alerts = shift?.alerts ?? [];
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const failed = (Object.keys(errors) as Block[]).filter((k) => errors[k]);
  const firstLoad = (has: boolean, block: Block) => !has && !errors[block];
  const tipOf = (a: number | null | undefined, b: number | null | undefined, fmt: (n: number) => string, definition?: string): TipRows => ({
    period: periodLabel, current: a === null || a === undefined ? '—' : fmt(a), previous: b === null || b === undefined ? '—' : fmt(b),
    previousLabel: `Kỳ so sánh ${cmpLabel}`, diff: a === null || a === undefined ? undefined : diffText(a, b, fmt), definition,
  });

  // Dải KPI (4 + 3); màn hình TV lấy 6 thẻ có tv: true.
  const kpis: KpiDef[] = cur ? [
    { key: 'orders', icon: ShoppingCart, tone: 'blue', label: 'Đơn tạo mới', value: vi.format(cur.orders), raw: cur.orders, format: fmtInt, delta: delta(cur.orders, prev?.orders), note: `${cur.customers === null ? '—' : vi.format(cur.customers)} khách`, tip: tipOf(cur.orders, prev?.orders, fmtInt, defs.basis), view: 'overview', tv: true },
    { key: 'closed', icon: CheckCircle2, tone: 'green', label: 'Đơn chốt', value: vi.format(cur.closedOrders), raw: cur.closedOrders, format: fmtInt, delta: delta(cur.closedOrders, prev?.closedOrders), note: `Tỷ lệ chốt/tạo ${pct(cur.closeRate)}`, tip: tipOf(cur.closedOrders, prev?.closedOrders, fmtInt, defs.closed), view: 'overview', tv: true },
    { key: 'net', icon: Coins, tone: 'teal', label: 'Doanh thu đơn chốt', value: short(cur.closedNet), raw: cur.closedNet, format: short, unit: '₫', delta: delta(cur.closedNet, prev?.closedNet), note: `GTTB ${cur.averageOrder ? shortMoney(cur.averageOrder) : '—'}`, tip: tipOf(cur.closedNet, prev?.closedNet, money, defs.revenue), view: 'overview', tv: true },
    { key: 'aov', icon: Coins, tone: 'gray', label: 'Giá trị TB đơn (AOV)', value: cur.averageOrder ? short(cur.averageOrder) : '—', raw: cur.averageOrder ?? undefined, format: short, unit: cur.averageOrder ? '₫' : undefined, delta: cur.averageOrder && prev?.averageOrder ? delta(cur.averageOrder, prev.averageOrder) : null, note: `Doanh thu ÷ đơn chốt · giao TC ${cur.deliveredAverage ? shortMoney(cur.deliveredAverage) : '—'}`, tip: tipOf(cur.averageOrder, prev?.averageOrder, money, defs.revenue), view: 'overview' },
    { key: 'delivered', icon: PackageCheck, tone: 'lime', label: 'Giao thành công', value: vi.format(cur.groups.delivered.orders), raw: cur.groups.delivered.orders, format: fmtInt, delta: delta(cur.groups.delivered.orders, prev?.groups.delivered.orders), note: `${shortMoney(cur.groups.delivered.net)} tiền hàng`, tip: tipOf(cur.groups.delivered.orders, prev?.groups.delivered.orders, fmtInt, defs.basis ? `${defs.basis} Giao thành công = mã 3, 16.` : undefined), view: 'pipeline', tv: true },
    { key: 'hot', icon: Flame, tone: 'orange', label: `Chốt nóng ${shift ? SHIFT_LABELS[shift.shift].toLowerCase() : ''} hôm nay`, value: shift ? pct(shift.total.rate) : '—', raw: shift?.total.rate ?? undefined, format: (n) => pct(n),
      delta: shift && shift.total.rate !== null && shift.yesterday.rate !== null ? shift.total.rate - shift.yesterday.rate : null, deltaLabel: 'điểm % so cùng ca hôm qua',
      note: shift ? `${vi.format(shift.total.closed)} chốt / ${vi.format(shift.total.received)} số nhận` : errors.shift ? 'Không tải được ca hiện tại' : '',
      tip: shift ? { period: `${SHIFT_LABELS[shift.shift]} ${dmy(today)}`, current: `${pct(shift.total.rate)} · ${vi.format(shift.total.closed)}/${vi.format(shift.total.received)}`, previous: `${pct(shift.yesterday.rate)} · ${vi.format(shift.yesterday.closed)}/${vi.format(shift.yesterday.received)}`, previousLabel: 'Cùng ca hôm qua', diff: shift.total.rate !== null && shift.yesterday.rate !== null ? `${signed(shift.total.rate - shift.yesterday.rate)} điểm %` : '—', definition: 'Tỷ lệ chốt nóng = đơn chốt ÷ số điện thoại nhận trong ca hôm nay (giờ ca theo cấu hình).' } : undefined, view: 'shift', tv: true },
    { key: 'goal', icon: Target, tone: 'purple', label: 'Mục tiêu tháng', value: goalPct === null ? '—' : pct(goalPct, 0), raw: goalPct ?? undefined, format: (n) => pct(n, 0),
      note: goal ? `${shortMoney(cur.closedNet)} / ${shortMoney(goal)} · còn ${shortMoney(Math.max(0, goal - cur.closedNet))}` : 'Chưa đặt mục tiêu (Cấu hình → Mục tiêu tháng)', progress: goal ? { value: cur.closedNet, max: goal } : undefined,
      tip: goal ? { period: `Tháng ${end.slice(5, 7)}/${end.slice(0, 4)}`, current: money(cur.closedNet), previous: money(goal), previousLabel: 'Mục tiêu tháng', diff: `còn ${money(Math.max(0, goal - cur.closedNet))}`, definition: 'Doanh thu đơn chốt trong kỳ ÷ tổng mục tiêu tháng của các POS đang chọn.' } : { definition: 'Đặt mục tiêu doanh thu từng POS tại Cấu hình → Mục tiêu tháng.' }, view: goal ? 'monthly' : 'config', tv: true },
  ] : [];
  const kpiCard = (k: KpiDef, className: string) => (
    <KpiCard key={k.key} className={className} icon={k.icon} tone={k.tone} label={k.label} value={k.value} unit={k.unit} countUp={k.raw !== undefined} rawValue={k.raw} format={k.format}
      delta={k.delta} deltaLabel={k.deltaLabel} note={k.note || undefined} tooltip={k.tip} progress={k.progress} onClick={() => onNavigate(k.view)} />
  );

  const trendChart = (h: string) => (
    <ChartContainer className={`${h} w-full aspect-auto cursor-crosshair touch-pan-y`} config={{ closedM: { label: 'Doanh thu đơn chốt (triệu ₫)', color: 'var(--primary)' }, closedOrders: { label: 'Đơn chốt', color: 'var(--st-confirmed)' } }}>
      <ComposedChart data={trendRows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={24} />
        <YAxis yAxisId="m" tickLine={false} axisLine={false} width={44} />
        <YAxis yAxisId="n" orientation="right" tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={<TrendTip rows={trendRows} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area yAxisId="m" type="monotone" dataKey="closedM" stroke="var(--color-closedM)" fill="var(--chart-fill)" strokeWidth={2} isAnimationActive={motionOn} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} />
        <Line yAxisId="n" type="monotone" dataKey="closedOrders" stroke="var(--color-closedOrders)" strokeWidth={2} dot={false} isAnimationActive={motionOn} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} />
      </ComposedChart>
    </ChartContainer>
  );
  const donut = (size: number, compact = false) => cur ? (
    <Donut size={size} centerValue={vi.format(cur.orders)} centerRaw={cur.orders} centerLabel="đơn tạo" onSelect={() => onNavigate('overview')}
      className={compact ? 'flex-nowrap! gap-3! [&>ul]:min-w-0 [&>ul]:text-[11px] [&>ul>li]:px-1 [&>ul>li]:py-0.5' : ''}
      slices={STATUS_KEYS.map((k) => ({ key: k, label: STATUS_LABELS[k], value: cur.groups[k].orders, color: STATUS_VARS[k] }))} />
  ) : null;
  const funnel = pipeline ? [
    { l: 'Đơn chốt', v: pipeline.total.closed.orders, p: 100 },
    { l: 'Đã xuất đi', v: pipeline.total.shipped.orders, p: pipeline.total.closed.orders ? pipeline.total.shipped.orders / pipeline.total.closed.orders * 100 : 0 },
    { l: 'Đã nhận', v: pipeline.total.delivered.orders, p: pipeline.total.closed.orders ? pipeline.total.delivered.orders / pipeline.total.closed.orders * 100 : 0 },
  ] : [];
  const funnelBlock = (compact: boolean) => (
    <>
      {funnel.map((f) => (
        <div key={f.l} className={compact ? 'mb-2' : 'mb-3'}>
          <div className="flex items-center justify-between gap-2 text-[12.5px]"><span className="text-ink-2">{f.l}</span><span className="num text-ink">{vi.format(f.v)} <span className="text-[11px] text-ink-3">· {pct(f.p, 0)}</span></span></div>
          <span className="pbar mt-1 block h-1.5 w-full"><i style={{ width: `${f.p}%` }} /></span>
        </div>
      ))}
      {pipeline && (compact
        ? <p className="text-[11px] text-ink-3">Hoàn <b className="num text-ink">{vi.format(pipeline.total.returned.orders)}</b> · hủy <b className="num text-ink">{vi.format(pipeline.total.cancelled.orders)}</b> · đang giao <b className="num text-ink">{vi.format(pipeline.total.shipping.orders)}</b></p>
        : <div className="flex flex-wrap gap-1.5"><StatusChip tone="orange">Đang giao <span className="num">{vi.format(pipeline.total.shipping.orders)}</span></StatusChip><StatusChip tone="purple">Hoàn <span className="num">{vi.format(pipeline.total.returned.orders)}</span></StatusChip><StatusChip tone="red">Hủy <span className="num">{vi.format(pipeline.total.cancelled.orders)}</span></StatusChip><StatusChip tone="gray">Chưa xuất <span className="num">{vi.format(pipeline.total.processing.orders)}</span></StatusChip></div>)}
    </>
  );
  // Xếp hạng POS: rê chuột / focus mở dòng phụ "chốt · tỷ trọng · AOV · kỳ trước".
  const posBars = (compact: boolean) => (
    <ol className="m-0 list-none p-0">
      {posRows.map(({ id, row, prev: p }, i) => {
        const max = posRows[0]?.row?.closedNet || 1;
        const goalPos = targets[`pos:${id}`]?.revenue ?? 0;
        const goalDone = goalPos ? row!.closedNet / goalPos * 100 : null;
        const go = () => onNavigate('overview');
        return (
          <li key={id}>
            <button type="button" aria-label={`${i + 1}. ${posName(id)} · ${shortMoney(row!.closedNet)} · mở Tổng quan POS`} onClick={go}
              className={`${ROW_CLS} group grid-cols-[18px_minmax(0,1fr)_auto] ${compact ? 'py-[3px]' : 'py-2'}`}>
            <span className="num text-[11px] text-ink-3">{i + 1}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2"><span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: posVar(id) }} /><span className="truncate font-medium text-ink">{posName(id)}</span>{goalDone !== null && !compact && <StatusChip tone={goalDone >= 100 ? 'green' : goalDone >= 60 ? 'lime' : 'orange'} className="shrink-0">mục tiêu <span className="num">{pct(goalDone, 0)}</span></StatusChip>}</span>
              <span className={`pbar block w-full ${compact ? 'mt-1 h-1' : 'mt-1.5 h-[5px]'}`}><i className="[transition:filter_var(--dur)_var(--ease),width_.9s_var(--ease)] group-hover:brightness-[1.12]" style={{ width: `${row!.closedNet / max * 100}%`, background: posVar(id) }} /></span>
            </span>
            <span className="text-right"><span className="num block text-ink">{shortMoney(row!.closedNet)}</span><span className="block text-[11.5px] leading-tight text-ink-2"><DeltaPill value={delta(row!.closedNet, p?.closedNet)} variant="plain" /></span></span>
            <ContextLine className="col-span-full" indent={28}>{vi.format(row!.closedOrders)} chốt · tỷ trọng {pct(posTotal ? row!.closedNet / posTotal * 100 : null, 0)} · AOV {row!.averageOrder ? shortMoney(row!.averageOrder) : '—'} · kỳ trước {p ? shortMoney(p.closedNet) : '—'}{goalDone !== null && compact ? ` · mục tiêu ${pct(goalDone, 0)}` : ''}</ContextLine>
            </button>
          </li>
        );
      })}
    </ol>
  );
  // Đồng bộ từng POS: chấm màu POS, giờ đồng bộ; dòng phụ nêu lý do lỗi / tiến độ lấy lịch sử.
  const syncRow = (p: { id: string; name: string }) => {
    const s = sync.find((x) => x.posId === p.id);
    const bad = syncBad.some((x) => x.posId === p.id);
    const open = openSync === p.id;
    const why = !s ? 'chưa có thông tin đồng bộ' : s.lastError ? `lỗi: ${s.lastError}` : !s.lastSyncAt ? 'chưa đồng bộ lần nào' : bad ? `đồng bộ cũ ${Math.round((loadedAt - Date.parse(s.lastSyncAt)) / 60000)} phút` : `đồng bộ ${dt(s.lastSyncAt, true)}`;
    const backfill = s?.backfillCursor && !s.backfillCursor.completed ? s.backfillCursor.month : null;
    return (
      <li key={p.id}>
        <button type="button" aria-expanded={open} aria-label={`${p.name}: ${why}`} onClick={() => setOpenSync(open ? null : p.id)} className={`${ROW_CLS} grid-cols-[minmax(0,1fr)_auto] py-1 text-xs`}>
          <span className="flex min-w-0 items-center gap-1.5"><span className="inline-block size-2 shrink-0 rounded-full" style={{ background: posVar(p.id) }} /><span className="truncate">{p.name}</span></span>
          <span className={`num flex items-center gap-1 ${bad ? 'text-bad' : 'text-good'}`}>{bad ? <WifiOff size={12} /> : <Wifi size={12} />}{timeOnly(s?.lastSyncAt)}{backfill && <span className="font-normal tracking-normal text-ink-3"> · lịch sử…</span>}</span>
          <ContextLine className="col-span-full" open={open} indent={14}>{why}{backfill ? ` · đang lấy lịch sử tháng ${backfill}` : ''}</ContextLine>
        </button>
      </li>
    );
  };
  const syncList = <ul className="m-0 list-none p-0">{POS.filter((p) => posIds.includes(p.id)).map(syncRow)}</ul>;
  const alertItem = (a: Shift['alerts'][number], i: number, compact: boolean) => {
    const go = () => onNavigate('shift');
    return (
      <li key={i}>
        <button type="button" onClick={go} title="Mở Điều hành trong ca"
          className={`reveal-row flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs outline-none transition-[background,border-color] duration-[var(--dur)] ease-[var(--ease)] focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] ${a.level === 'high' ? 'border-bad/25 bg-bad-bg text-bad hover:border-bad/60' : 'border-warn/25 bg-warn-bg text-warn hover:border-warn/60'}`}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className={`min-w-0 flex-1 ${compact ? 'truncate' : ''}`} title={compact ? `${a.title}: ${a.detail}` : undefined}><strong>{a.title}:</strong> {a.detail}</span>
          {!compact && <HoverReveal className="shrink-0"><ArrowRight size={12} /></HoverReveal>}
        </button>
      </li>
    );
  };
  const topError = failed.length > 0 ? <ErrorBox error={`${failed.map((k) => BLOCK_LABELS[k]).join(', ')}${stale ? ' · đang hiện số liệu cũ' : ''}`} onRetry={reload} /> : null;

  if (tv && typeof document !== 'undefined') {
    return createPortal(
      <section className="fixed inset-0 z-30 flex flex-col gap-3 overflow-hidden bg-canvas p-3 text-ink" aria-label="Màn hình TV · Điều khiển trung tâm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="display flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold leading-none tracking-[-.025em] text-ink">Điều khiển trung tâm <span className="num text-base text-ink-2">{periodLabel}</span></h1>
            <p className="mt-1 text-xs text-ink-3">Cập nhật <span className="num text-ink">{updatedAt ? timeOnly(updatedAt) : '…'}</span>{stale ? ' · số liệu cũ' : ''} · nhóm {TEAM_LABELS[team]} · {posIds.length === POS.length ? 'tất cả POS' : posIds.map(posName).join(', ')}</p>
          </div>
          <div className="flex items-center gap-2">
            <StaleChip stale={overviewApi.stale} at={overviewApi.at} loading={overviewApi.loading} error={report ? overviewApi.error : null} onRetry={reload} />
            <TeamSwitch size="sm" />
            <button type="button" className={`btn ${loading ? 'is-busy' : ''}`} onClick={reload} disabled={loading} aria-label="Tải lại số liệu"><RotateCw size={13} />{loading ? 'Đang tải…' : 'Tải lại'}</button>
            <button type="button" className="btn" onClick={() => setTv(false)}><X size={14} />Thoát TV <kbd className="num rounded border border-line-2 px-1 text-[10px] text-ink-3">Esc</kbd></button>
          </div>
        </div>
        {topError}
        <div className="grid min-h-0 flex-1 grid-cols-12 gap-3" style={{ gridAutoRows: 'minmax(0, 1fr)' }}>
          {cur ? kpis.filter((k) => k.tv).map((k) => kpiCard(k, 'col-span-2 row-span-3 min-h-0 gap-1 overflow-hidden p-3'))
            : <div className="is-loading col-span-12 row-span-3 grid min-h-0 grid-cols-6 gap-3" aria-busy="true" aria-label="Đang tải số liệu">{Array.from({ length: 6 }, (_, i) => <div key={i} className="kpi min-h-0" />)}</div>}
          <TvCell className="col-span-6 row-span-4" title="Xu hướng 30 ngày · đơn chốt và doanh thu"><BlockNote error={errors.trend} hasData={!!trend} onRetry={reload} />{trendChart('h-full')}</TvCell>
          <TvCell className="col-span-3 row-span-4" title="Trạng thái đơn"><BlockNote error={errors.overview} hasData={!!cur} onRetry={reload} />{donut(116, true)}</TvCell>
          <TvCell className="col-span-3 row-span-4" title="Vận hành đơn"><BlockNote error={errors.pipeline} hasData={!!pipeline} onRetry={reload} />{funnelBlock(true)}</TvCell>
          <TvCell className="col-span-4 row-span-4" title="Xếp hạng POS · doanh thu đơn chốt">{posBars(true)}</TvCell>
          <TvCell className="col-span-4 row-span-4" title="Nhân viên · tỷ lệ chốt">
            <div className="grid h-full grid-cols-2 gap-3">
              <div className="min-w-0 overflow-hidden"><div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-good">Top tỷ lệ chốt</div><EmpTable rows={topEmp} tone="green" compact onNavigate={onNavigate} /></div>
              <div className="min-w-0 overflow-hidden"><div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-bad">Cần hỗ trợ</div><EmpTable rows={lowEmp} tone="red" compact onNavigate={onNavigate} /></div>
            </div>
          </TvCell>
          <TvCell className="col-span-2 row-span-4" title="Khách hàng & data">
            <dl className="m-0 space-y-1.5 text-xs">
              {[['Tổng khách', g ? vi.format(g.total) : '—', ''], ['Hoạt động 30 ngày', seg ? vi.format(seg.active) : '—', ''], ['Nguy cơ rời bỏ', seg ? vi.format(seg.risk) : '—', 'text-bad'], ['Lâu chưa mua (>90 ngày)', g ? vi.format(g['90+']) : '—', 'text-warn'], ['Tỷ lệ mua lại', repurchase ? pct(repurchase.funnel.once ? repurchase.funnel.twice / repurchase.funnel.once * 100 : null) : '—', ''], ['Data cấp trong kỳ', vi.format(bt.received), ''], ['Đã mua từ data', pct(bt.received ? bt.buyers / bt.received * 100 : null), '']].map(([l, v, c]) => (
                <div key={l} className="flex items-center justify-between gap-2"><dt className="min-w-0 truncate text-ink-2">{l}</dt><dd className={`num m-0 shrink-0 ${c || 'text-ink'}`}>{v}</dd></div>
              ))}
            </dl>
          </TvCell>
          <TvCell className="col-span-2 row-span-4" title={<><AlertTriangle size={13} className={alerts.length ? 'text-bad' : 'text-ink-3'} aria-hidden="true" />Cảnh báo ({alerts.length})</>}>
            {shift ? (alerts.length ? <ul className="m-0 list-none space-y-1 p-0">{alerts.slice(0, 3).map((a, i) => alertItem(a, i, true))}</ul> : <p className="text-xs text-good">Không có cảnh báo.</p>) : <p className="text-xs text-ink-3">{errors.shift ? 'Không tải được ca hiện tại.' : 'Đang tải…'}</p>}
            <div className="mt-2 border-t border-line pt-2 text-xs">
              {syncBad.length
                ? <><div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-bad">POS lỗi đồng bộ</div><ul className="m-0 list-none p-0">{POS.filter((p) => syncBad.some((x) => x.posId === p.id)).map(syncRow)}</ul></>
                : <p className="flex items-center gap-1 text-good"><Wifi size={12} aria-hidden="true" />Cả <b className="num">{posIds.length}</b> POS đã đồng bộ · <span className="num text-ink">{timeOnly(report?.syncedAt)}</span></p>}
            </div>
          </TvCell>
        </div>
      </section>,
      document.body,
    );
  }

  return (
    <div className="space-y-5" aria-busy={loading && !!report}>
      <PageHeader eyebrow={`${periodLabel} · so với ${cmpLabel}`} title="Điều khiển trung tâm" subtitle={`Toàn cảnh ${POS.length} POS · cập nhật ${updatedAt ? timeOnly(updatedAt) : '…'}${stale ? ' · số liệu cũ' : ''}`}
        actions={<><StaleChip stale={overviewApi.stale} at={overviewApi.at} loading={overviewApi.loading} error={report ? overviewApi.error : null} onRetry={reload} />{desktop && <Button variant={tvWanted ? 'default' : 'outline'} aria-pressed={tvWanted} onClick={() => setTv(!tvWanted)}><Monitor size={14} />Màn hình TV</Button>}</>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }} onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={reload} />
      <PosChips posIds={posIds} onChange={setPosIds} info={report?.pos} />
      {topError}

      {cur ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
          {kpis.map((k, i) => kpiCard(k, `${i < 4 ? 'lg:col-span-3' : 'lg:col-span-4'} ${i === 6 ? 'max-lg:col-span-2' : ''}`))}
        </div>
      ) : firstLoad(false, 'overview') ? <SkeletonKpis count={7} /> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard icon={BarChart3} title="Xu hướng 30 ngày" subtitle="Doanh thu (triệu ₫) và đơn chốt theo ngày · rê chuột hoặc dùng phím ← → để xem từng ngày" more={{ label: 'Xem chi tiết', onClick: () => onNavigate('overview') }} loading={firstLoad(!!trend, 'trend')}>
          <BlockNote error={errors.trend} hasData={!!trend} onRetry={reload} />
          {trend && trendChart('h-72')}
        </ChartCard>
        <ChartCard icon={ClipboardList} title="Trạng thái đơn" subtitle="Đơn tạo trong kỳ · trạng thái lúc đồng bộ" info={defs.groups} more={{ label: 'Xem chi tiết', onClick: () => onNavigate('overview') }} loading={firstLoad(!!cur, 'overview')}>
          <BlockNote error={errors.overview} hasData={!!cur} onRetry={reload} />
          {donut(160)}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard icon={BarChart3} title="Xếp hạng POS" subtitle="Doanh thu đơn chốt · rê chuột xem chốt, tỷ trọng, AOV, kỳ trước" more={{ label: 'Xem chi tiết', onClick: () => onNavigate('overview') }} loading={firstLoad(!!cur, 'overview')}>
          <BlockNote error={errors.overview} hasData={!!cur} onRetry={reload} />
          {cur && posBars(false)}
        </ChartCard>
        <ChartCard icon={Truck} title="Vận hành đơn" subtitle="Chốt → xuất đi → đã nhận" more={{ label: 'Xem chi tiết', onClick: () => onNavigate('pipeline') }} loading={firstLoad(!!pipeline, 'pipeline')}>
          <BlockNote error={errors.pipeline} hasData={!!pipeline} onRetry={reload} />
          {funnelBlock(false)}
        </ChartCard>
        <ChartCard icon={AlertTriangle} title={`Cảnh báo & đồng bộ${alerts.length ? ` (${alerts.length})` : ''}`} subtitle={`Ca hiện tại · kết nối ${POS.length} POS`} more={{ label: 'Xem ca', onClick: () => onNavigate('shift') }} loading={firstLoad(!!shift || sync.length > 0, 'shift')}>
          <BlockNote error={errors.shift} hasData={!!shift} onRetry={reload} />
          {shift && (alerts.length
            ? <ul className="m-0 mb-3 list-none space-y-1.5 p-0">{alerts.slice(0, 5).map((a, i) => alertItem(a, i, false))}</ul>
            : <p className="notice ok mb-3 items-center py-1.5 text-xs"><CheckCircle2 size={13} aria-hidden="true" />Không có cảnh báo trong ca.</p>)}
          <div className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-3"><Database size={12} aria-hidden="true" />Đồng bộ Pancake</div>
          <BlockNote error={errors.sync} hasData={sync.length > 0} onRetry={reload} />
          {syncList}
          <p className="mt-2 text-[11px] text-ink-3">Đồng bộ gần nhất <span className="num text-ink">{dt(report?.syncedAt, true)}</span></p>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard icon={Users} title="Nhân viên" subtitle="Tỷ lệ chốt · từ 10 đơn chia · Sale và CSKH" info={defs.rate} more={{ label: 'So sánh nhân viên', onClick: () => onNavigate('compare') }} className="xl:col-span-2" loading={firstLoad(!!cur, 'overview')}>
          <BlockNote error={errors.overview} hasData={!!cur} onRetry={reload} />
          {cur && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0"><div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-good">Top 5</div><EmpTable rows={topEmp} tone="green" onNavigate={onNavigate} /></div>
              <div className="min-w-0"><div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-bad">Cần hỗ trợ</div><EmpTable rows={lowEmp} tone="red" onNavigate={onNavigate} /></div>
            </div>
          )}
        </ChartCard>
        <ChartCard icon={Repeat} title="Mua lại & data" subtitle="Trong kỳ" action={<><Link view="repurchase" label="Mua lại" onNavigate={onNavigate} /><Link view="batches" label="Data" onNavigate={onNavigate} /></>} loading={firstLoad(!!repurchase || !!batches, 'repurchase')}>
          <BlockNote error={errors.repurchase ?? errors.batches} hasData={!!repurchase || !!batches} onRetry={reload} />
          <div className="grid grid-cols-2 gap-2">
            {[['Tỷ lệ mua lại (trọn đời)', repurchase ? pct(repurchase.funnel.once ? repurchase.funnel.twice / repurchase.funnel.once * 100 : null) : '—'], ['Doanh thu mua lại', repurchase ? shortMoney(repurchase.summary.repurchase.net) : '—'], ['Đơn mua lại', repurchase ? vi.format(repurchase.summary.repurchase.orders) : '—'], ['Khách mua lại', repurchase ? vi.format(repurchase.summary.repurchase.customers) : '—'], ['Data được cấp', batches ? vi.format(bt.received) : '—'], ['Đã mua từ data', batches ? `${vi.format(bt.buyers)} · ${pct(bt.received ? bt.buyers / bt.received * 100 : null)}` : '—']].map(([l, v]) => (
              <div key={l} className="min-w-0 rounded-xl bg-surface-2 p-2.5"><div className="truncate text-[11px] text-ink-3" title={l}>{l}</div><div className="num truncate text-[18px] leading-tight text-ink" title={v}>{v}</div></div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard icon={Users} title="Khách hàng" subtitle="Toàn bộ lịch sử · bấm một ô để mở trang tương ứng" more={{ label: 'Xem chi tiết', onClick: () => onNavigate('customers') }} loading={firstLoad(!!customers, 'customers')}>
          <BlockNote error={errors.customers} hasData={!!customers} onRetry={reload} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[['Tổng khách', g ? vi.format(g.total) : '—', 'customers'], ['Hoạt động 30 ngày', seg ? vi.format(seg.active) : '—', 'customers'], ['Thân thiết', seg ? vi.format(seg.loyal) : '—', 'customers'], ['Nguy cơ rời bỏ', seg ? vi.format(seg.risk) : '—', 'dormant'], ['Lâu chưa mua (>90 ngày)', seg ? vi.format(seg.dormant) : '—', 'dormant'], ['Giá trị vòng đời TB', seg && seg.buyers ? shortMoney(seg.ltvTotal / seg.buyers) : '—', 'customers']].map(([l, v, view]) => (
              <button key={l} type="button" onClick={() => onNavigate(view)} className="ministat min-w-0 flex-col items-start gap-0.5 rounded-xl p-2.5"><span className="block w-full truncate text-[11px] text-ink-3" title={l}>{l}</span><span className="num block w-full truncate text-[18px] leading-tight text-ink" title={v}>{v}</span></button>
            ))}
          </div>
        </ChartCard>
        <ChartCard icon={UserX} title="Khách lâu chưa mua" subtitle="Theo số ngày từ lần mua thành công gần nhất tới hôm nay · rê chuột xem tiền đã mua" more={{ label: 'Xem chi tiết', onClick: () => onNavigate('dormant') }} loading={firstLoad(!!customers, 'customers')}>
          <BlockNote error={errors.customers} hasData={!!customers} onRetry={reload} />
          {g && (() => {
            const rows = DORMANT_BUCKETS.map((b) => ({ ...b, n: g[b.k], net: customers?.groupNets?.[b.k] ?? null }));
            const max = Math.max(...rows.map((x) => x.n), 1);
            const go = () => onNavigate('dormant');
            return (
              <>
                <ol className="m-0 list-none p-0">
                  {rows.map((b) => (
                    <li key={b.k}>
                      <button type="button" aria-label={`${b.label}: ${vi.format(b.n)} khách · mở Khách lâu chưa mua`} onClick={go} className={`${ROW_CLS} group grid-cols-[minmax(0,1fr)_auto] py-2`}>
                      <span className="min-w-0"><span className="block truncate font-medium text-ink">{b.label}</span><span className="pbar mt-1.5 block h-[5px] w-full"><i className="[transition:filter_var(--dur)_var(--ease),width_.9s_var(--ease)] group-hover:brightness-[1.12]" style={{ width: `${b.n / max * 100}%`, background: b.fill }} /></span></span>
                      <span className="text-right"><span className="num block text-ink">{vi.format(b.n)}</span><span className="num block text-[11.5px] leading-tight text-ink-2">{pct(buyers ? b.n / buyers * 100 : null, 0)} khách đã mua</span></span>
                      <ContextLine className="col-span-full" indent={18}>Đã mua {b.net !== null ? shortMoney(b.net) : '—'}{b.net !== null && b.n ? ` · TB ${shortMoney(b.net / b.n)}/khách` : ''}</ContextLine>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
                  <span>Hoạt động (≤ 30 ngày) <b className="num text-ink">{vi.format(g.active)}</b></span><span>Chưa từng mua <b className="num text-ink">{vi.format(g.never)}</b></span><span>Đã mua <b className="num text-ink">{vi.format(buyers)}</b></span>
                </p>
              </>
            );
          })()}
        </ChartCard>
      </div>
    </div>
  );
}
