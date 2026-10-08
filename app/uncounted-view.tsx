'use client';

// Báo cáo doanh thu ngoài hậu tố (anh Vũ 08/10/2026): web chỉ tính doanh số người có MKT / CSKH / SALE trong tên Pancake; "những người còn lại
// nếu phát sinh doanh thu trên pos thì phải làm 1 bảng báo cáo riêng để tôi thống kê xem nguyên nhân do đâu".
// Mỗi người một dòng (người bán theo ngày chốt, Marketer theo ngày xác nhận), tách theo POS, bấm Xem đơn ra danh sách đơn mở được trên Pancake,
// cột Nguyên nhân để anh hoặc quản lý ghi, xuất Excel. Số: /api/reports/uncounted.
import { Fragment, useState } from 'react';
import { Check, ChevronDown, ExternalLink, FileSpreadsheet, ShoppingCart, UserX, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { PeriodFields, PosChips } from './overview-view';
import { PosBadge } from './pos-badge';
import { useApi } from './use-api';
import { EmptyState, ErrorBox, KpiCard, PageHeader, SegmentedControl, SkeletonTable, StatusChip, TableWrap, Toolbar, dt, money, pct, posName, short, toast, vi } from './ui-kit';

type Role = 'seller' | 'marketer';
type Note = { text: string; by: string; at: string };
type Person = {
  id: string; role: Role; name: string; department: string | null; hrTeam: string | null; hrStatus: string | null;
  orders: number; net: number; firstAt: string; lastAt: string; byPos: { posId: string; orders: number; net: number }[]; note: Note | null;
};
type Data = { sellers: Person[]; marketers: Person[]; total: { orders: number; net: number }; extra: { id: string; name: string; department: string | null; posIds: string[] }[]; canEdit: boolean; rule: string };
type Order = { id: string; posId: string; orderId: string; customer: string | null; at: string; status: string; net: number; pancakeUrl: string | null };
const ROLE_LABEL: Record<Role, string> = { seller: 'Người bán', marketer: 'Marketer' };
const HR_TEAM: Record<string, string> = { sale: 'Sale', cskh: 'CSKH', mkt: 'MKT', other: 'Khác' };

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/reports/uncounted', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as { error?: string; note?: Note | null };
  if (!r.ok) throw new Error(j.error ?? 'Không lưu được');
  return j;
}

