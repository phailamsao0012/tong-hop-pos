'use client';

// Đơn nguồn Pancake POS: kiểm tra, đối soát và đánh giá độ đầy đủ dữ liệu đơn đã đồng bộ.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Database, ExternalLink, FileWarning, History, RefreshCw, Search, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PosChips } from './overview-view';
import { useTeam } from './team-store';
import { ChartCard, ErrorBox, EmptyState, KpiCard, PageHeader, STATUS_COLORS, StatusChip, Toolbar, dt, money, pct, posColor, timeOnly, vi, type Tone } from './ui-kit';

type SyncRow = { posId: string; records: number; withConfirmation: number; withSeller: number; withAssignmentTime: number; lastSyncAt: string | null; lastError: string | null; status: string; errors24h: number; backfillCursor: { month: string; completed?: boolean } | null; earliestCreatedAt: string | null; latestCreatedAt: string | null };
type Order = { id: string; orderId: string; posId: string; posName: string; phone: string | null; customer: string | null; createdAt: string | null; updatedAt: string | null; fetchedAt: string; statusCode: number | null; statusName: string; sellerName: string | null; sellerAssignedAt: string | null; currentTotal: number | null; net: number | null; firstConfirmedAt: string | null; closerName: string | null; deliveredAt: string | null; historyLimited: boolean; hasRaw: boolean; source: string | null };
type List = { page: number; size: number; hasMore: boolean; orders: Order[]; note: string };
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
const statusTone = (code: number | null): Tone => code === null ? 'gray' : [0, 17].includes(code) ? 'gray' : [2].includes(code) ? 'orange' : [3, 16].includes(code) ? 'green' : [4, 5, 15].includes(code) ? 'purple' : [6, 7].includes(code) ? 'red' : 'blue';
const groupOf = (code: number | null) => code === null ? 'new' : [0, 17].includes(code) ? 'new' : code === 2 ? 'shipping' : [3, 16].includes(code) ? 'delivered' : [4, 5, 15].includes(code) ? 'returned' : [6, 7].includes(code) ? 'cancelled' : 'confirmed';

