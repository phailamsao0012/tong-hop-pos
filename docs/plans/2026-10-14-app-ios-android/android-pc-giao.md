# Android Phần A trên PC Windows: Codex làm lại 12 bước, CI GitHub build từng bước

Tổ app viết, 16/10/2026. Anh Vũ: "android làm tiếp đi" (16/10). Phần Android làm trên Mac trước đây không lên GitHub được (Mac không nhận lệnh từ xa), coi như mất: làm lại từ đầu theo `plan.md` mục 5.3.

Codex viết toàn bộ code. Claude trên PC chỉ chuẩn bị máy, chạy script giao bước và đẩy nhánh, không sửa code app hay workflow.

File này có ba phần:
- Phần 1 cho máy chạy (Claude trên PC và script giao bước).
- Phần 2 là "ghi thêm chung", gửi kèm lời giao của MỌI bước.
- Phần 3 là "ghi thêm riêng" của từng bước.

## Phần 1. Máy chạy

### 1.1 Nhánh và thư mục
- Nhánh GitHub: `claude/app-android`. Anh đã cho phép nhánh này (câu 1 của plan: "có", 15/10). Commit đầu là commit tài liệu này, cắt từ `main` (`0f257f1`), đúng như A0 ghi.
- Worktree riêng trên PC: `C:\Users\PC\Projects\thp-android`, nhánh máy `codex/app-1410-android` tạo từ `origin/claude/app-android`.
  - Không đụng `C:\Users\PC\Projects\tong-hop-pos` (thư mục của thread Giao diện mới). Tạo worktree bằng `git worktree add` thì được, không đổi cây làm việc của thư mục đó.
- Tiến độ, lời giao, tóm tắt, log để ngoài worktree: `~/codex-viec/app-android/` (ví dụ `tien-do.txt`, `<bước>-giao.md`, `<bước>-tomtat.md`, `<bước>-log.jsonl`).
- Thêm vào exclude của repo: `.codex-out/`, `.gradle-home/`, `.android-home/`, `android/.gradle/`, `android/app/build/`, `android/local.properties`.

### 1.2 Thứ tự bước
A0 → A1a → A1b → A1c → A2a → A2b → A6 → A7 → A7c → A7b → A8a → A8b (`plan.md` mục 4.1 và 5.3). Phần B (mục 5.4) không làm.

Mỗi bước một lần chạy Codex, cùng worktree. Bước sau chỉ bắt đầu khi bước trước đã qua máy kiểm (1.4) và CI xanh (1.6).

### 1.3 Chạy Codex
Dùng lại script giao bước của việc Vận hành đơn trên PC: tk1 hết lượt thì đổi tk2, cả hai hết thì script tự chờ giờ hồi rồi chạy tiếp, không phiên Claude nào ngồi chờ. Báo Telegram như các việc Codex PC khác, nếu script PC gửi được; không gửi được thì bỏ, không lách.

Lệnh mỗi bước (chạy trong worktree, lời giao qua stdin):

```
codex exec -C <worktree> -s workspace-write -c 'approval_policy="never"' -c windows.sandbox=unelevated --json -o ~/codex-viec/app-android/<bước>-tomtat.md - < ~/codex-viec/app-android/<bước>-giao.md > ~/codex-viec/app-android/<bước>-log.jsonl
```

Không bỏ `approval_policy="never"`, không dùng `danger-full-access` hay cờ bỏ sandbox.

Lời giao mỗi bước gồm ba phần, theo thứ tự:
1. Câu mẫu `plan.md` 5.5.2, với nhánh `codex/app-1410-android` và worktree `C:\Users\PC\Projects\thp-android`.
2. Phần 2 của file này, nguyên văn.
3. Mục của bước đó ở Phần 3, nếu có.

Vòng sửa thì thêm đoạn "Lỗi cần sửa" chép từ máy kiểm hoặc CI (1.6), và câu: "Chỉ sửa đúng lỗi này, rồi viết lại tóm tắt đủ mẫu."

