'use client';

// Hồ sơ khách hàng: danh sách bên trái (phân khúc, bộ lọc, sắp xếp, top khách theo kỳ) và bảng chi tiết bên phải
// (thông tin Pancake, chỉ số RFM, hành trình mua, sản phẩm yêu thích, ghi chú trên đơn).
// Giao diện v2: tìm chờ 300 ms + huỷ request cũ; đổi khách thì xoá panel ngay và bỏ qua response của khách trước;
// lỗi hồ sơ có nút thử lại; không tự cuộn xuống panel trên điện thoại; tab hồ sơ là SegmentedControl cuộn ngang được.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, Award, Calendar, Cake, ChevronLeft, ChevronRight, Clock, Copy, Gift, Globe, Heart, Mail, MapPin, Phone, ShoppingBag, Sparkles, Star, Tag, User, UserCheck, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { addDays, todayVn } from '@/lib/report-time';
import { PosChips } from './overview-view';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import {
  Avatar, ChartCard, Definitions, ErrorBox, EmptyState, HoverReveal, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, Toolbar,
  dt, money, pct, posVar, scrollToEl, short, shortMoney, toast, vi, type SortState, type Tone,
} from './ui-kit';

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
type DetailTab = 'overview' | 'journey' | 'products' | 'notes';
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
// Cột sắp xếp trên bảng ↔ tham số sort của API (cùng trạng thái với ô "Sắp xếp"); quantity / first không có cột riêng.
const SORT_COLS: Record<string, { key: string; desc: boolean }> = { spend: { key: 'spend', desc: true }, orders: { key: 'orders', desc: true }, recent: { key: 'recent', desc: true }, dormant: { key: 'recent', desc: false }, name: { key: 'name', desc: false } };
const PERIODS: Record<string, string> = { all: 'Toàn bộ lịch sử', month: 'Tháng này', lastMonth: 'Tháng trước', d90: '90 ngày qua', year: 'Năm nay', custom: 'Khoảng tùy chọn' };
const periodRange = (key: string, today: string) => key === 'month' ? { start: monthStart(today), end: today }
  : key === 'lastMonth' ? (() => { const e = addDays(monthStart(today), -1); return { start: monthStart(e), end: e }; })()
  : key === 'd90' ? { start: addDays(today, -89), end: today } : key === 'year' ? { start: `${today.slice(0, 4)}-01-01`, end: today } : null;
