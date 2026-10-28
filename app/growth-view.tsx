'use client';

// Tăng trưởng nhân viên (anh Vũ 28/10/2026): lịch số từng ngày tính từ ngày vào, gom theo thứ / ngày / tuần / tháng / quý,
// so với chính mình hoặc người cùng bộ phận (cùng kỳ, cùng thâm niên, cùng đợt vào, tự chọn). Chỉ chủ hệ thống xem.
import { useMemo, useState } from 'react';
import { CalendarDays, LineChart as LineIcon, Pencil, TrendingUp, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addDays, daysBetween } from '@/lib/report-time';
import {
  GROWTH_DEPTS, GROWTH_DEPT_LABELS, JOIN_SOURCE_LABELS, MODES, cumulative, indexSeries, isSeries, peersFor, periodRows, summaries, tenureDays, workSpan,
  type Cmp, type GrowthData, type GrowthDept, type GrowthPerson, type Index, type Metric, type Mode,
} from '@/lib/growth-calc';
import { ChartCard, Definitions, EmptyState, ErrorBox, PageHeader, SegmentedControl, SkeletonTable, SortTh, StatusChip, TableWrap, ThinkingLine, pct, short, toast, useMotionOK, useSort, vi } from './ui-kit';
import { StaffPicker } from './staff-picker';
import { useApi } from './use-api';

const dmy = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
const NAV_DEPT: Record<string, GrowthDept> = { sale: 'sale', cskh: 'cskh', mkt: 'mkt', 'van-don': 'vandon' };
const CMP_OPTIONS: { value: Cmp; label: string; title: string }[] = [
  { value: 'prev', label: 'Chính mình', title: 'Tháng / quý: so kỳ liền trước. Thứ, ngày, tuần: so trung bình của chính người đó.' },
  { value: 'same', label: 'Cùng kỳ', title: 'Trung bình mọi người cùng bộ phận đang làm trong đúng các ngày đó.' },
  { value: 'new', label: 'Cùng thâm niên', title: 'Trung bình mọi người cùng bộ phận ở cùng số ngày làm (người vào trong khoảng đang xem).' },
  { value: 'batch', label: 'Cùng đợt vào', title: 'Người cùng bộ phận vào cách dưới 30 ngày, so ở cùng số ngày làm.' },
  { value: 'pick', label: 'Tự chọn', title: 'Trung bình những người anh chọn, trong đúng các ngày đó.' },
];
const pctTone = (p: number | null) => p === null ? 'text-ink-3' : p >= 0 ? 'text-good' : 'text-bad';
const signed = (p: number | null) => p === null ? '—' : `${p > 0 ? '+' : ''}${pct(p)}`;

