'use client';

import type { OverviewReport } from '../overview-view';
import { delta, dmy, pct, posName, shortMoney, timeOnly, vi } from '../ui-kit';
import { D2Table, D2Tray, D2Trend, type D2Metric } from './d2';

/** Home presentation only; reuse the report, including its comparison cutoff. */
export function D2Home({ report, posIds, onOpen }: { report: OverviewReport; posIds: string[]; onOpen: (key: string) => void }) {
  const current = report.current.total;
  const previous = report.compare?.total;
  const change = (value: number, before: number | undefined): D2Metric['change'] => {
    const difference = delta(value, before);
    return difference === null ? undefined : { label: difference === Infinity ? 'Mới' : `${difference > 0 ? '+' : ''}${pct(difference)}`, direction: difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat' };
  };
  const metrics: D2Metric[] = [
    { id: 'closedNet', label: 'Doanh thu đơn chốt', value: shortMoney(current.closedNet), change: change(current.closedNet, previous?.closedNet), onOpen: () => onOpen('closedNet') },
    { id: 'closedOrders', label: 'Đơn chốt', value: vi.format(current.closedOrders), change: change(current.closedOrders, previous?.closedOrders), onOpen: () => onOpen('closedOrders') },
    { id: 'orders', label: 'Đơn tạo mới', value: vi.format(current.orders), change: change(current.orders, previous?.orders), onOpen: () => onOpen('orders') },
    { id: 'deliveredNet', label: 'Tiền hàng giao thành công', value: shortMoney(current.groups.delivered.net), change: change(current.groups.delivered.net, previous?.groups.delivered.net), onOpen: () => onOpen('deliveredNet') },
  ];
  const series = (() => {
    const build = (period: OverviewReport['current']) => {
      const buckets = new Map<string, number>();
      for (const row of period.series) buckets.set(row.bucket, (buckets.get(row.bucket) ?? 0) + row.closedNet);
      return [...buckets].sort(([a], [b]) => a.localeCompare(b));
    };
    const now = build(report.current), before = report.compare ? build(report.compare) : [];
    return { labels: now.map(([bucket]) => report.groupBy === 'month' ? bucket : dmy(bucket)), current: now.map(([, value]) => value), previous: now.map((_, i) => before[i]?.[1] ?? null) };
  })();
  const rows = posIds.map((id) => ({ id, metrics: report.current.byPos.find((row) => row.posId === id), sync: report.pos.find((row) => row.id === id) }));
  return <div className="d2-home">
    <D2Tray metrics={metrics} note={report.syncedAt ? `Đồng bộ ${timeOnly(report.syncedAt)}` : 'Chưa có mốc đồng bộ'} />
    <D2Trend title="Doanh thu đơn chốt" value={shortMoney(current.closedNet)} change={metrics[0].change} {...series} formatValue={shortMoney} note={report.compare ? 'Đối chiếu theo kỳ so sánh đang chọn, cùng mốc giờ của báo cáo' : 'Chưa chọn kỳ so sánh'} />
    <D2Table title="Theo POS" note={`${rows.length} POS trong phạm vi đang chọn`} rows={rows} rowKey={(row) => row.id}
      name={(row) => posName(row.id)} subtitle={(row) => row.sync?.syncedAt ? `Đồng bộ ${timeOnly(row.sync.syncedAt)}` : 'Chưa có mốc đồng bộ'}
      columns={[
        { key: 'closedOrders', label: 'Đơn chốt', numeric: true, render: (row) => row.metrics ? vi.format(row.metrics.closedOrders) : '—' },
        { key: 'closedNet', label: 'Doanh thu đơn chốt', numeric: true, render: (row) => row.metrics ? shortMoney(row.metrics.closedNet) : '—' },
      ]} status={(row) => row.sync?.lastError ? 'Lỗi đồng bộ' : !row.sync?.connected ? 'Chưa kết nối' : !row.sync.backfillDone ? 'Đang lấy lịch sử' : row.sync.syncedAt ? 'Đã đồng bộ' : 'Chờ đồng bộ'} />
  </div>;
}

