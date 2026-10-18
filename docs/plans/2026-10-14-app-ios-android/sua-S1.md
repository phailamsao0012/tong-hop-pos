# Android Phần A, lượt sửa S1: Codex sửa lỗi tổ app tìm ra khi kiểm

Tổ app viết, 18/10/2026, sau khi kiểm một lần 12 bước của Codex PC (bản cuối `7104c08`, tóm tắt `ket-qua-android.md`, video CI nhánh `android-preview`). Điều phối giao: "Tổ kiểm tiếp rồi trình anh; PC không phát hành."

Kết quả kiểm: phạm vi file sạch, đổi tên "Đang đóng hàng" đúng, cách đọc số và định dạng khớp iOS, không có dữ liệu thật trong repo. Còn 2 lỗi chặn, 13 lỗi lớn và một số lỗi nhỏ, chia vào 4 bước dưới đây. Mỗi lỗi ghi chỗ sai, cách sửa và cách kiểm. Số dòng là của `221f058`; lệch vài dòng thì tìm theo tên hàm.

Codex viết toàn bộ code. Claude trên PC chỉ chạy script giao bước và đẩy nhánh, không sửa code app hay workflow.

## Phần 1. Máy chạy

Giữ nguyên `android-pc-giao.md` Phần 1 (worktree `C:\Users\PC\Projects\thp-android`, nhánh máy `codex/app-1410-android`, lệnh Codex 1.3, máy kiểm 1.4, commit và đẩy 1.5, chờ CI 1.6), chỉ khác các điểm sau:

- **Đầu lượt.** `git fetch origin claude/app-android`, rồi đưa nhánh máy tiến thẳng tới `origin/claude/app-android` (có commit lời giao này). Không tiến thẳng được thì dừng, ghi lý do.
- **Thứ tự bước.** S1a → S1b → S1c → S1d. Bước sau chỉ bắt đầu khi bước trước qua máy kiểm và CI xanh (cả `Android` lẫn `Android preview`).
- **Lời giao mỗi bước.** Câu mẫu `plan.md` 5.5.2, rồi `android-pc-giao.md` Phần 2 nguyên văn, rồi Phần 2 của file này nguyên văn, rồi mục của bước ở Phần 3 file này.
- **Lời commit.** `App Android 14/10 S1a: <việc> (Codex viết trên PC, máy kiểm)`. Commit workflow riêng: `... (ngoại lệ có tên, Codex sửa, máy kiểm)`.
- **Vòng sửa.** Tối đa 4 vòng mỗi bước, như 1.6.
- **Máy kiểm 1.4 mục 7** thêm: ở S1d, mọi `uses:` có chú thích tag dạng `# vX.Y.Z` sau SHA.
- **Xong cả lượt.** Thêm vào cuối `ket-qua-android.md` mục `## Lượt sửa S1` (tóm tắt 4 bước, tiến độ, cảnh báo, SHA cuối), qua mẫu dò 1.4 mục 3, commit, đẩy. Claude trên PC kiểm một lần (đọc tóm tắt, CI cuối xanh), báo điều phối một tin kèm SHA cuối.
- **Không làm ở lượt này.** Như 1.8: không khóa ký, không `tao-khoa-ky.sh`, không PR vào `main`, không phát hành `android-v0.2-2`, không emulator trên PC.

## Phần 2. Ghi thêm chung của lượt S1 (gửi kèm lời giao mọi bước, nguyên văn)

> - Đây là lượt sửa sau khi tổ app kiểm. Chỉ sửa đúng các mục của bước được giao, không làm lại bước cũ, không đổi chữ hay số của màn khác.
> - Lỗi nào sửa theo cách khác cách ghi ở đây thì phải đạt đúng mục "Đạt khi", ghi lý do vào "Chỗ làm khác plan".
> - File được sửa: chỉ `android/**` và hai workflow `.github/workflows/android.yml`, `.github/workflows/android-preview.yml` (ngoại lệ có tên của lượt này, đúng phần ghi ở bước). Không thêm thư viện.
> - Test JVM mới để trong `android/app/src/test/**`, dùng số giả (12, 30, "NV A", "Team A"). Logic mới tách được khỏi Compose (sắp xếp, nhãn trục, câu báo, chọn bộ phận) thì viết thành hàm thường và có test.
> - Log mới để kiểm trên CI dùng tiền tố `[KIEM]`, chỉ có mã và số đếm, sau `if (BuildConfig.DEBUG)`. Không đổi dạng các dòng `[XNK]`, `[TEAM]` đang có, trừ chỗ bước ghi rõ.
> - Lệnh kiểm mới trong `android-preview.yml` lỗi thì in `::error::<đoạn>: <lý do, số đếm>` rồi thoát 1, như A1c. Không in dòng log thô, phiên hay token.
> - Mã iOS để đối chiếu: `git show origin/main:ios/Megatech/Megatech/<file>` (bản 0.10 đang phát hành) hoặc `git show origin/claude/project-thread-avd7td:ios/Megatech/Megatech/<file>` (bản 0.11).