/** Ô ghi nguyên nhân: lưu khi rời ô hoặc Enter. */
function NoteCell({ p, onSaved }: { p: Person; onSaved: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = draft ?? p.note?.text ?? '';
  const save = async () => {
    if (draft === null || draft.trim() === (p.note?.text ?? '')) { setDraft(null); return; }
    setBusy(true);
    try { await post({ action: 'note', role: p.role, userId: p.id, text: draft }); toast(`Đã lưu nguyên nhân: ${p.name}`); setDraft(null); onSaved(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được', { kind: 'error' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-w-[180px]">
      <input aria-label={`Nguyên nhân: ${p.name}`} className="w-full rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink placeholder:text-ink-4 focus:border-primary focus:outline-none"
        placeholder="Ghi nguyên nhân…" value={value} disabled={busy} maxLength={500}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setDraft(null); }} />
      {p.note && draft === null && <p className="mt-0.5 text-[10.5px] text-ink-3">{p.note.by} · {dt(p.note.at, true)}</p>}
    </div>
  );
}

function OrdersOf({ p, start, end, posIds }: { p: Person; start: string; end: string; posIds: string[] }) {
  const params = new URLSearchParams({ start, end, posIds: posIds.join(','), orders: p.id, role: p.role });
  const { data, error } = useApi<{ orders: Order[] }>(`/api/reports/uncounted?${params}`, { keep: false });
  if (error) return <p className="text-[12px] text-bad">{error}</p>;
  if (!data) return <SkeletonTable rows={3} cols={6} />;
  return (
    <div className="max-h-[360px] overflow-auto rounded-lg border border-line">
      <table className="tbl compact">
        <thead><tr><th>Mã đơn</th><th>POS</th><th>Khách</th><th>{p.role === 'seller' ? 'Chốt lúc' : 'Xác nhận lúc'}</th><th>Trạng thái</th><th className="n">Tiền</th></tr></thead>
        <tbody>{data.orders.map((o) => (
          <tr key={o.id}>
            <td className="num">{o.pancakeUrl ? <a className="inline-flex items-center gap-1 text-primary underline" href={o.pancakeUrl} target="_blank" rel="noreferrer">{o.orderId}<ExternalLink size={11} aria-hidden="true" /></a> : o.orderId}</td>
            <td className="text-xs"><PosBadge posId={o.posId} size={14} className="mr-1" />{posName(o.posId)}</td>
            <td className="text-xs">{o.customer ?? '—'}</td>
            <td className="num text-xs">{dt(o.at, true)}</td>
            <td><StatusChip>{o.status}</StatusChip></td>
            <td className="n">{money(o.net)}</td>
          </tr>
        ))}</tbody>
      </table>
      {data.orders.length >= 500 && <p className="px-2 py-1 text-[11.5px] text-ink-3">Chỉ hiện 500 đơn mới nhất.</p>}
    </div>
  );
}

export function UncountedView() {
  const period = usePeriod();
  const { start, end } = period;
  const [posIds, setPosIds] = usePosIds();
  const params = new URLSearchParams({ start, end, posIds: posIds.join(',') });
  const { data, error, reload } = useApi<Data>(`/api/reports/uncounted?${params}`, { keep: false });
  const [role, setRole] = useState<'all' | Role>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = !data ? [] : [...(role !== 'marketer' ? data.sellers : []), ...(role !== 'seller' ? data.marketers : [])];
  const sellerNet = data?.sellers.reduce((a, p) => a + p.net, 0) ?? 0, sellerOrders = data?.sellers.reduce((a, p) => a + p.orders, 0) ?? 0;
  const mktNet = data?.marketers.reduce((a, p) => a + p.net, 0) ?? 0;
  const noted = rows.filter((p) => p.note).length;
  const count = async (id: string, name: string, counted: boolean) => {
    setBusy(id);
    try { await post({ action: 'count', userId: id, counted }); toast(counted ? `Đã tính doanh số cho ${name}` : `Đã bỏ tính doanh số ${name}`); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được', { kind: 'error' }); }
    finally { setBusy(null); }
  };
  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const people = [...data.sellers, ...data.marketers];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Tên trên Pancake', 'Vai trò trên đơn', 'Bộ phận Pancake', 'Team web nhân sự', 'Số đơn', 'Doanh thu (₫)', 'Đơn đầu', 'Đơn gần nhất', 'POS', 'Nguyên nhân', 'Người ghi', 'Ghi lúc'],
      ...people.map((p) => [p.name, ROLE_LABEL[p.role], p.department ?? '', p.hrTeam ? HR_TEAM[p.hrTeam] ?? p.hrTeam : '', p.orders, Math.round(p.net), dt(p.firstAt, true), dt(p.lastAt, true),
        p.byPos.map((b) => `${posName(b.posId)} ${b.orders}`).join(', '), p.note?.text ?? '', p.note?.by ?? '', p.note ? dt(p.note.at, true) : '']),
    ]), 'Theo người');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Tên trên Pancake', 'Vai trò trên đơn', 'POS', 'Số đơn', 'Doanh thu (₫)'],
      ...people.flatMap((p) => p.byPos.map((b) => [p.name, ROLE_LABEL[p.role], posName(b.posId), b.orders, Math.round(b.net)])),
    ]), 'Theo POS');
    XLSX.writeFile(wb, `doanh-thu-ngoai-hau-to-${start}-${end}.xlsx`);
  };
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dt(`${start}T00:00:00+07:00`)} – ${dt(`${end}T00:00:00+07:00`)}`} title="Doanh thu ngoài hậu tố"
        subtitle="Đơn của người không có MKT, CSKH, SALE trong tên Pancake: không vào doanh số, liệt kê để tìm nguyên nhân"
        actions={<Button onClick={() => void exportExcel()} disabled={!data}><FileSpreadsheet size={14} />Xuất Excel</Button>} />
      <Toolbar>
        <PeriodFields preset={period.preset} start={start} end={end} onPreset={period.setPreset} onStart={period.setStart} onEnd={period.setEnd} />
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {data && <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard icon={UserX} tone="orange" label="Số người" value={vi.format(new Set(rows.map((p) => p.id)).size)} note={`${vi.format(data.sellers.length)} người bán · ${vi.format(data.marketers.length)} Marketer`} />
          <KpiCard icon={ShoppingCart} tone="blue" label="Đơn chốt của người bán" value={vi.format(sellerOrders)} note={`${pct(data.total.orders ? sellerOrders / data.total.orders * 100 : null)} tổng đơn chốt kỳ này`} />
          <KpiCard icon={Wallet} tone="red" label="Doanh thu không tính" value={`${short(sellerNet)} ₫`} note={`${pct(data.total.net ? sellerNet / data.total.net * 100 : null)} doanh thu đơn chốt · Marketer ${short(mktNet)} ₫`} />
          <KpiCard icon={Check} tone="green" label="Đã ghi nguyên nhân" value={`${vi.format(noted)} / ${vi.format(rows.length)}`} note="Ghi ở cột Nguyên nhân, lưu khi rời ô" />
        </div>
        <section className="card flex flex-col gap-3 p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-base font-semibold text-ink">Theo người</h2><p className="text-[12px] text-ink-3">{data.rule} Ai sót hậu tố thì sửa tên trên Pancake (lần đồng bộ sau tự tính){data.canEdit ? ', hoặc bấm Vẫn tính' : ''}.</p></div>
            <SegmentedControl<'all' | Role> size="sm" ariaLabel="Vai trò trên đơn" value={role} onChange={setRole}
              options={[{ value: 'all', label: 'Tất cả' }, { value: 'seller', label: ROLE_LABEL.seller }, { value: 'marketer', label: ROLE_LABEL.marketer }]} />
          </header>
          {!rows.length ? <EmptyState text="Kỳ này không có đơn nào của người không có hậu tố." /> : (
            <TableWrap minWidth={900}>
              <table className="tbl">
                <thead><tr><th>Tên trên Pancake · vai trò</th><th>POS</th><th className="n">Đơn</th><th className="n">Doanh thu</th><th>Gần nhất</th><th>Nguyên nhân</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
                <tbody>{rows.map((p) => {
                  const k = `${p.role}:${p.id}`;
                  return (
                    <Fragment key={k}>
                      <tr>
                        <td><span className="block font-medium">{p.name}{p.hrStatus === 'da_nghi' && <span className="ml-1 text-[11px] font-normal text-ink-3">(đã nghỉ)</span>}</span>
                          <span className="block text-[11px] text-ink-3">{ROLE_LABEL[p.role]} · {p.department ?? 'chưa có bộ phận'}{p.hrTeam ? ` · ${HR_TEAM[p.hrTeam] ?? p.hrTeam}` : ''}</span></td>
                        <td className="text-xs"><span className="flex min-w-[150px] flex-wrap gap-1">{p.byPos.map((b) => <span key={b.posId} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-px" title={`${posName(b.posId)}: ${vi.format(b.orders)} đơn · ${money(b.net)}`}><PosBadge posId={b.posId} size={13} />{vi.format(b.orders)}</span>)}</span></td>
                        <td className="n">{vi.format(p.orders)}</td>
                        <td className="n">{money(p.net)}</td>
                        <td className="num text-xs">{dt(p.lastAt, true)}</td>
                        <td><NoteCell p={p} onSaved={reload} /></td>
                        <td className="whitespace-nowrap">
                          <button type="button" className="btn sm" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>Xem đơn<ChevronDown size={12} className={open === k ? 'rotate-180' : ''} /></button>
                          {data.canEdit && <button type="button" className={`btn sm ml-1 ${busy === p.id ? 'is-busy' : ''}`} disabled={busy === p.id} onClick={() => void count(p.id, p.name, true)} title="Tính doanh số người này dù tên không có hậu tố">Vẫn tính</button>}
                        </td>
                      </tr>
                      {open === k && <tr><td colSpan={7} className="bg-surface-2"><OrdersOf p={p} start={start} end={end} posIds={posIds} /></td></tr>}
                    </Fragment>
                  );
                })}</tbody>
              </table>
            </TableWrap>
          )}
        </section>
        {data.extra.length > 0 && (
          <section className="card p-4 text-[12.5px] text-ink-2">
            <h2 className="mb-1 text-[13.5px] font-semibold text-ink">Đang vẫn tính dù tên không có hậu tố</h2>
            <p className="flex flex-wrap gap-1.5">{data.extra.map((p) => <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">{p.name}
              {data.canEdit && <button type="button" className="cursor-pointer text-ink-3 hover:text-bad" aria-label={`Bỏ tính ${p.name}`} disabled={busy === p.id} onClick={() => void count(p.id, p.name, false)}>×</button>}</span>)}</p>
          </section>
        )}
      </>}
      {!data && !error && <SkeletonTable rows={6} cols={8} />}
    </div>
  );
}
