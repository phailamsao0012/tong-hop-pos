'use client';

// Màn Điều hành (giai đoạn 2b · 26/09/2026): ba khối trả lời "tháng này có đi đúng hướng không":
// tiến độ doanh thu cộng dồn so mục tiêu + dự báo cuối tháng, ba bộ phận so cùng kỳ tháng trước, và việc cần xử lý kèm tóm tắt tự động.
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Sparkles, Target, UsersRound } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { useApi } from './use-api';
import { ChartCard, DeltaPill, ErrorBox, SkeletonTable, ThinkingLine, delta, money, pct, shortMoney, useMotionOK } from './ui-kit';

export type Exec = {
  month: string; today: string; day: number; daysInMonth: number; prevStart: string; prevEnd: string;
  daily: { day: string; orders: number; net: number }[];
  total: { orders: number; net: number }; prevTotal: { orders: number; net: number };
  teams: { key: string; label: string; current: { orders: number; net: number }; previous: { orders: number; net: number } }[];
  definitions: Record<string, string>;
};
export type AttentionItem = { level: 'high' | 'medium' | 'info'; text: string; view?: string };

const TEAM_COLORS: Record<string, string> = { sale: '#c2410c', cskh: '#0f766e', mkt: '#a16207' };
const tr = (n: number) => Math.round(n / 1e4) / 100; // triệu, 2 số lẻ

export function useExec(posIds: string[]) {
  return useApi<Exec>(useMemo(() => `/api/reports/exec?${new URLSearchParams({ posIds: posIds.join(',') })}`, [posIds]), { refreshMs: 5 * 60000 });
}

