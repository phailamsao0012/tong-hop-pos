'use client';

// Cuộc gọi CSKH: mỗi ghi chú trên hồ sơ khách Pancake = một cuộc gọi. Theo nhân viên và theo ngày,
// lọc nhân viên dưới N cuộc/ngày, xem lịch sử từng cuộc (ai, giờ, khách, nội dung, đơn chốt cùng ngày) và xuất Excel.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Database, FileDown, Phone, PhoneCall, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { useTeam } from './team-store';
import { ChartCard, ErrorBox, EmptyState, KpiCard, PageHeader, ProgressBar, StatusChip, dmy, dt, money, pct, posColor, short, timeOnly, vi } from './ui-kit';

type DayStat = { notes: number; customers: number; orders: number; net: number };
type Staff = { authorId: string; name: string; department: string | null; assigned: number; notes: number; customers: number; orders: number; net: number; activeDays: number; byDay: Record<string, DayStat> };
type Report = { period: { start: string; end: string; days: string[] }; staff: Staff[]; coverage: { customers: number; notes: number; firstNote: string | null; lastFetch: string | null }; definitions: Record<string, string> };
type HistoryItem = { id: string; posId: string; posName: string; day: string; createdAt: string; author: string; customer: string; phone: string | null; message: string; source: string; assignedTo: string | null; customerSuccessOrders: number | null; customerPurchased: number | null; orders: { id: string; orderId: string; statusName: string; net: number; confirmedAt: string | null; items: string; seller: string | null }[] };
type History = { authorId: string; author: string; period: { start: string; end: string }; days: { day: string; calls: number; customers: number; orders: number; net: number; aov: number | null }[]; items: HistoryItem[] };
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;

