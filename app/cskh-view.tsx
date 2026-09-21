'use client';

// Nhóm trang CSKH: Hồ sơ khách hàng (ProfilesView), Khách lâu chưa mua (DormantView), Mua lại & Upsell (RepurchaseView), Data được cấp (BatchesView).
// Giao diện v2: bảng .tbl sắp xếp ở tiêu đề (đồng bộ với tham số sort của API), dòng bấm được bằng bàn phím, tooltip cách tính trên thẻ KPI,
// tìm chờ 300 ms + huỷ request cũ, hộp thoại hồ sơ khách có trạng thái tải / lỗi và không còn bị ép 24rem, xương khi tải, màu theo token (sáng / tối).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, BadgePercent, ChevronLeft, ChevronRight, Clock, Database, Layers, Phone, Repeat, ShoppingBag, Sparkles, Tag, TrendingUp, UserCheck, Users, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';
import { PosChips, presetRange } from './overview-view';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import {
  ChartCard, ContextLine, Definitions, Donut, ErrorBox, EmptyState, Funnel, HoverReveal, KpiCard, PageHeader, ProgressBar, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, Toolbar, heat,
  dmy, dt, money, pct, posName, posVar, short, shortMoney, toast, useMotionOK, useSort, vi, type SortState,
} from './ui-kit';

type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
type EmpSortKey = 'name' | 'l0' | 'l1' | 'l2' | 'l3' | 'rep' | 'repNet';
const EMP_SORT_LABELS: Record<EmpSortKey, string> = { rep: 'Khách mua lại', repNet: 'Doanh thu mua lại', l0: 'Mua lần đầu', l1: 'Upsell lần 1', l2: 'Upsell lần 2', l3: 'Upsell lần 3+', name: 'Tên' };
/** Tooltip KPI dạng "nhãn · giá trị" cho số liệu chụp tại thời điểm đồng bộ (không theo kỳ nên không dùng nhãn "Kỳ này"). */
const tip = (title: string, rows: [string, string][], how?: string) => (
  <><b>{title}</b>{rows.map(([l, v]) => <span key={l} className="r"><span>{l}</span><span className="num">{v}</span></span>)}{how ? <span className="how block">Cách tính: {how}</span> : null}</>
);
/** Dòng bảng / mục danh sách bấm được: Tab tới được, Enter / Space mở; phím bấm trên nút con bên trong không kích hoạt dòng. */
const rowKeys = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};
const rowCls = (on = false) => `cursor-pointer focus-visible:-outline-offset-2 ${on ? '[&>td]:bg-tint-2' : ''}`;
const Pager = ({ page, hasMore, disabled, onPage }: { page: number; hasMore: boolean; disabled?: boolean; onPage: (p: number) => void }) => (
  <>
    <Button size="sm" variant="outline" aria-label="Trang trước" disabled={page <= 1 || disabled} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></Button>
    <span className="num text-xs text-ink-2">Trang {page}</span>
    <Button size="sm" variant="outline" aria-label="Trang sau" disabled={!hasMore || disabled} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></Button>
  </>
);

async function exportRows(name: string, sheets: { title: string; rows: (string | number | null)[][] }[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.title.slice(0, 30));
  XLSX.writeFile(wb, `${name}.xlsx`);
}

/** Gọi API báo cáo; trả về lỗi dễ hiểu thay vì để trang trống. Truyền signal để huỷ khi có request mới hơn. */
async function fetchReport<T>(url: string, signal?: AbortSignal): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal });
    const body = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok) return { data: null, error: body.error || `Máy chủ trả lỗi ${r.status}.` };
    return { data: body, error: null };
  } catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Không kết nối được máy chủ.' }; }
}

