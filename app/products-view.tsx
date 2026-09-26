'use client';

// Sản phẩm (giai đoạn 4b · 26/09/2026): sản phẩm bán chạy so kỳ trước, tỷ trọng theo nhóm, xu hướng theo ngày của sản phẩm dẫn đầu, hoàn theo sản phẩm.
import { AiPackButton } from './ai-pack';
import { useMemo, useState } from 'react';
import { BarChart3, FileDown, Layers, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { POS } from '@/lib/report-model';
import { todayVn } from '@/lib/report-time';
import type { ProductsReport } from '@/lib/products-report';
import { ICON } from './icons';
import { PeriodToolbar, PosChips, presetRange } from './overview-view';
import { useApi } from './use-api';
import { ChartCard, Definitions, DeltaPill, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, delta, dmy, pct, shortMoney, useSort, vi } from './ui-kit';

const GROUP_COLORS: Record<string, string> = { 'Kháng sinh': 'var(--ai-3)', 'SK + GK': 'var(--ai-5)', 'Khác': 'var(--ink-4)' };
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;

function Spark({ points, color = 'var(--primary)' }: { points: { revenue: number }[]; color?: string }) {
  if (points.length < 2) return <span className="text-[11px] text-ink-4">—</span>;
  const W = 110, H = 28, max = Math.max(1, ...points.map((p) => p.revenue));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i / (points.length - 1) * W).toFixed(1)},${(H - 2 - p.revenue / max * (H - 4)).toFixed(1)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-[110px]" aria-hidden="true"><path d={`${d} L${W},${H} L0,${H} Z`} fill={color} fillOpacity={0.12} /><path d={d} fill="none" stroke={color} strokeWidth={1.8} /></svg>;
}

