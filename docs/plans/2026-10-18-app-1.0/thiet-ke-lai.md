# App iPhone 1.0.0: Codex thiết kế lại giao diện đột phá, vẽ đủ mọi màn

Tổ app viết, 18/10/2026. Lượt này **chỉ vẽ hình mẫu** (HTML tĩnh), chưa sửa code app.
Thay cho hình mẫu cũ `mau/index.html` (bị chê). Plan làm app `giao.md` **tạm dừng**: phần nhìn của nó sẽ viết lại theo hướng được chọn ở lượt này.

---

## 0. Cho thread PC (người chạy script)

- **Nhánh.** Worktree `C:\Users\PC\Projects\thp-app10` (đã có), nhánh máy `codex/app-1.0`. Đẩy fast-forward lên `claude/project-thread-avd7td`. Không force, không đẩy nhánh khác.
- **Mọi commit đẩy lên phải kết thúc bằng ` [skip ci]`**, kể cả commit vòng sửa và commit tóm tắt của script.
  - Lý do: PR #81 (nhánh này vào `main`) có thay đổi ở `ios/**`, nên GitHub chạy `iOS` và `iOS preview` (60–80 phút máy macOS) ở mọi lần đẩy nếu không có ` [skip ci]`.
- **Bước T0 (script làm, không cần Codex): bỏ U1 cũ, trả code app về 0.11.**
  - Script U cũ phải đã dừng hẳn (điều phối báo đã dừng). Việc U dở trong worktree này bỏ đi.
  - Chạy:
    ```bash
    git fetch origin
    git reset --hard origin/claude/project-thread-avd7td
    git clean -fdq -- ios .github
    git rm -rq -- ios .github && git checkout b13a044 -- ios .github
    git commit -m "App iPhone 1.0.0: trả code app về 0.11, bỏ U1 cũ (thiết kế lại) [skip ci]"
    ```
  - Kiểm `git diff --stat b13a044 HEAD -- ios .github` rỗng, rồi đẩy.
- **Sáu bước Codex, theo thứ tự:** `T1` → `T2a` → `T2b` → `T3a` → `T3b` → `T4` (mục 6). Mỗi bước một lần chạy Codex, như `chay-lien-mach.sh`.
  - Sau mỗi bước: máy kiểm (mục 7), commit, đẩy. Không phải chờ CI.
  - Máy kiểm đỏ: đưa lỗi cho Codex một vòng sửa, tối đa 3 vòng mỗi bước. Hết 3 vòng vẫn đỏ: dừng, báo điều phối.
- **Hạn mức:** tk1 hết thì tk2, tk2 hết thì chờ hồi rồi chạy tiếp. Không hỏi anh giữa chừng.
- **Lệnh cấm, vùng cấm:** như `CODEX.md` mục 4 và 5. Lượt này Codex chỉ được tạo, sửa file trong `docs/plans/2026-10-18-app-1.0/thiet-ke/`. Không cài gì, không mở trình duyệt.
- **File của script** (log, tóm tắt, đầu ra Codex) để ngoài worktree hoặc ghi vào `.git/info/exclude`, để máy kiểm không tính là file ngoài `thiet-ke/`.
- **Telegram:** báo bắt đầu, 20 phút một tin, xong hoặc dừng thì báo, bằng script.
- **Xong T4:** báo điều phối kèm commit cuối. Tổ app tự mở file, kiểm bằng mắt, đăng Artifact cho người dùng xem trên điện thoại. Thread PC không cần chụp ảnh, không cần Claude PC kiểm.

---

## 1. Người dùng nói gì (18/10)

Sau khi xem hình mẫu cũ (`docs/plans/2026-10-18-app-1.0/mau/index.html`):

> "Không ăn thua, xấu lắm" (Nam, 14:22)
>
> "Bây giờ nhé, bảo thằng codex làm ảnh full lại app mới đi, thiết kế giao diện mới đột phá hơn đi" (Nam, 14:22)

Yêu cầu gốc của anh Vũ (12:28): "Lên plan để cập nhật giao diện app lên phiên bản 1.0.0 đi. Giao diện này cũ và chưa trực quan lắm."

