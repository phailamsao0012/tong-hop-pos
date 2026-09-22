'use client';

// Đơn nguồn Pancake POS: kiểm tra, đối soát và đánh giá độ đầy đủ dữ liệu đơn đã đồng bộ.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Database, ExternalLink, FileWarning, History, RefreshCw, Search, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrderOriginFilter, useOrderOrigin } from './order-origin-filter';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PosChips } from './overview-view';
import { useTeam } from './team-store';
import { ChartCard, ErrorBox, EmptyState, KpiCard, PageHeader, STATUS_VARS, SkeletonTable, StatusChip, TableWrap, Toolbar, dt, money, pct, posName, posVar, scrollToEl, timeOnly, toast, vi, type Tone } from './ui-kit';

type SyncRow = { posId: string; records: number; withConfirmation: number; withSeller: number; withAssignmentTime: number; lastSyncAt: string | null; lastError: string | null; status: string; errors24h: number; backfillCursor: { month: string; completed?: boolean } | null; earliestCreatedAt: string | null; latestCreatedAt: string | null };
type Order = { marketerId: string | null; marketerName: string | null; orderOrigin: 'self' | 'mkt'; id: string; orderId: string; posId: string; posName: string; phone: string | null; customer: string | null; createdAt: string | null; updatedAt: string | null; fetchedAt: string; statusCode: number | null; statusName: string; sellerName: string | null; sellerAssignedAt: string | null; currentTotal: number | null; net: number | null; firstConfirmedAt: string | null; closerName: string | null; deliveredAt: string | null; historyLimited: boolean; hasRaw: boolean; source: string | null };
type List = { marketers: { marketerId: string; marketerName: string }[]; page: number; size: number; hasMore: boolean; orders: Order[]; note: string };
type Detail = Order & {
  shopId: string | null; pancakeUrl: string | null; subStatus: number | null; careName: string | null; returnedAt: string | null; cancelledAt: string | null; lastStatusAt: string | null; creatorName: string | null; marketerName: string | null;
  gross: number | null; discount: number | null; shippingFee: number | null; cod: number | null; moneyToCollect: number | null; quantity: number | null; note: string | null; tags: { name: string }[]; warehouse: string | null;
  address: string | null; province: string | null; receiver: string | null; returnedReason: string | null; trackingLink: string | null; orderLink: string | null; partner: { partner_name?: string; extend_code?: string } | null;
  prepaid: number | null; transferMoney: number | null; cash: number | null; partnerFee: number | null; surcharge: number | null; isLive: boolean; adsSource: string | null; utm: { source: string | null; campaign: string | null; medium: string | null };
  checks: { created: boolean; assigned: boolean; confirmed: boolean; history: boolean; raw: boolean };
  items: { name: string; quantity: number; price: number; discount: number; total: number; returned: number; bonus: boolean }[];
  history: { from: number | null; to: number | null; fromName: string | null; toName: string | null; by: string | null; at: string | null }[];
  raw: Record<string, unknown> | null;
};
type Employee = { id: string; name: string; department: string | null };
const GROUPS: Record<string, string> = { '': 'Tất cả trạng thái', new: 'Mới / chờ XN', confirmed: 'Đã XN / đang xử lý', shipping: 'Đang giao', delivered: 'Giao thành công', returned: 'Hoàn', cancelled: 'Hủy / xóa', unconfirmed: 'Đã chốt nhưng thiếu mốc XN', limited: 'Thiếu lịch sử / JSON gốc' };
const CHECKS: [keyof Detail['checks'], string][] = [['created', 'Có dữ liệu tạo đơn'], ['assigned', 'Có mốc giao người bán'], ['confirmed', 'Có mốc xác nhận'], ['history', 'Có lịch sử trạng thái'], ['raw', 'Có JSON gốc']];
const statusTone = (code: number | null): Tone => code === null ? 'gray' : [0, 17].includes(code) ? 'gray' : [2].includes(code) ? 'orange' : [3, 16].includes(code) ? 'green' : [4, 5, 15].includes(code) ? 'purple' : [6, 7].includes(code) ? 'red' : 'blue';
const groupOf = (code: number | null) => code === null ? 'new' : [0, 17].includes(code) ? 'new' : code === 2 ? 'shipping' : [3, 16].includes(code) ? 'delivered' : [4, 5, 15].includes(code) ? 'returned' : [6, 7].includes(code) ? 'cancelled' : 'confirmed';

