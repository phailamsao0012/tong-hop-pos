STATUS: DONE | FIX-GOP-3 | 2026-10-15 22:39 | Codex

# PROGRESS: checklist tiến độ

> Dòng đầu là trạng thái máy đọc được: `STATUS: <READY|RUNNING|BLOCKED|DONE> | <task id> | <thời gian> | <tài khoản>`.
> Codex cập nhật khi bắt đầu, khi xong mỗi task và trước khi dừng. Chi tiết task ở `PLAN.md`.

## Task sửa lỗi (làm trước, Claude thêm khi nghiệm thu)
- [x] FIX-T3: giữ nghĩa màu chart nhịp tháng (dự báo cùng màu thực tế, mục tiêu trung tính)
- [x] FIX-T4: KPI thứ 7 chiếm đủ 2 cột dưới lg
- [x] FIX-T5: icon chip nhóm menu thấy được ở dark, topbar lề 16px trên điện thoại
- [x] FIX-GOP-1: thanh trên không tràn ngang ở 1280 (demo-gop)
- [x] FIX-GOP-2: thanh trên không tràn ngang ở 1024 (demo-gop)
- [x] FIX-GOP-3: ẩn SyncPill trên topbar dưới 1280 (đã có ở chân thanh bên)

## Task chính
- [x] GOP-DEMO: gỡ 5 khối xung đột trên demo-gop, giữ logic demo và kiểu dáng giao diện mới
- [x] T1: Chạy kiểm nền trên bản hiện tại
- [x] T2: Hoàn tất token + vòng trạng thái ở dark
- [x] T3: Màu chart theo bảng chính thức
- [x] T4: Bố cục bento trang Điều hành
- [x] T5: Khung trang (dashboard.tsx)
- [x] T6: Rà sót cuối + bàn giao nghiệm thu
- [x] NT: Claude nghiệm thu bằng mắt (không phải việc của Codex)

## Kết quả kiểm theo task
_(mỗi task xong ghi 1 dòng: id, commit, typecheck / test / build)_

- T1 (nền e394b73): typecheck exit 0 (Codex). Claude chạy ngoài sandbox: test exit 0 (112/112 pass), build exit 0 ("Build complete"). Lỗi spawn EPERM trước đó là do sandbox Codex, xem PLAN mục 6.

- T2 (nền 38cdfbc): typecheck exit 0 (Codex); Claude chạy ngoài sandbox: test 112/112, build "Build complete". 5 selector dark có luật bù; không box-shadow !important toàn cục.


- T3 (nền d8c7903, chưa commit theo PLAN mục 6): typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1). Build kèm lỗi oxide/lightningcss, chưa có Build complete. Diff: đủ token hai theme, ba series dùng token, lưới dashed, nét 2px; STATUS_COLORS khớp token sáng; không đổi dữ liệu/POS; git diff --check đạt.

- FIX-T3 (nền de30981, chưa commit theo PLAN mục 6): chỉ sửa config MonthPace: actual/forecast dùng --series-1, target dùng --ink-3; typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; test 28 file không khởi chạy; build kèm oxide/lightningcss, chưa có Build complete). git diff --check đạt; không thêm hex, không đổi dữ liệu hoặc phần khác của T3.

- T4 (nền 73a3a2b, chưa commit theo PLAN mục 6): lưới lg 12 cột, cặp 8/4 và 7/5; KPI hàng đầu 3/3/3/3, hàng sau 6/3/3, dưới lg KPI 2 cột và các khối ngoài 1 cột; không đổi nội dung/dữ liệu/nút/quyền. typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss, chưa có Build complete). git diff --check đạt; không có hex mới.

- FIX-T4 (nền f4851d6, chưa commit theo PLAN mục 6): thêm max-lg:col-span-2 khi i === 6 tại app/center-view.tsx:478, giữ nguyên class lg: của T4; typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss và react-dom, chưa có Build complete). git diff --check đạt; không có hex mới.

