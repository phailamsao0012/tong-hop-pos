'use client';

// Phân tích Sale (giai đoạn 3b · 26/09/2026): tỷ lệ chốt data, thời gian chốt, giờ vàng (bảng nhiệt giờ × thứ),
// chất lượng đơn chốt (hoàn, hủy sau chốt) và bảng xếp hạng từng người.
import { usePosIds } from './pos-store';
import { usePeriod } from './period-store';
import { AiPackButton } from './ai-pack';
import { useMemo } from 'react';
import { Clock, Flame, Trophy } from 'lucide-react';
import { POS } from '@/lib/report-model';
import { RATE_THRESHOLDS, rateLevel } from '@/lib/metrics';
import type { SaleAnalytics } from '@/lib/sale-analytics';
import { ICON } from './icons';
import { PeriodToolbar, PosChips } from './overview-view';
import { useApi } from './use-api';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonKpis, SkeletonTable, SortTh, TableWrap, ThinkingLine, dmy, pct, shortMoney, useSort, vi } from './ui-kit';

const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const duration = (m: number | null | undefined) => m === null || m === undefined ? '—'
  : m < 60 ? `${Math.round(m)} phút` : m < 1440 ? `${(m / 60).toFixed(1).replace('.', ',')} giờ` : `${(m / 1440).toFixed(1).replace('.', ',')} ngày`;
const LEVEL_TEXT = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' } as const;

