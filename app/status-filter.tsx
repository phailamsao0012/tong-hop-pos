'use client';

// Nút chọn trạng thái đơn: các mốc hay dùng + tích từng trạng thái Pancake (yêu cầu 24/09/2026).
// StatusFilter = điều khiển theo props (trang tự giữ giá trị); GlobalStatusFilter = gắn với bộ lọc chung mọi trang.
import { Check, ListFilter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_STATUS, STATUS_NAMES, STATUS_ORDER, STATUS_PRESETS, describeStatus, parseStatus, type StatusPreset } from '@/lib/order-status';
import { setOrderStatus, useOrderStatus } from './status-store';

export function StatusFilter({ value, onChange, defaultValue = DEFAULT_STATUS, size = 'md', className = '', presets }: {
  value: string; onChange: (v: string) => void; defaultValue?: string; size?: 'sm' | 'md'; className?: string;
  presets?: StatusPreset[];
}) {
  const current = parseStatus(value, defaultValue as StatusPreset);
  const changed = current.value !== defaultValue;
  const toggle = (code: number) => {
    const next = current.codes.includes(code) ? current.codes.filter((c) => c !== code) : [...current.codes, code];
    if (next.length) onChange(describeStatus(next).value);
  };
  const list = presets ?? (Object.keys(STATUS_PRESETS) as StatusPreset[]);
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={`btn ${size === 'sm' ? 'sm' : ''} ${changed ? 'is-warn' : ''} ${className}`} title="Chọn trạng thái đơn được tính" />}>
        <ListFilter size={14} aria-hidden="true" />
        <span className="max-w-44 truncate">Trạng thái: {current.label}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-2">
        <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Mốc hay dùng</p>
        <div className="grid gap-0.5">
          {list.map((k) => {
            const on = current.value === k;
            return (
              <button key={k} type="button" onClick={() => onChange(k)}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${on ? 'bg-tint font-semibold text-primary' : 'text-ink'}`}>
                <Check size={14} className={`mt-0.5 shrink-0 ${on ? '' : 'invisible'}`} aria-hidden="true" />
                <span>{STATUS_PRESETS[k].label}{k === defaultValue ? ' · mặc định' : ''}{STATUS_PRESETS[k].hint && <span className="block text-[11px] font-normal text-ink-3">{STATUS_PRESETS[k].hint}</span>}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 border-t px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Hoặc tích từng trạng thái</p>
        <div className="grid grid-cols-2 gap-0.5">
          {STATUS_ORDER.map((code) => (
            <label key={code} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-2">
              <input type="checkbox" className="accent-[var(--primary)]" checked={current.codes.includes(code)} onChange={() => toggle(code)} />
              {STATUS_NAMES[code]}
            </label>
          ))}
        </div>
        {changed && <button type="button" className="mt-1 w-full rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-surface-2" onClick={() => onChange(defaultValue)}>Về mặc định</button>}
      </PopoverContent>
    </Popover>
  );
}

/** Bộ lọc trạng thái chung: đổi ở đây là mọi trang báo cáo tính lại theo trạng thái đã chọn. */
export function GlobalStatusFilter({ size = 'sm', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  const value = useOrderStatus();
  return <StatusFilter value={value} onChange={setOrderStatus} size={size} className={className} />;
}
