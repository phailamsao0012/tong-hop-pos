# Tóm tắt

- **Nguyên nhân thấy trong mã:** bootstrap Tự chọn đổi khóa `task(id:)` giữa hai request tại [StaffTable.swift:292](/Users/namdepchai/Projects/thp-app-ios/ios/Megatech/Megatech/StaffTable.swift:292); tour/CI chỉ chờ 40/60 giây. Chưa tái hiện để khẳng định nguyên nhân runtime của lượt CI đó.
- **Đã sửa:** hoàn tất `previous/1 → custom` trong cùng lượt tải; công bố ngày và số cùng nhau. Các ca XNK mở lại chờ sẵn sàng 90 giây. CI đoạn 12–13 chờ mở lại tối đa 120 giây, dừng ngay khi có lỗi và in tối đa 40 dòng đúng tiền tố. Đã rà `timezone`, `remember-*` và TEAM, kể cả mở lại.
- **Kiểm đạt:** 7 bộ macOS, tổng 1.945 ca; 40 ca bổ sung ở mỗi múi giờ VN/New York; 10 ca hàm chờ CI; `bash -n` cả 8 run block; parse nguồn thật và typecheck bản sao bỏ macro Observation ở Debug/Release; `git diff --check`.
- Chỉ đổi 3 file được phép. Không dùng mạng, commit hay push. Chưa chạy UI/CI vì máy thiếu runtime iPhone.