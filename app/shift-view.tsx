'use client';

// Điều hành trong ca: số nhận / số chốt nóng theo SĐT trong khung giờ, so với cùng ca hôm qua,
// diễn biến theo giờ, hoạt động xác nhận mới nhất, hiệu suất nhân viên trong ca và cảnh báo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Clock, Flame, Info, Percent, RefreshCw, ShoppingCart, Users, Wallet, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PosChips } from './overview-view';
import { useTeam } from './team-store';
import { useApi } from './use-api';
import { StaleChip } from './stale-chip';
import { ChartCard, Definitions, ErrorBox, EmptyState, KpiCard, PageHeader, ProgressBar, SegmentedControl, SkeletonKpis, SkeletonTable, StatusChip, SyncPill, TableWrap, Toolbar, delta, dt, money, pct, posName, posVar, short, shortMoney, timeOnly, toast, useMotionOK, vi } from './ui-kit';

type Staff = { employeeId: string; name: string; department: string | null; received: number; closed: number; rate: number | null; hotOrders: number; hotValue: number; activityOrders: number; activityValue: number; pending: number; posIds: string[]; yesterday: { received: number; closed: number; rate: number | null } | null; assignedHidden?: boolean; shiftHours?: string | null };
type Shift = {
  date: string; shift: string; hours: { start: number; end: number }; shifts: Record<string, [number, number]>; isToday: boolean; generatedAt: string; syncedAt: string | null;
  total: { received: number; closed: number; hotOrders: number; hotValue: number; activityOrders: number; activityValue: number; rate: number | null };
  yesterday: Shift['total'];
  hourly: { hour: string; received: number; closed: number; value: number }[];
  staff: Staff[];
  feed: { id: string; orderId: string; posId: string; posName: string; phone: string | null; customer: string | null; closer: string; at: string; net: number }[];
  alerts: { kind: string; level: 'high' | 'medium'; title: string; detail: string; at: string | null }[];
  definitions: Record<string, string>;
};
type StaffSort = 'received' | 'closed' | 'rate' | 'pending';
const SHIFT_LABELS: Record<string, string> = { morning: 'Ca sáng 08:00 – 12:00', afternoon: 'Ca chiều 12:00 – 17:00', evening: 'Ca tối 17:00 – 22:00', day: 'Cả ngày 00:00 – 24:00', personal: 'Ca cá nhân (giờ của từng người)' };
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const STAFF_SORTS: { value: StaffSort; label: string }[] = [{ value: 'received', label: 'Số nhận' }, { value: 'closed', label: 'Số chốt' }, { value: 'rate', label: 'Tỷ lệ' }, { value: 'pending', label: 'Chờ XN' }];
const FRESH_MS = 15 * 60000;
/** Màu tỷ lệ chốt: ≥ 50% tốt, 40–50% cần chú ý, dưới 40% thấp. */
const rateTone = (rate: number | null) => (rate ?? 0) >= 50 ? 'text-good' : (rate ?? 0) >= 40 ? 'text-warn' : 'text-bad';

/** Bề rộng thực của khung biểu đồ (ResizeObserver) để quyết định có in nhãn số trên cột hay không. */
function useElementWidth() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

