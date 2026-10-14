'use client';

// Nhóm đang xem (Tất cả / Sale / CSKH) dùng chung cho mọi trang.
// KHÔNG nhớ qua lần mở sau (22/09/2026: mở web hôm sau vẫn còn lọc CSKH từ hôm trước → số không khớp Pancake mà không để ý).
// Thêm 10/10/2026: chọn riêng một team bên web nhân sự (vd "Sale Gentadox HN"). Chọn team thì nhóm tự theo bộ phận của team;
// đổi sang nhóm khác bộ phận thì bỏ chọn team. Cũng không nhớ qua lần mở sau.
import { useSyncExternalStore } from 'react';
import type { HrUnit, Team } from '@/lib/team';
export type { HrUnit, Team } from '@/lib/team';
export { TEAM_LABELS } from '@/lib/team';

type State = { team: Team; unit: HrUnit | null };
let current: State = { team: 'all', unit: null };
if (typeof window !== 'undefined') { try { localStorage.removeItem('thp_team'); } catch { /* bỏ qua */ } }
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = (next: State) => { current = next; for (const l of listeners) l(); };
export function setTeam(team: Team) {
  emit({ team, unit: current.unit && current.unit.dept === team ? current.unit : null });
}
/** Chọn một team (null = bỏ chọn, giữ nguyên nhóm đang xem). */
export function setHrUnit(unit: HrUnit | null) {
  emit(unit ? { team: unit.dept, unit } : { team: current.team, unit: null });
}
export function useTeam(): Team {
  return useSyncExternalStore(subscribe, () => current.team, () => 'all');
}
export function useHrUnit(): HrUnit | null {
  return useSyncExternalStore(subscribe, () => current.unit, () => null);
}
/** Trang của một bộ phận (vd Tổng quan Sale) chỉ áp team thuộc bộ phận đó; trang chung ('all') áp mọi team. */
export function unitFor(unit: HrUnit | null, dept: Team): HrUnit | null {
  return unit && (dept === 'all' || unit.dept === dept) ? unit : null;
}
/** Thêm ?hrTeam= vào URL báo cáo khi có team áp dụng. */
export function withUnit(url: string, unit: HrUnit | null): string {
  return unit ? `${url}${url.includes('?') ? '&' : '?'}hrTeam=${encodeURIComponent(unit.id)}` : url;
}
