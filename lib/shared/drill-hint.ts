// Bấm một số ở Tổng quan POS thì trang đích giữ nhóm đơn đang lọc (AGENTS.md: "Bấm vào một con số thì mở trang tính ra số đó và
// giữ nguyên bộ lọc"; đánh giá 21/10/2026: trước đây mất bộ lọc nhóm sản phẩm). Kỳ và POS đã là bộ lọc chung của cả web;
// nhóm đơn chỉ nằm ở trang Tổng quan POS nên đi kèm qua gợi ý điều hướng (app/nav-focus.ts).
import { isSegment, type ProductSegment } from '@/lib/pancake/order-segments';

export const SEGMENT_HINT = 'overview.segment';

/** Trang đích áp được nhóm đơn: đọc /api/reports/overview, báo cáo này đã có tham số productSegment (cùng cách tính với Tổng quan POS). */
export const SEGMENT_AWARE_VIEWS: ReadonlySet<string> = new Set(['sale-overview', 'cskh-overview']);

/** Gợi ý gửi kèm khi bấm số; null khi đang xem mọi nhóm hoặc giá trị lạ. */
export function segmentDrillHint(segment: string): Record<string, string> | null {
  return isSegment(segment) ? { [SEGMENT_HINT]: segment } : null;
}

/** Đọc gợi ý ở trang đích; thiếu hoặc giá trị lạ thì null (xem mọi nhóm). */
export function segmentFromHint(value: string | undefined): Exclude<ProductSegment, 'all'> | null {
  return value !== undefined && isSegment(value) ? value : null;
}
