# App iPhone 1.0.0: sửa G3 (mở lại app, bảng So sánh nhân viên không sẵn sàng)

Tổ app viết, 18/10/2026, sau lần dừng đầu của lượt G. Codex trên PC làm. Quy tắc chung (quyền, vùng cấm, hạn mức, Telegram, máy kiểm) như `giao-A.md` mục 0 và `giao.md` mục 0.

---

## 0. Cho thread PC (người chạy script)

- Runner G dừng ở G3 sau 4 vòng sửa (commit cuối `8aa2d2f`). Worktree `C:\Users\PC\Projects\thp-app10`, nhánh máy `codex/app-1.0`: fast-forward về `origin/claude/project-thread-avd7td` (đầu nhánh có file này).
- Chạy tiếp lượt G với **một bước chen trước: G3s** (lời giao là mục 2 file này), rồi `G4` → `G10` theo `giao-A.md`. G3s có 4 vòng sửa mới.
- Commit: `App iPhone 1.0.0 G3s: mở lại app tự nói lý do khi chưa có số (Codex viết trên PC, máy kiểm)`. Không `[skip ci]`. Chờ cả `iOS` và `iOS preview` trên đúng commit.
- Vòng sửa của G3s: ngoài annotation và 40 dòng cuối, đưa Codex **mọi dòng `[XNK] cho-so`, `[XNK] thu-lai`** và **60 dòng `[XNK]`/`[TEAM]`/`[MOC]` cuối** của bước đỏ.
- Hết 4 vòng vẫn đỏ: dừng, báo điều phối kèm commit và các dòng trên.

---

## 1. Chuyện gì xảy ra (tổ app đã đọc log 3 lần chạy)

| Commit | Ca rơi | Các ca mở lại trước đó trong cùng lần chạy |
|---|---|---|
| `29e7306` (G3) | `reopen-custom` | (ca đầu) |
| `d9bd4a5` (vòng 2) | `reopen-custom` | (ca đầu) |
| `8aa2d2f` (vòng 4) | `remember-reopen` | `reopen-custom`, `timezone`, `remember-set` qua, mỗi ca khoảng 26–29 giây |

- Cả ba lần đều ở đoạn 12, **sau khi lượt chính** (`MEGATECH_TOUR=xnkho`) đã qua hết tới `today-mini`. Mỗi ca mở lại là một lần mở app mới (`launch_xnk_case`): app chờ 8 giây, cuộn tới bảng, rồi chờ `CompareTourStatus.ready` tối đa 90 giây (`Tabs.swift`, `warehouse`, nhánh `MEGATECH_XNK_CASE`; `playCompare`).
- Lần rơi không có dòng `[XNK] so` nào, chỉ có `[XNK] moc=loi-tai-so`. `ready` chỉ thành `true` trong `StaffTable.logCompare()`, khi bảng (`load`) và số so (`loadCompare`) cùng xong, cùng khoá, cùng kỳ. Vậy một trong hai nửa chưa xong, xong bằng lỗi, bị huỷ mà không có lượt mới, hoặc hai nửa lệch kỳ hay khoá.
- G2 (`0af2ed9`) và các bản 0.11 trước qua cả bốn ca. G3 chỉ đổi `HomeFeed.swift` (giao diện, không đổi lời gọi API). Ở bốn ca này app mở thẳng vào Tổng quan (`NAV_RESET`, `NavMemory.launchTab`) nên HomeFeed có thể không được vẽ. **Nguyên nhân chưa rõ.**
- Vòng sửa 2 và 4 chỉ đổi màu và `Label` trong HomeFeed: không liên quan tới lỗi. Giữ hai thay đổi đó, **không sửa mò HomeFeed nữa**.
- Vì sao phải đoán: `tour_log_tail` trong `ios-preview.yml` chỉ lọc `^\[(XNK|TEAM)\]`. App đã in `[MOC] tai bang-nhan-vien …` và `[MOC] tai so-cung-ky …` (bắt đầu, xong hay huỷ, số request, số lỗi; xem `LoadTrace.swift`) và các mốc Face ID, nhưng log đỏ không có các dòng này.

---

## 2. Việc của Codex (G3s)

Chỉ sửa `ios/**` và `.github/workflows/ios-preview.yml`. Phần mới trong app nằm trong `#if DEBUG`, trừ khi mục 2.3 tìm ra lỗi thật của app.

Không in số liệu, tên, mã người, email, đường dẫn API hay chữ lỗi của máy chủ ra log (repo công khai, log Actions công khai).

### 2.1 Log đỏ phải tự nói lý do (làm trước)

