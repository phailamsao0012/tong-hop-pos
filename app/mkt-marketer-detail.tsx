'use client';

// Khung "Chi tiết marketer" (anh Vũ 12/11/2026): bấm tên marketer mở khung này; hồ sơ làm việc là một nút trong khung.
// Phần 1: số của marketer (so kỳ trước). Phần 2: từng Sale chốt cho marketer (theo người bấm xác nhận), có chip POS của tài khoản.
// Phần 3: theo ngày (mặc định đóng). Màu: TL chốt < 40% đỏ, hủy ≥ 5% đỏ, hoàn ≥ 7% đỏ.
import { Fragment, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { addDays, todayVn } from '@/lib/shared/report-time';
import { posCode, posShortName } from '@/lib/shared/pos-short';
import { cancelRateClass, closeRateClass, ratePct, ratePctCapped, returnRateClass } from '@/lib/shared/close-rate';
import type { MarketerDetail, MdAgg } from '@/lib/reports/mkt-marketer-detail';
import { ProfileLink } from './staff-profile-link';
import { DeltaPill, SegmentedControl, TableWrap, Th, delta, money, pct, shortMoney, vi } from './ui-kit';
import { useApi } from './use-api';
import type { SaleTeamOption } from './mkt-cross-card';

type Range = 'today' | 'yesterday' | 'd7' | 'month' | 'page';
const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Hôm nay' }, { value: 'yesterday', label: 'Hôm qua' }, { value: 'd7', label: '7 ngày' }, { value: 'month', label: 'Tháng này' }, { value: 'page', label: 'Kỳ trên trang' },
];
function rangeOf(r: Range, page: { start: string; end: string }) {
  const t = todayVn();
  if (r === 'today') return { start: t, end: t };
  if (r === 'yesterday') { const y = addDays(t, -1); return { start: y, end: y }; }
  if (r === 'd7') return { start: addDays(t, -6), end: t };
  if (r === 'month') return { start: `${t.slice(0, 7)}-01`, end: t };
  return page;
}
// TL chốt chỉ đơn New (người chốt thuộc Sale) ÷ SĐT chia Sale (Đầu não kiểm 19/11/2026), không lẫn đơn CSKH.
const rates = (a: MdAgg) => ({ close: ratePctCapped(a.newClosed, a.phones), go: ratePct(a.packed, a.closed), cancel: ratePct(a.cancelled, a.packed), ret: ratePct(a.returned, a.packed), aov: a.closed ? a.net / a.closed : null });

function Tile({ label, value, cls = '', d, sub, title }: { label: string; value: string; cls?: string; d?: number | null; sub?: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-3 py-2" title={title}>
      <p className="truncate text-[11px] font-medium text-ink-3">{label}</p>
      <p className={`num truncate text-base font-semibold leading-tight ${cls || 'text-ink'}`}>{value}</p>
      {(d !== undefined && d !== null) || sub ? <p className="flex items-center gap-1 truncate text-[11px] text-ink-3">{d !== undefined && d !== null && <DeltaPill value={d} variant="plain" />}{sub}</p> : null}
    </div>
  );
}

