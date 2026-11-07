'use client';

// Huy hiệu thành tích (anh Vũ 07/11/2026): huy chương tròn, màu theo hạng. Số tính ở lib/reports/staff-badges.ts.
import { CalendarCheck, Crown, Flame, Gem, Medal, Package, Rocket, ShieldCheck, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { TIER_LABEL, type Badge, type BadgeTier } from '@/lib/reports/staff-badges';

// Màu cố ý theo kim loại thật, cùng một bộ cho cả hai giao diện sáng / tối (nền huy chương tự đủ tương phản với chữ trắng).
const STYLE: Record<BadgeTier, { bg: string; ring: string; icon: typeof Medal }> = {
  dong: { bg: 'linear-gradient(135deg,#c98a55,#8a5528)', ring: '#e8b98f', icon: Medal },
  bac: { bg: 'linear-gradient(135deg,#b9c2cc,#6f7a86)', ring: '#e3e8ee', icon: Medal },
  vang: { bg: 'linear-gradient(135deg,#f2c94c,#b8860b)', ring: '#fbe7a1', icon: Medal },
  'kim-cuong': { bg: 'linear-gradient(135deg,#7fd6f2,#3a7bd5)', ring: '#c9efff', icon: Gem },
  'ky-luc': { bg: 'linear-gradient(135deg,#ff7a59,#c2185b)', ring: '#ffc4b3', icon: Rocket },
  'quan-quan': { bg: 'linear-gradient(135deg,#ffd54f,#e65100)', ring: '#ffe9a8', icon: Crown },
  top: { bg: 'linear-gradient(135deg,#9ccc65,#17684b)', ring: '#d7f0bd', icon: Trophy },
  'ben-bi': { bg: 'linear-gradient(135deg,#4db6ac,#00695c)', ring: '#b8e8e2', icon: ShieldCheck },
  'bung-no': { bg: 'linear-gradient(135deg,#ff8a65,#d84315)', ring: '#ffd0bf', icon: Flame },
  vua: { bg: 'linear-gradient(135deg,#b388ff,#5e35b1)', ring: '#ddd0ff', icon: Crown },
  'don-to': { bg: 'linear-gradient(135deg,#ffe082,#c49000)', ring: '#fff1bd', icon: Package },
  'tan-binh': { bg: 'linear-gradient(135deg,#80deea,#00838f)', ring: '#c8f3f8', icon: Sparkles },
  'but-pha': { bg: 'linear-gradient(135deg,#64b5f6,#1565c0)', ring: '#c6e1fb', icon: TrendingUp },
  chuoi: { bg: 'linear-gradient(135deg,#a5d6a7,#2e7d32)', ring: '#d5eed6', icon: CalendarCheck },
};

export function BadgeMedal({ tier, size = 44 }: { tier: BadgeTier; size?: number }) {
  const s = STYLE[tier], Icon = s.icon;
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full text-white shadow-sm" style={{ width: size, height: size, background: s.bg, boxShadow: `0 0 0 3px ${s.ring}` }} aria-hidden="true">
      <Icon size={size * 0.48} strokeWidth={2.2} />
    </span>
  );
}

export function BadgeShelf({ badges }: { badges: Badge[] }) {
  if (!badges.length) return <p className="text-[13px] text-ink-3">Chưa có huy hiệu. Đạt mốc đơn, doanh số, lọt top tháng hay giữ tỷ lệ chốt tốt liền 3 tháng là có.</p>;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {badges.map((b) => (
        <li key={b.key} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
          <BadgeMedal tier={b.tier} />
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{TIER_LABEL[b.tier]}</p>
            <p className="text-[13px] font-semibold leading-snug">{b.label}</p>
            <p className="text-[11px] text-ink-3">{b.note}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
