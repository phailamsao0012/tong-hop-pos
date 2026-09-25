'use client';

// "Xem riêng một nhân viên" cho mọi trang CSKH (25/09/2026): chọn một lần là Tổng quan CSKH, Cuộc gọi, Tự ups & từ MKT,
// Khách theo nhân viên, Mua lại & Upsell, Khách lâu chưa mua, KPI CSKH đều chỉ còn số của người đó — để chụp màn hình gửi
// riêng cho họ mà không lộ số người khác. Không nhớ qua lần mở web sau.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, EyeOff, UserRound, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Focus = { id: string; name: string } | null;
type StaffItem = { id: string; name: string; department: string | null; active: boolean };
let current: Focus = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function setCskhFocus(f: Focus) { current = f; for (const l of listeners) l(); }
export function useCskhFocus(): Focus { return useSyncExternalStore(subscribe, () => current, () => null); }

let staffCache: Promise<StaffItem[]> | null = null;
const loadStaff = () => (staffCache ??= fetch('/api/employees?team=cskh').then((r) => (r.ok ? r.json() as Promise<StaffItem[]> : [])).catch(() => { staffCache = null; return [] as StaffItem[]; }));

/** Thanh chọn nhân viên đặt đầu mỗi trang CSKH. Đang xem riêng thì hiện dải nhắc rõ ràng. */
export function CskhFocusBar() {
  const focus = useCskhFocus();
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { void loadStaff().then(setStaff); }, []);
  const list = staff.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'vi'));
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${focus ? 'border-primary/40 bg-tint' : 'border-line bg-surface'}`}>
      <UserRound size={15} className="text-ink-3" aria-hidden="true" />
      <span className="font-semibold text-ink-2">Xem riêng nhân viên:</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<button type="button" className={`btn ${focus ? 'primary' : ''}`} />}>
          <span className="max-w-56 truncate">{focus ? focus.name : 'Tất cả nhân viên CSKH'}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <input id="cskh-focus-search" className="field mb-1.5" placeholder="Tìm tên nhân viên…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-80 overflow-y-auto">
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => { setCskhFocus(null); setOpen(false); }}>
              <Check size={14} className={focus ? 'invisible' : ''} />Tất cả nhân viên CSKH
            </button>
            {list.map((s) => (
              <button key={s.id} type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${focus?.id === s.id ? 'bg-tint font-semibold text-primary' : 'text-ink'}`}
                onClick={() => { setCskhFocus({ id: s.id, name: s.name }); setOpen(false); setQ(''); }}>
                <Check size={14} className={focus?.id === s.id ? '' : 'invisible'} /><span className="min-w-0 flex-1 truncate">{s.name}</span>
                {!s.active && <span className="text-[11px] text-ink-4">nghỉ</span>}
              </button>
            ))}
            {!list.length && <p className="px-2 py-3 text-center text-xs text-ink-3">Không có nhân viên phù hợp.</p>}
          </div>
        </PopoverContent>
      </Popover>
      {focus ? (
        <>
          <span className="flex items-center gap-1 text-xs text-primary"><EyeOff size={13} />Số của người khác đang được ẩn trên mọi trang CSKH</span>
          <button type="button" className="btn sm ml-auto" onClick={() => setCskhFocus(null)}><X size={12} />Xem tất cả</button>
        </>
      ) : <span className="text-xs text-ink-3">Chọn một người để chỉ hiện số của họ (tiện chụp màn hình gửi riêng)</span>}
    </div>
  );
}
