'use client';

// Tự ups & từ MKT: mỗi nhân viên CSKH có bao nhiêu đơn tự lên (cột Marketer trống) và bao nhiêu đơn do Marketing đưa về,
// lọc theo trạng thái hiện tại (mặc định Đã xác nhận), theo ngày tạo hoặc ngày chốt. Bấm một con số để xem đúng các đơn đó.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ExternalLink, FileDown, Megaphone, UserCheck, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, StatusChip, TableWrap, dmy, dt, money, pct, scrollToEl, shortMoney, vi, type SortState } from './ui-kit';

type Marketer = { marketerId: string; marketerName: string; orders: number; net: number };
type Staff = { sellerId: string; name: string; department: string | null; self: number; selfNet: number; mkt: number; mktNet: number; total: number; selfShare: number | null; marketers: Marketer[] };
type Order = { id: string; orderId: string; posId: string; posName: string; phone: string | null; customer: string | null; createdAt: string; confirmedAt: string | null; statusName: string; statusCode: number; origin: 'self' | 'mkt'; marketerName: string | null; net: number };
type Report = { period: { start: string; end: string }; status: string; basis: 'created' | 'confirmed'; statuses: Record<string, string>; total: { self: number; selfNet: number; mkt: number; mktNet: number }; staff: Staff[]; orders: Order[] | null; definitions: Record<string, string> };
type SortKey = 'name' | 'self' | 'mkt' | 'total' | 'selfShare';
type Pick = { sellerId: string; name: string; origin: 'self' | 'mkt' | 'all' };
const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Đã xác nhận', closed: 'Đơn chốt (từ xác nhận trở đi)', processing: 'Chưa xuất kho (XN → chờ chuyển)', waitgoods: 'Chờ hàng', packing: 'Đang đóng hàng',
  waiting: 'Chờ chuyển hàng', shipping: 'Đã gửi hàng', delivered: 'Đã nhận / đã thu tiền', returned: 'Hoàn', new: 'Mới / chờ xác nhận', cancelled: 'Đã hủy', all: 'Tất cả trạng thái',
};
const rowKeys = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