function Heatmap({ heat }: { heat: SaleAnalytics['heat'] }) {
  // Chỉ vẽ các giờ có số được chia (thường 6h–23h) để bảng gọn.
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => heat.some((d) => d[h].assigned > 0));
  if (!hours.length) return <EmptyState text="Chưa có số được chia trong kỳ." />;
  // Màu theo khoảng tỷ lệ thật của các ô đủ số (≥ 5): ô thấp nhất nhạt nhất, cao nhất đậm nhất.
  const rates = heat.flatMap((d) => hours.map((h) => d[h])).filter((c) => c.assigned >= 5).map((c) => c.closed / c.assigned * 100);
  const lo = rates.length ? Math.min(...rates) : 0, hi = rates.length ? Math.max(...rates) : 100;
  const shade = (rate: number) => Math.round(10 + 80 * (hi > lo ? Math.max(0, Math.min(1, (rate - lo) / (hi - lo))) : 0.5));
  const best = heat.flatMap((d, di) => d.map((c, h) => ({ di, h, rate: c.assigned >= 5 ? c.closed / c.assigned * 100 : -1, n: c.assigned }))).sort((a, b) => b.rate - a.rate)[0];
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[11px]">
          <thead><tr><th />{hours.map((h) => <th key={h} className="px-0.5 font-normal text-ink-3">{h}h</th>)}</tr></thead>
          <tbody>{heat.map((d, di) => (
            <tr key={di}>
              <th className="pr-1 text-left font-medium text-ink-2">{DAYS[di]}</th>
              {hours.map((h) => {
                const c = d[h]; const rate = c.assigned ? c.closed / c.assigned * 100 : null; const thin = c.assigned < 5;
                return (
                  <td key={h} title={`${DAYS[di]} ${h}h: ${c.assigned} số được chia, ${c.closed} chốt${rate === null ? '' : ` · ${pct(rate, 0)}`}`}
                    className="size-7 min-w-7 rounded-md text-center align-middle num text-[10px]"
                    style={{ background: rate === null ? 'var(--surface-2)' : `color-mix(in oklab, var(--primary) ${shade(rate)}%, var(--surface-2))`, opacity: thin ? 0.4 : 1, color: rate !== null && shade(rate) > 55 ? 'var(--primary-ink)' : 'var(--ink-2)' }}>
                    {rate === null ? '' : Math.round(rate)}
                  </td>
                );
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {best && best.rate >= 0 && <p className="m-0 mt-2 text-[12px] text-ink-2">Ô tốt nhất: <b>{DAYS[best.di]} {best.h}h</b> chốt {pct(best.rate, 0)} trên {vi.format(best.n)} số. Số trong ô = % chốt; màu đậm dần từ ô thấp nhất ({pct(lo, 0)}) tới cao nhất ({pct(hi, 0)}).</p>}
    </div>
  );
}

export function SaleAnalyticsView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const url = useMemo(() => `/api/reports/sale-analytics?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, [start, end, posIds]);
  const { data: r, loading, error, reload } = useApi<SaleAnalytics>(url);
  type K = 'net' | 'assigned' | 'dataRate' | 'medianMinutes' | 'closed' | 'aov' | 'returnRate' | 'cancelAfterClose';
  const sort = useSort<K>('net');
  const staff = useMemo(() => sort.apply(r?.staff ?? [], (s, k) => s[k]), [r, sort]);
  const bucketMax = Math.max(1, ...(r?.buckets ?? []).map((b) => b.n));
  const periodLabel = `${dmy(start)}/${start.slice(0, 4)} – ${dmy(end)}/${end.slice(0, 4)}`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={periodLabel} title="Phân tích Sale" subtitle="Chốt nhanh, chốt đúng: tỷ lệ chốt data, thời gian chốt, giờ vàng, hoàn và hủy theo người chốt"
        actions={<AiPackButton disabled={!r} pack={() => r && ({
          page: 'Phân tích Sale', period: periodLabel,
          facts: [['Số được chia', r.total.assigned], ['Chốt từ số được chia', r.total.closedFromAssigned], ['Tỷ lệ chốt data', pct(r.total.dataRate)], ['Thời gian chốt trung vị', duration(r.total.medianMinutes)],
            ['Đơn chốt', r.total.closed], ['Doanh thu', Math.round(r.total.net)], ['GTTB', r.total.aov === null ? null : Math.round(r.total.aov)], ['Tỷ lệ hoàn', pct(r.total.returnRate)], ['Hủy sau chốt', pct(r.total.cancelAfterClose)]],
          tables: [
            { title: 'Chốt sau bao lâu', columns: ['Khoảng', 'Số đơn'], rows: r.buckets.map((b) => [b.label, b.n]) },
            { title: 'Giờ vàng (tỷ lệ chốt theo giờ nhận số, gộp mọi ngày)', columns: ['Giờ', 'Số được chia', 'Chốt', 'Tỷ lệ'], rows: Array.from({ length: 24 }, (_, h) => { const a = r.heat.reduce((t, d) => t + d[h].assigned, 0), c = r.heat.reduce((t, d) => t + d[h].closed, 0); return [`${h}h`, a, c, pct(a ? c / a * 100 : null, 0)]; }).filter((x) => Number(x[1]) > 0) },
            { title: 'Từng nhân viên', staffCol: 0, columns: ['Nhân viên', 'Doanh thu', 'Đơn chốt', 'GTTB', 'Số được chia', 'Chốt data', 'Chốt sau', 'Hoàn', 'Hủy sau chốt'], rows: r.staff.map((s) => [s.name, Math.round(s.net), s.closed, s.aov === null ? null : Math.round(s.aov), s.assigned, pct(s.dataRate), duration(s.medianMinutes), pct(s.returnRate), pct(s.cancelAfterClose)]) },
          ],
          definitions: r.definitions,
          questions: ['Ai chốt tốt nhất và vì sao (tỷ lệ, tốc độ, GTTB)? Ai cần hỗ trợ?', 'Giờ nào nên dồn người trực nhận số?', 'Chốt nhanh có đi kèm hoàn / hủy cao không?', 'Nên đặt mục tiêu tỷ lệ chốt data bao nhiêu cho tháng tới?'],
        })} />} />
      <PeriodToolbar preset={preset} start={start} end={end} loading={loading} onReload={reload}
        onPreset={setPreset}
        onStart={setStart} onEnd={setEnd} />
      <PosChips posIds={posIds} onChange={setPosIds} />
      {error && !r && <ErrorBox error={error} onRetry={reload} />}
      {!r && !error && <><SkeletonKpis count={4} className="xl:grid-cols-4" /><ChartCard title="Giờ vàng" subtitle="Đang tải…"><ThinkingLine /><SkeletonTable rows={5} cols={6} /></ChartCard></>}
      {r && (
        <>
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 ${loading ? 'opacity-70' : ''}`}>
            <KpiCard icon={ICON.rate} tone="green" label="Tỷ lệ chốt data" value={pct(r.total.dataRate)} note={`${vi.format(r.total.closedFromAssigned)} chốt / ${vi.format(r.total.assigned)} số được chia`}
              progress={r.total.dataRate === null ? undefined : { value: r.total.dataRate, max: 100 }} tooltip={{ period: periodLabel, current: pct(r.total.dataRate), definition: r.definitions.dataRate }} />
            <KpiCard icon={Clock} tone="blue" label="Thời gian chốt (trung vị)" value={duration(r.total.medianMinutes)} note="Từ lúc nhận số tới lúc xác nhận" tooltip={{ period: periodLabel, current: duration(r.total.medianMinutes), definition: r.definitions.time }} />
            <KpiCard icon={ICON.aov} tone="teal" label="GTTB đơn chốt" value={shortMoney(r.total.aov)} note={`${vi.format(r.total.closed)} đơn · ${shortMoney(r.total.net)}`} tooltip={{ period: periodLabel, current: shortMoney(r.total.aov), definition: 'Doanh thu ÷ đơn chốt của người bán thuộc Sale.' }} />
            <KpiCard icon={ICON.returned} tone="orange" invert label="Hoàn · hủy sau chốt" value={`${pct(r.total.returnRate, 1)}`} note={`Hủy sau chốt ${pct(r.total.cancelAfterClose, 1)}`} tooltip={{ period: periodLabel, current: `Hoàn ${pct(r.total.returnRate)} · hủy sau chốt ${pct(r.total.cancelAfterClose)}`, definition: r.definitions.quality }} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <ChartCard icon={Flame} title="Giờ vàng · tỷ lệ chốt theo giờ nhận số" subtitle="Giờ trong ngày × thứ (giờ Việt Nam) · rê chuột vào ô để xem số" info={r.definitions.heat}>
              <Heatmap heat={r.heat} />
            </ChartCard>
            <ChartCard icon={Clock} title="Chốt sau bao lâu" subtitle="Số đơn chốt theo thời gian từ lúc nhận số" info={r.definitions.time}>
              <ul className="m-0 list-none space-y-2.5 p-0">
                {r.buckets.map((b, i) => (
                  <li key={b.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[12.5px]">
                    <span className="text-ink-2">{b.label}</span>
                    <span className="h-3 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full" style={{ width: `${b.n / bucketMax * 100}%`, background: i < 2 ? 'var(--good)' : i < 3 ? 'var(--primary)' : i < 4 ? 'var(--warn)' : 'var(--bad)' }} /></span>
                    <span className="num text-right text-ink">{vi.format(b.n)} <span className="text-[11px] text-ink-3">{pct(r.total.closedFromAssigned ? b.n / r.total.closedFromAssigned * 100 : null, 0)}</span></span>
                  </li>
                ))}
              </ul>
            </ChartCard>
          </div>
          <ChartCard icon={Trophy} title={`Xếp hạng · ${staff.length} người`} subtitle={`Màu tỷ lệ chốt data: xanh từ ${RATE_THRESHOLDS.good}%, vàng từ ${RATE_THRESHOLDS.warn}% · bấm tiêu đề cột để sắp xếp`} info={r.definitions.scope}>
            {staff.length ? (
              <TableWrap minWidth={960} maxHeight="34rem" stickyFirst>
                <table className="tbl">
                  <thead><tr>
                    <th className="w-8">#</th>
                    <th className="text-left">Nhân viên</th>
                    <SortTh k="net" label="Doanh thu" sort={sort} />
                    <SortTh k="closed" label="Đơn chốt" sort={sort} />
                    <SortTh k="aov" label="GTTB" sort={sort} />
                    <SortTh k="assigned" label="Số được chia" sort={sort} />
                    <SortTh k="dataRate" label="Chốt data" sort={sort} />
                    <SortTh k="medianMinutes" label="Chốt sau" sort={sort} />
                    <SortTh k="returnRate" label="Hoàn" sort={sort} />
                    <SortTh k="cancelAfterClose" label="Hủy sau chốt" sort={sort} />
                  </tr></thead>
                  <tbody>{staff.map((s) => (
                    <tr key={s.staffId}>
                      <td className="num text-[11px] text-ink-4">{s.rank}</td>
                      <td className="text-left font-medium text-ink">{s.name}{s.department && <span className="block text-[11px] font-normal text-ink-3">{s.department}</span>}</td>
                      <td className="n">{shortMoney(s.net)}</td>
                      <td className="n">{vi.format(s.closed)}</td>
                      <td className="n">{shortMoney(s.aov)}</td>
                      <td className="n">{vi.format(s.assigned)}</td>
                      <td className={`n font-semibold ${s.dataRate === null ? '' : LEVEL_TEXT[rateLevel(s.dataRate)]}`}>{pct(s.dataRate)}<span className="block text-[11px] font-normal text-ink-3">{vi.format(s.closedFromAssigned)} chốt</span></td>
                      <td className="n">{duration(s.medianMinutes)}</td>
                      <td className="n">{pct(s.returnRate)}</td>
                      <td className="n">{pct(s.cancelAfterClose)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            ) : <EmptyState text="Chưa có số được chia hay đơn chốt của Sale trong kỳ." />}
          </ChartCard>
          <Definitions items={r.definitions} />
        </>
      )}
    </div>
  );
}
