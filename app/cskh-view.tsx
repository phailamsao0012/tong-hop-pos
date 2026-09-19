'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, BadgePercent, Clock, Database, Layers, Phone, Repeat, ShoppingBag, Sparkles, TrendingUp, UserCheck, Users, Wallet,
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
import {
  ChartCard, DeltaPill, Donut, ErrorBox, EmptyState, Funnel, KpiCard, PageHeader, ProgressBar, SortTh, StatusChip, Toolbar, heat,
  dmy, dt, money, pct, posColor, posName, short, useSort, vi,
} from './ui-kit';

type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
type EmpSortKey = 'name' | 'l0' | 'l1' | 'l2' | 'l3' | 'rep' | 'repNet';
const EMP_SORT_LABELS: Record<EmpSortKey, string> = { rep: 'Khách mua lại', repNet: 'Doanh thu mua lại', l0: 'Mua lần đầu', l1: 'Upsell lần 1', l2: 'Upsell lần 2', l3: 'Upsell lần 3+', name: 'Tên' };

async function exportRows(name: string, sheets: { title: string; rows: (string | number | null)[][] }[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.title.slice(0, 30));
  XLSX.writeFile(wb, `${name}.xlsx`);
}

/** Gọi API báo cáo; trả về lỗi dễ hiểu thay vì để trang trống. */
async function fetchReport<T>(url: string): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const body = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok) return { data: null, error: body.error || `Máy chủ trả lỗi ${r.status}.` };
    return { data: body, error: null };
  } catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Không kết nối được máy chủ.' }; }
}