Lượt này cần: **thiết kế mới đột phá**, **vẽ đủ mọi màn của app** (không chỉ vài màn đầu), để người dùng xem trên iPhone và chọn hướng.

---

## 2. Hai kiểu đã bị chê: không được giống

**Bản 0.11 đang chạy** (code trong `ios/Megatech/Megatech/*.swift` ở `b13a044`):
- Dải đầu xanh đậm ở mọi tab, chữ "MEGATECH" và khẩu hiệu, không có thông tin.
- Khối xanh đậm dài ở Trang chủ dồn mọi số vào một thẻ.
- Bốn hàng chip lọc đẩy số xuống nửa dưới màn.
- Chữ xám 9–11 điểm dài khắp nơi, cỡ chữ cố định.

**Hình mẫu 1.0 cũ** (`mau/index.html`, bị chê "xấu lắm"):
- Nền xám rất nhạt, thẻ trắng phẳng viền xám mảnh, danh sách kiểu màn Cài đặt của iPhone.
- An toàn, nhạt, giống mọi app mẫu, không có điểm nhấn, không "xịn".
- Nhiều chữ, ít hình. Số to nhưng đứng một mình, không có biểu đồ đi kèm.

Thiết kế mới phải khác hẳn cả hai. Đặt cạnh nhau, người xem phải thấy ngay là app khác.

---

## 3. Đích đến: "đột phá"

Người xem là **sếp**, mở app nhiều lần mỗi ngày trên iPhone để nắm tình hình kinh doanh trong vài giây. Họ thích **biểu đồ hơn chữ**, thích giao diện **hiện đại, "xịn"**.

Thước đo khi tổ app chấm:
1. **Màn đầu gây ấn tượng trong 1 giây.** Hôm nay mở ra là một khối chính lớn có hình (biểu đồ, vòng, sóng), không phải thẻ chữ.
2. **Số nào chính cũng có hình đi kèm:** vòng tiến độ, cột, đường, thanh, dải nhiệt, bục xếp hạng.
3. **Ít chữ.** Mỗi khối tối đa một dòng phụ. Định nghĩa, cách tính, ghi chú dài vào nút (i).
4. **Có chiều sâu.** Lớp chồng, bóng mềm, kính mờ, dải màu chuyển. Không phải thẻ trắng phẳng viền xám.
5. **Màu có chủ đích.** Xanh MEGATECH `#17684B` là màu chủ. Mỗi bộ phận một màu riêng dùng xuyên suốt app (Sale, CSKH, Marketing, Vận đơn).
   - Màu bộ phận không trùng xanh chủ, xanh tăng, đỏ giảm (Sale không còn màu xanh lá như 0.11).
   - Tăng xanh, giảm đỏ, và luôn có mũi tên, không chỉ dựa vào màu.
6. **Chữ số đẹp.** Số rất to, đậm, chữ số đều cột (`font-variant-numeric: tabular-nums`). Chữ đọc được ngoài nắng: tương phản chữ ít nhất 4.5:1.
   - Số tiền viết gọn đúng như app (`Fmt` trong `ios/Megatech/WidgetShared/Format.swift`): `1,26 tỷ ₫`, `18,0 tr ₫`, `850.000 ₫`. Dấu phẩy thập phân, dấu chấm hàng nghìn (`12.345`). Chênh tỷ lệ ghi `+2,5 điểm`. Số âm dùng dấu `−`.
   - Không viết đủ `1.264.000.000 ₫`, không dùng B/M/K.
   - Phần số to; phần đơn vị (`tỷ ₫`, `%`, `đơn`) nhỏ khoảng một nửa, nhạt hơn, cùng đường chân chữ. Số chính dài nhất (`12.345 tỷ ₫`) vừa một dòng ở bề ngang 390.
7. **Một hàng lọc gọn**, chạm mở bảng chọn. Không có hàng chip dài.
8. **Chế độ tối là thật**, đẹp ngang chế độ sáng.
9. **Có chuyển động**, ghi chú trong hình: số chạy khi đổi, biểu đồ vẽ dần, khối đầu co lại khi cuộn, rung nhẹ khi chạm. Vẽ bằng CSS animation khi rẻ.

