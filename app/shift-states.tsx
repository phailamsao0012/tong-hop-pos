'use client';

// Điều hành trong ca: đơn nhận trong ca đã chốt / chưa chốt (25/09/2026) — theo nhân viên, theo giờ, bấm để xem đúng các đơn.
import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { PosBadge } from './pos-badge';
import { ChartCard, EmptyState, StatusChip, TableWrap, money, pct, shortMoney, timeOnly, vi } from './ui-kit';

export type OrderStates = {
  total: { closed: number; open: number };
  staff: { sellerId: string; name: string; closed: number; open: number; closedNet: number; rate: number | null }[];
  orders: { id: string; orderId: string; posId: string; posName: string; phone: string | null; customer: string | null; sellerId: string; assignedAt: string; state: 'closed' | 'open'; statusName: string; net: number }[];
};
type Hour = { hour: string; closedOrders?: number; openOrders?: number };
type Pick = { sellerId: string | null; state: 'closed' | 'open' | null; hour: string | null; label: string };

export function ShiftStatesCard({ data, hourly, info }: { data?: OrderStates; hourly: Hour[]; info?: string }) {
  const [pick, setPick] = useState<Pick | null>(null);
  const list = useMemo(() => !data || !pick ? [] : data.orders.filter((o) =>
    (pick.sellerId === null || o.sellerId === pick.sellerId) && (!pick.state || o.state === pick.state) &&
    (!pick.hour || `${String(new Date(Date.parse(`${o.assignedAt}Z`) + 7 * 3600000).getUTCHours()).padStart(2, '0')}:00` === pick.hour))
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)), [data, pick]);
  if (!data) return null;
  const all = data.total.closed + data.total.open;
  const maxH = Math.max(1, ...hourly.map((h) => (h.closedOrders ?? 0) + (h.openOrders ?? 0)));
  const num = (n: number, p: Pick, tone = '') => (
    <button type="button" disabled={!n} onClick={() => setPick(p)} className={`num rounded-md px-1.5 py-0.5 hover:bg-tint-2 disabled:cursor-default disabled:hover:bg-transparent ${tone} ${pick?.label === p.label ? 'bg-tint-2 font-semibold' : ''}`}>{n ? vi.format(n) : <span className="text-ink-4">0</span>}</button>
  );
  return (
    <ChartCard icon={ClipboardCheck} title="Đơn nhận trong ca: đã chốt / chưa chốt" info={info}
      subtitle={`${vi.format(all)} đơn · ${vi.format(data.total.closed)} đã chốt (${pct(all ? data.total.closed / all * 100 : null, 0)}) · ${vi.format(data.total.open)} chưa chốt · đơn hủy không tính · bấm số để xem đơn`}>
      {!all ? <EmptyState text="Chưa có đơn được giao trong ca." /> : (
        <div className="space-y-4">
          {/* Theo giờ: cột chồng đã chốt / chưa chốt */}
          <div className="flex items-end gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Theo giờ">
            {hourly.map((h) => {
              const c = h.closedOrders ?? 0, o = h.openOrders ?? 0;
              return (
                <button key={h.hour} type="button" role="listitem" disabled={!c && !o} onClick={() => setPick({ sellerId: null, state: null, hour: h.hour, label: `h${h.hour}` })}
                  className={`flex min-w-11 flex-1 flex-col items-center gap-1 rounded-lg p-1 hover:bg-surface-2 ${pick?.label === `h${h.hour}` ? 'bg-tint-2' : ''}`} title={`${h.hour}: ${c} đã chốt · ${o} chưa chốt`}>
                  <span className="num text-[11px] text-ink-2">{c + o || ''}</span>
                  <span className="flex h-24 w-5 flex-col justify-end overflow-hidden rounded-md bg-surface-2">
                    <i className="block w-full bg-[var(--warn)]" style={{ height: `${o / maxH * 100}%` }} />
                    <i className="block w-full bg-[var(--good)]" style={{ height: `${c / maxH * 100}%` }} />
                  </span>
                  <span className="num text-[10.5px] text-ink-3">{h.hour.slice(0, 2)}h</span>
                </button>
              );
            })}
          </div>
          <p className="flex gap-3 text-[11px] text-ink-3"><span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-[var(--good)]" />Đã chốt</span><span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-[var(--warn)]" />Chưa chốt (Mới / Chờ XN)</span></p>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <TableWrap minWidth={520} maxHeight="30rem" stickyFirst>
              <table className="tbl">
                <thead><tr><th className="text-left">Nhân viên</th><th>Đơn nhận</th><th>Đã chốt</th><th>Chưa chốt</th><th>% đã chốt</th><th>Doanh thu đã chốt</th></tr></thead>
                <tbody>
                  {data.staff.map((s) => (
                    <tr key={s.sellerId || 'none'}>
                      <td className="text-left font-medium text-ink">{s.name}</td>
                      <td className="n">{num(s.closed + s.open, { sellerId: s.sellerId, state: null, hour: null, label: `${s.sellerId}:all` })}</td>
                      <td className="n">{num(s.closed, { sellerId: s.sellerId, state: 'closed', hour: null, label: `${s.sellerId}:closed` }, 'text-good')}</td>
                      <td className="n">{num(s.open, { sellerId: s.sellerId, state: 'open', hour: null, label: `${s.sellerId}:open` }, s.open ? 'text-warn' : '')}</td>
                      <td className="n">{pct(s.rate, 0)}</td>
                      <td className="n">{shortMoney(s.closedNet)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td className="font-semibold">Tổng</td>
                  <td className="n font-semibold">{num(all, { sellerId: null, state: null, hour: null, label: 'all' })}</td>
                  <td className="n font-semibold">{num(data.total.closed, { sellerId: null, state: 'closed', hour: null, label: 'all:closed' })}</td>
                  <td className="n font-semibold">{num(data.total.open, { sellerId: null, state: 'open', hour: null, label: 'all:open' })}</td>
                  <td className="n font-semibold">{pct(all ? data.total.closed / all * 100 : null, 0)}</td><td /></tr></tfoot>
              </table>
            </TableWrap>
            <div className="rounded-xl border border-line p-3">
              <p className="text-sm font-semibold text-ink">{pick ? `${list.length} đơn` : 'Danh sách đơn'}</p>
              <p className="mb-2 text-xs text-ink-3">{pick ? [pick.sellerId !== null ? data.staff.find((s) => s.sellerId === pick.sellerId)?.name : 'Mọi nhân viên', pick.state === 'closed' ? 'đã chốt' : pick.state === 'open' ? 'chưa chốt' : 'tất cả', pick.hour ? `nhận lúc ${pick.hour}` : ''].filter(Boolean).join(' · ') : 'Bấm một con số hoặc một cột giờ để xem đơn.'}</p>
              {pick && (
                <ul className="m-0 max-h-[26rem] list-none space-y-1.5 overflow-y-auto p-0">
                  {list.map((o) => (
                    <li key={o.id} className="rounded-lg bg-surface-2 p-2.5 text-xs">
                      <div className="flex items-center gap-2"><b className="num text-ink">#{o.orderId}</b><StatusChip tone={o.state === 'closed' ? 'green' : 'orange'}>{o.statusName}</StatusChip><span className="num ml-auto text-ink">{money(o.net)}</span></div>
                      <div className="mt-1 flex items-center gap-1.5 text-ink-3"><PosBadge posId={o.posId} size={14} />{o.posName} · {[o.customer, o.phone].filter(Boolean).join(' · ')}<span className="num ml-auto">nhận {timeOnly(o.assignedAt)}</span></div>
                    </li>
                  ))}
                  {list.length >= 3000 && <li className="text-center text-[11px] text-ink-3">Hiện tối đa 3.000 đơn</li>}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
