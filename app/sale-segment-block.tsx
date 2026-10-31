'use client';

// Thẻ Kháng sinh (Gentadox + Detox), SK GK và Khác ở Tổng quan Sale, kèm từng người bán được bao nhiêu (anh Vũ 29/10/2026
// "ở sale tôi cũng muốn có các thẻ gentadox và thẻ sk gk, kháng sinh ấy, để xem mọi người bán được như thế nào";
// "gentadox + detox là kháng sinh, còn lại là sk gk"; "nếu có loại khác thì báo khác, ghi rõ loại nào";
// 31/10: Siêu Vô Gạo tính thêm Oxy + Bổ huyết, Bio Nano Shield là kháng sinh).
// Cùng cách tính với "Chốt Sale theo nhóm đơn" ở Tổng quan POS: lọc nhóm đơn productSegment, tỷ lệ chốt chia cho mọi đơn cùng phạm vi.
// Mỗi đơn chỉ thuộc một nhóm (lib/order-segments.ts), nên cột Tổng là doanh số thật.
import { Pill } from 'lucide-react';
import { closeRateOf } from '@/lib/metrics';
import { PRODUCT_SEGMENTS, SEGMENT_KEYS } from '@/lib/order-segments';
import type { OverviewReport } from './overview-view';
import { useMetricSettings } from './metric-settings';
import { ChartCard, DeltaPill, EmptyState, SkeletonTable, SortTh, TableWrap, delta, pct, shortMoney, useSort, vi } from './ui-kit';
import { useApi } from './use-api';

type Seg = typeof SEGMENT_KEYS[number];
const LABEL: Record<Seg, string> = { gentadox: PRODUCT_SEGMENTS.gentadox, skgk: PRODUCT_SEGMENTS.skgk, khac: PRODUCT_SEGMENTS.khac };
const COLOR: Record<Seg, string> = { gentadox: 'var(--primary)', skgk: 'var(--t-blue)', khac: 'var(--t-orange)' };
type SortKey = 'name' | Seg | `${Seg}N` | 'total';
const url = (q: string, seg: Seg) => `/api/reports/overview?${q}&groupBy=day&compare=previous&productSegment=${seg}`;

/** Sản phẩm trong đơn nhóm Khác, gộp các POS theo tên, xếp theo tiền chốt. */
function otherProducts(r: OverviewReport | null) {
  const m = new Map<string, number>();
  for (const p of r?.current.byProduct ?? []) if (p.closedQuantity > 0) m.set(p.name, (m.get(p.name) ?? 0) + p.closedTotal);
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** q: cùng bộ lọc kỳ / POS / team với các ô khác của trang (không kèm groupBy, compare). */
export function SaleSegmentBlock({ q, periodLabel }: { q: string; periodLabel: string }) {
  const ms = useMetricSettings();
  const reports: Record<Seg, OverviewReport | null> = {
    gentadox: useApi<OverviewReport>(url(q, 'gentadox')).data,
    skgk: useApi<OverviewReport>(url(q, 'skgk')).data,
    khac: useApi<OverviewReport>(url(q, 'khac')).data,
  };
  const sort = useSort<SortKey>('total');
  const people = new Map<string, { id: string; name: string } & Record<Seg | `${Seg}N`, number>>();
  for (const seg of SEGMENT_KEYS) for (const r of reports[seg]?.current.byEmployee ?? []) {
    if (!r.sellerId) continue;
    const p = people.get(r.sellerId) ?? { id: r.sellerId, name: r.name, gentadox: 0, skgk: 0, khac: 0, gentadoxN: 0, skgkN: 0, khacN: 0 };
    p[seg] = r.closedNet; p[`${seg}N`] = r.closedOrders;
    people.set(r.sellerId, p);
  }
  const total = (r: Record<Seg, number>) => r.gentadox + r.skgk + r.khac;
  const rows = sort.apply([...people.values()].filter((p) => p.gentadoxN || p.skgkN || p.khacN), (r, k) => k === 'total' ? total(r) : r[k]);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.gentadox, r.skgk, r.khac)));
  const loading = SEGMENT_KEYS.some((s) => !reports[s]);
  const others = otherProducts(reports.khac);
  return (
    <ChartCard icon={Pill} title="Kháng sinh, SK GK và Khác" subtitle={`${periodLabel} · đơn chốt theo ngày chốt · bấm tiêu đề cột để xếp`}>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
        {SEGMENT_KEYS.map((seg) => {
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
      {others.length > 0 && (
        <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px]">
          <span className="font-medium" style={{ color: COLOR.khac }}>Khác gồm:</span>
          {others.slice(0, 10).map(([name, v]) => <span key={name} className="text-ink-2">{name} <b className="num text-ink">{shortMoney(v)}</b></span>)}
          {others.length > 10 && <span className="text-ink-3">và {others.length - 10} sản phẩm nữa</span>}
        </p>
      )}
      <div className="mt-4">
        {loading ? <SkeletonTable rows={5} cols={4} /> : !rows.length ? <EmptyState text="Chưa có đơn chốt trong kỳ này." /> : (
          <TableWrap maxHeight="30rem" sticky stickyFirst>
            <table className="tbl">
              <thead><tr>
                <SortTh k="name" label="Nhân viên" sort={sort} align="left" />
                {SEGMENT_KEYS.map((seg) => [
                  <SortTh key={seg} k={seg} label={PRODUCT_SEGMENTS[seg]} sort={sort} />,
                  <SortTh key={`${seg}N`} k={`${seg}N`} label="Đơn" sort={sort} />,
                ])}
                <SortTh k="total" label="Tổng" sort={sort} />
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-left font-medium">{r.name}</td>
                  {SEGMENT_KEYS.map((seg) => [
                    <td key={seg} className="num r text-right">
                      {shortMoney(r[seg])}
                      <span className="mt-1 ml-auto block h-1 rounded-full" style={{ width: `${Math.max(2, r[seg] / max * 100)}%`, background: COLOR[seg], opacity: r[seg] ? 1 : 0.15 }} />
                    </td>,
                    <td key={`${seg}N`} className="num r text-right text-ink-2">{vi.format(r[`${seg}N`])}</td>,
                  ])}
                  <td className="num r text-right font-semibold">{shortMoney(total(r))}</td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </ChartCard>
  );
}
