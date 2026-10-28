'use client';

// Nhóm đang xem (Tất cả / Sale / CSKH) dùng chung cho mọi trang.
// KHÔNG nhớ qua lần mở sau (22/09/2026: mở web hôm sau vẫn còn lọc CSKH từ hôm trước → số không khớp Pancake mà không để ý).
// Thêm 10/10/2026: chọn riêng một team bên web nhân sự (vd "Sale Gentadox HN"). Chọn team thì nhóm tự theo bộ phận của team;
// đổi sang nhóm khác bộ phận thì bỏ chọn team. Cũng không nhớ qua lần mở sau.
import { useSyncExternalStore } from 'react';
import type { HrUnit, Team } from '@/lib/team';
export type { HrUnit, Team } from '@/lib/team';
export { TEAM_LABELS } from '@/lib/team';

type MktTeam = { id: string; name: string };
type State = { team: Team; unit: HrUnit | null; branch: string | null; mktTeam: MktTeam | null };
const initialMkt = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('mktTeam');
let current: State = { team: 'all', unit: null, branch: typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('branch'), mktTeam: initialMkt && initialMkt !== '__all' ? { id: initialMkt, name: 'đã chọn' } : null };
// Giữ một đối tượng ổn định giữa các lần đọc: URL useMemo của các trang đang phụ thuộc unit.
const scopedUnit = (state: State): HrUnit | null => state.branch
  ? state.unit ? { ...state.unit, branch: state.branch } : { id: `branch_${state.branch}`, name: '', dept: state.team === 'cskh' ? 'cskh' : 'sale', branch: state.branch, branchOnly: true }
  : state.unit ?? (state.mktTeam ? { id: 'mkt_lens', name: '', dept: 'sale', branchOnly: true } : null);
let currentUnit = scopedUnit(current);
if (typeof window !== 'undefined') { try { localStorage.removeItem('thp_team'); } catch { /* bỏ qua */ } }
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const emit = (next: State) => { current = next; currentUnit = scopedUnit(next); for (const l of listeners) l(); };
export function setTeam(team: Team) {
  emit({ ...current, team, unit: current.unit && current.unit.dept === team ? current.unit : null });
}
/** Chọn một team (null = bỏ chọn, giữ nguyên nhóm đang xem). */
export function setHrUnit(unit: HrUnit | null) {
  emit(unit ? { ...current, team: unit.dept, unit } : { ...current, unit: null });
}
export function setMktTeam(mktTeam: MktTeam | null) {
  emit({ ...current, mktTeam, unit: null });
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    if (mktTeam) url.searchParams.set('mktTeam', mktTeam.id); else url.searchParams.delete('mktTeam');
    window.history.replaceState(window.history.state, '', url);
  }
}
export function useMktTeam(): MktTeam | null {
  return useSyncExternalStore(subscribe, () => current.mktTeam, () => null);
}
export function setBranch(branch: string | null) {
  emit({ ...current, branch, unit: null });
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    if (branch) url.searchParams.set('branch', branch); else url.searchParams.delete('branch');
    window.history.replaceState(window.history.state, '', url);
  }
}
export function useBranch(): string | null {
  return useSyncExternalStore(subscribe, () => current.branch, () => null);
}
// Trang đang mở thuộc bộ phận nào (Sale / CSKH, null = trang chung). Trang Sale mà thanh trên chọn CSKH (hoặc ngược lại): gắn ?seg=<bộ phận
// đang chọn> vào API, máy chủ chỉ tính người thuộc cả hai bộ phận (lib/team.ts), không ai thì số tự ra 0 (anh Vũ 21/10/2026).
let pageDept: Exclude<Team, 'all'> | null = null;
let seg: Exclude<Team, 'all'> | null = null;
const recalc = (notify = true) => {
  const next = pageDept && current.team !== 'all' && current.team !== pageDept ? current.team : null;
  if (next !== seg) { seg = next; if (notify) for (const l of listeners) l(); }
};
listeners.add(recalc);
/** Gọi ngay khi vẽ khung trang (trước các trang con) nên không báo lại: trang con mới mở đọc đúng cờ từ lần tải đầu. */
export function setPageDept(dept: Exclude<Team, 'all'> | null) {
  if (dept === pageDept) return;
  pageDept = dept; recalc(false);
  // useTeam đổi theo trang: báo sau lượt vẽ cho các khối không vẽ lại (thanh trên cùng) đọc lại.
  queueMicrotask(() => { for (const l of listeners) l(); });
}
export const segLensNow = () => seg;
export function useSegLens(): Exclude<Team, 'all'> | null {
  return useSyncExternalStore(subscribe, () => seg, () => null);
}
/** Thêm ?seg= khi trang bộ phận này đang chọn bộ phận kia. */
export const withSeg = (url: string | null, lens: Exclude<Team, 'all'> | null) => url && lens && !/[?&]seg=/.test(url) ? `${url}${url.includes('?') ? '&' : '?'}seg=${lens}` : url;
/**
 * Nhóm dùng để lọc số. Trang thuộc Sale hoặc CSKH mà thanh trên để "Tất cả" thì chỉ tính người của bộ phận trang đó (anh Vũ 28/10/2026:
 * "đã tích riêng rồi thì đừng lôi chung các nhóm khác vào nữa"). Nút Tất cả / Sale / CSKH đọc lựa chọn gốc bằng useTeamChoice.
 */
export function useTeam(): Team {
  return useSyncExternalStore(subscribe, () => current.team === 'all' && pageDept ? pageDept : current.team, () => 'all');
}
/** Lựa chọn gốc trên thanh trên cùng (Tất cả / Sale / CSKH), không đổi theo trang. */
export function useTeamChoice(): Team {
  return useSyncExternalStore(subscribe, () => current.team, () => 'all');
}
export function useHrUnit(): HrUnit | null {
  return useSyncExternalStore(subscribe, () => currentUnit, () => null);
}
/** Trang của một bộ phận (vd Tổng quan Sale) chỉ áp team thuộc bộ phận đó; trang chung ('all') áp mọi team. */
export function unitFor(unit: HrUnit | null, dept: Team): HrUnit | null {
  return unit && (unit.branchOnly || dept === 'all' || unit.dept === dept) ? unit : null;
}
/** Thêm ?hrTeam= vào URL báo cáo khi có team áp dụng. */
export function withUnit(url: string, unit: HrUnit | null): string {
  let result = unit && !unit.branchOnly ? `${url}${url.includes('?') ? '&' : '?'}hrTeam=${encodeURIComponent(unit.id)}` : url;
  if (current.branch) result += `${result.includes('?') ? '&' : '?'}branch=${encodeURIComponent(current.branch)}`;
  if (current.mktTeam) result += `${result.includes('?') ? '&' : '?'}mktTeam=${encodeURIComponent(current.mktTeam.id)}`;
  return result;
}