export function OriginView() {
  const today = todayVn();
  const [preset, setPreset] = useState('today');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [status, setStatus] = useState('confirmed');
  const [basis, setBasis] = useState<'created' | 'confirmed'>('created');
  const [department, setDepartment] = useState('all');
  const [sort, setSort] = useState<SortKey>('total');
  const [desc, setDesc] = useState(true);
  const [pick, setPick] = useState<Pick | null>(null);
  const [list, setList] = useState<Order[] | null>(null);
  const [listState, setListState] = useState<'idle' | 'loading' | 'error'>('idle');
  const ctrl = useRef<AbortController | null>(null);

  const params = useMemo(() => ({ start, end, posIds: posIds.join(','), status, basis }), [start, end, posIds, status, basis]);
  const { data: report, at, stale, loading, error, reload } = useApi<Report>(useMemo(() => `/api/reports/origin?${new URLSearchParams(params)}`, [params]));

  const openList = async (p: Pick) => {
    ctrl.current?.abort(); const ac = new AbortController(); ctrl.current = ac;
    setPick(p); setList(null); setListState('loading');
    if (window.innerWidth < 1536) setTimeout(() => scrollToEl(document.getElementById('origin-orders')), 50);
    try {
      const r = await fetch(`/api/reports/origin?${new URLSearchParams({ ...params, sellerId: p.sellerId, origin: p.origin })}`, { cache: 'no-store', signal: ac.signal });
      const body = await r.json() as Report & { error?: string };
      if (ac.signal.aborted) return;
      if (!r.ok) throw new Error(body.error ?? `Máy chủ trả lỗi ${r.status}.`);
      setList(body.orders ?? []); setListState('idle');
    } catch { if (!ac.signal.aborted) setListState('error'); }
  };
  // Đổi bộ lọc thì đóng danh sách đơn đang mở (số đã khác).
  useEffect(() => { ctrl.current?.abort(); setPick(null); setList(null); }, [params]);

  const departments = ([...new Set((report?.staff ?? []).map((s) => s.department).filter(Boolean))] as string[]).sort((a, b) => a.localeCompare(b, 'vi'));
  const rows = useMemo(() => (report?.staff ?? []).filter((s) => department === 'all' || s.department === department).sort((a, b) => {
    const c = sort === 'name' ? a.name.localeCompare(b.name, 'vi') : (a[sort] ?? -1) - (b[sort] ?? -1);
    return desc ? -c : c;
  }), [report, department, sort, desc]);
  const tot = rows.reduce((a, s) => ({ self: a.self + s.self, selfNet: a.selfNet + s.selfNet, mkt: a.mkt + s.mkt, mktNet: a.mktNet + s.mktNet }), { self: 0, selfNet: 0, mkt: 0, mktNet: 0 });
  const all = tot.self + tot.mkt;
  const maxTotal = Math.max(1, ...rows.map((s) => s.total));
  const sortState: SortState = { key: sort, desc, toggle: (k: string) => { if (k === sort) setDesc((d) => !d); else { setSort(k as SortKey); setDesc(k !== 'name'); } }, mark: () => '' };
  const periodLabel = `${dmy(start)} – ${dmy(end)}`;
  const statusLabel = STATUS_LABELS[status] ?? status;

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [`Tự ups & từ MKT · ${statusLabel} · ${basis === 'created' ? 'theo ngày tạo' : 'theo ngày chốt'} · ${start} → ${end}`], [],
      ['Nhân viên', 'Bộ phận', 'Tự ups (đơn)', 'Tự ups (doanh thu)', 'Từ MKT (đơn)', 'Từ MKT (doanh thu)', 'Tổng đơn', 'Tỷ lệ tự ups (%)', 'Chi tiết MKT'],
      ...rows.map((s) => [s.name, s.department ?? '', s.self, s.selfNet, s.mkt, s.mktNet, s.total, s.selfShare === null ? '' : Number(s.selfShare.toFixed(1)), s.marketers.map((m) => `${m.marketerName}: ${m.orders}`).join('; ')]),
      ['Tổng', '', tot.self, tot.selfNet, tot.mkt, tot.mktNet, all, all ? Number((tot.self / all * 100).toFixed(1)) : ''],
    ]), 'Theo nhân viên');
    if (list && pick) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Mã đơn', 'POS', 'Khách', 'SĐT', 'Nguồn', 'Marketer', 'Trạng thái', 'Ngày tạo', 'Ngày chốt', 'Doanh thu'],
      ...list.map((o) => [o.orderId, o.posName, o.customer ?? '', o.phone ?? '', o.origin === 'self' ? 'Tự ups' : 'Từ MKT', o.marketerName ?? '', o.statusName, dt(o.createdAt, true), dt(o.confirmedAt, true), o.net]),
    ]), `Don ${pick.name}`.slice(0, 30));
    XLSX.writeFile(wb, `tu-ups-tu-mkt_${start}_${end}.xlsx`);
  };

  const cell = (s: Staff, origin: 'self' | 'mkt' | 'all', n: number, net: number) => {
    const on = pick?.sellerId === s.sellerId && pick.origin === origin;
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
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={reload}
        extra={
          <>
            <Select value={status} items={Object.fromEntries(Object.entries(STATUS_LABELS).map(([k, l]) => [k, `Trạng thái: ${l}`]))} onValueChange={(v) => setStatus(String(v))}>
              <SelectTrigger className="min-w-48" aria-label="Trạng thái đơn"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={basis} items={{ created: 'Theo ngày tạo', confirmed: 'Theo ngày chốt' }} onValueChange={(v) => setBasis(v as 'created' | 'confirmed')}>
              <SelectTrigger className="min-w-36" aria-label="Tính theo ngày"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="created">Theo ngày tạo</SelectItem><SelectItem value="confirmed">Theo ngày chốt</SelectItem></SelectContent>
            </Select>
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
            <KpiCard icon={Megaphone} tone="blue" label="Đơn từ MKT" value={vi.format(tot.mkt)} countUp rawValue={tot.mkt} note={`${shortMoney(tot.mktNet)} · ${pct(all ? tot.mkt / all * 100 : null, 0)} tổng`}
              tooltip={{ period: periodLabel, current: `${vi.format(tot.mkt)} đơn · ${money(tot.mktNet)}`, definition: report.definitions.origin }} />
            <KpiCard icon={Wallet} tone="teal" label={`Tổng đơn · ${statusLabel.toLowerCase()}`} value={vi.format(all)} countUp rawValue={all} note={`${shortMoney(tot.selfNet + tot.mktNet)} · ${rows.length} nhân viên`}
              tooltip={{ period: periodLabel, current: `${vi.format(all)} đơn`, definition: report.definitions.status }} />
            <KpiCard icon={Users} tone="purple" label="Tỷ lệ tự ups" value={pct(all ? tot.self / all * 100 : null)} note={basis === 'created' ? 'Theo ngày tạo đơn' : 'Theo ngày chốt đơn'} progress={all ? { value: tot.self, max: all } : undefined}
              tooltip={{ period: periodLabel, current: `${vi.format(tot.self)} / ${vi.format(all)} đơn`, definition: 'Đơn tự ups ÷ tổng đơn (tự ups + từ MKT) của nhóm đang lọc.' }} />
          </div>
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_28rem]">
            <ChartCard icon={Users} title={`Theo nhân viên CSKH · ${rows.length} người`} subtitle="Bấm số Tự ups / Từ MKT / Tổng để xem đúng các đơn đó · bấm tiêu đề cột để sắp xếp" info={report.definitions.staff}>
              {rows.length ? (
                <TableWrap maxHeight="40rem" minWidth={760} stickyFirst>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="w-8">#</th>
                        <SortTh k="name" label="Nhân viên" sort={sortState} align="left" />
                        <SortTh k="self" label="Tự ups" sort={sortState} />
                        <SortTh k="mkt" label="Từ MKT" sort={sortState} />
                        <SortTh k="total" label="Tổng" sort={sortState} />
                        <SortTh k="selfShare" label="% tự ups" sort={sortState} />
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
              <ChartCard icon={ExternalLink} title={pick ? `${pick.name} · ${pick.origin === 'self' ? 'Tự ups' : pick.origin === 'mkt' ? 'Từ MKT' : 'Tất cả'}` : 'Danh sách đơn'}
                subtitle={pick ? `${statusLabel} · ${periodLabel}${list ? ` · ${vi.format(list.length)} đơn` : ''}` : 'Bấm một con số trong bảng để xem các đơn cấu thành'}>
                {!pick && <EmptyState text="Chưa chọn nhân viên." />}
                {pick && listState === 'loading' && <SkeletonTable rows={6} cols={3} />}
                {pick && listState === 'error' && <ErrorBox error="Không tải được danh sách đơn." onRetry={() => void openList(pick)} />}
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
                        <div className="mt-0.5 flex text-[11px] text-ink-3"><span>{o.posName} · {o.statusName}</span><span className="ml-auto num">{dt(basis === 'created' ? o.createdAt : o.confirmedAt, true)}</span></div>
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
