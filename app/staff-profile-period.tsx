'use client';
// Khối "Theo kỳ" đầu Hồ sơ nhân sự (anh Vũ 26/11/2026 13h51: "phần hồ sơ này, xem theo khoảng thời gian từng người").
// Số của đúng người đang xem trong kỳ chọn (lib/reports/staff-profile-period.ts), gọi API riêng (?period=1) để phần cũ không chậm thêm.
// Kỳ dài hơn 62 ngày chạy nền như báo cáo Marketing kỳ dài (lib/ops/long-job.ts). Mốc đỏ giữ như trang khác: TL chốt dưới 40%, hủy từ 5%.
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { presetRange } from '@/lib/shared/periods';
import { todayVn } from '@/lib/shared/report-time';
import { cancelRateClass, closeRateClass } from '@/lib/shared/close-rate';
import type { PeriodCard, StaffProfilePeriod } from '@/lib/reports/staff-profile-period';
import { SegmentedControl, money, shortMoney, vi, barRadius } from './ui-kit';
import { useApi } from './use-api';

type Pick = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';
const PICKS: { value: Pick; label: string }[] = [
  { value: 'today', label: 'Hôm nay' }, { value: 'week', label: '7 ngày' }, { value: 'month', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' }, { value: 'custom', label: 'Tùy chọn' },
];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const p1 = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;
const show = (c: PeriodCard, v: number | null) => v === null ? '—' : c.kind === 'money' ? money(v) : c.kind === 'pct' ? p1(v) : vi.format(Math.round(v));
const tone = (c: PeriodCard) => c.key === 'rate' ? closeRateClass(c.value) : c.key === 'cancel' ? cancelRateClass(c.value) : '';

/** Thay đổi so kỳ trước: tỉ lệ thì theo điểm %, số còn lại theo %. */
function Delta({ c }: { c: PeriodCard }) {
  if (c.value === null || c.prev === null) return <span className="text-[11px] text-ink-3">kỳ trước —</span>;
  if (c.kind === 'pct') {
    const d = c.value - c.prev;
    return <span className="text-[11px] text-ink-3">{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1).replace('.', ',')} điểm so kỳ trước ({p1(c.prev)})</span>;
  }
  if (!c.prev) return <span className="text-[11px] text-ink-3">kỳ trước 0</span>;
  const d = (c.value - c.prev) / c.prev * 100;
  return <span className={`text-[11px] ${d >= 0 ? 'text-good' : 'text-bad'}`}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1).replace('.', ',')}% so kỳ trước</span>;
}

export function ProfilePeriod({ id, posSel }: { id: string; posSel: string[] }) {
  const [today] = useState(() => todayVn());
  const [pick, setPick] = useState<Pick>('month');
  const [custom, setCustom] = useState(() => presetRange('month', today)!);
  const range = pick === 'custom' ? custom : presetRange(pick, today)!;
  const url = useMemo(() => {
    const q = new URLSearchParams({ period: '1', id, start: range.start, end: range.end });
    if (posSel.length) q.set('pos', posSel.join(','));
    return `/api/reports/staff-profile?${q}`;
  }, [id, range.start, range.end, posSel]);
  const { data, loading, error } = useApi<StaffProfilePeriod>(url, { keep: false });
  const days = data?.days.map((d) => ({ key: dm(d.day), net: d.net, orders: d.orders })) ?? [];

  return (
    <section aria-label="Số theo kỳ" data-ui="period-card" className="rounded-2xl border-2 border-primary/50 bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Theo kỳ <span className="text-[12px] font-normal text-ink-3">{dm(range.start)}{range.end !== range.start ? `–${dm(range.end)}` : ''}{data ? ` · so ${dm(data.previous.start)}–${dm(data.previous.end)}` : ''}</span></h3>
        <div className="max-w-full overflow-x-auto"><SegmentedControl<Pick> size="sm" ariaLabel="Chọn kỳ" value={pick} onChange={setPick} options={PICKS} /></div>
      </div>
      {pick === 'custom' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
          <label className="flex items-center gap-1.5">Từ <input type="date" className="field w-auto" value={custom.start} max={custom.end} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))} /></label>
          <label className="flex items-center gap-1.5">đến <input type="date" className="field w-auto" value={custom.end} min={custom.start} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))} /></label>
        </div>
      )}
      {error && !data ? <p className="mt-3 text-[12.5px] text-bad">{error}</p> : !data ? (
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-busy={loading}>{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-[76px] rounded-xl" />)}</div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {data.cards.map((c) => (
              <div key={c.key} className="min-w-0 rounded-xl bg-surface-2 p-3">
                <p className="text-[11.5px] text-ink-3">{c.label}</p>
                <p className={`num mt-0.5 truncate text-[18px] font-semibold ${tone(c)}`}>{show(c, c.value)}</p>
                <Delta c={c} />
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div data-ui="tile-in" className="min-w-0 rounded-xl border border-line p-3">
              <h4 className="text-[13px] font-semibold">{data.dept === 'mkt' ? 'Doanh số MKT' : 'DT chốt'} từng ngày</h4>
              {days.some((d) => d.net) ? (
                <ChartContainer config={{ net: { label: 'Doanh thu', color: 'var(--primary)' } }} className="mt-2 aspect-auto h-44 w-full">
                  <BarChart data={days} margin={{ left: 0, right: 4 }}>
                    <CartesianGrid vertical={false} /><XAxis dataKey="key" tick={{ fontSize: 11 }} minTickGap={10} />
                    <YAxis width={58} tick={{ fontSize: 11 }} tickFormatter={(n: number) => shortMoney(n).replace(' ₫', '')} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(typeof v === 'number' ? v : null)} />} />
                    <Bar dataKey="net" name="Doanh thu" fill="var(--chart-ky-nay, var(--primary))" radius={barRadius([4, 4, 0, 0])} isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>
              ) : <p className="mt-2 text-[12.5px] text-ink-3">Không có doanh thu trong kỳ.</p>}
            </div>
            <div data-ui="tile-in" className="min-w-0 rounded-xl border border-line p-3">
              <h4 className="text-[13px] font-semibold">Sản phẩm bán nhiều nhất</h4>
              {data.dept === 'mkt' ? <p className="mt-2 text-[12.5px] text-ink-3">Marketing không tính theo sản phẩm người bán.</p>
                : data.products.length ? (
                  <ol className="mt-2 space-y-1.5 text-[12.5px]">
                    {data.products.map((p, i) => <li key={p.name} className="flex items-baseline gap-2"><span className="num w-4 text-ink-3">{i + 1}</span><span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}</span><span className="num font-semibold">{vi.format(p.quantity)}</span><span className="num w-16 text-right text-ink-3">{shortMoney(p.total)}</span></li>)}
                  </ol>
                ) : <p className="mt-2 text-[12.5px] text-ink-3">Không có sản phẩm bán ra trong kỳ.</p>}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">{data.definitions.scope}</p>
        </>
      )}
    </section>
  );
}
