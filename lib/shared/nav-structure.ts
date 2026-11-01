export const SECTIONS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'catalog', label: 'Danh mục' },
  { key: 'reports', label: 'Báo cáo' },
  { key: 'settings', label: 'Cấu hình' },
] as const;

export type SectionKey = typeof SECTIONS[number]['key'];
export type DeptSection = { key: SectionKey; tabs: [string, string][] };
export type DeptLayout = { key: string; label: string; sections: DeptSection[] };

// Mỗi bộ phận mở Tổng quan đầu tiên (nhóm Báo cáo đứng trước); Việc của tôi nằm dưới Tổng quan Sale/CSKH. Bỏ Chia số (anh Vũ 21/10/2026 "không cần thiết nữa").
export const DEPT_LAYOUT: DeptLayout[] = [
  { key: 'sale', label: 'Sale', sections: [
    { key: 'reports', tabs: [['sale-overview', 'Tổng quan'], ['sale-teams', 'Theo team'], ['compare', 'Nhân viên'], ['sale-analytics', 'Phân tích'], ['sale-quality', 'Chất lượng khách'], ['returns', 'Lý do hoàn'], ['growth', 'Tăng trưởng']] },
    { key: 'today', tabs: [['shift', 'Trong ngày · chốt nóng']] },
    { key: 'settings', tabs: [['sale-kpi', 'KPI']] },
  ] },
  { key: 'cskh', label: 'CSKH', sections: [
    { key: 'reports', tabs: [['cskh-overview', 'Tổng quan'], ['cskh-teams', 'Theo team'], ['cskh-analytics', 'Phân tích'], ['origin', 'Tự ups & từ MKT'], ['growth', 'Tăng trưởng']] },
    { key: 'today', tabs: [['calls', 'Cuộc gọi'], ['care', 'Khách theo nhân viên']] },
    { key: 'settings', tabs: [['cskh-kpi', 'KPI']] },
  ] },
  { key: 'mkt', label: 'Marketing', sections: [
    { key: 'reports', tabs: [['marketing', 'Tổng quan'], ['mkt-roas', 'Chi phí & ROAS'], ['growth', 'Tăng trưởng']] },
  ] },
  { key: 'van-don', label: 'Vận đơn', sections: [
    { key: 'reports', tabs: [['van-don', 'Tổng quan'], ['returns', 'Lý do hoàn'], ['growth', 'Tăng trưởng']] },
    { key: 'today', tabs: [['pipeline', 'Vận hành đơn']] },
  ] },
  { key: 'khach', label: 'Khách hàng', sections: [
    { key: 'catalog', tabs: [['customer360', 'Khách hàng 360'], ['customers', 'Hồ sơ khách']] },
    { key: 'reports', tabs: [['repurchase', 'Mua lại & Upsell'], ['dormant', 'Khách lâu chưa mua']] },
  ] },
  { key: 'giao-viec', label: 'Giao việc', sections: [{ key: 'reports', tabs: [['giao-viec', 'Tổng quan'], ['giao-viec-chat', 'Chat'], ['giao-viec-hop', 'Họp'], ['giao-viec-zalo', 'Danh bạ Zalo']] }] },
  { key: 'cai-dat', label: 'Cài đặt', sections: [
    { key: 'settings', tabs: [['config', 'Cấu hình'], ['audit', 'Nhật ký'], ['raw-orders', 'Đơn nguồn Pancake'], ['security', 'Bảo mật tài khoản']] },
  ] },
];

export const NEW_VIEWS = ['tasks', 'returns'] as const;

export function deptKeysOf(viewId: string): string[] {
  return DEPT_LAYOUT.filter((dept) => dept.sections.some((section) => section.tabs.some(([id]) => id === viewId)))
    .map((dept) => dept.key);
}

// Trả các nhóm còn tab được xem; bộ phận không có hoặc không được xem trả [].
export function layoutFor(deptKey: string, can: (id: string) => boolean): DeptSection[] {
  return (DEPT_LAYOUT.find((dept) => dept.key === deptKey)?.sections ?? [])
    .map((section) => ({ ...section, tabs: section.tabs.filter(([id]) => can(id)) }))
    .filter((section) => section.tabs.length > 0);
}

// Giữ bộ phận đang mở nếu trang chung thuộc bộ phận đó.
export function firstDeptOf(viewId: string, preferred?: string): DeptLayout | undefined {
  const keys = deptKeysOf(viewId);
  const key = preferred && keys.includes(preferred) ? preferred : keys[0];
  return DEPT_LAYOUT.find((dept) => dept.key === key);
}
