'use client';

// Số chính + phân tích Marketing đầu trang Tổng quan (anh Vũ 09/10/2026: "các con số phải đấm vào mặt luôn";
// "rõ ràng theo khoảng thời gian, theo ngày, theo nhân sự, theo từng con sản phẩm, theo đủ thứ").
// Chi phí QC (Google Sheet CPQC Daily / nhập tay), doanh thu MKT, ROAS thật to; đơn chốt, số, giá mỗi đơn / số; so kỳ trước; biểu đồ theo ngày.
// Bên dưới tách theo marketer, team, sản phẩm (cột Sản phẩm của sheet), ngày; bấm một người / team / sản phẩm thì cả khối lọc theo đó
// (người / team dùng chung bộ lọc với bảng marketer bên dưới; sản phẩm sheet chỉ lọc khối này).
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
import { setTeam, useTeam, type Team as Seg } from './team-store';

type Metrics = { cost: number; net: number; closed: number; orders: number; phones: number; coveredNet: number; coveredClosed: number; coveredPhones: number; marketers: number; roas: number | null; costPerClosed: number | null; costPerLead: number | null; costShare?: number | null };
type Person = Metrics & { id: string; name: string; teamId: string; picked: boolean; prevNet: number; prevCost: number };
type Team = Metrics & { id: string; name: string; people: number; prevNet: number; prevCost: number };
type ProductRow = Metrics & { product: string; matched: string[]; linked: boolean };
type Split = Record<'sale' | 'cskh' | 'other', { net: number; closed: number }>;
type NewSplit = { newOrders: number; newNet: number; cskhOrders: number; cskhNet: number };
type Point = { costShare?: number | null; key: string; cost: number; net: number; closed: number; orders: number; phones: number; roas: number | null; costPerClosed: number | null; costPerLead: number | null };
type Analytics = {
  period: { start: string; end: string }; previous: { start: string; end: string; cutoff: string | null; costUntil: string }; bucket: 'day' | 'week' | 'month';
  filters: { marketerId: string | null; marketerName: string | null; teamId: string | null; teamName: string | null; product: string | null };
  team?: Seg; split?: { current: Split; prev: Split };
  current: Metrics; prev: Metrics; timeline: Point[]; people: Person[]; teams: Team[]; products: ProductRow[];
};
type Tab = 'people' | 'teams' | 'products' | 'time';
type Row = { id: string; name: string; sub?: string; m: Metrics | Point; prevNet?: number; active: boolean; dim?: boolean; note?: string };