- T5 (nền e0524fa, chưa commit theo PLAN mục 6): main 1360px, px-4/md:px-6; giữ presenting; 6 nhóm menu dùng token; topbar padding 24px/min-height 56px mọi kích thước; nhãn tab 11px. typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss/react-dom, chưa có Build complete). git diff --check đạt; không có hex mới.

- FIX-T5 (nền 68f6248, chưa commit theo PLAN mục 6): app/globals.css thêm .dark .mod-chip dùng var(--sb), topbar ≤900px min-height 52px/padding 0 16px; giữ light, desktop 24px và gap 6px ở ≤1200px. typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss/react-dom, chưa có Build complete). git diff --check đạt; không có hex mới.

- T6 (rà 3e4e35a..a6441d3, chưa commit): typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss/react-dom). Rà hex phát hiện app/layout.tsx:21–22 thay themeColor bằng hex ngoài vùng cho phép; cần Claude chỉ cách xử lý hoặc xác nhận ngoại lệ metadata. Chưa tích T6; danh mục hex còn lại trong HANDOFF.

- T6 (nền a6441d3, chưa commit theo PLAN mục 6): rà toàn diff 3e4e35a..HEAD và lập danh sách hex còn lại trong HANDOFF; không sửa code. typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss/react-dom, chưa có Build complete). git diff --check đạt. Hai hex metadata layout.tsx:21–22 đã đổi từ trước, nằm ngoài vùng token cho phép, ghi rõ để Claude xét khi nghiệm thu; các hex cứng cũ khác được liệt kê, không mở rộng sửa ngoài T6.
- NT (Claude, d29c5ad): demo local, 1280/390, sáng/tối. Lưới đúng 3/3/3/3, 6/3/3, 8/4, 7/5; 390px không tràn ngang, KPI thứ 7 đủ hàng; topbar 16px/52px trên điện thoại; tương phản: --sb-ink-3 4.52, series ≥ 4.42 (sáng) / ≥ 7.1 (tối); focus bàn phím ở tối có outline lime 2px. Ghi chú nhỏ: chart Recharts không co lại khi thu hẹp cửa sổ tới khi tải lại (chưa xác định có từ trước hay không).

- GOP-DEMO (demo-gop, HEAD acaaedf, đang merge 47d5c9b; chưa stage/commit): hết marker xung đột trong 3 file; typecheck exit 0; git diff --check exit 0; không thêm hex. test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 45 file test không khởi chạy; build kèm oxide/lightningcss/react/react-dom, chưa có Build complete). Chỉ sửa 3 file task và PROGRESS/HANDOFF; không chạy Git ghi.

- FIX-GOP-1 (demo-gop, nền 731e41c, chưa stage/commit theo PLAN mục 6): topbar ≤1440px gap 6px/padding 0 16px, giữ rule ≤900px; form tìm kiếm min-w-0. typecheck exit 0; git diff --check exit 0; không thêm hex. test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 45 file test không khởi chạy; build failed to load vite.config.ts, 8 errors, kèm oxide/react/react-dom, chưa có Build complete). Chờ Claude đo lại demo ở 1024/1280/1440.

- FIX-GOP-2 (demo-gop, nền 93a66f0, chưa stage/commit theo PLAN mục 6): chỉ đổi lg:block thành xl:block ở khối tên/chức danh trong .user (app/dashboard.tsx:1466), giữ title và mọi nút. typecheck exit 0; git diff --check exit 0; không thêm hex. test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 45 file test không khởi chạy, pass 0/fail 45; build failed to load vite.config.ts, 8 errors, kèm oxide/react/react-dom, chưa có Build complete). Chờ Claude đo demo ở 1024/1280/1440/1920.

- FIX-GOP-3 (demo-gop, nền f09d061, chưa stage/commit theo PLAN mục 6): chỉ đổi SyncPill topbar từ hidden md:inline-flex thành hidden xl:inline-flex (app/dashboard.tsx:1458). typecheck exit 0; git diff --check exit 0; không thêm hex. test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 45 file test không khởi chạy, pass 0/fail 45; build failed to load vite.config.ts, 8 errors, kèm oxide/lightningcss/react-dom, chưa có Build complete). Chờ Claude đo demo ở 1024/1280/1440/1920.
