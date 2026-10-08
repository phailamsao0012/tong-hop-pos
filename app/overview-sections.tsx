'use client';

// Tổng quan 4 mục (anh Vũ 08/10/2026): Sale, CSKH, MKT, Vận đơn chiếm cả trang Tổng quan POS, khổ 2x2, mỗi bảng có icon,
// số chính to và các ô chi tiết. Dữ liệu: /api/reports/sections (lib/sections.ts).
import type { ReactNode } from 'react';
import {
  BadgeCheck, CheckCircle2, Coins, HeartHandshake, Megaphone, PackageCheck, Percent, Repeat2, Send, ShoppingCart, Target, Truck, Undo2, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Sections } from '@/lib/sections';
import { InfoTip, money, pct, vi } from './ui-kit';

export type SectionsReport = Sections & { definitions: Record<string, string>; syncedAt: string | null; period: { start: string; end: string } };
type Tone = 'green' | 'teal' | 'blue' | 'orange';
const TONE_CLS: Record<Tone, string> = { green: 'bg-t-green-bg text-t-green', teal: 'bg-t-teal-bg text-t-teal', blue: 'bg-t-blue-bg text-t-blue', orange: 'bg-t-orange-bg text-t-orange' };

/** Màu theo tỷ lệ hoàn: dưới 10% tốt, 10–20% cần để ý, từ 20% xấu. */
const returnTone = (rate: number | null) => rate === null ? 'var(--ink-3)' : rate >= 20 ? 'var(--bad)' : rate >= 10 ? 'var(--warn)' : 'var(--good)';
const moneyOrDash = (v: number | null) => v === null ? '—' : money(v);

function Bar({ value, color }: { value: number | null; color: string }) {
  const w = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true"><i className="block h-full rounded-full" style={{ width: `${w}%`, background: color }} /></span>;
}

function Tile({ icon: Icon, label, value, note, bar, valueColor }: { icon: LucideIcon; label: string; value: string; note?: ReactNode; bar?: ReactNode; valueColor?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3.5 max-sm:p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3"><Icon size={14} aria-hidden="true" className="shrink-0" />{label}</p>
      <p className="num mt-1.5 truncate text-[22px] font-semibold leading-tight tracking-[-.01em] text-ink max-sm:text-lg" style={valueColor ? { color: valueColor } : undefined}>{value}</p>
      {note && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{note}</p>}
      {bar}
    </div>
  );
}

