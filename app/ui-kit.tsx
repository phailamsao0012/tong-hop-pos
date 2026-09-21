'use client';

// Bộ thành phần giao diện dùng chung v2 cho các trang báo cáo: thẻ chỉ số, thẻ biểu đồ, huy hiệu chênh lệch, sparkline,
// vòng tròn trạng thái, phễu, bảng cohort, tooltip, đếm số, xương tải, toast, bộ chọn phân đoạn, viên đồng bộ.
// Mọi màu lấy từ token trong globals.css (var(--…)); mọi chữ số dùng lớp .num (Be Vietnam Pro 700, tabular). Hướng dẫn: scratchpad/ui-apply/ui-kit-v2.md.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpRight, ChevronDown, Info, Monitor, Moon, RotateCw, Sun } from 'lucide-react';
import { POS } from '@/lib/report-model';
import { TEAM_LABELS, setTeam, useTeam, type Team } from './team-store';
import { motionOK, scrollToEl, scrollTop, useMotionOK } from './ui/motion';
import { TipContent, Tooltip, isTipRows, useTip, type TipRows, type TipSide } from './ui/tooltip';
import { CountUp } from './ui/count-up';
import { Toaster, dismissToast, toast, useToast, type ToastKind } from './ui/toast';
import { setTheme, useTheme, watchSystemTheme, type ThemeMode } from './ui/theme';

export { CountUp, TipContent, Toaster, Tooltip, dismissToast, motionOK, scrollToEl, scrollTop, setTheme, toast, useMotionOK, useTheme, useTip, useToast, watchSystemTheme };
export type { ThemeMode, TipRows, TipSide, ToastKind };

