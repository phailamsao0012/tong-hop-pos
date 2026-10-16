# Kết quả App iPhone 0.11 trên PC (Codex viết, máy kiểm, CI GitHub build)

## Tiến độ
```
10-16 06:47Z bắt đầu ở C:/Users/PC/Projects/thp-app011, nhánh codex/app-0.11, 5 bước
10-16 06:47Z bước 1/5 W1 bắt đầu: API staff-detail và rateTop/rateDen trong overview
10-16 06:47Z tài khoản 1 hết lượt, dùng lại lúc 08:13Z
10-16 06:47Z 🔄 đổi sang tài khoản 2
10-16 06:53Z ✅ W1 xong (8952697), máy kiểm typecheck + test ngoài sandbox đạt
10-16 06:53Z bước 2/5 M1 bắt đầu: Marketing có dải chọn POS, Tách theo xếp được như web
10-16 06:54Z M1: đã đẩy aba232d, chờ CI (iOS)
10-16 07:00Z ✅ M1 xong, CI xanh (aba232d)
10-16 07:00Z bước 3/5 M2 bắt đầu: Khối Xếp hạng marketer giống web
10-16 07:05Z M2: đã đẩy 36e894b, chờ CI (iOS)
10-16 07:11Z ✅ M2 xong, CI xanh (36e894b)
10-16 07:11Z bước 4/5 N1 bắt đầu: Trang chi tiết một nhân viên, sửa phân số tỷ lệ chốt
10-16 07:16Z N1: đã đẩy ede0f8a, chờ CI (iOS)
10-16 07:22Z ✅ N1 xong, CI xanh (ede0f8a)
10-16 07:22Z bước 5/5 T1 bắt đầu: Lượt quay 14, đối chiếu API trong CI, số bản 0.11
10-16 07:30Z T1: đã đẩy 30adf48, chờ CI (iOS + iOS preview)
10-16 08:06Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:09Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:12Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:15Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:18Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:21Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:24Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:27Z CI: hỏi API lỗi (API 403), hỏi lại
10-16 08:31Z bắt đầu ở C:/Users/PC/Projects/thp-app011, nhánh codex/app-0.11, 7 bước
10-16 08:31Z W1 đã xong từ trước, bỏ qua
10-16 08:31Z M1 đã xong từ trước, bỏ qua
10-16 08:31Z M2 đã xong từ trước, bỏ qua
10-16 08:31Z N1 đã xong từ trước, bỏ qua
10-16 08:31Z T1 đã xong từ trước, bỏ qua
10-16 08:31Z bước 6/7 S1W bắt đầu: Sửa API staff-detail sau khi tổ app kiểm
10-16 08:34Z ✅ S1W xong (ea7c8a0), máy kiểm typecheck + test ngoài sandbox đạt
10-16 08:34Z bước 7/7 S1I bắt đầu: Sửa app và lượt quay sau khi tổ app kiểm
10-16 08:39Z S1I: đã đẩy c6695ce, chờ CI (iOS + iOS preview)
10-16 09:21Z CI: hết lượt hỏi API GitHub, chờ 11 phút
10-16 09:38Z ✅ S1I xong, CI xanh (c6695ce)
10-16 09:38Z 🏁 xong cả 7 bước

```

---

## Tóm tắt W1

