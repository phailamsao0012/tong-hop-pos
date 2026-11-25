'use client';
// Khung chi tiết dùng chung khi rê chuột (điện thoại: chạm) vào một con số (anh Vũ 19/11/2026, plan "ok plan rê chuột").
// Nội dung dựng sẵn ở lib/shared/num-detail.ts từ số trang đã có; phần tải thêm (vd tách theo sản phẩm) chỉ dựng khi khung mở lần đầu.
// Bấm vào số vẫn làm việc cũ của ô (mở danh sách đơn, lọc…): khung chỉ mở khi rê chuột hoặc chạm.
import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DetailPart, NumDetailSpec, NumKind } from '@/lib/shared/num-detail';
import { money, shortMoney, vi } from './ui-kit';

export function fmtNum(v: number | null | undefined, kind: NumKind, short = false) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (kind === 'money') return short ? shortMoney(v) : money(v);
  if (kind === 'pct') return `${v.toFixed(1).replace('.', ',')}%`;
  if (kind === 'x') return `${v.toFixed(2).replace('.', ',')}×`;
  return vi.format(Math.round(v));
}
const toneClass = (t?: DetailPart['tone']) => (t === 'good' ? 'text-good' : t === 'warn' ? 'text-warn' : t === 'bad' ? 'text-bad' : '');

/** Phần thân khung (dùng riêng được trong test hoặc nơi đã có Popover). */
export function NumDetailBody({ spec, more }: { spec: NumDetailSpec; more?: ReactNode }) {
  const strong = spec.parts.find((p) => p.strong);
  const prev = spec.prev && strong?.value !== null && strong?.value !== undefined && spec.prev.value !== null && spec.prev.value !== undefined ? spec.prev : null;
  const delta = prev && prev.value ? ((strong!.value! - prev.value!) / Math.abs(prev.value!)) * 100 : null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs">
      <div>
        <p className="font-semibold text-ink">{spec.title}</p>
        {spec.scope && <p className="text-[11px] text-ink-3">{spec.scope}</p>}
      </div>
      {!!spec.parts.length && (
        <table className="w-full tabular-nums">
          <tbody>
            {spec.parts.map((p, i) => (
              <tr key={i} className={p.strong ? 'border-t border-line font-semibold' : ''}>
                <td className="py-0.5 pr-3 text-ink-2">{p.strong && spec.op ? '= ' : ''}{p.label}</td>
                <td className={`py-0.5 text-right ${toneClass(p.tone)}`}>{fmtNum(p.value, p.kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!!spec.extra?.length && (
        <table className="w-full tabular-nums">
          <tbody>
            {spec.extra.map((p, i) => (
              <tr key={i} className={`${i ? '' : 'border-t border-line'} ${p.strong ? 'font-semibold' : ''}`}>
                <td className="py-0.5 pr-3 text-ink-3">{p.label}</td>
                <td className={`py-0.5 text-right ${toneClass(p.tone)}`}>{fmtNum(p.value, p.kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {spec.how && <p className="text-[11px] leading-snug text-ink-3">{spec.how}</p>}
      {prev && <p className="text-[11px] text-ink-2">{prev.label ?? 'Kỳ trước cùng mốc'}: <b>{fmtNum(prev.value, prev.kind)}</b>{delta !== null && <span className={delta >= 0 ? 'text-good' : 'text-bad'}> ({delta >= 0 ? '+' : ''}{delta.toFixed(1).replace('.', ',')}%)</span>}</p>}
      {more}
      {spec.hint && <p className="text-[11px] text-ink-3">{spec.hint}</p>}
    </div>
  );
}

/** Bọc một con số: rê chuột (chạm trên điện thoại) mở khung chi tiết. spec null = giữ nguyên, không có khung. */
export function NumDetail({ spec, more, children, className = '' }: { spec: NumDetailSpec | null; more?: () => ReactNode; children: ReactNode; className?: string }) {
  const [opened, setOpened] = useState(false);
  if (!spec) return <>{children}</>;
  return (
    <Popover onOpenChange={(o) => { if (o) setOpened(true); }}>
      <PopoverTrigger openOnHover delay={250} render={<button type="button" aria-label={`Chi tiết: ${spec.title}`} className={`tap cursor-help bg-transparent p-0 text-inherit font-[inherit] decoration-ink-3/60 decoration-dotted underline-offset-4 hover:underline ${className}`} />}>
        {children}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[22rem] max-w-[92vw] p-2.5">
        <NumDetailBody spec={spec} more={opened && more ? more() : undefined} />
      </PopoverContent>
    </Popover>
  );
}
