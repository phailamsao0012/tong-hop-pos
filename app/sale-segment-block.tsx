'use client';

// Thẻ Gentadox + Detox (kháng sinh) và SK GK ở Tổng quan Sale, kèm từng người bán được bao nhiêu (anh Vũ 29/10/2026
// "ở sale tôi cũng muốn có các thẻ gentadox và thẻ sk gk, kháng sinh ấy, để xem mọi người bán được như thế nào").
// Cùng cách tính với "Chốt Sale theo nhóm đơn" ở Tổng quan POS: lọc nhóm đơn productSegment, tỷ lệ chốt chia cho mọi đơn cùng phạm vi.
// Anh 29/10: Gentadox + Detox là kháng sinh, mọi đơn còn lại là SK GK, nên mỗi đơn chỉ thuộc một nhóm.
import { Pill } from 'lucide-react';
import { closeRateOf } from '@/lib/metrics';
import { PRODUCT_SEGMENTS } from '@/lib/order-segments';
import type { OverviewReport } from './overview-view';
import { useMetricSettings } from './metric-settings';
import { ChartCard, DeltaPill, EmptyState, SkeletonTable, SortTh, TableWrap, delta, pct, shortMoney, useSort, vi } from './ui-kit';
import { useApi } from './use-api';

const SEGS = ['gentadox', 'skgk'] as const;
type Seg = typeof SEGS[number];
const LABEL: Record<Seg, string> = { gentadox: `${PRODUCT_SEGMENTS.gentadox} (kháng sinh)`, skgk: PRODUCT_SEGMENTS.skgk };
const COLOR: Record<Seg, string> = { gentadox: 'var(--primary)', skgk: 'var(--t-blue)' };
type SortKey = 'name' | 'gentadox' | 'skgk' | 'gentadoxN' | 'skgkN' | 'total';

/** q: cùng bộ lọc kỳ / POS / team với các ô khác của trang (không kèm groupBy, compare). */
export function SaleSegmentBlock({ q, periodLabel }: { q: string; periodLabel: string }) {
  const ms = useMetricSettings();
  const g = useApi<OverviewReport>(`/api/reports/overview?${q}&groupBy=day&compare=previous&productSegment=gentadox`);
  const s = useApi<OverviewReport>(`/api/reports/overview?${q}&groupBy=day&compare=previous&productSegment=skgk`);
  const reports: Record<Seg, OverviewReport | null> = { gentadox: g.data, skgk: s.data };
  const sort = useSort<SortKey>('total');
  const people = new Map<string, { id: string; name: string } & Record<Seg | `${Seg}N`, number>>();
  for (const seg of SEGS) for (const r of reports[seg]?.current.byEmployee ?? []) {
    if (!r.sellerId) continue;
    const p = people.get(r.sellerId) ?? { id: r.sellerId, name: r.name, gentadox: 0, skgk: 0, gentadoxN: 0, skgkN: 0 };
    p[seg] = r.closedNet; p[`${seg}N`] = r.closedOrders;
    people.set(r.sellerId, p);
  }
  const rows = sort.apply([...people.values()].filter((p) => p.gentadoxN || p.skgkN), (r, k) => k === 'total' ? r.gentadox + r.skgk : r[k]);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.gentadox, r.skgk)));
  const loading = !g.data || !s.data;
  return (
    <ChartCard icon={Pill} title="Gentadox + Detox và SK GK" subtitle={`${periodLabel} · đơn chốt theo ngày chốt · bấm tiêu đề cột để xếp`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {SEGS.map((seg) => {
          const r = reports[seg], cur = r?.current.total, prev = r?.compare?.total;
          return (
            <div key={seg} className="rounded-xl border border-line p-4" style={{ borderTop: `3px solid ${COLOR[seg]}` }}>
              <div className="flex items-baseline justify-between gap-2"><strong className="text-ink">{LABEL[seg]}</strong>
                {cur && prev && <DeltaPill value={delta(cur.closedNet, prev.closedNet)} label="so kỳ trước" />}</div>
              {!cur ? <div className="mt-3 h-14 animate-pulse rounded-lg bg-surface-2" /> : (
                <>
                  <div className="mt-2 flex items-baseline gap-2"><strong className="num text-3xl text-ink">{shortMoney(cur.closedNet)}</strong></div>
                  <p className="m-0 mt-1 text-[12.5px] text-ink-2">
                    <b className="num text-ink">{vi.format(cur.closedOrders)}</b> đơn chốt · tỷ lệ chốt <b className="num text-ink">{pct(closeRateOf(cur, ms.rateBase))}</b> · AOV {shortMoney(cur.averageOrder)}
                  </p>
                  {prev && <p className="m-0 mt-0.5 text-[12px] text-ink-3">Kỳ trước {shortMoney(prev.closedNet)} · {vi.format(prev.closedOrders)} đơn</p>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        {loading ? <SkeletonTable rows={5} cols={4} /> : !rows.length ? <EmptyState text="Chưa có đơn chốt trong kỳ này." /> : (
          <TableWrap maxHeight="30rem" sticky stickyFirst>
            <table className="tbl">
              <thead><tr>
                <SortTh k="name" label="Nhân viên" sort={sort} align="left" />
                <SortTh k="gentadox" label="Gentadox + Detox" sort={sort} />
                <SortTh k="gentadoxN" label="Đơn" sort={sort} />
                <SortTh k="skgk" label="SK GK" sort={sort} />
                <SortTh k="skgkN" label="Đơn" sort={sort} />
                <SortTh k="total" label="Tổng" sort={sort} />
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-left font-medium">{r.name}</td>
                  {SEGS.map((seg) => [
                    <td key={seg} className="num r text-right">
                      {shortMoney(r[seg])}
                      <span className="mt-1 ml-auto block h-1 rounded-full" style={{ width: `${Math.max(2, r[seg] / max * 100)}%`, background: COLOR[seg], opacity: r[seg] ? 1 : 0.15 }} />
                    </td>,
                    <td key={`${seg}N`} className="num r text-right text-ink-2">{vi.format(r[`${seg}N`])}</td>,
                  ])}
                  <td className="num r text-right font-semibold">{shortMoney(r.gentadox + r.skgk)}</td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </ChartCard>
  );
}