const roasText = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${n.toFixed(2).replace('.', ',')}×`;
const range = (a: string, b: string) => a === b ? dmy(a) : `${dmy(a)}–${dmy(b)}`;
const productName = (p: string) => p || 'Chưa ghi sản phẩm';
const bucketLabel = (key: string, b: Analytics['bucket']) => b === 'month' ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : b === 'week' ? `Tuần ${dmy(key)}` : dmy(key);

/** Cột nhỏ từng ngày / tuần: xanh khi tốt hơn cột trước, đỏ khi kém hơn (invert: chi phí tăng là đỏ). Chỉ một kỳ thì so kỳ trước với kỳ này.
 * Anh Vũ 21/10/2026: "ô chi phí doanh thu làm to mà chẳng có biểu đồ gì cả... làm chữ số vừa phải, có biểu đồ lên xuống đỏ xanh". */
function Spark({ values, prev, invert, labels, fmt }: { values: (number | null)[]; prev: number | null; invert?: boolean; labels: string[]; fmt: (n: number) => string }) {
  const one = values.length <= 1;
  const xs = one ? [prev, values[0] ?? null] : values;
  const names = one ? ['Kỳ trước', 'Kỳ này'] : labels;
  const max = Math.max(1e-9, ...xs.map((v) => v ?? 0));
  const n = xs.length, gap = n > 40 ? 0.6 : n > 14 ? 1.2 : 3, w = (200 - gap * (n - 1)) / n;
  return <svg viewBox="0 0 200 44" preserveAspectRatio="none" className="h-11 w-full" aria-hidden="true">
    {xs.map((v, i) => {
      const before = i ? xs[i - 1] : null;
      const better = v === null || before === null ? null : invert ? v <= before : v >= before;
      const h = v === null ? 0 : Math.max(1.5, v / max * 42);
      return <rect key={i} x={i * (w + gap)} y={44 - h} width={w} height={h} rx={Math.min(2, w / 2)}
        fill={one && i === 0 ? 'var(--ink-4)' : better === null ? 'var(--ink-4)' : better ? 'var(--good)' : 'var(--bad)'} opacity={one && i === 0 ? 0.45 : 1}>
        <title>{`${names[i]}: ${v === null ? '—' : fmt(v)}`}</title>
      </rect>;
    })}
  </svg>;
}

type SparkProps = { values: (number | null)[]; prev: number | null; labels: string[]; fmt: (n: number) => string };

function Giant({ icon: Icon, label, value, raw, format, unit, d, invert, prevText, note, tone, spark, onClick }: {
  icon: LucideIcon; label: string; value: string; raw: number | null; format: (n: number) => string; unit?: string;
  d: number | null; invert?: boolean; prevText: string; note?: string; tone: string; spark: SparkProps; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} title={note}
      className="group relative flex min-w-0 flex-col items-start gap-1.5 overflow-hidden rounded-xl border border-line bg-surface p-4 text-left transition-[box-shadow,border-color] duration-200 hover:border-primary hover:shadow-card focus-visible:outline-2 focus-visible:outline-primary">
      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2"><span className="grid size-6 place-items-center rounded-md" style={{ background: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}><Icon size={14} /></span>{label}</span>
      <span className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="num truncate text-[1.75rem] font-bold leading-none tracking-[-.025em] text-ink" title={value}>
          {raw === null ? value : <CountUp value={raw} format={format} />}
          {unit && raw !== null && <span className="ml-1 text-[.5em] font-semibold tracking-normal text-ink-3">{unit}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-3">{d !== null && <DeltaPill value={d} invert={invert} variant="plain" />}<span className="num">{prevText}</span></span>
      </span>
      <span className="mt-1 block w-full"><Spark {...spark} invert={invert} /></span>
    </button>
  );
}

function Stat({ icon: Icon, label, value, d, invert, prevText, spark, onClick }: { icon: LucideIcon; label: string; value: string; d: number | null; invert?: boolean; prevText: string; spark: SparkProps; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-w-0 flex-col items-start gap-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition-[border-color,box-shadow] duration-200 hover:border-primary hover:shadow-card focus-visible:outline-2 focus-visible:outline-primary">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3"><Icon size={14} />{label}</span>
      <span className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="num truncate text-[1.35rem] font-bold leading-tight tracking-[-.02em] text-ink" title={value}>{value}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-3">{d !== null && <DeltaPill value={d} invert={invert} variant="plain" />}<span className="num">{prevText}</span></span>
      </span>
      <span className="mt-0.5 block w-full"><Spark {...spark} invert={invert} /></span>
    </button>
  );
}

type ChartRow = { key: string; label: string; costM: number; netM: number; cost: number; net: number; closed: number; roas: number | null };

function Tip({ active, label, rows, title, revLabel = 'Doanh thu MKT' }: { active?: boolean; payload?: ReadonlyArray<unknown>; label?: string | number; rows: ChartRow[]; title?: (r: ChartRow) => string; revLabel?: string }) {
  if (!active || label === undefined) return null;
  const row = rows.find((r) => r.key === String(label) || r.label === String(label));
  if (!row) return null;
  return (
    <div className="grid min-w-[190px] gap-1 rounded-[7px] border border-line-2 bg-surface px-2.5 py-2 text-[11.5px] text-ink shadow-float">
      <div className="text-[11px] font-medium text-ink-3">{title ? title(row) : row.label}</div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--t-orange)' }} />Chi phí QC</span><span className="num text-[12.5px]">{shortMoney(row.cost)}</span></div>
      <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-2"><span className="inline-block size-2 rounded-[2px]" style={{ background: 'var(--primary)' }} />{revLabel}</span><span className="num text-[12.5px]">{shortMoney(row.net)}</span></div>
      <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-dashed border-line-2 pt-1 text-ink-2"><span>ROAS · đơn chốt</span><span className="num text-[12.5px]">{roasText(row.roas)} · {vi.format(row.closed)}</span></div>
    </div>
  );
}

const CHART_CONFIG = { costM: { label: 'Chi phí QC', color: 'var(--t-orange)' }, netM: { label: 'Doanh thu MKT', color: 'var(--primary)' } };
// Nút Sale / CSKH đầu trang (anh Vũ 12/10/2026): Sale chốt = doanh thu New, CSKH chốt = doanh thu CSKH; Tất cả = mọi người bán
// (New + CSKH + người bán chưa có hậu tố SALE / CSKH), có dòng tách bên dưới.
const REV_LABEL: Record<Seg, string> = { all: 'Doanh thu MKT', sale: 'Doanh thu New', cskh: 'Doanh thu CSKH' };
const REV_WHO: Record<Seg, string> = { all: 'mọi người bán', sale: 'Sale chốt', cskh: 'CSKH chốt' };

// Hằng số (không tạo mới mỗi lần vẽ) để biểu đồ không chạy lại hiệu ứng mỗi lần số đếm lên.
const CHART_CONFIGS = Object.fromEntries((Object.keys(REV_LABEL) as Seg[]).map((k) => [k, { ...CHART_CONFIG, netM: { ...CHART_CONFIG.netM, label: REV_LABEL[k] } }])) as Record<Seg, typeof CHART_CONFIG>;

/** Cột đứng chi phí cạnh doanh thu cho từng người / team / sản phẩm (top theo doanh thu + chi phí); bấm cột để lọc.
 * Anh Vũ 21/10/2026: "biểu đồ này cho cột chứ ngang này khó so sánh lắm". */
function RankChart({ rows, onPick, motionOn, seg }: { rows: Row[]; onPick: (id: string) => void; motionOn: boolean; seg: Seg }) {
  const data: ChartRow[] = rows.slice(0, 12).map((r) => { const name = r.name.replace(/[\s-]+mkt$/i, ''); return { key: r.id, label: r.active ? `✓ ${name}` : name, cost: r.m.cost, net: r.m.net, costM: r.m.cost / 1e6, netM: r.m.net / 1e6, closed: r.m.closed, roas: r.m.roas }; });
  if (!data.length) return null;
  const pick = (d: unknown) => { const key = (d as { payload?: { key?: string } } | null)?.payload?.key; if (key !== undefined) onPick(key); };
  const many = data.length > 6;
  return (
    <ChartContainer className="h-72 w-full aspect-auto cursor-pointer max-sm:h-64" config={CHART_CONFIGS[seg]}>
      <BarChart data={data} margin={{ top: 22, right: 4, left: 0, bottom: many ? 28 : 4 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11.5 }} angle={many ? -28 : 0} textAnchor={many ? 'end' : 'middle'} height={many ? 46 : 24} tickFormatter={(v: string) => v.length > 14 ? `${v.slice(0, 13)}…` : v} />
        <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => vi.format(Math.round(v))} />
        <ChartTooltip cursor={{ fill: 'var(--tint-2)' }} content={<Tip rows={data} revLabel={REV_LABEL[seg]} />} />
        <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
        <Bar dataKey="costM" fill="var(--color-costM)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={motionOn} onClick={pick} />
        <Bar dataKey="netM" fill="var(--color-netM)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={motionOn} onClick={pick}>
          <LabelList dataKey="roas" position="top" className="fill-ink-2 text-[10.5px] font-semibold" formatter={(v: unknown) => typeof v === 'number' ? roasText(v) : ''} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

type SortKey = 'name' | 'cost' | 'net' | 'newNet' | 'cskhNet' | 'roas' | 'closed' | 'phones' | 'cpc' | 'cpl' | 'share';

// Doanh thu tách từng dòng (anh Vũ 28/10/2026: thấy doanh thu CSKH của từng marketer, không chỉ tổng). Dòng theo thời gian không có số tách.
const splitOfRow = (m: Row['m']) => 'newNet' in m ? m as Metrics & NewSplit : null;
function BreakdownTable({ rows, first, onPick, totalCost: _totalCost, keepOrder, showSplit = false }: { rows: Row[]; first: string; onPick?: (id: string) => void; totalCost: number; keepOrder?: boolean; showSplit?: boolean }) {
  const sort = useSort<SortKey>('net');
  const shown = keepOrder && sort.key === 'net' && sort.desc ? rows : sort.apply(rows, (r, k) => {
    switch (k) {
      case 'name': return r.name;
      case 'cost': return r.m.cost;
      case 'share': return r.m.costShare ?? null;
      case 'net': return r.m.net;
      case 'newNet': return splitOfRow(r.m)?.newNet ?? null;
      case 'cskhNet': return splitOfRow(r.m)?.cskhNet ?? null;
      case 'roas': return r.m.roas;
      case 'closed': return r.m.closed;
      case 'phones': return r.m.phones;
      case 'cpc': return r.m.costPerClosed;
      case 'cpl': return r.m.costPerLead;
      default: return 0;
    }
  });
  if (!rows.length) return <EmptyState text="Không có chi phí hoặc đơn Marketing trong phạm vi đang chọn." />;
  const split = showSplit && rows.some((r) => splitOfRow(r.m));
  return (
    <TableWrap stickyFirst><table className="tbl">
      <thead><tr><SortTh k="name" label={first} sort={sort} align="left" /><SortTh k="cost" label="Chi phí QC" sort={sort} /><SortTh k="net" label="Doanh thu" sort={sort} />{split && <><SortTh k="newNet" label="DT New" sort={sort} /><SortTh k="cskhNet" label="DT CSKH" sort={sort} /></>}<SortTh k="roas" label="ROAS" sort={sort} /><SortTh k="closed" label="Đơn chốt" sort={sort} /><SortTh k="phones" label="Số" sort={sort} /><SortTh k="cpc" label="CP / đơn New" sort={sort} /><SortTh k="cpl" label="CP / số" sort={sort} /><SortTh k="share" label="% chi phí / DT New" sort={sort} /></tr></thead>
      <tbody>{shown.map((r) => {
        const share = r.m.costShare == null ? null : r.m.costShare * 100;
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
            {split && (() => { const x = splitOfRow(r.m); return <><td className="n">{x ? money(x.newNet) : '—'}{x && <span className="block text-[11px] text-ink-3">{vi.format(x.newOrders)} đơn</span>}</td><td className="n">{x ? money(x.cskhNet) : '—'}{x && <span className="block text-[11px] text-ink-3">{vi.format(x.cskhOrders)} đơn</span>}</td></>; })()}
            <td className="n font-semibold">{roasText(r.m.roas)}</td>
            <td className="n">{vi.format(r.m.closed)}</td>
            <td className="n">{vi.format(r.m.phones)}</td>
            <td className="n">{r.m.costPerClosed === null ? '—' : money(r.m.costPerClosed)}</td>
            <td className="n">{r.m.costPerLead === null ? '—' : money(r.m.costPerLead)}</td>
            <td className="n" aria-label={`${(share ?? 0).toFixed(1)}% chi phí`}><span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="pbar block h-1.5 w-14"><i style={{ width: `${Math.min(100, share ?? 0)}%` }} /></span><span className="num w-11 text-right">{share === null ? '—' : `${share.toFixed(1).replace('.', ',')}%`}</span></span></td>
          </tr>
        );
      })}</tbody>
    </table></TableWrap>
  );
}

/** Tách doanh thu MKT khi xem Tất cả: New (Sale chốt), CSKH chốt, và người bán ngoài hai bộ phận nếu có. Bấm một ô thì đổi nút đầu trang sang bộ phận đó. */
function SplitStrip({ cur, prev, total }: { cur: Split; prev: Split; total: number }) {
  const parts = [
    { key: 'sale' as const, label: 'Doanh thu New', who: 'Sale chốt', tone: 'var(--primary)' },
    { key: 'cskh' as const, label: 'Doanh thu CSKH', who: 'CSKH chốt', tone: 'var(--t-blue)' },
    { key: 'other' as const, label: 'Người bán khác', who: 'chưa có hậu tố SALE, CSKH', tone: 'var(--ink-4)' },
  ].filter((x) => x.key !== 'other' || cur.other.closed || cur.other.net);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-2/60 p-3">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {parts.map((x) => <span key={x.key} style={{ width: `${total > 0 ? Math.max(0, cur[x.key].net) / total * 100 : 0}%`, background: x.tone }} className="h-full rounded-[3px]" />)}
      </div>
      <div className={`grid gap-2 ${parts.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {parts.map((x) => {
          const v = cur[x.key], b = prev[x.key], d = delta(v.net, b.net);
          const body = <>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2"><span className="inline-block size-2.5 rounded-[3px]" style={{ background: x.tone }} />{x.label} <span className="font-normal text-ink-3">· {x.who}</span></span>
            <span className="num text-[1.35rem] font-bold leading-tight tracking-[-.02em] text-ink">{shortMoney(v.net)}<span className="ml-1.5 text-[12px] font-medium text-ink-3">{total > 0 ? `${Math.round(v.net / total * 100)}%` : ''}</span></span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-3">{d !== null && <DeltaPill value={d} variant="plain" />}<span className="num">{vi.format(v.closed)} đơn · trước {shortMoney(b.net)}</span></span>
          </>;
          return x.key === 'other'
            ? <div key={x.key} className="flex min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1.5" title="Đơn có Marketer nhưng người bán chưa có hậu tố SALE / CSKH, đã nghỉ, hoặc đơn chưa có người bán (xem trang Doanh thu ngoài hậu tố). Có trong tổng doanh thu MKT, không có trong New hay CSKH.">{body}</div>
            : <button key={x.key} type="button" onClick={() => setTeam(x.key)} title={`Xem riêng ${x.label}`} className="flex min-w-0 flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary">{body}</button>;
        })}
      </div>
    </div>
  );
}

