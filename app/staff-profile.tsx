'use client';

// Hồ sơ làm việc siêu chi tiết của một nhân sự (anh Vũ 03/11/2026, nhắc 07/11). Bấm tên ở bất kỳ bảng nào mở khung này
// (openStaffProfile). Số tính ở lib/reports/staff-profile.ts.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { closeStaffProfile, currentStaffProfile, subscribeStaffProfile } from './staff-profile-link';
import { todayVn } from '@/lib/shared/report-time';
import { Award, CalendarDays, Crown, Flag, Package, TrendingUp, UserRound } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { JOIN_SOURCE_LABELS } from '@/lib/reports/growth-calc';
import { RATE_THRESHOLDS } from '@/lib/reports/metrics';
import type { MonthRow, StaffProfile } from '@/lib/reports/staff-profile';
import { STAFF_STATUSES } from '@/lib/teams/staff-status';
import { ORDER_STATUS } from '@/lib/pancake/pancake';
import { useStaffStatus, STATUS_CLASS } from './staff-name';
import { money, pct, shortMoney, vi } from './ui-kit';
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
  const data = months.map((m) => ({ key: mLabel(m.month), net: m.net, orders: m.closedOrders, rate: m.rate === null ? null : Math.round(m.rate * 10) / 10, top: m.rank !== null && m.rank <= 3 }));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-line p-3">
        <h4 className="text-[13px] font-semibold">Doanh số từng tháng</h4>
        <p className="text-[11px] text-ink-3">Cột vàng = tháng lọt top 3 bộ phận</p>
        <ChartContainer config={{ net: { label: 'Doanh số', color: 'var(--primary)' } }} className="mt-2 aspect-auto h-52 w-full">
          <BarChart data={data} margin={{ left: 0, right: 4 }}>
            <CartesianGrid vertical={false} /><XAxis dataKey="key" tick={{ fontSize: 11 }} minTickGap={8} />
            <YAxis width={48} tick={{ fontSize: 11 }} tickFormatter={(n: number) => shortMoney(n).replace(' ₫', '')} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(typeof v === 'number' ? v : null)} />} />
            <Bar dataKey="net" name="Doanh số" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.key} fill={d.top ? 'var(--warn)' : 'var(--primary)'} />)}
            </Bar>
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

export function StaffProfileBody({ data, today }: { data: StaffProfile; today: string }) {
  const status = useStaffStatus()[data.id] ?? 'working';
  const mkt = data.dept === 'mkt', notes = insights(data, today), worked = daysSince(data.tenure?.joined ?? null, today);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className={`rounded-full bg-surface-2 px-2.5 py-1 font-semibold ${STATUS_CLASS[status]}`}>{STAFF_STATUSES[status]}</span>
        {data.dept && <span className="rounded-full bg-surface-2 px-2.5 py-1">{DEPT[data.dept]}</span>}
        {data.tenure && <span className="rounded-full bg-surface-2 px-2.5 py-1 num">T{data.tenure.t} · {worked !== null ? `${vi.format(worked)} ngày` : ''}</span>}
        {data.posNames.map((p) => <span key={p} className="rounded-full border border-line px-2.5 py-1">{p}</span>)}
      </div>

      <section aria-label="Các mốc" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Fact icon={CalendarDays} label="Ngày vào làm" value={dmyFull(data.tenure?.joined)} note={data.tenure ? `theo ${JOIN_SOURCE_LABELS[data.tenure.source]}` : 'chưa có ngày vào'} />
        <Fact icon={UserRound} label="Có tài khoản POS" value={dmyFull(data.posCreated)} note={data.posNames.length ? `${data.posNames.length} POS` : undefined} />
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

/** Gắn một lần ở khung trang; mở khi có người bấm tên. */
export function StaffProfileHost() {
  const [today] = useState(() => todayVn());
  const target = useSyncExternalStore(subscribeStaffProfile, currentStaffProfile, () => null);
  const [state, setState] = useState<{ id: string; data?: StaffProfile; error?: string } | null>(null);
  useEffect(() => {
    if (!target) return;
    let live = true;
    setState({ id: target.id });
    void apiJson<StaffProfile>(`/api/reports/staff-profile?id=${encodeURIComponent(target.id)}`)
      .then((data) => { if (live) setState({ id: target.id, data }); }, (e: Error) => { if (live) setState({ id: target.id, error: e.message }); });
    return () => { live = false; };
  }, [target]);
  return (
    <Sheet open={!!target} onOpenChange={(open) => { if (!open) closeStaffProfile(); }}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:max-w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="pr-12"><SheetTitle>{state?.data?.name ?? target?.name ?? 'Hồ sơ nhân sự'}</SheetTitle><SheetDescription>Hồ sơ làm việc từ ngày vào tới hôm nay</SheetDescription></SheetHeader>
        <div className="px-4 pb-6" aria-live="polite">
          {state?.error ? <p role="alert" className="text-bad">{state.error}</p> : !state?.data ? <p className="text-ink-3">Đang tải hồ sơ…</p> : <StaffProfileBody data={state.data} today={today} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
