# Đưa bản web 14/10 lên app iOS và Android: cột Đã XN kho, So cùng kỳ từng người, chọn team

Bản 1.3 (14/10/2026), đã qua 3 lượt soát nội bộ và QA đánh giá khả thi (khả thi có sửa, đã sửa theo QA). Tổ app viết. Từ bản 1.3, Codex chạy liền một mạch từng phần, tổ app kiểm một lần khi xong phần (mục 5.6).

Khi anh duyệt, file này và `CODEX.md` (mục 5.5.1) vào thư mục `docs/plans/2026-10-14-app-ios-android/`:
- trên nhánh `claude/project-thread-avd7td`, ở bước I0, trước mọi bước Codex của iOS;
- là commit đầu của nhánh `claude/app-android`, ở bước A0 (nếu anh cho nhánh riêng, câu 1).

Anh Vũ yêu cầu ngày 14/10/2026: "Giờ lên app ios và android đi".

Nghĩa là: đưa các thay đổi web đã lên ngày 14/10 (PR #74, commit `2163361` trên `main`; và PR #76, `a7d479b`: chạm biểu đồ mini để xem riêng một người) vào app iOS và app Android.

Anh dặn thêm cùng ngày: "m chỉ đưa ra ý tưởng, điều khiển, còn codex sẽ làm việc tất tần tật nhé, cấm tự làm". Vì vậy mọi việc thực thi trong plan này giao cho Codex: code, file CI có tên, số phiên bản, build, chạy thử, sửa lỗi CI. Tổ app chỉ viết plan, viết lời giao, kiểm bài, commit / push / PR, báo QA và gửi anh.

Anh chốt thêm cùng ngày (chế độ tiết kiệm): "ok tiết kiệm, tiết kiệm hết mức, claude chỉ giám sát, đưa plan chi tiết, xem kết quả, còn lại codex tự làm hết". Nghĩa là:
- Codex tự làm hết, kể cả build, test, chạy thử trên máy ảo, chụp ảnh / quay video và tự viết tóm tắt kết quả theo mẫu (5.5.1 mục 11).
- Tổ app chỉ viết plan và lời giao, đọc tóm tắt và `git diff`, chạy các lệnh kiểm nhanh bằng grep (5.5.4), commit / push / PR, gửi QA và gửi anh.
- QA chỉ kiểm phần đụng số liệu và bảo mật, theo mốc (5.0). Phần giao diện thuần không có QA riêng.

Anh chốt tiếp lúc 09:21Z: "sau khi xong tất tần tật, claude mới kiểm tra, test, kiểm thử, chứ claude không tham gia quá trình code … chờ gpt xong từng phần mới check, không được luôn luôn check". Vì vậy từ bản 1.3, mỗi phần (iOS, Android Phần A) chạy liền một mạch bằng script, không chờ tổ app giữa các bước; tổ app và QA kiểm một lần khi cả phần xong (mục 5.6). Mục 5.6 thay các chỗ của 5.0 và 5.5.4 nói kiểm sau mỗi bước.

**Cách ghi nguồn trong plan.**
- `main:` là `origin/main` @ `2163361` (PR #74).
- `main@a7d479b:` là `origin/main` mới nhất khi viết bản này (14/10 chiều): thêm PR #75 (`4a4db37`, W4) và PR #76 (`a7d479b`, xem riêng một người ở So cùng kỳ). Hai PR này đổi `app/staff-compare.tsx` (từ dòng 346), `app/product-group-blocks.tsx` (từ dòng 596), hai `route.ts` của product-groups và staff-compare, `worker.ts`. Số dòng `main:` ở các file đó là của `2163361`; Codex đọc đúng dòng bằng `git show 2163361:<đường dẫn>`, hoặc tìm theo tên hàm trên `origin/main`.
- `avd7td:` là `origin/claude/project-thread-avd7td` @ `e2ec11b` (PR #72, app iOS "lần A", chưa gộp).
- `demo:` là `origin/claude/project-thread-3ujeoc` @ `e211f7f`.
- Số sau dấu hai chấm là số dòng. Phần Android lấy từ `main:android/...`.
- `avd7td` tách khỏi `main` ở `3e4e35a`, trước PR #74. Vì vậy mã web 14/10 (`app/staff-compare.tsx`, `lib/hr-unit.ts`…) chưa có trên `avd7td` cho tới bước I0. Codex luôn đọc mã web bằng `git show origin/main:<đường dẫn>` (bản mới nhất), hoặc `git show 2163361:<đường dẫn>` khi cần đúng số dòng `main:` của plan.

**Ai làm gì.**

| Vai | Việc |
|---|---|
| Codex (trên MacBook của anh) | Làm mọi việc thực thi của từng bước: code iOS, code Android, các file CI được nêu tên ở bước đó (ngoại lệ có tên, mục 2), số phiên bản. Tự build, test, chạy app trên máy ảo trên Mac (iOS Simulator; Android emulator nếu Mac có, nếu không thì dựa CI), chụp ảnh / quay video trên site demo, chạy các ca máy ảo của mục 6, rồi viết tóm tắt `~/codex-viec/<bước>-tomtat.md` theo mẫu (5.5.1 mục 11). Sửa lỗi CI theo log tổ app đưa. Chỉ làm trong worktree riêng. Không commit, không push, không dùng mạng (trừ app trong máy ảo mở site demo, nếu sandbox cho). |
| Tổ app (Claude) | Chỉ giám sát: viết plan và `CODEX.md`, viết lời giao từng bước, chuẩn bị worktree trên Mac, đọc tóm tắt của Codex và `git diff` (không đọc log jsonl dài, không xem từng khung hình, không chạy lại build), chạy các lệnh kiểm nhanh bằng grep ở 5.5.4, commit / push / PR, gộp `main` vào nhánh (I0, sau mỗi lần gộp PR), tra SHA của các action GitHub để ghi vào lời giao, gửi QA ở mốc có số liệu hoặc bảo mật (5.0), gửi anh. Không tự viết code. |
| CI (GitHub Actions) | Không tốn lượt của Claude: build, test, bước chặn, video máy ảo trên site demo. Video gửi anh lấy từ CI hoặc từ Codex. |
| Tổ web tổng | Làm W1, W2, W5 (bắt buộc) và W3 (nên làm) theo plan riêng của web (mục 5.1). W4 đã lên web thật 14/10 (PR #75). |
| Tổ web nhân sự | Đổi tên rồi xóa một team thử trên demo của web nhân sự cho ca 6.3.8, khi tổ app nhờ. |
| QA | Chỉ kiểm phần đụng số liệu và bảo mật, ở các mốc ghi ở 5.0, theo mục 6. Bằng chứng là tóm tắt của Codex, log và video CI, so với web demo hoặc API demo. |
| Anh Vũ | Duyệt plan và trả lời 3 câu hỏi (mục 8). Xem video demo, cho phép lên bản thật. Một lần duy nhất, trước bản Android đầu tiên: dán một dòng lệnh tổ app gửi vào Terminal trên Mac để tạo khóa ký và cất bí mật lên GitHub (mục 4.5.4), ngoài mọi phiên Codex hay Claude; không phải gõ mật khẩu. Mỗi lần ra bản Android: bấm Duyệt một lần trên GitHub (có thể bấm trong app GitHub trên điện thoại) để job ký chạy (mục 4.5.3). Chỉ anh bấm, tổ app không duyệt thay. |

## 1. Mục tiêu và phạm vi

### 1.1 Anh nhận được gì trên iOS
1. Bảng **Từng nhân viên** ở hai chỗ:
   - Phòng ban › Sale › Nhân viên: bộ phận Sale, tính theo người bán.
   - Phòng ban › CSKH › Tổng quan: bộ phận CSKH, tính theo người chăm sóc trên đơn (trống thì người bán), như web.
   - Dưới tiêu đề mỗi bảng có một dòng ghi rõ số tính theo ai (mục 4.4.4).
2. Các cột của bảng: Nhân viên · Số chia · Đơn chốt · Tỷ lệ chốt · **Đã XN kho** · Doanh thu · **So cùng kỳ**. Có dòng Tổng và sắp xếp theo từng cột.
3. Cột **Đã XN kho**:
   - Dòng trên là tỷ lệ %. Dòng dưới là "x/y đơn chốt".
   - Chạm vào ô thì hiện bảng giải thích: Kho xác nhận, Người chốt tự bấm Đã xác nhận, Không rõ người xác nhận, Còn Chờ xác nhận.
   - Chạm "x/y đơn chốt" thì mở danh sách đúng x đơn đó.
4. Cột **So cùng kỳ**:
   - Mỗi người có một biểu đồ mini, nhãn "trước …" và mức đổi. Tăng màu xanh, giảm màu đỏ.
   - Trên bảng có dải chọn: kiểu so (5 kiểu), lùi bao xa, kiểu biểu đồ (Lên xuống, Chênh lệch, Cộng dồn), và chỉ số "Từng nhân viên: Đơn chốt / Doanh thu / Tỷ lệ chốt".
   - Thứ tự nút và mặc định Đơn chốt giữ đúng như web hiện tại. Anh đã bỏ yêu cầu đổi sang ưu tiên Doanh thu (14/10).
   - **Biểu đồ to** của dải So cùng kỳ (bước I4b): kỳ này và kỳ so theo từng ngày (xem một ngày thì từng giờ), đủ ba kiểu như web, chạm giữ để xem số từng điểm. Số của biểu đồ do máy chủ trả (W5), app chỉ vẽ.
   - **Xem riêng một người** (bước I7), như web thật (PR #76): chạm biểu đồ mini của một người thì hai số tổng và biểu đồ to ở dải So cùng kỳ hiện số của riêng người đó, có nút "Xem cả đội" để quay lại.
5. Nút **Team**: chọn một team bên web nhân sự.
   - Phần lọc theo team: bảng Từng nhân viên, Sale › Nhân viên, CSKH › Tổng quan, Vận đơn, và các thẻ lấy từ báo cáo overview trong khối Số liệu theo kỳ ở Tổng quan (bảng ở 4.4.5).
   - Phần nào chưa lọc được theo team thì app ghi rõ, đến từng thẻ.
6. Thay đổi thứ ba của web (bỏ khu thẻ nhóm sản phẩm) không cần làm. App chưa bao giờ có khu này: không file nào trong `ios/` hay `android/` gọi `/api/reports/product-groups` (đã `git grep` trên `avd7td` và `main`).

### 1.2 Anh nhận được gì trên Android
Android hiện là bản 0.1. Chưa có CI, chưa có bản phát hành, khóa máy còn tắt được (mục 3.3).

**Phần A, trong plan này, ra bản 0.2:**
1. Nền build, CI và ký bản (A0).
2. Khóa bắt buộc mỗi lần mở, che màn hình, sao lưu, cookie, log, hộp nổi không nằm trên màn khóa (A1a, A1b, A1c).
3. Định dạng số chung và mô hình dữ liệu có kiểu cho các màn mới (A2a, A2b).
4. Phần 14/10 trên các màn Android **đang có** (A6, A7, A7c, A7b, A8a, A8b), gồm cả biểu đồ to của So cùng kỳ và xem riêng một người:
   - Sale › Nhân viên.
   - CSKH: thêm trang con "Nhân viên", vì Android chưa có CSKH › Tổng quan.
   - Trang chủ "Điều khiển trung tâm" (nút Team).
   - Trang nào Android chưa có hoặc chưa lọc được theo team thì ghi "Trang này chưa lọc được theo team…".

**Phần B, chỉ làm khi anh trả lời "Có" ở câu 3** (A3–A5, A9–A12): khung 5 tab như iOS, Tổng quan 4 bộ phận, Phòng ban và Vận đơn, Đơn hàng và ô tìm, Trang chủ, Thêm và Cài đặt, widget. Mục 5.4 giữ sẵn các bước này.

Mỗi bản Android là một file APK đã ký, đăng ở GitHub Release tên `android-v<phiên bản>-<số build>`, ví dụ `android-v0.2-2`.

### 1.3 Ngoài phạm vi
- Cột theo thẻ đơn hoặc nhóm sản phẩm, nút "Hiện cột thẻ đơn (n)", bộ lọc Thẻ đơn hàng, bộ chọn Nhóm chính / Sản phẩm, bộ chọn vài nhân viên của khối web. App chỉ có bảng gọn.
- Tự gộp điểm cho biểu đồ to như trình duyệt đang làm (`main:app/staff-compare.tsx:366-412`). App chờ W5 trả sẵn các điểm đã gộp và cộng dồn. Khi chưa có W5, app không vẽ biểu đồ to, chỉ có các nút chọn và hai số tổng.
- Phần trăm trong ngoặc ở bảng giải thích (web tính bằng `share(...)` ở trình duyệt). App chỉ hiện số đơn.
- Trang "Theo team" (`sale-teams`, `cskh-teams`) của web.
- Release B và C của plan iOS ngày 11/10 không đổi.
- Các chỗ app tự cộng số có từ trước (iOS: mục 7; Android: mục 4.1, lời báo anh). Plan này không sửa, chỉ ghi rõ.

## 2. Không được đổi
- **Số và cách tính.**
  - App không tự tính số nghiệp vụ, chỉ đọc API web. Mục 4.3 ghi rõ app được làm phép tính nào.
  - Không đổi số, cách tính, tên nghiệp vụ, quyền xem của web hay app.
- **Chữ.**
  - Số của Vận đơn không bao giờ gọi là "doanh thu", "chốt" hay "bán hàng". Dùng "Đơn chuyển đi", "Doanh số chuyển đi", "Đơn vào Chờ xác nhận", "Người lên đơn".
  - Doanh thu chuẩn là "Tổng cộng" của Pancake theo từng POS, cộng lại. Doanh thu tách Sale / CSKH / MKT, không cộng chung.
  - Số nào cũng ghi rõ là gì và phạm vi nào. Tăng màu xanh, giảm màu đỏ.
  - Nhãn mới giống web từng chữ (bảng ở mục 4.4.4), trừ các chỗ khác có chủ ý ghi ngay dưới bảng đó. Giao diện tiếng Việt.
- **Bảo mật.**
  - Khóa bằng Face ID / vân tay bắt buộc mỗi lần mở app. Có màn che trong trình chuyển app.
  - Phiên đăng nhập chỉ nằm trong Keychain (iOS) / Keystore (Android).
  - Log không bao giờ có dữ liệu cá nhân, SĐT, tên, token hay số thật.
  - Mọi lệnh in log Debug và mọi móc cho lượt tự xem nằm trong `#if DEBUG` (iOS) hoặc sau `if (BuildConfig.DEBUG)` (Android). Bản phát hành không in gì.
- **Màn hình gốc.**
  - Màn app viết bằng SwiftUI / Jetpack Compose. Không dùng WebView ở bất kỳ đâu.
  - Liên kết ra web (Chính sách bảo mật) mở bằng trình duyệt của máy.
  - App chỉ cho anh và các sếp.
- **Repo công khai.**
  - Không đưa số thật, tên khách, email, SĐT, khóa hay bí mật vào code, tài liệu, commit, mô tả PR, ảnh hay video.
  - Video chỉ quay trên site demo (dữ liệu giả).
  - Plan và `CODEX.md` vào repo là commit chỉ có tài liệu.
- **File cấm Codex sửa:** `.github/workflows/*`, `wrangler*.json*`, `migrations/**`, `drizzle/**`, và mọi file web (`app/**`, `lib/**`, `tests/**`, `components/**`).
  - **Ngoại lệ có tên.** Codex chỉ được sửa file workflow khi bước đó ghi tên file trong danh sách "File được sửa". Tổ app kiểm phần đó kỹ hơn (5.5.4, mục 7) và commit riêng.

    | Bước | File workflow | Phần được sửa |
    |---|---|---|
    | I2 | `.github/workflows/ios-preview.yml` | Thêm bước "Kiểm thử giải mã" ngay sau bước "Kiểm thử chuỗi số và ngày" (`avd7td:.github/workflows/ios-preview.yml:89-97`) |
    | I3, I4, I4b, I7 | `.github/workflows/ios-preview.yml` | Đoạn quay `12-xn-kho`, file log của đoạn, tên đoạn trong danh sách nén video (`:315`) |
    | I5a, I5b | `.github/workflows/ios-preview.yml` | Đoạn quay `13-team` như trên |
    | A0 | `.github/workflows/android.yml` (mới) | Cả file, theo 4.5.3 |
    | A1c, A2a | `.github/workflows/android.yml` | Chỉ bước chặn định dạng / log / hộp nổi. A1c: thêm mẫu cấm hộp nổi (4.5.2). A2a: phần định dạng / log xét cả thư mục |
    | A1c | `.github/workflows/android-preview.yml` (mới) | Cả file, theo 4.5.5: hai job, job quay chỉ `contents: read`; job đẩy video có `contents: write` nhưng không checkout mã PR, không Gradle |
    | A8b | `.github/workflows/android.yml` | Chỉ điều kiện chạy `assembleRelease`: về lại chỉ khi `push` vào `main` (A0 tạm cho chạy cả trên `claude/app-android`) |
    | A6, A7, A7c, A7b, A8a, A8b, Phần B | `.github/workflows/android-preview.yml` | Chỉ thêm đoạn quay của bước, trong job quay (A7: thêm cả bước ca máy ảo ở 4.5.5 khi Mac không có emulator). Không đổi `permissions` và job đẩy video |
- **Những gì đang chạy của iOS.**
  - Route cũ, các khóa nhớ `thp_nav_*` (`avd7td:ios/Megatech/Megatech/NavMemory.swift`) giữ nguyên.
  - Đường dẫn tải trước lúc hỏi Face ID phải giữ nguyên từng chữ khi chưa chọn team (`avd7td:ios/Megatech/Megatech/UnlockPrefetch.swift:81-90`).
  - Màn khóa và màn che giữ nguyên (`avd7td:ios/Megatech/Megatech/Security.swift:7-35, 40-82`).
- **Thư viện.**
  - iOS không thêm thư viện.
  - Android chỉ được thêm:
    - `testImplementation("junit:junit:4.13.2")` (A0);
    - `testImplementation("org.json:json:<bản tổ app ghi trong lời giao>")` (A0). Lý do: test JVM đọc JSON bằng `org.json`, mà bản `android.jar` dùng khi test chỉ là vỏ, gọi là ném lỗi;
    - Jetpack Glance, bản tổ app ghi trong lời giao, chỉ ở A12 (Phần B, tùy chọn).
  - Cần thư viện khác thì Codex dừng lại và hỏi.
  - Codex build `--offline`, nên tổ app tải sẵn đúng các bản trên trước A0 và A12 (5.5.3).
- **Lên bản thật.** Không gì vào `main` khi anh chưa duyệt.

## 3. Hiện trạng (file:dòng)

### 3.1 Web (đã lên `main` ngày 14/10)

| Phần | Nơi | Ghi chú |
|---|---|---|
| Đã XN kho, điều kiện | `main:lib/van-don.ts` (`WH_CONFIRMED_SQL`), dùng ở `main:app/api/reports/product-groups/route.ts:105-110` | `status_code NOT IN (0,7) AND (first_confirmed_at IS NOT NULL OR status_code NOT IN (17,6))`, áp trên tập Đơn chốt (`NOT IN (0,6,7)`, ngày `first_closed_at`) |
| Người của mỗi đơn | `main:app/api/reports/product-groups/route.ts:87-91` | `by=care`: `COALESCE(NULLIF(o.care_id,''),o.seller_id)`; `by=seller`: `o.seller_id` |
| Số từng người | `main:app/api/reports/product-groups/route.ts:284-290, 332-337, 418-438` | XN kho chỉ cộng ở dòng tổng của mỗi người (`'__all'`); `pack` thêm `whRate`, `closeRate`, `aov`. `closeRate` luôn = số chia đã chốt ÷ số chia, **không** theo Cách tính của tài khoản |
| Tổng của API | `main:app/api/reports/product-groups/route.ts:342-354` | Cộng cả người rỗng (đơn chưa gán), nên **khác** dòng Tổng của bảng web |
| Dòng Tổng của bảng web | `main:app/product-group-blocks.tsx:1110-1160` | Trình duyệt cộng các dòng đang hiện |
| Danh sách đơn của ô | `main:app/api/reports/product-groups/route.ts:356-396` | `staffId=`, thêm `wh=1` để lấy đơn đã XN kho; SQL `LIMIT 2000`, trả tối đa 500 đơn; SĐT che với người không phải chủ / giám đốc (`:51-52, 394`). Mỗi đơn chỉ có `status_code`, không có tên trạng thái (`:361`). Bảng đơn của web không có cột trạng thái (`main:app/product-group-blocks.tsx:1329-1391`) |
| Bộ nhớ của route | `main@a7d479b:lib/report-memo.ts` | W4, đã lên web thật 14/10 (PR #75): bộ nhớ 3 phút của product-groups và staff-compare tách theo vai trò và nguồn team |
| Định nghĩa | `main:app/api/reports/product-groups/route.ts:445-450` | `definitions.rate`, `definitions.closed`, `definitions.whConfirmed` |
| Dòng phụ đề của bảng web | Sale: `main:app/product-group-blocks.tsx:536, 751`; CSKH: `main:app/team-overview-view.tsx:667-668` | Ghi số chia, tỷ lệ chốt và người được tính |
| Kiểm thử | `main:tests/product-groups-wh-confirmed.test.ts:94-112` | Tổng giống nhau với `dim` tag, main, product; Sale: `whConfirmed` = Vận đơn "đã xác nhận" trừ đơn hủy sau XN |
| So cùng kỳ | `main:app/api/reports/staff-compare/route.ts:20-108` | Chuỗi từng người đã gộp ở máy chủ (tối đa 31 điểm). `mode=custom` mà thiếu `cstart`/`cend` thì trả 400 "Kỳ so sánh không hợp lệ." (`:25-33`) |
| Tham số So cùng kỳ của web | `main:app/staff-compare.tsx:276-306` | Nhớ `thp_cmp_mode`, `thp_cmp_step`, `thp_cmp_kind`; ngày tự chọn mặc định do trình duyệt tính bằng `shiftPeriod(..., 'previous')` (`:283-288`) |
| Nhãn So cùng kỳ | `main:app/staff-compare.tsx:84-195, 205-264` | Kiểu so, mức lùi, kiểu biểu đồ, màu tăng giảm; số ngày tính cả hai đầu (`main:lib/report-time.ts:30-32`) |
| Ô biểu đồ mini | `main:app/staff-compare.tsx:765-924` | Khung 84 × 20; `max` của Cộng dồn tính trên mọi `staff[]` của staff-compare, kể cả người không có dòng trong bảng (`main:app/product-group-blocks.tsx:682-691`) |
| Tỷ lệ chốt theo điểm | `main:app/staff-compare.tsx:97-116` | Trình duyệt tự tính, cần chuyển lên máy chủ cho app (W2) |
| Xem riêng một người (PR #76) | `main@a7d479b:app/product-group-blocks.tsx:599-608, 667-669, 823-835, 1072-1109`; `main@a7d479b:app/staff-compare.tsx:349-363, 405-411, 448-451, 612-631` | Chạm ô mini thì dải So cùng kỳ hiện riêng người đó; mô tả đủ ở bước I7 |
| Chọn ngày tự chọn | `main:app/staff-compare.tsx:560-590` | Từ ngày `max` = đến ngày (`:568`); đến ngày `max` = hôm nay (`:582`) |
| Chọn team | `main:app/team-store.ts:1-40`, `main:app/hr-team-picker.tsx:1-60` | Không nhớ qua lần mở sau (`team-store.ts:3-6`) |
| Câu báo team | `main:app/dashboard.tsx:198-199, 1561-1568` | Hai câu: "Đang xem riêng team …" và "Trang này chưa lọc được theo team …". Không hiện ở trang `config`, `audit` (`:1561`) |
| API nhận `hrTeam` | `resolveHrUnit` ở `main:lib/hr-unit.ts:9-21` | overview, product-groups, staff-compare, van-don, calls, cskh-origin nhận. `/api/reports/sections` (4 bảng) **chưa** nhận |
| Danh sách team | `main:app/api/teams/route.ts:24-27` | `?list=1`; trả `Cache-Control: private, max-age=60` |
| Quyền | `main:lib/access.ts:80-81, 116` | product-groups: `sale-overview`, `cskh-overview`, `overview`; staff-compare: `sale-overview`, `cskh-overview`; teams: `sale-teams`, `cskh-teams`, `van-don` |

### 3.2 iOS (nhánh PR #72, `avd7td`)

| Phần | Nơi | Ghi chú |
|---|---|---|
| Nhánh | `git log 3e4e35a..origin/claude/project-thread-avd7td` | PR #72 có 9 commit (`ae90301` … `e2ec11b`), 52 file. Tách từ `main` ở `3e4e35a`, trước PR #74. Gộp `main` vào nhánh không xung đột: PR #74 không sửa file nào trong `ios/` hay `.github/` |
| File chỉ có trên `avd7td` | `Format.swift`, `FormatSelfTest.swift`, `NavMemory.swift`, `UnlockPrefetch.swift`, `LoadTrace.swift`, `Search.swift` | Không có trên `main`. Phần 14/10 dùng các file này, nên **không ra riêng được khi chưa có lần A** |
| Cách gộp vào `main` | commit `2163361` có đúng một cha `3e4e35a` | `main` gộp kiểu squash |
| Định dạng số, ngày | `avd7td:ios/Megatech/WidgetShared/Format.swift` (`enum Fmt`; `Fmt.span` ở 101-106; `VNDate` ở 130-141) | CI chặn định dạng ở file khác (`avd7td:.github/workflows/ios.yml:46-65`, bỏ qua `Format.swift`, `FormatSelfTest.swift` ở `:50`) |
| Kiểm thử chuỗi | `avd7td:ios/Megatech/Megatech/FormatSelfTest.swift`, gọi ở `avd7td:ios/Megatech/Megatech/MegatechApp.swift:14-20` | Chạy khi `MEGATECH_FORMAT_TEST=1`, in "FORMAT_TEST OK n cases" (`avd7td:.github/workflows/ios-preview.yml:89-97`) |
| `Terms.swift` | chưa có | Plan iOS 11/10 dự định ở bước 1.1b |
| Gọi API | `avd7td:ios/Megatech/Megatech/API.swift:41-96` | `APIError(message, status)` mang câu lỗi của máy chủ (`:41, 71-79`); tự gắn Cách tính vào mọi `/api/reports/*` (`:48`); `transfer(_:sent:via:)` (`:86`); `JSONDecoder()` thường |
| Bộ nhớ đệm | `avd7td:ios/Megatech/Megatech/API.swift:14-31` | `API.session` dùng cấu hình mặc định (có URLCache); `memoryOnlySession` không có URLCache |
| Overview | `avd7td:ios/Megatech/Megatech/API.swift:288-294` | `overviewPath` dùng chung với tải trước lúc hỏi Face ID |
| Vận đơn | `avd7td:ios/Megatech/Megatech/Departments.swift:61-67, 552-615` | `vanDonPath`; `VanDonView` (`ScopeLine` ở 582, `.task(id:)` ở 602) |
| `DayRange.days` | `avd7td:ios/Megatech/Megatech/Departments.swift:31-37` | Số ngày tính cả hai đầu |
| Trang bộ phận | `avd7td:ios/Megatech/Megatech/Departments.swift:458-544` | `DeptPage` có `ScrollView` + `.refreshHost(outer: nil)`, không có `ScrollViewReader`; `DeptDestination` (469-487, `.mkt` → `MarketingView` ở 484); `SaleContent` 491-515; `CskhContent` 518-544 |
| CompareView | `avd7td:ios/Megatech/Megatech/CskhViews.swift:693-833` | Phụ đề "Tỷ lệ chốt = \(MetricPrefs.shared.rateShort)" ở 725; `ScopeLine` ở 729; hàng lọc bộ phận / tìm tên 730-733; ô KPI tự cộng 737-740; `.task(id:)` 823; `.pullToReload` 824 |
| Khung `Embed` | `avd7td:ios/Megatech/Megatech/CskhViews.swift:115-120` | Mở riêng (không nhúng) thì có `ScrollView` riêng, không có `refreshHost` |
| CSKH Tổng quan | `avd7td:ios/Megatech/Megatech/CskhOverview.swift:27-106` | `CskhKpiProgress` ở 32 (tải overview không có team, 204-205); khối `if let t … else …` ở 34-83; "Doanh thu theo nhân viên" ở 64-82; `.task(id: period.key)` ở 85 |
| Tổng quan (tab giữa) | `avd7td:ios/Megatech/Megatech/Home.swift:32-78` | Hàng chip 47-55; cuộn bằng `overviewScroll` chỉ ở trang này (65-69) |
| `OverviewView` | `avd7td:ios/Megatech/Megatech/Home.swift:166-271` | Gọi overview không có team (263) |
| `CenterBlocks` | `avd7td:ios/Megatech/Megatech/Home.swift:276-540` | `key` 298; `filterSuffix` 303-305; `PancakeRefCard` 334; Mục tiêu tháng 336-350; 8 nguồn tải 510-517 |
| Điều hướng | `avd7td:ios/Megatech/Megatech/Shared.swift:238-290`, `avd7td:ios/Megatech/Megatech/NavMemory.swift:189-195, 233-246` | `Route` và `appRoutes()`; `restorable` và `encode` phải liệt kê đủ |
| `StatusChip` | `avd7td:ios/Megatech/Megatech/Shared.swift:219-234` | Cần `name:` và `code:` |
| `OrderListView` | `avd7td:ios/Megatech/Megatech/Shared.swift:92` | Gọi `raw/orders`, không nhận `hrTeam` |
| AppNav | `avd7td:ios/Megatech/Megatech/Tabs.swift:11-26` | Kỳ, POS, nhóm đơn chung |
| Trang theo id | `avd7td:ios/Megatech/Megatech/Tabs.swift:318-347` | `PageDestination`, gồm cả `compare` (330), `cskh-overview` (323) và trang cài đặt |
| Tab Đơn hàng, Thông báo | `avd7td:ios/Megatech/Megatech/Tabs.swift:156, 240` | `AlertsPage` có số; `OrdersHome` |
| Khung dùng chung | `avd7td:ios/Megatech/Megatech/Kit.swift` | `Panel` 111, `SectionHead` 122, `FilterChip` 215, `Segmented` 233, `LoadError.text` 438-462 (400 ra "Không tải được"), `StateView` 466-483 (lỗi chỉ có nút "Thử lại"), `Freshness` 553-567, `RefreshHost` 596-612, `PullToReload` 616-631, `refreshHost` / `pullToReload` 633-636 |
| Log tải | `avd7td:ios/Megatech/Megatech/LoadTrace.swift` | In `[MOC]` chỉ ở bản Debug |
| Lượt tự xem (video) | `avd7td:ios/Megatech/Megatech/Tabs.swift:513-714` | Cả khối trong `#if DEBUG`; `MEGATECH_TOUR`; `DebugTap` 706-713 |
| Phiên bản | `avd7td:ios/Megatech/Megatech.xcodeproj/project.pbxproj:296, 310, 325, 339, 353, 363, 378, 388` | Đang 0.9 (9) cho app và widget. Release `ios-v0.9-9` đã có |
| Phát hành | `avd7td:.github/workflows/ios.yml:165-187` | Đẩy vào `main` mà chưa tăng số thì **xóa và tạo lại** Release cùng tên |
| Thư mục đồng bộ | `avd7td:ios/Megatech/Megatech.xcodeproj/project.pbxproj:46-62` | File `.swift` mới trong `Megatech/` tự vào target app |

### 3.3 Android (`main`)
- 15 file Kotlin, khoảng 4.100 dòng (`main:android/app/src/main/java/vn/megatech/tonghoppos/`). Compose, Material 3, OkHttp.
- Build: AGP 9.4.1, Kotlin compose plugin 2.4.20 (`main:android/build.gradle.kts:2-3`), Gradle 9.7.1. compileSdk/targetSdk 37, minSdk 26, phiên bản 0.1 (1) (`main:android/app/build.gradle.kts:13-21`). **Chưa từng build trên CI**: chưa có workflow Android.
- Ký bản: khóa ngoài repo, mật khẩu đọc từ `local.properties` (`main:android/app/build.gradle.kts:8-9, 22-31`). `local.properties`, `*.jks` đã nằm trong `main:android/.gitignore:3-5`. Đóng gói bằng `android/build-apk.sh`, chỉ chạy được trên macOS, dùng JDK của Android Studio (`:5`).
- Lời gọi API có sẵn: `main:android/app/src/main/java/vn/megatech/tonghoppos/Api.kt:154-180`. Chưa có `sections`, `van-don`, `product-groups`, `staff-compare`, `teams`.

**Điều tốt, giữ lại:**
- `Vault` mã hóa phiên bằng AES-GCM, khóa trong Android Keystore (`Api.kt:31-63`).
- Đăng nhập, duyệt đăng nhập máy tính bằng QR (`Login.kt`, `Security.kt`).
- `MetricPrefs` gắn Cách tính vào mọi báo cáo (`Api.kt:127`).

**Chỗ sai so với luật bảo mật** (đường dẫn viết tắt `…/` = `android/app/src/main/java/vn/megatech/tonghoppos/`):

| Chỗ | Nơi | Vì sao sai |
|---|---|---|
| Mở app từ đầu không khóa | `…/App.kt:84-89` (`Auth.start`: chỉ vào màn Welcome khi `AppLock.enabled && AppLock.canUse`, còn lại gọi `restore()` vào thẳng số); `…/Login.kt:104, 121-125` | Máy chưa cài khóa màn hình, hoặc người dùng đã tắt khóa, là vào thẳng số liệu |
| Khóa tắt được, có thời gian chờ | `…/App.kt:110-140`; khóa cài đặt `lock`, `lock_grace` đọc ở `:121`; công tắc ở `…/System.kt:77-78` | Luật: khóa bắt buộc mỗi lần mở. Đã tắt từ 0.1 thì vẫn tắt nếu còn đọc khóa cũ |
| Màn khóa chỉ làm mờ | `…/App.kt:172, 190` (`blur`, nền `alpha .55`) | Số lộ qua lớp mờ |
| Màn khóa nằm dưới hộp nổi | `…/App.kt:171-180` (chỉ `ApprovalSheet` bị ẩn khi khóa); hộp nổi ở cửa sổ riêng, ví dụ: `ModalBottomSheet` `…/Home.kt:390`, `…/Security.kt:110`; `AlertDialog` `…/Security.kt:205`; `Dialog` `…/System.kt:37`; `DropdownMenu` `…/Kit.kt:370`; `DatePickerDialog` `…/Kit.kt:391`. Đủ 15 chỗ gọi ở 4.5.2 (A1c) | Hộp đang mở khi vào nền sẽ nổi trên màn khóa. iOS đã xử lý bằng cửa sổ che riêng (`avd7td:ios/Megatech/Megatech/Security.swift:40-42`) |
| Sinh trắc học yếu | `…/App.kt:112` (`BIOMETRIC_WEAK or DEVICE_CREDENTIAL`) | Chấp nhận mở khóa khuôn mặt loại yếu |
| Chặn chụp màn hình tắt được | `…/App.kt:143-148` (khóa `secure`), công tắc ở `…/System.kt:81`; `-e secure 0` lưu vĩnh viễn (`:70`) | Luật: luôn che trong trình chuyển app |
| Duyệt đăng nhập máy tính không cần xác thực nếu máy không cài khóa màn hình | `…/Security.kt:134-135` | Ai cầm máy cũng duyệt được |
| Không tắt sao lưu | `main:android/app/src/main/AndroidManifest.xml` không có `allowBackup` (mặc định bật) | Email đăng nhập gần nhất lưu thường (`Api.kt:96-99`) có thể ra bản sao lưu |
| Cookie phiên gửi cho mọi host được gọi | `Api.kt:115-116` (`domain(url.host)`) | Nên chỉ gửi cho danh sách host cố định |
| Bản debug đổi được máy chủ | `MainActivity` mở cho app khác (`AndroidManifest.xml:12-14`); `debugExtras` nhận `base`, `session`, `secure` (`…/App.kt:66-72`) | Đổi `base` sang máy khác là phiên gửi theo |
| Cho phép http thường cả ở bản phát hành | `main:android/app/src/main/res/xml/network_security.xml` (10.0.2.2, localhost) | Chỉ bản debug cần |
| JSON không kiểu, thiếu trường thì ra 0 | `Api.kt:184-198` (`J.d` trả 0.0) | Thiếu số thì hiện 0 thay vì "—", dễ đọc sai |
| User-Agent cứng "0.1" | `Api.kt:128` | Sai khi lên bản mới |
| App tự cộng số nghiệp vụ ở nhiều màn | `…/Cskh.kt:56-58, 342-343`, `…/Home.kt:67, 173, 260`, `…/Metrics.kt:146-147, 176-183`, `…/More.kt:48-49`, `…/Sale.kt:160-161` | Luật: app không tự tính số |
| Định dạng số nằm rải rác | khoảng 18 chỗ `" ₫"` / `String.format` ngoài `Fmt.kt` (`Home.kt`, `More.kt`, `Sale.kt`, `Metrics.kt:163`, `Orders.kt`) | Khó giữ một chuẩn số |

**Khung hiện có:**
- `Screen` ở `…/App.kt:207-217`; `TabStack` ở `:224-233`; `TABS` và `RootTabs` ở `:249-275`.
- Tab CSKH, Sale, MKT: `…/Cskh.kt:29`, `…/Sale.kt:28`, `…/More.kt:28`. Trang con Sale "Nhân viên" là `CompareContent(team)` (`…/Sale.kt:133`). CSKH chưa có trang Tổng quan (`…/Cskh.kt:27`).
- Trang chủ "Điều khiển trung tâm": `HomeTab` (`…/Home.kt:30-63`), có nút Tất cả / Sale / CSKH và `CenterBlocks` (`…/Home.kt:134`).

So với iOS, Android **chưa có**: 4 bảng bộ phận (`/api/reports/sections`), trang Vận đơn, nhớ tab và kỳ, ô tìm đơn kiểu mới, widget, và cả bốn phần 14/10.

## 4. Thiết kế

### 4.1 Thứ tự và nhánh

**Sự thật.**
- Tổ app chỉ được push vào `claude/project-thread-avd7td`. Nhánh khác cần anh cho phép.
- Nhánh này là PR #72 (lần A: 9 commit `ae90301` … `e2ec11b`, 52 file). PR đang chờ hai việc: web sửa tìm kiếm lên bản thật, và anh duyệt video.
- PR #74 không sửa file nào trong `ios/` hay `.github/`. Gộp `origin/main` vào nhánh không xung đột (đã thử bằng `git merge-tree`).
- `main` gộp PR kiểu squash. Sau mỗi lần gộp, nhánh cũ còn các commit đã gộp dưới mã khác.
- 14/10 trên iOS dùng các file chỉ có ở lần A (mục 3.2). Vì vậy 14/10 **không ra trước hoặc ra riêng** khỏi lần A được.

**Khuyên: làm tiếp phần iOS 14/10 trên cùng nhánh PR #72, ra chung một bản 0.10 (build 10).**
- Cái lợi: anh chỉ phải cài lại một lần. Không phải tách nhánh, vì lần A và 14/10 cùng sửa `Tabs.swift`, `Shared.swift`, `NavMemory.swift`.
- Cái giá: bản 0.10 chờ thêm 9 bước Codex (I1–I7) và ba việc web W1, W2, W5 lên bản thật. W4 đã lên web thật 14/10 (PR #75).

**Thứ tự iOS.**
1. **I0 (tổ app):** gộp `origin/main` vào nhánh (để Codex có mã web 14/10, cả PR #75, #76), rồi commit plan và `CODEX.md`.
2. I1 → I2 → I3 → I4 → I4b → I7 → I5a → I5b: mỗi bước một lần chạy Codex, gộp ở bước nào cũng ra một app đúng. I2 chỉ thêm mô hình, chưa có giao diện. I3 ra bảng có Đã XN kho. I4 thêm So cùng kỳ. I4b thêm biểu đồ to (cần W5 trên demo). I7 thêm chạm biểu đồ mini để xem riêng một người, như web thật (PR #76). I5a thêm Team ở 4 trang. I5b thêm câu báo ở các trang còn lại.
3. **I6 (Codex):** tăng số phiên bản app và widget lên số chưa dùng. Bước này **luôn chạy trước mọi lần gộp PR #72**, vì `ios.yml` xóa và tạo lại Release cùng số (`avd7td:.github/workflows/ios.yml:165-187`), mà `ios-v0.9-9` đang là bản anh cài.
4. Tổ app gộp PR #72 vào `main` (squash) khi đủ điều kiện ở I6.

**Nếu anh muốn gộp lần A sớm** (trước khi xong 14/10):
- Chạy I6 trước: lên 0.10 (10). Rồi gộp PR #72.
- Sau khi gộp, tổ app gộp `origin/main` vào nhánh (không cần force push). PR mới từ cùng nhánh khi đó chỉ còn phần chưa gộp.
- Phần 14/10 còn lại ra 0.11 (11), lại qua I6 trước khi gộp.

**Lùi lại sau khi gộp:** revert commit squash bằng một PR mới vào `main` (anh duyệt). Không revert từng bước trên `main` được.

**Android.**
- Khuyên làm ở nhánh riêng `claude/app-android`, cắt từ `main` (câu hỏi 1, mục 8). Lý do: PR #72 đã có 52 file; bản iOS không nên chờ Android.
- CI Android chạy mỗi lần đẩy lên nhánh này (mục 4.5.3). Chưa cần mở PR vào `main` tới lúc phát hành 0.2.
- Nếu anh không cho nhánh riêng, Android làm trên cùng nhánh PR #72. Việc ký APK chỉ chạy trên `main` (mục 4.5.3), nên gộp PR #72 sẽ gọi luôn job ký Android (job chờ anh bấm Duyệt). Khi đó tổ app chỉ gộp khi phần Android cũng đã được anh duyệt.
- Phần A ra `android-v0.2-2`, thứ tự: A0 → A1a → A1b → A1c → A2a → A2b → A6 → A7 → A7c → A7b → A8a → A8b. A7b (xem riêng một người) chạy sau A7c vì dùng biểu đồ to của A7c. Phần B chỉ làm khi anh trả lời "Có" ở câu 3.

**Lời báo anh (gửi kèm plan):**
> Phần iOS của 14/10 làm tiếp trên nhánh PR #72 (lần A) và ra chung bản 0.10, gồm cả chạm biểu đồ mini để xem riêng một người như web anh vừa duyệt (PR #76). 14/10 dùng các file của lần A, nên không ra riêng trước được; anh chỉ cài lại một lần. Bản 0.10 lên khi anh duyệt video lần A và video 14/10, và web đã lên W1, W2, W5 (W4 đã lên web thật 14/10, PR #75). Nếu anh muốn gộp lần A sớm, tổ đổi số bản lên 0.10 trước khi gộp để không ghi đè bản 0.9 đang cài; phần 14/10 khi đó ra 0.11.
>
> Theo lời anh chốt (tiết kiệm hết mức): Codex tự làm hết, kể cả build, chạy thử trên máy ảo, quay video và viết tóm tắt; tổ chỉ đọc tóm tắt và diff, chạy vài lệnh kiểm nhanh, commit và gửi anh. QA chỉ kiểm phần số liệu và bảo mật. Video anh xem lấy từ CI hoặc từ Codex.
>
> Android làm ở nhánh riêng. Bản 0.2 chỉ gồm: khóa bắt buộc, che màn hình, CI và ký bản, và phần 14/10 (bảng Từng nhân viên, Đã XN kho, So cùng kỳ có biểu đồ to và xem riêng một người, chọn team) trên các màn Android đang có. Không có gì khác lên khi anh chưa duyệt; phần Android ngang iOS chờ câu 3. Trước bản Android đầu tiên, anh dán một dòng lệnh vào Terminal trên Mac một lần để tạo khóa ký; không ai phải gõ mật khẩu. Sau đó, mỗi lần ra bản Android anh bấm Duyệt một lần trên GitHub (có thể bấm trong app GitHub trên điện thoại); anh chưa bấm thì không có bản nào được ký. Bước này giữ khóa ký an toàn cả khi có thay đổi lọt vào `main` mà không qua anh.
>
> Bản Android 0.2 vẫn còn các chỗ app tự cộng số có từ 0.1: ô POS và xu hướng ở Trang chủ, Cuộc gọi CSKH, KPI CSKH, các ô tổng ở So sánh nhân viên, Số tham chiếu Pancake, MKT (danh sách đủ ở mô tả PR A2a). iOS còn hai chỗ như vậy: ô KPI của So sánh nhân viên và "% doanh thu đội" ở CSKH. Plan này không sửa các chỗ đó, ghi để làm ở plan sau.

### 4.2 Hợp đồng API

#### 4.2.1 Bảng Từng nhân viên: `GET /api/reports/product-groups`
Tham số app gửi, cùng thứ tự tham số với web (`main:app/product-group-blocks.tsx:556-570`). Đường dẫn của app phải trùng từng ký tự với chuỗi plan quy định dưới đây, không cần trùng chuỗi web: web dựng bằng `URLSearchParams` nên dấu phẩy ở `posIds` thành `%2C`, còn app tự gắn Cách tính phía sau (gạch đầu dòng thứ ba dưới đây). `DecodeSelfTest` (I2) và `ModelsTest` (A2b) so với chuỗi này.
```
/api/reports/product-groups?start=YYYY-MM-DD&end=YYYY-MM-DD&posIds=<mã,mã|rỗng>&team=sale&dim=tag&basis=both&by=seller[&hrTeam=<mã team>]
```
- CSKH gửi `team=cskh&by=care`.
- `posIds` rỗng nghĩa là mọi POS (`route.ts:69-73`).
- App tự gắn tham số Cách tính phía sau (`avd7td:ios/Megatech/Megatech/API.swift:48`). Route này bỏ qua các tham số đó: `closeRate` luôn theo một định nghĩa (`route.ts:332-337, 445`).
- Dùng `dim=tag&basis=both` như mặc định của web, để số trùng web. App bỏ qua `byGroup`, `groups`, `tags`, `untagged`.
- Không gửi `tag`, `status`, `staffIds`.

Trường app đọc (tên đúng như JSON; số có thể `null` thì để kiểu `Double?`):

| Chỗ | Trường |
|---|---|
| Gốc | `period {start,end}`, `team`, `staff[]`, `definitions.whConfirmed`, `definitions.closed`, `definitions.rate`, `orders` (null, hoặc mảng khi có `staffId`) |
| Mỗi `staff[]` | `sellerId`, `name`, `department` (có thể null), `created`, `createdClosed`, `closed`, `closedNet`, `closeRate?`, `aov?`, `whConfirmed`, `whRate?`, `selfConfirmed`, `unknownConfirmer`, `waiting` |
| Thêm sau W1 (để tùy chọn) | mỗi `staff[]`: `warehouseConfirmed`, `otherUnconfirmed`, `closedFromCreated`, `closedFromEarlier`, `createdOpen`; gốc: `staffTotal` (cùng các trường trên, thêm `people`). Nghĩa của `waiting` (và `backToWaiting` nếu có) theo W1 (4.2.6) |

**Danh sách đơn của một người.** Nối thêm vào đúng đường dẫn trên, như web (`main:app/product-group-blocks.tsx:600`): `&staffId=<sellerId>`, rồi `&wh=1` nếu chỉ lấy đơn đã XN kho. Trả về cả `staff[]` và `orders[]` trong cùng một lần.

> **Bẫy tên trường.** Trong JSON này, `first_confirmed_at` là **giờ chốt** (bí danh của `first_closed_at`). `confirmed_at` mới là **giờ XN kho** (`route.ts:361`). App phải đặt `CodingKeys` rõ: `closedAt = "first_confirmed_at"`, `whConfirmedAt = "confirmed_at"`.

Mỗi đơn, app chỉ đọc các trường sau (`route.ts:360-396`). Trường khác JSON có thì bỏ qua (giải mã mặc định đã bỏ qua khóa lạ):

| Trường JSON | Tên trong app | Nghĩa |
|---|---|---|
| `id` | `id` | Mã đơn trong hệ thống, dùng mở `Route.order(id)` |
| `source_order_id` | `orderCode` | Mã đơn Pancake |
| `pos_id`, `posName` | `posId`, `posName` | POS |
| `created_at` | `createdAt` | |
| `first_confirmed_at` | `closedAt` | Giờ chốt |
| `confirmed_at` | `whConfirmedAt` | Giờ XN kho |
| `confirm_by_name` | `confirmer` | Người bấm Đã xác nhận |
| `net` | `net` | Tiền đơn sau giảm |
| `products` | `products` | Tên sản phẩm |

- **Không** đọc `phone`, `customer_name`: màn danh sách không hiện. Với chủ và giám đốc, máy chủ trả hai trường này không che (`route.ts:51-52, 394`). Màn một đơn tự tải số của nó.
- **Không** đọc `status_code` và không hiện trạng thái: máy chủ không trả tên trạng thái, bảng đơn của web cũng không có cột này. App không tự đổi mã ra tên.

#### 4.2.2 So cùng kỳ: `GET /api/reports/staff-compare`
Tham số, cùng thứ tự với web (`main:app/staff-compare.tsx:292-306`). Như 4.2.1: đường dẫn của app trùng chuỗi plan quy định dưới đây, không cần trùng chuỗi web.
```
/api/reports/staff-compare?start&end&posIds&team&by&mode=<previous|weekday|monthday|year|custom>(&step=n | &cstart&cend)[&hrTeam]
```
- `step` luôn gửi khi không phải `custom`, kể cả khi bằng 1. Chỉ nhận các mức: previous 1, 2, 3, 4; weekday 1, 2, 3, 4, 8; monthday 1, 2, 3, 6, 12; year 1, 2 (`main:app/staff-compare.tsx:154-159`). Mức đã nhớ không hợp kiểu so thì dùng 1 (`:289-290`).
- `custom` gửi `cstart`, `cend` và không gửi `step`. Thiếu một trong hai thì máy chủ trả 400 (`route.ts:25-33`). Cách app lấy hai ngày này ở mục 4.4.3.
- `team`, `by` như 4.2.1.

Trường app đọc (`route.ts:98-108`):
- `mode`, `step`, `bucket` ("hour" hoặc "day"), `group`, `period {start,end}`, `compare {start,end,cutoff}` (`cutoff` dạng "HH:MM" hoặc null).
- `current.total` và `previous.total`: `{closed, closedNet, created, createdClosed, closeRate?}`.
- `staff[]`: `{sellerId, current, previous, series {current: [[closed, closedNet, created, createdClosed]], previous: [...]}}`.
- Thêm sau W2 (để tùy chọn): `staff[].seriesRate {current: [Double?], previous: [Double?]}` và `rowsTotal {current, previous, series, seriesRate}`.
- Thêm sau W5 (để tùy chọn): `chart {len, current: [ChartPoint?], previous: [ChartPoint?]}`, mỗi `ChartPoint` là `{closed, closedNet, closeRate?, cumClosed, cumClosedNet}`; mỗi `staff[]` có `chart` cùng dạng (biểu đồ to theo một người, I7 / A7b). Luật cắt, gộp, null ở mục 4.2.6.

`staff[]` không có tên. App nối tên bằng `sellerId` với bảng ở 4.2.1.

#### 4.2.3 Danh sách team: `GET /api/teams?list=1`
- Trả `{teams: [{id, name, office (có thể null), dept ("sale"|"cskh"), people, mentor (có thể null)}]}` (`main:app/api/teams/route.ts:24-27`).
- Chỉ mở cho tài khoản xem được `sale-teams`, `cskh-teams` hoặc `van-don` (`main:lib/access.ts:116`).
- Máy chủ trả `Cache-Control: private, max-age=60` (`route.ts:27`). App **không** dùng bản nhớ, để team vừa đổi tên hoặc xóa hiện ngay:
  - iOS: `API.hrTeams()` dựng request bằng `makeRequest`, đặt `cachePolicy = .reloadIgnoringLocalCacheData`, gửi qua `transfer(req, sent: SessionStore.token, via: API.memoryOnlySession)` (không ghi xuống máy).
  - Android: client OkHttp hiện không có `Cache`. Nếu sau này thêm thì lời gọi này dùng `CacheControl.FORCE_NETWORK`.

#### 4.2.4 `hrTeam` trên các báo cáo khác
- `/api/reports/overview` nhận `&hrTeam=` và trả thêm `hrTeam {id,name,dept}|null`, `hrTeamDropped` (`main:app/api/reports/overview/route.ts:46-56`).
- `/api/reports/van-don` cũng vậy (`main:app/api/reports/van-don/route.ts:33-37, 66-68`).
- product-groups, staff-compare nhận như trên.
- `calls`, `cskh-origin` cũng nhận, nhưng plan này chưa gửi: các trang đó hiện câu "Trang này chưa lọc được theo team".
- Team chỉ áp khi hợp bộ phận của trang. Trang chung (team `all`) áp mọi team (`main:app/team-store.ts:31-34`, `main:lib/hr-unit.ts:18-20`).

#### 4.2.5 Lỗi máy chủ trả
- `400 "Mã team không hợp lệ."` và `400 "Không tìm thấy team này bên web nhân sự (có thể đã đổi tên hoặc xoá)."` (`main:lib/hr-unit.ts:12, 16`).
- `400 "Kiểu so sánh không hợp lệ."`, `"Kỳ so sánh không hợp lệ."`, `"Khoảng ngày không hợp lệ."` (`staff-compare/route.ts:25-33`).
- `LoadError.text` đổi mọi lỗi 400 thành "Không tải được", và `StateView(error:)` chỉ có nút "Thử lại" (`avd7td:ios/Megatech/Megatech/Kit.swift:438-462, 481`). Vì vậy:
  - Lỗi 400 khi đang áp team: hiện `HrTeamErrorView` (mục 4.4.5) với nguyên câu của máy chủ (`APIError.message`) và nút "Bỏ chọn team".
  - Lỗi 400 của staff-compare khi không áp team: hiện `StateView(error: <APIError.message>)` có nút "Thử lại".
  - Lỗi khác: như cũ, qua `LoadError.text`.
  - `Kit.swift` không sửa.

#### 4.2.6 Khoảng trống API, giao Tổ web tổng (không phải Codex của plan này)

Tổ web tổng viết plan riêng trong `docs/plans/` trên nhánh demo theo luật web (`demo:AGENTS.md:40-41`). Mỗi bước W có nhánh `codex/...` riêng, PR vào demo, rồi lên bản thật khi anh duyệt. Bảng dưới là yêu cầu của app.

**Thứ tự:** W1 → W2 → W5. W2 dùng `staffTotal.people` của W1. W5 sửa cùng file với W2. W3 làm lúc nào cũng được. W4 đã xong.

| Mã | Bắt buộc? | Việc | Vì sao app cần | Cách kiểm |
|---|---|---|---|---|
| W4 | Đã xong | Đã lên web thật 14/10 (PR #75, `4a4db37`): bộ nhớ 3 phút của product-groups và staff-compare tách theo vai trò và nguồn team. | — | — |
| **W1** | Bắt buộc | product-groups thêm, không đổi trường cũ (trừ nghĩa `waiting` nếu chọn cách khuyên dưới đây): mỗi `staff[]` có `warehouseConfirmed` = whConfirmed − selfConfirmed − unknownConfirmer; `otherUnconfirmed` = max(0, closed − whConfirmed − waiting); `closedFromCreated` = min(closed, createdClosed); `closedFromEarlier` = max(0, closed − createdClosed); `createdOpen` = max(0, created − createdClosed). Gốc có `staffTotal` = `pack` của tổng các `staff[]` có mã (cộng các trường trên), kèm `people` = số người. **Đơn đã XN kho rồi bị chuyển lại Chờ xác nhận** (`status_code` 17 có `first_confirmed_at`): hiện bị đếm ở cả "Đã XN kho" (`whConfirmed`) lẫn "Còn Chờ xác nhận" (`waiting` đếm mọi đơn 17, `route.ts:109`), nên các dòng giải thích có thể cộng lớn hơn Đơn chốt (web ẩn "Khác" khi âm, `product-group-blocks.tsx:986`). Tổ web tổng chọn một nghĩa và ghi vào `definitions`. Khuyên: `waiting` chỉ đếm đơn 17 chưa XN kho; khi đó `otherUnconfirmed` = closed − whConfirmed − waiting không bao giờ âm, các dòng cộng đúng bằng Đơn chốt. Hoặc: giữ `waiting`, thêm trường riêng `backToWaiting` (đơn 17 đã XN kho), `otherUnconfirmed` = closed − whConfirmed − (waiting − backToWaiting); app thêm dòng cho trường này theo chữ của web ở bản plan sau. Đổi nghĩa `waiting` là đổi số web đang hiện: ghi trong plan của web để anh duyệt. | Dòng Tổng của bảng web là trình duyệt cộng các dòng (`product-group-blocks.tsx:1110-1160`). Còn `total` của API cộng cả đơn chưa gán người (`route.ts:342-354`), nên khác. Các dòng giải thích cũng do trình duyệt trừ (`:880-1023`). App không được tự cộng, tự trừ, chỉ hiện số máy chủ trả. | Test: trường mới có ở mọi `dim`; trên demo `staffTotal` khớp dòng Tổng của bảng web khi không chọn người; thêm ca có đơn 17 đã XN kho (dữ liệu demo hiện chưa có ca này); với mỗi người, kể cả người có đơn đó, các dòng giải thích cộng đúng theo nghĩa đã chọn (cách khuyên: Kho xác nhận + Người chốt tự bấm + Không rõ + Còn Chờ xác nhận + Khác = Đơn chốt); số cũ không đổi (trừ `waiting` nếu chọn cách khuyên). |
| **W2** | Bắt buộc | staff-compare thêm: `staff[].seriesRate` = tỷ lệ chốt từng điểm đã gộp, cùng công thức `pointValue` (`staff-compare.tsx:97-116`). `rowsTotal` = tổng `current`, `previous`, `series`, `seriesRate` của những người có số ở **kỳ đang xem** (cùng tập người với bảng). | Biểu đồ mini kiểu Tỷ lệ chốt, và ô So cùng kỳ ở dòng Tổng (`product-group-blocks.tsx:1228-1258`). | Test: `seriesRate` trùng `pointValue` của web ở mọi điểm; `rowsTotal` khớp ô So cùng kỳ ở dòng Tổng của web; số người của `rowsTotal` bằng `staffTotal.people`. |
| **W5** | Bắt buộc | staff-compare thêm `chart` (cả đội) và `staff[].chart` (từng người, cùng dạng), tính ở máy chủ đúng như biểu đồ to của trình duyệt (`CompareStrip`, `main:app/staff-compare.tsx:366-412`), theo luật ở danh sách "W5: luật của `chart`" ngay dưới bảng. **Bắt buộc** đổi `CompareStrip` sang đọc `chart`, và đọc `staff[].chart` ở chế độ xem riêng một người (prop `focus`, đã lên web thật ở PR #76; hiện vẽ từ `staff[].series`, `main@a7d479b:app/staff-compare.tsx:405-411`), để web và app vẽ từ cùng một số. | Biểu đồ to (I4b, A7c) và biểu đồ to theo một người (I7, A7b). App không được tự gộp điểm hay cộng dồn (mục 4.3). Web đang cắt theo giờ máy lúc vẽ (`seriesCut`, `vnHourNow()`, `:125-126`): khi bản nhớ 3 phút vắt qua đầu giờ, web vẽ thêm một điểm 0 mà số chưa có. Web không đọc `chart` thì 6.2.10 có lúc lệch một điểm. | Test: với cùng dữ liệu, `chart` bằng kết quả hàm gộp hiện tại của trình duyệt ở cả `bucket` hour và day, `group` 1 và lớn hơn 1, có và không có `cutoff`, hai kỳ dài khác nhau (30 so 31 ngày, Tự chọn ngày); `closeRate` của điểm gộp tính trên tổng, có ca điểm không có số chia (null); kiểu giờ có `group` 1; `staff[].chart` bằng kết quả chế độ `focus` của web (PR #76) cho từng người; biểu đồ to của web demo (cả đội và xem riêng) không đổi hình, trừ điểm thừa lúc vắt qua đầu giờ. |
| W3 | Nên làm | `/api/reports/sections` nhận `hrTeam`. | Web hiện báo "Đang xem riêng team" ở Tổng quan POS (`dashboard.tsx:199, 1565`), nhưng 4 bảng đầu trang không lọc theo team (`overview-sections.tsx:96-97`). Web và app cùng lệch. Trước khi có W3, app ghi rõ 4 bảng chưa lọc theo team. | Test: `?hrTeam=` lọc 4 bảng như overview; không có `hrTeam` thì số y như cũ. |

**W5: luật của `chart`** (áp cho cả `chart` và `staff[].chart`; số dòng ở `main:app/staff-compare.tsx`):
- **Dạng.** `{len, current: [ChartPoint?], previous: [ChartPoint?]}`; `ChartPoint` = `{closed, closedNet, closeRate, cumClosed, cumClosedNet}`.
- **Gộp.** Điểm thứ i gộp `group` ngày liền nhau, như hàm `pack` (`:371-387`). `group` chỉ áp cho kiểu ngày. Kiểu giờ luôn là 1, như web (`r.bucket === 'day' ? group : 1`, `:366`). Máy chủ hiện đã trả 1 cho kiểu giờ; vẫn ghi rõ và có test.
- **Số điểm.** `len` = 24 khi `bucket == "hour"`. Kiểu ngày: `len` = số điểm đã gộp của kỳ dài hơn (`:392`). Hai kỳ dài khác nhau (Tự chọn ngày, tháng 30 so 31 ngày): kỳ ngắn hơn có null ở cuối.
- **Cắt theo giờ.** Chỉ cắt khi `bucket == "hour"` và có `cutoff`. Số điểm có số là `n = Int(HH của cutoff) + 1`, áp cho **cả hai kỳ**. Kiểu ngày không bao giờ cắt, kể cả kỳ nhiều ngày kết thúc hôm nay (web `seriesCut` chỉ áp cho giờ, `:125-126`). Giờ lấy từ `cutoff` của máy chủ, không lấy giờ máy.
- **Null.** Điểm i của một kỳ là null (mọi trường, kể cả `cumClosed`, `cumClosedNet`) khi i vượt số điểm của chính kỳ đó, hoặc i ≥ n khi cắt theo giờ. Như web: `cur` / `prev` là null khi `i ≥ curLen` / `prevLen` (`:390-401`).
- **`closeRate` của điểm đã gộp.** Tính trên tổng `created`, `createdClosed` của các ngày trong điểm: min(tổng `created`, tổng `createdClosed`) ÷ tổng `created` × 100, như `pointValue` (`:97-116`). Không lấy trung bình tỷ lệ từng ngày. Tổng `created` bằng 0 thì null, đường đứt ở điểm đó.
- **Cộng dồn.** `cumClosed`, `cumClosedNet` cộng `closed`, `closedNet` từ đầu kỳ tới điểm i (`:393-401`).
- **`staff[].chart`.** Cùng dạng, cùng `len`, cùng các luật trên, tính từ số của riêng người đó (cùng số với `staff[].series`, máy chủ đã gộp theo `group`). Như chế độ `focus` của web thật (PR #76): biểu đồ to theo một người vẽ từ chuỗi của người đó, không gộp `points` cả đội (`main@a7d479b:app/staff-compare.tsx:405-411`). App vẽ biểu đồ to theo một người (I7, A7b) từ trường này, không tự cộng dồn.

**Trạng thái (14/10):** W4 đã lên web thật (PR #75). W1, W2, W5 chưa có trên web thật.

W1, W2, W5 phải lên web thật trước khi phát hành iOS 0.10 và Android 0.2 (W4: đã lên web thật 14/10, PR #75). Bản demo của web cần có W1, W2, W5 trước khi Codex làm I3, I4, I4b, I7 (Android A6, A7, A7c, A7b), vì video quay trên demo.

### 4.3 App được tính gì

| App được làm | App không được làm |
|---|---|
| Định dạng số và ngày (chỉ trong `Format.swift` / `Fmt.kt`) | Cộng số của nhiều người (dòng Tổng) |
| Sắp xếp theo số máy chủ trả | Trừ ra "Kho xác nhận", "Khác", "Từ số chia trước đó", "Chưa chốt / hủy" |
| Hình học biểu đồ: co giãn, chiều cao cột, cắt theo giờ `cutoff` (biểu đồ mini); hiệu kỳ này − kỳ so của từng điểm để vẽ cột Chênh lệch. Hiệu này chỉ hiện thành số ở hộp chạm biểu đồ to (dòng dưới) | Tính tỷ lệ chốt từng điểm |
| % đổi giữa hai số máy chủ trả, hiệu điểm giữa hai tỷ lệ máy chủ trả, và hiệu giữa hai số máy chủ trả của cùng một điểm (hộp chạm biểu đồ to), qua hàm Fmt có kiểm thử (như `Change` của web, `staff-compare.tsx:229-264`, và dòng "Chênh lệch" của hộp chạm, `:473-486`) | Gộp điểm biểu đồ, tính ngày của kỳ so |
| So số đơn trong danh sách với số của dòng **trong cùng một lần trả** (mục 4.4.2), để báo "đang hiện n đơn đầu" | Tính bất kỳ số nào hiện ra mà máy chủ chưa trả |
| Đếm số ngày của kỳ (tính cả hai đầu, `DayRange.days`) để chọn **chữ** nhãn mức lùi | Tự đổi mã trạng thái ra tên |
| Ghi nhãn ngày trên trục và trong hộp chạm của biểu đồ to: cộng `i × group` ngày vào `period.start` / `compare.start` máy chủ trả (chỉ là chữ, qua `VNDate`) | Gộp điểm hay cộng dồn cho biểu đồ to (W5 trả sẵn) |

**Khi W1 chưa có.** App vẫn chạy, nhưng:
- Không có dòng Tổng.
- Bảng giải thích Đã XN kho chỉ hiện "Đã XN kho", "Trong đó người chốt tự bấm Đã xác nhận", "Trong đó không rõ người xác nhận", "Còn Chờ xác nhận".
- Bảng giải thích Số chia chỉ hiện "Số chia (đơn lên trong kỳ)" = `created` và "Trong đó đã chốt" = `createdClosed`, kèm định nghĩa. Không có dòng "Chưa chốt / hủy".
- Bảng giải thích Đơn chốt chỉ hiện "Đơn chốt trong kỳ" = `closed`, kèm `definitions.closed`. Không có dòng "Từ số chia kỳ này" / "Từ số chia trước đó".

**Khi W2 chưa có.**
- Biểu đồ mini ở chỉ số Tỷ lệ chốt chỉ hiện "trước x%" và mức đổi, không có đường hay cột.
- Ô So cùng kỳ ở dòng Tổng để trống ở cả ba kiểu biểu đồ.

**Khi W5 chưa có.** Không vẽ biểu đồ to, không có câu báo. Dải chọn và hai số tổng vẫn như I4.

### 4.4 iOS

#### 4.4.1 Đặt ở đâu
- **Sale.**
  - Trong `CompareView` (`avd7td:ios/Megatech/Megatech/CskhViews.swift:693-833`), khi `effTeam == "sale"` và `auth.me?.canView("sale-overview") == true`.
  - Chèn `StaffTableBlock(team: "sale", by: "seller", period: period, pos: pos, product: product)` ngay sau lời gọi `ScopeLine(period: period, pos: pos, product: product)`, trước `HStack` lọc bộ phận / tìm tên. Tìm chỗ chèn theo tên hàm, không theo số dòng (bước trước làm lệch dòng).
  - Lý do đặt trên: hàng lọc và ô tìm không áp vào bảng mới, nên bảng đứng trên để khỏi hiểu nhầm.
- **CSKH.**
  - Trong `CskhOverviewView` (`avd7td:ios/Megatech/Megatech/CskhOverview.swift`), chèn **sau dòng 83**, tức sau cả khối `if let t = data?.current.total { … } else if error == nil { … }`, ngoài khối đó. Nếu chèn trong khối thì bảng mất khi overview chưa có số.
  - Điều kiện `canView("cskh-overview")`. Gọi `StaffTableBlock(team: "cskh", by: "care", period: period, pos: pos, product: product)`. Khối cũ giữ nguyên.
- **Kéo để làm mới.**
  - Khi trang được nhúng (`embedded == true`), `DeptPage` đã có `refreshHost` (`Departments.swift:463`): khối mới dùng `.pullToReload` như mọi khối khác.
  - Khi trang mở riêng (`embedded == false`), `Embed` tự có `ScrollView` mà không có `refreshHost` (`CskhViews.swift:115-120`), nên `.pullToReload` của khối mới không được gọi.
  - Sửa: `StaffTable.swift` thêm `extension View { @ViewBuilder func pageReload(embedded: Bool, _ action: @escaping () async -> Void) -> some View }`: nhúng thì `pullToReload(action)`, mở riêng thì `refreshHost(action)`.
  - Trong `CompareView` và `CskhOverviewView`, thay `.pullToReload { await load() }` bằng `.pageReload(embedded: embedded) { await load() }`. Số và giao diện cũ không đổi.
- Không thêm trang con mới, không đổi trang mặc định.

#### 4.4.2 Bảng
- **File mới** `ios/Megatech/Megatech/StaffTable.swift`, gồm:
  - `StaffTableBlock` (khối).
  - `StaffRowsTable` (lưới).
  - `WhySheet` (bảng giải thích một ô: tiêu đề, các dòng, định nghĩa).
  - `StaffOrdersView` (danh sách đơn).
  - `pageReload(embedded:_:)` (mục 4.4.1).
- **Bố cục.**
  - `Panel` có `SectionHead` "Từng nhân viên Sale" / "Từng nhân viên CSKH".
  - Ngay dưới là dòng phụ đề nhỏ (chữ ở bảng 4.4.4), ghi số tính theo ai. Trên trang CSKH, dòng này đứng ngay dưới khối "Doanh thu theo nhân viên" (khối cũ tính theo cách khác), nên phải có.
  - Cột tên ghim bên trái, rộng 132pt. Sáu cột số cuộn ngang trong một `ScrollView(.horizontal)`. Mỗi dòng cao cố định 56pt để hai bên thẳng hàng.
  - Hiện 10 dòng đầu theo thứ tự đang sắp, nút "Xem cả {n} người" mở hết.
  - Dòng Tổng luôn ở cuối, chỉ khi có `staffTotal` (W1) và `staffTotal.people > 1`.
- **Sắp xếp.** Mặc định Doanh thu giảm dần (`product-group-blocks.tsx:658`). Chạm tiêu đề cột thì đổi chiều. Cột So cùng kỳ sắp theo mức đổi.
- **Các ô** (giống web `product-group-blocks.tsx:869-1056`):
  - Tên: tên, dưới là bộ phận.
  - Số chia: `created`.
  - Đơn chốt: `closed`. Là nút, mở danh sách đơn chốt (`staffId`, không `wh`).
  - Tỷ lệ chốt: `Fmt.pct(closeRate)`, dưới "{createdClosed}/{created} đã chốt".
  - Đã XN kho: `Fmt.pct(whRate)`, dưới là nút "**{whConfirmed}**/{closed} đơn chốt". Nút mở danh sách `wh=1`.
  - Doanh thu: `Fmt.shortMoney(closedNet)`.
- **Ô giải thích.** Chạm ô mở `WhySheet`:
  - Định nghĩa Đã XN kho lấy từ `definitions.whConfirmed`, Đơn chốt từ `definitions.closed` của máy chủ, không viết cứng.
  - Tỷ lệ chốt: dùng câu định nghĩa từng ô của web (bảng 4.4.4). Không lấy `definitions.rate`, vì câu đó nói cả về nhóm sản phẩm mà app không có.
  - Dòng phụ đề của bảng ghi định nghĩa Tỷ lệ chốt của bảng, kèm câu "không theo Cách tính". Lý do: phụ đề `CompareView` ngay trên ghi "Tỷ lệ chốt = {Cách tính của tài khoản}" (`CskhViews.swift:725`), còn bảng mới luôn theo một định nghĩa của máy chủ.
- **Danh sách đơn** (`StaffOrdersView`):
  - Đi bằng `Route.staffOrders(StaffOrderQuery)` mới.
  - Mỗi dòng: "#{mã đơn} · {POS}", giờ chốt, giờ XN kho, người XN, tiền đơn, tên sản phẩm (một dòng, cắt bớt). Không có SĐT, tên khách, trạng thái (mục 4.2.1). Chạm dòng mở `Route.order(id)` sẵn có.
  - Có `StateView` khi đang tải, rỗng hoặc lỗi.
  - **Kiểm số đơn.** So `orders.count` với số của chính người đó trong `staff[]` **của cùng lần trả**: `closed` khi không có `wh`, `whConfirmed` khi `wh=1`. Không lấy số của bảng đã tải trước đó (route nhớ 3 phút, hai lần trả có thể khác nhau). Ít hơn thì hiện "Đang hiện {n} đơn đầu trong {N} đơn".
- **Route mới** `case staffOrders(StaffOrderQuery)` thêm vào `enum Route` (`Shared.swift:238-263`) và `appRoutes()` (`:267-290`).
  - Không lưu để mở lại, vì tiêu đề mang tên người.
  - Thêm vào nhánh `return false` của `restorable` (`NavMemory.swift:191`) và nhánh `break` của `encode` (`NavMemory.swift:240`).
  - Swift bắt buộc switch đủ, nên quên là không build được.
- **Tải.**
  - Ở I3: `.task(id: "\(period.key)|\(pos)|\(team)")`. I5a nối thêm `|\(mã team đang áp hoặc rỗng)`.
  - `LoadTrace("bang-nhan-vien", requests: 1)`.
  - `Freshness` 60 giây.
  - `.pullToReload` để kéo trang là tải lại cùng các khối khác (mục 4.4.1).
- **Nhóm đơn.** Khi bộ lọc nhóm đơn khác "Tất cả", dưới tiêu đề ghi: "Bảng này chưa lọc theo nhóm đơn: số của mọi sản phẩm." (cùng kiểu câu MKT ở `Home.swift:59`).

#### 4.4.3 So cùng kỳ
- **File mới** `ios/Megatech/Megatech/StaffCompare.swift`, gồm `CompareControls`, `CompareCell` và `CompareState`.
  - `CompareState` lưu kiểu so, mức lùi và kiểu biểu đồ bằng `@AppStorage("thp_cmp_mode")` (mặc định "previous"), `"thp_cmp_step"` ("1"), `"thp_cmp_kind"` ("wave"). Cùng khóa với web (`staff-compare.tsx:276-282`).
  - Chỉ số "Từng nhân viên" không nhớ; mặc định Đơn chốt (`product-group-blocks.tsx:550-552`). Thứ tự nút: Đơn chốt, Doanh thu, Tỷ lệ chốt, như web hiện tại.
  - **Chuẩn bị cho I7** (bước chính, chạy sau I4b): `CompareState` có `var focusId: String? = nil` (không lưu xuống máy); phần hai số tổng nhận tham số `focus`. I4 chưa có giao diện nào đổi `focusId`. Biểu đồ to (I4b) nhận `CmpChart` làm tham số, để I7 truyền `staff[].chart` của người đang xem. Cách xem riêng một người ghi đủ ở bước I7.
- **Dải chọn** (nằm trên bảng, dưới dòng phụ đề):
  - Hàng 1: chữ "So cùng kỳ", `Menu` kiểu so (5 nhãn `MODE_LABEL`), `Menu` "Lùi bao xa" (ẩn khi `custom` hoặc chỉ có 1 mức).
  - Kiểu `custom`: hai `DatePicker` "Kỳ so từ ngày", "Kỳ so đến ngày".
    - Ngày giữ trong bộ nhớ của màn (không lưu xuống máy), như web.
    - **Chưa có ngày** (vừa chọn Tự chọn ngày, hoặc mở lại app khi `thp_cmp_mode` đã là "custom"): gọi trước `mode=previous&step=1` (cùng các tham số khác). Điền hai ngày bằng `compare.start` / `compare.end` máy chủ trả, rồi mới gọi `mode=custom`. Không bao giờ gửi `custom` thiếu ngày. App không tự tính ngày kỳ so.
    - Giờ Việt Nam: hai `DatePicker` đặt `.environment(\.timeZone, VNDate.tz)`. Ngày gửi đi viết bằng `VNDate.string(_:)`, đọc vào bằng `VNDate.date(_:)` (`Format.swift:130-141`). Máy đặt múi giờ khác vẫn ra đúng ngày.
    - Giới hạn như web (`staff-compare.tsx:568, 581-582`): Từ ngày `in: ...đến ngày`; Đến ngày `in: từ ngày...hôm nay (giờ VN)`.
    - Từ ngày lớn hơn đến ngày thì không gửi, hiện câu nhắc.
  - Hàng 2: `Segmented` Lên xuống / Chênh lệch / Cộng dồn.
  - Hàng 3: "Từng nhân viên:" `Segmented` Đơn chốt / Doanh thu / Tỷ lệ chốt.
  - Hai số tổng:
    - "Kỳ này · {curText}" kèm số `current.total`.
    - "{cmpLabel} · {cmpText}" kèm số `previous.total`.
    - Mức đổi và chữ "so với kỳ so".
    - `curText` là "Hôm nay" khi kỳ là hôm nay, còn lại là `Fmt.cmpSpan(period.start, period.end)`; `cmpText` là `Fmt.cmpSpan(compare.start, compare.end)`. Có `cutoff` thì cả hai thêm " tới {cutoff}" (`staff-compare.tsx:414-419`).
  - Có `cutoff` thì thêm dòng "Kỳ đang xem chưa hết ngày nên kỳ so cũng chỉ tính tới {cutoff}." (`staff-compare.tsx:611-614`).
- **Nhãn mức lùi và tên kỳ so** (chỉ là chữ, không phải số nghiệp vụ):
  - `ngày` = `days` của `period` máy chủ trả, kiểu `API.DayRange` (`Departments.swift:31-37`), tính cả hai đầu như `daysBetween` của web (`main:lib/report-time.ts:30-32`). Không lấy hiệu end − start.
  - `stepLabel` (`staff-compare.tsx:167-176`): previous "{n} kỳ trước"; weekday "{n} tuần trước" khi `ngày ≤ 7`, còn lại "lùi {n × ⌈ngày/7⌉} tuần"; monthday "{n} tháng trước"; year "{n} năm trước".
  - `cmpLabel` (`staff-compare.tsx:184-195`): custom → "Tự chọn ngày"; n == 1 và (kiểu so khác weekday, hoặc `ngày ≤ 7`) → nhãn `MODE_LABEL` của kiểu so; còn lại previous "Lùi {n} kỳ", weekday "Cùng thứ, {stepLabel}", monthday "Cùng ngày {n} tháng trước", year "Cùng kỳ {n} năm trước".
- **Ô biểu đồ mini** (`CompareCell`, vẽ bằng `Path` / `Canvas`, khung 84 × 20, theo `staff-compare.tsx:765-924`):
  - Giá trị mỗi điểm: Đơn chốt `series[i][0]`, Doanh thu `series[i][1]`, Tỷ lệ chốt `seriesRate[i]` (W2). Mảng thiếu phần tử thì điểm đó là nil.
  - **Cắt theo giờ:** khi `bucket == "hour"` và có `cutoff`, chỉ vẽ `Int(cutoff.prefix(2))! + 1` điểm đầu, **cắt cả kỳ này lẫn kỳ so**. Giờ lấy từ `cutoff` máy chủ trả, không lấy đồng hồ máy (web lấy giờ máy, `:125-126`; app khác có chủ ý).
  - `x(i)` = 42 khi chỉ có 1 điểm, còn lại `2 + i/(len−1) × 80`; `len` = số điểm dài hơn của hai kỳ.
  - **Lên xuống:** thang riêng từng ô: `hi` = max(1e-9, mọi giá trị của cả hai kỳ trong ô); `y(v) = 17 − v/hi × 14`. Đường kỳ so nét đứt (3, 2) xám dày 1,3. Đường kỳ này dày 1,7, màu theo tăng / giảm của hai số tổng của dòng. Chấm cuối bán kính 1,8 ở điểm cuối có số của kỳ này.
  - **Chênh lệch:** vạch giữa ở y = 10. Mỗi điểm có cả hai số thì cột cao `max(1, |d|/hi × 9)` với `d` = kỳ này − kỳ so, `hi` = max |d| trong ô; xanh lên khi d > 0, đỏ xuống khi d < 0, d = 0 không vẽ. Rộng `max(1.5, min(6, 80/len − 1.5))`.
  - **Cộng dồn:** hai thanh cao 4 (kỳ này màu chính, kỳ so xám), v là số tổng `current` / `previous` của ô theo chỉ số đang chọn. Thang chung cho mọi ô của cột: `max` = 100 khi chỉ số là Tỷ lệ chốt; còn lại là giá trị lớn nhất của `current` lẫn `previous` trên **mọi `staff[]` máy chủ trả của staff-compare**, kể cả người chỉ có số ở kỳ so (không có dòng trong bảng), như web (`product-group-blocks.tsx:682-691`). Không lấy max trên các dòng đang hiện, để thanh dài như web. Dòng Tổng dùng max của chính nó (`:1242-1249`). Độ dài thanh = `max(3%, v/max)` khi v > 0, bằng 0 khi v là 0 hoặc nil.
  - Cả hai số của ô đều nil thì ô hiện "—".
  - Dưới ô: "trước {giá trị kỳ so}" (`Fmt.cmpShort`, Doanh thu không có " ₫") và mức đổi: % (`Fmt.changePct`), hoặc điểm (`Fmt.changePoints`) khi là Tỷ lệ chốt.
  - Màu: tăng `Color.good`, giảm `Color.bad`, bằng nhau hoặc thiếu số `Color.inkSoft`. Kỳ so bằng 0 mà kỳ này lớn hơn 0 là tăng ("mới").
- **Dòng Tổng** dùng `rowsTotal` (W2). Chưa có thì ô này để trống.
- **Tải.** `.task(id:)` riêng gồm kỳ, POS, team, mode, step, cstart, cend (I5a thêm mã team). Đổi kiểu biểu đồ hay chỉ số không tải lại. Đổi kiểu so không tải lại bảng. `LoadTrace("so-cung-ky", requests: 1)`.

- **Biểu đồ to** (`CompareChart` trong `StaffCompare.swift`, bước I4b, Swift Charts; app đã dùng `import Charts` ở `avd7td:ios/Megatech/Megatech/MarketingView.swift:2`, máy tối thiểu iOS 17):
  - Đặt ngay dưới hai số tổng của dải chọn, cao 160pt, rộng hết khung. Trên biểu đồ là câu của kiểu biểu đồ (`KIND_TITLE`, `staff-compare.tsx:92-96`, bảng 4.4.4). Dưới là chú thích "Kỳ này", "Kỳ so".
  - Chỉ số vẽ: như web (`:360-363`). Kiểu Cộng dồn: Đơn chốt thì `cumClosed`, còn lại (Doanh thu, Tỷ lệ chốt) thì `cumClosedNet`, vì tỷ lệ không cộng dồn được. Hai kiểu kia: đúng chỉ số đang chọn (`closed`, `closedNet`, `closeRate`).
  - **Điểm và null.** Trục x có đúng `chart.len` điểm; điểm i lấy `chart.current[i]`, `chart.previous[i]`. App không tự cắt theo giờ, không tự gộp: máy chủ đã trả null theo luật W5 (4.2.6): chỉ cắt khi kiểu giờ có `cutoff`, cắt cả hai kỳ; kiểu ngày không cắt; kỳ ngắn hơn có null ở cuối.
  - Lên xuống và Cộng dồn: hai `LineMark`. Kỳ này màu chính, dày 2. Kỳ so xám, nét đứt (4, 3), dày 1,5. Điểm null thì đứt đường.
  - Chênh lệch: `BarMark` cao bằng hiệu kỳ này − kỳ so của điểm, xanh khi ≥ 0, đỏ khi < 0. Điểm thiếu một trong hai số thì không vẽ cột. Hiệu này chỉ hiện thành số ở dòng "Chênh lệch" của hộp chạm (dưới đây, 4.3).
  - Trục x: `bucket == "hour"` thì "{i}h" (Cộng dồn "{i+1}h"); còn lại "dd/MM" của `period.start + i × group` ngày (kiểu giờ `group` luôn 1). Trục y: Đơn chốt số nguyên, Tỷ lệ chốt "{n}%", Doanh thu `Fmt.shortMoney` bỏ " ₫". Mọi chữ số qua `Format.swift`.
  - Chạm giữ (`chartXSelection`): hộp nhỏ có hai dòng "Kỳ này {lúc}" và "Kỳ so {lúc}" với số của điểm, "—" khi null. "{lúc}": giờ thì "{i}:00–{i+1}:00" (Cộng dồn "tới {i+1}:00"); ngày với `group` 1 thì "{thứ} dd/MM"; `group` > 1 thì "dd/MM–dd/MM" (ngày cuối không quá ngày cuối kỳ). Cộng dồn thêm chữ "tới " phía trước.
  - Dòng thứ ba "Chênh lệch", như web (`staff-compare.tsx:473-486`): chỉ có khi điểm có cả hai số. Chữ và màu lấy từ `Fmt.chartDiff` (I4b): dấu "+" khi hiệu ≥ 0, "−" (U+2212) khi hiệu < 0; `up` đúng thì `Color.good`, sai thì `Color.bad`. Hiệu là phép được làm ở 4.3 (hai số máy chủ trả của cùng một điểm), không cần W5 trả thêm.
  - `focusId` (I7) chưa dùng ở I4b.
  - Tải: dùng chung lần gọi staff-compare của I4, không gọi thêm.

#### 4.4.4 Nhãn (giống web từng chữ, gom trong `Terms.swift`)

| Nhóm | Chữ | Nguồn web |
|---|---|---|
| Cột | Nhân viên, Số chia, Đơn chốt, Tỷ lệ chốt, Đã XN kho, Doanh thu, So cùng kỳ | `product-group-blocks.tsx:852-866` |
| Gợi ý cột | "Đơn chốt đã được kho gọi xác nhận" | `:860` |
| Dưới ô | "{a}/{b} đã chốt"; "{a}/{b} đơn chốt" | `:960-961, 1012-1017` |
| Phụ đề bảng CSKH | "Đơn chốt trong kỳ của từng người (NV chăm sóc trên đơn, trống thì người bán) · so cùng kỳ chọn ngay dưới · bấm số để xem từng đơn" | `team-overview-view.tsx:668` |
| Phụ đề bảng Sale | "Đơn chốt trong kỳ của từng người bán · Số chia = đơn lên trong kỳ (như ô Tất cả trên Pancake) · tỷ lệ chốt = số chia đã chốt ÷ số chia (không vượt 100%) · bấm số để xem từng đơn" | Ghép từ `product-group-blocks.tsx:536`, bỏ phần "theo nhóm" (app không có cột nhóm) |
| Đuôi phụ đề (cả hai bảng) | " · Tỷ lệ chốt ở bảng này không theo Cách tính" | Câu của app (mục 4.4.2) |
| Giải thích Số chia | "Số chia (đơn lên trong kỳ)", "Trong đó đã chốt", "Chưa chốt / hủy" | `:884-897` |
| Giải thích Đơn chốt | "Đơn chốt trong kỳ", "Từ số chia kỳ này", "Từ số chia trước đó" | `:908-917` |
| Giải thích Tỷ lệ chốt | "Số chia đã chốt", "Tổng số chia", "Tỷ lệ"; định nghĩa "Trong số đơn chia trong kỳ, bao nhiêu đơn nay đã chốt — đơn chia hôm trước, hôm sau mới chốt vẫn tính cho ngày chia. Không vượt 100%." | `:945-955` |
| Giải thích Đã XN kho | "Kho xác nhận", "Người chốt tự bấm Đã xác nhận", "Không rõ người xác nhận", "Còn Chờ xác nhận", "Khác (Mới / hủy chưa XN)" | `:970-992` |
| Giải thích Doanh thu | "Doanh thu đơn chốt", "Số đơn chốt", "GTTB" | `:1028-1030` |
| Kiểu so | Kỳ liền trước, Cùng thứ tuần trước, Cùng ngày tháng trước, Cùng kỳ năm trước, Tự chọn ngày | `staff-compare.tsx:130-136` |
| Mức lùi | "{n} kỳ trước", "{n} tuần trước" hoặc "lùi {n×⌈ngày/7⌉} tuần", "{n} tháng trước", "{n} năm trước" | `:167-176` |
| Tên kỳ so | "Lùi {n} kỳ", "Cùng thứ, …", "Cùng ngày {n} tháng trước", "Cùng kỳ {n} năm trước"; điều kiện dùng `MODE_LABEL` ở mục 4.4.3 | `:184-195` |
| Ngày tự chọn | "Kỳ so từ ngày", "Kỳ so đến ngày" | `:564, 577` |
| Kiểu biểu đồ | Lên xuống, Chênh lệch, Cộng dồn | `:87-91` |
| Câu trên biểu đồ to | "Từng ngày (xem một ngày thì từng giờ) của kỳ này và kỳ so"; "Mỗi cột là kỳ này trừ kỳ so: xanh lên là hơn, đỏ xuống là kém"; "Cộng dồn từ đầu kỳ" | `:92-96` |
| Chú thích | Hơn kỳ so, Kém kỳ so, Kỳ này, Kỳ so, "so với kỳ so" | `:179-180, 607, 623-627` |
| Hộp chạm biểu đồ to | "Kỳ này {lúc}", "Kỳ so {lúc}", "Chênh lệch"; chữ "{lúc}" như mục 4.4.3 | `:445-475` |
| Xem riêng một người (I7) | "Đang xem riêng {tên}"; nút "Xem cả đội" (mũi tên trái đứng trước chữ); "Đang xem cả đội · bấm biểu đồ nhỏ ở cột So cùng kỳ để xem riêng từng người" | `main@a7d479b:app/staff-compare.tsx:612-631` |
| Team | Team, Mọi team, "Mọi team Sale", "{n} người", "Mentor {tên}", "Bỏ chọn team" | `hr-team-picker.tsx:24-50`, `dashboard.tsx:1567` |
| Câu báo team | "Đang xem riêng team {tên} — số trên trang chỉ tính người đang thuộc team này bên web nhân sự (theo team hiện tại: người chuyển team thì số các kỳ trước đi theo team mới; người đã nghỉ không tính)." và "Trang này chưa lọc được theo team — đang hiện số cả nhóm {Sale/CSKH/Tất cả}, không riêng team {tên}." | `dashboard.tsx:1565-1566` |
| Câu chưa lọc của app | "4 bảng bộ phận chưa lọc theo team.", "Danh sách đơn chưa lọc theo team.", "Khối tiến độ KPI chưa lọc theo team.", "{tên thẻ} chưa lọc theo team.", "Mục tiêu tháng chưa tính theo team" | Câu của app (mục 4.4.5) |
| Danh sách đơn | "Đang hiện {n} đơn đầu trong {N} đơn" | Câu của app |

**Chỗ app khác web, có chủ ý:**
- Tên khối: web Sale ghi "Chốt theo nhóm sản phẩm" (khối web còn bật được cột nhóm, `product-group-blocks.tsx:743-751`). App không có cột nhóm, nên ghi "Từng nhân viên Sale", theo cách CSKH của web ("Từng nhân viên CSKH", `team-overview-view.tsx:667`).
- Phụ đề bảng Sale ghép từ câu web, bỏ phần nói về nhóm. Hai bảng thêm đuôi "không theo Cách tính".
- Mức đổi %: web dùng mũi tên. App dùng dấu "+" và "−" (U+2212) theo chuẩn số của plan iOS 11/10, mục 6.
- Mức đổi điểm giữ đúng web: "+1,2 điểm", "−0,4 điểm", và "+0,0 điểm" khi bằng nhau.
- Câu "Trang này chưa lọc được theo team" của app kết bằng "Xem theo team ở Tổng quan, Sale › Nhân viên, CSKH › Tổng quan và Vận đơn." vì app không có trang "Theo team".
- Biểu đồ mini cắt theo giờ `cutoff` của máy chủ, không theo đồng hồ máy.
- Xem riêng một người (I7, A7b): khi dải chọn đang khuất, app cuộn ít nhất để thấy trọn dải (cách cuộn sẵn có của SwiftUI / Compose), không đo "cách thanh trên 8px" như web.
- CSKH › Tổng quan (Android: CSKH › Nhân viên) khi đang chọn team Sale: hiện "Trang này chưa lọc được theo team…" và số không lọc (4.4.5). Web chuyển nhóm theo team nên ít gặp ca này.

#### 4.4.5 Chọn team
- **Lưu ở đâu.** `AppNav` (`Tabs.swift:11-26`) thêm `var hrUnit: HrUnit?`, với `struct HrUnit: Hashable { id, name, dept }`.
  - **Không** lưu vào `NavMemory`. Web cũng không nhớ qua lần mở sau (`team-store.ts:3-6`).
  - Đăng xuất thì `RootTabs` dựng lại, nên tự mất.
  - Màn nào đọc team thì dùng `@Environment(AppNav.self) private var nav: AppNav?` (có thể vắng, như `Home.swift:308`).
- **Hàm trong `HrTeam.swift`:**
  - `HrUnit.applies(_ unit: HrUnit?, to dept: String) -> HrUnit?`: dept "all" thì áp mọi team; còn lại chỉ áp khi `unit.dept == dept` (như `unitFor`, `team-store.ts:32-34`).
  - `HrUnit.notice(for pageId: String) -> Bool` (I5b): `false` với `compare`, `cskh-overview` (hai trang tự có câu báo riêng) và trang cài đặt, tài khoản: `config`, `audit` (như web, `dashboard.tsx:1561`), `security`, `metrics`, `app-settings`. Còn lại `true`.
  - `HrUnit.serverMessage(_ error: Error, applied: HrUnit?) -> String?`: trả `APIError.message` khi `status == 400` và `applied != nil`; còn lại nil.
- **File mới** `ios/Megatech/Megatech/HrTeam.swift`, gồm:
  - `HrUnit` và các hàm trên.
  - `HrTeamChip`: `FilterChip` "Team" hoặc tên ngắn (phần sau " · " cuối cùng).
  - `HrTeamSheet`: danh sách nhóm theo "Sale · {chi nhánh}" / "CSKH · {chi nhánh}" (chi nhánh rỗng là "Khác"); dòng đầu "Mọi team". Tải bằng `API.hrTeams()` (định nghĩa ở `StaffAPI.swift`, bước I2; **không** định nghĩa lại ở đây).
  - `HrTeamNotice(applies:deptLabel:)`: câu báo kèm nút "Bỏ chọn team".
  - `HrTeamErrorView(message:clear:)`: nguyên câu lỗi của máy chủ kèm nút "Bỏ chọn team".
  - `extension View { func hrNotice(dept: String) -> some View }` (I5b): khi đang chọn team, đặt câu "Trang này chưa lọc được theo team…" bằng `.safeAreaInset(edge: .top)`.
  - Chip chỉ hiện khi `canView` một trong `sale-teams`, `cskh-teams`, `van-don`.
- **Bốn trang có chip và lọc theo team (I5a):**

  | Trang | Đặt chip và câu báo | Truyền `hrTeam` |
  |---|---|---|
  | Tổng quan (`HomeView`) | Một hàng riêng `HStack { HrTeamChip(); Spacer() }` ngay dưới hàng chip nhóm đơn (`Home.swift:49-55`). Dưới 4 bảng bộ phận: "4 bảng bộ phận chưa lọc theo team." (tới khi có W3). Đầu `CenterBlocks`: `HrTeamNotice` "Đang xem riêng team …" | `CenterBlocks`: lời gọi report (`Home.swift:510`) và trend (`:514`); `key` (`:298`) thêm mã team |
  | Sale › Nhân viên (`CompareView`) | Sau `ScopeLine(...)` | `CompareView.load` (`CskhViews.swift:826-832`); `.task(id:)` thêm mã team; `StaffTableBlock`, `CompareControls` |
  | CSKH › Tổng quan (`CskhOverviewView`) | Sau `ScopeLine(...)` | `CskhOverviewView.load` (`CskhOverview.swift:97`); `.task(id:)` (`:85`) thêm mã team; `StaffTableBlock`, `CompareControls` |
  | Vận đơn (`VanDonView`) | Sau `ScopeLine(period: period, pos: pos)` (`Departments.swift:582`) | `VanDonView.load`; `.task(id:)` (`:602`) thêm mã team |

  - Team không hợp bộ phận của trang (ví dụ CSKH › Tổng quan lúc đang chọn team Sale): trang đó hiện câu "Trang này chưa lọc được theo team …" và gọi API không có `hrTeam`.
  - Trên CSKH › Tổng quan, khi đang áp team, dưới khối tiến độ KPI (`CskhKpiProgress`, `CskhOverview.swift:32`) thêm "Khối tiến độ KPI chưa lọc theo team.", dưới thẻ cuộc gọi hôm nay (`:52-63`, từ `cskh-badge`) thêm "Cuộc gọi hôm nay chưa lọc theo team.". Hai khối này tải không có team.
- **`CenterBlocks` khi đang áp team** (`Home.swift:276-540`):

  | Thẻ | Nguồn | Theo team? | App làm gì |
  |---|---|---|---|
  | Đơn tạo mới, Đơn chốt, Doanh thu đơn chốt, Giá trị TB đơn, Giao thành công | overview (`:510`) | Có | Như cũ |
  | Chốt nóng … hôm nay | shift (`:511`) | Không | Dưới lưới thẻ: "Chốt nóng chưa lọc theo team." |
  | Số tham chiếu Pancake (`PancakeRefCard`, `:334`) | pancake-ref | Không | Dưới thẻ: "Số tham chiếu Pancake chưa lọc theo team." |
  | Mục tiêu tháng (`:336-350`) | targets (`:513`) chia cho số overview | Không | Ẩn % và thanh tiến độ, chỉ ghi "Mục tiêu tháng chưa tính theo team". Lý do: doanh thu của team chia cho mục tiêu của cả POS là số sai |
  | Xu hướng 30 ngày | overview trend (`:514`) | Có | Như cũ |
  | Trạng thái đơn | overview `groups` | Có | Như cũ |
  | Vận hành đơn | pipeline (`:512`) | Không | Dưới tiêu đề: "Vận hành đơn chưa lọc theo team." |
  | Nhân viên | overview `byEmployee` | Có | Như cũ |
  | Mua lại & data | repurchase, batches (`:516-517`) | Không | Dưới tiêu đề: "Mua lại & data chưa lọc theo team." |
  | Khách hàng, Khách lâu chưa mua | customers (`:515`) | Không (toàn bộ lịch sử) | Dưới tiêu đề: "Khách hàng chưa lọc theo team." |

  - `filterSuffix` (`:303-305`) thêm " · team {tên ngắn}" khi đang áp team.
  - Câu chưa lọc chỉ hiện khi đang áp team.
- **`API.overviewPath(...)` và `API.vanDonPath(...)`** thêm tham số cuối `hrTeam: String? = nil`, chỉ nối `&hrTeam=` khi có. Khi chưa chọn team, đường dẫn giữ nguyên từng chữ, nên tải trước lúc hỏi Face ID vẫn trùng. `UnlockPrefetch.swift` không sửa.
- **Câu báo ở các trang còn lại (I5b):** chỉ khi đang chọn team.

  | Chỗ | Nơi | Câu |
  |---|---|---|
  | Trang theo id | `PageDestination` (`Tabs.swift:318-347`): khi `HrUnit.notice(for: p.id)` | "Trang này chưa lọc được theo team …" (`.hrNotice`) |
  | Trang con khác của Sale / CSKH | `SaleContent` / `CskhContent` (`Departments.swift:491-544`): trang con khác `compare` / `cskh-overview`, đặt ngay dưới `SubNav` | Như trên |
  | MKT | `DeptDestination` nhánh `.mkt` (`Departments.swift:484`), đầu `DeptPage` | Như trên |
  | Trang đi bằng Route | `appRoutes()` (`Shared.swift:267-290`): `.overview`, `.overviewRef`, `.overviewPos` (`OverviewView` gọi overview không có team, `Home.swift:263`), `.calls` (`CallsView`), `.alerts`, `.alertsSync` (`AlertsPage`) | Như trên (`.hrNotice`) |
  | Danh sách đơn | `OrderListView` (`Shared.swift:92`) | "Danh sách đơn chưa lọc theo team." |
  | Trang chủ | `HomeFeed` (`HomeFeed.swift:6`) | "Trang này chưa lọc được theo team …" |
  | Tab Đơn hàng | `OrdersHome` (`Tabs.swift:240`) | Như trên |
  | Không có câu | `DeptsHome`, `MoreHome`, trang cài đặt, một đơn, một khách, Nhân sự | Các trang này không có số theo team |
- **Máy chủ báo lỗi team** (team đổi tên hoặc bị xóa): mỗi trang ở bảng bốn trang, cùng `StaffTableBlock`, giữ thêm `@State private var teamError: String?`, gán bằng `HrUnit.serverMessage(error, applied:)` trong `catch`. Có `teamError` thì hiện `HrTeamErrorView(message: teamError) { nav?.hrUnit = nil }` thay cho `StateView(error:)`. `CenterBlocks` làm như vậy với lỗi của lời gọi report.

#### 4.4.6 Log Debug và video
- **Mọi lệnh in `[XNK]`, `[TEAM]` và mọi lời gọi `DebugTap.tap(...)`, `DebugTour…`, mọi `.onChange(of: DebugTap.shared.tick)` đặt trong `#if DEBUG`.** Bản Release không in gì (như `Tabs.swift:513-714`).
- **Dòng log `[XNK]`.** Chỉ in khi `MEGATECH_TOUR=xnkho`, như `[CHAM]` ở `Tabs.swift:680-695`. Chỉ có mã và số của site demo (số giả), không tên, không mã người. Mục đích: QA so được từng số với API demo mà không cần máy (mục 6). Ví dụ:
  - `[XNK] bang team=sale nguoi=12 tong=co tu=YYYY-MM-DD den=YYYY-MM-DD` (ngày của `period` máy chủ trả, để QA gọi API demo đúng kỳ)
  - `[XNK] dong=1 chia=30 chot=12 tl=40,0% xn=10/12 dt=3,6 tr` (I3: số của 5 dòng đầu, theo **thứ tự dòng** đang hiện, mặc định Doanh thu giảm dần; dòng Tổng in `dong=tong`). Chữ số qua `Format.swift` như trên màn.
  - `[XNK] ds wh=1 don=7 du=co` (`du=co` khi số đơn trùng số của dòng trong cùng lần trả; `wh=0` cho danh sách Đơn chốt)
  - `[XNK] so mode=weekday step=2 kind=diff cs=YYYY-MM-DD ce=YYYY-MM-DD nay=120 so=98 diem=7` (I4: ngày kỳ so máy chủ trả, hai số tổng theo chỉ số đang chọn; có `cutoff` thì thêm `cutoff=HH:MM`)
  - `[XNK] mini dong=1 nay=12 so=30 doi=−60,0%` (I4: kỳ này / kỳ so và mức đổi của ô mini ở 5 dòng đầu và dòng Tổng, theo chỉ số đang chọn)
  - `[XNK] cham kind=wave i=3 nay=12 so=30 chenh=−18` (I4b: số của một điểm chạm giữ trên biểu đồ to: kỳ này, kỳ so, chênh lệch; in cho 3 điểm, để QA so với `chart` của API demo ở 6.2.10)
  - `[XNK] rieng dong=1 nay=12 so=30` và `[XNK] ca-doi nay=120 so=98` (I7: hai số tổng khi xem riêng người ở dòng 1, rồi khi về cả đội; kèm 3 dòng `cham` của biểu đồ to theo người đó)
- **Kỳ của lượt tự xem.** Cố định Tháng trước (đã qua), để QA gọi API demo sau đó vẫn ra cùng số. Riêng ca Hôm nay theo giờ (cắt `cutoff`) mở thêm kỳ Hôm nay ở cuối lượt.
- **Dòng log `[TEAM]`.** Chỉ in khi `MEGATECH_TOUR=team`. Không tên team, không tên người. Ví dụ:
  - `[TEAM] dept=sale ap=co trang=nhan-vien`
  - `[TEAM] ds team=4 nguoi=5,3,6,2` (số team và số người từng team theo thứ tự danh sách)
  - `[TEAM] dong=1 chia=30 chot=12 tl=40,0% xn=10/12 dt=3,6 tr` (5 dòng đầu của bảng khi đang áp team, cùng dạng `[XNK] dong`)
  - `[TEAM] tq don-chot=12 dt=3,6 tr` (thẻ Tổng quan có "Theo team? Có", 4.4.5) và `[TEAM] van-don don-di=12` (Vận đơn khi áp team)
- **Android** in đúng các dòng `[XNK]`, `[TEAM]` trên qua `DebugLog` (tag `MEGATECH`), cùng dạng từng ký tự, ở A6, A7, A7c, A7b, A8a.
- **Chạm và cuộn trong lượt tự xem.**
  - Chỗ chạm: `DebugTap.tap("xnk-cot")`, `"xnk-o"`, `"xnk-ds"`, `"xnk-dong"`, `"xnk-chot"`; I7: `"xnk-rieng"`, `"xnk-ca-doi"`; team: `"team-mo"`, `"team-chon"`, `"team-bo"`.
  - Cuộn: `DeptPage` (`Departments.swift:458-467`) chưa cuộn theo lệnh được. I3 bọc nội dung `DeptPage` trong `ScrollViewReader`; phần nghe `DebugTap` có `target` dạng `"cuon:<id>"` rồi `proxy.scrollTo(<id>, anchor: .top)` nằm trong `#if DEBUG`. `StaffTableBlock` có `.id("bang-nhan-vien")`.
- **Video.** Codex thêm vào `ios-preview.yml` (ngoại lệ có tên):
  - Đoạn `12-xn-kho` (I3, dài thêm ở I4, I4b, I7), đoạn `13-team` (I5a, dài thêm ở I5b).
  - Mỗi đoạn có file log riêng như `10-cham-so-app.txt`, và thêm tên đoạn vào danh sách nén video (`ios-preview.yml:315`).

### 4.5 Android

#### 4.5.1 Giữ và mở rộng, không viết lại
**Quyết định: giữ và mở rộng bản 0.1, trên nhánh riêng.** Bằng chứng:
- Khoảng 4.100 dòng Compose đã có màn Sale, CSKH, MKT, đơn hàng, hồ sơ khách, Cách tính, tuyển dụng (mục 3.3).
- Phần khó và nhạy cảm đã đúng hướng: `Vault` Keystore (`Api.kt:31-63`), duyệt đăng nhập QR (`Security.kt`).
- Các lỗi ở mục 3.3 đều sửa được tại chỗ.

Viết lại từ đầu sẽ mất phần đăng nhập và duyệt QR đang chạy, mà không đổi được gì về số.

**Phần A (bản 0.2)** chỉ gồm: bảo mật (luật, chặn mọi bản phát hành), CI và ký bản, định dạng số và mô hình có kiểu cho các màn mới, phần 14/10 trên các màn đang có. **Phần B** (khung 5 tab, các màn ngang iOS) chờ câu 3.

#### 4.5.2 Bảo mật (bước A1a, A1b, A1c)
Ba bước, chạy theo thứ tự A1a → A1b → A1c:
- **A1a:** `LockPolicy`, khóa bắt buộc, màn khóa đục, che màn hình, nhánh mật khẩu khi máy không có khóa màn hình, duyệt đăng nhập máy tính, mức sinh trắc học, `DebugLog.kt`, `AppLockTest`. Không có file workflow.
- **A1b:** sao lưu, cookie, máy chủ, bản debug.
- **A1c:** hàm bọc hộp nổi và đổi mọi chỗ gọi, mẫu cấm hộp nổi ở CI, `android-preview.yml` (4.5.5), đoạn video `1-khoa`, `2-che`.

**A1a: khóa, màn khóa, che màn hình.**
- **Chính sách khóa trong lớp Kotlin thuần** `LockPolicy` (file mới `…/LockPolicy.kt`, không dùng lớp Android), để test được trên JVM:
  - `start(hasSession: Boolean, canUseDeviceAuth: Boolean, legacy: Map<String, Any?>)` trả trạng thái mở app và danh sách khóa cài đặt cũ cần xóa.
    - Không có phiên: màn đăng nhập.
    - Có phiên và máy có khóa màn hình: màn Welcome, hỏi vân tay / khuôn mặt / mã máy. **Không** xét công tắc `lock` cũ.
    - Có phiên mà máy không có khóa màn hình: màn nhập mật khẩu MEGATECH (`POST /api/auth/reauth {password}`, như iOS `avd7td:ios/Megatech/Megatech/API.swift:198-199`). **Không bao giờ** gọi `restore()` khi chưa xác thực.
    - Luôn trả lệnh xóa ba khóa cũ `lock`, `lock_grace`, `secure`, như iOS xóa khóa cũ (`avd7td:ios/Megatech/Megatech/Security.swift:19-23`).
  - Đếm số lần vào nền (`backgrounds`). Lần xác thực bắt đầu trước một lần vào nền thì không được mở khóa.
- **Nối vào app:**
  - `Auth.start` (`…/App.kt:84-89`) gọi `LockPolicy.start`, xóa ba khóa cũ trong `SharedPreferences("megatech")`.
  - `AppLock` (`…/App.kt:110-140`): bỏ `enabled`, `graceSeconds`, `set`, `setGrace`. Vào nền (`ON_STOP`) khi đã đăng nhập thì khóa ngay.
  - `Privacy` (`…/App.kt:143-148`): luôn bật, không đọc khóa `secure`.
  - `Login.kt` (Welcome và `bio()`, `:102-126`): theo `LockPolicy`; thêm nhánh nhập mật khẩu khi máy không có khóa màn hình.
- **Mức sinh trắc học:** `BIOMETRIC_STRONG or DEVICE_CREDENTIAL` từ Android 11 (API 30). `BIOMETRIC_WEAK or DEVICE_CREDENTIAL` cho API 26–29, vì máy cũ không nhận tổ hợp STRONG với mã máy.
- **Màn khóa đục hoàn toàn**, không làm mờ số phía sau (bỏ `blur` và nền `alpha .55` ở `…/App.kt:172, 190`).
- **Che màn hình:**
  - `FLAG_SECURE` luôn bật ở bản phát hành, và `setRecentsScreenshotEnabled(false)` từ Android 13.
  - Chỉ bản debug được tắt qua `-e secure 0`, để CI quay video. Giá trị này chỉ giữ trong bộ nhớ, không lưu xuống máy.
  - Bỏ công tắc ở `…/System.kt:77-81`. Mục bảo mật chỉ ghi "Khóa bằng vân tay / khuôn mặt luôn bật".
- **Duyệt đăng nhập máy tính** (`…/Security.kt:134-135`): luôn phải xác thực; máy không có khóa màn hình thì nhập mật khẩu MEGATECH.
- **Log:** file mới `…/DebugLog.kt`, chỉ in khi `BuildConfig.DEBUG`, tag cố định `MEGATECH`, chỉ có mã và số đếm. In mốc `hoi-xac-thuc` khi hộp xác thực hiện, để CI biết lúc nhập mã PIN (CI quay từ A1c, mục 4.5.5).

**A1b: dữ liệu trên máy và mạng.**
- **Sao lưu:** `android:allowBackup="false"`, `android:fullBackupContent="false"`, và `android:dataExtractionRules="@xml/data_extraction_rules"` loại mọi thứ.
- **Email đăng nhập gần nhất** (`Api.kt:96-99`) chuyển vào `Vault`, hoặc bỏ.
- **Cookie** (`Api.kt:107-117`): chỉ gửi cho danh sách host cố định trong code: host máy chủ thật; bản debug thêm host demo và `10.0.2.2`, `localhost`. Không theo `Api.base`.
- **`debugExtras`** (`…/App.kt:66-72`): `base` chỉ nhận host trong danh sách trên. Bản phát hành bỏ qua mọi tham số (như hiện nay).
- **http thường:** chuyển `network_security.xml` có `10.0.2.2`, `localhost` sang `android/app/src/debug/res/xml/`. Bản phát hành chỉ https.
- **Bản debug tách khỏi bản thật:** `applicationIdSuffix = ".debug"`, nhãn "MEGATECH thử" (Codex chọn `resValue` hoặc `manifestPlaceholders`; nhãn bản phát hành giữ "MEGATECH"). Bản debug có mã gói `vn.megatech.tonghoppos.debug`.

**A1c: hộp nổi không nằm trên màn khóa, video đầu.**
- **Năm hàm bọc ở `…/Kit.kt`:** `SafeSheet` (ModalBottomSheet), `SafeDialog` (Dialog), `SafeAlert` (AlertDialog), `SafeMenu` (DropdownMenu), `SafeDatePicker` (DatePickerDialog).
  - Mỗi hàm chỉ dựng hộp khi `!AppLock.locked`.
  - Trạng thái mở hộp vẫn ở chỗ gọi, nên mở khóa xong hộp hiện lại.
- **Đổi mọi chỗ đang gọi thẳng.** 15 chỗ (`git grep` trên `main`):
  - `SafeSheet`: `…/Home.kt:390` (`ExplainSheet`), `…/Security.kt:110`.
  - `SafeDialog`: `…/System.kt:37` (`FullDialog`; các hộp khác của `System.kt` đều đi qua hàm này).
  - `SafeAlert`: `…/Security.kt:205`, `…/Cskh.kt:392` (`TargetDialog`).
  - `SafeMenu`: `…/Kit.kt:370, 381`, `…/Cskh.kt:81, 82, 84, 154, 335`, `…/More.kt:242`, `…/PosUi.kt:114`.
  - `SafeDatePicker`: `…/Kit.kt:391`.
- **`Popup`, `BasicAlertDialog`, `ExposedDropdownMenu`** cũng mở cửa sổ riêng. Hiện chưa dùng (`git grep` trên `main` không ra), chỉ cấm. Bước sau cần dùng thì Codex dừng lại hỏi; tổ app thêm hàm bọc vào bước đó.
- **CI cấm gọi thẳng ở ngoài `Kit.kt`** (bước chặn của `android.yml`, mục 4.5.3). Tám mẫu `grep -E`:
  - `ModalBottomSheet\(`, `AlertDialog\(`, `DropdownMenu\(`, `DatePickerDialog\(`;
  - `(^|[^A-Za-z_])Dialog\(`, `(^|[^A-Za-z_])Popup\(`, `(^|[^A-Za-z_])BasicAlertDialog\(`, `(^|[^A-Za-z_])ExposedDropdownMenu`.
  - Mẫu `Dialog\(` có chặn chữ đứng trước để không bắt nhầm hàm của app như `FullDialog(`, `TargetDialog(`. `DropdownMenu\(` không bắt `DropdownMenuItem(`.
  - Mẫu hộp nổi xét cả thư mục ngay từ A1c, vì A1c đã đổi hết chỗ gọi cũ.
- **Video:** `android-preview.yml` (mục 4.5.5) và `…/DebugTour.kt` (chỉ chạy khi `BuildConfig.DEBUG`), đoạn `1-khoa`, `2-che`.

#### 4.5.3 CI, ký bản, phát hành
- **Ai viết:** Codex viết `.github/workflows/android.yml` ở A0 (ngoại lệ có tên, mục 2). Tổ app tra SHA commit của từng action (`gh api repos/<chủ>/<tên>/git/ref/tags/<tag>`) và ghi vào lời giao. Codex chỉ chép, không tự tra (sandbox không có mạng).
- **Mọi action ghim theo SHA commit đầy đủ**, kèm tag ở chú thích, ở cả `android.yml` và `android-preview.yml`.
- **`android.yml`:**
  - Chạy khi:
    - `pull_request` có `android/**` hoặc `.github/workflows/android.yml`;
    - `push` vào `main` hoặc `claude/app-android`, cùng bộ lọc `paths: ['android/**', '.github/workflows/android.yml']`. Đẩy việc web vào `main` không gọi job Android, nên anh không bị hỏi duyệt vô cớ.
    - Không có `workflow_dispatch`, không có ô `pre_tag`.
  - `permissions: contents: read` ở đầu file.
  - `env:` đầu file có `BUILD_TOOLS_VERSION`: bản `build-tools` cố định, dùng chung cho job `build` và job ký.
    - Tổ app tra bản này và ghi vào lời giao, như SHA action. Lấy bản `build-tools` mặc định của AGP đang dùng (ghi chú phát hành của AGP), để Gradle dùng đúng bản đã cài, không tự tải bản khác. A0 phải đổi AGP thì tra lại.
    - `android-preview.yml` dùng cùng bản (mục 4.5.5).
  - **Lệnh có `grep`.** Shell của GitHub chạy `bash -eo pipefail`; grep không thấy gì thì trả mã 1. Để bước không đỏ khi đúng, không xanh khi sai:
    - Kiểm "phải không có": theo cách xét mã thoát của `ios.yml:52-64`. Mã 0 là có chỗ sai (đỏ, in từng chỗ), mã 1 là sạch, mã khác là grep lỗi (đỏ). Không để grep đứng một mình hay đứng cuối bước.
    - Không viết `lệnh | grep -q …`. `grep -q` thoát ngay khi thấy, lệnh trước có thể nhận SIGPIPE, và `pipefail` làm cả dòng mang mã sai. Ghi đầu ra của lệnh ra file trong `$RUNNER_TEMP` trước, rồi grep trên file.
    - Không dùng `! lệnh` để kiểm: `set -e` không dừng ở lệnh có `!` nếu đó không phải lệnh cuối của bước. Viết `if grep -q … <file>; then echo "::error::…"; exit 1; fi`.
  - **Job `build`** (mọi lần chạy): không có `environment`, không đọc bí mật, `permissions: contents: read`.
    - `ubuntu-latest`, JDK 17.
    - Cài cố định bằng `sdkmanager` của máy chạy: `platforms;android-37` và `build-tools;$BUILD_TOOLS_VERSION`. Không trông vào AGP tự tải.
    - `gradle/actions/wrapper-validation` để kiểm `gradle-wrapper.jar` trong repo.
    - Bước chặn định dạng / log / hộp nổi (giống iOS `ios.yml:46-65`), quét `android/app/src/main/**`, bỏ `android/app/src/test/**`:
      - Ngoài `Fmt.kt`: cấm `String.format(`, `.format(`, `DecimalFormat(`, `NumberFormat.`, `SimpleDateFormat(`, `DateTimeFormatter.` và chuỗi `" ₫"`.
      - Ngoài `DebugLog.kt`: cấm `(^|[^A-Za-z_])Log\.`, `println\(`, `printStackTrace\(`, `System\.(out|err)`, `HttpLoggingInterceptor`. Mẫu `Log.` có chặn chữ đứng trước để không bắt nhầm `DebugLog.`.
      - Ngoài `Kit.kt`: cấm gọi thẳng hộp nổi (tám mẫu ở mục 4.5.2, thêm ở A1c).
      - Phần định dạng và log: từ A0 tới hết A1c chỉ xét **dòng thêm mới** so với `main` (`git diff -U0`), vì code cũ còn khoảng 18 chỗ (mục 3.3); từ A2a xét cả thư mục. Phần hộp nổi xét cả thư mục ngay từ A1c.
      - Khi xét dòng thêm mới: checkout mặc định chỉ có một commit, nên lấy `main` trước (`git fetch --no-tags --depth=1 origin main`). Ghi `git diff -U0 origin/main HEAD -- android/app/src/main` ra file; `git diff` lỗi thì bước đỏ, không để lỗi chìm trong `if`.
    - `./gradlew :app:testDebugUnitTest :app:assembleDebug`.
    - Chỉ khi `push` vào `main`:
      - `./gradlew :app:assembleRelease` ra APK **chưa ký**; đọc `megatech.versionName`, `megatech.versionCode` từ `android/gradle.properties` thành output của job; tải lên `app-release-unsigned.apk` làm artifact, `retention-days: 1`.
      - Kiểm tag `android-v<versionName>-<versionCode>` bằng `gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/<tag>"` (bước có `env: GH_TOKEN: ${{ github.token }}`, token chỉ đọc). Chỉ API trả 404 mới là chưa có; lỗi khác thì đỏ. Tag đã có thì báo "đã có, bỏ qua" và đặt output `release=false`: job ký không chạy, anh không bị hỏi duyệt vô cớ.
    - Có file `android/signing-cert.sha256` thì kiểm đúng dạng (mục "Dấu vân tay" dưới đây), để sai dạng đỏ ngay trên nhánh, không đợi lần ký.
    - Không tải APK debug lên artifact (repo công khai, ai đăng nhập GitHub cũng tải được). `android-preview.yml` tự build bản của nó.
  - **Job `sign-release`** (chỉ khi `push` vào `main`):
    - `needs: build`, `if: needs.build.outputs.release == 'true'`, `environment: android-release`, `permissions: contents: write`.
    - Job chờ anh bấm Duyệt (người duyệt của Environment) rồi mới chạy. Bí mật chỉ mở cho job sau khi anh duyệt.
    - **Không `actions/checkout`, không Gradle.** Mã của nhánh không chạy trong job có khóa.
    - Mọi bước dùng `gh` có `env: GH_TOKEN: ${{ github.token }}` và ghi repo rõ ràng, vì job không checkout nên `gh` không tự biết repo: `gh release … --repo "$GITHUB_REPOSITORY"`, `gh api "repos/$GITHUB_REPOSITORY/…"`.
    - Kiểm lại tag như job `build`: đã có thì báo "đã có, bỏ qua" và kết thúc xanh. Không ghi đè: Android chỉ cài đè được khi số build tăng.
    - Cài `build-tools;$BUILD_TOOLS_VERSION` bằng `sdkmanager` của máy chạy (`$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager`), trước khi giải mã khóa. Bước này không có bí mật.
    - Dùng `zipalign`, `apksigner`, `aapt2` ở `$ANDROID_HOME/build-tools/$BUILD_TOOLS_VERSION/`, đúng bản job `build` đã dùng, để kết quả lặp lại được. Không dùng bản mới nhất của máy chạy.
    - Tải artifact. Giải mã khóa ra `$RUNNER_TEMP` (`umask 077`).
    - `zipalign -c -P 16 -v 4`; lệch thì `zipalign -P 16 -f 4` ra file mới.
    - `apksigner sign --ks … --ks-key-alias "$ANDROID_KEY_ALIAS" --ks-pass env:ANDROID_STORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD`. Bí mật chỉ đặt ở `env:` của đúng bước cần. Không `echo`, không `set -x`.
    - Ba bước kiểm dưới đây có `name:` đúng "Dấu vân tay", "Không debuggable", "Sao lưu tắt", để QA tìm trên trang Actions (6.4.13).
    - **Dấu vân tay.** Một dạng duy nhất: 64 ký tự hex chữ thường, không dấu hai chấm, không khoảng trắng.
      - Phía repo: `android/signing-cert.sha256` đọc từ `main` tại `$GITHUB_SHA` bằng `gh api -H 'Accept: application/vnd.github.raw' "repos/$GITHUB_REPOSITORY/contents/android/signing-cert.sha256?ref=$GITHUB_SHA"`. File là đúng một dòng; bỏ ký tự xuống dòng cuối rồi phải khớp `^[0-9a-f]{64}$`. Sai dạng là đỏ.
      - Phía APK: `apksigner verify --print-certs <apk>` ghi ra file. Phải có đúng một dòng chứa `certificate SHA-256 digest` (một người ký). Lấy phần sau `: `, bỏ dấu hai chấm nếu có, hạ chữ thường.
      - Hai chuỗi khác nhau là đỏ.
    - **Không debuggable.** `aapt2 dump badging <apk>` ghi ra file, rồi `if grep -q application-debuggable <file>; then …; exit 1; fi`. Không viết `! aapt2 … | grep -q …` (lý do ở mục "Lệnh có `grep`").
    - **Sao lưu tắt.** `aapt2 dump xmltree --file AndroidManifest.xml <apk>` ghi ra file. In các dòng `allowBackup|fullBackupContent|dataExtractionRules` ra log để soát (`grep -E … <file> || true`). Đỏ khi không có dòng `allowBackup` mang giá trị false (aapt2 in dạng `…:allowBackup(0x01010280)=false`, mẫu `allowBackup[^=]*=false`) hoặc không có `dataExtractionRules`. Viết dạng `if ! grep -Eq '<mẫu>' <file>; then …; exit 1; fi`.
    - Bước `if: always()`: xóa file khóa.
    - Tạo GitHub Release: `gh release create "android-v${versionName}-${versionCode}" <apk đã ký> <file .sha256 của APK> --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" …`.
- **Environment `android-release`** (script của anh tạo, mục 4.5.4):
  - Nhánh được dùng: chỉ `main`.
  - **Người duyệt: anh** (tài khoản GitHub của anh, script 4.5.4 bước 7 đặt). Mỗi lần job ký chạy, GitHub hỏi anh. Anh bấm Duyệt một lần, có thể bấm trong app GitHub trên điện thoại. Chỉ anh bấm: tổ app và Codex không duyệt thay, kể cả qua API.
  - `prevent_self_review: false` (mặc định), để anh duyệt được cả khi lần chạy đứng tên tài khoản anh.
  - Vì sao giữ bước duyệt: `main` hiện không có bảo vệ nhánh. "Gộp `main` cần anh duyệt" chỉ là quy trình, GitHub không ép, và tổ app có quyền ghi repo. Thay đổi `android.yml` nào lọt vào `main` (trong một PR web, hay lỗi Codex mà tổ app soát sót) cũng chạy được với bí mật ký. Lộ khóa thì mọi máy phải gỡ app cài lại. Bước duyệt là chốt chặn cho khóa ký (mục 7).
  - Bí mật: `ANDROID_KEYSTORE_B64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  - PR từ fork không có bí mật (mặc định của GitHub).
- **`build.gradle.kts` không đọc biến môi trường ký.** CI ký bằng `apksigner` ở job riêng. Bản phát hành chỉ gắn `signingConfig` khi `local.properties` có `megatech.keystore`, để `build-apk.sh` trên Mac của anh vẫn chạy. Trên CI không có file này, nên ra APK chưa ký.
- **Số phiên bản** để một chỗ: `android/gradle.properties` (`megatech.versionName`, `megatech.versionCode`). A0 đặt 0.2 (2). Mỗi bản phát hành tăng số.
- **Kiểm tra lần ký đầu:** job `sign-release` chỉ chạy sau khi gộp vào `main`. Vì vậy lần ký đầu được kiểm lúc phát hành 0.2. Trên nhánh, CI chỉ chứng minh build release chưa ký chạy được và file dấu vân tay đúng dạng. Đỏ ở job ký thì sửa trong PR mới, không có bản nào được đăng.

#### 4.5.4 Khóa ký và bí mật (anh chạy một lần, ngoài mọi phiên Codex / Claude)
Anh chỉ dán một dòng lệnh vào Terminal trên Mac, một lần, sau khi trả lời câu 2 và trước bản Android đầu tiên. Không ai phải gõ hay dán mật khẩu. Sau đó, mỗi lần ra bản Android anh chỉ bấm Duyệt một lần trên GitHub (mục 4.5.3).

**Script `android/tools/tao-khoa-ky.sh`** (Codex viết ở A0, tổ app soát từng dòng; Codex không chạy). Làm theo thứ tự:
1. Đặt `set -euo pipefail` và `umask 077`. Không có `set -x`, không `echo` biến mật khẩu. Mọi lệnh `gh` ghi repo cố định `phailamsao0012/tong-hop-pos`: `gh secret … --repo phailamsao0012/tong-hop-pos`, `gh api repos/phailamsao0012/tong-hop-pos/…`. Không lệnh nào để `gh` tự đoán repo theo thư mục đang đứng.
2. Kiểm trước khi làm gì, thiếu hay sai thì in lý do và dừng (chưa tạo gì nên dừng ở đây không để lại gì):
   - Tìm `keytool`: trên PATH, nếu không có thì `/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool`. Kiểm có `gh`, `openssl`, `security`, và `gh auth status` đạt. Thiếu thứ gì thì in đúng tên thứ còn thiếu; không tự cài, không tự đăng nhập.
   - Đúng repo: thư mục đang đứng (lệnh gửi anh `cd` vào thư mục repo) có `git remote get-url origin` khớp `[:/]phailamsao0012/tong-hop-pos(\.git)?$`. Không phải thư mục git, hay không khớp, thì dừng.
   - Đủ quyền: `gh api repos/phailamsao0012/tong-hop-pos --jq .permissions.admin` ra `true` (cần quyền admin để tạo Environment và bí mật).
3. Đường dẫn khóa `~/.megatech/android-release-2026.jks` (thư mục quyền 700). File đã có thì dừng, không ghi đè.
4. Sinh mật khẩu ngẫu nhiên vào biến `kspw` (`openssl rand -base64 33`), không in. Khóa PKCS12 nên mật khẩu khóa trùng mật khẩu kho.
5. Tạo khóa: `keytool -genkeypair -keystore … -storetype PKCS12 -alias megatech -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=MEGATECH" -storepass:env kspw -keypass:env kspw` (biến `kspw` được `export` riêng cho lệnh này).
6. Cất mật khẩu vào Keychain của Mac: `security add-generic-password -U -s megatech-android-release -a megatech -w "$kspw"`. Mất bí mật trên GitHub thì vẫn lấy lại được mật khẩu ở đây.
7. Tạo Environment chỉ cho `main`, người duyệt là anh (tài khoản đang đăng nhập `gh` trên Mac của anh):
   ```
   uid=$(gh api user --jq .id)
   [[ "$uid" =~ ^[0-9]+$ ]] || { echo "Không đọc được tài khoản GitHub"; exit 1; }
   gh api -X PUT repos/phailamsao0012/tong-hop-pos/environments/android-release --input - <<EOF
   {"prevent_self_review":false,"reviewers":[{"type":"User","id":$uid}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
   EOF
   gh api -X POST repos/phailamsao0012/tong-hop-pos/environments/android-release/deployment-branch-policies -f name=main -f type=branch
   ```
   Chính sách `main` đã có thì bỏ qua, không lỗi. Chạy lại thì `PUT` ghi lại đúng cấu hình trên.
8. Đặt bốn bí mật, giá trị đưa qua đầu vào chuẩn, không dùng `--body`. Lệnh nào cũng có đủ `--env android-release --repo phailamsao0012/tong-hop-pos` (dấu `…` dưới đây là phần đó):
   - `base64 < <file khóa> | gh secret set ANDROID_KEYSTORE_B64 --env android-release --repo phailamsao0012/tong-hop-pos`
   - `printf %s "$kspw" | gh secret set ANDROID_STORE_PASSWORD …` và `… ANDROID_KEY_PASSWORD …`
   - `printf %s megatech | gh secret set ANDROID_KEY_ALIAS …`
9. Dấu vân tay chứng chỉ (công khai, không phải bí mật), làm trước `unset kspw`:
   - Lấy dòng `SHA256:` của `keytool -list -v -keystore <file khóa> -alias <bí danh ở bước 8> -storepass:env kspw` (`kspw` `export` riêng cho lệnh này như bước 5).
   - Bỏ chữ `SHA256:` và khoảng trắng, bỏ dấu hai chấm, hạ chữ thường. Kết quả phải đúng 64 ký tự `[0-9a-f]`, không thì dừng.
   - Ghi đúng một dòng đó vào `~/codex-viec/android-signing-cert.sha256`, để tổ app đọc qua phiên trên Mac, anh không phải chép gửi. Đây cũng là dạng của `android/signing-cert.sha256` trong repo (mục 4.5.3).
   - Rồi `unset kspw`. In ra đúng ba thứ: dấu vân tay ở dạng trên; tên tài khoản người duyệt (`gh api user --jq .login`), để anh thấy đúng là anh; câu nhắc "Chép file khóa ~/.megatech/android-release-2026.jks ra USB hoặc ổ ngoài làm bản sao".

**Lệnh tổ app gửi anh** (khi A0 đã lên nhánh; chạy được trong zsh mặc định của Mac):
```
( cd <thư mục repo trên Mac> && bash <(git fetch -q origin claude/app-android && git show origin/claude/app-android:android/tools/tao-khoa-ky.sh) )
```
- Lệnh `cd` vào thư mục repo để script kiểm được remote ở bước 2. Dấu ngoặc ngoài cùng giữ nguyên thư mục của cửa sổ Terminal.
- Trước khi gửi, tổ app kiểm qua phiên trên Mac rằng có `keytool`, có `gh` đã đăng nhập đúng tài khoản của anh, có quyền admin repo, và remote `origin` của thư mục repo đúng `phailamsao0012/tong-hop-pos`. Thiếu thì lời gửi anh nói rõ cần gì (ví dụ đăng nhập `gh` một lần).
- Câu 2 = Không (dùng lại khóa 0.1 ở `~/.megatech/android-release.jks`, `main:android/app/build.gradle.kts:8`): script nhận tham số `--dung-khoa-cu`, bỏ bước 3–6, hỏi mật khẩu kho cũ bằng `read -s` (anh gõ, không hiện), rồi làm tiếp từ bước 7.
- Khi CI đã ký được, xóa các dòng mật khẩu khỏi `android/local.properties` trên Mac (nếu còn từ bản 0.1).
- Mất khóa thì không cập nhật được app, phải gỡ ra cài lại. Vì vậy cần bản sao ngoại tuyến.
- Không chạy lệnh này trong phiên Codex hay Claude, và không chạy khi Codex đang làm việc trên Mac.

#### 4.5.5 Video máy ảo trên CI
- **File:** `.github/workflows/android-preview.yml` (Codex viết ở A1c, sau khi A1b đã đổi mã gói bản debug sang `.debug`; ngoại lệ có tên). Chạy khi `pull_request` hoặc `push` vào `claude/app-android` có `android/**` hoặc chính file này.
- **Hai job, tách quyền** (cùng nguyên tắc với 4.5.3: job chạy mã của nhánh không có quyền ghi). Không theo mẫu một job của `ios-preview.yml` (mục 7). `permissions: contents: read` ở đầu file.
  - **Job 1 `quay`**: `permissions: contents: read`, không có `environment`, không đọc bí mật.
    - Checkout mã của PR (hoặc của nhánh khi push), cài `platforms;android-37` và `build-tools;<cùng bản BUILD_TOOLS_VERSION với android.yml>` bằng `sdkmanager` như job `build` (4.5.3), build bản debug, chạy máy ảo, quay.
    - Tải video và log lên artifact (bước `if: always()`), giữ 7 ngày. Không có APK.
  - **Job 2 `day-video`**: `needs: quay`, `permissions: contents: write`.
    - Chỉ chạy khi `github.event_name == 'push'` hoặc `github.event.pull_request.head.repo.full_name == github.repository` (PR từ chính repo, không phải fork).
    - **Không `actions/checkout` mã PR, không Gradle, không chạy file nào lấy từ artifact.**
    - Tải artifact của job 1 (`actions/download-artifact` ghim SHA). Chỉ chép các file `*.mp4` và `*.txt` ở gốc artifact sang một thư mục tạm.
    - Trong thư mục tạm: `git init`, commit, đẩy ghi đè lên nhánh `android-preview` bằng `github.token` (như `avd7td:.github/workflows/ios-preview.yml:343-347`). Hoặc đẩy bằng `gh api`, cũng không checkout.
    - Job 1 đỏ thì job 2 không chạy; video và log vẫn ở artifact.
- **Máy ảo:** `reactivecircus/android-emulator-runner` ghim SHA, API 35, x86_64, có KVM.
- **Đăng nhập:** tài khoản demo công khai như `ios-preview.yml:99-104`: che token bằng `::add-mask::`, đăng xuất phiên demo khi xong.
- **Mở app:** `adb shell am start -n vn.megatech.tonghoppos.debug/vn.megatech.tonghoppos.MainActivity -e base https://demo.tonghopposmegatech.io.vn -e session … -e secure 0 -e tour <đoạn>` (chỉ bản debug đọc).
- **Mở khóa:** đặt mã PIN cho máy ảo (`adb shell locksettings set-pin <mã thử>`). Thấy mốc `hoi-xac-thuc` trong log thì nhập PIN qua `adb shell input`.
- **Quay** (job 1): mỗi đoạn `adb shell screenrecord --time-limit 170`. Ghép bằng ffmpeg. Log lọc `adb logcat -s MEGATECH` vào file của từng đoạn (có các dòng `[XNK]`, `[TEAM]` như iOS, 4.4.6). Video và log lên artifact; job 2 đẩy chúng lên nhánh `android-preview`.
- **Các đoạn Phần A:**
  - `1-khoa` (A1c, quay cả phần khóa của A1a): mở lạnh thấy màn khóa, nhập PIN; mở một hộp nổi thử của bản debug (`SafeSheet` có chữ "Bảng thử bản debug", không có số); vào nền rồi quay lại: chỉ thấy màn khóa, hộp không nổi lên trên.
  - `2-che` (A1c, quay phần che của A1a): quay với `secure=1`, phải ra màn đen, chứng minh có `FLAG_SECURE`.
  - `3-xn-kho` (A6), `4-so-cung-ky` (A7, dài thêm ở A7c, A7b), `5-team` (A8a, dài thêm ở A8b).
- **Ca máy ảo của mục 6, khi Mac không có emulator Android** (5.5.1 mục 10): job quay thêm bước có tên cho từng ca, dùng bản debug, in kết quả vào log của đoạn: 6.2.6, 6.2.8 (`adb shell am force-stop` rồi `am start`), 6.2.7 (máy ảo chạy với múi giờ khác), 6.4.7 (`run-as` ghi khóa cũ), 6.4.9 (`run-as` liệt kê tên khóa trong `shared_prefs`, không in giá trị), 6.4.10 (`bmgr`), 6.4.11 (`-e base` host lạ). Codex thêm các bước này vào `android-preview.yml` ở bước của ca đó (A1c, A7), trong job quay.
- **Các đoạn Phần B:** `6-khung-tab`, `7-tong-quan`, `8-phong-ban`, `9-don-hang`, `10-trang-chu`, `11-them`.

#### 4.5.6 Đặt ở đâu trên Android (Phần A)
- **Sale › Nhân viên:** trong `CompareContent(team)` (`…/Sale.kt:133`), khi `tm == "sale"` và `Auth.canView("sale-overview")`. Chèn `StaffTableBlock("sale", "seller", period, pos)` ngay sau `PosChipRow(...)` (`:146`), trước hàng lọc bộ phận / tìm tên (`:150-153`). Dùng kỳ và POS của `CompareContent`.
- **CSKH:** Android chưa có CSKH › Tổng quan. Thêm trang con `SubTab("cskh-overview", "Nhân viên")` vào đầu `CSKH_TABS` (`…/Cskh.kt:27`), mở `CompareContent("cskh")`. Trong `CompareContent`, khi `tm == "cskh"` và `Auth.canView("cskh-overview")`, chèn `StaffTableBlock("cskh", "care", period, pos)` cùng chỗ như Sale.
- **Team:** chip ở `HomeTab` (ngay dưới nút Tất cả / Sale / CSKH, `…/Home.kt:57`) và ở `CompareContent` (sau `PosChipRow`). Chọn team thì nút bộ phận ở `HomeTab` theo bộ phận của team; đổi nút sang bộ phận khác thì bỏ chọn team (như `setTeam`, `team-store.ts:18-24`).
- **`CenterBlocks` của Android** (`…/Home.kt:134`) làm như bảng 4.4.5: ba lời gọi overview ở `HomeTab` (`…/Home.kt:41-44`) gửi `hrTeam`; thẻ từ shift, pipeline, targets, repurchase, batches, customers, cskh-badge ghi "chưa lọc theo team"; Mục tiêu tháng ẩn %.

## 5. Các bước

### 5.0 Chung cho mọi bước
- **Từ bản 1.3, chạy theo mục 5.6:** script giao các bước liền nhau, máy kiểm sau mỗi bước, tổ app và QA kiểm một lần cuối phần. Các chỗ dưới đây nói "bước sau chờ kiểm của tổ app, CI, QA" thành việc của lần kiểm cuối phần.
- **Mỗi bước là một lần chạy Codex** (có thể thêm tối đa 3 vòng góp ý bằng `resume --last`). Codex tự build, test, chạy thử trên máy ảo, chụp ảnh / quay video và viết tóm tắt (5.5.1 mục 10–11). Bước sau chỉ bắt đầu khi bước trước đã qua kiểm của tổ app (tóm tắt, diff, các lệnh grep ở 5.5.4) và CI xanh; bước là mốc QA thì cần thêm QA đạt.
- **Mốc QA** (theo lời anh 14/10: QA chỉ kiểm phần đụng số liệu và bảo mật):
  - iOS: I3 (Đã XN kho, 6.1), I4 (So cùng kỳ, 6.2.1–6.2.9), I4b (biểu đồ to, 6.2.10), I7 (xem riêng một người, 6.2.11), I5a (lọc team, các ca số của 6.3).
  - Android: A1c (bảo mật: khóa, che, hộp nổi, sao lưu, cookie, 6.4; gộp kiểm A1a, A1b), A6, A7, A7c, A7b (cùng các ca như iOS), A8a (lọc team), và job ký trước bản phát hành đầu (6.4.13).
  - Phần B (nếu làm): bước đụng số liệu hoặc dữ liệu cá nhân (A4, A5, A9, A10, A12) là mốc QA; A3, A11 thì không.
  - Bước giao diện thuần hoặc chữ (I1, I2, I5b, I6, A0, A2a, A2b, A8b) không có QA riêng: tổ app đọc tóm tắt của Codex và diff.
  - Gửi QA: tóm tắt của Codex (đã chạy grep dữ liệu nhạy cảm ở 5.5.4 mục 6), liên kết video và log CI, các ca ở mục 6.
- **Riêng I5a** (khoảng 10 file) giữ là một bước. Nếu Codex hết 3 vòng góp ý mà chưa đạt, tổ app được chia I5a thành hai lần giao:
  - lần 1: Tổng quan và Sale › Nhân viên (nhánh `codex/app-1410-i5a-1`);
  - lần 2: CSKH › Tổng quan và Vận đơn (nhánh `codex/app-1410-i5a-2`).
  - Mỗi lần giao vẫn một commit code (và một commit workflow nếu có), qua đủ kiểm ở 5.5.4. Đoạn `13-team` có từ lần 1, dài thêm ở lần 2.
- **Nhánh của Codex:** `codex/app-1410-<mã bước>`, ví dụ `codex/app-1410-i3`, `codex/app-1410-a1a`. Chỉ ở trên Mac, không đẩy lên GitHub. Tổ app commit trong worktree rồi đẩy lên nhánh làm việc (`claude/project-thread-avd7td` hoặc `claude/app-android`).
- **Điều kiện chung của mọi bước** (cột "Xong khi" chỉ ghi phần riêng):
  - CI của app (`ios.yml` hoặc `android.yml`) xanh, kể cả bước chặn định dạng.
  - Video của CI có đoạn của bước, **nếu bước có đoạn**.
  - Không file ngoài danh sách bị sửa.
  - Có tóm tắt `~/codex-viec/<bước>-tomtat.md` đúng mẫu (5.5.1 mục 11): lệnh build / test của bước, kết quả và mã thoát, hoặc ghi rõ vì sao sandbox không build được.

### 5.1 Bước web (Tổ web tổng, plan riêng theo luật web)

| Bước | File | Xong khi |
|---|---|---|
| W4 | — | Đã lên web thật 14/10 (PR #75) |
| W1 | `app/api/reports/product-groups/route.ts`, `tests/product-groups-wh-confirmed.test.ts` | Như 4.2.6; lên web thật |
| W2 | `app/api/reports/staff-compare/route.ts`, test mới | Như 4.2.6; lên web thật |
| W5 | `app/api/reports/staff-compare/route.ts` (`chart`, `staff[].chart`), `app/staff-compare.tsx` (bắt buộc: `CompareStrip` đọc `chart`, và `staff[].chart` ở chế độ `focus`), test mới | Như 4.2.6 (cả danh sách "W5: luật của `chart`"); lên web thật |
| W3 (nên làm) | `app/api/reports/sections/route.ts`, `lib/sections.ts` | Như 4.2.6 |

### 5.2 iOS (nhánh `claude/project-thread-avd7td`)

**Số phiên bản:** I0–I5b và I7 không đổi. I6 đổi một lần cho cả bản phát hành, theo plan iOS 11/10 "mỗi Release tăng số".

**Thứ tự:** I0 → I1 → I2 → I3 → I4 → I4b → I7 → I5a → I5b → I6 (mục 4.1).

**I0. Gộp `main` vào nhánh, đưa plan vào repo (tổ app, không phải Codex)**
- **Mục đích.** Worktree của Codex có mã web 14/10, có plan và `CODEX.md`.
- **Việc.**
  1. Trong một worktree sạch của `origin/claude/project-thread-avd7td`: `git merge --no-ff origin/main -m "Gộp main (PR #74, #75, #76) vào nhánh app iOS để Codex đọc mã web 14/10"`.
  2. Kiểm: `git diff --name-only HEAD^1 HEAD | grep -E '^(ios|android|\.github)/'` phải rỗng.
  3. Commit chỉ có tài liệu: `docs/plans/2026-10-14-app-ios-android/plan.md` (file này) và `docs/plans/2026-10-14-app-ios-android/CODEX.md` (mục 5.5.1). Chạy các lệnh dò dữ liệu nhạy cảm ở 5.5.4 trên commit này.
  4. Đẩy: `git push origin HEAD:claude/project-thread-avd7td` (tiến thẳng, không force).
  5. Trên Mac, một lần: thêm `.codex-dd/`, `.codex-out/`, `.gradle-home/`, `.android-home/` vào `$(git rev-parse --git-common-dir)/info/exclude` (chỉ ở máy, không commit).
- **Xong khi.** `git ls-tree -r --name-only origin/claude/project-thread-avd7td -- app/staff-compare.tsx lib/hr-unit.ts docs/plans/2026-10-14-app-ios-android/` ra đủ 4 file. CI iOS không bắt buộc ở bước này (không đổi `ios/`).
- **Lặp lại** sau mỗi lần một PR được gộp vào `main` (mục 4.1).

**I1. Chữ và định dạng số (chưa đổi giao diện)**
- **Mục đích.** Có sẵn mọi nhãn và hàm định dạng cho I3–I5b, có kiểm thử chuỗi.
- **File được sửa.**
  - `ios/Megatech/WidgetShared/Format.swift`
  - `ios/Megatech/Megatech/FormatSelfTest.swift`
  - `ios/Megatech/Megatech/Terms.swift` (mới)
- **Việc cụ thể.**
  - Thêm vào `enum Fmt` (cùng quy tắc với `delta` / `DeltaPill` / `Change` của web, `main:app/ui-kit.tsx:35-39, 57-63`, `main:app/staff-compare.tsx:229-264`):
    - `changePct(_ now: Double?, _ prev: Double?) -> String`. Thiếu một trong hai số: "—". Kỳ so bằng 0: "mới" khi kỳ này lớn hơn 0, "0,0%" khi kỳ này bằng 0. Còn lại `d = (now − prev)/prev × 100`: d > 0 ra "+12,5%", d < 0 ra "−3,0%" (dấu trừ U+2212), d = 0 ra "0,0%". Một chữ số lẻ, dấu phẩy.
    - `changeTone(_ now: Double?, _ prev: Double?, points: Bool) -> Int`: 1 tăng, −1 giảm, 0 bằng hoặc thiếu số (để chọn màu ở chỗ gọi).
    - `changePoints(_ a: Double?, _ b: Double?) -> String`: "+1,2 điểm" / "−0,4 điểm" / "+0,0 điểm" khi bằng nhau / "—" khi thiếu số.
    - `cmpShort(_ v: Double?, metric: String) -> String`: Đơn chốt dùng `int`, Doanh thu dùng `short` (không " ₫"), Tỷ lệ chốt dùng `pct`, thiếu số ra "—".
    - `weekdayShort(_ ymd: String) -> String`: "CN", "T2"…"T7".
    - `cmpSpan(_ start: String, _ end: String) -> String`: "T2 12/10" khi một ngày, "01/10–12/10" (gạch U+2013) khi nhiều ngày. **Không** đặt tên `span`: `Fmt.span(String?, String?)` đã có, ra chữ khác (`avd7td:ios/Megatech/WidgetShared/Format.swift:101-106`); trùng tên sẽ đổi kết quả của chỗ đang gọi.
  - Trong `FormatSelfTest` thêm phần `compare()`, gọi trong `runAndExit`. Mỗi hàm có ca chuỗi viết sẵn, ít nhất:
    - `changePct`: (12, 0) "mới"; (0, 0) "0,0%"; (10, 10) "0,0%"; (nil, 5) "—"; (5, nil) "—"; tăng, giảm, số lớn (tỷ, triệu).
    - `changePoints`: tăng, giảm, bằng nhau "+0,0 điểm", nil.
    - `cmpShort` với từng chỉ số và nil; `weekdayShort` đủ 7 ngày; `cmpSpan` một ngày và nhiều ngày.
  - `Terms.swift` có:
    - `enum CmpMode: String, CaseIterable` với `label`, `short`, `title`, `steps`.
    - `func stepLabel(mode:n:days:)`, `func cmpLabel(mode:n:days:)` đúng quy tắc mục 4.4.3.
    - `enum CmpKind` (`label`, `title`).
    - `enum StaffMetric` (`label`, `noun`), thứ tự Đơn chốt, Doanh thu, Tỷ lệ chốt.
    - `enum StaffTerms`: tiêu đề cột, hai phụ đề và đuôi phụ đề, các dòng giải thích và định nghĩa Tỷ lệ chốt, câu báo team, các câu "chưa lọc theo team", câu "chưa lọc theo nhóm đơn", câu "Đang hiện {n} đơn đầu…".
    - Đủ chữ như bảng 4.4.4, ghi nguồn web ở chú thích.
- **Không được đổi.** Hàm `Fmt` cũ và kết quả của chúng; ca kiểm thử cũ. Không thêm hàm trùng tên với hàm cũ.
- **Xong khi.** "FORMAT_TEST OK n cases" với n tăng đúng số ca mới; app trông y như trước.
- **Cách kiểm.** CI; tổ app kiểm qua tóm tắt của Codex (số ca, "FORMAT_TEST OK" trên máy ảo) và diff (từng ca so với web), không QA.
- **Log Debug.** Không thêm. Bước này không có đoạn video.

**I2. Mô hình và lời gọi API (chưa có giao diện)**
- **Mục đích.** Đọc đúng JSON ở mục 4.2, có kiểm thử giải mã. App vẫn chạy khi chưa có W1 / W2 / W5.
- **File được sửa.**
  - `ios/Megatech/Megatech/StaffAPI.swift` (mới)
  - `ios/Megatech/Megatech/DecodeSelfTest.swift` (mới, cả file trong `#if DEBUG`)
  - `ios/Megatech/Megatech/MegatechApp.swift` (một dòng trong khối `#if DEBUG` ở 14-20)
  - `.github/workflows/ios-preview.yml` (ngoại lệ có tên: thêm bước "Kiểm thử giải mã")
- **Việc cụ thể.**
  - `extension API` gồm các kiểu `StaffTable`, `StaffRow`, `StaffSum`, `PGOrder` (chỉ các trường ở bảng 4.2.1, có `CodingKeys` rõ cho bẫy `first_confirmed_at`), `StaffCompare`, `CmpCell`, `CmpStaff` (có `chart: CmpChart?`), `CmpTotals`, `CmpChart`, `ChartPoint` (W5), `HrTeamItem`.
  - `struct StaffOrderQuery: Hashable` (team, by, start, end, posIds, staffId, wh, hrTeam, tiêu đề), dùng cho Route ở I3.
  - Hàm, tham số theo đúng thứ tự ở 4.2.1, 4.2.2:
    - `staffTablePath(start:end:posIds:team:by:hrTeam: String? = nil)`, `staffTable(...)`.
    - `staffOrdersPath(_ q: StaffOrderQuery)` = `staffTablePath(...)` + `&staffId=…` + (`&wh=1` khi cần); `staffOrders(_ q:)`.
    - `staffComparePath(start:end:posIds:team:by:mode:step:cstart:cend:hrTeam: String? = nil)`, `staffCompare(...)`.
    - `hrTeams()` như mục 4.2.3 (bỏ qua bộ nhớ đệm). **Chỉ định nghĩa ở file này.**
  - Trường của W1 / W2 / W5 khai báo tùy chọn (`?`). Tên trường W5 theo mục 4.2.2; Tổ web tổng đổi tên thì I4b sửa theo.
  - `series` giải mã thành `[[Double]]`; phần tử thiếu thì coi là nil khi vẽ.
  - `DecodeSelfTest.runAndExit()`, chạy khi `MEGATECH_DECODE_TEST=1` (gọi ở `MegatechApp.swift` cạnh `FormatSelfTest`):
    - Giải mã JSON mẫu viết sẵn, số giả (12, 30), tên giả ("NV A"):
      - product-groups có và không có trường W1;
      - danh sách đơn có cặp `first_confirmed_at` / `confirmed_at` khác nhau, kiểm `closedAt` và `whConfirmedAt` không đảo;
      - staff-compare có và không có `seriesRate`, `rowsTotal`, `chart`, `staff[].chart` (có điểm null); `cutoff` null và có giá trị;
      - `/api/teams?list=1` có `office`, `mentor` null.
    - Kiểm từng đường dẫn hàm `…Path` trả (trước khi `makeRequest` gắn Cách tính) trùng từng ký tự với chuỗi mẫu viết theo 4.2.1, 4.2.2: có và không có `hrTeam`, `custom` và không, `posIds` rỗng, một mã và nhiều mã. So với chuỗi plan quy định, không so với chuỗi web (web mã hóa dấu phẩy thành `%2C`).
    - In "DECODE_TEST FAIL …" cho từng ca lệch, rồi "DECODE_TEST OK n cases" và thoát.
  - `ios-preview.yml`: bước "Kiểm thử giải mã" ngay sau bước FORMAT_TEST (`:89-97`), cùng dạng, đỏ khi không có "DECODE_TEST OK".
- **Không được đổi.** `API.request`, `makeRequest`, `transfer`, mô hình cũ.
- **Xong khi.** `iOS preview` in "DECODE_TEST OK n cases"; build xanh; lượt tự xem chưa đổi.
- **Cách kiểm.** CI; tóm tắt của Codex ("DECODE_TEST OK" trên máy ảo); tổ app đọc `CodingKeys` và đường dẫn trong diff so với `route.ts`, không QA. Bước này không có đoạn video.

**I3. Bảng Từng nhân viên và cột Đã XN kho**
- **Mục đích.** Anh thấy bảng ở Sale › Nhân viên và CSKH › Tổng quan. Chạm được số Đã XN kho ra đúng đơn.
- **File được sửa.**
  - `ios/Megatech/Megatech/StaffTable.swift` (mới)
  - `ios/Megatech/Megatech/Shared.swift` (`Route`, `appRoutes`)
  - `ios/Megatech/Megatech/NavMemory.swift` (`restorable`, `encode`)
  - `ios/Megatech/Megatech/CskhViews.swift` (`CompareView`: chèn sau `ScopeLine(...)`; đổi `.pullToReload` thành `.pageReload`)
  - `ios/Megatech/Megatech/CskhOverview.swift` (chèn sau dòng 83, ngoài `if let t`; đổi `.pullToReload` thành `.pageReload`)
  - `ios/Megatech/Megatech/Departments.swift` (chỉ `DeptPage`: `ScrollViewReader`, phần cuộn theo `DebugTap` trong `#if DEBUG`)
  - `ios/Megatech/Megatech/Tabs.swift` (`DebugTour`, lượt `xnkho`)
  - `.github/workflows/ios-preview.yml` (ngoại lệ có tên: đoạn `12-xn-kho`)
- **Việc cụ thể.**
  - Làm theo 4.4.1, 4.4.2. Chưa có cột So cùng kỳ.
  - Dùng lại `Panel`, `SectionHead`, `Segmented`, `StateView`, `LoadError.text`, `Freshness`, `pullToReload`, `refreshHost`. Không dùng `StatusChip`.
  - Lượt tự xem `MEGATECH_TOUR=xnkho` (trong `#if DEBUG`): NAV_RESET, mở `.dept(.sale, period: .last, page: "compare")`, "chạm" tiêu đề Đã XN kho (`xnk-cot`), "chạm" ô của dòng đầu (`xnk-o`, bảng giải thích), đóng (`xnk-dong`), "chạm" "x/y đơn chốt" (`xnk-ds`), về, "chạm" số Đơn chốt của dòng đầu (`xnk-chot`), về, mở `.dept(.cskh, period: .last)`, cuộn tới bảng (`cuon:bang-nhan-vien`).
  - In `[XNK]` như mục 4.4.6 (`bang`, 5 dòng `dong` và `dong=tong` cho từng bảng, `ds`).
  - Chạy thử trên máy ảo (5.5.1 mục 10): chạy lượt `xnkho`; ảnh bảng Sale, bảng CSKH, bảng giải thích Đã XN kho của dòng 1, danh sách đơn, và bảng ở cỡ chữ lớn nhất của máy ảo. Tóm tắt ghi các dòng `[XNK]` đã in.
- **Không được đổi.** Nội dung và số cũ của `CompareView` và `CskhOverviewView`; Route cũ; khóa nhớ.
- **Xong khi.**
  - Bảng hiện ở cả hai trang, có dòng phụ đề, sắp xếp được, 10 dòng đầu và nút "Xem cả {n} người".
  - Số mỗi ô trùng web demo (mục 6).
  - Chạm "x/y đơn chốt" ra đúng x đơn.
  - Dòng Tổng có khi web đã có W1.
  - Đổi kỳ, POS thì số đổi theo. Kéo để làm mới tải lại bảng, kể cả khi trang mở riêng.
  - Màn 390pt cuộn ngang trong bảng, không tràn trang.
- **Cách kiểm.**
  - CI `iOS`; đoạn `12-xn-kho` (gửi anh).
  - Tổ app: tóm tắt của Codex (ảnh, các dòng `[XNK]`, phải có `du=co`) và diff.
  - Mốc QA: mục 6.1, so `12-xn-kho-app.txt` và tóm tắt với API demo.

**I4. So cùng kỳ: dải chọn và biểu đồ mini**
- **Mục đích.** Cột So cùng kỳ và dải chọn như web.
- **File được sửa.**
  - `ios/Megatech/Megatech/StaffCompare.swift` (mới)
  - `ios/Megatech/Megatech/StaffTable.swift` (thêm cột, dải chọn, dòng Tổng)
  - `ios/Megatech/Megatech/Tabs.swift` (mở rộng lượt `xnkho`)
  - `.github/workflows/ios-preview.yml` (ngoại lệ có tên: đoạn `12-xn-kho` dài thêm)
- **Việc cụ thể.**
  - Làm theo 4.4.3, gồm cách lấy ngày tự chọn khi chưa có, giờ Việt Nam, giới hạn ngày, hình học từng kiểu biểu đồ.
  - Màu theo `Fmt.changeTone`: tăng `Color.good`, giảm `Color.bad`, bằng nhau hoặc thiếu số `Color.inkSoft`.
  - Lượt tự xem đổi lần lượt: Lên xuống → Chênh lệch → Cộng dồn; kiểu so Cùng thứ tuần trước, lùi 2; chỉ số Tỷ lệ chốt; Tự chọn ngày; cuối lượt mở kỳ Hôm nay (ca cắt theo giờ). In `[XNK] so …` sau mỗi lần đổi và `[XNK] mini …` cho 5 dòng đầu và dòng Tổng (4.4.6).
  - Chạy thử trên máy ảo (5.5.1 mục 10): lượt `xnkho`; ảnh ba kiểu biểu đồ và ảnh kỳ Hôm nay. Thêm các ca 6.2.6–6.2.8, ghi lệnh và dòng log vào tóm tắt:
    - 6.2.6: chọn Tự chọn ngày, `xcrun simctl terminate booted <bundle>` rồi `launch`: không lỗi 400, dòng `[XNK] so mode=custom` có hai ngày.
    - 6.2.7: mở app với `SIMCTL_CHILD_TZ=America/New_York`, chọn Tự chọn ngày: `cs`, `ce` của dòng `[XNK] so` trùng ngày đã chọn.
    - 6.2.8: đổi kiểu so, mức lùi, kiểu biểu đồ, rồi `terminate` và `launch`: dòng `[XNK] so` đầu tiên sau khi mở giữ đúng ba giá trị đó.
  - Chuẩn bị `focusId` cho I7 (mục 4.4.3), chưa có giao diện.
- **Không được đổi.** Số của bảng ở I3. Đổi kiểu so không tải lại bảng.
- **Xong khi.**
  - Năm kiểu so, các mức lùi, ba kiểu biểu đồ, ba chỉ số đều chạy.
  - Chữ kỳ, số tổng và mức đổi trùng dải của web demo.
  - Chọn kiểu so rồi tắt app, mở lại vẫn giữ. Đang ở Tự chọn ngày mà tắt app, mở lại: không lỗi 400, hai ngày điền từ máy chủ.
  - Hôm nay: chỉ vẽ tới giờ `cutoff`, cả hai đường, và có câu "Kỳ đang xem chưa hết ngày…".
- **Cách kiểm.** CI; đoạn `12-xn-kho` dài thêm; tóm tắt của Codex (ảnh, ca máy ảo, log `[XNK] so`, `[XNK] mini`). Mốc QA: mục 6.2.1–6.2.9.

**I4b. Biểu đồ to của dải So cùng kỳ**
- **Mục đích.** Biểu đồ to như web, vẽ từ `chart` của W5.
- **Điều kiện bắt đầu.** W5 đã có trên bản demo của web. I2 đã có mô hình `chart` để tùy chọn; nếu I2 làm trước khi W5 chốt tên trường, I4b sửa mô hình theo W5 và thêm ca cho `DecodeSelfTest`.
- **File được sửa.**
  - `ios/Megatech/Megatech/StaffCompare.swift` (`CompareChart`)
  - `ios/Megatech/WidgetShared/Format.swift` (thêm `Fmt.chartDiff`)
  - `ios/Megatech/Megatech/FormatSelfTest.swift` (ca của `chartDiff`)
  - `ios/Megatech/Megatech/StaffAPI.swift`, `ios/Megatech/Megatech/DecodeSelfTest.swift` (chỉ khi phải sửa mô hình theo W5)
  - `ios/Megatech/Megatech/Terms.swift` (ba câu trên biểu đồ, chữ "Chênh lệch" của hộp chạm)
  - `ios/Megatech/Megatech/Tabs.swift` (mở rộng lượt `xnkho`: chạm giữ biểu đồ)
  - `.github/workflows/ios-preview.yml` (ngoại lệ có tên: đoạn `12-xn-kho` dài thêm)
- **Việc cụ thể.**
  - Làm theo mục "Biểu đồ to" ở 4.4.3. `CompareChart` nhận `CmpChart` làm tham số (I4b truyền `chart` cả đội; I7 sẽ truyền `staff[].chart`).
  - Thêm vào `enum Fmt`: `chartDiff(_ cur: Double?, _ prev: Double?, metric: String) -> (text: String, up: Bool)?`, cho dòng "Chênh lệch" của hộp chạm, như web (`main:app/staff-compare.tsx:473-486`):
    - Thiếu một trong hai số: nil (hộp không có dòng này).
    - Hiệu d = cur − prev; `up` = d ≥ 0.
    - Chữ: "+" khi d ≥ 0, "−" (U+2212) khi d < 0, rồi |d| viết theo chỉ số đang vẽ: Đơn chốt `int`; Doanh thu `shortMoney` (có " ₫", như web); Tỷ lệ chốt một chữ số lẻ, dấu phẩy, kèm " điểm".
  - `FormatSelfTest` (phần `compare()`) thêm ca, ít nhất: (30, 12, Đơn chốt) "+18"; (12, 30, Đơn chốt) "−18"; (12, 12, Đơn chốt) "+0", `up` đúng; (30.000.000, 12.000.000, Doanh thu) "+18,0 tr ₫"; (37,5, 40, Tỷ lệ chốt) "−2,5 điểm"; (12, nil) và (nil, 12) ra nil.
  - In `[XNK] bieu-do kind=<kind> diem=<len>` (chỉ số đếm). Lượt tự xem chạm giữ 3 điểm (điểm đầu, một điểm giữa, điểm cuối có số của kỳ này) và in một dòng `[XNK] cham …` cho mỗi điểm (4.4.6).
  - Chạy thử trên máy ảo (5.5.1 mục 10): ảnh ba kiểu biểu đồ, hộp chạm có dòng "Chênh lệch", kỳ Hôm nay (cắt theo giờ), Tháng trước kiểu Cùng kỳ năm trước, và Tự chọn ngày dài khác kỳ đang xem (đường kỳ ngắn hơn dừng sớm).
- **Không được đổi.** Số và nút của I4. Hàm `Fmt` cũ và ca kiểm thử cũ. Không gọi thêm API.
- **Xong khi.**
  - "FORMAT_TEST OK n cases" với n tăng đúng số ca mới.
  - Ba kiểu biểu đồ và ba chỉ số vẽ cùng hình với biểu đồ to của web demo, cùng kỳ, POS, kiểu so.
  - Hôm nay theo giờ: hai đường dừng ở giờ `cutoff`. Kỳ nhiều ngày kết thúc hôm nay: không cắt. Kỳ dài (Tháng trước, kiểu Cùng kỳ năm trước): số điểm bằng `chart.len`. Hai kỳ dài khác nhau (tháng 31 ngày so tháng 30 ngày): đường kỳ ngắn hơn dừng sớm.
  - Chạm giữ một điểm: hai số và dòng "Chênh lệch" (chữ và màu) trùng hộp của web ở cùng điểm.
  - Không có `chart` (máy chủ cũ): không có biểu đồ, không lỗi.
- **Cách kiểm.** CI; đoạn `12-xn-kho` dài thêm; tóm tắt của Codex (ảnh ba kiểu, ảnh hộp chạm, 3 dòng `[XNK] cham`). Mốc QA: mục 6.2.10, so 3 dòng `[XNK] cham` với `chart` của API demo.

**I7. Chạm biểu đồ mini: xem riêng một người**
- **Mục đích.** Như web thật (PR #76): chạm biểu đồ mini của một người thì dải So cùng kỳ hiện hai số tổng và biểu đồ to của riêng người đó, có nút "Xem cả đội" để quay lại.
- **Điều kiện bắt đầu.** I4b xong. Bản demo của web có W5, gồm `staff[].chart`. Chạy trước I5a.
- **Web làm thế nào** (`main@a7d479b:`; đọc bằng `git show origin/main:<đường dẫn>`):
  - Cả ô So cùng kỳ của mỗi dòng là một nút (`app/product-group-blocks.tsx:1072-1109`). Chạm ô thì xem riêng người đó; chạm lại chính ô đang xem thì về cả đội. Ô đang xem có viền màu chính và nền nhạt.
  - Sau khi chạm, trang chỉ cuộn khi đỉnh khung So cùng kỳ đang khuất (dưới thanh trên hoặc ngoài màn hình), rồi dừng đỉnh khung cách thanh trên 8px (`:1078-1095`).
  - Khung có nút "Xem cả đội" (mũi tên trái đứng trước chữ) và dòng "Đang xem riêng {tên}". Khi xem cả đội, khung ghi "Đang xem cả đội · bấm biểu đồ nhỏ ở cột So cùng kỳ để xem riêng từng người" (`app/staff-compare.tsx:612-631`). Khung nằm dưới hàng chọn, trên hai số tổng.
  - Hai số tổng lấy `current` / `previous` của người đó trong `staff[]` của staff-compare (`app/staff-compare.tsx:448-451`). Biểu đồ to vẽ từ chuỗi của người đó (`:405-411`; sau W5 là `staff[].chart`).
  - Đổi kỳ, kiểu so, kiểu biểu đồ, chỉ số: vẫn giữ người đó. Người đó không có dòng trong bảng của lần tải mới: khung về cả đội (`app/product-group-blocks.tsx:667-669`). Đổi bộ chọn nhân viên mà người đó ra ngoài phạm vi thì bỏ chọn (`:599-608`); app không có bộ chọn nhân viên nên không có ca này.
- **File được sửa.**
  - `ios/Megatech/Megatech/StaffCompare.swift` (`CompareState.focusId`; khung "Đang xem riêng" và nút "Xem cả đội"; hai số tổng và `CompareChart` theo người đang xem)
  - `ios/Megatech/Megatech/StaffTable.swift` (ô So cùng kỳ thành nút, viền ô đang xem, cuộn tới dải chọn)
  - `ios/Megatech/Megatech/Terms.swift` (ba câu của khung, bảng 4.4.4)
  - `ios/Megatech/Megatech/Tabs.swift` (mở rộng lượt `xnkho`)
  - `.github/workflows/ios-preview.yml` (ngoại lệ có tên: đoạn `12-xn-kho` dài thêm)
- **Việc cụ thể.**
  - Ô So cùng kỳ của mỗi dòng người (không phải dòng Tổng) là `Button` bọc `CompareCell`. Chạm: `focusId = (focusId == sellerId) ? nil : sellerId`. Ô đang xem có viền 2pt `Color.brand` và nền `Color.brandSoft` (`avd7td:ios/Megatech/Megatech/Theme.swift:5, 8`).
  - Cuộn: dải chọn có `.id("so-cung-ky")`. `StaffTableBlock` bọc nội dung trong `ScrollViewReader`; chạm ô thì `withAnimation { proxy.scrollTo("so-cung-ky") }`, không đặt `anchor` (SwiftUI chỉ cuộn khi dải đang khuất, và cuộn ít nhất). Dùng được cả khi trang nhúng (`DeptPage`) lẫn mở riêng (`Embed`).
  - Khung (dưới hàng chọn, trên hai số tổng):
    - Đang xem riêng: nút "Xem cả đội" có `Image(systemName: "arrow.left")` trước chữ (chạm thì `focusId = nil`), rồi "Đang xem riêng **{tên}**". Tên lấy từ dòng của bảng product-groups, nối bằng `sellerId`.
    - Cả đội: dòng chữ nhỏ "Đang xem cả đội · bấm biểu đồ nhỏ ở cột So cùng kỳ để xem riêng từng người".
  - Hai số tổng khi xem riêng: `current` / `previous` của người đó trong `staff[]` (`CmpCell`), theo chỉ số đang chọn; mức đổi qua `Fmt.changePct` / `Fmt.changePoints` như I4. Chữ kỳ ("Kỳ này · …", "{cmpLabel} · …") và câu `cutoff` giữ như I4. Người đó không có trong `staff[]` của staff-compare: hai số "—".
  - Biểu đồ to khi xem riêng: truyền `staff[].chart` của người đó vào `CompareChart` (I4b), cả ba kiểu, kể cả Cộng dồn. Không có `staff[].chart` (máy chủ cũ): ẩn biểu đồ to, hai số tổng vẫn theo người đó. App không tự gộp điểm, không tự cộng dồn, không cộng số nhiều người (4.3).
  - Giữ `focusId` khi đổi kỳ, POS, kiểu so, mức lùi, kiểu biểu đồ, chỉ số (I5a: cả team). Không có dòng của người đó trong bảng của lần tải mới thì khung về cả đội, như web. `focusId` không lưu xuống máy, không vào `NavMemory`.
  - Lượt tự xem `xnkho` thêm, sau phần I4b (kỳ Tháng trước): chạm ô mini dòng 1 (`xnk-rieng`); in `[XNK] rieng dong=1 …`; chạm giữ 3 điểm biểu đồ to, in 3 dòng `[XNK] cham …`; chạm "Xem cả đội" (`xnk-ca-doi`), in `[XNK] ca-doi …`; chạm lại ô dòng 1 hai lần (vào rồi về) (4.4.6).
  - Chạy thử trên máy ảo (5.5.1 mục 10): ảnh trước khi chạm, sau khi chạm (thấy khung và ô có viền), khi về cả đội; ảnh khi chạm ô của một dòng ở cuối bảng (dải chọn đang khuất, phải cuộn lên).
- **Không được đổi.** Số, nút và biểu đồ to cả đội của I4, I4b khi không xem riêng. Không gọi thêm API: dùng chung lần gọi staff-compare của I4.
- **Xong khi.**
  - Chạm ô mini: ô có viền; khung ghi "Đang xem riêng {tên}"; hai số tổng và biểu đồ to theo người đó trùng web demo khi xem riêng cùng người, cùng kỳ, kiểu so, kiểu biểu đồ, chỉ số.
  - "Xem cả đội" hoặc chạm lại ô đang xem: về số cả đội, khung ghi "Đang xem cả đội · …".
  - Dải chọn đang khuất thì trang cuộn tới, thấy trọn dải; đang thấy thì không cuộn.
  - Đổi kiểu so, kiểu biểu đồ, chỉ số, kỳ: vẫn xem riêng người đó. Người đó không còn dòng trong bảng: khung về cả đội.
  - Ba câu của khung trùng web từng chữ (bảng 4.4.4).
- **Cách kiểm.** CI; đoạn `12-xn-kho` dài thêm; tóm tắt của Codex (ảnh, các dòng `[XNK] rieng`, `cham`, `ca-doi`). Mốc QA: mục 6.2.11, so với `staff[]` và `staff[].chart` của API demo.

**I5a. Chọn team ở bốn trang**
- **Mục đích.** Xem số theo một team, như web, ở bốn trang có lọc.
- **File được sửa.**
  - `ios/Megatech/Megatech/HrTeam.swift` (mới)
  - `ios/Megatech/Megatech/Tabs.swift` (`AppNav.hrUnit`; lượt `team`)
  - `ios/Megatech/Megatech/API.swift` (`overviewPath`, `overview` thêm `hrTeam`)
  - `ios/Megatech/Megatech/Departments.swift` (`vanDonPath`, `vanDon`, `VanDonView`)
  - `ios/Megatech/Megatech/Home.swift` (`HomeView`: hàng chip, câu 4 bảng; `CenterBlocks`: `hrTeam`, `key`, câu từng thẻ, Mục tiêu tháng, `filterSuffix`, lỗi team)
  - `ios/Megatech/Megatech/CskhViews.swift` (`CompareView`)
  - `ios/Megatech/Megatech/CskhOverview.swift` (`CskhOverviewView`; câu dưới khối KPI và thẻ cuộc gọi)
  - `ios/Megatech/Megatech/StaffTable.swift` (`hrTeam` của bảng và danh sách đơn; khóa tải; lỗi team)
  - `ios/Megatech/Megatech/StaffCompare.swift` (`hrTeam` của So cùng kỳ; khóa tải)
  - `.github/workflows/ios-preview.yml` (ngoại lệ có tên: đoạn `13-team`)
- **Việc cụ thể.**
  - Làm theo 4.4.5, phần lưu team, các hàm, `HrTeam.swift`, bảng bốn trang, bảng `CenterBlocks`, lỗi team.
  - Lượt tự xem `MEGATECH_TOUR=team`: mở chọn team (`team-mo`), chọn team Sale đầu tiên của demo (`team-chon`), xem Sale › Nhân viên, Tổng quan, CSKH › Tổng quan (phải hiện "Trang này chưa lọc được theo team"), Vận đơn, rồi "Bỏ chọn team" (`team-bo`). In `[TEAM]` như 4.4.6 (danh sách team, 5 dòng đầu của bảng, thẻ Tổng quan, Vận đơn). Kỳ Tháng trước.
  - Chạy thử trên máy ảo (5.5.1 mục 10): lượt `team`; ảnh danh sách team, Tổng quan khi áp team (thẻ có câu, Mục tiêu tháng không %), CSKH › Tổng quan. Ca 6.3.7: chọn team, `xcrun simctl terminate` rồi `launch`: dòng `[TEAM]` đầu tiên có `ap=khong`.
  - Ca 6.3.8 (vòng góp ý riêng, khi Tổ web nhân sự đã đổi tên một team thử trên demo của web nhân sự, rồi khi đã xóa team đó): chạy lại lượt `team`; ảnh danh sách có tên mới ngay, không đợi 60 giây; ảnh câu lỗi của máy chủ và nút "Bỏ chọn team".
- **Không được đổi.** Khi chưa chọn team, mọi đường dẫn giữ nguyên từng chữ (UnlockPrefetch); `UnlockPrefetch.swift` không sửa.
- **Xong khi.**
  - Danh sách team trùng web demo.
  - Số các trang lọc theo team trùng web demo cùng team.
  - Các thẻ không lọc được của `CenterBlocks` có câu; Mục tiêu tháng không còn %.
  - Tắt app mở lại thì team đã bỏ.
- **Cách kiểm.** CI; đoạn `13-team`; tóm tắt của Codex (ảnh, log `[TEAM]`, ca 6.3.7, 6.3.8). Mốc QA: các ca số của mục 6.3.

**I5b. Câu báo ở các trang chưa lọc theo team**
- **Mục đích.** Không trang nào hiện số không lọc mà không ghi rõ.
- **File được sửa.**
  - `ios/Megatech/Megatech/HrTeam.swift` (`HrUnit.notice(for:)`, `.hrNotice(dept:)`)
  - `ios/Megatech/Megatech/Tabs.swift` (`PageDestination`, `OrdersHome`, `AlertsPage`; lượt `team` dài thêm)
  - `ios/Megatech/Megatech/Shared.swift` (`appRoutes`: `.overview`, `.overviewRef`, `.overviewPos`, `.calls`, `.alerts`, `.alertsSync`; dòng báo ở `OrderListView`)
  - `ios/Megatech/Megatech/Departments.swift` (trang con khác của `SaleContent` / `CskhContent`; `DeptDestination` nhánh `.mkt`)
  - `ios/Megatech/Megatech/HomeFeed.swift`
  - `.github/workflows/ios-preview.yml` (ngoại lệ có tên: đoạn `13-team` dài thêm)
- **Việc cụ thể.** Làm theo bảng "Câu báo ở các trang còn lại" ở 4.4.5. Lượt `team` thêm: mở Trang chủ, tab Đơn hàng, Thêm › Báo cáo cuối tháng (phải có câu), Thêm › Cách tính (không có câu).
- **Không được đổi.** Khi chưa chọn team, không trang nào đổi giao diện.
- **Xong khi.** Mọi chỗ ở bảng có câu khi đang chọn team; trang cài đặt, `compare`, `cskh-overview` không có câu "chưa lọc".
- **Cách kiểm.** CI; đoạn `13-team`; tổ app kiểm qua tóm tắt của Codex (ảnh từng trang ở bảng, có hoặc không có câu) và diff, không QA.

**I6. Lên số phiên bản (Codex), rồi gộp (tổ app)**
- **Mục đích.** Không ghi đè bản đang cài; một số phiên bản cho một bản phát hành.
- **File được sửa.** `ios/Megatech/Megatech.xcodeproj/project.pbxproj`, chỉ 8 dòng `:296, 310, 325, 339, 353, 363, 378, 388`.
- **Việc cụ thể (Codex).** `MARKETING_VERSION` thành số chưa dùng (0.10, hoặc 0.11 nếu lần A đã gộp riêng) và `CURRENT_PROJECT_VERSION` tương ứng (10 hoặc 11), cho cả app và widget. Hai bên phải bằng nhau (`ios.yml:112-130`).
- **Luôn chạy trước mọi lần gộp PR #72**, kể cả lần gộp sớm (mục 4.1).
- **Điều kiện gộp `main` (tổ app kiểm):**
  - Anh duyệt video lần A, `12-xn-kho` và `13-team`.
  - W1, W2, W5 đã lên web thật (W4: đã lên web thật 14/10, PR #75).
  - Việc web của lần A (tìm kiếm) đã lên.
  - QA đạt mọi mốc iOS: I3, I4, I4b, I7, I5a (5.0).
- **Cách kiểm.** Tổ app kiểm qua tóm tắt của Codex (8 dòng số phiên bản) và diff, không QA.
- **Gộp:** squash. Sau khi gộp, tổ app gộp `origin/main` vào nhánh (như I0).
- **Xong khi.** CI `iOS` trên `main` tạo Release mới `ios-v0.10-10` (hoặc số đã chọn), `ios-v0.9-9` còn nguyên.

### 5.3 Android Phần A (nhánh `claude/app-android` nếu anh cho phép, nếu không thì nhánh PR #72) — ra bản 0.2

Điều kiện chung riêng của Android:
- CI `android.yml` xanh, gồm test, build và bước chặn định dạng / log / hộp nổi.
- Mọi file nằm trong `android/` (đường dẫn Kotlin viết tắt `…/` = `android/app/src/main/java/vn/megatech/tonghoppos/`), trừ file workflow có tên.
- Chữ, nhãn, câu báo giống iOS từng chữ (bảng 4.4.4).
- Mã iOS để tham khảo: Codex đọc bằng `git show origin/claude/project-thread-avd7td:<đường dẫn>` (nhánh Android cắt từ `main`, không có các file của lần A).
- Mọi móc lượt tự xem và log sau `if (BuildConfig.DEBUG)`.
- Số phiên bản: A0 đặt 0.2 (2). Bước khác không đổi.
- Chưa bỏ phép tự cộng có sẵn nào ở Phần A. Màn mới không tự cộng.
- Thứ tự: A0 → A1a → A1b → A1c → A2a → A2b → A6 → A7 → A7c → A7b → A8a → A8b (mục 4.1). A7b chạy sau A7c.
- Chạy thử: Codex chạy trên Android emulator của Mac nếu có (5.5.1 mục 10). Mac không có emulator thì ghi vào tóm tắt; các ca máy ảo của mục 6 thành bước CI (4.5.5).

**A0. Nền build, CI và ký bản**
- **Mục đích.** Build được trên CI, ra APK phát hành chưa ký, có test đầu tiên.
- **Trước bước này (tổ app).** Commit đầu của `claude/app-android` là commit tài liệu như I0 (plan và `CODEX.md`). Tổ app tra SHA các action, bản `org.json` và bản `build-tools` (`BUILD_TOOLS_VERSION`, mục 4.5.3), ghi vào lời giao. Rồi tải sẵn `junit:junit:4.13.2` và đúng bản `org.json` đó vào `GRADLE_USER_HOME` của worktree (5.5.3).
- **File được sửa (Codex).**
  - `android/app/build.gradle.kts`: số phiên bản đọc từ `gradle.properties`; bản phát hành chỉ gắn `signingConfig` khi `local.properties` có `megatech.keystore` (mục 4.5.3); `testImplementation("junit:junit:4.13.2")`, `testImplementation("org.json:json:<bản trong lời giao>")`. Không đọc biến môi trường ký.
  - `android/gradle.properties`: thêm `megatech.versionName=0.2`, `megatech.versionCode=2`, giữ 3 dòng cũ.
  - `…/Api.kt:128`: User-Agent dùng `BuildConfig.VERSION_NAME`.
  - `android/app/src/test/java/vn/megatech/tonghoppos/FmtTest.kt` (mới): ca cho hàm có sẵn của `Fmt.kt`.
  - `.github/workflows/android.yml` (mới, ngoại lệ có tên): đúng mục 4.5.3.
  - `android/tools/tao-khoa-ky.sh` (mới): đúng mục 4.5.4. Codex chỉ kiểm cú pháp (`bash -n`, thêm `shellcheck` nếu máy có), không chạy.
  - `android/signing-cert.sha256` (mới): đúng một dòng, 64 ký tự hex chữ thường, không dấu hai chấm. Chép nguyên dòng script của anh ghi ra (mục 4.5.4), tổ app đưa vào lời giao. Chưa có thì để tới A8b.
- **Việc của anh.** Sau câu 2 và khi A0 đã lên nhánh: dán một dòng lệnh ở 4.5.4. Không bắt buộc xong trước A1a, bắt buộc trước khi phát hành.
- **Không được đổi.** Màn hình, cách gọi API.
- **Xong khi.**
  - CI `Android` chạy khi đẩy lên `claude/app-android`: kiểm wrapper, test, build debug xanh.
  - Log CI cho thấy `sdkmanager` cài đúng `platforms;android-37` và `build-tools` bản trong lời giao, và Gradle không tải thêm bản `build-tools` nào khác.
  - Bản phát hành chưa ký build được. Để kiểm trên nhánh mà không mở PR, A0 tạm cho job `build` chạy `assembleRelease` cả trên `claude/app-android`, rồi ở A8b chỉ để chạy trên `main` như 4.5.3.
  - Nếu AGP 9.4.1 không tải được trên CI, Codex đổi về bản AGP gần nhất tải được (tổ app đưa log lỗi), ghi vào mô tả PR.
  - Job ký không chạy trên nhánh. Lần ký đầu được kiểm lúc phát hành 0.2 (mục 4.5.3).
  - Codex chạy `--offline` mà vẫn thiếu thư viện (dù tổ app đã tải sẵn): Codex ghi rõ lệnh, lỗi và tên thư viện thiếu, không tự tải. Khi đó test và build của bước được kiểm bằng CI (CI có mạng).
- **Cách kiểm.** CI xanh; tóm tắt của Codex (test, build `--offline`, `bash -n`). Tổ app đọc `android.yml` và `tao-khoa-ky.sh` trong diff theo danh sách kiểm workflow ở 5.5.4 mục 7. Không QA riêng: QA đọc job ký trước bản phát hành đầu (6.4.13). Bước này không có đoạn video.

**A1a. Khóa bắt buộc, màn khóa, che màn hình**
- **Mục đích.** Đủ phần A1a của mục 4.5.2.
- **File được sửa.**
  - `…/LockPolicy.kt` (mới, Kotlin thuần)
  - `…/App.kt` (`Auth.start` 84-89, `AppLock` 110-140, `Privacy` 143-148, `Root` 150-183, `LockScreen` 185-204)
  - `…/Login.kt` (Welcome, `bio()`, nhánh mật khẩu khi không có khóa màn hình)
  - `…/Security.kt` (chỉ 134-135: duyệt đăng nhập máy tính)
  - `…/System.kt` (chỉ bỏ công tắc 77-81)
  - `…/Api.kt` (thêm `reauth(password)`)
  - `…/DebugLog.kt` (mới)
  - `android/app/src/test/java/vn/megatech/tonghoppos/AppLockTest.kt` (mới, kiểm `LockPolicy`)
  - Không có file workflow. Hộp nổi, `android-preview.yml` và video ở A1c.
- **`AppLockTest` gồm:**
  - Mở lạnh có phiên, có khóa màn hình, cài đặt cũ `lock=false`, `secure=false`: ra Welcome, lệnh xóa đủ `lock`, `lock_grace`, `secure`.
  - Mở lạnh có phiên, không có khóa màn hình: ra màn nhập mật khẩu, không bao giờ vào thẳng.
  - Không có phiên: màn đăng nhập.
  - Xác thực bắt đầu trước một lần vào nền: không mở khóa.
- **Không được đổi.** Cách đăng nhập, `Vault`, duyệt QR (chỉ thêm xác thực).
- **Xong khi.**
  - `AppLockTest` xanh trên CI.
  - Mở lạnh luôn thấy màn khóa, kể cả khi bản 0.1 đã tắt khóa.
  - Vào nền rồi quay lại thì khóa. Màn khóa đục.
  - Cài đặt không còn công tắc khóa / chụp màn hình.
  - Trình chuyển app không thấy số.
  - Không có khóa màn hình thì phải nhập mật khẩu, kể cả khi duyệt đăng nhập máy tính.
- **Cách kiểm.** CI (test); tóm tắt của Codex (chạy thử trên emulator nếu Mac có: ảnh màn khóa khi mở lạnh, màn nhập mật khẩu khi máy ảo không đặt PIN). Không QA riêng: bước này không có đoạn video; các ý trên được quay ở `1-khoa`, `2-che` và QA kiểm cùng mốc A1c (6.4).

**A1b. Sao lưu, cookie, máy chủ, bản debug**
- **Mục đích.** Đủ phần A1b của mục 4.5.2.
- **File được sửa.**
  - `android/app/src/main/AndroidManifest.xml`
  - `android/app/src/main/res/xml/data_extraction_rules.xml` (mới)
  - `android/app/src/main/res/xml/network_security.xml` (bỏ http thường) và `android/app/src/debug/res/xml/network_security.xml` (mới, có `10.0.2.2`, `localhost`)
  - `android/app/build.gradle.kts` (`applicationIdSuffix`, nhãn bản debug)
  - `…/Api.kt` (96-99 email vào `Vault`; 107-117 danh sách host cookie)
  - `…/App.kt` (`debugExtras` 66-72: `base` theo danh sách host)
  - `android/app/src/test/java/vn/megatech/tonghoppos/HostListTest.kt` (mới: host ngoài danh sách bị từ chối)
  - Không có file workflow: `android-preview.yml` chưa có, A1c viết với mã gói `.debug` của bước này.
- **Không được đổi.** Cách đăng nhập, `Vault`, các lời gọi API.
- **Xong khi.**
  - `aapt2 dump xmltree --file AndroidManifest.xml <apk>`: `allowBackup` tắt, có `dataExtractionRules`.
  - `adb shell bmgr backupnow vn.megatech.tonghoppos.debug` không chép dữ liệu app.
  - Bản debug với `-e base https://example.invalid`: vẫn gọi máy chủ mặc định.
  - Bản phát hành chỉ https.
- **Cách kiểm.** CI (`HostListTest`); tóm tắt của Codex (`aapt2 dump xmltree` trên APK debug; `bmgr` và `-e base` nếu Mac có emulator). Không QA riêng: QA kiểm cùng mốc A1c (6.4). Bước này không có đoạn video.

**A1c. Hộp nổi không nằm trên màn khóa, CI chặn hộp nổi, video đầu**
- **Mục đích.** Đủ phần A1c của mục 4.5.2. Có `android-preview.yml` và hai đoạn video đầu.
- **File được sửa.**
  - `…/Kit.kt` (năm hàm bọc; 370, 381, 391 dùng hàm bọc)
  - `…/Home.kt` (chỉ `ExplainSheet` ở 390)
  - `…/Security.kt` (chỉ 110, 205)
  - `…/System.kt` (chỉ `FullDialog` ở 37)
  - `…/Cskh.kt` (chỉ 81, 82, 84, 154, 335, 392)
  - `…/More.kt` (chỉ 242)
  - `…/PosUi.kt` (chỉ 114)
  - `…/DebugTour.kt` (mới, chỉ chạy khi `BuildConfig.DEBUG`): đoạn `khoa` mở hộp thử (`SafeSheet` có chữ "Bảng thử bản debug", không có số).
  - `…/App.kt` (chỉ chỗ gọi `DebugTour`, sau `if (BuildConfig.DEBUG)`: đọc `-e tour <đoạn>` ở `debugExtras`, dựng hộp thử)
  - `.github/workflows/android.yml` (ngoại lệ có tên: thêm tám mẫu cấm hộp nổi, xét cả thư mục)
  - `.github/workflows/android-preview.yml` (mới, ngoại lệ có tên: mục 4.5.5, hai job tách quyền, đoạn `1-khoa`, `2-che`)
- **Việc.**
  - Mỗi chỗ gọi đổi sang hàm bọc cùng loại, giữ nguyên tham số và nội dung hộp.
  - Đủ 15 chỗ ở 4.5.2. Code trên nhánh khác danh sách đó thì dừng lại hỏi, không tự đoán.
  - `Popup`, `BasicAlertDialog`, `ExposedDropdownMenu`: hiện chưa dùng, chỉ thêm mẫu cấm, không thêm hàm bọc.
  - Ca máy ảo của mốc bảo mật (gộp A1a, A1b), bản debug, ghi lệnh và kết quả vào tóm tắt: 6.4.5 (máy ảo không đặt PIN), 6.4.7 (`run-as` ghi khóa cũ, `adb shell am force-stop`, mở lại), 6.4.9 (`run-as` liệt kê tên khóa trong `shared_prefs`, không in giá trị), 6.4.10 (`aapt2`, `bmgr`), 6.4.11 (`-e base` host lạ). Mac không có emulator Android thì các ca 6.4.7, 6.4.9–6.4.11 thành bước có tên trong job quay của `android-preview.yml` (4.5.5).
- **Không được đổi.** Chữ, nội dung và cách dùng của các hộp khi app không khóa. Luật khóa của A1a.
- **Xong khi.**
  - Ngoài `Kit.kt` không còn chỗ gọi thẳng hộp nổi. Bước chặn của `android.yml` xét cả thư mục với tám mẫu mà vẫn xanh.
  - Mở WhySheet thử / một DropdownMenu / hộp Đổi mật khẩu, về Home, quay lại: chỉ thấy màn khóa. Mở khóa xong, hộp hiện lại.
  - `android-preview.yml` xanh; video và log của `1-khoa`, `2-che` có trên nhánh `android-preview`.
- **Cách kiểm.** CI; đoạn `1-khoa`, `2-che`; tóm tắt của Codex (ca máy ảo); tổ app đọc hai file workflow trong diff theo 5.5.4 mục 7. Mốc QA: mục 6.4 (gộp A1a, A1b, A1c).

**A2a. Định dạng số chung**
- **Mục đích.** Định dạng giống iOS; CI xét cả thư mục.
- **File được sửa.**
  - `…/Fmt.kt`: thêm các hàm như I1, tên giống iOS (`changePct`, `changeTone`, `changePoints`, `cmpShort`, `weekdayShort`, `cmpSpan`).
  - Khoảng 18 chỗ định dạng rải rác (mục 3.3) chuyển vào hàm của `Fmt.kt`, kết quả chữ giữ nguyên: `…/Home.kt`, `…/More.kt`, `…/Sale.kt`, `…/Metrics.kt`, `…/Orders.kt`.
  - `android/app/src/test/java/vn/megatech/tonghoppos/FmtTest.kt`: các ca giống từng chữ với `FormatSelfTest` của iOS.
  - `.github/workflows/android.yml` (ngoại lệ có tên): phần định dạng / log của bước chặn chuyển sang xét cả thư mục (phần hộp nổi đã xét cả thư mục từ A1c).
- **Việc thêm.** Lập danh sách các chỗ app tự cộng số (mục 3.3) vào mô tả PR: chỗ nào máy chủ đã có số thì ghi trường thay thế, chỗ nào chưa có thì ghi để Tổ web tổng bổ sung. Không sửa phép cộng nào ở bước này.
- **Không được đổi.** Chữ hiện ra của màn cũ.
- **Xong khi.** Test xanh; bước chặn xét cả thư mục mà vẫn xanh.
- **Cách kiểm.** CI; Codex chụp các màn cũ trước và sau trên máy ảo (bản debug, site demo), so chữ và ghi kết quả vào tóm tắt; tổ app đọc tóm tắt và diff, không QA. Bước này không có đoạn video.

**A2b. Mô hình có kiểu và lời gọi API của 14/10**
- **Mục đích.** Màn mới không hiện 0 khi thiếu số; đọc đúng JSON ở mục 4.2.
- **File được sửa.**
  - `…/Models.kt` (mới): `StaffTable`, `StaffRow`, `StaffSum`, `PGOrder` (chỉ trường ở bảng 4.2.1), `StaffCompare`, `CmpCell`, `CmpStaff` (có `chart` tùy chọn), `CmpTotals`, `CmpChart`, `ChartPoint` (W5), `HrTeamItem`. Hàm đọc từ `org.json` trả `null` khi thiếu trường. Trường lấy theo bảng 4.2.1, 4.2.2, 4.2.3; đối chiếu `StaffAPI.swift` của iOS (I2) nếu đã có trên nhánh iOS.
  - `…/Api.kt`: `staffTable(...)`, `staffOrders(...)`, `staffCompare(...)`, `hrTeams()`, đường dẫn trùng chuỗi plan quy định ở 4.2.1, 4.2.2 (như iOS), có tham số `hrTeam` để trống.
  - `…/App.kt` `Loader` (278+): câu lỗi giống `LoadError.text` của iOS (`avd7td:ios/Megatech/Megatech/Kit.swift:438-462`).
  - `android/app/src/test/java/vn/megatech/tonghoppos/ModelsTest.kt` (mới): JSON mẫu số giả như `DecodeSelfTest` của iOS, gồm cặp `first_confirmed_at` / `confirmed_at`, có và không có trường W1 / W2 / W5 (cả `staff[].chart`); kiểm đường dẫn trùng từng ký tự với chuỗi plan quy định (4.2.1, 4.2.2), các ca như `DecodeSelfTest`, không so với chuỗi web.
- **Không được đổi.** Màn cũ vẫn dùng `J`.
- **Xong khi.** Test xanh; câu lỗi 401 / 403 giống iOS.
- **Cách kiểm.** CI; tổ app đọc tóm tắt và diff, không QA. Bước này không có đoạn video.

**A6. Bảng Từng nhân viên và Đã XN kho (14/10)**
- **File được sửa.**
  - `…/StaffTable.kt` (mới)
  - `…/Sale.kt` (`CompareContent`: chèn bảng sau `PosChipRow`, mục 4.5.6)
  - `…/Cskh.kt` (`CSKH_TABS` thêm trang con "Nhân viên"; nhánh `when` mở `CompareContent("cskh")`)
  - `…/App.kt` (`Screen.StaffOrders(q)` thêm vào `Screen` ở 207-217 và nhánh của `ScreenView`)
  - `…/DebugTour.kt` (đoạn `xnkho`)
  - `.github/workflows/android-preview.yml` (ngoại lệ có tên: đoạn `3-xn-kho`)
- **Việc.**
  - Giống I3, bằng Compose: cột tên ghim, `horizontalScroll`, dòng phụ đề, bảng giải thích là `SafeSheet`, danh sách đơn là màn mới `Screen.StaffOrders`.
  - Kiểm số đơn trong cùng lần trả như 4.4.2.
  - Android chưa nhớ đường đi qua lần mở sau. Nếu Phần B thêm `NavState` thì `Screen.StaffOrders` không được lưu (tiêu đề mang tên người).
  - Lượt `xnkho` như I3 (kỳ Tháng trước), in `[XNK]` cùng dạng iOS (4.4.6). Chạy thử trên emulator nếu Mac có: ảnh như I3.
- **Không được đổi.** Số và nội dung cũ của `CompareContent` và các trang con CSKH cũ.
- **Xong khi.** Như I3, trên cả Sale › Nhân viên và CSKH › Nhân viên.
- **Cách kiểm.** CI; đoạn `3-xn-kho`; tóm tắt của Codex. Mốc QA: mục 6.1.

**A7. So cùng kỳ (14/10)**
- **File được sửa.** `…/StaffCompare.kt` (mới, vẽ bằng `Canvas` 84 × 20 dp), `…/StaffTable.kt`, `…/DebugTour.kt`, `.github/workflows/android-preview.yml` (ngoại lệ có tên: đoạn `4-so-cung-ky`).
- **Việc.**
  - Giống I4 và mục 4.4.3, gồm cách lấy ngày tự chọn khi chưa có và hình học từng kiểu biểu đồ.
  - Lưu kiểu so / mức lùi / kiểu biểu đồ bằng `SharedPreferences` khóa `thp_cmp_mode`, `thp_cmp_step`, `thp_cmp_kind`.
  - Chọn ngày bằng `SafeDatePicker`. Đổi millis ↔ ngày bằng `ZoneOffset.UTC` như `…/Kit.kt:389-394`; "hôm nay" lấy `VNDate.today()`; đến ngày không quá hôm nay.
  - Lượt tự xem như I4, in `[XNK] so`, `[XNK] mini` cùng dạng iOS.
  - Ca máy ảo 6.2.6–6.2.8 như I4, trên emulator nếu Mac có: tắt hẳn bằng `adb shell am force-stop vn.megatech.tonghoppos.debug` rồi `am start` (4.5.5); múi giờ khác bằng máy ảo chạy múi giờ khác. Không có emulator thì thành bước có tên trong job quay của `android-preview.yml` (4.5.5).
  - Chuẩn bị `focusId` cho A7b.
- **Không được đổi.** Số của bảng ở A6.
- **Xong khi.** Như I4.
- **Cách kiểm.** CI; đoạn `4-so-cung-ky`; tóm tắt của Codex. Mốc QA: mục 6.2.1–6.2.9.

**A7c. Biểu đồ to của dải So cùng kỳ (14/10)**
- **Điều kiện bắt đầu.** W5 đã có trên bản demo của web.
- **File được sửa.**
  - `…/StaffCompare.kt` (`CompareChart`, vẽ bằng `Canvas` của Compose, không thêm thư viện)
  - `…/Fmt.kt` (thêm `chartDiff(cur: Double?, prev: Double?, metric: String): Pair<String, Boolean>?`, chữ giống iOS từng ký tự)
  - `android/app/src/test/java/vn/megatech/tonghoppos/FmtTest.kt` (ca của `chartDiff`, giống từng chữ với `FormatSelfTest` của iOS ở I4b)
  - `…/Models.kt` hoặc file mô hình của A2b (chỉ khi phải sửa theo W5)
  - `…/DebugTour.kt`
  - `.github/workflows/android-preview.yml` (ngoại lệ có tên: đoạn `4-so-cung-ky` dài thêm)
- **Việc.** Giống I4b và mục "Biểu đồ to" ở 4.4.3, gồm hàm `chartDiff` và dòng "Chênh lệch" của hộp chạm. Chạm giữ bằng `pointerInput` (`detectTapGestures` / `detectDragGesturesAfterLongPress`) hiện hộp (Kỳ này, Kỳ so, Chênh lệch); hộp vẽ trong cùng `Canvas` hoặc là `Box` thường, không dùng hộp nổi. Lượt tự xem in số của 3 điểm chạm như I4b.
- **Không được đổi.** Số và nút của A7. Hàm cũ của `Fmt.kt` và ca test cũ.
- **Xong khi / Cách kiểm.** Như I4b; CI (`FmtTest` xanh); đoạn `4-so-cung-ky`; tóm tắt của Codex. Mốc QA: mục 6.2.10.

**A7b. Chạm biểu đồ mini: xem riêng một người (14/10)**
- **Mục đích.** Như I7, bằng Compose.
- **Điều kiện bắt đầu.** A7c xong. Bản demo của web có `staff[].chart` (W5). Chạy trước A8a.
- **File được sửa.**
  - `…/StaffCompare.kt` (`focusId`, khung "Đang xem riêng" và nút "Xem cả đội", hai số tổng và `CompareChart` theo người đang xem)
  - `…/StaffTable.kt` (ô So cùng kỳ chạm được, viền ô đang xem, cuộn tới dải chọn)
  - `…/DebugTour.kt` (lượt `xnkho` dài thêm)
  - `.github/workflows/android-preview.yml` (ngoại lệ có tên: đoạn `4-so-cung-ky` dài thêm)
- **Việc.**
  - Giống I7 từng ý: chạm ô (không phải dòng Tổng) thì `focusId` = người đó, chạm lại thì về cả đội; ô đang xem có viền 2dp màu chính; khung và ba câu như bảng 4.4.4, nút "Xem cả đội" có biểu tượng mũi tên trái trước chữ.
  - Hai số tổng lấy `current` / `previous` của người đó trong `staff[]`; biểu đồ to vẽ từ `staff[].chart` của người đó qua `CompareChart` của A7c. Không có `staff[].chart` thì ẩn biểu đồ to. Không tự gộp, không tự cộng dồn.
  - Cuộn: dải chọn có `BringIntoViewRequester`; chạm ô thì gọi `bringIntoView()` (Compose chỉ cuộn khi dải đang khuất, cuộn ít nhất).
  - Giữ người đó khi đổi kỳ, POS, kiểu so, mức lùi, kiểu biểu đồ, chỉ số, team. Không có dòng trong bảng của lần tải mới thì khung về cả đội. `focusId` chỉ trong bộ nhớ.
  - Lượt tự xem và log như I7 (`[XNK] rieng`, `cham`, `ca-doi`), cùng dạng iOS. Chạy thử trên emulator nếu Mac có: ảnh như I7.
- **Không được đổi.** Số, nút và biểu đồ to cả đội của A7, A7c khi không xem riêng. Không gọi thêm API.
- **Xong khi.** Như I7.
- **Cách kiểm.** CI; đoạn `4-so-cung-ky` dài thêm; tóm tắt của Codex. Mốc QA: mục 6.2.11.

**A8a. Chọn team ở các màn có lọc (14/10)**
- **File được sửa.**
  - `…/HrTeam.kt` (mới): `HrUnit`, `TeamState` (chỉ trong bộ nhớ, không lưu xuống máy), chip, bảng chọn (`SafeSheet`), câu báo, `HrTeamErrorView`, `notice(for:)`.
  - `…/Api.kt` (`overview()` thêm tham số `hrTeam`)
  - `…/Home.kt` (`HomeTab`: chip, ba lời gọi overview gửi `hrTeam`; `CenterBlocks`: câu từng thẻ, Mục tiêu tháng, dòng phạm vi có tên team)
  - `…/Sale.kt` (`CompareContent`: chip, câu báo, overview gửi `hrTeam`)
  - `…/StaffTable.kt`, `…/StaffCompare.kt` (`hrTeam`, khóa tải, lỗi team)
  - `…/App.kt` (`Auth.signOut` xóa `TeamState`)
  - `…/DebugTour.kt` (đoạn `team`)
  - `.github/workflows/android-preview.yml` (ngoại lệ có tên: đoạn `5-team`)
- **Việc.** Như 4.4.5 và 4.5.6. Android chưa có Vận đơn và CSKH › Tổng quan nên không có ở bước này. Lượt `team` in `[TEAM]` cùng dạng iOS (4.4.6). Ca 6.3.7 trên emulator nếu Mac có (`am force-stop` rồi `am start`), ca 6.3.8 như I5a.
- **Không được đổi.** Khi chưa chọn team, mọi đường dẫn giữ nguyên từng chữ.
- **Xong khi.** Như I5a, trên các màn Android có lọc.
- **Cách kiểm.** CI; đoạn `5-team`; tóm tắt của Codex. Mốc QA: các ca số của mục 6.3.

**A8b. Câu báo ở các màn chưa lọc, chuẩn bị phát hành 0.2**
- **File được sửa.**
  - `…/Cskh.kt` (trang con khác "Nhân viên"), `…/Sale.kt` (trang con khác "Nhân viên"), `…/More.kt` (`MktTab`, `PageScreen` trừ trang cài đặt, tài khoản), `…/Home.kt` (`OverviewScreen`, `AlertsScreen`), `…/Orders.kt` (`OrderListScreen`: "Danh sách đơn chưa lọc theo team.")
  - `…/DebugTour.kt` (đoạn `team` dài thêm)
  - `.github/workflows/android.yml` (ngoại lệ có tên: `assembleRelease` chỉ chạy khi `push` vào `main`, như 4.5.3)
  - `.github/workflows/android-preview.yml` (ngoại lệ có tên: đoạn `5-team` dài thêm)
  - `android/signing-cert.sha256` (nếu A0 chưa có)
- **Không được đổi.** Khi chưa chọn team, không màn nào đổi giao diện.
- **Xong khi.** Mọi màn có số mà chưa lọc đều có câu khi đang chọn team.
- **Cách kiểm.** CI; đoạn `5-team`; tổ app kiểm qua tóm tắt của Codex (ảnh từng màn có câu) và diff, không QA.
- **Phát hành `android-v0.2-2`** (tổ app mở PR `claude/app-android` → `main` khi đủ):
  - Anh duyệt video `1-khoa`, `2-che`, `3-xn-kho`, `4-so-cung-ky`, `5-team`.
  - W1, W2, W5 đã lên web thật (W4: đã lên web thật 14/10, PR #75).
  - Anh đã chạy lệnh ở 4.5.4; `android/signing-cert.sha256` đã có.
  - QA đạt mọi mốc Android: A1c, A6, A7, A7c, A7b, A8a (5.0), và đã đọc job `sign-release` trước khi tổ app mở PR (6.4.13).
  - Lời báo anh ghi rõ các chỗ app còn tự cộng (danh sách ở mô tả PR A2a).
  - Anh duyệt PR, tổ app gộp (squash). Job `sign-release` dừng chờ anh bấm Duyệt trên GitHub (có thể bấm trong app GitHub trên điện thoại). Anh bấm thì job chạy, ra `android-v0.2-2`. Tổ app báo anh lúc job đang chờ, không duyệt thay.
  - Job ký đỏ: sửa trong PR mới, không có bản nào được đăng.

### 5.4 Android Phần B (chỉ khi anh trả lời "Có" ở câu 3; ra bản 0.3)

Điều kiện chung như 5.3. Phần B làm sau khi 0.2 đã phát hành. Mỗi bước có đoạn video. A11 đặt `megatech.versionName=0.3`, `megatech.versionCode=3`. Từ A4, màn nào được sửa thì bỏ phép tự cộng ở màn đó, theo danh sách ở mô tả PR A2a: dùng trường máy chủ đã có; máy chủ chưa có thì tạm ẩn ô đó và ghi "Đang chờ web bổ sung".

**A3. Khung 5 tab và bộ lọc chung**
- **Mục đích.** Bố cục như iOS: Trang chủ, Đơn hàng, Tổng quan (giữa, mặc định), Phòng ban, Thêm.
- **File được sửa.**
  - `…/Tabs.kt` (mới): **chuyển** `TabStack` (`…/App.kt:224-233`), `TABS` và `RootTabs` (`…/App.kt:249-275`) sang đây và **xóa** bản cũ trong `App.kt`. Không để hai `RootTabs`.
  - `…/NavState.kt` (mới): kỳ, POS, nhóm đơn chung; nhớ tab / kỳ / POS / nhóm đơn; không nhớ team; không lưu `Screen.StaffOrders`, `Screen.Order`, `Screen.Customer`.
  - `…/App.kt` (`Screen`, `Navigator` 207-218).
  - `…/Home.kt`, `…/More.kt` (chỉ chỗ gắn vào tab).
  - `…/DebugTour.kt` (đoạn `khung-tab`).
- **Việc.** `CskhTab`, `SaleTab`, `MktTab` (`…/Cskh.kt:29`, `…/Sale.kt:28`, `…/More.kt:28`) giữ nguyên, tạm mở từ tab Phòng ban cho tới A5.
- **Không được đổi.** Nội dung các màn cũ; khóa và che màn hình.
- **Xong khi.** Nút Back đúng từng tab; mở lại app về đúng tab và kỳ; không có `RootTabs` thứ hai.
- **Cách kiểm.** CI; đoạn `6-khung-tab`; tổ app đọc tóm tắt và diff, không QA.

**A4. Tổng quan: 4 bảng bộ phận**
- **File được sửa.** `…/Overview.kt` (mới, như `avd7td:ios/Megatech/Megatech/Departments.swift:7-45` và bố cục `avd7td:ios/Megatech/Megatech/Home.swift:32-78`), `…/Home.kt` (`CenterBlocks` dưới 4 bảng), `…/Models.kt` (`Sections`, theo `avd7td:…/Departments.swift:7-38`), `…/Api.kt` (`sections()`).
- **Việc.** Số MKT đọc `/api/marketing/analytics` khi xem được `mkt-roas`. Chữ Vận đơn đúng luật. Khi chọn team: "4 bảng bộ phận chưa lọc theo team." tới khi có W3.
- **Không được đổi.** Số của web; đường dẫn `sections` đúng từng chữ như iOS.
- **Xong khi.** Số 4 bảng trùng iOS và web demo ở Hôm nay và Tháng trước.
- **Cách kiểm.** CI; đoạn `7-tong-quan`; tóm tắt của Codex. Mốc QA (5.0).

**A5. Phòng ban và Vận đơn**
- **File được sửa.**
  - `…/Depts.kt` (mới): danh sách bộ phận; trang Sale, CSKH có thanh trang con như `avd7td:…/Departments.swift:490-544`. `CskhTab`, `SaleTab`, `MktTab` chuyển thành nội dung trang bộ phận.
  - `…/VanDon.kt` (mới, như `avd7td:…/Departments.swift:552-615`), `…/Models.kt` (`VanDon`, theo `avd7td:…/Departments.swift:47-67`), `…/Api.kt` (`vanDon()` có `hrTeam`).
  - `…/Sale.kt`, `…/Cskh.kt` (gắn vào trang con).
- **Việc.** Vận đơn có chip team như iOS. Chữ đúng luật Vận đơn.
- **Không được đổi.** Nội dung các trang con cũ.
- **Xong khi.** Mọi trang con cũ mở được từ Phòng ban; số Vận đơn trùng web demo, cả khi chọn team.
- **Cách kiểm.** CI; đoạn `8-phong-ban`; tóm tắt của Codex. Mốc QA (5.0).

**A9. Đơn hàng và ô tìm**
- **File được sửa.** `…/Orders.kt`, `…/Search.kt` (mới), `…/Models.kt` (`OrderPage`, theo `avd7td:ios/Megatech/Megatech/API.swift:297+`).
- **Việc.**
  - Tìm theo SĐT (mọi ngày, mọi POS), mã đơn, tên khách, như iOS bước 1.5.
  - Như iOS, `codesByKey = false` (`avd7td:ios/Megatech/Megatech/Search.swift:33-36`): mã đơn chỉ tìm trong kỳ đang xem cho tới khi việc tìm kiếm của web lên bản thật.
  - SĐT chỉ ở màn, không ghi log.
- **Phụ thuộc.** Việc sửa tìm kiếm của web (cùng việc đang chặn PR #72).
- **Không được đổi.** Màn một đơn, một khách.
- **Xong khi.** Kết quả tìm trùng iOS trên demo; log không có từ khóa.
- **Cách kiểm.** CI; đoạn `9-don-hang`; tóm tắt của Codex. Mốc QA (5.0).

**A10. Trang chủ**
- **File được sửa.** `…/Home.kt` (`HomeTab` thành Trang chủ "Hôm nay").
- **Việc.** Số hôm nay của Sale / CSKH / Vận đơn, việc cần xử lý, lối tắt. Chữ Vận đơn đúng luật. Bỏ phép tự cộng ở `…/Home.kt:67, 173, 260`.
- **Không được đổi.** `CenterBlocks` đã chuyển sang Tổng quan ở A4.
- **Xong khi.** Số trùng Trang chủ iOS trên demo; không còn phép tự cộng ở màn này.
- **Cách kiểm.** CI; đoạn `10-trang-chu`; tóm tắt của Codex. Mốc QA (5.0).

**A11. Thêm và Cài đặt**
- **File được sửa.** `…/More.kt`, `…/System.kt`, `…/Metrics.kt`, `android/gradle.properties` (0.3 (3)).
- **Việc.**
  - Cách tính, Bảo mật tài khoản, Chính sách bảo mật, phiên bản, Đăng xuất. Mục bảo mật chỉ có dòng "Khóa bằng vân tay / khuôn mặt luôn bật", không có công tắc.
  - Chính sách bảo mật mở bằng trình duyệt qua `openUrl` (`…/Kit.kt:419`), như iOS `Link` (`avd7td:ios/Megatech/Megatech/Tabs.swift:421-424`). Không WebView.
  - Bỏ phép tự cộng ở `…/Metrics.kt:146-147, 176-183`, `…/More.kt:48-49`.
- **Không được đổi.** Luật khóa và hộp nổi ở A1a, A1c.
- **Xong khi.** Như iOS tab Thêm trên demo.
- **Cách kiểm.** CI; đoạn `11-them`; tổ app đọc tóm tắt và diff, không QA.
- **Phát hành `android-v0.3-3`:** như 0.2 (anh duyệt video; QA đạt các mốc Phần B ở 5.0; anh bấm Duyệt job ký trên GitHub).

**A12. Widget (tùy chọn)**
- **Trước bước này (tổ app).** Tra bản Jetpack Glance, ghi vào lời giao, rồi tải sẵn đúng bản đó vào `GRADLE_USER_HOME` của worktree (5.5.3).
- **File được sửa.** `…/widget/` (mới), `android/app/build.gradle.kts` (Jetpack Glance bản trong lời giao, chỉ ở bước này), `AndroidManifest.xml`.
- **Việc.** Cùng số với widget iOS. Widget không hiện số khi máy đang khóa màn hình.
- **Không được đổi.** Luật khóa và che màn hình của app.
- **Xong khi.**
  - Widget hiện số demo trên máy ảo; máy khóa thì không hiện số.
  - Codex chạy `--offline` mà vẫn thiếu thư viện (dù tổ app đã tải sẵn): Codex ghi rõ lệnh, lỗi và tên thư viện thiếu, không tự tải. Khi đó test và build của bước được kiểm bằng CI (CI có mạng).
- **Cách kiểm.** CI; tóm tắt của Codex (ảnh widget trên máy ảo, site demo; ảnh khi máy khóa). Mốc QA (5.0).

### 5.5 Giao việc cho Codex

#### 5.5.1 `CODEX.md` (vào `docs/plans/2026-10-14-app-ios-android/CODEX.md` ở I0 và A0)
Nội dung:
1. **Đọc gì.** File này, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao ở mục 5.
2. **Luật chung.** Đọc `git show origin/claude/project-thread-3ujeoc:AGENTS.md` (luật chung của repo). Với app, **bỏ** các phần: nhánh làm việc bắt đầu từ demo, nhánh `codex/` mở PR vào demo (`AGENTS.md:12-13`); bốn lệnh `pnpm` (`AGENTS.md:15-18`). Nhánh và PR do tổ app lo.
3. **Đọc mã.** Mã web chỉ đọc bằng `git show origin/main:<đường dẫn>`; số dòng `main:` của plan là của `2163361` (đọc bằng `git show 2163361:<đường dẫn>`), `main@a7d479b:` là của `origin/main` mới. Mã iOS (khi làm Android) đọc bằng `git show origin/claude/project-thread-avd7td:<đường dẫn>`.
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
9. **Plan và code thật khác nhau** thì dừng lại, ghi câu hỏi. Không tự đoán.
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

#### 5.5.2 Lời giao mẫu (đổi mã bước, nhánh)
> Repo phailamsao0012/tong-hop-pos. Em đang ở worktree `../thp-app-i3`, nhánh `codex/app-1410-i3`, tạo từ `origin/claude/project-thread-avd7td` (Android: `origin/claude/app-android`). Đọc `docs/plans/2026-10-14-app-ios-android/CODEX.md`, rồi `plan.md` cùng thư mục. Chỉ làm bước **I3** ở mục 5 của plan, không làm bước khác. Em tự build, test, chạy thử trên máy ảo, chụp ảnh / quay video và các ca máy ảo của bước (CODEX.md mục 10). Tin nhắn cuối là tóm tắt theo mẫu ở CODEX.md mục 11.
>
> Ghi thêm của tổ app cho bước này: <SHA action, bản `org.json` (A0) hoặc Glance (A12), dấu vân tay, log CI cần sửa… nếu có; không bao giờ có mật khẩu>.

#### 5.5.3 Chạy trên Mac
Tổ app làm qua phiên Remote Control trên Mac của anh, trong thư mục repo, theo quy trình Codex trên Mac đang dùng (ghi chú nội bộ của Tổ web tổng). Lời giao, tóm tắt và log để ngoài worktree, không commit. Ảnh và video của Codex ở `.codex-out/` trong worktree (đã exclude ở I0).
```
cd <thư mục repo trên Mac>
git fetch origin
git worktree add -b codex/app-1410-i3 ../thp-app-i3 origin/claude/project-thread-avd7td
mkdir -p ~/codex-viec
# Lời giao (mục 5.5.2) viết vào ~/codex-viec/app-1410-i3-giao.md
codex exec -C ../thp-app-i3 -s workspace-write --json \
  -o ~/codex-viec/app-1410-i3-tomtat.md - < ~/codex-viec/app-1410-i3-giao.md \
  > ~/codex-viec/app-1410-i3-log.jsonl
# Góp ý, tối đa 3 vòng, cùng CODEX_HOME với lần chạy trước:
codex exec resume --last "<góp ý cụ thể>"
cp ../thp-app-i3/.codex-out/app-1410-i3/tomtat.md ~/codex-viec/app-1410-i3-tomtat.md   # tóm tắt mới sau mỗi vòng
```
- `-s workspace-write` cho Codex sửa file trong worktree. Sandbox chặn mạng, nên Codex không push được. Không dùng `--dangerously-bypass-approvals-and-sandbox` hay `danger-full-access`.
- `-o` ghi tin nhắn cuối của Codex (tóm tắt theo mẫu, 5.5.1 mục 11) vào `~/codex-viec/<bước>-tomtat.md`. Lệnh `codex` ghi file này, không phải Codex trong sandbox, nên Codex không cần quyền ghi ngoài worktree. Codex cũng ghi tóm tắt vào `.codex-out/<bước>/tomtat.md` trong worktree; sau mỗi vòng góp ý tổ app chép file đó đè lên `~/codex-viec/<bước>-tomtat.md`. Tổ app chỉ đọc file tóm tắt; file log `.jsonl` chỉ dùng cho lệnh grep ở 5.5.4 mục 2.
- **Phiên demo cho chạy thử** (tổ app, trước bước có chạy thử; việc chuẩn bị máy như `pnpm install`): lấy phiên của tài khoản demo công khai giống bước "Phiên đăng nhập bản demo" của `avd7td:.github/workflows/ios-preview.yml:99-104`, ghi vào `~/codex-viec/phien-demo` (quyền 600), không in ra. Chỉ phiên demo, không bao giờ phiên máy chủ thật. Xong bước thì đăng xuất phiên đó và xóa file.
- **Android, chuẩn bị máy trước khi giao** (tổ app; việc chuẩn bị như `pnpm install` của web, không phải làm bài):
  ```
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  export GRADLE_USER_HOME="<worktree>/.gradle-home"
  export ANDROID_USER_HOME="<worktree>/.android-home"
  (cd <worktree>/android && ./gradlew :app:testDebugUnitTest :app:assembleDebug)   # chạy trên worktree chưa sửa, để tải sẵn thư viện
  ```
  Rồi chạy `codex exec` trong cùng shell có các biến đó. Không tạo `local.properties` trong worktree. Nếu AGP đòi `sdk.dir`, file `local.properties` của worktree chỉ có đúng một dòng `sdk.dir=…`, tổ app tạo, Codex không đọc.
- **Android, thư viện mới của bước (A0, A12).** Lệnh trên chạy trên worktree chưa sửa, nên không tải thư viện mà bước sắp thêm. Codex chạy `--offline` thì không tải được. Vì vậy, trước khi giao A0 (`junit:junit:4.13.2` và `org.json:json:<bản trong lời giao>`) và A12 (Jetpack Glance, bản trong lời giao), tổ app tải sẵn đúng các bản đó:
  - Dự án Gradle tạm ở `~/codex-viec/gradle-tai-truoc/`, ngoài worktree, chỉ có hai file:
    - `settings.gradle.kts`: cùng `repositories` như `android/settings.gradle.kts` (`google()`, `mavenCentral()`; `pluginManagement` có thêm `gradlePluginPortal()`).
    - `build.gradle.kts`: đúng các dòng `testImplementation(...)` / `implementation(...)` của bước, và một task `taiTruoc` đọc hết file của cấu hình dưới đây rồi in số file.
      - A0: plugin `java`, cấu hình `testRuntimeClasspath`.
      - A12: plugin `com.android.library` cùng bản AGP với `android/build.gradle.kts`, `namespace` tạm, `compileSdk = 37`, cấu hình `releaseRuntimeClasspath`. Glance là thư viện Android, dự án `java` không đọc được.
  - Chạy trong cùng shell, cùng các biến ở trên (nhất là `GRADLE_USER_HOME` của worktree), bằng Gradle của worktree: `<worktree>/android/gradlew -p ~/codex-viec/gradle-tai-truoc taiTruoc`.
  - Đây là việc chuẩn bị máy như `pnpm install`, không phải viết code app. Dự án tạm không vào repo.
  - `GRADLE_USER_HOME` riêng từng worktree: làm lại bước tải sẵn cho mỗi worktree mới của A0 hoặc A12 (ví dụ khi CI đỏ phải làm lại). A0 phải đổi bản AGP ("Xong khi" của A0) thì tải sẵn cả bản AGP mới theo cách này.
- Hết vòng 3 mà chưa đạt thì tổ app báo anh, không tự sửa code. Riêng I5a, tổ app được chia thành hai lần giao trước (5.0).
- Xong bước thì xóa worktree: `git worktree remove ../thp-app-i3`.
- CI đỏ sau khi đẩy: tổ app chép phần log lỗi (không có bí mật) vào lời góp ý, Codex sửa trong worktree mới của cùng bước.

#### 5.5.4 Tổ app kiểm gì sau mỗi bước, trước khi commit
Chế độ tiết kiệm (lời anh 14/10): tổ app chỉ đọc tóm tắt của Codex và `git diff`, rồi chạy các lệnh grep dưới đây. Không đọc cả log `.jsonl`, không xem từng khung hình video, không chạy lại build hay test (Codex và CI đã chạy). Mọi kiểm an toàn bằng grep vẫn giữ vì rẻ.
1. **Tóm tắt của Codex** (`~/codex-viec/<bước>-tomtat.md`): đủ mục của mẫu (5.5.1 mục 11); có lệnh build / test và mã thoát, hoặc lý do sandbox không cho; có ảnh / ca máy ảo mà bước yêu cầu; chỗ làm khác plan có lý do. Câu hỏi còn lại thì trả lời trong vòng góp ý, hoặc hỏi anh.
2. **Lệnh cấm** (chỉ grep, không đọc cả log): lọc riêng các lệnh Codex đã chạy trong `~/codex-viec/<bước>-log.jsonl` (trường `command` của các mục chạy lệnh, ví dụ bằng `jq`), rồi grep:
   - không có `git push`, `git commit`, lệnh mạng (`curl`, `gh`, `npm`, tải thư viện), `keytool`, `apksigner`, `assembleRelease`, `env` / `printenv`;
   - không đọc `~/.megatech`, `local.properties`, `*.jks`, `~/.ssh`, `~/.config/gh`, `~/.codex*`.
3. **Phạm vi diff.** `git -C ../thp-app-i3 status --porcelain` và `git diff --name-only <nhánh gốc>`: chỉ có file của bước. Không có `.codex-dd/`, `.codex-out/`, `.gradle-home/`, `.android-home/`, `ios/Megatech/build/`, `android/.gradle/`, `android/app/build/`.
4. **Đường cấm.** `git diff --name-only … | grep -E '^(\.github/|app/|lib/|tests/|components/|migrations/|drizzle/)|wrangler'` chỉ được ra đúng file workflow có tên của bước (mục 2). Lệnh `git diff --name-only … | grep -E '\.(jks|keystore|p12|pem)$|local\.properties$'` (file khóa) phải rỗng.
5. **Chặn định dạng.** Không chạy lại: bước chặn của `ios.yml:46-65` / `android.yml` chạy trên CI.
6. **Dữ liệu nhạy cảm.** `git diff … | grep -nE '\+84 ?[0-9]|\b0[0-9]{9}\b|0[0-9]{2}[ .][0-9]{3}[ .][0-9]{3,4}|@[A-Za-z0-9-]+\.[a-z]{2,}|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY|thp_session=|storePassword|keyPassword|ANDROID_KEYSTORE_B64|MEGATECH_[A-Z_]*PASSWORD'`. Chỉ được ra tên bí mật trong `${{ secrets.TÊN }}` của file workflow có tên, và tên bí mật trong lệnh `gh secret set` của `android/tools/tao-khoa-ky.sh`. Chạy cùng mẫu trên lời commit, mô tả PR và file tóm tắt trước khi gửi QA.
7. **File workflow (khi bước có ngoại lệ có tên):**
   - Chỉ phần được phép ở bảng mục 2 thay đổi.
   - Mọi `uses:` ghim SHA đầy đủ.
   - Không có `pull_request_target`, `workflow_run`, `secrets: inherit`.
   - `permissions` đúng 4.5.3; job `build` không có `environment` hay bí mật; job ký có `environment: android-release`, không có `actions/checkout` hay Gradle.
   - `android-preview.yml` đúng 4.5.5: đầu file và job quay chỉ `contents: read`; chỉ job đẩy video có `contents: write`, job này không có `actions/checkout`, không Gradle, không chạy file nào từ artifact, chỉ chép `*.mp4`, `*.txt`, và chỉ chạy khi push hoặc PR từ chính repo.
   - `build-tools` cố định đúng bản `BUILD_TOOLS_VERSION` của lời giao ở job `build`, job ký và job quay; không chỗ nào dùng "bản mới nhất". Có bước `sdkmanager` cài `platforms;android-37` ở job `build` và job quay.
   - Lệnh có `grep` theo đúng mục "Lệnh có `grep`" ở 4.5.3: không `lệnh | grep -q`, không `! lệnh` để kiểm, kiểm "phải không có" xét mã 0 / 1 / khác.
   - Từ A1c: bước chặn của `android.yml` có đủ tám mẫu hộp nổi ở 4.5.2, đúng từng ký tự, và phần hộp nổi xét cả thư mục.
   - Mọi bước dùng `gh` có `GH_TOKEN: ${{ github.token }}` và repo rõ ràng (`--repo "$GITHUB_REPOSITORY"` hoặc `repos/$GITHUB_REPOSITORY/…`); `gh release create` có `--target "$GITHUB_SHA"`.
   - So dấu vân tay đúng dạng 64 hex chữ thường ở cả hai phía (4.5.3).
   - Bí mật chỉ ở `env:` của bước cần; không `echo`, không `set -x`; file khóa xóa trong bước `if: always()`.
   - Không tải APK debug hay file khóa lên artifact.
   - `android/tools/tao-khoa-ky.sh` (A0): đúng 9 bước ở 4.5.4; không `set -x`, không in hay ghi mật khẩu ra file, không `--body`, không ghi đè file khóa có sẵn. Mọi lệnh `gh` ghi cứng repo `phailamsao0012/tong-hop-pos`. Bước 2 kiểm remote `origin` và quyền admin trước khi tạo khóa. Bước 7 có `reviewers` lấy từ `gh api user --jq .id`. Bước 9 ghi dấu vân tay đúng dạng 64 hex chữ thường.
8. **Đọc diff** (`git diff`, không đọc log):
   - Không có phép tính ngoài mục 4.3.
   - Nhãn khớp bảng 4.4.4.
   - Route mới có trong `restorable` và `encode`.
   - Log và móc Debug nằm trong `#if DEBUG` / `if (BuildConfig.DEBUG)`; log không có tên, SĐT, mã người.
   - Không có WebView.
9. **Commit và push.**
   - `git add <đúng các file của bước>`, không dùng `git add -A`.
   - Commit code trước. File workflow commit riêng sau đó, lời commit ghi "(ngoại lệ có tên, Codex sửa, tổ app kiểm)".
   - Commit tiếng Việt, ví dụ "App iOS 14/10 I3: bảng Từng nhân viên, cột Đã XN kho (Codex viết, tổ app kiểm)".
   - Đẩy bằng `git push origin HEAD:claude/project-thread-avd7td` (Android: `HEAD:claude/app-android`), chỉ khi tiến thẳng được. Nhánh xa đã đổi thì `git fetch` + rebase rồi kiểm lại từ đầu.
10. **CI, video, gửi QA.**
    - Chờ CI của app và CI video xanh (chỉ xem trạng thái; đỏ thì chép phần log lỗi cho Codex, 5.5.3).
    - Không xem từng khung hình, không đọc cả file log của đoạn: Codex đã chạy thử và ghi trong tóm tắt; QA so số ở mốc của mình.
    - Bước là mốc QA (5.0): gửi QA tóm tắt của Codex (đã grep theo mục 6), liên kết video và log CI, các ca của mục 6. Bước không phải mốc QA: không gửi QA.
    - Video gửi anh lấy từ CI hoặc từ Codex.

### 5.6 Chạy liền một mạch (từ bản 1.3, lời anh 14/10 09:21Z)

**Ý chính.** Tổ app không tham gia giữa chừng. Một script trên Mac giao lần lượt các bước của một phần cho Codex. Sau mỗi bước, máy kiểm (không phải Claude). Khi cả phần xong, tổ app kiểm một lần, rồi gửi QA một lượt và gửi anh.

**Hai phần, chạy song song, mỗi phần một worktree và một tài khoản ChatGPT.**

| Phần | Worktree, nhánh máy | Gốc | Các bước | Tài khoản đầu | Xong thì |
|---|---|---|---|---|---|
| iOS | `../thp-app-ios`, `codex/app-1410-ios` | `origin/claude/project-thread-avd7td` sau I0 | I1 → I2 → I3 → I4 → I4b → I7 → I5a → I5b → I6 | `codex` | Script đẩy lên `claude/project-thread-avd7td` (PR #72). CI iOS và video chạy |
| Android Phần A | `../thp-app-android`, `codex/app-1410-android` | `origin/main` + commit tài liệu (plan, `CODEX.md`) | A0 → A1a → A1b → A1c → A2a → A2b → A6 → A7 → A7c → A7b → A8a → A8b | `codex2` | Không đẩy, chờ anh trả lời câu 1. Anh cho phép thì đẩy lên `claude/app-android`, CI Android và video chạy |

**Script:** `docs/plans/2026-10-14-app-ios-android/chay-lien-mach.sh`, tổ app chép ra `~/codex-viec/app-1410/` rồi chạy ngoài sandbox, bằng `nohup caffeinate -is` để Mac không ngủ. Với mỗi bước, script làm như sau:
1. Viết lời giao theo 5.5.2, thêm câu "chạy liền một mạch" (CODEX.md mục 12) và file ghi thêm của tổ app (`~/codex-viec/app-1410/<phần>-ghi-them.md`, nếu có).
2. Chạy `codex exec -C <worktree> -s workspace-write -c 'approval_policy="never"' --json -o ~/codex-viec/app-1410/app-1410-<bước>-tomtat.md` (Codex không được xin chạy ngoài sandbox). Hết lượt thì đổi sang tài khoản kia; cả hai hết lượt thì chờ 30 phút, tối đa 6 giờ.
3. Máy kiểm:
   - phạm vi file (iOS: `ios/`, `ios.yml`, `ios-preview.yml`; Android: `android/`, `android.yml`, `android-preview.yml`);
   - không có file khóa, `local.properties`;
   - dòng thêm mới không có dạng SĐT, email, token, khóa (mẫu 5.5.4 mục 6). Dòng có tên bí mật chỉ ghi lại để tổ app soát cuối phần;
   - có tóm tắt đúng mẫu;
   - iOS: `xcodebuild -sdk iphoneos -configuration Debug` không ký (Mac không có máy ảo iPhone) và bước chặn định dạng của `ios.yml`;
   - Android: `gradlew --offline :app:testDebugUnitTest :app:assembleDebug`, nếu Mac có Android SDK và JDK;
   - lệnh Codex đã chạy: đụng `~/.megatech`, `~/.ssh`, `~/.config/gh`, `~/.codex*` (kể cả `~/.codex/memories`) thì dừng cả phần, không đẩy gì; lệnh lạ khác (`git push`, `curl`, `keytool`…) chỉ ghi cảnh báo. Lần chạy đầu 14/10, iOS dừng ở I1 vì Codex đọc `~/.codex/memories/MEMORY.md`; từ đó CODEX.md cấm rõ việc này;
4. Máy kiểm báo lỗi thì giao lại bước đó kèm lỗi, tối đa 3 vòng. Hết 3 vòng vẫn lỗi thì dừng cả phần, ghi `~/codex-viec/app-1410/<phần>-DUNG.md`, và vẫn gom kết quả và đẩy phần đã đạt (iOS).
5. Đạt thì commit trong nhánh máy (bỏ qua móc git): code một commit, file CI có tên một commit riêng. Lời commit "App iOS 14/10 I3: … (Codex viết, chạy liền một mạch; tổ app kiểm cuối phần)".
6. Hết phần: gom tóm tắt các bước, tiến độ và cảnh báo vào `docs/plans/2026-10-14-app-ios-android/ket-qua-<phần>.md` (đã qua lệnh dò dữ liệu nhạy cảm; có dòng nghi ngờ thì không commit, để ở máy), rồi đẩy nếu được phép (bảng trên). Nhánh xa đã đổi thì rebase các commit của nhánh máy; xung đột thì không đẩy.

**Tổ app chuẩn bị một lần trên Mac (qua phiên Remote Control), trước khi chạy:**
- I0 đã xong (plan, `CODEX.md`, script nằm trên `claude/project-thread-avd7td`).
- Tạo hai worktree như bảng trên. Worktree Android: script tự lấy thư mục tài liệu từ `origin/claude/project-thread-avd7td` và commit "tài liệu" đầu nhánh (như A0 ghi). Phiên Remote Control không tự commit: Mac có móc tự đẩy sau commit, script commit thì bỏ qua móc.
- Phiên demo cho chạy thử (5.5.3), file `~/codex-viec/phien-demo`.
- Android: kiểm Mac có Android SDK, JDK (của Android Studio). Có thì làm phần "Android, chuẩn bị máy" và "thư viện mới của bước" ở 5.5.3 (tải sẵn `junit:junit:4.13.2`, `org.json:json:20260814`), rồi tra `BUILD_TOOLS_VERSION` là bản `build-tools` mặc định của AGP 9.4.1. Không có thì ghi vào file ghi thêm; máy kiểm bỏ build Android, CI build khi được đẩy.
- File ghi thêm Android có SHA action (tra 14/10 bằng `git ls-remote`, tag mới nhất):
  - `actions/checkout` v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`
  - `actions/setup-java` v6.0.1 `de7274f081f381c8f8158605e0321c36c376e2e6`
  - `actions/upload-artifact` v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9`
  - `actions/download-artifact` v8.0.2 `9000827ccba6bdab643e8b6fd33ac0654aef8333`
  - `gradle/actions` (`wrapper-validation`, `setup-gradle`) v6.4.0 `3f5f9adaf7d9fecd50b5935e54106014257a94e6`
  - `reactivecircus/android-emulator-runner` v2.38.0 `a421e43855164a8197daf9d8d40fe71c6996bb0d`
  - `org.json:json:20260814`, `BUILD_TOOLS_VERSION` tổ app điền khi chuẩn bị. `android/signing-cert.sha256` chưa có (anh chưa chạy lệnh khóa): để tới A8b.
- Chạy hai lệnh `nohup caffeinate -is bash ~/codex-viec/app-1410/chay-lien-mach.sh <phần> <worktree> <tài khoản> > ~/codex-viec/app-1410/<phần>-chay.log 2>&1 &`. Android chạy trong shell đã đặt `ANDROID_HOME`, `JAVA_HOME`, `GRADLE_USER_HOME`, `ANDROID_USER_HOME` (5.5.3). Thấy cả hai đã vào bước đầu thì phiên Remote Control kết thúc. Không ai theo dõi giữa chừng.

**Kiểm cuối phần (tổ app, một lần).**
- iOS: CI của PR #72 xong thì tổ app được báo. Tổ app đọc `ket-qua-ios.md`, diff cả phần so với gốc, các mục 5.5.4 (grep, file workflow), CI và video `12-xn-kho`, `13-team`. Gom các mốc QA iOS (I3, I4, I4b, I7, I5a) thành một lượt gửi QA. Sai thì gom góp ý thành một lần giao sửa cho Codex (worktree mới từ nhánh), không sửa tay.
- Android: khi anh cho phép nhánh (câu 1), tổ app đẩy nhánh máy lên `claude/app-android`, rồi kiểm như iOS với `ket-qua-android.md`, CI, video `1-khoa` … `5-team`; một lượt QA cho các mốc Android.
- Bước cần W1, W2, W5 trên demo mà demo chưa có: Codex làm theo hợp đồng 4.2, kiểm thử giải mã có JSON số giả. Lần kiểm cuối chạy lại video khi Tổ web tổng đã đưa W1, W2, W5 lên demo.
- Dọn: xóa `~/codex-viec/phien-demo`, đăng xuất phiên demo, xóa worktree khi PR đã gộp.

## 6. Kiểm thử (QA)

**QA kiểm gì.** Theo lời anh 14/10 (tiết kiệm hết mức), QA chỉ kiểm phần đụng số liệu và bảo mật, ở các mốc của 5.0:
- iOS: I3 (6.1), I4 (6.2.1–6.2.9), I4b (6.2.10), I7 (6.2.11), I5a (các ca số của 6.3).
- Android: A1c (6.4, gộp kiểm A1a, A1b), A6 (6.1), A7 (6.2.1–6.2.9), A7c (6.2.10), A7b (6.2.11), A8a (các ca số của 6.3), job ký trước bản phát hành đầu (6.4.13).
- Ca thuần giao diện hoặc chữ ghi "tổ app kiểm qua tóm tắt của Codex, không QA". Tổ app vẫn kiểm các ca đó ở bước tương ứng.

**Bằng chứng.** QA không có Mac, máy iOS hay máy Android: chỉ đọc tóm tắt của Codex, log và video của CI, rồi so với web demo hoặc API demo cùng tham số. Mỗi ca ghi nguồn trong ngoặc vuông:
- `[tóm tắt Codex <bước>; ảnh …]`: file `~/codex-viec/<bước>-tomtat.md` (mẫu ở 5.5.1 mục 11); tổ app chuyển nguyên cho QA, kèm các ảnh được nêu.
- `[log [XNK] …]`, `[log [TEAM] …]`: dòng log của lượt tự xem (4.4.6), trong file log của đoạn trên nhánh video (iOS `12-xn-kho-app.txt`, `13-team-app.txt`; Android file log của đoạn, 4.5.5), cũng chép trong tóm tắt.
- `[bước CI '…']`: bước có tên trong workflow, xem ở trang Actions.
- `[video CI <đoạn>]`: video trên nhánh video.
- `[anh làm]`: chỉ anh làm được (máy thật, máy chủ thật).

**Dữ liệu và kỳ.** Chỉ site demo `demo.tonghopposmegatech.io.vn` (dữ liệu giả). Lượt tự xem dùng kỳ cố định Tháng trước, Tất cả POS; dòng `[XNK] bang` in ngày đầu và cuối kỳ, để QA gọi API demo sau đó vẫn ra cùng số. Riêng ca Hôm nay theo giờ dùng kỳ Hôm nay.

**Ca chạy trên máy ảo** (tắt app mở lại, đổi múi giờ, giữ kiểu so sau khi mở lại, `run-as` khóa cũ, `bmgr`, host lạ): Codex chạy trên máy ảo trên Mac và ghi lệnh, kết quả vào tóm tắt (iOS: `xcrun simctl terminate` rồi `launch`, múi giờ bằng `SIMCTL_CHILD_TZ`; Android: `adb shell am force-stop`, `run-as`, `bmgr` với bản debug). Mac không có emulator Android thì các ca Android đó thành bước CI có tên (4.5.5).

### 6.1 Đã XN kho (mốc QA: iOS I3, Android A6)
1. **Sale.** 5 dòng đầu (thứ tự đang hiện: Doanh thu giảm dần) và dòng Tổng: Số chia, Đơn chốt, Tỷ lệ chốt, Đã XN kho (x/y và %), Doanh thu trùng API demo cùng tham số và bảng của web demo (Bộ phận › Sale › Tổng quan). [log [XNK] bang, dong; tóm tắt Codex I3 / A6; ảnh bảng Sale]
2. **Cách tính khác mặc định.** QA gọi API demo product-groups hai lần với tham số Cách tính khác nhau: số như nhau (bảng mới không theo Cách tính). Phụ đề bảng có câu "không theo Cách tính". [API demo; tóm tắt Codex I3 / A6; ảnh phụ đề]
3. Dòng 1 và dòng Tổng, khi đã có W1: bảng giải thích trùng bảng giải thích của web, và các dòng giải thích Đã XN kho cộng lại đúng theo nghĩa `waiting` Tổ web tổng đã chọn và ghi ở `definitions` (W1, 4.2.6). Với cách khuyên: Kho xác nhận + Người chốt tự bấm + Không rõ + Còn Chờ xác nhận + Khác = Đơn chốt. Kiểm thêm người có đơn đã XN kho rồi bị chuyển lại Chờ xác nhận (ca test của W1, QA nhờ Tổ web tổng thêm vào demo), trên API demo. Khi chưa có W1: không kiểm phép cộng (đơn như vậy đang bị đếm ở cả Đã XN kho lẫn Còn Chờ xác nhận); bảng Số chia và Đơn chốt chỉ có các dòng ở mục 4.3. [tóm tắt Codex I3 / A6; ảnh bảng giải thích dòng 1; API demo]
4. Chạm "x/y đơn chốt": danh sách có đúng x đơn, hoặc có câu "Đang hiện n đơn đầu". Đơn nào cũng có giờ XN kho, trừ đơn đi thẳng không qua bước Đã xác nhận. Không có đơn Mới hay đơn Xóa. Dòng không có SĐT, tên khách, trạng thái. [log [XNK] ds wh=1 (`du=co`); tóm tắt Codex I3 / A6; ảnh danh sách]
5. Chạm số Đơn chốt: danh sách có đúng số đơn của ô. [log [XNK] ds wh=0 (`du=co`)]
6. **CSKH.** 5 dòng đầu và dòng Tổng, đối chiếu API demo (`team=cskh&by=care`) và bảng "Từng nhân viên CSKH" của web (Bộ phận › CSKH › Tổng quan), cùng kỳ, POS. Số tính theo người chăm sóc trên đơn (trống thì người bán) (`demo:docs/plans/2026-10-14-xac-nhan-kho/danh-gia.md:23-25`). [log [XNK] bang team=cskh, dong; tóm tắt Codex I3 / A6; ảnh bảng CSKH]
7. **Phụ đề.** Chữ dưới tiêu đề hai bảng trùng từng chữ bảng 4.4.4. Tổ app kiểm qua tóm tắt của Codex, không QA. [tóm tắt Codex I3 / A6; ảnh hai bảng]
8. Đổi kỳ, POS: số đổi theo. Chọn nhóm đơn khác "Tất cả": có câu "Bảng này chưa lọc theo nhóm đơn…". Tổ app kiểm qua tóm tắt của Codex, không QA.
9. Tài khoản không xem được `sale-overview`: không thấy bảng ở Sale, và không có lỗi. Tổ app kiểm qua diff (điều kiện `canView`), không QA; máy chủ vẫn chặn route theo quyền (3.1).
10. Mở trang So sánh nhân viên riêng (không qua Phòng ban), kéo để làm mới: bảng mới tải lại. Tổ app kiểm qua tóm tắt của Codex, không QA.
11. **Màn hẹp, cỡ chữ lớn nhất.** Bảng cuộn ngang trong khung, không tràn trang. Tổ app kiểm qua tóm tắt của Codex (ảnh cỡ chữ lớn nhất), không QA.

### 6.2 So cùng kỳ (mốc QA: iOS I4, I4b, I7; Android A7, A7c, A7b)
1. Với các kiểu so và mức lùi của lượt tự xem: ngày kỳ so, số Kỳ này và Kỳ so trùng API demo cùng tham số và dải của web demo. [log [XNK] so (`cs`, `ce`, `nay`, `so`); tóm tắt Codex I4 / A7] Chữ kỳ so ("Cùng thứ, 2 tuần trước"…) và chữ mức lùi ("1 tuần trước" / "lùi 5 tuần") là chữ: tổ app kiểm qua tóm tắt của Codex (ảnh dải chọn), không QA.
2. 5 dòng đầu: "trước …" và mức đổi trùng ô của web, theo từng chỉ số của lượt. Người kỳ so bằng 0: "mới"; cả hai bằng 0: "0,0%". [log [XNK] mini; API demo] Màu xanh khi tăng, đỏ khi giảm, xám khi bằng: tổ app kiểm qua tóm tắt của Codex (ảnh), không QA.
3. Ba kiểu biểu đồ đều vẽ. Chênh lệch có cột lên xanh, cột xuống đỏ. Cộng dồn: thanh từng người dài như web, kể cả khi staff-compare có người chỉ có số ở kỳ so (thang lấy trên mọi `staff[]`, 4.4.3). [tóm tắt Codex I4 / A7; ảnh ba kiểu, QA so với web demo cùng tham số]
4. Kỳ Hôm nay: có câu "Kỳ đang xem chưa hết ngày…"; cả đường kỳ này và đường kỳ so dừng ở giờ `cutoff`. [log [XNK] so có `cutoff`, `diem`; tóm tắt Codex I4 / A7; ảnh kỳ Hôm nay]
5. Tự chọn ngày: ngày đầu sau ngày cuối thì không gọi API, có câu nhắc. Không chọn được ngày sau hôm nay. Tổ app kiểm qua tóm tắt của Codex, không QA.
6. Đang ở Tự chọn ngày, tắt hẳn app rồi mở lại: không có lỗi 400, hai ngày đã điền từ máy chủ. [tóm tắt Codex I4 / A7: ca máy ảo (`simctl terminate` rồi `launch`; Android `am force-stop` rồi `am start`, hoặc bước CI); log [XNK] so mode=custom]
7. Múi giờ máy khác Việt Nam (ví dụ `America/New_York`), chọn ngày tự chọn: ngày gửi đi đúng ngày đã chọn. [tóm tắt Codex I4 / A7: ca máy ảo (`SIMCTL_CHILD_TZ`; Android máy ảo chạy múi giờ khác, hoặc bước CI); log [XNK] so `cs`, `ce`]
8. Tắt app, mở lại: kiểu so, mức lùi, kiểu biểu đồ vẫn giữ. Tổ app kiểm qua tóm tắt của Codex (ca máy ảo, dòng [XNK] so đầu tiên sau khi mở), không QA.
9. Dòng Tổng (khi có W2): ô So cùng kỳ trùng `rowsTotal` của API demo và web. Chưa có W2: ô trống ở cả ba kiểu. [log [XNK] mini dong=tong]
10. **Biểu đồ to** (iOS I4b, Android A7c): 3 điểm chạm giữ (kỳ này, kỳ so, chênh lệch) trùng `chart` của API demo cùng tham số và hộp của web. [log [XNK] cham, 3 dòng; log [XNK] bieu-do] Ba kiểu biểu đồ, ba chỉ số cùng hình với biểu đồ to của web demo (web đọc `chart` sau W5); Cộng dồn với Tỷ lệ chốt vẽ doanh thu cộng dồn, như web; dòng "Chênh lệch" có dấu "+" / "−", màu xanh / đỏ. [tóm tắt Codex I4b / A7c; ảnh ba kiểu, ảnh hộp chạm] Hôm nay theo giờ: cả hai đường dừng ở giờ `cutoff`; kỳ nhiều ngày kết thúc hôm nay: không cắt; hai kỳ dài khác nhau (Tự chọn ngày): đường kỳ ngắn hơn dừng sớm. [tóm tắt Codex I4b / A7c; ảnh từng ca; `chart.len` và điểm null trên API demo]
11. **Xem riêng một người** (iOS I7, Android A7b): chạm ô mini dòng 1: hai số tổng trùng `current` / `previous` của người đó trong `staff[]` của API demo; 3 điểm chạm giữ trùng `staff[].chart` của người đó; "Xem cả đội" về đúng số cả đội. QA xác định người ở dòng 1 bằng cách sắp `staff[]` của product-groups theo Doanh thu giảm dần. [log [XNK] rieng, cham, ca-doi; tóm tắt Codex I7 / A7b; ảnh trước / sau khi chạm] Viền ô, chữ "Đang xem riêng {tên}", cuộn tới dải chọn, chạm lại ô về cả đội: tổ app kiểm qua tóm tắt của Codex (ảnh), không QA.

### 6.3 Team (mốc QA: iOS I5a, Android A8a, các ca số; I5b, A8b: tổ app kiểm qua tóm tắt)
1. Danh sách team và số người trùng web demo và `/api/teams?list=1` của demo. [log [TEAM] ds; tóm tắt Codex I5a / A8a; ảnh danh sách team]
2. Chọn team Sale đầu tiên của demo. Bảng Từng nhân viên Sale (5 dòng đầu), các thẻ có "Theo team? Có" ở bảng `CenterBlocks` (4.4.5), Vận đơn đều trùng API demo và web demo cùng team. [log [TEAM] dong, tq, van-don; tóm tắt Codex I5a / A8a]
3. Tổng quan khi đang chọn team: Mục tiêu tháng không có % (không chia doanh thu team cho mục tiêu cả POS). [tóm tắt Codex I5a / A8a; ảnh Tổng quan khi áp team] Thẻ Chốt nóng, Số tham chiếu Pancake, Vận hành đơn, Mua lại & data, Khách hàng có câu "chưa lọc theo team"; dòng phạm vi có tên team; dưới 4 bảng có "4 bảng bộ phận chưa lọc theo team." (khi chưa có W3): tổ app kiểm qua tóm tắt của Codex, không QA.
4. CSKH › Tổng quan khi đang chọn team Sale: hiện "Trang này chưa lọc được theo team…". Khi chọn team CSKH: khối KPI và thẻ cuộc gọi có câu "chưa lọc theo team". Tổ app kiểm qua tóm tắt của Codex (ảnh), không QA.
5. Trang So sánh nhân viên và CSKH › Tổng quan **không** hiện câu "Trang này chưa lọc…" khi team hợp bộ phận. Trang Cách tính, Bảo mật, Cấu hình không có câu nào. Tổ app kiểm qua tóm tắt của Codex (ảnh), không QA.
6. Trang chủ, tab Đơn hàng, Thông báo, MKT, một trang ở tab Thêm (Báo cáo cuối tháng), danh sách đơn mở từ một số: có câu báo (I5b, A8b). Tổ app kiểm qua tóm tắt của Codex (ảnh), không QA.
7. Tắt app, mở lại: không còn team. Tổ app kiểm qua tóm tắt của Codex (ca máy ảo, dòng [TEAM] `ap=khong`), không QA.
8. Team bị đổi tên rồi bị xóa trên web nhân sự (tổ app nhờ Tổ web nhân sự làm với một team thử trên demo của web nhân sự): mở lại danh sách team ngay thì thấy tên mới, không phải đợi 60 giây; trang đang áp team đã xóa hiện nguyên câu của máy chủ và nút "Bỏ chọn team". [tóm tắt Codex I5a: vòng góp ý riêng sau khi Tổ web nhân sự làm xong; ảnh danh sách và ảnh câu lỗi]
9. Chưa chọn team: đường dẫn tải trước lúc hỏi Face ID trùng từng chữ với bản trước. Tổ app so dòng `[MOC]` của đoạn mở app trên video CI trước và sau I5a (grep), không QA.

### 6.4 Bảo mật (mốc QA: Android A1c, gộp A1a, A1b; job ký trước bản phát hành đầu)
iOS không đổi phần khóa và che ở plan này; phần iOS của các ca dưới đây đã có trong video CI của lần A (đoạn mở app, quay lại).
1. Mở lạnh luôn phải xác thực. Vào nền rồi quay lại, phải xác thực lại. [video CI `1-khoa`; log mốc `hoi-xac-thuc`; bước CI 'test' (`AppLockTest`)]
2. Không có công tắc tắt khóa. [diff `System.kt`; tóm tắt Codex A1a; ảnh mục Bảo mật]
3. Trình chuyển app không thấy số: iOS có màn che, Android màn đen. [video CI `2-che`]
4. Android: chụp màn hình bị chặn ở bản phát hành. [diff `App.kt` (`Privacy` luôn bật, chỉ bản debug tắt được qua `-e secure 0`, không lưu); video CI `2-che`]
5. Android máy không cài khóa màn hình: phải nhập mật khẩu MEGATECH, kể cả khi mở lạnh và khi duyệt đăng nhập máy tính. [bước CI 'test' (`AppLockTest`); tóm tắt Codex A1c: ca máy ảo không đặt PIN, ảnh màn nhập mật khẩu; diff `Security.kt`]
6. **Android, hộp nổi.** Mở WhySheet thử, một DropdownMenu (chọn kỳ), hộp Đổi mật khẩu → về Home → quay lại: chỉ thấy màn khóa. Ảnh trình chuyển app không thấy số. [video CI `1-khoa`; bước CI chặn hộp nổi của `android.yml` (tám mẫu)]
7. **Android, cài đặt cũ.** Bản debug: dùng `run-as` ghi `lock=false`, `lock_grace=1`, `secure=false` vào `shared_prefs/megatech.xml`, `am force-stop`, mở lại app: vẫn khóa, trình chuyển app đen, file không còn ba khóa đó. [tóm tắt Codex A1c: ca máy ảo, lệnh và tên khóa còn lại trong file, không in giá trị; hoặc bước CI có tên (4.5.5)] Nếu câu 2 = Không (dùng lại khóa cũ): cài 0.1, tắt hai công tắc, cài đè 0.2. [anh làm]
8. **Android, sinh trắc học.** Máy API 30 trở lên chỉ nhận vân tay / khuôn mặt loại mạnh hoặc mã máy. [diff `Login.kt`, `App.kt`: hằng số mức sinh trắc học, tổ app gửi kèm đoạn diff]
9. Phiên chỉ nằm trong Keychain / Keystore. Android (bản debug, `run-as`): `shared_prefs` không còn phiên hay email dạng chữ thường. [tóm tắt Codex A1c: ca máy ảo, chỉ liệt kê tên khóa; hoặc bước CI có tên]
10. Android: sao lưu tắt (`aapt2 dump xmltree --file AndroidManifest.xml <apk>` có `allowBackup…=false` và `dataExtractionRules`); `adb shell bmgr backupnow vn.megatech.tonghoppos.debug` không chép dữ liệu app. [tóm tắt Codex A1c: `aapt2` trên APK debug, ca máy ảo `bmgr`; hoặc bước CI có tên; bản phát hành: bước CI 'Sao lưu tắt' của job ký (13)]
11. Android bản debug: `-e base` với host ngoài danh sách không đổi được máy chủ; cookie không gửi cho host lạ. [bước CI 'test' (`HostListTest`); tóm tắt Codex A1c: ca máy ảo `-e base https://example.invalid`, log `MEGATECH` cho thấy vẫn gọi máy chủ mặc định; hoặc bước CI có tên]
12. **Log.** Log lượt tự xem không có SĐT (`0` + 9 số, `+84`, dạng có dấu cách / chấm), dấu `@`, `thp_session`, tên người trong demo. [QA tự grep mọi file log của đoạn trên nhánh video, iOS và Android]
13. **Job ký và APK phát hành, chỉ kiểm tĩnh trên CI.** Trước khi tổ app mở PR phát hành 0.2, QA đọc job `sign-release` của `android.yml` (không checkout, không Gradle, `environment: android-release`, dạng dấu vân tay 4.5.3). Sau khi anh bấm Duyệt và job chạy: `apksigner verify --print-certs` trùng `android/signing-cert.sha256` (64 hex chữ thường); `aapt2 dump badging` không có `application-debuggable`; sao lưu tắt. [bước CI 'Dấu vân tay', 'Không debuggable', 'Sao lưu tắt' của job `sign-release`] Bản phát hành bỏ qua `-e base` / `-e session` (vẫn là màn đăng nhập máy chủ thật, **không đăng nhập**). [diff `App.kt`: `debugExtras` chỉ đọc khi `BuildConfig.DEBUG`]
14. **Kiểm có đăng nhập thật** (bản phát hành, máy chủ thật) chỉ anh làm trên máy của anh. Không quay, không chụp, không đưa log lên repo. [anh làm]
15. **Repo.** Diff mỗi bước, lời commit, mô tả PR không có email, SĐT, token, số thật, file khóa. Ảnh và video chỉ có site demo. [lệnh grep 5.5.4 mục 3–6 của tổ app ở mỗi bước; QA xem lại diff ở mốc của mình]

## 7. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| W1 / W2 / W5 chậm, nên bản 0.10, 0.2 chậm | App chạy được khi chưa có W1, W2, W5 (mục 4.3). Nếu anh cần sớm, lên bản không có dòng Tổng và biểu đồ to (xem riêng một người khi đó chỉ có hai số tổng), và báo rõ. W4 đã lên web thật 14/10 (PR #75). |
| Tổ app chỉ đọc tóm tắt và diff, không xem từng khung hình hay đọc cả log (chế độ tiết kiệm), nên có thể sót lỗi giao diện | Codex chụp ảnh từng màn của bước và ghi vào tóm tắt; CI vẫn quay video trên site demo; anh xem video trước khi duyệt. Phần số liệu và bảo mật vẫn qua QA ở mốc (5.0). Các kiểm an toàn bằng grep (lệnh cấm, đường cấm, file khóa, dữ liệu nhạy cảm, workflow) giữ đủ (5.5.4). |
| Codex chạy thử trên máy ảo cần phiên demo | Chỉ phiên của tài khoản demo công khai, tổ app để ở `~/codex-viec/phien-demo` (quyền 600), Codex không in ra; đăng xuất và xóa khi xong bước (5.5.3). Không bao giờ phiên máy chủ thật. |
| Gộp lần A sớm ghi đè bản 0.9 đang cài | I6 luôn chạy trước mọi lần gộp; gộp sớm thành 0.10, phần còn lại 0.11. |
| `main` gộp kiểu squash | Sau mỗi lần gộp, tổ app gộp `origin/main` vào nhánh. Lùi lại sau khi gộp là revert commit squash bằng PR mới. |
| 14/10 phụ thuộc lần A | Ghi rõ ở 4.1 và lời báo anh; không hứa ra riêng. |
| Số app lệch web vì khác tham số | Gửi đúng các tham số như web (`dim=tag&basis=both`), thứ tự theo chuỗi plan quy định ở 4.2.1, 4.2.2 (chuỗi không cần trùng web: web mã hóa dấu phẩy thành `%2C`). QA đối chiếu từng người. |
| Hai "Tỷ lệ chốt" khác nhau trên một trang | Phụ đề bảng mới ghi định nghĩa và "không theo Cách tính" (4.4.2); QA 6.1.2. |
| Hai bảng theo người trên trang CSKH tính khác nhau | Phụ đề bảng mới ghi "NV chăm sóc trên đơn, trống thì người bán". |
| Đọc nhầm giờ chốt và giờ XN kho (bí danh `first_confirmed_at`) | Ghi rõ ở 4.2.1; `DecodeSelfTest` (I2) và `ModelsTest` (A2b) bắt; QA kiểm cột giờ. |
| Tự chọn ngày lỗi 400 sau khi mở lại app | Gọi `previous` trước để lấy ngày (4.4.3); QA 6.2.6. |
| Codex trên Mac đọc được khóa ký và mật khẩu (`~/.megatech`, `local.properties`), rồi gửi lên nhà cung cấp mô hình | `CODEX.md` cấm đọc, cấm chạy lệnh ký (5.5.1); tổ app grep các lệnh Codex đã chạy (5.5.4 mục 2); anh không xuất biến khóa trong shell; lệnh khóa chạy ngoài phiên Codex; xóa mật khẩu khỏi `local.properties` khi CI đã ký. |
| Mã của nhánh đọc được khóa ký trong CI, in ra log công khai dưới dạng đã biến đổi | Job ký không checkout, không Gradle. Environment chỉ cho `main` và có người duyệt là anh: job ký chỉ chạy khi anh bấm Duyệt. Tổ app soát mọi thay đổi `android.yml` theo 5.5.4 mục 7 (4.5.3). |
| `main` hiện không có bảo vệ nhánh. "Gộp `main` cần anh duyệt" chỉ là quy trình, GitHub không ép; tổ app có quyền ghi. Một thay đổi `android.yml` lọt vào `main` (PR web, lỗi Codex soát sót) chạy được với bí mật ký | Bước duyệt ở Environment `android-release` là chốt chặn cho khóa ký: chỉ anh bấm, tổ app không duyệt thay (4.5.3). Khuyên sau này bật bảo vệ nhánh `main` (cấm push thẳng, bắt buộc PR). Việc này của anh và các tổ, ngoài plan này. |
| Job xem trước chạy mã của PR với token ghi: đẩy được vào `main` khi `main` chưa bảo vệ | `android-preview.yml` tách hai job: job quay chỉ đọc; job đẩy video có quyền ghi nhưng không checkout, không Gradle, chỉ chạy với PR từ chính repo (4.5.5). |
| `ios-preview.yml` hiện là một job vừa build mã của PR vừa có `contents: write` (`avd7td:.github/workflows/ios-preview.yml:27-31, 40, 338-347`). Job `build` của `ios.yml` cũng vậy (`avd7td:.github/workflows/ios.yml:27-31, 39`) | Ngoài phạm vi plan này: các bước iOS ở đây chỉ thêm bước kiểm thử và đoạn quay vào `ios-preview.yml` (bảng ngoại lệ, mục 2), không đổi quyền. Ghi để tách job như `android-preview.yml` ở plan iOS sau. |
| Lần ký Android đầu chỉ kiểm được sau khi gộp | Job ký đỏ thì không có bản nào được đăng; sửa trong PR mới (4.5.3). Dạng dấu vân tay chốt một kiểu và job `build` kiểm dạng file ngay trên nhánh; lệnh `grep` viết theo luật ở 4.5.3, để job ký không đỏ khi đúng. |
| Google bắt app cài ngoài CH Play phải của nhà phát triển đã xác minh. Từ 30/9/2026 mới áp ở Brazil, Indonesia, Singapore, Thái Lan; Google nói sẽ áp toàn cầu từ 2027. App chưa đăng ký vẫn cài được qua bước "cài nâng cao" có thêm màn chờ, và qua `adb` (trang developer-verification của Android, đọc 14/10/2026) | Chưa cần làm gì lúc này. Tổ app theo dõi; khi Google áp ở Việt Nam thì hỏi anh đăng ký `vn.megatech.tonghoppos` với chứng chỉ ký mới (gói limited distribution, tối đa 20 máy, không cần giấy tờ). Play Protect có thể cảnh báo lần cài đầu: bấm vẫn cài, không tắt Play Protect. Cài xong tắt lại quyền "Cài ứng dụng không rõ nguồn". Trước khi cài, so SHA-256 của APK với file `.sha256` của Release. |
| Khóa Android dưới hộp nổi | Hàm bọc ở `Kit.kt` cho đủ 15 chỗ gọi; CI cấm gọi thẳng tám mẫu, xét cả thư mục từ A1c (4.5.2); video `1-khoa` (A1c); QA 6.4.6. |
| Người đã tắt khóa ở 0.1 vẫn tắt ở 0.2 | `LockPolicy` không đọc và xóa ba khóa cũ; `AppLockTest`; QA 6.4.7. |
| Bản debug công khai gửi phiên sang máy chủ khác | Danh sách host cố định cho cookie và `base`; không tải APK debug lên artifact; mã gói `.debug` (4.5.2). |
| Kiểm bản phát hành phải đăng nhập máy chủ thật | Bản phát hành chỉ kiểm tĩnh trên CI; kiểm có đăng nhập chỉ anh làm (6.4.13–14). |
| Codex sửa file workflow sai | Chỉ file và phần có tên (mục 2); danh sách kiểm workflow (5.5.4 mục 7); commit riêng. |
| Xem riêng một người (I7, A7b) lệch web | Làm theo bản thật PR #76 (`main@a7d479b`), chữ giống từng chữ (4.4.4). Hai số tổng và biểu đồ to theo người đều do máy chủ trả (`staff[]`, `staff[].chart` của W5); app không tự gộp, không tự cộng dồn. QA 6.2.11 so với API demo. |
| Biểu đồ to của app lệch web | Cả hai vẽ từ `chart` của W5: W5 bắt buộc đổi `CompareStrip` sang đọc `chart` (và `staff[].chart` khi xem riêng một người), luật cắt, gộp, null ghi đủ ở 4.2.6; QA 6.2.10 so hình và số từng điểm. |
| Team theo danh sách hiện tại, không theo lịch sử | Câu báo nói rõ (giống web). |
| PR #72 to, khó duyệt | Bước nhỏ, mỗi bước tự đứng được, một commit code (và một commit workflow nếu có) mỗi bước. |
| Một bước quá to cho một lần Codex, hết 3 vòng góp ý | Phần bảo mật Android chia ba bước A1a, A1b, A1c (4.5.2). I5a được chia hai lần giao khi hết 3 vòng (5.0). |
| Android chưa từng build trên CI; AGP 9.4.1 chưa xác minh có thật | A0 làm trước hết. Không build được thì Codex đổi bản AGP theo log tổ đưa, ghi lại. |
| Mất hoặc lộ khóa ký | Khóa chỉ ở Mac của anh (mật khẩu trong Keychain) và trong bí mật của Environment chỉ cho `main`, có anh duyệt từng lần ký. Có bản sao ngoại tuyến. Có dấu vân tay để kiểm. Lộ khóa thì tạo khóa mới, gỡ app cũ, cài lại (và cập nhật đăng ký Google nếu có). |
| Máy ảo CI không giả lập được vân tay | Dùng mã PIN của máy ảo; mốc `hoi-xac-thuc` để biết lúc nhập. |
| `FLAG_SECURE` làm video đen | Chỉ bản debug tắt được (`-e secure 0`, không lưu). Đoạn `2-che` cố ý quay màn đen. |
| Bảng 7 cột trên màn hẹp, cỡ chữ lớn | Cột tên ghim, cuộn ngang. Mỗi ô tối đa 2 dòng. Codex chụp ảnh cỡ chữ lớn nhất trên máy ảo (I3, A6), tổ app xem trong tóm tắt (6.1.11). |
| Codex không build được, hay không chạy được máy ảo trong sandbox | Tổ app tải sẵn thư viện ngoài sandbox, kể cả thư viện mới của A0 và A12 bằng dự án Gradle tạm (5.5.3); CI là nơi kiểm chính và vẫn quay video. Codex ghi rõ trong tóm tắt; ca máy ảo của Android thành bước CI (4.5.5). Tổ app không commit khi CI đỏ. |
| iOS còn chỗ tự cộng số có từ trước, ngay trên trang đặt bảng mới (KPI của `CompareView`, `CskhViews.swift:737-740`; % doanh thu đội ở `CskhOverview.swift:75`) | Plan này không sửa các chỗ đó, để không đổi số đang hiện. Lời báo anh nêu rõ; tổ app ghi vào plan iOS sau. Bảng mới không dùng các số đó. |
| Android 0.2 còn nhiều màn tự cộng số (mục 3.3) | A2a lập danh sách; lời báo anh nêu rõ; Phần B bỏ dần. |
| **Lùi lại** | Trên nhánh: mỗi bước một commit code, revert là bỏ được. Trên `main`: revert commit squash bằng PR mới. Bản Android sai thì xóa Release và ra bản số build cao hơn; máy đã cài không bị ảnh hưởng. |

## 8. Câu hỏi cho anh

**Câu 1. "Android làm ở nhánh riêng `claude/app-android`?"**
- Có (khuyên): bản iOS không phải chờ Android. CI Android tự chạy mỗi lần đẩy lên nhánh, chưa cần mở PR vào `main` tới lúc phát hành 0.2.
- Không: làm chung PR #72, PR to thêm.

**Câu 2. "Tạo khóa ký Android mới (máy đang có bản 0.1 gỡ một lần)?"**
- Có (khuyên): khóa mới chỉ dùng cho bản phát hành từ CI. Máy nào đang cài 0.1 thì gỡ ra một lần trước khi cài 0.2.
- Không: dùng lại khóa 0.1 trên Mac của anh, cài đè được.

**Câu 3. "Phần Android ngang iOS (5 tab, Tổng quan, Vận đơn, Đơn hàng, Trang chủ, Thêm, widget) làm luôn trong plan này?"**
- Để sau (khuyên): bản 0.2 chỉ có bảo mật, CI và phần 14/10 trên các màn Android đang có.
- Có: làm Phần B (mục 5.4) sau khi 0.2 lên, ra 0.3.


## 9. Ước lượng và mốc demo

| Phần | Số bước Codex | Việc của tổ app |
|---|---|---|
| Web (Tổ web tổng) | 3 bắt buộc còn lại (W1, W2, W5), 1 nên làm (W3), theo plan riêng của web. W4 đã lên web thật 14/10 (PR #75) | |
| iOS | 9 (I1, I2, I3, I4, I4b, I7, I5a, I5b, I6) | I0, gộp PR #72 |
| Android Phần A (bản 0.2) | 12 (A0, A1a, A1b, A1c, A2a, A2b, A6, A7, A7c, A7b, A8a, A8b) | Commit tài liệu đầu nhánh, tra SHA action, chuẩn bị máy (cả tải sẵn thư viện mới của A0), mở PR phát hành |
| Android Phần B (chờ câu 3, bản 0.3) | 6 (A3, A4, A5, A9, A10, A11), thêm 1 tùy chọn (A12) | |

Tổng: 21 bước Codex bắt buộc trong plan này (9 iOS, 12 Android Phần A); 1 bước tùy chọn (A12, Phần B); 6 bước Phần B chờ câu 3; 1 bước của tổ app (I0); 3 bước web bắt buộc còn lại và 1 nên làm của Tổ web tổng.

Việc của tổ app ở mỗi bước Codex (chế độ tiết kiệm): viết lời giao, đọc tóm tắt và diff, chạy các lệnh grep ở 5.5.4, commit / push. Mốc QA (chỉ số liệu và bảo mật, 5.0): iOS I3, I4, I4b, I7, I5a; Android A1c, A6, A7, A7c, A7b, A8a; và job ký trước bản phát hành đầu.

| Mốc | Anh thấy gì |
|---|---|
| iOS M1 (sau I3) | Video `12-xn-kho`: bảng Từng nhân viên ở Sale và CSKH, cột Đã XN kho, bảng giải thích, danh sách đúng các đơn đã XN kho |
| iOS M2 (sau I5b) | Video `12-xn-kho` có So cùng kỳ đủ kiểu, biểu đồ to và xem riêng một người; video `13-team`: chọn team, số đổi theo, câu báo ở trang chưa lọc |
| iOS 0.10 | Anh duyệt lần A, M1 và M2. W1, W2, W5 lên bản thật (W4 đã lên 14/10). I6 lên số, tổ app gộp, anh cài lại một lần |
| Android MA1 (sau A1c) | Video `1-khoa`, `2-che`: khóa mỗi lần mở, hộp nổi không lộ, màn che |
| Android MA2 (sau A8b) | Video `3-xn-kho`, `4-so-cung-ky` (có biểu đồ to và xem riêng một người), `5-team` trên các màn Android đang có. Anh duyệt PR, tổ app gộp, rồi anh bấm Duyệt job ký trên GitHub (có thể trong app GitHub trên điện thoại) thì ra `android-v0.2-2` |
| Android MB (sau A11, nếu câu 3 = Có) | Video khung tab, Tổng quan, Phòng ban, Vận đơn, Đơn hàng, Trang chủ, Thêm; anh bấm Duyệt job ký như 0.2 thì ra `android-v0.3-3` |

## Lịch sử bản plan
- Bản 1 (14/10/2026): tổ app viết, 3 lượt soát nội bộ (đúng sai, làm được, rủi ro).
- Sửa sau soát: thêm I0 (gộp `main`, đưa plan và `CODEX.md` vào nhánh) và tách I5 thành I5a / I5b; I6 lên số trước mọi lần gộp; W4 thành bắt buộc, chặn phát hành; Android thu về Phần A (0.2: bảo mật, CI, 14/10 trên màn đang có), Phần B chờ câu 3; ký APK ở job riêng không checkout, không Gradle, chỉ trên `main`; khóa Android che cả hộp nổi, bỏ ba khóa cài đặt cũ, sinh trắc học loại mạnh; Codex làm mọi việc thực thi kể cả file CI có tên (theo lời anh 14/10), cấm đọc khóa; sửa chỗ chèn, kéo để làm mới, phụ đề, định nghĩa Tỷ lệ chốt, câu báo team từng trang và từng thẻ, lỗi team, ngày tự chọn và giờ VN, hình học biểu đồ mini, bộ nhớ đệm danh sách team, bỏ SĐT / tên khách / trạng thái khỏi danh sách đơn; thêm kiểm thử giải mã; giữ mặc định Đơn chốt như web (anh bỏ yêu cầu ưu tiên doanh thu) và chừa chỗ cho chạm biểu đồ mini (bản 1.2 thành bước chính I7, A7b); thêm câu hỏi cho anh.
- Bản 1.1 (14/10/2026): bỏ bước anh bấm duyệt mỗi lần ký APK (gộp `main` đã cần anh duyệt; bản 1.2 khôi phục theo QA); gom các lệnh khóa ký thành script `android/tools/tao-khoa-ky.sh`, anh dán một dòng lệnh một lần; câu đăng ký Google chuyển sang mục rủi ro vì chưa áp ở Việt Nam; còn 3 câu hỏi. Thêm biểu đồ to của So cùng kỳ (W5, I4b, A7c): anh đang dùng biểu đồ này trên web (yêu cầu chạm biểu đồ mini 14/10 nói tới nó), và W5 cho máy chủ trả sẵn điểm đã gộp nên app không phải tự tính.
- Bản 1.2 (14/10/2026), sửa theo đánh giá khả thi của QA (khả thi có sửa) và hai thay đổi mới cùng ngày:
  - A1: khôi phục bước anh duyệt ở Environment `android-release` theo QA (A1): mỗi lần ký APK anh bấm Duyệt một lần, script đặt anh làm người duyệt (bỏ ý của bản 1.1). A2: `android-preview.yml` tách job quay chỉ đọc và job đẩy video có quyền ghi, không checkout. A3: dấu vân tay một dạng 64 hex chữ thường; job ký có `GH_TOKEN`, repo rõ ràng; lệnh `grep` không đỏ khi đúng. A4: W1 chọn nghĩa `waiting` cho đơn đã XN kho rồi bị chuyển lại Chờ xác nhận, có ca test. A5: tổ app tải sẵn thư viện mới của A0, A12 để Codex build `--offline`. A6: mỗi ca ở mục 6 ghi nguồn bằng chứng; lượt tự xem in số 5 dòng đầu, mini, 3 điểm chạm, kỳ cố định Tháng trước; ca máy ảo do Codex chạy và ghi vào tóm tắt (Android không có emulator thì thành bước CI); 6.3.8 nhờ Tổ web nhân sự.
  - B1: cấm thêm `Popup`, `BasicAlertDialog`, `ExposedDropdownMenu`. B2: tách A1a, A1b, A1c; cho chia I5a làm hai lần giao. B3: cài cố định `platforms;android-37` và `build-tools`, job ký dùng đúng bản đó. B4: thang Cộng dồn lấy trên mọi `staff[]`. B5: đường dẫn so với chuỗi plan quy định, không so chuỗi web. B6: thay bằng mốc QA mới (dưới đây).
  - C1: CSKH › Tổng quan khi chọn team Sale ghi là khác web có chủ ý. C2: I7 viết theo bản thật PR #76. C3: script khóa ký kiểm đúng repo và quyền admin trước khi tạo khóa.
  - Phần bổ sung W5: luật cắt theo giờ, gộp, null, `closeRate` của điểm gộp; `staff[].chart` cho biểu đồ to theo một người; web bắt buộc đọc `chart`; hộp chạm hiện dòng "Chênh lệch" qua `Fmt.chartDiff` có kiểm thử.
  - Chế độ tiết kiệm của anh (14/10): Codex làm cả build, chạy thử trên máy ảo, chụp / quay và viết tóm tắt theo mẫu; tổ app chỉ đọc tóm tắt và diff, chạy các lệnh grep; QA chỉ kiểm số liệu và bảo mật ở 11 mốc và job ký.
  - I7, A7b thành bước chính (web thật đã có PR #76): iOS 9 bước, Android Phần A 12 bước; I7 chạy sau I4b, A7b chạy sau A7c.
  - W4 đã lên web thật (PR #75): bỏ khỏi điều kiện phát hành, rút mô tả còn một dòng.
- Bản 1.3 (14/10/2026), theo lời anh 09:21Z (Claude không kiểm từng bước, chỉ kiểm khi Codex xong từng phần): thêm mục 5.6 chạy liền một mạch bằng script `chay-lien-mach.sh`, máy kiểm sau mỗi bước, tổ app và QA kiểm một lần cuối phần; iOS và Android chạy song song, mỗi phần một tài khoản; `CODEX.md` thêm mục 12, mục 9 ghi câu hỏi rồi làm tiếp; ghi sẵn SHA action và bản `org.json` cho A0.
