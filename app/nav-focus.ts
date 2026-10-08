'use client';

// Bấm một số ở Tổng quan POS thì sang trang đã có (anh Vũ 08/10/2026: "ấn vào nó phải đẩy đến trang thông tin"), rồi cuộn tới đúng
// khối tính ra số đó và nháy viền. Trang đích chỉ cần gắn id cho khối (KpiCard / ChartCard có prop id). Kỳ và POS là bộ lọc chung nên giữ nguyên.
import { motionOK } from './ui/motion';

let hints: Record<string, string> = {};
/** Gợi ý một lần cho trang đích (ví dụ cách xem mặc định), đọc xong là xoá. */
export function takeNavHint(key: string): string | undefined { const v = hints[key]; delete hints[key]; return v; }

/** Chờ phần tử #id có mặt và tải xong (trang mới mở còn đang lấy số), cuộn tới giữa màn hình và nháy viền 2 giây. */
export function focusAfterNav(id: string, hint?: Record<string, string>) {
  if (hint) hints = { ...hints, ...hint };
  const started = Date.now();
  const tick = () => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('is-loading')) {
      el.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'center' });
      el.classList.add('nav-flash');
      window.setTimeout(() => el.classList.remove('nav-flash'), 2400);
      return;
    }
    if (Date.now() - started < 15000) window.setTimeout(tick, 200);
  };
  window.setTimeout(tick, 250);
}