## Phần 3. Các bước

### S1a. Khóa app

File được sửa: `App.kt`, `Security.kt`, `Login.kt`, `LockPolicy.kt`, `HrTeam.kt`, test JVM; `android-preview.yml` phần các đoạn `1-khoa`, `2-che` và một bước mới API 29.

1. **(Chặn) Số liệu dưới màn khóa còn đọc được bằng TalkBack.** `App.kt:212-221`: khi khóa, `RootTabs()` vẫn dựng, `LockScreen` chỉ vẽ đè lên. `pointerInput` chặn ngón tay nhưng không chặn cây trợ năng, nên TalkBack đọc được số và bấm được nút bên dưới.
   - Sửa: khi `locked`, Box chứa nội dung (cả `RootTabs`, `DebugTour.Content`) nhận `Modifier.clearAndSetSemantics { }`. Gốc của `LockScreen` (`App.kt:232`) thêm `Modifier.semantics { isTraversalGroup = true }`.
   - Đạt khi: đoạn `1-khoa` có bước mới. Khi hộp xác thực hệ thống hiện, bấm Back để hủy. Chờ `uiautomator dump` có "App đang khóa". Rồi dump lại: không được chứa `₫`, "Doanh thu", "Đơn chốt", "Điều khiển trung tâm". Có thì `::error::1-khoa: số liệu lộ dưới màn khóa, số chữ=<n>`. Sau đó mới mở khóa như cũ.
2. **(Lớn) Mở bằng mã PIN không bao giờ xong trên Android 8-10 (API 26-29).** Trên các bản này, bước nhập PIN là một Activity riêng, nên `MainActivity` nhận `ON_STOP`. `AppLock.onStop()` (`App.kt:128-135`) tăng `attempt` và hủy lời hỏi, nên kết quả đúng PIN bị bỏ (`App.kt:161`). Màn khóa, màn chào lại và duyệt đăng nhập máy tính lặp mãi.
   - Sửa: thêm cờ "đang chờ màn ngoài của chính app" (`expectingExternal`, kèm thời điểm). Đặt cờ ngay trước `authenticate()` khi `Build.VERSION.SDK_INT < 30`. `onStop` gặp cờ thì không khóa, không hủy, chỉ ghi thời điểm dừng. Cờ xóa trong mọi callback (đúng, lỗi). Về lại app (`ON_START`) mà đã dừng quá 120 giây thì khóa như đi nền thật.
   - Giữ luật vé cũ (`policy.acceptsAuthentication`) cho mọi lần đi nền thật.
   - Đạt khi: test JVM cho `LockPolicy` (hoặc lớp mới tách ra): dừng khi có cờ thì không khóa; dừng khi có cờ quá 120 giây thì khóa khi về; dừng không cờ thì khóa. CI có bước mới `6.4.12 — mở bằng PIN trên API 29`: `api-level: 29`, `arch: x86_64`, `avd-name` riêng, `locksettings set-pin` với PIN giả, mở app, nhập PIN bằng `adb shell input text` rồi Enter, rồi `uiautomator dump` không còn "App đang khóa" và log có `xac-thuc-dung`. Sai thì `::error::6.4.12: mở bằng PIN không xong, số lần=<n>`.
