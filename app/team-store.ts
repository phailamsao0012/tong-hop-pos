'use client';

// Nhóm đang xem (Tất cả / Sale / CSKH) dùng chung cho mọi trang.
// KHÔNG nhớ qua lần mở sau (22/09/2026: mở web hôm sau vẫn còn lọc CSKH từ hôm trước → số không khớp Pancake mà không để ý).
import { useSyncExternalStore } from 'react';
import type { Team } from '@/lib/team';
export type { Team } from '@/lib/team';
export { TEAM_LABELS } from '@/lib/team';

let current: Team = 'all';
if (typeof window !== 'undefined') { try { localStorage.removeItem('thp_team'); } catch { /* bỏ qua */ } }
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function setTeam(team: Team) {
  current = team;
  for (const l of listeners) l();
}
export function useTeam(): Team {
  return useSyncExternalStore(subscribe, () => current, () => 'all');
}