/** Màu chấm hành trình theo tông trạng thái đơn (token, theo chủ đề sáng / tối). */
const TONE_DOT: Partial<Record<Tone, string>> = { green: 'var(--st-delivered)', red: 'var(--st-cancelled)', purple: 'var(--st-returned)', gray: 'var(--st-new)', blue: 'var(--st-confirmed)' };
const SCORE_NOTE = 'Điểm khách = 30% tần suất (2 đơn/tháng = 100) + 30% giá trị đơn (1,5 triệu = 100) + 15% tương tác (đơn thành công ÷ đơn tạo) + 25% thời gian gần đây (giảm dần trong 120 ngày). LTV = tổng doanh thu đơn thành công.';
/** Tooltip KPI dạng "nhãn · giá trị" cho số liệu chụp tại thời điểm đồng bộ (không theo kỳ nên không dùng nhãn "Kỳ này"). */
const tip = (title: string, rows: [string, string][], how?: string) => (
  <><b>{title}</b>{rows.map(([l, v]) => <span key={l} className="r"><span>{l}</span><span className="num">{v}</span></span>)}{how ? <span className="how block">Cách tính: {how}</span> : null}</>
);
/** Dòng bảng bấm được: Tab tới được, Enter / Space mở; phím bấm trên nút con bên trong không kích hoạt dòng. */
const rowKeys = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

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
  const [query, setQuery] = useState(initialQ.trim());
  const [segment, setSegment] = useState('');
  const [sort, setSort] = useState('spend');
  const [sellerId, setSellerId] = useState('');
  const [periodKey, setPeriodKey] = useState('all');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [page, setPage] = useState(1);
  // Xem toàn bộ: tải một lượt tới 5.000 khách theo bộ lọc hiện tại thay vì 50/trang.
  const [viewAll, setViewAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const detailCtrl = useRef<AbortController | null>(null);
  useEffect(() => { void fetch(`/api/employees?team=${team}`).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then((rows) => setEmployees(rows)).catch(() => undefined); }, [team]);
  // Ô tìm: chờ 300 ms sau phím cuối rồi mới gửi request; về trang 1.
  useEffect(() => {
    const v = q.trim();
    if (v === query) return;
    const t = window.setTimeout(() => { setPage(1); setQuery(v); }, 300);
    return () => clearTimeout(t);
  }, [q, query]);

  const range = periodKey === 'custom' ? { start, end } : periodRange(periodKey, today);
  const periodMode = !!range;
  const buildParams = (size: number, pg: number) => {
    const params = new URLSearchParams({ posIds: posIds.join(','), q: query, page: String(pg), size: String(size), sort, sellerId, team });
    if (periodMode && range) { params.set('start', range.start); params.set('end', range.end); }
    else { params.set('group', 'all'); if (segment) params.set('segment', segment); }
    return params;
  };
  // Mở hồ sơ: xoá panel ngay, huỷ request của khách trước, bỏ qua response không khớp khách đang chọn; lỗi thì có nút thử lại.
  const open = async (c: Customer, opts: { scroll?: boolean } = {}) => {
    detailCtrl.current?.abort();
    const ac = new AbortController(); detailCtrl.current = ac;
    const same = selected?.posId === c.posId && selected?.phone === c.phone;
    setSelected(c); if (!same) setTab('overview');
    setDetail(null); setDetailError(null); setDetailState('loading');
    if (opts.scroll !== false && window.innerWidth < 1280) setTimeout(() => scrollToEl(document.getElementById('customer-detail')), 50);
    try {
      const r = await fetch(`/api/reports/customers/detail?posId=${c.posId}&phone=${encodeURIComponent(c.phone)}`, { cache: 'no-store', signal: ac.signal });
      const body = await r.json().catch(() => ({})) as Detail & { error?: string };
      if (ac.signal.aborted) return;
      if (!r.ok) throw new Error(body.error ?? `Máy chủ trả lỗi ${r.status}.`);
      setDetail(body); setDetailState('idle');
    } catch (e) {
      if (ac.signal.aborted) return;
      setDetailError(e instanceof Error ? e.message : 'Không tải được hồ sơ.'); setDetailState('error');
    }
  };
  // Số "lần cuối" hiện ngay từ trình duyệt (useApi), máy chủ trả số mới thì thay; đổi bộ lọc / gõ tìm / đổi trang thì tải lại theo URL mới (request cũ bị huỷ).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const url = useMemo(() => `/api/reports/customers?${buildParams(viewAll ? 5000 : 50, viewAll ? 1 : page)}`, [posIds, query, page, sort, sellerId, periodMode, range?.start, range?.end, segment, team, viewAll]);
  const { data, at, stale, loading, error, reload } = useApi<List>(url);
  // Chỉ tự mở khách đầu tiên ở màn hình hai cột (≥ 1280px); điện thoại giữ danh sách, không tự cuộn. Số lưu từ lần trước cũng mở được ngay.
  useEffect(() => {
    if (data && !selected && data.customers[0] && window.innerWidth >= 1280) void open(data.customers[0], { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => () => detailCtrl.current?.abort(), []);
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
  const listSort: SortState = {
    key: SORT_COLS[sort]?.key ?? '', desc: SORT_COLS[sort]?.desc,
    toggle: (k: string) => { reset(); setSort(k === 'recent' ? (sort === 'recent' && !periodMode ? 'dormant' : 'recent') : k); },
    mark: () => '',
  };
  const searching = loading && q.trim() !== '' && q.trim() === query;
  const notesCount = detail ? detail.orders.filter((o) => o.note).length + (detail.profile?.notes.length ?? 0) : 0;
  const copyPhone = async (phone: string) => {
    try { await navigator.clipboard?.writeText(phone); toast(`Đã sao chép ${phone}`); } catch { toast('Không sao chép được', { kind: 'error' }); }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Số liệu Pancake POS tại thời điểm đồng bộ" title="Hồ sơ khách hàng" subtitle="Mỗi khách = một SĐT trong một POS"
        actions={<><StaleChip stale={stale} at={at} loading={loading} error={data ? error : null} onRetry={reload} /><Button variant="outline" disabled={!data || exporting} onClick={async () => {
          if (!data) return;
          setExporting(true);
          try {
          // Xuất toàn bộ theo bộ lọc hiện tại (tối đa 20.000 khách), không chỉ trang đang xem.
          const all = await fetch(`/api/reports/customers?${buildParams(20000, 1)}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() as Promise<List> : null).catch(() => null);
          const rows = all?.customers ?? data.customers;
          const XLSX = await import('xlsx');
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['POS', 'SĐT', 'Tên', 'Phân khúc', 'Điểm', 'Phụ trách', 'Đơn', 'Mua thành công', 'Tổng tiền mua', 'TB/đơn', 'Số loại SP', 'Hoàn', 'Hủy', 'Mua gần nhất', 'Ngày chưa mua', 'Sản phẩm đã mua'],
            ...rows.map((c) => [c.posName, c.phone, c.name, SEGMENTS[segmentOf(c, today)].label, scoreOf(c).total, c.sellerName, c.orders, c.successOrders, c.successNet, Math.round(c.averageOrder ?? 0), c.productKinds, c.returnedOrders, c.cancelledOrders, dt(c.lastSuccessAt), c.daysSinceSuccess, c.products.map((p) => `${p.name} ×${p.quantity}`).join('; ')]),
          ]), 'Khách hàng');
          XLSX.writeFile(wb, `khach-hang_${segment || 'tat-ca'}.xlsx`);
          } finally { setExporting(false); }
        }}>{exporting ? 'Đang xuất…' : 'Xuất Excel toàn bộ'}</Button></>} />
      {!data && !error && <SkeletonKpis count={5} className="xl:grid-cols-5" />}
      {seg && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <KpiCard icon={Users} tone="green" label="Tổng khách hàng" value={vi.format(data!.groups?.total ?? 0)} countUp rawValue={data!.groups?.total ?? 0} note={`${vi.format(seg.buyers)} đã mua thành công`} onClick={() => { reset(); setPeriodKey('all'); setSegment(''); }} active={!periodMode && !segment}
            tooltip={tip('Tổng khách hàng', [['Tổng khách', `${vi.format(data!.groups?.total ?? 0)} khách`], ['Đã mua thành công', `${vi.format(seg.buyers)} khách`], ['Chưa từng mua', `${vi.format(seg.never)} khách`]], `${data!.definitions.identity} Bấm để xem tất cả phân khúc.`)} />
          <KpiCard icon={UserCheck} tone="teal" label="Khách đang hoạt động" value={vi.format(seg.active)} countUp rawValue={seg.active} note="Mua trong 30 ngày qua" onClick={() => { reset(); setPeriodKey('all'); setSegment('active'); }} active={!periodMode && segment === 'active'}
            tooltip={tip('Khách đang hoạt động', [['Số khách', `${vi.format(seg.active)} khách`], ['Tỷ lệ trên khách đã mua', pct(seg.buyers ? seg.active / seg.buyers * 100 : null)]], 'Khách có đơn mua thành công trong 30 ngày qua. Bấm để lọc.')} />
          <KpiCard icon={Star} tone="lime" label="Khách thân thiết" value={vi.format(seg.loyal)} countUp rawValue={seg.loyal} note="≥ 3 lần mua, quay lại trong 90 ngày" onClick={() => { reset(); setPeriodKey('all'); setSegment('loyal'); }} active={!periodMode && segment === 'loyal'}
            tooltip={tip('Khách thân thiết', [['Số khách', `${vi.format(seg.loyal)} khách`], ['Tỷ lệ trên khách đã mua', pct(seg.buyers ? seg.loyal / seg.buyers * 100 : null)]], 'Mua thành công từ 3 lần và lần gần nhất trong 90 ngày. Bấm để lọc.')} />
          <KpiCard icon={AlertTriangle} tone="red" label="Có nguy cơ rời bỏ" value={vi.format(seg.risk)} countUp rawValue={seg.risk} note="≥ 2 lần mua, > 60 ngày chưa quay lại" onClick={() => { reset(); setPeriodKey('all'); setSegment('risk'); }} active={!periodMode && segment === 'risk'}
            tooltip={tip('Có nguy cơ rời bỏ', [['Số khách', `${vi.format(seg.risk)} khách`], ['Tỷ lệ trên khách đã mua', pct(seg.buyers ? seg.risk / seg.buyers * 100 : null)]], 'Từng mua từ 2 lần nhưng đã hơn 60 ngày chưa quay lại. Bấm để lọc và gọi chăm sóc.')} />
          <KpiCard icon={Wallet} tone="orange" label="Giá trị vòng đời trung bình" value={shortMoney(seg.buyers ? seg.ltvTotal / seg.buyers : null)} note={`${vi.format(seg.vip)} khách VIP (≥ 5 triệu)`} onClick={() => { reset(); setPeriodKey('all'); setSegment('vip'); }} active={!periodMode && segment === 'vip'}
            tooltip={tip('Giá trị vòng đời trung bình', [['LTV trung bình', money(seg.buyers ? seg.ltvTotal / seg.buyers : null)], ['Tổng LTV', money(seg.ltvTotal)], ['Khách VIP', `${vi.format(seg.vip)} khách`]], 'Tổng doanh thu đơn thành công ÷ số khách đã mua. Bấm để xem khách VIP.')} />
        </div>
      )}
      <Toolbar>
        <div className="relative w-72 max-w-full">
          <Input placeholder="Tìm theo SĐT hoặc tên khách" aria-label="Tìm theo SĐT hoặc tên khách" className={searching ? 'pr-20' : ''} value={q} onChange={(e) => setQ(e.target.value)} />
          {searching && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-3">Đang tìm…</span>}
        </div>
        <Select value={segment || '__all'} items={Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k || '__all', v.label]))} onValueChange={(v) => { reset(); setPeriodKey('all'); setSegment(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-44" aria-label="Phân khúc"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SEGMENTS).map(([k, v]) => <SelectItem key={k || '__all'} value={k || '__all'}>{v.label}{v.hint ? <span className="text-ink-3"> · {v.hint}</span> : null}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={periodKey} items={PERIODS} onValueChange={(v) => { reset(); setPeriodKey(String(v)); if (v !== 'all') setSegment(''); }}>
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
        <Select value={sort} items={SORTS} onValueChange={(v) => { reset(); setSort(String(v)); }}>
          <SelectTrigger className="min-w-48" aria-label="Sắp xếp"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).filter(([k]) => !periodMode || ['spend', 'orders', 'recent'].includes(k)).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sellerId || '__all'} items={{ __all: 'Tất cả quản lý', ...Object.fromEntries(employees.map((e) => [e.id, e.name])) }} onValueChange={(v) => { reset(); setSellerId(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-44" aria-label="Người quản lý"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả quản lý</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
        </Select>
      </Toolbar>
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ChartCard icon={Users} title={`Danh sách khách hàng (${vi.format(data?.total ?? 0)})`} subtitle={periodMode && data?.period ? `Top khách trong kỳ ${data.period.start} → ${data.period.end}: ${vi.format(data.period.orders)} đơn thành công · ${money(data.period.net)}` : segment ? `${SEGMENTS[segment].label} · ${SEGMENTS[segment].hint}` : data?.definitions.success}
          bodyClassName={loading && data ? 'opacity-70 transition-opacity duration-[var(--dur)]' : 'transition-opacity duration-[var(--dur)]'}
          action={<div className="flex items-center gap-2 text-sm">{!viewAll && <><Button size="sm" variant="outline" aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button><span className="num text-xs text-ink-2">Trang {page}</span><Button size="sm" variant="outline" aria-label="Trang sau" disabled={!data?.hasMore || loading} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button></>}<Button size="sm" variant={viewAll ? 'default' : 'outline'} aria-pressed={viewAll} onClick={() => { setViewAll(!viewAll); setPage(1); }} title="Tải một lượt tới 5.000 khách theo bộ lọc hiện tại">{viewAll ? 'Theo trang' : 'Xem toàn bộ'}</Button></div>}>
          {!data && !error && <SkeletonTable rows={8} cols={6} />}
          {data && !data.customers.length && <EmptyState text={query ? `Không có khách nào khớp "${query}".` : 'Không có khách phù hợp bộ lọc.'} />}
          {data && data.customers.length > 0 && (
            <TableWrap maxHeight="44rem" minWidth={760} stickyFirst>
              <table className="tbl">
                <thead><tr>{periodMode ? <th>Khách hàng</th> : <SortTh k="name" label="Khách hàng" sort={listSort} align="left" />}<th>POS</th><SortTh k="recent" label="Lần mua gần nhất" sort={listSort} align="left" /><SortTh k="orders" label="Số đơn" sort={listSort} /><SortTh k="spend" label={periodMode ? 'Trong kỳ' : 'LTV'} sort={listSort} /><th>Phân khúc</th><th>Quản lý</th></tr></thead>
                <tbody>
                  {data.customers.map((c) => {
                    const s = SEGMENTS[segmentOf(c, today)];
                    const on = selected?.posId === c.posId && selected?.phone === c.phone;
                    return (
                      <tr key={`${c.posId}:${c.phone}`} tabIndex={0} aria-selected={on} onClick={() => void open(c)} onKeyDown={rowKeys(() => void open(c))} className={`cursor-pointer focus-visible:-outline-offset-2 ${on ? '[&>td]:bg-tint-2' : ''}`}>
                        <td><div className="flex items-center gap-2"><Avatar name={c.name || c.phone} size="sm" /><div className="min-w-0"><div className="max-w-[14rem] truncate font-medium text-ink" title={c.name}>{c.name || 'Khách chưa có tên'}</div><div className="num text-[11px] text-ink-3">{c.phone}</div></div><HoverReveal><span className="btn sm">Hồ sơ<ChevronRight size={12} /></span></HoverReveal></div></td>
                        <td className="text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posVar(c.posId) }} />{c.posName}</td>
                        <td className="text-xs"><span className="num">{dt(c.lastSuccessAt)}</span>{c.daysSinceSuccess !== null ? <div className="text-ink-3"><span className="num">{c.daysSinceSuccess}</span> ngày trước</div> : null}</td>
                        <td className="n">{vi.format(c.successOrders)}<span className="text-xs text-ink-3"> / {vi.format(c.orders)}</span></td>
                        <td className="n">{money(c.successNet)}</td>
                        <td><StatusChip tone={s.tone}>{s.label}</StatusChip></td>
                        <td className="text-xs">{c.sellerName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </ChartCard>

        <div className="space-y-4 scroll-mt-16" id="customer-detail">
          {!selected && <ChartCard icon={User} title="Chi tiết khách hàng"><EmptyState text="Chọn một khách trong danh sách để xem hồ sơ." /></ChartCard>}
          {selected && (
            <>
              <section className="card p-4 max-sm:rounded-xl">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-ink" aria-hidden="true">{(selected.name || selected.phone).trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="display truncate text-xl font-semibold tracking-[-.02em] text-ink" title={selected.name}>{selected.name || 'Khách chưa có tên'}</h3>{selSeg && <StatusChip tone={selSeg.tone}>{selSeg.label}</StatusChip>}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                        <span className="flex items-center gap-1"><Phone size={12} aria-hidden="true" /><span className="num">{selected.phone}</span></span>
                        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: posVar(selected.posId) }} />{selected.posName}</span>
                        <span className="flex items-center gap-1"><ShoppingBag size={12} aria-hidden="true" /><span className="num">{selected.successOrders}</span> đơn thành công / <span className="num">{selected.orders}</span> đơn</span>
                        <span className="flex items-center gap-1"><Calendar size={12} aria-hidden="true" />Khách từ <span className="num">{dt(detail?.profile?.customerSince ?? selected.firstOrderAt)}</span></span>
                        <span className="flex items-center gap-1"><User size={12} aria-hidden="true" />Quản lý: {selected.sellerName}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`tel:${selected.phone}`} className="btn sm"><Phone size={13} aria-hidden="true" />Gọi điện</a>
                    <a href={`https://zalo.me/${selected.phone}`} target="_blank" rel="noreferrer" className="btn sm"><Globe size={13} aria-hidden="true" />Gửi Zalo</a>
                    <button type="button" className="btn sm" onClick={() => void copyPhone(selected.phone)}><Copy size={13} aria-hidden="true" />Sao chép SĐT</button>
                  </div>
                </div>
                {detail?.profile?.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{detail.profile.tags.map((t) => <StatusChip key={t} tone="gray"><Tag size={11} aria-hidden="true" />{t}</StatusChip>)}</div> : null}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { l: 'Tổng chi tiêu (LTV)', v: money(selected.lifetimeNet || selected.successNet) },
                    { l: 'Tần suất mua', v: score ? `${score.freqPerMonth.toFixed(1).replace('.', ',')} đơn/tháng` : '—' },
                    { l: 'Giá trị đơn TB', v: money(selected.lifetimeOrders ? (selected.lifetimeNet || selected.successNet) / selected.lifetimeOrders : selected.averageOrder) },
                    { l: 'Lần mua gần nhất', v: dt(selected.lastSuccessAt) },
                  ].map((x) => <div key={x.l} className="rounded-[10px] bg-surface-2 p-3 transition-colors duration-[var(--dur)] hover:bg-surface-3"><div className="text-[11px] text-ink-3">{x.l}</div><div className="num truncate text-[15px] text-ink" title={x.v}>{x.v}</div></div>)}
                </div>
                <p className="notice info mt-3 text-xs"><span><span className="font-semibold">Gợi ý chăm sóc: </span>{nextAction(selected).label}</span></p>
              </section>
              <ChartCard icon={Sparkles} title="Hồ sơ chi tiết" subtitle={detailState === 'loading' ? 'Đang tải hồ sơ…' : undefined}>
                <div className="-mx-1 mb-3 overflow-x-auto px-1 py-0.5">
                  <SegmentedControl<DetailTab> ariaLabel="Mục hồ sơ" size="sm" value={tab} onChange={setTab} options={[
                    { value: 'overview', label: 'Tổng quan' },
                    { value: 'journey', label: 'Hành trình' },
                    { value: 'products', label: <><span className="sm:hidden">Sản phẩm</span><span className="max-sm:hidden">Sản phẩm yêu thích</span></> },
                    { value: 'notes', label: detail ? <>Ghi chú <span className="num">({notesCount})</span></> : 'Ghi chú' },
                  ]} />
                </div>
                {detailState === 'loading' && <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true" aria-label="Đang tải hồ sơ"><div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skel h-3.5" style={{ width: `${55 + (i * 17) % 40}%` }} />)}</div><div className="space-y-2"><span className="skel h-20" /><span className="skel h-16" /></div></div>}
                {detailState === 'error' && <ErrorBox error={detailError ?? 'Không tải được hồ sơ.'} onRetry={() => void open(selected, { scroll: false })} />}
                {detail && tab === 'overview' && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-3">Thông tin khách hàng</h4>
                      <dl className="space-y-1.5 text-[13px]">
                        {[
                          [User, 'Họ và tên', detail.stats?.name || '—'], [Phone, 'SĐT', detail.phone], [Mail, 'Email', detail.profile?.email || '—'],
                          [Users, 'Giới tính', detail.profile?.gender === 'male' ? 'Nam' : detail.profile?.gender === 'female' ? 'Nữ' : detail.profile?.gender || '—'],
                          [Cake, 'Ngày sinh', detail.profile?.dob ? dt(String(detail.profile.dob)) : '—'],
                          [MapPin, 'Địa chỉ', detail.profile?.address || '—'],
                          [Globe, 'Nguồn đến', detail.profile?.sources.join(', ') || '—'],
                          [Award, 'Hạng Pancake', detail.profile?.level ? String(detail.profile.level) : '—'],
                          [Gift, 'Điểm thưởng', detail.profile?.rewardPoint != null ? vi.format(Number(detail.profile.rewardPoint)) : '—'],
                          [Heart, 'Marketer', detail.profile?.marketers.join(', ') || '—'],
                        ].map(([Icon, l, v]) => { const I = Icon as typeof User; return <div key={String(l)} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="flex items-center gap-1.5 text-ink-3"><I size={13} aria-hidden="true" />{String(l)}</dt><dd className={`break-words text-ink ${l === 'SĐT' || l === 'Điểm thưởng' || l === 'Ngày sinh' ? 'num' : ''}`}>{String(v)}</dd></div>; })}
                      </dl>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-[10px] bg-surface-2 p-3">
                        <div className="flex items-center justify-between gap-2"><h4 className="text-[13px] font-semibold text-ink">Phân khúc & điểm số</h4>{selSeg && <StatusChip tone={selSeg.tone}><Sparkles size={11} aria-hidden="true" />{selSeg.label}</StatusChip>}</div>
                        {score && (
                          <>
                            <div className="mt-1 flex items-end gap-2"><span className="num text-3xl leading-none text-primary">{score.total}</span><span className="pb-0.5 text-xs text-ink-3">điểm</span><span className="pbar mb-1.5 ml-auto h-2 w-32" aria-hidden="true"><i style={{ width: `${score.total}%` }} /></span></div>
                            <ul className="mt-2 space-y-1.5 text-xs">
                              {[['Tần suất mua', score.freq], ['Giá trị đơn hàng', score.value], ['Mức độ tương tác', score.engage], ['Thời gian gần đây', score.recency]].map(([l, v]) => <li key={String(l)} className="flex items-center gap-2"><span className="w-32 text-ink-2">{l}</span><span className="num w-8 text-right text-ink">{v}</span><span className="pbar h-1.5 flex-1" aria-hidden="true"><i style={{ width: `${v}%` }} /></span></li>)}
                            </ul>
                          </>
                        )}
                      </div>
                      <div className="rounded-[10px] bg-surface-2 p-3">
                        <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><Clock size={14} aria-hidden="true" />Tình trạng</h4>
                        <ul className="mt-1.5 space-y-1 text-xs text-ink-2">
                          <li>Mua đầu: <span className="num text-ink">{dt(detail.stats?.firstSuccessAt)}</span> · gần nhất: <span className="num text-ink">{dt(detail.stats?.lastSuccessAt)}</span>{selected.daysSinceSuccess !== null ? <> (<span className="num">{selected.daysSinceSuccess}</span> ngày trước)</> : ''}</li>
                          <li>Đơn: <span className="num">{detail.stats?.orders}</span> tạo · <span className="num">{detail.stats?.closedOrders}</span> chốt · <span className="num">{detail.stats?.successOrders}</span> thành công · <span className="num">{detail.stats?.returnedOrders}</span> hoàn · <span className="num">{detail.stats?.cancelledOrders}</span> hủy</li>
                          <li><span className="num">{detail.stats?.productKinds}</span> loại sản phẩm · <span className="num">{vi.format(Number(detail.stats?.successQuantity ?? 0))}</span> sản phẩm đã mua</li>
                          {detail.profile?.pancakeSuccessOrders != null && <li>Pancake ghi nhận: <span className="num">{detail.profile.pancakeSuccessOrders}</span> đơn thành công · <span className="num">{money(Number(detail.profile.pancakeAmount ?? 0))}</span> (toàn shop)</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {detail && tab === 'journey' && (
                  <div className="max-h-[32rem] overflow-auto">
                    {detail.orders.length ? (
                      <ol className="relative ml-2 space-y-3 border-l border-line-2 pl-4">
                        {detail.orders.map((o) => {
                          const tone: Tone = [3, 16].includes(o.statusCode) ? 'green' : [4, 5, 15].includes(o.statusCode) ? 'purple' : [6, 7].includes(o.statusCode) ? 'red' : [0, 17].includes(o.statusCode) ? 'gray' : 'blue';
                          return (
                            <li key={o.id} className="relative">
                              <span className="absolute -left-[1.35rem] top-1.5 inline-block size-2.5 rounded-full ring-2 ring-surface" style={{ background: TONE_DOT[tone] ?? 'var(--st-new)' }} aria-hidden="true" />
                              <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="num text-xs text-ink-3">{dt(o.createdAt, true)}</span><span className="num text-ink">#{o.sourceOrderId}</span><StatusChip tone={tone}>{o.statusName}</StatusChip>{o.successRank ? <StatusChip tone="teal">{o.successRank === 1 ? 'Mua lần đầu' : `Upsell ${o.successRank - 1}`}</StatusChip> : null}<span className="num ml-auto text-ink">{money(o.net)}</span></div>
                              <div className="mt-0.5 text-xs text-ink-2">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ') || '—'}</div>
                              <div className="text-[11px] text-ink-3">{o.sellerName ?? '—'}{o.closerName && o.closerName !== o.sellerName ? ` · chốt: ${o.closerName}` : ''}{o.sourceName ? ` · ${o.sourceName}` : ''}{o.confirmedAt ? ` · XN ${dt(o.confirmedAt, true)}` : ''}{o.deliveredAt ? ` · giao ${dt(o.deliveredAt)}` : ''}{o.returnedReason ? ` · lý do hoàn: ${o.returnedReason}` : ''}</div>
                            </li>
                          );
                        })}
                      </ol>
                    ) : <EmptyState text="Chưa có đơn nào được đồng bộ cho khách này." />}
                  </div>
                )}
                {detail && tab === 'products' && (
                  detail.stats?.products.length ? (
                    <TableWrap minWidth={480}>
                      <table className="tbl">
                        <thead><tr><th>Sản phẩm</th><th className="n">Số lần</th><th className="n">Số lượng</th><th className="n">Tổng tiền</th><th>Tỷ trọng</th></tr></thead>
                        <tbody>{detail.stats.products.map((p) => { const max = detail.stats!.products[0]?.total || 1; return <tr key={p.name}><td className="whitespace-normal text-ink">{p.name}</td><td className="n">{p.orders}</td><td className="n">{vi.format(p.quantity)}</td><td className="n">{money(p.total)}</td><td><span className="pbar h-1.5 w-24" aria-hidden="true"><i style={{ width: `${p.total / max * 100}%` }} /></span> <span className="num text-xs text-ink-3">{pct(detail.stats!.successNet ? p.total / detail.stats!.successNet * 100 : null)}</span></td></tr>; })}</tbody>
                      </table>
                    </TableWrap>
                  ) : <EmptyState text="Chưa có sản phẩm mua thành công." />
                )}
                {detail && tab === 'notes' && (
                  <div className="space-y-2">
                    {detail.profile?.notes.length ? detail.profile.notes.map((n, i) => <div key={i} className="rounded-[10px] bg-warn-bg p-3 text-[13px] text-ink"><div className="text-[11px] text-ink-3">Ghi chú khách trên Pancake</div><div className="whitespace-pre-wrap">{n}</div></div>) : null}
                    {detail.orders.filter((o) => o.note || o.tags.length).map((o) => <div key={o.id} className="rounded-[10px] bg-surface-2 p-3 text-[13px] text-ink"><div className="num text-[11px] font-semibold text-ink-3">{dt(o.createdAt, true)} · đơn #{o.sourceOrderId}</div><div className="whitespace-pre-wrap">{o.note || <span className="text-ink-3">—</span>}</div>{o.tags.length ? <div className="mt-1 flex flex-wrap gap-1">{o.tags.map((t) => <StatusChip key={t.name} tone="gray">#{t.name}</StatusChip>)}</div> : null}</div>)}
                    {!detail.profile?.notes.length && !detail.orders.some((o) => o.note || o.tags.length) && <EmptyState text="Chưa có ghi chú nào trên các đơn của khách." />}
                  </div>
                )}
              </ChartCard>
            </>
          )}
        </div>
      </div>
      <Definitions items={[data?.definitions.success, data?.definitions.dormant, data?.definitions.identity, SCORE_NOTE].filter((s): s is string => !!s)} />
    </div>
  );
}
