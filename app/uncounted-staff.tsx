'use client';

// Một dòng ở Tổng quan POS: kỳ này bao nhiêu người không có hậu tố MKT / CSKH / SALE trong tên Pancake mà có đơn (không vào doanh số),
// bấm mở trang báo cáo riêng "Doanh thu ngoài hậu tố" (uncounted-view.tsx) để xem từng người, từng POS và ghi nguyên nhân.
import { ArrowRight, UserX } from 'lucide-react';
import { useApi } from './use-api';
import { money, vi } from './ui-kit';

type Data = { sellers: { id: string; orders: number; net: number }[]; marketers: { id: string }[] };

export function UncountedStaff({ start, end, posIds, onOpen }: { start: string; end: string; posIds: string[]; onOpen?: () => void }) {
  const params = new URLSearchParams({ start, end, posIds: posIds.join(',') });
  const { data } = useApi<Data>(`/api/reports/uncounted?${params}`, { refreshMs: 10 * 60000, keep: false });
  if (!data) return null;
  const people = new Set([...data.sellers, ...data.marketers].map((p) => p.id)).size;
  if (!people) return null;
  const orders = data.sellers.reduce((a, p) => a + p.orders, 0), net = data.sellers.reduce((a, p) => a + p.net, 0);
  const body = <>
    <UserX size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
    <span className="font-semibold text-ink">Không tính doanh số: {vi.format(people)} người</span>
    {orders > 0 && <span className="num text-ink-2">· người bán {vi.format(orders)} đơn chốt, {money(net)}</span>}
    <span className="text-ink-3">· tên trên Pancake không có hậu tố MKT, CSKH, SALE</span>
    {onOpen && <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">Xem báo cáo<ArrowRight size={13} aria-hidden="true" /></span>}
  </>;
  const cls = 'card flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left text-[12.5px]';
  return onOpen
    ? <button type="button" className={`${cls} cursor-pointer hover:bg-surface-2`} onClick={onOpen}>{body}</button>
    : <section className={cls} aria-label="Người không tính doanh số">{body}</section>;
}
