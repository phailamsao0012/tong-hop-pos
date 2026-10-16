'use client';

import { useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import { TrendingUp } from 'lucide-react';
import type { buildProfit, PfCell } from '@/lib/profit';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useApi } from './use-api';
import { PosBadge } from './pos-badge';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonTable, SortTh, TableWrap, money, pct, useSort, vi } from './ui-kit';

type Report = ReturnType<typeof buildProfit> & { ready: boolean; allPos: boolean; notReady?: 'sent'; definitions: Record<string, string> };
type Row = PfCell & { id: string; label: string; shipping: number };
const tabs = { pos: 'Theo POS', line: 'Theo loại đơn', marketer: 'Theo marketer', team: 'Theo team MKT' };
const columns = [
  ['sent', 'Đơn đã gửi'], ['delivered', 'Đã nhận'], ['returned', 'Hoàn'], ['revenue', 'Doanh thu khách đã nhận'],
  ['cogs', 'Giá vốn'], ['shipping', 'Phí ship'], ['gross', 'Lãi gộp'], ['margin', 'Biên %'],
  ['adCost', 'Chi phí QC'], ['afterAds', 'Lãi sau QC'], ['roasClosed', 'ROAS chốt'], ['roasAfterReturn', 'ROAS sau hoàn'],
] as const;
const ratio = (n: number | null) => n === null ? '—' : `${vi.format(Math.round(n * 100) / 100)}×`;
const profitColor = (n: number) => n < 0 ? '#dc2626' : '#17684b';

function Waterfall({ cell }: { cell: PfCell }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ship = cell.shipOut + cell.shipBack;
    const ranges: [number, number][] = [[0, cell.revenue], [cell.revenue - cell.cogs, cell.revenue], [cell.gross, cell.gross + ship], [0, cell.gross]];
    const labels = ['Doanh thu khách đã nhận', 'Trừ giá vốn', 'Trừ phí ship', 'Lãi gộp'];
    const colors = ['#17684b', '#d97706', '#d97706', profitColor(cell.gross)];
    if (cell.adCost !== null && cell.afterAds !== null) {
      ranges.push([cell.afterAds, cell.gross], [0, cell.afterAds]);
      labels.push('Trừ quảng cáo', 'Lãi sau quảng cáo');
      colors.push('#d97706', profitColor(cell.afterAds));
    }
    const chart = new Chart(ref.current, { type: 'bar', data: { labels, datasets: [{ label: 'Giá trị (₫)', data: ranges, backgroundColor: colors }] }, options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => {
        const index = context.dataIndex;
        const values = [cell.revenue, -cell.cogs, -ship, cell.gross, -(cell.adCost ?? 0), cell.afterAds];
        return money(values[index]);
      } } } }, scales: { x: { ticks: { callback: (value) => money(Number(value)) } } },
    } });
    return () => chart.destroy();
  }, [cell]);
  return <div className="h-80"><canvas ref={ref} aria-label={`Doanh thu ${money(cell.revenue)}, trừ giá vốn ${money(cell.cogs)}, trừ phí ship ${money(cell.shipOut + cell.shipBack)}, lãi gộp ${money(cell.gross)}, quảng cáo ${money(cell.adCost)}, lãi sau quảng cáo ${money(cell.afterAds)}`} /></div>;
}

function ProfitTable({ rows, tab }: { rows: Row[]; tab: keyof typeof tabs }) {
  const sort = useSort<string>('gross');
  return <TableWrap minWidth={1600}><table className="tbl"><thead><tr><SortTh k="label" label={tabs[tab]} sort={sort} align="left" />{columns.map(([key, label]) => <SortTh key={key} k={key} label={label} sort={sort} />)}</tr></thead>
    <tbody>{sort.apply(rows, (r, k) => k === 'label' ? r.label : r[k as typeof columns[number][0]]).map((r) => <tr key={r.id}><td>{tab === 'pos' && <PosBadge posId={r.id} />} {r.label}</td>{columns.map(([key]) => <td key={key} className="n" style={key === 'gross' || key === 'afterAds' ? { color: r[key] === null ? undefined : profitColor(r[key]) } : undefined}>{key === 'margin' ? pct(r[key]) : key === 'roasClosed' || key === 'roasAfterReturn' ? ratio(r[key]) : key === 'sent' || key === 'delivered' || key === 'returned' ? vi.format(r[key]) : money(r[key])}</td>)}</tr>)}
      {!rows.length && <tr><td colSpan={13}>Chưa có dữ liệu trong phạm vi đang chọn</td></tr>}
    </tbody></table></TableWrap>;
}

