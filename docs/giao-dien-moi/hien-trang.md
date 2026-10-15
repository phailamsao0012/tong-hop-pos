# Hiện trạng giao diện web tổng (12/10/2026, đọc từ code bản a8e2361)

Tài liệu nền cho plan giao diện mới. Chỉ đọc code, chưa sửa gì.

## Khung app
- app/page.tsx đọc `?view=` → app/dashboard.tsx (2047 dòng). View là state React, URL không đổi theo view (không pushState).
- shadcn SidebarProvider + Sidebar offcanvas (rộng 16rem, điện thoại thành ngăn kéo). SidebarNav tự viết (dashboard.tsx:643-725): vạch chỉ báo lime, nhóm thu gọn lưu `thp_nav_open`, mỗi nhóm có màu + icon.
- Topbar (dashboard.tsx:1441-1475): nút sidebar, chữ TỔNG HỢP POS (≥1700px), ô tìm khách, TeamSwitch (Tất cả/Sale/CSKH), chọn team HR, bộ lọc trạng thái đơn, cài đặt chỉ số, SyncPill, nút Trình chiếu, ThemeSwitch, ô người dùng.
- main max-w 1440px, px-4/md:px-8. Dải `.dept-tabs` cho trang bộ phận. Chế độ trình chiếu (zoom 1.15, ←/→).
- Thanh dưới điện thoại (md:hidden): Điều hành · Doanh thu · Trong ngày · Khách · Thêm.

## Nhóm menu (dashboard.tsx:419-427)
- Điều hành: center.
- Doanh thu: overview (Tổng quan POS), products.
- Bộ phận: Sale (sale-overview, sale-teams, sale-analytics, sale-quality, compare, shift, sale-kpi*, dispatch*); CSKH (cskh-overview, cskh-teams, cskh-analytics, calls, origin, care, cskh-kpi*); Marketing (marketing, mkt-roas); Vận đơn (van-don, pipeline).
- Khách hàng: customer360, customers, repurchase, dormant.
- Báo cáo & AI: monthly, custom, uncounted.
- Hệ thống: config*, audit*, raw-orders. (* = chỉ chủ hệ thống)
- Ẩn khỏi menu: batches, security.

## Màu, chữ (app/globals.css, Tailwind v4 CSS-first, `.dark` trên html, `thp_theme`)
- Sáng: nền #f0f4ee, thẻ #fff, surface-2 #f5f8f3, viền #e3eae2, chữ #17342b / #4f6559 / #5f7468 / #7f9488, chủ đạo #17684b, tint #e4f5ea, tốt #15804a, xấu #c8403f, cảnh báo #9a6500, sidebar #113c30, lime #d9f36d.
- Tối: nền #101c16, thẻ #182a21, chữ #e6efe7, chủ đạo #8bd5ab, sidebar #0b1611.
- Màu POS 1-6: #2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #4a3aa7. Màu trạng thái đơn st-*.
- Font tự host: Be Vietnam Pro 400-700 (chữ, số `.num`), Bricolage Grotesque (tiêu đề `.display`). Thân 13.5px.
- Bo góc thẻ 16px (điện thoại 12px). Bóng --shadow/--shadow-lift/--shadow-pop.

## Bộ thành phần (app/ui-kit.tsx)
- KpiCard (126 chỗ), ChartCard (160 chỗ, khung chính mọi trang), PageHeader, TableWrap + SortTh (bảng), SegmentedControl, Toolbar, Sparkline/Donut/Funnel tự vẽ SVG, DeltaPill, StatusChip, Skeleton*, ErrorBox, EmptyState, PeriodToolbar (overview-view.tsx:96-135, 19 trang dùng).
- components/ui/* là shadcn base-nova, dùng chủ yếu button, input, select, chart, popover.
- Biểu đồ: recharts 3.8 qua components/ui/chart.tsx (15 file) + SVG tự vẽ (overview-trends.tsx, pos-multiples.tsx).
- Chuyển động: không có thư viện; CSS keyframes + rAF (CountUp kiểu đồng hồ số, vẽ dần biểu đồ, FLIP sắp hàng, `.stagger`, viền AI cầu vồng, spotlight). Tôn trọng prefers-reduced-motion.

## Màn khác
- Đăng nhập: app/auth-form.tsx + `.den-*` (nền xanh đêm, thẻ kính, linh vật, logo intro).
- Con vật chờ tải: app/loading-critter/ (gà, bò, trứng, lợn).
- App iOS/Android mở web qua `?view=`.
