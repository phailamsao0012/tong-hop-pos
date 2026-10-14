# Luật cho Codex: đưa bản web 14/10 lên app iOS và Android

Tổ app viết. Codex đọc file này trước, rồi `plan.md` cùng thư mục. Luật chung của repo ở `AGENTS.md` (mục 2 dưới đây nói phần nào bỏ với app).

1. **Đọc gì.** File này, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao ở mục 5.
2. **Luật chung.** Đọc `git show origin/claude/project-thread-3ujeoc:AGENTS.md` (luật chung của repo). Với app, **bỏ** các phần: nhánh làm việc bắt đầu từ demo, nhánh `codex/` mở PR vào demo (`AGENTS.md:12-13`); bốn lệnh `pnpm` (`AGENTS.md:15-18`). Nhánh và PR do tổ app lo.
3. **Đọc mã.** Mã web chỉ đọc bằng `git show origin/main:<đường dẫn>`; số dòng `main:` của plan là của `2163361` (đọc bằng `git show 2163361:<đường dẫn>`), `main@a7d479b:` là của `origin/main` mới. Mã iOS (khi làm Android) đọc bằng `git show codex/app-1410-ios:<đường dẫn>` (nhánh máy của phần iOS, đang làm song song, có thể chưa đủ bước), hoặc `git show origin/claude/project-thread-avd7td:<đường dẫn>`.
4. **Không được.**
   - `git commit`, `git push`, tạo nhánh trên remote, mở PR, dùng mạng. Ngoại lệ duy nhất: app chạy trong máy ảo mở site demo, nếu sandbox cho.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần sửa file khác thì dừng lại và hỏi.
   - Sửa `.github/workflows/*`, trừ file và phần ghi ở bảng ngoại lệ có tên (mục 2). Không thêm `pull_request_target`, không thêm quyền ghi cho job build hay job quay, không in bí mật, không bỏ ghim SHA. Chỉ hai job có `contents: write`: job ký của `android.yml` và job đẩy video của `android-preview.yml`; cả hai không checkout mã, không Gradle.
   - Sửa `wrangler*.json*`, `migrations/**`, `drizzle/**`, `app/**`, `lib/**`, `tests/**`, `components/**`.
   - Thêm thư viện ngoài danh sách ở mục 2. Dùng WebView.
   - Đổi số, cách tính, tên nghiệp vụ, quyền xem. App không tự tính số: làm đúng mục 4.3.
5. **Bí mật.**
   - Không đọc, liệt kê, mở hay chép: `~/.megatech/**`, mọi `local.properties`, `*.jks`, `*.keystore`, `*.p12`, `*.pem`, `~/.ssh/**`, `~/.config/gh/**`, `~/.codex*/**`.
   - Không chạy `assembleRelease`, `bundleRelease`, `apksigner`, `keytool`, `gh`, `env`, `printenv`, và không chạy `android/tools/tao-khoa-ky.sh` (chỉ `bash -n`).
   - Không đọc biến môi trường có `PASSWORD`, `KEYSTORE`, `SECRET`, `TOKEN` trong tên.
