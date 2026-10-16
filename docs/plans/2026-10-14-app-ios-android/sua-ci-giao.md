# Sửa CI iPhone lần 3: đủ bằng chứng cho QA (Hôm nay, kỳ dài khác nhau, Vận đơn) và chữ "(không tính)"

Đọc và theo luật `docs/plans/2026-10-14-app-ios-android/CODEX.md`: vùng cấm, không mạng, không commit, không push (trừ khi người chạy em giao khác).

**Máy em chạy không có Xcode.** Bỏ mục 10 và 13 của CODEX.md: không có `xcodebuild`, `xcrun`, `swiftc` hay máy ảo, đừng thử. CI trên GitHub build và quay video. Vùng cấm của mục 5 áp dụng cho mọi `~/.codex*`, `C:\tele-bot\**` và mọi file `.env`. Giữ xuống dòng LF như file gốc.

## Bối cảnh
- Demo có W1, W2, W5 (PR #77). QA đã kiểm số, phần số ĐẠT (I3, I4, I4b, I7, I5a). Còn ba chỗ chưa có bằng chứng và một chỗ chữ (mục 1–4).
- CI ở 78620e9 đỏ ngay sau `het-12`, ở các lệnh kiểm log `rieng dong=1` / `ca-doi`. Nguyên nhân là dữ liệu: bản demo mới xoá rồi nạp lại dữ liệu từ đầu, chưa có số so theo người. Code app không lỗi.
  - **Không sửa app vì lỗi này.**
  - Chỉ làm cho các lệnh kiểm in rõ chỗ thiếu (mục 5).

## Làm

### 1. Ca Hôm nay (plan 6.2.4 và phần giờ của 6.2.10)
Hiện log các mốc `chart-through-today`, `today`, `chart-today`, `today-mini` vẫn là `so mode=custom … cs=2025-09-30 ce=2025-09-30`, kỳ 01–30/09.

**Nguyên nhân (tổ app đã tìm, em kiểm lại trong code).** Đây là lỗi lượt tour, không phải lỗi app.
- `Tabs.swift`, trong `warehouse(nav:)`, các bước sau mốc `rieng-end` thay phần tử duy nhất của đường đi tại chỗ: `nav.overviewPath = [.dept(.sale, period: .month, page: "compare")]` rồi `[.dept(.sale, period: .today, …)]`.
- `NavigationStack` giữ nguyên màn đích đang mở (cùng nhánh `SaleContent` → `CompareView` trong `DeptDestination`, `Departments.swift`).
- Vì vậy các `@State` vẫn giữ giá trị cũ:
  - `@State period` của `CompareView` (`CskhViews.swift`, `init` dùng `State(initialValue:)`) vẫn là Tháng trước;
  - `@State start`/`end` của `CompareState` (`StaffCompare.swift`) vẫn là ngày của `chart-unequal`.
- Người dùng thật không thay đường đi tại chỗ, nên không sửa app. Các lượt khác đã đặt `nav.overviewPath = []` trước khi mở trang mới, ví dụ lượt Vận đơn/MKT trong `Tabs.swift` (`[.dept(.mkt, period: .month)]` → `[]` → `[.dept(.vandon, period: .month)]`).

**Sửa (chỉ lượt tour, `Tabs.swift`):**
- Trước bước mở `period: .month`, thêm một bước `(2, { nav.overviewPath = [] })`. Làm tương tự trước bước mở `period: .today`. Giữ nguyên các bước khác và thứ tự mốc.
- Giữ bước `xnk-custom` trước khi mở Tháng này. Chế độ `custom` nhớ trong `@AppStorage("thp_cmp_mode")`, nên màn mới tự bootstrap ngày từ API.
  - Ca `reopen-custom` ở cuối đoạn 12 cần app tắt khi chế độ vẫn là `custom`: đừng thêm bước nào đổi chế độ sau `xnk-custom`.
- Dòng `[XNK] so …` (`StaffTable.swift`, `logCompare()`) chưa ghi kỳ đang xem.
  - Thêm ` ky=\(c.period.start)..\(c.period.end)` vào cuối chuỗi, sau phần `cutoff` nếu có.
  - Không đổi các trường đã có, vì workflow đang `grep`/`sed` theo `mode=`, `step=`, `kind=`, `cs=`, `ce=`.
  - Kiểm `API.StaffCompare.period` có `start`/`end` (`StaffAPI.swift`).

**Kết quả cần có trong log:**
- Mốc `chart-through-today`: `ky=<ngày 1 tháng này>..<hôm nay>` (nhiều ngày, kết thúc hôm nay). Biểu đồ theo ngày, không cắt theo giờ: máy chủ chỉ cắt khi `bucket=hour`.
- Mốc `today` và `chart-today`: `ky=<hôm nay>..<hôm nay>`, `cs=ce=<hôm qua>`, có `cutoff=HH:MM`. Máy chủ trả cutoff khi kỳ kết thúc hôm nay và kỳ so không quá 31 ngày (`lib/report-time.ts`, `compareWindow`; đọc bằng `git show origin/main:lib/report-time.ts`).
- Thêm vào workflow, ngay sau phần kiểm `het-12` (mục 5), hai lệnh kiểm:
  - có dòng `so ` với `ky=` kết thúc đúng ngày hôm nay theo giờ VN, không cần `cutoff`;
  - có dòng `so ` với `ky=` một ngày là hôm nay theo giờ VN và có `cutoff=`.
  - Ngày hôm nay: `TZ=Asia/Ho_Chi_Minh date +%F`.

### 2. Kỳ dài khác nhau (6.2.10, mốc `chart-unequal`)
- Hiện `StaffCompare.swift`, case `"xnk-chart-unequal"`, lấy một ngày từ `data.compare.end` (sau `xnk-chart-year` là 30/09/2025). Ngày đó demo không có số (so=0).
- Đổi sang kỳ so cố định **01–15/08/2026**: `start = VNDate.date("2026-08-01")`, `end = VNDate.date("2026-08-15")`, `mode = .custom`. Chỉ gán khi cả hai ngày đọc được.
- Sửa chú thích cho đúng: đây là ngày người dùng tự chọn trong lượt tour, không tính ngày kỳ so trên máy.

### 3. Vận đơn theo team (đoạn `13-team` của `.github/workflows/ios-preview.yml`)
Vận đơn tính theo trạng thái hiện tại, nên QA cần số API lấy cùng lúc với số app.
- **App** (`Departments.swift`, `load()` của trang Vận đơn, trong khối `#if DEBUG` / `if TeamTourStatus.enabled` đang in `[TEAM] van-don don-di=`): in thêm một dòng `[TEAMQ] path=<API.vanDonPath(start: r.0, end: r.1, posIds: ids, hrTeam: unit?.id)>`, `fflush(stdout)`.
  - Dùng đúng hàm `vanDonPath` app đã gọi.
  - Tiền tố `[TEAMQ]` cố ý khác `[TEAM]`, để dòng này không lọt vào `13-team-app.txt` hay `tour_log_tail`: mã team chỉ nằm trong `$RUNNER_TEMP`.
- **Workflow**, trong vòng `for stage in "${team_stages[@]}"`, ngay sau khi chụp mốc `van-don` (chỉ mốc này):
  1. Lấy dòng `[TEAMQ] path=` cuối cùng trong `$RUNNER_TEMP/team-13.txt`. Không có thì `::error::` và thoát 1.
  2. Gọi `curl -sS --fail -b "thp_session=$TOKEN" "$BASE$path"`, tức là có team.
  3. Gọi tiếp với cùng đường dẫn đã bỏ phần `&hrTeam=…` (`sed 's/&hrTeam=[^&]*//'`), tức là không có team.
  4. Đọc `total.sent` bằng `python3 -c` từ stdin.
  5. Ghi vào `$OUT/13-van-don-api.txt` hai dòng dạng `team=co start=… end=… posIds=… sent=…` và `team=khong …`.
  - **Không** ghi mã team, không ghi JSON thô, không `echo` đường dẫn ra log job.
  - `TOKEN` không được in.
- Sau `het-13`, `cat "$OUT/13-van-don-api.txt"`. Thêm dòng `[TEAM] van-don don-di=` của app cùng lượt vào cuối file đó để QA đối chiếu.

### 4. Chữ (6.1.3)
Bảng giải thích Đã XN kho trên web ghi "(không tính)" sau hai dòng (`git show origin/main:app/product-group-blocks.tsx`, khoảng dòng 1007 và 1011).
- `Terms.swift`, `StaffTerms.selfConfirmed`: `"Người chốt tự bấm Đã xác nhận (không tính)"`.
- `StaffTerms.unknownConfirmer`: `"Không rõ người xác nhận (không tính)"`.
- Không đổi `includingSelfConfirmed`, `includingUnknownConfirmer`.

### 5. Lệnh kiểm đoạn 12 phải nói rõ chỗ thiếu
Trong `ios-preview.yml`, sau `stop; mark "het-12"`, các lệnh `grep`/`test` kiểm `rieng dong=1`, `ca-doi`, số dòng `cham kind=wave` hiện hỏng mà không in gì.
- Thêm một hàm nhỏ, ví dụ `can_co <mẫu> <file> <số dòng tối thiểu> <tên>`. Thiếu thì in `::error::Đoạn 12 thiếu log <tên>: có N dòng, cần M` rồi `return 1`.
- Dùng hàm này cho đúng các lệnh kiểm đó. Giữ nguyên mức nghiêm: cùng mẫu, cùng số tối thiểu, không đổi kiểm nào thành cảnh báo, không bỏ kiểm nào.
- Chỉ in số đếm, không in dòng log.

### 6. Phạm vi
- Chỉ sửa `ios/Megatech/**/*.swift` và `.github/workflows/ios-preview.yml`. Không thêm file `.swift` mới.
- Không đổi số, chữ hay hành vi nào khác của app. Phần mới trong app chỉ nằm trong `#if DEBUG`, trừ chữ ở mục 4.

### 7. Kiểm (không build được)
- Tách từng run block đã đổi của `ios-preview.yml` ra file trong `.codex-out/ci3/` (không commit), chạy `bash -n`. Tất cả phải đạt.
- Tự đọc lại kỹ diff Swift:
  - hàm, biến, kiểu, optional có thật trong code (`VNDate.date`, `API.vanDonPath`, `c.period`);
  - ngoặc đủ;
  - mọi `print` mới nằm trong `#if DEBUG`;
  - không đổi gì ngoài mục 1–5.
- `git diff --stat` chỉ có các file trong phạm vi.

### 8. Tóm tắt
Viết ngắn, mở đầu `# Tóm tắt`, gồm:
- nguyên nhân mục 1, có `file:dòng`, và em có đồng ý với phần tổ app tìm không;
- đã sửa gì, theo từng mục;
- kết quả kiểm.

Không ghi tên người, SĐT, email, mã team hay khóa.
