'use client';

// Hồ sơ làm việc siêu chi tiết của một nhân sự (anh Vũ 03/11/2026, nhắc 07/11). Từ 09/11 là trang riêng "Hồ sơ nhân sự"; bấm tên
// ở bất kỳ bảng nào chuyển sang trang này (openStaffProfile). Số tính ở lib/reports/staff-profile.ts.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { currentStaffProfile, openStaffProfile, subscribeStaffProfile } from './staff-profile-link';
import { filterPeople, type ProfileDeptFilter, type ProfilePerson } from '@/lib/reports/staff-profile-list';
import { todayVn } from '@/lib/shared/report-time';
import { ArrowLeft, Award, CalendarDays, Crown, Flag, Package, Search, TrendingUp, UserRound, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { JOIN_SOURCE_LABELS } from '@/lib/reports/growth-calc';
import { RATE_THRESHOLDS } from '@/lib/reports/metrics';
import type { MonthRow, StaffProfile } from '@/lib/reports/staff-profile';
import { STAFF_STATUSES } from '@/lib/teams/staff-status';
import { ORDER_STATUS } from '@/lib/pancake/pancake';
import { useStaffStatus, STATUS_CLASS } from './staff-name';
import { SegmentedControl, money, pct, shortMoney, vi } from './ui-kit';
import { BadgeShelf } from './staff-badges';
import { apiJson } from './api-fetch';

const DEPT: Record<string, string> = { sale: 'Sale', cskh: 'CSKH', mkt: 'Marketing' };
const mLabel = (m: string) => `${m.slice(5)}/${m.slice(2, 4)}`;
const dmyFull = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const daysSince = (d: string | null, today: string) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : null);

function Fact({ icon: Icon, label, value, note }: { icon: typeof CalendarDays; label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-ink-3"><Icon size={13} aria-hidden="true" />{label}</p>
      <p className="num mt-1 text-[15px] font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-ink-3">{note}</p>}
    </div>
  );
}

function Achievement({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <li className="flex items-start gap-2.5 rounded-xl bg-surface-2 p-3">
      <Award size={18} className="mt-0.5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
      <div className="min-w-0"><p className="text-[12px] text-ink-3">{title}</p><p className="num font-semibold">{value}</p><p className="text-[11px] text-ink-3">{note}</p></div>
    </li>
  );
}

/** Nhận xét ngắn từ số: tháng này so tháng trước, so trung bình, xu hướng 3 tháng. */
export function insights(p: StaffProfile, today: string): string[] {
  const out: string[] = [], ms = p.months, cur = ms.find((m) => m.month === today.slice(0, 7)), done = ms.filter((m) => m.month < today.slice(0, 7));
  const prev = done.at(-1);
  if (cur && prev && prev.net > 0) {
    const day = Number(today.slice(8, 10)), len = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
    const pace = cur.net / day * len;
    out.push(`Tháng này nếu giữ nhịp hiện tại sẽ đạt khoảng ${shortMoney(pace)}, ${pace >= prev.net ? 'cao hơn' : 'thấp hơn'} tháng trước (${shortMoney(prev.net)}).`);
  }
  if (done.length >= 3) {
    const last3 = done.slice(-3), avg = done.reduce((a, m) => a + m.net, 0) / done.length;
    const up = last3[2].net > last3[1].net && last3[1].net > last3[0].net, down = last3[2].net < last3[1].net && last3[1].net < last3[0].net;
    if (up) out.push('Doanh số tăng liền 3 tháng gần nhất.');
    if (down) out.push('Doanh số giảm liền 3 tháng gần nhất, nên xem lại.');
    out.push(`Trung bình mỗi tháng ${shortMoney(avg)} trên ${done.length} tháng đã qua.`);
  }
  const rated = done.filter((m) => m.rate !== null && m.orders >= 30);
  if (rated.length) {
    const avg = rated.reduce((a, m) => a + (m.rate ?? 0), 0) / rated.length;
    out.push(`Tỷ lệ chốt trung bình ${pct(avg, 1)}${avg >= RATE_THRESHOLDS.good ? ', đạt mức xanh 42%' : ', dưới mức 42%'}.`);
  }
  if (p.topMonths.length) out.push(`Lọt top ${p.topMonths.length} tháng: ${p.topMonths.map((m) => `${mLabel(m.month)} (hạng ${m.rank})`).join(', ')}.`);
  return out;
}