export const vi = new Intl.NumberFormat('vi-VN');
// Dùng khoảng trắng không ngắt ( ) giữa số và đơn vị để không bao giờ bị xuống dòng giữa "1.460" và "tr".
export const money = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${vi.format(Math.round(n))} ₫`;
export const short = (n: number) => Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2).replace('.', ',')} tỷ` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} tr` : vi.format(Math.round(n));
/** Tiền rút gọn kèm đơn vị: "7,18 tỷ ₫" (khoảng trắng không ngắt). */
export const shortMoney = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${short(n)} ₫`;
export const pct = (n: number | null | undefined, digits = 1) => n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(digits).replace('.', ',')}%`;
export const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const dt = (iso: string | null | undefined, withTime = false) => iso
  ? new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
  : '—';
export const timeOnly = (iso: string | null | undefined) => iso
  ? new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
  : '—';
export const delta = (a: number, b: number | null | undefined) => {
  if (b === null || b === undefined) return null;
  if (!b) return a ? Infinity : 0;
  return (a - b) / b * 100;
};

// Màu POS / trạng thái giữ mã hex (an toàn cho xuất pptx / canvas); trong DOM ưu tiên posVar() / STATUS_VARS để theo chủ đề sáng-tối.
export const POS_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
export const posColor = (posId: string) => POS_COLORS[POS.findIndex((p) => p.id === posId)] ?? '#52514e';
export const posVar = (posId: string) => { const i = POS.findIndex((p) => p.id === posId); return i >= 0 ? `var(--pos-${i + 1})` : 'var(--ink-4)'; };
export const posName = (posId: string) => POS.find((p) => p.id === posId)?.name ?? posId;
export const STATUS_COLORS = { new: '#8a9a90', confirmed: '#2a78d6', shipping: '#eda100', delivered: '#1a9c5b', returned: '#eb6834', cancelled: '#d24b4b' } as const;
export const STATUS_VARS = { new: 'var(--st-new)', confirmed: 'var(--st-confirmed)', shipping: 'var(--st-shipping)', delivered: 'var(--st-delivered)', returned: 'var(--st-returned)', cancelled: 'var(--st-cancelled)' } as const;
export const STATUS_LABELS = { new: 'Mới / chờ XN', confirmed: 'Đã XN / đang xử lý', shipping: 'Đang giao', delivered: 'Giao thành công', returned: 'Hoàn', cancelled: 'Hủy' } as const;

export type Tone = 'green' | 'blue' | 'orange' | 'teal' | 'red' | 'purple' | 'gray' | 'lime';
export const TONES: Record<Tone, string> = {
  green: 'bg-t-green-bg text-t-green', blue: 'bg-t-blue-bg text-t-blue', orange: 'bg-t-orange-bg text-t-orange',
  teal: 'bg-t-teal-bg text-t-teal', red: 'bg-t-red-bg text-t-red', purple: 'bg-t-purple-bg text-t-purple',
  gray: 'bg-t-gray-bg text-t-gray', lime: 'bg-t-lime-bg text-t-lime',
};

export function DeltaPill({ value, suffix = '', invert = false, label, variant = 'chip', className = '' }: {
  value: number | null; suffix?: string; invert?: boolean; label?: string; variant?: 'chip' | 'plain'; className?: string;
}) {
  if (value === null) return null;
  const up = value === Infinity || value >= 0;
  const good = invert ? !up : up;
  const text = value === Infinity ? 'mới' : `${Math.abs(value).toFixed(1).replace('.', ',')}%${suffix}`;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  if (variant === 'plain') {
    return (
      <span className={`num inline-flex items-center gap-px whitespace-nowrap text-[11.5px] ${good ? 'text-good' : 'text-bad'} ${className}`}>
        <Arrow size={12} />{text}{label ? <span className="ml-1 font-normal tracking-normal text-ink-3">{label}</span> : null}
      </span>
    );
  }
  return (
    <span className={`num inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] ${good ? 'bg-good-bg text-t-green' : 'bg-bad-bg text-bad'} ${className}`}>
      <Arrow size={12} />{text}{label ? <span className="ml-1 font-normal tracking-normal text-ink-3">{label}</span> : null}
    </span>
  );
}

export function StatusChip({ tone = 'gray', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

export type KpiTooltip = ReactNode | TipRows;
export function KpiCard({ icon: Icon, tone = 'green', label, value, delta: d, deltaLabel = 'so kỳ trước', invert, note, onClick, active, tooltip, tip, countUp, rawValue, format, unit, progress, sparkline, loading, className = '' }: {
  icon: LucideIcon; tone?: Tone; label: string; value: string; delta?: number | null; deltaLabel?: string; invert?: boolean; note?: ReactNode; onClick?: () => void; active?: boolean;
  /** Tooltip khi rê chuột / focus: ReactNode tuỳ ý hoặc { title?, period?, current?, previous?, previousLabel?, diff?, definition? }. */
  tooltip?: KpiTooltip; /** Bí danh của tooltip (theo bản thiết kế). */ tip?: KpiTooltip;
  /** Đếm số lên khi vào tầm nhìn; cần rawValue (số) và format (hàm ra đúng chuỗi value, ví dụ money / short). */
  countUp?: boolean; rawValue?: number; format?: (n: number) => string;
  /** Đơn vị in nhỏ sau số (ví dụ "đơn", "₫"). */ unit?: string;
  /** Thanh tiến độ 6px dưới ghi chú. */ progress?: { value: number; max: number };
  /** Sparkline nhỏ cuối thẻ. */ sparkline?: number[];
  loading?: boolean; className?: string;
}) {
  const rows = tip ?? tooltip;
  const content = rows === undefined || rows === null || rows === false ? null : isTipRows(rows) ? <TipContent {...rows} title={rows.title ?? label} /> : rows;
  const hook = useTip(content, { delay: 120, side: 'bottom', auto: false });
  const Tag = onClick ? 'button' : 'div';
  // Cỡ chữ của số co theo bề rộng thẻ (container query, trừ 40px padding): tối đa 30px, sàn 12px; luôn cắt bằng "…" + title để không tràn viền.
  const fit = `clamp(0.75rem, calc((100cqw - 40px) / ${Math.max(4, value.length * 0.62).toFixed(2)}), 1.875rem)`;
  const canCount = countUp && rawValue !== undefined && Number.isFinite(rawValue);
  const fmt = format ?? ((n: number) => n === rawValue ? value : vi.format(Math.round(n)));
  const w = progress ? (progress.max ? Math.min(100, Math.max(0, progress.value / progress.max * 100)) : 0) : 0;
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      tabIndex={!onClick && content ? 0 : undefined}
      aria-pressed={onClick && active !== undefined ? active : undefined}
      className={`kpi @container ${active ? 'is-active' : ''} ${hook.open ? 'is-open' : ''} ${loading ? 'is-loading' : ''} ${onClick || content ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      {...hook.props}>
      <span className={`tile ${TONES[tone]}`}><Icon size={16} /></span>
      <span className="lbl" title={label}>{label}</span>
      <span className="val" style={{ fontSize: fit }} title={value}>
        {canCount ? <CountUp value={rawValue!} format={fmt} /> : value}
        {unit && <span className="ml-1 text-[.5em] font-semibold tracking-normal text-ink-3">{unit}</span>}
      </span>
      {d !== undefined && d !== null && (
        <span className="d"><DeltaPill value={d} invert={invert} variant="plain" /><span className="whitespace-nowrap">{deltaLabel.replace(/^So với /i, 'so ')}</span></span>
      )}
      {note && <span className="note" title={typeof note === 'string' ? note : undefined}>{typeof note === 'string' ? <Segments text={note} /> : note}</span>}
      {progress && <span className="bar" title={`${Math.round(w)}% mục tiêu`}><i style={{ width: `${w}%` }} /></span>}
      {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} width={120} height={26} className="mt-1" />}
      {hook.node}
    </Tag>
  );
}

