'use client';

import type { ReactNode } from 'react';
import { useLazySeen } from './use-api';
import { Skeleton } from './ui-kit';

/**
 * Khối báo cáo ở dưới màn hình: chỉ dựng (và gọi API) khi sắp lộ ra, cách mép 300px.
 * Đã lộ một lần thì giữ luôn; trình duyệt không có IntersectionObserver thì dựng ngay.
 */
export function LazyBlock({ children, className = 'h-44', id }: { children: ReactNode; className?: string; id?: string }) {
  const [ref, seen] = useLazySeen();
  if (seen) return <>{children}</>;
  return <div ref={ref} id={id} aria-busy="true"><Skeleton className={`w-full ${className}`} /></div>;
}