function MonthCharts({ months, mkt }: { months: MonthRow[]; mkt: boolean }) {
  const data = months.map((m) => ({ key: mLabel(m.month), net: m.net, normal: m.rank !== null && m.rank <= 3 ? 0 : m.net, topNet: m.rank !== null && m.rank <= 3 ? m.net : 0, orders: m.closedOrders, rate: m.rate === null ? null : Math.round(m.rate * 10) / 10, top: m.rank !== null && m.rank <= 3 }));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-line p-3">
        <h4 className="text-[13px] font-semibold">Doanh số từng tháng</h4>
        <p className="text-[11px] text-ink-3">Cột cam = tháng lọt top 3 bộ phận</p>
        <ChartContainer config={{ net: { label: 'Doanh số', color: 'var(--primary)' } }} className="mt-2 aspect-auto h-52 w-full">
          <BarChart data={data} margin={{ left: 0, right: 4 }}>
            <CartesianGrid vertical={false} /><XAxis dataKey="key" tick={{ fontSize: 11 }} minTickGap={8} />
            <YAxis width={44} tick={{ fontSize: 11 }} tickFormatter={(n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(1)}tỷ` : `${Math.round(n / 1e6)}tr`)} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(typeof v === 'number' ? v : null)} />} />
            <Bar dataKey="normal" name="Doanh số" stackId="n" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="topNet" name="Doanh số (lọt top)" stackId="n" fill="var(--warn)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </section>
      <section className="min-w-0 rounded-xl border border-line p-3">
        <h4 className="text-[13px] font-semibold">{mkt ? 'Đơn xác nhận từng tháng' : 'Tỷ lệ chốt từng tháng'}</h4>
        <p className="text-[11px] text-ink-3">{mkt ? 'Đơn do marketer mang về đã xác nhận' : 'Vạch ngang = mức xanh 42%'}</p>
        <ChartContainer config={{ rate: { label: 'Tỷ lệ chốt', color: 'var(--primary)' }, orders: { label: 'Đơn', color: 'var(--primary)' } }} className="mt-2 aspect-auto h-52 w-full">
          {mkt ? (
            <BarChart data={data} margin={{ left: 0, right: 4 }}><CartesianGrid vertical={false} /><XAxis dataKey="key" tick={{ fontSize: 11 }} minTickGap={8} /><YAxis width={40} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="orders" name="Đơn" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart>
          ) : (
            <LineChart data={data} margin={{ left: 0, right: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="key" tick={{ fontSize: 11 }} minTickGap={8} />
              <YAxis width={36} domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(n: number) => `${n}%`} />
              <ReferenceLine y={RATE_THRESHOLDS.good} stroke="var(--good)" strokeDasharray="4 3" />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => (typeof v === 'number' ? `${String(v).replace('.', ',')}%` : '—')} />} />
              <Line dataKey="rate" name="Tỷ lệ chốt" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} /></LineChart>
          )}
        </ChartContainer>
      </section>
    </div>
  );
}

const chip = (on: boolean) => `tap rounded-full border px-2.5 py-1 ${on ? 'border-primary bg-primary text-primary-foreground font-semibold' : 'border-line hover:bg-surface-2'}`;

/** Hàng POS người này có tài khoản: bấm để chọn một hay nhiều POS, "Tất cả" để bỏ chọn (anh Vũ 07/11). */
function PosPick({ data, onPick }: { data: StaffProfile; onPick?: (pos: string[]) => void }) {
  if (!data.pos.length) return null;
  const sel = data.posSel, toggle = (id: string) => onPick?.(sel.includes(id) ? sel.filter((p) => p !== id) : [...sel, id]);
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0 text-[12px]">
      <legend className="sr-only">Chọn POS</legend>
      <span className="text-ink-3">POS:</span>
      <button type="button" aria-pressed={!sel.length} className={chip(!sel.length)} onClick={() => onPick?.([])}>Tất cả</button>
      {data.pos.map((p) => <button key={p.id} type="button" aria-pressed={sel.includes(p.id)} className={chip(sel.includes(p.id))} onClick={() => toggle(p.id)}>{p.name}</button>)}
    </fieldset>
  );
}

export function StaffProfileBody({ data, today, onPick }: { data: StaffProfile; today: string; onPick?: (pos: string[]) => void }) {
  const status = useStaffStatus()[data.id] ?? 'working';
  const mkt = data.dept === 'mkt', notes = insights(data, today), worked = daysSince(data.tenure?.joined ?? null, today);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className={`rounded-full bg-surface-2 px-2.5 py-1 font-semibold ${STATUS_CLASS[status]}`}>{STAFF_STATUSES[status]}</span>
        {data.dept && <span className="rounded-full bg-surface-2 px-2.5 py-1">{DEPT[data.dept]}</span>}
        {data.tenure && <span className="rounded-full bg-surface-2 px-2.5 py-1 num">T{data.tenure.t} · {worked !== null ? `${vi.format(worked)} ngày` : ''}</span>}
      </div>
      <PosPick data={data} onPick={onPick} />

      <section aria-label="Các mốc" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Fact icon={CalendarDays} label="Ngày vào làm" value={dmyFull(data.tenure?.joined)} note={data.tenure ? `theo ${JOIN_SOURCE_LABELS[data.tenure.source]}` : 'chưa có ngày vào'} />
        <Fact icon={UserRound} label="Có tài khoản POS" value={dmyFull(data.posCreated)} note={data.pos.length ? `${data.pos.length} POS` : undefined} />
        <Fact icon={Flag} label="Ngày có đơn đầu tiên" value={dmyFull(data.firstOrderDay)}
          note={data.firstOrder ? `đơn ${data.firstOrder.orderId} · ${shortMoney(data.firstOrder.net)} · ${ORDER_STATUS[data.firstOrder.status] ?? ''}` : undefined} />
        <Fact icon={TrendingUp} label="Có đơn gần nhất" value={dmyFull(data.lastOrderDay)} />
      </section>

      <section>
        <h4 className="mb-2 text-[13px] font-semibold">Huy hiệu ({data.badges.length})</h4>
        <BadgeShelf badges={data.badges} />
      </section>

      {notes.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-3">
          <h4 className="mb-1.5 text-[13px] font-semibold">Phân tích nhanh</h4>
          <ul className="list-disc space-y-1 pl-5 text-[13px]">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><Crown size={15} aria-hidden="true" />Thành tích tốt nhất</h4>
        <ul className="grid gap-2 sm:grid-cols-3">
          <Achievement title="Tháng doanh số cao nhất" value={data.best.month ? shortMoney(data.best.month.net) : '—'} note={data.best.month ? `tháng ${mLabel(data.best.month.month)}${data.best.month.rank ? ` · hạng ${data.best.month.rank}/${data.best.month.of}` : ''}` : 'chưa có'} />
          <Achievement title="Ngày doanh số cao nhất" value={data.best.day ? shortMoney(data.best.day.net) : '—'} note={data.best.day ? `${dmyFull(data.best.day.day)} · ${vi.format(data.best.day.orders)} đơn` : 'chưa có'} />
          {!mkt && <Achievement title="Tháng tỷ lệ chốt cao nhất" value={data.best.rateMonth ? pct(data.best.rateMonth.rate, 1) : '—'} note={data.best.rateMonth ? `tháng ${mLabel(data.best.rateMonth.month)} · ${vi.format(data.best.rateMonth.orders)} đơn lên` : 'cần tháng có từ 30 đơn lên'} />}
        </ul>
      </section>

      {data.months.length > 0 && <MonthCharts months={data.months} mkt={mkt} />}

      {data.months.length > 0 && (
        <section className="min-w-0">
          <h4 className="mb-2 text-[13px] font-semibold">Từng tháng</h4>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {[...data.months].reverse().map((m) => (
              <li key={m.month} className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-[13px]">
                <span className="num font-semibold">{mLabel(m.month)}</span>
                <span className="num min-w-0 truncate text-ink-2">{shortMoney(m.net)} · {vi.format(m.closedOrders)} đơn{m.rate !== null && <> · <span className={m.rate >= RATE_THRESHOLDS.good ? 'text-good' : 'text-bad'}>{pct(m.rate, 1)}</span></>}</span>
                <span className={`num text-[12px] ${m.rank !== null && m.rank <= 3 ? 'font-semibold text-[var(--warn)]' : 'text-ink-3'}`}>{m.rank ? `hạng ${m.rank}/${m.of}` : '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.products.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><Package size={15} aria-hidden="true" />Sản phẩm bán nhiều nhất tháng {mLabel(data.productsMonth)}</h4>
          <ul className="space-y-1.5">
            {data.products.map((p) => (
              <li key={p.name} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 text-[13px]">
                <span className="truncate">{p.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full bg-primary" style={{ width: `${p.quantity / data.products[0].quantity * 100}%` }} /></span>
                <span className="num text-right">{vi.format(p.quantity)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-ink-3">{Object.values(data.definitions).map((d) => <li key={d}>{d}</li>)}</ul>
    </div>
  );
}

/** Trang Hồ sơ nhân sự (anh Vũ 09/11/2026: trang riêng, tách bạch, chỉ anh và anh Nghĩa xem). Trái: tìm tên + lọc bộ phận + danh sách;
 *  phải: hồ sơ người đang chọn. Điện thoại: một cột, chọn người thì hiện hồ sơ, nút "Danh sách" để quay lại. Mã người ghi lên địa chỉ (?id=) để F5 giữ nguyên. */
export function StaffProfilePage({ onBack }: { onBack?: () => void }) {
  const [today] = useState(() => todayVn());
  const target = useSyncExternalStore(subscribeStaffProfile, currentStaffProfile, () => null);
  const status = useStaffStatus();
  const [people, setPeople] = useState<ProfilePerson[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState<ProfileDeptFilter>('all');
  const [showList, setShowList] = useState(false);
  useEffect(() => {
    let live = true;
    void apiJson<{ people: ProfilePerson[] }>('/api/reports/staff-profile?list=1').then((r) => { if (live) setPeople(r.people); }, (e: Error) => { if (live) setListError(e.message); });
    return () => { live = false; };
  }, []);
  // F5: lấy lại người đang xem từ địa chỉ.
  useEffect(() => {
    if (currentStaffProfile()) return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) openStaffProfile(id, '');
  }, []);
  const id = target?.id ?? null;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
    window.history.replaceState(window.history.state, '', url);
    setShowList(false);
  }, [id]);
  useEffect(() => () => { const url = new URL(window.location.href); url.searchParams.delete('id'); window.history.replaceState(window.history.state, '', url); }, []);

  const [state, setState] = useState<{ id: string; key: string; data?: StaffProfile; error?: string } | null>(null);
  const [pick, setPick] = useState<{ id: string; pos: string[] }>({ id: '', pos: [] });
  const pos = id && pick.id === id ? pick.pos : [];
  const key = pos.join(',');
  useEffect(() => {
    if (!id) return;
    let live = true;
    void apiJson<StaffProfile>(`/api/reports/staff-profile?id=${encodeURIComponent(id)}${key ? `&pos=${encodeURIComponent(key)}` : ''}`)
      .then((data) => { if (live) setState({ id, key, data }); }, (e: Error) => { if (live) setState({ id, key, error: e.message }); });
    return () => { live = false; };
  }, [id, key]);
  const loading = state?.id === id && state?.key !== key;
  const shown = useMemo(() => (people ? filterPeople(people, q, dept, (pid) => status[pid] === 'left') : []), [people, q, dept, status]);
  const name = (state?.id === id ? state?.data?.name : undefined) || target?.name || people?.find((p) => p.id === id)?.name;

  const list = (
    <aside aria-label="Danh sách nhân sự" className={`min-w-0 flex-col gap-2 lg:sticky lg:top-[calc(env(safe-area-inset-top,0px)+4.5rem)] lg:flex lg:max-h-[calc(100dvh-6rem)] ${id && !showList ? 'hidden' : 'flex'}`}>
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên…" aria-label="Tìm tên nhân sự"
          className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[13.5px] outline-none focus-visible:border-primary" />
      </label>
      <SegmentedControl<ProfileDeptFilter> ariaLabel="Lọc bộ phận" size="sm" value={dept} onChange={setDept}
        options={[{ value: 'all', label: 'Tất cả' }, { value: 'sale', label: 'Sale' }, { value: 'cskh', label: 'CSKH' }, { value: 'mkt', label: 'MKT' }]} />
      {listError ? <p role="alert" className="text-[13px] text-bad">{listError}</p> : !people ? <p className="text-[13px] text-ink-3">Đang tải danh sách…</p> : (
        <ul className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line">
          {shown.length ? shown.map((p) => {
            const s = status[p.id];
            return (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <button type="button" onClick={() => openStaffProfile(p.id, p.name)} aria-current={p.id === id ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] tap hover:bg-tint-2 ${p.id === id ? 'bg-tint-2 font-semibold text-primary' : ''}`}>
                  <span className={`min-w-0 truncate ${p.id === id || !s ? '' : STATUS_CLASS[s]}`}>{p.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-3">{s ? STAFF_STATUSES[s] : DEPT[p.dept]}</span>
                </button>
              </li>
            );
          }) : <li className="px-3 py-3 text-[13px] text-ink-3">Không có ai khớp.</li>}
        </ul>
      )}
      {people && <p className="text-[11px] text-ink-3">{vi.format(shown.length)} / {vi.format(people.length)} người · người có tài khoản POS thuộc Sale, CSKH (theo team) hoặc tên có hậu tố MKT</p>}
    </aside>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && <button type="button" onClick={onBack} className="tap inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink-2 hover:bg-tint-2 hover:text-primary"><ArrowLeft size={15} />Quay lại</button>}
        <h2 className="text-lg font-semibold text-ink">Hồ sơ nhân sự</h2>
        {id && !showList && <button type="button" onClick={() => setShowList(true)} className="tap ml-auto inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[13px] lg:hidden"><Users size={14} />Danh sách</button>}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {list}
        <section aria-label="Hồ sơ" aria-live="polite" className={`min-w-0 ${id && !showList ? '' : 'max-lg:hidden'}`}>
          {!id ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13.5px] text-ink-3">Chọn một người ở danh sách để xem hồ sơ.</p>
            : <>
              <h3 className="mb-2 text-xl font-semibold text-ink">{name ?? 'Nhân sự'}</h3>
              {state?.id === id && state?.error ? <p role="alert" className="text-bad">{state.error}</p>
                : state?.id !== id || !state?.data ? <p className="text-ink-3">Đang tải hồ sơ…</p>
                : <div className={loading ? 'opacity-50 transition-opacity' : undefined}><StaffProfileBody data={state.data} today={today} onPick={(p) => setPick({ id, pos: p })} /></div>}
            </>}
        </section>
      </div>
    </div>
  );
}