### File đã đổi
- `app/api/reports/staff-detail/route.ts`: API chi tiết nhân viên; tóm tắt từ overview, trạng thái, lý do, SĐT khác nhau, ghi chú khách chia lô tối đa 45 cặp; che SĐT và ẩn số chia CSKH theo quyền.
- `lib/staff-detail.ts`: hàm thuần nhận diện/gom lý do, nhãn trạng thái, chia lô và definitions.
- `tests/staff-detail.test.ts`: test hàm thuần, đối chiếu overview cho hai rateBase, dữ liệu thiếu/sai, che SĐT, ẩn số chia và scopeApi.
- `lib/product-groups.ts`: chỉ thêm isOperationalTag.
- `lib/access.ts`: chỉ thêm VIEW_GATES cho API mới.
- `lib/overview-report.ts`, `lib/overview-rates.ts`: thêm rateTop/rateDen, trả null khi số chia bị ẩn và chọn assigned; giữ công thức cũ.
- `.codex-out/W1/tomtat.md`: tóm tắt này.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)
- `pnpm typecheck`: lần đầu mã 1 (tsc báo lỗi kiểu dữ liệu unknown trong test); lần sửa tiếp mã 1; hai lần cuối mã 0 sau khi sửa kiểu test.
- `pnpm test`: mã 1; cả 41 file test bị sandbox Windows chặn `spawn EPERM`, chưa thực thi các ca test. Không sửa code để né sandbox; máy kiểm cần chạy lại ngoài sandbox.
- `git diff --check`: mã 0.
- Kiểm byte của 7 file mã được phép: mã 0, LF và không BOM.
- `git status --short`, `git diff`, `git show`, đọc file: mã 0; phạm vi thay đổi đúng W1. Một số lượt `rg` gặp đường dẫn không tồn tại hoặc wildcard Windows không hỗ trợ (mã 2); đã đọc lại đúng file.
- Không build trên máy PC Windows; không có Xcode, swiftc hay máy ảo. Không chạy build, quay hoặc chụp app; CI trên GitHub phụ trách.
- Không dùng mạng, không commit, không push. Không thực hiện M1/M2/N1/T1.

### Ảnh / video (đường dẫn trong .codex-out/W1/, mỗi file một dòng nói thấy gì)
Không có: W1 là API; không chạy máy ảo.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)
Không áp dụng cho W1.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả
Không chạy: PC Windows không có máy ảo; W1 kiểm qua API và test D1 giả.

### Chỗ làm khác plan và lý do
- Chưa xác nhận test chạy thành công do sandbox chặn spawn EPERM; giữ nguyên test để máy kiểm chạy ngoài sandbox theo lời giao.
- Summary chỉ trả các trường trong hợp đồng, không trả kèm trường nội bộ overview có thể chứa số chia bị ẩn.
- Không có thay đổi phạm vi file hoặc bước công việc.

### Câu hỏi còn lại
Không có câu hỏi nghiệp vụ. Còn chờ máy kiểm xác nhận `pnpm test` ngoài sandbox; chưa có bằng chứng chạy API thực tế hoặc CI.

### Số đối chiếu
Chưa có số chạy thực tế hay log [MKT]/[NV]. Đã viết test đối chiếu: base.open = base.total − base.closed = tổng reasons.n; base.total và base.closed khớp summary theo created/assigned; orders, closedOrders, assignedOrders, closedNet khớp overview; rateTop/rateDen khớp closeRateTop/closeRateBase. Các đối chiếu này chưa thực thi vì EPERM.


---

## Tóm tắt M1
### File đã đổi
- `ios/Megatech/Megatech/MarketingView.swift`: thêm dải POS; menu 8 cách xếp ở Marketer/Team, mặc định Số; nil cuối, hòa theo số về rồi tên tiếng Việt; số đậm theo cột xếp. Khóa ba tỷ suất khi giới hạn POS, tạm xếp Số và giữ lựa chọn đã lưu. Giữ số chính, biểu đồ, Sản phẩm, Ngày.
- `ios/Megatech/Megatech/NavMemory.swift`: chỉ thêm khóa `thp_mkt_sort` vào reset khi đăng xuất.
- `ios/Megatech/Megatech/Terms.swift`: nhãn và lựa chọn xếp M1.
- `.codex-out/M1/tomtat.md`: tóm tắt bước này.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)
- Các lệnh đọc file bằng `Get-Content`, tra bằng `rg`, đọc luật bằng `git show`: mã thoát 0.
- `git status --short`: mã thoát 0; đầu bước sạch, cuối bước chỉ ba file mã M1 thay đổi.
- `git diff --stat`, `git diff -- <ba file M1>`: mã thoát 0; đã rà phạm vi và nội dung theo mục 4 giao.md.
- `git diff --check`: mã thoát 0.
- Kiểm tra byte ba file đã sửa bằng PowerShell: mã thoát 0; LF, UTF-8 không BOM.
- Không build trên máy: PC Windows không có Xcode, swiftc hay máy ảo. Không chạy build/test iOS; CI GitHub cần kiểm tra biên dịch và giao diện sau khi người chạy đẩy nhánh.

