'use client';

import { Truck, Undo2, Send, Activity } from 'lucide-react';
import { MIN_SENT, type RbCell, type RbReport } from '@/lib/return-breakdown';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useHrUnit, useTeam, withUnit } from './team-store';
import { useApi } from './use-api';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonTable, SortTh, TableWrap, money, pct, useSort, vi } from './ui-kit';

type Report = RbReport & { basis: 'sent' | 'closed'; ready: boolean; definitions: Record<string, string>; matrixProvinces: string[] };
type Row = RbCell & { key: string };
const cols = [{ key: 'sent', label: 'Đơn chuyển đi' }, { key: 'delivered', label: 'Đã nhận' }, { key: 'returned', label: 'Đơn hoàn' }, { key: 'rate', label: 'Tỷ lệ hoàn' }, { key: 'rateNet', label: 'Tỷ lệ hoàn theo giá trị' }] as const;
function BreakdownTable({ rows, first, overall, initial }: { rows: Row[]; first: string; overall: number | null; initial: 'sent' | 'rate' }) {
  const sort = useSort<string>(initial);
  const sorted = sort.apply(rows, (r, k) => k === 'key' ? r.key : r[k as keyof RbCell]);
  return <TableWrap minWidth={760}><table className="tbl"><thead><tr><SortTh k="key" label={first} sort={sort} align="left" />{cols.map((c) => <SortTh key={c.key} k={c.key} label={c.label} sort={sort} />)}</tr></thead>
    <tbody>{sorted.map((r) => <tr key={r.key}><td>{r.key}</td>{cols.map((c) => <td key={c.key} className="n">{c.key === 'rate' || c.key === 'rateNet' ? pct(r[c.key]) : vi.format(r[c.key])}{c.key === 'rate' && <span className="mt-1 block h-1 rounded bg-surface-3" aria-hidden="true"><span className="block h-full rounded" style={{ width: `${Math.min(100, r.rate ?? 0)}%`, backgroundColor: (r.rate ?? 0) > (overall ?? 0) ? '#dc2626' : '#17684b' }} /></span>}</td>)}</tr>)}</tbody>
  </table></TableWrap>;
}
export function ReturnBreakdownView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const unit = useHrUnit(), team = useTeam();
  const url = withUnit(`/api/reports/hoan-theo-hang?${new URLSearchParams({ start, end, posIds: posIds.join(','), team })}`, unit);
  const { data: report, loading, error, reload } = useApi<Report>(url, { keep: false });
  const highest = report?.carriers.filter((r) => r.sent >= MIN_SENT).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))[0];
  const provinces = report?.matrixProvinces ?? [];
  return <div className="space-y-5">
    <PageHeader title="Hoàn theo hãng, tỉnh" subtitle="Đơn chuyển đi và đơn hoàn theo hãng vận chuyển, địa chỉ nhận và lý do hoàn" />
    <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={loading} onReload={reload} />
    <PosChips posIds={posIds} onChange={setPosIds} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {!report && !error && <SkeletonTable rows={8} />}
    {report && <>
      <p className="text-sm text-ink-3">{start} → {end} · {report.basis === 'sent' ? 'Theo ngày gửi hãng lần đầu' : 'Theo ngày vào Chờ xác nhận (chưa điền xong giờ gửi)'} · {unit?.name ?? team}</p>
      {!report.ready && <p className="text-sm text-warn">Đơn cũ đang được điền hãng ship và tỉnh, số theo hãng/tỉnh của kỳ cũ có thể nằm ở &apos;Chưa có hãng&apos;</p>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard icon={Send} label="Đơn chuyển đi" value={vi.format(report.total.sent)} note={`Giá trị ${money(report.total.sentNet)} · trong kỳ đang chọn`} onClick={() => document.getElementById('rb-carriers')?.scrollIntoView({ behavior: 'smooth' })} />
        <KpiCard icon={Undo2} label="Đơn hoàn" value={vi.format(report.total.returned)} note={`Giá trị ${money(report.total.returnedNet)} · trong nhóm chuyển đi`} onClick={() => document.getElementById('rb-reasons')?.scrollIntoView({ behavior: 'smooth' })} />
        <KpiCard icon={Activity} label="Tỷ lệ hoàn" value={pct(report.total.rate)} note={`${vi.format(report.total.returned)} / ${vi.format(report.total.sent)} đơn chuyển đi`} onClick={() => document.getElementById('rb-carriers')?.scrollIntoView({ behavior: 'smooth' })} />
        <KpiCard icon={Truck} label="Hãng hoàn cao nhất" value={highest?.key ?? '—'} note={`${pct(highest?.rate ?? null)} · chỉ hãng từ ${MIN_SENT} đơn`} onClick={() => document.getElementById('rb-carriers')?.scrollIntoView({ behavior: 'smooth' })} />
      </div>
      {!report.total.sent ? <EmptyState text="Chưa có đơn chuyển đi trong kỳ" /> : <>
        <ChartCard id="rb-carriers" title="Theo hãng ship"><BreakdownTable rows={report.carriers} first="Hãng" overall={report.total.rate} initial="sent" /></ChartCard>
        <ChartCard title="Theo tỉnh"><BreakdownTable rows={report.provinces} first="Tỉnh" overall={report.total.rate} initial="rate" /></ChartCard>
        <ChartCard title="Hãng × tỉnh" subtitle="15 tỉnh nhiều đơn chuyển đi nhất; ô dưới 20 đơn hiện —">
          <TableWrap minWidth={680}><table className="tbl"><thead><tr><th>Tỉnh</th>{report.carriers.map((c) => <th key={c.key}>{c.key}</th>)}</tr></thead><tbody>{provinces.map((province) => <tr key={province}><td>{province}</td>{report.carriers.map((carrier) => { const cell = report.matrix.find((r) => r.carrier === carrier.key && r.province === province)?.cell; return <td key={carrier.key} className="n" title={cell ? `${cell.returned} / ${cell.sent} đơn` : 'Dưới 20 đơn chuyển đi'} style={{ backgroundColor: cell ? `rgb(220 38 38 / ${Math.max(0.03, (cell.rate ?? 0) / 100 * 0.65)})` : undefined }}>{pct(cell?.rate ?? null)}</td>; })}</tr>)}</tbody></table></TableWrap>
        </ChartCard>
        <ChartCard id="rb-reasons" title="Lý do hoàn"><TableWrap><table className="tbl"><thead><tr><th>Lý do</th><th>Đơn hoàn</th><th>% trên tổng hoàn</th></tr></thead><tbody>{report.reasons.map((r) => <tr key={r.key}><td>{r.key}</td><td className="n">{vi.format(r.returned)}</td><td className="n">{pct(r.share)}</td></tr>)}</tbody></table></TableWrap></ChartCard>
        <ChartCard title="Lý do × loại đơn"><TableWrap><table className="tbl"><thead><tr><th>Lý do</th><th>Loại đơn</th><th>Đơn hoàn</th></tr></thead><tbody>{report.reasonByLine.map((r) => <tr key={JSON.stringify([r.reason, r.line])}><td>{r.reason}</td><td>{r.line}</td><td className="n">{vi.format(r.returned)}</td></tr>)}</tbody></table></TableWrap></ChartCard>
      </>}
      <Definitions items={Object.entries(report.definitions).map(([term, def]) => `${term}: ${def}`)} />
    </>}
  </div>;
}
