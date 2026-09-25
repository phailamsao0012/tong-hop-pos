'use client';

// Trạng thái đơn đang xem, dùng chung cho mọi trang báo cáo (yêu cầu 24/09/2026). Mặc định "Đã xác nhận trở đi".
// Giống bộ lọc nhóm: KHÔNG nhớ qua lần mở sau, để mở web ra luôn thấy đúng số như ô Đơn chốt Pancake.
import { useSyncExternalStore } from 'react';
import { DEFAULT_STATUS } from '@/lib/order-status';

let current: string = DEFAULT_STATUS;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function setOrderStatus(value: string) {
  current = value || DEFAULT_STATUS;
  for (const l of listeners) l();
}
export function useOrderStatus(): string {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_STATUS);
}
/** Các API báo cáo nhận ?status= từ bộ lọc chung (trang nào tự gửi status thì giữ nguyên). */
const AWARE = /^\/api\/reports\/(overview|shift|product-groups|cskh-origin)(\?|$)/;
export function withOrderStatus(url: string | null, status: string): string | null {
  if (!url || status === DEFAULT_STATUS || !AWARE.test(url) || /[?&]status=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}status=${encodeURIComponent(status)}`;
}