### Ảnh / video
Không có; PC không có máy ảo. CI quay theo quy trình của tổ app.

### Số 5 dòng đầu
Chưa có số chạy thực tế vì không chạy app hoặc gọi API.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả
Không chạy trên PC Windows; chưa kiểm chứng thao tác chọn POS, đổi xếp và đăng xuất trên máy ảo.

### Chỗ làm khác plan và lý do
Không khác phạm vi M1. Khi mọi khóa so sánh bằng nhau, thêm mã dòng làm khóa cuối để thứ tự ổn định. Dùng `posLimited` hiện có, bao gồm tài khoản bị giới hạn POS, để tránh xếp tỷ suất sai phạm vi chi phí.

### Câu hỏi còn lại
Không có câu hỏi nghiệp vụ. Cần CI xác nhận build và kiểm tra thao tác giao diện; chưa có kết quả CI trong lượt làm không dùng mạng này.

### Số đối chiếu
Chưa có dòng `[MKT]`, `[NV]` hay số demo để đối chiếu. Móc log và lượt quay thuộc T1, không thực hiện trong M1.


---

## Tóm tắt M2

### File đã đổi

- `ios/Megatech/Megatech/MarketingRank.swift` (mới): khối xếp hạng marketer/team, API riêng theo kỳ/POS/team, 18 cách xếp như web, 12 dòng/thu gọn, tổng từ summary, sheet chi tiết, xem riêng và Cách tính. Không giải mã recentOrders; hỗ trợ ẩn tiền.
- `ios/Megatech/Megatech/MarketingView.swift`: gắn khối dưới Tách theo, kiểm quyền marketing, nối bộ lọc và kéo tải lại.
- `ios/Megatech/Megatech/DecodeSelfTest.swift`: thêm ca đủ trường, thiếu/null, bỏ qua recentOrders và kiểm đường dẫn API.
- `ios/Megatech/Megatech/Terms.swift`: nhãn menu và sheet.
- `.codex-out/M2/tomtat.md`: bản tóm tắt này. Chỉ làm M2.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)

- `git status --short`, `git show origin/claude/project-thread-3ujeoc:AGENTS.md`, `git diff --stat`, `git diff -- <các file M2>`: mã thoát 0. Đầu bước worktree sạch; cuối bước đúng bốn file mã được phép.
- Đọc hướng dẫn và mã bằng `Get-Content`, tra cứu bằng `rg`: thành công; có một lượt `rg` mã thoát 2 do đường dẫn Design.swift không tồn tại, sau đó tìm được Panel/Segmented trong Kit.swift.
- `git diff --check` lần cuối: mã thoát 0, đã sửa dòng trắng thừa phát hiện khi rà soát.
- PowerShell kiểm bốn file mã dùng LF, không BOM: mã thoát 0.
- Không build trên máy: PC Windows không có Xcode, swiftc hoặc máy ảo. Không chạy kiểm thử Swift; các ca DecodeSelfTest đã viết nhưng chờ CI chạy. Không dùng mạng, không commit/push.

### Ảnh / video (đường dẫn trong .codex-out/M2/, mỗi file một dòng nói thấy gì)

Không có; chờ CI build và quay.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)

Chưa có log chạy app; không suy ra số demo từ mã.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả

