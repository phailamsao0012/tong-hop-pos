'use client';
// Lý do hoàn: kiểu giống các trang khác (anh Vũ 21/10/2026 "trang này lỗi hả": bảng trơn, ô thả xuống, thanh dài kín màn).
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { ReturnsReport } from '@/lib/return-reasons';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { EmptyState, ErrorBox, PageHeader, SegmentedControl, Skeleton, TableWrap, money, posName, shortMoney, vi } from './ui-kit';

type Dim = 'reasons' | 'byPos' | 'bySeller' | 'byProduct';
const DIMS: { value: Dim; label: string }[] = [{ value: 'reasons', label: 'Lý do' }, { value: 'byPos', label: 'POS' }, { value: 'bySeller', label: 'Người lên đơn' }, { value: 'byProduct', label: 'Sản phẩm chính' }];

export function ReturnsView({ onOpen }: { onOpen: () => void }) {
  const period = usePeriod(), { start, end } = period, [posIds, setPosIds] = usePosIds(), team = useTeam();
  const [dimension, setDimension] = useState<Dim>('reasons');
  const { data, loading, error, reload } = useApi<ReturnsReport>('/api/reports/returns?' + new URLSearchParams({ start, end, posIds: posIds.join(','), team }), { keep: false });
  const rows = data ? data[dimension] : [];
  const top = Math.max(1, ...rows.map((r) => r.orders));
  const totalNet = data ? data.reasons.reduce((s, r) => s + r.net, 0) : 0;
  const label = (l: string) => dimension === 'byPos' ? posName(l) : l;
  return <section className="space-y-4" aria-label="Lý do hoàn">
    <PageHeader title="Lý do hoàn" subtitle="Đơn hoàn trong kỳ theo ngày hoàn, lý do lấy từ Pancake. Lọc ngày tạo mở rộng 60 ngày trước kỳ." />
    <PeriodToolbar preset={period.preset} start={start} end={end} onPreset={period.setPreset} onStart={period.setStart} onEnd={period.setEnd} />
    <PosChips posIds={posIds} onChange={setPosIds} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {loading && !data && <Skeleton className="h-64 w-full" />}
    {data && <section className="card flex flex-col gap-4 p-4">
      {data.limited && <output className="notice">Đã giới hạn 5.000 đơn hoàn mới nhất trong kỳ.</output>}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="grid size-8 place-items-center self-center rounded-lg bg-t-orange-bg text-t-orange"><Undo2 size={16} aria-hidden="true" /></span>
          <span className="num text-2xl font-semibold tracking-[-.02em] text-ink">{vi.format(data.total)} <span className="text-sm font-medium text-ink-3">đơn hoàn</span></span>
          <span className="num text-sm text-ink-2">{shortMoney(totalNet)}</span>
        </div>
        <SegmentedControl<Dim> size="sm" ariaLabel="Nhóm theo" value={dimension} onChange={setDimension} options={DIMS} />
      </header>
      {!data.total ? <EmptyState text="Không có đơn hoàn trong kỳ" /> : <TableWrap><table className="tbl">
        <thead><tr><th className="text-left">{DIMS.find((d) => d.value === dimension)!.label}</th><th className="n">Số đơn</th><th className="text-left">Tỉ lệ</th><th className="n">Tiền hàng</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}>
          <td className="min-w-40 text-left">{dimension === 'reasons'
            ? <button type="button" aria-label={row.label} className="text-left font-semibold text-ink hover:text-primary hover:underline" title="Mở Đơn nguồn ở nhóm Hoàn" onClick={onOpen}>{row.label}</button>
            : <span className="font-semibold">{label(row.label)}</span>}</td>
          <td className="n font-semibold">{vi.format(row.orders)}</td>
          <td className="w-[40%] text-left" aria-label={`${row.rate.toFixed(1)}%`}><span className="flex items-center gap-2"><span aria-hidden="true" className="block h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><i className="block h-full rounded-full bg-t-orange" style={{ width: `${row.orders / top * 100}%` }} /></span><span className="num w-12 text-right text-ink-2">{row.rate.toFixed(1).replace('.', ',')}%</span></span></td>
          <td className="n">{money(row.net)}</td>
        </tr>)}</tbody>
      </table></TableWrap>}
      {dimension === 'reasons' && data.total > 0 && <p className="text-[11.5px] text-ink-3">Bấm lý do để mở danh sách đơn hoàn.</p>}
    </section>}
  </section>;
}
