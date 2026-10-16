'use client';

import { useEffect, useRef, useState } from 'react';
import { Chart } from 'chart.js/auto';
import { Activity } from 'lucide-react';
import { type buildSpeed, type closeRateByWait, type SpeedStage } from '@/lib/order-speed';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useHrUnit, useTeam, withUnit } from './team-store';
import { useApi } from './use-api';
import { PosBadge } from './pos-badge';
import { ChartCard, Definitions, ErrorBox, KpiCard, PageHeader, SkeletonTable, SortTh, TableWrap, pct, useSort, vi } from './ui-kit';

type Report = ReturnType<typeof buildSpeed> & { waitRates: ReturnType<typeof closeRateByWait>; definitions: Record<string, string>; stuck: { key: string; label: string; total: number; counts: { posId: string; who: string | null; n: number }[]; orders: { posId: string; who: string | null; sourceOrderId: string; minutes: number }[] }[] };
const GOOD: Record<SpeedStage['key'], number> = { assign: 5, confirm: 120, ship: 1440, deliver: 4320 };
const BUCKET_LABELS = ['<5 phút', '5–15 phút', '15–30 phút', '30–60 phút', '1–2 giờ', '2–4 giờ', '4–8 giờ', '8–24 giờ', '1–2 ngày', '2–3 ngày', '3–5 ngày', 'Từ 5 ngày'];
const duration = (m: number | null) => m === null ? '—' : m < 60 ? `${vi.format(Math.round(m))} phút` : m < 1440 ? `${vi.format(Math.round(m / 60 * 10) / 10)} giờ` : `${vi.format(Math.round(m / 1440 * 10) / 10)} ngày`;
function Histogram({ stage }: { stage: SpeedStage }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, { type: 'bar', data: { labels: BUCKET_LABELS, datasets: [{ label: 'Đơn hợp lệ', data: stage.hist, backgroundColor: '#17684b' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    return () => chart.destroy();
  }, [stage]);
  return <div className="h-72"><canvas ref={ref} aria-label={`Phân bố ${stage.label}: ${stage.hist.map((n, i) => `${BUCKET_LABELS[i]}: ${n}`).join('; ')}`} /></div>;
}
export function OrderSpeedView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const unit = useHrUnit(), team = useTeam();
  const [selected, setSelected] = useState<SpeedStage['key']>('assign');
  const posSort = useSort<string>('p50'), personSort = useSort<string>('p50');
  const { data: report, loading, error, reload } = useApi<Report>(withUnit(`/api/reports/toc-do?${new URLSearchParams({ start, end, posIds: posIds.join(','), team })}`, unit), { keep: false });
  const stage = report?.stages.find((s) => s.key === selected);
  const posRows = report?.byPos.flatMap((p) => p.stages.map((s) => ({ ...s, posId: p.posId }))) ?? [];
  const people = report?.byPerson.filter((r) => r.stage === selected) ?? [];
  const choose = (key: SpeedStage['key']) => { setSelected(key); document.getElementById('speed-distribution')?.scrollIntoView({ behavior: 'smooth' }); };
  return <div className="space-y-5">
    <PageHeader title="Tốc độ xử lý" subtitle="Thời gian chia số, xác nhận, gửi hãng và giao tới khách · tối đa 31 ngày" />
    <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={loading} onReload={reload} />
    <PosChips posIds={posIds} onChange={setPosIds} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {!report && !error && <SkeletonTable rows={8} />}
    {report && <>
      <p className="text-sm text-ink-3">{start} → {end} · {unit?.name ?? team} · Giữ phạm vi POS và team đang chọn</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{report.stages.map((s) => <div key={s.key} className={s.p50 === null ? '' : s.p50 < GOOD[s.key] ? 'text-emerald-700 dark:text-emerald-400' : 'text-orange-700 dark:text-orange-400'}><KpiCard icon={Activity} tone={s.p50 === null ? 'gray' : s.p50 < GOOD[s.key] ? 'green' : 'orange'} label={s.label} value={duration(s.p50)} note={`Trung vị · 90%: ${duration(s.p90)} · ${vi.format(s.n)} đơn hợp lệ · ${pct(s.n + s.skipped ? s.skipped / (s.n + s.skipped) * 100 : null)} đơn bỏ vì thiếu giờ hoặc giờ sai`} onClick={() => choose(s.key)} /></div>)}</div>
      <ChartCard id="speed-distribution" title="Phân bố thời gian" subtitle="Số đơn hợp lệ theo 12 ô thời gian; chọn chặng để xem cả biểu đồ và bảng theo người">
        <div className="mb-4 flex flex-wrap gap-2">{report.stages.map((s) => <button type="button" key={s.key} className="btn sm" aria-pressed={selected === s.key} onClick={() => setSelected(s.key)}>{s.label}</button>)}</div>
        {stage && <Histogram stage={stage} />}
      </ChartCard>
      <ChartCard title="Tỷ lệ vào Chờ xác nhận theo thời gian chờ chia số"><TableWrap><table className="tbl"><thead><tr><th>Chờ chia số</th><th>Đơn tạo trong kỳ</th><th>Đơn vào Chờ xác nhận</th><th>Tỷ lệ</th></tr></thead><tbody>{report.waitRates.map((r) => <tr key={r.label}><td>{r.label}</td><td className="n">{vi.format(r.leads)}</td><td className="n">{vi.format(r.closed)}</td><td className="n">{pct(r.rate)}</td></tr>)}</tbody></table></TableWrap></ChartCard>
      <ChartCard title="Theo POS × chặng"><TableWrap><table className="tbl"><thead><tr><SortTh k="posId" label="POS" sort={posSort} align="left" /><SortTh k="label" label="Chặng" sort={posSort} align="left" /><SortTh k="n" label="Đơn hợp lệ" sort={posSort} /><SortTh k="p50" label="Trung vị" sort={posSort} /><SortTh k="p90" label="90%" sort={posSort} /><th>Đơn bỏ vì thiếu giờ / giờ sai</th></tr></thead><tbody>{posSort.apply(posRows, (r, k) => k === 'posId' ? r.posId : k === 'label' ? r.label : k === 'n' ? r.n : k === 'p90' ? r.p90 : r.p50).map((r) => <tr key={`${r.posId}:${r.key}`}><td><PosBadge posId={r.posId} /> {r.posId}</td><td>{r.label}</td><td className="n">{vi.format(r.n)}</td><td className="n">{duration(r.p50)}</td><td className="n">{duration(r.p90)}</td><td className="n">{pct(r.n + r.skipped ? r.skipped / (r.n + r.skipped) * 100 : null)}</td></tr>)}</tbody></table></TableWrap></ChartCard>
      <ChartCard title={selected === 'deliver' ? 'Theo hãng · Giao tới khách' : `Theo người · ${stage?.label ?? ''}`} subtitle="Chỉ nhóm từ 10 đơn hợp lệ; người hiển thị bằng mã Pancake"><TableWrap><table className="tbl"><thead><tr><SortTh k="who" label={selected === 'deliver' ? 'Hãng' : 'Mã người'} sort={personSort} align="left" /><SortTh k="n" label="Đơn hợp lệ" sort={personSort} /><SortTh k="p50" label="Trung vị" sort={personSort} /><SortTh k="p90" label="90%" sort={personSort} /></tr></thead><tbody>{personSort.apply(people, (r, k) => k === 'who' ? r.who : k === 'n' ? r.n : k === 'p90' ? r.p90 : r.p50).map((r) => <tr key={r.who}><td>{r.who}</td><td className="n">{vi.format(r.n)}</td><td className="n">{duration(r.p50)}</td><td className="n">{duration(r.p90)}</td></tr>)}{!people.length && <tr><td colSpan={4}>Chưa có nhóm đủ 10 đơn hợp lệ</td></tr>}</tbody></table></TableWrap></ChartCard>
      <p className="text-sm text-ink-3">Đơn kẹt theo trạng thái hiện tại, không giới hạn kỳ chọn; giữ POS và team.</p>
      {report.stuck.map((r) => <ChartCard key={r.key} id={`stuck-${r.key}`} title={r.label}>
        <KpiCard icon={Activity} label={r.label} value={vi.format(r.total)} note="Tổng đơn hiện tại · bảng hiện tối đa 50 đơn lâu nhất" onClick={() => document.getElementById(`stuck-table-${r.key}`)?.scrollIntoView({ behavior: 'smooth' })} />
        <TableWrap><table className="tbl"><thead><tr><th>POS</th><th>Mã người lên đơn</th><th>Tổng đơn kẹt</th></tr></thead><tbody>{r.counts.map((c) => <tr key={JSON.stringify([c.posId, c.who])}><td><PosBadge posId={c.posId} /> {c.posId}</td><td>{c.who ?? 'Chưa chia'}</td><td className="n">{vi.format(c.n)}</td></tr>)}</tbody></table></TableWrap>
        <div id={`stuck-table-${r.key}`}><TableWrap><table className="tbl"><thead><tr><th>POS</th><th>Mã đơn</th><th>Mã người lên đơn</th><th>Đã chờ</th></tr></thead><tbody>{r.orders.map((o) => <tr key={JSON.stringify([o.posId, o.sourceOrderId])}><td><PosBadge posId={o.posId} /> {o.posId}</td><td>{o.sourceOrderId}</td><td>{o.who ?? 'Chưa chia'}</td><td className="n">{duration(o.minutes)}</td></tr>)}{!r.orders.length && <tr><td colSpan={4}>Không có đơn kẹt theo luật này</td></tr>}</tbody></table></TableWrap></div>
      </ChartCard>)}
      <Definitions items={Object.entries(report.definitions).map(([term, def]) => `${term}: ${def}`)} />
    </>}
  </div>;
}
