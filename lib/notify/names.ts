// Bảng tên số dùng chung cho Telegram và Zalo (quy chuẩn 31/10/2026, bước 2): tên lấy từ web (lib/metrics.ts METRIC_DEFS,
// nhãn vận đơn theo AGENTS.md), để anh đọc tin xong mở web thấy đúng tên đó. Không tự viết tên số trong file gửi tin.
import { METRIC_DEFS } from '@/lib/reports/metrics';

export const NAMES = {
  orders: METRIC_DEFS.orders.name,              // Đơn lên (không gọi "Đơn tạo mới")
  closed: METRIC_DEFS.closed.name,              // Đơn chốt
  revenue: METRIC_DEFS.revenue.name,            // Doanh thu: ô Tổng cộng Pancake, mọi người lên đơn
  doanhSo: 'Doanh số (MKT+CSKH+SALE)',          // chỉ người có hậu tố MKT/CSKH/SALE (AGENTS.md)
  aov: 'GTTB',
  closeRate: 'Tỷ lệ chốt',
  returnRate: 'Hoàn',
  cancelRate: 'Hủy',
  assigned: 'Số được chia',                     // không gọi "Số đã nhận"
  assignedClosed: 'Đơn chốt từ số được chia',   // không gọi "Số đã chốt"
  shipped: 'Đơn chuyển đi',                     // vận đơn: không gọi bán hàng, chốt, doanh thu
  shippedNet: 'Doanh số chuyển đi',
  delivered: 'Giao thành công',                 // không gọi "Giao TC"
  returned: 'Đơn hoàn',
  cancelled: 'Đơn hủy',
  shipping: 'Đang giao',
  discount: 'Giảm giá/quà',
  quantity: 'SL',
  customers: 'Khách',
  hotReceived: 'Số nhận chốt nóng',
} as const;
export type MetricKey = keyof typeof NAMES;

/** Ghi phạm vi của Doanh thu để không nhầm với Doanh số. */
export const REVENUE_SCOPE = 'Doanh thu theo Pancake, mọi người lên đơn';

/** Tên cũ không được xuất hiện trong file gửi tin nữa (test tests/notify-names.test.ts kiểm). */
export const OLD_NAMES = ['Đơn tạo mới', 'Giao TC', 'Số đã nhận', 'Số đã chốt', 'Vận đơn bán'] as const;