/** Tiêu đề mục nhỏ trong panel chi tiết. */
function SectionHead({ children, aside }: { children: string; aside?: React.ReactNode }) {
  return <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-3">{children}</h4>{aside}</div>;
}
/** Nút sao chép nhỏ: đổi thành dấu tick 1,5 s sau khi chép. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`btn sm icon ${done ? 'text-good' : 'text-ink-3'}`} title={label} aria-label={label}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); toast('Đã sao chép'); window.setTimeout(() => setDone(false), 1500); }); }}>
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export function RawOrdersView({ onSyncNow, syncing }: { onSyncNow?: () => void; syncing?: boolean }) {
  const today = todayVn();
  const team = useTeam();
  const { orderOrigin, marketerId } = useOrderOrigin(team);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [group, setGroup] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [list, setList] = useState<List | null>(null);
  const [sync, setSync] = useState<SyncRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null); // đơn đang mở (kể cả khi chi tiết chưa về)
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef<AbortController | null>(null);
  const detailReq = useRef<AbortController | null>(null);
  useEffect(() => { setPage(1); setList(null); }, [orderOrigin, marketerId, team]);

  useEffect(() => { void fetch(`/api/employees?team=${team}`).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then((rows) => setEmployees(rows)).catch(() => undefined); }, [team]);
  const loadSync = useCallback(async () => { try { const r = await fetch('/api/sync/pos', { cache: 'no-store' }); if (r.ok) setSync(await r.json() as SyncRow[]); } catch { /* bỏ qua */ } }, []);
  // Hủy request cũ khi đổi bộ lọc / trang liên tiếp: chỉ kết quả của lựa chọn mới nhất được hiện.
  const load = useCallback(async (manual = false) => {
    reqRef.current?.abort();
    const ctrl = new AbortController();
    reqRef.current = ctrl;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ posIds: posIds.join(','), page: String(page), size: String(size), group, sellerId, q, team, orderOrigin, marketerId });
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      const r = await fetch(`/api/raw/orders?${params}`, { cache: 'no-store', signal: ctrl.signal });
      const body = await r.json() as List & { error?: string };
      if (ctrl.signal.aborted) return;
      if (!r.ok) throw new Error(body.error ?? 'Không đọc được đơn nguồn.');
      setList(body);
      if (manual) toast(`Đã tải lại danh sách đơn nguồn · ${vi.format(body.orders.length)} đơn ở trang ${body.page}`);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Không đọc được đơn nguồn.');
      if (manual) toast('Không tải lại được đơn nguồn.', { kind: 'error' });
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, [posIds, page, size, group, sellerId, q, start, end, team, orderOrigin, marketerId]);
  useEffect(() => { void load(); return () => reqRef.current?.abort(); }, [load]);
  useEffect(() => { void loadSync(); }, [loadSync]);
  const open = async (id: string) => {
    detailReq.current?.abort();
    const ctrl = new AbortController();
    detailReq.current = ctrl;
    setShowRaw(false); setDetailId(id); setDetailError(null);
    if (window.innerWidth < 1280) window.setTimeout(() => scrollToEl(document.getElementById('order-detail')), 300);
    try {
      const r = await fetch(`/api/raw/orders/detail?id=${encodeURIComponent(id)}`, { cache: 'no-store', signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (!r.ok) throw new Error('Không đọc được chi tiết đơn.');
      setDetail(await r.json() as Detail);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setDetail(null); setDetailError(e instanceof Error ? e.message : 'Không đọc được chi tiết đơn.');
    }
  };
  const close = () => { detailReq.current?.abort(); setDetail(null); setDetailId(null); setDetailError(null); };
  const rowKey = (id: string) => (e: KeyboardEvent<HTMLTableRowElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void open(id); } };
  const reset = () => setPage(1);
  const scoped = sync.filter((s) => posIds.includes(s.posId));
  const tot = scoped.reduce((a, s) => ({ records: a.records + s.records, assigned: a.assigned + s.withAssignmentTime, confirmed: a.confirmed + s.withConfirmation, errors: a.errors + s.errors24h }), { records: 0, assigned: 0, confirmed: 0, errors: 0 });
  const lastSync = scoped.map((s) => s.lastSyncAt).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))).at(-1) ?? null;
  const pendingHistory = scoped.filter((s) => s.backfillCursor && !s.backfillCursor.completed);
  const panelOpen = !!detailId;
  const rawText = detail?.raw ? JSON.stringify(detail.raw, null, 2) : '';

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${start ? dt(`${start}T00:00:00+07:00`) : '…'} – ${end ? dt(`${end}T00:00:00+07:00`) : '…'}`} title="Đơn nguồn Pancake POS" badge={<StatusChip tone="green">Đơn nguồn thật · chưa tính KPI</StatusChip>}
        subtitle="Đối soát dữ liệu đơn đã đồng bộ"
        actions={<><span className="num text-xs text-ink-3">Cập nhật lần cuối: {dt(lastSync, true)}</span><Button variant="outline" onClick={() => { void load(true); void loadSync(); }} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Tải lại</Button>{onSyncNow && <Button onClick={onSyncNow} disabled={syncing}><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}</Button>}</>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <KpiCard icon={Database} tone="green" label="Tổng đơn đã lưu" value={vi.format(tot.records)} countUp rawValue={tot.records} format={(n) => vi.format(Math.round(n))} note={`${scoped.length} POS · từ ${scoped.map((s) => s.earliestCreatedAt).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)))[0]?.slice(0, 10) ?? '—'}`}
          tooltip={{ period: `${scoped.length} POS đang chọn`, current: `${vi.format(tot.records)} đơn`, definition: 'Tổng số đơn Pancake đã đồng bộ về máy chủ (mọi trạng thái, mọi thời điểm tạo).' }} />
        <KpiCard icon={Truck} tone="blue" label="Đơn có mốc giao người bán" value={vi.format(tot.assigned)} countUp rawValue={tot.assigned} format={(n) => vi.format(Math.round(n))} note={`${pct(tot.records ? tot.assigned / tot.records * 100 : null)} trên tổng`}
          tooltip={{ current: `${vi.format(tot.assigned)} / ${vi.format(tot.records)} đơn`, definition: 'Đơn có thời điểm giao cho nhân viên bán (dùng để tính số nhận trong ca).' }} />
        <KpiCard icon={CheckCircle2} tone="teal" label="Đơn có mốc xác nhận" value={vi.format(tot.confirmed)} countUp rawValue={tot.confirmed} format={(n) => vi.format(Math.round(n))} note={`${pct(tot.records ? tot.confirmed / tot.records * 100 : null)} trên tổng (đơn mới chưa xác nhận không tính)`}
          tooltip={{ current: `${vi.format(tot.confirmed)} / ${vi.format(tot.records)} đơn`, definition: 'Đơn có thời điểm xác nhận lần đầu (mốc chốt đơn). Đơn mới chưa xác nhận không được tính.' }} />
        <KpiCard icon={History} tone="orange" label="POS đang lấy lịch sử" value={vi.format(pendingHistory.length)} note={pendingHistory.length ? pendingHistory.map((s) => `${posName(s.posId)}: ${s.backfillCursor?.month}`).join(' · ') : 'Đã đủ lịch sử'} onClick={() => { reset(); setGroup('limited'); }} active={group === 'limited'}
          tooltip={{ current: `${pendingHistory.length} POS`, definition: 'Bấm để lọc các đơn còn thiếu lịch sử trạng thái hoặc JSON gốc.' }} />
        <KpiCard icon={AlertTriangle} tone={tot.errors ? 'red' : 'gray'} label="Lỗi đồng bộ 24 giờ" value={vi.format(tot.errors)} note={scoped.filter((s) => s.lastError).map((s) => `${posName(s.posId)}: ${s.lastError?.slice(0, 40)}`).join(' · ') || 'Không có lỗi đang treo'}
          tooltip={{ current: `${vi.format(tot.errors)} lỗi`, definition: 'Số lượt đồng bộ lỗi trong 24 giờ qua của các POS đang chọn; ghi chú là lỗi gần nhất còn treo.' }} />
      </div>
      <Toolbar>
        <span className="px-1 text-xs font-semibold text-ink-2">Ngày tạo</span>
        <div className="flex min-w-0 items-center gap-2">
          <Input aria-label="Từ ngày" type="date" className="w-auto" value={start} max={end || today} onChange={(e) => { reset(); setStart(e.target.value); }} />
          <span className="text-xs text-ink-3">→</span>
          <Input aria-label="Đến ngày" type="date" className="w-auto" value={end} min={start} max={today} onChange={(e) => { reset(); setEnd(e.target.value); }} />
        </div>
        {(start || end) && <Button size="sm" variant="ghost" onClick={() => { reset(); setStart(''); setEnd(''); }}>Bỏ ngày</Button>}
        <span className="px-1 text-xs font-semibold text-ink-2">Trạng thái</span>
        <Select value={group || '__all'} items={{ __all: GROUPS[''], ...Object.fromEntries(Object.entries(GROUPS).filter(([k]) => k)) }} onValueChange={(v) => { reset(); setGroup(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-48" aria-label="Trạng thái"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(GROUPS).map(([k, l]) => <SelectItem key={k || '__all'} value={k || '__all'}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <span className="px-1 text-xs font-semibold text-ink-2">Nhân viên</span>
        <Select value={sellerId || '__all'} items={{ __all: 'Tất cả nhân viên', ...Object.fromEntries(employees.map((e) => [e.id, e.name])) }} onValueChange={(v) => { reset(); setSellerId(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-44" aria-label="Nhân viên bán"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả nhân viên</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
        </Select>
        <form className="relative min-w-0 flex-1 basis-64" role="search" onSubmit={(e) => { e.preventDefault(); reset(); setQ(qDraft.trim()); }}>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Tìm đơn" className="pl-8 pr-8" placeholder="Tìm theo mã đơn, SĐT (đủ số hoặc 4 số cuối), tên khách… Enter để tìm" value={qDraft} onChange={(e) => setQDraft(e.target.value)} />
          {qDraft && <button type="button" aria-label="Xóa ô tìm" className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-ink-3 transition-colors duration-[var(--dur)] hover:bg-surface-3 hover:text-ink" onClick={() => { setQDraft(''); if (q) { reset(); setQ(''); } }}><X size={12} /></button>}
        </form>
      </Toolbar>
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      <OrderOriginFilter team={team} marketers={list?.marketers} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      <div className={`grid gap-4 ${panelOpen ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''}`}>
        <ChartCard icon={Database} title={`Danh sách đơn nguồn${list ? ` · trang ${list.page}` : ''}`} subtitle={list?.note}
          action={
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-ink-3">Hiển thị</span>
              <Select value={String(size)} items={{ '25': '25', '50': '50', '100': '100' }} onValueChange={(v) => { reset(); setSize(Number(v)); }}><SelectTrigger className="w-20" aria-label="Số dòng mỗi trang"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent></Select>
              <Button size="icon-sm" variant="outline" aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
              <span className="num text-xs text-ink-2">Trang {page}</span>
              <Button size="icon-sm" variant="outline" aria-label="Trang sau" disabled={!list?.hasMore || loading} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button>
            </div>
          }>
          {list && !list.orders.length && !loading ? <EmptyState text="Không có đơn phù hợp bộ lọc." /> : !list && loading ? <SkeletonTable rows={8} cols={8} /> : (
            <TableWrap minWidth={960} className={loading ? 'opacity-70 transition-opacity duration-[var(--dur)]' : 'transition-opacity duration-[var(--dur)]'}>
              <table className="tbl" aria-busy={loading || undefined}>
                <thead><tr><th className="n">#</th><th>Mã đơn</th><th>POS</th><th>Khách</th><th>Thời gian tạo</th><th>Nhân viên bán</th>{team === 'cskh' && <th>Nguồn / Marketer</th>}<th>Xác nhận lúc</th><th>Trạng thái</th><th className="n">Tổng tiền</th><th>Độ đầy đủ</th></tr></thead>
                <tbody>
                  {(list?.orders ?? []).map((o, i) => {
                    const full = !!o.sellerAssignedAt && (!!o.firstConfirmedAt || groupOf(o.statusCode) === 'new' || groupOf(o.statusCode) === 'cancelled') && !o.historyLimited && o.hasRaw;
                    const on = detailId === o.id;
                    return (
                      <tr key={o.id} tabIndex={0} role="button" aria-current={on ? 'true' : undefined} aria-label={`Mở chi tiết đơn ${o.orderId}`} className={`cursor-pointer focus-visible:outline-none ${on ? '[&>td]:bg-tint-2 [&>td:first-child]:shadow-[inset_2px_0_0_var(--primary)]' : ''}`} onClick={() => void open(o.id)} onKeyDown={rowKey(o.id)}>
                        <td className="n mut text-xs">{(page - 1) * size + i + 1}</td>
                        <td className="num font-semibold text-ink">{o.orderId}</td>
                        <td className="text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posVar(o.posId) }} />{o.posName}</td>
                        <td className="text-xs"><div>{o.customer || '—'}</div><div className="num text-ink-3">{o.phone ?? ''}</div></td>
                        <td className="num text-xs font-medium text-ink-2">{dt(o.createdAt, true)}</td>
                        <td className="text-xs">{o.sellerName ?? '—'}</td>
                        {team === 'cskh' && <td><StatusChip tone={o.orderOrigin === 'mkt' ? 'blue' : 'green'}>{o.marketerName || 'Tự ups'}</StatusChip></td>}
                        <td className="num text-xs font-medium text-ink-2">{o.firstConfirmedAt ? dt(o.firstConfirmedAt, true) : '—'}</td>
                        <td><StatusChip tone={statusTone(o.statusCode)}>{o.statusName}</StatusChip></td>
                        <td className="n">{money(o.net)}</td>
                        <td className="text-xs">{full ? <span className="inline-flex items-center gap-1 text-good"><CheckCircle2 size={13} />Đầy đủ</span> : <span className="inline-flex items-center gap-1 text-warn"><FileWarning size={13} />{!o.hasRaw ? 'Thiếu JSON gốc' : o.historyLimited ? 'Thiếu lịch sử' : !o.sellerAssignedAt ? 'Chưa giao người bán' : 'Thiếu mốc XN'}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </ChartCard>
        {panelOpen && (
          <div id="order-detail" className="scroll-mt-16">
            <ChartCard icon={Database} title="Chi tiết đơn hàng" subtitle={detail ? `${detail.posName} · đồng bộ lúc ${dt(detail.fetchedAt, true)}` : 'Đang tải…'} loading={!detail && !detailError}
              action={<div className="flex items-center gap-1.5">{detail?.pancakeUrl && <a href={detail.pancakeUrl} target="_blank" rel="noreferrer" className="btn primary sm">Mở trên Pancake <ExternalLink size={12} /></a>}<button type="button" className="btn sm icon text-ink-3" onClick={close} title="Đóng" aria-label="Đóng chi tiết"><X size={14} /></button></div>}>
              {detailError && <ErrorBox error={detailError} onRetry={() => { if (detailId) void open(detailId); }} />}
              {detail && (
                <div className="space-y-5 text-[13px]">
                  <div className="rounded-xl bg-surface-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2"><StatusChip tone={statusTone(detail.statusCode)}>{detail.statusName}</StatusChip><span className="num text-lg text-ink">#{detail.orderId}</span><CopyButton text={detail.orderId} label="Sao chép mã đơn" /></div>
                      <div className="text-xs text-ink-3"><span className="inline-block size-2 rounded-full align-middle" style={{ background: posVar(detail.posId) }} /> {detail.posName} · Tổng tiền <strong className="num text-[13px] text-ink">{money(detail.net)}</strong></div>
                    </div>
                  </div>
                  <div>
                    <SectionHead>Thông tin đơn hàng</SectionHead>
                    <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px] [&>dd]:min-w-0 [&>dd]:break-words [&>dt]:text-ink-3">
                      <dt>Khách hàng</dt><dd>{detail.customer || '—'} · <span className="num">{detail.phone ?? '—'}</span></dd>
                      <dt>Địa chỉ giao</dt><dd>{detail.address ?? '—'}{detail.province ? ` (${detail.province})` : ''}</dd>
                      <dt>Thời gian tạo</dt><dd className="num">{dt(detail.createdAt, true)}</dd>
                      <dt>Nhân viên bán</dt><dd>{detail.sellerName ?? '—'}{detail.sellerAssignedAt ? <span className="text-xs text-ink-3"> · giao lúc <span className="num">{dt(detail.sellerAssignedAt, true)}</span></span> : ''}</dd>
                      <dt>Người chốt</dt><dd>{detail.closerName ?? '—'}{detail.firstConfirmedAt ? <span className="text-xs text-ink-3"> · xác nhận <span className="num">{dt(detail.firstConfirmedAt, true)}</span></span> : ''}</dd>
                      <dt>CSKH / Marketer</dt><dd>{detail.careName ?? '—'} / {detail.marketerName ?? '—'}</dd>
                      <dt>Nguồn đơn</dt><dd>{detail.source ?? '—'}{detail.isLive ? ' · Livestream' : ''}{detail.adsSource ? ` · ${detail.adsSource}` : ''}</dd>
                      <dt>Vận chuyển</dt><dd>{detail.partner?.partner_name ?? '—'}{detail.partner?.extend_code ? <> · <span className="num">{detail.partner.extend_code}</span></> : ''}{detail.trackingLink ? <> · <a className="link" href={detail.trackingLink} target="_blank" rel="noreferrer">theo dõi</a></> : null}{detail.deliveredAt ? <span className="text-xs text-ink-3"> · giao TC <span className="num">{dt(detail.deliveredAt, true)}</span></span> : ''}</dd>
                      {detail.returnedReason && <><dt>Lý do hoàn</dt><dd>{detail.returnedReason}</dd></>}
                      <dt>Tiền</dt><dd className="num font-medium text-ink-2">Doanh thu <span className="text-ink">{money(detail.net)}</span> · giảm giá/quà {money(Number(detail.gross ?? 0) - Number(detail.net ?? 0))} · ship {money(detail.shippingFee)} · COD {money(detail.cod)}{detail.prepaid ? ` · trả trước ${money(detail.prepaid)}` : ''}</dd>
                      <dt>Ghi chú / thẻ</dt><dd className="whitespace-pre-wrap">{detail.note || '—'} {detail.tags.map((t) => <StatusChip key={t.name} tone="gray" className="mr-1">#{t.name}</StatusChip>)}</dd>
                    </dl>
                  </div>
                  <div>
                    <SectionHead>{`Sản phẩm (${detail.items.length})`}</SectionHead>
                    {detail.items.length ? (
                      <ul className="divide-y divide-line rounded-lg border border-line text-xs">
                        {detail.items.map((i, k) => <li key={k} className="flex justify-between gap-2 px-2.5 py-1.5 transition-colors duration-[var(--dur)] hover:bg-surface-2"><span className="min-w-0 break-words">{i.name}{i.bonus ? <StatusChip tone="lime" className="ml-1">tặng</StatusChip> : ''} <span className="num text-ink-3">× {i.quantity}</span>{i.returned ? <span className="num text-bad"> · hoàn {i.returned}</span> : ''}</span><span className="num whitespace-nowrap">{money(i.total)}</span></li>)}
                      </ul>
                    ) : <p className="text-xs text-ink-3">Chưa có dòng sản phẩm.</p>}
                  </div>
                  <div>
                    {(() => { const c = detail.checks; const n = Object.values(c).filter(Boolean).length; const p = Math.round(n / CHECKS.length * 100); return (
                      <>
                        <SectionHead aside={<strong className={`num text-[13px] ${p === 100 ? 'text-good' : p >= 60 ? 'text-warn' : 'text-bad'}`}>{p}%</strong>}>Độ đầy đủ lịch sử</SectionHead>
                        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label="Độ đầy đủ"><span className={`block h-full rounded-full transition-[width] duration-700 ease-[var(--ease)] ${p === 100 ? 'bg-good' : p >= 60 ? 'bg-warn' : 'bg-bad'}`} style={{ width: `${p}%` }} /></span>
                        <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
                          {CHECKS.map(([k, l]) => <li key={k} className={`flex items-center gap-1 ${c[k] ? 'text-good' : 'text-warn'}`}>{c[k] ? <CheckCircle2 size={13} /> : <FileWarning size={13} />}{l}</li>)}
                        </ul>
                      </>
                    ); })()}
                  </div>
                  <div>
                    <SectionHead>Lịch sử trạng thái</SectionHead>
                    {detail.history.length ? (
                      <ol className="relative ml-2 space-y-2 border-l border-line pl-4 text-xs">
                        {detail.history.map((h, k) => (
                          <li key={k} className="relative flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="absolute -left-[21px] top-1 inline-block size-2.5 rounded-full border-2 border-surface" style={{ background: STATUS_VARS[groupOf(h.to)] }} aria-hidden="true" />
                            <span className="num w-24 shrink-0 text-ink-3">{dt(h.at, true)}</span>
                            <span className="min-w-0">{h.fromName ? <span className="text-ink-3">{h.fromName} → </span> : ''}<strong>{h.toName}</strong></span>
                            {h.by && <span className="ml-auto text-ink-3">{h.by}</span>}
                          </li>
                        ))}
                      </ol>
                    ) : <p className="text-xs text-ink-3">Pancake không trả lịch sử cho đơn này.</p>}
                    <p className="mt-1.5 text-[11px] text-ink-3">Cập nhật gần nhất trên Pancake: <span className="num">{dt(detail.updatedAt, true)}</span></p>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="btn sm" aria-expanded={showRaw} aria-controls="order-raw-json" onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Ẩn dữ liệu gốc' : 'Xem dữ liệu gốc (JSON Pancake)'}</button>
                      {showRaw && rawText && <CopyButton text={rawText} label="Sao chép JSON" />}
                    </div>
                    {showRaw && (
                      <pre id="order-raw-json" tabIndex={0} className="mt-2 max-h-80 overflow-auto overscroll-contain rounded-lg border border-sb-line bg-sb p-3 text-[11px] leading-relaxed text-lime [font-variant-numeric:tabular-nums] whitespace-pre">
                        {rawText || 'Đơn này được đồng bộ trước khi lưu JSON gốc; sẽ có sau lượt lấy lịch sử tiếp theo.'}
                      </pre>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-3">Lần đồng bộ đơn: <span className="num">{timeOnly(detail.fetchedAt)} {dt(detail.fetchedAt)}</span></p>
                </div>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  );
}