Không chạy trên PC Windows. M2 chưa được kiểm tra giao diện trên máy ảo.

### Chỗ làm khác plan và lý do

- Không build, chạy thử, chụp/quay tại máy theo ghi thêm của người chạy; để CI kiểm tra.
- Mã hiện tại chỉ dùng khóa ẩn tiền ở HomeFeed; khối mới đọc cùng khóa đó và che cả tiền trong sheet để đáp ứng yêu cầu ẩn tiền của M2.

### Câu hỏi còn lại

Không có câu hỏi chặn triển khai. Cần CI xác nhận build, DecodeSelfTest và giao diện vì máy này không chạy được Swift/iOS.

### Số đối chiếu

Chưa có dòng [MKT]/[NV] hoặc số API demo do không chạy app và không dùng mạng. Móc log/lượt quay thuộc T1, không thêm trong M2.


---

## Tóm tắt N1

### File đã đổi
- `ios/Megatech/Megatech/StaffDetail.swift` (mới): query/API model và trang chi tiết, KPI, trạng thái, lý do, thẻ khác, lọc đơn chưa chốt, tải lại, xử lý 404 và mở danh sách đơn cũ.
- `Shared.swift`, `NavMemory.swift`: route mới, không lưu trang chứa thông tin nhân viên.
- `CskhViews.swift`, `Home.swift`: đổi sáu điểm điều hướng, giữ kỳ/POS/bộ phận/nhóm đơn/hrTeam.
- `API.swift`, `Metrics.swift`: đọc `rateTop`/`rateDen`, ưu tiên khi đủ cặp; thiếu thì giữ cách cũ.
- `DecodeSelfTest.swift`: thêm ca giải mã mới/cũ, thiếu một phần phân số, số 0, summary null, thiếu customerNote/otherTags, query và chặn lưu route.
- `Terms.swift`: thêm nhóm `StaffDetailTerms`.
- Các tên file rút gọn trên đều thuộc `ios/Megatech/Megatech/`. Không sửa bước khác.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)
- Đọc hướng dẫn, đọc nguồn bằng `Get-Content`, `git show`; `git status --short`, `git diff`, các lần `rg` hợp lệ có kết quả: mã 0.
- Một lệnh tìm dùng cú pháp ngoặc nhọn của Bash trong PowerShell: mã 1; đã đọc lại bằng đường dẫn cụ thể. Một lần `rg` dùng glob đường dẫn không được Windows hỗ trợ: báo lỗi đường dẫn; đã tìm lại bằng `-g '*.swift'`.
- `rg --files -g AGENTS.md ios`: mã 1, không có file khớp. `rg` tìm `print`/`WebView` trong file mới: mã 1, không có kết quả.
- `git diff --check`: mã 0 ở các lần kiểm, lần cuối đạt.
- Kiểm tra bằng PowerShell phạm vi N1, LF/không BOM trên 9 file, quét phần thêm để tìm SĐT/email/WebView/print: mã 0, đạt.
- Không build trên máy: PC Windows không có Xcode/swiftc/máy ảo. Không chạy test Swift hoặc thử giao diện; bộ self-test đã viết nhưng chưa thực thi. CI GitHub cần build và chạy kiểm tra sau khi người chạy đẩy mã.
- Không dùng mạng, không commit/push.

### Ảnh / video (đường dẫn trong .codex-out/N1/, mỗi file một dòng nói thấy gì)
Không có; máy không có máy ảo. CI phụ trách build và quay.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)
Chưa chạy app, không có log số demo.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả
Chưa chạy: không có máy ảo iOS trên PC Windows. Chưa xác minh trực tiếp thao tác lọc, kéo tải lại, 404 và mở đơn.

