'use client';

// Khối "Số tham chiếu Pancake": luôn hiện đúng các ô như màn Thống kê của Pancake POS để đối chiếu,
// không đổi theo "Cách tính" hay bộ lọc trạng thái. % so với kỳ liền trước cùng số ngày.
import { useMemo, useState } from 'react';
import { ArrowLeftRight, CircleCheck, Store } from 'lucide-react';
import { ChartCard, DeltaPill, ErrorBox, InfoTip, SegmentedControl, Tooltip, delta, dmy, money, posName, posVar, shortMoney, vi } from './ui-kit';
import { PosBadge } from './pos-badge';
import { useApi } from './use-api';
import { addPart, emptyRefPart, type RefBlock, type RefPart, type RefPos } from '@/lib/pancake-ref-types';

type Resp = { start: string; end: string; prevStart: string; prevEnd: string; current: RefPos[]; previous: RefPos[] };
type Channel = 'total' | 'online' | 'counter';
const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'total', label: 'Tổng cộng' }, { value: 'online', label: 'Online' }, { value: 'counter', label: 'Bán tại quầy' },
];

const partOf = (p: RefPos) => p.pancake ?? p.web;
const sum = (rows: RefPos[], pick: (p: RefPos) => RefPart) => rows.reduce((acc, p) => addPart(acc, pick(p)), emptyRefPart());
const aov = (b: RefBlock) => b.orders ? b.revenue / b.orders : null;
const perOrder = (b: RefBlock) => b.orders ? b.quantity / b.orders : null;

const METRICS: { key: string; label: string; tip: string; value: (b: RefBlock) => number | null; fmt: (v: number | null) => string }[] = [
  { key: 'sales', label: 'Doanh số', tip: 'Tổng tiền hàng của đơn chốt, trước giảm giá.', value: (b) => b.sales, fmt: shortMoney },
  { key: 'revenue', label: 'Doanh thu', tip: 'Doanh số − giảm giá của đơn chốt.', value: (b) => b.revenue, fmt: shortMoney },
  { key: 'profit', label: 'Lợi nhuận', tip: 'Doanh thu − giá vốn (giá nhập gần nhất × số lượng). "—" khi Pancake/đơn chưa có giá nhập.', value: (b) => b.profit, fmt: shortMoney },
  { key: 'orders', label: 'Đơn chốt', tip: 'Đơn đã xác nhận trở đi (kể cả đang giao, đã nhận, hoàn), tính theo ngày xác nhận. Không tính hủy, xóa, mới.', value: (b) => b.orders, fmt: (v) => v === null ? '—' : vi.format(v) },
  { key: 'aov', label: 'GTTB', tip: 'Doanh thu ÷ số đơn chốt.', value: aov, fmt: (v) => v === null ? '—' : money(v) },
  { key: 'quantity', label: 'SL sản phẩm', tip: 'Tổng số lượng sản phẩm trong đơn chốt.', value: (b) => b.quantity, fmt: (v) => v === null ? '—' : vi.format(v) },
  { key: 'per', label: 'SP trung bình', tip: 'SL sản phẩm ÷ số đơn chốt.', value: perOrder, fmt: (v) => v === null ? '—' : v.toFixed(2).replace('.', ',') },
];

