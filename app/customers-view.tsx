'use client';

// Hồ sơ khách hàng: danh sách bên trái (phân khúc, bộ lọc, sắp xếp, top khách theo kỳ) và bảng chi tiết bên phải
// (thông tin Pancake, chỉ số RFM, hành trình mua, sản phẩm yêu thích, ghi chú trên đơn).
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Award, Calendar, Cake, Clock, Gift, Globe, Heart, Mail, MapPin, Phone, ShoppingBag, Sparkles, Star, Tag, TrendingUp, User, UserCheck, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';
import { PosChips } from './overview-view';
import { useTeam } from './team-store';
import { Avatar, ChartCard, ErrorBox, EmptyState, KpiCard, PageHeader, StatusChip, Toolbar, dt, money, pct, posColor, vi, type Tone } from './ui-kit';

type Customer = {
  posId: string; posName: string; phone: string; name: string; sellerId: string | null; sellerName: string; firstOrderAt: string | null; lastOrderAt: string | null;
  orders: number; closedOrders: number; successOrders: number; successNet: number; successQuantity: number; averageOrder: number | null;
  lifetimeOrders: number; lifetimeNet: number; returnedOrders: number; cancelledOrders: number; firstSuccessAt: string | null; lastSuccessAt: string | null; daysSinceSuccess: number | null;
  productKinds: number; products: { name: string; quantity: number; total: number; orders: number }[];
};
type List = {
  page: number; hasMore: boolean; total: number; groups: Record<string, number> | null; customers: Customer[]; definitions: Record<string, string>;
  segments?: { vip: number; loyal: number; active: number; new: number; risk: number; potential: number; dormant: number; never: number; buyers: number; ltvTotal: number };
  period?: { start: string; end: string; net: number; orders: number };
};
type Detail = {
  posId: string; posName: string; phone: string;
  profile: { address: string | null; province: string | null; gender: string | null; dob: string | null; level: string | number | null; rewardPoint: number | null; email: string | null; customerSince: string | null; pancakeSuccessOrders: number | null; pancakeAmount: number | null; tags: string[]; notes: string[]; sources: string[]; marketers: string[] } | null;
  stats: { name: string; sellerName: string | null; orders: number; closedOrders: number; successOrders: number; successNet: number; successQuantity: number; averageOrder: number | null; returnedOrders: number; cancelledOrders: number; firstOrderAt: string | null; lastOrderAt: string | null; firstSuccessAt: string | null; lastSuccessAt: string | null; productKinds: number; products: { name: string; quantity: number; total: number; orders: number }[] } | null;
  orders: { id: string; sourceOrderId: string; createdAt: string; statusCode: number; statusName: string; sellerName: string | null; closerName: string | null; confirmedAt: string | null; deliveredAt: string | null; gross: number; discount: number; net: number; note: string | null; tags: { name: string }[]; successRank: number | null; sourceName: string | null; returnedReason: string | null; orderLink: string | null; items: { name: string; quantity: number; price: number; total: number }[] }[];
};
type Employee = { id: string; name: string; department: string | null };
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const SEGMENTS: Record<string, { label: string; tone: Tone; hint: string }> = {
  '': { label: 'Tất cả phân khúc', tone: 'gray', hint: '' },
  vip: { label: 'VIP', tone: 'orange', hint: 'Đã mua từ 5 triệu' },
  loyal: { label: 'Thân thiết', tone: 'green', hint: '≥ 3 lần mua, quay lại trong 90 ngày' },
  active: { label: 'Đang hoạt động', tone: 'teal', hint: 'Mua trong 30 ngày' },
  new: { label: 'Khách mới', tone: 'blue', hint: 'Mua lần đầu trong 30 ngày' },
  potential: { label: 'Tiềm năng', tone: 'purple', hint: 'Mua 1 lần, 31–90 ngày' },
  risk: { label: 'Nguy cơ rời bỏ', tone: 'red', hint: '≥ 2 lần mua nhưng > 60 ngày chưa quay lại' },
  dormant: { label: 'Ngủ đông', tone: 'gray', hint: '> 90 ngày chưa mua' },
  never: { label: 'Chưa từng mua', tone: 'gray', hint: 'Có đơn nhưng chưa giao thành công' },
};
const SORTS: Record<string, string> = { spend: 'Mua nhiều tiền nhất', orders: 'Mua nhiều đơn nhất', recent: 'Mua gần đây nhất', quantity: 'Mua nhiều sản phẩm nhất', first: 'Khách mới nhất', dormant: 'Lâu chưa mua nhất', name: 'Theo tên' };
const PERIODS: Record<string, string> = { all: 'Toàn bộ lịch sử', month: 'Tháng này', lastMonth: 'Tháng trước', d90: '90 ngày qua', year: 'Năm nay', custom: 'Khoảng tùy chọn' };
const periodRange = (key: string, today: string) => key === 'month' ? { start: monthStart(today), end: today }
  : key === 'lastMonth' ? (() => { const e = addDays(monthStart(today), -1); return { start: monthStart(e), end: e }; })()
  : key === 'd90' ? { start: addDays(today, -89), end: today } : key === 'year' ? { start: `${today.slice(0, 4)}-01-01`, end: today } : null;

