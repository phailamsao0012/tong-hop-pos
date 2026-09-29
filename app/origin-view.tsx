'use client';

// Tự ups & từ MKT: mỗi nhân viên CSKH có bao nhiêu đơn tự lên (cột Marketer trống) và bao nhiêu đơn do Marketing đưa về,
// tính theo NV chăm sóc; mặc định đếm mọi đơn lên, chọn được trạng thái và mốc ngày. Bấm một con số để xem đúng các đơn đó.
import { usePosIds } from './pos-store';
import { ICON } from './icons';
import { CskhFocusBar, useCskhFocus } from './cskh-focus';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ExternalLink, FileDown, UserCheck, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { useApi } from './use-api';
import { StatusFilter } from './status-filter';
import { StaffPicker } from './staff-picker';
import { parseStatus } from '@/lib/order-status';
import { StaleChip } from './stale-chip';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, dmy, dt, money, pct, scrollToEl, shortMoney, vi, type SortState } from './ui-kit';

type Marketer = { marketerId: string; marketerName: string; orders: number; net: number };
type Staff = { sellerId: string; name: string; department: string | null; self: number; selfNet: number; mkt: number; mktNet: number; total: number; selfShare: number | null; marketers: Marketer[]; groups?: Record<string, { n: number; net: number }> };
type Order = { id: string; orderId: string; posId: string; posName: string; phone: string | null; customer: string | null; createdAt: string; confirmedAt: string | null; careAssignedAt: string | null; updatedAt: string | null; statusName: string; statusCode: number; origin: 'self' | 'mkt'; marketerName: string | null; sellerName: string | null; careName: string | null; net: number; items?: { name: string; qty: number; gift: boolean }[]; tags?: string[] };
type Basis = 'created' | 'confirmed' | 'care' | 'updated';
type Report = { period: { start: string; end: string }; status: string; statusLabel: string; basis: Basis; by: 'care' | 'seller'; bases: Record<string, string>; bys: Record<string, string>; total: { self: number; selfNet: number; mkt: number; mktNet: number }; staff: Staff[]; orders: Order[] | null; products?: { name: string; orders: number; qty: number }[] | null; groupLabels?: string[]; definitions: Record<string, string> };
type SortKey = 'name' | 'self' | 'mkt' | 'total' | 'selfShare';
type Pick = { sellerId: string; name: string; origin: 'self' | 'mkt' | 'all'; group?: string };
const GROUP_DOT: Record<string, string> = { 'Kháng sinh': 'var(--ai-3)', 'Combo': 'var(--ai-5)', 'Khác': 'var(--ink-4)' };
const BASES: Record<Basis, string> = { created: 'Theo ngày lên đơn', confirmed: 'Theo ngày chốt', care: 'Theo ngày gán chăm sóc', updated: 'Theo ngày cập nhật' };
const BYS = { care: 'Theo NV chăm sóc', seller: 'Theo người bán' } as const;
const rowKeys = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

