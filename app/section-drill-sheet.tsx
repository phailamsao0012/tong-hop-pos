'use client';

// Bấm một số ở 4 bảng Tổng quan POS (anh Vũ 08/10/2026): ngăn kéo bên phải hiện danh sách đơn tạo ra số đó, cách tính và nguồn,
// cùng kỳ, POS và nhóm đơn đang lọc. Dữ liệu: /api/reports/sections/orders (lib/section-drill.ts).
import { useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { DrillKey } from '@/lib/section-drill';
import { PRODUCT_SEGMENTS, type ProductSegment } from '@/lib/order-segments';
import { useApi } from './use-api';
import { EmptyState, ErrorBox, SkeletonTable, TableWrap, dmy, dt, money, pct, posName, vi } from './ui-kit';

type DrillRow = {
  id: string; code: string; pancakeUrl: string | null; posId: string; customer: string | null; createdAt: string | null; closedAt: string | null;
  confirmedAt: string | null; status: string; seller: string | null; marketer: string | null; net: number; hit: boolean;
};
type DrillReport = {
  title: string; formula: string[]; source: string; view: { id: string; label: string }; dateCol: 'first_closed_at' | 'created_at' | 'first_confirmed_at';
  hasHit: boolean; hitLabel: string | null; period: { start: string; end: string }; productSegment: ProductSegment;
  total: { orders: number; net: number; hits: number; hitNet: number }; page: number; pages: number; rows: DrillRow[];
};
const DATE_LABEL = { first_closed_at: 'Ngày chốt', created_at: 'Ngày tạo', first_confirmed_at: 'Ngày XN' } as const;
const dateOf = (r: DrillRow, col: DrillReport['dateCol']) => col === 'first_closed_at' ? r.closedAt : col === 'created_at' ? r.createdAt : r.confirmedAt;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-3 py-2">
      <p className="truncate text-[11px] font-medium text-ink-3">{label}</p>
      <p className="num truncate text-base font-semibold leading-tight text-ink">{value}</p>
      {note && <p className="truncate text-[11px] text-ink-3">{note}</p>}
    </div>
  );
}

export function SectionDrillSheet({ drill, onClose, start, end, posIds, productSegment, onNavigate }: {
  drill: DrillKey | null; onClose: () => void; start: string; end: string; posIds: string[]; productSegment: ProductSegment; onNavigate?: (view: string) => void;
}) {
  // Trang về 1 khi đổi số được bấm hoặc bộ lọc.
  const query = `${drill}|${start}|${end}|${posIds.join(',')}|${productSegment}`;
  const [paging, setPaging] = useState({ query, page: 1 });
  const page = paging.query === query ? paging.page : 1;
  const setPage = (p: number) => setPaging({ query, page: p });
  const url = drill ? `/api/reports/sections/orders?${new URLSearchParams({ metric: drill, start, end, posIds: posIds.join(','), productSegment, page: String(page) })}` : null;
  const { data, error, reload } = useApi<DrillReport>(url, { keep: false });
  const d = data && url ? data : null;
  const t = d?.total;
  return (
    <Sheet open={!!drill} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
        <SheetHeader className="border-b border-line pr-12">
          <SheetTitle>{d?.title ?? 'Đang tải…'}</SheetTitle>
          <SheetDescription>
            {dmy(start)}{start !== end && `–${dmy(end)}`} · {posIds.length && posIds.length <= 2 ? posIds.map(posName).join(', ') : `${posIds.length || 'Tất cả'} POS`}
            {productSegment !== 'all' && ` · ${PRODUCT_SEGMENTS[productSegment]}`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && !d ? <ErrorBox error={error} onRetry={reload} /> : !d || !t ? <SkeletonTable rows={8} cols={6} /> : <>
            <div className={`grid gap-2 ${d.hasHit ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
              <Stat label="Số đơn" value={vi.format(t.orders)} />
              <Stat label="Tiền hàng" value={money(t.net)} note="sau giảm giá, chưa gồm ship" />
              {d.hasHit ? <>
                <Stat label={d.hitLabel ?? 'Đạt'} value={vi.format(t.hits)} note={money(t.hitNet)} />
                <Stat label={`Tỷ lệ ${(d.hitLabel ?? 'đạt').toLowerCase()}`} value={pct(t.orders ? t.hits / t.orders * 100 : null)} note={`${vi.format(t.hits)} ÷ ${vi.format(t.orders)} đơn`} />
              </> : <Stat label="AOV" value={t.orders ? money(t.net / t.orders) : '—'} note="tiền hàng ÷ số đơn" />}
            </div>

            <section className="rounded-lg border border-line p-3 text-[12.5px] leading-relaxed">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-ink-3">Cách tính</h3>
              <ul className="list-disc space-y-0.5 pl-4 text-ink-2">{d.formula.map((f) => <li key={f}>{f}</li>)}</ul>
              <h3 className="mt-2 mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-ink-3">Lấy từ</h3>
              <p className="text-ink-2">{d.source}</p>
            </section>

            {d.rows.length === 0 ? <EmptyState text="Không có đơn nào trong kỳ này." /> : <>
              <TableWrap minWidth={720} sticky>
                <table className="tbl w-full text-[12px]">
                  <thead><tr>
                    <th className="text-left">Mã đơn</th><th className="text-left">{DATE_LABEL[d.dateCol]}</th><th className="text-left">Khách</th>
                    <th className="text-left">NV bán</th><th className="text-left">Marketer</th><th className="text-left">Trạng thái</th><th className="n">Tiền hàng</th>
                    {d.hasHit && <th className="text-center">{d.hitLabel}</th>}<th className="text-left">POS</th>
                  </tr></thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="text-left font-medium">{r.pancakeUrl
                          ? <a className="link inline-flex items-center gap-1" href={r.pancakeUrl} target="_blank" rel="noreferrer">{r.code}<ExternalLink size={10} aria-hidden="true" /></a>
                          : r.code}</td>
                        <td className="text-left whitespace-nowrap">{dt(dateOf(r, d.dateCol), true)}</td>
                        <td className="max-w-[140px] truncate text-left">{r.customer ?? '—'}</td>
                        <td className="max-w-[120px] truncate text-left">{r.seller ?? '—'}</td>
                        <td className="max-w-[120px] truncate text-left">{r.marketer ?? '—'}</td>
                        <td className="text-left">{r.status}</td>
                        <td className="n">{money(r.net)}</td>
                        {d.hasHit && <td className="text-center">{r.hit ? <Check size={13} className="inline text-t-green" aria-label="Có" /> : <span className="text-ink-4">·</span>}</td>}
                        <td className="max-w-[130px] truncate text-left text-ink-3">{posName(r.posId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {d.pages > 1 && (
                <div className="flex items-center justify-end gap-2 text-[12px] text-ink-3">
                  <button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={12} />Trước</button>
                  <span className="num">Trang {page}/{d.pages}</span>
                  <button type="button" className="btn sm" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Sau<ChevronRight size={12} /></button>
                </div>
              )}
            </>}
          </>}
        </div>
        {d && onNavigate && (
          <div className="flex justify-end border-t border-line p-3">
            <button type="button" className="btn sm" onClick={() => { onClose(); onNavigate(d.view.id); }}>Mở trang {d.view.label}<ArrowRight size={12} /></button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