3. **(Nhỏ) Xoay máy hay mở máy quét QR cũng khóa app.** `App.kt:194` gọi `AppLock.onStop()` cả khi Activity chỉ tạo lại (xoay, đổi sáng tối, đổi cỡ chữ). Quét QR (`Security.kt:84`, `startScan()`) mở Activity của Play services, app khóa, rồi tấm duyệt hỏi xác thực thêm lần nữa.
   - Sửa: observer bỏ qua khi `act.isChangingConfigurations`. Quét QR dùng cùng cờ `expectingExternal` của mục 2, đặt trước `startScan()`, xóa trong cả listener thành công, lỗi, hủy.
   - Đạt khi: test JVM cho nhánh "tạo lại Activity" và "quét QR" như mục 2. Về nhà (Home), tắt màn hình, đổi app vẫn khóa như cũ (ca 1-khoa đang có giữ xanh).
4. **(Nhỏ) Team đã chọn còn nguyên sau khi phiên hết hạn.** `TeamState` chỉ xóa trong `Auth.signOut()` (`App.kt:96`). Các đường 401 (`App.kt:350`, `StaffTable.kt:92`, `Login.kt:278`) đặt thẳng `Auth.state = SignedOut`, nên người đăng nhập sau vẫn bị lọc theo team cũ.
   - Sửa: trong `Root`, `LaunchedEffect(Auth.state) { if (Auth.state != Auth.State.SignedIn) TeamState.clear() }`.
   - Đạt khi: test hoặc lập luận trong tóm tắt chỉ ra mọi đường rời `SignedIn` đều xóa team.
5. **(Lớn) Ca `2-che` không kiểm FLAG_SECURE thật.** Từ `0e11b40`, `2-che` mở với `secure=0` rồi mới bật ở cuối. Lệnh `blackdetect` đạt nhờ khung đen của hộp PIN hệ thống, không nhờ FLAG_SECURE. Khung cuối còn thấy rõ tấm "Bảng thử bản debug".
   - Sửa workflow: `2-che` mở từ đầu với `-e secure 1`, như bản phát hành. Mốc giao diện chỉ dò bằng `uiautomator dump` hoặc logcat, không dò bằng khung hình video. Sau khi mở khóa và tấm debug hiện: `adb exec-out screencap -p` phải đen gần hết (ffmpeg `blackframe=amount=98` trên ảnh). `dumpsys window windows` phải có cờ SECURE trên mọi cửa sổ của `vn.megatech.tonghoppos.debug`, kể cả cửa sổ của tấm. Không tính khung đen trong lúc hộp PIN hệ thống đang hiện.
   - Đạt khi: hai lệnh kiểm trên chạy và xanh. Tóm tắt ghi số cửa sổ có SECURE.
6. **(Nhỏ) Ca `1-khoa` không chứng minh app đã khóa.** Từ `a6f336c`, `unlock()` (`android-preview.yml:181`) trả về thành công khi thấy tấm debug, không cần `hoi-xac-thuc`. Lệnh dò tấm nổi trên màn khóa (`:557`) chỉ dump cửa sổ đang có focus, nên không thấy được.
   - Sửa workflow: mỗi vòng (mở lạnh và về lại) phải có dòng `hoi-xac-thuc` trước khi `unlock()` được trả về. Lưu log trước mỗi `adb logcat -c` và kiểm đủ hai vòng. Dò tấm nổi bằng `uiautomator dump --windows` hoặc `dumpsys window windows` (mọi cửa sổ không phải Activity của gói debug). Lượt khóa mở thêm menu chọn kỳ và hộp "Đổi mật khẩu", như A1c "Xong khi" và QA 6.4.6.
   - Đạt khi: `1-khoa.txt` có hai dòng `hoi-xac-thuc`; khi khóa không có cửa sổ nổi nào của app trên màn khóa.

### S1b. Bảng từng nhân viên

File được sửa: `Sale.kt`, `Cskh.kt`, `More.kt`, `StaffTable.kt`, `StaffCompare.kt`, `App.kt` (chỉ `TabPage`, `SubPage`), `Fmt.kt`, `DebugTour.kt`, test JVM; `android-preview.yml` phần các đoạn `3-xn-kho`, `4-so-cung-ky`.

