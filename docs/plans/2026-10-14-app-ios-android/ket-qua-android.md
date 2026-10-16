# Kết quả Android Phần A trên PC (Codex viết, máy kiểm, CI GitHub build)

## Tiến độ
```
10-16 04:39Z bắt đầu ở C:/Users/PC/Projects/thp-android, nhánh codex/app-1410-android, 12 bước
10-16 04:39Z bước 1/12 A0 bắt đầu: Nền build, CI và ký bản
10-16 04:40Z bắt đầu ở C:/Users/PC/Projects/thp-android, nhánh codex/app-1410-android, 12 bước
10-16 04:40Z bước 1/12 A0 bắt đầu: Nền build, CI và ký bản
10-16 04:42Z bắt đầu ở C:/Users/PC/Projects/thp-android, nhánh codex/app-1410-android, 12 bước
10-16 04:42Z bước 1/12 A0 bắt đầu: Nền build, CI và ký bản
10-16 04:46Z 🔁 A0: máy kiểm báo lỗi, Codex sửa vòng 1/4
10-16 04:47Z A0: đã đẩy e6a3dd9, chờ CI (Android)
10-16 04:50Z 🔁 A0: CI GitHub báo lỗi, Codex sửa vòng 2/4
10-16 04:51Z A0: đã đẩy 7d9c060, chờ CI (Android)
10-16 04:54Z 🔁 A0: CI GitHub báo lỗi, Codex sửa vòng 3/4
10-16 04:56Z A0: đã đẩy 0fe9dc0, chờ CI (Android)
10-16 04:59Z 🔁 A0: CI GitHub báo lỗi, Codex sửa vòng 4/4
10-16 05:00Z A0: đã đẩy d65b768, chờ CI (Android)
10-16 05:03Z ⛔ DỪNG ở A0: hết 4 vòng sửa, lỗi cuối (CI GitHub): [Android] job "build" hỏng ở bước: Cài SDK | Process completed with exit code 1. | [===                                    ] 10% Computing updates...              yes: standard output: Broken pipe | Loading package information...                                                  Loading local repository...                                                     [                                       ] 3% Loading local repository...        [                                       ] 3% Fetch remote | Không cài được SDK (mã 1)
10-16 05:03Z 📤 đã đẩy claude/app-android (7e962b4), Claude kiểm một lần
10-16 05:04Z bắt đầu ở C:/Users/PC/Projects/thp-android, nhánh codex/app-1410-android, 12 bước, từ A0
10-16 05:04Z bước 1/12 A0 bắt đầu: Nền build, CI và ký bản
10-16 05:06Z A0: đã đẩy 1c7974d, chờ CI (Android)
10-16 05:09Z 🔁 A0: CI GitHub báo lỗi, Codex sửa vòng 1/4
10-16 05:11Z A0: đã đẩy 8230f33, chờ CI (Android)
10-16 05:20Z ✅ A0 xong, CI xanh (8230f33)
10-16 05:20Z bước 2/12 A1a bắt đầu: Khóa bắt buộc, màn khóa, che màn hình
10-16 05:24Z ⛔ DỪNG ở A1a: Codex chạy lệnh đụng thư mục khoá / bí mật (xem ~\codex-viec\app-android\A1a-lan0-tk1-0.jsonl). Không đẩy gì.

```

---

## Tóm tắt A0
### File đã đổi
- `.github/workflows/android.yml`: chỉ sửa bước “Cài SDK”, cài `platforms;android-37.0` theo package có trong log kho SDK; bỏ qua nếu SDK đã có, tạo liên kết `android-37` tới `android-37.0` cho `compileSdk = 37` hiện tại. Giữ build-tools `36.0.0`, stable trước kênh 3 và các annotation chẩn đoán.
- `.codex-out/A0/tomtat.md`: viết lại tóm tắt đầy đủ; `.codex-out/A0/cai-sdk.sh`: trích bước SDK để kiểm cú pháp.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)
- `git status --short`: 0; đầu lượt sạch, cuối lượt chỉ workflow thay đổi được Git theo dõi.
- Đọc CODEX.md, plan.md, workflow, tóm tắt cũ; `git show` luật chung và `rg` phần A0/cấu hình SDK: 0.
- `git diff --check`, `git diff --stat`, `git diff -- .github/workflows/android.yml`: 0; chỉ đổi bước “Cài SDK”.
- `C:\Program Files\Git\bin\bash.exe -n .codex-out/A0/cai-sdk.sh`: 1; sandbox chặn CreateFileMapping, Win32 error 5, chưa xác nhận cú pháp bằng Bash.
- Không build trên máy Windows, không chạy Gradle/test/emulator. CI build và chạy test khi script đẩy; chưa có kết quả CI mới.
- Ghi file LF, UTF-8 không BOM. Không commit, không push.

### Ảnh / video (đường dẫn trong .codex-out/A0/, mỗi file một dòng nói thấy gì)
Không có; A0 không có đoạn video.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)
Không áp dụng.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả
Không áp dụng cho lượt sửa A0 này.

### Chỗ làm khác plan và lý do
Đổi tên package cài từ `platforms;android-37` sang `platforms;android-37.0` vì log CI xác nhận tên cũ không có trên kho. Tạo liên kết thư mục để giữ cấu hình API 37, không đổi file build hay bước workflow khác. Cần CI xác nhận Gradle nhận SDK qua liên kết này. Không tạo file dấu vân tay ký.

