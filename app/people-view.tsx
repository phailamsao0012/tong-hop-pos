'use client';

// Con người (giai đoạn 5 · 26/09/2026): danh sách nhân sự, hồ sơ 360 từng người (hiệu suất 12 tháng, hạng, thành tựu, lộ trình),
// và trình tạo cấp bậc & điều kiện lên bậc cho từng bộ phận. Không có lương, hợp đồng.
import { AiPackButton } from './ai-pack';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Award, Crown, Flag, Plus, Save, Search, Trash2, TrendingUp, UserRound } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import type { Dept, Level, LevelConfig, LevelMetric, personDetail, peopleList } from '@/lib/people';
import { ICON } from './icons';
import { PosBadge } from './pos-badge';
import { openPerson, usePersonId } from './person-store';
import { useApi } from './use-api';
import { ChartCard, Definitions, DeltaPill, EmptyState, ErrorBox, KpiCard, PageHeader, SegmentedControl, SkeletonKpis, SkeletonTable, SortTh, TableWrap, delta, dt, money, pct, shortMoney, toast, useSort, vi } from './ui-kit';

type List = Awaited<ReturnType<typeof peopleList>>;
type Detail = NonNullable<Awaited<ReturnType<typeof personDetail>>>;
const DEPT_COLORS: Record<Dept, string> = { sale: '#c2410c', cskh: '#0f766e', mkt: '#a16207', other: '#64748b' };
const initials = (name: string) => name.replace(/\b(cskh|sale|mkt|tpkd)\b/gi, '').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
const monthLabel = (m: string) => `${Number(m.slice(5))}/${m.slice(2, 4)}`;
const tenure = (from: string | null) => {
  if (!from) return null;
  const a = new Date(`${from.slice(0, 10)}T00:00:00Z`), b = new Date();
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  if (b.getUTCDate() < a.getUTCDate()) months--;
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} năm` : '', m ? `${m} tháng` : '', !y && !m ? 'dưới 1 tháng' : ''].filter(Boolean).join(' ');
};

function Avatar({ name, dept, size = 36 }: { name: string; dept: Dept; size?: number }) {
  return <span className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: DEPT_COLORS[dept], fontSize: size * 0.36 }}>{initials(name) || '?'}</span>;
}
function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values), W = 90, H = 24;
  if (!values.some((v) => v > 0)) return <span className="text-[11px] text-ink-4">—</span>;
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-[90px]" aria-hidden="true">{values.map((v, i) => <rect key={i} x={i * (W / values.length) + 1} y={H - Math.max(1, v / max * H)} width={W / values.length - 3} height={Math.max(1, v / max * H)} rx={1.5} fill={color} opacity={i === values.length - 1 ? 1 : 0.45} />)}</svg>;
}

export function PeopleView({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { data: r, loading, error, reload } = useApi<List>('/api/people');
  const [dept, setDept] = useState<'all' | Dept>('all');
  const [q, setQ] = useState('');
  type K = 'revenue' | 'closedOrders' | 'dataRate' | 'lifetime' | 'rank';
  const sort = useSort<K>('revenue');
  const rows = useMemo(() => sort.apply((r?.people ?? []).filter((p) => (dept === 'all' || p.dept === dept) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))), (p, k) => k === 'rank' ? (p.rank === null ? null : -p.rank) : p[k]), [r, dept, q, sort]);
  const counts = useMemo(() => { const c: Record<string, number> = { all: r?.people.length ?? 0 }; for (const p of r?.people ?? []) c[p.dept] = (c[p.dept] ?? 0) + 1; return c; }, [r]);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={r ? `Tháng ${Number(r.month.slice(5))}/${r.month.slice(0, 4)}` : ''} title="Nhân sự" subtitle="Mỗi người một hồ sơ: hiệu suất, hạng trong bộ phận, thành tựu, lộ trình · bấm một người để mở hồ sơ"
        actions={<><Button variant="outline" onClick={() => onNavigate('org')}><UserRound size={14} />Sơ đồ tổ chức</Button><Button variant="outline" onClick={() => onNavigate('levels')}><Flag size={14} />Cấp bậc & lộ trình</Button></>} />
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl size="sm" value={dept} onChange={setDept} ariaLabel="Bộ phận"
          options={(['all', 'sale', 'cskh', 'mkt', 'other'] as const).map((d) => ({ value: d, label: `${d === 'all' ? 'Tất cả' : r?.deptLabels[d] ?? d} ${counts[d] ?? 0}` }))} />
        <span className="relative ml-auto"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" /><Input id="people-q" className="w-56 pl-8" placeholder="Tìm tên…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
      </div>
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <SkeletonTable rows={8} cols={6} />}
      {r && (
        <ChartCard icon={UserRound} title={`${rows.length} người`} subtitle="Doanh thu, đơn chốt, tỷ lệ chốt data của tháng này (% so cùng số ngày đầu tháng trước) · cột 6 tháng: tháng này đậm nhất · Marketing tính doanh thu theo người bán nên thường bằng 0, số của marketer xem ở Marketing › Chi phí & ROAS">
          {rows.length ? (
            <TableWrap minWidth={900} maxHeight="44rem" stickyFirst>
              <table className={`tbl ${loading ? 'opacity-70' : ''}`}>
                <thead><tr>
                  <th className="text-left">Nhân viên</th>
                  <th className="text-left">Cấp bậc</th>
                  <SortTh k="revenue" label="Doanh thu tháng" sort={sort} />
                  <SortTh k="rank" label="Hạng" sort={sort} />
                  <SortTh k="closedOrders" label="Đơn chốt" sort={sort} />
                  <SortTh k="dataRate" label="Chốt data" sort={sort} />
                  <th>6 tháng</th>
                  <SortTh k="lifetime" label="Từ trước tới nay" sort={sort} />
                </tr></thead>
                <tbody>{rows.map((p) => (
                  <tr key={p.id} tabIndex={0} className="cursor-pointer" onClick={() => openPerson(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') openPerson(p.id); }}>
                    <td className="text-left"><span className="flex items-center gap-2.5"><Avatar name={p.name} dept={p.dept} size={32} /><span className="min-w-0"><b className="block truncate font-medium text-ink">{p.name}</b><span className="block text-[11px] text-ink-3">{r.deptLabels[p.dept]}{p.department ? ` · ${p.department}` : ''}</span></span></span></td>
                    <td className="text-left text-[12px]">{p.level ? <span className="rounded-full bg-tint px-2 py-0.5 font-semibold text-primary">{p.level}</span> : <span className="text-ink-4">—</span>}</td>
                    <td className="n">{shortMoney(p.revenue)}<DeltaPill variant="plain" className="block" value={p.prevRevenue ? delta(p.revenue, p.prevRevenue) : null} /></td>
                    <td className="n">{p.rank ? `#${p.rank}/${p.rankOf}` : '—'}</td>
                    <td className="n">{vi.format(p.closedOrders)}</td>
                    <td className="n">{pct(p.dataRate)}</td>
                    <td><Spark values={p.spark} color={DEPT_COLORS[p.dept]} /></td>
                    <td className="n">{shortMoney(p.lifetime)}<span className="block text-[11px] text-ink-3">{p.firstDay ? `từ ${dt(p.firstDay)}` : ''}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </TableWrap>
          ) : <EmptyState text="Không có nhân viên phù hợp." />}
        </ChartCard>
      )}
    </div>
  );
}

