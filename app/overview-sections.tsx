'use client';

// Tổng quan 4 mục (anh Vũ 08/10/2026): Sale, CSKH, MKT, Vận đơn ở đầu trang Tổng quan POS. Dữ liệu: /api/reports/sections.
import type { ReactNode } from 'react';
import { HeartHandshake, Megaphone, ShoppingCart, Truck, type LucideIcon } from 'lucide-react';
import type { Sections } from '@/lib/sections';
import { useApi } from './use-api';
import { ChartCard, ErrorBox, SkeletonKpis, money, pct, vi } from './ui-kit';

type Report = Sections & { definitions: Record<string, string> };

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-t-0">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="text-right"><strong className="num">{value}</strong>{note && <span className="block text-xs text-ink-3">{note}</span>}</span>
    </div>
  );
}

function Section({ icon, title, info, children }: { icon: LucideIcon; title: string; info?: string; children: ReactNode }) {
  return <ChartCard icon={icon} title={title} info={info} bodyClassName="pt-1">{children}</ChartCard>;
}

export function OverviewSections({ start, end, posIds }: { start: string; end: string; posIds: string[] }) {
  const { data, error, reload } = useApi<Report>(`/api/reports/sections?${new URLSearchParams({ start, end, posIds: posIds.join(',') })}`, { refreshMs: 10 * 60000, keep: false });
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <SkeletonKpis count={4} className="xl:grid-cols-4" />;
  const { sale, cskh, mkt, shipping } = data;
  const d = data.definitions;
  const ship = (s: Report['shipping']['total']) => `${vi.format(s.orders)} đi · ${vi.format(s.returned)} hoàn`;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      <Section icon={ShoppingCart} title="Sale" info={d['Sale']}>
        <Row label="Doanh thu" value={money(sale.net)} />
        <Row label="Đơn chốt" value={vi.format(sale.orders)} />
        <Row label="Tỷ lệ chốt" value={pct(sale.rate)} note={`${vi.format(sale.closedNow)} ÷ ${vi.format(sale.created)} đơn lên`} />
      </Section>
      <Section icon={HeartHandshake} title="CSKH" info={d['CSKH']}>
        <Row label="Doanh thu" value={money(cskh.net)} note={`${vi.format(cskh.orders)} đơn chốt`} />
        <Row label="AOV" value={cskh.aov === null ? '—' : money(cskh.aov)} />
        <Row label="Đơn tự upsell" value={vi.format(cskh.self.orders)} note={money(cskh.self.net)} />
        <Row label="Đơn từ MKT" value={vi.format(cskh.fromMkt.orders)} note={money(cskh.fromMkt.net)} />
      </Section>
      <Section icon={Megaphone} title="MKT" info={d['MKT']}>
        <Row label="Chi phí" value="—" note="Chưa có, Pancake không ghi chi phí" />
        <Row label="Doanh thu" value={money(mkt.net)} note={`${vi.format(mkt.orders)} đơn đã xác nhận`} />
        <Row label="Tỷ lệ chốt" value={pct(mkt.rate)} note={`${vi.format(mkt.closedNow)} ÷ ${vi.format(mkt.created)} đơn lên`} />
        <Row label="AOV" value={mkt.aov === null ? '—' : money(mkt.aov)} />
      </Section>
      <Section icon={Truck} title="Vận đơn" info={d['Vận đơn']}>
        <Row label="Doanh số đi" value={money(shipping.total.net)} note={`${vi.format(shipping.total.orders)} đơn đi`} />
        <Row label="Doanh số hoàn" value={money(shipping.total.returnedNet)} note={`${vi.format(shipping.total.returned)} đơn hoàn`} />
        <Row label="Tỷ lệ hoàn" value={`${pct(shipping.total.rateOrders)} đơn`} note={`${pct(shipping.total.rateNet)} doanh số`} />
        <Row label="Sale" value={`${pct(shipping.sale.rateOrders)} · ${pct(shipping.sale.rateNet)}`} note={ship(shipping.sale)} />
        <Row label="CSKH" value={`${pct(shipping.cskh.rateOrders)} · ${pct(shipping.cskh.rateNet)}`} note={ship(shipping.cskh)} />
      </Section>
    </div>
  );
}
