'use client';

// Nhóm đang xem (Tất cả / Sale / CSKH) dùng chung cho mọi trang; nhớ lựa chọn trong trình duyệt.
import { useSyncExternalStore } from 'react';
import type { Team } from '@/lib/team';
export type { Team } from '@/lib/team';
export { TEAM_LABELS } from '@/lib/team';

const KEY = 'thp_team';
let current: Team = 'all';
if (typeof window !== 'undefined') { try { const v = localStorage.getItem(KEY); if (v === 'sale' || v === 'cskh') current = v; } catch { /* bỏ qua */ } }
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function setTeam(team: Team) {
  current = team;
  try { localStorage.setItem(KEY, team); } catch { /* bỏ qua */ }
  for (const l of listeners) l();
}
export function useTeam(): Team {
  return useSyncExternalStore(subscribe, () => current, () => 'all');
}
