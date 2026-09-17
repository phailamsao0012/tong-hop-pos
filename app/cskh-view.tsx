'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';

type SurfaceComponent = React.ComponentType<{ title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }>;
const vi = new Intl.NumberFormat('vi-VN');
const money = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${vi.format(Math.round(n))} ₫`;
const dt = (iso: string | null | undefined, withTime = false) => iso
  ? new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
  : '—';
const pct = (n: number | null) => n === null ? '—' : `${n.toFixed(1).replace('.', ',')}%`;
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;

/** Gọi API báo cáo; trả về lỗi dễ hiểu thay vì để trang trống. */
async function fetchReport<T>(url: string): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const body = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok) return { data: null, error: body.error || `Máy chủ trả lỗi ${r.status}.` };
    return { data: body, error: null };
  } catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Không kết nối được máy chủ.' }; }
}
function ErrorBox({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#f0c9a6] bg-[#fff7ee] p-4 text-sm text-[#8a4b12]">
      <span>Không tải được dữ liệu: {error}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>Thử lại</Button>
    </div>
  );
}

async function exportRows(name: string, sheets: { title: string; rows: (string | number | null)[][] }[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.title.slice(0, 30));
  XLSX.writeFile(wb, `${name}.xlsx`);
}

function PosChips({ posIds, onChange }: { posIds: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-[#62796d]">POS:</span>
      {POS.map((p) => {
        const on = posIds.includes(p.id);
        return (
          <button key={p.id} type="button" onClick={() => onChange(on ? (posIds.length > 1 ? posIds.filter((id) => id !== p.id) : posIds) : [...posIds, p.id])}
            className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'bg-white font-medium' : 'bg-[#f1f4f0] text-[#7d9184]'}`}>{p.name}</button>
        );
      })}
      <button type="button" className="text-sm text-primary underline" onClick={() => onChange(POS.map((p) => p.id))}>Tất cả</button>
    </div>
  );
}

function DateRange({ start, end, onChange }: { start: string; end: string; onChange: (s: string, e: string) => void }) {
  const today = todayVn();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[['Tháng này', monthStart(today), today], ['Tháng trước', monthStart(addDays(monthStart(today), -1)), addDays(monthStart(today), -1)], ['90 ngày', addDays(today, -89), today], ['Năm nay', `${today.slice(0, 4)}-01-01`, today]].map(([l, s, e]) => (
        <Button key={l} size="sm" variant={start === s && end === e ? 'default' : 'outline'} onClick={() => onChange(s, e)}>{l}</Button>
      ))}
      <Input type="date" className="w-40" value={start} max={end} onChange={(e) => onChange(e.target.value, end)} />
      <span className="text-sm text-[#7d9184]">→</span>
      <Input type="date" className="w-40" value={end} min={start} max={today} onChange={(e) => onChange(start, e.target.value)} />
    </div>
  );
}