### 1.4 Máy kiểm sau mỗi lần Codex chạy (script, ngoài sandbox)
1. **Phạm vi file.** `git status --porcelain` và `git diff --name-only HEAD` chỉ có `android/**`, `.github/workflows/android.yml`, `.github/workflows/android-preview.yml`. Không có file trong `.codex-out/`, `.gradle-home/`, `build/`.
2. **File khóa.** Không có file khớp `\.(jks|keystore|p12|pem)$` hay `local\.properties$`.
3. **Dữ liệu nhạy cảm.** Dòng thêm mới (`git diff -U0`, dòng bắt đầu `+`) không khớp mẫu dưới đây (dạng SĐT, email, token, khóa). Bỏ qua dòng có `noreply@`.
   ```
   \+84 ?[0-9]|(^|[^0-9A-Za-z])0[0-9]{9}([^0-9A-Za-z]|$)|(^|[^0-9A-Za-z])0[0-9]{2}[ .][0-9]{3}[ .][0-9]{3,4}([^0-9]|$)|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY
   ```
   - Không có `thp_session=`, `storePassword`, `keyPassword`.
   - Tên bí mật `ANDROID_*` chỉ được nằm trong `${{ secrets.… }}` của `android.yml` và trong lệnh `gh secret set` của `android/tools/tao-khoa-ky.sh`.
4. **Xuống dòng.** Dòng thêm mới không có `\r` (repo dùng LF, PC là Windows).
5. **Tóm tắt.** Có `.codex-out/<bước>/tomtat.md`, mở đầu `# Tóm tắt <bước>`, đủ các mục của mẫu `CODEX.md` mục 11.
6. **Lệnh Codex đã chạy** (trường `command` trong log `.jsonl`):
   - Đụng `.megatech`, `.ssh`, `.config/gh`, `.codex`, `tele-bot` hay file `.env`: **dừng cả phần**, không đẩy gì, ghi `~/codex-viec/app-android/DUNG.md`.
   - Có `git push`, `git commit`, `curl`, `gh `, `keytool`, `apksigner`, `assembleRelease`, `printenv`: chỉ ghi cảnh báo vào tiến độ.
7. **File workflow** (khi bước có sửa):
   - Mọi `uses:` ghim SHA đủ 40 ký tự hex.
   - Không có `pull_request_target`, `workflow_run`, `secrets: inherit`, `set -x`.
   - `BUILD_TOOLS_VERSION` là `36.0.0`.
8. **Build trên PC (không bắt buộc).** Chỉ chạy khi máy ĐÃ có sẵn JDK 17 trở lên và Android SDK có `platforms/android-37`, `build-tools/36.0.0`. Khi đó chạy `android/gradlew :app:testDebugUnitTest :app:assembleDebug` ngoài sandbox.
   - Không cài JDK hay SDK: CI trên GitHub đã build mỗi lần đẩy.
   - Có lỗi build thì coi như máy kiểm sai, giao lại vòng sửa với phần lỗi.

Máy kiểm sai thì giao lại cùng bước kèm lỗi (vòng sửa).

### 1.5 Commit và đẩy (script)
- `git add` đúng các file trong phạm vi, không `git add -A`.
- Hai commit tách riêng:
  - Commit code: `App Android 14/10 <bước>: <việc> (Codex viết trên PC, máy kiểm)`.
  - Commit file workflow (nếu có): `... (ngoại lệ có tên, Codex sửa, máy kiểm)`.
- Commit bỏ qua móc git. Vòng sửa là commit mới, không amend.
- Lời commit có trailer như các commit Codex PC khác. Không ghi tên model.
- Đẩy: `git push origin HEAD:refs/heads/claude/app-android`, chỉ khi tiến thẳng được.
  - Nhánh trên GitHub đã đổi do người khác: dừng cả phần, ghi lý do, không ghi đè.

### 1.6 Chờ CI rồi mới sang bước sau (script, không phiên Claude nào chờ)
- Từ A0 có workflow `Android`. Từ A1c có thêm `Android preview`.
- Script hỏi API công khai, không cần đăng nhập, khoảng 3 phút một lần: `GET https://api.github.com/repos/phailamsao0012/tong-hop-pos/actions/runs?head_sha=<sha>`. Chờ tới khi mọi lần chạy của hai workflow đó xong. Quá 90 phút chưa xong thì coi như đỏ, với lý do "CI không xong".
- **Xanh** thì sang bước sau.
- **Đỏ** thì gom lỗi, không cần đăng nhập:
  - Từ `GET .../actions/runs/<run_id>/jobs`, lấy tên job và tên bước hỏng.
  - Từ `GET .../check-runs/<job_id>/annotations`, lấy các dòng `::error::`, tối đa 60 dòng.
  - Ghi lỗi vào lời giao vòng sửa của cùng bước, rồi lại qua 1.4, 1.5, 1.6.
