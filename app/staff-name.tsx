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

const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const SUFFIX = /\s+(sale|cskh|mkt)$/;
/**
 * Tô màu tên ở MỌI chỗ trên web (anh Vũ 04/11/2026: "ở bất kì đâu cũng phải hiện, không phải chỉ ở mục tài khoản"):
 * chữ nào đúng bằng tên một nhân viên tạm nghỉ / đã nghỉ thì gắn data-st lên thẻ bọc nó (CSS tô vàng / đỏ). Chỉ gắn thuộc tính,
 * không đổi cây React; tên vẽ trong biểu đồ canvas thì không tô được. Khớp cả tên bỏ hậu tố SALE / CSKH / MKT nếu không trùng ai.
 */
export function StatusPainter() {
  const map = useStaffStatus();
  const [emps, setEmps] = useState<Employee[] | null>(null);
  const any = Object.keys(map).length > 0;
  useEffect(() => { if (any && !emps) void apiJson<Employee[]>('/api/employees?team=all').then(setEmps).catch(() => undefined); }, [any, emps]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const byName = new Map<string, Exclude<StaffStatus, 'working'>>();
    const bare = new Map<string, Exclude<StaffStatus, 'working'> | null>();
    for (const e of emps ?? []) {
      const s = map[e.id], k = norm(e.name), b = k.replace(SUFFIX, '');
      if (s) byName.set(k, s);
      if (b !== k) bare.set(b, bare.has(b) && bare.get(b) !== (s ?? null) ? null : (s ?? null));
    }
    for (const [b, s] of bare) if (s && !byName.has(b)) byName.set(b, s);
    const ownText = (el: Element) => { let t = ''; for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent ?? ''; return norm(t); };
    const paint = () => {
      for (const el of document.querySelectorAll('[data-st]')) { const s = byName.get(ownText(el)); if (s) { if (el.getAttribute('data-st') !== s) el.setAttribute('data-st', s); } else { el.removeAttribute('data-st'); if (Object.values(STAFF_STATUSES).includes(el.getAttribute('title') as never)) el.removeAttribute('title'); } }
      if (!byName.size) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const raw = n.textContent ?? '';
        if (raw.length < 3 || raw.length > 80) continue;
        const el = n.parentElement;
        if (!el || el.closest('script,style,textarea,[contenteditable]')) continue;
        const s = byName.get(ownText(el));
        if (s && el.getAttribute('data-st') !== s) { el.setAttribute('data-st', s); if (!el.getAttribute('title')) el.setAttribute('title', STAFF_STATUSES[s]); }
      }
    };
    paint();
    let t = 0;
    const ob = new MutationObserver(() => { clearTimeout(t); t = window.setTimeout(paint, 200); });
    ob.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { ob.disconnect(); clearTimeout(t); };
  }, [emps, map]);
  return null;
}
