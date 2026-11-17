// Ngưỡng màu dùng chung mọi trang (anh Vũ 12/11/2026):
// - tỉ lệ chốt dưới 40% là đỏ ("sale dưới 40% là đỏ nhé, tỉ lệ chốt ấy, bất kì ở đâu cũng đỏ");
// - Sale: tỉ lệ hoàn từ 7% trở lên đỏ, tỉ lệ hủy từ 5% trở lên đỏ ("ở tất cả nhé").
// Giá trị truyền vào là PHẦN TRĂM (0–100). null / không có mẫu số thì không tô.

export const CLOSE_RATE_RED = 40;
export const RETURN_RATE_RED = 7;
export const CANCEL_RATE_RED = 5;

const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Tỉ lệ chốt < 40% → 'text-bad' (đúng 40% không đỏ). */
export const closeRateClass = (pct: number | null | undefined) => ok(pct) && pct < CLOSE_RATE_RED ? 'text-bad' : '';
/** Tỉ lệ hoàn ≥ 7% → 'text-bad'. */
export const returnRateClass = (pct: number | null | undefined) => ok(pct) && pct >= RETURN_RATE_RED ? 'text-bad' : '';
/** Tỉ lệ hủy ≥ 5% → 'text-bad'. */
export const cancelRateClass = (pct: number | null | undefined) => ok(pct) && pct >= CANCEL_RATE_RED ? 'text-bad' : '';

/** a ÷ b × 100, b = 0 → null. */
export const ratePct = (a: number, b: number) => b > 0 ? a / b * 100 : null;
/** Như ratePct nhưng không vượt 100% (tỉ lệ chốt: đơn chốt trong kỳ có thể gồm đơn tạo từ kỳ trước, nên chốt > SĐT về trong kỳ). */
export const ratePctCapped = (a: number, b: number) => b > 0 ? Math.min(100, a / b * 100) : null;