Gợi ý tham khảo (lấy tinh thần, không chép): Apple Fitness (vòng), Apple Stocks và Health (biểu đồ, kéo ngón xem từng điểm, điểm nổi bật), Revolut và Copilot Money (thẻ chính có dải màu, biểu đồ mượt), Robinhood (số lớn, đường giá), widget iPhone (lưới ô kiểu bento).

### 3.1. Chống mẫu đại trà
- Đọc Swift **chỉ để lấy nội dung**. Không giữ dạng thành phần của 0.11: `KpiCard` (ô icon màu + nhãn + số + mũi tên), `Panel` trắng, hàng chip lọc, `FunnelLine`, lưới 2 cột thẻ giống hệt nhau.
- **Mỗi hướng có một "chữ ký":** một hình chủ đạo lặp lại ở mọi màn, ghi trong Hệ thiết kế.
  - Ví dụ, được đổi: A có vòng cung phát sáng 4 màu bộ phận ôm số chính; B có ô bento với số khổng lồ cắt mép và dải màu bộ phận.
- **Mỗi màn có đúng một khối chính** chiếm ít nhất 40% màn đầu (844 điểm). Các khối sau nhỏ dần. Không có hai khối liền nhau cùng dạng.
- **Cấm:**
  - tím xanh kiểu SaaS mặc định;
  - emoji làm icon;
  - mọi thẻ cùng cỡ;
  - lưới trục biểu đồ dày;
  - chú giải dài.
- Kính mờ chỉ đặt trên lớp có màu (dải màu, đốm sáng), không đặt trên nền phẳng.

---

## 4. Ràng buộc (không được phá)

### 4.1. Làm được bằng SwiftUI iOS 17, không WebView
- Mọi thứ vẽ trong hình phải viết được bằng SwiftUI iOS 17 + Swift Charts + SF Symbols.
- **Được dùng:**
  - màu chuyển: `LinearGradient`, `RadialGradient`, `AngularGradient`; đốm màu bằng `RadialGradient` + `.blur` (thay `MeshGradient`); `.blendMode(.plusLighter)` cho phát sáng;
  - lớp và hình: `Material` (kính mờ), bóng, bo góc, `Canvas`;
  - biểu đồ: Swift Charts (`LineMark`, `AreaMark`, `BarMark`, `PointMark`, `RuleMark`, vòng `SectorMark`), `chartXSelection` (kéo ngón trên biểu đồ hiện số từng ngày như Stocks);
  - chuyển động: `contentTransition(.numericText())`, `phaseAnimator`, `keyframeAnimator`, `scrollTransition`, `visualEffect` (khối đầu co và mờ khi cuộn), `matchedGeometryEffect`, `symbolEffect(.bounce)` và `.pulse`, `sensoryFeedback`;
  - shader Metal `.colorEffect`; thanh dưới tự vẽ.
- **Không dùng (iOS 17 không có):**
  - Liquid Glass của iOS 26 (`glassEffect`, khúc xạ, viền sáng uốn theo nền);
  - `MeshGradient`, `navigationTransition(.zoom)`;
  - `symbolEffect` kiểu `.wiggle`, `.breathe`, `.rotate`;
  - `TextRenderer`, `LinePlot`, `AreaPlot`;
  - font tải về, ảnh chụp, video.
  - Trong HTML không dùng SVG `feTurbulence`, `feDisplacementMap`, `backdrop-filter: url()`.
- **Chữ:** chỉ font hệ thống, không tải font nào (kể cả Google Fonts).
  - Chữ dùng `-apple-system, "SF Pro Text", system-ui, sans-serif`.
  - Số được dùng `ui-rounded` (SF Pro Rounded) hoặc `ui-monospace` nếu hợp hướng.
- **Icon:** giống SF Symbols, ghi tên SF Symbol tương ứng ở `data-sf="..."` (mục 8).