### Chỗ làm khác plan và lý do
- Repo dùng `StatusChip(name:code:)`, không có `StatusBadge`; dùng lại `StatusChip` và màu tương ứng cho thanh trạng thái.
- Tên `rateDen` cũ là thuộc tính tính cục bộ; đổi tên thành `legacyRateDen` để dành `rateDen` cho trường API, giữ cách dùng mẫu số cũ ở khối tổng hợp.
- Danh sách đơn cũ không hỗ trợ hrTeam trong `OrderQuery`; giữ hành vi cũ và thông báo sẵn có rằng danh sách chưa lọc theo team. Request chi tiết có hrTeam đầy đủ.
- Chưa có số đối chiếu chạy thật vì không dùng mạng và không có công cụ iOS; không thêm móc quay/log thuộc T1.

### Câu hỏi còn lại
- Cần CI xác nhận build, self-test và giao diện; chưa có kết quả trong lượt này.
- Danh sách đơn cũ chưa lọc hrTeam: cần tổ app xác nhận hướng xử lý ở lượt riêng nếu muốn bổ sung; N1 giữ hành vi hiện có.

### Số đối chiếu
Chưa có dòng `[MKT]`/`[NV]` từ app. Dữ liệu giả trong self-test kiểm trường hợp 13 đơn chốt theo ngày chốt nhưng phân số là 12/20, cạnh tỷ lệ máy chủ 60%; đây là ca kiểm đã viết, chưa phải kết quả chạy.


---

## Tóm tắt T1

### File đã đổi

- `ios/Megatech/Megatech/Tabs.swift`: lượt DEBUG `mktnv`, đủ thứ tự mốc Marketing/nhân viên, nhánh `MEGATECH_NV=0`, chờ tải và báo lỗi.
- `ios/Megatech/Megatech/MarketingView.swift`, `MarketingRank.swift`: móc DEBUG đổi POS, xếp hạng, mở sheet/xem riêng và log số, đường dẫn API.
- `ios/Megatech/Megatech/CskhViews.swift`, `StaffDetail.swift`: móc DEBUG mở nhân viên, cuộn, lọc lý do, mở đơn và log đối chiếu.
- `ios/Megatech/Megatech.xcodeproj/project.pbxproj`: 0.11 / 11, mỗi số đủ 4 chỗ.
- `.github/workflows/ios-preview.yml`: chỉ thêm đoạn 14 và `14-mkt-nv` trong vòng ffmpeg. Có kiểm API demo 400/404, ảnh từng mốc, đối chiếu Marketing/chi tiết nhân viên/overview; artifact bỏ các dòng đường dẫn API.
- `.codex-out/T1/`: `tomtat.md`, `kiem-tra.ps1`, `doan14.sh` phục vụ bàn giao và kiểm tra tĩnh.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)

- `git status --short`, `git show`, `git diff`, đọc file và tìm bằng `rg`: các lần đọc thành công mã 0. Có truy vấn `rg` mã 2 do glob đường dẫn Windows và mã 1 do tên file không tồn tại; đã đọc lại đúng file.
- `git diff --check`: mã 0.
- `.codex-out/T1/kiem-tra.ps1`: mã 0 ở lần cuối; xác nhận đúng phạm vi 7 file, LF/không BOM, workflow chỉ đổi đoạn 14 và tên ffmpeg, đủ 4 cặp số bản, các thay đổi Swift biến mất khi loại DEBUG. Hai lần đầu mã 1 do mốc tìm trong chính script kiểm tra; đã sửa mốc.
- `bash -n .codex-out/T1/doan14.sh`: không chạy được vì Bash không có trong PATH; PowerShell báo CommandNotFoundException (lệnh bọc trả 0, không phải kiểm cú pháp thành công).
- Gọi Git Bash bằng đường dẫn đầy đủ với `-n`: mã -1073741502, lỗi tạo signal pipe, Win32 error 5. Chưa xác nhận được cú pháp Bash bằng trình thông dịch.
- Không build trên máy Windows; không chạy Swift, máy ảo hay pnpm. Chưa có kết quả build/quay/đối chiếu CI. Không dùng mạng, không commit/push.

