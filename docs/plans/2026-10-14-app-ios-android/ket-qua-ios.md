# Kết quả chạy liền một mạch: App iOS 14/10

Codex làm từng bước theo plan mục 5.6, máy kiểm sau mỗi bước. Tổ app kiểm một lần cho cả phần sau khi đọc file này, diff và CI.

## Tiến độ
```
14/10 09:39Z Bắt đầu phần ios ở ~/Projects/thp-app-ios, nhánh máy codex/app-1410-ios, gốc b132b1c, tài khoản đầu codex.
14/10 09:39Z I1: bắt đầu (Chữ và định dạng số (chưa đổi giao diện)).
14/10 09:47Z DỪNG ở i1: Codex chạy lệnh đụng thư mục khóa / bí mật (xem lệnh trong ~/codex-viec/app-1410/app-1410-i1-lan0-codex.jsonl). Không đẩy gì.
```

---

## Tóm tắt app-1410-i1
### File đã đổi
- `ios/Megatech/WidgetShared/Format.swift`: thêm `changePct`, `changeTone`, `changePoints`, `cmpShort`, `weekdayShort`, `cmpSpan`; giữ nguyên mọi hàm cũ.
- `ios/Megatech/Megatech/FormatSelfTest.swift`: thêm và gọi `compare()`, bổ sung 124 ca chuỗi viết sẵn.
- `ios/Megatech/Megatech/Terms.swift` (mới): kiểu so, mức lùi, kiểu biểu đồ, chỉ số và đủ nhãn theo mục 4.4.4, kèm chú thích nguồn web. Chưa đổi giao diện.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)

- `xcodebuild -project ios/Megatech/Megatech.xcodeproj -target Megatech -sdk iphonesimulator SYMROOT="$PWD/.codex-dd" CODE_SIGNING_ALLOWED=NO build`: mã 65; sandbox chặn ghi DerivedData.
- Build lại với `OBJROOT`, `SHARED_PRECOMPS_DIR`, `CLANG_MODULE_CACHE_PATH` nằm trong `.codex-dd`: mã 65; bị chặn cache module.
- Build ngoài sandbox, thêm `MODULE_CACHE_DIR` trong `.codex-dd`: mã 65; `actool` báo `No available simulator runtimes for platform iphonesimulator`. Thử thêm `-configuration Debug`: mã 65, cùng lỗi runtime. Chi tiết: `build-before.log`, `build.log`, `build-access.log`, `build-debug.log` trong thư mục kết quả.
- `xcrun swiftc -D DEBUG -module-cache-path "$PWD/.codex-dd/swift-cache" …`: biên dịch bộ kiểm thử trước và sau sửa trên macOS, mỗi lệnh mã 0. Lệnh đầy đủ trong `.codex-out/app-1410-i1/lenh-kiem-tra.md`.
- `.codex-out/app-1410-i1/format-before`: mã 0, `FORMAT_TEST OK 912 cases`.
- `.codex-out/app-1410-i1/format-after`: mã 0, `FORMAT_TEST OK 1036 cases` (tăng 124).
- `TZ=America/Los_Angeles .codex-out/app-1410-i1/format-after`: mã 0, `FORMAT_TEST OK 1036 cases`.
- `xcrun swiftc -typecheck -target arm64-apple-ios17.0-simulator -sdk … -module-cache-path …`: kiểm tra các file I1 cho iOS, Debug và Release đều mã 0; Debug kiểm cả `FormatSelfTest`.
- `xcrun simctl list devices available` và `xcrun simctl list runtimes` ngoài sandbox: mỗi lệnh mã 0; không có thiết bị khả dụng, danh sách runtime trống. Chưa chạy được app hoặc `MEGATECH_FORMAT_TEST=1` trên Simulator.
- Kiểm tra bằng Python: mã 0; đúng phạm vi ba file, hàm và ca cũ giữ nguyên từng ký tự, dòng mới không khớp mẫu dữ liệu nhạy cảm. `git diff --check`: mã 0.

### Ảnh / video (đường dẫn trong .codex-out/app-1410-i1/, mỗi file một dòng nói thấy gì)

Không có ảnh/video: máy chưa có runtime iOS khả dụng nên không thể mở app, chụp hay quay. Chưa xác minh giao diện bằng máy ảo; không tạo ảnh/video thay thế.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)

Không áp dụng: I1 chưa thêm bảng hoặc log `[XNK]` / `[TEAM]`.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả

I1 không có ca riêng ở mục 6. Kiểm thử chuỗi trên Simulator chưa chạy được vì thiếu runtime; kết quả 1036 ca ở trên là chạy trên macOS.

### Chỗ làm khác plan và lý do

Dùng bộ kiểm thử macOS và kiểm tra Swift cho iOS bổ sung vì không có runtime Simulator. Bộ chạy phụ trong `.codex-out/app-1410-i1/` lấy nguyên extension `VNDate` từ mã hiện có; không sửa file ngoài phạm vi I1. Full build, kiểm thử trong app và bằng chứng giao diện còn cần CI hoặc máy có runtime iOS. Không tải runtime qua mạng, không sửa workflow, không commit/push, không làm bước khác.

### Câu hỏi còn lại

Không có câu hỏi về triển khai I1. Còn thiếu xác nhận full build, `FORMAT_TEST OK` trong Simulator và ảnh/video trên máy có runtime iOS.