export function MarketerDetailSheet({ marketerId, onClose, posIds, page, saleTeams }: {
  marketerId: string | null; onClose: () => void; posIds: string[]; page: { start: string; end: string }; saleTeams: SaleTeamOption[];
}) {
  const [range, setRange] = useState<Range>('page');
  const [showDays, setShowDays] = useState(false);
  const r = rangeOf(range, page);
  const url = marketerId ? `/api/marketing/marketer-detail?${new URLSearchParams({ marketerId, start: r.start, end: r.end, posIds: posIds.join(',') })}` : null;
  const { data, loading } = useApi<MarketerDetail>(url, { keep: false });
  const teamOf = useMemo(() => { const m = new Map<string, string>(); for (const t of saleTeams) for (const x of t.memberRefs) if (!m.has(x.id)) m.set(x.id, t.name); return m; }, [saleTeams]);
  const c = data?.current, p = data?.prev;
  const cr = c ? rates(c) : null, pr = p ? rates(p) : null;
  const roas = c && c.cost ? c.newNet / c.cost : null;
  // Gom dòng theo người: một người có tài khoản nhiều POS thì mỗi POS một dòng con, có dòng tổng của người.
  const people = useMemo(() => {
    if (!data) return [];
    const by = new Map<string, { name: string; rows: typeof data.bySale; sum: MdAgg }>();
    for (const s of data.bySale) {
      const name = data.names[s.sellerId] ?? (s.sellerId ? `NV ${s.sellerId.slice(0, 6)}` : 'Chưa có người');
      const key = name.trim().toLocaleLowerCase('vi');
      const g = by.get(key) ?? { name, rows: [], sum: { phones: 0, created: 0, closed: 0, newClosed: 0, net: 0, newNet: 0, cskhNet: 0, packed: 0, cancelled: 0, returned: 0 } };
      g.rows.push(s);
      for (const k of Object.keys(g.sum) as (keyof MdAgg)[]) g.sum[k] += s[k];
      by.set(key, g);
    }
    return [...by.values()].sort((a, b) => b.sum.net - a.sum.net || b.sum.phones - a.sum.phones);
  }, [data]);
  const row = (label: React.ReactNode, a: MdAgg, extra: React.ReactNode, strong = false, key?: string) => {
    const x = rates(a);
    return (
      <tr key={key} className={strong ? 'font-semibold' : ''}>
        <td className="whitespace-nowrap">{label}</td>
        <td className="whitespace-nowrap text-[12px] text-ink-3">{extra}</td>
        <td className="n">{vi.format(a.phones)}</td>
        <td className="n">{vi.format(a.closed)}</td>
        <td className={`n ${closeRateClass(x.close)}`} title={`${vi.format(a.newClosed)} đơn New chốt / ${vi.format(a.phones)} SĐT chia Sale`}>{pct(x.close)}</td>
        <td className="n">{shortMoney(a.net)}</td>
        <td className="n">{x.aov === null ? '—' : shortMoney(x.aov)}</td>
        <td className="n">{vi.format(a.packed)}</td>
        <td className="n">{pct(x.go)}</td>
        <td className={`n ${cancelRateClass(x.cancel)}`}>{pct(x.cancel)}</td>
        <td className={`n ${returnRateClass(x.ret)}`}>{pct(x.ret)}</td>
        <td className="n">{c?.net ? pct(a.net / c.net * 100) : '—'}</td>
      </tr>
    );
  };
  return (
    <Sheet open={!!marketerId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-4xl">
        <SheetHeader className="pr-12">
          <SheetTitle className="flex flex-wrap items-center gap-2">{data?.name ?? 'Chi tiết marketer'}{marketerId && <ProfileLink id={marketerId} name={data?.name ?? ''} className="rounded-md border border-line px-2 py-0.5 text-[12px] font-medium text-primary">Hồ sơ</ProfileLink>}</SheetTitle>
          <SheetDescription>{`Kỳ ${r.start === r.end ? r.start.split('-').reverse().join('/') : `${r.start.split('-').reverse().join('/')} – ${r.end.split('-').reverse().join('/')}`} · POS đang chọn · đã chốt là chốt`}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <SegmentedControl<Range> size="sm" ariaLabel="Kỳ" value={range} onChange={setRange} options={RANGES} />
          {!c || !cr ? <div className={`skel h-28 rounded-xl ${loading ? '' : 'opacity-50'}`} /> : <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Data mới (SĐT)" value={vi.format(c.phones)} d={p ? delta(c.phones, p.phones) : null} sub={`${vi.format(c.created)} đơn tạo`} />
              <Tile label="Đơn chốt" value={vi.format(c.closed)} d={p ? delta(c.closed, p.closed) : null} />
              <Tile label="TL chốt" value={pct(cr.close)} cls={closeRateClass(cr.close)} sub={pr ? `trước ${pct(pr.close)}` : undefined} title="Đơn chốt ÷ SĐT, tối đa 100%" />
              <Tile label="Doanh thu" value={shortMoney(c.net)} d={p ? delta(c.net, p.net) : null} sub={`New ${shortMoney(c.newNet)} · CSKH ${shortMoney(c.cskhNet)}`} title={money(c.net)} />
              <Tile label="AOV" value={cr.aov === null ? '—' : shortMoney(cr.aov)} sub="doanh thu ÷ đơn chốt" />
              <Tile label="Đơn đi · tỉ lệ đi" value={`${vi.format(c.packed)} · ${pct(cr.go)}`} />
              <Tile label="Tỉ lệ hủy · hoàn" value={`${pct(cr.cancel)} · ${pct(cr.ret)}`} cls={cancelRateClass(cr.cancel) || returnRateClass(cr.ret)} sub={`${vi.format(c.cancelled)} hủy · ${vi.format(c.returned)} hoàn`} />
              <Tile label="Chi phí · ROAS" value={`${c.cost ? shortMoney(c.cost) : '—'} · ${roas === null ? '—' : `${roas.toFixed(2).replace('.', ',')}×`}`} sub={c.closed && c.cost ? `CP/đơn ${shortMoney(c.cost / c.closed)}` : 'chi phí chia theo số về từng POS'} />
            </div>
            <section>
              <h3 className="mb-2 text-[14px] font-semibold text-ink">Sale chốt cho {data?.name}</h3>
              <TableWrap stickyFirst><table className="tbl compact">
                <thead><tr><Th>Sale</Th><Th>POS · team</Th><Th className="n" hint="SĐT trên đơn của marketer tạo trong kỳ, được gán cho Sale này.">SĐT nhận</Th><Th className="n">Đơn chốt</Th><Th className="n" hint="Đơn chốt ÷ SĐT nhận. Dưới 40% đỏ.">TL chốt</Th><Th className="n">Doanh thu</Th><Th className="n">AOV</Th><Th className="n">Đơn đi</Th><Th className="n">Tỉ lệ đi</Th><Th className="n">Tỉ lệ hủy</Th><Th className="n">Tỉ lệ hoàn</Th><Th className="n" hint="Phần doanh thu của marketer do Sale này chốt.">% DT</Th></tr></thead>
                <tbody>{people.map((g) => g.rows.length === 1
                  ? row(g.name, g.rows[0], <span className="inline-flex items-center gap-1"><PosChip id={g.rows[0].posId} />{teamOf.get(g.rows[0].sellerId) ?? ''}</span>, false, g.name)
                  : <Fragment key={g.name}>
                      {row(g.name, g.sum, `${g.rows.length} POS`, true)}
                      {g.rows.map((s) => row(<span className="pl-4 text-ink-3">└</span>, s, <span className="inline-flex items-center gap-1"><PosChip id={s.posId} />{teamOf.get(s.sellerId) ?? ''}</span>, false, `${g.name}|${s.posId}`))}
                    </Fragment>)}</tbody>
                <tfoot>{row('Tổng', c, '', true)}</tfoot>
              </table></TableWrap>
            </section>
            {data && data.byDay.length > 1 && <section>
              <button type="button" className="text-[13px] font-semibold text-primary" onClick={() => setShowDays((v) => !v)} aria-expanded={showDays}>{showDays ? '▾' : '▸'} Theo ngày ({data.byDay.length} ngày)</button>
              {showDays && <TableWrap><table className="tbl compact mt-2"><thead><tr><Th>Ngày</Th><Th className="n">SĐT</Th><Th className="n">Đơn chốt</Th><Th className="n">TL chốt</Th><Th className="n">Doanh thu</Th></tr></thead>
                <tbody>{data.byDay.map((d) => { const cl = ratePctCapped(d.newClosed, d.phones); return <tr key={d.day}><td>{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</td><td className="n">{vi.format(d.phones)}</td><td className="n">{vi.format(d.closed)}</td><td className={`n ${closeRateClass(cl)}`}>{pct(cl)}</td><td className="n">{shortMoney(d.net)}</td></tr>; })}</tbody></table></TableWrap>}
            </section>}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PosChip({ id }: { id: string }) {
  return <span className="rounded bg-tint-2 px-1.5 py-px text-[10.5px] font-bold tracking-wide text-primary" title={posShortName(id)}>{posCode(id)}</span>;
}
