// Bộ biểu tượng chuẩn theo khái niệm (26/09/2026): mỗi khái niệm một biểu tượng, dùng giống nhau trên web, iPhone, Android.
// Nét trên khung 24×24, chỉ dùng <path> (như lib/pos-icons.ts); dựa trên Lucide, riêng "Đơn chốt" = túi hàng + dấu tích.
// Sửa xong chạy `node scripts/gen-pos-icons.mjs` để sinh lại ảnh cho app.
const circle = (cx: number, cy: number, r: number) => `M${cx + r} ${cy}a${r} ${r} 0 1 1 ${-2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0Z`;
const BAG = 'M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z';

export type MetricIconId = 'orders' | 'closed' | 'revenue' | 'aov' | 'rate' | 'returned' | 'cancelled' | 'shipping' | 'calls' | 'upsell' | 'marketing' | 'kpi' | 'customers' | 'products' | 'staff' | 'time';
export type MetricIcon = { id: MetricIconId; label: string; paths: string[] };
export const METRIC_ICONS: MetricIcon[] = [
  { id: 'orders', label: 'Đơn lên', paths: [BAG, 'M3.103 6.034h17.794', 'M16 10a4 4 0 0 1-8 0'] },
  { id: 'closed', label: 'Đơn chốt', paths: [BAG, 'M3.103 6.034h17.794', 'M8.5 13.5l2.5 2.5 4.5-5'] },
  { id: 'revenue', label: 'Doanh thu', paths: ['M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z', circle(12, 12, 2), 'M6 12h.01M18 12h.01'] },
  { id: 'aov', label: 'Giá trị TB đơn', paths: ['M12 17V7', 'M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8', 'M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z'] },
  { id: 'rate', label: 'Tỷ lệ chốt', paths: [circle(12, 12, 10), circle(12, 12, 6), circle(12, 12, 2)] },
  { id: 'returned', label: 'Hoàn', paths: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11'] },
  { id: 'cancelled', label: 'Hủy', paths: [circle(12, 12, 10), 'M4.929 4.929 19.07 19.071'] },
  { id: 'shipping', label: 'Đang giao', paths: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14', circle(17, 18, 2), circle(7, 18, 2)] },
  { id: 'calls', label: 'Cuộc gọi', paths: ['M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384'] },
  { id: 'upsell', label: 'Mua lại / Upsell', paths: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'] },
  { id: 'marketing', label: 'Marketing', paths: ['M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14', 'M8 6v8'] },
  { id: 'kpi', label: 'Mục tiêu / KPI', paths: ['M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528'] },
  { id: 'customers', label: 'Khách hàng', paths: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M16 3.128a4 4 0 0 1 0 7.744', 'M22 21v-2a4 4 0 0 0-3-3.87', circle(9, 7, 4)] },
  { id: 'products', label: 'Sản phẩm', paths: ['M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z', 'M12 22V12', 'M3.29 7 12 12l8.71-5', 'm7.5 4.27 9 5.15'] },
  { id: 'staff', label: 'Nhân viên', paths: [circle(12, 8, 5), 'M20 21a8 8 0 0 0-16 0'] },
  { id: 'time', label: 'Thời gian', paths: [circle(12, 12, 10), 'M12 6v6l4 2'] },
];