- **Giới hạn vòng sửa.** Mỗi bước tối đa 4 vòng, tính cả vòng do máy kiểm lẫn do CI. Hết 4 vòng vẫn sai thì dừng cả phần, ghi `DUNG.md` (bước, lỗi cuối, không có bí mật).
- **Lỗi do demo, không do app.** Mọi annotation lỗi đều mở đầu `demo:`: đăng nhập demo hỏng, hoặc demo đang nạp lại dữ liệu (POS hiện "lịch sử…").
  - Không tính vòng, không giao Codex.
  - Script chờ 30 phút, rồi chạy lại các job hỏng của đúng lần chạy đó (`gh run rerun <run_id> --failed`). Lệnh này cần `gh` đã đăng nhập.
  - Chạy lại mà vẫn lỗi `demo:`, hoặc PC không có `gh` đã đăng nhập: dừng cả phần, ghi lý do.

### 1.7 Xong cả phần
- Gom tóm tắt 12 bước, tiến độ và cảnh báo vào `docs/plans/2026-10-14-app-ios-android/ket-qua-android.md`. Qua mẫu dò 1.4 mục 3 trước. Có dòng nghi ngờ thì không commit file này, để ở máy.
- Commit, đẩy.
- Claude trên PC kiểm một lần (đọc `ket-qua-android.md`, CI cuối xanh), rồi báo điều phối một tin.
- Tổ app sẽ kiểm một lần theo `plan.md` 5.5.4, gửi QA các mốc A1c, A6, A7, A7c, A7b, A8a, rồi gửi anh video.

### 1.8 Không làm ở lượt này
- **Khóa ký và phát hành.** Không chạy `android/tools/tao-khoa-ky.sh` (A0 chỉ viết, `bash -n`). Không có `android/signing-cert.sha256`. Không mở PR vào `main`, không phát hành `android-v0.2-2`.
  - Plan 4.5.4 cần anh dán một lệnh trên Mac, mà anh không dán lệnh nữa.
  - Tổ app sẽ đưa cách khác cho anh chọn trước khi phát hành. Việc này không chặn 12 bước.
- **Máy ảo trên PC.** Không chạy emulator trên PC. Video và các ca máy ảo chạy trên CI (`android-preview.yml`, plan 4.5.5).

## Phần 2. Ghi thêm chung (gửi kèm lời giao mọi bước, nguyên văn)

> **Máy em chạy là PC Windows, không phải Mac.** Thay `CODEX.md` mục 10, 12, 13 bằng các ý dưới đây; các mục khác của `CODEX.md` giữ nguyên.
> - Không chạy Gradle, `adb`, emulator, `xcodebuild`, `xcrun`: sandbox Windows chặn tạo tiến trình con của các lệnh này, máy cũng không có emulator. Viết code và test JVM đúng plan; CI trên GitHub build, chạy test và quay video mỗi lần script đẩy.
> - Được chạy: `git status`, `git diff`, `git show`, `git log`, `rg`, đọc file, `bash -n`. Không `git commit`, không `git push`.
> - Không đọc, không liệt kê, không nhắc tới trong lệnh: `~/.codex*`, `C:\tele-bot\**`, mọi file `.env`, cùng vùng cấm ở `CODEX.md` mục 5.
> - Mã iOS để đối chiếu: `git show origin/claude/project-thread-avd7td:<đường dẫn>`. Mã web: `git show origin/main:<đường dẫn>`. Số dòng `main:` trong plan có thể lệch vài dòng vì `main` đã có thêm commit: tìm theo tên hàm, tên biến.
> - Giữ xuống dòng LF. Không thêm BOM. File mới cũng LF.
> - Không ai trả lời giữa chừng (`CODEX.md` mục 9). Chỗ plan bảo "dừng lại hỏi" thì chọn cách an toàn nhất, đúng ý plan, ghi vào "Chỗ làm khác plan" và "Câu hỏi còn lại", rồi làm tiếp.
> - Mục "Lệnh đã chạy và kết quả" của tóm tắt ghi rõ là không build trên máy, CI build.
> - Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
> - Có đoạn "Lỗi cần sửa" (từ máy kiểm hoặc CI): chỉ sửa đúng lỗi đó, không làm lại bước. Tóm tắt viết lại đủ mẫu.
> - Bản demo đã có W1, W2, W5 (`plan.md` 4.2). Khi viết code, cứ để các trường đó tùy chọn, và test giải mã có cả JSON có lẫn không có các trường đó.
> - Khóa ký: lượt này không có `android/signing-cert.sha256`, không tạo file này, không chạy `tao-khoa-ky.sh`.

## Phần 3. Ghi thêm riêng từng bước

