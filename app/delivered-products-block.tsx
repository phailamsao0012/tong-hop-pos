'use client';

// Đơn khách đã nhận theo sản phẩm, từng ngày (anh Vũ 31/10/2026). Logic ở lib/delivered-products.ts.
// Hai cách xem: theo ngày khách nhận; giao trên chốt theo ngày chốt (anh 31/10: "cho xem được số đơn giao trên số đơn chốt nữa").
import { useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import type { ClosedDeliveredReport, DeliveredProductsReport, Pair } from '@/lib/reports/delivered-products';
import { useApi } from './use-api';
import { ChartCard, EmptyState, ErrorBox, SegmentedControl, SkeletonTable, TableWrap, dmy, shortMoney, vi } from './ui-kit';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const weekday = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()];
type Basis = 'delivered' | 'closed';
const BASES: [Basis, string][] = [['delivered', 'Theo ngày nhận'], ['closed', 'Giao / chốt']];

export function DeliveredProductsBlock({ start, end, posIds }: { start: string; end: string; posIds: string[] }) {
  const [basis, setBasis] = useState<Basis>('delivered');
  const url = useMemo(() => `/api/reports/delivered-products?${new URLSearchParams({ start, end, posIds: posIds.join(','), ...(basis === 'closed' ? { basis } : {}) })}`, [start, end, posIds, basis]);
  const { data, loading, error, reload } = useApi<DeliveredProductsReport | ClosedDeliveredReport>(url);
  const seg = <SegmentedControl size="sm" ariaLabel="Cách xem" value={basis} onChange={setBasis} options={BASES.map(([value, label]) => ({ value, label }))} />;
  const closed = basis === 'closed' && data && 'other' in data ? data as ClosedDeliveredReport : null;
  const delivered = basis === 'delivered' && data && !('other' in data) ? data as DeliveredProductsReport : null;
  const ready = closed ?? delivered;
  const subtitle = closed ? `Đã giao ${vi.format(closed.total.delivered)} / chốt ${vi.format(closed.total.closed)} đơn · ${rate(closed.total)} · theo ngày chốt, gộp ${posIds.length} POS`
    : delivered ? `${vi.format(delivered.total.orders)} đơn · ${shortMoney(delivered.total.net)} · gộp ${posIds.length} POS đang chọn` : 'Xếp theo ngày khách nhận hàng';
  return (
    <ChartCard icon={PackageCheck} title="Đơn khách đã nhận · từng ngày theo sản phẩm" subtitle={subtitle} info={ready?.definition} loading={loading && !!ready} action={seg}>
      {error && !ready && <ErrorBox error={error} onRetry={reload} />}
      {!ready && !error && <SkeletonTable rows={6} cols={7} />}
      {delivered && <DeliveredTable r={delivered} />}
      {closed && <ClosedTable r={closed} />}
    </ChartCard>
  );
}

const rate = (p: Pair) => p.closed ? `${Math.round(p.delivered / p.closed * 100)}%` : '—';
const tone = (p: Pair) => !p.closed ? 'text-ink-4' : p.delivered / p.closed >= 0.8 ? 'text-good' : p.delivered / p.closed >= 0.6 ? 'text-warn' : 'text-bad';

function PairCell({ p, strong }: { p: Pair; strong?: boolean }) {
  if (!p.closed) return <td className="n text-ink-4">0</td>;
  return (
    <td className="n whitespace-nowrap" title={`Khách đã nhận ${vi.format(p.delivered)} / chốt ${vi.format(p.closed)} đơn`}>
      <span className={`num block ${strong ? 'font-semibold' : ''}`}>{vi.format(p.delivered)}<span className="text-ink-3">/{vi.format(p.closed)}</span></span>
      <span className={`block text-[11px] leading-tight ${tone(p)}`}>{rate(p)}</span>
    </td>
  );
}

function ClosedTable({ r }: { r: ClosedDeliveredReport }) {
  if (!r.total.closed) return <EmptyState text="Chưa có đơn chốt trong kỳ." />;
  return (
    <TableWrap minWidth={0} maxHeight="30rem">
      <table className="tbl">
        <thead><tr>
          <th className="text-left">Ngày chốt</th>
          <th title="Đơn khách đã nhận / đơn chốt trong ngày">Tổng</th>
          {r.top.map((n) => <th key={n} className="max-w-[9rem]" title={n}><span className="line-clamp-2 normal-case">{n}</span></th>)}
          <th title={`${vi.format(Math.max(0, r.products.length - r.top.length))} sản phẩm còn lại`}>SP khác</th>
        </tr></thead>
        <tbody>{r.days.map((d) => (
          <tr key={d.day}>
            <td className="text-left whitespace-nowrap"><span className="text-ink-3">{weekday(d.day)}</span> {dmy(d.day)}</td>
            <PairCell p={d.total} strong />
            {r.top.map((n) => <PairCell key={n} p={d.cells[n]} />)}
            <PairCell p={d.other} />
          </tr>
        ))}</tbody>
        <tfoot><tr>
          <td className="text-left">Cả kỳ</td>
          <PairCell p={r.total} strong />
          {r.top.map((n) => { const p = r.products.find((x) => x.name === n); return <PairCell key={n} p={{ closed: p?.closed ?? 0, delivered: p?.delivered ?? 0 }} />; })}
          <PairCell p={r.other} />
        </tr></tfoot>
      </table>
    </TableWrap>
  );
}

function DeliveredTable({ r }: { r: DeliveredProductsReport }) {
  if (!r.total.orders) return <EmptyState text="Chưa có đơn khách nhận trong kỳ." />;
  const max = Math.max(1, ...r.days.map((d) => d.orders));
  return (
    <TableWrap minWidth={0} maxHeight="30rem">
      <table className="tbl">
        <thead><tr>
          <th className="text-left">Ngày nhận</th>
          <th title="Số đơn khách đã nhận trong ngày (một đơn đếm một lần)">Tổng đơn</th>
          {r.top.map((n) => <th key={n} className="max-w-[9rem]" title={n}><span className="line-clamp-2 normal-case">{n}</span></th>)}
          <th title={`${vi.format(Math.max(0, r.products.length - r.top.length))} sản phẩm còn lại`}>SP khác</th>
        </tr></thead>
        <tbody>{r.days.map((d) => (
          <tr key={d.day}>
            <td className="text-left whitespace-nowrap"><span className="text-ink-3">{weekday(d.day)}</span> {dmy(d.day)}</td>
            <td className="n" aria-label={`${vi.format(d.orders)} đơn, ${shortMoney(d.net)}`}>
              <span className="flex items-center justify-end gap-2">
                <span aria-hidden="true" className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-2 sm:block"><i className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${d.orders / max * 100}%` }} /></span>
                <b className="num">{vi.format(d.orders)}</b>
              </span>
            </td>
            {r.top.map((n) => <td key={n} className={`n ${d.cells[n] ? '' : 'text-ink-4'}`}>{vi.format(d.cells[n] ?? 0)}</td>)}
            <td className={`n ${d.other ? '' : 'text-ink-4'}`}>{vi.format(d.other)}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr>
          <td className="text-left">Cả kỳ</td>
          <td className="n">{vi.format(r.total.orders)}</td>
          {r.top.map((n) => <td key={n} className="n">{vi.format(r.products.find((p) => p.name === n)?.orders ?? 0)}</td>)}
          <td className="n">{vi.format(r.products.slice(r.top.length).reduce((t, p) => t + p.orders, 0))}</td>
        </tr></tfoot>
      </table>
    </TableWrap>
  );
}