const RANGE_PRESETS: Record<string, string> = { month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày qua', year: 'Năm nay', all: 'Từ đầu (03/2025)', custom: 'Tùy chọn' };
function RangePicker({ preset, start, end, onChange }: { preset: string; start: string; end: string; onChange: (preset: string, s: string, e: string) => void }) {
  const today = todayVn();
  const apply = (key: string) => {
    if (key === 'year') return onChange(key, `${today.slice(0, 4)}-01-01`, today);
    const r = presetRange(key, today);
    onChange(key, r?.start ?? start, r?.end ?? end);
  };
  return (
    <>
      <span className="px-1 text-sm font-semibold text-ink-2">Kỳ</span>
      <Select value={preset} items={RANGE_PRESETS} onValueChange={(v) => apply(String(v))}>
        <SelectTrigger className="min-w-36" aria-label="Kỳ"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(RANGE_PRESETS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto sm:flex-none">
        <Input aria-label="Từ ngày" type="date" className="w-auto" value={start} max={end} onChange={(e) => onChange('custom', e.target.value, end)} />
        <span className="text-sm text-ink-3">→</span>
        <Input aria-label="Đến ngày" type="date" className="w-auto" value={end} min={start} max={today} onChange={(e) => onChange('custom', start, e.target.value)} />
      </div>
    </>
  );
}

// ---------- Kiểu dữ liệu khách ----------
type Customer = {
  posId: string; posName: string; phone: string; name: string; sellerName: string; firstOrderAt: string | null; lastOrderAt: string | null;
  orders: number; closedOrders: number; successOrders: number; successNet: number; successQuantity: number; averageOrder: number | null;
  lifetimeOrders: number; lifetimeNet: number;
  returnedOrders: number; cancelledOrders: number; firstSuccessAt: string | null; lastSuccessAt: string | null; daysSinceSuccess: number | null;
  productKinds: number; products: { name: string; quantity: number; total: number; orders: number }[];
};
type CustomerList = {
  page: number; hasMore: boolean; total: number; groups: Record<string, number> | null; groupNets?: Record<string, number>; customers: Customer[]; definitions: Record<string, string>;
  period?: { start: string; end: string; net: number; orders: number };
};
type Detail = {
  posName: string; phone: string;
  stats: { name: string; sellerName: string | null; orders: number; closedOrders: number; successOrders: number; successNet: number; successQuantity: number; averageOrder: number | null; returnedOrders: number; cancelledOrders: number; firstOrderAt: string | null; lastOrderAt: string | null; firstSuccessAt: string | null; lastSuccessAt: string | null; productKinds: number; products: { name: string; quantity: number; total: number; orders: number }[] } | null;
  orders: { id: string; sourceOrderId: string; createdAt: string; statusName: string; sellerName: string | null; closerName: string | null; confirmedAt: string | null; deliveredAt: string | null; gross: number; discount: number; net: number; note: string | null; tags: { name: string }[]; successRank: number | null; items: { name: string; quantity: number; price: number; total: number }[] }[];
};
type Employee = { id: string; name: string; department: string | null };
const GROUP_LABELS: Record<string, string> = { all: 'Tất cả', active: 'Mua trong 30 ngày', '30-45': '30–45 ngày', '46-60': '46–60 ngày', '61-90': '61–90 ngày', '90+': 'Trên 90 ngày', never: 'Chưa từng mua' };
const DORMANT_KEYS = ['30-45', '46-60', '61-90', '90+'] as const;
// Màu nhóm lâu chưa mua theo token (cùng tông với thẻ KPI: teal → lime → orange → red), đổi theo chủ đề sáng / tối.
const DORMANT_COLORS: Record<string, string> = { '30-45': 'var(--t-teal)', '46-60': 'var(--t-lime)', '61-90': 'var(--t-orange)', '90+': 'var(--t-red)' };
const DORMANT_TONES: Record<string, 'teal' | 'lime' | 'orange' | 'red'> = { '30-45': 'teal', '46-60': 'lime', '61-90': 'orange', '90+': 'red' };
const SORTS: Record<string, string> = { spend: 'Mua nhiều tiền nhất', orders: 'Mua nhiều đơn nhất', recent: 'Mua gần đây nhất', quantity: 'Mua nhiều sản phẩm nhất', first: 'Khách mới nhất', dormant: 'Lâu chưa mua nhất', name: 'Theo tên' };
// Cột sắp xếp trên bảng ↔ tham số sort của API (cùng trạng thái với ô "Sắp xếp"); quantity / first không có cột riêng.
const CUST_COLS: Record<string, { key: string; desc: boolean }> = { spend: { key: 'spend', desc: true }, orders: { key: 'orders', desc: true }, recent: { key: 'recent', desc: true }, dormant: { key: 'dormant', desc: true }, name: { key: 'name', desc: false } };
const customerSort = (sort: string, setSort: (v: string) => void): SortState => ({
  key: CUST_COLS[sort]?.key ?? '', desc: CUST_COLS[sort]?.desc,
  toggle: (k: string) => setSort(k === sort ? (k === 'recent' ? 'dormant' : k === 'dormant' ? 'recent' : k) : k),
  mark: () => '',
});
const PERIODS: Record<string, string> = { all: 'Toàn bộ lịch sử', month: 'Tháng này', lastMonth: 'Tháng trước', d90: '90 ngày qua', year: 'Năm nay', custom: 'Khoảng tùy chọn' };
const periodRange = (key: string, today: string): { start: string; end: string } | null => {
  if (key === 'month') return { start: monthStart(today), end: today };
  if (key === 'lastMonth') { const e = addDays(monthStart(today), -1); return { start: monthStart(e), end: e }; }
  if (key === 'd90') return { start: addDays(today, -89), end: today };
  if (key === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return null;
};

function useEmployees() {
  const team = useTeam();
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => { void fetchReport<Employee[]>(`/api/employees?team=${team}`).then((r) => { if (r.data) setEmployees(r.data); }); }, [team]);
  return employees;
}

function EmployeeSelect({ value, onChange, employees }: { value: string; onChange: (v: string) => void; employees: Employee[] }) {
  return (
    <Select value={value || '__all'} items={{ __all: 'Tất cả nhân viên', ...Object.fromEntries(employees.map((e) => [e.id, e.name])) }} onValueChange={(v) => onChange(v === '__all' ? '' : String(v))}>
      <SelectTrigger className="min-w-48" aria-label="Nhân viên phụ trách"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">Tất cả nhân viên</SelectItem>
        {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.department ? <span className="text-ink-3"> · {e.department}</span> : null}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Ô tìm khách: gõ xong 300 ms mới gửi request (Enter gửi ngay); hiện "Đang tìm…" trong lúc chờ kết quả. */
function SearchBox({ value, onChange, onSubmit, searching, className = 'w-64 max-w-full' }: { value: string; onChange: (v: string) => void; onSubmit: () => void; searching: boolean; className?: string }) {
  return (
    <form className={`relative ${className}`} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <Input placeholder="Tìm theo SĐT hoặc tên khách" aria-label="Tìm theo SĐT hoặc tên khách" className="pr-20" value={value} onChange={(e) => onChange(e.target.value)} />
      {searching && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-3">Đang tìm…</span>}
    </form>
  );
}
/** Chờ 300 ms sau phím cuối rồi mới đổi giá trị dùng để tìm (và về trang 1). */
function useDebouncedQuery(q: string, onApply: (v: string) => void) {
  const [query, setQuery] = useState(q.trim());
  const apply = useCallback((v: string) => { setQuery((old) => old === v ? old : v); onApply(v); }, [onApply]);
  useEffect(() => {
    const v = q.trim();
    if (v === query) return;
    const t = window.setTimeout(() => apply(v), 300);
    return () => clearTimeout(t);
  }, [q, query, apply]);
  return { query, applyNow: () => apply(q.trim()) };
}

function CustomerDialog({ detail, loading, error, onClose, onRetry }: { detail: Detail | null; loading: boolean; error: string | null; onClose: () => void; onRetry: () => void }) {
  return (
    <Dialog open={!!detail || loading || !!error} onOpenChange={(o) => !o && onClose()}>
      {/* Giữ max-w mặc định (mép 16px) trên điện thoại; từ sm trở lên mới nới 4xl (sm:max-w-4xl thắng sm:max-w-sm của DialogContent). */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle className="pr-8 text-base font-semibold leading-tight tracking-[-.01em] text-ink">{detail ? <>{detail.stats?.name || 'Khách chưa có tên'} · <span className="num">{detail.phone}</span> · {detail.posName}</> : loading ? 'Đang tải hồ sơ khách…' : 'Hồ sơ khách'}</DialogTitle></DialogHeader>
        {loading && (
          <div className="space-y-3" aria-busy="true" aria-label="Đang tải hồ sơ">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <span key={i} className="skel h-16" />)}</div>
            <SkeletonTable rows={5} cols={6} />
          </div>
        )}
        {error && <ErrorBox error={error} onRetry={onRetry} />}
        {detail && (
          <>
            {detail.stats && (
              <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
                <div className="rounded-[10px] bg-surface-2 p-3"><div className="text-[11px] text-ink-3">Tổng tiền mua thành công</div><div className="num truncate text-lg text-ink" title={money(detail.stats.successNet)}>{money(detail.stats.successNet)}</div><div className="text-xs text-ink-2"><span className="num">{detail.stats.successOrders}</span> đơn · TB <span className="num">{money(detail.stats.averageOrder)}</span></div></div>
                <div className="rounded-[10px] bg-surface-2 p-3"><div className="text-[11px] text-ink-3">Đơn / chốt / hoàn / hủy</div><div className="num text-lg text-ink">{detail.stats.orders} / {detail.stats.closedOrders} / {detail.stats.returnedOrders} / {detail.stats.cancelledOrders}</div></div>
                <div className="rounded-[10px] bg-surface-2 p-3"><div className="text-[11px] text-ink-3">Mua đầu → gần nhất</div><div className="num text-ink">{dt(detail.stats.firstSuccessAt)} → {dt(detail.stats.lastSuccessAt)}</div><div className="text-xs text-ink-2">Phụ trách: {detail.stats.sellerName ?? '—'}</div></div>
                <div className="rounded-[10px] bg-surface-2 p-3"><div className="text-[11px] text-ink-3">Sản phẩm đã mua (<span className="num">{detail.stats.productKinds}</span> loại)</div><div className="line-clamp-3 text-xs text-ink" title={detail.stats.products.map((p) => `${p.name} ×${p.quantity}`).join(' · ')}>{detail.stats.products.map((p) => `${p.name} ×${p.quantity}`).join(' · ') || '—'}</div></div>
              </div>
            )}
            {detail.orders.length ? (
              <TableWrap minWidth={880} className="mt-1">
                <table className="tbl">
                  <thead><tr><th>Ngày tạo</th><th>Mã đơn</th><th>Trạng thái</th><th>Lần mua</th><th>Người bán / chốt</th><th className="n">Doanh thu</th><th>Sản phẩm</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {detail.orders.map((o) => (
                      <tr key={o.id} className="[&>td]:align-top">
                        <td className="num text-xs">{dt(o.createdAt, true)}</td>
                        <td className="num">{o.sourceOrderId}</td>
                        <td>{o.statusName}</td>
                        <td>{o.successRank ? <StatusChip tone={o.successRank === 1 ? 'green' : o.successRank >= 4 ? 'purple' : 'teal'}>{o.successRank === 1 ? 'Lần đầu' : `Upsell ${o.successRank - 1}`}</StatusChip> : ''}</td>
                        <td className="text-xs">{o.sellerName ?? '—'}{o.closerName && o.closerName !== o.sellerName ? ` / ${o.closerName}` : ''}</td>
                        <td className="n">{money(o.net)}</td>
                        <td className="max-w-64 whitespace-normal text-xs">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                        <td className="max-w-60 whitespace-normal break-words text-xs text-ink-2">{[o.note, ...o.tags.map((t) => `#${t.name}`)].filter(Boolean).join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có đơn nào được đồng bộ cho khách này." />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Hộp thoại hồ sơ khách: xoá nội dung cũ ngay khi mở khách khác, huỷ request trước, bỏ qua response tới muộn; lỗi thì có "Thử lại". */
const useDetail = () => {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ posId: string; phone: string } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const open = async (c: { posId: string; phone: string }) => {
    ctrl.current?.abort();
    const ac = new AbortController(); ctrl.current = ac; last.current = c;
    setDetail(null); setError(null); setLoading(true);
    const r = await fetchReport<Detail>(`/api/reports/customers/detail?posId=${c.posId}&phone=${encodeURIComponent(c.phone)}`, ac.signal);
    if (ac.signal.aborted) return;
    setLoading(false);
    if (r.data) setDetail(r.data); else setError(r.error);
  };
  const close = () => { ctrl.current?.abort(); last.current = null; setDetail(null); setError(null); setLoading(false); };
  const retry = () => { if (last.current) void open(last.current); };
  useEffect(() => () => ctrl.current?.abort(), []);
  return { detail, loading, error, open, close, retry };
};

// ---------- Hồ sơ khách hàng ----------
export function CustomersView({ mode, initialQ = '' }: { Surface?: SurfaceComponent; mode: 'profiles' | 'dormant'; initialQ?: string }) {
  if (mode === 'dormant') return <DormantView />;
  return <ProfilesView initialQ={initialQ} />;
}

function ProfilesView({ initialQ }: { initialQ: string }) {
  const today = todayVn();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [q, setQ] = useState(initialQ);
  const [group, setGroup] = useState('all');
  const [sort, setSort] = useState('spend');
  const [sellerId, setSellerId] = useState('');
  const [periodKey, setPeriodKey] = useState('all');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const employees = useEmployees();
  const { detail, loading: detailLoading, error: detailError, open, close, retry } = useDetail();
  const ctrl = useRef<AbortController | null>(null);
  const reset = () => setPage(1);
  const { query, applyNow } = useDebouncedQuery(q, useCallback(() => setPage(1), []));

  const range = periodKey === 'custom' ? { start, end } : periodRange(periodKey, today);
  const periodMode = !!range;
  const load = useCallback(async () => {
    ctrl.current?.abort();
    const ac = new AbortController(); ctrl.current = ac;
    setLoading(true); setError(null);
    const params = new URLSearchParams({ posIds: posIds.join(','), q: query, page: String(page), sort, sellerId });
    if (periodMode && range) { params.set('start', range.start); params.set('end', range.end); }
    else params.set('group', group);
    const r = await fetchReport<CustomerList>(`/api/reports/customers?${params}`, ac.signal);
    if (ac.signal.aborted) return false;
    setLoading(false);
    if (r.data) { setData(r.data); return true; }
    setError(r.error); return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posIds, query, group, page, sort, sellerId, periodMode, range?.start, range?.end]);
  useEffect(() => { void load(); return () => ctrl.current?.abort(); }, [load]);
  const g = data?.groups;
  const title = periodMode && range
    ? `${SORTS[sort]} · ${periodKey === 'custom' ? `${range.start} → ${range.end}` : PERIODS[periodKey]} · ${vi.format(data?.total ?? 0)} khách`
    : `${GROUP_LABELS[group]} · ${vi.format(data?.total ?? 0)} khách`;
  const listSort = customerSort(sort, (v) => { reset(); setSort(v); });
  const canSort = (k: string) => !periodMode || ['spend', 'orders', 'recent'].includes(k);
  const searching = loading && q.trim() !== '' && q.trim() === query;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Số liệu Pancake POS tại thời điểm đồng bộ" title="Hồ sơ khách hàng" subtitle="Mỗi khách = một SĐT trong một POS. Tìm, lọc, xếp hạng khách mua nhiều nhất theo từng kỳ và mở lịch sử mua của từng khách."
        actions={<Button variant="outline" disabled={!data} onClick={() => data && exportRows(`khach-hang_${periodMode && range ? `${range.start}_${range.end}` : group}`, [{
          title: 'Khách hàng', rows: [
            ['POS', 'SĐT', 'Tên', 'Người phụ trách', 'Đơn', 'Đơn chốt', 'Mua thành công', 'Tổng tiền mua', 'TB/đơn', 'Mua TC trọn đời', 'Tiền mua trọn đời', 'SL', 'Số loại SP', 'Hoàn', 'Hủy', 'Mua gần nhất', 'Ngày chưa mua lại', 'Sản phẩm đã mua'],
            ...data.customers.map((c) => [c.posName, c.phone, c.name, c.sellerName, c.orders, c.closedOrders, c.successOrders, c.successNet, Math.round(c.averageOrder ?? 0), c.lifetimeOrders, c.lifetimeNet, c.successQuantity, c.productKinds, c.returnedOrders, c.cancelledOrders, dt(c.lastSuccessAt), c.daysSinceSuccess, c.products.map((p) => `${p.name} ×${p.quantity}`).join('; ')]),
          ],
        }])}>Xuất Excel (trang này)</Button>} />
      {!data && !error && <SkeletonKpis count={4} />}
      {g && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard icon={Users} tone="green" label="Tổng khách" value={vi.format(g.total)} countUp rawValue={g.total} note={`${vi.format(g.total - g.never)} đã mua thành công · ${vi.format(g.never)} chưa từng mua`} onClick={() => { reset(); setPeriodKey('all'); setGroup('all'); }} active={!periodMode && group === 'all'}
            tooltip={tip('Tổng khách', [['Tổng khách', `${vi.format(g.total)} khách`], ['Đã mua thành công', `${vi.format(g.total - g.never)} khách`], ['Chưa từng mua', `${vi.format(g.never)} khách`]], `${data?.definitions.identity ?? ''} Bấm để xem tất cả.`)} />
          <KpiCard icon={UserCheck} tone="teal" label="Mua trong 30 ngày" value={vi.format(g.active)} countUp rawValue={g.active} note={`${pct(g.total ? g.active / g.total * 100 : null)} tổng khách`} onClick={() => { reset(); setPeriodKey('all'); setGroup('active'); }} active={!periodMode && group === 'active'}
            tooltip={tip('Mua trong 30 ngày', [['Số khách', `${vi.format(g.active)} khách`], ['Tỷ lệ trên tổng khách', pct(g.total ? g.active / g.total * 100 : null)]], 'Khách có đơn mua thành công trong 30 ngày gần nhất. Bấm để lọc.')} />
          <KpiCard icon={Clock} tone="orange" label="Lâu chưa mua (≥30 ngày)" value={vi.format(DORMANT_KEYS.reduce((a, k) => a + (g[k] ?? 0), 0))} countUp rawValue={DORMANT_KEYS.reduce((a, k) => a + (g[k] ?? 0), 0)} note="Xem chi tiết ở mục Khách lâu chưa mua" onClick={() => { reset(); setPeriodKey('all'); setGroup('90+'); }} active={!periodMode && DORMANT_KEYS.includes(group as never)}
            tooltip={tip('Lâu chưa mua', DORMANT_KEYS.map((k) => [GROUP_LABELS[k], `${vi.format(g[k] ?? 0)} khách`] as [string, string]), `${data?.definitions.dormant ?? ''} Bấm để xem nhóm trên 90 ngày.`)} />
          <KpiCard icon={Sparkles} tone="purple" label="Chưa từng mua" value={vi.format(g.never)} countUp rawValue={g.never} note="Có đơn nhưng chưa đơn nào giao thành công" onClick={() => { reset(); setPeriodKey('all'); setGroup('never'); }} active={!periodMode && group === 'never'}
            tooltip={tip('Chưa từng mua', [['Số khách', `${vi.format(g.never)} khách`], ['Tỷ lệ trên tổng khách', pct(g.total ? g.never / g.total * 100 : null)]], 'Khách có đơn nhưng chưa đơn nào ở trạng thái Đã nhận / Đã thu tiền. Bấm để lọc.')} />
        </div>
      )}
      <Toolbar>
        <SearchBox value={q} onChange={setQ} onSubmit={applyNow} searching={searching} />
        <span className="pl-2 text-sm font-semibold text-ink-2">Kỳ</span>
        <Select value={periodKey} items={PERIODS} onValueChange={(v) => { reset(); setPeriodKey(String(v)); }}>
          <SelectTrigger className="min-w-40" aria-label="Kỳ"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {periodKey === 'custom' && (
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto sm:flex-none">
            <Input aria-label="Từ ngày" type="date" className="w-auto" value={start} max={end} onChange={(e) => { reset(); setStart(e.target.value); }} />
            <span className="text-sm text-ink-3">→</span>
            <Input aria-label="Đến ngày" type="date" className="w-auto" value={end} min={start} max={today} onChange={(e) => { reset(); setEnd(e.target.value); }} />
          </div>
        )}
        <span className="pl-2 text-sm font-semibold text-ink-2">Sắp xếp</span>
        <Select value={sort} items={SORTS} onValueChange={(v) => { reset(); setSort(String(v)); }}>
          <SelectTrigger className="min-w-52" aria-label="Sắp xếp"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).filter(([k]) => canSort(k)).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <span className="pl-2 text-sm font-semibold text-ink-2">Phụ trách</span>
        <EmployeeSelect value={sellerId} onChange={(v) => { reset(); setSellerId(v); }} employees={employees} />
      </Toolbar>
      {!periodMode && (
        <div className="-mx-1 overflow-x-auto px-1 py-0.5">
          <SegmentedControl ariaLabel="Nhóm khách" size="sm" value={group} onChange={(k) => { reset(); setGroup(k); }}
            options={Object.entries(GROUP_LABELS).map(([k, l]) => ({ value: k, label: <>{l}{g ? <span className="num ml-1 text-[10.5px] opacity-80">{vi.format(k === 'all' ? g.total : g[k] ?? 0)}</span> : null}</> }))} />
        </div>
      )}
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <ChartCard icon={Users} title="Danh sách khách" subtitle="Đang tải…"><SkeletonTable rows={8} cols={8} /></ChartCard>}
      {data && (
        <ChartCard icon={Users} title={title} subtitle={`${data.definitions.success} Bấm tiêu đề cột để sắp xếp.`} bodyClassName={loading ? 'opacity-70 transition-opacity duration-[var(--dur)]' : 'transition-opacity duration-[var(--dur)]'}
          action={<div className="flex items-center gap-2"><Pager page={page} hasMore={data.hasMore} disabled={loading} onPage={setPage} /></div>}>
          {data.period && (
            <p className="mb-3 text-[13px] text-ink-2">Trong kỳ: <span className="num text-ink">{vi.format(data.period.orders)}</span> đơn thành công · <span className="num text-ink">{money(data.period.net)}</span> · <span className="num">{vi.format(data.total)}</span> khách</p>
          )}
          {data.customers.length ? (
            <TableWrap minWidth={1120} stickyFirst>
              <table className="tbl">
                <thead><tr>
                  <th className="w-8">#</th>
                  {canSort('name') ? <SortTh k="name" label="Khách" sort={listSort} align="left" /> : <th>Khách</th>}
                  <th>POS</th><th>Phụ trách</th>
                  <SortTh k="orders" label="Mua TC" sort={listSort} />
                  <SortTh k="spend" label="Tổng tiền mua" sort={listSort} />
                  <th className="n">TB/đơn</th>
                  {periodMode && <th className="n">Trọn đời</th>}
                  <th className="n">Loại SP</th><th>Sản phẩm hay mua</th>
                  <SortTh k="recent" label="Mua gần nhất" sort={listSort} align="left" />
                  {canSort('dormant') ? <SortTh k="dormant" label="Chưa mua (ngày)" sort={listSort} /> : <th className="n">Chưa mua (ngày)</th>}
                  <th className="n">Hoàn/Hủy</th>
                </tr></thead>
                <tbody>
                  {data.customers.map((c, i) => (
                    <tr key={`${c.posId}:${c.phone}`} tabIndex={0} onClick={() => void open(c)} onKeyDown={rowKeys(() => void open(c))} className={rowCls()}>
                      <td className="num text-[11px] text-ink-4">{(page - 1) * 50 + i + 1}</td>
                      <td><div className="flex items-center gap-2"><div className="min-w-0"><div className="max-w-[14rem] truncate font-medium text-ink" title={c.name}>{c.name || 'Khách chưa có tên'}</div><div className="num text-[11px] text-ink-3">{c.phone}</div></div><HoverReveal><span className="btn sm">Hồ sơ<ChevronRight size={12} /></span></HoverReveal></div></td>
                      <td className="text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posVar(c.posId) }} />{c.posName}</td>
                      <td className="text-xs">{c.sellerName}</td>
                      <td className="n">{vi.format(c.successOrders)}{!periodMode && <span className="text-xs text-ink-3"> / {vi.format(c.orders)}</span>}</td>
                      <td className="n">{money(c.successNet)}</td>
                      <td className="n text-ink-2">{money(c.averageOrder)}</td>
                      {periodMode && <td className="n text-xs text-ink-2">{vi.format(c.lifetimeOrders)}<span className="font-normal tracking-normal"> đơn · </span>{money(c.lifetimeNet)}</td>}
                      <td className="n">{c.productKinds ? `${c.productKinds} loại` : '—'}</td>
                      <td className="max-w-56 truncate text-xs" title={c.products.map((p) => `${p.name} ×${p.quantity}`).join(', ')}>{c.products[0]?.name ?? '—'}</td>
                      <td className="num">{dt(c.lastSuccessAt)}</td>
                      <td className="n">{c.daysSinceSuccess ?? '—'}</td>
                      <td className="n text-ink-2">{c.returnedOrders} / {c.cancelledOrders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : <EmptyState text={query ? `Không có khách nào khớp "${query}".` : 'Không có khách phù hợp bộ lọc.'} />}
          <p className="mt-3 text-xs text-ink-3">{data.definitions.identity} Bấm vào một khách để xem lịch sử mua.</p>
        </ChartCard>
      )}
      {data && <Definitions items={data.definitions} />}
      <CustomerDialog detail={detail} loading={detailLoading} error={detailError} onClose={close} onRetry={retry} />
    </div>
  );
}

// ---------- Khách lâu chưa mua ----------
function DormantView() {
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('30-45');
  const [sort, setSort] = useState('spend');
  const [sellerId, setSellerId] = useState('');
  const [page, setPage] = useState(1);
  const employees = useEmployees();
  const team = useTeam();
  const { detail, loading: detailLoading, error: detailError, open, close, retry } = useDetail();
  const [viewAll, setViewAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const reset = () => setPage(1);
  const { query, applyNow } = useDebouncedQuery(q, useCallback(() => setPage(1), []));
  const buildParams = (size: number, pg: number) => new URLSearchParams({ posIds: posIds.join(','), q: query, page: String(pg), size: String(size), sort, sellerId, group, team });
  // Số "lần cuối" hiện ngay từ trình duyệt (useApi), máy chủ trả số mới thì thay; đổi bộ lọc / gõ tìm / đổi trang thì tải lại theo URL mới (request cũ bị huỷ).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const url = useMemo(() => `/api/reports/customers?${buildParams(viewAll ? 5000 : 50, viewAll ? 1 : page)}`, [posIds, query, group, page, sort, sellerId, team, viewAll]);
  const { data, at, stale, loading, error, reload } = useApi<CustomerList>(url);
  const g = data?.groups, nets = data?.groupNets;
  const dormantTotal = g ? DORMANT_KEYS.reduce((a, k) => a + (g[k] ?? 0), 0) : 0;
  const dormantNet = nets ? DORMANT_KEYS.reduce((a, k) => a + (nets[k] ?? 0), 0) : 0;
  const priority = (c: Customer): { tone: 'red' | 'orange' | 'gray'; label: string } =>
    (c.daysSinceSuccess ?? 0) > 90 && c.successNet >= 1_000_000 ? { tone: 'red', label: 'Nguy cơ cao' }
      : (c.daysSinceSuccess ?? 0) > 60 || c.successNet >= 2_000_000 ? { tone: 'orange', label: 'Cần chú ý' } : { tone: 'gray', label: 'Theo dõi' };
  const listSort = customerSort(sort, (v) => { reset(); setSort(v); });
  const searching = loading && q.trim() !== '' && q.trim() === query;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Số liệu Pancake POS tại thời điểm đồng bộ" title="Khách lâu chưa mua" subtitle="Theo số ngày từ lần mua thành công gần nhất"
        actions={<><StaleChip stale={stale} at={at} loading={loading} error={data ? error : null} onRetry={reload} /><Button variant="outline" disabled={!data || exporting} onClick={async () => {
          if (!data) return;
          setExporting(true);
          // Xuất toàn bộ nhóm đang chọn theo bộ lọc (tối đa 20.000 khách).
          const all = await fetchReport<CustomerList>(`/api/reports/customers?${buildParams(20000, 1)}`);
          const rows = all.data?.customers ?? data.customers;
          try { await exportRows(`khach-lau-chua-mua_${group}`, [{
          title: 'Khách lâu chưa mua', rows: [['POS', 'SĐT', 'Tên', 'Phụ trách', 'Mua TC', 'Tổng tiền mua', 'Mua gần nhất', 'Ngày chưa mua', 'Sản phẩm hay mua', 'Ưu tiên'],
            ...rows.map((c) => [c.posName, c.phone, c.name, c.sellerName, c.successOrders, c.successNet, dt(c.lastSuccessAt), c.daysSinceSuccess, c.products[0]?.name ?? '', priority(c).label])],
        }]); } finally { setExporting(false); }
        }}>{exporting ? 'Đang xuất…' : 'Xuất Excel toàn bộ'}</Button></>} />
      {!data && !error && <SkeletonKpis count={6} className="xl:grid-cols-6" />}
      {g && nets && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={Users} tone="green" label="Tổng khách cần chăm sóc" value={vi.format(dormantTotal)} countUp rawValue={dormantTotal} note={`${pct(g.total ? dormantTotal / g.total * 100 : null)} tổng khách đã mua`}
            tooltip={tip('Tổng khách cần chăm sóc', [['Số khách', `${vi.format(dormantTotal)} khách`], ['Tỷ lệ trên khách đã mua', pct(g.total ? dormantTotal / g.total * 100 : null)]], data?.definitions.dormant)} />
          {DORMANT_KEYS.map((k) => (
            <KpiCard key={k} icon={Clock} tone={DORMANT_TONES[k]} label={GROUP_LABELS[k]} value={vi.format(g[k] ?? 0)} countUp rawValue={g[k] ?? 0}
              note={`${pct(dormantTotal ? (g[k] ?? 0) / dormantTotal * 100 : null)} · ${shortMoney(nets[k] ?? 0)} đã mua`} onClick={() => { reset(); setGroup(k); }} active={group === k}
              tooltip={tip(GROUP_LABELS[k], [['Số khách', `${vi.format(g[k] ?? 0)} khách`], ['Tỷ trọng nhóm chăm sóc', pct(dormantTotal ? (g[k] ?? 0) / dormantTotal * 100 : null)], ['Giá trị đã mua', money(nets[k] ?? 0)]], 'Khách có lần mua thành công gần nhất cách đây trong khoảng ngày này. Bấm để xem danh sách.')} />
          ))}
          <KpiCard icon={Wallet} tone="purple" label="Giá trị đã mua của nhóm" value={shortMoney(dormantNet)} note="Tổng tiền các khách này từng mua thành công"
            tooltip={tip('Giá trị đã mua của nhóm', [['Tổng', money(dormantNet)], ...DORMANT_KEYS.map((k) => [GROUP_LABELS[k], money(nets[k] ?? 0)] as [string, string])], 'Cộng dồn doanh thu đơn thành công của mọi khách trong 4 nhóm lâu chưa mua.')} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ChartCard icon={Layers} title="Phân bổ khách theo thời gian chưa mua" subtitle="Tỷ trọng khách theo nhóm ngày chưa mua lại · bấm một cung để lọc danh sách" loading={!g}>
          {g ? <Donut centerValue={vi.format(dormantTotal)} centerRaw={dormantTotal} centerLabel="khách" slices={DORMANT_KEYS.map((k) => ({ key: k, label: GROUP_LABELS[k], value: g[k] ?? 0, color: DORMANT_COLORS[k] }))} onSelect={(s) => { reset(); setGroup(s.key); }} /> : <div className="h-44" />}
        </ChartCard>
        <ChartCard icon={Phone} title="Khách cần liên hệ trước" subtitle={`Top khách có giá trị cao nhất trong nhóm ${GROUP_LABELS[group]}`} loading={!data}>
          {data ? (
            data.customers.length ? (
              <ol className="space-y-0.5">
                {data.customers.slice(0, 5).map((c, i) => (
                  <li key={`${c.posId}:${c.phone}`}>
                    <button type="button" onClick={() => void open(c)}
                      className="ctx-row grid w-full grid-cols-[28px_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-lg px-2 py-2 text-left transition-colors duration-[var(--dur)] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <span className={`num grid size-7 place-items-center rounded-full text-xs ${i === 0 ? 'bg-t-orange-bg text-t-orange' : i === 1 ? 'bg-warn-bg text-warn' : 'bg-tint text-primary'}`}>{i + 1}</span>
                      <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-ink">{c.name || 'Khách chưa có tên'} <span className="num text-xs text-ink-3">{c.phone}</span></span><span className="block truncate text-xs text-ink-3">{c.posName} · {c.sellerName}</span></span>
                      <span className="text-right"><span className="num block text-[13px] text-bad">{c.daysSinceSuccess ?? '—'} ngày</span><span className="block text-[10px] text-ink-3">chưa mua</span></span>
                      <span className="text-right"><span className="num block text-[13px] text-ink">{money(c.successNet)}</span><span className="block text-[10px] text-ink-3">giá trị đã mua</span></span>
                      <ContextLine className="col-span-full" indent={40}>Mua gần nhất {dt(c.lastSuccessAt)} · {vi.format(c.successOrders)} đơn thành công{c.products[0] ? ` · hay mua ${c.products[0].name}` : ''} · {priority(c).label}</ContextLine>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <EmptyState text="Không có khách trong nhóm này." />
          ) : <div className="h-44" />}
        </ChartCard>
      </div>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} onSubmit={applyNow} searching={searching} />
        <div className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1 py-0.5">
          <SegmentedControl ariaLabel="Nhóm ngày chưa mua" size="sm" value={group} onChange={(k) => { reset(); setGroup(k); }}
            options={[...DORMANT_KEYS, 'never'].map((k) => ({ value: k, label: <>{GROUP_LABELS[k]}{g ? <span className="num ml-1 text-[10.5px] opacity-80">{vi.format(g[k] ?? 0)}</span> : null}</> }))} />
        </div>
        <span className="pl-2 text-sm font-semibold text-ink-2">Sắp xếp</span>
        <Select value={sort} items={SORTS} onValueChange={(v) => { reset(); setSort(String(v)); }}>
          <SelectTrigger className="min-w-52" aria-label="Sắp xếp"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <span className="pl-2 text-sm font-semibold text-ink-2">Phụ trách</span>
        <EmployeeSelect value={sellerId} onChange={(v) => { reset(); setSellerId(v); }} employees={employees} />
      </Toolbar>
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <ChartCard icon={Users} title="Danh sách khách" subtitle="Đang tải…"><SkeletonTable rows={8} cols={8} /></ChartCard>}
      {data && (
        <ChartCard icon={Users} title={`Danh sách ${GROUP_LABELS[group].toLowerCase()} · ${vi.format(data.total)} khách`} subtitle={`${data.definitions.dormant} Bấm tiêu đề cột để sắp xếp.`} bodyClassName={loading ? 'opacity-70 transition-opacity duration-[var(--dur)]' : 'transition-opacity duration-[var(--dur)]'}
          action={<div className="flex items-center gap-2">{!viewAll && <Pager page={page} hasMore={data.hasMore} disabled={loading} onPage={setPage} />}<Button size="sm" variant={viewAll ? 'default' : 'outline'} aria-pressed={viewAll} onClick={() => { setViewAll(!viewAll); setPage(1); }} title="Tải một lượt tới 5.000 khách theo bộ lọc hiện tại">{viewAll ? 'Theo trang' : 'Xem toàn bộ'}</Button></div>}>
          {data.customers.length ? (
            <TableWrap minWidth={1040} stickyFirst>
              <table className="tbl">
                <thead><tr>
                  <th className="w-8">#</th>
                  <SortTh k="name" label="Tên khách hàng" sort={listSort} align="left" />
                  <th>SĐT</th><th>POS</th>
                  <SortTh k="recent" label="Lần mua gần nhất" sort={listSort} align="left" />
                  <SortTh k="dormant" label="Ngày chưa mua" sort={listSort} />
                  <SortTh k="spend" label="Giá trị đã mua" sort={listSort} />
                  <SortTh k="orders" label="Mua TC" sort={listSort} />
                  <th>Sản phẩm hay mua</th><th>Nhân viên phụ trách</th><th>Ưu tiên</th>
                </tr></thead>
                <tbody>
                  {data.customers.map((c, i) => {
                    const p = priority(c);
                    return (
                      <tr key={`${c.posId}:${c.phone}`} tabIndex={0} onClick={() => void open(c)} onKeyDown={rowKeys(() => void open(c))} className={rowCls()}>
                        <td className="num text-[11px] text-ink-4">{(page - 1) * 50 + i + 1}</td>
                        <td className="font-medium text-ink"><span className="inline-flex items-center gap-2">{c.name || 'Khách chưa có tên'}<HoverReveal><span className="btn sm">Hồ sơ<ChevronRight size={12} /></span></HoverReveal></span></td>
                        <td className="num text-xs">{c.phone}</td>
                        <td className="text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posVar(c.posId) }} />{c.posName}</td>
                        <td className="num">{dt(c.lastSuccessAt)}</td>
                        <td className="n text-bad">{c.daysSinceSuccess ?? '—'} ngày</td>
                        <td className="n">{money(c.successNet)}</td>
                        <td className="n">{vi.format(c.successOrders)}</td>
                        <td className="max-w-56 truncate text-xs" title={c.products.map((x) => `${x.name} ×${x.quantity}`).join(', ')}>{c.products[0]?.name ?? '—'}</td>
                        <td className="text-xs">{c.sellerName}</td>
                        <td><StatusChip tone={p.tone}>{p.tone === 'red' && <AlertTriangle size={11} aria-hidden="true" />}{p.label}</StatusChip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          ) : <EmptyState text={query ? `Không có khách nào khớp "${query}".` : 'Không có khách phù hợp bộ lọc.'} />}
          <p className="mt-3 text-xs text-ink-3">Ưu tiên: Nguy cơ cao = trên 90 ngày và đã mua ≥ 1 triệu; Cần chú ý = trên 60 ngày hoặc đã mua ≥ 2 triệu. Bấm vào khách để xem lịch sử mua.</p>
        </ChartCard>
      )}
      {data && <Definitions items={data.definitions} />}
      <CustomerDialog detail={detail} loading={detailLoading} error={detailError} onClose={close} onRetry={retry} />
    </div>
  );
}

// ---------- Mua lại & Upsell ----------
type Level = { level: number; label: string; customers: number; orders: number; net: number };
type Repurchase = {
  period: { start: string; end: string };
  summary: { levels: Level[]; repurchase: { customers: number; orders: number; net: number }; successOrders: number };
  funnel: { once: number; twice: number; thrice: number };
  cohorts: { month: string; size: number; retention: (number | null)[] }[];
  byPos: { posId: string; posName: string; levels: Level[]; repurchase: { customers: number; orders: number; net: number } }[];
  byEmployee: { sellerId: string; name: string; levels: Level[]; repurchase: { customers: number; orders: number; net: number } }[];
  filters?: { tag: string | null; sellerId: string | null };
  byTag?: TagRow[];
  recent: { posId: string; posName: string; phone: string; createdAt: string; net: number; level: number; prior: number; sellerName: string; tags?: string[] }[];
  definitions: Record<string, string>;
};
type TagRow = { tag: string; orders: number; customers: number; net: number; resaleOrders: number; resaleCustomers: number; resaleNet: number; resaleRate: number | null };

export function RepurchaseView() {
  const today = todayVn();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const team = useTeam();
  // Lọc theo thẻ dòng sản phẩm (mua lại = đã có đơn CÙNG thẻ trước đó) và theo nhân viên.
  const [tag, setTag] = useState('');
  const [sellerId, setSellerId] = useState('');
  const employees = useEmployees();
  const { detail, loading: detailLoading, error: detailError, open, close, retry } = useDetail();
  // Số "lần cuối" hiện ngay từ trình duyệt (useApi), máy chủ trả số mới thì thay; đổi kỳ / POS / thẻ / nhân viên thì tải lại theo URL mới (request cũ bị huỷ).
  const url = useMemo(() => `/api/reports/repurchase?${new URLSearchParams({ posIds: posIds.join(','), start, end, team, tag, sellerId })}`, [posIds, start, end, team, tag, sellerId]);
  const { data, at, stale, loading, error, reload: refetch } = useApi<Repurchase>(url);
  // "Tải lại" báo toast khi tải xong không lỗi (như trước).
  const manualRef = useRef(false);
  const reload = () => { manualRef.current = true; refetch(); };
  useEffect(() => { if (!loading && manualRef.current) { manualRef.current = false; if (!error) toast('Đã cập nhật số liệu mua lại'); } }, [loading, error]);
  const levelCells = (levels: Level[]) => levels.map((l) => (
    <td key={l.level} className="n">{vi.format(l.customers)}<span className="font-normal tracking-normal text-ink-3"> khách · </span>{vi.format(l.orders)}<span className="font-normal tracking-normal text-ink-3"> đơn</span><div className="text-xs text-ink-3">{money(l.net)}</div></td>
  ));
  const totalNet = data ? data.summary.levels.reduce((a, l) => a + l.net, 0) : 0;
  const tagRows = useMemo(() => data?.byTag ?? [], [data]);
  const tagOptions = useMemo(() => { const names = tagRows.map((t) => t.tag); return tag && !names.includes(tag) ? [tag, ...names] : names; }, [tagRows, tag]);
  const tagTotal = useMemo(() => tagRows.reduce((a, t) => ({ orders: a.orders + t.orders, resaleOrders: a.resaleOrders + t.resaleOrders, net: a.net + t.net, resaleNet: a.resaleNet + t.resaleNet }), { orders: 0, resaleOrders: 0, net: 0, resaleNet: 0 }), [tagRows]);
  const sellerName = sellerId ? employees.find((e) => e.id === sellerId)?.name ?? data?.byEmployee.find((e) => e.sellerId === sellerId)?.name ?? sellerId : '';
  const scopeLabel = [tag ? `thẻ ${tag}` : '', sellerName ? `NV ${sellerName}` : ''].filter(Boolean).join(' · ');
  const maxT = data ? Math.max(1, ...data.cohorts.map((c) => c.retention.length)) : 1;
  const periodLabel = `${dmy(start)} – ${dmy(end)}`;
  // Bộ lọc / sắp xếp bảng nhân viên và bảng đơn mua lại gần đây.
  const empSort = useSort<EmpSortKey>('rep');
  const [empQ, setEmpQ] = useState('');
  const empRows = useMemo(() => empSort.apply((data?.byEmployee ?? []).filter((p) => !empQ || p.name.toLowerCase().includes(empQ.toLowerCase())), (p, k) =>
    k === 'name' ? p.name : k === 'rep' ? p.repurchase.customers : k === 'repNet' ? p.repurchase.net : k.startsWith('l') ? (p.levels[Number(k.slice(1))]?.customers ?? 0) : 0), [data, empQ, empSort.key, empSort.desc]); // eslint-disable-line react-hooks/exhaustive-deps
  const recSort = useSort<'time' | 'net' | 'prior'>('time');
  const [recQ, setRecQ] = useState(''); const [recPos, setRecPos] = useState('all'); const [recLevel, setRecLevel] = useState('all'); const [recSeller, setRecSeller] = useState('all');
  const recSellers = useMemo(() => [...new Set((data?.recent ?? []).map((r) => r.sellerName).filter((n) => n && n !== '—'))].sort((a, b) => a.localeCompare(b, 'vi')), [data]);
  const recRows = useMemo(() => recSort.apply((data?.recent ?? []).filter((r) => (recPos === 'all' || r.posId === recPos) && (recLevel === 'all' || (recLevel === '3' ? r.prior >= 3 : r.prior === Number(recLevel))) && (recSeller === 'all' || r.sellerName === recSeller) && (!recQ || r.phone.includes(recQ))),
    (r, k) => k === 'time' ? r.createdAt : k === 'net' ? r.net : r.prior), [data, recQ, recPos, recLevel, recSeller, recSort.key, recSort.desc]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}${scopeLabel ? ` · ${scopeLabel}` : ''}`} title="Mua lại & Upsell" subtitle={tag ? `Đang xem thẻ "${tag}": mua lại = khách đã có đơn thành công CÙNG thẻ này trước đó; đơn thẻ khác không tính` : 'Đơn mua lại = đơn thành công thứ 2 trở đi của cùng SĐT'}
        actions={<><StaleChip stale={stale} at={at} loading={loading} error={data ? error : null} onRetry={reload} /><Button disabled={!data} onClick={() => data && exportRows(`mua-lai_${start}_${end}`, [
          { title: 'Tổng hợp', rows: [['Mức', 'Khách', 'Đơn', 'Doanh thu'], ...data.summary.levels.map((l) => [l.label, l.customers, l.orders, l.net])] },
          { title: 'Cohort', rows: [['Tháng mua đầu', 'Số khách', ...Array.from({ length: maxT }, (_, i) => `T${i}`)], ...data.cohorts.map((c) => [c.month, c.size, ...c.retention.map((v) => v ?? '')])] },
          { title: 'Theo POS', rows: [['POS', ...data.summary.levels.flatMap((l) => [`${l.label} - khách`, `${l.label} - đơn`, `${l.label} - tiền`])], ...data.byPos.map((p) => [p.posName, ...p.levels.flatMap((l) => [l.customers, l.orders, l.net])])] },
          { title: 'Theo nhân viên', rows: [['Nhân viên', 'Khách mua lại', 'Đơn mua lại', 'Doanh thu mua lại', ...data.summary.levels.flatMap((l) => [`${l.label} - khách`, `${l.label} - đơn`, `${l.label} - tiền`])], ...data.byEmployee.map((p) => [p.name, p.repurchase.customers, p.repurchase.orders, p.repurchase.net, ...p.levels.flatMap((l) => [l.customers, l.orders, l.net])])] },
          { title: 'Theo thẻ', rows: [['Thẻ', 'Đơn có thẻ', 'Khách', 'Doanh thu', 'Đơn mua lại', 'Khách mua lại', 'Tỷ lệ mua lại %', 'Doanh thu mua lại'], ...tagRows.map((t) => [t.tag, t.orders, t.customers, t.net, t.resaleOrders, t.resaleCustomers, t.resaleRate ?? '', t.resaleNet])] },
          { title: 'Đơn mua lại gần đây', rows: [['POS', 'SĐT', 'Ngày tạo', 'Lần mua lại', 'Tiền', 'Người bán', 'Thẻ'], ...data.recent.map((r) => [r.posName, r.phone, dt(r.createdAt, true), `Upsell ${r.prior}`, r.net, r.sellerName, (r.tags ?? []).join(', ')])] },
        ])}>Xuất Excel</Button></>} />
      <Toolbar>
        <RangePicker preset={preset} start={start} end={end} onChange={(p, s, e) => { setPreset(p); setStart(s); setEnd(e); }} />
        <span className="pl-2 text-sm font-semibold text-ink-2">Thẻ</span>
        <Select value={tag || '__all'} items={{ __all: 'Tất cả thẻ', ...Object.fromEntries(tagOptions.map((t) => [t, t])) }} onValueChange={(v) => setTag(v === '__all' ? '' : String(v))}>
          <SelectTrigger className="min-w-44" aria-label="Lọc theo thẻ dòng sản phẩm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả thẻ</SelectItem>{tagOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <span className="pl-2 text-sm font-semibold text-ink-2">Nhân viên</span>
        <EmployeeSelect value={sellerId} onChange={setSellerId} employees={employees} />
        <Button className="ml-auto" variant="outline" onClick={reload} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && (
        <>
          <SkeletonKpis count={5} className="xl:grid-cols-5" />
          <ChartCard icon={TrendingUp} title="Tỷ lệ mua lại theo tháng mua đầu tiên" subtitle="Đang tải…"><SkeletonTable rows={6} cols={8} /></ChartCard>
        </>
      )}
      {data && (
        <>
          <div className={`grid grid-cols-2 gap-3 transition-opacity duration-[var(--dur)] sm:gap-4 xl:grid-cols-5 ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
            <KpiCard icon={Users} tone="green" label="Khách đã mua (trọn đời)" value={vi.format(data.funnel.once)} countUp rawValue={data.funnel.once} note={`Đã mua thành công ≥ 1 lần${scopeLabel ? ` · ${scopeLabel}` : ''}`}
              tooltip={tip('Khách đã mua (trọn đời)', [['Số khách', `${vi.format(data.funnel.once)} khách`]], data.definitions.funnel)} />
            <KpiCard icon={Repeat} tone="teal" label="Khách mua lại (trọn đời)" value={vi.format(data.funnel.twice)} countUp rawValue={data.funnel.twice} note={`Mua từ lần 2 trở lên${scopeLabel ? ` · ${scopeLabel}` : ''}`}
              tooltip={tip('Khách mua lại (trọn đời)', [['Mua ≥ 2 lần', `${vi.format(data.funnel.twice)} khách`], ['Mua ≥ 3 lần', `${vi.format(data.funnel.thrice)} khách`]], data.definitions.funnel)} />
            <KpiCard icon={BadgePercent} tone="blue" label="Tỷ lệ mua lại" value={pct(data.funnel.once ? data.funnel.twice / data.funnel.once * 100 : null)} note={`${vi.format(data.funnel.thrice)} khách mua ≥ 3 lần`}
              tooltip={tip('Tỷ lệ mua lại', [['Mua lại ÷ đã mua', `${vi.format(data.funnel.twice)} / ${vi.format(data.funnel.once)}`], ['Tỷ lệ', pct(data.funnel.once ? data.funnel.twice / data.funnel.once * 100 : null)]], 'Số khách mua thành công từ 2 lần ÷ số khách đã mua thành công ít nhất 1 lần (trọn đời, các POS đã chọn).')} />
            <KpiCard icon={Wallet} tone="orange" label="Doanh thu mua lại trong kỳ" value={shortMoney(data.summary.repurchase.net)} countUp rawValue={data.summary.repurchase.net} format={shortMoney} note={`${pct(totalNet ? data.summary.repurchase.net / totalNet * 100 : null)} doanh thu đơn thành công trong kỳ`}
              tooltip={{ period: periodLabel, current: money(data.summary.repurchase.net), previous: money(totalNet), previousLabel: 'Tổng đơn thành công', diff: pct(totalNet ? data.summary.repurchase.net / totalNet * 100 : null), definition: `${data.definitions.basis} ${data.definitions.upsell}` }} />
            <KpiCard icon={ShoppingBag} tone="purple" label="Đơn mua lại trong kỳ" value={vi.format(data.summary.repurchase.orders)} countUp rawValue={data.summary.repurchase.orders} note={`${vi.format(data.summary.repurchase.customers)} khách · ${vi.format(data.summary.successOrders)} đơn thành công trong kỳ`}
              tooltip={{ period: periodLabel, current: `${vi.format(data.summary.repurchase.orders)} đơn · ${vi.format(data.summary.repurchase.customers)} khách`, previous: `${vi.format(data.summary.successOrders)} đơn`, previousLabel: 'Đơn thành công trong kỳ', definition: data.definitions.basis }} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <ChartCard icon={TrendingUp} title="Tỷ lệ mua lại theo tháng mua đầu tiên" subtitle={`Cohort từ 03/2025${scopeLabel ? ` · ${scopeLabel}` : ''}: % khách của mỗi nhóm có đơn thành công ở tháng thứ n kể từ tháng mua đầu (T0)`} info={data.definitions.cohort}>
              {data.cohorts.length ? (
                <TableWrap minWidth={Math.max(420, 150 + maxT * 52)} stickyFirst>
                  <table className="tbl text-xs [&_td]:px-1.5 [&_td]:py-1 [&_th]:px-1.5">
                    <thead><tr><th>Tháng đầu</th><th className="n">Khách</th>{Array.from({ length: maxT }, (_, i) => <th key={i} className="text-center">T{i}</th>)}</tr></thead>
                    <tbody>
                      {data.cohorts.map((c) => (
                        <tr key={c.month}>
                          <td className="num text-ink">{c.month.slice(5)}/{c.month.slice(0, 4)}</td>
                          <td className="n">{vi.format(c.size)}</td>
                          {Array.from({ length: maxT }, (_, i) => {
                            const v = i < c.retention.length ? c.retention[i] : null;
                            return <td key={i} className="text-center"><span className="num inline-block w-11 rounded-[4px] py-1 text-[12px] transition-[filter] duration-[var(--dur)] hover:brightness-[1.08]" style={heat(v)} title={v === null ? 'Chưa tới tháng này' : `Nhóm ${c.month.slice(5)}/${c.month.slice(0, 4)} · T${i}: ${pct(v)}`}>{v === null ? '·' : `${Math.round(v)}%`}</span></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              ) : <EmptyState text="Chưa đủ lịch sử để dựng cohort." />}
            </ChartCard>
            <ChartCard icon={Layers} title="Mua lần 1 → lần 2 → lần 3+" subtitle={`Hành trình mua lại của khách (trọn đời, các POS đã chọn${scopeLabel ? ` · ${scopeLabel}` : ''})`} info={data.definitions.funnel}>
              <Funnel steps={[
                { label: 'Đã mua lần 1', value: data.funnel.once, note: 'khách đã mua thành công' },
                { label: 'Mua lần 2', value: data.funnel.twice, note: `${pct(data.funnel.once ? data.funnel.twice / data.funnel.once * 100 : null)} chuyển đổi` },
                { label: 'Mua lần 3+', value: data.funnel.thrice, note: `${pct(data.funnel.twice ? data.funnel.thrice / data.funnel.twice * 100 : null)} chuyển đổi` },
              ]} />
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {data.summary.levels.map((l) => (
                  <div key={l.level} className="rounded-[10px] bg-surface-2 p-2.5 transition-colors duration-[var(--dur)] hover:bg-surface-3"><div className="truncate text-ink-3" title={`${l.label} (kỳ)`}>{l.label} (kỳ)</div><div className="num whitespace-nowrap text-base text-ink">{vi.format(l.customers)} <span className="text-xs font-normal tracking-normal text-ink-3">khách</span></div><div className="text-ink-2"><span className="num">{vi.format(l.orders)}</span> đơn · <span className="num">{shortMoney(l.net)}</span></div></div>
                ))}
              </div>
            </ChartCard>
          </div>
          <ChartCard icon={Tag} title={`Theo thẻ · ${tagRows.length} dòng sản phẩm`} subtitle={`${data.definitions.tag ?? ''} Bấm một dòng để lọc cả trang theo thẻ đó.`}
            action={tag ? <Button size="sm" variant="ghost" onClick={() => setTag('')}>Bỏ lọc thẻ</Button> : undefined}>
            {tagRows.length ? (
              <TableWrap maxHeight="24rem" minWidth={640}>
                <table className="tbl">
                  <thead><tr><th>Thẻ</th><th className="n">Đơn có thẻ</th><th className="n">Khách</th><th className="n">Mua lần đầu (thẻ)</th><th className="n">Đơn mua lại</th><th className="n">Khách mua lại</th><th className="n">Tỷ lệ mua lại</th><th className="n">Doanh thu mua lại</th></tr></thead>
                  <tbody>{tagRows.map((t) => {
                    const on = tag === t.tag; const pick = () => setTag(on ? '' : t.tag);
                    return (
                      <tr key={t.tag} tabIndex={0} aria-selected={on} onClick={pick} onKeyDown={rowKeys(pick)} className={`cursor-pointer focus-visible:-outline-offset-2 ${on ? '[&>td]:bg-tint-2' : ''}`}>
                        <td className="font-medium text-ink"><span className="inline-flex items-center gap-2">{t.tag}<HoverReveal><span className="btn sm font-medium tracking-normal">{on ? 'Bỏ lọc' : 'Lọc'}<ChevronRight size={12} /></span></HoverReveal></span></td>
                        <td className="n">{vi.format(t.orders)}<div className="text-xs font-normal text-ink-3">{money(t.net)}</div></td>
                        <td className="n">{vi.format(t.customers)}</td>
                        <td className="n">{vi.format(t.orders - t.resaleOrders)}</td>
                        <td className="n">{vi.format(t.resaleOrders)}</td>
                        <td className="n">{vi.format(t.resaleCustomers)}</td>
                        <td className={`n ${t.resaleRate === null ? 'mut' : t.resaleRate >= 30 ? 'text-primary' : t.resaleRate >= 15 ? 'text-warn' : 'text-bad'}`}>{pct(t.resaleRate)}</td>
                        <td className="n">{money(t.resaleNet)}</td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot><tr className="font-semibold [&>td]:bg-surface-2"><td>Tổng</td><td className="n">{vi.format(tagTotal.orders)}<div className="text-xs font-normal text-ink-3">{money(tagTotal.net)}</div></td><td className="n mut">—</td><td className="n">{vi.format(tagTotal.orders - tagTotal.resaleOrders)}</td><td className="n">{vi.format(tagTotal.resaleOrders)}</td><td className="n mut">—</td><td className="n">{pct(tagTotal.orders ? tagTotal.resaleOrders / tagTotal.orders * 100 : null)}</td><td className="n">{money(tagTotal.resaleNet)}</td></tr></tfoot>
                </table>
              </TableWrap>
            ) : <EmptyState text="Đơn trong kỳ chưa gắn thẻ dòng sản phẩm nào." />}
            <p className="mt-2 text-xs text-ink-3">Một đơn có nhiều thẻ được tính ở từng thẻ, nên dòng Tổng có thể lớn hơn số đơn thành công trong kỳ.</p>
          </ChartCard>
          <ChartCard icon={Layers} title="Theo POS" subtitle={data.definitions.upsell}>
            <TableWrap minWidth={720}>
              <table className="tbl">
                <thead><tr><th>POS</th>{data.summary.levels.map((l) => <th key={l.level} className="n">{l.label}</th>)}<th className="n">Mua lại (gộp)</th></tr></thead>
                <tbody>{data.byPos.map((p) => <tr key={p.posId}><td className="font-medium text-ink"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posVar(p.posId) }} />{p.posName}</td>{levelCells(p.levels)}<td className="n">{vi.format(p.repurchase.customers)}<span className="font-normal tracking-normal text-ink-3"> khách · </span>{money(p.repurchase.net)}</td></tr>)}</tbody>
              </table>
            </TableWrap>
          </ChartCard>
          <ChartCard icon={UserCheck} title={`Theo nhân viên · ${empRows.length}`} subtitle={`${data.definitions.employee} Bấm tiêu đề cột để sắp xếp.`}
            action={<div className="flex flex-wrap items-center gap-2">
              <Input className="w-40" placeholder="Tìm tên nhân viên" aria-label="Tìm tên nhân viên" value={empQ} onChange={(e) => setEmpQ(e.target.value)} />
              <Select value={empSort.key} items={EMP_SORT_LABELS} onValueChange={(v) => { empSort.setKey(v as EmpSortKey); empSort.setDesc(v !== 'name'); }}>
                <SelectTrigger className="min-w-40" aria-label="Sắp xếp nhân viên"><span className="text-ink-3">Xếp:&nbsp;</span><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EMP_SORT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => empSort.setDesc(!empSort.desc)}>{empSort.desc ? 'Cao → thấp' : 'Thấp → cao'}</Button>
            </div>}>
            {empRows.length ? (
              <TableWrap maxHeight="32rem" minWidth={800} stickyFirst>
                <table className="tbl">
                  <thead><tr><th className="w-8">#</th><SortTh k="name" label="Nhân viên" sort={empSort} align="left" />{data.summary.levels.map((l, i) => <SortTh key={l.level} k={`l${i}`} label={l.label} sort={empSort} />)}<SortTh k="rep" label="Mua lại (gộp)" sort={empSort} /></tr></thead>
                  <tbody>{empRows.map((p, i) => <tr key={p.sellerId || 'none'}><td className="num text-[11px] text-ink-4">{i + 1}</td><td className="font-medium text-ink">{p.name}</td>{levelCells(p.levels)}<td className="n">{vi.format(p.repurchase.customers)}<span className="font-normal tracking-normal text-ink-3"> khách · </span>{money(p.repurchase.net)}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Không có nhân viên khớp bộ lọc." />}
          </ChartCard>
          <ChartCard icon={ShoppingBag} title={`Đơn mua lại gần đây · ${recRows.length}`} subtitle={`${data.definitions.basis} Bấm một dòng để mở hồ sơ khách.`}
            action={<div className="flex flex-wrap items-center gap-2">
              <Input className="w-36" placeholder="Tìm SĐT" aria-label="Tìm SĐT" value={recQ} onChange={(e) => setRecQ(e.target.value.trim())} />
              <Select value={recPos} items={{ all: 'Mọi POS', ...Object.fromEntries(POS.map((p) => [p.id, p.name])) }} onValueChange={(v) => setRecPos(String(v))}><SelectTrigger className="min-w-32" aria-label="POS"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Mọi POS</SelectItem>{POS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
              <Select value={recLevel} items={{ all: 'Mọi lần', '1': 'Upsell 1', '2': 'Upsell 2', '3': 'Upsell 3+' }} onValueChange={(v) => setRecLevel(String(v))}><SelectTrigger className="min-w-28" aria-label="Lần mua lại"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Mọi lần</SelectItem><SelectItem value="1">Upsell 1</SelectItem><SelectItem value="2">Upsell 2</SelectItem><SelectItem value="3">Upsell 3+</SelectItem></SelectContent></Select>
              <Select value={recSeller} items={{ all: 'Mọi người bán', ...Object.fromEntries(recSellers.map((n) => [n, n])) }} onValueChange={(v) => setRecSeller(String(v))}><SelectTrigger className="min-w-36" aria-label="Người bán"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Mọi người bán</SelectItem>{recSellers.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select>
            </div>}>
            {recRows.length ? (
              <TableWrap maxHeight="24rem" minWidth={720} stickyFirst>
                <table className="tbl">
                  <thead><tr><SortTh k="time" label="Ngày tạo" sort={recSort} align="left" /><th>POS</th><th>SĐT</th><SortTh k="prior" label="Lần" sort={recSort} align="left" /><th>Người bán</th><th>Thẻ</th><SortTh k="net" label="Doanh thu" sort={recSort} /></tr></thead>
                  <tbody>{recRows.map((r, i) => <tr key={i} tabIndex={0} onClick={() => void open({ posId: r.posId, phone: r.phone })} onKeyDown={rowKeys(() => void open({ posId: r.posId, phone: r.phone }))} className={rowCls()}><td className="num"><span className="inline-flex items-center gap-2">{dt(r.createdAt, true)}<HoverReveal><span className="btn sm font-medium tracking-normal">Hồ sơ<ChevronRight size={12} /></span></HoverReveal></span></td><td className="text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posVar(r.posId) }} />{r.posName}</td><td className="num">{r.phone}</td><td><StatusChip tone={r.prior >= 3 ? 'purple' : r.prior === 2 ? 'teal' : 'green'}>Upsell {r.prior}</StatusChip></td><td className="text-xs">{r.sellerName}</td><td><div className="flex flex-wrap gap-1">{(r.tags ?? []).map((t) => <span key={t} className={`rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase ${t === tag ? 'border-primary/40 bg-tint text-primary' : 'border-line-2 bg-surface-2 text-ink-2'}`}>{t}</span>)}</div></td><td className="n">{money(r.net)}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Không có đơn khớp bộ lọc." />}
            <p className="mt-2 text-xs text-ink-3">Hiện tối đa 400 đơn mua lại mới nhất trong kỳ; bấm một dòng để mở hồ sơ khách.</p>
          </ChartCard>
          <Definitions items={data.definitions} />
        </>
      )}
      <CustomerDialog detail={detail} loading={detailLoading} error={detailError} onClose={close} onRetry={retry} />
    </div>
  );
}

// ---------- Data được cấp ----------
type BatchRow = { posId: string; posName: string; month: string; sellerId: string; sellerName: string; received: number; buyers: number; repeatBuyers: number; buyRate: number | null; orders: number; net: number; months: { month: string; orders: number; net: number }[] };
type Batches = { period: { start: string; end: string }; batches: BatchRow[]; definitions: Record<string, string> };
type AssignSeries = { current: { series: { bucket: string; posId: string; assignedOrders: number }[] } };
type BatchEmpSort = 'received' | 'buyers' | 'buyRate' | 'net' | 'repeat' | 'orders' | 'name';
const BATCH_EMP_LABELS: Record<BatchEmpSort, string> = { received: 'Số được cấp', buyers: 'Đã mua', buyRate: 'Tỷ lệ mua', repeat: 'Mua lại', orders: 'Đơn', net: 'Doanh thu', name: 'Tên' };

export function BatchesView() {
  const today = todayVn();
  const motionOn = useMotionOK();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [empSort, setEmpSort] = useState<BatchEmpSort>('received');
  const [empDesc, setEmpDesc] = useState(true);
  const team = useTeam();
  // Số "lần cuối" hiện ngay từ trình duyệt (useApi), máy chủ trả số mới thì thay; đổi kỳ / POS thì tải lại theo URL mới (request cũ bị huỷ).
  // Báo cáo chính là đợt cấp data; biểu đồ theo ngày lấy từ báo cáo tổng quan (lỗi thì giữ số cũ, không chặn trang).
  const url = useMemo(() => `/api/reports/batches?${new URLSearchParams({ posIds: posIds.join(','), start, end, team })}`, [posIds, start, end, team]);
  const dailyUrl = useMemo(() => `/api/reports/overview?${new URLSearchParams({ posIds: posIds.join(','), start, end, groupBy: 'day', compare: 'none', team })}`, [posIds, start, end, team]);
  const { data, at, stale, loading: batchesLoading, error, reload: refetch } = useApi<Batches>(url);
  const { data: daily, loading: dailyLoading, reload: refetchDaily } = useApi<AssignSeries>(dailyUrl);
  const loading = batchesLoading || dailyLoading;
  // "Tải lại" báo toast khi cả hai tải xong và báo cáo chính không lỗi (như trước).
  const manualRef = useRef(false);
  const reload = () => { manualRef.current = true; refetch(); refetchDaily(); };
  useEffect(() => { if (!loading && manualRef.current) { manualRef.current = false; if (!error) toast('Đã cập nhật số liệu data được cấp'); } }, [loading, error]);

  const months = data ? [...new Set(data.batches.flatMap((b) => b.months.map((m) => m.month)))].sort() : [];
  const totals = useMemo(() => {
    const t = { received: 0, buyers: 0, repeat: 0, orders: 0, net: 0, sellers: new Set<string>() };
    for (const b of data?.batches ?? []) { t.received += b.received; t.buyers += b.buyers; t.repeat += b.repeatBuyers; t.orders += b.orders; t.net += b.net; if (b.sellerId) t.sellers.add(b.sellerId); }
    return t;
  }, [data]);
  const byEmployee = useMemo(() => {
    const map = new Map<string, { sellerId: string; sellerName: string; pos: Set<string>; received: number; buyers: number; repeat: number; orders: number; net: number }>();
    for (const b of data?.batches ?? []) {
      const e = map.get(b.sellerId) ?? { sellerId: b.sellerId, sellerName: b.sellerName, pos: new Set<string>(), received: 0, buyers: 0, repeat: 0, orders: 0, net: 0 };
      e.pos.add(b.posId); e.received += b.received; e.buyers += b.buyers; e.repeat += b.repeatBuyers; e.orders += b.orders; e.net += b.net;
      map.set(b.sellerId, e);
    }
    const v = (e: { received: number; buyers: number; repeat: number; orders: number; net: number }) => empSort === 'buyRate' ? (e.received ? e.buyers / e.received : 0) : empSort === 'name' ? 0 : e[empSort];
    return [...map.values()].sort((a, b) => { const c = empSort === 'name' ? a.sellerName.localeCompare(b.sellerName, 'vi') : v(a) - v(b); return empDesc ? -c : c; });
  }, [data, empSort, empDesc]);
  // Tiêu đề cột và ô "Sắp xếp" dùng chung một trạng thái.
  const empSortState: SortState = {
    key: empSort, desc: empDesc,
    toggle: (k: string) => { if (k === empSort) setEmpDesc((d) => !d); else { setEmpSort(k as BatchEmpSort); setEmpDesc(k !== 'name'); } },
    mark: () => '',
  };
  const batchSort = useSort<'month' | 'pos' | 'seller' | 'received' | 'buyers' | 'buyRate' | 'repeat' | 'orders' | 'net'>('month');
  const batchRows = useMemo(() => batchSort.apply(data?.batches ?? [], (b, k) => k === 'month' ? b.month : k === 'pos' ? b.posName : k === 'seller' ? b.sellerName : k === 'repeat' ? b.repeatBuyers : b[k]), [data, batchSort.key, batchSort.desc]); // eslint-disable-line react-hooks/exhaustive-deps
  const dailySeries = useMemo(() => {
    if (!daily) return [];
    const map = new Map<string, Record<string, number | string>>();
    for (const s of daily.current.series) {
      const row = map.get(s.bucket) ?? { bucket: s.bucket };
      row[s.posId] = Number(row[s.posId] ?? 0) + s.assignedOrders;
      map.set(s.bucket, row);
    }
    return [...map.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
  }, [daily]);
  const chartConfig = Object.fromEntries(POS.map((p) => [p.id, { label: p.name, color: posVar(p.id) }]));
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  const maxReceived = Math.max(1, ...byEmployee.map((e) => e.received));
  // Mức chuẩn = trung vị của những người thực sự nhận data (≥ 20 số trong kỳ), để vài người nhận lẻ tẻ không kéo trung vị xuống và ai cũng thành "quá tải".
  const sortedReceived = byEmployee.map((e) => e.received).filter((n) => n >= 20).sort((a, b) => a - b);
  const medianReceived = sortedReceived.length ? sortedReceived[Math.floor(sortedReceived.length / 2)] : 0;
  const periodLabel = `${dmy(start)} – ${dmy(end)}`;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Data được cấp" subtitle="Data (SĐT) giao cho nhân viên và kết quả chuyển đổi"
        actions={<><StaleChip stale={stale} at={at} loading={loading} error={data ? error : null} onRetry={reload} /><Button disabled={!data} onClick={() => data && exportRows(`data-duoc-cap_${start}_${end}`, [
          { title: 'Theo nhân viên', rows: [['Nhân viên', 'POS', 'Số được cấp', 'Đã mua', 'Tỷ lệ mua %', 'Mua lại', 'Đơn', 'Doanh thu'], ...byEmployee.map((e) => [e.sellerName, [...e.pos].map(posName).join(', '), e.received, e.buyers, e.received ? Number((e.buyers / e.received * 100).toFixed(1)) : '', e.repeat, e.orders, e.net])] },
          { title: 'Đợt cấp data', rows: [['POS', 'Tháng giao', 'Nhân viên', 'Số nhận', 'Số đã mua', 'Tỷ lệ mua %', 'Số mua lại', 'Đơn', 'Doanh thu', ...months],
            ...data.batches.map((b) => [b.posName, b.month, b.sellerName, b.received, b.buyers, b.buyRate === null ? '' : Number(b.buyRate.toFixed(1)), b.repeatBuyers, b.orders, b.net, ...months.map((m) => b.months.find((x) => x.month === m)?.net ?? 0)])] },
        ])}>Xuất Excel</Button></>} />
      <Toolbar>
        <span className="text-sm font-semibold text-ink-2">Tháng giao data</span>
        <RangePicker preset={preset} start={start} end={end} onChange={(p, s, e) => { setPreset(p); setStart(s); setEnd(e); }} />
        <Button className="ml-auto" variant="outline" onClick={reload} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && (
        <>
          <SkeletonKpis count={5} className="xl:grid-cols-5" />
          <ChartCard icon={Users} title="Hiệu suất xử lý data theo nhân viên" subtitle="Đang tải…"><SkeletonTable rows={6} cols={8} /></ChartCard>
        </>
      )}
      {data && (
        <>
          <div className={`grid grid-cols-2 gap-3 transition-opacity duration-[var(--dur)] sm:gap-4 xl:grid-cols-5 ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
            <KpiCard icon={Database} tone="green" label="Tổng số được cấp" value={vi.format(totals.received)} countUp rawValue={totals.received} note={`Trung bình ${vi.format(Math.round(totals.received / days))}/ngày`}
              tooltip={{ period: periodLabel, current: `${vi.format(totals.received)} số · ${vi.format(Math.round(totals.received / days))}/ngày`, definition: data.definitions.batch }} />
            <KpiCard icon={Users} tone="blue" label="Số nhân viên nhận data" value={vi.format(totals.sellers.size)} countUp rawValue={totals.sellers.size} note={`Thuộc ${new Set(data.batches.map((b) => b.posId)).size} POS`}
              tooltip={{ period: periodLabel, current: `${vi.format(totals.sellers.size)} nhân viên · ${new Set(data.batches.map((b) => b.posId)).size} POS`, definition: 'Số người bán khác nhau được giao ít nhất một SĐT trong kỳ (theo người bán hiện tại trên đơn Pancake).' }} />
            <KpiCard icon={UserCheck} tone="teal" label="Đã mua" value={vi.format(totals.buyers)} countUp rawValue={totals.buyers} note={`${pct(totals.received ? totals.buyers / totals.received * 100 : null)} trên tổng số`}
              tooltip={{ period: periodLabel, current: `${vi.format(totals.buyers)} số · ${pct(totals.received ? totals.buyers / totals.received * 100 : null)}`, definition: data.definitions.outcome }} />
            <KpiCard icon={Repeat} tone="purple" label="Mua lại" value={vi.format(totals.repeat)} countUp rawValue={totals.repeat} note={`${pct(totals.buyers ? totals.repeat / totals.buyers * 100 : null)} khách đã mua`}
              tooltip={{ period: periodLabel, current: `${vi.format(totals.repeat)} số · ${pct(totals.buyers ? totals.repeat / totals.buyers * 100 : null)} khách đã mua`, definition: data.definitions.outcome }} />
            <KpiCard icon={Wallet} tone="orange" label="Doanh thu từ data" value={shortMoney(totals.net)} countUp rawValue={totals.net} format={shortMoney} note={`${vi.format(totals.orders)} đơn thành công`}
              tooltip={{ period: periodLabel, current: `${money(totals.net)} · ${vi.format(totals.orders)} đơn`, definition: 'Doanh thu đơn thành công (sau giảm giá) của các SĐT được cấp trong kỳ, tính từ lúc giao trở đi.' }} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ChartCard icon={Database} title="Data được cấp theo ngày" subtitle="Số đơn được giao người bán mỗi ngày, phân theo POS">
              {dailySeries.length ? (
                <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
                  <AreaChart data={dailySeries}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span className="text-ink-3">{posName(String(name))}</span><span className="num text-ink">{vi.format(Number(value))}</span></span>} />} />
                    <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
                    {posIds.map((id) => <Area key={id} type="monotone" dataKey={id} stackId="1" stroke={`var(--color-${id})`} fill={`var(--color-${id})`} fillOpacity={0.35} isAnimationActive={motionOn} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} />)}
                  </AreaChart>
                </ChartContainer>
              ) : <EmptyState text="Chưa có dữ liệu giao người bán trong kỳ." />}
            </ChartCard>
            <ChartCard icon={Layers} title="Chất lượng phân bổ" subtitle="Từ được cấp đến mua thành công">
              <Funnel steps={[
                { label: 'Được cấp', value: totals.received, note: '100%' },
                { label: 'Đã mua', value: totals.buyers, note: pct(totals.received ? totals.buyers / totals.received * 100 : null) },
                { label: 'Mua lại', value: totals.repeat, note: pct(totals.received ? totals.repeat / totals.received * 100 : null) },
              ]} />
            </ChartCard>
          </div>
          <ChartCard icon={Users} title="Hiệu suất xử lý data theo nhân viên" subtitle="Gộp các đợt trong kỳ theo nhân viên · bấm tiêu đề cột để sắp xếp"
            info={`Quá tải = nhận gấp hơn 2 lần mức trung vị của các nhân viên có từ 20 số trong kỳ; Cần theo dõi = hơn 1,5 lần. ${data.definitions.limit}`}
            action={
              <Select value={empSort} items={BATCH_EMP_LABELS} onValueChange={(v) => { setEmpSort(v as BatchEmpSort); setEmpDesc(v !== 'name'); }}>
                <SelectTrigger className="min-w-40 text-xs" aria-label="Sắp xếp"><span className="text-ink-3">Sắp xếp:</span>&nbsp;<SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(BATCH_EMP_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            }>
            {byEmployee.length ? (
              <TableWrap maxHeight="32rem" minWidth={960} stickyFirst>
                <table className="tbl">
                  <thead><tr><th className="w-8">#</th><SortTh k="name" label="Nhân viên" sort={empSortState} align="left" /><th>POS</th><SortTh k="received" label="Số được cấp" sort={empSortState} /><th>Khối lượng</th><SortTh k="buyers" label="Đã mua" sort={empSortState} /><SortTh k="buyRate" label="Tỷ lệ mua" sort={empSortState} /><SortTh k="repeat" label="Mua lại" sort={empSortState} /><SortTh k="orders" label="Đơn" sort={empSortState} /><SortTh k="net" label="Doanh thu" sort={empSortState} /><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {byEmployee.map((e, i) => {
                      const rate = e.received ? e.buyers / e.received * 100 : null;
                      const ratio = medianReceived ? e.received / medianReceived : 0;
                      return (
                        <tr key={e.sellerId || 'none'}>
                          <td className="num text-[11px] text-ink-4">{i + 1}</td>
                          <td className="font-medium text-ink">{e.sellerName}</td>
                          <td className="text-xs">{[...e.pos].map((id) => <span key={id} className="mr-1.5 whitespace-nowrap"><span className="mr-1 inline-block size-2 rounded-full" style={{ background: posVar(id) }} />{posName(id)}</span>)}</td>
                          <td className="n">{vi.format(e.received)}</td>
                          <td><ProgressBar value={e.received} max={maxReceived} size="sm" width={56} color={ratio > 2 ? 'var(--bad)' : ratio > 1.5 ? 'var(--warn)' : 'var(--primary)'} /></td>
                          <td className="n">{vi.format(e.buyers)}</td>
                          <td className="n">{pct(rate)}</td>
                          <td className="n">{vi.format(e.repeat)}</td>
                          <td className="n">{vi.format(e.orders)}</td>
                          <td className="n">{money(e.net)}</td>
                          <td>{ratio > 2 ? <StatusChip tone="red"><AlertTriangle size={11} aria-hidden="true" />Quá tải</StatusChip> : ratio > 1.5 ? <StatusChip tone="orange">Cần theo dõi</StatusChip> : <StatusChip tone="green">Bình thường</StatusChip>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr><td /><td>Tổng</td><td className="text-xs font-normal text-ink-3">{vi.format(totals.sellers.size)} nhân viên</td><td className="n">{vi.format(totals.received)}</td><td /><td className="n">{vi.format(totals.buyers)}</td><td className="n">{pct(totals.received ? totals.buyers / totals.received * 100 : null)}</td><td className="n">{vi.format(totals.repeat)}</td><td className="n">{vi.format(totals.orders)}</td><td className="n">{money(totals.net)}</td><td /></tr></tfoot>
                </table>
              </TableWrap>
            ) : <EmptyState text="Không có đợt cấp data trong kỳ." />}
            <p className="mt-3 text-xs text-ink-3">Quá tải = nhận gấp hơn 2 lần mức trung vị của các nhân viên có từ 20 số trong kỳ; Cần theo dõi = hơn 1,5 lần. {data.definitions.limit}</p>
          </ChartCard>
          <ChartCard icon={Layers} title={`Chi tiết từng đợt cấp data · ${data.batches.length} đợt`} subtitle={`${data.definitions.batch} ${data.definitions.outcome}`}>
            {batchRows.length ? (
              <TableWrap maxHeight="32rem" minWidth={Math.max(1000, 760 + months.length * 120)} stickyFirst>
                <table className="tbl">
                  <thead><tr><SortTh k="month" label="Tháng giao" sort={batchSort} align="left" /><SortTh k="pos" label="POS" sort={batchSort} align="left" /><SortTh k="seller" label="Nhân viên" sort={batchSort} align="left" /><SortTh k="received" label="Số nhận" sort={batchSort} /><SortTh k="buyers" label="Đã mua" sort={batchSort} /><SortTh k="buyRate" label="Tỷ lệ" sort={batchSort} /><SortTh k="repeat" label="Mua lại" sort={batchSort} /><SortTh k="orders" label="Đơn" sort={batchSort} /><SortTh k="net" label="Doanh thu" sort={batchSort} />{months.map((m) => <th key={m} className="n">{m.slice(5)}/{m.slice(0, 4)}</th>)}</tr></thead>
                  <tbody>
                    {batchRows.map((b) => (
                      <tr key={`${b.posId}|${b.month}|${b.sellerId}`}>
                        <td className="num">{b.month.slice(5)}/{b.month.slice(0, 4)}</td><td className="text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posVar(b.posId) }} />{b.posName}</td><td className="text-ink">{b.sellerName}</td>
                        <td className="n">{vi.format(b.received)}</td><td className="n">{vi.format(b.buyers)}</td>
                        <td className="n">{pct(b.buyRate)}</td><td className="n">{vi.format(b.repeatBuyers)}</td>
                        <td className="n">{vi.format(b.orders)}</td><td className="n">{money(b.net)}</td>
                        {months.map((m) => { const x = b.months.find((y) => y.month === m); return <td key={m} className="n text-xs text-ink-2">{x ? <>{vi.format(x.orders)}<span className="font-normal tracking-normal"> đơn · </span>{shortMoney(x.net)}</> : ''}</td>; })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Không có đợt cấp data trong kỳ." />}
          </ChartCard>
          <Definitions items={data.definitions} />
        </>
      )}
    </div>
  );
}