/** Phân khúc chính của một khách (ưu tiên từ trên xuống), cùng định nghĩa với API. */
function segmentOf(c: { successOrders: number; successNet: number; daysSinceSuccess: number | null; firstSuccessAt: string | null }, today: string) {
  const days = c.daysSinceSuccess ?? 9999;
  const firstDays = c.firstSuccessAt ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.firstSuccessAt}Z`)) / 86400000) : 9999;
  if (!c.successOrders) return 'never';
  if (c.successNet >= 5_000_000) return 'vip';
  if (c.successOrders >= 3 && days <= 90) return 'loyal';
  if (c.successOrders >= 2 && days > 60) return 'risk';
  if (c.successOrders === 1 && firstDays <= 30) return 'new';
  if (days <= 30) return 'active';
  if (c.successOrders === 1 && days <= 90) return 'potential';
  return 'dormant';
}
/** Điểm khách 0–100 từ 4 thành phần: tần suất, giá trị đơn, mức độ tương tác (tỷ lệ đơn thành công), thời gian gần đây. */
function scoreOf(c: { successOrders: number; successNet: number; orders: number; daysSinceSuccess: number | null; firstSuccessAt: string | null; lastSuccessAt: string | null }) {
  const months = c.firstSuccessAt && c.lastSuccessAt ? Math.max(1, (Date.parse(`${c.lastSuccessAt}Z`) - Date.parse(`${c.firstSuccessAt}Z`)) / (30 * 86400000)) : 1;
  const freqPerMonth = c.successOrders / months;
  const freq = Math.min(100, Math.round(freqPerMonth / 2 * 100));
  const avg = c.successOrders ? c.successNet / c.successOrders : 0;
  const value = Math.min(100, Math.round(avg / 1_500_000 * 100));
  const engage = c.orders ? Math.round(c.successOrders / c.orders * 100) : 0;
  const recency = c.daysSinceSuccess === null ? 0 : Math.max(0, Math.round(100 - c.daysSinceSuccess / 120 * 100));
  const total = Math.round(freq * 0.3 + value * 0.3 + engage * 0.15 + recency * 0.25);
  return { total, freq, value, engage, recency, freqPerMonth };
}

export function CustomersPage({ initialQ = '' }: { initialQ?: string }) {
  const today = todayVn();
  const team = useTeam();
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [q, setQ] = useState(initialQ);
  const [segment, setSegment] = useState('');
  const [sort, setSort] = useState('spend');
  const [sellerId, setSellerId] = useState('');
  const [periodKey, setPeriodKey] = useState('all');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<List | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<'overview' | 'journey' | 'products' | 'notes'>('overview');
  useEffect(() => { void fetch(`/api/employees?team=${team}`).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then((rows) => setEmployees(rows)).catch(() => undefined); }, [team]);

  const range = periodKey === 'custom' ? { start, end } : periodRange(periodKey, today);
  const periodMode = !!range;
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ posIds: posIds.join(','), q, page: String(page), sort, sellerId, team });
    if (periodMode && range) { params.set('start', range.start); params.set('end', range.end); }
    else { params.set('group', 'all'); if (segment) params.set('segment', segment); }
    try {
      const r = await fetch(`/api/reports/customers?${params}`, { cache: 'no-store' });
      const body = await r.json() as List & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được danh sách khách.');
      setData(body);
      if (!selected && body.customers[0]) void open(body.customers[0]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được danh sách khách.'); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posIds, q, page, sort, sellerId, periodMode, range?.start, range?.end, segment, team]);
  useEffect(() => { void load(); }, [load]);
  const open = async (c: Customer) => {
    setSelected(c); setTab('overview');
    if (window.innerWidth < 1280) setTimeout(() => document.getElementById('customer-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    const r = await fetch(`/api/reports/customers/detail?posId=${c.posId}&phone=${encodeURIComponent(c.phone)}`, { cache: 'no-store' });
    if (r.ok) setDetail(await r.json() as Detail);
  };
  const reset = () => setPage(1);
  const seg = data?.segments;
  const score = selected ? scoreOf(selected) : null;
  const selSeg = selected ? SEGMENTS[segmentOf(selected, today)] : null;
  const nextAction = (c: Customer) => {
    const s = segmentOf(c, today);
    if (s === 'risk') return { label: 'Gọi hỏi thăm, gửi ưu đãi quay lại', tone: 'red' as Tone };
    if (s === 'dormant') return { label: 'Gửi tin nhắn tái kích hoạt', tone: 'orange' as Tone };
    if (s === 'new') return { label: 'Hỏi trải nghiệm sau lần mua đầu', tone: 'blue' as Tone };
    if (s === 'potential') return { label: 'Gợi ý sản phẩm mua kèm', tone: 'purple' as Tone };
    if (s === 'vip' || s === 'loyal') return { label: 'Chăm sóc VIP, giữ nhịp mua', tone: 'green' as Tone };
    if (s === 'never') return { label: 'Theo dõi đơn đang xử lý', tone: 'gray' as Tone };
    return { label: 'Duy trì liên hệ định kỳ', tone: 'teal' as Tone };
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Số liệu Pancake POS tại thời điểm đồng bộ" title="Hồ sơ khách hàng" subtitle="Quản lý thông tin, hành vi mua hàng và chăm sóc khách hàng. Mỗi khách = một SĐT trong một POS."
        actions={<Button variant="outline" disabled={!data} onClick={async () => {
          if (!data) return;
          const XLSX = await import('xlsx');
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['POS', 'SĐT', 'Tên', 'Phân khúc', 'Điểm', 'Phụ trách', 'Đơn', 'Mua thành công', 'Tổng tiền mua', 'TB/đơn', 'Số loại SP', 'Hoàn', 'Hủy', 'Mua gần nhất', 'Ngày chưa mua', 'Sản phẩm đã mua'],
            ...data.customers.map((c) => [c.posName, c.phone, c.name, SEGMENTS[segmentOf(c, today)].label, scoreOf(c).total, c.sellerName, c.orders, c.successOrders, c.successNet, Math.round(c.averageOrder ?? 0), c.productKinds, c.returnedOrders, c.cancelledOrders, dt(c.lastSuccessAt), c.daysSinceSuccess, c.products.map((p) => `${p.name} ×${p.quantity}`).join('; ')]),
          ]), 'Khách hàng');
          XLSX.writeFile(wb, `khach-hang_${segment || 'tat-ca'}.xlsx`);
        }}>Xuất Excel (trang này)</Button>} />
      {seg && (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
          <KpiCard icon={Users} tone="green" label="Tổng khách hàng" value={vi.format(data!.groups?.total ?? 0)} note={`${vi.format(seg.buyers)} đã mua thành công`} onClick={() => { reset(); setPeriodKey('all'); setSegment(''); }} active={!periodMode && !segment} />
          <KpiCard icon={UserCheck} tone="teal" label="Khách đang hoạt động" value={vi.format(seg.active)} note="Mua trong 30 ngày qua" onClick={() => { reset(); setPeriodKey('all'); setSegment('active'); }} active={!periodMode && segment === 'active'} />
          <KpiCard icon={Star} tone="lime" label="Khách thân thiết" value={vi.format(seg.loyal)} note="≥ 3 lần mua, quay lại trong 90 ngày" onClick={() => { reset(); setPeriodKey('all'); setSegment('loyal'); }} active={!periodMode && segment === 'loyal'} />
          <KpiCard icon={AlertTriangle} tone="red" label="Có nguy cơ rời bỏ" value={vi.format(seg.risk)} note="≥ 2 lần mua, > 60 ngày chưa quay lại" onClick={() => { reset(); setPeriodKey('all'); setSegment('risk'); }} active={!periodMode && segment === 'risk'} />
          <KpiCard icon={Wallet} tone="orange" label="Giá trị vòng đời trung bình" value={money(seg.buyers ? seg.ltvTotal / seg.buyers : null)} note={`${vi.format(seg.vip)} khách VIP (≥ 5 triệu)`} onClick={() => { reset(); setPeriodKey('all'); setSegment('vip'); }} active={!periodMode && segment === 'vip'} />
        </div>
      )}
      <Toolbar>
        <Input placeholder="Tìm theo SĐT hoặc tên khách" className="w-60" value={q} onChange={(e) => { reset(); setQ(e.target.value); }} />
        <Select value={segment || '__all'} items={Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k || '__all', v.label]))} onValueChange={(v) => { reset(); setPeriodKey('all'); setSegment(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SEGMENTS).map(([k, v]) => <SelectItem key={k || '__all'} value={k || '__all'}>{v.label}{v.hint ? ` · ${v.hint}` : ''}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={periodKey} items={PERIODS} onValueChange={(v) => { reset(); setPeriodKey(String(v)); if (v !== 'all') setSegment(''); }}>
          <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {periodKey === 'custom' && <><Input type="date" className="w-auto" value={start} max={end} onChange={(e) => { reset(); setStart(e.target.value); }} /><span className="text-sm text-[#7d9184]">→</span><Input type="date" className="w-auto" value={end} min={start} max={today} onChange={(e) => { reset(); setEnd(e.target.value); }} /></>}
        <Select value={sort} items={SORTS} onValueChange={(v) => { reset(); setSort(String(v)); }}>
          <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).filter(([k]) => !periodMode || ['spend', 'orders', 'recent'].includes(k)).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sellerId || '__all'} items={{ __all: 'Tất cả quản lý', ...Object.fromEntries(employees.map((e) => [e.id, e.name])) }} onValueChange={(v) => { reset(); setSellerId(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả quản lý</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
        </Select>
      </Toolbar>
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ChartCard icon={Users} title={`Danh sách khách hàng (${vi.format(data?.total ?? 0)})`} subtitle={periodMode && data?.period ? `Top khách trong kỳ ${data.period.start} → ${data.period.end}: ${vi.format(data.period.orders)} đơn thành công · ${money(data.period.net)}` : segment ? `${SEGMENTS[segment].label} · ${SEGMENTS[segment].hint}` : data?.definitions.success}
          action={<div className="flex items-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button><span>Trang {page}</span><Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>›</Button></div>}>
          {loading && !data && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
          {data && !data.customers.length && <EmptyState text="Không có khách phù hợp bộ lọc." />}
          {data && data.customers.length > 0 && (
            <div className="max-h-[44rem] overflow-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">Khách hàng</th><th>POS</th><th>Lần mua gần nhất</th><th className="text-right">Số đơn</th><th className="text-right">{periodMode ? 'Trong kỳ' : 'LTV'}</th><th>Phân khúc</th><th>Quản lý</th></tr></thead>
                <tbody>
                  {data.customers.map((c) => {
                    const s = SEGMENTS[segmentOf(c, today)];
                    const on = selected?.posId === c.posId && selected?.phone === c.phone;
                    return (
                      <tr key={`${c.posId}:${c.phone}`} className={`cursor-pointer border-t hover:bg-[#f5faf5] ${on ? 'bg-[#eef7f1]' : ''}`} onClick={() => void open(c)}>
                        <td className="py-2"><div className="flex items-center gap-2"><Avatar name={c.name || c.phone} size="sm" /><div><div className="font-medium">{c.name || 'Khách chưa có tên'}</div><div className="text-xs text-[#7d9184]">{c.phone}</div></div></div></td>
                        <td className="whitespace-nowrap text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posColor(c.posId) }} />{c.posName}</td>
                        <td className="whitespace-nowrap text-xs">{dt(c.lastSuccessAt)}{c.daysSinceSuccess !== null ? <div className="text-[#7d9184]">{c.daysSinceSuccess} ngày trước</div> : null}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(c.successOrders)}<span className="text-xs text-[#7d9184]"> / {vi.format(c.orders)}</span></td>
                        <td className="whitespace-nowrap text-right font-semibold">{money(c.successNet)}</td>
                        <td><StatusChip tone={s.tone}>{s.label}</StatusChip></td>
                        <td className="whitespace-nowrap text-xs">{c.sellerName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <div className="space-y-4 scroll-mt-16" id="customer-detail">
          {!selected && <ChartCard title="Chi tiết khách hàng"><EmptyState text="Chọn một khách trong danh sách để xem hồ sơ." /></ChartCard>}
          {selected && (
            <>
              <section className="rounded-2xl border bg-white p-4 shadow-[0_4px_18px_rgba(25,65,46,.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-14 place-items-center rounded-full bg-[#17684b] text-lg font-semibold text-white">{(selected.name || selected.phone).trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-semibold">{selected.name || 'Khách chưa có tên'}</h3>{selSeg && <StatusChip tone={selSeg.tone}>{selSeg.label}</StatusChip>}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#547467]"><span className="flex items-center gap-1"><Phone size={12} />{selected.phone}</span><span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: posColor(selected.posId) }} />{selected.posName}</span><span className="flex items-center gap-1"><ShoppingBag size={12} />{selected.successOrders} đơn thành công / {selected.orders} đơn</span><span className="flex items-center gap-1"><Calendar size={12} />Khách từ {dt(detail?.profile?.customerSince ?? selected.firstOrderAt)}</span><span className="flex items-center gap-1"><User size={12} />Quản lý: {selected.sellerName}</span></div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`tel:${selected.phone}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[#f5faf5]"><Phone size={13} />Gọi điện</a>
                    <a href={`https://zalo.me/${selected.phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[#f5faf5]"><Globe size={13} />Gửi Zalo</a>
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[#f5faf5]" onClick={() => void navigator.clipboard?.writeText(selected.phone)}>Sao chép SĐT</button>
                  </div>
                </div>
                {detail?.profile?.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{detail.profile.tags.map((t) => <StatusChip key={t} tone="gray"><Tag size={11} />{t}</StatusChip>)}</div> : null}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { l: 'Tổng chi tiêu (LTV)', v: money(selected.lifetimeNet || selected.successNet) },
                    { l: 'Tần suất mua', v: score ? `${score.freqPerMonth.toFixed(1).replace('.', ',')} đơn/tháng` : '—' },
                    { l: 'Giá trị đơn TB', v: money(selected.lifetimeOrders ? (selected.lifetimeNet || selected.successNet) / selected.lifetimeOrders : selected.averageOrder) },
                    { l: 'Lần mua gần nhất', v: dt(selected.lastSuccessAt) },
                  ].map((x) => <div key={x.l} className="rounded-xl border bg-[#f8faf8] p-3"><div className="text-[11px] text-[#7d9184]">{x.l}</div><div className="text-base font-semibold">{x.v}</div></div>)}
                </div>
                <div className="mt-3 rounded-xl border border-[#d8e8db] bg-[#f1f8f3] p-3 text-xs"><span className="font-semibold text-[#17684b]">Gợi ý chăm sóc: </span>{nextAction(selected).label}</div>
              </section>
              <ChartCard title="Hồ sơ chi tiết" action={
                <div className="flex gap-1">{([['overview', 'Tổng quan'], ['journey', 'Hành trình'], ['products', 'Sản phẩm yêu thích'], ['notes', 'Ghi chú']] as const).map(([k, l]) => <Button key={k} size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{l}{k === 'notes' && detail ? ` (${detail.orders.filter((o) => o.note).length})` : ''}</Button>)}</div>
              }>
                {!detail && <p className="text-sm text-[#7d9184]">Đang tải hồ sơ…</p>}
                {detail && tab === 'overview' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7d9184]">Thông tin khách hàng</h4>
                      <dl className="space-y-1.5 text-sm">
                        {[
                          [User, 'Họ và tên', detail.stats?.name || '—'], [Phone, 'SĐT', detail.phone], [Mail, 'Email', detail.profile?.email || '—'],
                          [Users, 'Giới tính', detail.profile?.gender === 'male' ? 'Nam' : detail.profile?.gender === 'female' ? 'Nữ' : detail.profile?.gender || '—'],
                          [Cake, 'Ngày sinh', detail.profile?.dob ? dt(String(detail.profile.dob)) : '—'],
                          [MapPin, 'Địa chỉ', detail.profile?.address || '—'],
                          [Globe, 'Nguồn đến', detail.profile?.sources.join(', ') || '—'],
                          [Award, 'Hạng Pancake', detail.profile?.level ? String(detail.profile.level) : '—'],
                          [Gift, 'Điểm thưởng', detail.profile?.rewardPoint != null ? vi.format(Number(detail.profile.rewardPoint)) : '—'],
                          [Heart, 'Marketer', detail.profile?.marketers.join(', ') || '—'],
                        ].map(([Icon, l, v]) => { const I = Icon as typeof User; return <div key={String(l)} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="flex items-center gap-1.5 text-[#7d9184]"><I size={13} />{String(l)}</dt><dd className="break-words">{String(v)}</dd></div>; })}
                      </dl>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-xl border p-3">
                        <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Phân khúc & điểm số</h4>{selSeg && <StatusChip tone={selSeg.tone}><Sparkles size={11} />{selSeg.label}</StatusChip>}</div>
                        {score && (
                          <>
                            <div className="mt-1 flex items-end gap-2"><span className="text-3xl font-semibold text-[#17684b]">{score.total}</span><span className="pb-1 text-xs text-[#7d9184]">điểm</span><span className="mb-1.5 ml-auto inline-block h-2 w-32 overflow-hidden rounded-full bg-[#eef1ee]"><span className="block h-2 rounded-full bg-[#17684b]" style={{ width: `${score.total}%` }} /></span></div>
                            <ul className="mt-2 space-y-1.5 text-xs">
                              {[['Tần suất mua', score.freq], ['Giá trị đơn hàng', score.value], ['Mức độ tương tác', score.engage], ['Thời gian gần đây', score.recency]].map(([l, v]) => <li key={String(l)} className="flex items-center gap-2"><span className="w-32 text-[#547467]">{l}</span><span className="w-8 text-right font-medium">{v}</span><span className="inline-block h-1.5 flex-1 overflow-hidden rounded-full bg-[#eef1ee]"><span className="block h-1.5 rounded-full bg-[#1a9c5b]" style={{ width: `${v}%` }} /></span></li>)}
                            </ul>
                          </>
                        )}
                      </div>
                      <div className="rounded-xl border p-3">
                        <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Clock size={14} />Tình trạng</h4>
                        <ul className="mt-1.5 space-y-1 text-xs text-[#4c5f55]">
                          <li>Mua đầu: <strong>{dt(detail.stats?.firstSuccessAt)}</strong> · gần nhất: <strong>{dt(detail.stats?.lastSuccessAt)}</strong>{selected.daysSinceSuccess !== null ? ` (${selected.daysSinceSuccess} ngày trước)` : ''}</li>
                          <li>Đơn: {detail.stats?.orders} tạo · {detail.stats?.closedOrders} chốt · {detail.stats?.successOrders} thành công · {detail.stats?.returnedOrders} hoàn · {detail.stats?.cancelledOrders} hủy</li>
                          <li>{detail.stats?.productKinds} loại sản phẩm · {vi.format(Number(detail.stats?.successQuantity ?? 0))} sản phẩm đã mua</li>
                          {detail.profile?.pancakeSuccessOrders != null && <li>Pancake ghi nhận: {detail.profile.pancakeSuccessOrders} đơn thành công · {money(Number(detail.profile.pancakeAmount ?? 0))} (toàn shop)</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {detail && tab === 'journey' && (
                  <div className="max-h-[32rem] overflow-auto">
                    {detail.orders.length ? (
                      <ol className="relative ml-2 space-y-3 border-l pl-4">
                        {detail.orders.map((o) => {
                          const tone: Tone = [3, 16].includes(o.statusCode) ? 'green' : [4, 5, 15].includes(o.statusCode) ? 'purple' : [6, 7].includes(o.statusCode) ? 'red' : [0, 17].includes(o.statusCode) ? 'gray' : 'blue';
                          return (
                            <li key={o.id} className="relative">
                              <span className={`absolute -left-[1.35rem] top-1.5 inline-block size-2.5 rounded-full ${tone === 'green' ? 'bg-[#1a9c5b]' : tone === 'red' ? 'bg-[#d24b4b]' : tone === 'purple' ? 'bg-[#eb6834]' : tone === 'gray' ? 'bg-[#9db3a5]' : 'bg-[#2a78d6]'}`} />
                              <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-xs text-[#7d9184]">{dt(o.createdAt, true)}</span><strong>#{o.sourceOrderId}</strong><StatusChip tone={tone}>{o.statusName}</StatusChip>{o.successRank ? <StatusChip tone="teal">{o.successRank === 1 ? 'Mua lần đầu' : `Upsell ${o.successRank - 1}`}</StatusChip> : null}<span className="ml-auto font-semibold">{money(o.net)}</span></div>
                              <div className="mt-0.5 text-xs text-[#547467]">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ') || '—'}</div>
                              <div className="text-[11px] text-[#7d9184]">{o.sellerName ?? '—'}{o.closerName && o.closerName !== o.sellerName ? ` · chốt: ${o.closerName}` : ''}{o.sourceName ? ` · ${o.sourceName}` : ''}{o.confirmedAt ? ` · XN ${dt(o.confirmedAt, true)}` : ''}{o.deliveredAt ? ` · giao ${dt(o.deliveredAt)}` : ''}{o.returnedReason ? ` · lý do hoàn: ${o.returnedReason}` : ''}</div>
                            </li>
                          );
                        })}
                      </ol>
                    ) : <EmptyState text="Chưa có đơn nào được đồng bộ cho khách này." />}
                  </div>
                )}
                {detail && tab === 'products' && (
                  detail.stats?.products.length ? (
                    <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                      <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">Sản phẩm</th><th className="text-right">Số lần</th><th className="text-right">Số lượng</th><th className="text-right">Tổng tiền</th><th>Tỷ trọng</th></tr></thead>
                      <tbody>{detail.stats.products.map((p) => { const max = detail.stats!.products[0]?.total || 1; return <tr key={p.name} className="border-t"><td className="py-2">{p.name}</td><td className="text-right">{p.orders}</td><td className="text-right">{vi.format(p.quantity)}</td><td className="whitespace-nowrap text-right font-medium">{money(p.total)}</td><td><span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full bg-[#17684b]" style={{ width: `${p.total / max * 100}%` }} /></span> <span className="text-xs text-[#7d9184]">{pct(detail.stats!.successNet ? p.total / detail.stats!.successNet * 100 : null)}</span></td></tr>; })}</tbody>
                    </table>
                  ) : <EmptyState text="Chưa có sản phẩm mua thành công." />
                )}
                {detail && tab === 'notes' && (
                  <div className="space-y-2">
                    {detail.profile?.notes.length ? detail.profile.notes.map((n, i) => <div key={i} className="rounded-xl border bg-[#fffbea] p-3 text-sm"><div className="text-[11px] text-[#7d9184]">Ghi chú khách trên Pancake</div>{n}</div>) : null}
                    {detail.orders.filter((o) => o.note || o.tags.length).map((o) => <div key={o.id} className="rounded-xl border p-3 text-sm"><div className="text-[11px] text-[#7d9184]">{dt(o.createdAt, true)} · đơn #{o.sourceOrderId}</div><div>{o.note || <span className="text-[#7d9184]">—</span>}</div>{o.tags.length ? <div className="mt-1 flex flex-wrap gap-1">{o.tags.map((t) => <StatusChip key={t.name} tone="gray">#{t.name}</StatusChip>)}</div> : null}</div>)}
                    {!detail.profile?.notes.length && !detail.orders.some((o) => o.note || o.tags.length) && <EmptyState text="Chưa có ghi chú nào trên các đơn của khách." />}
                  </div>
                )}
              </ChartCard>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-[#7d9184]"><TrendingUp size={12} className="mr-1 inline" />Điểm khách = 30% tần suất (2 đơn/tháng = 100) + 30% giá trị đơn (1,5 triệu = 100) + 15% tương tác (đơn thành công ÷ đơn tạo) + 25% thời gian gần đây (giảm dần trong 120 ngày). LTV = tổng doanh thu đơn thành công.</p>
    </div>
  );
}
