STATUS: READY | T6 | 2026-10-15 17:21 | Codex

# PROGRESS: checklist tiến độ

> Dòng đầu là trạng thái máy đọc được: `STATUS: <READY|RUNNING|BLOCKED|DONE> | <task id> | <thời gian> | <tài khoản>`.
> Codex cập nhật khi bắt đầu, khi xong mỗi task và trước khi dừng. Chi tiết task ở `PLAN.md`.

## Task sửa lỗi (làm trước, Claude thêm khi nghiệm thu)
- [x] FIX-T3: giữ nghĩa màu chart nhịp tháng (dự báo cùng màu thực tế, mục tiêu trung tính)
- [x] FIX-T4: KPI thứ 7 chiếm đủ 2 cột dưới lg

## Task chính
- [x] T1: Chạy kiểm nền trên bản hiện tại
- [x] T2: Hoàn tất token + vòng trạng thái ở dark
- [x] T3: Màu chart theo bảng chính thức
- [x] T4: Bố cục bento trang Điều hành
- [x] T5: Khung trang (dashboard.tsx)
- [ ] T6: Rà sót cuối + bàn giao nghiệm thu
- [ ] NT: Claude nghiệm thu bằng mắt (không phải việc của Codex)

## Kết quả kiểm theo task
_(mỗi task xong ghi 1 dòng: id, commit, typecheck / test / build)_

- T1 (nền e394b73): typecheck exit 0 (Codex). Claude chạy ngoài sandbox: test exit 0 (112/112 pass), build exit 0 ("Build complete"). Lỗi spawn EPERM trước đó là do sandbox Codex, xem PLAN mục 6.

- T2 (nền 38cdfbc): typecheck exit 0 (Codex); Claude chạy ngoài sandbox: test 112/112, build "Build complete". 5 selector dark có luật bù; không box-shadow !important toàn cục.


- T3 (nền d8c7903, chưa commit theo PLAN mục 6): typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1). Build kèm lỗi oxide/lightningcss, chưa có Build complete. Diff: đủ token hai theme, ba series dùng token, lưới dashed, nét 2px; STATUS_COLORS khớp token sáng; không đổi dữ liệu/POS; git diff --check đạt.

- FIX-T3 (nền de30981, chưa commit theo PLAN mục 6): chỉ sửa config MonthPace: actual/forecast dùng --series-1, target dùng --ink-3; typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; test 28 file không khởi chạy; build kèm oxide/lightningcss, chưa có Build complete). git diff --check đạt; không thêm hex, không đổi dữ liệu hoặc phần khác của T3.

- T4 (nền 73a3a2b, chưa commit theo PLAN mục 6): lưới lg 12 cột, cặp 8/4 và 7/5; KPI hàng đầu 3/3/3/3, hàng sau 6/3/3, dưới lg KPI 2 cột và các khối ngoài 1 cột; không đổi nội dung/dữ liệu/nút/quyền. typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss, chưa có Build complete). git diff --check đạt; không có hex mới.

- FIX-T4 (nền f4851d6, chưa commit theo PLAN mục 6): thêm max-lg:col-span-2 khi i === 6 tại app/center-view.tsx:478, giữ nguyên class lg: của T4; typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss và react-dom, chưa có Build complete). git diff --check đạt; không có hex mới.

- T5 (nền e0524fa, chưa commit theo PLAN mục 6): main 1360px, px-4/md:px-6; giữ presenting; 6 nhóm menu dùng token; topbar padding 24px/min-height 56px mọi kích thước; nhãn tab 11px. typecheck exit 0; test/build: spawn EPERM, chờ Claude chạy (cả hai exit 1; 28 file test không khởi chạy; build kèm oxide/lightningcss/react-dom, chưa có Build complete). git diff --check đạt; không có hex mới.
