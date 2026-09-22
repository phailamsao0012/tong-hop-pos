'use client';

import { useSyncExternalStore } from 'react';
import { ORDER_ORIGINS, type OrderOrigin } from '@/lib/order-segments';
import type { Team } from '@/lib/team';
import { SegmentedControl } from './ui-kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const initial = { orderOrigin: 'all' as OrderOrigin, marketerId: '' };
let selected = initial;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function setOrderOrigin(orderOrigin: OrderOrigin, marketerId = '') {
  selected = { orderOrigin, marketerId: orderOrigin === 'mkt' ? marketerId : '' };
  listeners.forEach(fn => fn());
}
export function useOrderOrigin(team: Team) {
  const value = useSyncExternalStore(subscribe, () => selected, () => initial);
  return team === 'cskh' ? value : initial;
}
export function OrderOriginFilter({ team, marketers = [] }: { team: Team; marketers?: { marketerId: string; marketerName: string }[] }) {
  const { orderOrigin, marketerId } = useOrderOrigin(team);
  if (team !== 'cskh') return null;
  const options = [...new Map(marketers.filter(m => m.marketerId).map(m => [m.marketerId, m])).values()];
  if (marketerId && !options.some(m => m.marketerId === marketerId)) options.push({ marketerId, marketerName: `MKT ${marketerId}` });
  return <div className="rounded-2xl border border-line bg-surface p-4 space-y-2">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold text-ink">Nguồn đơn CSKH</span>
      <SegmentedControl<OrderOrigin> ariaLabel="Nguồn đơn CSKH" value={orderOrigin} onChange={v => setOrderOrigin(v)} options={Object.entries(ORDER_ORIGINS).map(([value, label]) => ({ value: value as OrderOrigin, label }))} />
      {orderOrigin === 'mkt' && options.length > 0 && <Select value={marketerId || '__all'} items={{ __all: 'Tất cả marketer', ...Object.fromEntries(options.map(m => [m.marketerId, m.marketerName])) }} onValueChange={v => setOrderOrigin('mkt', v === '__all' ? '' : String(v))}>
        <SelectTrigger aria-label="Marketer" className="min-w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="__all">Tất cả marketer</SelectItem>{options.map(m => <SelectItem key={m.marketerId} value={m.marketerId}>{m.marketerName}</SelectItem>)}</SelectContent>
      </Select>}
    </div>
    <p className="text-xs text-ink-3">Theo cột Marketer trên đơn Pancake: trống = tự ups, có người phụ trách = từ MKT. Các chỉ số đơn hàng và tỷ lệ dùng cùng nguồn đang chọn.</p>
  </div>;
}