/** Tiến độ tháng: cộng dồn thực tế, đường mục tiêu (0 → mục tiêu), nét đứt dự báo tới cuối tháng. */
export function MonthPace({ exec, goal, onOpen }: { exec: ReturnType<typeof useExec>; goal: number; onOpen?: () => void }) {
  const motionOn = useMotionOK();
  const d = exec.data;
  const calc = useMemo(() => {
    if (!d) return null;
    const byDay = new Map(d.daily.map((r) => [Number(r.day.slice(8, 10)), r.net]));
    let run = 0;
    const done = d.total.net;
    const perDay = d.day ? done / d.day : 0;
    const forecast = perDay * d.daysInMonth;
    const rows = Array.from({ length: d.daysInMonth }, (_, i) => {
      const n = i + 1;
      if (n <= d.day) run += byDay.get(n) ?? 0;
      return {
        n, label: `${n}/${Number(d.month.slice(5, 7))}`,
        actual: n <= d.day ? tr(run) : null,
        forecast: n >= d.day ? tr(done + perDay * (n - d.day)) : null,
        target: goal ? tr(goal * n / d.daysInMonth) : null,
      };
    });
    const left = d.daysInMonth - d.day;
    return { rows, done, forecast, perDay, need: goal && left > 0 ? Math.max(0, goal - done) / left : null, left };
  }, [d, goal]);
  return (
    <ChartCard icon={Target} title="Tiến độ tháng · doanh thu cộng dồn" loading={!d && !exec.error}
      subtitle={d ? `Tháng ${Number(d.month.slice(5, 7))}/${d.month.slice(0, 4)} · ngày ${d.day}/${d.daysInMonth} · đơn chốt theo ngày xác nhận` : undefined}
      info={d?.definitions.pace} more={onOpen ? { label: 'Báo cáo tháng', onClick: onOpen } : undefined}>
      {exec.error && !d ? <ErrorBox error={exec.error} onRetry={exec.reload} /> : !d || !calc ? <><ThinkingLine /><SkeletonTable rows={4} cols={3} /></> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <ChartContainer className="h-64 w-full aspect-auto" config={{ actual: { label: 'Thực tế (triệu ₫)', color: 'var(--primary)' }, forecast: { label: 'Dự báo', color: 'var(--primary)' }, target: { label: 'Mục tiêu', color: 'var(--ink-3)' } }}>
            <ComposedChart data={calc.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} tỷ` : `${Math.round(v)} tr`}`} />
              <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as (typeof calc.rows)[number];
                return (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
                    <b className="text-ink">Ngày {r.label}</b>
                    {r.actual !== null && <div>Thực tế cộng dồn: <b className="num">{money(r.actual * 1e6)}</b></div>}
                    {r.actual === null && r.forecast !== null && <div>Dự báo: <b className="num">{money(r.forecast * 1e6)}</b></div>}
                    {r.target !== null && <div className="text-ink-3">Mục tiêu tới ngày này: <span className="num">{money(r.target * 1e6)}</span></div>}
                  </div>
                );
              }} />
              {goal > 0 && <Line type="linear" dataKey="target" stroke="var(--color-target)" strokeDasharray="5 5" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              {goal > 0 && <ReferenceLine y={tr(goal)} stroke="var(--ink-4)" strokeDasharray="2 4" label={{ value: `Mục tiêu ${shortMoney(goal)}`, position: 'insideTopLeft', fill: 'var(--ink-3)', fontSize: 11 }} />}
              <Area type="monotone" dataKey="actual" stroke="var(--color-actual)" fill="var(--chart-fill)" strokeWidth={2.4} isAnimationActive={motionOn} connectNulls={false} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} />
              <Line type="linear" dataKey="forecast" stroke="var(--color-forecast)" strokeDasharray="4 4" strokeWidth={2} strokeOpacity={0.55} dot={false} isAnimationActive={false} connectNulls={false} />
            </ComposedChart>
          </ChartContainer>
          <dl className="m-0 grid grid-cols-2 gap-3 text-[12.5px] lg:grid-cols-1">
            <div><dt className="text-ink-3">Đã đạt</dt><dd className="m-0"><b className="num text-lg text-ink">{shortMoney(calc.done)}</b>{goal > 0 && <span className="ml-1 text-ink-2">{pct(calc.done / goal * 100, 0)} mục tiêu</span>}</dd></div>
            <div><dt className="text-ink-3">Dự báo cuối tháng</dt><dd className="m-0"><b className="num text-lg text-ink">{shortMoney(calc.forecast)}</b>{goal > 0 && <span className={`ml-1 ${calc.forecast >= goal ? 'text-good' : 'text-bad'}`}>{pct(calc.forecast / goal * 100, 0)}</span>}</dd></div>
            <div><dt className="text-ink-3">{calc.need !== null ? `Cần mỗi ngày (${calc.left} ngày còn lại)` : 'Trung bình mỗi ngày'}</dt><dd className="m-0"><b className="num text-ink">{shortMoney(calc.need ?? calc.perDay)}</b>{calc.need !== null && <span className="ml-1 text-ink-3">đang {shortMoney(calc.perDay)}/ngày</span>}</dd></div>
            <div><dt className="text-ink-3">So cùng kỳ tháng trước</dt><dd className="m-0 flex items-center gap-1.5"><span className="num text-ink">{shortMoney(d.prevTotal.net)}</span><DeltaPill value={delta(d.total.net, d.prevTotal.net)} /></dd></div>
            {!goal && <p className="col-span-full m-0 text-[11.5px] text-ink-3">Chưa đặt mục tiêu tháng cho các POS này (Cấu hình → Mục tiêu tháng) nên chưa vẽ đường mục tiêu.</p>}
          </dl>
        </div>
      )}
    </ChartCard>
  );
}

