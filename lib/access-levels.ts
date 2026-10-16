import { OWNER_VIEWS } from './access';
import { DEPT_LAYOUT } from './nav-structure';
import type { Team } from './team';

export const LEVEL_LABELS = { none: 'Không xem', mine: 'Của tôi', team: 'Cả team', dept: 'Cả bộ phận', admin: 'Quản trị bộ phận' } as const;
export type AccessLevel = keyof typeof LEVEL_LABELS;
export const LEVEL_DEPTS = DEPT_LAYOUT.filter(({ key }) => key !== 'cai-dat');
export type DeptKey = 'sale' | 'cskh' | 'mkt' | 'van-don' | 'khach';
export type DeptLevels = Partial<Record<DeptKey, AccessLevel>>;

function deptViews(key: string, level: AccessLevel): string[] {
  return (DEPT_LAYOUT.find((dept) => dept.key === key)?.sections ?? [])
    .filter((section) => level !== 'none' && (level === 'admin' || (level === 'mine' ? section.key === 'today' : section.key !== 'settings')))
    .flatMap((section) => section.tabs.map(([id]) => id))
    .filter((id) => !OWNER_VIEWS.includes(id));
}

export function viewsForLevels(levels: DeptLevels): string[] {
  return [...new Set(LEVEL_DEPTS.flatMap(({ key }) => deptViews(key, levels[key as DeptKey] ?? 'none')))];
}

export function teamForLevels(levels: DeptLevels, currentTeam: Team = 'all'): Team {
  const active = LEVEL_DEPTS.filter(({ key }) => (levels[key as DeptKey] ?? 'none') !== 'none');
  const sc = (['sale', 'cskh'] as const).filter((key) => (levels[key] ?? 'none') !== 'none');
  if (sc.length === 1) return sc[0];
  if (sc.length === 2) return sc.every((key) => ['dept', 'admin'].includes(levels[key]!)) ? 'all' : currentTeam;
  if (active.some(({ key }) => ['dept', 'admin'].includes(levels[key as DeptKey]!))) return 'all';
  return currentTeam;
}

export function levelsFromViews(views: readonly string[], team: Team = 'all'): DeptLevels {
  const granted = new Set(views.filter((id) => !OWNER_VIEWS.includes(id)));
  return Object.fromEntries(LEVEL_DEPTS.map(({ key }) => {
    const candidates: AccessLevel[] = ['admin', team === 'all' ? 'dept' : 'team', 'mine'];
    const level = candidates.find((candidate) => {
      const ids = deptViews(key, candidate);
      if (!ids.length || !ids.every((id) => granted.has(id))) return false;
      // Chỉ đoán quản trị khi có tab Cấu hình thực sự cấp được.
      if (candidate === 'admin' && ids.every((id) => deptViews(key, 'dept').includes(id))) return false;
      return true;
    }) ?? 'none';
    return [key, level];
  }));
}
