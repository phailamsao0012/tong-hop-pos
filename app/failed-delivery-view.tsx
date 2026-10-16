'use client';

import { Truck, Activity, Send, Undo2 } from 'lucide-react';
import type { FdReport } from '@/lib/failed-delivery';
import { NO_CARRIER, NO_PROVINCE } from '@/lib/ship-fields';
import { PeriodToolbar, PosChips } from './overview-view';
import { usePeriod } from './period-store';
import { usePosIds } from './pos-store';
import { useHrUnit, useTeam, withUnit } from './team-store';
import { useApi } from './use-api';
import { PosBadge } from './pos-badge';
import { ChartCard, Definitions, EmptyState, ErrorBox, KpiCard, PageHeader, SkeletonTable, TableWrap, money, pct, vi } from './ui-kit';

type Report = FdReport & { truncated: boolean; definitions: Record<string, string> };
const vnTime = (s: string) => new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const scroll = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
export function FailedDeliveryView() {
  const { preset, start, end, setPreset, setStart, setEnd } = usePeriod();
  const [posIds, setPosIds] = usePosIds();
  const unit = useHrUnit(), team = useTeam();
  const url = withUnit(`/api/reports/giao-that-bai?${new URLSearchParams({ start, end, posIds: posIds.join(','), team })}`, unit);
  const { data: report, loading, error, reload } = useApi<Report>(url, { keep: false });
  return <div className="space-y-5">
    <PageHeader title="Giao thất bại" subtitle="Đơn cần gọi ngay và kết quả cứu đơn theo hãng ship" />
    <PeriodToolbar preset={preset} start={start} end={end} onPreset={setPreset} onStart={setStart} onEnd={setEnd} loading={loading} onReload={reload} />
    <PosChips posIds={posIds} onChange={setPosIds} />
    {error && <ErrorBox error={error} onRetry={reload} />}
    {!report && !error && <SkeletonTable rows={8} />}
    {report && <>
      <p className="text-sm text-ink-3">{start} → {end} · Theo ngày giao thất bại lần đầu · {unit?.name ?? team}</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard icon={Truck} label="Đang chờ cứu" value={vi.format(report.stats.pending)} note="Thất bại lần đầu trong kỳ; hiện còn ở Đã gửi hàng" onClick={() => scroll('fd-carriers')} />
        <KpiCard icon={Send} label="Giao thất bại trong kỳ" value={vi.format(report.stats.failed)} note="Theo ngày thất bại lần đầu trong kỳ đang chọn" onClick={() => scroll('fd-carriers')} />
        <KpiCard icon={Undo2} label="Cứu được" value={vi.format(report.stats.saved)} note="Từng thất bại trong kỳ, hiện khách đã nhận" onClick={() => scroll('fd-carriers')} />
        <KpiCard icon={Activity} label="Tỷ lệ cứu được" value={pct(report.stats.saveRate)} note={`${vi.format(report.stats.saved)} cứu được / ${vi.format(report.stats.saved + report.stats.lost)} đơn có kết quả`} onClick={() => scroll('fd-carriers')} />
      </div>
      <ChartCard id="fd-open" title="Đơn cần gọi ngay" subtitle="Đang ở Đã gửi hàng, thất bại trong 30 ngày gần nhất; không theo kỳ đang chọn">
        {report.truncated && <p className="mb-3 text-sm text-warn">Chỉ hiện 500 đơn giá trị cao nhất</p>}
        {!report.open.length ? <EmptyState text="Chưa có đơn cần gọi trong 30 ngày gần nhất" /> : <TableWrap minWidth={1500}><table className="tbl"><thead><tr>{['POS', 'Mã đơn', 'Khách', 'SĐT', 'Tỉnh', 'Hãng', 'Trạng thái hãng', 'Thất bại lúc', 'Giá trị đơn', 'Người lên đơn', 'CSKH'].map((s) => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>{report.open.map((o) => <tr key={o.id} className={o.hoursSince > 24 ? 'bg-amber-50 dark:bg-amber-950/30' : undefined}>
            <td><PosBadge posId={o.posId} title={o.posId} /></td><td>{o.sourceOrderId}</td><td>{o.customerName ?? '—'}</td><td>{o.phone ?? '—'}</td><td>{o.province || NO_PROVINCE}</td><td>{o.carrier || NO_CARRIER}</td><td>{o.partnerStatusLabel}</td>
            <td>{vnTime(o.undeliverableAt)}<span className="block text-xs text-ink-3">{vi.format(o.hoursSince)} giờ trước</span></td><td className="n">{money(o.net)}</td><td>{o.sellerName}</td><td>{o.careName}</td>
          </tr>)}</tbody></table></TableWrap>}
      </ChartCard>
      <ChartCard id="fd-carriers" title="Theo hãng ship" subtitle="Đơn có lần đầu giao thất bại trong kỳ đang chọn; xét trạng thái hiện tại">
        {!report.stats.failed ? <EmptyState text="Chưa có đơn giao thất bại trong kỳ" /> : <TableWrap><table className="tbl"><thead><tr><th>Hãng</th><th>Giao thất bại</th><th>Cứu được</th><th>Tỷ lệ cứu được</th></tr></thead><tbody>{report.byCarrier.map((c) => <tr key={c.key}><td>{c.key}</td><td className="n">{vi.format(c.failed)}</td><td className="n">{vi.format(c.saved)}</td><td className="n">{pct(c.saveRate)}</td></tr>)}</tbody></table></TableWrap>}
      </ChartCard>
      <Definitions items={Object.entries(report.definitions).map(([term, def]) => `${term}: ${def}`)} />
    </>}
  </div>;
}