export function MiniStat({ icon: Icon, tone = 'gray', label, value, delta: d, invert, note, onClick, active, className = '' }: {
  icon: LucideIcon; tone?: Tone; label: string; value: string; delta?: number | null; invert?: boolean; note?: string; onClick?: () => void; active?: boolean; className?: string;
}) {
  const Tag: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Tag {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': active } : {})} className={`ministat ${onClick ? '' : 'is-static'} ${active ? 'is-active' : ''} ${className}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}><Icon size={16} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-ink-3" title={label}>{label}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"><span className="num whitespace-nowrap text-[18px] leading-tight text-ink">{value}</span>{d !== undefined && <DeltaPill value={d} invert={invert} variant="plain" />}</span>
        {note && <span className="num block whitespace-normal text-[11.5px] leading-tight text-ink-2">{note}</span>}
      </span>
    </Tag>
  );
}

/** Chuỗi ghép bằng " · ": mỗi đoạn giữ nguyên một dòng, chỉ được xuống dòng tại dấu chấm giữa. */
export function Segments({ text, className = '' }: { text: string; className?: string }) {
  const parts = text.split(' · ');
  // Đoạn ngắn (số + đơn vị, nhãn) giữ nguyên một dòng; đoạn dài (câu mô tả) được xuống dòng bình thường để không bị cắt cụt.
  return <span className={className}>{parts.map((p, i) => <span key={i}><span className={p.length <= 18 ? 'whitespace-nowrap' : ''}>{p}</span>{i < parts.length - 1 ? ' · ' : ''}</span>)}</span>;
}

/** Nút (i) mở tooltip bằng rê chuột, focus và chạm (thay cho title= chỉ hiện khi rê chuột). */
export function InfoTip({ text, label = 'Cách tính', side = 'bottom', className = '' }: { text: ReactNode; label?: string; side?: TipSide; className?: string }) {
  const hook = useTip(<span className="block whitespace-normal">{text}</span>, { side, auto: true });
  return (
    <button type="button" aria-label={label} {...hook.props}
      onClick={(e) => { e.stopPropagation(); hook.show(e.currentTarget, true); }}
      className={`grid size-5 shrink-0 place-items-center rounded-full text-ink-4 transition-colors duration-150 hover:bg-surface-2 hover:text-primary ${className}`}>
      <Info size={14} />{hook.node}
    </button>
  );
}

function MoreLink({ label = 'Xem thêm', onClick, href }: { label?: string; onClick?: () => void; href?: string }) {
  const cls = 'group/more inline-flex items-center gap-0.5 whitespace-nowrap rounded-[5px] px-1 py-0.5 text-[11.5px] text-ink-3 transition-colors duration-150 hover:bg-tint-2 hover:text-primary';
  const arrow = <ArrowRight size={12} className="transition-transform duration-150 group-hover/more:-translate-y-px group-hover/more:translate-x-px" />;
  return href ? <a className={cls} href={href}>{label}{arrow}</a> : <button type="button" className={cls} onClick={onClick}>{label}{arrow}</button>;
}