### Ảnh / video (đường dẫn trong .codex-out/T1/, mỗi file một dòng nói thấy gì)

Chưa có ảnh/video trên máy. Đoạn CI 14 sẽ tạo ảnh từng mốc và video `14-mkt-nv.mp4` trong artifact preview.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)

Chưa chạy app/demo nên chưa có số để chép.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả

Không chạy máy ảo trên PC Windows. Đã viết lượt quay và kiểm số cho CI; chưa thực thi.

### Chỗ làm khác plan và lý do

- Mốc `mkt-xep-khoa` dùng `confirmationDialog` chỉ trong DEBUG, cùng danh sách và điều kiện khóa của menu thật: SwiftUI Menu không cung cấp API mở bằng mã. Cần xem CI để xác nhận ba lựa chọn xám.
- Giữ nguyên hàm chẩn đoán của đoạn 12/13; mở rộng `tour_log_tail` ngay trong đoạn 14 để tuân thủ giới hạn workflow.
- Thiếu dòng nhân viên, lý do hoặc đơn cần chạm thì lượt báo lỗi; không dựng dữ liệu hay in mốc thành công giả.
- Bỏ kiểm/build trên máy theo chỉ dẫn Windows; kiểm cú pháp Bash bị sandbox chặn như ghi trên.

### Câu hỏi còn lại

- Cần máy kiểm chạy lại `bash -n`, rồi CI build và quay để xác nhận Swift, hình ảnh menu DEBUG và các số đối chiếu.
- Nếu demo trả 404, CI sẽ cảnh báo và bỏ phần nhân viên; cần chạy lại sau khi demo có API. Chưa kiểm trạng thái demo vì không dùng mạng.

### Số đối chiếu

Chưa có dòng `[MKT]`, `[NV]` thực chạy; không ghi số giả làm kết quả. CI đã được cấu hình xuất `14-mkt-api.txt`, `14-nv-api.txt` khi NV=1 và `14-mkt-nv-app.txt`, chỉ giữ khóa/mã mốc và số.


---

## Tóm tắt S1W

### File đã đổi

- `app/api/reports/staff-detail/route.ts`: sửa đủ mục 1.1–1.5.
- `tests/staff-detail.test.ts`: thêm test hồi quy S1W cho cả năm mục.
- `.codex-out/S1W/tomtat.md`: tóm tắt bước này.
- 1.1: lọc ghi chú rỗng trước khi xếp hạng; chỉ trả customerNote khi có text. Test ghi chú cũ có chữ, ghi chú mới rỗng và khách chỉ có ghi chú rỗng/khoảng trắng.
- 1.2: dùng assignedHidden của dòng overview. Test phòng ban quản trị có tên CSKH giữ số chia; phòng ban CSKH vẫn ẩn.
- 1.3: tách hai câu đếm điện thoại, lọc kỳ trong WHERE, cùng db.batch. Test đối chiếu SQL trực tiếp cho cả hai rateBase.
- 1.4: giới hạn truy vấn người dự phòng theo POS, team và unit. Test người ngoài team Sale và người ngoài POS trả tên mặc định, phòng ban null.
- 1.5: limit rỗng dùng mặc định 200. Test danh sách bằng khi không truyền limit, có hơn một đơn và không quá 200 đơn.
- Mục 2.1–2.12 thuộc S1I: không thực hiện theo phạm vi được giao.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)

