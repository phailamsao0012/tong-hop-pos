# Doanh thu theo ngày tạo đơn, doanh thu đã nhận, CSKH theo POS, Zalo 5 ảnh

Anh Vũ giao 27/11/2026 (8h43–8h46). Bốn phần, lên theo thứ tự A → D.

## Hiện trạng (đọc code 27/11, nhánh claude/vua-man-2k)
- Doanh thu mặc định mọi trang = đơn "Đã chốt trở đi" (từ Chờ xác nhận, trừ hủy và đơn Mới), xếp vào ngày theo `first_closed_at` (ngày chốt lần đầu). Hàm gốc: `closedDate`, `closedWhere` trong `lib/pancake/order-segments.ts`; 39 file trong `lib/` đọc `first_closed_at`, gồm bảng tính sẵn `stats_daily*` (`lib/reports/stats.ts`), bảng gọn Marketing (`lib/reports/mkt-slim*.ts`), KPI (`lib/kpi/*`), Zalo (`lib/zalo/boss-data.ts`, `team-pos-split.ts`), bot (`lib/bot/advisor.ts`).
- Trang Marketing đã có sẵn hai cách xếp: ngày tạo và ngày xác nhận.
- Đơn giao thành công: trạng thái 3, 16 (Đã nhận, Đã thu tiền), có `delivered_at`. Chưa có ô "doanh thu đã nhận" ở MKT, Sale, CSKH.
- Trang CSKH "Khách theo nhân viên" (`app/care-view.tsx`, `lib/reports/purchase-ladder.ts`): bảng "mua lần đầu gì, mua tiếp mấy lần" đang tính cả đơn của khách ở POS khác.
- Zalo sếp: mỗi mốc gửi 2 ảnh (tổng quan, chi tiết và cảnh báo), `lib/zalo/zalo-tick.ts`, `boss-report.ts`.

## A. Doanh thu xếp theo ngày tạo đơn
1. Một chỗ quyết định duy nhất: `revenueDate(alias)` trả `created_at`; `closedDate` gọi nó. Điều kiện đơn tính doanh thu GIỮ như cũ (Đã chốt trở đi) trừ khi anh chọn khác ở thẻ hỏi.
2. Đi hết 39 file: chỗ nào xếp doanh thu, đơn chốt, AOV, TL chốt, hoàn, hủy theo `first_closed_at` thì chuyển sang hàm chung. Giữ nguyên chỗ dùng ngày chốt đúng nghĩa: "Trong ngày, chốt nóng", giờ chốt, lịch sử trạng thái, Vận đơn (ngày chuyển đi).
3. Bảng tính sẵn: tăng epoch của `stats_daily*` và bảng gọn Marketing để tính lại toàn bộ lịch sử theo ngày tạo. Chỉ ghi vào bảng tính sẵn, không sửa đơn gốc.
4. Đổi chữ: nơi ghi "theo ngày chốt" thành "theo ngày tạo đơn"; nút "Cách tính" cập nhật.
5. Test: mỗi hàm báo cáo có ca "đơn tạo ngày 30, chốt ngày 1 tháng sau" rơi vào tháng tạo.
- Tiêu chí xong: tổng doanh thu một kỳ của từng POS khớp ô "Tổng cộng" Pancake khi lọc theo ngày tạo, trên 3 kỳ và 3 POS; tổng theo nhân viên = tổng trang.
- Ảnh hưởng anh cần biết: số các kỳ cũ, KPI "Đã đạt", báo cáo Zalo đều đổi theo cách mới.

## B. Doanh thu đã nhận
- Định nghĩa: giá trị các đơn đang ở Đã nhận hoặc Đã thu tiền, trong cùng nhóm đơn với Doanh thu (cùng kỳ theo ngày tạo, cùng bộ lọc). Nhờ vậy có luôn "% đã nhận".
- Hiện: ô số "DT đã nhận" cạnh ô Doanh thu ở Tổng quan, Marketing, Sale, CSKH; cột "DT đã nhận" trong bảng nhân viên, bảng marketer; bấm ra danh sách đơn, giữ bộ lọc.
- Thêm cột vào bảng tính sẵn (tính lại chung với phần A).
- Tiêu chí xong: DT đã nhận ≤ Doanh thu ở mọi dòng; tổng dòng = ô đầu trang; đối chiếu 1 POS 1 kỳ với Pancake lọc trạng thái Đã nhận.

## C. CSKH "Khách theo nhân viên": chọn POS nào chỉ tính POS đó
- Chọn POS thì ô số, bảng "mua lần đầu gì", danh sách khách chỉ lấy đơn và khách của POS đó. Đơn đầu (T0) là đơn đầu ở chính POS đó; khách có đơn đầu ở POS khác không được cộng vào bậc T1, T2.
- Dòng ghi chú nhỏ dưới bảng: "Ngoài ra có N khách bắt nguồn từ POS khác: POS X n1, POS Y n2".
- Tiêu chí xong: chọn từng POS rồi cộng lại = chọn tất cả (trừ phần ghi chú); test bằng khách ảo mua ở 2 POS.

## D. Zalo báo sếp: 5 ảnh
- Mỗi mốc gửi: Tổng quan, Sale, CSKH, Marketing, Vận đơn (thay 2 ảnh hiện nay). Số lấy từ đúng hàm của từng trang web, không tính riêng. Vận đơn dùng tên "Đơn chuyển đi", "Doanh số chuyển đi".
- Mỗi ảnh có Doanh thu (ngày tạo) và DT đã nhận. Gửi thử vào Zalo của anh trước, đạt mới bật cho sếp.

## Thứ tự và cách lên
- PC viết code từng phần trên nhánh `claude/doanh-thu-ngay-tao`; kiểm ở máy đám mây (typecheck, test, lint, build, chụp ảnh số ảo).
- A và B lên cùng nhau vào cuối ngày, sau giờ làm: sao lưu bảng tính sẵn, lên web, tính lại lịch sử có nghỉ, so tổng với Pancake, sáng hôm sau báo số đo. C và D lên ngay khi kiểm đạt.
- Quay lại: chay-node cũ + bảng tính sẵn từ bản sao lưu, 15 giây cộng thời gian chép bảng.
- Chi phí Cloudflare: 0 (web chạy trên PC). Không ghi số thật, tên người thật vào repo.