1. **(Chặn) Chọn "Tất cả" ở So sánh nhân viên ra bảng mọi người, ghi nhầm "Từng nhân viên Sale".** `Sale.kt:149,161,166`: `tm = teamPick`, chọn "Tất cả" thì `StaffTableBlock("all", …)` gửi `team=all&by=seller`. Máy chủ không lọc gì, bảng có cả người không mang hậu tố MKT/CSKH/SALE, dòng Tổng cộng hết vào. Trái luật số 1 của repo.
   - Sửa như plan 4.5.6 (`plan.md:848-849`): chỉ dựng bảng khi `(tm == "sale" && Auth.canView("sale-overview"))` hoặc `(tm == "cskh" && Auth.canView("cskh-overview"))`, truyền chữ `"sale"` / `"cskh"` cụ thể. `tm == "all"` thì không có bảng. `StaffTableBlock` tự chặn: nhận `team` khác `"sale"`, `"cskh"` thì không tải, không vẽ.
   - Đạt khi: test JVM cho hàm chọn "có bảng hay không" (sale/cskh/all × có/không quyền). Lượt `xnkho` thêm một dừng ở Thêm › So sánh nhân viên, chọn "Tất cả", in `[KIEM] tat-ca bang=khong`. CI kiểm dòng đó và không có dòng `[XNK] bang team=all`.
2. **(Lớn) Bảng không kiểm quyền xem.** Plan 6.1.9 (`plan.md:1636`): tài khoản không xem được `sale-overview` thì không thấy bảng và không thấy lỗi. Hiện bảng luôn hiện, máy chủ trả 403 thành dòng lỗi. Sửa cùng mục 1.
3. **(Nhỏ) Trang con CSKH sai mã quyền và sai chỗ.** `Cskh.kt:27` dùng `SubTab("compare", "Nhân viên")` ở vị trí 2. Plan 4.5.6: `SubTab("cskh-overview", "Nhân viên")` đứng đầu `CSKH_TABS`.
   - Sửa: đổi mã, đưa lên đầu, `"cskh-overview" -> CompareContent("cskh")`. Sửa chỗ so `page != "compare"` (`Cskh.kt:42`) và đích của `DebugTour` theo mã mới. Thêm › danh sách trang có mã `cskh-overview` thì mở `SubPage("Nhân viên CSKH") { CompareContent("cskh") }`, không rơi vào "Trang này chưa có trong app".
4. **(Lớn) Cột So cùng kỳ không sắp được.** `StaffTable.kt:244` là ô chữ, không bấm được. Plan 4.4.2 và `plan.md:49`: sắp được theo từng cột, cột So cùng kỳ sắp theo mức đổi.
   - Sửa: cột 6 = So cùng kỳ, đầu cột bấm được như sáu cột kia. Giá trị sắp lấy từ kết quả So cùng kỳ đã tải, theo chỉ số đang chọn, cùng công thức `comparisonValue` của iOS (`StaffTable.swift`): Tỷ lệ chốt lấy hiệu điểm `a − b`; còn lại `b == 0 && a > 0` là +∞, khác thì `(a − b) / b × 100`. Không có số thì xếp cuối, bằng nhau thì theo `sellerId`. Đổi chỉ số hay tải lại So cùng kỳ thì sắp lại.
   - Đạt khi: test JVM cho hàm sắp (có số âm, +∞, thiếu số, bằng nhau).
5. **(Lớn) Không mở được phần giải thích "Đơn chốt" của từng người.** `StaffTable.kt:249`: bấm số Đơn chốt của một người luôn mở danh sách đơn, nên "Từ số chia kỳ này / Từ số chia trước đó" chỉ xem được ở dòng Tổng.
   - Sửa: như iOS, cạnh số Đơn chốt có nút biểu tượng nhỏ (`Icons.Outlined.Info`, `contentDescription = "Giải thích Đơn chốt"`) mở `staffWhy(s, 2, table?.definitions)`. Bấm số vẫn mở danh sách đơn.
6. **(Lớn) Bảng bị cắt trên điện thoại, không thấy cột "Đang đóng hàng".** `StaffTable.kt:236-246`: cột tên 132dp, cột số 145dp, cột Đang đóng hàng 220dp. Trên máy quay (khoảng 320dp) phần cuộn ngang hẹp hơn một cột, chữ và số bị cắt mất chữ số đầu (đọc nhầm tiền). Bước `xnk-cot` (`StaffTable.kt:201`) cuộn tới `maxValue − 145dp`, rơi vào cuối cột Doanh thu.
   - Sửa: độ rộng gần iOS: cột tên khoảng 110dp, cột đếm khoảng 116dp, cột tỷ lệ khoảng 152dp, So cùng kỳ khoảng 184dp. Chữ trong ô một dòng; không đủ chỗ thì thu nhỏ chữ (dùng `autoSize` của `BasicText` nếu bản Compose đang dùng có, không thì giảm cỡ chữ ô), không bao giờ cắt mất chữ số. `xnk-cot` cuộn sao cho mép trái cột Đang đóng hàng nằm ở đầu vùng nhìn thấy (tổng độ rộng các cột trước nó).
   - Đạt khi: S1d đổi máy ảo sang khổ ≥ 360dp; trong video `3-xn-kho` thấy đầu cột "Đang đóng hàng" và ô dạng "x/y đơn chốt". Lượt in `[KIEM] cot-dong-hang hien=co` khi cột đó nằm trong vùng nhìn thấy (đo bằng vị trí cuộn và độ rộng cột).