export function CallsView() {
  const today = todayVn();
  const team = useTeam();
  const [preset, setPreset] = useState('today');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [threshold, setThreshold] = useState(0);
  const [metric, setMetric] = useState<'notes' | 'customers'>('customers');
  const [department, setDepartment] = useState('all');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reports/calls?${new URLSearchParams({ start, end, posIds: posIds.join(','), team })}`, { cache: 'no-store' });
      const body = await r.json() as Report & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được báo cáo.');
      setReport(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được báo cáo.'); }
    finally { setLoading(false); }
  }, [start, end, posIds, team]);
  useEffect(() => { void load(); }, [load]);
  const openHistory = async (s: Staff) => {
    setSelected(s); setHistory(null); setHistoryLoading(true);
    try {
      const r = await fetch(`/api/reports/calls/history?${new URLSearchParams({ authorId: s.authorId, start, end, posIds: posIds.join(',') })}`, { cache: 'no-store' });
      if (r.ok) setHistory(await r.json() as History);
    } finally { setHistoryLoading(false); }
    if (window.innerWidth < 1280) setTimeout(() => document.getElementById('call-history')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const days = report?.period.days ?? [];
  const perDay = (s: Staff) => s.activeDays ? (metric === 'notes' ? s.notes : s.customers) / s.activeDays : 0;
  const rows = useMemo(() => (report?.staff ?? [])
    .filter((s) => department === 'all' || (department === '__none' ? !s.department : s.department === department))
    .filter((s) => !threshold || perDay(s) < threshold)
    .sort((a, b) => perDay(b) - perDay(a)), [report, department, threshold, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const departments = [...new Set((report?.staff ?? []).map((s) => s.department).filter(Boolean))].sort() as string[];
  const totals = rows.reduce((a, s) => ({ notes: a.notes + s.notes, customers: a.customers + s.customers, orders: a.orders + s.orders, net: a.net + s.net }), { notes: 0, customers: 0, orders: 0, net: 0 });
  const dailyTotals = days.map((d) => ({ day: d, notes: rows.reduce((a, s) => a + (s.byDay[d]?.notes ?? 0), 0), customers: rows.reduce((a, s) => a + (s.byDay[d]?.customers ?? 0), 0) }));
  const maxPerDay = Math.max(1, ...rows.map(perDay));

  const exportStaff = async () => {
    if (!report) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nhân viên', 'Bộ phận', 'Data đang cầm', 'Ngày có gọi', 'Cuộc gọi (ghi chú)', 'Số khách đã gọi', 'Cuộc/ngày', 'Khách/ngày', 'Đơn chốt cùng ngày', 'Doanh thu', 'AOV', ...days],
      ...rows.map((s) => [s.name, s.department ?? '', s.assigned, s.activeDays, s.notes, s.customers, s.activeDays ? Number((s.notes / s.activeDays).toFixed(1)) : 0, s.activeDays ? Number((s.customers / s.activeDays).toFixed(1)) : 0, s.orders, s.net, s.orders ? Math.round(s.net / s.orders) : '', ...days.map((d) => s.byDay[d] ? (metric === 'notes' ? s.byDay[d].notes : s.byDay[d].customers) : 0)]),
    ]), 'Theo nhân viên');
    XLSX.writeFile(wb, `cuoc-goi-cskh_${start}_${end}.xlsx`);
  };
  const exportHistory = async () => {
    if (!history) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [`Lịch sử cuộc gọi · ${history.author} · ${history.period.start} → ${history.period.end}`], [],
      ['Ngày', 'Giờ gọi', 'Nhân viên', 'POS', 'Khách hàng', 'SĐT', 'Nội dung ghi chú', 'Khách được phân công cho', 'Khách đã mua (lần)', 'Khách đã mua (tiền)', 'Đơn chốt cùng ngày', 'Sản phẩm', 'Trạng thái đơn', 'Doanh thu đơn', 'Nguồn ghi chú'],
      ...history.items.map((it) => [it.day, timeOnly(it.createdAt), it.author, it.posName, it.customer, it.phone ?? '', it.message, it.assignedTo ?? '', it.customerSuccessOrders ?? '', it.customerPurchased ?? '', it.orders.map((o) => `#${o.orderId}`).join(', '), it.orders.map((o) => o.items).filter(Boolean).join(' | '), it.orders.map((o) => o.statusName).join(', '), it.orders.reduce((a, o) => a + o.net, 0) || '', it.source === 'order' ? 'Từ đơn hàng' : 'Từ hồ sơ khách']),
    ]), 'Lịch sử');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ngày', 'Cuộc gọi', 'Số khách', 'Đơn chốt cùng ngày', 'Doanh thu', 'AOV'], ...history.days.map((d) => [d.day, d.calls, d.customers, d.orders, d.net, d.aov ? Math.round(d.aov) : ''])]), 'Theo ngày');
    XLSX.writeFile(wb, `lich-su-goi_${history.author.replace(/\s+/g, '-')}_${history.period.start}_${history.period.end}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Cuộc gọi CSKH" subtitle="Mỗi ghi chú trên hồ sơ khách Pancake = một cuộc gọi"
        actions={<Button variant="outline" onClick={exportStaff} disabled={!report}><FileDown size={14} />Xuất Excel bảng nhân viên</Button>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={() => void load()}
        extra={
          <>
            <span className="px-1 text-sm font-semibold text-[#62796d]">Đếm theo</span>
            <Select value={metric} items={{ customers: 'Số khách đã gọi', notes: 'Số ghi chú (cuộc gọi)' }} onValueChange={(v) => setMetric(v as typeof metric)}>
              <SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="customers">Số khách đã gọi</SelectItem><SelectItem value="notes">Số ghi chú (cuộc gọi)</SelectItem></SelectContent>
            </Select>
            <span className="px-1 text-sm font-semibold text-[#62796d]">Chỉ hiện dưới</span>
            <Select value={String(threshold)} items={{ '0': 'Tất cả', '50': '50 / ngày', '60': '60 / ngày', '70': '70 / ngày', '80': '80 / ngày', '90': '90 / ngày', '100': '100 / ngày', '120': '120 / ngày', '150': '150 / ngày' }} onValueChange={(v) => setThreshold(Number(v))}>
              <SelectTrigger className="min-w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{['0', '50', '60', '70', '80', '90', '100', '120', '150'].map((v) => <SelectItem key={v} value={v}>{v === '0' ? 'Tất cả' : `${v} / ngày`}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min={0} className="w-24" placeholder="khác…" value={threshold || ''} onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))} />
            {departments.length > 0 && (
              <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(departments.map((d) => [d, d])), __none: 'Chưa có bộ phận' }} onValueChange={(v) => setDepartment(String(v))}>
                <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Tất cả bộ phận</SelectItem>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}<SelectItem value="__none">Chưa có bộ phận</SelectItem></SelectContent>
              </Select>
            )}
          </>
        } />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5">
            <KpiCard icon={PhoneCall} tone="green" label="Cuộc gọi (ghi chú)" value={vi.format(totals.notes)} note={`${rows.length} nhân viên · ${days.length} ngày`} />
            <KpiCard icon={Users} tone="teal" label="Số khách đã gọi" value={vi.format(totals.customers)} note={`TB ${vi.format(Math.round(totals.customers / Math.max(1, rows.length) / Math.max(1, days.length)))} khách/người/ngày`} />
            <KpiCard icon={Phone} tone="blue" label="Cuộc gọi/người/ngày" value={vi.format(Math.round(totals.notes / Math.max(1, rows.length) / Math.max(1, days.length)))} note={threshold ? `Đang lọc dưới ${threshold}/ngày` : 'Trung bình toàn nhóm'} />
            <KpiCard icon={Wallet} tone="orange" label="Đơn chốt cùng ngày" value={vi.format(totals.orders)} note={`${money(totals.net)} · AOV ${totals.orders ? money(totals.net / totals.orders) : '—'}`} />
            <KpiCard icon={Database} tone="gray" label="Dữ liệu ghi chú đã gom" value={vi.format(report.coverage.notes)} note={`${vi.format(report.coverage.customers)} khách · cập nhật ${dt(report.coverage.lastFetch, true)}`} />
          </div>
          {!report.coverage.notes && <p className="rounded-xl border border-[#f0dcb4] bg-[#fff8e8] px-4 py-3 text-sm text-[#8a5a00]">Chưa có ghi chú nào được đồng bộ. Hệ thống đang lấy danh sách khách hàng từ Pancake ở nền (vài giờ cho toàn bộ); số liệu sẽ tự xuất hiện.</p>}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <ChartCard icon={PhoneCall} title="Theo ngày" subtitle={`${metric === 'notes' ? 'Số ghi chú' : 'Số khách đã gọi'} của nhóm đang lọc, theo ngày`}>
              <ChartContainer className="h-56 w-full aspect-auto" config={{ v: { label: metric === 'notes' ? 'Cuộc gọi' : 'Khách', color: '#17684b' } }}>
                <BarChart data={dailyTotals.map((d) => ({ day: d.day, v: metric === 'notes' ? d.notes : d.customers }))}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(v: string) => dmy(v)} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => dmy(String(v))} />} />
                  <Bar dataKey="v" fill="var(--color-v)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </ChartCard>
            <ChartCard icon={Database} title="Nguồn số liệu" subtitle={report.definitions.call}>
              <ul className="space-y-1.5 text-xs text-[#4c5f55]">
                <li>{report.definitions.orders}</li>
                <li>{report.definitions.assigned}</li>
                <li>{report.definitions.coverage}</li>
                <li>Ghi chú sớm nhất đã gom: <strong>{dt(report.coverage.firstNote, true)}</strong>.</li>
              </ul>
            </ChartCard>
          </div>
          <ChartCard icon={Users} title={`Theo nhân viên · ${rows.length} người${threshold ? ` dưới ${threshold} ${metric === 'notes' ? 'cuộc' : 'khách'}/ngày` : ''}`} subtitle="Bấm vào một dòng để xem lịch sử từng cuộc gọi và xuất Excel">
            {rows.length ? (
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                  <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">#</th><th>Nhân viên</th><th>Bộ phận</th><th className="text-right">Data đang cầm</th><th className="text-right">Ngày có gọi</th><th className="text-right">Cuộc gọi</th><th className="text-right">Khách đã gọi</th><th className="text-right">{metric === 'notes' ? 'Cuộc' : 'Khách'}/ngày</th><th>Mức</th><th className="text-right">Đơn chốt cùng ngày</th><th className="text-right">Doanh thu</th><th className="text-right">AOV</th>{days.length <= 14 && days.map((d) => <th key={d} className="text-right">{dmy(d)}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((s, i) => { const v = perDay(s); const low = threshold ? v < threshold : false; return (
                      <tr key={s.authorId || 'none'} className={`cursor-pointer border-t hover:bg-[#f5faf5] ${selected?.authorId === s.authorId ? 'bg-[#eef7f1]' : ''}`} onClick={() => void openHistory(s)}>
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td>
                        <td className="whitespace-nowrap font-medium">{s.name}</td>
                        <td className="whitespace-nowrap text-xs text-[#7d9184]">{s.department ?? '—'}</td>
                        <td className="whitespace-nowrap text-right">{s.assigned ? vi.format(s.assigned) : '—'}</td>
                        <td className="whitespace-nowrap text-right">{s.activeDays}</td>
                        <td className="whitespace-nowrap text-right">{vi.format(s.notes)}</td>
                        <td className="whitespace-nowrap text-right font-semibold">{vi.format(s.customers)}</td>
                        <td className={`whitespace-nowrap text-right font-semibold ${low ? 'text-[#c8403f]' : ''}`}>{vi.format(Math.round(v))}</td>
                        <td><ProgressBar value={v} max={maxPerDay} color={low ? '#d24b4b' : '#17684b'} /></td>
                        <td className="whitespace-nowrap text-right">{vi.format(s.orders)}</td>
                        <td className="whitespace-nowrap text-right">{money(s.net)}</td>
                        <td className="whitespace-nowrap text-right">{s.orders ? money(s.net / s.orders) : '—'}</td>
                        {days.length <= 14 && days.map((d) => <td key={d} className="whitespace-nowrap text-right text-xs">{s.byDay[d] ? (metric === 'notes' ? s.byDay[d].notes : s.byDay[d].customers) : <span className="text-[#c3c2b7]">·</span>}</td>)}
                      </tr>
                    ); })}
                    <tr className="border-t bg-[#f8faf8] font-semibold"><td className="py-2" /><td>Tổng</td><td /><td className="text-right">{vi.format(rows.reduce((a, s) => a + s.assigned, 0))}</td><td /><td className="text-right">{vi.format(totals.notes)}</td><td className="text-right">{vi.format(totals.customers)}</td><td /><td /><td className="text-right">{vi.format(totals.orders)}</td><td className="whitespace-nowrap text-right">{money(totals.net)}</td><td className="whitespace-nowrap text-right">{totals.orders ? money(totals.net / totals.orders) : '—'}</td>{days.length <= 14 && days.map((d) => <td key={d} className="text-right text-xs">{metric === 'notes' ? dailyTotals.find((x) => x.day === d)?.notes : dailyTotals.find((x) => x.day === d)?.customers}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            ) : <EmptyState text={report.coverage.notes ? 'Không có nhân viên nào khớp bộ lọc trong kỳ.' : 'Chưa có dữ liệu ghi chú.'} />}
          </ChartCard>
          <div id="call-history" className="scroll-mt-16">
            {selected && (
              <ChartCard icon={PhoneCall} title={`Lịch sử cuộc gọi · ${selected.name}`} subtitle={`${dmy(start)} – ${dmy(end)} · mỗi dòng một ghi chú; đơn chốt cùng ngày của khách đó gắn vào ghi chú đầu tiên trong ngày`}
                action={<><Button size="sm" onClick={exportHistory} disabled={!history}><FileDown size={14} />Xuất Excel lịch sử</Button><Button size="sm" variant="ghost" onClick={() => { setSelected(null); setHistory(null); }}>Đóng</Button></>}>
                {historyLoading && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
                {history && (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {history.days.map((d) => <div key={d.day} className="rounded-xl border px-3 py-2 text-xs"><div className="font-semibold">{dmy(d.day)}</div><div>{d.calls} cuộc · {d.customers} khách</div><div className="text-[#547467]">{d.orders} đơn · {short(d.net)} đ · AOV {d.aov ? short(d.aov) : '—'}</div></div>)}
                    </div>
                    <div className="max-h-[36rem] overflow-auto">
                      <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                        <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]"><tr><th className="py-2">Giờ</th><th>Khách hàng</th><th>POS</th><th>Nội dung ghi chú</th><th>Đơn chốt cùng ngày</th><th className="text-right">Doanh thu</th></tr></thead>
                        <tbody>
                          {history.items.map((it) => (
                            <tr key={it.id} className="border-t align-top">
                              <td className="whitespace-nowrap py-2 text-xs">{dmy(it.day)} {timeOnly(it.createdAt)}</td>
                              <td className="whitespace-nowrap text-xs"><div className="font-medium">{it.customer || '—'}</div><div className="text-[#7d9184]">{it.phone ?? ''}{it.assignedTo ? ` · PC: ${it.assignedTo}` : ''}</div></td>
                              <td className="whitespace-nowrap text-xs"><span className="mr-1 inline-block size-2 rounded-full" style={{ background: posColor(it.posId) }} />{it.posName}</td>
                              <td className="max-w-md whitespace-pre-wrap text-xs">{it.message}{it.source === 'order' && <StatusChip tone="gray">từ đơn</StatusChip>}</td>
                              <td className="text-xs">{it.orders.length ? it.orders.map((o) => <div key={o.id}>#{o.orderId} · {o.statusName}{o.items ? ` · ${o.items}` : ''}</div>) : <span className="text-[#c3c2b7]">—</span>}</td>
                              <td className="whitespace-nowrap text-right text-xs">{it.orders.length ? money(it.orders.reduce((a, o) => a + o.net, 0)) : ''}</td>
                            </tr>
                          ))}
                          {!history.items.length && <tr><td colSpan={6} className="py-4 text-center text-xs text-[#7d9184]">Không có ghi chú trong kỳ.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-[#7d9184]">{pct(history.items.length ? history.items.filter((i) => i.orders.length).length / history.items.length * 100 : null)} ghi chú có đơn chốt cùng ngày.</p>
                  </>
                )}
              </ChartCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