export function PersonView({ onNavigate, canEdit }: { onNavigate: (v: string) => void; canEdit: boolean }) {
  const id = usePersonId();
  const { data: r, error, reload } = useApi<Detail>(id ? `/api/people?id=${encodeURIComponent(id)}` : null, { keep: false });
  const list = useApi<List>(canEdit ? '/api/people' : null);
  const [meta, setMeta] = useState({ joinedAt: '', managerId: '', title: '', note: '', level: '' });
  useEffect(() => { if (r) setMeta({ joinedAt: r.person.meta.joinedAt ?? '', managerId: r.person.meta.managerId ?? '', title: r.person.meta.title ?? '', note: r.person.meta.note ?? '', level: r.person.meta.level ?? '' }); }, [r]);
  if (!id) return <EmptyState text="Chọn một nhân viên ở trang Nhân sự." />;
  const back = <Button variant="ghost" onClick={() => onNavigate('people')}><ArrowLeft size={14} />Nhân sự</Button>;
  const aiPack = () => r && ({
    page: `Hồ sơ nhân viên ${r.person.name}`, period: '12 tháng gần nhất', scope: `bộ phận ${r.person.dept}`, staffNames: [r.person.name],
    facts: [['Doanh thu từ trước tới nay', Math.round(r.lifetime.revenue)], ['Đơn chốt từ trước tới nay', r.lifetime.closedOrders], ['Khách đã mua', r.customers.buyers], ['Khách mua từ 2 lần', r.customers.repeaters], ['Cấp bậc', r.levelOverride || r.level?.current?.name || '—']] as [string, string | number][],
    tables: [
      { title: 'Theo tháng', columns: ['Tháng', 'Doanh thu', 'Đơn chốt', 'GTTB', 'Chốt data', 'Hạng trong bộ phận'], rows: r.series.map((s) => [s.month, Math.round(s.revenue), s.closedOrders, s.aov === null ? null : Math.round(s.aov), pct(s.dataRate), s.rank ? `${s.rank}/${s.peers}` : '—']) },
      ...(r.level?.next ? [{ title: `Điều kiện lên bậc ${r.level.next.name}`, columns: ['Chỉ số', 'Ngưỡng', 'Số tháng cần', 'Đã đạt liền'], rows: r.level.next.progress.map((c) => [c.metric, c.min, c.months, c.streak]) }] : []),
    ],
    definitions: r.definitions,
    questions: ['Người này đang tiến bộ hay đi xuống? Điểm mạnh, điểm yếu?', 'Cần làm gì để lên bậc kế tiếp, trong bao lâu?', 'Gợi ý 3 việc kèm cặp cụ thể cho tháng tới.'],
  });
  if (error && !r) return <div className="space-y-4">{back}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!r) return <div className="space-y-4">{back}<SkeletonKpis count={4} /><SkeletonTable rows={4} cols={4} /></div>;
  const p = r.person, cur = r.series[r.series.length - 1], prev = r.series[r.series.length - 2];
  const since = r.person.meta.joinedAt || r.lifetime.firstDay;
  const save = async () => {
    const res = await fetch('/api/people', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, meta }) });
    if (res.ok) { toast('Đã lưu thông tin nhân sự'); reload(); } else toast('Không lưu được', { kind: 'error' });
  };
  const chart = r.series.map((s) => ({ ...s, label: monthLabel(s.month), revM: Math.round(s.revenue / 1e5) / 10 }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">{back}<AiPackButton pack={aiPack} /></div>
      <section className="card flex flex-wrap items-center gap-5 p-5">
        <Avatar name={p.name} dept={p.dept} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="display m-0 text-2xl font-semibold text-ink">{p.name}</h1>
          <p className="m-0 mt-1 text-[13px] text-ink-2">{p.meta.title || p.department || '—'} · {({ sale: 'Sale', cskh: 'CSKH', mkt: 'Marketing', other: 'Khác' } as const)[p.dept]}{p.manager ? ` · quản lý: ${p.manager}` : ''}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            {since && <span className="rounded-full bg-good-bg px-2 py-0.5 font-semibold text-t-green">♥ {tenure(since)}{r.person.meta.joinedAt ? ' làm việc' : ' có đơn'}</span>}
            {(r.levelOverride || r.level?.current) && <span className="rounded-full bg-tint px-2 py-0.5 font-semibold text-primary">{r.levelOverride || r.level?.current?.name}</span>}
            {p.posIds.map((id) => <PosBadge key={id} posId={id} size={18} />)}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard icon={ICON.revenue} tone="teal" label="Doanh thu tháng này" value={shortMoney(cur?.revenue)} delta={r.prevSameDays && cur ? delta(cur.revenue, r.prevSameDays) : null} deltaLabel="so cùng kỳ tháng trước" note={`Cả tháng trước ${shortMoney(prev?.revenue)}`} tooltip={{ current: money(cur?.revenue), previous: money(r.prevSameDays), previousLabel: 'Cùng số ngày đầu tháng trước', definition: r.definitions.source }} />
        <KpiCard icon={Crown} tone="purple" label="Hạng trong bộ phận" value={cur?.rank ? `#${cur.rank} / ${cur.peers}` : '—'} note={prev?.rank ? `Tháng trước #${prev.rank}` : ''} tooltip={{ current: cur?.rank ? `#${cur.rank}` : '—', definition: r.definitions.rank }} />
        <KpiCard icon={ICON.closed} tone="green" label="Đơn chốt tháng này" value={vi.format(cur?.closedOrders ?? 0)} note={`GTTB ${shortMoney(cur?.aov)} · chốt data ${pct(cur?.dataRate)}`} />
        <KpiCard icon={ICON.customers} tone="blue" label="Khách đã mua" value={vi.format(r.customers.buyers)} note={`${vi.format(r.customers.repeaters)} khách mua từ 2 lần · ${shortMoney(r.lifetime.revenue)} từ trước tới nay`} tooltip={{ current: vi.format(r.customers.buyers), definition: r.definitions.customers }} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ChartCard icon={TrendingUp} title="12 tháng gần nhất" subtitle="Cột = doanh thu (triệu ₫), đường = hạng trong bộ phận (càng cao càng tốt)" info={r.definitions.source}>
          <ChartContainer className="h-64 w-full aspect-auto" config={{ revM: { label: 'Doanh thu (triệu ₫)', color: DEPT_COLORS[p.dept] }, rank: { label: 'Hạng', color: 'var(--ink-2)' } }}>
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis yAxisId="m" tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="r" orientation="right" reversed allowDecimals={false} tickLine={false} axisLine={false} width={28} domain={[1, 'dataMax']} />
              <ChartTooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0].payload as (typeof chart)[number];
                return <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"><b className="text-ink">Tháng {s.label}</b><div>Doanh thu <b className="num">{money(s.revenue)}</b></div><div>{vi.format(s.closedOrders)} đơn chốt · GTTB {shortMoney(s.aov)}</div><div>Hạng {s.rank ? `#${s.rank}/${s.peers}` : '—'}</div></div>;
              }} />
              <Bar yAxisId="m" dataKey="revM" fill="var(--color-revM)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="rank" stroke="var(--color-rank)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ChartContainer>
        </ChartCard>
        <div className="grid gap-4">
          <ChartCard icon={Award} title="Thành tựu" subtitle="Tự tính từ số bán hàng thật">
            {r.achievements.length ? (
              <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
                {r.achievements.map((a) => (
                  <li key={a.key} className="rounded-xl bg-amber-50 p-2.5 text-center dark:bg-[var(--warn-bg)]" title={a.detail}>
                    <span className="mx-auto mb-1 grid size-9 place-items-center rounded-full bg-[var(--warn-bg)] text-[var(--warn)]"><Award size={18} /></span>
                    <b className="block text-[12px] leading-tight text-ink">{a.title}</b>
                  </li>
                ))}
              </ul>
            ) : <EmptyState text="Chưa có thành tựu." />}
          </ChartCard>
          <ChartCard icon={Flag} title="Lộ trình" subtitle={r.level ? 'Theo điều kiện ở Cấp bậc & lộ trình' : 'Bộ phận này chưa có cấp bậc'} info={r.definitions.level}
            more={{ label: 'Sửa cấp bậc', onClick: () => onNavigate('levels') }}>
            {r.level && r.level.path.length ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  {r.level.path.map((l, i) => (
                    <span key={l.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-ink-4">→</span>}
                      <span className={`rounded-lg px-2 py-1 font-semibold ${l.state === 'done' ? 'bg-primary text-[var(--primary-ink)]' : l.state === 'next' ? 'border border-dashed border-primary text-primary' : 'bg-surface-2 text-ink-3'}`}>{l.name}</span>
                    </span>
                  ))}
                </div>
                {r.level.next && (
                  <ul className="m-0 list-none space-y-1.5 p-0 text-[12px]">
                    <li className="text-ink-3">Để lên <b className="text-ink">{r.level.next.name}</b>:</li>
                    {r.level.next.progress.map((c, i) => (
                      <li key={i} className="flex items-center gap-2"><i className={`size-2 rounded-full ${c.done ? 'bg-[var(--good)]' : 'bg-[var(--warn)]'}`} />
                        <span className="text-ink">{({ revenue: 'Doanh thu', closedOrders: 'Đơn chốt', aov: 'GTTB', dataRate: 'Chốt data' } as Record<LevelMetric, string>)[c.metric]} ≥ {c.metric === 'dataRate' ? `${c.min}%` : c.metric === 'closedOrders' ? vi.format(c.min) : shortMoney(c.min)} trong {c.months} tháng liền</span>
                        <span className="ml-auto text-ink-3">đạt {c.streak}/{c.months}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            ) : <EmptyState text="Chưa đặt cấp bậc cho bộ phận này." />}
          </ChartCard>
        </div>
      </div>

      {canEdit && (
        <ChartCard icon={UserRound} title="Thông tin quản lý" subtitle="Chỉ chủ hệ thống sửa · không lưu lương, hợp đồng">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-[12px] text-ink-3">Ngày vào làm<Input id="pm-joined" type="date" value={meta.joinedAt} onChange={(e) => setMeta({ ...meta, joinedAt: e.target.value })} /></label>
            <label className="grid gap-1 text-[12px] text-ink-3">Chức danh<Input id="pm-title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="VD: CSKH chính thức" /></label>
            <label className="grid gap-1 text-[12px] text-ink-3">Quản lý trực tiếp
              <select id="pm-manager" className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink" value={meta.managerId} onChange={(e) => setMeta({ ...meta, managerId: e.target.value })}>
                <option value="">—</option>{(list.data?.people ?? []).filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
            <label className="grid gap-1 text-[12px] text-ink-3">Cấp bậc (ghi đè, để trống = tự xét)<Input id="pm-level" value={meta.level} onChange={(e) => setMeta({ ...meta, level: e.target.value })} /></label>
            <label className="grid gap-1 text-[12px] text-ink-3 sm:col-span-2 xl:col-span-4">Ghi nhận / nhắc nhở<textarea id="pm-note" className="min-h-20 rounded-md border border-line bg-surface p-2 text-sm text-ink" value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} /></label>
          </div>
          <div className="mt-3"><Button onClick={() => void save()}><Save size={14} />Lưu</Button></div>
        </ChartCard>
      )}
      <Definitions items={r.definitions} />
    </div>
  );
}

// ---------- Cấp bậc & lộ trình ----------
type LevelsResp = { levels: LevelConfig; metrics: Record<LevelMetric, { label: string; unit: string }> };
export function LevelsView({ onNavigate, canEdit }: { onNavigate: (v: string) => void; canEdit: boolean }) {
  const { data, error, reload } = useApi<LevelsResp>('/api/people?levels=1', { keep: false });
  const [dept, setDept] = useState<'sale' | 'cskh' | 'mkt'>('cskh');
  const [cfg, setCfg] = useState<LevelConfig | null>(null);
  useEffect(() => { if (data) setCfg(data.levels); }, [data]);
  const levels = cfg?.[dept] ?? [];
  const set = (next: Level[]) => cfg && setCfg({ ...cfg, [dept]: next });
  const save = async () => {
    const res = await fetch('/api/people', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ levels: cfg }) });
    if (res.ok) { toast('Đã lưu cấp bậc'); reload(); } else toast('Không lưu được', { kind: 'error' });
  };
  const sample = () => set([
    { id: 'thu-viec', name: 'Thử việc', conditions: [{ metric: 'revenue', min: 0, months: 1 }] },
    { id: 'chinh-thuc', name: 'Chính thức', conditions: [{ metric: 'revenue', min: 80e6, months: 2 }] },
    { id: 'gioi', name: 'Giỏi', conditions: [{ metric: 'revenue', min: 150e6, months: 3 }, { metric: 'closedOrders', min: 120, months: 3 }] },
    { id: 'truong-nhom', name: 'Trưởng nhóm', conditions: [{ metric: 'revenue', min: 250e6, months: 3 }] },
  ]);
  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={() => onNavigate('people')}><ArrowLeft size={14} />Nhân sự</Button>
      <PageHeader title="Cấp bậc & lộ trình" subtitle="Tạo các bậc cho từng bộ phận và điều kiện lên bậc: chỉ số + ngưỡng + số tháng liền. Hệ thống tự xét ai đã đạt, ai còn thiếu gì." />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <SkeletonTable rows={4} cols={3} />}
      {cfg && (
        <ChartCard icon={Flag} title="Các bậc" subtitle="Bậc sau cao hơn bậc trước · nhân viên đạt bậc cao nhất mà mọi điều kiện đều đủ"
          action={<SegmentedControl size="sm" value={dept} onChange={setDept} ariaLabel="Bộ phận" options={[{ value: 'sale', label: 'Sale' }, { value: 'cskh', label: 'CSKH' }, { value: 'mkt', label: 'Marketing' }]} />}>
          <div className="space-y-3">
            {levels.map((lv, i) => (
              <div key={i} className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-primary text-[12px] font-bold text-[var(--primary-ink)]">{i + 1}</span>
                  <Input id={`lv-name-${i}`} className="max-w-64" value={lv.name} disabled={!canEdit} onChange={(e) => set(levels.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  {canEdit && <button type="button" aria-label="Xóa bậc" className="ml-auto grid size-8 place-items-center rounded-md text-ink-3 hover:bg-bad-bg hover:text-bad" onClick={() => set(levels.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
                </div>
                <div className="mt-2 space-y-2 pl-9">
                  {lv.conditions.map((c, k) => (
                    <div key={k} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <select id={`lv-${i}-m-${k}`} className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-ink" disabled={!canEdit} value={c.metric}
                        onChange={(e) => set(levels.map((x, j) => j === i ? { ...x, conditions: x.conditions.map((y, n) => n === k ? { ...y, metric: e.target.value as LevelMetric } : y) } : x))}>
                        {Object.entries(data!.metrics).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
                      </select>
                      <span className="text-ink-3">≥</span>
                      <Input id={`lv-${i}-v-${k}`} className="w-36" inputMode="numeric" disabled={!canEdit} value={vi.format(c.min)} onChange={(e) => set(levels.map((x, j) => j === i ? { ...x, conditions: x.conditions.map((y, n) => n === k ? { ...y, min: Number(e.target.value.replace(/[^\d]/g, '')) || 0 } : y) } : x))} />
                      <span className="text-ink-3">{data!.metrics[c.metric].unit} trong</span>
                      <Input id={`lv-${i}-n-${k}`} className="w-16" inputMode="numeric" disabled={!canEdit} value={c.months} onChange={(e) => set(levels.map((x, j) => j === i ? { ...x, conditions: x.conditions.map((y, n) => n === k ? { ...y, months: Math.max(1, Math.min(12, Number(e.target.value) || 1)) } : y) } : x))} />
                      <span className="text-ink-3">tháng liền</span>
                      {canEdit && <button type="button" aria-label="Xóa điều kiện" className="grid size-8 place-items-center rounded-md text-ink-3 hover:text-bad" onClick={() => set(levels.map((x, j) => j === i ? { ...x, conditions: x.conditions.filter((_, n) => n !== k) } : x))}><Trash2 size={13} /></button>}
                    </div>
                  ))}
                  {canEdit && <button type="button" className="text-[12.5px] font-medium text-primary hover:underline" onClick={() => set(levels.map((x, j) => j === i ? { ...x, conditions: [...x.conditions, { metric: 'revenue', min: 0, months: 1 }] } : x))}>+ Thêm điều kiện</button>}
                </div>
              </div>
            ))}
            {!levels.length && <EmptyState text="Bộ phận này chưa có bậc nào." />}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => set([...levels, { id: `lv${Date.now().toString(36)}`, name: `Bậc ${levels.length + 1}`, conditions: [{ metric: 'revenue', min: 0, months: 1 }] }])}><Plus size={14} />Thêm bậc</Button>
                {!levels.length && <Button variant="outline" onClick={sample}>Dùng mẫu gợi ý</Button>}
                <Button onClick={() => void save()}><Save size={14} />Lưu cấp bậc</Button>
              </div>
            )}
            {!canEdit && <p className="m-0 text-[12px] text-ink-3">Chỉ chủ hệ thống sửa được cấp bậc.</p>}
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ---------- Sơ đồ tổ chức & mục tiêu phân tầng ----------
type Org = { month: string; day: number; daysInMonth: number; company: { target: number; revenue: number }; deptLabels: Record<Dept, string>;
  people: { id: string; name: string; dept: Dept; managerId: string | null; title: string | null; level: string | null; revenue: number; target: number; forecast: number }[] };
type OrgNode = { key: string; label: string; sub?: string; revenue: number; target: number; forecast: number; color: string; personId?: string; children: OrgNode[] };

function Progress({ n, pace }: { n: OrgNode; pace: number }) {
  const p = n.target ? n.revenue / n.target * 100 : null;
  const f = n.target ? n.forecast / n.target * 100 : null;
  return (
    <div className="mt-1.5">
      <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
        {p !== null && <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, p)}%`, background: p >= pace ? 'var(--good)' : p >= pace * 0.85 ? 'var(--warn)' : 'var(--bad)' }} />}
        {n.target > 0 && <i className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${pace}%` }} title="Tiến độ nên đạt tới hôm nay" />}
      </div>
      <p className="m-0 mt-1 text-[11px] text-ink-3">{shortMoney(n.revenue)}{n.target ? ` / ${shortMoney(n.target)} · ${pct(p, 0)} · dự báo ${pct(f, 0)}` : ' · chưa đặt mục tiêu'}</p>
    </div>
  );
}

function Node({ n, pace, depth }: { n: OrgNode; pace: number; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const body = (
    <div className={`rounded-xl border border-line bg-surface p-3 ${n.personId ? 'cursor-pointer hover:border-[var(--ring)]' : ''}`} onClick={n.personId ? () => openPerson(n.personId!) : undefined}
      {...(n.personId ? { role: 'button', tabIndex: 0, 'aria-label': `Mở hồ sơ ${n.label}`, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPerson(n.personId!); } } } : {})}>
      <div className="flex items-center gap-2">
        <i className="size-2.5 shrink-0 rounded-full" style={{ background: n.color }} />
        <b className="min-w-0 truncate text-[13px] text-ink">{n.label}</b>
        {n.children.length > 0 && <button type="button" className="ml-auto text-[11.5px] text-ink-3 hover:text-primary" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? 'Thu gọn' : `Mở ${n.children.length}`}</button>}
      </div>
      {n.sub && <p className="m-0 text-[11px] text-ink-3">{n.sub}</p>}
      <Progress n={n} pace={pace} />
    </div>
  );
  return (
    <li className="list-none">
      {body}
      {open && n.children.length > 0 && (
        <ul className={`m-0 mt-2 grid gap-2 border-l border-dashed border-line pl-4 ${depth >= 1 ? 'sm:grid-cols-2 xl:grid-cols-3' : ''}`}>
          {n.children.map((c) => <Node key={c.key} n={c} pace={pace} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

export function OrgView({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { data: r, error, reload } = useApi<Org>('/api/people?org=1');
  const tree = useMemo<OrgNode | null>(() => {
    if (!r) return null;
    const sum = (xs: OrgNode[], k: 'revenue' | 'target' | 'forecast') => xs.reduce((a, x) => a + x[k], 0);
    const person = (p: Org['people'][number]): OrgNode => ({ key: p.id, label: p.name, sub: [p.title, p.level].filter(Boolean).join(' · ') || undefined, revenue: p.revenue, target: p.target, forecast: p.forecast, color: DEPT_COLORS[p.dept], personId: p.id, children: [] });
    const depts = (['sale', 'cskh', 'mkt', 'other'] as Dept[]).map((d) => {
      const ps = r.people.filter((p) => p.dept === d && (p.revenue > 0 || p.target > 0));
      const ids = new Set(ps.map((p) => p.id));
      // Nhóm theo quản lý trực tiếp (ghi ở hồ sơ); ai chưa gán quản lý đứng thẳng dưới bộ phận.
      const managers = [...new Set(ps.map((p) => p.managerId).filter((m): m is string => !!m))];
      const groups: OrgNode[] = managers.map((m) => {
        const mgr = r.people.find((p) => p.id === m);
        const kids = ps.filter((p) => p.managerId === m).map(person);
        const self = mgr && ids.has(m) && !(mgr.managerId && managers.includes(mgr.managerId)) ? [person(mgr)] : [];
        const all = [...self, ...kids];
        return { key: `g-${m}`, label: `Nhóm ${mgr?.name ?? ''}`, sub: `${all.length} người`, revenue: sum(all, 'revenue'), target: sum(all, 'target'), forecast: sum(all, 'forecast'), color: DEPT_COLORS[d], personId: undefined, children: all };
      });
      const inGroup = new Set(groups.flatMap((g) => g.children.map((c) => c.key)));
      const rest = ps.filter((p) => !inGroup.has(p.id)).sort((a, b) => b.revenue - a.revenue).map(person);
      const children = [...groups, ...rest];
      return { key: d, label: r.deptLabels[d], sub: `${ps.length} người`, revenue: sum(children, 'revenue'), target: sum(children, 'target'), forecast: sum(children, 'forecast'), color: DEPT_COLORS[d], children };
    }).filter((d) => d.children.length);
    return { key: 'co', label: 'MEGATECH', sub: 'Mục tiêu công ty = tổng mục tiêu tháng của 6 POS', revenue: r.company.revenue, target: r.company.target, forecast: r.day ? r.company.revenue / r.day * r.daysInMonth : 0, color: '#17684b', children: depts };
  }, [r]);
  const pace = r ? r.day / r.daysInMonth * 100 : 0;
  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={() => onNavigate('people')}><ArrowLeft size={14} />Nhân sự</Button>
      <PageHeader eyebrow={r ? `Tháng ${Number(r.month.slice(5))}/${r.month.slice(0, 4)} · ngày ${r.day}/${r.daysInMonth}` : ''} title="Sơ đồ tổ chức & mục tiêu"
        subtitle="Công ty → bộ phận → nhóm (theo quản lý trực tiếp ghi ở hồ sơ) → từng người · vạch đen = tiến độ nên đạt tới hôm nay · bấm một người để mở hồ sơ" />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <SkeletonTable rows={6} cols={3} />}
      {tree && <ul className="m-0 p-0"><Node n={tree} pace={pace} depth={0} /></ul>}
      <Definitions items={{ target: 'Mục tiêu người = mục tiêu doanh thu tháng đặt ở Cấu hình → Mục tiêu tháng (KPI CSKH theo đầu người); bộ phận / nhóm = cộng mục tiêu các người trong đó. Công ty = tổng mục tiêu các POS.', pace: 'Màu thanh: xanh khi đạt ít nhất tiến độ nên có tới hôm nay, vàng khi đạt từ 85% mức đó, đỏ khi thấp hơn. Dự báo = doanh thu trung bình mỗi ngày × số ngày của tháng.', group: 'Nhóm lấy từ ô Quản lý trực tiếp trong hồ sơ từng người (chủ hệ thống sửa).' }} />
    </div>
  );
}
