'use client';

// Bấm tên ở bất kỳ bảng nào → sang trang Hồ sơ nhân sự đúng người đó (anh Vũ 09/11/2026: trang riêng thay khung nổi). Dashboard nghe kho này
// và chuyển trang; chỉ chủ hệ thống bật được (setProfileEnabled), người khác thấy tên thường, bấm không mở.
import { useSyncExternalStore } from 'react';

type Target = { id: string; name: string; at: number } | null;
let current: Target = null;
let enabled = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
export const currentStaffProfile = () => current;
export const subscribeStaffProfile = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function setProfileEnabled(on: boolean) { if (enabled !== on) { enabled = on; emit(); } }
export const useProfileEnabled = () => useSyncExternalStore(subscribeStaffProfile, () => enabled, () => false);

export function openStaffProfile(id: string | null | undefined, name: string) {
  if (!id || !enabled) return;
  current = { id, name, at: Date.now() };
  emit();
}

/** Tên bấm được: mở hồ sơ người đó (chỉ khi được xem trang Hồ sơ). */
export function ProfileLink({ id, name, children, className = '' }: { id: string | null | undefined; name: string; children?: React.ReactNode; className?: string }) {
  const on = useProfileEnabled();
  if (!id || !on) return <span className={className}>{children ?? name}</span>;
  return (
    <button type="button" className={`text-left underline-offset-2 hover:text-primary hover:underline ${className}`} title="Mở hồ sơ nhân sự" onClick={(e) => { e.stopPropagation(); openStaffProfile(id, name); }}>
      {children ?? name}
    </button>
  );
}
