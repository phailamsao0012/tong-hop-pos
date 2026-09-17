'use client';

// Vận hành đơn theo nhân viên: từ đơn chốt → xuất kho → gửi hàng → đã nhận / hoàn / hủy, giống bảng kho làm tay.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, PackageCheck, Truck, Undo2, Warehouse, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { useTeam } from './team-store';
import { ChartCard, ErrorBox, EmptyState, Funnel, KpiCard, PageHeader, StatusChip, dmy, money, pct, posColor, short, vi } from './ui-kit';

type Bucket = { orders: number; net: number; gross: number };
type BucketKey = 'closed' | 'processing' | 'shipping' | 'delivered' | 'returned' | 'cancelled' | 'shipped' | 'confirmed' | 'packing' | 'waiting' | 'other' | 'unconfirmed';
type Buckets = Record<BucketKey, Bucket>;
type Report = {
  period: { start: string; end: string }; basis: 'confirmed' | 'created'; total: Buckets;
  byEmployee: { sellerId: string; name: string; department: string | null; posIds: string[]; buckets: Buckets }[];
  byPos: { posId: string; posName: string; buckets: Buckets }[];
  departments: string[]; definitions: Record<string, string>;
};
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const rate = (a: number, b: number) => b ? a / b * 100 : null;
const COLS: { key: string; label: string; group: 'orders' | 'money' | 'rate'; get: (b: Buckets) => number | null; money?: boolean; tone?: string }[] = [
  { key: 'closed', label: 'Đơn chốt', group: 'orders', get: (b) => b.closed.orders },
  { key: 'processing', label: 'Chưa xuất kho', group: 'orders', get: (b) => b.processing.orders },
  { key: 'shipped', label: 'Đã xuất đi', group: 'orders', get: (b) => b.shipped.orders },
  { key: 'shipping', label: 'Đang giao', group: 'orders', get: (b) => b.shipping.orders },
  { key: 'delivered', label: 'Đã nhận', group: 'orders', get: (b) => b.delivered.orders },
  { key: 'returned', label: 'Hoàn', group: 'orders', get: (b) => b.returned.orders },
  { key: 'cancelled', label: 'Hủy', group: 'orders', get: (b) => b.cancelled.orders },
  { key: 'successRate', label: '% thành công', group: 'rate', get: (b) => rate(b.delivered.orders, b.shipped.orders) },
  { key: 'shippingRate', label: '% đang giao', group: 'rate', get: (b) => rate(b.shipping.orders, b.shipped.orders) },
  { key: 'returnRate', label: 'Tỷ lệ hoàn', group: 'rate', get: (b) => rate(b.returned.orders, b.shipped.orders) },
  { key: 'shipRate', label: 'Chuyển hàng/chốt', group: 'rate', get: (b) => rate(b.shipped.orders, b.closed.orders) },
  { key: 'closedGross', label: 'Doanh số chốt', group: 'money', get: (b) => b.closed.gross, money: true },
  { key: 'shippedGross', label: 'Doanh số xuất đi', group: 'money', get: (b) => b.shipped.gross, money: true },
  { key: 'deliveredNet', label: 'Doanh thu thành công', group: 'money', get: (b) => b.delivered.net, money: true },
  { key: 'shippingNet', label: 'Đang giao (tiền)', group: 'money', get: (b) => b.shipping.net, money: true },
  { key: 'returnedGross', label: 'Doanh số hoàn', group: 'money', get: (b) => b.returned.gross, money: true },
  { key: 'successMoneyRate', label: '% thành công (tiền)', group: 'rate', get: (b) => rate(b.delivered.net, b.shipped.net) },
  { key: 'returnMoneyRate', label: 'Tỷ lệ hoàn (tiền)', group: 'rate', get: (b) => rate(b.returned.gross, b.shipped.gross) },
  { key: 'shipMoneyRate', label: 'Chuyển hàng/chốt (tiền)', group: 'rate', get: (b) => rate(b.shipped.gross, b.closed.gross) },
];

