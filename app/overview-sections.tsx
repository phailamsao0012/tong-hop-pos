'use client';

// Tổng quan 4 mục (anh Vũ 08/10/2026): Sale, CSKH, MKT, Vận đơn ở đầu trang Tổng quan POS, khổ 2x2 gọn vừa một màn hình laptop,
// mỗi bảng có icon, số chính và các ô chi tiết. Bên dưới vẫn giữ các khối cũ. Dữ liệu: /api/reports/sections (lib/sections.ts).
import type { ReactNode } from 'react';
import {
  BadgeCheck, CheckCircle2, Coins, HeartHandshake, Megaphone, PackageCheck, Repeat2, Send, ShoppingCart, Target, Truck, Undo2, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Sections } from '@/lib/sections';
import type { ProductSegment } from '@/lib/order-segments';
import { useApi } from './use-api';
import { ErrorBox, InfoTip, SkeletonKpis, money, pct, vi } from './ui-kit';

export type SectionsReport = Sections & { definitions: Record<string, string>; syncedAt: string | null; period: { start: string; end: string } };
type Tone = 'green' | 'teal' | 'blue' | 'orange';
const TONE_CLS: Record<Tone, string> = { green: 'bg-t-green-bg text-t-green', teal: 'bg-t-teal-bg text-t-teal', blue: 'bg-t-blue-bg text-t-blue', orange: 'bg-t-orange-bg text-t-orange' };

/** Màu theo tỷ lệ hoàn: dưới 10% tốt, 10–20% cần để ý, từ 20% xấu. */
const returnTone = (rate: number | null) => rate === null ? 'var(--ink-3)' : rate >= 20 ? 'var(--bad)' : rate >= 10 ? 'var(--warn)' : 'var(--good)';
const moneyOrDash = (v: number | null) => v === null ? '—' : money(v);

function Bar({ value, color }: { value: number | null; color: string }) {
  const w = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true"><i className="block h-full rounded-full" style={{ width: `${w}%`, background: color }} /></span>;
}

function Tile({ icon: Icon, label, value, note, bar }: { icon: LucideIcon; label: string; value: string; note?: ReactNode; bar?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-3 py-2">
      <p className="flex items-center gap-1 truncate text-[11px] font-medium text-ink-3"><Icon size={12} aria-hidden="true" className="shrink-0" />{label}</p>
      <p className="num mt-0.5 truncate text-base font-semibold leading-tight text-ink">{value}</p>
      {note && <p className="truncate text-[11px] leading-snug text-ink-3">{note}</p>}
      {bar}
    </div>
  );
}