export function ChartCard({ icon: Icon, title, subtitle, action, info, children, className = '', more, lift, loading, bodyClassName = '' }: {
  icon?: LucideIcon; title: string; subtitle?: string; action?: ReactNode; info?: string; children: ReactNode; className?: string;
  /** Liên kết "Xem thêm" ở góc phải đầu thẻ. */ more?: { label?: string; onClick?: () => void; href?: string };
  /** Nhấc thẻ + viền xanh khi rê chuột. */ lift?: boolean;
  /** Che thân thẻ bằng xương lấp lánh khi đang tải. */ loading?: boolean;
  bodyClassName?: string;
}) {
  return (
    <section className={`card flex flex-col gap-4 p-5 max-sm:gap-3 max-sm:rounded-xl max-sm:p-4 ${lift ? 'lift' : ''} ${loading ? 'is-loading' : ''} ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-[min(100%,14rem)] flex-1 items-start gap-2">
          {Icon && <Icon size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />}
          <div className="min-w-0">
            <h3 className="flex min-w-0 items-center gap-1.5 text-base font-semibold leading-tight tracking-[-.01em] text-ink">
              <span className="truncate" title={title}>{title}</span>
              {(info || (subtitle && subtitle.length > 90)) && <InfoTip text={info ?? subtitle} />}
            </h3>
            {subtitle && <p className="mt-0.5 line-clamp-2 max-w-[70ch] text-[11.5px] leading-snug text-ink-3" title={subtitle}><Segments text={subtitle} /></p>}
          </div>
        </div>
        {(action || more) && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{action}{more && <MoreLink {...more} />}</div>}
      </header>
      <div className={`card-body min-w-0 ${bodyClassName}`}><div className="tbl-wrap">{children}</div></div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, subtitle, badge, actions, className = '' }: { eyebrow?: string; title: string; subtitle?: string; badge?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[11.5px] font-semibold tabular-nums text-ink-3">{eyebrow}</p>}
        <h1 className="display mt-0.5 flex flex-wrap items-center gap-2 text-2xl font-semibold leading-[1.05] tracking-[-.025em] text-ink sm:text-[28px]">{title}{badge}</h1>
        {subtitle && <p className="mt-1.5 line-clamp-2 max-w-[80ch] text-[12.5px] leading-snug text-ink-2" title={subtitle}><Segments text={subtitle} /></p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Tiêu đề mục (h2, Bricolage 20px). */
export function SectionTitle({ icon: Icon, children, tag, className = '' }: { icon?: LucideIcon; children: ReactNode; tag?: string; className?: string }) {
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 ${className}`}>
      {Icon && <Icon size={16} className="text-ink-3" aria-hidden="true" />}
      <h2 className="display text-xl font-semibold tracking-[-.02em] text-ink">{children}</h2>
      {tag && <span className="num rounded-[4px] border border-line-2 px-1.5 py-px text-[10.5px] font-semibold text-ink-3">{tag}</span>}
    </div>
  );
}

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-card-line bg-surface p-2.5 shadow-card ${className}`}>{children}</div>;
}

export function ErrorBox({ error, onRetry, className = '' }: { error: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={`notice error ${className}`}>
      <span className="min-w-0 flex-1">Không tải được dữ liệu: {error}</span>
      {onRetry && <button type="button" className="btn sm" onClick={onRetry}><RotateCw size={12} />Thử lại</button>}
    </div>
  );
}

export function Sparkline({ data, color = 'var(--primary)', width = 96, height = 28, className = '', reveal = false, dot = true }: {
  data: number[]; color?: string; width?: number; height?: number; className?: string; /** Chỉ hiện khi rê chuột / focus vào dòng cha (tr, li, .reveal-row). */ reveal?: boolean; dot?: boolean;
}) {
  if (!data.length) return <span className="text-xs text-ink-4">—</span>;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const y = (v: number) => height - 3 - (v - min) / (max - min || 1) * (height - 6);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const lastX = ((data.length - 1) * step).toFixed(1), lastY = y(data[data.length - 1]).toFixed(1);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className={`${reveal ? 'reveal from-left' : ''} ${className}`} style={{ overflow: 'visible' }}>
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={color} opacity=".14" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {dot && <circle cx={lastX} cy={lastY} r="2.4" fill={color} stroke="var(--surface)" strokeWidth="1.5" />}
    </svg>
  );
}

export type Slice = { key: string; label: string; value: number; color: string };
export function Donut({ slices, centerValue, centerLabel, size = 172, thickness = 22, format = (n: number) => vi.format(n), onSelect, centerRaw, className = '' }: {
  slices: Slice[]; centerValue: string; centerLabel: string; size?: number; thickness?: number; format?: (n: number) => string;
  /** Bấm / Enter vào cung hoặc dòng chú giải. */ onSelect?: (slice: Slice) => void;
  /** Số thô để đếm lên ở tâm (giá trị cuối vẫn in bằng centerValue). */ centerRaw?: number;
  className?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const hotW = thickness + 6;
  const r = (size - hotW) / 2, c = 2 * Math.PI * r;
  const [hot, setHot] = useState<string | null>(null);
  const hotSlice = slices.find((s) => s.key === hot) ?? null;
  const hook = useTip(hotSlice ? <><b>{hotSlice.label}</b><span className="r"><span>Số lượng</span><span className="num">{format(hotSlice.value)}</span></span><span className="r"><span>Tỷ trọng</span><span className="num">{pct(hotSlice.value / total * 100)}</span></span></> : null, { side: 'right', auto: true, delay: 60 });
  const enter = (key: string, el: HTMLElement | SVGElement) => { setHot(key); hook.show(el, true); };
  const leave = () => { setHot(null); hook.hide(); };
  const key = (e: KeyboardEvent, s: Slice) => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(s); } };
  // Vị trí bắt đầu của từng cung (tính trước, không đổi biến trong lúc render).
  const visible = slices.filter((s) => s.value > 0);
  const starts = visible.reduce<number[]>((acc, s, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + visible[i - 1].value / total * c); return acc; }, []);
  const arcs = visible.map((s, i) => {
    const len = s.value / total * c, dash = Math.max(0, len - 2);
    return (
      <circle key={s.key} className={`arc ${hot === s.key ? 'hot' : hot ? 'dim' : ''}`} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={thickness}
        strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-starts[i]} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        tabIndex={0} role={onSelect ? 'button' : 'img'} aria-label={`${s.label} · ${format(s.value)} · ${pct(s.value / total * 100)}`}
        onMouseEnter={(e) => enter(s.key, e.currentTarget)} onMouseLeave={leave} onFocus={(e) => enter(s.key, e.currentTarget)} onBlur={leave}
        onClick={onSelect ? () => onSelect(s) : undefined} onKeyDown={(e) => key(e, s)} />
    );
  });
  return (
    <div className={`donut flex flex-wrap items-center gap-5 ${className}`} style={{ '--arc-hot': `${hotW}px` } as CSSProperties}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerValue} ${centerLabel}`} style={{ overflow: 'visible' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
          {arcs}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num text-2xl leading-none text-ink">{centerRaw !== undefined ? <CountUp value={centerRaw} format={(n) => n === centerRaw ? centerValue : vi.format(Math.round(n))} /> : centerValue}</span>
          <span className="mt-1 text-[10.5px] text-ink-3">{centerLabel}</span>
        </div>
      </div>
      <ul className="m-0 min-w-44 flex-1 list-none p-0">
        {slices.map((s) => (
          <li key={s.key} className={hot === s.key ? 'hot' : hot ? 'dim' : ''} tabIndex={onSelect ? 0 : -1} role={onSelect ? 'button' : undefined}
            onMouseEnter={(e) => enter(s.key, e.currentTarget)} onMouseLeave={leave} onFocus={(e) => enter(s.key, e.currentTarget)} onBlur={leave}
            onClick={onSelect ? () => onSelect(s) : undefined} onKeyDown={(e) => key(e, s)}>
            <i className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="num whitespace-nowrap text-ink">{format(s.value)}</span>
            <span className="num w-11 text-right text-[11px] text-ink-3">{pct(s.value / total * 100)}</span>
          </li>
        ))}
      </ul>
      {hook.node}
    </div>
  );
}

