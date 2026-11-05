'use client';

// Số người Leader / Mentor đang quản lý, bấm ra danh sách tên (anh Vũ 04/11/2026: "ở các đầu leader mentor đều thêm số người
// mà họ đang quản lý ở phía sau, ấn vào sẽ xem được họ đang quản lý những ai").
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** onlyCount: chỉ hiện nút "N người" (khi tên đã nằm sẵn bên cạnh, vd ô chọn Mentor ở Chia team). */
export function ManagerChip({ label, name, people, onlyCount = false }: { label: string; name: string; people: string[]; onlyCount?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {!onlyCount && <>{label} {name}</>}
      <Popover>
        <PopoverTrigger
          render={<button type="button" onClick={(e) => e.stopPropagation()} disabled={!people.length}
            className="inline-flex items-center gap-0.5 rounded-full bg-tint px-1.5 tap text-[11px] font-semibold text-primary disabled:cursor-default"
            aria-label={`${label} ${name} quản lý ${people.length} người, bấm để xem tên`} />}>
          {people.length} người{people.length > 0 && <ChevronDown size={11} aria-hidden="true" />}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
          <b className="mb-1 block text-[12px] font-semibold text-ink">{label} {name} · {people.length} người</b>
          <ul className="max-h-60 overflow-y-auto text-[12.5px] leading-relaxed text-ink-2">
            {[...people].sort((a, b) => a.localeCompare(b, 'vi')).map((p) => <li key={p}>{p}</li>)}
          </ul>
        </PopoverContent>
      </Popover>
    </span>
  );
}