### Câu hỏi còn lại
Không cần trả lời giữa chừng; chờ CI xác nhận cài SDK và build/test với liên kết API 37.


---

## Tóm tắt A1a
### File đã đổi
- `android/app/src/main/java/vn/megatech/tonghoppos/LockPolicy.kt`: chính sách khóa Kotlin thuần, xóa ba khóa cũ, đếm lượt vào nền và từ chối xác thực cũ.
- `android/app/src/main/java/vn/megatech/tonghoppos/App.kt`: bắt buộc xác thực phiên lưu, khóa ngay khi vào nền, màn khóa đục, bảo vệ chụp màn hình và màn đa nhiệm; ngoại lệ debug chỉ ở bộ nhớ.
- `android/app/src/main/java/vn/megatech/tonghoppos/Login.kt`: form mật khẩu MEGATECH dùng chung, xử lý sai mật khẩu/hết phiên, hủy yêu cầu khi đóng form.
- `android/app/src/main/java/vn/megatech/tonghoppos/Security.kt`: luôn xác thực trước khi duyệt đăng nhập; form mật khẩu nằm trong sheet hiện có.
- `android/app/src/main/java/vn/megatech/tonghoppos/System.kt`: bỏ công tắc khóa, thời gian chờ và chụp màn hình; giữ câu thông báo theo plan.
- `android/app/src/main/java/vn/megatech/tonghoppos/Api.kt`: thêm `reauth(password)`.
- `android/app/src/main/java/vn/megatech/tonghoppos/DebugLog.kt`: mốc `hoi-xac-thuc`, chỉ debug, tag cố định và số đếm.
- `android/app/src/test/java/vn/megatech/tonghoppos/AppLockTest.kt`: bốn test JVM theo plan, gồm cả xác thực thất bại và xác thực mới sau khi vào nền.
- `.codex-out/A1a/tomtat.md`: bản tóm tắt này.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)
- `git status --short`: mã 0; đầu bước sạch, cuối bước có đúng 8 file code/test nêu trên.
- Đọc CODEX.md, plan.md và các file Android bằng PowerShell: mã 0; lần đọc đầu hiển thị sai encoding, đã đọc lại UTF-8 các phần liên quan.
- `git show origin/claude/project-thread-3ujeoc:AGENTS.md`: mã 0, đã đọc luật chung.
- `git show origin/claude/project-thread-avd7td:ios/Megatech/Megatech/API.swift`: đọc được nhánh reauth để đối chiếu; nhóm lệnh dùng Select-Object kết thúc sớm trả mã 1.
- Các lệnh `rg -n` tìm yêu cầu và chỗ gọi: mã 0 khi có kết quả. `rg --files -g AGENTS.md` trong android: mã 1, không có file khớp.
- Một lệnh PowerShell sửa file đầu tiên: mã 1 do lỗi dấu kết thúc here-string, không sửa file; đã thực hiện lại thành công, mã 0.
- `git diff --stat`, `git diff -- <các file A1a>`: mã 0, đã rà diff.
- `git diff --check`: mã 0 ở các lượt kiểm, không lỗi khoảng trắng.
- `rg -n` rà tham chiếu AppLock.enabled/graceSeconds/set/setGrace/onStart, đọc secure cũ và Modifier.blur: mã 1, không còn kết quả.
- Kiểm byte của 8 file code/test bằng PowerShell: mã 0; toàn bộ LF, không BOM.
- Không build, không chạy test trên máy Windows theo ghi thêm của tổ app. CI build và chạy AppLockTest khi script đẩy nhánh; chưa có kết quả CI trong lượt này.

### Ảnh / video (đường dẫn trong .codex-out/A1a/, mỗi file một dòng nói thấy gì)
Không có; máy không có emulator, video dồn sang A1c trên CI.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)
Không áp dụng: A1a không có bảng số liệu.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả
Chưa chạy trên máy Windows. Các ca mở lạnh, vào nền, không có khóa màn hình, duyệt máy tính và màn che chờ CI/A1c theo giao việc; không chạy lệnh máy ảo trong lượt này.

### Chỗ làm khác plan và lý do
- Nhánh Password của LockPolicy dùng chung trạng thái Welcome ở Auth; khi mở sẽ gọi form reauth thay cho xác thực thiết bị nếu không khả dụng. Không gọi restore trước xác thực.
- Trong Security.kt, thêm điểm hiển thị form mật khẩu ở đầu nội dung sheet, ngoài hai dòng gọi xác thực được nêu trong plan. Đây là phần nối nhánh mật khẩu cho duyệt máy tính: form ở cửa sổ gốc sẽ bị sheet hiện có che. Không thêm hộp nổi hay đổi sang các hàm bọc của A1c.
- Không build/test/chạy máy ảo tại máy theo ghi thêm Windows; CI xác minh. Không sửa workflow hoặc làm bước khác.

### Câu hỏi còn lại
- Cần tổ app xác nhận phần nối form mật khẩu trong sheet của Security.kt được chấp nhận trong phạm vi A1a.
- Chờ CI xác nhận build và AppLockTest; chờ A1c kiểm các ca máy ảo và video bảo mật.
