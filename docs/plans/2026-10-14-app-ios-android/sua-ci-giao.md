# Sửa CI iPhone lần 3: đủ bằng chứng cho QA (Hôm nay, kỳ dài khác nhau, Vận đơn) và chữ "(không tính)"

Đọc và theo luật `docs/plans/2026-10-14-app-ios-android/CODEX.md`: vùng cấm, không mạng, không commit, không push.

**Lần này em chạy trên PC Windows, không phải Mac.** Bỏ mục 10 và 13 của CODEX.md: không có Xcode, `xcrun`, `swiftc` hay máy ảo, đừng thử. Vùng cấm của mục 5 áp dụng cho cả `%USERPROFILE%\.codex*`, `C:\tele-bot\**` và mọi file `.env`. Giữ xuống dòng LF như file gốc.

## Bối cảnh
- Demo đã có W1, W2, W5 (PR #77). Lượt `ios-preview` ở 19b246e xanh. QA đã kiểm số, phần số ĐẠT (I3, I4, I4b, I7, I5a).
- Còn ba chỗ QA chưa có bằng chứng và một chỗ chữ. Báo cáo QA nằm ở `/mnt/project-files/qa/2026-10-15-app-ios-0-10/kiem.md` (Codex không đọc được thì theo mô tả dưới đây).

## Làm
1. **Ca Hôm nay (plan 6.2.4 và phần giờ của 6.2.10).**
   - Trong lượt `MEGATECH_XNK` (`ios/Megatech/Megatech/Tabs.swift`, khoảng dòng 866–880), các bước `nav.overviewPath = [.dept(.sale, period: .month, …)]` và `period: .today` không đổi được kỳ.
   - Log `12-xn-kho-app.txt`, các mốc `chart-through-today`, `today`, `chart-today`, `today-mini`: vẫn `so mode=custom … cs=2025-09-30 ce=2025-09-30`, kỳ 01–30/09. Ảnh `12-so-today.png` cũng vậy.
   - Tìm nguyên nhân. Nếu người dùng thật chọn Hôm nay hay Tháng này mà khung So cùng kỳ không đổi kỳ, đó là lỗi app: sửa tận gốc. Nếu chỉ lượt tour sai, sửa lượt tour.
   - Sau khi sửa:
     - mốc `chart-through-today` phải là kỳ nhiều ngày kết thúc hôm nay, không cắt giờ;
     - mốc `today` và `chart-today` phải là kỳ Hôm nay, có cutoff, với dòng `[XNK] so …` ghi rõ kỳ và giờ cắt.
2. **Kỳ dài khác nhau (6.2.10, mốc `chart-unequal`).** Kỳ so hiện là 30/09/2025, không có số (so=0). Đổi sang kỳ so ngắn hơn mà có số: 01–15/08/2026.
3. **Vận đơn theo team (đoạn `13-team` của `.github/workflows/ios-preview.yml`).**
   - App ghi số Vận đơn ở `13-team-app.txt`. Vận đơn tính theo trạng thái hiện tại, nên QA cần số API lấy ngay lúc đó.
   - Ngay sau khi app ghi số Vận đơn, workflow gọi `$BASE/api/reports/van-don` bằng phiên `$TOKEN`, cùng `start`, `end`, `posIds` như app. Gọi hai lần: không có `hrTeam` và có `hrTeam` của team đang chọn.
   - Chỉ ghi tham số và `total.sent` vào `$OUT/13-van-don-api.txt`, không ghi gì khác của JSON.
4. **Chữ (6.1.3).** Bảng giải thích Đã XN kho trên web ghi "(không tính)" sau dòng "Người chốt tự bấm…" và dòng "Không rõ…". Trên app hai dòng đó (`StaffTerms.selfConfirmed`, `StaffTerms.unknownConfirmer`) thêm đúng chữ đó, giống web.
5. **Phạm vi.** Chỉ sửa `ios/Megatech/**/*.swift` và `.github/workflows/ios-preview.yml`. Không thêm file `.swift` mới. Không đổi số, chữ hay hành vi nào khác.
6. **Kiểm.** PC không build được iPhone; CI trên GitHub sẽ build và quay video.
   - Tách từng run block đã đổi của `ios-preview.yml` ra file trong `.codex-out/ci3/` (không commit), chạy `bash -n`. Tất cả phải đạt.
   - Tự đọc lại kỹ diff Swift: hàm, biến, kiểu và optional có thật trong code; ngoặc đủ; không đổi gì ngoài 4 mục trên.
7. **Tóm tắt.** Viết ngắn, mở đầu `# Tóm tắt`, gồm:
   - nguyên nhân mục 1, có `file:dòng`;
   - đã sửa gì;
   - kết quả kiểm.

   Không ghi tên người, SĐT, email hay khóa.
