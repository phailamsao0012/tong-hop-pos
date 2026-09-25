'use client';

// Chọn một hoặc nhiều nhân viên (có ô tìm tên). Không chọn ai = xem tất cả.
import { useState } from 'react';
import { Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function StaffPicker({ staff, value, onChange, idKey = 'sellerId' }: {
  staff: { name: string; department?: string | null; [k: string]: unknown }[]; value: string[]; onChange: (v: string[]) => void; idKey?: string;
}) {
  const [q, setQ] = useState('');
  const idOf = (s: (typeof staff)[number]) => String(s[idKey] ?? '');
  const list = staff.filter((s) => idOf(s) && s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const label = !value.length ? 'Tất cả nhân viên' : value.length === 1 ? staff.find((s) => idOf(s) === value[0])?.name ?? '1 nhân viên' : `${value.length} nhân viên`;
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={`btn ${value.length ? 'is-warn' : ''}`} title="Chọn nhân viên" />}>
        <Users size={14} aria-hidden="true" /><span className="max-w-40 truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <input id="staff-picker-search" className="field mb-1.5" placeholder="Tìm tên nhân viên…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex items-center justify-between px-1 pb-1 text-xs">
          <button type="button" className="link" onClick={() => onChange(list.map(idOf))}>Chọn {q ? 'kết quả' : 'tất cả'}</button>
          <button type="button" className="link text-ink-3" onClick={() => onChange([])}>Bỏ chọn (xem tất cả)</button>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {list.map((s) => {
            const id = idOf(s), on = value.includes(id);
            return (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                <input type="checkbox" className="accent-[var(--primary)]" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== id) : [...value, id])} />
                <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
                {s.department && <span className="truncate text-[11px] text-ink-3">{s.department}</span>}
              </label>
            );
          })}
          {!list.length && <p className="px-2 py-3 text-center text-xs text-ink-3">Không có nhân viên phù hợp.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
