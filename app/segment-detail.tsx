'use client';
// Khung chi tiết một thẻ nhóm đơn (anh Vũ 27/11/2026: "nếu chọn sk hay oxy hay bất kì sản phẩm gì thì sẽ ra thông tin chi tiết của thẻ đó";
// plan docs/plans/2026-11-27-the-san-pham-moi, bước 2). Dùng lại số /api/reports/overview?productSegment=<thẻ> mà khối thẻ đã tải
// (tổng, so kỳ trước, theo ngày, theo món, theo nhân viên); riêng combo thực tế gọi thêm ?combos=1 cùng bộ lọc (lib/reports/segment-combos.ts).
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { closeRateOf, rateTextClass } from '@/lib/reports/metrics';
import type { SegmentCombo } from '@/lib/reports/segment-combos';
import type { OverviewReport } from './overview-view';
import { ProfileLink } from './staff-profile-link';
import { useMetricSettings } from './metric-settings';
import { DeltaPill, TableWrap, delta, money, pct, shortMoney, vi } from './ui-kit';
import { useApi } from './use-api';

type Props = {
  /** Khoá thẻ đang mở; null = đóng. */ seg: string | null;
  label: string; color: string; report: OverviewReport | null;
  /** Tổng doanh thu chốt mọi thẻ trong phạm vi đang xem (để tính phần trăm). */ allNet: number;
  /** Bộ lọc kỳ / POS / team như khối thẻ (không kèm groupBy, compare). */ q: string;
  onClose: () => void;
};

