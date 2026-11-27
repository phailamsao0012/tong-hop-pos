# Áp bộ thiết kế cho cả web (anh duyệt 28/11/2026 0h11)

Mẫu chuẩn: `bo-thiet-ke.html` cùng thư mục (mở bằng trình duyệt, số ảo). Nền sáng, ưu tiên màn máy tính 1366–2560. Điện thoại và nền tối làm sau, nhưng không được vỡ.

Chỉ áp khi cờ `THP_UI_MOI` bật. Cờ tắt thì web không đổi một điểm ảnh. Không đổi số, cách tính, tên nghiệp vụ, quyền xem.

## Việc (làm ở linh kiện chung, không sửa từng trang)

1. **Token**: đúng 9 màu và 5 cỡ chữ trong mẫu (nền #f4f5f4, thẻ trắng viền #e5e9e6 bo 14px, chữ #0e1512, nhấn #17684b, vàng #a96600, đỏ #c8402d, xanh nhạt #e6f2ec, xám kỳ trước #cfd6d2, chữ phụ #75807b). Bỏ mọi màu khác ở ô số và icon.
2. **Ô số (KpiCard khi cờ bật)**: nhãn trái + icon đặc nhỏ một màu ở góc phải (bỏ ô vuông màu), số to 27px, nhãn tăng giảm dạng viên + ghi chú, sparkline đen bên phải nếu có dữ liệu chuỗi. Nền trắng. Chỉ đổi viền/nền vàng khi sắp chạm mốc, đỏ khi vượt mốc.
3. **Chọn POS, chọn kỳ**: hàng nút kiểu segmented, nền xám nhạt, mục đang chọn nổi trắng có bóng nhẹ. Không còn nút đen.
4. **Nút**: chính đen, phụ viền, chỉ chữ màu nhấn, xoá đỏ.
5. **Nhãn trạng thái**: Đạt xanh, Sắp chạm vàng, Vượt mốc đỏ, Xong xám. Dùng thay mọi kiểu tô màu chữ rời rạc ở cột hủy/hoàn.
6. **Tab trong trang**: gạch chân đen, có số đếm.
7. **Cần xử lý (CanXemStrip)**: thành các thẻ có icon, một câu chuyện gì, một câu vì sao, một nút nhỏ đi thẳng tới chỗ sửa. Tối đa 3 thẻ + "+N mục khác".
8. **Biểu đồ**: kỳ trước xám, kỳ này đen, mốc/giờ đang chạy màu nhấn, vượt mốc đỏ.
9. **Bảng**: tiêu đề cột chữ phụ 12px, dòng kẻ mảnh, avatar chữ cái, thanh tỷ lệ đen (đỏ khi dưới mốc), dòng đang chọn nền xanh nhạt.
10. **Khung giữa màn "Vì sao ra số"**, **toast tối có Hoàn tác**, **dải vàng dữ liệu trễ**, **lúc trống**, **skeleton** theo mẫu.
11. **Icon**: một bộ đặc, một màu (currentColor). Không dùng icon nhiều màu.

## Tiêu chí xong
- Chụp 38 trang ở 1366, 1920, 2560: không thanh kéo ngang, không ô trống, 6 ô số một hàng từ 1366.
- Cờ tắt: so điểm ảnh với bản trước, không khác.
- Cloud: typecheck 0, lint không thêm lỗi, test đạt, build đạt.