export function PipelineView() {
  const today = todayVn();
  const team = useTeam();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [basis, setBasis] = useState<'confirmed' | 'created'>('confirmed');
  const [department, setDepartment] = useState('all');
  const [sortKey, setSortKey] = useState('closed');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/reports/pipeline?${new URLSearchParams({ start, end, posIds: posIds.join(','), basis, team })}`, { cache: 'no-store' });
      const body = await r.json() as Report & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Không tải được báo cáo.');
      setReport(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được báo cáo.'); }
    finally { setLoading(false); }
  }, [start, end, posIds, basis, team]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey) ?? COLS[0];
    return (report?.byEmployee ?? []).filter((e) => department === 'all' || (department === '__none' ? !e.department : e.department === department))
      .sort((a, b) => (col.get(b.buckets) ?? -1) - (col.get(a.buckets) ?? -1));
  }, [report, department, sortKey]);
  const totals = useMemo(() => {
    const t: Buckets = Object.fromEntries((Object.keys(report?.total ?? {}) as BucketKey[]).map((k) => [k, { orders: 0, net: 0, gross: 0 }])) as Buckets;
    for (const e of rows) for (const k of Object.keys(t) as BucketKey[]) { t[k].orders += e.buckets[k].orders; t[k].net += e.buckets[k].net; t[k].gross += e.buckets[k].gross; }
    return t;
  }, [rows, report]);
  const T = report ? totals : null;
  const cell = (c: typeof COLS[number], b: Buckets) => { const v = c.get(b); return c.group === 'rate' ? pct(v) : c.money ? money(v) : vi.format(v ?? 0); };

  const exportExcel = async () => {
    if (!report) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const header = ['Nhân viên', 'Bộ phận', 'POS', ...COLS.map((c) => c.label)];
    const line = (name: string, dept: string, pos: string, b: Buckets) => [name, dept, pos, ...COLS.map((c) => { const v = c.get(b); return c.group === 'rate' ? (v === null ? '' : Number(v.toFixed(2))) : Math.round(v ?? 0); })];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [`Vận hành đơn theo nhân viên · ${report.period.start} → ${report.period.end} · ${basis === 'confirmed' ? 'theo giờ chốt' : 'theo ngày tạo'}`], [],
      header, ...rows.map((e) => line(e.name, e.department ?? '', e.posIds.map((id) => POS.find((p) => p.id === id)?.name ?? id).join(', '), e.buckets)), line('Tổng', '', '', totals),
    ]), 'Theo nhân viên');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['POS', ...COLS.map((c) => c.label)], ...report.byPos.map((p) => line(p.posName, '', '', p.buckets).filter((_, i) => i !== 1 && i !== 2)), line('Tổng', '', '', report.total).filter((_, i) => i !== 1 && i !== 2)]), 'Theo POS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(report.definitions).map(([k, v]) => [k, v])), 'Cách tính');
    XLSX.writeFile(wb, `van-hanh-don_${report.period.start}_${report.period.end}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`} title="Vận hành đơn theo nhân viên" subtitle="Từ đơn chốt → kho xuất hàng → shipper gửi → đã nhận / hoàn / hủy. Số liệu Pancake POS tại thời điểm đồng bộ, không cần kho làm tay."
        actions={<Button onClick={exportExcel} disabled={!report}>Xuất Excel</Button>} />
      <PeriodToolbar preset={preset} start={start} end={end} onPreset={(v) => { setPreset(v); const r = presetRange(v, today); if (r) { setStart(r.start); setEnd(r.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} loading={loading} onReload={() => void load()}
        extra={
          <>
            <span className="px-1 text-sm font-semibold text-[#62796d]">Tính theo</span>
            <Select value={basis} items={{ confirmed: 'Giờ chốt đơn (như Pancake)', created: 'Ngày tạo đơn' }} onValueChange={(v) => setBasis(v as typeof basis)}>
              <SelectTrigger className="min-w-52"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="confirmed">Giờ chốt đơn (như Pancake)</SelectItem><SelectItem value="created">Ngày tạo đơn</SelectItem></SelectContent>
            </Select>
            {report && (
              <>
                <span className="px-1 text-sm font-semibold text-[#62796d]">Bộ phận</span>
                <Select value={department} items={{ all: 'Tất cả bộ phận', ...Object.fromEntries(report.departments.map((d) => [d, d])), __none: 'Chưa có bộ phận' }} onValueChange={(v) => setDepartment(String(v))}>
                  <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Tất cả bộ phận</SelectItem>{report.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}<SelectItem value="__none">Chưa có bộ phận</SelectItem></SelectContent>
                </Select>
              </>
            )}
          </>
        } />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && <ErrorBox error={error} onRetry={() => void load()} />}
      {!report && !error && <p className="text-sm text-[#7d9184]">Đang tải…</p>}
      {report && T && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard icon={CheckCircle2} tone="green" label={basis === 'confirmed' ? 'Đơn chốt trong kỳ' : 'Đơn tạo trong kỳ đã chốt'} value={vi.format(T.closed.orders)} note={`Doanh số ${short(T.closed.gross)} đ${basis === 'created' && T.unconfirmed.orders ? ` · ${vi.format(T.unconfirmed.orders)} chưa chốt` : ''}`} />
            <KpiCard icon={Warehouse} tone="gray" label="Chưa xuất kho" value={vi.format(T.processing.orders)} note={`${pct(rate(T.processing.orders, T.closed.orders))} đơn chốt · ${short(T.processing.net)} đ`} />
            <KpiCard icon={Truck} tone="orange" label="Đang giao" value={vi.format(T.shipping.orders)} note={`${pct(rate(T.shipping.orders, T.shipped.orders))} đơn đã xuất · ${short(T.shipping.net)} đ`} />
            <KpiCard icon={PackageCheck} tone="teal" label="Đã nhận (thành công)" value={vi.format(T.delivered.orders)} note={`${pct(rate(T.delivered.orders, T.shipped.orders))} đơn đã xuất · ${short(T.delivered.net)} đ`} />
            <KpiCard icon={Undo2} tone="purple" label="Hoàn" value={vi.format(T.returned.orders)} note={`Tỷ lệ hoàn ${pct(rate(T.returned.orders, T.shipped.orders))} · ${short(T.returned.gross)} đ`} />
            <KpiCard icon={XCircle} tone="red" label="Hủy sau chốt" value={vi.format(T.cancelled.orders)} note={`${pct(rate(T.cancelled.orders, T.closed.orders))} đơn chốt`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <ChartCard icon={Truck} title="Hành trình đơn trong kỳ" subtitle={report.definitions.flow}>
              <Funnel steps={[
                { label: 'Đơn chốt', value: T.closed.orders, note: short(T.closed.gross) + ' đ' },
                { label: 'Đã xuất đi (shipper đã lấy)', value: T.shipped.orders, note: `${pct(rate(T.shipped.orders, T.closed.orders))} chuyển hàng/chốt` },
                { label: 'Đã nhận', value: T.delivered.orders, note: `${pct(rate(T.delivered.orders, T.shipped.orders))} thành công` },
              ]} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {([['confirmed', 'Đã xác nhận'], ['packing', 'Đang đóng hàng'], ['waiting', 'Chờ chuyển hàng'], ['other', 'Chờ hàng / in']] as const).map(([k, l]) => (
                  <div key={k} className="rounded-xl border p-2"><div className="text-[#7d9184]">{l}</div><div className="text-base font-semibold">{vi.format(T[k].orders)}</div><div className="text-[#547467]">{short(T[k].net)} đ</div></div>
                ))}
              </div>
            </ChartCard>
            <ChartCard icon={PackageCheck} title="Theo POS" subtitle="Cùng bộ lọc kỳ và bộ phận (bộ phận áp cho bảng nhân viên)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                  <thead className="text-left text-xs text-[#7d9184]"><tr><th className="py-2">POS</th><th className="text-right">Chốt</th><th className="text-right">Xuất đi</th><th className="text-right">Đã nhận</th><th className="text-right">% TC</th><th className="text-right">Hoàn</th><th className="text-right">% hoàn</th><th className="text-right">Hủy</th><th className="text-right">DT thành công</th></tr></thead>
                  <tbody>
                    {report.byPos.map((p) => (
                      <tr key={p.posId} className="border-t">
                        <td className="whitespace-nowrap py-2 font-medium"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: posColor(p.posId) }} />{p.posName}</td>
                        <td className="text-right">{vi.format(p.buckets.closed.orders)}</td><td className="text-right">{vi.format(p.buckets.shipped.orders)}</td><td className="text-right font-medium">{vi.format(p.buckets.delivered.orders)}</td>
                        <td className="text-right">{pct(rate(p.buckets.delivered.orders, p.buckets.shipped.orders))}</td><td className="text-right">{vi.format(p.buckets.returned.orders)}</td><td className="text-right">{pct(rate(p.buckets.returned.orders, p.buckets.shipped.orders))}</td>
                        <td className="text-right">{vi.format(p.buckets.cancelled.orders)}</td><td className="whitespace-nowrap text-right font-medium">{money(p.buckets.delivered.net)}</td>
                      </tr>
                    ))}
                    {!report.byPos.length && <tr><td colSpan={9} className="py-4 text-center text-xs text-[#7d9184]">Không có đơn trong kỳ.</td></tr>}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>
          <ChartCard icon={CheckCircle2} title={`Theo nhân viên · ${rows.length} người`} subtitle={`${report.definitions.shipped} ${report.definitions.rates}`}
            action={
              <Select value={sortKey} items={Object.fromEntries(COLS.map((c) => [c.key, c.label]))} onValueChange={(v) => setSortKey(String(v))}>
                <SelectTrigger className="min-w-48 text-xs"><span className="text-[#7d9184]">Sắp xếp:</span>&nbsp;<SelectValue /></SelectTrigger>
                <SelectContent>{COLS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            }>
            {rows.length ? (
              <div className="max-h-[40rem] overflow-auto">
                <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                  <thead className="sticky top-0 bg-white text-left text-xs text-[#7d9184]">
                    <tr><th className="py-1" /><th /><th /><th colSpan={7} className="border-b text-center font-semibold text-[#17684b]">Số đơn</th><th colSpan={4} className="border-b text-center font-semibold text-[#2a78d6]">Tỷ lệ theo đơn</th><th colSpan={5} className="border-b text-center font-semibold text-[#d85f2a]">Tiền</th><th colSpan={3} className="border-b text-center font-semibold text-[#5b48b8]">Tỷ lệ theo tiền</th></tr>
                    <tr><th className="py-2">#</th><th>Họ và tên</th><th>Bộ phận</th>{COLS.map((c) => <th key={c.key} className="whitespace-nowrap text-right">{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((e, i) => (
                      <tr key={e.sellerId || 'none'} className="border-t">
                        <td className="py-2 text-xs text-[#7d9184]">{i + 1}</td>
                        <td className="whitespace-nowrap font-medium">{e.name}<div className="text-[11px] font-normal text-[#7d9184]">{e.posIds.map((id) => <span key={id} className="mr-1.5"><span className="mr-0.5 inline-block size-1.5 rounded-full" style={{ background: posColor(id) }} />{POS.find((p) => p.id === id)?.name}</span>)}</div></td>
                        <td className="whitespace-nowrap text-xs text-[#7d9184]">{e.department ?? '—'}</td>
                        {COLS.map((c) => {
                          const v = c.get(e.buckets);
                          const bad = (c.key === 'returnRate' || c.key === 'returnMoneyRate') && (v ?? 0) > 10;
                          const good = (c.key === 'successRate' || c.key === 'successMoneyRate') && (v ?? 0) >= 85;
                          return <td key={c.key} className={`whitespace-nowrap text-right ${c.key === 'closed' || c.key === 'delivered' || c.key === 'deliveredNet' ? 'font-semibold' : ''} ${bad ? 'text-[#c8403f]' : good ? 'text-[#1a7a48]' : ''}`}>{cell(c, e.buckets)}</td>;
                        })}
                      </tr>
                    ))}
                    <tr className="border-t bg-[#f8faf8] font-semibold"><td className="py-2" /><td>Tổng</td><td />{COLS.map((c) => <td key={c.key} className="whitespace-nowrap text-right">{cell(c, totals)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            ) : <EmptyState text="Không có nhân viên có đơn trong kỳ với bộ lọc này." />}
            <p className="mt-3 text-xs text-[#7d9184]">{report.definitions.basis} <StatusChip tone="gray">Đỏ: tỷ lệ hoàn trên 10%</StatusChip> <StatusChip tone="gray">Xanh: thành công từ 85%</StatusChip></p>
          </ChartCard>
        </>
      )}
    </div>
  );
}