### 4.2. Giữ khung và nội dung của app
- **Giữ 5 tab và thứ tự:** Trang chủ, Đơn hàng, Tổng quan (giữa), Phòng ban, Thêm.
  - Kiểu thanh dưới đổi tự do.
  - Tên tab đầu được đề xuất tên mới (ví dụ "Hôm nay"), ghi rõ là đề xuất.
- **Giữ cây trang:** trang nào đang mở từ đâu thì vẫn mở từ đó (lượt quay CI chạm theo đường này).
- **Giữ nội dung:** mỗi màn hiện đủ các số, danh sách, nút đang có ở 0.11. Được đổi chỗ, đổi cách vẽ, gộp vào (i), nhưng không bỏ.
- **Không bịa số mới cần API mới.** Biểu đồ phải dùng dữ liệu màn đó đã có (ghi trong `noi-dung.md`, mục 6 T1).
  - Ý tưởng hay mà cần dữ liệu mới: được vẽ, nhưng gắn nhãn `⚑ cần dữ liệu mới` ngay trên khối, tối đa 3 khối mỗi hướng.
- **Chạm số ra trang chi tiết, giữ bộ lọc** (như app hiện tại).

### 4.3. Chữ nghiệp vụ (sai là lỗi nặng)
- **Vận đơn:**
  - Dùng "Đơn chuyển đi", "Doanh số chuyển đi", "Người lên đơn".
  - Trong cả hai màn `A-van-don` và `B-van-don` (mọi khung, bảng (i), dòng "đổi gì") **không có chữ "doanh thu", "chốt", "bán hàng"**, kể cả câu phủ định hay câu kể là đã bỏ chữ.
  - App 0.11 có dòng phụ "không phải doanh thu" dưới "Doanh số chuyển đi": bỏ dòng này, thay bằng "tính riêng, không cộng vào tổng công ty" (web đã bỏ các câu phủ định này).
- Giữ tên bộ phận, tên chỉ số, tên trạng thái đơn như app 0.11.

### 4.4. Repo công khai
- Chỉ dùng tên và số minh hoạ.
  - Tên người: lấy bộ tên trong `mau/index.html` (Lê Thu Hà, Trần Minh Đức, Phạm Ngọc Anh, ...) hoặc tự đặt tên Việt phổ biến.
  - Không tên khách thật, không số liệu thật từ web.
- Số điện thoại viết dạng che: `09•• ••• 123`.
- Email viết dạng che: `ch•••@•••.vn`, kể cả ô tài khoản ở tab Thêm. Không chép email từ `mau/index.html`.

---

## 5. Danh sách màn phải vẽ (mỗi hướng đủ cả 19)