const RANGE_PRESETS: Record<string, string> = { month: 'Tháng này', lastMonth: 'Tháng trước', quarter: '90 ngày qua', year: 'Năm nay', custom: 'Tùy chọn' };
function RangePicker({ preset, start, end, onChange }: { preset: string; start: string; end: string; onChange: (preset: string, s: string, e: string) => void }) {
  const today = todayVn();
  const apply = (key: string) => {
    if (key === 'year') return onChange(key, `${today.slice(0, 4)}-01-01`, today);
    const r = presetRange(key, today);
    onChange(key, r?.start ?? start, r?.end ?? end);
  };
  return (
    <>
      <span className="px-1 text-sm font-semibold text-[#62796d]">Kỳ</span>
      <Select value={preset} items={RANGE_PRESETS} onValueChange={(v) => apply(String(v))}>
        <SelectTrigger className="min-w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(RANGE_PRESETS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
      <Input type="date" className="w-auto" value={start} max={end} onChange={(e) => onChange('custom', e.target.value, end)} />
      <span className="text-sm text-[#7d9184]">→</span>
      <Input type="date" className="w-auto" value={end} min={start} max={today} onChange={(e) => onChange('custom', start, e.target.value)} />
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
const DORMANT_COLORS: Record<string, string> = { '30-45': '#1a9c5b', '46-60': '#9bcf5a', '61-90': '#eda100', '90+': '#eb6834' };
const SORTS: Record<string, string> = { spend: 'Mua nhiều tiền nhất', orders: 'Mua nhiều đơn nhất', recent: 'Mua gần đây nhất', quantity: 'Mua nhiều sản phẩm nhất', first: 'Khách mới nhất', dormant: 'Lâu chưa mua nhất', name: 'Theo tên' };
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
      <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">Tất cả nhân viên</SelectItem>
        {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.department ? ` · ${e.department}` : ''}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CustomerDialog({ detail, onClose }: { detail: Detail | null; onClose: () => void }) {
  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        {detail && (
          <>
            <DialogHeader><DialogTitle>{detail.stats?.name || 'Khách chưa có tên'} · {detail.phone} · {detail.posName}</DialogTitle></DialogHeader>
            {detail.stats && (
              <div className="grid gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-xl border p-3"><div className="text-xs text-[#7d9184]">Tổng tiền mua thành công</div><div className="text-lg font-semibold">{money(detail.stats.successNet)}</div><div className="text-xs">{detail.stats.successOrders} đơn · TB {money(detail.stats.averageOrder)}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-[#7d9184]">Đơn / chốt / hoàn / hủy</div><div className="text-lg font-semibold">{detail.stats.orders} / {detail.stats.closedOrders} / {detail.stats.returnedOrders} / {detail.stats.cancelledOrders}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-[#7d9184]">Mua đầu → gần nhất</div><div className="font-semibold">{dt(detail.stats.firstSuccessAt)} → {dt(detail.stats.lastSuccessAt)}</div><div className="text-xs">Phụ trách: {detail.stats.sellerName ?? '—'}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-[#7d9184]">Sản phẩm đã mua ({detail.stats.productKinds} loại)</div><div className="text-xs">{detail.stats.products.map((p) => `${p.name} ×${p.quantity}`).join(' · ') || '—'}</div></div>
              </div>
            )}
            <table className="mt-3 w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">Ngày tạo</th><th>Mã đơn</th><th>Trạng thái</th><th>Lần mua</th><th>Người bán / chốt</th><th className="text-right">Doanh thu</th><th>Sản phẩm</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {detail.orders.map((o) => (
                  <tr key={o.id} className="border-t align-top">
                    <td className="py-2 whitespace-nowrap">{dt(o.createdAt, true)}</td>
                    <td className="whitespace-nowrap">{o.sourceOrderId}</td>
                    <td className="whitespace-nowrap">{o.statusName}</td>
                    <td className="whitespace-nowrap">{o.successRank ? (o.successRank === 1 ? 'Lần đầu' : `Upsell ${o.successRank - 1}`) : ''}</td>
                    <td className="whitespace-nowrap text-xs">{o.sellerName ?? '—'}{o.closerName && o.closerName !== o.sellerName ? ` / ${o.closerName}` : ''}</td>
                    <td className="whitespace-nowrap text-right">{money(o.net)}</td>
                    <td className="whitespace-normal text-xs">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                    <td className="max-w-60 text-xs">{[o.note, ...o.tags.map((t) => `#${t.name}`)].filter(Boolean).join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const useDetail = () => {
  const [detail, setDetail] = useState<Detail | null>(null);
  const open = async (c: { posId: string; phone: string }) => {
    const r = await fetchReport<Detail>(`/api/reports/customers/detail?posId=${c.posId}&phone=${encodeURIComponent(c.phone)}`);
    if (r.data) setDetail(r.data);
  };
  return { detail, open, close: () => setDetail(null) };
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
  const { detail, open, close } = useDetail();

  const range = periodKey === 'custom' ? { start, end } : periodRange(periodKey, today);
  const periodMode = !!range;
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ posIds: posIds.join(','), q, page: String(page), sort, sellerId });
    if (periodMode && range) { params.set('start', range.start); params.set('end', range.end); }
    else params.set('group', group);
    const r = await fetchReport<CustomerList>(`/api/reports/customers?${params}`);
    if (r.data) setData(r.data); else setError(r.error);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posIds, q, group, page, sort, sellerId, periodMode, range?.start, range?.end]);
  useEffect(() => { void load(); }, [load]);
  const reset = () => setPage(1);
  const g = data?.groups;
  const title = periodMode && range
    ? `${SORTS[sort]} · ${periodKey === 'custom' ? `${range.start} → ${range.end}` : PERIODS[periodKey]} · ${vi.format(data?.total ?? 0)} khách`
    : `${GROUP_LABELS[group]} · ${vi.format(data?.total ?? 0)} khách`;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Số liệu Pancake POS tại thời điểm đồng bộ" title="Hồ sơ khách hàng" subtitle="Mỗi khách = một SĐT trong một POS. Tìm, lọc, xếp hạng khách mua nhiều nhất theo từng kỳ và mở lịch sử mua của từng khách."
        actions={<Button variant="outline" disabled={!data} onClick={() => data && exportRows(`khach-hang_${periodMode && range ? `${range.start}_${range.end}` : group}`, [{
          title: 'Khách hàng', rows: [
            ['POS', 'SĐT', 'Tên', 'Người phụ trách', 'Đơn', 'Đơn chốt', 'Mua thành công', 'Tổng tiền mua', 'TB/đơn', 'Mua TC trọn đời', 'Tiền mua trọn đời', 'SL', 'Số loại SP', 'Hoàn', 'Hủy', 'Mua gần nhất', 'Ngày chưa mua lại', 'Sản phẩm đã mua'],
            ...data.customers.map((c) => [c.posName, c.phone, c.name, c.sellerName, c.orders, c.closedOrders, c.successOrders, c.successNet, Math.round(c.averageOrder ?? 0), c.lifetimeOrders, c.lifetimeNet, c.successQuantity, c.productKinds, c.returnedOrders, c.cancelledOrders, dt(c.lastSuccessAt), c.daysSinceSuccess, c.products.map((p) => `${p.name} ×${p.quantity}`).join('; ')]),
          ],
        }])}>Xuất Excel (trang này)</Button>} />
      {g && (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
          <KpiCard icon={Users} tone="green" label="Tổng khách" value={vi.format(g.total)} note={`${vi.format(g.total - g.never)} đã mua thành công · ${vi.format(g.never)} chưa từng mua`} onClick={() => { reset(); setPeriodKey('all'); setGroup('all'); }} active={!periodMode && group === 'all'} />
          <KpiCard icon={UserCheck} tone="teal" label="Mua trong 30 ngày" value={vi.format(g.active)} note={`${pct(g.total ? g.active / g.total * 100 : null)} tổng khách`} onClick={() => { reset(); setPeriodKey('all'); setGroup('active'); }} active={!periodMode && group === 'active'} />
          <KpiCard icon={Clock} tone="orange" label="Lâu chưa mua (≥30 ngày)" value={vi.format(DORMANT_KEYS.reduce((a, k) => a + (g[k] ?? 0), 0))} note="Xem chi tiết ở mục Khách lâu chưa mua" onClick={() => { reset(); setPeriodKey('all'); setGroup('90+'); }} active={!periodMode && DORMANT_KEYS.includes(group as never)} />
          <KpiCard icon={Sparkles} tone="purple" label="Chưa từng mua" value={vi.format(g.never)} note="Có đơn nhưng chưa đơn nào giao thành công" onClick={() => { reset(); setPeriodKey('all'); setGroup('never'); }} active={!periodMode && group === 'never'} />
        </div>
      )}
      <Toolbar>
        <Input placeholder="Tìm theo SĐT hoặc tên khách" className="w-64" value={q} onChange={(e) => { reset(); setQ(e.target.value); }} />
        <span className="pl-2 text-sm font-semibold text-[#62796d]">Kỳ</span>
        <Select value={periodKey} items={PERIODS} onValueChange={(v) => { reset(); setPeriodKey(String(v)); }}>
          <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {periodKey === 'custom' && (
          <>
            <Input type="date" className="w-auto" value={start} max={end} onChange={(e) => { reset(); setStart(e.target.value); }} />
            <span className="text-sm text-[#7d9184]">→</span>
            <Input type="date" className="w-auto" value={end} min={start} max={today} onChange={(e) => { reset(); setEnd(e.target.value); }} />
          </>
        )}
        <span className="pl-2 text-sm font-semibold text-[#62796d]">Sắp xếp</span>
        <Select value={sort} items={SORTS} onValueChange={(v) => { reset(); setSort(String(v)); }}>
          <SelectTrigger className="min-w-52"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).filter(([k]) => !periodMode || ['spend', 'orders', 'recent'].includes(k)).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <span className="pl-2 text-sm font-semibold text-[#62796d]">Phụ trách</span>
        <EmployeeSelect value={sellerId} onChange={(v) => { reset(); setSellerId(v); }} employees={employees} />
      </Toolbar>
      {!periodMode && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(GROUP_LABELS).map(([k, l]) => (
            <Button key={k} size="sm" variant={group === k ? 'default' : 'outline'} onClick={() => { reset(); setGroup(k); }}>
              {l}{g ? ` (${vi.format(k === 'all' ? g.total : g[k] ?? 0)})` : ''}
            </Button>
          ))}
        </div>
      )}
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && (
        <ChartCard icon={Users} title={title} subtitle={data.definitions.success}
          action={<div className="flex items-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>Trang {page}</span><Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>›</Button></div>}>
          {data.period && (
            <p className="mb-3 text-sm text-[#547467]">Trong kỳ: <strong>{vi.format(data.period.orders)}</strong> đơn thành công · <strong>{money(data.period.net)}</strong> · {vi.format(data.total)} khách</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Khách</th><th>POS</th><th>Phụ trách</th><th className="text-right">Mua TC</th><th className="text-right">Tổng tiền mua</th><th className="text-right">TB/đơn</th>{periodMode && <th className="text-right">Trọn đời</th>}<th className="text-right">Loại SP</th><th>Sản phẩm hay mua</th><th>Mua gần nhất</th><th className="text-right">Chưa mua (ngày)</th><th className="text-right">Hoàn/Hủy</th></tr></thead>
              <tbody>
                {!loading && !data.customers.length && <tr><td colSpan={13} className="py-4 text-center text-[#7d9184]">Không có khách phù hợp bộ lọc.</td></tr>}
                {data.customers.map((c, i) => (
                  <tr key={`${c.posId}:${c.phone}`} className="cursor-pointer border-t hover:bg-[#f5faf5]" onClick={() => void open(c)}>
                    <td className="py-2 text-xs text-[#7d9184]">{(page - 1) * 50 + i + 1}</td>
                    <td className="whitespace-nowrap"><div className="font-medium">{c.name || 'Khách chưa có tên'}</div><div className="text-xs text-[#7d9184]">{c.phone}</div></td>
                    <td className="whitespace-nowrap text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posColor(c.posId) }} />{c.posName}</td>
                    <td className="whitespace-nowrap text-xs">{c.sellerName}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(c.successOrders)}{!periodMode && <span className="text-xs text-[#7d9184]"> / {vi.format(c.orders)}</span>}</td>
                    <td className="whitespace-nowrap text-right font-semibold">{money(c.successNet)}</td>
                    <td className="whitespace-nowrap text-right">{money(c.averageOrder)}</td>
                    {periodMode && <td className="whitespace-nowrap text-right text-xs text-[#547467]">{vi.format(c.lifetimeOrders)} đơn · {money(c.lifetimeNet)}</td>}
                    <td className="whitespace-nowrap text-right">{c.productKinds ? `${c.productKinds} loại` : '—'}</td>
                    <td className="max-w-56 truncate text-xs" title={c.products.map((p) => `${p.name} ×${p.quantity}`).join(', ')}>{c.products[0]?.name ?? '—'}</td>
                    <td className="whitespace-nowrap">{dt(c.lastSuccessAt)}</td>
                    <td className="whitespace-nowrap text-right">{c.daysSinceSuccess ?? '—'}</td>
                    <td className="whitespace-nowrap text-right">{c.returnedOrders} / {c.cancelledOrders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#7d9184]">{data.definitions.identity} Bấm vào một khách để xem lịch sử mua.</p>
        </ChartCard>
      )}
      <CustomerDialog detail={detail} onClose={close} />
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
  const [data, setData] = useState<CustomerList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const employees = useEmployees();
  const team = useTeam();
  const { detail, open, close } = useDetail();
  const [viewAll, setViewAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const buildParams = (size: number, pg: number) => new URLSearchParams({ posIds: posIds.join(','), q, page: String(pg), size: String(size), sort, sellerId, group, team });
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = buildParams(viewAll ? 5000 : 50, viewAll ? 1 : page);
    const r = await fetchReport<CustomerList>(`/api/reports/customers?${params}`);
    if (r.data) setData(r.data); else setError(r.error);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posIds, q, group, page, sort, sellerId, team, viewAll]);
  useEffect(() => { void load(); }, [load]);
  const reset = () => setPage(1);
  const g = data?.groups, nets = data?.groupNets;
  const dormantTotal = g ? DORMANT_KEYS.reduce((a, k) => a + (g[k] ?? 0), 0) : 0;
  const dormantNet = nets ? DORMANT_KEYS.reduce((a, k) => a + (nets[k] ?? 0), 0) : 0;
  const priority = (c: Customer): { tone: 'red' | 'orange' | 'gray'; label: string } =>
    (c.daysSinceSuccess ?? 0) > 90 && c.successNet >= 1_000_000 ? { tone: 'red', label: 'Nguy cơ cao' }
      : (c.daysSinceSuccess ?? 0) > 60 || c.successNet >= 2_000_000 ? { tone: 'orange', label: 'Cần chú ý' } : { tone: 'gray', label: 'Theo dõi' };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Số liệu Pancake POS tại thời điểm đồng bộ" title="Khách lâu chưa mua" subtitle="Theo số ngày từ lần mua thành công gần nhất"
        actions={<Button variant="outline" disabled={!data || exporting} onClick={async () => {
          if (!data) return;
          setExporting(true);
          // Xuất toàn bộ nhóm đang chọn theo bộ lọc (tối đa 20.000 khách).
          const all = await fetchReport<CustomerList>(`/api/reports/customers?${buildParams(20000, 1)}`);
          const rows = all.data?.customers ?? data.customers;
          try { await exportRows(`khach-lau-chua-mua_${group}`, [{
          title: 'Khách lâu chưa mua', rows: [['POS', 'SĐT', 'Tên', 'Phụ trách', 'Mua TC', 'Tổng tiền mua', 'Mua gần nhất', 'Ngày chưa mua', 'Sản phẩm hay mua', 'Ưu tiên'],
            ...rows.map((c) => [c.posName, c.phone, c.name, c.sellerName, c.successOrders, c.successNet, dt(c.lastSuccessAt), c.daysSinceSuccess, c.products[0]?.name ?? '', priority(c).label])],
        }]); } finally { setExporting(false); }
        }}>{exporting ? 'Đang xuất…' : 'Xuất Excel toàn bộ'}</Button>} />
      {g && nets && (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-[repeat(auto-fit,minmax(228px,1fr))]">
          <KpiCard icon={Users} tone="green" label="Tổng khách cần chăm sóc" value={vi.format(dormantTotal)} note={`${pct(g.total ? dormantTotal / g.total * 100 : null)} tổng khách đã mua`} />
          {DORMANT_KEYS.map((k) => (
            <KpiCard key={k} icon={Clock} tone={k === '30-45' ? 'teal' : k === '46-60' ? 'lime' : k === '61-90' ? 'orange' : 'red'} label={GROUP_LABELS[k]} value={vi.format(g[k] ?? 0)}
              note={`${pct(dormantTotal ? (g[k] ?? 0) / dormantTotal * 100 : null)} · ${short(nets[k] ?? 0)} đ đã mua`} onClick={() => { reset(); setGroup(k); }} active={group === k} />
          ))}
          <KpiCard icon={Wallet} tone="purple" label="Giá trị đã mua của nhóm" value={`${short(dormantNet)} đ`} note="Tổng tiền các khách này từng mua thành công" />
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ChartCard icon={Layers} title="Phân bổ khách theo thời gian chưa mua" subtitle="Tỷ trọng khách theo nhóm ngày chưa mua lại">
          {g ? <Donut centerValue={vi.format(dormantTotal)} centerLabel="khách" size={170} slices={DORMANT_KEYS.map((k) => ({ key: k, label: GROUP_LABELS[k], value: g[k] ?? 0, color: DORMANT_COLORS[k] }))} /> : <EmptyState text="Đang tải…" />}
        </ChartCard>
        <ChartCard icon={Phone} title="Khách cần liên hệ trước" subtitle={`Top khách có giá trị cao nhất trong nhóm ${GROUP_LABELS[group]}`}>
          {data ? (
            <ol className="space-y-2">
              {data.customers.slice(0, 5).map((c, i) => (
                <li key={`${c.posId}:${c.phone}`} className="flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 hover:bg-[#f5faf5]" onClick={() => void open(c)}>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${i === 0 ? 'bg-[#eb6834]' : i === 1 ? 'bg-[#eda100]' : 'bg-[#17684b]'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.name || 'Khách chưa có tên'} <span className="text-xs font-normal text-[#7d9184]">{c.phone}</span></div><div className="text-xs text-[#7d9184]">{c.posName} · {c.sellerName}</div></div>
                  <div className="text-right"><div className="text-sm font-semibold text-[#c8403f]">{c.daysSinceSuccess ?? '—'} ngày</div><div className="text-xs text-[#7d9184]">chưa mua</div></div>
                  <div className="text-right"><div className="text-sm font-semibold">{money(c.successNet)}</div><div className="text-xs text-[#7d9184]">giá trị đã mua</div></div>
                </li>
              ))}
              {!data.customers.length && <EmptyState text="Không có khách trong nhóm này." />}
            </ol>
          ) : <EmptyState text="Đang tải…" />}
        </ChartCard>
      </div>
      <Toolbar>
        <Input placeholder="Tìm theo SĐT hoặc tên khách" className="w-64" value={q} onChange={(e) => { reset(); setQ(e.target.value); }} />
        <div className="flex flex-wrap gap-1">
          {[...DORMANT_KEYS, 'never'].map((k) => (
            <Button key={k} size="sm" variant={group === k ? 'default' : 'outline'} onClick={() => { reset(); setGroup(k); }}>{GROUP_LABELS[k]}{g ? ` (${vi.format(g[k] ?? 0)})` : ''}</Button>
          ))}
        </div>
        <span className="pl-2 text-sm font-semibold text-[#62796d]">Sắp xếp</span>
        <Select value={sort} items={SORTS} onValueChange={(v) => { reset(); setSort(String(v)); }}>
          <SelectTrigger className="min-w-52"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <span className="pl-2 text-sm font-semibold text-[#62796d]">Phụ trách</span>
        <EmployeeSelect value={sellerId} onChange={(v) => { reset(); setSellerId(v); }} employees={employees} />
      </Toolbar>
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && (
        <ChartCard icon={Users} title={`Danh sách ${GROUP_LABELS[group].toLowerCase()} · ${vi.format(data.total)} khách`} subtitle={data.definitions.dormant}
          action={<div className="flex items-center gap-2 text-sm">{!viewAll && <><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>Trang {page}</span><Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>›</Button></>}<Button size="sm" variant={viewAll ? 'default' : 'outline'} onClick={() => { setViewAll(!viewAll); setPage(1); }} title="Tải một lượt tới 5.000 khách theo bộ lọc hiện tại">{viewAll ? 'Theo trang' : 'Xem toàn bộ'}</Button></div>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Tên khách hàng</th><th>SĐT</th><th>POS</th><th>Lần mua gần nhất</th><th className="text-right">Ngày chưa mua</th><th className="text-right">Giá trị đã mua</th><th className="text-right">Mua TC</th><th>Sản phẩm hay mua</th><th>Nhân viên phụ trách</th><th>Ưu tiên</th></tr></thead>
              <tbody>
                {!loading && !data.customers.length && <tr><td colSpan={11} className="py-4 text-center text-[#7d9184]">Không có khách phù hợp bộ lọc.</td></tr>}
                {data.customers.map((c, i) => {
                  const p = priority(c);
                  return (
                    <tr key={`${c.posId}:${c.phone}`} className="cursor-pointer border-t hover:bg-[#f5faf5]" onClick={() => void open(c)}>
                      <td className="py-2 text-xs text-[#7d9184]">{(page - 1) * 50 + i + 1}</td>
                      <td className="whitespace-nowrap font-medium">{c.name || 'Khách chưa có tên'}</td>
                      <td className="whitespace-nowrap text-xs">{c.phone}</td>
                      <td className="whitespace-nowrap text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posColor(c.posId) }} />{c.posName}</td>
                      <td className="whitespace-nowrap">{dt(c.lastSuccessAt)}</td>
                      <td className="whitespace-nowrap text-right font-semibold text-[#c8403f]">{c.daysSinceSuccess ?? '—'} ngày</td>
                      <td className="whitespace-nowrap text-right font-medium">{money(c.successNet)}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(c.successOrders)}</td>
                      <td className="max-w-56 truncate text-xs" title={c.products.map((x) => `${x.name} ×${x.quantity}`).join(', ')}>{c.products[0]?.name ?? '—'}</td>
                      <td className="whitespace-nowrap text-xs">{c.sellerName}</td>
                      <td><StatusChip tone={p.tone}>{p.tone === 'red' && <AlertTriangle size={11} />}{p.label}</StatusChip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#7d9184]">Ưu tiên: Nguy cơ cao = trên 90 ngày và đã mua ≥ 1 triệu; Cần chú ý = trên 60 ngày hoặc đã mua ≥ 2 triệu. Bấm vào khách để xem lịch sử mua.</p>
        </ChartCard>
      )}
      <CustomerDialog detail={detail} onClose={close} />
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
  recent: { posId: string; posName: string; phone: string; createdAt: string; net: number; level: number; prior: number; sellerName: string }[];
  definitions: Record<string, string>;
};

export function RepurchaseView() {
  const today = todayVn();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [data, setData] = useState<Repurchase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const team = useTeam();
  const { detail, open, close } = useDetail();
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetchReport<Repurchase>(`/api/reports/repurchase?${new URLSearchParams({ posIds: posIds.join(','), start, end, team })}`);
    if (r.data) setData(r.data); else setError(r.error);
    setLoading(false);
  }, [posIds, start, end, team]);
  useEffect(() => { void load(); }, [load]);
  const levelCells = (levels: Level[]) => levels.map((l) => (
    <td key={l.level} className="whitespace-nowrap text-right">{vi.format(l.customers)} khách · {vi.format(l.orders)} đơn<div className="text-xs text-[#7d9184]">{money(l.net)}</div></td>
  ));
  const totalNet = data ? data.summary.levels.reduce((a, l) => a + l.net, 0) : 0;
  const maxT = data ? Math.max(1, ...data.cohorts.map((c) => c.retention.length)) : 1;
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
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Mua lại & Upsell" subtitle="Đơn mua lại = đơn thành công thứ 2 trở đi của cùng SĐT"
        actions={<Button disabled={!data} onClick={() => data && exportRows(`mua-lai_${start}_${end}`, [
          { title: 'Tổng hợp', rows: [['Mức', 'Khách', 'Đơn', 'Doanh thu'], ...data.summary.levels.map((l) => [l.label, l.customers, l.orders, l.net])] },
          { title: 'Cohort', rows: [['Tháng mua đầu', 'Số khách', ...Array.from({ length: maxT }, (_, i) => `T${i}`)], ...data.cohorts.map((c) => [c.month, c.size, ...c.retention.map((v) => v ?? '')])] },
          { title: 'Theo POS', rows: [['POS', ...data.summary.levels.flatMap((l) => [`${l.label} - khách`, `${l.label} - đơn`, `${l.label} - tiền`])], ...data.byPos.map((p) => [p.posName, ...p.levels.flatMap((l) => [l.customers, l.orders, l.net])])] },
          { title: 'Theo nhân viên', rows: [['Nhân viên', 'Khách mua lại', 'Đơn mua lại', 'Doanh thu mua lại', ...data.summary.levels.flatMap((l) => [`${l.label} - khách`, `${l.label} - đơn`, `${l.label} - tiền`])], ...data.byEmployee.map((p) => [p.name, p.repurchase.customers, p.repurchase.orders, p.repurchase.net, ...p.levels.flatMap((l) => [l.customers, l.orders, l.net])])] },
          { title: 'Đơn mua lại gần đây', rows: [['POS', 'SĐT', 'Ngày tạo', 'Lần mua lại', 'Tiền', 'Người bán'], ...data.recent.map((r) => [r.posName, r.phone, dt(r.createdAt, true), `Upsell ${r.prior}`, r.net, r.sellerName])] },
        ])}>Xuất Excel</Button>} />
      <Toolbar>
        <RangePicker preset={preset} start={start} end={end} onChange={(p, s, e) => { setPreset(p); setStart(s); setEnd(e); }} />
        <Button className="ml-auto" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5">
            <KpiCard icon={Users} tone="green" label="Khách đã mua (trọn đời)" value={vi.format(data.funnel.once)} note="Đã mua thành công ≥ 1 lần" />
            <KpiCard icon={Repeat} tone="teal" label="Khách mua lại (trọn đời)" value={vi.format(data.funnel.twice)} note="Mua từ lần 2 trở lên" />
            <KpiCard icon={BadgePercent} tone="blue" label="Tỷ lệ mua lại" value={pct(data.funnel.once ? data.funnel.twice / data.funnel.once * 100 : null)} note={`${vi.format(data.funnel.thrice)} khách mua ≥ 3 lần`} />
            <KpiCard icon={Wallet} tone="orange" label="Doanh thu mua lại trong kỳ" value={money(data.summary.repurchase.net)} note={`${pct(totalNet ? data.summary.repurchase.net / totalNet * 100 : null)} doanh thu đơn thành công trong kỳ`} />
            <KpiCard icon={ShoppingBag} tone="purple" label="Đơn mua lại trong kỳ" value={vi.format(data.summary.repurchase.orders)} note={`${vi.format(data.summary.repurchase.customers)} khách · ${vi.format(data.summary.successOrders)} đơn thành công trong kỳ`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <ChartCard icon={TrendingUp} title="Tỷ lệ mua lại theo tháng mua đầu tiên" subtitle="Cohort 12 tháng: % khách của mỗi nhóm có đơn thành công ở tháng thứ n kể từ tháng mua đầu (T0)" info={data.definitions.cohort}>
              {data.cohorts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs [&_td]:px-1.5 [&_th]:px-1.5">
                    <thead className="text-left text-[#7d9184]"><tr><th className="py-1.5">Tháng đầu</th><th className="text-right">Khách</th>{Array.from({ length: maxT }, (_, i) => <th key={i} className="text-center">T{i}</th>)}</tr></thead>
                    <tbody>
                      {data.cohorts.map((c) => (
                        <tr key={c.month} className="border-t">
                          <td className="whitespace-nowrap py-1 font-medium">{c.month.slice(5)}/{c.month.slice(0, 4)}</td>
                          <td className="whitespace-nowrap text-right">{vi.format(c.size)}</td>
                          {Array.from({ length: maxT }, (_, i) => {
                            const v = i < c.retention.length ? c.retention[i] : null;
                            return <td key={i} className="py-1 text-center"><span className="inline-block w-11 rounded py-1 font-medium" style={heat(v)}>{v === null ? '·' : `${Math.round(v)}%`}</span></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState text="Chưa đủ lịch sử để dựng cohort." />}
            </ChartCard>
            <ChartCard icon={Layers} title="Mua lần 1 → lần 2 → lần 3+" subtitle="Hành trình mua lại của khách (trọn đời, các POS đã chọn)" info={data.definitions.funnel}>
              <Funnel steps={[
                { label: 'Đã mua lần 1', value: data.funnel.once, note: 'khách đã mua thành công' },
                { label: 'Mua lần 2', value: data.funnel.twice, note: `${pct(data.funnel.once ? data.funnel.twice / data.funnel.once * 100 : null)} chuyển đổi` },
                { label: 'Mua lần 3+', value: data.funnel.thrice, note: `${pct(data.funnel.twice ? data.funnel.thrice / data.funnel.twice * 100 : null)} chuyển đổi` },
              ]} />
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {data.summary.levels.map((l) => (
                  <div key={l.level} className="rounded-xl border p-2"><div className="text-[#7d9184]">{l.label} (kỳ)</div><div className="text-base font-semibold">{vi.format(l.customers)} <span className="text-xs font-normal">khách</span></div><div className="text-[#547467]">{vi.format(l.orders)} đơn · {short(l.net)} đ</div></div>
                ))}
              </div>
            </ChartCard>
          </div>
          <ChartCard icon={Layers} title="Theo POS" subtitle={data.definitions.upsell}>
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2"><thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">POS</th>{data.summary.levels.map((l) => <th key={l.level} className="text-right">{l.label}</th>)}<th className="text-right">Mua lại (gộp)</th></tr></thead>
              <tbody>{data.byPos.map((p) => <tr key={p.posId} className="border-t"><td className="py-2 whitespace-nowrap font-medium"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(p.posId) }} />{p.posName}</td>{levelCells(p.levels)}<td className="whitespace-nowrap text-right font-semibold">{vi.format(p.repurchase.customers)} khách · {money(p.repurchase.net)}</td></tr>)}</tbody></table>
          </ChartCard>
          <ChartCard icon={UserCheck} title={`Theo nhân viên · ${empRows.length}`} subtitle={data.definitions.employee}
            action={<div className="flex flex-wrap items-center gap-2">
              <Input className="w-40" placeholder="Tìm tên nhân viên" value={empQ} onChange={(e) => setEmpQ(e.target.value)} />
              <Select value={empSort.key} items={EMP_SORT_LABELS} onValueChange={(v) => { empSort.setKey(v as EmpSortKey); empSort.setDesc(true); }}>
                <SelectTrigger className="min-w-40"><span className="text-[#7d9184]">Xếp:&nbsp;</span><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EMP_SORT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => empSort.setDesc(!empSort.desc)}>{empSort.desc ? 'Cao → thấp' : 'Thấp → cao'}</Button>
            </div>}>
            <div className="max-h-[32rem] overflow-auto"><table className="w-full text-sm [&_td]:px-2 [&_th]:px-2"><thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><SortTh k="name" label="Nhân viên" sort={empSort} align="left" />{data.summary.levels.map((l, i) => <SortTh key={l.level} k={`l${i}`} label={l.label} sort={empSort} />)}<SortTh k="rep" label="Mua lại (gộp)" sort={empSort} /></tr></thead>
              <tbody>{empRows.map((p, i) => <tr key={p.sellerId || 'none'} className="border-t"><td className="py-2 text-xs text-[#7d9184]">{i + 1}</td><td className="whitespace-nowrap font-medium">{p.name}</td>{levelCells(p.levels)}<td className="whitespace-nowrap text-right font-semibold">{vi.format(p.repurchase.customers)} khách · {money(p.repurchase.net)}</td></tr>)}{!empRows.length && <tr><td colSpan={7} className="py-4 text-center text-[#7d9184]">Không có nhân viên khớp bộ lọc.</td></tr>}</tbody></table></div>
          </ChartCard>
          <ChartCard icon={ShoppingBag} title={`Đơn mua lại gần đây · ${recRows.length}`} subtitle={data.definitions.basis}
            action={<div className="flex flex-wrap items-center gap-2">
              <Input className="w-36" placeholder="Tìm SĐT" value={recQ} onChange={(e) => setRecQ(e.target.value.trim())} />
              <Select value={recPos} items={{ all: 'Mọi POS', ...Object.fromEntries(POS.map((p) => [p.id, p.name])) }} onValueChange={(v) => setRecPos(String(v))}><SelectTrigger className="min-w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Mọi POS</SelectItem>{POS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
              <Select value={recLevel} items={{ all: 'Mọi lần', '1': 'Upsell 1', '2': 'Upsell 2', '3': 'Upsell 3+' }} onValueChange={(v) => setRecLevel(String(v))}><SelectTrigger className="min-w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Mọi lần</SelectItem><SelectItem value="1">Upsell 1</SelectItem><SelectItem value="2">Upsell 2</SelectItem><SelectItem value="3">Upsell 3+</SelectItem></SelectContent></Select>
              <Select value={recSeller} items={{ all: 'Mọi người bán', ...Object.fromEntries(recSellers.map((n) => [n, n])) }} onValueChange={(v) => setRecSeller(String(v))}><SelectTrigger className="min-w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Mọi người bán</SelectItem>{recSellers.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select>
            </div>}>
            <div className="max-h-96 overflow-auto"><table className="w-full text-sm [&_td]:px-2 [&_th]:px-2"><thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><SortTh k="time" label="Ngày tạo" sort={recSort} align="left" className="py-2" /><th>POS</th><th>SĐT</th><SortTh k="prior" label="Lần" sort={recSort} align="left" /><th>Người bán</th><SortTh k="net" label="Doanh thu" sort={recSort} /></tr></thead>
              <tbody>{recRows.map((r, i) => <tr key={i} className="cursor-pointer border-t hover:bg-[#f5faf5]" onClick={() => void open({ posId: r.posId, phone: r.phone })}><td className="py-2 whitespace-nowrap">{dt(r.createdAt, true)}</td><td className="whitespace-nowrap text-xs">{r.posName}</td><td>{r.phone}</td><td><StatusChip tone={r.prior >= 3 ? 'purple' : r.prior === 2 ? 'teal' : 'green'}>Upsell {r.prior}</StatusChip></td><td className="text-xs">{r.sellerName}</td><td className="whitespace-nowrap text-right">{money(r.net)}</td></tr>)}{!recRows.length && <tr><td colSpan={6} className="py-4 text-center text-[#7d9184]">Không có đơn khớp bộ lọc.</td></tr>}</tbody></table></div>
            <p className="mt-2 text-xs text-[#7d9184]">Hiện tối đa 400 đơn mua lại mới nhất trong kỳ; bấm một dòng để mở hồ sơ khách.</p>
          </ChartCard>
        </>
      )}
      <CustomerDialog detail={detail} onClose={close} />
    </div>
  );
}

// ---------- Data được cấp ----------
type BatchRow = { posId: string; posName: string; month: string; sellerId: string; sellerName: string; received: number; buyers: number; repeatBuyers: number; buyRate: number | null; orders: number; net: number; months: { month: string; orders: number; net: number }[] };
type Batches = { period: { start: string; end: string }; batches: BatchRow[]; definitions: Record<string, string> };
type AssignSeries = { current: { series: { bucket: string; posId: string; assignedOrders: number }[] } };

export function BatchesView() {
  const today = todayVn();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [data, setData] = useState<Batches | null>(null);
  const [daily, setDaily] = useState<AssignSeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empSort, setEmpSort] = useState<'received' | 'buyers' | 'buyRate' | 'net'>('received');
  const team = useTeam();
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [r, d] = await Promise.all([
      fetchReport<Batches>(`/api/reports/batches?${new URLSearchParams({ posIds: posIds.join(','), start, end, team })}`),
      fetchReport<AssignSeries>(`/api/reports/overview?${new URLSearchParams({ posIds: posIds.join(','), start, end, groupBy: 'day', compare: 'none', team })}`),
    ]);
    if (r.data) setData(r.data); else setError(r.error);
    if (d.data) setDaily(d.data);
    setLoading(false);
  }, [posIds, start, end, team]);
  useEffect(() => { void load(); }, [load]);

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
    const v = (e: { received: number; buyers: number; net: number }) => empSort === 'buyRate' ? (e.received ? e.buyers / e.received : 0) : e[empSort];
    return [...map.values()].sort((a, b) => v(b) - v(a));
  }, [data, empSort]);
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
  const chartConfig = Object.fromEntries(POS.map((p) => [p.id, { label: p.name, color: posColor(p.id) }]));
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
  const maxReceived = Math.max(1, ...byEmployee.map((e) => e.received));
  // Mức chuẩn = trung vị của những người thực sự nhận data (≥ 20 số trong kỳ), để vài người nhận lẻ tẻ không kéo trung vị xuống và ai cũng thành "quá tải".
  const sortedReceived = byEmployee.map((e) => e.received).filter((n) => n >= 20).sort((a, b) => a - b);
  const medianReceived = sortedReceived.length ? sortedReceived[Math.floor(sortedReceived.length / 2)] : 0;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Data được cấp" subtitle="Data (SĐT) giao cho nhân viên và kết quả chuyển đổi"
        actions={<Button disabled={!data} onClick={() => data && exportRows(`data-duoc-cap_${start}_${end}`, [
          { title: 'Theo nhân viên', rows: [['Nhân viên', 'POS', 'Số được cấp', 'Đã mua', 'Tỷ lệ mua %', 'Mua lại', 'Đơn', 'Doanh thu'], ...byEmployee.map((e) => [e.sellerName, [...e.pos].map(posName).join(', '), e.received, e.buyers, e.received ? Number((e.buyers / e.received * 100).toFixed(1)) : '', e.repeat, e.orders, e.net])] },
          { title: 'Đợt cấp data', rows: [['POS', 'Tháng giao', 'Nhân viên', 'Số nhận', 'Số đã mua', 'Tỷ lệ mua %', 'Số mua lại', 'Đơn', 'Doanh thu', ...months],
            ...data.batches.map((b) => [b.posName, b.month, b.sellerName, b.received, b.buyers, b.buyRate === null ? '' : Number(b.buyRate.toFixed(1)), b.repeatBuyers, b.orders, b.net, ...months.map((m) => b.months.find((x) => x.month === m)?.net ?? 0)])] },
        ])}>Xuất Excel</Button>} />
      <Toolbar>
        <span className="text-sm font-semibold text-[#62796d]">Tháng giao data</span>
        <RangePicker preset={preset} start={start} end={end} onChange={(p, s, e) => { setPreset(p); setStart(s); setEnd(e); }} />
        <Button className="ml-auto" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</Button>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5">
            <KpiCard icon={Database} tone="green" label="Tổng số được cấp" value={vi.format(totals.received)} note={`Trung bình ${vi.format(Math.round(totals.received / days))}/ngày`} />
            <KpiCard icon={Users} tone="blue" label="Số nhân viên nhận data" value={vi.format(totals.sellers.size)} note={`Thuộc ${new Set(data.batches.map((b) => b.posId)).size} POS`} />
            <KpiCard icon={UserCheck} tone="teal" label="Đã mua" value={vi.format(totals.buyers)} note={`${pct(totals.received ? totals.buyers / totals.received * 100 : null)} trên tổng số`} />
            <KpiCard icon={Repeat} tone="purple" label="Mua lại" value={vi.format(totals.repeat)} note={`${pct(totals.buyers ? totals.repeat / totals.buyers * 100 : null)} khách đã mua`} />
            <KpiCard icon={Wallet} tone="orange" label="Doanh thu từ data" value={money(totals.net)} note={`${vi.format(totals.orders)} đơn thành công`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ChartCard icon={Database} title="Data được cấp theo ngày" subtitle="Số đơn được giao người bán mỗi ngày, phân theo POS">
              {dailySeries.length ? (
                <ChartContainer className="h-64 w-full aspect-auto" config={chartConfig}>
                  <AreaChart data={dailySeries}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} />
                    <YAxis tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} formatter={(value, name) => <span className="flex w-full justify-between gap-4"><span>{posName(String(name))}</span><strong>{vi.format(Number(value))}</strong></span>} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {posIds.map((id) => <Area key={id} type="monotone" dataKey={id} stackId="1" stroke={`var(--color-${id})`} fill={`var(--color-${id})`} fillOpacity={0.35} />)}
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
          <ChartCard icon={Users} title="Hiệu suất xử lý data theo nhân viên" subtitle="Gộp các đợt trong kỳ theo nhân viên"
            action={
              <Select value={empSort} items={{ received: 'Số được cấp', buyers: 'Đã mua', buyRate: 'Tỷ lệ mua', net: 'Doanh thu' }} onValueChange={(v) => setEmpSort(v as typeof empSort)}>
                <SelectTrigger className="min-w-40 text-xs"><span className="text-[#7d9184]">Sắp xếp:</span>&nbsp;<SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="received">Số được cấp</SelectItem><SelectItem value="buyers">Đã mua</SelectItem><SelectItem value="buyRate">Tỷ lệ mua</SelectItem><SelectItem value="net">Doanh thu</SelectItem></SelectContent>
              </Select>
            }>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Nhân viên</th><th>POS</th><th className="text-right">Số được cấp</th><th>Khối lượng</th><th className="text-right">Đã mua</th><th className="text-right">Tỷ lệ mua</th><th className="text-right">Mua lại</th><th className="text-right">Đơn</th><th className="text-right">Doanh thu</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {byEmployee.map((e, i) => {
                    const rate = e.received ? e.buyers / e.received * 100 : null;
                    const load = medianReceived ? e.received / medianReceived : 0;
                    return (
                      <tr key={e.sellerId || 'none'} className="border-t">
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td>
                        <td className="whitespace-nowrap font-medium">{e.sellerName}</td>
                        <td className="whitespace-nowrap text-xs">{[...e.pos].map((id) => <span key={id} className="mr-1.5"><span className="mr-1 inline-block size-2 rounded-full" style={{ background: posColor(id) }} />{posName(id)}</span>)}</td>
                        <td className="whitespace-nowrap text-right font-medium">{vi.format(e.received)}</td>
                        <td><ProgressBar value={e.received} max={maxReceived} color={load > 2 ? '#eb6834' : load > 1.5 ? '#eda100' : '#17684b'} /></td>
                        <td className="whitespace-nowrap text-right">{vi.format(e.buyers)}</td>
                        <td className="whitespace-nowrap text-right font-semibold">{pct(rate)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(e.repeat)}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(e.orders)}</td>
                        <td className="whitespace-nowrap text-right">{money(e.net)}</td>
                        <td>{load > 2 ? <StatusChip tone="red"><AlertTriangle size={11} />Quá tải</StatusChip> : load > 1.5 ? <StatusChip tone="orange">Cần theo dõi</StatusChip> : <StatusChip tone="green">Bình thường</StatusChip>}</td>
                      </tr>
                    );
                  })}
                  {!byEmployee.length && <tr><td colSpan={11} className="py-4 text-center text-[#7d9184]">Không có đợt cấp data trong kỳ.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#7d9184]">Quá tải = nhận gấp hơn 2 lần mức trung vị của các nhân viên có từ 20 số trong kỳ; Cần theo dõi = hơn 1,5 lần. {data.definitions.limit}</p>
          </ChartCard>
          <ChartCard icon={Layers} title={`Chi tiết từng đợt cấp data · ${data.batches.length} đợt`} subtitle={`${data.definitions.batch} ${data.definitions.outcome}`}>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">Tháng giao</th><th>POS</th><th>Nhân viên</th><th className="text-right">Số nhận</th><th className="text-right">Đã mua</th><th className="text-right">Tỷ lệ</th><th className="text-right">Mua lại</th><th className="text-right">Đơn</th><th className="text-right">Doanh thu</th>{months.map((m) => <th key={m} className="text-right">{m.slice(5)}/{m.slice(0, 4)}</th>)}</tr></thead>
                <tbody>
                  {data.batches.map((b) => (
                    <tr key={`${b.posId}|${b.month}|${b.sellerId}`} className="border-t">
                      <td className="py-2 whitespace-nowrap">{b.month.slice(5)}/{b.month.slice(0, 4)}</td><td className="whitespace-nowrap text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posColor(b.posId) }} />{b.posName}</td><td className="whitespace-nowrap">{b.sellerName}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(b.received)}</td><td className="whitespace-nowrap text-right">{vi.format(b.buyers)}</td>
                      <td className="whitespace-nowrap text-right font-medium">{pct(b.buyRate)}</td><td className="whitespace-nowrap text-right">{vi.format(b.repeatBuyers)}</td>
                      <td className="whitespace-nowrap text-right">{vi.format(b.orders)}</td><td className="whitespace-nowrap text-right font-medium">{money(b.net)}</td>
                      {months.map((m) => { const x = b.months.find((y) => y.month === m); return <td key={m} className="whitespace-nowrap text-right text-xs">{x ? `${vi.format(x.orders)} đ · ${short(x.net)}` : ''}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}

