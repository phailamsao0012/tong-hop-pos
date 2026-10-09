'use client';

// Biểu đồ theo ngày của từng POS tách thành ô nhỏ (anh Vũ 08/10/2026 về biểu đồ gộp 6 đường: "sít với nhau quá, nhìn không có rõ").
// Mỗi ô một POS, thang riêng, kèm tổng kỳ và % so với kỳ so sánh. Kiểu "Gộp" vẫn giữ cho ai muốn so cùng thang: rê vào tên POS để làm nổi đường đó.
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { FloatTip, niceMax, useWidth } from './overview-trends';
import { PosBadge } from './pos-badge';
import { CountUp } from './ui/count-up';
import { drawIn, useGlide, useInView, useTween } from './ui/chart-motion';
import { DeltaPill, delta, dmy, money, posName, posVar, short, vi } from './ui-kit';

type Row = Record<string, number | string | null> & { bucket: string };
const label = (b: string, groupBy: string) => groupBy === 'month' ? b : dmy(b);

function PosMini({ posId, rows, isMoney, groupBy, total, before, shared, onShared }: { posId: string; rows: Row[]; isMoney: boolean; groupBy: string; total: number; before: number | null;
  /** Ngày đang trỏ chung cho mọi ô (rê một ô thì các ô khác cùng hiện ngày đó, theo Arc UI). */ shared: number | null; onShared: (i: number | null) => void }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const seen = useInView(box);
  const [own, setOwn] = useState<{ i: number; x: number; y: number } | null>(null);
  const hover = own ?? (shared !== null && shared < rows.length ? { i: shared, x: 0, y: -999 } : null);
  const setHover = (h: typeof own) => { setOwn(h); onShared(h ? h.i : null); };
  const vals = rows.map((r) => Number(r[posId] ?? 0));
  const H = 120, L = 4, R = 4, T = 16, B = 18;
  const max = niceMax(Math.max(1, ...vals));
  // Đổi kỳ / chỉ số: đường biến hình từ hình cũ, thang trượt theo; lần đầu đường vẽ dần, nền mờ hiện sau.
  const [maxT] = useTween([max], { grow: false });
  const tv = useTween(vals, { grow: false }).map((v) => v ?? 0);
  const N = vals.length;
  const x = (i: number) => N <= 1 ? W / 2 : L + i * (W - L - R) / (N - 1), y = (v: number) => T + (H - T - B) * (1 - v / (maxT ?? max));
  const d = tv.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const gx = useGlide(hover ? x(hover.i) : null);
  const fmt = (v: number) => isMoney ? `${short(v)} ₫` : vi.format(v);
  const color = posVar(posId);
  return (
    <div className="min-w-0 rounded-xl border border-line px-3 pb-2 pt-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink"><PosBadge posId={posId} size={16} /><span className="truncate">{posName(posId)}</span></p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="num text-[17px] font-semibold text-ink"><CountUp value={hover ? vals[hover.i] : total} format={(v) => isMoney ? money(v) : vi.format(Math.round(v))} /></span>
        {hover ? <span className="text-[11px] text-ink-3">{label(rows[hover.i].bucket, groupBy)}</span> : <DeltaPill value={delta(total, before)} label="so kỳ trước" variant="plain" />}
      </p>
      <div ref={box} className="relative mt-1 w-full" onPointerLeave={() => setHover(null)}>
        {W > 0 && N > 0 && (
          <svg width={W} height={H} className="block overflow-visible" aria-label={`${posName(posId)} theo ${groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng'}`}>
            <line x1={L} x2={W - R} y1={y(max)} y2={y(max)} stroke="var(--chart-grid)" />
            <text x={L} y={y(max) - 4} className="fill-ink-3 text-[10px]">{isMoney ? short(max) : vi.format(max)}</text>
            <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--chart-grid)" />
            <path d={`${d} L${x(N - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={color} fillOpacity={0.12} className={seen ? 'chart-fade' : 'opacity-0'} style={{ animationDelay: '.6s' }} />
            <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" {...drawIn(seen)} />
            {hover && gx !== null && <g pointerEvents="none"><line x1={gx} x2={gx} y1={T} y2={H - B} stroke="var(--ink-3)" /><circle cx={gx} cy={y(tv[hover.i])} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} /></g>}
            <text x={L} y={H - 4} className="fill-ink-3 text-[10px]">{label(rows[0].bucket, groupBy)}</text>
            {N > 1 && <text x={W - R} y={H - 4} textAnchor="end" className="fill-ink-3 text-[10px]">{label(rows[N - 1].bucket, groupBy)}</text>}
            <rect x={0} y={0} width={W} height={H} fill="transparent" onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const i = N <= 1 ? 0 : Math.max(0, Math.min(N - 1, Math.round((e.clientX - r.left - L) / ((W - L - R) / (N - 1)))));
              setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
            }} />
          </svg>
        )}
        <FloatTip at={own && gx !== null ? { x: gx, y: own.y, w: W } : null}>{hover && <><b>{label(rows[hover.i].bucket, groupBy)}</b><br />{fmt(vals[hover.i])}</>}</FloatTip>
      </div>
    </div>
  );
}

/** Mỗi POS một ô (thang riêng). `now` / `before`: tổng kỳ đang xem và kỳ so sánh theo POS. */
export function PosMultiples({ rows, posIds, isMoney, groupBy, now, before }: { rows: Row[]; posIds: string[]; isMoney: boolean; groupBy: string; now: Record<string, number>; before: Record<string, number> | null }) {
  const [shared, setShared] = useState<number | null>(null);
  if (!rows.length) return <p className="text-[12.5px] text-ink-3">Không có số trong kỳ.</p>;
  return (
    <div className="stagger grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
      {posIds.map((id) => <PosMini key={id} posId={id} rows={rows} isMoney={isMoney} groupBy={groupBy} total={now[id] ?? 0} before={before ? before[id] ?? 0 : null} shared={shared} onShared={setShared} />)}
    </div>
  );
}

/** Kiểu gộp: các POS chung một thang, không còn đường kỳ so sánh; rê hoặc bấm tên POS để làm nổi đường đó. */
export function PosCombined({ rows, posIds, isMoney, groupBy, config, animate }: { rows: Row[]; posIds: string[]; isMoney: boolean; groupBy: string; config: ChartConfig; animate: boolean }) {
  const [hl, setHl] = useState<string | null>(null);
  return <>
    <div className="mb-2 flex flex-wrap gap-1.5">
      {posIds.map((id) => (
        <button key={id} type="button" aria-pressed={hl === id} onPointerEnter={() => setHl(id)} onPointerLeave={() => setHl(null)} onFocus={() => setHl(id)} onBlur={() => setHl(null)} onClick={() => setHl(hl === id ? null : id)}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] transition-opacity ${hl && hl !== id ? 'border-line opacity-50' : 'border-line-2 text-ink'}`}>
          <i className="inline-block h-0.5 w-3.5 rounded" style={{ background: posVar(id) }} />{posName(id)}
        </button>
      ))}
    </div>
    <ChartContainer className="h-72 w-full aspect-auto" config={config}>
      <LineChart data={rows}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickFormatter={(v: string) => label(v, groupBy)} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => isMoney ? short(v) : vi.format(v)} />
        <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={<ChartTooltipContent labelFormatter={(v) => label(String(v), groupBy)} formatter={(value, name) => (
          <span className="flex w-full justify-between gap-4"><span>{posName(String(name))}</span><strong className="num">{isMoney ? money(Number(value)) : vi.format(Number(value))}</strong></span>
        )} />} />
        {posIds.map((id) => <Line key={id} type="monotone" dataKey={id} stroke={`var(--color-${id})`} strokeWidth={hl === id ? 3 : 2} strokeOpacity={hl && hl !== id ? 0.15 : 1} strokeLinecap="round" dot={false} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls isAnimationActive={animate} />)}
      </LineChart>
    </ChartContainer>
  </>;
}
