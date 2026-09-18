'use client';

// Bộ thành phần giao diện dùng chung cho các trang báo cáo: thẻ chỉ số, thẻ biểu đồ, huy hiệu chênh lệch,
// sparkline, vòng tròn trạng thái, phễu, bảng cohort. Màu phân loại POS theo bảng đã kiểm tra mù màu.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { POS } from '@/lib/report-model';

export const vi = new Intl.NumberFormat('vi-VN');
export const money = (n: number | null | undefined) => n === null || n === undefined ? '—' : `${vi.format(Math.round(n))} ₫`;
export const short = (n: number) => Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2).replace('.', ',')} tỷ` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} tr` : vi.format(Math.round(n));
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

export const POS_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
export const posColor = (posId: string) => POS_COLORS[POS.findIndex((p) => p.id === posId)] ?? '#52514e';
export const posName = (posId: string) => POS.find((p) => p.id === posId)?.name ?? posId;
export const STATUS_COLORS = { new: '#8a9a90', confirmed: '#2a78d6', shipping: '#eda100', delivered: '#1a9c5b', returned: '#eb6834', cancelled: '#d24b4b' } as const;
export const STATUS_LABELS = { new: 'Mới / chờ XN', confirmed: 'Đã XN / đang xử lý', shipping: 'Đang giao', delivered: 'Giao thành công', returned: 'Hoàn', cancelled: 'Hủy' } as const;

export type Tone = 'green' | 'blue' | 'orange' | 'teal' | 'red' | 'purple' | 'gray' | 'lime';
const TONES: Record<Tone, string> = {
  green: 'bg-[#e4f5ea] text-[#17684b]', blue: 'bg-[#e6f0fb] text-[#2a78d6]', orange: 'bg-[#fdeee4] text-[#d85f2a]',
  teal: 'bg-[#e1f5f0] text-[#0f8f74]', red: 'bg-[#fdeaea] text-[#c8403f]', purple: 'bg-[#ede9f9] text-[#5b48b8]',
  gray: 'bg-[#eef1ee] text-[#5d7266]', lime: 'bg-[#f1f8d6] text-[#5a7a12]',
};

export function DeltaPill({ value, suffix = '', invert = false, label }: { value: number | null; suffix?: string; invert?: boolean; label?: string }) {
  if (value === null) return null;
  const up = value === Infinity || value >= 0;
  const good = invert ? !up : up;
  const text = value === Infinity ? 'mới' : `${Math.abs(value).toFixed(1).replace('.', ',')}%${suffix}`;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${good ? 'bg-[#e4f5ea] text-[#1a7a48]' : 'bg-[#fdeaea] text-[#c23a3a]'}`}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{text}{label ? <span className="ml-1 font-normal text-[#5d7266]">{label}</span> : null}
    </span>
  );
}

export function StatusChip({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export function KpiCard({ icon: Icon, tone = 'green', label, value, delta: d, deltaLabel = 'so kỳ trước', invert, note, onClick, active }: {
  icon: LucideIcon; tone?: Tone; label: string; value: string; delta?: number | null; deltaLabel?: string; invert?: boolean; note?: ReactNode; onClick?: () => void; active?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`flex gap-2.5 rounded-2xl border bg-white p-3 text-left shadow-[0_4px_18px_rgba(25,65,46,.04)] transition sm:gap-3 sm:p-4 ${onClick ? 'hover:border-[#9fc5b0]' : ''} ${active ? 'border-[#17684b] ring-1 ring-[#17684b]' : ''}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl sm:size-11 ${TONES[tone]}`}><Icon size={20} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium leading-tight text-[#6a8575] sm:text-xs" title={label}>{label}</p>
        <p className={`mt-1 whitespace-nowrap font-semibold tracking-tight ${value.length > 15 ? 'text-sm sm:text-base' : value.length > 11 ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}>{value}</p>
        {d !== undefined && d !== null && (
          <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[#6a8575]"><DeltaPill value={d} invert={invert} /><span className="truncate">{deltaLabel.replace(/^So với /i, 'so ')}</span></p>
        )}
        {note && <p className="mt-1 truncate text-[11px] leading-tight text-[#7d9184] sm:text-xs" title={typeof note === 'string' ? note : undefined}>{note}</p>}
      </div>
    </Tag>
  );
}

export function MiniStat({ icon: Icon, tone = 'gray', label, value, delta: d, invert, note, onClick, active }: {
  icon: LucideIcon; tone?: Tone; label: string; value: string; delta?: number | null; invert?: boolean; note?: string; onClick?: () => void; active?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left ${active ? 'border-[#17684b]' : ''}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}><Icon size={18} /></span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-[#7d9184]" title={label}>{label}</p>
        <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold">{value}{d !== undefined && <DeltaPill value={d} invert={invert} />}</p>
        {note && <p className="truncate text-[11px] text-[#547467]" title={note}>{note}</p>}
      </div>
    </button>
  );
}