/** Ba bộ phận: thanh đậm = tháng này (từ đầu tháng), thanh mờ = cùng số ngày tháng trước. */
export function TeamsCompare({ exec, onOpen }: { exec: ReturnType<typeof useExec>; onOpen?: (key: string) => void }) {
  const d = exec.data;
  const max = d ? Math.max(1, ...d.teams.flatMap((t) => [t.current.net, t.previous.net])) : 1;
  return (
    <ChartCard icon={UsersRound} title="Ba bộ phận · từ đầu tháng" subtitle={d ? `Thanh mờ = cùng kỳ tháng trước (${d.prevStart.slice(8)}–${d.prevEnd.slice(8)}/${d.prevStart.slice(5, 7)})` : undefined}
      info={d?.definitions.teams} loading={!d && !exec.error}>
      {exec.error && !d ? <ErrorBox error={exec.error} onRetry={exec.reload} /> : !d ? <SkeletonTable rows={3} cols={2} /> : (
        <ul className="m-0 list-none space-y-4 p-0">
          {d.teams.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => onOpen?.(t.key)} className="block w-full rounded-lg p-1 text-left hover:bg-tint-2">
                <span className="flex items-baseline justify-between gap-2 text-[13px]">
                  <b className="text-ink">{t.label}</b>
                  <span className="flex items-center gap-1.5"><span className="num font-semibold text-ink">{shortMoney(t.current.net)}</span><DeltaPill variant="plain" value={delta(t.current.net, t.previous.net)} /></span>
                </span>
                <span className="mt-1.5 block h-3 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full" style={{ width: `${t.current.net / max * 100}%`, background: TEAM_COLORS[t.key] }} /></span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full"><i className="block h-full rounded-full opacity-35" style={{ width: `${t.previous.net / max * 100}%`, background: TEAM_COLORS[t.key] }} /></span>
                <span className="mt-1 block text-[11px] text-ink-3">{t.current.orders.toLocaleString('vi-VN')} đơn chốt · tháng trước {shortMoney(t.previous.net)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

/** Việc cần xử lý (xếp theo mức độ) + tóm tắt tự động theo quy tắc (chưa dùng AI). */
export function Attention({ items, summary, onNavigate }: { items: AttentionItem[]; summary: string[]; onNavigate: (view: string) => void }) {
  const order = { high: 0, medium: 1, info: 2 } as const;
  const sorted = [...items].sort((a, b) => order[a.level] - order[b.level]);
  const [all, setAll] = useState(false);
  const shown = all ? sorted : sorted.slice(0, 8);
  return (
    <ChartCard icon={AlertTriangle} title={`Cần xử lý${sorted.length ? ` · ${sorted.length}` : ''}`} subtitle="Xếp theo mức độ · bấm để mở trang liên quan">
      <div className="grid gap-3 lg:grid-cols-2">
        {summary.length > 0 && (
          <div className="self-start rounded-xl bg-[linear-gradient(135deg,var(--sb-bg,#113c30),var(--primary))] p-3 text-[12.5px] leading-relaxed text-white">
            <p className="m-0 mb-1 flex items-center gap-1.5 font-semibold text-[var(--lime,#d9f36d)]"><Sparkles size={13} />Tóm tắt tự động</p>
            <ul className="m-0 list-disc space-y-0.5 pl-4">{summary.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="m-0 mt-1.5 text-[10.5px] opacity-70">Tính theo quy tắc từ số liệu trên trang, chưa dùng AI.</p>
          </div>
        )}
        {sorted.length ? (
          <ul className="m-0 list-none space-y-1 p-0">
            {shown.map((it) => (
              <li key={it.text}>
                <button type="button" disabled={!it.view} onClick={() => it.view && onNavigate(it.view)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-tint-2 disabled:hover:bg-transparent">
                  <i className={`mt-1.5 size-2 shrink-0 rounded-full ${it.level === 'high' ? 'bg-[var(--bad)]' : it.level === 'medium' ? 'bg-[var(--warn)]' : 'bg-[var(--ink-4)]'}`} />
                  <span className="min-w-0 flex-1 text-ink">{it.text}</span>
                  {it.view && <ArrowRight size={13} className="mt-0.5 shrink-0 text-ink-4" />}
                </button>
              </li>
            ))}
            {sorted.length > 8 && <li><button type="button" onClick={() => setAll(!all)} className="px-2 py-1 text-[12px] font-medium text-primary hover:underline">{all ? 'Thu gọn' : `Xem thêm ${sorted.length - 8} việc`}</button></li>}
          </ul>
        ) : <p className="m-0 text-[12.5px] text-ink-3">Không có việc gì cần xử lý ngay.</p>}
      </div>
    </ChartCard>
  );
}