export function ProductsView() {
  const today = todayVn();
  const [preset, setPreset] = useState('month');
  const [start, setStart] = useState(monthStart(today));
  const [end, setEnd] = useState(today);
  const [posIds, setPosIds] = useState<string[]>(POS.map((p) => p.id));
  const [group, setGroup] = useState<string | null>(null);
  const url = useMemo(() => `/api/reports/products?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data: r, loading, error, reload } = useApi<ProductsReport>(url);
  type K = 'revenue' | 'qty' | 'orders' | 'returnRate' | 'growth';
  const sort = useSort<K>('revenue');
  const spark = useMemo(() => new Map((r?.series ?? []).map((s) => [s.name, s.points])), [r]);
  const rows = useMemo(() => sort.apply((r?.rows ?? []).filter((x) => !group || x.group === group).map((x) => ({ ...x, growth: delta(x.revenue, x.prevRevenue) })), (x, k) => x[k] === Infinity ? 1e9 : x[k]), [r, sort, group]);
  const top = (r?.rows ?? []).slice(0, 12);
  const topMax = Math.max(1, ...top.flatMap((x) => [x.revenue, x.prevRevenue]));
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  const exportExcel = async () => {
    if (!r) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      [`Sản phẩm · ${periodLabel}`], [],
      ['Sản phẩm', 'Nhóm', 'Đơn', 'SL bán', 'Tiền hàng', 'Tiền hàng kỳ trước', 'SL hoàn', 'Tỷ lệ hoàn (%)'],
      ...r.rows.map((x) => [x.name, x.group, x.orders, x.qty, x.revenue, x.prevRevenue, x.returnedQty, x.returnRate === null ? '' : Number(x.returnRate.toFixed(1))]),
    ]), 'Sản phẩm');
    XLSX.writeFile(wb, `san-pham_${start}_${end}.xlsx`);
  };
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${periodLabel} · so với ${r ? `${dmy(r.prevPeriod.start)}–${dmy(r.prevPeriod.end)}` : 'kỳ trước'}`} title="Sản phẩm" subtitle="Sản phẩm nào bán chạy, đang lên hay xuống, hoàn nhiều không"
        actions={<><AiPackButton disabled={!r} pack={() => r && ({
          page: 'Sản phẩm', period: periodLabel,
          facts: [['Tiền hàng', Math.round(r.total.revenue)], ['Kỳ trước', Math.round(r.total.prevRevenue)], ['Số lượng bán', r.total.qty], ['Số sản phẩm có bán', r.total.products], ['Tỷ lệ hoàn (SL)', pct(r.total.returnRate)]],
          tables: [
            { title: 'Theo nhóm', columns: ['Nhóm', 'Tiền hàng', 'Kỳ trước', 'SL'], rows: r.groups.map((g) => [g.label, Math.round(g.revenue), Math.round(g.prevRevenue), g.qty]) },
            { title: 'Sản phẩm (tối đa 60)', columns: ['Sản phẩm', 'Nhóm', 'Tiền hàng', 'Kỳ trước', 'SL', 'Đơn', 'Hoàn (SL)'], rows: r.rows.slice(0, 60).map((x) => [x.name, x.group, Math.round(x.revenue), Math.round(x.prevRevenue), x.qty, x.orders, pct(x.returnRate)]) },
          ],
          definitions: r.definitions,
          questions: ['Sản phẩm nào đang lên, đang xuống so kỳ trước? Vì sao có thể như vậy?', 'Sản phẩm nào hoàn nhiều bất thường, nên kiểm tra gì?', 'Nên đẩy nhóm nào / sản phẩm nào tháng tới?'],
        })} /><Button variant="outline" onClick={() => void exportExcel()} disabled={!r}><FileDown size={14} />Xuất Excel</Button></>} />
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={(v) => { setPreset(v); const x = presetRange(v, today); if (x) { setStart(x.start); setEnd(x.end); } }}
        onStart={(v) => { setPreset('custom'); setStart(v); }} onEnd={(v) => { setPreset('custom'); setEnd(v); }} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <><SkeletonKpis count={4} className="xl:grid-cols-4" /><SkeletonTable rows={6} cols={6} /></>}
      {r && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 ${loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={ICON.revenue} tone="teal" label="Tiền hàng" value={shortMoney(r.total.revenue)} delta={delta(r.total.revenue, r.total.prevRevenue)} tooltip={{ period: periodLabel, current: shortMoney(r.total.revenue), previous: shortMoney(r.total.prevRevenue), definition: r.definitions.revenue }} />
            <KpiCard icon={ICON.products} tone="blue" label="Số lượng bán" value={vi.format(r.total.qty)} note={`${vi.format(r.total.products)} sản phẩm có bán`} tooltip={{ period: periodLabel, current: vi.format(r.total.qty), definition: r.definitions.scope }} />
            <KpiCard icon={ICON.returned} tone="orange" invert label="Tỷ lệ hoàn (SL)" value={pct(r.total.returnRate)} note={`${vi.format(r.total.returnedQty)} sản phẩm hoàn`} tooltip={{ period: periodLabel, current: pct(r.total.returnRate), definition: r.definitions.returned }} />
            <KpiCard icon={Layers} tone="purple" label="Nhóm dẫn đầu" value={r.groups[0]?.label ?? '—'} note={r.groups[0] ? `${pct(r.total.revenue ? r.groups[0].revenue / r.total.revenue * 100 : null, 0)} tiền hàng` : ''} tooltip={{ period: periodLabel, definition: r.definitions.group }} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ChartCard icon={BarChart3} title="Bán chạy nhất · tiền hàng" subtitle="Thanh đậm = kỳ này, thanh mờ = kỳ trước cùng số ngày">
              {top.length ? (
                <ul className="m-0 list-none space-y-2.5 p-0">
                  {top.map((x, i) => (
                    <li key={x.name} className="grid grid-cols-[1.25rem_minmax(0,14rem)_minmax(0,1fr)_6.5rem] items-center gap-2 text-[12.5px]">
                      <span className="num text-[11px] text-ink-4">{i + 1}</span>
                      <span className="truncate text-ink" title={x.name}>{x.name}</span>
                      <span className="grid gap-0.5">
                        <span className="h-2.5 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full" style={{ width: `${x.revenue / topMax * 100}%`, background: GROUP_COLORS[x.group] }} /></span>
                        <span className="h-1 overflow-hidden rounded-full"><i className="block h-full rounded-full opacity-35" style={{ width: `${x.prevRevenue / topMax * 100}%`, background: GROUP_COLORS[x.group] }} /></span>
                      </span>
                      <span className="text-right"><span className="num block text-ink">{shortMoney(x.revenue)}</span><DeltaPill variant="plain" value={x.prevRevenue ? delta(x.revenue, x.prevRevenue) : null} /></span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState text="Chưa có sản phẩm bán trong kỳ." />}
            </ChartCard>
            <div className="grid gap-4">
              <ChartCard icon={Layers} title="Theo nhóm" subtitle="Bấm một nhóm để lọc bảng bên dưới" info={r.definitions.group}>
                <div className="flex h-4 gap-[2px] overflow-hidden rounded-full">{r.groups.map((g) => <i key={g.label} className="block h-full" style={{ width: `${r.total.revenue ? g.revenue / r.total.revenue * 100 : 0}%`, background: GROUP_COLORS[g.label] }} />)}</div>
                <div className="mt-2 grid gap-1.5">
                  {r.groups.map((g) => (
                    <button key={g.label} type="button" onClick={() => setGroup(group === g.label ? null : g.label)} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-tint-2 ${group === g.label ? 'bg-tint-2 font-semibold' : ''}`}>
                      <i className="size-2.5 rounded-full" style={{ background: GROUP_COLORS[g.label] }} /><span className="text-ink">{g.label}</span>
                      <span className="num ml-auto text-ink">{shortMoney(g.revenue)}</span><DeltaPill variant="plain" value={g.prevRevenue ? delta(g.revenue, g.prevRevenue) : null} />
                    </button>
                  ))}
                </div>
              </ChartCard>
              <ChartCard icon={TrendingUp} title="Xu hướng theo ngày" subtitle="8 sản phẩm tiền hàng cao nhất">
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {(r.series).map((s) => { const g = r.rows.find((x) => x.name === s.name)?.group ?? 'Khác'; return (
                    <li key={s.name} className="flex items-center gap-2 text-[12px]"><span className="min-w-0 flex-1 truncate text-ink-2" title={s.name}>{s.name}</span><Spark points={s.points} color={GROUP_COLORS[g] === 'var(--ink-4)' ? 'var(--primary)' : GROUP_COLORS[g]} /></li>
                  ); })}
                </ul>
              </ChartCard>
            </div>
          </div>
          <ChartCard icon={ICON.products} title={`Tất cả sản phẩm · ${rows.length}${group ? ` · ${group}` : ''}`} subtitle="Bấm tiêu đề cột để sắp xếp · tối đa 300 sản phẩm" info={r.definitions.scope}>
            {rows.length ? (
              <TableWrap minWidth={880} maxHeight="36rem" stickyFirst>
                <table className="tbl">
                  <thead><tr>
                    <th className="text-left">Sản phẩm</th>
                    <SortTh k="revenue" label="Tiền hàng" sort={sort} />
                    <SortTh k="growth" label="So kỳ trước" sort={sort} />
                    <SortTh k="qty" label="SL bán" sort={sort} />
                    <SortTh k="orders" label="Đơn" sort={sort} />
                    <SortTh k="returnRate" label="Hoàn (SL)" sort={sort} />
                    <th>Theo ngày</th>
                  </tr></thead>
                  <tbody>{rows.map((x) => (
                    <tr key={x.name}>
                      <td className="max-w-[22rem] text-left font-medium text-ink"><span className="line-clamp-2">{x.name}</span><span className="flex items-center gap-1 text-[11px] font-normal text-ink-3"><i className="size-2 rounded-full" style={{ background: GROUP_COLORS[x.group] }} />{x.group}</span></td>
                      <td className="n">{shortMoney(x.revenue)}<span className="block text-[11px] text-ink-3">{pct(r.total.revenue ? x.revenue / r.total.revenue * 100 : null, 1)}</span></td>
                      <td className="n">{x.prevRevenue ? <DeltaPill variant="plain" value={x.growth} /> : <span className="text-[11px] text-ink-3">mới</span>}<span className="block text-[11px] text-ink-3">{shortMoney(x.prevRevenue)}</span></td>
                      <td className="n">{vi.format(x.qty)}</td>
                      <td className="n">{vi.format(x.orders)}</td>
                      <td className={`n ${x.returnRate !== null && x.returnRate >= 8 ? 'text-bad' : ''}`}>{pct(x.returnRate)}<span className="block text-[11px] text-ink-3">{vi.format(x.returnedQty)} sp</span></td>
                      <td>{spark.has(x.name) ? <Spark points={spark.get(x.name)!} /> : <span className="text-[11px] text-ink-4">—</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Không có sản phẩm." />}
          </ChartCard>
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}