export function PancakeReference({ posIds, start, end, className = '', title = 'Số tham chiếu Pancake', note }: {
  posIds: string[]; start: string; end: string; className?: string; title?: string; note?: string;
}) {
  const url = useMemo(() => `/api/reports/pancake-ref?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data, loading, error, reload } = useApi<Resp>(url, { refreshMs: 5 * 60000 });
  const [channel, setChannel] = useState<Channel>('total');

  const cur = useMemo(() => data ? sum(data.current, partOf) : emptyRefPart(), [data]);
  const prev = useMemo(() => data ? sum(data.previous, partOf) : emptyRefPart(), [data]);
  const web = useMemo(() => data ? sum(data.current, (p) => p.web) : emptyRefPart(), [data]);
  const sources = data?.current ?? [];
  const fromPancake = sources.filter((p) => p.source === 'pancake').length;
  const split = cur.split !== false, hasReturned = cur.hasReturned !== false;
  const noSplit = channel !== 'total' && !split;
  const b = cur[channel], pb = prev[channel];
  const hasRevenue = cur.total.revenue > 0;
  const counterShare = hasRevenue ? cur.counter.revenue / cur.total.revenue * 100 : 0;
  const prevLabel = data ? `${dmy(data.prevStart)}${data.prevStart !== data.prevEnd ? `–${dmy(data.prevEnd)}` : ''}` : '';
  const mismatch = fromPancake > 0 && Math.abs(web.total.orders - sources.reduce((s, p) => s + (p.source === 'pancake' ? partOf(p).total.orders : p.web.total.orders), 0)) > 0;

  const sourceChip = !data ? null : fromPancake === sources.length
    ? <span className="inline-flex items-center gap-1 rounded-full bg-good-bg px-2 py-0.5 text-[11px] font-semibold text-t-green"><CircleCheck size={12} />Lấy từ Pancake</span>
    : <Tooltip content={<span className="block max-w-[34ch] whitespace-normal">{fromPancake ? `${fromPancake}/${sources.length} POS lấy từ Pancake, còn lại web tự tính theo công thức Pancake.` : 'Web tự tính theo đúng công thức Pancake (chưa gọi được thống kê Pancake).'}{sources.filter((p) => p.error).map((p) => <span key={p.posId} className="mt-1 block text-ink-3">{posName(p.posId)}: {p.error}</span>)}</span>}>
        <span tabIndex={0} className="inline-flex items-center gap-1 rounded-full bg-t-gray-bg px-2 py-0.5 text-[11px] font-semibold text-t-gray">Web tự tính{fromPancake ? ` · ${fromPancake}/${sources.length} Pancake` : ''}</span>
      </Tooltip>;

  return (
    <ChartCard icon={Store} title={title} loading={loading && !data} className={className}
      subtitle={note ?? `Như màn Thống kê của Pancake POS · luôn giữ nguyên dù đổi "Cách tính" · % so với ${prevLabel || 'kỳ trước'}`}
      action={<div className="flex flex-wrap items-center gap-2">{sourceChip}<SegmentedControl size="sm" options={CHANNELS} value={channel} onChange={setChannel} ariaLabel="Kênh bán" /></div>}>
      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : noSplit ? <p className="m-0 rounded-xl bg-surface-2 p-3 text-[12.5px] text-ink-2">Chưa lấy được số từ Pancake nên chưa tách được Online / Bán tại quầy (bảng tổng hợp của web không có thông tin này). Xem "Tổng cộng".</p> : (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        {/* Cột trái: hàng chốt / hoàn + tỷ trọng kênh */}
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11.5px] text-ink-3">Hàng chốt</p><p className="num text-xl text-ink">{vi.format(cur.total.quantity)}</p><DeltaPill variant="plain" value={cur.total.quantity || prev.total.quantity ? delta(cur.total.quantity, prev.total.quantity) : null} /></div>
            <div><p className="flex items-center gap-1 text-[11.5px] text-ink-3">Hàng hoàn<InfoTip text="Đơn chuyển sang hoàn trong kỳ (theo ngày hoàn), đếm số lượng sản phẩm." /></p><p className="num text-xl text-ink">{hasReturned ? vi.format(cur.returned.quantity) : '—'}</p>{hasReturned && <DeltaPill variant="plain" invert value={cur.returned.quantity || prev.returned.quantity ? delta(cur.returned.quantity, prev.returned.quantity) : null} />}</div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[11.5px] text-ink-3"><span className="inline-flex items-center gap-1"><ArrowLeftRight size={12} />Online · Tại quầy</span><span className="num text-ink-2">{hasRevenue && split ? `${(100 - counterShare).toFixed(0)}% · ${counterShare.toFixed(0)}%` : '—'}</span></div>
            <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`Online ${(100 - counterShare).toFixed(0)}%, tại quầy ${counterShare.toFixed(0)}% doanh thu`}>
              <span className="h-full rounded-l-full bg-[var(--pos-1)]" style={{ width: `${hasRevenue ? 100 - counterShare : 0}%` }} />
              <span className="h-full rounded-r-full bg-[var(--pos-4)]" style={{ width: `${counterShare}%` }} />
            </div>
          </div>
          {cur.returned.orders > 0 && <p className="text-[11.5px] text-ink-3">{vi.format(cur.returned.orders)} đơn hoàn · {shortMoney(cur.returned.revenue)}</p>}
        </div>
        {/* Các ô chỉ số như Pancake */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
          {METRICS.map((m) => {
            const v = m.value(b), pv = m.value(pb);
            return (
              <div key={m.key} className="min-w-0">
                <p className="flex items-center gap-1 truncate text-[11.5px] text-ink-3">{m.label}<InfoTip text={m.tip} /></p>
                <p className="num truncate text-[17px] text-ink" title={m.fmt(v)}>{m.fmt(v)}</p>
                {v !== null && pv !== null && (v || pv) ? <DeltaPill variant="plain" value={delta(v, pv)} /> : <span className="text-[11.5px] text-ink-4">—</span>}
              </div>
            );
          })}
        </div>
      </div>
      )}
      {sources.length > 1 && !noSplit && (
        <div className="mt-4 grid gap-1.5 border-t border-line pt-3 sm:grid-cols-2 xl:grid-cols-3">
          {sources.map((p) => {
            const part = partOf(p)[channel];
            const share = b.revenue ? part.revenue / b.revenue * 100 : 0;
            return (
              <div key={p.posId} className="flex min-w-0 items-center gap-2 text-[12px]">
                <PosBadge posId={p.posId} size={18} />
                <span className="w-24 truncate text-ink-2" title={posName(p.posId)}>{posName(p.posId)}</span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${share}%`, background: posVar(p.posId) }} /></span>
                <span className="num w-16 text-right text-ink">{shortMoney(part.revenue)}</span>
                <span className="num w-10 text-right text-ink-3" title="Đơn chốt">{vi.format(part.orders)}</span>
                {p.source === 'web' && <span className="text-[10px] text-ink-4" title={p.error ?? 'Web tự tính'}>web</span>}
              </div>
            );
          })}
        </div>
      )}
      {mismatch && <p className="mt-2 text-[11.5px] text-ink-3">Web đang tính {vi.format(web.total.orders)} đơn chốt cho cùng kỳ — lệch với Pancake do đơn chưa đồng bộ kịp hoặc khác cách xếp ngày.</p>}
    </ChartCard>
  );
}