6. **Repo công khai.** Không đưa số thật, tên khách, email, SĐT, khóa hay token vào code, chú thích, chuỗi mẫu, test hoặc log. Ví dụ chỉ dùng số giả như 12, 30, tên giả như "NV A", "Team A".
7. **Chữ.** Chữ hiện cho người dùng là tiếng Việt, đúng nguyên văn bảng 4.4.4.
8. **Định dạng và log.** iOS: mọi định dạng số, ngày chỉ trong `Format.swift`. Android: chỉ trong `Fmt.kt`. Log Debug chỉ có mã và số đếm như mục 4.4.6, đặt trong `#if DEBUG` / sau `if (BuildConfig.DEBUG)`.
9. **Plan và code thật khác nhau:** chọn cách an toàn và đúng ý plan nhất, ghi vào mục "Chỗ làm khác plan" và "Câu hỏi còn lại" của tóm tắt, rồi làm tiếp phần còn lại của bước. Không ai trả lời giữa chừng (mục 12). Cần sửa file ngoài danh sách của bước thì không sửa, chỉ ghi câu hỏi.
10. **Build, test, chạy thử, chụp, quay: em tự làm hết** (theo lời anh 14/10; nếu sandbox cho):
    - iOS build: `xcodebuild -project ios/Megatech/Megatech.xcodeproj -target Megatech -sdk iphonesimulator SYMROOT="$PWD/.codex-dd" CODE_SIGNING_ALLOWED=NO build` (dự án không có scheme dùng chung, nên build theo target như `ios.yml:84-91`).
    - iOS test và chạy thử trên iOS Simulator: `xcrun simctl boot`, `xcrun simctl install booted <app>`; chạy `MEGATECH_FORMAT_TEST=1` / `MEGATECH_DECODE_TEST=1` bằng `xcrun simctl launch --console-pty` như `ios-preview.yml:89-97`; mở lượt tự xem với `SIMCTL_CHILD_MEGATECH_BASE=<site demo>`, `SIMCTL_CHILD_MEGATECH_SESSION=<phiên demo>`, `SIMCTL_CHILD_MEGATECH_TOUR=<lượt>` (như `ios-preview.yml`); chụp `xcrun simctl io booted screenshot <file>`, quay `xcrun simctl io booted recordVideo <file>`; tắt hẳn rồi mở lại bằng `xcrun simctl terminate booted <bundle>` rồi `launch`; đổi múi giờ của app bằng `SIMCTL_CHILD_TZ=<múi giờ>`.
    - Android build: `cd android && ./gradlew --offline :app:testDebugUnitTest :app:assembleDebug`, dùng các biến `ANDROID_HOME`, `JAVA_HOME`, `GRADLE_USER_HOME`, `ANDROID_USER_HOME` tổ app đã đặt. Không tạo, không đọc `local.properties`. Thiếu thư viện khi chạy `--offline` thì không tự tải, ghi tên thư viện thiếu vào tóm tắt.
    - Android chạy thử, nếu Mac có emulator: `adb install`, `adb shell am start … -e base … -e session … -e tour …` (như 4.5.5), `adb shell screencap -p`, `adb shell screenrecord`, `adb shell am force-stop`, `run-as`, `bmgr`, chỉ với bản debug. Mac không có emulator thì ghi "không có emulator Android"; các ca máy ảo của bước thành bước CI (4.5.5).
    - Phiên demo: đọc từ file `~/codex-viec/phien-demo` tổ app để sẵn (5.5.3). Chỉ là phiên của tài khoản demo công khai. Không in ra, không chép vào tóm tắt, code hay log.
    - Ảnh, video để trong worktree, thư mục `.codex-out/<bước>/` (không commit). Chỉ quay và chụp site demo.
    - Sandbox chặn máy ảo, hay chặn mạng của máy ảo: ghi rõ trong tóm tắt; CI quay video như cũ.
    - Không build được thì ghi rõ lệnh, lỗi và lý do.
11. **Tóm tắt** (tiếng Việt). Ghi tóm tắt theo đúng mẫu dưới vào `.codex-out/<bước>/tomtat.md`, và tin nhắn cuối của em là đúng nội dung đó. Lệnh chạy ghi tin nhắn đó vào `~/codex-viec/<bước>-tomtat.md` (5.5.3); tổ app chỉ đọc file này và `git diff`. Mỗi vòng góp ý viết lại tóm tắt đủ mẫu.
    ```
    # Tóm tắt <bước>
    ## File đã đổi
    ## Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)
    ## Ảnh / video (đường dẫn trong .codex-out/<bước>/, mỗi file một dòng nói thấy gì)
    ## Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)
    ## Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả
    ## Chỗ làm khác plan và lý do
    ## Câu hỏi còn lại
    ```
    Tóm tắt không có SĐT, email, token, phiên, tên người hay số thật.
12. **Chạy liền một mạch** (lời anh Vũ 14/10, plan mục 5.6).
    - Script `chay-lien-mach.sh` giao lần lượt từng bước của một phần (iOS hoặc Android Phần A) trong cùng một worktree, mỗi bước một lần chạy. Các bước trước đã được script commit trong nhánh máy; em không commit.
    - Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này ở lần chạy trước: đọc và làm tiếp, không làm lại từ đầu.
    - Sau mỗi bước, script tự kiểm bằng máy: build, phạm vi file, dữ liệu nhạy cảm, lệnh cấm, có tóm tắt. Sai thì script giao lại bước đó kèm lỗi (tối đa 3 vòng). Vòng sửa chỉ sửa đúng lỗi được báo, rồi viết lại tóm tắt đủ mẫu.
    - Bản demo của web chưa có W1, W2, W5: làm theo hợp đồng ở mục 4.2 của plan, trường của W để tùy chọn, kiểm thử giải mã dùng JSON số giả có và không có các trường đó. Phần nào chưa chạy thử được vì demo thiếu thì ghi vào tóm tắt.
