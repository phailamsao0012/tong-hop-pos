'use client';

// Phạm vi được xem của tài khoản đang đăng nhập (POS, nhóm) dùng chung cho mọi trang; do Dashboard đặt lúc mở.
import { useSyncExternalStore } from 'react';
import { POS } from '@/lib/report-model';
import type { Team } from '@/lib/team';

type Scope = { posIds: string[] | null; team: Team };
let current: Scope = { posIds: null, team: 'all' };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function setScope(scope: Scope) { current = scope; for (const l of listeners) l(); }
export function useScope(): Scope { return useSyncExternalStore(subscribe, () => current, () => current); }
/** Danh sách POS người này được xem (null trong scope = tất cả). */
export const scopedPos = (scope: Scope) => scope.posIds ? POS.filter((p) => scope.posIds!.includes(p.id)) : [...POS];