function Board({ tone, icon: Icon, title, caption, info, heroLabel, hero, heroNote, children }: {
  tone: Tone; icon: LucideIcon; title: string; caption: string; info?: string; heroLabel: string; hero: string; heroNote?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="card relative flex min-w-0 flex-col gap-3 overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: `var(--t-${tone})` }} aria-hidden="true" />
      <header className="flex items-start gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${TONE_CLS[tone]}`}><Icon size={18} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1 text-base font-semibold leading-tight text-ink">{title}{info && <InfoTip text={info} />}</h2>
          <p className="truncate text-[11px] leading-snug text-ink-3">{caption}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-3">{heroLabel}</p>
          <p className="num text-2xl font-semibold leading-tight tracking-[-.02em] text-ink">{hero}</p>
          {heroNote && <p className="text-[11px] text-ink-2">{heroNote}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/** 4 bảng ở đầu trang Tổng quan POS, tự lấy dữ liệu theo kỳ, POS và nhóm đơn đang chọn. */
export function OverviewSections({ start, end, posIds, productSegment }: { start: string; end: string; posIds: string[]; productSegment: ProductSegment }) {
  const params = new URLSearchParams({ start, end, posIds: posIds.join(','), productSegment });
  const { data, error, reload } = useApi<SectionsReport>(`/api/reports/sections?${params}`, { refreshMs: 10 * 60000, keep: false });
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <SkeletonKpis count={4} className="lg:grid-cols-2" />;
  return <SectionsGrid data={data} />;
}

export function SectionsGrid({ data }: { data: SectionsReport }) {
  const { sale, cskh, mkt, shipping } = data;
  const d = data.definitions;
  const saleAov = sale.orders ? sale.net / sale.orders : null;
  const selfShare = cskh.orders ? cskh.self.orders / cskh.orders * 100 : null;
  const shipRows = [
    { label: 'Sale', s: shipping.sale },
    { label: 'CSKH', s: shipping.cskh },
    { label: 'Tổng', s: shipping.total },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Board tone="green" icon={ShoppingCart} title="Sale" caption="Bộ phận Sale · chốt từ Chờ xác nhận" info={d['Sale']}
        heroLabel="Doanh thu" hero={money(sale.net)} heroNote={<><b className="num">{vi.format(sale.orders)}</b> đơn chốt</>}>
        <div className="grid grid-cols-3 gap-2">
          <Tile icon={CheckCircle2} label="Đơn chốt" value={vi.format(sale.orders)} note="chờ XN + đã XN trở đi" />
          <Tile icon={Target} label="Tỷ lệ chốt" value={pct(sale.rate)} note={`${vi.format(sale.closedNow)} ÷ ${vi.format(sale.created)} đơn lên`} bar={<Bar value={sale.rate} color="var(--t-green)" />} />
          <Tile icon={Coins} label="AOV" value={moneyOrDash(saleAov)} note="doanh thu ÷ đơn chốt" />
        </div>
      </Board>

      <Board tone="teal" icon={HeartHandshake} title="CSKH" caption="Bộ phận CSKH · khách cũ và khách MKT đưa về" info={d['CSKH']}
        heroLabel="Doanh thu" hero={money(cskh.net)} heroNote={<><b className="num">{vi.format(cskh.orders)}</b> đơn chốt</>}>
        <div className="grid grid-cols-3 gap-2">
          <Tile icon={Coins} label="AOV" value={moneyOrDash(cskh.aov)} note="doanh thu ÷ đơn chốt" />
          <Tile icon={Repeat2} label={`Tự upsell · ${pct(selfShare, 0)}`} value={vi.format(cskh.self.orders)} note={money(cskh.self.net)}
            bar={<Bar value={selfShare} color="var(--t-teal)" />} />
          <Tile icon={Megaphone} label={`Từ MKT · ${pct(selfShare === null ? null : 100 - selfShare, 0)}`} value={vi.format(cskh.fromMkt.orders)} note={money(cskh.fromMkt.net)}
            bar={<Bar value={selfShare === null ? null : 100 - selfShare} color="var(--t-blue)" />} />
        </div>
      </Board>

      <Board tone="blue" icon={Megaphone} title="MKT" caption="Đơn có Marketer · chốt = đã xác nhận trên Pancake" info={d['MKT']}
        heroLabel="Doanh thu" hero={money(mkt.net)} heroNote={<><b className="num">{vi.format(mkt.orders)}</b> đơn đã xác nhận</>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile icon={Wallet} label="Chi phí" value="—" note="chưa có số liệu" />
          <Tile icon={Target} label="Tỷ lệ chốt" value={pct(mkt.rate)} note={`${vi.format(mkt.closedNow)} ÷ ${vi.format(mkt.created)} đơn lên`} bar={<Bar value={mkt.rate} color="var(--t-blue)" />} />
          <Tile icon={Coins} label="AOV" value={moneyOrDash(mkt.aov)} note="doanh thu ÷ đơn XN" />
          <Tile icon={BadgeCheck} label="Đơn đã XN" value={vi.format(mkt.orders)} note="theo ngày XN đầu" />
        </div>
      </Board>

      <Board tone="orange" icon={Truck} title="Vận đơn" caption="Đơn chốt trong kỳ, xét trạng thái hiện tại" info={d['Vận đơn']}
        heroLabel="Doanh số đi" hero={money(shipping.total.net)} heroNote={<><b className="num">{vi.format(shipping.total.orders)}</b> đơn đi · hoàn <b className="num" style={{ color: returnTone(shipping.total.rateNet) }}>{pct(shipping.total.rateNet)}</b> DS</>}>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-[12px] [&_td]:py-1 [&_th]:py-1">
            <thead><tr><th className="text-left">Bộ phận</th><th className="n"><Send size={11} className="mr-1 inline" aria-hidden="true" />Đơn đi</th><th className="n">DS đi</th><th className="n"><Undo2 size={11} className="mr-1 inline" aria-hidden="true" />Hoàn</th><th className="n">DS hoàn</th><th className="n">% đơn</th><th className="n">% DS</th></tr></thead>
            <tbody>
              {shipRows.map(({ label, s }) => (
                <tr key={label} className={label === 'Tổng' ? 'font-semibold' : ''}>
                  <td className="text-left">{label === 'Tổng' ? <span className="inline-flex items-center gap-1"><PackageCheck size={12} aria-hidden="true" />Tổng</span> : label}</td>
                  <td className="n">{vi.format(s.orders)}</td>
                  <td className="n">{money(s.net)}</td>
                  <td className="n">{vi.format(s.returned)}</td>
                  <td className="n">{money(s.returnedNet)}</td>
                  <td className="n" style={{ color: returnTone(s.rateOrders) }}>{pct(s.rateOrders)}</td>
                  <td className="n" style={{ color: returnTone(s.rateNet) }}>{pct(s.rateNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Board>
    </div>
  );
}