7. **(Lớn) Kéo để làm mới không chạy.** `StaffTable.kt:221`: `PullToRefreshBox` riêng của bảng nằm trong vùng cuộn dọc của trang nên không bao giờ nhận cú kéo. Trang chủ của bảng (`TabPage` ở Sale, CSKH; `SubPage` ở `App.kt:288`, `More.kt:134`) truyền `onRefresh = {}`. Kéo xuống thì vòng xoay hiện rồi tắt, không tải lại gì. Trái plan I3, A6 và QA 6.1.10.
   - Sửa: bỏ `PullToRefreshBox` trong bảng. `CompareContent` nhận lệnh làm mới từ trang chứa nó (ví dụ `CompositionLocal` cho bộ đếm làm mới và trạng thái đang tải, do `TabPage` / `SubPage` cấp). Kéo ở Sale › Nhân viên, CSKH › Nhân viên, Thêm › So sánh nhân viên thì tải lại cả bảng, So cùng kỳ và danh sách `byEmployee`; vòng xoay hiện tới khi cả ba xong. Các trang khác giữ nguyên cách cũ.
   - Đạt khi: lượt `xnkho` in `[KIEM] keo-lam-moi lan=<n>` mỗi lần nhận cú kéo. CI có bước vuốt từ trên xuống ở Sale › Nhân viên (`adb shell input swipe`), rồi phải thấy một dòng `[KIEM] keo-lam-moi` và một dòng `[XNK] bang` mới.
8. **(Nhỏ) Về lại app chỉ tải lại bảng, không tải lại So cùng kỳ.** `StaffTable.kt:107-115`: nhánh `ON_RESUME` quá 60 giây chỉ gọi `data.reload()`. Thêm `compareTick++` trong cùng nhánh để hai khối luôn cùng một lần tải.
9. **(Nhỏ) Danh sách đơn của một người khác iOS.** `StaffTable.kt:285-305`, `:146`:
   - Tiêu đề chỉ là tên người. Dòng đầu nội dung: "Đơn chốt đã vào Đang đóng hàng · dd/MM/yyyy – dd/MM/yyyy" hoặc "Tất cả đơn chốt · dd/MM/yyyy – dd/MM/yyyy", lấy kỳ từ truy vấn. Hàm định dạng ngày đặt trong `Fmt.kt`, có test.
   - Tiền từng đơn dùng `Fmt.shortMoney` như iOS `Fmt.shortVnd`.
   - Máy chủ trả 400 khi đang gửi `hrTeam`: hiện `HrTeamErrorView(message)` có nút "Bỏ chọn team", như bảng đang làm (`StaffTable.kt:228`), không hiện "Không tải được".
10. **(Nhỏ) Log báo có dòng Tổng khi màn không có.** `StaffTable.kt:151,155`: màn chỉ có dòng Tổng khi `staffTotal.people > 1`, log in `tong=co` và `dong=tong` khi có `staffTotal`. Dùng cùng điều kiện `(table.staffTotal?.people ?: 0.0) > 1` cho cả hai, như iOS `logRows`.
11. **(Nhỏ) Sắp theo tên sai thứ tự tiếng Việt.** `StaffTable.kt:128` dùng `String.compareTo`, nên "Đ…" và chữ có dấu xếp sau "Z". Dùng `Collator.getInstance(Locale.forLanguageTag("vi"))` như `HrTeamChip`. Có test JVM.

### S1c. Team, câu báo và biểu đồ

