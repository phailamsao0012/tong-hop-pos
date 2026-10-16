'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { CustomerTimelineDetail } from '@/lib/customer-timeline';
import { dt, money, vi } from './ui-kit';

export function CustomerDetail({ customer, onClose }: { customer: { phone: string; posIds: string[] } | { customerId: string } | null; onClose: () => void }) {
  const [data, setData] = useState<CustomerTimelineDetail | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const history = useRef<HTMLHeadingElement>(null);
  const query = customer ? new URLSearchParams('customerId' in customer ? { customerId: customer.customerId } : { phone: customer.phone, posIds: customer.posIds.join(',') }).toString() : '';
  useEffect(() => {
    setData(null); setError('');
    if (!query) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/reports/customer-detail?' + query, { cache: 'no-store', signal: ctrl.signal });
        const body = await response.json() as CustomerTimelineDetail & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Không tải được chi tiết khách.');
        if (!ctrl.signal.aborted) setData(body);
      } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được chi tiết khách.'); }
    })();
    return () => ctrl.abort();
  }, [query, retry]);
  return <Sheet open={!!customer} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:max-w-full data-[side=right]:sm:max-w-2xl">
      <SheetHeader className="pr-12"><SheetTitle>{data?.name ?? 'Chi tiết khách hàng'}</SheetTitle><SheetDescription>{data?.phone ?? 'Số liệu trọn đời và dòng lịch sử khách'}</SheetDescription></SheetHeader>
      <div className="space-y-4 px-4 pb-6" aria-live="polite">
        {error ? <div role="alert"><p>{error}</p><button className="btn sm" onClick={() => setRetry((n) => n + 1)}>Thử lại</button></div> : !data ? <p>Đang tải hồ sơ khách…</p> : <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {([['Đơn', data.stats.orders], ['Thành công', data.stats.success], ['Hoàn', data.stats.returned], ['Huỷ', data.stats.cancelled], ['Tổng tiền', money(data.stats.net)]] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-surface-2 p-3"><span className="block text-xs text-ink-3">{label}</span><strong className="num text-lg font-semibold">{typeof value === 'number' ? vi.format(value) : value}</strong></div>)}
            <button type="button" className="rounded-xl border border-line bg-surface-2 p-3 text-left" onClick={() => history.current?.scrollIntoView({ block: 'start' })}><span className="block text-xs text-ink-3">Ghi chú</span><strong className="num text-lg font-semibold">{vi.format(data.notes)}</strong></button>
          </div>
          <p className="text-xs text-ink-3">Tổng tiền mua thành công trọn đời trong phạm vi cửa hàng và bộ phận đang xem. Chưa hỗ trợ mở Đơn nguồn theo SĐT từ khung này.</p>
          <h3 ref={history} tabIndex={-1} className="scroll-mt-4 text-sm font-semibold">Dòng lịch sử</h3>
          <p className="text-xs text-ink-3">Mới nhất trước · lịch sử trạng thái từ tối đa 20 đơn gần nhất.</p>
          {data.timeline.length ? <ol className="space-y-3">{data.timeline.map((item) => <li key={item.id} className="border-l-2 border-line pl-3"><p className="font-medium">{item.title}</p><time className="text-xs text-ink-3">{dt(item.at, true)}</time><p className="whitespace-pre-wrap break-words text-ink-2">{item.text}</p></li>)}</ol> : <p>Chưa có lịch sử.</p>}
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