| Mã màn | Màn (các trang con trong cùng mã) | Số khung ít nhất | Code 0.11 để lấy nội dung |
|---|---|---|---|
| `dang-nhap` | Đăng nhập; mở khoá Face ID; màn khoá app; bảng duyệt đăng nhập máy khác; quét mã | 3 | `LoginView.swift`, `LoginShell.swift`, `Unlock.swift`, `LogoIntro.swift`, `Security.swift` (`LockScreen`), `Approvals.swift` |
| `hom-nay` | Tab đầu (Trang chủ) | 1 | `HomeFeed.swift` |
| `tong-quan` | Tab Tổng quan: 4 bộ phận, bảng Vận đơn | 1 | `Home.swift` (`HomeView`), `Departments.swift` (`DeptBoards`, `ShipTable`) |
| `tong-quan-so-lieu` | Tổng quan: số liệu theo kỳ, mục tiêu, nhân viên TOP 5 | 1 | `Home.swift` (`CenterBlocks`) |
| `tong-quan-pos` | Tổng quan theo POS | 1 | `Home.swift` (`OverviewView`), `Pos.swift`, `DashboardView.swift` |
| `don-hang` | Tab Đơn hàng: tìm, lọc, các bước của đơn, đơn cần lưu ý | 1 | `PipelineView.swift`, `Search.swift` |
| `chi-tiet-don` | Danh sách đơn một bước; trang một đơn; trang khách | 3 | `Shared.swift`, `PipelineView.swift` |
| `phong-ban` | Tab Phòng ban | 1 | `DeptsHome.swift` |
| `sale` | Trang Sale: so sánh, nổi bật, hiệu suất, xếp hạng, bảng | 2 | `CskhViews.swift` (`CompareView`), `Departments.swift` (`DeptPage`, `SaleContent`) |
| `nhan-vien-bang` | Bảng từng nhân viên; so cùng kỳ; data được cấp; trong ca | 4 | `StaffTable.swift`, `StaffCompare.swift`, `ShiftView.swift`, `Departments.swift` (`BatchesView`) |
| `chi-tiet-nhan-vien` | Một nhân viên: số chốt, số chia, lý do chưa chốt, đơn | 1 | `StaffDetail.swift` |
| `cskh` | Tổng quan CSKH và KPI; cuộc gọi; khách theo nhân viên; mua lại; khách lâu chưa mua | 3 | `CskhOverview.swift`, `CskhViews.swift` (gồm `CareView`) |
| `marketing` | Marketing: chi phí, chỉ số, biểu đồ, xếp hạng | 1 | `MarketingView.swift`, `MarketingRank.swift` |
| `van-don` | Vận đơn | 1 | `Departments.swift` (`VanDonView`) |
| `thong-bao` | Thông báo | 1 | `Tabs.swift` (`AlertsPage`), `HomeFeed.swift` (`AlertRow`) |
| `them` | Tab Thêm; báo cáo tháng | 2 | `Tabs.swift` (`MoreHome`), `MoreViews.swift` |
| `trang-phu` | Trang phụ của Thêm, mỗi trang phần đầu: Hồ sơ khách hàng, Báo cáo tùy chỉnh, Đơn nguồn Pancake POS, Bảo mật tài khoản, Cách tính, Cấu hình & kết nối, Nhật ký hoạt động, Cài đặt trên máy này | 4 | `Shared.swift` (`CustomerSearchView`), `MoreViews.swift`, `Security.swift`, `Metrics.swift`, `Config.swift`, `AppSettings.swift` |
| `nhan-su` | Nhân sự (mở từ Thêm): tổng quan quân số, danh sách, hồ sơ một người, sơ đồ tổ chức, duyệt thay đổi, tuyển dụng | 3 | `HRViews.swift`, `RecruitView.swift`, `Tabs.swift` (`SatelliteSection`) |
| `bo-loc-trang-thai` | Bảng chọn kỳ; bảng chọn POS/team; bảng (i); đang tải; lỗi; trống | 6 | `PeriodChips.swift`, `Pos.swift`, `HrTeam.swift`, `Kit.swift` |

- Một mã có nhiều trang hoặc trạng thái: vẽ nhiều khung iPhone trong cùng một `<section data-man>`, mỗi khung một trang, có nhãn nhỏ trên khung. Trên điện thoại xếp dọc, trên máy tính xếp ngang.
- `trang-phu`: được gộp 2 trang phụ vào một khung nếu phần đầu ngắn, miễn đủ 8 trang.
- Bảng chọn và bảng (i) vẽ là sheet nổi có tay kéo, nằm trên màn mờ phía sau.
- Màn dài: vẽ **cả trang** từ trên xuống dưới, không cắt ở màn hình đầu.

---

## 6. Các bước Codex

Một file chính: `docs/plans/2026-10-18-app-1.0/thiet-ke/index.html` (mục 8).

### T1. Đọc app, ghi nội dung, chốt hai hướng, vẽ Hôm nay
1. Đọc code các màn ở mục 5. Viết `thiet-ke/noi-dung.md`, mỗi mã màn một mục:
   - các trang con;
   - từng số (đúng chữ app), danh sách, nút, bảng chọn, (i);
   - chạm vào đâu mở trang nào;
   - dữ liệu có sẵn để vẽ biểu đồ. Ví dụ: chuỗi theo ngày/tuần/tháng từng POS (đơn, đơn chốt, doanh thu), kỳ so sánh, theo POS, theo nhân viên, `Shift` theo giờ (Trong ca), cuộc gọi theo ngày, `Pipeline` theo bước, các mức mua lại. Ghi đúng tên trường trong code.
