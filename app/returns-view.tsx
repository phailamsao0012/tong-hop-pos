'use client';
// Lý do hoàn: kiểu giống các trang khác (anh Vũ 21/10/2026 "trang này lỗi hả": bảng trơn, ô thả xuống, thanh dài kín màn).
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { ReturnsReport } from '@/lib/reports/return-reasons';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { Th, EmptyState, ErrorBox, KpiCard, PageHeader, SegmentedControl, Skeleton, SkeletonKpis, TableWrap, dmy, money, posName, shortMoney, vi } from './ui-kit';
import { KPI_TIGHT, PageHeadMoi, WhySheet, tileGrid, type WhySpec } from './trang-moi';

type Dim = 'reasons' | 'byPos' | 'bySeller' | 'byProduct';
const DIMS: { value: Dim; label: string }[] = [{ value: 'reasons', label: 'Lý do' }, { value: 'byPos', label: 'POS' }, { value: 'bySeller', label: 'Người lên đơn' }, { value: 'byProduct', label: 'Sản phẩm chính' }];

export function ReturnsView({ onOpen, uiMoi = false }: { onOpen: () => void; /** Cờ THP_UI_MOI: bật thì bố cục kiểu mới, tắt thì y như cũ. */ uiMoi?: boolean }) {
  // Giao diện mới: khung "Vì sao ra số này" đang mở (null = đóng).
  const [why, setWhy] = useState<WhySpec | null>(null);
  const period = usePeriod(), { start, end } = period, [posIds, setPosIds] = usePosIds(), team = useTeam();
  const [dimension, setDimension] = useState<Dim>('reasons');
  const { data, loading, error, reload } = useApi<ReturnsReport>('/api/reports/returns?' + new URLSearchParams({ start, end, posIds: posIds.join(','), team }), { keep: false });
  const rows = data ? data[dimension] : [];
  const top = Math.max(1, ...rows.map((r) => r.orders));
  const totalNet = data ? data.reasons.reduce((s, r) => s + r.net, 0) : 0;
  const label = (l: string) => dimension === 'byPos' ? posName(l) : l;
  // [khối chung] Các khối dùng chung cho bố cục cũ và bố cục kiểu mới (cờ THP_UI_MOI): cùng JSX, chỉ chỗ đặt khác nhau.
  // fold: chỉ bố cục mới truyền (thu gọn thẻ); bố cục cũ không truyền nên thẻ y như trước.
  const tableCard = (/*{}*/) => (
    data && <section className="card flex flex-col gap-4 p-4">
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
        <thead><tr><Th className="text-left">{DIMS.find((d) => d.value === dimension)!.label}</Th><Th className="n">Số đơn</Th><Th className="text-left">Tỉ lệ</Th><Th className="n">Tiền hàng</Th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}>
          <td className="min-w-40 text-left">{dimension === 'reasons'
            ? <button type="button" aria-label={row.label} className="text-left font-semibold text-ink hover:text-primary hover:underline tap" title="Mở Đơn nguồn ở nhóm Hoàn" onClick={onOpen}>{row.label}</button>
            : <span className="font-semibold">{label(row.label)}</span>}</td>
          <td className="n font-semibold">{vi.format(row.orders)}</td>
          <td className="w-[40%] text-left" aria-label={`${row.rate.toFixed(1).replace('.', ',')}%`}><span className="flex items-center gap-2"><span aria-hidden="true" className="block h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><i className="block h-full rounded-full bg-t-orange" style={{ width: `${row.orders / top * 100}%` }} /></span><span className="num w-12 text-right text-ink-2">{row.rate.toFixed(1).replace('.', ',')}%</span></span></td>
          <td className="n">{money(row.net)}</td>
        </tr>)}</tbody>
      </table></TableWrap>}
      {dimension === 'reasons' && data.total > 0 && <p className="text-[11.5px] text-ink-3">Bấm lý do để mở danh sách đơn hoàn.</p>}
    </section>
  );
  // [hết khối chung]

  // ===== Bố cục kiểu mới (cờ THP_UI_MOI; plan "giao diện mới cả trang trong" 27/11/2026). Cờ tắt thì nhánh này không chạy. =====
  // Trên xuống: đầu trang (PageHeadMoi) → một hàng 3 ô số (bấm mở "Vì sao ra số này") → bảng chính (lý do / POS / người lên đơn / sản phẩm).
  // Trang chỉ có số đơn hoàn (không có mẫu số theo POS / người) nên không có dải "Cần xem" theo mốc hoàn 7%.
  if (uiMoi) {
    const scope = `${dmy(start)} – ${dmy(end)} · ${posIds.length <= 3 ? posIds.map(posName).join(', ') : `${vi.format(posIds.length)} POS`} · theo ngày hoàn, lý do từ Pancake · lọc ngày tạo mở rộng 60 ngày trước kỳ`;
    const topReason = data?.reasons[0];
    const listRows = (list: ReturnsReport['reasons'], name: (l: string) => string = (l) => l) => list.slice(0, 12).map((x) => ({ label: name(x.label), value: `${vi.format(x.orders)} đơn · ${x.rate.toFixed(1).replace('.', ',')}% · ${shortMoney(x.net)}` }));
    return <section className="min-w-0 space-y-4" aria-label="Lý do hoàn">
      <PageHeadMoi title="Lý do hoàn" scope={scope} hint="Đơn hoàn trong kỳ theo ngày hoàn, lý do lấy từ Pancake."
        tools={<PeriodToolbar preset={period.preset} start={start} end={end} onPreset={period.setPreset} onStart={period.setStart} onEnd={period.setEnd} />}
        pos={<PosChips posIds={posIds} onChange={setPosIds} />} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <SkeletonKpis count={3} className="sm:grid-cols-3" />}
      {data && <div className={tileGrid(3)}>
        <KpiCard icon={Undo2} tone="orange" label="Đơn hoàn trong kỳ" className={KPI_TIGHT} value={vi.format(data.total)} unit="đơn" note={`theo ngày hoàn · ${shortMoney(totalNet)}`}
          onClick={() => setWhy({ title: 'Đơn hoàn trong kỳ', value: `${vi.format(data.total)} đơn`, scope, rows: listRows(data.byPos, posName), definition: 'Đơn chuyển sang hoàn trong kỳ (theo ngày hoàn), đơn tạo từ 60 ngày trước kỳ trở đi; chia theo POS.' })} />
        <KpiCard icon={Undo2} tone="red" label="Tiền hàng đơn hoàn" className={KPI_TIGHT} value={shortMoney(totalNet)} note="cộng tiền hàng các đơn hoàn"
          onClick={() => setWhy({ title: 'Tiền hàng đơn hoàn', value: money(totalNet), scope, rows: listRows(data.byProduct), definition: 'Cộng tiền hàng các đơn hoàn trong kỳ; chia theo sản phẩm chính của đơn.' })} />
        <KpiCard icon={Undo2} tone="gray" label="Lý do nhiều nhất" className={KPI_TIGHT} value={topReason ? topReason.label : '—'} note={topReason ? `${vi.format(topReason.orders)} đơn · ${topReason.rate.toFixed(1).replace('.', ',')}% đơn hoàn` : 'Không có đơn hoàn'}
          onClick={() => setWhy({ title: 'Lý do hoàn', value: topReason ? topReason.label : '—', scope, rows: listRows(data.reasons), definition: 'Lý do hoàn ghi trên Pancake; tỉ lệ = số đơn của lý do ÷ tổng đơn hoàn trong kỳ.' })} />
      </div>}
      {tableCard()}
      <WhySheet spec={why} onClose={() => setWhy(null)} />
    </section>;
  }

  return <section className="space-y-4" aria-label="Lý do hoàn">
    <PageHeader title="Lý do hoàn" subtitle="Đơn hoàn trong kỳ theo ngày hoàn, lý do lấy từ Pancake. Lọc ngày tạo mở rộng 60 ngày trước kỳ." />
    <PeriodToolbar preset={period.preset} start={start} end={end} onPreset={period.setPreset} onStart={period.setStart} onEnd={period.setEnd} />
    <PosChips posIds={posIds} onChange={setPosIds} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {loading && !data && <Skeleton className="h-64 w-full" />}
    {tableCard()}
  </section>;
}