export function ProfitView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const [tab, setTab] = useState<keyof typeof tabs>('pos');
  const { data: report, loading, error, reload } = useApi<Report>(`/api/reports/lai-that?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, { keep: false });
  const total = report?.total;
  const rows: Row[] = !report ? [] : (tab === 'pos' ? report.byPos.map((r) => ({ ...r, id: r.posId, label: r.posId }))
    : tab === 'line' ? report.byLine.map((r) => ({ ...r, id: r.line, label: r.line }))
    : tab === 'marketer' ? report.byMarketer.map((r) => ({ ...r, id: r.marketerId, label: r.marketerId }))
    : report.byTeam.map((r) => ({ ...r, id: r.teamId }))).map((r) => ({ ...r, shipping: r.shipOut + r.shipBack }));
  const showTable = () => document.getElementById('profit-table')?.scrollIntoView({ behavior: 'smooth' });
  const missingPct = total?.delivered ? total.missingCost / total.delivered * 100 : 0;
  return <div className="space-y-5">
    <PageHeader title="Lãi thật" subtitle="Chỉ chủ hệ thống · đơn chuyển đi trong kỳ theo ngày gửi hãng lần đầu · tối đa 93 ngày" />
    <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={loading} onReload={reload} />
    <PosChips posIds={posIds} onChange={setPosIds} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {!report && !error && <SkeletonTable rows={8} />}
    {report && total && <>
      <p className="text-sm text-ink-3">{start} → {end} · POS đang chọn · chỉ đơn có marketer thuộc MKT, CSKH hoặc SALE được tính</p>
      {!report.ready && <p aria-live="polite" className="text-sm text-warn">Đơn cũ đang được tính giá vốn, kỳ cũ có thể thiếu</p>}
      {report.notReady === 'sent' ? <EmptyState text="Đang điền giờ gửi hãng cho đơn cũ, chưa thể tính Lãi thật trong kỳ" /> : <>
        {missingPct > 5 && <p aria-live="polite" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{pct(missingPct)} đơn thiếu giá vốn trên Pancake, lãi chỉ tính trên đơn đủ giá vốn</p>}
        {!report.allPos && <p className="text-sm text-warn">Chi phí quảng cáo không có POS. Chọn đủ 6 POS để xem chi phí quảng cáo, lãi sau quảng cáo và ROAS sau hoàn.</p>}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">{([
          ['Doanh thu khách đã nhận', total.revenue, 'Đơn đã nhận đủ giá vốn'], ['Giá vốn', total.cogs, 'Gồm quà tặng trên đơn đã nhận đủ giá vốn'],
          ['Phí ship (đi + hoàn)', total.shipOut + total.shipBack, 'Phí hoàn giả định bằng phí chiều đi'], ['Lãi gộp', total.gross, `Biên ${pct(total.margin)}`],
          ['Chi phí quảng cáo', total.adCost, 'Theo ngày quảng cáo trong kỳ · đủ 6 POS'], ['Lãi sau quảng cáo', total.afterAds, 'Lãi gộp trừ quảng cáo · đủ 6 POS'],
        ] as const).map(([label, value, note]) => <KpiCard key={label} icon={TrendingUp} label={label} value={money(value)} note={note} tone={value === null ? 'gray' : value < 0 ? 'red' : 'green'} onClick={showTable} />)}</div>
        <div className="grid grid-cols-2 gap-3"><KpiCard icon={TrendingUp} label="ROAS chốt" value={ratio(total.roasClosed)} note="Theo ngày xác nhận · cùng kỳ và POS" onClick={showTable} /><KpiCard icon={TrendingUp} label="ROAS sau hoàn" value={ratio(total.roasAfterReturn)} note="Doanh thu khách đã nhận / chi phí quảng cáo" onClick={showTable} /></div>
        <p className="text-sm text-ink-3">Đã gửi: {vi.format(total.sent)} · Đã nhận: {vi.format(total.delivered)} · Hoàn: {vi.format(total.returned)} · Còn trên đường: {vi.format(total.inTransit)} đơn ({money(total.inTransitNet)}, chưa tính lãi) · Thiếu giá vốn: {vi.format(total.missingCost)} đơn ({pct(missingPct)} trên đơn đã nhận) · Thiếu phí ship: {vi.format(total.missingFee)} đơn (coi phí bằng 0)</p>
        <ChartCard title="Từ doanh thu đến lãi sau quảng cáo"><Waterfall cell={total} /></ChartCard>
        <ChartCard id="profit-table" title="Chi tiết Lãi thật" subtitle="Giữ kỳ và POS đang chọn; bấm tiêu đề cột để sắp xếp">
          <div className="mb-4 flex flex-wrap gap-2">{(Object.keys(tabs) as (keyof typeof tabs)[]).map((key) => <button type="button" key={key} className="btn sm" aria-pressed={tab === key} onClick={() => setTab(key)}>{tabs[key]}</button>)}</div>
          <p className="mb-3 text-sm text-ink-3">Theo POS và loại đơn chỉ tính lãi gộp, không phân bổ quảng cáo. Đơn nhiều loại chia đều; marketer hiển thị bằng mã Pancake. ROAS chốt theo team không có sẵn.</p>
          <ProfitTable rows={rows} tab={tab} />
        </ChartCard>
        <ChartCard title="Cần xem" subtitle="Marketer có ROAS chốt từ 2× nhưng lãi sau quảng cáo âm"><TableWrap><table className="tbl"><thead><tr><th>Mã marketer</th><th>ROAS chốt</th><th>Lãi sau quảng cáo</th></tr></thead><tbody>{report.warnings.map((r) => <tr key={r.marketerId}><td>{r.marketerId}</td><td className="n">{ratio(r.roasClosed)}</td><td className="n" style={{ color: '#dc2626' }}>{money(r.afterAds)}</td></tr>)}{!report.warnings.length && <tr><td colSpan={3}>{report.allPos ? 'Không có cảnh báo trong kỳ' : 'Chọn đủ 6 POS để tính cảnh báo'}</td></tr>}</tbody></table></TableWrap></ChartCard>
      </>}
      <Definitions items={Object.entries(report.definitions).map(([term, def]) => `${term}: ${def}`)} />
    </>}
  </div>;
}
