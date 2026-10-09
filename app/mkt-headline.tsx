'use client';

// Số chính Marketing đầu trang Tổng quan (anh Vũ 09/10/2026: "các con số phải đấm vào mặt luôn"):
// chi phí QC (Google Sheet CPQC Daily / nhập tay), doanh thu MKT, ROAS thật to; đơn chốt, số, giá mỗi đơn / số; so kỳ trước; biểu đồ theo ngày.
// Theo bộ lọc kỳ + POS chung của web; bấm số nào cũng mở trang Chi phí & ROAS (nơi tính ra số đó, giữ bộ lọc).
import { useMemo } from 'react';
import { ArrowRight, BadgeDollarSign, CheckCircle2, Coins, Megaphone, Phone, TrendingUp, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from '@/components/ui/chart';
import { CountUp } from './ui/count-up';
import { DeltaPill, delta, dmy, money, short, shortMoney, vi } from './ui-kit';
import { useApi } from './use-api';
import { useMotionOK } from './ui/motion';

type Totals = { cost: number; net: number; coveredNet: number; closed: number; coveredClosed: number; orders: number; phones: number; coveredPhones: number; marketers: number; roas: number | null; costPerClosed: number | null; costPerLead: number | null };
type Headline = {
  period: { start: string; end: string }; previous: { start: string; end: string; cutoff: string | null };
  current: Totals; prev: Totals; daily: { day: string; cost: number; net: number; closed: number }[];
};

const roasText = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${n.toFixed(2).replace('.', ',')}×`;
const range = (a: string, b: string) => a === b ? dmy(a) : `${dmy(a)}–${dmy(b)}`;

function Giant({ icon: Icon, label, value, raw, format, unit, d, invert, prevText, note, tone, onClick }: {
  icon: LucideIcon; label: string; value: string; raw: number | null; format: (n: number) => string; unit?: string;
  d: number | null; invert?: boolean; prevText: string; note?: string; tone: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="group relative flex min-w-0 flex-col items-start gap-1.5 overflow-hidden rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-lift focus-visible:outline-2 focus-visible:outline-primary max-sm:p-4">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: tone }} />
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2"><span className="grid size-7 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}><Icon size={16} /></span>{label}</span>
      <span className="num w-full truncate text-[clamp(2.25rem,4.6vw,3.75rem)] font-bold leading-[1.02] tracking-[-.035em] text-ink" title={value}>
        {raw === null ? value : <CountUp value={raw} format={format} />}
        {unit && raw !== null && <span className="ml-1.5 text-[.38em] font-semibold tracking-normal text-ink-3">{unit}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
        {d !== null && <DeltaPill value={d} invert={invert} className="text-[12.5px]!" />}
        <span className="num">{prevText}</span>
      </span>
      {note && <span className="text-[12px] leading-snug text-ink-3">{note}</span>}
      <ArrowRight size={16} aria-hidden="true" className="absolute right-4 top-5 text-ink-4 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-primary" />
    </button>
  );
}

function Stat({ icon: Icon, label, value, d, invert, prevText, onClick }: { icon: LucideIcon; label: string; value: string; d: number | null; invert?: boolean; prevText: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-w-0 flex-col items-start gap-1 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-[border-color,box-shadow] duration-200 hover:border-primary hover:shadow-card focus-visible:outline-2 focus-visible:outline-primary">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3"><Icon size={14} />{label}</span>
      <span className="num w-full truncate text-[clamp(1.5rem,2.4vw,2rem)] font-bold leading-tight tracking-[-.025em] text-ink" title={value}>{value}</span>
      <span className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-3">{d !== null && <DeltaPill value={d} invert={invert} variant="plain" />}<span className="num">{prevText}</span></span>
    </button>
  );
}

type Row = { day: string; costM: number; netM: number; cost: number; net: number; closed: number };

function DayTip({ active, label, rows }: { active?: boolean; payload?: ReadonlyArray<unknown>; label?: string | number; rows: Row[] }) {
  if (!active || label === undefined) return null;
  const row = rows.find((r) => r.day === String(label));
  if (!row) return null;
  return (
    <div className="grid min-w-[190px] gap-1 rounded-[7px] border border-line-2 bg-surface px-2.5 py-2 text-[11.5px] text-ink shadow-float">
      <div className="num text-[11px] font-medium text-ink-3">{dmy(row.day)}/{row.day.slice(0, 4)}</div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--t-orange)' }} />Chi phí QC</span><span className="num text-[12.5px]">{shortMoney(row.cost)}</span></div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--primary)' }} />Doanh thu MKT</span><span className="num text-[12.5px]">{shortMoney(row.net)}</span></div>
      <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-dashed border-line-2 pt-1 text-ink-2"><span>ROAS ngày · đơn chốt</span><span className="num text-[12.5px]">{row.cost ? roasText(row.net / row.cost) : '—'} · {vi.format(row.closed)}</span></div>
    </div>
  );
}

export function MktHeadline({ start, end, posIds, onOpen }: { start: string; end: string; posIds: string[]; onOpen: () => void }) {
  const url = `/api/marketing/headline?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`;
  const { data, loading, error, reload } = useApi<Headline>(url, { keep: false });
  const rows = useMemo<Row[]>(() => (data?.daily ?? []).map((r) => ({ ...r, costM: r.cost / 1e6, netM: r.net / 1e6 })), [data]);
  const motionOn = useMotionOK();

  if (!data) {
    return (
      <section className={`card p-5 ${loading ? 'is-loading is-thinking' : ''}`} aria-busy={loading}>
        {error ? <p className="text-[13px] text-bad">Không tải được số chính Marketing. <button type="button" className="underline" onClick={reload}>Tải lại</button></p>
          : <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skel h-36 rounded-2xl" />)}</div>}
      </section>
    );
  }
  const c = data.current, p = data.prev;
  const prevLabel = `kỳ trước ${range(data.previous.start, data.previous.end)}${data.previous.cutoff ? ` tới ${data.previous.cutoff}` : ''}`;
  const was = (v: string) => `kỳ trước ${v}`;
  const roasD = c.roas !== null && p.roas !== null ? delta(c.roas, p.roas) : null;
  const partial = c.net > c.coveredNet;
  const noCost = !c.cost;

  return (
    <section className={`card flex flex-col gap-4 p-5 max-sm:gap-3 max-sm:rounded-xl max-sm:p-4 ${loading ? 'is-loading' : ''}`} aria-label="Số chính Marketing">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="display text-lg font-semibold leading-tight tracking-[-.015em] text-ink">Số chính Marketing <span className="num font-medium text-ink-3">· {range(data.period.start, data.period.end)}</span></h2>
          <p className="mt-0.5 text-[12px] text-ink-3">Chi phí QC từ Google Sheet CPQC Daily (và chi phí nhập tay) · doanh thu từ đơn Pancake chốt của marketer · so {prevLabel}.</p>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-primary hover:bg-tint-2">Chi tiết từng marketer <ArrowRight size={14} /></button>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Giant icon={Wallet} tone="var(--t-orange)" label="Chi phí quảng cáo" value={shortMoney(c.cost)} raw={c.cost} format={short} unit="₫"
          d={delta(c.cost, p.cost)} invert prevText={was(shortMoney(p.cost))}
          note={noCost ? 'Chưa có chi phí trong kỳ này (sheet chưa gửi hoặc chưa nhập).' : `${vi.format(c.marketers)} marketer có chi phí`} onClick={onOpen} />
        <Giant icon={BadgeDollarSign} tone="var(--primary)" label="Doanh thu MKT" value={shortMoney(c.net)} raw={c.net} format={short} unit="₫"
          d={delta(c.net, p.net)} prevText={was(shortMoney(p.net))}
          note={`${vi.format(c.closed)} đơn chốt · theo ngày xác nhận, sau giảm trừ`} onClick={onOpen} />
        <Giant icon={TrendingUp} tone="var(--t-purple)" label="ROAS" value={roasText(c.roas)} raw={c.roas} format={(n) => roasText(n)}
          d={roasD} prevText={was(roasText(p.roas))}
          note={c.roas === null ? 'Cần chi phí trong kỳ để tính ROAS.' : `1 ₫ quảng cáo mang về ${c.roas.toFixed(2).replace('.', ',')} ₫ doanh thu${partial ? ` · chỉ tính ${shortMoney(c.coveredNet)} doanh thu của marketer có chi phí` : ''}`}
          onClick={onOpen} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CheckCircle2} label="Đơn chốt" value={vi.format(c.closed)} d={delta(c.closed, p.closed)} prevText={`trước ${vi.format(p.closed)}`} onClick={onOpen} />
        <Stat icon={Phone} label="Số (SĐT khác nhau)" value={vi.format(c.phones)} d={delta(c.phones, p.phones)} prevText={`trước ${vi.format(p.phones)} · ${vi.format(c.orders)} đơn tạo`} onClick={onOpen} />
        <Stat icon={Coins} label="Chi phí / đơn chốt" value={c.costPerClosed === null ? '—' : shortMoney(c.costPerClosed)} d={c.costPerClosed !== null && p.costPerClosed !== null ? delta(c.costPerClosed, p.costPerClosed) : null} invert prevText={`trước ${p.costPerClosed === null ? '—' : shortMoney(p.costPerClosed)}`} onClick={onOpen} />
        <Stat icon={Megaphone} label="Chi phí / số" value={c.costPerLead === null ? '—' : shortMoney(c.costPerLead)} d={c.costPerLead !== null && p.costPerLead !== null ? delta(c.costPerLead, p.costPerLead) : null} invert prevText={`trước ${p.costPerLead === null ? '—' : shortMoney(p.costPerLead)}`} onClick={onOpen} />
      </div>

      {rows.length > 1 && (
        <div className="min-w-0">
          <p className="mb-1 text-[12.5px] font-semibold text-ink-2">Chi phí và doanh thu theo ngày <span className="font-normal text-ink-3">(triệu ₫)</span></p>
          <ChartContainer className="h-60 w-full aspect-auto cursor-crosshair touch-pan-y max-sm:h-48"
            config={{ costM: { label: 'Chi phí QC', color: 'var(--t-orange)' }, netM: { label: 'Doanh thu MKT', color: 'var(--primary)' } }}>
            <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} onClick={onOpen}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => vi.format(Math.round(v))} />
              <ChartTooltip cursor={{ fill: 'var(--tint-2)' }} content={<DayTip rows={rows} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area type="monotone" dataKey="netM" stroke="var(--color-netM)" fill="var(--color-netM)" fillOpacity={0.12} strokeWidth={2} isAnimationActive={motionOn} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} />
              <Bar dataKey="costM" fill="var(--color-costM)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={motionOn} />
            </ComposedChart>
          </ChartContainer>
          <p className="mt-1 text-[11.5px] text-ink-3">Tổng kỳ: chi {money(c.cost)} · thu {money(c.net)}. Rê chuột lên một ngày để xem ROAS ngày đó.</p>
        </div>
      )}
    </section>
  );
}