const FUNNEL_FILLS = ['color-mix(in srgb, var(--primary) 34%, var(--surface))', 'color-mix(in srgb, var(--primary) 56%, var(--surface))', 'color-mix(in srgb, var(--primary) 80%, var(--surface))', 'var(--primary)'];
export function Funnel({ steps, format = (n: number) => vi.format(n) }: { steps: { label: string; value: number; note?: string; color?: string; /** Tooltip chi tiết khi rê chuột / focus vào bước (ví dụ "a / b khách = x%"). */ tip?: ReactNode }[]; format?: (n: number) => string }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const [hot, setHot] = useState<number | null>(null);
  const hook = useTip(hot !== null ? steps[hot]?.tip ?? null : null, { side: 'bottom', auto: true, delay: 60 });
  const enter = (i: number, el: HTMLElement) => { if (!steps[i]?.tip) return; setHot(i); hook.show(el, true); };
  const leave = () => { setHot(null); hook.hide(); };
  return (
    <ol className="space-y-2">
      {hook.node}
      {steps.map((s, i) => {
        const w = Math.max(18, s.value / max * 100);
        const prev = steps[i - 1]?.value;
        const light = !s.color && i % 4 < 2;
        return (
          <li key={s.label} tabIndex={s.tip ? 0 : undefined} className={s.tip ? 'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring' : undefined}
            onMouseEnter={(e) => enter(i, e.currentTarget)} onMouseLeave={leave} onFocus={(e) => enter(i, e.currentTarget)} onBlur={leave}>
            <div className="flex items-center justify-between gap-2 text-xs text-ink-2"><span className="min-w-0 truncate">{s.label}{s.note ? ` · ${s.note}` : ''}</span>{prev ? <span className="num whitespace-nowrap text-ink-3">{pct(prev ? s.value / prev * 100 : null)} <span className="font-normal">của bước trước</span></span> : null}</div>
            <div className="mt-1 h-9 rounded-lg bg-surface-3">
              <div className={`funnel-bar num flex h-9 items-center justify-center rounded-lg text-sm ${light ? 'text-ink' : 'text-primary-ink'}`} style={{ width: `${w}%`, background: s.color ?? FUNNEL_FILLS[i % 4], marginLeft: `${(100 - w) / 2}%` }}>{format(s.value)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressBar({ value, max, color = 'var(--primary)', size = 'md', width = 96, low = false, className = '' }: {
  value: number; max: number; color?: string; size?: 'sm' | 'md'; width?: number; /** Tô đỏ (thấp). */ low?: boolean; className?: string;
}) {
  const w = max ? Math.min(100, value / max * 100) : 0;
  return <span className={`pbar ${className}`} style={{ width, height: size === 'sm' ? 4 : 6 }} aria-hidden="true"><i style={{ width: `${w}%`, background: low ? 'var(--bad)' : color }} /></span>;
}

export function Avatar({ name, size = 'md', className = '' }: { name: string; size?: 'sm' | 'md'; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  return <span className={`grid shrink-0 place-items-center rounded-full bg-primary font-semibold tracking-[.02em] text-primary-ink ${size === 'sm' ? 'size-[22px] text-[9.5px]' : 'size-[26px] text-[10.5px]'} ${className}`} aria-hidden="true">{initials}</span>;
}

export function EmptyState({ text, className = '' }: { text: string; className?: string }) {
  return <p className={`empty ${className}`}>{text}</p>;
}

/** Ô nhiệt cho bảng cohort: đậm dần theo giá trị %. */
export function heat(v: number | null): CSSProperties {
  if (v === null) return { background: 'var(--surface-2)', color: 'var(--ink-4)' };
  const a = Math.min(1, v / 100);
  return { background: `color-mix(in srgb, var(--primary) ${Math.round(8 + a * 85)}%, var(--surface))`, color: a > 0.6 ? 'var(--primary-ink)' : 'var(--ink)' };
}

/** Khối "Cách tính" gập lại, thay cho đoạn giải thích dài ở cuối trang. */
export function Definitions({ items, title = 'Cách tính và nguồn số liệu', className = '' }: { items: Record<string, string> | string[]; title?: string; className?: string }) {
  const list = Array.isArray(items) ? items : Object.values(items);
  if (!list.length) return null;
  return (
    <details className={`defs ${className}`}>
      <summary><Info size={14} className="shrink-0 text-ink-3" aria-hidden="true" />{title}<ChevronDown size={14} className="chev" aria-hidden="true" /></summary>
      <ul className="list-disc space-y-1 px-4 py-3 pl-8 leading-relaxed">{list.map((v, i) => <li key={i}>{v}</li>)}</ul>
    </details>
  );
}

/** Băng-rôn tiến độ gom danh sách khách Pancake khi còn POS chưa duyệt xong (số ghi chú/khách sẽ còn tăng). */
export function BackfillNotice({ backfill }: { backfill?: { posId: string; completed: boolean; initial?: boolean; page: number; done: number; total: number | null; percent: number | null }[] }) {
  // Chỉ báo khi POS chưa từng duyệt xong lần nào (số liệu còn thiếu thật); vòng duyệt lại định kỳ chạy ngầm, không báo.
  const pending = (backfill ?? []).filter((b) => !b.completed && b.initial !== false);
  if (!pending.length) return null;
  return (
    <p className="notice warn">
      <span>Đang gom danh sách khách từ Pancake, số liệu còn tăng: {pending.map((b) => `${posName(b.posId)} ${b.percent !== null ? `${b.percent}%` : `${vi.format(b.done)} khách`}`).join(' · ')}. Khách và ghi chú của nhân viên chưa duyệt tới sẽ xuất hiện dần trong vài giờ.</span>
    </p>
  );
}

/** Sắp xếp bảng: bấm tiêu đề cột để đổi cột, bấm lại để đảo chiều. */
export function useSort<K extends string>(initial: K, initialDesc = true) {
  const [key, setKey] = useState<K>(initial);
  const [desc, setDesc] = useState(initialDesc);
  const toggle = (k: K) => { if (k === key) setDesc((d) => !d); else { setKey(k); setDesc(true); } };
  const mark = (k: K) => k === key ? (desc ? ' ↓' : ' ↑') : '';
  const apply = <T,>(rows: T[], value: (r: T, k: K) => number | string | null | undefined) => [...rows].sort((a, b) => {
    const va = value(a, key), vb = value(b, key);
    if (typeof va === 'string' || typeof vb === 'string') { const c = String(va ?? '').localeCompare(String(vb ?? ''), 'vi'); return desc ? -c : c; }
    const na = va === null || va === undefined ? -Infinity : va, nb = vb === null || vb === undefined ? -Infinity : vb;
    return desc ? nb - na : na - nb;
  });
  return { key, desc, toggle, mark, apply, setKey, setDesc };
}
export type SortState = { key: string; desc?: boolean; toggle: (k: never) => void; mark: (k: never) => string };
/** Tiêu đề cột sắp xếp được: cả ô bấm được, nút bên trong nhận bàn phím; mũi tên hiện mờ khi rê chuột, rõ khi đang sắp xếp (không đổi bề rộng). */
export function SortTh({ k, label, sort, align = 'right', className = '', title = 'Bấm để sắp xếp' }: { k: string; label: ReactNode; sort: SortState; align?: 'left' | 'right'; className?: string; title?: string }) {
  const on = sort.key === k;
  const asc = on && sort.desc === false;
  const Icon = !on ? ArrowUpDown : asc ? ArrowUp : ArrowDown;
  return (
    <th className={`sort select-none whitespace-nowrap ${align === 'right' ? 'r text-right' : 'text-left'} ${className}`} aria-sort={on ? (asc ? 'ascending' : 'descending') : undefined} onClick={() => sort.toggle(k as never)}>
      <button type="button" title={title}>{label}<span className="ar" aria-hidden="true"><Icon size={12} /></span></button>
    </th>
  );
}

/** Bọc bảng: cuộn ngang trong thẻ (không bao giờ cuộn cả trang), tuỳ chọn cuộn dọc với tiêu đề dính. */
export function TableWrap({ children, className = '', minWidth, maxHeight, sticky, stickyFirst }: {
  children: ReactNode; className?: string; /** Bề rộng tối thiểu của bảng (px), ví dụ 640 để cuộn ngang trên điện thoại. */ minWidth?: number;
  /** Chiều cao tối đa (cuộn dọc bên trong, tiêu đề dính). */ maxHeight?: number | string; /** Dính hàng tiêu đề khi cuộn dọc. */ sticky?: boolean;
  /** Dính cột đầu khi cuộn ngang (cần table.tbl). */ stickyFirst?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Gợi ý còn cột bị khuất: data-more="left right" → CSS tô mờ mép (thanh cuộn macOS/điện thoại ẩn nên người xem không biết bảng còn cuộn được).
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => {
      const more = [el.scrollLeft > 2 ? 'left' : '', el.scrollWidth - el.clientWidth - el.scrollLeft > 2 ? 'right' : ''].filter(Boolean).join(' ');
      if (el.dataset.more !== more) el.dataset.more = more;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el); const t = el.querySelector('table'); if (t) ro?.observe(t);
    // Bảng thay skeleton / đổi bề rộng sau khi mount: quan sát lại bảng hiện tại.
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { const nt = el.querySelector('table'); if (nt) ro?.observe(nt); update(); }) : null;
    mo?.observe(el, { childList: true, subtree: true });
    return () => { el.removeEventListener('scroll', update); mo?.disconnect(); ro?.disconnect(); };
  }, []);
  return (
    <div ref={ref} className={`tbl-wrap ${sticky || maxHeight ? 'is-sticky' : ''} ${stickyFirst ? 'sticky-first' : ''} ${className}`}
      style={{ ...(minWidth ? { '--tbl-min': `${minWidth}px` } : {}), ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}) } as CSSProperties}>
      {children}
    </div>
  );
}

/** Xương lấp lánh khi tải. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skel ${className}`} style={style} aria-hidden="true" />;
}
export function SkeletonKpis({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`is-loading grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4 ${className}`} aria-busy="true" aria-label="Đang tải số liệu">
      {Array.from({ length: count }, (_, i) => <div key={i} className="kpi min-h-[124px]" />)}
    </div>
  );
}
export function SkeletonTable({ rows = 6, cols = 5, className = '' }: { rows?: number; cols?: number; className?: string }) {
  return (
    <table className={`w-full text-sm ${className}`} aria-busy="true" aria-label="Đang tải bảng">
      <thead><tr>{Array.from({ length: cols }, (_, i) => <th key={i} className="px-2 py-2"><Skeleton className="h-3 w-16" /></th>)}</tr></thead>
      <tbody>{Array.from({ length: rows }, (_, r) => <tr key={r} className="border-t border-line">{Array.from({ length: cols }, (_, c) => <td key={c} className="px-2 py-2.5"><Skeleton className="h-3.5" style={{ width: `${c === 0 ? 70 : 40 + ((r * 7 + c * 13) % 35)}%` }} /></td>)}</tr>)}</tbody>
    </table>
  );
}

/** Bộ chọn phân đoạn: ngón trượt, phím ←→ / Home / End, role=radiogroup. */
export function SegmentedControl<T extends string>({ options, value, onChange, size = 'md', className = '', ariaLabel, tone = 'primary' }: {
  options: { value: T; label: ReactNode; icon?: LucideIcon; title?: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string; ariaLabel?: string; tone?: 'primary' | 'lime';
}) {
  const root = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const measure = useCallback(() => {
    const el = root.current; if (!el) return;
    const btn = el.querySelector<HTMLButtonElement>('button[data-active="true"]');
    setThumb(btn ? { x: btn.offsetLeft - 2, w: btn.offsetWidth } : null);
  }, []);
  useLayoutEffect(measure, [value, options.length, measure]);
  useEffect(() => {
    const el = root.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
  }, [measure]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value), n = options.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    root.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };
  return (
    <div ref={root} role="radiogroup" tabIndex={-1} aria-label={ariaLabel} className={`seg ${size === 'sm' ? 'sm' : ''} ${tone === 'lime' ? 'lime' : ''} ${className}`} onKeyDown={onKey}>
      <span className="seg-thumb" aria-hidden="true" style={thumb ? { width: thumb.w, transform: `translateX(${thumb.x}px)`, opacity: 1 } : { opacity: 0 }} />
      {options.map((o, i) => {
        const on = o.value === value;
        // Không tuỳ chọn nào khớp value (ví dụ tháng gõ tay) → nút đầu nhận Tab để nhóm không bị bỏ qua.
        const focusable = on || (i === 0 && !options.some((x) => x.value === value));
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} data-active={on ? 'true' : 'false'} tabIndex={focusable ? 0 : -1} title={o.title}
            className={`seg-btn ${on ? 'is-active' : ''}`} onClick={() => onChange(o.value)}>
            {o.icon && <o.icon size={13} aria-hidden="true" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tất cả / Sale / CSKH dùng chung (team-store). Một bản ở thanh trên cùng; trang khác dùng lại component này thay vì tự vẽ. */
export function TeamSwitch({ size = 'md', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  const team = useTeam();
  return <SegmentedControl ariaLabel="Xem số liệu của nhóm" size={size} className={className} value={team} onChange={setTeam}
    options={(Object.keys(TEAM_LABELS) as Team[]).map((t) => ({ value: t, label: TEAM_LABELS[t] }))} />;
}

/** Sáng / Tối / Hệ thống (lớp .dark trên html, nhớ trong localStorage). */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const mode = useTheme();
  return <SegmentedControl<ThemeMode> ariaLabel="Giao diện sáng / tối" size="sm" className={className} value={mode} onChange={setTheme}
    options={[{ value: 'light', label: <span className="sr-only">Sáng</span>, icon: Sun, title: 'Sáng' }, { value: 'dark', label: <span className="sr-only">Tối</span>, icon: Moon, title: 'Tối' }, { value: 'system', label: <span className="sr-only">Theo hệ thống</span>, icon: Monitor, title: 'Theo hệ thống' }]} />;
}

/** Dòng ngữ cảnh mở ra khi rê chuột / focus vào phần tử cha có lớp .ctx-row (hoặc open=true). */
export function ContextLine({ children, open, className = '', indent = 0 }: { children: ReactNode; open?: boolean; className?: string; indent?: number }) {
  return <span className={`ctx ${open ? 'open' : ''} ${className}`}><span style={indent ? { paddingLeft: indent } : undefined}>{children}</span></span>;
}
/** Nút / sparkline chỉ hiện khi rê chuột hoặc focus vào dòng cha (tr, li hoặc phần tử có .reveal-row). */
export function HoverReveal({ children, from = 'right', className = '' }: { children: ReactNode; from?: 'left' | 'right'; className?: string }) {
  return <span className={`reveal ${from === 'left' ? 'from-left' : ''} inline-flex items-center gap-0.5 ${className}`}>{children}</span>;
}

/** Viên "Đồng bộ hh:mm": chấm xanh, nhịp đập 4 lần khi có mốc đồng bộ MỚI HƠN; rê chuột / focus xem chi tiết từng POS. */
export function SyncPill({ lastSyncAt, label = 'Đồng bộ', detail, state = 'ok', busy = false, className = '' }: {
  lastSyncAt: string | null | undefined; label?: string; detail?: ReactNode; state?: 'ok' | 'warn' | 'bad';
  /** Đang tải số mới từ máy chủ: ô chuyển màu vàng "Đang làm mới…". */ busy?: boolean; className?: string;
}) {
  const prev = useRef<string | null | undefined>(lastSyncAt);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = lastSyncAt;
    if (!lastSyncAt || !before || Date.parse(lastSyncAt) <= Date.parse(before)) return;
    setFresh(true);
    const t = window.setTimeout(() => setFresh(false), 6000);
    return () => clearTimeout(t);
  }, [lastSyncAt]);
  const hook = useTip(detail ?? null, { auto: true });
  const inner = <><span className={`dot ${state !== 'ok' ? state : ''}`} aria-hidden="true" />{busy ? 'Đang làm mới…' : label} <span className="t">{lastSyncAt ? timeOnly(lastSyncAt) : '—'}</span>{hook.node}</>;
  const cls = `sync ${fresh ? 'is-fresh' : ''} ${busy ? 'is-busy' : ''} ${className}`;
  if (!detail) return <span className={cls} role="status">{inner}</span>;
  return (
    <button type="button" className={cls} aria-label={`${busy ? 'Đang làm mới số liệu · ' : ''}${label} ${lastSyncAt ? timeOnly(lastSyncAt) : 'chưa có'} · xem chi tiết từng POS`}
      onClick={(e) => hook.show(e.currentTarget, true)} {...hook.props}>
      {inner}
    </button>
  );
}