export function ChartCard({ icon: Icon, title, subtitle, action, info, children, className = '' }: {
  icon?: LucideIcon; title: string; subtitle?: string; action?: ReactNode; info?: string; children: ReactNode; className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border bg-white p-3 shadow-[0_4px_18px_rgba(25,65,46,.04)] sm:p-4 ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {Icon && <span className="mt-0.5 grid size-9 place-items-center rounded-lg bg-[#e4f5ea] text-[#17684b]"><Icon size={18} /></span>}
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-semibold">{title}{(info || (subtitle && subtitle.length > 90)) && <span title={info ?? subtitle} className="cursor-help text-[#9db3a5]"><Info size={14} /></span>}</h3>
            {subtitle && <p className="line-clamp-1 max-w-[60ch] text-xs text-[#7d9184]" title={subtitle}>{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </header>
      <div className="min-w-0 overflow-x-auto">{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, subtitle, badge, actions }: { eyebrow?: string; title: string; subtitle?: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-xs font-medium text-[#6a8575]">{eyebrow}</p>}
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">{title}{badge}</h1>
        {subtitle && <p className="mt-1 line-clamp-1 max-w-[80ch] text-sm text-[#547467]" title={subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-[0_4px_18px_rgba(25,65,46,.03)]">{children}</div>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#f0c9a6] bg-[#fff7ee] p-4 text-sm text-[#8a4b12]">
      <span>Không tải được dữ liệu: {error}</span>
      {onRetry && <button type="button" className="rounded-md border bg-white px-2 py-1 text-xs" onClick={onRetry}>Thử lại</button>}
    </div>
  );
}

export function Sparkline({ data, color = '#17684b', width = 96, height = 28 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data.length) return <span className="text-xs text-[#9db3a5]">—</span>;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const y = (v: number) => height - 2 - (v - min) / (max - min || 1) * (height - 4);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={color} opacity=".12" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export type Slice = { key: string; label: string; value: number; color: string };
export function Donut({ slices, centerValue, centerLabel, size = 180, thickness = 26, format = (n: number) => vi.format(n) }: {
  slices: Slice[]; centerValue: string; centerLabel: string; size?: number; thickness?: number; format?: (n: number) => string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1ee" strokeWidth={thickness} />
        {slices.filter((s) => s.value > 0).map((s) => {
          const len = s.value / total * c;
          const el = <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
          offset += len;
          return el;
        })}
        <text x="50%" y="48%" textAnchor="middle" fontSize="22" fontWeight="600" fill="#17342b">{centerValue}</text>
        <text x="50%" y="60%" textAnchor="middle" fontSize="11" fill="#6a8575">{centerLabel}</text>
      </svg>
      <ul className="min-w-44 flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
            <span className="whitespace-nowrap font-medium">{format(s.value)} <span className="text-xs font-normal text-[#7d9184]">{pct(s.value / total * 100)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Funnel({ steps, format = (n: number) => vi.format(n) }: { steps: { label: string; value: number; note?: string; color?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const w = Math.max(18, s.value / max * 100);
        const prev = steps[i - 1]?.value;
        return (
          <li key={s.label}>
            <div className="flex items-center justify-between text-xs text-[#547467]"><span>{s.label}{s.note ? ` · ${s.note}` : ''}</span>{prev ? <span>{pct(prev ? s.value / prev * 100 : null)} của bước trước</span> : null}</div>
            <div className="mt-1 h-9 rounded-lg bg-[#eef1ee]">
              <div className="flex h-9 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ width: `${w}%`, background: s.color ?? ['#17684b', '#2a9463', '#5bbf91', '#9fd8b8'][i % 4], marginLeft: `${(100 - w) / 2}%` }}>{format(s.value)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressBar({ value, max, color = '#17684b' }: { value: number; max: number; color?: string }) {
  const w = max ? Math.min(100, value / max * 100) : 0;
  return <span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-[#eef1ee] align-middle"><span className="block h-2 rounded-full" style={{ width: `${w}%`, background: color }} /></span>;
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  return <span className={`grid shrink-0 place-items-center rounded-full bg-[#17684b] font-semibold text-white ${size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-sm'}`}>{initials}</span>;
}

export function EmptyState({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-[#7d9184]">{text}</p>;
}

/** Ô nhiệt cho bảng cohort: đậm dần theo giá trị %. */
export function heat(v: number | null) {
  if (v === null) return { background: '#f6f8f6', color: '#9db3a5' };
  const a = Math.min(1, v / 100);
  return { background: `rgba(23,104,75,${0.08 + a * 0.85})`, color: a > 0.45 ? '#fff' : '#17342b' };
}

/** Khối "Cách tính" gập lại, thay cho đoạn giải thích dài ở cuối trang. */
export function Definitions({ items }: { items: Record<string, string> | string[] }) {
  const list = Array.isArray(items) ? items : Object.values(items);
  if (!list.length) return null;
  return (
    <details className="rounded-xl border bg-white px-4 py-2 text-xs text-[#547467]">
      <summary className="cursor-pointer select-none font-medium text-[#6a8575]">Cách tính và nguồn số liệu</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">{list.map((v, i) => <li key={i}>{v}</li>)}</ul>
    </details>
  );
}

/** Băng-rôn tiến độ gom danh sách khách Pancake khi còn POS chưa duyệt xong (số ghi chú/khách sẽ còn tăng). */
export function BackfillNotice({ backfill }: { backfill?: { posId: string; completed: boolean; page: number; done: number; total: number | null; percent: number | null }[] }) {
  const pending = (backfill ?? []).filter((b) => !b.completed);
  if (!pending.length) return null;
  return (
    <p className="rounded-xl border border-[#f0dcb4] bg-[#fff8e8] px-4 py-2.5 text-sm text-[#8a5a00]">
      Đang gom danh sách khách từ Pancake, số liệu còn tăng: {pending.map((b) => `${posName(b.posId)} ${b.percent !== null ? `${b.percent}%` : `${vi.format(b.done)} khách`}`).join(' · ')}. Khách và ghi chú của nhân viên chưa duyệt tới sẽ xuất hiện dần trong vài giờ.
    </p>
  );
}