// ---------- Hồ sơ khách hàng & khách lâu chưa mua ----------
type Customer = {
  posId: string; posName: string; phone: string; name: string; sellerName: string; firstOrderAt: string | null; lastOrderAt: string | null;
  orders: number; closedOrders: number; successOrders: number; successNet: number; successQuantity: number; averageOrder: number | null;
  lifetimeOrders: number; lifetimeNet: number;
  returnedOrders: number; cancelledOrders: number; firstSuccessAt: string | null; lastSuccessAt: string | null; daysSinceSuccess: number | null;
  productKinds: number; products: { name: string; quantity: number; total: number; orders: number }[];
};
type CustomerList = {
  page: number; hasMore: boolean; total: number; groups: Record<string, number> | null; customers: Customer[]; definitions: Record<string, string>;
  period?: { start: string; end: string; net: number; orders: number };
};
type Detail = {
  posName: string; phone: string;
  stats: { name: string; sellerName: string | null; orders: number; closedOrders: number; successOrders: number; successNet: number; successQuantity: number; averageOrder: number | null; returnedOrders: number; cancelledOrders: number; firstOrderAt: string | null; lastOrderAt: string | null; firstSuccessAt: string | null; lastSuccessAt: string | null; productKinds: number; products: { name: string; quantity: number; total: number; orders: number }[] } | null;
  orders: { id: string; sourceOrderId: string; createdAt: string; statusName: string; sellerName: string | null; closerName: string | null; confirmedAt: string | null; deliveredAt: string | null; gross: number; discount: number; net: number; note: string | null; tags: { name: string }[]; successRank: number | null; items: { name: string; quantity: number; price: number; total: number }[] }[];
};
type Employee = { id: string; name: string; department: string | null };
const GROUP_LABELS: Record<string, string> = { all: 'Tất cả', active: 'Mua trong 30 ngày', '30-45': '30–45 ngày', '46-60': '46–60 ngày', '61-90': '61–90 ngày', '90+': 'Trên 90 ngày', never: 'Chưa từng mua' };
const SORTS: Record<string, string> = { spend: 'Mua nhiều tiền nhất', orders: 'Mua nhiều đơn nhất', recent: 'Mua gần đây nhất', quantity: 'Mua nhiều sản phẩm nhất', first: 'Khách mới nhất', dormant: 'Lâu chưa mua nhất', name: 'Theo tên' };
const PERIODS: Record<string, string> = { all: 'Toàn bộ lịch sử', month: 'Tháng này', lastMonth: 'Tháng trước', d90: '90 ngày qua', year: 'Năm nay', custom: 'Khoảng tùy chọn' };
const periodRange = (key: string, today: string): { start: string; end: string } | null => {
  if (key === 'month') return { start: monthStart(today), end: today };
  if (key === 'lastMonth') { const e = addDays(monthStart(today), -1); return { start: monthStart(e), end: e }; }
  if (key === 'd90') return { start: addDays(today, -89), end: today };
  if (key === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return null;
};

export function CustomersView({ Surface, mode }: { Surface: SurfaceComponent; mode: 'profiles' | 'dormant' }) {
  const today = todayVn();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(mode === 'dormant' ? '30-45' : 'all');
  const [sort, setSort] = useState(mode === 'dormant' ? 'spend' : 'spend');
  const [sellerId, setSellerId] = useState('');
  const [periodKey, setPeriodKey] = useState('all');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerList | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => { void fetchReport<Employee[]>('/api/employees').then((r) => { if (r.data) setEmployees(r.data); }); }, []);

  const range = periodKey === 'custom' ? { start, end } : periodRange(periodKey, today);
  const periodMode = mode === 'profiles' && !!range;
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

  const open = async (c: Customer) => {
    const r = await fetchReport<Detail>(`/api/reports/customers/detail?posId=${c.posId}&phone=${encodeURIComponent(c.phone)}`);
    if (r.data) setDetail(r.data); else setError(r.error);
  };
  const title = periodMode && range
    ? `${SORTS[sort]} · ${PERIODS[periodKey] === 'Khoảng tùy chọn' ? `${range.start} → ${range.end}` : PERIODS[periodKey]} · ${vi.format(data?.total ?? 0)} khách`
    : `${GROUP_LABELS[group]} · ${vi.format(data?.total ?? 0)} khách`;

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Tìm theo SĐT hoặc tên khách" className="w-64" value={q} onChange={(e) => { reset(); setQ(e.target.value); }} />
          {mode === 'profiles' && (
            <>
              <span className="pl-2 text-sm font-semibold text-[#62796d]">Kỳ</span>
              <Select value={periodKey} items={PERIODS} onValueChange={(v) => { reset(); setPeriodKey(String(v)); }}>
                <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              {periodKey === 'custom' && (
                <>
                  <Input type="date" className="w-40" value={start} max={end} onChange={(e) => { reset(); setStart(e.target.value); }} />
                  <span className="text-sm text-[#7d9184]">→</span>
                  <Input type="date" className="w-40" value={end} min={start} max={today} onChange={(e) => { reset(); setEnd(e.target.value); }} />
                </>
              )}
            </>
          )}
          <span className="pl-2 text-sm font-semibold text-[#62796d]">Sắp xếp</span>
          <Select value={sort} items={SORTS} onValueChange={(v) => { reset(); setSort(String(v)); }}>
            <SelectTrigger className="min-w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SORTS).filter(([k]) => !periodMode || ['spend', 'orders', 'recent'].includes(k)).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <span className="pl-2 text-sm font-semibold text-[#62796d]">Phụ trách</span>
          <Select value={sellerId || '__all'} items={{ __all: 'Tất cả nhân viên', ...Object.fromEntries(employees.map((e) => [e.id, e.name])) }} onValueChange={(v) => { reset(); setSellerId(v === '__all' ? '' : String(v)); }}>
            <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tất cả nhân viên</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.department ? ` · ${e.department}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="ml-auto" variant="outline" disabled={!data} onClick={() => data && exportRows(`khach-hang_${periodMode && range ? `${range.start}_${range.end}` : group}`, [{
            title: 'Khách hàng', rows: [
              ['POS', 'SĐT', 'Tên', 'Người phụ trách', 'Đơn', 'Đơn chốt', 'Mua thành công', 'Tổng tiền mua', 'TB/đơn', 'Mua TC trọn đời', 'Tiền mua trọn đời', 'SL', 'Số loại SP', 'Hoàn', 'Hủy', 'Mua gần nhất', 'Ngày chưa mua lại', 'Sản phẩm đã mua'],
              ...data.customers.map((c) => [c.posName, c.phone, c.name, c.sellerName, c.orders, c.closedOrders, c.successOrders, c.successNet, Math.round(c.averageOrder ?? 0), c.lifetimeOrders, c.lifetimeNet, c.successQuantity, c.productKinds, c.returnedOrders, c.cancelledOrders, dt(c.lastSuccessAt), c.daysSinceSuccess, c.products.map((p) => `${p.name} ×${p.quantity}`).join('; ')]),
            ],
          }])}>Xuất Excel (trang này)</Button>
        </div>
        {!periodMode && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(GROUP_LABELS).map(([k, l]) => (
              <Button key={k} size="sm" variant={group === k ? 'default' : 'outline'} onClick={() => { reset(); setGroup(k); }}>
                {l}{data?.groups ? ` (${vi.format(k === 'all' ? data.groups.total : data.groups[k] ?? 0)})` : ''}
              </Button>
            ))}
          </div>
        )}
      </div>
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && (
        <Surface title={title} description={mode === 'dormant' ? data.definitions.dormant : data.definitions.success}
          action={<div className="flex items-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>Trang {page}</span><Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>›</Button></div>}>
          {data.period && (
            <p className="mb-3 text-sm text-[#547467]">Trong kỳ: <strong>{vi.format(data.period.orders)}</strong> đơn thành công · <strong>{money(data.period.net)}</strong> · {vi.format(data.total)} khách</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Khách</th><th>POS</th><th>Phụ trách</th><th className="text-right">Mua TC</th><th className="text-right">Tổng tiền mua</th><th className="text-right">TB/đơn</th>{periodMode && <th className="text-right">Trọn đời</th>}<th className="text-right">Loại SP</th><th>Mua gần nhất</th><th className="text-right">Chưa mua (ngày)</th><th className="text-right">Hoàn/Hủy</th></tr></thead>
              <tbody>
                {loading && !data.customers.length && <tr><td colSpan={12} className="py-4 text-center text-[#7d9184]">Đang tải…</td></tr>}
                {!loading && !data.customers.length && <tr><td colSpan={12} className="py-4 text-center text-[#7d9184]">Không có khách phù hợp bộ lọc.</td></tr>}
                {data.customers.map((c, i) => (
                  <tr key={`${c.posId}:${c.phone}`} className="cursor-pointer border-t hover:bg-[#f5faf5]" onClick={() => void open(c)}>
                    <td className="py-2 text-xs text-[#7d9184]">{(page - 1) * 50 + i + 1}</td>
                    <td className="whitespace-nowrap"><div className="font-medium">{c.name || 'Khách chưa có tên'}</div><div className="text-xs text-[#7d9184]">{c.phone}</div></td>
                    <td className="whitespace-nowrap text-xs">{c.posName}</td>
                    <td className="whitespace-nowrap text-xs">{c.sellerName}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(c.successOrders)}{!periodMode && <span className="text-xs text-[#7d9184]"> / {vi.format(c.orders)}</span>}</td>
                    <td className="whitespace-nowrap text-right font-medium">{money(c.successNet)}</td>
                    <td className="whitespace-nowrap text-right">{money(c.averageOrder)}</td>
                    {periodMode && <td className="whitespace-nowrap text-right text-xs text-[#547467]">{vi.format(c.lifetimeOrders)} đơn · {money(c.lifetimeNet)}</td>}
                    <td className="whitespace-nowrap text-right">{c.productKinds ? `${c.productKinds} loại` : '—'}</td>
                    <td className="whitespace-nowrap">{dt(c.lastSuccessAt)}</td>
                    <td className="whitespace-nowrap text-right">{c.daysSinceSuccess ?? '—'}</td>
                    <td className="whitespace-nowrap text-right">{c.returnedOrders} / {c.cancelledOrders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#7d9184]">{data.definitions.identity} Bấm vào một khách để xem lịch sử mua.</p>
        </Surface>
      )}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.stats?.name || 'Khách chưa có tên'} · {detail.phone} · {detail.posName}</DialogTitle></DialogHeader>
              {detail.stats && (
                <div className="grid gap-3 sm:grid-cols-4 text-sm">
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
                      <td className="text-xs">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                      <td className="max-w-60 text-xs">{[o.note, ...o.tags.map((t) => `#${t.name}`)].filter(Boolean).join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Mua lại & Upsell ----------
type Level = { level: number; label: string; customers: number; orders: number; net: number };
type Repurchase = {
  period: { start: string; end: string };
  summary: { levels: Level[]; repurchase: { customers: number; orders: number; net: number }; successOrders: number };
  byPos: { posId: string; posName: string; levels: Level[]; repurchase: { customers: number; orders: number; net: number } }[];
  byEmployee: { sellerId: string; name: string; levels: Level[]; repurchase: { customers: number; orders: number; net: number } }[];
  recent: { posName: string; phone: string; createdAt: string; net: number; level: number; prior: number; sellerName: string }[];
  definitions: Record<string, string>;
};

export function RepurchaseView({ Surface }: { Surface: SurfaceComponent }) {
  const today = todayVn();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [data, setData] = useState<Repurchase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetchReport<Repurchase>(`/api/reports/repurchase?${new URLSearchParams({ posIds: posIds.join(','), start, end })}`);
    if (r.data) setData(r.data); else setError(r.error);
    setLoading(false);
  }, [posIds, start, end]);
  useEffect(() => { void load(); }, [load]);
  const levelCells = (levels: Level[]) => levels.map((l) => (
    <td key={l.level} className="whitespace-nowrap text-right">{vi.format(l.customers)} khách · {vi.format(l.orders)} đơn<div className="text-xs text-[#7d9184]">{money(l.net)}</div></td>
  ));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3">
        <DateRange start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
        <Button className="ml-auto" variant="outline" disabled={!data} onClick={() => data && exportRows(`mua-lai_${start}_${end}`, [
          { title: 'Tổng hợp', rows: [['Mức', 'Khách', 'Đơn', 'Doanh số'], ...data.summary.levels.map((l) => [l.label, l.customers, l.orders, l.net])] },
          { title: 'Theo POS', rows: [['POS', ...data.summary.levels.flatMap((l) => [`${l.label} - khách`, `${l.label} - đơn`, `${l.label} - tiền`])], ...data.byPos.map((p) => [p.posName, ...p.levels.flatMap((l) => [l.customers, l.orders, l.net])])] },
          { title: 'Theo nhân viên', rows: [['Nhân viên', 'Khách mua lại', 'Đơn mua lại', 'Doanh số mua lại', ...data.summary.levels.flatMap((l) => [`${l.label} - khách`, `${l.label} - đơn`, `${l.label} - tiền`])], ...data.byEmployee.map((p) => [p.name, p.repurchase.customers, p.repurchase.orders, p.repurchase.net, ...p.levels.flatMap((l) => [l.customers, l.orders, l.net])])] },
          { title: 'Đơn mua lại gần đây', rows: [['POS', 'SĐT', 'Ngày tạo', 'Lần mua lại', 'Tiền', 'Người bán'], ...data.recent.map((r) => [r.posName, r.phone, dt(r.createdAt, true), `Upsell ${r.prior}`, r.net, r.sellerName])] },
        ])}>Xuất Excel</Button>
      </div>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border bg-white p-4"><div className="text-xs text-[#6a8575]">Khách mua lại (Upsell ≥ 1)</div><div className="text-2xl font-semibold">{vi.format(data.summary.repurchase.customers)}</div><div className="text-xs text-[#7d9184]">{vi.format(data.summary.repurchase.orders)} đơn · {money(data.summary.repurchase.net)}</div></div>
            {data.summary.levels.map((l) => (
              <div key={l.level} className="rounded-2xl border bg-white p-4"><div className="text-xs text-[#6a8575]">{l.label}</div><div className="text-2xl font-semibold">{vi.format(l.customers)} <span className="text-sm font-normal">khách</span></div><div className="text-xs text-[#7d9184]">{vi.format(l.orders)} đơn · {money(l.net)}</div></div>
            ))}
          </div>
          <Surface title="Theo POS" description={data.definitions.upsell}>
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2"><thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">POS</th>{data.summary.levels.map((l) => <th key={l.level} className="text-right">{l.label}</th>)}<th className="text-right">Mua lại (gộp)</th></tr></thead>
              <tbody>{data.byPos.map((p) => <tr key={p.posId} className="border-t"><td className="py-2">{p.posName}</td>{levelCells(p.levels)}<td className="whitespace-nowrap text-right font-medium">{vi.format(p.repurchase.customers)} khách · {money(p.repurchase.net)}</td></tr>)}</tbody></table>
          </Surface>
          <Surface title="Theo nhân viên" description={data.definitions.employee}>
            <div className="max-h-[32rem] overflow-auto"><table className="w-full text-sm [&_td]:px-2 [&_th]:px-2"><thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">Nhân viên</th>{data.summary.levels.map((l) => <th key={l.level} className="text-right">{l.label}</th>)}<th className="text-right">Mua lại (gộp)</th></tr></thead>
              <tbody>{data.byEmployee.map((p) => <tr key={p.sellerId || 'none'} className="border-t"><td className="py-2 whitespace-nowrap">{p.name}</td>{levelCells(p.levels)}<td className="whitespace-nowrap text-right font-medium">{vi.format(p.repurchase.customers)} khách · {money(p.repurchase.net)}</td></tr>)}</tbody></table></div>
          </Surface>
          <Surface title="Đơn mua lại gần đây" description={data.definitions.basis}>
            <div className="max-h-96 overflow-auto"><table className="w-full text-sm [&_td]:px-2 [&_th]:px-2"><thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">Ngày tạo</th><th>POS</th><th>SĐT</th><th>Lần</th><th>Người bán</th><th className="text-right">Tiền hàng thuần</th></tr></thead>
              <tbody>{data.recent.map((r, i) => <tr key={i} className="border-t"><td className="py-2 whitespace-nowrap">{dt(r.createdAt, true)}</td><td className="whitespace-nowrap text-xs">{r.posName}</td><td>{r.phone}</td><td>Upsell {r.prior}</td><td className="text-xs">{r.sellerName}</td><td className="whitespace-nowrap text-right">{money(r.net)}</td></tr>)}</tbody></table></div>
          </Surface>
        </>
      )}
    </div>
  );
}