File được sửa: `Home.kt`, `HrTeam.kt`, `More.kt`, `Sale.kt` (chỉ nút Sale / CSKH / Tất cả của `CompareContent`), `App.kt` (chỉ `SubPage`), `StaffCompare.kt`, `Kit.kt` (chỉ `Segmented`), `DebugTour.kt`, test JVM; `android-preview.yml` phần đoạn `5-team`.

1. **(Lớn) Chọn team mà nút bộ phận ở Trang chủ không đổi theo.** `Home.kt:33,70`: `team` là biến riêng của trang, không theo `TeamState.unit`. Video `5-team` khoảng giây 14: đang xem riêng một team Sale mà nút "Tất cả" vẫn sáng. Plan 4.5.6 (`plan.md:850`) và web `team-store.ts` (`setTeam`, `setHrUnit`):
   - Chọn team thì nút bộ phận nhảy sang bộ phận của team.
   - Bấm nút bộ phận khác bộ phận của team (kể cả "Tất cả") thì bỏ chọn team.
   - Sửa: tách luật này thành hàm thường có test (ví dụ `TeamRule.onPickDept(unit, dept)` trả về team còn giữ hay bỏ). Áp cho nút ở `HomeTab` và nút Sale / CSKH / Tất cả của `CompareContent("all")` (`Sale.kt:161`). Đặt nút theo `TeamState.unit` bằng `LaunchedEffect(TeamState.unit)`.
   - Đạt khi: test JVM đủ 4 ca (chọn team Sale khi đang Tất cả; bấm CSKH khi đang team Sale; bấm Tất cả khi đang team Sale; bấm Sale khi đang team Sale). Lượt `team` in `[KIEM] nut-bo-phan=<sale|cskh|all> team=<co|khong>` sau mỗi lần chọn, CI kiểm sau khi chọn team Sale thì `nut-bo-phan=sale team=co`.
2. **(Lớn) Câu báo team đè lên thanh trạng thái ở trang mở theo mã.** `More.kt:145-150`: câu báo vẽ trước `content()`, tức là trên thanh xanh của trang, không chừa thanh trạng thái (video `5-team` khoảng giây 151, trang Báo cáo cuối tháng).
   - Sửa: câu báo nằm trong nội dung của `SubPage`, dưới thanh xanh, như các tab Sale, CSKH. Ví dụ `SubPage` đọc một `CompositionLocal` câu báo và vẽ nó ở đầu cột nội dung; trang nào trong `when` của `More.kt` không dùng `SubPage` thì tự vẽ câu báo trong nội dung.
3. **(Nhỏ) Câu báo chỉ tới trang Android không có.** `HrTeam.kt:38` chép từ iOS: "Xem theo team ở Tổng quan, Sale › Nhân viên, CSKH › Tổng quan và Vận đơn." Android không có CSKH › Tổng quan, không có Vận đơn; trang tên "Tổng quan POS" lại chính là trang chưa lọc. Đây là chỗ khác iOS có chủ ý, tổ app chốt:
   - Câu mới: "Trang này chưa lọc được theo team — đang hiện số cả nhóm $deptLabel, không riêng team ${unit.name}. Xem theo team ở Trang chủ, Sale › Nhân viên và CSKH › Nhân viên."
   - Khi `deptLabel == "Tất cả"`: "Trang này chưa lọc được theo team — đang hiện số chung của mọi bộ phận, không riêng team ${unit.name}. Xem theo team ở Trang chủ, Sale › Nhân viên và CSKH › Nhân viên."
   - Câu dựng bằng hàm thường có test cho hai ca.
4. **(Nhỏ) Khối "Hành động khẩn cấp" ở Trang chủ thiếu câu "chưa lọc theo team".** `Home.kt:123-131`: các thẻ khác có câu, khối này không có. Thêm "Hành động khẩn cấp chưa lọc theo team." dưới tiêu đề khi đang áp team, cùng cách các thẻ khác (plan `plan.md:1117`).
5. **(Nhỏ) Hai ngày cuối trục ngang đè lên nhau, trục chạy quá ngày cuối kỳ.** `StaffCompare.kt:193`: luôn thêm mốc `len − 1` dù mốc đều trước đó chỉ cách 1-2 điểm; `len` lấy theo kỳ dài hơn nên tháng 9 có nhãn "01/10".
   - Sửa: tách hàm chọn mốc trục (có test). Bỏ mốc đều gần `len − 1` khi cách nhau dưới nửa bước. Không ghi nhãn cho điểm sau ngày cuối của kỳ đang xem; mốc cuối là ngày cuối kỳ.
   - Đạt khi: test cho tháng 30 ngày so với tháng 31 ngày, và cho tháng đang chạy (ví dụ tới ngày 19).
