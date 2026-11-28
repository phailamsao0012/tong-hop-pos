'use client';
// TẠM (mốc 6, 28/11/2026): ba kiểu trình bày hàng chọn POS ở đầu trang kiểu mới (cờ THP_UI_MOI), để anh so ảnh chụp rồi chọn một.
// Anh chọn xong thì giữ đúng một kiểu, xoá công tắc "Kiểu chọn POS" và hai kiểu còn lại (PosChips ở app/overview-view.tsx, CSS khối (D) globals.css).
//   a = hàng nút sáng có icon màu POS (mục chọn nổi trắng); b = thẻ POS có số (mặc định); c = dải icon tròn 46px, tên bên dưới.
// Chỉ PageHeadMoi (trang-moi.tsx, chỉ trang bật cờ mới gọi) đặt PosKieuContext; ngoài đầu trang kiểu mới context là null nên PosChips vẽ y như cũ.
import { createContext, useSyncExternalStore } from 'react';

export type KieuPos = 'a' | 'b' | 'c';
export const PosKieuContext = createContext<KieuPos | null>(null);

/** Số từng POS đã có sẵn trong dữ liệu trang (không gọi API, không tính mới); thẻ kiểu b hiện số + chênh lệch so kỳ trước. */
export type PosNums = { /** Tên số, ví dụ "Doanh thu đơn chốt". */ label: string; format: (n: number) => string; rows: { posId: string; value: number; prev: number | null }[] };

// Lựa chọn nhớ trong localStorage (thp_kieu_chon_pos), bọc try/catch; máy chặn lưu thì nhớ trong bộ nhớ trang.
// useSyncExternalStore với ảnh máy chủ 'b': lần vẽ đầu (máy chủ + hydrate) luôn là 'b', đọc localStorage chỉ sau khi gắn → không lệch hydrate.
const KEY = 'thp_kieu_chon_pos';
let mem: KieuPos | null = null;
const listeners = new Set<() => void>();
const isKieu = (v: unknown): v is KieuPos => v === 'a' || v === 'b' || v === 'c';
function read(): KieuPos {
  try { const v = window.localStorage.getItem(KEY); if (isKieu(v)) return v; } catch { /* trình duyệt chặn lưu: dùng bộ nhớ trang */ }
  return mem ?? 'b';
}
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener('storage', l);
  return () => { listeners.delete(l); window.removeEventListener('storage', l); };
}
export function useKieuPos(): KieuPos {
  return useSyncExternalStore(subscribe, read, () => 'b');
}
function setKieuPos(v: KieuPos) {
  mem = v;
  try { window.localStorage.setItem(KEY, v); } catch { /* bỏ qua: đã nhớ trong bộ nhớ trang */ }
  for (const l of listeners) l();
}

const KIEU: { v: KieuPos; label: string; title: string }[] = [
  { v: 'a', label: 'A', title: 'Hàng nút có icon' },
  { v: 'b', label: 'B', title: 'Thẻ POS có số' },
  { v: 'c', label: 'C', title: 'Dải icon tròn' },
];

/** Công tắc nhỏ "Kiểu chọn POS: A · B · C" (TẠM, chỉ đầu trang kiểu mới). */
export function KieuPosSwitch({ value }: { value: KieuPos }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3" role="group" aria-label="Kiểu chọn POS (thử)">
      Kiểu chọn POS:
      {KIEU.map((k) => (
        <button key={k.v} type="button" aria-pressed={value === k.v} title={k.title} onClick={() => setKieuPos(k.v)}
          className={`tap rounded-md px-1.5 py-0.5 font-semibold transition-colors ${value === k.v ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(14_21_18/.12)]' : 'text-ink-3 hover:text-ink'}`}>
          {k.label}
        </button>
      ))}
    </span>
  );
}
