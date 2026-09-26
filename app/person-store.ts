'use client';

// Mở hồ sơ một nhân viên từ bất kỳ đâu: openPerson(id) → dashboard chuyển sang trang hồ sơ (view 'person').
import { useSyncExternalStore } from 'react';

let current: string | null = null;
const listeners = new Set<() => void>();
const openers = new Set<(id: string) => void>();
export function openPerson(id: string) { current = id; for (const l of listeners) l(); for (const o of openers) o(id); }
export function usePersonId() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => null); }
/** Dashboard đăng ký cách chuyển trang khi có người mở hồ sơ. */
export function onOpenPerson(fn: (id: string) => void) { openers.add(fn); return () => { openers.delete(fn); }; }
