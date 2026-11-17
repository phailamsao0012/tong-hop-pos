'use client';

// Khối "Theo đơn vị vận chuyển" ở trang Vận đơn (anh Vũ 12/11/2026): VTP, SPX, J&T, GHN… số đơn gửi trong kỳ, đang giao, đã nhận, hoàn, hủy,
// tỉ lệ nhận / hoàn (hoàn ≥ 7% đỏ, như mọi trang), doanh số chuyển đi; kèm số đơn gắn thẻ VTP / SPX để thấy đơn gắn thẻ lệch ĐVVC thật.
import { Truck } from 'lucide-react';
import type { CarrierRow } from '@/lib/reports/van-don-carriers';
import { returnRateClass, ratePct } from '@/lib/shared/close-rate';
import { ChartCard, EmptyState, TableWrap, Th, money, pct, shortMoney, vi } from './ui-kit';
import { useApi } from './use-api';

export function VanDonCarriersCard({ start, end, posIds }: { start: string; end: string; posIds: string[] }) {
  const { data, loading } = useApi<{ rows: CarrierRow[]; total: CarrierRow }>(`/api/reports/van-don-carriers?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, { keep: true });
  const by = (k: string) => data?.rows.find((r) => r.carrier === k);
  const line = (r: CarrierRow, strong = false) => {
    const recv = ratePct(r.delivered, r.orders), ret = ratePct(r.returned, r.orders);
    return (
      <tr key={r.carrier} className={strong ? 'font-semibold' : ''}>
        <td className="whitespace-nowrap font-semibold">{strong ? 'Tổng' : r.carrier}</td>
        <td className="n">{vi.format(r.orders)}</td>
        <td className="n">{vi.format(r.shipping)}</td>
        <td className="n">{vi.format(r.delivered)}</td>
        <td className="n">{vi.format(r.returned)}</td>
        <td className="n">{vi.format(r.cancelled)}</td>
        <td className="n">{pct(recv)}</td>
        <td className={`n ${returnRateClass(ret)}`}>{pct(ret)}</td>
        <td className="n" title={money(r.net)}>{shortMoney(r.net)}</td>
        <td className="n">{vi.format(r.tagVtp)}</td>
        <td className="n">{vi.format(r.tagSpx)}</td>
      </tr>
    );
  };
  return (
    <ChartCard icon={Truck} title="Theo đơn vị vận chuyển" loading={loading && !data}
      info="Đơn gửi lần đầu trong kỳ, POS đang chọn. Đơn vị vận chuyển lấy từ dữ liệu đơn trên Pancake. Hai cột cuối: số đơn có gắn thẻ VTP / SPX (người dùng tự gắn trên Pancake), để so với đơn vị vận chuyển thật. Tỉ lệ hoàn từ 7% tô đỏ."
      collapse={{ storageKey: 'vd-collapse-carriers', summary: data ? `VTP ${vi.format(by('VTP')?.orders ?? 0)} · SPX ${vi.format(by('SPX')?.orders ?? 0)} đơn` : undefined }}>
      {!data ? null : !data.rows.length ? <EmptyState text="Không có đơn gửi trong kỳ." /> : (
        <TableWrap stickyFirst><table className="tbl compact">
          <thead><tr><Th>ĐVVC</Th><Th className="n" hint="Đơn gửi lần đầu trong kỳ.">Đơn gửi</Th><Th className="n">Đang giao</Th><Th className="n">Đã nhận</Th><Th className="n">Hoàn</Th><Th className="n">Hủy</Th><Th className="n" hint="Đã nhận ÷ Đơn gửi.">Tỉ lệ nhận</Th><Th className="n" hint="Hoàn ÷ Đơn gửi. Từ 7% tô đỏ.">Tỉ lệ hoàn</Th><Th className="n">Doanh số chuyển đi</Th><Th className="n" hint="Đơn có gắn thẻ VTP trên Pancake.">Thẻ VTP</Th><Th className="n" hint="Đơn có gắn thẻ SPX trên Pancake.">Thẻ SPX</Th></tr></thead>
          <tbody>{data.rows.map((r) => line(r))}</tbody>
          <tfoot>{line(data.total, true)}</tfoot>
        </table></TableWrap>
      )}
    </ChartCard>
  );
}