export function RawOrdersView({ onSyncNow, syncing }: { onSyncNow?: () => void; syncing?: boolean }) {
  const today = todayVn();
  const team = useTeam();
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
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void fetch(`/api/employees?team=${team}`).then((r) => r.ok ? r.json() as Promise<Employee[]> : []).then((rows) => setEmployees(rows)).catch(() => undefined); }, [team]);
  const loadSync = useCallback(async () => { try { const r = await fetch('/api/sync/pos', { cache: 'no-store' }); if (r.ok) setSync(await r.json() as SyncRow[]); } catch { /* bỏ qua */ } }, []);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ posIds: posIds.join(','), page: String(page), size: String(size), group, sellerId, q, team });
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      const r = await fetch(`/api/raw/orders?${params}`, { cache: 'no-store' });
      const body = await r.json() as List & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không đọc được đơn nguồn.');
      setList(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không đọc được đơn nguồn.'); }
    finally { setLoading(false); }
  }, [posIds, page, size, group, sellerId, q, start, end, team]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSync(); }, [loadSync]);
  const open = async (id: string) => {
    setShowRaw(false);
    if (window.innerWidth < 1280) setTimeout(() => document.getElementById('order-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    const r = await fetch(`/api/raw/orders/detail?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (r.ok) setDetail(await r.json() as Detail); else setError('Không đọc được chi tiết đơn.');
  };
  const reset = () => setPage(1);
  const scoped = sync.filter((s) => posIds.includes(s.posId));
  const tot = scoped.reduce((a, s) => ({ records: a.records + s.records, assigned: a.assigned + s.withAssignmentTime, confirmed: a.confirmed + s.withConfirmation, errors: a.errors + s.errors24h }), { records: 0, assigned: 0, confirmed: 0, errors: 0 });
  const lastSync = scoped.map((s) => s.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;
  const pendingHistory = scoped.filter((s) => s.backfillCursor && !s.backfillCursor.completed);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${start ? dt(`${start}T00:00:00+07:00`) : '…'} – ${end ? dt(`${end}T00:00:00+07:00`) : '…'}`} title="Đơn nguồn Pancake POS" badge={<StatusChip tone="green">Đơn nguồn thật · chưa tính KPI</StatusChip>}
        subtitle="Kiểm tra, đối soát và đánh giá độ đầy đủ dữ liệu đơn hàng đã đồng bộ từ Pancake POS."
        actions={<><span className="text-xs text-[#547467]">Cập nhật lần cuối: {dt(lastSync, true)}</span><Button variant="outline" onClick={() => { void load(); void loadSync(); }} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Tải lại</Button>{onSyncNow && <Button onClick={onSyncNow} disabled={syncing}>{syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}</Button>}</>} />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <KpiCard icon={Database} tone="green" label="Tổng đơn đã lưu" value={vi.format(tot.records)} note={`${scoped.length} POS · từ ${scoped.map((s) => s.earliestCreatedAt).filter(Boolean).sort()[0]?.slice(0, 10) ?? '—'}`} />
        <KpiCard icon={Truck} tone="blue" label="Đơn có mốc giao người bán" value={vi.format(tot.assigned)} note={`${pct(tot.records ? tot.assigned / tot.records * 100 : null)} trên tổng`} />
        <KpiCard icon={CheckCircle2} tone="teal" label="Đơn có mốc xác nhận" value={vi.format(tot.confirmed)} note={`${pct(tot.records ? tot.confirmed / tot.records * 100 : null)} trên tổng (đơn mới chưa xác nhận không tính)`} />
        <KpiCard icon={History} tone="orange" label="POS đang lấy lịch sử" value={vi.format(pendingHistory.length)} note={pendingHistory.length ? pendingHistory.map((s) => `${POS.find((p) => p.id === s.posId)?.name}: ${s.backfillCursor?.month}`).join(' · ') : 'Đã đủ lịch sử'} onClick={() => { reset(); setGroup('limited'); }} active={group === 'limited'} />
        <KpiCard icon={AlertTriangle} tone={tot.errors ? 'red' : 'gray'} label="Lỗi đồng bộ 24 giờ" value={vi.format(tot.errors)} note={scoped.filter((s) => s.lastError).map((s) => `${POS.find((p) => p.id === s.posId)?.name}: ${s.lastError?.slice(0, 40)}`).join(' · ') || 'Không có lỗi đang treo'} />
      </div>
      <Toolbar>
        <span className="px-1 text-sm font-semibold text-[#62796d]">Ngày tạo</span>
        <Input type="date" className="w-40" value={start} max={end || today} onChange={(e) => { reset(); setStart(e.target.value); }} />
        <span className="text-sm text-[#7d9184]">→</span>
        <Input type="date" className="w-40" value={end} min={start} max={today} onChange={(e) => { reset(); setEnd(e.target.value); }} />
        {(start || end) && <Button size="sm" variant="ghost" onClick={() => { reset(); setStart(''); setEnd(''); }}>Bỏ ngày</Button>}
        <span className="px-1 text-sm font-semibold text-[#62796d]">Trạng thái</span>
        <Select value={group || '__all'} items={{ __all: GROUPS[''], ...Object.fromEntries(Object.entries(GROUPS).filter(([k]) => k)) }} onValueChange={(v) => { reset(); setGroup(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(GROUPS).map(([k, l]) => <SelectItem key={k || '__all'} value={k || '__all'}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <span className="px-1 text-sm font-semibold text-[#62796d]">Nhân viên</span>
        <Select value={sellerId || '__all'} items={{ __all: 'Tất cả nhân viên', ...Object.fromEntries(employees.map((e) => [e.id, e.name])) }} onValueChange={(v) => { reset(); setSellerId(v === '__all' ? '' : String(v)); }}>
          <SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">Tất cả nhân viên</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
        </Select>
        <form className="relative min-w-64 flex-1" onSubmit={(e) => { e.preventDefault(); reset(); setQ(qDraft.trim()); }}>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7d9184]" />
          <Input className="pl-8" placeholder="Tìm theo mã đơn, SĐT (đủ số hoặc 4 số cuối), tên khách… Enter để tìm" value={qDraft} onChange={(e) => setQDraft(e.target.value)} />
        </form>
      </Toolbar>
      <PosChips posIds={posIds} onChange={(v) => { reset(); setPosIds(v); }} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      <div className={`grid gap-4 ${detail ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''}`}>
        <ChartCard icon={Database} title={`Danh sách đơn nguồn${list ? ` · trang ${list.page}` : ''}`} subtitle={list?.note}
          action={<div className="flex items-center gap-2 text-sm"><span className="text-xs text-[#7d9184]">Hiển thị</span><Select value={String(size)} items={{ '25': '25', '50': '50', '100': '100' }} onValueChange={(v) => { reset(); setSize(Number(v)); }}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent></Select><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>‹</Button><span>Trang {page}</span><Button size="sm" variant="outline" disabled={!list?.hasMore || loading} onClick={() => setPage(page + 1)}>›</Button></div>}>
          {list && !list.orders.length && !loading ? <EmptyState text="Không có đơn phù hợp bộ lọc." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Mã đơn</th><th>POS</th><th>Khách</th><th>Thời gian tạo</th><th>Nhân viên bán</th><th>Xác nhận lúc</th><th>Trạng thái</th><th className="text-right">Tổng tiền</th><th>Độ đầy đủ</th></tr></thead>
                <tbody>
                  {(list?.orders ?? []).map((o, i) => {
                    const full = !!o.sellerAssignedAt && (!!o.firstConfirmedAt || groupOf(o.statusCode) === 'new' || groupOf(o.statusCode) === 'cancelled') && !o.historyLimited && o.hasRaw;
                    return (
                      <tr key={o.id} className={`cursor-pointer border-t hover:bg-[#f5faf5] ${detail?.id === o.id ? 'bg-[#f1f8f3]' : ''}`} onClick={() => void open(o.id)}>
                        <td className="py-2 text-xs text-[#7d9184]">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap font-medium">{o.orderId}</td>
                        <td className="whitespace-nowrap text-xs"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: posColor(o.posId) }} />{o.posName}</td>
                        <td className="whitespace-nowrap text-xs"><div>{o.customer || '—'}</div><div className="text-[#7d9184]">{o.phone ?? ''}</div></td>
                        <td className="whitespace-nowrap text-xs">{dt(o.createdAt, true)}</td>
                        <td className="whitespace-nowrap text-xs">{o.sellerName ?? '—'}</td>
                        <td className="whitespace-nowrap text-xs">{o.firstConfirmedAt ? dt(o.firstConfirmedAt, true) : '—'}</td>
                        <td><StatusChip tone={statusTone(o.statusCode)}>{o.statusName}</StatusChip></td>
                        <td className="whitespace-nowrap text-right font-medium">{money(o.net)}</td>
                        <td className="whitespace-nowrap text-xs">{full ? <span className="inline-flex items-center gap-1 text-[#1a7a48]"><CheckCircle2 size={13} />Đầy đủ</span> : <span className="inline-flex items-center gap-1 text-[#a36b00]"><FileWarning size={13} />{!o.hasRaw ? 'Thiếu JSON gốc' : o.historyLimited ? 'Thiếu lịch sử' : !o.sellerAssignedAt ? 'Chưa giao người bán' : 'Thiếu mốc XN'}</span>}</td>
                      </tr>
                    );
                  })}
                  {loading && !list && <tr><td colSpan={10} className="py-4 text-center text-[#7d9184]">Đang tải…</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
        {detail && (
          <div id="order-detail" className="scroll-mt-16"><ChartCard icon={Database} title="Chi tiết đơn hàng" subtitle={`${detail.posName} · đồng bộ lúc ${dt(detail.fetchedAt, true)}`}
            action={<div className="flex items-center gap-2">{detail.pancakeUrl && <a href={detail.pancakeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-[#17684b] px-2.5 py-1.5 text-xs font-medium text-white">Mở trên Pancake <ExternalLink size={12} /></a>}<button type="button" className="rounded-md border p-1.5 text-[#547467]" onClick={() => setDetail(null)} title="Đóng"><X size={14} /></button></div>}>
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border bg-[#f8faf8] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><StatusChip tone={statusTone(detail.statusCode)}>{detail.statusName}</StatusChip><span className="text-lg font-semibold">#{detail.orderId}</span><button type="button" className="text-[#7d9184]" title="Sao chép mã" onClick={() => void navigator.clipboard?.writeText(detail.orderId)}><Copy size={13} /></button></div>
                  <div className="text-xs text-[#547467]"><span className="inline-block size-2 rounded-full align-middle" style={{ background: posColor(detail.posId) }} /> {detail.posName} · Tổng tiền <strong className="text-[#17342b]">{money(detail.net)}</strong></div>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7d9184]">Thông tin đơn hàng</h4>
                <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-y-1.5 text-sm">
                  <dt className="text-[#7d9184]">Khách hàng</dt><dd>{detail.customer || '—'} · {detail.phone ?? '—'}</dd>
                  <dt className="text-[#7d9184]">Địa chỉ giao</dt><dd>{detail.address ?? '—'}{detail.province ? ` (${detail.province})` : ''}</dd>
                  <dt className="text-[#7d9184]">Thời gian tạo</dt><dd>{dt(detail.createdAt, true)}</dd>
                  <dt className="text-[#7d9184]">Nhân viên bán</dt><dd>{detail.sellerName ?? '—'}{detail.sellerAssignedAt ? <span className="text-xs text-[#7d9184]"> · giao lúc {dt(detail.sellerAssignedAt, true)}</span> : ''}</dd>
                  <dt className="text-[#7d9184]">Người chốt</dt><dd>{detail.closerName ?? '—'}{detail.firstConfirmedAt ? <span className="text-xs text-[#7d9184]"> · xác nhận {dt(detail.firstConfirmedAt, true)}</span> : ''}</dd>
                  <dt className="text-[#7d9184]">CSKH / Marketer</dt><dd>{detail.careName ?? '—'} / {detail.marketerName ?? '—'}</dd>
                  <dt className="text-[#7d9184]">Nguồn đơn</dt><dd>{detail.source ?? '—'}{detail.isLive ? ' · Livestream' : ''}{detail.adsSource ? ` · ${detail.adsSource}` : ''}</dd>
                  <dt className="text-[#7d9184]">Vận chuyển</dt><dd>{detail.partner?.partner_name ?? '—'}{detail.partner?.extend_code ? ` · ${detail.partner.extend_code}` : ''}{detail.trackingLink ? <> · <a className="text-primary underline" href={detail.trackingLink} target="_blank" rel="noreferrer">theo dõi</a></> : null}{detail.deliveredAt ? <span className="text-xs text-[#7d9184]"> · giao TC {dt(detail.deliveredAt, true)}</span> : ''}</dd>
                  {detail.returnedReason && <><dt className="text-[#7d9184]">Lý do hoàn</dt><dd>{detail.returnedReason}</dd></>}
                  <dt className="text-[#7d9184]">Tiền</dt><dd>Doanh số {money(detail.gross)} · giảm {money(Number(detail.gross ?? 0) - Number(detail.net ?? 0))} · ship {money(detail.shippingFee)} · COD {money(detail.cod)}{detail.prepaid ? ` · trả trước ${money(detail.prepaid)}` : ''}</dd>
                  <dt className="text-[#7d9184]">Ghi chú / thẻ</dt><dd>{detail.note || '—'} {detail.tags.map((t) => <StatusChip key={t.name} tone="gray">#{t.name}</StatusChip>)}</dd>
                </dl>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7d9184]">Sản phẩm ({detail.items.length})</h4>
                {detail.items.length ? <ul className="space-y-1 text-xs">{detail.items.map((i, k) => <li key={k} className="flex justify-between gap-2 border-b py-1"><span>{i.name}{i.bonus ? ' (tặng)' : ''} × {i.quantity}{i.returned ? ` · hoàn ${i.returned}` : ''}</span><span className="whitespace-nowrap">{money(i.total)}</span></li>)}</ul> : <p className="text-xs text-[#7d9184]">Chưa có dòng sản phẩm.</p>}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7d9184]">Độ đầy đủ lịch sử</h4>
                {(() => { const c = detail.checks; const n = Object.values(c).filter(Boolean).length; return (
                  <>
                    <div className="flex items-center gap-2"><span className="inline-block h-2 flex-1 overflow-hidden rounded-full bg-[#eef1ee]"><span className="block h-2 rounded-full bg-[#1a9c5b]" style={{ width: `${n / 5 * 100}%` }} /></span><strong>{Math.round(n / 5 * 100)}%</strong></div>
                    <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
                      {[['created', 'Có dữ liệu tạo đơn'], ['assigned', 'Có mốc giao người bán'], ['confirmed', 'Có mốc xác nhận'], ['history', 'Có lịch sử trạng thái'], ['raw', 'Có JSON gốc']].map(([k, l]) => <li key={k} className={`flex items-center gap-1 ${c[k as keyof typeof c] ? 'text-[#1a7a48]' : 'text-[#a36b00]'}`}>{c[k as keyof typeof c] ? <CheckCircle2 size={13} /> : <FileWarning size={13} />}{l}</li>)}
                    </ul>
                  </>
                ); })()}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7d9184]">Lịch sử trạng thái</h4>
                {detail.history.length ? (
                  <ol className="space-y-1.5 text-xs">
                    {detail.history.map((h, k) => <li key={k} className="flex items-center gap-2"><span className="inline-block size-2 rounded-full" style={{ background: STATUS_COLORS[groupOf(h.to)] }} /><span className="w-24 shrink-0 text-[#7d9184]">{dt(h.at, true)}</span><span>{h.fromName ? `${h.fromName} → ` : ''}<strong>{h.toName}</strong></span><span className="ml-auto text-[#7d9184]">{h.by ?? ''}</span></li>)}
                  </ol>
                ) : <p className="text-xs text-[#7d9184]">Pancake không trả lịch sử cho đơn này.</p>}
                <p className="mt-1 text-[11px] text-[#7d9184]">Cập nhật gần nhất trên Pancake: {dt(detail.updatedAt, true)}</p>
              </div>
              <div>
                <button type="button" className="text-xs text-primary underline" onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Ẩn dữ liệu gốc' : 'Xem dữ liệu gốc (JSON Pancake)'}</button>
                {showRaw && <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-[#0f3328] p-3 text-[11px] text-[#d9f36d]">{detail.raw ? JSON.stringify(detail.raw, null, 2) : 'Đơn này được đồng bộ trước khi lưu JSON gốc; sẽ có sau lượt lấy lịch sử tiếp theo.'}</pre>}
              </div>
              <p className="text-[11px] text-[#7d9184]">Lần đồng bộ đơn: {timeOnly(detail.fetchedAt)} {dt(detail.fetchedAt)}</p>
            </div>
          </ChartCard></div>
        )}
      </div>
    </div>
  );
}
