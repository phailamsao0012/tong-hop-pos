'use client';

// Đơn khách đã nhận theo sản phẩm, từng ngày (anh Vũ 31/10/2026). Logic ở lib/delivered-products.ts.
import { useMemo } from 'react';
import { PackageCheck } from 'lucide-react';
import type { DeliveredProductsReport } from '@/lib/delivered-products';
import { useApi } from './use-api';
import { ChartCard, EmptyState, ErrorBox, SkeletonTable, TableWrap, dmy, shortMoney, vi } from './ui-kit';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const weekday = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()];

export function DeliveredProductsBlock({ start, end, posIds }: { start: string; end: string; posIds: string[] }) {
  const url = useMemo(() => `/api/reports/delivered-products?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data: r, loading, error, reload } = useApi<DeliveredProductsReport>(url);
  const max = Math.max(1, ...(r?.days ?? []).map((d) => d.orders));
  return (
    <ChartCard icon={PackageCheck} title="Đơn khách đã nhận · từng ngày theo sản phẩm"
      subtitle={r ? `${vi.format(r.total.orders)} đơn · ${shortMoney(r.total.net)} · gộp ${posIds.length} POS đang chọn` : 'Xếp theo ngày khách nhận hàng'}
      info={r?.definition} loading={loading && !!r}>
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <SkeletonTable rows={6} cols={7} />}
      {r && (r.total.orders ? (
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
      ) : <EmptyState text="Chưa có đơn khách nhận trong kỳ." />)}
    </ChartCard>
  );
}