6. **(Nhỏ) Cỡ chữ lớn nhất thì nút chọn biểu đồ bị cắt.** `StaffCompare.kt:88,90` dùng `Segmented`, nhãn một dòng (`Kit.kt:259`). Sửa trong `Segmented`: khi `LocalDensity.current.fontScale > 1.3f` thì nhãn được xuống 2 dòng; cỡ chữ thường giữ nguyên một dòng như cũ (màn cũ không đổi).
   - Đạt khi: video `3-xn-kho` đoạn `chu-lon` đọc đủ chữ các nút.

### S1d. CI và lượt quay

File được sửa: `DebugTour.kt`, `App.kt` (chỉ nhánh debug của `TabStack`), `android.yml`, `android-preview.yml`.

1. **(Nhỏ) Lượt `xnkho`, `team` không đi qua tab thật.** `DebugTour.kt:118,255` vẽ thẳng `SubPage("Từng nhân viên") { CompareContent(page) }`, nên video không qua mã tab, không qua lọc quyền, không qua Thêm › So sánh nhân viên.
   - Sửa: lượt mở bảng bằng cách đổi tab gốc và tab con như người bấm (Sale › Nhân viên; CSKH › Nhân viên với mã `cskh-overview`; Thêm › So sánh nhân viên). Bỏ các `SubPage` debug thay thế.
   - Đạt khi: các dòng `[XNK]`, `[TEAM]` và mọi kiểm của đoạn `3-xn-kho`, `4-so-cung-ky`, `5-team` vẫn xanh.
2. **(Lớn, hỗ trợ S1b mục 6) Máy ảo khổ thật.** Mọi bước máy ảo API 35 dùng cùng `profile` rộng ≥ 360dp (ví dụ `profile: pixel_6`), để AVD tạo một lần và video giống điện thoại thật. Bước API 29 của S1a giữ `avd-name` riêng.
3. **(Nhỏ) Ca 6.4.10 đạt bằng đường dự phòng mà bằng chứng vẫn ghi "đạt".** `e46f34f` thêm đường dự phòng chỉ kiểm cờ gói khi dịch vụ backup không bật, không chạy `bmgr backupnow`. Sửa: bằng chứng ghi đúng đường đã chạy, ví dụ "6.4.10: đạt (chỉ cờ gói, bmgr không chạy)" kèm `::warning::`. Không ghi "đạt" trơn cho đường dự phòng.
4. **(Nhỏ) Bản cuối chưa qua `assembleRelease` (R8, lintVitalRelease).** `android.yml:134`: A8b chỉ build release khi push vào `main`, nên lỗi rút gọn mã chỉ lộ ra sau khi gộp. Sửa: build `:app:assembleRelease` chưa ký cả khi push vào `claude/app-android` và khi `pull_request`. Job ký giữ nguyên chỉ chạy trên `main`. Không thêm bí mật, không thêm quyền ghi.
5. **(Nhỏ) Ghim SHA thiếu chú thích tag.** `android-preview.yml:21,24,28,29,845…969,991,1008`. Thêm chú thích đúng tag (theo `android-pc-giao.md` Phần 3 mục A0): `actions/checkout` `# v7.0.1`, `actions/setup-java` `# v6.0.1`, `gradle/actions/*` `# v6.4.0`, `reactivecircus/android-emulator-runner` `# v2.38.0`, `actions/upload-artifact` `# v7.0.2`, `actions/download-artifact` `# v8.0.2`. Không đổi SHA.

## Phần 4. Tổ app làm sau khi xong

- Kiểm một lần theo `plan.md` 5.5.4 trên SHA cuối: đọc mục "Lượt sửa S1", xem video mới, đối chiếu từng mục "Đạt khi".
- Gửi QA các mốc khóa app (S1a) và bảng nhân viên (S1b), vì đụng bảo mật và số liệu.
- Trình anh trang Artifact cập nhật. Phát hành 0.2 vẫn chờ cách làm khóa ký (không cần anh dán lệnh) và lời đồng ý của anh.
