'use client';

// Tên nhân viên có màu theo trạng thái (anh Vũ 04/11/2026): thường = đang làm, vàng = tạm nghỉ, đỏ = đã nghỉ. Chủ hệ thống đặt tay ở
// Cài đặt → Team & tài khoản → Trạng thái nhân viên. Tải một lần cho cả web; lưu xong thì mọi chỗ đổi màu ngay.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Search, UserRoundCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { STAFF_STATUSES, type StaffStatus } from '@/lib/teams/staff-status';
import { apiJson } from './api-fetch';
import { TenureBadge } from './tenure-badge';
import { ChartCard, ErrorBox, SegmentedControl, toast } from './ui-kit';

type Map = Record<string, Exclude<StaffStatus, 'working'>>;
let people: Map = {};
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = (next: Map) => { people = next; for (const l of listeners) l(); };
const load = () => (loaded ??= apiJson<{ people: Map }>('/api/staff-status').then((d) => emit(d.people ?? {})).catch(() => { loaded = null; }));
const subscribe = (l: () => void) => { listeners.add(l); void load(); return () => { listeners.delete(l); }; };

export function useStaffStatus(): Map {
  return useSyncExternalStore(subscribe, () => people, () => people);
}
export const STATUS_CLASS: Record<StaffStatus, string> = { working: '', paused: 'text-[var(--st-paused)]', left: 'text-bad' };

/** Tên + nhãn thâm niên; tạm nghỉ tô vàng, đã nghỉ tô đỏ (rê chuột thấy chữ). */
export function StaffName({ id, name, tenure = true }: { id: string | null | undefined; name: string; tenure?: boolean }) {
  const map = useStaffStatus();
  const s: StaffStatus = (id && map[id]) || 'working';
  return (
    <>
      <span className={STATUS_CLASS[s]} title={s === 'working' ? undefined : STAFF_STATUSES[s]}>{name}</span>
      {tenure && <TenureBadge id={id} />}
    </>
  );
}

type Employee = { id: string; name: string; department: string | null };
const OPTIONS = (Object.keys(STAFF_STATUSES) as StaffStatus[]).map((v) => ({ value: v, label: STAFF_STATUSES[v] }));

/** Cài đặt: chủ hệ thống đặt trạng thái từng người, lưu ngay khi bấm. */
export function StaffStatusPanel() {
  const map = useStaffStatus();
  const [list, setList] = useState<Employee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void apiJson<Employee[]>('/api/employees?team=all').then(setList).catch((e: Error) => setError(e.message)); }, []);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (list ?? []).filter((e) => !n || e.name.toLowerCase().includes(n)).sort((a, b) => Number(!map[a.id]) - Number(!map[b.id]) || a.name.localeCompare(b.name, 'vi'));
  }, [list, q, map]);
  const set = async (id: string, s: StaffStatus) => {
    setBusy(id);
    try {
      const d = await apiJson<{ people: Map }>('/api/staff-status', 'PUT', { changes: { [id]: s } });
      emit(d.people);
      toast('Đã lưu trạng thái.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const count = (s: StaffStatus) => Object.values(map).filter((v) => v === s).length;
  return (
    <ChartCard icon={UserRoundCheck} title="Trạng thái nhân viên" subtitle={`${count('paused')} tạm nghỉ · ${count('left')} đã nghỉ · tên vàng là tạm nghỉ, đỏ là đã nghỉ; chỉ đổi màu tên, số giữ nguyên`}>
      {error && <ErrorBox error={error} />}
      <div className="relative mb-3 max-w-xs">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên…" aria-label="Tìm nhân viên" className="pl-8" />
      </div>
      <ul className="max-h-[420px] divide-y divide-line overflow-y-auto pr-1">
        {rows.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 text-sm font-medium"><StaffName id={e.id} name={e.name} /><small className="ml-2 text-ink-3">{e.department ?? ''}</small></span>
            <SegmentedControl size="sm" ariaLabel={`Trạng thái ${e.name}`} options={OPTIONS} value={map[e.id] ?? 'working'} onChange={(v) => { if (busy !== e.id) void set(e.id, v); }} />
          </li>
        ))}
        {list && !rows.length && <li className="py-3 text-sm text-ink-3">Không có ai khớp.</li>}
      </ul>
    </ChartCard>
  );
}