// ---------- Data được cấp ----------
type BatchRow = { posId: string; posName: string; month: string; sellerId: string; sellerName: string; received: number; buyers: number; repeatBuyers: number; buyRate: number | null; orders: number; net: number; months: { month: string; orders: number; net: number }[] };
type Batches = { period: { start: string; end: string }; batches: BatchRow[]; definitions: Record<string, string> };

export function BatchesView({ Surface }: { Surface: SurfaceComponent }) {
  const today = todayVn();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [start, setStart] = useState(addDays(monthStart(today), -62).slice(0, 7) + '-01');
  const [end, setEnd] = useState(today);
  const [data, setData] = useState<Batches | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetchReport<Batches>(`/api/reports/batches?${new URLSearchParams({ posIds: posIds.join(','), start, end })}`);
    if (r.data) setData(r.data); else setError(r.error);
    setLoading(false);
  }, [posIds, start, end]);
  useEffect(() => { void load(); }, [load]);
  const months = data ? [...new Set(data.batches.flatMap((b) => b.months.map((m) => m.month)))].sort() : [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3">
        <span className="text-sm font-semibold text-[#62796d]">Tháng giao data</span>
        <DateRange start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
        <Button className="ml-auto" variant="outline" disabled={!data} onClick={() => data && exportRows(`data-duoc-cap_${start}_${end}`, [{
          title: 'Đợt cấp data', rows: [['POS', 'Tháng giao', 'Nhân viên', 'Số nhận', 'Số đã mua', 'Tỷ lệ mua %', 'Số mua lại', 'Đơn', 'Doanh số', ...months],
            ...data.batches.map((b) => [b.posName, b.month, b.sellerName, b.received, b.buyers, b.buyRate === null ? '' : Number(b.buyRate.toFixed(1)), b.repeatBuyers, b.orders, b.net, ...months.map((m) => b.months.find((x) => x.month === m)?.net ?? 0)])],
        }])}>Xuất Excel</Button>
      </div>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && (
        <Surface title={`Kết quả từng đợt cấp data · ${data.batches.length} đợt`} description={`${data.definitions.batch} ${data.definitions.outcome}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
              <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">Tháng giao</th><th>POS</th><th>Nhân viên</th><th className="text-right">Số nhận</th><th className="text-right">Đã mua</th><th className="text-right">Tỷ lệ</th><th className="text-right">Mua lại</th><th className="text-right">Đơn</th><th className="text-right">Doanh số</th>{months.map((m) => <th key={m} className="text-right">{m}</th>)}</tr></thead>
              <tbody>
                {loading && !data.batches.length && <tr><td colSpan={9} className="py-4 text-center text-[#7d9184]">Đang tải…</td></tr>}
                {data.batches.map((b) => (
                  <tr key={`${b.posId}|${b.month}|${b.sellerId}`} className="border-t">
                    <td className="py-2 whitespace-nowrap">{b.month}</td><td className="whitespace-nowrap text-xs">{b.posName}</td><td className="whitespace-nowrap">{b.sellerName}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(b.received)}</td><td className="whitespace-nowrap text-right">{vi.format(b.buyers)}</td>
                    <td className="whitespace-nowrap text-right font-medium">{pct(b.buyRate)}</td><td className="whitespace-nowrap text-right">{vi.format(b.repeatBuyers)}</td>
                    <td className="whitespace-nowrap text-right">{vi.format(b.orders)}</td><td className="whitespace-nowrap text-right font-medium">{money(b.net)}</td>
                    {months.map((m) => { const x = b.months.find((y) => y.month === m); return <td key={m} className="whitespace-nowrap text-right text-xs">{x ? `${vi.format(x.orders)} đ · ${money(x.net)}` : ''}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#7d9184]">{data.definitions.limit}</p>
        </Surface>
      )}
    </div>
  );
}
