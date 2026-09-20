'use client';

// Toast góc dưới phải (điện thoại: trải ngang phía trên thanh tab). toast('Đã cập nhật số liệu từ 6 POS') từ bất kỳ đâu; <Toaster /> gắn một lần ở gốc.
import { useSyncExternalStore } from 'react';
import { AlertCircle, Check, Info, X } from 'lucide-react';

export type ToastKind = 'ok' | 'error' | 'info';
type ToastItem = { id: number; text: string; kind: ToastKind; time: string; in: boolean };
let items: ToastItem[] = [];
const EMPTY: ToastItem[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const timers = new Map<number, number>();

/** Hiện toast; tự ẩn sau 3,2 s (lỗi: 6 s). Trả về id để dismissToast(id) sớm hơn. */
export function toast(text: string, opts: { kind?: ToastKind; duration?: number } = {}) {
  const id = ++seq;
  const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  items = [...items, { id, text, kind: opts.kind ?? 'ok', time, in: false }];
  emit();
  // Gắn rồi 2 khung hình sau mới thêm .in để transition chạy.
  requestAnimationFrame(() => requestAnimationFrame(() => { items = items.map((t) => t.id === id ? { ...t, in: true } : t); emit(); }));
  timers.set(id, window.setTimeout(() => dismissToast(id), opts.duration ?? (opts.kind === 'error' ? 6000 : 3200)));
  return id;
}
export function dismissToast(id: number) {
  const t = timers.get(id); if (t) { clearTimeout(t); timers.delete(id); }
  if (!items.some((x) => x.id === id)) return;
  items = items.map((x) => x.id === id ? { ...x, in: false } : x);
  emit();
  window.setTimeout(() => { items = items.filter((x) => x.id !== id); emit(); }, 320);
}
export function useToast() {
  return { toast, dismiss: dismissToast };
}

const ICONS: Record<ToastKind, typeof Check> = { ok: Check, error: AlertCircle, info: Info };
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  // Vùng aria-live phải tồn tại sẵn (rỗng) thì trình đọc màn hình mới đọc toast mới.
  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`toast ${t.in ? 'in' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className={`ok ${t.kind}`}><Icon size={12} /></span>
            <span className="min-w-0">{t.text}</span>
            <span className="t">{t.time}</span>
            <button type="button" className="x" aria-label="Đóng" onClick={() => dismissToast(t.id)}><X size={12} /></button>
          </div>
        );
      })}
    </div>
  );
}