export function SegmentDetail({ seg, label, color, report, allNet, q, onClose }: Props) {
  const ms = useMetricSettings();
  const combos = useApi<{ combos: SegmentCombo[] }>(seg ? `/api/reports/overview?${q}&productSegment=${seg}&combos=1` : null);
  const cur = report?.current.total, prev = report?.compare?.total;
  // Lấy mảng ra ngoài useMemo để phụ thuộc đúng thứ đang dùng (react-compiler PreserveManualMemo).
  const series = report?.current.series, byProduct = report?.current.byProduct;
  const days = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of series ?? []) m.set(r.bucket, (m.get(r.bucket) ?? 0) + r.closedNet);
    return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([key, net]) => ({ key: key.length === 10 ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : key, net }));
  }, [series]);
  const products = useMemo(() => {
    const m = new Map<string, { name: string; orders: number; quantity: number; total: number }>();
    for (const p of byProduct ?? []) {
      if (!p.closedQuantity) continue;
      const x = m.get(p.name) ?? { name: p.name, orders: 0, quantity: 0, total: 0 };
      x.orders += p.orders; x.quantity += p.closedQuantity; x.total += p.closedTotal;
      m.set(p.name, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [byProduct]);
  const staff = (report?.current.byEmployee ?? []).filter((r) => r.sellerId && r.closedOrders).sort((a, b) => b.closedNet - a.closedNet);
  const tiles = cur ? [
    { label: 'Doanh thu chốt', value: shortMoney(cur.closedNet), d: prev ? delta(cur.closedNet, prev.closedNet) : null },
    { label: 'Đơn chốt', value: vi.format(cur.closedOrders), d: prev ? delta(cur.closedOrders, prev.closedOrders) : null },
    { label: 'Giá trị một đơn', value: shortMoney(cur.averageOrder), d: prev && prev.averageOrder ? delta(cur.averageOrder ?? 0, prev.averageOrder) : null },
    { label: 'Phần trong phạm vi', value: allNet ? pct(cur.closedNet / allNet * 100, 1) : '—', d: null },
  ] : [];
  return (
    <Sheet open={!!seg} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:max-w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="pr-12">
          <SheetTitle><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: color }} aria-hidden="true" />{label}</SheetTitle>
          <SheetDescription>Đơn chốt theo ngày chốt, cùng kỳ, POS và bộ lọc đang xem · so với kỳ liền trước</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {!cur ? <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-[76px] rounded-xl" />)}</div> : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className="min-w-0 rounded-xl bg-surface-2 p-3">
                  <p className="text-[11.5px] text-ink-3">{t.label}</p>
                  <p className="num mt-0.5 truncate text-[18px] font-semibold">{t.value}</p>
                  {t.d !== null && <DeltaPill value={t.d} label="so kỳ trước" />}
                </div>
              ))}
            </div>
          )}
          {cur && <p className="text-[12.5px] text-ink-2">Tỷ lệ chốt <b className={`num ${rateTextClass(closeRateOf(cur, ms.rateBase)) || 'text-ink'}`}>{pct(closeRateOf(cur, ms.rateBase))}</b>{prev ? <> · kỳ trước {shortMoney(prev.closedNet)}, {vi.format(prev.closedOrders)} đơn</> : null}</p>}

          <section className="rounded-xl border border-line p-3">
            <h4 className="text-[13px] font-semibold">Doanh thu chốt theo ngày</h4>
            {days.some((d) => d.net) ? (
              <ChartContainer config={{ net: { label: 'Doanh thu', color } }} className="mt-2 aspect-auto h-44 w-full">
                <BarChart data={days} margin={{ left: 0, right: 4 }}>
                  <CartesianGrid vertical={false} /><XAxis dataKey="key" tick={{ fontSize: 11 }} minTickGap={10} />
                  <YAxis width={58} tick={{ fontSize: 11 }} tickFormatter={(n: number) => shortMoney(n).replace(' ₫', '')} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => money(typeof v === 'number' ? v : null)} />} />
                  <Bar dataKey="net" name="Doanh thu" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            ) : <p className="mt-2 text-[12.5px] text-ink-3">{report ? 'Không có doanh thu trong kỳ.' : 'Đang tải…'}</p>}
          </section>

          <section className="rounded-xl border border-line p-3">
            <h4 className="text-[13px] font-semibold">Món trong thẻ</h4>
            {!products.length ? <p className="mt-2 text-[12.5px] text-ink-3">{report ? 'Chưa có món bán ra.' : 'Đang tải…'}</p> : (
              <TableWrap><table className="tbl mt-2">
                <thead><tr><th>Món</th><th className="n">Đơn</th><th className="n">Số lượng</th><th className="n">Doanh thu món</th></tr></thead>
                <tbody>{products.slice(0, 20).map((p) => <tr key={p.name}><td>{p.name}</td><td className="n">{vi.format(p.orders)}</td><td className="n">{vi.format(p.quantity)}</td><td className="n">{shortMoney(p.total)}</td></tr>)}</tbody>
              </table></TableWrap>
            )}
          </section>

          <section className="rounded-xl border border-line p-3">
            <h4 className="text-[13px] font-semibold">Combo thực tế <span className="font-normal text-ink-3">(món mua cùng nhau trong một đơn, 10 tổ hợp nhiều đơn nhất)</span></h4>
            {combos.error ? <p className="mt-2 text-[12.5px] text-bad">Chưa tải được combo.</p> : !combos.data ? <p className="mt-2 text-[12.5px] text-ink-3">Đang tải…</p>
              : !combos.data.combos.length ? <p className="mt-2 text-[12.5px] text-ink-3">Chưa có đơn chốt.</p> : (
                <TableWrap><table className="tbl mt-2">
                  <thead><tr><th>Tổ hợp món</th><th className="n">Đơn</th><th className="n">Doanh thu</th></tr></thead>
                  <tbody>{combos.data.combos.map((c) => <tr key={c.items.join('|')}><td>{c.items.join(' + ')}</td><td className="n">{vi.format(c.orders)}</td><td className="n">{shortMoney(c.net)}</td></tr>)}</tbody>
                </table></TableWrap>
              )}
          </section>

          <section className="rounded-xl border border-line p-3">
            <h4 className="text-[13px] font-semibold">Nhân viên bán thẻ này</h4>
            {!staff.length ? <p className="mt-2 text-[12.5px] text-ink-3">{report ? 'Chưa có đơn chốt.' : 'Đang tải…'}</p> : (
              <TableWrap><table className="tbl mt-2">
                <thead><tr><th>Nhân viên</th><th className="n">Đơn chốt</th><th className="n">Doanh thu</th><th className="n">Tỷ lệ chốt</th></tr></thead>
                <tbody>{staff.map((r) => { const rate = closeRateOf(r, ms.rateBase); return <tr key={r.sellerId}><td><ProfileLink id={r.sellerId} name={r.name} /></td><td className="n">{vi.format(r.closedOrders)}</td><td className="n">{shortMoney(r.closedNet)}</td><td className={`n ${rateTextClass(rate)}`}>{pct(rate)}</td></tr>; })}</tbody>
              </table></TableWrap>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
