'use client';

// Kho mở khung dùng chung cả web: bảng nào cũng gọi openStaffProfile, khung chỉ gắn một lần (StaffProfileHost).
type Target = { id: string; name: string } | null;
let current: Target = null;
export const currentStaffProfile = () => current;
const listeners = new Set<() => void>();
export function openStaffProfile(id: string | null | undefined, name: string) {
  if (!id) return;
  current = { id, name };
  for (const l of listeners) l();
}
export const closeStaffProfile = () => { current = null; for (const l of listeners) l(); };
export const subscribeStaffProfile = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Tên bấm được: mở hồ sơ người đó. */
export function ProfileLink({ id, name, children, className = '' }: { id: string | null | undefined; name: string; children?: React.ReactNode; className?: string }) {
  if (!id) return <>{children ?? name}</>;
  return (
    <button type="button" className={`text-left underline-offset-2 hover:text-primary hover:underline ${className}`} title="Mở hồ sơ làm việc" onClick={(e) => { e.stopPropagation(); openStaffProfile(id, name); }}>
      {children ?? name}
    </button>
  );
}