export function OriginView() {
  const today = todayVn();
  const [preset, setPreset] = useState('today');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = usePosIds();
  const [status, setStatus] = useState('created');
  const [basis, setBasis] = useState<Basis>('created');
  const [by, setBy] = useState<'care' | 'seller'>('care');
  const [department, setDepartment] = useState('all');
  const [pickedLocal, setPicked] = useState<string[]>([]);
  const focus = useCskhFocus();
  const picked = useMemo(() => focus ? [focus.id] : pickedLocal, [focus, pickedLocal]);
  const [sort, setSort] = useState<SortKey>('total');
  const [desc, setDesc] = useState(true);
  const [pick, setPick] = useState<Pick | null>(null);
  const [list, setList] = useState<Order[] | null>(null);
  const [products, setProducts] = useState<{ name: string; orders: number; qty: number }[] | null>(null);
  const [listState, setListState] = useState<'idle' | 'loading' | 'error'>('idle');
  const ctrl = useRef<AbortController | null>(null);

  const params = useMemo(() => ({ start, end, posIds: posIds.join(','), status, basis, by }), [start, end, posIds, status, basis, by]);
  const { data: report, at, stale, loading, error, reload } = useApi<Report>(useMemo(() => `/api/reports/origin?${new URLSearchParams(params)}`, [params]));

  const openList = async (p: Pick) => {
    ctrl.current?.abort(); const ac = new AbortController(); ctrl.current = ac;
    setPick(p); setList(null); setListState('loading');
    if (window.innerWidth < 1536) setTimeout(() => scrollToEl(document.getElementById('origin-orders')), 50);
    try {
      const r = await fetch(`/api/reports/origin?${new URLSearchParams({ ...params, sellerId: p.sellerId, origin: p.origin, ...(p.group ? { group: p.group } : {}) })}`, { cache: 'no-store', signal: ac.signal });
      const body = await r.json() as Report & { error?: string };
      if (ac.signal.aborted) return;
      if (!r.ok) throw new Error(body.error ?? `Máy chủ trả lỗi ${r.status}.`);
      setList(body.orders ?? []); setProducts(body.products ?? null); setListState('idle');
    } catch { if (!ac.signal.aborted) setListState('error'); }
  };
  // Đổi bộ lọc thì đóng danh sách đơn đang mở (số đã khác).
  useEffect(() => { ctrl.current?.abort(); setPick(null); setList(null); }, [params]);

  const departments = ([...new Set((report?.staff ?? []).map((s) => s.department).filter(Boolean))] as string[]).sort((a, b) => a.localeCompare(b, 'vi'));
  const rows = useMemo(() => (report?.staff ?? []).filter((s) => (department === 'all' || s.department === department) && (!picked.length || picked.includes(s.sellerId))).sort((a, b) => {
    const c = sort === 'name' ? a.name.localeCompare(b.name, 'vi') : (a[sort] ?? -1) - (b[sort] ?? -1);
    return desc ? -c : c;
  }), [report, department, picked, sort, desc]);
  const tot = rows.reduce((a, s) => ({ self: a.self + s.self, selfNet: a.selfNet + s.selfNet, mkt: a.mkt + s.mkt, mktNet: a.mktNet + s.mktNet }), { self: 0, selfNet: 0, mkt: 0, mktNet: 0 });
  const all = tot.self + tot.mkt;
  const maxTotal = Math.max(1, ...rows.map((s) => s.total));
  const sortState: SortState = { key: sort, desc, toggle: (k: string) => { if (k === sort) setDesc((d) => !d); else { setSort(k as SortKey); setDesc(k !== 'name'); } }, mark: () => '' };
  const periodLabel = `${dmy(start)} – ${dmy(end)}`;
  const statusLabel = parseStatus(status, 'created').label;

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [`Tự ups & từ MKT · ${statusLabel} · ${BASES[basis].toLowerCase()} · ${BYS[by].toLowerCase()} · ${start} → ${end}`], [],
      ['Nhân viên', 'Bộ phận', 'Tự ups (đơn)', 'Tự ups (doanh thu)', 'Từ MKT (đơn)', 'Từ MKT (doanh thu)', 'Tổng đơn', 'Tỷ lệ tự ups (%)', ...(report?.groupLabels ?? []).map((l) => `${l} (đơn)`), 'Chi tiết MKT'],
      ...rows.map((s) => [s.name, s.department ?? '', s.self, s.selfNet, s.mkt, s.mktNet, s.total, s.selfShare === null ? '' : Number(s.selfShare.toFixed(1)), ...(report?.groupLabels ?? []).map((l) => s.groups?.[l]?.n ?? 0), s.marketers.map((m) => `${m.marketerName}: ${m.orders}`).join('; ')]),
      ['Tổng', '', tot.self, tot.selfNet, tot.mkt, tot.mktNet, all, all ? Number((tot.self / all * 100).toFixed(1)) : ''],
    ]), 'Theo nhân viên');
    if (list && pick) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Mã đơn', 'POS', 'Khách', 'SĐT', 'Nguồn', 'Marketer', 'NV chăm sóc', 'Người bán', 'Trạng thái', 'Ngày tạo', 'Ngày chốt', 'Ngày gán chăm sóc', 'Doanh thu'],
      ...list.map((o) => [o.orderId, o.posName, o.customer ?? '', o.phone ?? '', o.origin === 'self' ? 'Tự ups' : 'Từ MKT', o.marketerName ?? '', o.careName ?? '', o.sellerName ?? '', o.statusName, dt(o.createdAt, true), dt(o.confirmedAt, true), dt(o.careAssignedAt, true), o.net]),
    ]), `Don ${pick.name}`.slice(0, 30));
    XLSX.writeFile(wb, `tu-ups-tu-mkt_${start}_${end}.xlsx`);
  };

  const labels = report?.groupLabels ?? ['Kháng sinh', 'Combo', 'Khác'];
  const gcell = (s: Staff, label: string) => {
    const g = s.groups?.[label]; const n = g?.n ?? 0;
    const on = pick?.sellerId === s.sellerId && pick.group === label;
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); void openList({ sellerId: s.sellerId, name: s.name, origin: 'all', group: label }); }} disabled={!n}
        className={`num rounded-md px-1.5 py-0.5 text-right hover:bg-tint-2 disabled:cursor-default disabled:hover:bg-transparent ${on ? 'bg-tint-2 font-semibold' : ''}`} title={n ? `Xem các đơn ${label}` : undefined}>
        <span className="block text-ink">{n ? vi.format(n) : <span className="text-ink-4">0</span>}</span>
        {n > 0 && <span className="block text-[11px] text-ink-3">{pct(s.total ? n / s.total * 100 : null, 0)}</span>}
      </button>
    );
  };
  const cell = (s: Staff, origin: 'self' | 'mkt' | 'all', n: number, net: number) => {
    const on = pick?.sellerId === s.sellerId && pick.origin === origin && !pick.group;
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); void openList({ sellerId: s.sellerId, name: s.name, origin }); }} disabled={!n}
        className={`num rounded-md px-1.5 py-0.5 text-right hover:bg-tint-2 disabled:cursor-default disabled:hover:bg-transparent ${on ? 'bg-tint-2 font-semibold' : ''}`} title={n ? 'Xem các đơn này' : undefined}>
        <span className="block text-ink">{n ? vi.format(n) : <span className="text-ink-4">0</span>}</span>
        {n > 0 && <span className="block text-[11px] text-ink-3">{shortMoney(net)}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Tự ups & từ MKT"
        subtitle="Mỗi nhân viên CSKH: bao nhiêu đơn tự lên, bao nhiêu đơn do Marketing đưa về"
        actions={<><StaleChip stale={stale} at={at} loading={loading} error={report ? error : null} onRetry={reload} /><Button variant="outline" onClick={exportExcel} disabled={!report}><FileDown size={14} />Xuất Excel</Button></>} />
      <CskhFocusBar />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={reload}
        extra={
          <>
            <StatusFilter value={status} onChange={setStatus} defaultValue="created" presets={['created', 'valid', 'closed', 'processing', 'shipped', 'delivered', 'returned', 'new', 'cancelled']} />
            <Select value={basis} items={BASES} onValueChange={(v) => setBasis(v as Basis)}>
              <SelectTrigger className="min-w-40" aria-label="Tính theo ngày"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(BASES) as Basis[]).map((k) => <SelectItem key={k} value={k}>{BASES[k]}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={by} items={BYS} onValueChange={(v) => setBy(v as 'care' | 'seller')}>
              <SelectTrigger className="min-w-40" aria-label="Tính cho nhân viên nào trên đơn"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="care">Theo NV chăm sóc</SelectItem><SelectItem value="seller">Theo người bán</SelectItem></SelectContent>
            </Select>
            {!focus && <StaffPicker staff={report?.staff ?? []} value={picked} onChange={setPicked} />}
            {departments.length > 1 && (
              <Select value={department} items={{ all: 'Mọi bộ phận', ...Object.fromEntries(departments.map((d) => [d, d])) }} onValueChange={(v) => setDepartment(String(v))}>
                <SelectTrigger className="min-w-32" aria-label="Bộ phận"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Mọi bộ phận</SelectItem>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </>
        } />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !report && <ErrorBox error={error} onRetry={reload} />}
      {!report && !error && (
        <>
          <SkeletonKpis count={4} className="xl:grid-cols-4" />
          <ChartCard icon={Users} title="Theo nhân viên" subtitle="Đang tải…"><SkeletonTable rows={6} cols={7} /></ChartCard>
        </>
      )}
      {report && (
        <>
          <div className={`grid grid-cols-2 gap-3 transition-opacity duration-[var(--dur)] sm:gap-4 xl:grid-cols-4 ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
            <KpiCard icon={UserCheck} tone="green" label="Đơn tự ups" value={vi.format(tot.self)} countUp rawValue={tot.self} note={`${shortMoney(tot.selfNet)} · ${pct(all ? tot.self / all * 100 : null, 0)} tổng`}
              tooltip={{ period: periodLabel, current: `${vi.format(tot.self)} đơn · ${money(tot.selfNet)}`, definition: report.definitions.origin }} />
            <KpiCard icon={ICON.marketing} tone="blue" label="Đơn từ MKT" value={vi.format(tot.mkt)} countUp rawValue={tot.mkt} note={`${shortMoney(tot.mktNet)} · ${pct(all ? tot.mkt / all * 100 : null, 0)} tổng`}
              tooltip={{ period: periodLabel, current: `${vi.format(tot.mkt)} đơn · ${money(tot.mktNet)}`, definition: report.definitions.origin }} />
            <KpiCard icon={Wallet} tone="teal" label={`Tổng đơn · ${statusLabel.toLowerCase()}`} value={vi.format(all)} countUp rawValue={all} note={`${shortMoney(tot.selfNet + tot.mktNet)} · ${rows.length} nhân viên`}
              tooltip={{ period: periodLabel, current: `${vi.format(all)} đơn`, definition: report.definitions.status }} />
            <KpiCard icon={Users} tone="purple" label="Tỷ lệ tự ups" value={pct(all ? tot.self / all * 100 : null)} note={BASES[basis]} progress={all ? { value: tot.self, max: all } : undefined}
              tooltip={{ period: periodLabel, current: `${vi.format(tot.self)} / ${vi.format(all)} đơn`, definition: 'Đơn tự ups ÷ tổng đơn (tự ups + từ MKT) của nhóm đang lọc.' }} />
          </div>
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_28rem]">
            <ChartCard icon={Users} title={`${BYS[by]} · ${rows.length} người`} subtitle="Bấm số Tự ups / Từ MKT / Tổng để xem đúng các đơn đó · bấm tiêu đề cột để sắp xếp" info={report.definitions.staff}>
              {rows.length ? (
                <TableWrap maxHeight="40rem" minWidth={760 + labels.length * 90} stickyFirst>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="w-8">#</th>
                        <SortTh k="name" label="Nhân viên" sort={sortState} align="left" />
                        <SortTh k="self" label="Tự ups" sort={sortState} />
                        <SortTh k="mkt" label="Từ MKT" sort={sortState} />
                        <SortTh k="total" label="Tổng" sort={sortState} />
                        <SortTh k="selfShare" label="% tự ups" sort={sortState} />
                        {labels.map((l) => <th key={l} className="whitespace-nowrap"><span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: GROUP_DOT[l] }} />{l}</span></th>)}
                        <th>Tỷ trọng</th>
                        <th className="text-left">Marketer đưa về</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s, i) => (
                        <tr key={s.sellerId || 'none'} tabIndex={0} onClick={() => void openList({ sellerId: s.sellerId, name: s.name, origin: 'all' })}
                          onKeyDown={rowKeys(() => void openList({ sellerId: s.sellerId, name: s.name, origin: 'all' }))}
                          className={`cursor-pointer ${pick?.sellerId === s.sellerId ? '[&>td]:bg-tint-2' : ''}`}>
                          <td className="num text-[11px] text-ink-4">{i + 1}</td>
                          <td className="font-medium text-ink">{s.name}{s.department && <span className="block text-[11px] font-normal text-ink-3">{s.department}</span>}</td>
                          <td className="n">{cell(s, 'self', s.self, s.selfNet)}</td>
                          <td className="n">{cell(s, 'mkt', s.mkt, s.mktNet)}</td>
                          <td className="n">{cell(s, 'all', s.total, s.selfNet + s.mktNet)}</td>
                          <td className="n">{pct(s.selfShare)}</td>
                          {labels.map((l) => <td key={l} className="n">{gcell(s, l)}</td>)}
                          <td>
                            <span className="flex h-2 overflow-hidden rounded-full bg-surface-2" style={{ width: `${Math.max(12, s.total / maxTotal * 112)}px` }} title={`Tự ups ${s.self} · Từ MKT ${s.mkt}`}>
                              <i className="block h-full bg-[var(--good)]" style={{ width: `${s.total ? s.self / s.total * 100 : 0}%` }} />
                              <i className="block h-full bg-[var(--st-confirmed)]" style={{ width: `${s.total ? s.mkt / s.total * 100 : 0}%` }} />
                            </span>
                          </td>
                          <td className="text-left text-xs text-ink-2">{s.marketers.length ? s.marketers.slice(0, 3).map((m) => `${m.marketerName} ${m.orders}`).join(' · ') + (s.marketers.length > 3 ? ` · +${s.marketers.length - 3}` : '') : <span className="text-ink-4">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td /><td className="font-semibold">Tổng</td>
                        <td className="n font-semibold">{vi.format(tot.self)}<span className="block text-[11px] font-normal text-ink-3">{shortMoney(tot.selfNet)}</span></td>
                        <td className="n font-semibold">{vi.format(tot.mkt)}<span className="block text-[11px] font-normal text-ink-3">{shortMoney(tot.mktNet)}</span></td>
                        <td className="n font-semibold">{vi.format(all)}</td>
                        <td className="n font-semibold">{pct(all ? tot.self / all * 100 : null)}</td>
                        {labels.map((l) => { const n = rows.reduce((t, r) => t + (r.groups?.[l]?.n ?? 0), 0); return <td key={l} className="n font-semibold">{vi.format(n)}<span className="block text-[11px] font-normal text-ink-3">{pct(all ? n / all * 100 : null, 0)}</span></td>; })}
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </TableWrap>
              ) : <EmptyState text={`Không có đơn ${statusLabel.toLowerCase()} nào của CSKH trong kỳ.`} />}
              <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-[var(--good)]" />Tự ups</span>
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-[var(--st-confirmed)]" />Từ MKT</span>
              </p>
            </ChartCard>
            <div id="origin-orders">
              <ChartCard icon={ExternalLink} title={pick ? `${pick.name} · ${pick.group ?? (pick.origin === 'self' ? 'Tự ups' : pick.origin === 'mkt' ? 'Từ MKT' : 'Tất cả')}` : 'Danh sách đơn'}
                subtitle={pick ? `${statusLabel} · ${periodLabel}${list ? ` · ${vi.format(list.length)} đơn` : ''}` : 'Bấm một con số trong bảng để xem các đơn cấu thành'}>
                {!pick && <EmptyState text="Chưa chọn nhân viên." />}
                {pick && listState === 'loading' && <SkeletonTable rows={6} cols={3} />}
                {pick && listState === 'error' && <ErrorBox error="Không tải được danh sách đơn." onRetry={() => void openList(pick)} />}
                {pick && list && products && products.length > 0 && (
                  <div className="mb-3 rounded-xl bg-surface-2 p-3">
                    <p className="mb-1.5 text-[11.5px] font-semibold text-ink-2">Khách mua gì · {vi.format(products.length)} sản phẩm</p>
                    <ul className="m-0 max-h-48 list-none space-y-1 overflow-y-auto p-0 text-xs">
                      {products.slice(0, 30).map((x) => (
                        <li key={x.name} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-ink" title={x.name}>{x.name}</span>
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface"><i className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${x.orders / list.length * 100}%` }} /></span>
                          <span className="num w-14 text-right text-ink">{vi.format(x.orders)} đơn</span>
                          <span className="num w-14 text-right text-ink-3">{vi.format(x.qty)} sp</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pick && list && (list.length ? (
                  <ul className="m-0 max-h-[40rem] list-none space-y-2 overflow-y-auto p-0">
                    {list.map((o) => (
                      <li key={o.id} className="rounded-xl border border-line bg-surface p-3">
                        <div className="flex items-center gap-2">
                          <span className="num font-semibold text-ink">#{o.orderId}</span>
                          <StatusChip tone={o.origin === 'self' ? 'green' : 'blue'}>{o.origin === 'self' ? 'Tự ups' : `MKT · ${o.marketerName ?? ''}`}</StatusChip>
                          <span className="ml-auto num font-semibold text-ink">{money(o.net)}</span>
                        </div>
                        <div className="mt-1 text-xs text-ink-2">{[o.customer, o.phone].filter(Boolean).join(' · ')}</div>
                        {!!o.items?.length && (
                          <ul className="m-0 mt-1.5 list-none space-y-0.5 rounded-lg bg-surface-2 px-2 py-1.5 text-xs">
                            {o.items.map((it, k) => (
                              <li key={k} className="flex gap-2"><span className={`min-w-0 flex-1 ${it.gift ? 'text-ink-3' : 'text-ink'}`}>{it.name}{it.gift ? ' (quà tặng)' : ''}</span><span className="num text-ink-2">× {vi.format(it.qty)}</span></li>
                            ))}
                          </ul>
                        )}
                        {!!o.tags?.length && <div className="mt-1 text-[11px] text-ink-3">Nhãn: {o.tags.join(', ')}</div>}
                        <div className="mt-0.5 flex text-[11px] text-ink-3"><span>{o.posName} · {o.statusName}</span><span className="ml-auto num">Lên đơn {dt(o.createdAt, true)}</span></div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
                          {o.careName && <span>Chăm sóc: {o.careName}{o.careAssignedAt ? ` (${dt(o.careAssignedAt, true)})` : ''}</span>}
                          {o.sellerName && o.sellerName !== o.careName && <span>Người bán: {o.sellerName}</span>}
                          {o.confirmedAt && <span>Chốt {dt(o.confirmedAt, true)}</span>}
                        </div>
                      </li>
                    ))}
                    {list.length >= 300 && <li className="text-center text-[11px] text-ink-3">Hiện 300 đơn mới nhất trong kỳ</li>}
                  </ul>
                ) : <EmptyState text="Không có đơn." />)}
              </ChartCard>
            </div>
          </div>
          <Definitions items={report.definitions} />
        </>
      )}
    </div>
  );
}