2. Chọn **hai hướng khác hẳn nhau** (A và B). Mỗi hướng có:
   - một tên tiếng Việt ngắn;
   - 3 dòng "vì sao hướng này hợp với sếp";
   - "chữ ký" (mục 3.1).
   - Gợi ý, được đổi: **A** tối làm chủ, sang, chữ sáng trên nền xanh đen, biểu đồ phát sáng, thẻ kính. **B** sáng rực kiểu lưới ô bento, mỗi bộ phận một màu, khối bo tròn lớn, số rất to.
   - Không được là hai biến thể màu của cùng một bố cục. Khác ở bố cục khối chính, cách vẽ số, kiểu thẻ, kiểu thanh dưới.
3. Mỗi hướng có phần **Hệ thiết kế**:
   - bảng màu sáng và tối (mã hex), màu 4 bộ phận;
   - thang chữ (cỡ, độ đậm, dùng ở đâu);
   - thẻ, nút lọc, mũi tên tăng giảm, kiểu biểu đồ, thanh dưới, icon, chuyển động.
4. Dựng khung trang trưng bày, bộ icon, các hàm vẽ biểu đồ dùng chung (mục 8). Vẽ `A-hom-nay` và `B-hom-nay`.

### T2a. Hướng A: 9 màn
`dang-nhap`, `tong-quan`, `tong-quan-so-lieu`, `tong-quan-pos`, `don-hang`, `chi-tiet-don`, `phong-ban`, `sale`, `nhan-vien-bang`.

### T2b. Hướng A: 9 màn còn lại
`chi-tiet-nhan-vien`, `cskh`, `marketing`, `van-don`, `thong-bao`, `them`, `trang-phu`, `nhan-su`, `bo-loc-trang-thai`.

### T3a, T3b. Hướng B
Như T2a, T2b, cho hướng B. Được lấy nội dung, số minh hoạ từ màn A cùng mã. Bố cục phải khác A.

**Từ T2a trở đi:** chỉ đọc `noi-dung.md` và Hệ thiết kế trong `index.html`. Mở Swift chỉ để tra một chỗ (`rg`), không đọc lại cả code.
Dưới mỗi màn có 1–2 dòng "đổi gì so với app hiện tại".

### T4. Tự rà (bằng đọc mã, không mở trình duyệt)
- Đủ 19 màn × 2 hướng. Đối chiếu từng mục của `noi-dung.md`: mỗi màn đủ nội dung như 0.11.
- Chữ nghiệp vụ đúng mục 4.3. Không có số thật, email, số điện thoại (mục 4.4).
- Khổ 390: trong màn không có phần tử rộng cố định quá 390 điểm. Bảng rộng có `overflow-x: auto`. Chữ dài có cách xuống dòng hoặc cắt `…`.
- Tương phản chữ đủ ở cả sáng và tối (tính theo mã màu).
- Viết `thiet-ke/ghi-chu.md`:
  - tên hai hướng, mỗi hướng 5 điểm đột phá chính;
  - các khối `⚑ cần dữ liệu mới`;
  - chỗ nào SwiftUI làm khó và cách làm;
  - câu "chưa xem bằng mắt, tổ app xem".

---

## 7. Máy kiểm sau mỗi bước (script chạy, ngoài sandbox)

Lưu đoạn dưới thành `~/codex-viec/app-10/kiem-thiet-ke.sh` (ngoài worktree).
- Gọi bằng `bash ~/codex-viec/app-10/kiem-thiet-ke.sh "$BU"` từ gốc worktree, trong subshell. `$BU` là tên bước đang chạy (`T1`, `T2a`, ...), không phải danh sách bước.
- Đạt là mã thoát 0 và không in gì. Đỏ thì in dòng `::error::...` và thoát 1.
- Chạy được trước hoặc sau khi commit: so với commit T0, gồm cả file mới chưa theo dõi.