- `git status --short`: 0; đầu bước sạch, cuối bước chỉ hai file mã được phép sửa.
- Đọc hướng dẫn, route, test và các file hỗ trợ bằng Get-Content; `git show origin/claude/project-thread-3ujeoc:AGENTS.md`: 0.
- `rg --files -g AGENTS.md -g '!node_modules' -g '!.*'`: 1, không tìm thấy file phù hợp.
- `pnpm typecheck`: 0, đạt.
- `pnpm test`: 1, sandbox Windows chặn spawn EPERM trước khi chạy nội dung test; chưa có kết quả kiểm thử code. Máy kiểm cần chạy lại ngoài sandbox; không sửa code vì EPERM.
- `rg -n -A 26 'function hideCskhAssigned' app/api/reports/overview/route.ts`: 0, đối chiếu luật ẩn.
- `git diff --check`, `git diff --stat`, `git diff -- app/api/reports/staff-detail/route.ts`, `git log -1 --format='%h %s'`: 0.
- Kiểm byte hai file mã và tóm tắt: LF, không BOM.
- Không build trên máy Windows; không chạy máy ảo. Không dùng mạng, commit hay push.

### Ảnh / video (đường dẫn trong .codex-out/S1W/, mỗi file một dòng nói thấy gì)

Không có; bước API, máy không có máy ảo.

### Số 5 dòng đầu (nếu bước có bảng: chép các dòng [XNK] / [TEAM] đã in; số demo, không tên, không mã người)

Không áp dụng.

### Ca máy ảo của mục 6 (nếu bước có): lệnh, kết quả

Không chạy; PC Windows không có Xcode, swiftc hay máy ảo. CI trên GitHub build và quay theo quy trình của tổ app.

### Chỗ làm khác plan và lý do

- Test chưa chạy được vì sandbox chặn spawn EPERM; typecheck đã đạt. Máy kiểm chạy lại pnpm typecheck và pnpm test ngoài sandbox.
- Không thực hiện các thao tác mạng, Telegram, commit/push hay build theo chỉ dẫn riêng của người chạy.
- Không cần sửa lib/staff-detail.ts; toàn bộ lỗi nằm trong route.

### Câu hỏi còn lại

Không có câu hỏi về cách sửa. Còn chờ máy kiểm xác nhận test ngoài sandbox, gồm test hồi quy S1W.

### Số đối chiếu

Không có dòng [MKT] hoặc [NV]: S1W chỉ sửa API và test D1 giả, không chạy app/demo.


---

## Tóm tắt S1I

### File đã đổi

Trong `ios/Megatech/Megatech/`: `StaffDetail.swift`, `MarketingView.swift`, `MarketingRank.swift`, `Terms.swift`, `CskhViews.swift`, `Tabs.swift`, `DecodeSelfTest.swift`, `Shared.swift`; và `.github/workflows/ios-preview.yml`.

- 1.1: Thuộc S1W, không sửa API/test web trong bước này.
- 1.2: Thuộc S1W, không sửa quy tắc ẩn số chia.
- 1.3: Thuộc S1W, không sửa SQL đếm.
- 1.4: Thuộc S1W, không sửa phạm vi đọc nhân viên.
- 1.5: Thuộc S1W, không sửa limit.
- 2.1: `StaffDetail.swift` cho phép `Note.text`, `group` null; `Terms.swift` bỏ ghi chú khách không có chữ. `DecodeSelfTest.swift` thêm ba ca null và kiểm kết quả; chưa chạy Swift.
- 2.2: `StaffDetail.swift` bỏ `ky-vong`; workflow đếm lý do trong `orders`, chỉ so thêm `reasons[0].n` khi hết trang. Chờ CI kiểm `loc`/`loc.n`.
- 2.3: Workflow lấy JSON trong vòng `stages14`, lưu theo số dòng MKTRQ; lấy `nv.json`, `nv-ov.json` sau `nv-tom-tat`. Python đọc file đã lưu, thiếu/sai dữ liệu báo lỗi. Chờ CI đối chiếu.
- 2.4: `MarketingView.swift` gắn sheet vào hàng Tách theo, đủ 8 lựa chọn, khóa ba mục cần mọi POS, hiện gợi ý và đợi 2 giây. Chờ ảnh `14-mkt-xep-khoa.png` của CI.
- 2.5: `Tabs.swift` kiểm đường dẫn trước chạm, đợi 1 giây giữa hai lần. Chờ video CI.
- 2.6: `CskhViews.swift` dùng chung `rankedStaff` từ `rows` cho khối xếp hạng và `nv-mo`. Chờ video CI.
- 2.7: `MarketingView.swift` không in số ngay khi đổi POS; dùng log sau tải xong. Chờ log CI.
- 2.8: `MarketingRank.swift` bỏ cơ chế tự che tiền, dùng Fmt. Đã soát diff; chờ ảnh CI.
- 2.9: `MarketingRank.swift` giữ nil cả bốn chỉ số, nil xếp cuối; self-test bổ sung null AOV/doanh thu mỗi số và hiển thị “—”. Chưa chạy Swift.
- 2.10: `Terms.swift`, `MarketingRank.swift` dùng đúng hai câu trống theo chế độ. Đã soát diff; chờ giao diện CI.
- 2.11: `MarketingRank.swift` chuyển `.team` về `.net` khi bật Theo team. Đã soát diff; chờ CI.
- 2.12: `Shared.swift` tách `StatusChip.tint(code:)`; `StaffDetail.swift` dùng mã đại diện đúng nhóm, đưa chip lên hàng đầu. Chờ ảnh CI.