function Board({ tone, icon: Icon, title, caption, info, heroLabel, hero, heroNote, children }: {
  tone: Tone; icon: LucideIcon; title: string; caption: string; info?: string; heroLabel: string; hero: string; heroNote?: ReactNode; children: ReactNode;
}) {
  const accent = `var(--t-${tone})`;
  return (
    <section className="card relative flex min-w-0 flex-col gap-5 overflow-hidden p-6 max-sm:gap-4 max-sm:rounded-xl max-sm:p-4">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden="true" />
      <header className="flex items-center gap-3">
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${TONE_CLS[tone]} max-sm:size-10`}><Icon size={24} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-xl font-semibold leading-tight tracking-[-.015em] text-ink">{title}{info && <InfoTip text={info} />}</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{caption}</p>
        </div>
      </header>
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-ink-3">{heroLabel}</p>
        <p className="num mt-1 text-[40px] font-semibold leading-none tracking-[-.03em] text-ink max-sm:text-[32px]">{hero}</p>
        {heroNote && <p className="mt-1.5 text-[12.5px] text-ink-2">{heroNote}</p>}
      </div>
      {children}
    </section>
  );
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
      <Board tone="green" icon={ShoppingCart} title="Sale" caption="Người bán thuộc bộ phận Sale · chốt từ Chờ xác nhận" info={d['Sale']}
        heroLabel="Doanh thu" hero={money(sale.net)} heroNote={<><b className="num">{vi.format(sale.orders)}</b> đơn chốt</>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile icon={CheckCircle2} label="Đơn chốt" value={vi.format(sale.orders)} note="chờ XN + đã XN trở đi" />
          <Tile icon={Target} label="Tỷ lệ chốt" value={pct(sale.rate)} note={`${vi.format(sale.closedNow)} ÷ ${vi.format(sale.created)} đơn lên`} bar={<Bar value={sale.rate} color="var(--t-green)" />} />
          <Tile icon={Coins} label="AOV" value={moneyOrDash(saleAov)} note="doanh thu ÷ đơn chốt" />
        </div>
      </Board>

      <Board tone="teal" icon={HeartHandshake} title="CSKH" caption="Người bán thuộc bộ phận CSKH · khách cũ và khách MKT đưa về" info={d['CSKH']}
        heroLabel="Doanh thu" hero={money(cskh.net)} heroNote={<><b className="num">{vi.format(cskh.orders)}</b> đơn chốt · AOV <b className="num">{moneyOrDash(cskh.aov)}</b></>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile icon={Coins} label="AOV" value={moneyOrDash(cskh.aov)} note="doanh thu ÷ đơn chốt" />
          <Tile icon={Repeat2} label="Đơn tự upsell" value={vi.format(cskh.self.orders)} note={money(cskh.self.net)} />
          <Tile icon={Megaphone} label="Đơn từ MKT" value={vi.format(cskh.fromMkt.orders)} note={money(cskh.fromMkt.net)} />
        </div>
        <div>
          <div className="flex justify-between text-[11.5px] text-ink-3"><span>Tự upsell {pct(selfShare, 0)}</span><span>Từ MKT {pct(selfShare === null ? null : 100 - selfShare, 0)}</span></div>
          <span className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <i className="block h-full" style={{ width: `${selfShare ?? 0}%`, background: 'var(--t-teal)' }} />
            <i className="block h-full" style={{ width: `${selfShare === null ? 0 : 100 - selfShare}%`, background: 'var(--t-blue)' }} />
          </span>
        </div>
      </Board>

      <Board tone="blue" icon={Megaphone} title="MKT" caption="Đơn có Marketer · chốt = đã xác nhận trên Pancake" info={d['MKT']}
        heroLabel="Doanh thu" hero={money(mkt.net)} heroNote={<><b className="num">{vi.format(mkt.orders)}</b> đơn đã xác nhận</>}>
        <div className="grid grid-cols-2 gap-3">
          <Tile icon={Wallet} label="Chi phí" value="—" note="Chưa có, Pancake không ghi chi phí" />
          <Tile icon={Target} label="Tỷ lệ chốt" value={pct(mkt.rate)} note={`${vi.format(mkt.closedNow)} ÷ ${vi.format(mkt.created)} đơn lên`} bar={<Bar value={mkt.rate} color="var(--t-blue)" />} />
          <Tile icon={Coins} label="AOV" value={moneyOrDash(mkt.aov)} note="doanh thu ÷ đơn đã xác nhận" />
          <Tile icon={BadgeCheck} label="Đơn đã xác nhận" value={vi.format(mkt.orders)} note="theo ngày xác nhận lần đầu" />
        </div>
      </Board>

      <Board tone="orange" icon={Truck} title="Vận đơn" caption="Đơn chốt trong kỳ, xét trạng thái hiện tại" info={d['Vận đơn']}
        heroLabel="Doanh số đi" hero={money(shipping.total.net)} heroNote={<><b className="num">{vi.format(shipping.total.orders)}</b> đơn đã giao đơn vị vận chuyển</>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile icon={Undo2} label="Doanh số hoàn" value={money(shipping.total.returnedNet)} note={`${vi.format(shipping.total.returned)} đơn hoàn`} />
          <Tile icon={Percent} label="Hoàn theo đơn" value={pct(shipping.total.rateOrders)} valueColor={returnTone(shipping.total.rateOrders)} bar={<Bar value={shipping.total.rateOrders} color={returnTone(shipping.total.rateOrders)} />} />
          <Tile icon={Coins} label="Hoàn theo doanh số" value={pct(shipping.total.rateNet)} valueColor={returnTone(shipping.total.rateNet)} bar={<Bar value={shipping.total.rateNet} color={returnTone(shipping.total.rateNet)} />} />
        </div>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-[13px]">
            <thead><tr><th className="text-left">Bộ phận</th><th className="n"><Send size={12} className="mr-1 inline" aria-hidden="true" />Đơn đi</th><th className="n">Doanh số đi</th><th className="n"><Undo2 size={12} className="mr-1 inline" aria-hidden="true" />Hoàn</th><th className="n">% đơn</th><th className="n">% DS</th></tr></thead>
            <tbody>
              {shipRows.map(({ label, s }) => (
                <tr key={label} className={label === 'Tổng' ? 'font-semibold' : ''}>
                  <td className="text-left">{label === 'Tổng' ? <span className="inline-flex items-center gap-1"><PackageCheck size={13} aria-hidden="true" />Tổng</span> : label}</td>
                  <td className="n">{vi.format(s.orders)}</td>
                  <td className="n">{money(s.net)}</td>
                  <td className="n">{vi.format(s.returned)}</td>
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
