'use client';
import { useState } from 'react';
import type { ReturnsReport } from '@/lib/return-reasons';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { EmptyState, ErrorBox, TableWrap, money, posName, vi } from './ui-kit';
export function ReturnsView({ onOpen }: { onOpen: () => void }) {
  const period = usePeriod(), { start,end } = period, [posIds,setPosIds] = usePosIds(), team = useTeam();
  const [dimension,setDimension] = useState<'reasons'|'byPos'|'bySeller'|'byProduct'>('reasons');
  const {data,loading,error,reload} = useApi<ReturnsReport>('/api/reports/returns?'+new URLSearchParams({start,end,posIds:posIds.join(','),team}),{keep:false});
  return <section className="space-y-4" aria-label="Lý do hoàn">
    <h1 className="text-xl font-semibold">Lý do hoàn</h1>
    <p className="text-sm text-ink-3">Đơn hoàn trong kỳ theo ngày hoàn, lý do lấy từ Pancake</p>
    <PeriodToolbar preset={period.preset} start={start} end={end} onPreset={period.setPreset} onStart={period.setStart} onEnd={period.setEnd} /><PosChips posIds={posIds} onChange={setPosIds} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {loading && <output>Đang tải…</output>}
    {data && <>
      {data.limited && <output className="notice">Đã giới hạn 5.000 đơn hoàn mới nhất trong kỳ.</output>}
      <p>{vi.format(data.total)} đơn · Lọc ngày tạo mở rộng 60 ngày trước kỳ.</p>
      {!data.total ? <EmptyState text="Không có đơn hoàn trong kỳ" /> : <>
        <div className="card space-y-3" aria-label="Biểu đồ lý do hoàn">
          {data.reasons.map(row => <button key={row.label} aria-label={row.label} type="button" className="block w-full text-left" onClick={onOpen}>
            <span className="flex justify-between gap-3 text-sm"><span className="break-words">{row.label}</span><span>{vi.format(row.orders)}</span></span>
            <span className="mt-1 block h-3 rounded bg-surface-2"><span className="block h-3 rounded bg-primary" style={{width: (row.orders/Math.max(1,...data.reasons.map(r=>r.orders))*100)+'%'}} /></span>
          </button>)}
        </div>
        <label className="flex flex-wrap items-center gap-2">Nhóm theo <select value={dimension} onChange={e=>setDimension(e.target.value as typeof dimension)}>
          <option value="reasons">Lý do</option><option value="byPos">POS</option><option value="bySeller">Người lên đơn</option><option value="byProduct">Sản phẩm chính</option>
        </select></label>
        <TableWrap><table className="w-full"><thead><tr><th>Nhóm</th><th>Số đơn</th><th>Tỉ lệ</th><th>Tiền hàng</th></tr></thead><tbody>
          {data[dimension].map(row=><tr key={row.label}><td>{dimension==='reasons' ? <button type="button" className="text-primary underline" onClick={onOpen}>{row.label}</button> : dimension==='byPos' ? posName(row.label) : row.label}</td><td>{vi.format(row.orders)}</td><td>{row.rate.toFixed(1)}%</td><td>{money(row.net)}</td></tr>)}
        </tbody></table></TableWrap>
        <p className="text-xs text-ink-3">Bấm lý do để mở Đơn nguồn ở nhóm Hoàn. Trang đích hiện lọc theo ngày tạo; chưa hỗ trợ lọc ngày hoàn hoặc riêng lý do.</p>
      </>}
    </>}
  </section>;
}