### Lệnh đã chạy và kết quả (build, test, chạy thử; mã thoát từng lệnh)

- `git status --short`, `git diff --stat`, `git diff`, `git show`, `rg`: mã 0 ở các lượt kiểm cuối; thay đổi đúng 9 file cho phép.
- Đọc chỉ dẫn và mã bằng `Get-Content`: thành công; lần đọc `AGENTS.md` tại worktree báo không tồn tại, đã đọc bằng `git show` từ ref được chỉ định (mã 0).
- `git diff --check`: mã 0.
- Kiểm LF, không BOM trên 9 file: mã 0, đạt.
- Thử `bash -n` qua PATH: không tìm thấy lệnh, không có mã thoát tiến trình Bash.
- Thử `bash -n` bằng Git Bash trên khối shell quay video: mã `-1073741502`, lỗi tạo signal pipe, Win32 error 5; chưa xác nhận cú pháp bằng Bash.
- Một lệnh PowerShell sửa hàng loạt ban đầu lỗi cú pháp, mã 1, chưa sửa file; đã thay bằng các bản vá và soát lại diff.
- Không build trên máy: PC Windows không có Xcode, swiftc hoặc máy ảo. Không chạy test Swift, pnpm hay CI; không dùng mạng, commit hoặc push.

### Ảnh / video

Chưa có ảnh/video mới tại máy. Cần CI tạo và kiểm `14-mkt-xep-khoa.png`, video đoạn 14 trên commit cuối.

### Số 5 dòng đầu

Không có log chạy app mới để chép.

### Ca máy ảo của mục 6

Không chạy trên PC Windows; chờ CI build, chạy self-test và quay.

### Chỗ làm khác plan và lý do

- Chọn phương án sheet được mục 2.4 cho phép; gợi ý nằm trong List cùng 8 lựa chọn.
- Theo lời người chạy: không build/chạy máy ảo tại máy, không fetch/push hay gửi Telegram vì không dùng mạng.
- Bash bị lỗi khởi động trên Windows; không sửa code để né lỗi công cụ.

### Câu hỏi còn lại

Không cần quyết định thêm về mã. Chưa xác nhận workflow iOS/iOS preview xanh, self-test Swift, ảnh ba lựa chọn xám và đối chiếu API; máy kiểm cần chạy CI trên commit cuối.

### Số đối chiếu

Chưa có dòng `[MKT]`, `[NV]` mới vì không chạy app/demo. Không suy diễn số; CI sẽ ghi kết quả đối chiếu vào `14-mkt-api.txt`, `14-nv-api.txt`.