export function GrowthView({ navDept }: { navDept?: string }) {
  const [dept, setDept] = useState<GrowthDept>(NAV_DEPT[navDept ?? ''] ?? 'sale');
  const { data, loading, error, reload } = useApi<GrowthData>(`/api/reports/growth?dept=${dept}`, { keep: false });
  const [pickedId, setPickedId] = useState('');
  const [metric, setMetric] = useState<Metric>('v');
  const idx = useMemo(() => data ? indexSeries(data) : null, [data]);
  const people = useMemo(() => data?.people ?? [], [data]);
  const sums = useMemo(() => data && idx ? summaries(data, idx, metric) : [], [data, idx, metric]);
  // Mặc định: người vào gần nhất còn đang làm (đúng chuyện "bạn A mới vào" anh hỏi).
  const fallback = useMemo(() => [...people].filter((p) => !p.left).sort((a, b) => String(b.joined ?? '').localeCompare(String(a.joined ?? '')))[0]?.id ?? people[0]?.id ?? '', [people]);
  const me = people.find((p) => p.id === pickedId) ?? people.find((p) => p.id === fallback) ?? null;
  const unitLabel = data?.unit === 'orders' ? 'Đơn xác nhận' : metric === 'v' ? 'Doanh số' : 'Đơn chốt';
  const fmt = (n: number | null) => n === null ? '—' : data?.unit === 'orders' || metric === 'n' ? vi.format(Math.round(n * 10) / 10) : short(n);
  const choose = (id: string) => { setPickedId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${GROWTH_DEPT_LABELS[dept]} · 1 năm gần nhất`} title="Tăng trưởng nhân viên"
        subtitle="Số từng ngày của mỗi người tính từ ngày vào công ty, gom theo giai đoạn và so với người cùng bộ phận" />
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl ariaLabel="Bộ phận" value={dept} onChange={(v) => { setDept(v); setPickedId(''); }}
          options={GROWTH_DEPTS.map((d) => ({ value: d, label: GROWTH_DEPT_LABELS[d] }))} />
        {data && people.length > 0 && (
          <Select value={me?.id ?? ''} items={Object.fromEntries(people.map((p) => [p.id, p.name]))} onValueChange={(v) => setPickedId(String(v))}>
            <SelectTrigger className="min-w-52 text-xs" aria-label="Nhân viên"><SelectValue /></SelectTrigger>
            <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.left ? ' (đã nghỉ)' : ''}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {data?.unit === 'money' && <SegmentedControl size="sm" ariaLabel="Số đo" value={metric} onChange={setMetric}
          options={[{ value: 'v', label: dept === 'mkt' ? 'Doanh số MKT' : 'Doanh số' }, { value: 'n', label: dept === 'mkt' ? 'Đơn xác nhận' : 'Đơn chốt' }]} />}
      </div>
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <ChartCard title="Đang tải số từng ngày"><ThinkingLine /><SkeletonTable rows={6} cols={6} /></ChartCard>}
      {data && idx && !people.length && <EmptyState text={`Chưa có số của ${GROWTH_DEPT_LABELS[dept]} trong 1 năm gần nhất.`} />}
      {data && idx && me && (
        <div className={`space-y-5 ${loading ? 'opacity-70' : ''}`}>
          <PersonLine key={me.id} me={me} data={data} onSaved={reload} />
          <CalendarCard me={me} data={data} idx={idx} metric={metric} fmt={fmt} unitLabel={unitLabel} />
          <PeriodCard me={me} data={data} idx={idx} metric={metric} fmt={fmt} unitLabel={unitLabel} />
          <AllPeople rows={sums} data={data} meId={me.id} fmt={fmt} unitLabel={unitLabel} onPick={choose} />
          <Definitions items={{
            'Ngày vào': 'Lấy theo thứ tự: sửa tay ở trang này, web nhân sự, ngày tạo tài khoản Pancake, ngày có đơn đầu tiên trong khoảng xem.',
            'Số đo': dept === 'vandon' ? 'Vận đơn: số đơn mỗi người xác nhận (theo ngày xác nhận), không tính người Sale / CSKH / MKT tự xác nhận.'
              : dept === 'mkt' ? 'Marketing: doanh số đơn đã xác nhận của từng marketer, theo ngày xác nhận, như thẻ xu hướng trang Marketing.'
              : `${GROWTH_DEPT_LABELS[dept]}: doanh số đơn chốt theo ngày chốt, chỉ người có hậu tố ${dept === 'sale' ? 'SALE' : 'CSKH'}, như thẻ xu hướng ở Tổng quan.`,
            'So sánh': 'Chỉ so với người cùng bộ phận. Cùng thâm niên và Cùng đợt vào chỉ tính người vào trong 1 năm gần nhất và đã làm đủ số ngày đó.',
            'Khoảng xem': 'Một năm gần nhất. Người vào trước đó được tính từ đầu khoảng xem.',
          }} />
        </div>
      )}
    </div>
  );
}

function PersonLine({ me, data, onSaved }: { me: GrowthPerson; data: GrowthData; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(me.joined ?? '');
  const [saving, setSaving] = useState(false);
  const tenure = tenureDays(me, data.today);
  const save = async (joinedAt: string | null) => {
    setSaving(true);
    try {
      const r = await fetch('/api/reports/growth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: me.id, joinedAt }) });
      const body = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không lưu được.');
      toast(joinedAt ? `Đã lưu ngày vào ${dmy(joinedAt)}.` : 'Đã bỏ sửa tay, dùng lại ngày từ web nhân sự / Pancake.', { kind: 'ok' });
      setEditing(false); onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'Không lưu được.', { kind: 'error' }); }
    finally { setSaving(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
      <span className="text-base font-semibold text-ink">{me.name}</span>
      {me.left && <StatusChip tone="gray">Đã nghỉ {dmy(me.left)}</StatusChip>}
      {!editing ? (
        <>
          <span className="text-ink-2">Vào {dmy(me.joined)}{me.source && <span className="text-ink-3"> · {JOIN_SOURCE_LABELS[me.source]}</span>}</span>
          {tenure !== null && <span className="text-ink-2">· đã làm <b className="num text-ink">{vi.format(tenure)}</b> ngày</span>}
          <button type="button" className="link inline-flex items-center gap-1 text-[12.5px]" onClick={() => { setValue(me.joined ?? ''); setEditing(true); }}><Pencil size={12} aria-hidden="true" />Sửa ngày vào</button>
        </>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <input type="date" className="field h-8 w-40" value={value} max={data.today} onChange={(e) => setValue(e.target.value)} aria-label="Ngày vào công ty" />
          <button type="button" className="btn primary h-8" disabled={saving || !value} onClick={() => void save(value)}>Lưu</button>
          {me.source === 'tay' && <button type="button" className="btn h-8" disabled={saving} onClick={() => void save(null)}>Bỏ sửa tay</button>}
          <button type="button" className="btn h-8" disabled={saving} onClick={() => setEditing(false)}>Huỷ</button>
        </span>
      )}
    </div>
  );
}

const SHADES = ['var(--surface-2)', 'color-mix(in srgb, var(--primary) 22%, var(--surface))', 'color-mix(in srgb, var(--primary) 45%, var(--surface))', 'color-mix(in srgb, var(--primary) 70%, var(--surface))', 'var(--primary)'];
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Lịch từng tháng (T2 → CN), ô đậm dần theo số của ngày; ô viền = ngày vào. Chạm một ô để xem số ngày đó. */
function CalendarCard({ me, data, idx, metric, fmt, unitLabel }: { me: GrowthPerson; data: GrowthData; idx: Index; metric: Metric; fmt: (n: number | null) => string; unitLabel: string }) {
  const span = workSpan(me, data);
  const [picked, setPicked] = useState<string | null>(null);
  const mine = idx.get(me.id);
  if (!span) return null;
  const months: string[] = [];
  for (let m = span.from.slice(0, 7); m <= data.today.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) months.push(m);
  const values = [...(mine?.values() ?? [])].map((d) => d[metric]).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const shade = (v: number) => v <= 0 ? SHADES[0] : v <= cuts[0] ? SHADES[1] : v <= cuts[1] ? SHADES[2] : v <= cuts[2] ? SHADES[3] : SHADES[4];
  const pick = picked ? mine?.get(picked) : undefined;
  const worked = daysBetween(span.from, span.to);
  const active = [...(mine?.entries() ?? [])].filter(([d, x]) => d >= span.from && d <= span.to && x[metric] > 0).length;
  return (
    <ChartCard icon={CalendarDays} title={`Lịch ${unitLabel.toLowerCase()} từng ngày`}
      subtitle={`${vi.format(active)}/${vi.format(worked)} ngày có số · ô viền là ngày vào · chạm một ô để xem`}>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {[...months].reverse().map((m) => {
          const first = `${m}-01`, offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
          const count = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
          const total = Array.from({ length: count }, (_, i) => mine?.get(addDays(first, i))?.[metric] ?? 0).reduce((a, b) => a + b, 0);
          return (
            <div key={m} className="shrink-0">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]"><b className="text-ink">T{Number(m.slice(5))}/{m.slice(0, 4)}</b><span className="num text-ink-3">{fmt(total)}</span></div>
              <div className="grid grid-cols-7 gap-[3px] text-[9.5px] text-ink-4">
                {WEEK.map((w) => <span key={w} className="text-center">{w}</span>)}
                {Array.from({ length: offset }, (_, i) => <span key={`e${i}`} />)}
                {Array.from({ length: count }, (_, i) => {
                  const day = addDays(first, i), v = mine?.get(day)?.[metric] ?? 0;
                  const out = day < span.from || day > span.to;
                  return (
                    <button key={day} type="button" title={`${dmy(day)}: ${fmt(v)}`} onClick={() => setPicked(day === picked ? null : day)}
                      className={`size-[18px] rounded-[4px] ${day === me.joined ? 'ring-2 ring-[var(--warn)] ring-offset-1 ring-offset-[var(--surface)]' : ''} ${day === picked ? 'outline outline-2 outline-[var(--ink)]' : ''}`}
                      style={{ background: out ? 'transparent' : shade(v), border: out ? '1px dashed var(--line)' : undefined, opacity: day > data.today ? 0.25 : 1 }} aria-label={`${dmy(day)}: ${fmt(v)}`} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
        <span className="flex items-center gap-1">Ít {SHADES.map((s) => <i key={s} className="inline-block size-3 rounded-[3px]" style={{ background: s }} />)} Nhiều</span>
        {picked && <span className="text-ink"><b>{dmy(picked)}</b> · {unitLabel}: <b className="num">{fmt(pick?.[metric] ?? 0)}</b>{metric === 'v' && data.unit === 'money' ? ` · ${vi.format(pick?.n ?? 0)} đơn` : ''}{me.joined && picked >= me.joined ? ` · ngày làm thứ ${vi.format(daysBetween(me.joined, picked))}` : ''}</span>}
      </div>
    </ChartCard>
  );
}

function PeriodCard({ me, data, idx, metric, fmt, unitLabel }: { me: GrowthPerson; data: GrowthData; idx: Index; metric: Metric; fmt: (n: number | null) => string; unitLabel: string }) {
  const [mode, setMode] = useState<Mode>('moy');
  const [cmp, setCmp] = useState<Cmp>('prev');
  const [aggPick, setAggPick] = useState<'sum' | 'avg' | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const agg = aggPick ?? (isSeries(mode) ? 'sum' : 'avg');
  const motionOn = useMotionOK();
  const rows = useMemo(() => periodRows(me, data, idx, mode, cmp, metric, agg, picks), [me, data, idx, mode, cmp, metric, agg, picks]);
  const cum = useMemo(() => cumulative(me, data, idx, cmp, metric, picks), [me, data, idx, cmp, metric, picks]);
  const peers = peersFor(cmp === 'prev' ? 'new' : cmp, me, data, picks).length;
  const cmpName = cmp === 'prev' ? (isSeries(mode) ? 'Kỳ trước' : 'TB của chính mình') : CMP_OPTIONS.find((o) => o.value === cmp)!.label;
  const chart = rows.map((r) => ({ key: r.key, label: r.label, mine: agg === 'sum' ? r.total : r.perDay, theirs: agg === 'sum' ? r.cmpTotal : r.cmpPerDay }));
  const config = { mine: { label: me.name, color: 'var(--primary)' }, theirs: { label: cmpName, color: 'var(--ink-4)' } };
  const others = data.people.filter((p) => p.id !== me.id);
  return (
    <>
      <ChartCard icon={TrendingUp} title={`Gom theo giai đoạn · ${agg === 'sum' ? 'tổng' : 'trung bình mỗi ngày làm'}`}
        subtitle={cmp === 'prev' ? undefined : `So với ${vi.format(peers)} người ${GROWTH_DEPT_LABELS[data.dept]}`}
        action={<SegmentedControl size="sm" ariaLabel="Tổng hay trung bình" value={agg} onChange={setAggPick} options={[{ value: 'sum', label: 'Tổng' }, { value: 'avg', label: 'TB/ngày' }]} />}>
        <div className="mb-3 flex flex-col gap-2">
          <div className="min-w-0 overflow-x-auto"><SegmentedControl size="sm" ariaLabel="Gom theo" value={mode} onChange={setMode} options={MODES.map(([value, label]) => ({ value, label }))} /></div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 text-[12.5px] font-semibold text-ink-2">So với:</span>
            <div className="min-w-0 overflow-x-auto"><SegmentedControl size="sm" ariaLabel="So với" value={cmp} onChange={setCmp} options={CMP_OPTIONS} /></div>
            {cmp === 'pick' && <StaffPicker staff={others.map((p) => ({ sellerId: p.id, name: p.name }))} value={picks} onChange={setPicks} />}
          </div>
        </div>
        {!rows.length ? <EmptyState text="Chưa có ngày làm trong khoảng xem." /> : (
          <>
            <ChartContainer className="h-64 w-full aspect-auto max-sm:h-56" config={config}>
              <BarChart data={chart} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={mode === 'dom' ? 2 : 0} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={(v: number) => fmt(v)} />
                <ChartTooltip cursor={{ fill: 'var(--tint-2)' }} content={<RowTip rows={rows} fmt={fmt} agg={agg} name={me.name} cmpName={cmpName} />} />
                <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
                <Bar dataKey="mine" fill="var(--color-mine)" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={motionOn} />
                <Bar dataKey="theirs" fill="var(--color-theirs)" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={motionOn} />
              </BarChart>
            </ChartContainer>
            <TableWrap className="mt-3" maxHeight="22rem" sticky>
              <table className="tbl">
                <thead><tr><th className="text-left">Giai đoạn</th><th className="r text-right">Ngày làm</th><th className="r text-right">{unitLabel}</th><th className="r text-right">TB/ngày</th><th className="r text-right">{cmpName}</th><th className="r text-right">Chênh</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.key}>
                    <td className="text-left font-medium">{r.label}</td>
                    <td className="num r text-right">{vi.format(r.days)}</td>
                    <td className="num r text-right">{fmt(r.total)}</td>
                    <td className="num r text-right">{fmt(r.perDay)}</td>
                    <td className="num r text-right text-ink-2">{fmt(agg === 'sum' ? r.cmpTotal : r.cmpPerDay)}</td>
                    <td className={`num r text-right font-semibold ${pctTone(r.pct)}`}>{signed(r.pct)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableWrap>
          </>
        )}
      </ChartCard>
      <ChartCard icon={LineIcon} title="Cộng dồn từ ngày vào"
        subtitle={!cum.length ? undefined : `Ngày làm thứ 1 → ${vi.format(cum.length)} · đường xám: ${cmp === 'prev' ? 'Cùng thâm niên' : cmpName}${cum.at(-1)?.people ? ` (${vi.format(cum.at(-1)!.people)} người ở mốc cuối)` : ''}`}>
        {!cum.length ? <EmptyState text={me.joined ? 'Người này vào trước khoảng xem 1 năm nên không cộng dồn từ ngày vào được.' : 'Chưa biết ngày vào. Bấm "Sửa ngày vào" ở trên để nhập.'} /> : (
          <ChartContainer className="h-60 w-full aspect-auto max-sm:h-52" config={{ mine: { label: me.name, color: 'var(--primary)' }, theirs: { label: cmp === 'prev' ? 'Cùng thâm niên' : cmpName, color: 'var(--ink-4)' } }}>
            <LineChart data={cum} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="t" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(t: number) => `N${t}`} />
              <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={(v: number) => fmt(v)} />
              <ChartTooltip cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} content={<CumTip rows={cum} fmt={fmt} name={me.name} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="mine" stroke="var(--color-mine)" strokeWidth={2} dot={false} isAnimationActive={motionOn} />
              <Line type="monotone" dataKey="theirs" stroke="var(--color-theirs)" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={motionOn} />
            </LineChart>
          </ChartContainer>
        )}
      </ChartCard>
    </>
  );
}

function RowTip({ active, label, rows, fmt, agg, name, cmpName }: { active?: boolean; label?: string | number; rows: ReturnType<typeof periodRows>; fmt: (n: number | null) => string; agg: 'sum' | 'avg'; name: string; cmpName: string; payload?: ReadonlyArray<unknown> }) {
  const r = active ? rows.find((x) => x.label === String(label)) : null;
  if (!r) return null;
  return (
    <div className="grid min-w-[190px] gap-1 rounded-[7px] border border-line-2 bg-surface px-2.5 py-2 text-[11.5px] text-ink shadow-float">
      <div className="text-[11px] font-medium text-ink-3">{r.label} · {vi.format(r.days)} ngày làm</div>
      <div className="flex justify-between gap-3"><span className="text-ink-2">{name}</span><b className="num">{fmt(agg === 'sum' ? r.total : r.perDay)}</b></div>
      <div className="flex justify-between gap-3"><span className="text-ink-2">{cmpName}{r.people > 1 ? ` (${vi.format(r.people)} người)` : ''}</span><b className="num">{fmt(agg === 'sum' ? r.cmpTotal : r.cmpPerDay)}</b></div>
      <div className={`border-t border-dashed border-line-2 pt-1 text-right font-semibold ${pctTone(r.pct)}`}>{signed(r.pct)}</div>
    </div>
  );
}

function CumTip({ active, label, rows, fmt, name }: { active?: boolean; label?: string | number; rows: ReturnType<typeof cumulative>; fmt: (n: number | null) => string; name: string; payload?: ReadonlyArray<unknown> }) {
  const r = active ? rows.find((x) => x.t === Number(label)) : null;
  if (!r) return null;
  return (
    <div className="grid min-w-[180px] gap-1 rounded-[7px] border border-line-2 bg-surface px-2.5 py-2 text-[11.5px] text-ink shadow-float">
      <div className="text-[11px] font-medium text-ink-3">Ngày làm thứ {vi.format(r.t)} · {dmy(r.day)}</div>
      <div className="flex justify-between gap-3"><span className="text-ink-2">{name}</span><b className="num">{fmt(r.mine)}</b></div>
      <div className="flex justify-between gap-3"><span className="text-ink-2">Trung bình so ({vi.format(r.people)} người)</span><b className="num">{fmt(r.theirs)}</b></div>
    </div>
  );
}

type SumKey = 'name' | 'joined' | 'tenure' | 'first30' | 'last30' | 'pct';
function AllPeople({ rows, data, meId, fmt, unitLabel, onPick }: { rows: ReturnType<typeof summaries>; data: GrowthData; meId: string; fmt: (n: number | null) => string; unitLabel: string; onPick: (id: string) => void }) {
  const sort = useSort<SumKey>('joined');
  const sorted = sort.apply(rows, (r, k) => r[k]);
  return (
    <ChartCard icon={Users} title={`Toàn bộ ${GROWTH_DEPT_LABELS[data.dept]} · ${vi.format(rows.length)} người`} subtitle={`${unitLabel} · bấm một dòng để xem người đó`}>
      <TableWrap maxHeight="32rem" sticky stickyFirst>
        <table className="tbl">
          <thead><tr>
            <SortTh k="name" label="Nhân viên" sort={sort} align="left" />
            <SortTh k="joined" label="Ngày vào" sort={sort} />
            <SortTh k="tenure" label="Đã làm" sort={sort} />
            <SortTh k="first30" label="30 ngày đầu" sort={sort} />
            <SortTh k="last30" label="30 ngày gần nhất" sort={sort} />
            <SortTh k="pct" label="So 30 ngày trước đó" sort={sort} />
          </tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.id} className={`cursor-pointer ${r.id === meId ? 'bg-tint-2' : ''}`} onClick={() => onPick(r.id)}>
              <td className="text-left font-medium">{r.name}{r.left && <span className="ml-1.5 text-[11px] text-ink-3">đã nghỉ</span>}</td>
              <td className="num r text-right" title={r.source ? JOIN_SOURCE_LABELS[r.source] : undefined}>{dmy(r.joined)}</td>
              <td className="num r text-right">{r.tenure === null ? '—' : `${vi.format(r.tenure)} ngày`}</td>
              <td className="num r text-right">{fmt(r.first30)}</td>
              <td className="num r text-right">{fmt(r.last30)}</td>
              <td className={`num r text-right font-semibold ${pctTone(r.pct)}`}>{signed(r.pct)}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableWrap>
    </ChartCard>
  );
}