```bash
BUOC="${1:?T1|T2a|T2b|T3a|T3b|T4}"
D=docs/plans/2026-10-18-app-1.0/thiet-ke
F=$D/index.html
loi() { echo "::error::$1"; exit 1; }
test -f "$F" || loi "chưa có $F"
test -f "$D/noi-dung.md" || loi "chưa có $D/noi-dung.md"
# chỉ đổi file trong thư mục thiết kế (so với commit T0)
GOC=$(git log --format=%H -n1 --fixed-strings --grep='App iPhone 1.0.0: trả code app về 0.11')
[ -n "$GOC" ] || loi "không thấy commit T0"
git add -A
khac=$(git diff --cached --name-only "$GOC" | grep -v "^$D/" || true)
[ -z "$khac" ] || loi "sửa file ngoài thiet-ke/: $khac"
# dung lượng
[ "$(wc -c < "$F")" -lt 5000000 ] || loi "index.html quá 5 MB"
# không tải gì từ ngoài
ngoai=$(grep -oE '(src|href)="https?://[^"]+' "$F" || true)
[ -z "$ngoai" ] && ! grep -qE 'url\(["'\'']?https?:|@import' "$F" || loi "tải từ ngoài: $ngoai"
grep -qiE '<(iframe|object|embed|link)\b' "$F" && loi "có iframe/object/embed/link"
# không số điện thoại, không email
grep -qE '\+84 ?[0-9]|(^|[^0-9A-Za-z.])0[0-9]{9}([^0-9]|$)|(^|[^0-9A-Za-z])0[0-9]{2,3}[ .][0-9]{3}[ .][0-9]{3,4}([^0-9]|$)' "$D"/* && loi "có chuỗi giống số điện thoại"
grep -qE '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}' "$D"/* && loi "có chuỗi giống email"
# đủ màn theo bước
M1="dang-nhap tong-quan tong-quan-so-lieu tong-quan-pos don-hang chi-tiet-don phong-ban sale nhan-vien-bang"
M2="chi-tiet-nhan-vien cskh marketing van-don thong-bao them trang-phu nhan-su bo-loc-trang-thai"
ds() { for m in $2; do printf '%s-%s ' "$1" "$m"; done; }
case "$BUOC" in
  T1)  CAN="A-hom-nay B-hom-nay" ;;
  T2a) CAN="A-hom-nay B-hom-nay $(ds A "$M1")" ;;
  T2b) CAN="A-hom-nay B-hom-nay $(ds A "$M1 $M2")" ;;
  T3a) CAN="A-hom-nay B-hom-nay $(ds A "$M1 $M2") $(ds B "$M1")" ;;
  *)   CAN="A-hom-nay B-hom-nay $(ds A "$M1 $M2") $(ds B "$M1 $M2")" ;;
esac
for m in $CAN; do
  [ "$(grep -o "<section data-man=\"$m\"" "$F" | wc -l)" -eq 1 ] || loi "màn $m phải có đúng một <section data-man=\"$m\"> viết sẵn trong HTML"
  n=$(awk -v id="<section data-man=\"$m\"" 'index($0,id){on=1} on{c+=length($0)} on&&/<\/section>/{exit} END{print c+0}' "$F")
  [ "$n" -ge 4000 ] || loi "màn $m sơ sài ($n ký tự)"
done
# màn Vận đơn không dùng chữ cấm
for h in A B; do
  khoi=$(awk -v id="<section data-man=\"$h-van-don\"" 'index($0,id){on=1} on{print} on&&/<\/section>/{exit}' "$F")
  [ -z "$khoi" ] || ! printf '%s' "$khoi" | grep -qiE 'doanh thu|chốt|bán hàng' || loi "màn $h-van-don có chữ cấm (doanh thu/chốt/bán hàng)"
done
[ "$BUOC" != "T4" ] || test -f "$D/ghi-chu.md" || loi "chưa có ghi-chu.md"
exit 0
```

---

## 8. File `thiet-ke/index.html`

**Một file tự chứa.** CSS và JS viết trong file. Không tải script, ảnh, font từ ngoài. Không `<link>`, `<iframe>`.

