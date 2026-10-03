// Chia số thử nghiệm: phần tính toán thuần (không gọi Pancake / D1) để kiểm thử được.
import type { SourceOrder } from '@/lib/pancake';

export type DispatchMode = 'off' | 'dry' | 'live';
export const parseMode = (v: unknown): DispatchMode => v === 'dry' || v === 'live' ? v : 'off';
export const MODE_LABELS: Record<DispatchMode, string> = { off: 'Tắt', dry: 'Chạy thử', live: 'Chạy thật' };

/** Số đơn tối đa chia cho một POS trong một lượt (mỗi phút), phòng khi có sự cố hàng loạt. */
export const MAX_PER_RUN = 20;

export const sellerOf = (o: SourceOrder) =>
  o.assigning_seller?.id || (o as { assigning_seller_id?: string | null }).assigning_seller_id || null;

const ms = (iso: string | null | undefined) => {
  if (!iso) return NaN;
  // Pancake trả giờ UTC không kèm múi (vd 2026-10-03T02:15:00).
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
};

/**
 * Đơn cần chia: trạng thái Mới, chưa có người bán, tạo sau lúc bật chia số cho POS, và chưa xử lý ở lượt trước.
 * Xếp đơn cũ trước để chia đúng thứ tự khách vào.
 */
export function pickCandidates(orders: SourceOrder[], sinceIso: string, handled: Set<string>) {
  const since = ms(sinceIso);
  return orders
    .filter((o) => o.id !== undefined && o.id !== null && (o.status ?? 0) === 0 && !sellerOf(o)
      && ms(o.inserted_at) >= since && !handled.has(String(o.id)))
    .sort((a, b) => ms(a.inserted_at) - ms(b.inserted_at));
}

export type Staff = { id: string; name: string; lastAssignedAt: string | null };

/**
 * Chia theo vòng: mỗi đơn cho người đang bật lâu nhất chưa nhận (người mới bật nhận ngay đơn kế tiếp, rồi xếp vào vòng).
 * Trả về cặp (đơn, người) và cập nhật lastAssignedAt trong danh sách.
 */
export function roundRobin<T extends { id?: number | string }>(orders: T[], staff: Staff[], now: Date) {
  const queue = [...staff].sort((a, b) => (a.lastAssignedAt ?? '').localeCompare(b.lastAssignedAt ?? '') || a.name.localeCompare(b.name, 'vi'));
  const out: { order: T; staff: Staff }[] = [];
  if (!queue.length) return out;
  orders.forEach((order, i) => {
    const s = queue.shift()!;
    // Mốc tăng dần theo thứ tự đơn trong cùng lượt để vòng giữ đúng thứ tự.
    s.lastAssignedAt = new Date(now.getTime() + i).toISOString();
    out.push({ order, staff: s });
    queue.push(s);
  });
  return out;
}

/** Che SĐT khách trong nhật ký: chỉ giữ 3 số cuối. */
export const customerLabel = (o: SourceOrder) => {
  const phone = (o.bill_phone_number ?? '').replace(/\D/g, '');
  const name = (o.bill_full_name ?? '').trim();
  return [name, phone ? `***${phone.slice(-3)}` : ''].filter(Boolean).join(' · ') || null;
};
