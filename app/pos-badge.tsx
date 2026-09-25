// Biểu tượng riêng của từng POS (lib/pos-icons.ts) trong ô vuông bo góc theo màu POS — thay cho chấm màu (25/09/2026).
import { POS_ICONS } from '@/lib/pos-icons';
import { POS } from '@/lib/report-model';

const posVar = (id: string) => { const i = POS.findIndex((p) => p.id === id); return i >= 0 ? `var(--pos-${i + 1})` : 'var(--ink-4)'; };

export function PosGlyph({ posId, size = 16, className = '' }: { posId: string; size?: number; className?: string }) {
  const icon = POS_ICONS.find((p) => p.id === posId);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {icon ? icon.paths.map((d, i) => <path key={i} d={d} />) : <circle cx="12" cy="12" r="5" />}
    </svg>
  );
}

/** Ô biểu tượng POS. muted = không chọn (xám). solid = nền đặc màu POS. */
export function PosBadge({ posId, size = 18, muted = false, solid = false, className = '', title }: { posId: string; size?: number; muted?: boolean; solid?: boolean; className?: string; title?: string }) {
  return (
    <span className={`posb ${muted ? 'is-muted' : ''} ${solid ? 'is-solid' : ''} ${className}`} style={{ '--c': posVar(posId), width: size, height: size } as React.CSSProperties}
      title={title} aria-hidden={title ? undefined : true}>
      <PosGlyph posId={posId} size={Math.round(size * 0.66)} />
    </span>
  );
}

const vi = new Intl.NumberFormat('vi-VN');
const shortMoney = (n: number | null | undefined) => n === null || n === undefined ? '—'
  : Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2).replace('.', ',')} tỷ` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} tr` : vi.format(Math.round(n));
const pctText = (n: number | null | undefined, d = 1) => n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(d).replace('.', ',')}%`;

/** Thẻ số liệu một POS (duyệt 25/09/2026): biểu tượng + tên + % so kỳ trước, doanh thu, đơn chốt · GTTB · tỷ lệ chốt, tỷ trọng, đường 7 kỳ. */
export function PosTile({ posId, name, revenue, orders, aov, rate, rateLabel = 'Tỷ lệ chốt', share, change, spark, note, selected, onClick }: {
  posId: string; name: string; revenue: number; orders: number; aov: number | null; rate: number | null; rateLabel?: string; share: number | null;
  change?: number | null; spark?: number[]; note?: React.ReactNode; selected?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  const pts = spark && spark.length > 1 ? (() => {
    const mx = Math.max(...spark), mn = Math.min(...spark), w = 200, h = 30;
    return spark.map((v, i) => [i * w / (spark.length - 1), h - 3 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (h - 8)] as const);
  })() : null;
  const d = pts?.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`postile ${selected ? 'is-sel' : ''}`} style={{ '--c': posVar(posId) } as React.CSSProperties}>
      <span className="flex items-center gap-2.5">
        <PosBadge posId={posId} size={36} />
        <span className="min-w-0 flex-1 text-left"><b className="block truncate text-[13.5px] leading-tight text-ink">{name}</b>{note && <span className="block truncate text-[11px] text-ink-3">{note}</span>}</span>
        {change !== undefined && change !== null && Number.isFinite(change) && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${change >= 0 ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'}`}>{change >= 0 ? '↗' : '↘'} {pctText(Math.abs(change))}</span>
        )}
      </span>
      <span className="num block text-left text-[24px] leading-none text-ink">{shortMoney(revenue)}<span className="ml-1 text-[12.5px] font-semibold text-ink-3">₫</span></span>
      <span className="grid grid-cols-3 gap-1.5 text-left">
        <span className="rounded-lg bg-surface-2 px-2 py-1.5"><span className="block text-[10.5px] text-ink-3">Đơn chốt</span><b className="num text-[13px] text-ink">{vi.format(orders)}</b></span>
        <span className="rounded-lg bg-surface-2 px-2 py-1.5"><span className="block text-[10.5px] text-ink-3">GTTB</span><b className="num text-[13px] text-ink">{shortMoney(aov)}</b></span>
        <span className="rounded-lg bg-surface-2 px-2 py-1.5"><span className="block truncate text-[10.5px] text-ink-3">{rateLabel}</span><b className="num text-[13px] text-ink">{pctText(rate)}</b></span>
      </span>
      {share !== null && (
        <span className="flex items-center gap-2 text-[11px] text-ink-3">Tỷ trọng
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><i className="block h-full rounded-full bg-[var(--c)]" style={{ width: `${Math.max(1, Math.min(100, share))}%` }} /></span>
          <b className="num text-ink">{pctText(share)}</b>
        </span>
      )}
      {d && pts && (
        <svg viewBox="0 0 200 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
          <path d={`${d} L200 30 L0 30Z`} fill="var(--c)" fillOpacity=".1" />
          <path d={d} fill="none" stroke="var(--c)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <circle cx={pts[pts.length - 1][0] - 2} cy={pts[pts.length - 1][1]} r="2.6" fill="var(--c)" />
        </svg>
      )}
    </Tag>
  );
}