### A0
- SHA action (tổ app tra lại 16/10 bằng `git ls-remote`, đúng commit của tag). Chép nguyên, ghi tag ở chú thích:
  - `actions/checkout` v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`
  - `actions/setup-java` v6.0.1 `de7274f081f381c8f8158605e0321c36c376e2e6`
  - `actions/upload-artifact` v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9`
  - `actions/download-artifact` v8.0.2 `9000827ccba6bdab643e8b6fd33ac0654aef8333`
  - `gradle/actions` (`wrapper-validation`, `setup-gradle`) v6.4.0 `3f5f9adaf7d9fecd50b5935e54106014257a94e6`
  - `reactivecircus/android-emulator-runner` v2.38.0 `a421e43855164a8197daf9d8d40fe71c6996bb0d` (dùng từ A1c)
- `BUILD_TOOLS_VERSION: '36.0.0'`. Đây là bản build-tools mặc định và tối thiểu của AGP 9.4 theo ghi chú phát hành AGP 9.4 (JDK 17, Gradle tối thiểu 9.6.0; repo đang dùng Gradle 9.7.1).
- `org.json:json:20260814`, `junit:junit:4.13.2`. CI có mạng nên tự tải; không cần `--offline`.
- Tên workflow đúng chữ: `name: Android`. Script chờ CI theo tên này.
- `push` vào `claude/app-android` chạy cả `assembleRelease` chưa ký (plan A0, "Xong khi"). Tới A8b chỉ để trên `main`.
- **Lỗi Gradle phải đọc được qua annotation** (vì script đọc lỗi CI không cần đăng nhập, 1.6):
  - Bước chạy Gradle ghi toàn bộ đầu ra vào `$RUNNER_TEMP/gradle.txt` và in ra log.
  - Gradle lỗi thì in tối đa 40 dòng `::error::<dòng>`, lấy từ các dòng:
    - bắt đầu bằng `e: ` (lỗi biên dịch Kotlin);
    - chứa `FAILED` (test hỏng, kèm 2 dòng sau);
    - sau `* What went wrong:` (3 dòng).
  - Bỏ phần `$GITHUB_WORKSPACE/` khỏi đường dẫn, rồi thoát đúng mã của Gradle.
  - Viết theo mục "Lệnh có `grep`" ở `plan.md` 4.5.3: `if ./gradlew … > "$RUNNER_TEMP/gradle.txt" 2>&1; then …; else rc=$?; …; exit $rc; fi`. Không dùng `| tee` dưới `pipefail`.
- Bước chặn định dạng/log và mọi bước kiểm khác: lỗi thì in `::error::<lý do ngắn>` trước khi thoát, để script đọc được qua annotation.
- `android/signing-cert.sha256`: không tạo (Phần 2).

### A1a, A1b
Không có ghi thêm. Ca máy ảo của các bước này dồn sang A1c (CI), như plan.

### A1c
- Tên workflow đúng chữ: `name: Android preview`.
- Mọi lệnh kiểm trong job `quay` lỗi thì in `::error::<đoạn>: <lý do, số đếm>` rồi thoát 1. Không in dòng log thô, phiên hay token.
- Hai lỗi do demo in `::error::demo: <lý do>` (script nhận ra theo tiền tố này, 1.6):
  - bước đăng nhập demo hỏng;
  - lượt tự xem thấy POS còn "lịch sử…" (demo đang nạp lại dữ liệu).
- Ca máy ảo 6.4.5, 6.4.7, 6.4.9, 6.4.10, 6.4.11: thành bước có tên trong job `quay` (plan 4.5.5). PC không có emulator.
- Chỗ gọi hộp nổi trên `main` hiện tại khác danh sách 15 chỗ ở plan 4.5.2:
  - Đổi mọi chỗ gọi thẳng tìm được bằng tám mẫu cấm.
  - Ghi danh sách thật vào tóm tắt.

### A6, A7, A7c, A7b, A8a, A8b
- Lượt tự xem in `[XNK]`, `[TEAM]` cùng dạng iOS (plan 4.4.6). Đối chiếu file iOS bằng `git show origin/claude/project-thread-avd7td:ios/Megatech/Megatech/<file>`. Các lượt `xnkho`, `team` của iOS ở `Tabs.swift`.
- Mỗi bước thêm đoạn video của mình vào `android-preview.yml` (plan 4.5.5). Lệnh kiểm log của đoạn in `::error::` như A1c.
- A7c, A7b: demo đã có W5 (`staff[].chart` và điểm biểu đồ to). Không chờ.
- A8b:
  - `assembleRelease` chỉ chạy khi `push` vào `main` (plan 4.5.3).
  - Không tạo `android/signing-cert.sha256`.
  - Không mở PR, không phát hành (1.8).