1. `ios-preview.yml`, hàm `tour_log_tail`: lọc `^\[(XNK|TEAM|MOC)\]`, lấy 60 dòng cuối. Không chép dòng nào khác của app.
2. `StaffCompare.swift`, `CompareTourStatus`: thêm hai trạng thái `bang` và `so`. Mỗi nửa là một trong: `chua`, `dang-tai`, `xong`, `huy`, `bo-qua`, `loi-mang`, `loi-het-gio`, `loi-http-<mã>`, `loi-giai-ma`, `loi-khac`. Thêm `lanDung`: số lần một `StaffTable` mới xuất hiện (đếm ở `onAppear`).
3. `StaffTable.load()` và `loadCompare()`: ghi trạng thái lúc bắt đầu, lúc xong, ở `catch` và ở mỗi `guard … else { return }` (lượt cũ bị thay hoặc khoá đổi thì ghi `huy`). Phân loại lỗi:
   - `URLError.timedOut` → `het-gio`; `URLError` khác → `mang`;
   - `API.APIError` → `http-<status>`;
   - `DecodingError` → `giai-ma`; còn lại `khac`.
   - Nhánh bỏ qua vì số còn mới → `bo-qua`.
4. `logCompare()`: khi guard không qua dù cả hai nửa đã `xong`, ghi lý do `khop-ky=khong` (kỳ của bảng khác kỳ của số so) hoặc `khoa=khong` (`loadedCompareKey != compareKey`).
5. `playCompare`: ngay trước `warehouseMark("loi-tai-so")`, in đúng một dòng:
   `[XNK] cho-so bang=<…> so=<…> khop-ky=<co|khong|chua> khoa=<co|khong|chua> lan-dung=<n> tab=<tab> trang=<số trang trong overviewPath>`

### 2.2 Máy chủ demo trả lỗi: tour làm như người dùng

- App: hết 90 giây mà một nửa đang `loi-mang`, `loi-het-gio`, `loi-http-5xx` hoặc `loi-http-429` thì tour "bấm" Thử lại **đúng một lần** (`DebugRetry`, hoặc tải lại cả hai nửa như kéo để làm mới), in `[XNK] thu-lai=1 ly-do=<trạng thái>`, chờ thêm 60 giây. Có số thì đi tiếp như thường. Vẫn lỗi thì in `cho-so` rồi `moc=loi-tai-so`.
- `ios-preview.yml`, `wait_xnk`: thấy `loi-tai-so` mà dòng `cho-so` có một nửa ở `loi-mang`, `loi-het-gio`, `loi-http-5…` hoặc `loi-http-429` thì:
  - in `::warning::demo: mở lại app ở ca <ca>, máy chủ demo trả <trạng thái>`;
  - mở lại ca đó **một lần** nữa (gọi lại `launch_xnk_case`);
  - lần hai vẫn vậy thì in `::error::demo: …` và dừng.
- Không áp dụng cho `http-400`, `401`, `403`, `404`: đó là lỗi app hoặc quyền, làm theo 2.3.

### 2.3 Lỗi app: sửa thật

Dòng `cho-so` cho biết đi nhánh nào. Lần đẩy đầu chưa có dòng này: đọc code theo ba nghi vấn dưới, sửa chỗ thấy chắc là lỗi, ghi rõ trong tóm tắt.

- **`dang-tai` sau 90 giây (request không trả).** `API.session` có `timeoutIntervalForRequest = 45`, nên mỗi request phải kết thúc (có số hoặc ra khung lỗi) trong khoảng 45 giây. Bootstrap Tự chọn ngày là 2 request nối nhau. Tìm chỗ đợi mãi, ví dụ:
  - `UnlockPrefetch.take` trả task tải trước: task bị huỷ khi `discard()` thì bên dùng có nhận lỗi không?
  - lượt bị huỷ mà `.task(id:)` không chạy lại.
- **`huy` ở một nửa, không có lượt mới.** Khoá đổi giữa chừng mà view mới không tải. Ví dụ: `compare.start/end` gán sau bootstrap; `MetricPrefs.load()` làm `revision` tăng nên `HomeView().id(rev)` dựng lại. Sửa để luôn có một lượt tải chạy tới cuối cho khoá hiện tại.
- **Cả hai `xong` mà `khop-ky=khong` hoặc `khoa=khong`.** Bảng và số so lệch nhau. Sửa để nửa nào xong sau cũng gọi `logCompare` với cùng khoá; nếu lệch kỳ thật thì nửa cũ tải lại.

Không được:
- tăng `readyTimeout` quá 90 giây, hoặc tăng thời gian chờ của `wait_xnk`;
- bỏ hay đổi điều kiện `grep` của bốn ca, bỏ ca nào;
- chạy lại cả job.

### 2.4 Đạt khi

- `iOS` và `iOS preview` xanh trên commit G3s (có `::warning::demo:` vẫn coi là xanh).
- `12-xn-kho-app.txt` có dòng `[XNK] so` của cả bốn ca, đúng chế độ như trước:
  - `reopen-custom` có `cs` và `ce`; `timezone` cùng hai ngày đó;
  - `remember-set` và `remember-reopen` có `mode=weekday step=2 kind=diff`.
- Một ca rơi thì log đỏ có `[XNK] cho-so …` và các dòng `[MOC] tai bang-nhan-vien` / `[MOC] tai so-cung-ky` của lần mở đó.
- Tóm tắt G3s nói rõ đã đi nhánh nào ở 2.3 (hoặc "CI xanh, chưa gặp lại; đã thêm log"), kèm file và dòng đã sửa.