export function MktHeadline({ start, end, posIds, marketerId, teamId, onMarketer, onTeam, onOpen }: {
  start: string; end: string; posIds: string[]; marketerId: string | null; teamId: string | null;
  onMarketer: (id: string | null) => void; onTeam: (id: string | null) => void; onOpen: () => void;
}) {
  const [product, setProduct] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('people');
  const seg = useTeam();
  const url = useMemo(() => {
    const p = new URLSearchParams({ start, end, posIds: posIds.join(',') });
    if (seg !== 'all') p.set('team', seg);
    if (marketerId) p.set('marketerId', marketerId);
    else if (teamId) p.set('teamId', teamId);
    if (product !== null) p.set('product', product);
    return `/api/marketing/analytics?${p}`;
  }, [start, end, posIds, seg, marketerId, teamId, product]);
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
  // Số lưu cũ chưa có team: coi như Tất cả (lib/mkt-analytics.ts trước 12/10/2026).
  const shown: Seg = data.team ?? 'all', split = data.split;
  const revLabel = REV_LABEL[shown];
  const prevLabel = `kỳ trước ${range(data.previous.start, data.previous.end)}${data.previous.cutoff ? ` tới ${data.previous.cutoff}` : ''}${data.previous.costUntil < data.previous.end ? ` (hôm nay chưa có chi phí nên chi phí kỳ trước tính tới hết ${dmy(data.previous.costUntil)})` : ''}`;
  const was = (v: string) => `kỳ trước ${v}`;
  const roasD = c.roas !== null && p.roas !== null ? delta(c.roas, p.roas) : null;
  const partial = c.net > c.coveredNet;
  const filtered = !!(marketerId || teamId || product !== null);
  const pickPerson = (id: string) => { onTeam(null); onMarketer(id === marketerId ? null : id); };
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

  const tl = data.timeline, tlLabels = tl.map((r) => bucketLabel(r.key, data.bucket));
  const spark = (pick: (m: Metrics | Point) => number | null, fmt: (n: number) => string): SparkProps => ({ values: tl.length > 1 ? tl.map(pick) : [pick(c)], prev: pick(p), labels: tlLabels, fmt });
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
          {/* Giải thích nguồn số chỉ hiện khi rê chuột vào tiêu đề (anh Vũ 21/10/2026: "phần thừa giải thích lan man"). */}
          <h2 className="display text-lg font-semibold leading-tight tracking-[-.015em] text-ink" title={`Chi phí QC từ Google Sheet CPQC Daily (và chi phí nhập tay) · doanh thu từ đơn Pancake có Marketer, ${shown === 'all' ? 'mọi người bán chốt' : `chỉ đơn ${REV_WHO[shown]}`} (nút ${shown === 'all' ? 'Sale / CSKH' : 'Tất cả'} đầu trang để đổi) · số về, đơn tạo, chi phí là của Marketing nên không đổi theo nút · so ${prevLabel}.`}>Số chính Marketing <span className="num font-medium text-ink-3">· {range(data.period.start, data.period.end)}</span></h2>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-primary hover:bg-tint-2">Trang Chi phí &amp; ROAS <ArrowRight size={14} /></button>
      </header>

      {filtered && <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink-2">Đang xem:</span>
        {f.marketerName && chip(UserRound, f.marketerName, () => onMarketer(null))}
        {!marketerId && f.teamName && chip(UsersRound, f.teamName, () => onTeam(null))}
        {product !== null && chip(Package, productName(product), () => setProduct(null))}
        {filtered && <button type="button" onClick={() => { onMarketer(null); onTeam(null); setProduct(null); }} className="text-[12px] text-ink-3 underline-offset-2 hover:text-primary hover:underline">Bỏ hết lọc</button>}
      </div>}

      <div className="grid gap-3 md:grid-cols-3">
        <Giant icon={Wallet} tone="var(--t-orange)" label="Chi phí quảng cáo" value={shortMoney(c.cost)} raw={c.cost} format={short} unit="₫"
          d={delta(c.cost, p.cost)} invert prevText={was(shortMoney(p.cost))} spark={spark((m) => m.cost, shortMoney)}
          note={!c.cost ? 'Chưa có chi phí trong phạm vi này (sheet chưa gửi hoặc chưa nhập).' : `${vi.format(c.marketers)} marketer có chi phí`} onClick={onOpen} />
        <Giant icon={BadgeDollarSign} tone="var(--primary)" label={`${revLabel} (${REV_WHO[shown]})`} value={shortMoney(c.net)} raw={c.net} format={short} unit="₫"
          d={delta(c.net, p.net)} prevText={was(shortMoney(p.net))} spark={spark((m) => m.net, shortMoney)}
          note={`${vi.format(c.closed)} đơn ${shown === 'all' ? 'trên data MKT · gồm New, CSKH và người bán chưa có hậu tố' : `${REV_WHO[shown]} trên data MKT`} · theo ngày xác nhận, sau giảm trừ`} onClick={onOpen} />
        <Giant icon={TrendingUp} tone="var(--t-purple)" label="ROAS · theo đơn New" value={roasText(c.roas)} raw={c.roas} format={(n) => roasText(n)}
          d={roasD} prevText={was(roasText(p.roas))} spark={spark((m) => m.roas, roasText)}
          note={shown === 'cskh' ? 'Chi phí QC tính cho đơn New, xem nút Sale' : c.roas === null ? 'Cần chi phí trong phạm vi này để tính ROAS.' : `1 ₫ quảng cáo mang về ${c.roas.toFixed(2).replace('.', ',')} ₫ doanh thu New${partial ? ` · chỉ tính ${shortMoney(c.coveredNet)} doanh thu của marketer có chi phí` : ''}`}
          onClick={onOpen} />
      </div>

      {split && shown === 'all' && <SplitStrip cur={split.current} prev={split.prev} total={c.net} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CheckCircle2} label="Đơn chốt" value={vi.format(c.closed)} d={delta(c.closed, p.closed)} prevText={`trước ${vi.format(p.closed)}`} spark={spark((m) => m.closed, (n) => vi.format(n))} onClick={onOpen} />
        <Stat icon={Phone} label="Số (SĐT khác nhau)" value={vi.format(c.phones)} d={delta(c.phones, p.phones)} prevText={`trước ${vi.format(p.phones)}`} spark={spark((m) => m.phones, (n) => vi.format(n))} onClick={onOpen} />
        <Stat icon={Coins} label="Chi phí / đơn New" value={c.costPerClosed === null ? '—' : shortMoney(c.costPerClosed)} d={c.costPerClosed !== null && p.costPerClosed !== null ? delta(c.costPerClosed, p.costPerClosed) : null} invert prevText={`trước ${p.costPerClosed === null ? '—' : shortMoney(p.costPerClosed)}`} spark={spark((m) => m.costPerClosed, shortMoney)} onClick={onOpen} />
        <Stat icon={Megaphone} label="Chi phí / số" value={c.costPerLead === null ? '—' : shortMoney(c.costPerLead)} d={c.costPerLead !== null && p.costPerLead !== null ? delta(c.costPerLead, p.costPerLead) : null} invert prevText={`trước ${p.costPerLead === null ? '—' : shortMoney(p.costPerLead)}`} spark={spark((m) => m.costPerLead, shortMoney)} onClick={onOpen} />
      </div>

      {timeRows.length > 1 && (
        <div className="min-w-0">
          <p className="mb-1 text-[12.5px] font-semibold text-ink-2">Chi phí và doanh thu theo {data.bucket === 'day' ? 'ngày' : data.bucket === 'week' ? 'tuần' : 'tháng'} <span className="font-normal text-ink-3">(triệu ₫)</span></p>
          <ChartContainer className="h-60 w-full aspect-auto cursor-crosshair touch-pan-y max-sm:h-48" config={CHART_CONFIGS[shown]}>
            <ComposedChart data={timeRows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="key" tickLine={false} axisLine={false} tickFormatter={(v: string) => bucketLabel(v, data.bucket)} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => vi.format(Math.round(v))} />
              <ChartTooltip cursor={{ fill: 'var(--tint-2)' }} content={<Tip rows={timeRows} revLabel={revLabel} title={(r) => data.bucket === 'day' ? `${r.label}/${r.key.slice(0, 4)}` : r.label} />} />
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
        {tab !== 'time' && onPick && <RankChart seg={shown} rows={[...tabRows].sort((a, b) => (b.m.net + b.m.cost) - (a.m.net + a.m.cost))} onPick={onPick} motionOn={motionOn} />}
        <BreakdownTable rows={tabRows} first={tab === 'people' ? 'Marketer' : tab === 'teams' ? 'Team' : tab === 'products' ? 'Sản phẩm' : data.bucket === 'day' ? 'Ngày' : data.bucket === 'week' ? 'Tuần' : 'Tháng'}
          onPick={onPick} totalCost={totalCost} keepOrder={tab === 'time'} showSplit={shown === 'all'} />
      </div>
    </section>
  );
}