export function ShiftView() {
  const today = todayVn();
  const team = useTeam();
  const motionOn = useMotionOK();
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState('auto');
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [staffSort, setStaffSort] = useState<StaffSort>('received');

  // Số lần trước hiện ngay (useApi đọc bản lưu trong trình duyệt), đổi ngày / ca / POS thì tải lại; tự làm mới mỗi 2 phút khi tab đang mở.
  const url = useMemo(() => `/api/reports/shift?${new URLSearchParams({ date, shift, posIds: posIds.join(','), team })}`, [date, shift, posIds, team]);
  const { data, at, stale, loading, error, reload } = useApi<Shift>(url, { refreshMs: 2 * 60000 });
  // "Cập nhật ngay": báo toast khi lượt tải thủ công xong (thành công hay lỗi).
  const manualRef = useRef(false);
  const update = () => { manualRef.current = true; reload(); };
  useEffect(() => {
    if (loading || !manualRef.current) return;
    manualRef.current = false;
    if (error) toast('Không cập nhật được số liệu ca.', { kind: 'error' });
    else toast(`Đã cập nhật số liệu ca · đồng bộ Pancake ${timeOnly(data?.syncedAt)}`);
  }, [loading, error, data]);
  const busy = loading && !stale;

  const t = data?.total, y = data?.yesterday;
  const staff = useMemo(() => [...(data?.staff ?? [])].sort((a, b) => staffSort === 'rate' ? (b.rate ?? -1) - (a.rate ?? -1) : b[staffSort] - a[staffSort]), [data, staffSort]);
  const maxReceived = Math.max(1, ...staff.map((s) => s.received));
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00+07:00`).getDay()];
  const shiftLabel = data ? SHIFT_LABELS[data.shift] : '';
  const hoursInShift = data ? Math.max(1, data.hours.end - data.hours.start) : 1;
  const fresh = !!data?.syncedAt && Date.now() - Date.parse(data.syncedAt) < FRESH_MS;
  const live = !!data?.isToday && fresh;
  const period = `${shiftLabel} · ${dt(`${date}T00:00:00+07:00`)}`;
  const tip = (current: string, previous: string, definition?: string) => ({ period, current, previous, previousLabel: 'Cùng ca hôm qua', definition });

  // Nhãn số trên cột: chỉ in khi mỗi cột đủ chỗ cho chữ số lớn nhất (nếu không, nhãn hai cột cùng giờ đè lên nhau) — tooltip vẫn đủ số.
  const [chartRef, chartW] = useElementWidth();
  const hourly = data?.hourly ?? [];
  const maxDigits = Math.max(1, ...hourly.map((h) => Math.max(vi.format(h.received).length, vi.format(h.closed).length)));
  const slot = hourly.length ? (chartW - 48) / hourly.length : 0;
  const showLabels = chartW > 0 && slot / 2 >= maxDigits * 6.4 + 8;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${weekday}, ${dt(`${date}T00:00:00+07:00`)}`} title="Điều hành trong ca" subtitle="Số nhận, chốt nóng theo SĐT · so với cùng ca hôm qua"
        badge={data || error ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {data && <StatusChip tone="green"><Clock size={11} />{shiftLabel}</StatusChip>}
            {live && (
              <StatusChip tone="lime" className="pl-1.5">
                <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-good" style={{ animation: 'pulse 1.6s var(--ease) infinite' }} />
                Trực tiếp
              </StatusChip>
            )}
            <StaleChip stale={stale} at={at} loading={loading} error={data ? error : null} onRetry={reload} />
          </span>
        ) : null}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncPill lastSyncAt={data?.syncedAt} state={data ? (fresh ? 'ok' : 'bad') : 'warn'}
              detail={<span className="block whitespace-normal">{fresh ? 'Đồng bộ Pancake còn mới (dưới 15 phút).' : 'Đồng bộ Pancake đã cũ hơn 15 phút — số liệu có thể thiếu.'} Trang tự làm mới mỗi 2 phút; báo cáo dựng lúc {timeOnly(data?.generatedAt)}.</span>} />
            <Button onClick={update} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{loading ? 'Đang cập nhật…' : 'Cập nhật ngay'}</Button>
          </div>
        } />
      <Toolbar>
        <span className="px-1 text-xs font-semibold text-ink-2">Ngày</span>
        <Input aria-label="Ngày" type="date" className="w-auto" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <span className="px-1 text-xs font-semibold text-ink-2">Ca</span>
        <Select value={shift} items={{ auto: 'Ca hiện tại (tự chọn)', ...SHIFT_LABELS }} onValueChange={(v) => setShift(String(v))}>
          <SelectTrigger className="min-w-52" aria-label="Ca làm việc"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Ca hiện tại (tự chọn)</SelectItem>
            {Object.entries(SHIFT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && (
        <>
          <SkeletonKpis count={5} className="xl:grid-cols-5" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <ChartCard icon={Clock} title="Theo giờ" subtitle="Số nhận và số chốt từng giờ" loading><div className="h-64" /></ChartCard>
            <ChartCard icon={Zap} title="Xác nhận mới nhất" subtitle="Trong ca" loading><div className="h-40" /></ChartCard>
          </div>
          <ChartCard icon={Users} title="Nhân viên trong ca" subtitle="So với cùng ca hôm qua"><SkeletonTable rows={6} cols={8} /></ChartCard>
        </>
      )}
      {data && t && y && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5 ${busy ? 'opacity-70 transition-opacity duration-[var(--dur)]' : 'transition-opacity duration-[var(--dur)]'}`} aria-busy={busy || undefined}>

            <KpiCard icon={ShoppingCart} tone="green" label="Số đã nhận" value={vi.format(t.received)} countUp rawValue={t.received} format={(n) => vi.format(Math.round(n))}
              delta={delta(t.received, y.received)} deltaLabel="So với cùng ca hôm qua" note={`TB ${vi.format(Math.round(t.received / hoursInShift))} số/giờ · hôm qua ${vi.format(y.received)}`}
              tooltip={tip(`${vi.format(t.received)} số`, `${vi.format(y.received)} số`, data.definitions.received)} />
            <KpiCard icon={Zap} tone="teal" label="Số đã chốt" value={vi.format(t.closed)} countUp rawValue={t.closed} format={(n) => vi.format(Math.round(n))}
              delta={delta(t.closed, y.closed)} deltaLabel="So với cùng ca hôm qua" note={`TB ${vi.format(Math.round(t.closed / hoursInShift))} số/giờ · hôm qua ${vi.format(y.closed)}`}
              tooltip={tip(`${vi.format(t.closed)} số`, `${vi.format(y.closed)} số`, data.definitions.closed)} />
            <KpiCard icon={Percent} tone="blue" label="Tỷ lệ chốt nóng" value={pct(t.rate)} delta={t.rate !== null && y.rate !== null ? t.rate - y.rate : null} deltaLabel="điểm % so với cùng ca hôm qua" note={`${vi.format(t.closed)} / ${vi.format(t.received)} số`}
              tooltip={tip(`${pct(t.rate)} (${vi.format(t.closed)}/${vi.format(t.received)})`, `${pct(y.rate)} (${vi.format(y.closed)}/${vi.format(y.received)})`, 'Tỷ lệ chốt nóng = số chốt ÷ số nhận trong khung giờ; chênh lệch tính bằng điểm %.')} />
            <KpiCard icon={Flame} tone="orange" label="Số đơn chốt nóng" value={vi.format(t.hotOrders)} countUp rawValue={t.hotOrders} format={(n) => vi.format(Math.round(n))}
              delta={delta(t.hotOrders, y.hotOrders)} deltaLabel="So với cùng ca hôm qua" note={`${vi.format(t.activityOrders)} đơn xác nhận trong ca (mọi nguồn)`}
              tooltip={tip(`${vi.format(t.hotOrders)} đơn`, `${vi.format(y.hotOrders)} đơn`, data.definitions.activity)} />
            <KpiCard icon={Wallet} tone="purple" label="Giá trị hiện tại đơn chốt" value={shortMoney(t.hotValue)} countUp rawValue={t.hotValue} format={shortMoney}
              delta={delta(t.hotValue, y.hotValue)} deltaLabel="So với cùng ca hôm qua" note={<span className="inline-flex items-center gap-1"><Info size={11} />Không phải doanh thu Pancake</span>}
              tooltip={tip(money(t.hotValue), money(y.hotValue), data.definitions.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <ChartCard icon={Clock} title="Theo giờ" subtitle="Số nhận và số chốt từng giờ" info={`${data.definitions.received} ${data.definitions.closed}`}>
                <div ref={chartRef} className="w-full">
                  <ChartContainer className="h-64 w-full aspect-auto" config={{ received: { label: 'Số đã nhận', color: 'var(--chart-bar)' }, closed: { label: 'Đơn đã chốt', color: 'var(--primary)' } }}>
                    <BarChart data={hourly} barGap={3} barCategoryGap="22%" margin={{ top: showLabels ? 16 : 6, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="hour" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} tick={{ fontSize: 10.5, fill: 'var(--ink-3)' }} />
                      <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} tick={{ fontSize: 10.5, fill: 'var(--ink-3)' }} />
                      <ChartTooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltipContent formatter={(value, name, item) => <span className="flex w-full justify-between gap-4"><span>{name === 'received' ? 'Số đã nhận' : 'Đơn đã chốt'}</span><strong className="num">{vi.format(Number(value))}{name === 'closed' ? ` · ${shortMoney(item.payload?.value ?? 0)}` : ''}</strong></span>} />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="received" fill="var(--color-received)" radius={[4, 4, 0, 0]} isAnimationActive={motionOn}>
                        {showLabels && <LabelList dataKey="received" position="top" fontSize={10.5} fill="var(--ink-3)" className="num" formatter={(v) => Number(v) ? vi.format(Number(v)) : ''} />}
                      </Bar>
                      <Bar dataKey="closed" fill="var(--color-closed)" radius={[4, 4, 0, 0]} isAnimationActive={motionOn}>
                        {showLabels && <LabelList dataKey="closed" position="top" fontSize={10.5} fill="var(--ink)" className="num" formatter={(v) => Number(v) ? vi.format(Number(v)) : ''} />}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </div>
                {!showLabels && hourly.length > 0 && <p className="mt-1 text-[11px] text-ink-4">Rê chuột / chạm vào cột để xem số từng giờ.</p>}
              </ChartCard>
              <ChartCard icon={Users} title="Nhân viên trong ca" subtitle="So với cùng ca hôm qua"
                action={<SegmentedControl ariaLabel="Sắp xếp nhân viên theo" size="sm" value={staffSort} onChange={setStaffSort} options={STAFF_SORTS} />}>
                {staff.length ? (
                  <TableWrap maxHeight="30rem" sticky minWidth={720}>
                    <table className="tbl">
                      <thead><tr><th className="n">#</th><th>Nhân viên</th><th>POS phụ trách</th><th className="n">Số đã nhận</th><th>Khối lượng</th><th className="n">Số đã chốt</th><th className="n">Tỷ lệ chốt</th><th className="n">Hôm qua</th><th className="n">Giá trị chốt</th><th className="n">Chờ XN</th></tr></thead>
                      <tbody>
                        {staff.map((s, i) => (
                          <tr key={s.employeeId}>
                            <td className="n mut text-xs">{i + 1}</td>
                            <td className="font-medium">{s.name}<div className="text-[11px] font-normal text-ink-3">{s.department ?? ''}{data.shift === 'personal' && <span className="num ml-1.5 rounded bg-tint-2 px-1 py-px text-[10px] font-semibold text-primary">{s.shiftHours ?? 'cả ngày'}</span>}</div></td>
                            <td className="text-xs">{s.posIds.map((id) => <span key={id} className="mr-1.5"><span className="mr-1 inline-block size-2 rounded-full" style={{ background: posVar(id) }} />{posName(id)}</span>)}</td>
                            <td className="n">{s.assignedHidden ? '—' : vi.format(s.received)}</td>
                            <td>{s.assignedHidden ? <span className="text-xs text-ink-4">Chỉ GĐ xem</span> : <ProgressBar value={s.received} max={maxReceived} size="sm" width={72} />}</td>
                            <td className="n">{vi.format(s.closed)}</td>
                            <td className={`n ${s.assignedHidden ? 'mut' : rateTone(s.rate)}`}>{s.assignedHidden ? '—' : pct(s.rate)}</td>
                            <td className="n mut text-xs">{s.yesterday ? `${pct(s.yesterday.rate)} (${s.yesterday.closed}/${s.yesterday.received})` : '—'}</td>
                            <td className="n">{money(s.hotValue)}</td>
                            <td className="n">{s.pending ? <StatusChip tone={s.pending >= 20 ? 'red' : s.pending >= 10 ? 'orange' : 'gray'}>{vi.format(s.pending)}</StatusChip> : <span className="mut">0</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                ) : <EmptyState text="Chưa có số được giao trong khung giờ này." />}
              </ChartCard>
            </div>
            <div className="space-y-4">
              <ChartCard icon={Zap} title="Xác nhận mới nhất" subtitle="Trong ca">
                {data.feed.length ? (
                  <ul className="max-h-[22rem] space-y-1.5 overflow-auto overscroll-contain">
                    {data.feed.map((f) => (
                      <li key={f.id} className="reveal-row flex items-start gap-2.5 rounded-lg border border-line bg-surface p-2.5 transition-[background-color,border-color] duration-[var(--dur)] ease-[var(--ease)] hover:border-line-3 hover:bg-surface-2">
                        <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-good" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px]">Đơn <strong className="num">#{f.orderId}</strong> đã được xác nhận <span className="num text-xs text-ink-3">· {money(f.net)}</span></div>
                          <div className="truncate text-xs text-ink-3">{f.closer} · <span className="inline-block size-1.5 rounded-full align-middle" style={{ background: posVar(f.posId) }} /> {f.posName}{f.customer ? ` · ${f.customer}` : ''}</div>
                        </div>
                        <span className="num shrink-0 text-xs text-ink-3">{timeOnly(f.at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState text="Chưa có đơn nào được xác nhận trong ca." />}
              </ChartCard>
              <ChartCard icon={AlertTriangle} title="Cảnh báo" subtitle="Chốt thấp · quá tải · đồng bộ">
                {data.alerts.length ? (
                  <ul className="space-y-2">
                    {data.alerts.map((a, i) => (
                      <li key={i} tabIndex={0} className={`rounded-xl border p-3 transition-[transform,box-shadow,border-color] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-0.5 hover:shadow-raise focus-visible:-translate-y-0.5 focus-visible:shadow-raise ${a.level === 'high' ? 'border-bad/25 bg-bad-bg hover:border-bad/50' : 'border-warn/25 bg-warn-bg hover:border-warn/50'}`}>
                        <div className="flex items-center justify-between gap-2"><span className={`flex items-center gap-1.5 text-[13px] font-semibold ${a.level === 'high' ? 'text-bad' : 'text-warn'}`}><AlertTriangle size={14} />{a.title}</span>{a.at && <span className="num text-xs text-ink-3">{timeOnly(a.at)}</span>}</div>
                        <p className="mt-1 text-xs leading-relaxed text-ink-2">{a.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="notice ok"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />Không có cảnh báo. Mọi thứ đang ổn.</p>}
              </ChartCard>
            </div>
          </div>
          <Definitions items={data.definitions} />
        </>
      )}
    </div>
  );
}
