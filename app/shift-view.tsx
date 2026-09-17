'use client';

// Điều hành trong ca: số nhận / số chốt nóng theo SĐT trong khung giờ, so với cùng ca hôm qua,
// diễn biến theo giờ, hoạt động xác nhận mới nhất, hiệu suất nhân viên trong ca và cảnh báo.
import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Clock, Flame, Info, Percent, RefreshCw, ShoppingCart, Users, Wallet, Wifi, WifiOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PosChips } from './overview-view';
import { ChartCard, DeltaPill, ErrorBox, EmptyState, KpiCard, PageHeader, ProgressBar, StatusChip, Toolbar, delta, dt, money, pct, posColor, short, timeOnly, vi } from './ui-kit';

type Staff = { employeeId: string; name: string; department: string | null; received: number; closed: number; rate: number | null; hotOrders: number; hotValue: number; activityOrders: number; activityValue: number; pending: number; posIds: string[]; yesterday: { received: number; closed: number; rate: number | null } | null };
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
const SHIFT_LABELS: Record<string, string> = { morning: 'Ca sáng 08:00 – 12:00', afternoon: 'Ca chiều 12:00 – 17:00', evening: 'Ca tối 17:00 – 22:00', day: 'Cả ngày 00:00 – 24:00' };
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function ShiftView() {
  const today = todayVn();
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState('auto');
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [data, setData] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffSort, setStaffSort] = useState<'received' | 'closed' | 'rate' | 'pending'>('received');
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reports/shift?${new URLSearchParams({ date, shift, posIds: posIds.join(',') })}`, { cache: 'no-store' });
      const body = await r.json() as Shift & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được báo cáo ca.');
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được báo cáo ca.'); }
    finally { setLoading(false); }
  }, [date, shift, posIds]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 2 * 60000);
    return () => clearInterval(t);
  }, [load]);

  const t = data?.total, y = data?.yesterday;
  const staff = [...(data?.staff ?? [])].sort((a, b) => staffSort === 'rate' ? (b.rate ?? -1) - (a.rate ?? -1) : b[staffSort] - a[staffSort]);
  const maxReceived = Math.max(1, ...staff.map((s) => s.received));
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00+07:00`).getDay()];
  const shiftLabel = data ? SHIFT_LABELS[data.shift] : '';

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${weekday}, ${dt(`${date}T00:00:00+07:00`)}`} title="Điều hành trong ca" subtitle="Theo dõi số nhận, số chốt nóng theo SĐT và hoạt động xác nhận trong khung giờ, so với cùng ca hôm qua."
        badge={data ? <StatusChip tone="green"><Clock size={11} />{shiftLabel}</StatusChip> : null}
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-[#547467] sm:flex">{data?.syncedAt && Date.now() - Date.parse(data.syncedAt) < 15 * 60000 ? <Wifi size={14} className="text-[#1a9c5b]" /> : <WifiOff size={14} className="text-[#d24b4b]" />}Đồng bộ lần cuối {timeOnly(data?.syncedAt)} · tự làm mới mỗi 2 phút</span>
            <Button onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{loading ? 'Đang cập nhật…' : 'Cập nhật ngay'}</Button>
          </div>
        } />
      <Toolbar>
        <span className="px-1 text-sm font-semibold text-[#62796d]">Ngày</span>
        <Input type="date" className="w-40" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <span className="px-1 text-sm font-semibold text-[#62796d]">Ca</span>
        <Select value={shift} items={{ auto: 'Ca hiện tại (tự chọn)', ...SHIFT_LABELS }} onValueChange={(v) => setShift(String(v))}>
          <SelectTrigger className="min-w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Ca hiện tại (tự chọn)</SelectItem>
            {Object.entries(SHIFT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Toolbar>
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!data && !error && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {data && t && y && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={ShoppingCart} tone="green" label="Số đã nhận" value={vi.format(t.received)} delta={delta(t.received, y.received)} deltaLabel="So với cùng ca hôm qua" note={`TB ${vi.format(Math.round(t.received / Math.max(1, data.hours.end - data.hours.start)))} số/giờ · hôm qua ${vi.format(y.received)}`} />
            <KpiCard icon={Zap} tone="teal" label="Số đã chốt" value={vi.format(t.closed)} delta={delta(t.closed, y.closed)} deltaLabel="So với cùng ca hôm qua" note={`TB ${vi.format(Math.round(t.closed / Math.max(1, data.hours.end - data.hours.start)))} số/giờ · hôm qua ${vi.format(y.closed)}`} />
            <KpiCard icon={Percent} tone="blue" label="Tỷ lệ chốt nóng" value={pct(t.rate)} delta={t.rate !== null && y.rate !== null ? t.rate - y.rate : null} deltaLabel="điểm % so với cùng ca hôm qua" note={`${vi.format(t.closed)} / ${vi.format(t.received)} số`} />
            <KpiCard icon={Flame} tone="orange" label="Số đơn chốt nóng" value={vi.format(t.hotOrders)} delta={delta(t.hotOrders, y.hotOrders)} deltaLabel="So với cùng ca hôm qua" note={`${vi.format(t.activityOrders)} đơn xác nhận trong ca (mọi nguồn)`} />
            <KpiCard icon={Wallet} tone="purple" label="Giá trị hiện tại đơn chốt" value={money(t.hotValue)} delta={delta(t.hotValue, y.hotValue)} deltaLabel="So với cùng ca hôm qua" note={<span className="inline-flex items-center gap-1"><Info size={11} />Không phải doanh thu Pancake</span>} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <ChartCard icon={Clock} title="Tình hình theo giờ trong ca" subtitle="Số nhận (SĐT được giao) và số chốt (đơn xác nhận lần đầu) theo từng giờ">
                <ChartContainer className="h-64 w-full aspect-auto" config={{ received: { label: 'Số đã nhận', color: '#17684b' }, closed: { label: 'Đơn đã chốt', color: '#8fd19e' } }}>
                  <BarChart data={data.hourly} barGap={4}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value, name, item) => <span className="flex w-full justify-between gap-4"><span>{name === 'received' ? 'Số đã nhận' : 'Đơn đã chốt'}</span><strong>{vi.format(Number(value))}{name === 'closed' ? ` · ${short(item.payload?.value ?? 0)} đ` : ''}</strong></span>} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="received" fill="var(--color-received)" radius={[4, 4, 0, 0]}><LabelList dataKey="received" position="top" fontSize={11} /></Bar>
                    <Bar dataKey="closed" fill="var(--color-closed)" radius={[4, 4, 0, 0]}><LabelList dataKey="closed" position="top" fontSize={11} /></Bar>
                  </BarChart>
                </ChartContainer>
              </ChartCard>
              <ChartCard icon={Users} title="Hiệu suất nhân viên trong ca" subtitle="Số nhận, số chốt nóng, đơn chờ xác nhận trong ngày; so với cùng ca hôm qua"
                action={
                  <Select value={staffSort} items={{ received: 'Theo số nhận', closed: 'Theo số chốt', rate: 'Theo tỷ lệ chốt', pending: 'Theo đơn chờ XN' }} onValueChange={(v) => setStaffSort(v as typeof staffSort)}>
                    <SelectTrigger className="min-w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="received">Theo số nhận</SelectItem><SelectItem value="closed">Theo số chốt</SelectItem><SelectItem value="rate">Theo tỷ lệ chốt</SelectItem><SelectItem value="pending">Theo đơn chờ XN</SelectItem></SelectContent>
                  </Select>
                }>
                {staff.length ? (
                  <div className="max-h-[30rem] overflow-auto">
                    <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                      <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Nhân viên</th><th>POS phụ trách</th><th className="text-right">Số đã nhận</th><th>Khối lượng</th><th className="text-right">Số đã chốt</th><th className="text-right">Tỷ lệ chốt</th><th className="text-right">Hôm qua</th><th className="text-right">Giá trị chốt</th><th className="text-right">Chờ XN</th></tr></thead>
                      <tbody>
                        {staff.map((s, i) => (
                          <tr key={s.employeeId} className="border-t">
                            <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td>
                            <td className="whitespace-nowrap font-medium">{s.name}<div className="text-[11px] font-normal text-[#7d9184]">{s.department ?? ''}</div></td>
                            <td className="whitespace-nowrap text-xs">{s.posIds.map((id) => <span key={id} className="mr-1.5"><span className="mr-1 inline-block size-2 rounded-full" style={{ background: posColor(id) }} />{POS.find((p) => p.id === id)?.name}</span>)}</td>
                            <td className="whitespace-nowrap text-right">{vi.format(s.received)}</td>
                            <td><ProgressBar value={s.received} max={maxReceived} /></td>
                            <td className="whitespace-nowrap text-right font-medium">{vi.format(s.closed)}</td>
                            <td className="whitespace-nowrap text-right"><span className={`font-semibold ${(s.rate ?? 0) >= 50 ? 'text-[#1a7a48]' : (s.rate ?? 0) >= 40 ? 'text-[#a36b00]' : 'text-[#c23a3a]'}`}>{pct(s.rate)}</span></td>
                            <td className="whitespace-nowrap text-right text-xs text-[#547467]">{s.yesterday ? `${pct(s.yesterday.rate)} (${s.yesterday.closed}/${s.yesterday.received})` : '—'}</td>
                            <td className="whitespace-nowrap text-right">{money(s.hotValue)}</td>
                            <td className="whitespace-nowrap text-right">{s.pending ? <StatusChip tone={s.pending >= 20 ? 'red' : s.pending >= 10 ? 'orange' : 'gray'}>{vi.format(s.pending)}</StatusChip> : '0'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyState text="Chưa có số được giao trong khung giờ này." />}
              </ChartCard>
            </div>
            <div className="space-y-4">
              <ChartCard icon={Zap} title="Hoạt động xác nhận trực tiếp" subtitle="Đơn được xác nhận gần nhất trong ca">
                {data.feed.length ? (
                  <ul className="max-h-[22rem] space-y-2 overflow-auto">
                    {data.feed.map((f) => (
                      <li key={f.id} className="flex items-start gap-2.5 rounded-xl border p-2.5">
                        <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-[#1a9c5b]" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">Đơn <strong>#{f.orderId}</strong> đã được xác nhận <span className="text-xs text-[#7d9184]">· {money(f.net)}</span></div>
                          <div className="truncate text-xs text-[#7d9184]">{f.closer} · <span className="inline-block size-1.5 rounded-full align-middle" style={{ background: posColor(f.posId) }} /> {f.posName}{f.customer ? ` · ${f.customer}` : ''}</div>
                        </div>
                        <span className="shrink-0 text-xs text-[#7d9184]">{timeOnly(f.at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState text="Chưa có đơn nào được xác nhận trong ca." />}
              </ChartCard>
              <ChartCard icon={AlertTriangle} title="Cảnh báo trong ca" subtitle="Tỷ lệ chốt thấp, quá tải, đồng bộ chậm hoặc lỗi">
                {data.alerts.length ? (
                  <ul className="space-y-2">
                    {data.alerts.map((a, i) => (
                      <li key={i} className={`rounded-xl border p-3 ${a.level === 'high' ? 'border-[#f1c9c9] bg-[#fdf3f3]' : 'border-[#f0dcb4] bg-[#fff8e8]'}`}>
                        <div className="flex items-center justify-between gap-2"><span className={`flex items-center gap-1.5 text-sm font-semibold ${a.level === 'high' ? 'text-[#a33a3a]' : 'text-[#8a5a00]'}`}><AlertTriangle size={14} />{a.title}</span>{a.at && <span className="text-xs text-[#7d9184]">{timeOnly(a.at)}</span>}</div>
                        <p className="mt-1 text-xs text-[#4c5f55]">{a.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="rounded-xl border border-[#b6e2bd] bg-[#e5f7e8] p-3 text-sm text-[#195b35]">Không có cảnh báo. Mọi thứ đang ổn.</p>}
              </ChartCard>
            </div>
          </div>
          <p className="text-xs text-[#7d9184]">{Object.values(data.definitions).join(' ')}</p>
        </>
      )}
    </div>
  );
}
