# Sửa CI iPhone lần 2: đoạn 12-xn-kho dừng ở ca reopen-custom

Đọc và theo luật `docs/plans/2026-10-14-app-ios-android/CODEX.md`: vùng cấm, không mạng, không commit, không push.

## Kết quả CI ở 018a462
- `build`: xanh.
- `preview`: đạt `FORMAT_TEST OK 1075 cases` và `DECODE_TEST OK 409 cases`. Lượt `xnkho` chạy hết mọi mốc tới `today-mini`, có đủ ảnh.
- Lỗi: `##[error]Thiếu mốc XNK: reopen-custom`. Sau `launch_xnk_case reopen-custom Asia/Ho_Chi_Minh` (đoạn 12 của `.github/workflows/ios-preview.yml`), quá 60 giây không thấy dòng `[XNK] moc=reopen-custom`.
- Cảnh báo, không phải lỗi: demo chưa trả W5 (`chart`, `staff[].chart`).
- Chưa chạy tới: các ca `timezone`, `remember-set`, `remember-reopen` và cả đoạn `13-team`.

## Manh mối
- Nhánh `MEGATECH_XNK_CASE` trong `warehouse(nav:)` (`ios/Megatech/Megatech/Tabs.swift`) gọi `playCompare`.
- `playCompare` chờ `CompareTourStatus.ready` tối đa 40 giây sau `cuon:bang-nhan-vien` và `xnk-cmp-log`. Chưa sẵn sàng thì in `[XNK] moc=loi-tai-so` rồi `return`, nên mốc của ca không bao giờ in ra.
- Ca `reopen-custom` mở lại app khi kiểu so Tự chọn đã lưu. Ngày Tự chọn phải lấy lại từ API khi mở lại (6.2.6). Nghi app không về trạng thái sẵn sàng ở đường này, hoặc tổng thời gian (Face ID, tải mạng, hai lần chờ) vượt 60 giây của CI.

## Làm
1. Tìm đúng nguyên nhân trong code. Nếu app không sẵn sàng khi mở lại với kiểu Tự chọn đã lưu thì sửa tận gốc trong app. Không đổi số, chữ hay hành vi khác.
2. Sửa `.github/workflows/ios-preview.yml` (ngoại lệ có tên, chỉ đoạn 12 và 13):
   - `wait_xnk` dừng ngay khi gặp `[XNK] moc=loi-tai-so` và báo lỗi rõ.
   - Khi thiếu mốc, in 40 dòng `[XNK]` hoặc `[TEAM]` cuối của file log app (chỉ dòng có tiền tố đó, toàn số demo, không tên), để lần sau biết vướng ở đâu.
   - Các lần mở lại app (`launch_xnk_case`, ca `TEAM_CASE=reopen`) chờ mốc tối đa 120 giây.
3. Rà các ca `timezone`, `remember-set`, `remember-reopen` và đoạn `13-team` (cả lần mở lại) xem có cùng kiểu vướng không. Có thì sửa luôn.
4. Chỉ sửa `ios/Megatech/**/*.swift` và `.github/workflows/ios-preview.yml`. Không thêm file `.swift` mới.
5. Chạy lại các kiểm macOS đã có trong `.codex-out/` và `bash -n` cho các run block đã đổi. Tất cả phải đạt.
6. Viết tóm tắt ngắn, mở đầu `# Tóm tắt`, gồm:
   - nguyên nhân, có `file:dòng`;
   - đã sửa gì;
   - kết quả kiểm.
   Không ghi tên người, SĐT, email hay khóa.