**Cấu trúc màn (máy kiểm dựa vào đây):**
- Mỗi màn là `<section data-man="A-hom-nay" id="A-hom-nay">`. `data-man` là thuộc tính đầu tiên. Mã = hướng + mã màn ở mục 5.
- Thẻ `<section ...>` mở trên một dòng riêng, `</section>` đóng trên một dòng riêng. Không lồng `<section>` khác bên trong màn.
- Màn và chữ trong màn viết thẳng trong HTML, **không sinh bằng JS**. Mục lục, nút dùng `href="#A-hom-nay"`, không dùng `data-man`.
- Mỗi màn vẽ một lần. Sáng/tối chỉ đổi biến màu trên khung (`data-che-do="sang|toi"`), không chép HTML màn.

**Icon và biểu đồ dùng chung:**
- Icon gom một lần trong một `<svg>` ẩn đầu file: `<symbol id="i-..." data-sf="tên SF Symbol">`, khung 24, nét 1,75, đầu tròn. Mọi chỗ dùng `<use href="#i-...">`. Một bộ chung, khoảng 40 icon.
- Biểu đồ vẽ bằng vài hàm JS dùng chung (vòng, cột, đường, vùng, bục) từ mảng số ghi trên phần tử (`data-so="..."`). Mọi biểu đồ cùng nét, cùng bo góc, cùng chuyển động.
- Chuyển động chạy khi khung vào tầm nhìn (`IntersectionObserver`), tắt khi `prefers-reduced-motion`.

**Khung iPhone:**
- Màn trong khung luôn dàn đúng 390 điểm (`.man { width: 390px }`), không co giãn.
- Cả khung thu nhỏ vừa bề ngang bằng CSS `zoom`: JS đặt `khung.style.zoom = Math.min(1, (innerWidth - 32) / bềRộngKhung)` lúc tải và khi xoay máy (không dùng `transform: scale`).
- Khung bo góc như iPhone 15, có đảo động, viền mảnh. Cao theo nội dung (vẽ cả trang dài).
- Thanh trạng thái 9:41 và thanh tiêu đề dính trên (`position: sticky; top: 0`), thanh dưới dính dưới (`position: sticky; bottom: 0`).
- Một vạch mảnh có chữ "hết màn đầu" ở 844 điểm, để thấy màn đầu chứa gì.

**Trang trưng bày (người dùng xem trên iPhone, khổ 390):**
- Có `<title>Thiết kế app 1.0</title>`.
- Thanh điều khiển dính trên cùng, cao tối đa 96 điểm:
  - nút **Hướng A / Hướng B**;
  - nút **Sáng / Tối** cho khung điện thoại;
  - mục lục các màn (cuộn ngang được).
  - Đổi A↔B giữ nguyên màn đang xem. Hướng không chọn để `display: none` cho iPhone nhẹ.
- Mở trang là thấy ngay khung Hôm nay của hướng A, có tên hướng và "chữ ký" một dòng ở trên.
- Từng màn: tiêu đề, các khung, 1–2 dòng "đổi gì".
- Hệ thiết kế của hướng đang chọn để cuối trang, trong `<details>`.
- Trang không cuộn ngang. Lề hai bên ít nhất 16 điểm.
- **Màu trang trưng bày** tự theo sáng/tối của máy:
  - Màu viết bằng biến CSS ở `:root`, đổi trong `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` và `:root[data-theme="dark"] { ... }`.
  - `body` đặt nền rõ. Nút Sáng/Tối chỉ đổi khung, không đổi trang.
- **Không dùng** `alert`, `confirm`, `prompt`, `window.open`. `localStorage` chỉ để nhớ tiện, bọc `try/catch`.

---

## 9. Không làm ở lượt này
- Không sửa code app (`ios/**`), web (`app/**`, `lib/**`), `android/**`, workflow (trừ bước T0 do script làm).
- Không viết lại `giao.md`. Tổ app viết lại sau khi người dùng chọn hướng.
- Không mở PR, không merge, không phát hành.
