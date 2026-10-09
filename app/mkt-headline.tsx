'use client';

// Số chính + phân tích Marketing đầu trang Tổng quan (anh Vũ 09/10/2026: "các con số phải đấm vào mặt luôn";
// "rõ ràng theo khoảng thời gian, theo ngày, theo nhân sự, theo từng con sản phẩm, theo đủ thứ").
// Chi phí QC (Google Sheet CPQC Daily / nhập tay), doanh thu MKT, ROAS thật to; đơn chốt, số, giá mỗi đơn / số; so kỳ trước; biểu đồ theo ngày.
// Bên dưới tách theo marketer, team, sản phẩm (cột Sản phẩm của sheet), ngày; bấm một người / team / sản phẩm thì cả khối (và bảng marketer bên dưới) lọc theo đó.
// Theo bộ lọc kỳ + POS chung của web. Số liệu: lib/mkt-analytics.ts.
import { useMemo, useState } from 'react';
import { ArrowRight, BadgeDollarSign, CalendarDays, Check, CheckCircle2, Coins, Megaphone, Package, Phone, TrendingUp, UsersRound, UserRound, Wallet, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from '@/components/ui/chart';
import { CountUp } from './ui/count-up';
import { DeltaPill, EmptyState, SegmentedControl, SortTh, TableWrap, delta, dmy, money, short, shortMoney, useSort, vi } from './ui-kit';
import { useApi } from './use-api';
import { useMotionOK } from './ui/motion';

type Metrics = { cost: number; net: number; closed: number; orders: number; phones: number; coveredNet: number; coveredClosed: number; coveredPhones: number; marketers: number; roas: number | null; costPerClosed: number | null; costPerLead: number | null };
type Person = Metrics & { id: string; name: string; teamId: string; picked: boolean; prevNet: number; prevCost: number };
type Team = Metrics & { id: string; name: string; people: number; prevNet: number; prevCost: number };
type ProductRow = Metrics & { product: string; matched: string[]; linked: boolean };
type Point = { key: string; cost: number; net: number; closed: number; orders: number; phones: number; roas: number | null; costPerClosed: number | null; costPerLead: number | null };
type Analytics = {
  period: { start: string; end: string }; previous: { start: string; end: string; cutoff: string | null }; bucket: 'day' | 'week' | 'month';
  filters: { marketerId: string | null; marketerName: string | null; teamId: string | null; teamName: string | null; product: string | null };
  current: Metrics; prev: Metrics; timeline: Point[]; people: Person[]; teams: Team[]; products: ProductRow[];
};
type Tab = 'people' | 'teams' | 'products' | 'time';
type Row = { id: string; name: string; sub?: string; m: Metrics | Point; prevNet?: number; active: boolean; dim?: boolean; note?: string };

const roasText = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${n.toFixed(2).replace('.', ',')}×`;
const range = (a: string, b: string) => a === b ? dmy(a) : `${dmy(a)}–${dmy(b)}`;
const productName = (p: string) => p || 'Chưa ghi sản phẩm';
const bucketLabel = (key: string, b: Analytics['bucket']) => b === 'month' ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : b === 'week' ? `Tuần ${dmy(key)}` : dmy(key);

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

type ChartRow = { key: string; label: string; costM: number; netM: number; cost: number; net: number; closed: number; roas: number | null };

function Tip({ active, label, rows, title }: { active?: boolean; payload?: ReadonlyArray<unknown>; label?: string | number; rows: ChartRow[]; title?: (r: ChartRow) => string }) {
  if (!active || label === undefined) return null;
  const row = rows.find((r) => r.key === String(label) || r.label === String(label));
  if (!row) return null;
  return (
    <div className="grid min-w-[190px] gap-1 rounded-[7px] border border-line-2 bg-surface px-2.5 py-2 text-[11.5px] text-ink shadow-float">
      <div className="text-[11px] font-medium text-ink-3">{title ? title(row) : row.label}</div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--t-orange)' }} />Chi phí QC</span><span className="num text-[12.5px]">{shortMoney(row.cost)}</span></div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--primary)' }} />Doanh thu MKT</span><span className="num text-[12.5px]">{shortMoney(row.net)}</span></div>
      <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-dashed border-line-2 pt-1 text-ink-2"><span>ROAS · đơn chốt</span><span className="num text-[12.5px]">{roasText(row.roas)} · {vi.format(row.closed)}</span></div>
    </div>
  );
}

const CHART_CONFIG = { costM: { label: 'Chi phí QC', color: 'var(--t-orange)' }, netM: { label: 'Doanh thu MKT', color: 'var(--primary)' } };

/** Thanh ngang chi phí cạnh doanh thu cho từng người / team / sản phẩm (top theo doanh thu + chi phí); bấm thanh để lọc. */
function RankChart({ rows, onPick, motionOn }: { rows: Row[]; onPick: (id: string) => void; motionOn: boolean }) {
  const data: ChartRow[] = rows.slice(0, 10).map((r) => ({ key: r.id, label: r.active ? `✓ ${r.name}` : r.name, cost: r.m.cost, net: r.m.net, costM: r.m.cost / 1e6, netM: r.m.net / 1e6, closed: r.m.closed, roas: r.m.roas }));
  if (!data.length) return null;
  const pick = (d: unknown) => { const key = (d as { payload?: { key?: string } } | null)?.payload?.key; if (key !== undefined) onPick(key); };
  return (
    <ChartContainer className="w-full aspect-auto cursor-pointer" style={{ height: 48 + data.length * 40 }} config={CHART_CONFIG}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 0 }} barGap={2} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => vi.format(Math.round(v))} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={150} tick={{ fontSize: 12 }} tickFormatter={(v: string) => v.length > 22 ? `${v.slice(0, 21)}…` : v} />
        <ChartTooltip cursor={{ fill: 'var(--tint-2)' }} content={<Tip rows={data} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="costM" fill="var(--color-costM)" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={motionOn} onClick={pick} />
        <Bar dataKey="netM" fill="var(--color-netM)" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={motionOn} onClick={pick}>
          <LabelList dataKey="roas" position="right" className="fill-ink-2 text-[11px] font-semibold" formatter={(v: unknown) => typeof v === 'number' ? roasText(v) : ''} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

type SortKey = 'name' | 'cost' | 'net' | 'roas' | 'closed' | 'phones' | 'cpc' | 'cpl' | 'share';

function BreakdownTable({ rows, first, onPick, totalCost, keepOrder }: { rows: Row[]; first: string; onPick?: (id: string) => void; totalCost: number; keepOrder?: boolean }) {
  const sort = useSort<SortKey>('net');
  const shown = keepOrder && sort.key === 'net' && sort.desc ? rows : sort.apply(rows, (r, k) => {
    switch (k) {
      case 'name': return r.name;
      case 'cost': case 'share': return r.m.cost;
      case 'net': return r.m.net;
      case 'roas': return r.m.roas;
      case 'closed': return r.m.closed;
      case 'phones': return r.m.phones;
      case 'cpc': return r.m.costPerClosed;
      case 'cpl': return r.m.costPerLead;
      default: return 0;
    }
  });
  if (!rows.length) return <EmptyState text="Không có chi phí hoặc đơn Marketing trong phạm vi đang chọn." />;
  return (
    <TableWrap stickyFirst><table className="tbl">
      <thead><tr><SortTh k="name" label={first} sort={sort} align="left" /><SortTh k="cost" label="Chi phí QC" sort={sort} /><SortTh k="net" label="Doanh thu" sort={sort} /><SortTh k="roas" label="ROAS" sort={sort} /><SortTh k="closed" label="Đơn chốt" sort={sort} /><SortTh k="phones" label="Số" sort={sort} /><SortTh k="cpc" label="CP / đơn" sort={sort} /><SortTh k="cpl" label="CP / số" sort={sort} /><SortTh k="share" label="% chi phí" sort={sort} /></tr></thead>
      <tbody>{shown.map((r) => {
        const share = totalCost ? r.m.cost / totalCost * 100 : 0;
        return (
          <tr key={r.id} className={`${r.active ? 'bg-tint-2' : ''} ${r.dim ? 'opacity-55' : ''}`}>
            <td className="min-w-40">
              {onPick ? <button type="button" onClick={() => onPick(r.id)} className="flex items-center gap-1.5 text-left font-semibold text-ink hover:text-primary" title={r.active ? 'Bỏ lọc' : 'Bấm để lọc cả khối theo dòng này'}>
                {r.active && <Check size={14} className="shrink-0 text-primary" />}{r.name}
              </button> : <span className="font-semibold">{r.name}</span>}
              {(r.sub || r.note) && <span className="block max-w-72 whitespace-normal text-[11px] font-normal leading-snug text-ink-3">{[r.sub, r.note].filter(Boolean).join(' · ')}</span>}
            </td>
            <td className="n">{money(r.m.cost)}</td>
            <td className="n font-semibold">{money(r.m.net)}{r.prevNet !== undefined && (r.prevNet || r.m.net) > 0 && <span className="block"><DeltaPill value={delta(r.m.net, r.prevNet)} variant="plain" /></span>}</td>
            <td className="n font-semibold">{roasText(r.m.roas)}</td>
            <td className="n">{vi.format(r.m.closed)}</td>
            <td className="n">{vi.format(r.m.phones)}</td>
            <td className="n">{r.m.costPerClosed === null ? '—' : money(r.m.costPerClosed)}</td>
            <td className="n">{r.m.costPerLead === null ? '—' : money(r.m.costPerLead)}</td>
            <td className="n" aria-label={`${share.toFixed(1)}% chi phí`}><span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="pbar block h-1.5 w-14"><i style={{ width: `${Math.min(100, share)}%` }} /></span><span className="num w-11 text-right">{share.toFixed(1).replace('.', ',')}%</span></span></td>
          </tr>
        );
      })}</tbody>
    </table></TableWrap>
  );
}

export function MktHeadline({ start, end, posIds, marketerId, teamId, onMarketer, onTeam, onOpen }: {
  start: string; end: string; posIds: string[]; marketerId: string | null; teamId: string | null;
  onMarketer: (id: string | null) => void; onTeam: (id: string | null) => void; onOpen: () => void;
}) {
  const [product, setProduct] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('people');
  const url = useMemo(() => {
    const p = new URLSearchParams({ start, end, posIds: posIds.join(',') });
    if (marketerId) p.set('marketerId', marketerId);
    else if (teamId) p.set('teamId', teamId);
    if (product !== null) p.set('product', product);
    return `/api/marketing/analytics?${p}`;
  }, [start, end, posIds, marketerId, teamId, product]);
  const { data, loading, error, reload } = useApi<Analytics>(url, { keep: true });
  const motionOn = useMotionOK();
  const timeRows = useMemo<ChartRow[]>(() => (data?.timeline ?? []).map((r) => ({ key: r.key, label: bucketLabel(r.key, data!.bucket), cost: r.cost, net: r.net, costM: r.cost / 1e6, netM: r.net / 1e6, closed: r.closed, roas: r.roas })), [data]);

  if (!data) {
    return (
      <section className={`card p-5 ${loading ? 'is-loading is-thinking' : ''}`} aria-busy={loading}>
        {error ? <p className="text-[13px] text-bad">Không tải được số chính Marketing. <button type="button" className="underline" onClick={reload}>Tải lại</button></p>
          : <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skel h-36 rounded-2xl" />)}</div>}
      </section>
    );
  }
  const c = data.current, p = data.prev, f = data.filters;
  const prevLabel = `kỳ trước ${range(data.previous.start, data.previous.end)}${data.previous.cutoff ? ` tới ${data.previous.cutoff}` : ''}`;
  const was = (v: string) => `kỳ trước ${v}`;
  const roasD = c.roas !== null && p.roas !== null ? delta(c.roas, p.roas) : null;
  const partial = c.net > c.coveredNet;
  const filtered = !!(marketerId || teamId || product !== null);
  const pickPerson = (id: string) => onMarketer(id === marketerId ? null : id);
  const pickTeam = (id: string) => { onMarketer(null); onTeam(id === teamId ? null : id); };
  const pickProduct = (id: string) => setProduct(id === product ? null : id);
  const teamName = new Map(data.teams.map((t) => [t.id, t.name]));

  const people: Row[] = data.people.filter((r) => !teamId || marketerId || r.picked)
    .map((r) => ({ id: r.id, name: r.name, sub: teamName.get(r.teamId) ?? (r.teamId === '__unassigned' ? 'Chưa phân team' : undefined), m: r, prevNet: r.prevNet, active: r.id === marketerId, dim: !!marketerId && r.id !== marketerId }));
  const teams: Row[] = data.teams.map((t) => ({ id: t.id, name: t.name, sub: `${vi.format(t.people)} marketer`, m: t, prevNet: t.prevNet, active: t.id === teamId && !marketerId }));
  const products: Row[] = data.products.map((r) => ({ id: r.product, name: productName(r.product), m: r, active: r.product === product,
    note: r.linked ? `Khớp đơn: ${r.matched.join(', ')}` : r.product ? 'Chưa khớp nhãn / sản phẩm nào trên đơn Pancake' : undefined }));
  const time: Row[] = data.timeline.map((r) => ({ id: r.key, name: bucketLabel(r.key, data.bucket), m: r, active: false }));
  const tabRows = tab === 'people' ? people : tab === 'teams' ? teams : tab === 'products' ? products : time;
  const onPick = tab === 'people' ? pickPerson : tab === 'teams' ? pickTeam : tab === 'products' ? pickProduct : undefined;
  const totalCost = tab === 'time' ? c.cost : tabRows.reduce((s, r) => s + r.m.cost, 0);

  const chip = (icon: LucideIcon, text: string, clear: () => void) => {
    const Icon = icon;
    return <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-tint-2 px-2.5 py-1 text-[12.5px] font-semibold text-primary hover:border-primary" title="Bỏ lọc">
      <Icon size={13} />{text}<X size={13} />
    </button>;
  };

  return (
    <section className={`card flex flex-col gap-4 p-5 max-sm:gap-3 max-sm:rounded-xl max-sm:p-4 ${loading ? 'is-loading' : ''}`} aria-label="Số chính Marketing">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="display text-lg font-semibold leading-tight tracking-[-.015em] text-ink">Số chính Marketing <span className="num font-medium text-ink-3">· {range(data.period.start, data.period.end)}</span></h2>
          <p className="mt-0.5 text-[12px] text-ink-3">Chi phí QC từ Google Sheet CPQC Daily (và chi phí nhập tay) · doanh thu từ đơn Pancake chốt của marketer · so {prevLabel}.</p>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-primary hover:bg-tint-2">Trang Chi phí &amp; ROAS <ArrowRight size={14} /></button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink-2">Đang xem:</span>
        {!filtered && <span className="text-[12.5px] text-ink-3">Toàn bộ Marketing. Bấm một marketer, team hoặc sản phẩm ở bảng dưới để xem riêng.</span>}
        {f.marketerName && chip(UserRound, f.marketerName, () => onMarketer(null))}
        {!marketerId && f.teamName && chip(UsersRound, f.teamName, () => onTeam(null))}
        {product !== null && chip(Package, productName(product), () => setProduct(null))}
        {filtered && <button type="button" onClick={() => { onMarketer(null); onTeam(null); setProduct(null); }} className="text-[12px] text-ink-3 underline-offset-2 hover:text-primary hover:underline">Bỏ hết lọc</button>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Giant icon={Wallet} tone="var(--t-orange)" label="Chi phí quảng cáo" value={shortMoney(c.cost)} raw={c.cost} format={short} unit="₫"
          d={delta(c.cost, p.cost)} invert prevText={was(shortMoney(p.cost))}
          note={!c.cost ? 'Chưa có chi phí trong phạm vi này (sheet chưa gửi hoặc chưa nhập).' : `${vi.format(c.marketers)} marketer có chi phí`} onClick={onOpen} />
        <Giant icon={BadgeDollarSign} tone="var(--primary)" label="Doanh thu MKT" value={shortMoney(c.net)} raw={c.net} format={short} unit="₫"
          d={delta(c.net, p.net)} prevText={was(shortMoney(p.net))}
          note={`${vi.format(c.closed)} đơn chốt · theo ngày xác nhận, sau giảm trừ`} onClick={onOpen} />
        <Giant icon={TrendingUp} tone="var(--t-purple)" label="ROAS" value={roasText(c.roas)} raw={c.roas} format={(n) => roasText(n)}
          d={roasD} prevText={was(roasText(p.roas))}
          note={c.roas === null ? 'Cần chi phí trong phạm vi này để tính ROAS.' : `1 ₫ quảng cáo mang về ${c.roas.toFixed(2).replace('.', ',')} ₫ doanh thu${partial ? ` · chỉ tính ${shortMoney(c.coveredNet)} doanh thu của marketer có chi phí` : ''}`}
          onClick={onOpen} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CheckCircle2} label="Đơn chốt" value={vi.format(c.closed)} d={delta(c.closed, p.closed)} prevText={`trước ${vi.format(p.closed)}`} onClick={onOpen} />
        <Stat icon={Phone} label="Số (SĐT khác nhau)" value={vi.format(c.phones)} d={delta(c.phones, p.phones)} prevText={`trước ${vi.format(p.phones)} · ${vi.format(c.orders)} đơn tạo`} onClick={onOpen} />
        <Stat icon={Coins} label="Chi phí / đơn chốt" value={c.costPerClosed === null ? '—' : shortMoney(c.costPerClosed)} d={c.costPerClosed !== null && p.costPerClosed !== null ? delta(c.costPerClosed, p.costPerClosed) : null} invert prevText={`trước ${p.costPerClosed === null ? '—' : shortMoney(p.costPerClosed)}`} onClick={onOpen} />
        <Stat icon={Megaphone} label="Chi phí / số" value={c.costPerLead === null ? '—' : shortMoney(c.costPerLead)} d={c.costPerLead !== null && p.costPerLead !== null ? delta(c.costPerLead, p.costPerLead) : null} invert prevText={`trước ${p.costPerLead === null ? '—' : shortMoney(p.costPerLead)}`} onClick={onOpen} />
      </div>

      {timeRows.length > 1 && (
        <div className="min-w-0">
          <p className="mb-1 text-[12.5px] font-semibold text-ink-2">Chi phí và doanh thu theo {data.bucket === 'day' ? 'ngày' : data.bucket === 'week' ? 'tuần' : 'tháng'} <span className="font-normal text-ink-3">(triệu ₫)</span></p>
          <ChartContainer className="h-60 w-full aspect-auto cursor-crosshair touch-pan-y max-sm:h-48" config={CHART_CONFIG}>
            <ComposedChart data={timeRows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="key" tickLine={false} axisLine={false} tickFormatter={(v: string) => bucketLabel(v, data.bucket)} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => vi.format(Math.round(v))} />
              <ChartTooltip cursor={{ fill: 'var(--tint-2)' }} content={<Tip rows={timeRows} title={(r) => data.bucket === 'day' ? `${r.label}/${r.key.slice(0, 4)}` : r.label} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area type="monotone" dataKey="netM" stroke="var(--color-netM)" fill="var(--color-netM)" fillOpacity={0.12} strokeWidth={2} isAnimationActive={motionOn} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} />
              <Bar dataKey="costM" fill="var(--color-costM)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={motionOn} />
            </ComposedChart>
          </ChartContainer>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-ink">Tách theo</h3>
          <SegmentedControl<Tab> ariaLabel="Tách số Marketing theo" value={tab} onChange={setTab} options={[
            { value: 'people', label: 'Marketer', icon: UserRound }, { value: 'teams', label: 'Team', icon: UsersRound },
            { value: 'products', label: 'Sản phẩm', icon: Package }, { value: 'time', label: data.bucket === 'day' ? 'Ngày' : data.bucket === 'week' ? 'Tuần' : 'Tháng', icon: CalendarDays },
          ]} />
        </div>
        {tab === 'products' && <p className="text-[11.5px] leading-snug text-ink-3">Sản phẩm theo cột Sản phẩm của sheet chi phí. Doanh thu, đơn, số lấy từ đơn Pancake có nhãn hoặc tên sản phẩm khớp (dòng nào khớp ghi ngay dưới tên). Một đơn có nhiều sản phẩm được tính ở mỗi sản phẩm.</p>}
        {tab === 'teams' && !data.teams.some((t) => t.id !== '__unassigned') && <p className="text-[11.5px] text-ink-3">Chưa chia team Marketing. Chia ở nút <b>Quản lý team MKT</b> đầu trang.</p>}
        {tab !== 'time' && onPick && <RankChart rows={[...tabRows].sort((a, b) => (b.m.net + b.m.cost) - (a.m.net + a.m.cost))} onPick={onPick} motionOn={motionOn} />}
        <BreakdownTable rows={tabRows} first={tab === 'people' ? 'Marketer' : tab === 'teams' ? 'Team' : tab === 'products' ? 'Sản phẩm' : data.bucket === 'day' ? 'Ngày' : data.bucket === 'week' ? 'Tuần' : 'Tháng'}
          onPick={onPick} totalCost={totalCost} keepOrder={tab === 'time'} />
      </div>
    </section>
  );
}
