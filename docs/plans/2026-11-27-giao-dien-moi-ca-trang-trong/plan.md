# Giao diện mới cho cả các trang bên trong (bản thử)

Ngày 27/11/2026. Anh Vũ 12h38: "giao diện mới tôi thấy nó mới được màn ngoài, còn chi tiết bên trong vẫn như cũ, nên sửa là sửa cả toàn web chứ".

## Hiện trạng (kiểm ở máy đám mây, commit 45a9228 nhánh claude/tong-quan-kieu-moi, số ảo)

- Chỉ Tổng quan mới và Điều hành được dựng lại bố cục. Các trang còn lại (Sale, CSKH, Marketing, Vận đơn, Khách hàng, Sản phẩm, Báo cáo, Giao việc, Cài đặt và mọi tab con) chỉ đổi màu, bo góc, phông chữ qua CSS; khối nào đứng ở đâu vẫn như bản cũ.
- Nội dung bị bó ở khoảng 1300px. Trên màn 1920 và 2K hai bên bỏ trống, trái với việc "vừa màn 2K" anh đã duyệt.
- Lỗi nhỏ: biểu tượng kính lúp đè chữ ô tìm kiếm; nút "Tải lại" rớt xuống hàng hai ở thanh chọn kỳ.
- Nhánh giao diện mới chưa có các thay đổi đã lên web thật hôm nay (bảng nhân viên gộp, popup giữa màn, cột Cần/ngày).

## Sẽ làm

Mỗi trang bên trong dựng lại theo đúng khung của bộ giao diện mẫu anh đã xem ngày 26/11, không chỉ đổi màu:

1. Đầu trang: tên trang, một dòng phạm vi (kỳ, POS, cách tính), chọn kỳ và hàng nút POS trên một dòng.
2. Dải "cần xem" chỉ hiện khi có số vượt mốc (TL chốt Sale dưới 40%, hoàn từ 7%, hủy từ 5%).
3. Một hàng ô số, không ô trống, mỗi ô ghi số gì và tính trong phạm vi nào.
4. Biểu đồ: kỳ này đậm, kỳ trước xám, đỏ khi vượt mốc.
5. Một bảng chính mỗi trang; khối phụ thu gọn, bấm mới mở.
6. Bấm số hoặc dòng mở khung giữa màn "vì sao ra số này", giữ bộ lọc.
7. Giãn theo màn hình: 1366, 1600, 1920, 2560 và điện thoại, không thanh kéo ngang, không bỏ trống hai bên.

Không đổi số, cách tính, tên nghiệp vụ hay quyền xem. Chỉ có hiệu lực khi cờ THP_UI_MOI bật, web thật không đổi.

## Thứ tự

| Đợt | Trang | Tiêu chí xong |
| --- | --- | --- |
| 0 | Gộp nhánh web thật hiện tại vào nhánh giao diện mới; sửa bề rộng, ô tìm kiếm, thanh chọn kỳ | Cả bộ test đạt; ảnh 5 cỡ màn không trống hai bên |
| 1 | Sale (mọi tab), CSKH (mọi tab) | Ảnh từng tab ở 1920 và 2560 theo đủ 7 điểm trên |
| 2 | Marketing, Vận đơn, Tổng quan POS, Sản phẩm | Như trên |
| 3 | Khách hàng, Báo cáo & AI, Giao việc, Cài đặt | Như trên |

Sau mỗi đợt: máy đám mây chạy typecheck, lint, test, build, chụp ảnh; đạt thì bản thử thu-moi được dựng lại và gửi anh ảnh. Lên web thật là việc riêng, chỉ khi anh nhắn rõ.

## Cách kiểm

- `pnpm typecheck`, `pnpm lint` (không thêm lỗi), `pnpm test`, `pnpm build`.
- Chụp mỗi tab ở 1366, 1600, 1920, 2560 và điện thoại; kiểm không tràn ngang, không ô trống.
- So số từng trang với bản cũ trên cùng dữ liệu ảo: phải giống hệt.
