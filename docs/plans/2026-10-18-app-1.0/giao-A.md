# App iPhone 1.0.0: dựng giao diện hướng A "Quỹ đạo"

Tổ app viết, 18/10/2026. Codex trên PC làm hết. File này **thay phần nhìn** của `giao.md` (bản thẻ trắng, đã bị chê). Phần cách chạy, móc CI, quyền, chữ của `giao.md` vẫn giữ (mục 2).

Hình mẫu: `docs/plans/2026-10-18-app-1.0/thiet-ke/index.html`, **hướng A**, bản T6 (`645f29d`). Mở bằng trình duyệt, bấm "Hướng A", đổi Sáng/Tối. Người dùng đã xem bản này trên điện thoại.
- Số, tên trong hình là mẫu. Số trên app vẫn lấy từ API như cũ.
- Khối nào app đang có mà hình không vẽ thì **vẫn giữ**, đổi sang kiểu A. Khối hình có mà app không có dữ liệu thì **không làm** (mục 2.4).
- Hình và file này khác nhau thì làm theo file này.
- Kích thước trong hình là điểm CSS ở khổ 390, bằng điểm iOS.

Đọc kèm: `thiet-ke/ghi-chu.md` (mục "Dựng bằng SwiftUI iOS 17", "Tương phản theo mã màu"), `thiet-ke/noi-dung.md` (trường dữ liệu từng màn).

---

## 0. Cho thread PC (người chạy script)

- **Nhánh.** Worktree `C:\Users\PC\Projects\thp-app10`, nhánh máy `codex/app-1.0`. Kéo `origin/claude/project-thread-avd7td` về trước (fast-forward; đầu nhánh có file này). Đẩy fast-forward lên `claude/project-thread-avd7td`. Không đẩy nhánh khác, không force.
  - Nền code app là 0.11 (`ios/` và `.github/` đã trả về `b13a044` ở commit `b4a9ade`).
- **Mười bước, theo thứ tự:** `G1` → `G2` → … → `G10` (mục 3 đến 12). Mỗi bước một lần chạy Codex. Script commit từng bước riêng.
- **Commit của bước G không có `[skip ci]`.** Cần CI thật: sau mỗi bước, đẩy, rồi chờ **cả hai** workflow `iOS` và `iOS preview` trên đúng commit đó, như `giao.md` mục 0.
  - Đỏ: lấy tên job, bước, annotation `::error::`, 40 dòng cuối log bước đỏ, đưa Codex một vòng sửa. Tối đa 4 vòng mỗi bước. Hết 4 vòng vẫn đỏ: dừng cả lượt, báo điều phối kèm commit và lỗi.
  - Annotation bắt đầu bằng `demo:` là lỗi máy chủ demo, không sửa code vì nó.
- **PC không có Xcode.** `iOS` trên GitHub là lần build thật. Máy kiểm (mục 13) chạy trước khi đẩy.
- **Hạn mức, lệnh cấm, vùng cấm, Telegram:** như các lượt trước và `giao.md` mục 0. Không sửa `app/**`, `lib/**`, `tests/**`, `android/**`, `docs/plans/2026-10-18-app-1.0/thiet-ke/**`.
- **Xong G10:** Claude PC kiểm một lần (diff, tóm tắt 10 bước, CI xanh ở commit cuối), viết `docs/plans/2026-10-18-app-1.0/ket-qua.md`, báo điều phối kèm commit cuối. Không mở PR mới, không merge, không phát hành.

---

## 1. Người dùng muốn gì

> Anh Vũ, 18/10: "Lên plan để cập nhật giao diện app lên phiên bản 1.0.0 đi. Giao diện này cũ và chưa trực quan lắm."

> Nam, 18/10, xem mẫu thẻ trắng: "Không ăn thua, xấu lắm." Rồi: "thiết kế giao diện mới đột phá hơn đi."

Hướng A "Quỹ đạo" (đã vẽ đủ 19 màn):
- Nền xanh rêu sâu (tối) hoặc xanh bạc hà (sáng), có chiều sâu: quầng sáng màu ở góc khối chính, mép kính sáng 1 điểm, bóng mềm.
- **Chữ ký:** cung hở ôm số lớn ở Hôm nay (hôm nay so hôm qua cả ngày, cùng thang), chấm đầu cung phát sáng.
- Biểu đồ mảnh, có nhãn: đường vùng phát sáng, cặp thanh mảnh, cột 14 điểm, vòng chia đoạn, thanh chia đoạn, phễu bậc, thanh xếp hạng.
- Mỗi bộ phận một màu riêng, giữ ở mọi màn.
- Ô số 2×2 thay danh sách dài. Điều khiển kiểu iPhone: viên lọc, tấm từ đáy, segmented, hàng có biểu tượng.
- Giữ xanh MEGATECH `#17684B`. App chỉ cho sếp, SwiftUI thuần, không WebView.

---

## 2. Nguyên tắc (đọc trước mọi bước)

### 2.1. Phần của `giao.md` vẫn giữ nguyên văn

| Mục `giao.md` | Nội dung |
|---|---|
| 2.1 | Chỉ đổi giao diện: không đổi API, trạng thái, khoá lưu, quyền, điều hướng, cách tính, chữ ra của `Fmt` cũ, `Terms.swift`, dòng `print` Debug |
| 2.2 | Giữ chữ (trừ bảng 2.3 dưới đây) |
| 2.3 | Móc lượt quay CI: bảng móc, neo cuộn, cờ sẵn sàng, dòng log, "Khác phải giữ" |
| 2.4 | Viết mã: chỉ API iOS 17, không thư viện mới, luật định dạng của `ios.yml`, file mới vào `ios/Megatech/Megatech/` |
| 3.4 | Hàm `Fmt.compactMoney` và ca kiểm thử |
| 4.1 | Cơ chế `TabPage` (kéo làm mới, `refreshHost`), trừ phần nhìn (mục 4.1 file này) |
| 4.3 | Chữ của `SyncStatus.short`, VoiceOver ô đồng bộ và chuông, `.task` làm mới đồng bộ |
| 4.5 | Logic `PeriodChips`, `PosChipRow`, `ProductPill`, `HrTeamChip` thành menu/nút một viên (móc `team-mo` trên `HrTeamChip`) |
| 4.6 | Logic `HrTeamNotice` (chữ ngắn, (i), "Bỏ chọn team", móc `team-bo`) |
| 4.7, 4.8 | `SubNav`; `InfoText`, `InfoButton`, `InfoSheet` |
| 5 đến 11 | Thứ tự khối, chữ, quyền, đích chạm, móc của từng màn. **Chỉ phần nhìn** (màu, bề mặt, kiểu ô, kiểu biểu đồ) thay bằng mục 5 đến 11 của file này |
| 12.3 đến 12.6 | VoiceOver, số bản 1.0.0 build 12, lượt quay `giaodien`, đoạn 15 `ios-preview.yml` |
| 13 đến 17 | Phạm vi file (đổi tên bước U thành G), máy kiểm, không làm, sau khi xong, tóm tắt. Phần thêm và gốc so sánh của máy kiểm: mục 13 file này |

Thay hẳn bằng file này: `giao.md` mục 1, 3.5, 12.1, 12.2, 18, và **phần nhìn** của 3.1, 3.2, 3.3, 4.1 đến 4.9, 5 đến 11.

Của `giao.md` 3.1 đến 3.3 vẫn giữ:
- 3.1: khung code `Palette` (`Palette.dynamic(light, dark)`, `UIColor(rgb:)`), các màu ghi "giữ" ở mục 3.1 file này.
- 3.2: bảng trỏ tên cũ của `Theme` sang `Palette`, quy tắc `Tone`, `StatusChip.tint/bg`, `StatusStrip`, `SyncStatus.tone`.
- 3.3: bảng đổi cỡ chữ cố định sang kiểu chữ hệ thống. Riêng số lớn theo mục 3.3 file này (phông tròn).

Của `giao.md` 3.5, 4.5, 4.8, 4.9 vẫn giữ **chữ ký và hành vi** của mọi thành phần: tham số, VoiceOver, Giảm chuyển động, chạm, `.loadingPlaceholder`, `.rolling`. Việc này áp cả cho thành phần `giao.md` gọi là "mới", **chưa có trong code 0.11**: `cardSurface`, `DeltaPill`, `StatCell`, `StatusPill`, `IconSquare`, `GroupTitle`, `KpiCard(unit:money:)`, `SectionHead(subtitle:info:)`, `Pill`, `FilterBar`, `ProductPill`, `InfoText`, `InfoButton`, `InfoSheet`, `ListRow`, `ListGroup`. Phần nhìn thay bằng mục 3.5 file này. Chỗ file này ghi chữ ký khác thì theo file này.

### 2.2. Đổi tên bước

`giao.md` gọi U1…U10, file này gọi G1…G10, cùng phạm vi file (`giao.md` mục 13, cộng phần thêm ở mục 13 file này). Commit: `App iPhone 1.0.0 G<n>: <tên bước> (Codex viết trên PC, máy kiểm)`.

### 2.3. Bảng đổi chữ (thêm vào `giao.md` mục 2.5, bảng đó vẫn áp dụng)

Luật chữ Vận đơn: không "doanh thu", "chốt", "bán hàng" trên màn Vận đơn, kể cả câu phủ định.

| Chỗ (bản 0.11) | Cũ | Mới | Bước |
|---|---|---|---|
| `HomeFeed.swift:274` (dòng phụ thẻ Vận đơn hôm nay) | không phải doanh thu, không cộng vào doanh thu | Tính riêng, không cộng vào tổng công ty | G3 |
| `HomeFeed.swift:375`, `:380` (`vdExplain`, câu thứ hai) | Vận đơn không bán hàng, không chốt đơn: đây là doanh số chuyển đi, không phải doanh thu, không cộng vào doanh thu công ty hay doanh thu Sale, CSKH, MKT. | Đây là doanh số chuyển đi, tính riêng, không cộng vào tổng công ty hay số của Sale, CSKH, MKT. | G3 |
| `Departments.swift:119`, `:121` (`CompanyDept.vanDonDefinition`, câu đầu) | Vận đơn không bán hàng nên không có doanh thu. | Vận đơn tính riêng, không cộng vào tổng công ty. | G4 |
| `Departments.swift:119`, `:121` (cùng chuỗi, đoạn "Doanh số chuyển đi = …") | không cộng phí ship, không cộng vào doanh thu. | không cộng phí ship, không cộng vào tổng công ty. | G4 |
| `Departments.swift:649` (ghi chú ô Doanh số chuyển đi) | theo ngày gửi hàng · không phải doanh thu / tiền các đơn chuyển đi · không phải doanh thu | theo ngày gửi hàng · tính riêng / tiền các đơn chuyển đi · tính riêng | G8 |
| `giao.md` 2.2, câu luôn để trên màn ở Vận đơn | "Không phải doanh thu, không cộng vào doanh thu" | "Tính riêng, không cộng vào tổng công ty" | theo chỗ |

Chú thích code (`///`, `//`) không đổi. Chuỗi khác ngoài bảng này giữ nguyên văn.

### 2.4. Chỉ vẽ cái dữ liệu có

Hình A có nhiều khối so sánh. Trong app, chỉ vẽ khi view đang có số đó ở bản 0.11 (tên trường xem `thiet-ke/noi-dung.md`):
- **Cặp thanh "kỳ trước / kỳ này" và viên chênh lệch:** chỉ khi có số kỳ trước (ví dụ `mkt.prev`, `MktAnalytics.prev`, `StaffDetailReport.previousSummary`, `compare.total`, `PancakeRef.previous`, số "cùng giờ hôm qua" ở Hôm nay). Bảng 4 bộ phận ở Tổng quan (`/api/reports/sections`) **không có kỳ trước**: không vẽ cặp thanh, không vẽ viên ở đó.
- **Đường vùng:** chỉ từ chuỗi có thật (`series`, `timeline`, `bucket`, chuỗi ngày, chuỗi tháng). Không dựng chuỗi từ một tổng. Nét đứt kỳ trước chỉ khi có chuỗi kỳ trước.
- **Thanh tiến độ trong ô số:** chỉ khi có mẫu số hoặc mục tiêu thật.
- **Vòng, thanh chia đoạn:** chỉ khi các phần cộng lại đúng bằng tổng (không ghép các bộ phận giao nhau thành 100%).
- Không có dữ liệu thì bỏ hình, giữ số. Không gọi API mới, không thêm tham số.

### 2.5. API iOS (thêm vào `giao.md` 2.4)

- Được dùng (iOS 17): `Charts` (`LineMark`, `AreaMark`, `BarMark`, `PointMark`, `RuleMark`, `SectorMark`, `chartXSelection`), `Canvas`, `Path`, `trim`, `RadialGradient`, `LinearGradient`, `.blur`, `Material`, `phaseAnimator`, `keyframeAnimator`, `scrollTransition`, `visualEffect`, `contentTransition(.numericText())`, `sensoryFeedback`, `UnevenRoundedRectangle`.
- Không dùng: `MeshGradient`, `glassEffect`, `GlassEffectContainer`, `.buttonStyle(.glass)`, `.glassProminent`, `navigationTransition`, `matchedTransitionSource`, `symbolEffect(.wiggle|.breathe|.rotate)`, `TextRenderer`, `LinePlot`, `AreaPlot`, `Tab(`, `sidebarAdaptable`, `onScrollPhaseChange`, `onScrollVisibilityChange`, `Color.mix(with:)`, phông tải về (chỉ phông hệ thống).
- `import` được thêm: chỉ `SwiftUI`, `UIKit`, `Charts`, `Foundation`, `Observation`. Mục 4 của máy kiểm `giao.md` ("không import mới") hiểu là không import module nào khác. G1 thêm `import Charts` vào `Kit.swift`. `Palette.swift` có `import SwiftUI`, `import UIKit`. `Palette` nằm ở `Palette.swift`, không gộp vào `Theme.swift`.
- Hoạt ảnh lặp chỉ viết bằng `TimelineView(.animation(minimumInterval: FrameCap.interval, paused: reduceMotion))` (`Anim.swift`). `phaseAnimator`, `keyframeAnimator` chỉ dùng dạng có `trigger:` (chạy một lần), không dạng lặp mãi.
- Mọi hoạt ảnh tắt khi bật Giảm chuyển động (`@Environment(\.accessibilityReduceMotion)`).

---

## 3. Bước G1: bảng màu, chữ, bề mặt, thành phần

**Phạm vi G1.** G1 chỉ sửa file của dòng U1 trong bảng `giao.md` mục 13 (cộng `Palette.swift`). Ở G1: tạo `Palette`, đổi `Theme`, dựng hoặc đổi thân thành phần trong `Kit.swift`, `Anim.swift`. Mục nào dưới đây ghi **(Gn)** là quy cách cho bước sau: G1 không sửa file đó, bước Gn làm (file đó có trong phạm vi Gn, mục 13).

### 3.1. File mới `Palette.swift`

Khung như `giao.md` 3.1 (`Palette.dynamic(light, dark)`, `UIColor(rgb:)`). Màu hướng A:

| Tên (`Palette.`) | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `bg` | EDF4ED | 091F19 | nền trang |
| `card` | FFFEF9 | 18392E | thẻ |
| `cardEnd` | F7FBF5 | 18392E | điểm cuối màu chuyển của thẻ sáng |
| `wash` | DCE9DD | 244B3B | ô số, rãnh, viên lọc, segmented, nền icon hàng |
| `line` | 9CAD9D | 416153 | vạch ngăn, viền mảnh |
| `nav` | FFFEF9 | 102D24 | thanh dưới, thanh trên khi cuộn |
| `ink` | 142D22 | F5FFF8 | chữ chính |
| `muted` | 435E4E | BFD1C7 | chữ phụ, nhãn |
| `hero` | D9EBD5 | 102F24 | nền khối chính |
| `heroStart` | E6F5EA | 102F24 | màu chuyển khối chính, đầu |
| `heroEnd` | CFE9DC | 091F19 | màu chuyển khối chính, cuối |
| `heroGlow` | B9E3CE | B9E3CE (không dùng; tối thì `heroSurface` vẽ `tint.opacity(0.23)`) | quầng góc trên phải, bản sáng |
| `heroInk` | 143222 | F5FFF8 | chữ trong khối chính |
| `heroMuted` | 375640 | BFD1C7 | chữ phụ trong khối chính |
| `accent` | 17684B | B8ED8F | nét biểu đồ, cung, chấm sáng, chữ link |
| `brand` | 17684B | 17684B | nền nút chính |
| `brandTop` | 1B7554 | 1B7554 | đầu màu chuyển nút chính |
| `good` | 17643E | 8CE8B7 | tăng tốt |
| `bad` | A82C23 | FFB7AC | giảm, lỗi |
| `sale` | 944700 | FFC889 | Sale |
| `cskh` | 00637A | 7CDDF2 | CSKH |
| `mkt` | A12B59 | FFB2D0 | Marketing |
| `vandon` | 726000 | E3D887 | Vận đơn |
| `hr` | 7044A0 | D1B5FF | Nhân sự |

Giữ từ `giao.md` 3.1 (cùng mã màu): `badge`, `warn`/`warnSoft`, `info`/`infoSoft`, `purple`, `orange`, `teal`, `gray`, màu trạng thái đơn `stNew`…`stCan` (chữ và nền), huy chương, màu 6 POS (bản sáng và tối), `PosBadge` bỏ `mixed(with:)`.

Tên cũ để code đang có vẫn build: `cell` = `wash`, `fill` = `wash`, `ink2` = `muted`, `ink3` = `muted`, `ink4` = `line`, `accentSoft` = `wash`, `accentFill` = `brand`, `onFill` = trắng, `goodSoft`/`badSoft` như `giao.md`, `segSel` = `card`, `grid` = `wash`, `bar2` = `line`.

Tương phản đã kiểm ở `thiet-ke/ghi-chu.md` ("Tương phản theo mã màu"). Không tự đổi mã màu.

### 3.2. `Theme.swift`

Như `giao.md` 3.2 (giữ tên cũ, trỏ sang `Palette`), khác:
- `AccentColor.colorset`: sáng 17684B, **tối B8ED8F**.
- `brandDeep`, `brandDark` → `Palette.brand`; `cream` → `Palette.bg`; `ink` → `Palette.ink`; `inkSoft` → `Palette.muted`; `card` → `Palette.card`.
- `CompanyDept.tint`: sale → `Palette.sale`, cskh → `Palette.cskh`, mkt → `Palette.mkt`, vandon → `Palette.vandon`.
- Nhân sự dùng `Palette.hr`: phòng Nhân sự ở `DeptsHome` **(G6)**, `HRViews`, `RecruitView` **(G9)**. G1 chỉ thêm màu.
- `Tone`, `StatusChip.tint/bg`, `StatusStrip`, `SyncStatus.tone`: như `giao.md` 3.2.

### 3.3. Chữ

- Chữ thường theo kiểu chữ hệ thống (cỡ chữ của máy), bảng đổi cỡ như `giao.md` 3.3.
  - Tiêu đề khối: `.title3.weight(.bold)`.
  - Nhãn: `.subheadline.weight(.semibold)`.
  - Phụ: `.footnote` hoặc `.caption`, màu `muted`.
- **Số dùng phông tròn** (khác `giao.md`): `.system(size: N, weight: .heavy, design: .rounded)` + `.monospacedDigit()` + `.lineLimit(1)` + `.minimumScaleFactor(0.5)`. Giữ `.rolling(value)` hoặc dùng `.contentTransition(.numericText())`.

| Loại số | Cỡ số | Đơn vị |
|---|---|---|
| Số khối chính (Hôm nay, đầu trang bộ phận) | 56 | 22, `.bold`, rounded, màu `heroMuted` |
| Số thẻ (bộ phận, thẻ phụ) | 40 | 17 |
| Ô số 2×2 | 26 | 13 |
| Số trong hàng, bảng | `.callout.weight(.bold)` rounded | `.caption` |

- Đơn vị lấy từ `Fmt.compactMoney` (cỡ nhỏ, cùng đường chân chữ, cách số 3 điểm).
- `RootTabs`: `.dynamicTypeSize(...DynamicTypeSize.accessibility2)` **(G2, `Tabs.swift`)**.

### 3.4. Bề mặt (trong `Kit.swift`)

- **`heroSurface(tint: Color = Palette.accent)`**: bo 24, padding 20.
  - Tối: `LinearGradient(hero → bg, góc 155°)`. Phủ `RadialGradient(tint.opacity(0.23) → .clear)`, tâm góc trên phải, bán kính 68% bề rộng.
  - Sáng: `LinearGradient(heroStart → heroEnd, góc 145°)`. Phủ `RadialGradient(heroGlow → .clear)`, tâm góc trên phải, bán kính 72%.
  - Mép kính: viền 1 điểm `LinearGradient(trắng → trong suốt, từ trên xuống nửa thẻ)`. Tối trắng 25%, sáng trắng 100%.
  - Bóng: tối `black 20%` radius 18 y 18; sáng `#153E23 11%` radius 18 y 18.
  - Chữ bên trong dùng `heroInk`, `heroMuted`.
- **`cardSurface(radius: CGFloat = 24)`** (thay bản `giao.md`): padding do chỗ gọi.
  - Tối: nền `card`, phủ `LinearGradient(trắng 3,5% → trong suốt, 165°)`, viền trên trắng 15%, bóng `black 13%` radius 12 y 10.
  - Sáng: `LinearGradient(card → cardEnd, 150°)`, viền trên trắng, bóng `#143823 7%` radius 12 y 10.
- **`tileSurface()`**: nền `wash`, bo 18, padding 12. Không bóng.
- `Panel`, `Card`, `MiniStat`, `StatCard`: dùng `cardSurface`.
- `cardShadow()`: **chỉ đổi bóng** thành bóng của `cardSurface` (tối `black 13%` radius 12 y 10; sáng `#143823 7%` radius 12 y 10). Không thêm nền, viền hay bo góc: chỗ gọi đã tự vẽ nền.
- Nền trang: `Palette.bg`. Không ảnh nền.

### 3.5. Thành phần

Giữ tên, chữ ký và hành vi cũ (mục 2.1) để chỗ gọi vẫn build. Tham số mới thêm cuối, có mặc định. Mỗi thành phần có VoiceOver đọc đủ số (tiền đọc `Fmt.money`). Thành phần dựng ở G1 trong `Kit.swift`, `Anim.swift` (hoặc file G1 được sửa). Mục ghi **(Gn)** làm ở bước đó.

**Số và so sánh**
- **`DeltaPill(_ text: String, good: Bool? = nil, onHero: Bool = false)`** (`onHero` thay `onFill` của `giao.md`):
  - Viên bo tròn, padding 5/9, nền `wash` (trên khối chính: `heroInk` 8%).
  - Chữ `.footnote.weight(.bold)`, màu `good`/`bad`. Mũi tên `arrow.up.right` / `arrow.down.right` cỡ 11.
  - **Giữ dấu** (`+20%`, `−10%`), khác `giao.md`.
  - VoiceOver "tăng …" / "giảm …".
- **Mới `PairBars(prev: Double, prevText: String, prevLabel: String, cur: Double, curText: String, curLabel: String, tint: Color)`**:
  - Hai hàng. Mỗi hàng: nhãn `.footnote.weight(.semibold)` trái, số `.footnote.weight(.bold)` phải, rồi thanh dày 7 bo tròn.
  - Rãnh `tint` 15%. Phần tô theo `giá trị / max(prev, cur)`: kỳ trước màu `muted` 60%, kỳ này màu `tint`.
  - Cách giữa hai hàng 12.
- **Mới `OrbitArc(today: Double, yesterday: Double?, tint: Color = Palette.accent) { center }`** (chữ ký của A, chỉ ở Hôm nay):
  - Khung vuông 260 (co theo bề rộng, tối thiểu 220).
  - Hai cung cùng tâm, hở ở đáy: quét 270°, bắt đầu ở 135°.
  - Cung ngoài là hôm nay: nét 10, đầu tròn, màu `tint`, bóng `tint` 60% radius 8 (phát sáng). Rãnh cung ngoài `tint` 12%.
  - Cung trong là hôm qua cả ngày: cách cung ngoài 16, nét 3, màu `muted` 70%.
  - Cùng thang: độ dài = giá trị / max(today, yesterday).
  - Chấm 12 ở đầu cung ngoài, màu `tint`, quầng `tint` radius 10. Quầng đứng yên, không nhấp nháy.
  - Không có số hôm qua: chỉ vẽ cung ngoài đầy theo hôm nay, không cung trong.
  - Phần giữa (`center`): số rounded 56 + đơn vị. Bề rộng tối đa = 72% đường kính cung trong, để số **không chạm nét**.
  - Hoạt ảnh: `trim` từ 0 lên trong 0,9 giây `.easeOut` một lần khi xuất hiện; Giảm chuyển động thì vẽ ngay.
- **Mới `StatTile(label: String, value: String, unit: String? = nil, money: Double? = nil, progress: Double? = nil, tint: Color = Palette.accent, delta: String? = nil, deltaGood: Bool? = nil, note: String? = nil)`**:
  - `tileSurface()`. Nhãn `.footnote` `muted`, tối đa 2 dòng. Số 26 rounded + đơn vị 13.
  - Có `money`: số và đơn vị lấy từ `Fmt.compactMoney(money)`, bỏ qua `value`; VoiceOver đọc `Fmt.money(money)`.
  - Dưới số: `DeltaPill(delta, good: deltaGood)` và `note` `.caption` `muted`, cùng hiện, tự xuống dòng.
  - `progress` (chỉ khi có mẫu số thật): thanh 4 điểm, rãnh `tint` 15%, phần tô `tint`.
  - Lưới 2 cột cách 10 (`LazyVGrid` **không** dùng ở trang có neo cuộn: dùng `Grid` hoặc `HStack` lồng `VStack`).
- `KpiCard` (chữ ký `giao.md` 3.5, có `unit:` và `money:`): vẽ như `StatTile`, giữ `icon` (ô `IconSquare` 28 cạnh nhãn), ghi chú và `DeltaPill` cùng hiện, `.loadingPlaceholder`, `.rolling`.
- **Mới `StatCell(label: String, value: String, unit: String? = nil, note: String? = nil, tone: Color? = nil)`**: vẽ như `StatTile` cỡ nhỏ (số `.title3` rounded heavy).
- **Quy tắc thay ô.** Mục 5 đến 11 ghi `StatTile` ở chỗ mà ô cũ là `KpiCard`, `DeptTile`, `StatCell`, `RefCell`, `SmallStat`, `shiftStat` có ghi chú, delta, `bar:` hay chạm mở giải thích (`ExplainSheet`, `show(…)`): **giữ thành phần cũ**, chỉ đổi phần nhìn cho giống `StatTile`. Mọi ghi chú, delta, đích chạm cũ giữ nguyên.

**Biểu đồ** (màu theo bộ phận, nhãn chữ đi kèm, không chỉ phân biệt bằng màu)
- **`LineChart`** (giữ `points: [(String, Double)]`, `tint`, `height`, `highlightMax`; viết lại bằng Swift Charts):
  - Thêm tham số cuối: `value: (Double) -> String = Fmt.short` (nhãn điểm cuối và nhãn nổi), `previous: [(String, Double)]? = nil`. Chỗ gọi là tiền thì truyền hàm ghép `Fmt.compactMoney`, ở bước của file đó.
  - **Trục X là chỉ số `Int`** (`0..<points.count`), không dùng chữ nhãn làm giá trị x: nhãn ngày có thể trùng (kỳ 60 ngày có hai ngày "05"). `AxisMarks(values: [0, n/3, 2n/3, n-1])` với `AxisValueLabel { Text(points[i].0) }`, `.caption2.weight(.semibold)` `muted`. Không lưới, không trục Y.
  - `AreaMark` màu chuyển `tint` 35% (tối) / 25% (sáng) → trong suốt.
  - `LineMark` nét 2,5, `.interpolationMethod(.monotone)`, bóng `tint` 50% radius 6.
  - Điểm cuối: `PointMark` 8 điểm có quầng, nhãn `value(…)` trên điểm (`.caption.weight(.bold)`).
  - `previous` khác nil: `LineMark` nét đứt `[4, 4]`, 1,5 điểm, màu `muted` 50%. Kỳ này và kỳ trước dùng `series:` khác nhau để hai đường không nối vào nhau.
  - Cao mặc định 140.
  - Chạm hoặc kéo: `chartXSelection(value: $chon)` với `@State private var chon: Int?` → `RuleMark` dọc mảnh `muted` + `PointMark` sáng + nhãn nổi nền `card` bo 10. `.sensoryFeedback(.selection, trigger: chon)`.
- **Cột** (`BarChart` **(G7)**, cột giờ `ShiftView` **(G6)**, 5 cột "Từng bước của đơn" **(G5)**, cột vào/nghỉ Nhân sự, cột theo POS ở Báo cáo tháng **(G9)**):
  - **Mới `ColumnBar(height: CGFloat, tint: Color, width: CGFloat = 14)`** (G1, `Kit.swift`): `UnevenRoundedRectangle` bo hai góc trên 7, `LinearGradient(tint → tint 35%)` từ đỉnh xuống chân, mọc từ 0 khi xuất hiện; Giảm chuyển động thì vẽ ngay.
  - `GrowBar` (`ShiftView.swift`) đổi thân sang `ColumnBar`, giữ chữ ký **(G6)**.
  - Cột chạm được giữ `NavigationLink` hoặc `Button` riêng từng cột như cũ. Vì vậy cột vẽ bằng SwiftUI (`ColumnBar`), **không** bằng `BarMark`: dấu của Charts không bọc được `NavigationLink`. `BarMark(width: .fixed(14))` chỉ dùng cho cột không chạm, trong biểu đồ Charts (`MktChart`).
  - Số trên đầu cột `.caption2.weight(.bold)`. Tên dưới chân `.caption2` `muted`, tối đa 2 dòng, không dính nhau.
  - `PosSpark` luôn là đường (`LineChart` nhỏ), không là cột **(G4)**.
- **`Ring`** (giữ chữ ký `value`, `size`, `line`, `tint`, `label`):
  - Giữ `size` chỗ gọi truyền (có chỗ 44 trong ô nhỏ), không ép cỡ. Không chú giải.
  - Rãnh `tint` 15%, phần tô `tint`, đầu tròn, độ dày `line`. Số giữa rounded heavy cỡ `size × 0.24`.
- **Mới `SegRing(parts: [(label: String, value: Double, valueText: String, color: Color)], center: String, caption: String? = nil, size: CGFloat = 88)`**:
  - `SectorMark(angle:, innerRadius: .ratio(0.74), angularInset: 1.5)`, `cornerRadius 3`. Cỡ 76–96.
  - `center` rounded heavy giữa vòng; `caption` `.caption` `muted` dưới.
  - Chú giải bên phải: mỗi phần một hàng (chấm 7, `label` `.footnote`, `valueText` `.footnote.weight(.bold)` canh phải). Bên gọi định dạng `valueText` bằng `Fmt`.
  - **Không** đặt nhãn số sát mép vòng.
- **Mới `SplitBar(parts: [(label: String, value: Double, valueText: String, color: Color)])`**:
  - Cao 8, khe 3 giữa các phần, mỗi phần bo tròn.
  - Dưới mỗi phần: "`label` · `valueText`" `.caption`, canh theo phần đó. Phần nhỏ quá 12% thì đưa nhãn xuống hàng chú giải.
- `StackedBar` (giữ chữ ký): vẽ như `SplitBar`, chú giải giữ chữ và số như cũ.
- **`FunnelLine`** (giữ chữ ký `label`, `n`, `of`, `tint` và cách tính `n / of`): tên trái `.footnote.weight(.semibold)`, số phải `.footnote.weight(.bold)`, thanh 7 điểm dưới (rãnh `tint` 15%).
- **Phễu bậc** (Vận hành đơn, luồng đơn Marketing, luồng Vận đơn): không có thành phần mới tự tính. Dựng bằng các hàng `FunnelLine` xếp dọc cách 10; mỗi hàng giữ `of` (mẫu số cũ), màu và chạm của chỗ gọi cũ.
- **Mới `RankRow(rank: Int?, name: String, valueText: String, fraction: Double, tint: Color, highlight: Bool = false, sub: String? = nil, markers: [(Double, Color)] = []) { trailing }`** (`trailing` mặc định `EmptyView`):
  - `Avatar` chữ cái 36. `rank` nil thì không ghi hạng. `highlight` (hạng 1): viền 2 điểm `tint` + quầng.
  - "hạng · tên" `.subheadline.weight(.semibold)` và `valueText` `.subheadline.weight(.bold)` cùng một hàng, rồi `trailing` (ví dụ `DeltaPill`).
  - `sub`: `.caption` `muted` dưới tên.
  - Dưới: thanh 6 điểm, rãnh `tint` 15%, phần tô `tint`. `markers`: vạch dọc 2 điểm ở vị trí 0…1, màu cho trước (trung vị, mục tiêu).
- `Bar` (`Anim.swift`): dày 6, rãnh màu tô 15%.
- `Scatter`, `CompareChart` **(G6)**: giữ cách vẽ, đổi màu theo `Palette`, chấm có quầng nhẹ, nhãn góc `.caption2` `muted`.

**Điều khiển**
- `Segmented`:
  - Rãnh `wash` bo 12, padding 3.
  - Ô chọn nền `card`, bóng `black 13%` radius 4 y 2, chữ `ink` `.footnote.weight(.bold)`. Ô khác chữ `muted`.
  - Cao tối thiểu 36. `.isSelected`, `.sensoryFeedback(.selection, …)`.
- **`Pill`** (`giao.md` 4.5):
  - Viên cao 40, nền `wash`, bo tròn, padding 14/12.
  - Chữ `.subheadline.weight(.semibold)` `ink`. Icon đầu 15 `muted`. `chevron.down` 11 `muted`.
  - Bật: viền 1,5 `accent`, chữ `accent`.
- `FilterBar`: như `giao.md` (cuộn ngang, tràn mép), khoảng cách 8.
- `PrimaryButton` (giữ `title`, `icon`, `tint`, `action`; thêm `var role: ButtonRole? = nil` khai báo **trước** `action`):
  - Cao 50, bo 16, chữ trắng `.headline`. Bóng `#17684B 21%` radius 8 y 6. Bấm: co 0,97.
  - `tint` mặc định: nền `LinearGradient(brandTop → brand)`. `tint` khác (ví dụ `.bad` ở Đăng xuất): nền đặc `tint`.
  - `role == .destructive`: nền trong, viền 1 `bad`, chữ `bad`, không bóng.
- Nút phụ (chỗ màn cần): viền 1 `line`, chữ `ink`, cao 50, bo 16.
- **`ListRow`** (`giao.md` 4.9):
  - Icon trong ô 30 bo 10, nền `wash`, màu theo nhóm; `filledIcon: true` thì nền màu đặc, icon trắng.
  - Tiêu đề `.body`, phụ `.footnote` `muted`, giá trị phải `.callout.weight(.semibold)`, `chevron.right` 13 `muted`.
  - Cao tối thiểu 52, vạch ngăn `line` 40% thụt theo chữ.
- `ListGroup`: `cardSurface(24)`, padding trái 14.
- `SearchField` **(G5, `Search.swift`)**: cao 44, nền `wash`, bo 14, kính lúp `muted`.
- `Tag`: viên `.caption.weight(.bold)`, nền màu 16%, chữ màu.
- **Mới `StatusPill(name: String, code: Int?)`** (G1, cạnh `StatusChip` trong `Shared.swift`): chữ `StatusChip.tint(code:)`, nền màu đó 16%, viên `.caption.weight(.bold)`. `StatusChip` vẽ như `StatusPill`.
- `Avatar`: tròn, nền `wash`, chữ cái đầu màu `tint` chỗ gọi, `.system(size: size × 0.36, weight: .bold, design: .rounded)`.
- `InfoButton`: `info.circle` 18 `muted`, vùng chạm 44.

**Tấm và trạng thái**
- Tấm: `InfoSheet` (`Kit.swift`), `HrTeamSheet` **(G2)**, `CustomRangeSheet` **(G2)**, `ExplainSheet` **(G5, `Shared.swift`)**, tấm lọc khác ở bước của màn đó:
  - `.presentationDetents` như cũ, `.presentationCornerRadius(28)`, `.presentationBackground(Palette.card)`, `.presentationDragIndicator(.visible)`.
  - Nút "Xong" hoặc "Đóng" ở thanh trên của tấm. Nút áp dụng là `PrimaryButton` ở đáy.
- `CustomRangeSheet` **(G2, `CskhViews.swift` chỉ struct này)**:
  - Hàng "Từ ngày ›" / "Đến ngày ›" kiểu `ListRow`.
  - Chạm mở `DatePicker(.graphical)`, `tint` `brand`, `.environment(\.locale, Locale(identifier: "vi_VN"))`.
  - Giữ kiểm khoảng ngày cũ.
- `StateView` (giữ ba `init`, `compact`, `onDark`, `retry`, `retrying`):
  - Chỉ một dòng chữ (`text` cũ), không thêm tiêu đề.
  - Không `compact`, không `onDark`: xếp dọc, canh giữa. Lỗi: `wifi.slash` 24 trong vòng tròn 56, nét 2 `Palette.warn`; chữ `.subheadline.weight(.semibold)` `ink`; nút "Thử lại" vẽ như `PrimaryButton`, giữ `start(retry)`, `ProgressView` khi `retrying`, `.disabled(retrying)`.
  - `compact` hoặc `onDark`: giữ một hàng như cũ, icon 24, nút viên nhỏ nền `brand` (`onDark`: nền `heroInk` 12%, chữ `heroInk`).
  - Giữ `.onChange(of: DebugRetry.shared.tick)` trên gốc `StateView` (trong `#if DEBUG`).
  - Tải: `Skeleton` nền `wash`. Trống: icon `tray` trong vòng `line`, chữ cũ.
- `ThinkingLoader`: `cardSurface(24)`.

### 3.6. CI ở bước G1

`.github/workflows/ios-preview.yml`: chỉ đổi `timeout-minutes: 60` thành `timeout-minutes: 80` (như `giao.md` 3.6).

---

## 4. Bước G2: khung app

### 4.1. `TabPage` (5 tab gốc)

Giữ thanh trên ẩn ở 5 tab gốc như 0.11, tự vẽ đầu trang (theo khung đầu của mỗi màn A):

```swift
struct TabPage<Content: View>: View {
    let title: String
    var greeting: String? = nil   // dòng nhỏ trên tiêu đề (chỉ Hôm nay)
    var subtitle: String? = nil   // dòng dưới tiêu đề
    @ViewBuilder let content: Content
    // thân: ScrollView { VStack(alignment: .leading, spacing: 16) { TabHeader(...); content } .padding(.horizontal, 16) .padding(.bottom, 24) }
    //       .refreshHost(outer:) .background(Palette.bg)
    //       .navigationTitle(title)   // thanh ẩn nên không hiện; để nút quay lại của trang con ghi tên tab
    //       .toolbar(.hidden, for: .navigationBar)
}
```

- `TabHeader`:
  - Trái: `greeting` `.subheadline.weight(.semibold)` `muted` (nếu có), rồi `title` `.system(size: 34, weight: .bold)` `ink`.
  - Phải: `SyncButton`, `BellButton`, cách nhau 10.
  - Dưới: `subtitle` `.subheadline` `muted` (nếu có).
- Tiêu đề, phụ đề 5 tab: như bảng `giao.md` 4.1.
- Hôm nay:
  - `greeting` = `"\(Self.hello()) \(auth.me?.displayName ?? "MEGATECH")"` (`hello()` đã có dấu phẩy cuối).
  - `subtitle` = `Fmt.weekday()`.
  - Ở G2 xoá view `greeting` cũ (`HomeFeed.swift:62-72`, cả viên thứ ngày) và chỗ gọi nó. G3 không thêm lời chào hay thứ ngày ở chỗ khác.
- Xoá `AppHeader`. Giữ `SyncStatus`.

### 4.2. Nút đồng bộ và chuông

- **`SyncButton`**:
  - Tròn 44, nền `wash`, viền 1 `line` 50%, icon `arrow.triangle.2.circlepath` 18 `ink`.
  - Chấm 9 góc trên phải màu `sync.tone`, viền 2 `bg`.
  - Chạm mở `Route.alertsSync`. VoiceOver và `.task` làm mới như `giao.md` 4.3.
- **`BellButton`**: tròn 44 như trên, icon `bell` 18. Số đỏ góc trên phải (viên `badge`, chữ trắng `.caption2.weight(.bold)`), như `giao.md` 4.3.
- Ở G2 thêm `var short: String` vào `SyncStatus` (`Kit.swift`), chữ đúng như `giao.md` 4.3. G3 chỉ dùng nó ở dải phạm vi Hôm nay (mục 5).

### 4.3. Trang con

- `brandNav()` đổi thân:
  - `.navigationBarTitleDisplayMode(.inline)` như `giao.md` 4.2 (tiêu đề nhỏ giữa thanh, như các chỗ gọi đang ghi `.inline`; tiêu đề dài và tên người không bị cắt). Không xoá `.inline` ở chỗ gọi..
  - `.toolbarBackground(Palette.nav, for: .navigationBar)`, `.background(Palette.bg)`, `.scrollContentBackground(.hidden)` (truyền xuống `List`/`Form` con).
  - Nút quay lại của hệ thống ("‹ Tên trang trước"), `tint` `accent`.
- `PageTitle`: như `giao.md` 4.2 (không vẽ tiêu đề, chỉ phụ đề và `trailing`). Sửa `navigationTitle` lệch như `giao.md`.
- Trang `List`/`Form` hệ thống: hàng `.listRowBackground(Palette.card)`. Việc này làm ở bước của từng màn (G3 đến G9), trong phạm vi file của bước đó, không làm ở G2.

### 4.4. Thanh dưới (`RootTabs`)

- Giữ `TabView` hệ thống, 5 tab, thứ tự, `tag`, nhãn theo `giao.md` 4.4 (tab 1 "Hôm nay").
- Icon: `Reicon.tab` như cũ; tab Tổng quan `chart.bar.fill`; xoá `CenterTabIcon`.
- Màu bằng `UITabBarAppearance` trong `init()` của `RootTabs` (màu động sáng/tối):
  - nền `Palette.nav` 94% + mờ hệ thống;
  - mục chọn `accent` (icon và chữ);
  - mục khác `muted`;
  - không vạch trên.
  - Gán cho `standardAppearance` và `scrollEdgeAppearance`.
- Không tự vẽ thanh nổi ở lượt này: `TabView` giữ cách tải từng tab và móc lượt quay. Thanh nổi dạng viên để lượt sau.

### 4.5. Lọc, dải team, SubNav

- `PeriodChips`, `PosChipRow`, `ProductPill`, `HrTeamChip`: logic như `giao.md` 4.5, vẽ bằng `Pill` mới (mục 3.5).
- `PeriodChips`: **giữ `.id("other")`** trên nút "Khác…" trong `Menu`. Máy kiểm 7 so mọi `.id("…")` với bản 0.11; mất chữ này là đỏ.
- Ở G2, chỗ gọi cũ giữ nguyên chỗ (mỗi hàng một viên), như `giao.md` 4.5. Gom vào một `FilterBar` làm ở bước của từng màn (G3 đến G9).
- `HrTeamNotice`:
  - Logic như `giao.md` 4.6.
  - Khung `wash` bo 16, viền trái 3 `Palette.hr`, icon `person.2.fill` `Palette.hr`.
  - Chữ `.footnote.weight(.semibold)` `ink`. Nút "Bỏ chọn team" là viên viền `line`.
- `SubNav`: như `giao.md` 4.7, vẽ bằng `Segmented`/`Pill` mới.

### 4.6. Tiện ích khác

- `InfoText`, `InfoButton`, `InfoSheet` như `giao.md` 4.8. Tấm theo mục 3.5.
- Mới `ScopeStrip(text: String, trailing: String?, tone: Color?)`:
  - Dải cao tối thiểu 40 (`.frame(minHeight: 40)`), nền `wash`, bo 14, padding 14. Chữ được xuống dòng (`.fixedSize(horizontal: false, vertical: true)`).
  - Chữ `.footnote` `ink`. Phải `.footnote.weight(.semibold)`, có chấm màu `tone`.
  - `ScopeLine` cũ vẽ bằng `ScopeStrip` (giữ chữ).
- `OrdersHome`, `HomeView`, `DeptsHome`, `MoreHome`, `HomeFeed`: chỉ đổi chỗ gọi `TabPage` và bỏ `PageTitle` gốc ở bước này.

---

## 5. Bước G3: Hôm nay (`HomeFeed.swift`)

Khung `A-hom-nay`. Thứ tự khối, chữ, quyền, đích chạm như `giao.md` mục 5 (lời chào và thứ ngày đã làm ở G2, mục 4.1). Phần nhìn, theo đúng thứ tự:

1. **Dải phạm vi** (`ScopeStrip`):
   - Trái: dòng phạm vi cũ ("Mọi POS · từ 0h đến HH:mm" / "N POS được cấp…").
   - Phải: `SyncStatus.short` (thêm ở G2) với chấm `sync.tone`.
2. **Khối doanh thu** (`heroSurface()`):
   - Hàng đầu: "Doanh thu hôm nay" `.headline` `heroInk`; `InfoButton` (mở `totalExplain` như cũ); nút mắt (giữ `thp_hide_money`). Hai nút tròn 40, nền `heroInk` 8%.
   - `OrbitArc(today: refSum, yesterday: số hôm qua cả ngày)`.
     - Giữa: `Fmt.compactMoney(refSum)`. Ẩn tiền: "••••".
   - Dưới cung (không cắt nét): "N đơn chốt · K POS" `.subheadline` `heroMuted`, canh giữa.
   - Hàng "Hôm qua cả ngày" trái, `Fmt.shortMoney` phải (`.headline`).
   - Dòng nguồn ("Tổng cộng thống kê Pancake, cộng N POS" và biến thể) `.footnote` `heroMuted`. Cảnh báo Pancake chưa đọc được: `warn` + icon tam giác.
   - `StateView` trong khối dùng `onDark: true` như cũ.
   - Chạm khối mở `.overviewRef` như cũ.
3. **Theo bộ phận**:
   - Tiêu đề "Theo bộ phận" + `InfoButton`. Phụ đề "Xem riêng, không cộng lại · so cùng giờ hôm qua".
   - Mỗi bộ phận một `cardSurface`, viền trái 3 màu bộ phận.
     - Trái: tên màu bộ phận `.headline` + `InfoButton` nhỏ; số 40 rounded + đơn vị; "N đơn chốt" (Marketing: "N đơn đã xác nhận") `.footnote` `muted` + `DeltaPill`.
     - Phải hoặc dưới: `PairBars`, nhãn trước là nhãn so sánh cũ của bộ phận đó (Marketing: "Cùng giờ hôm qua" khi `a.previous.cutoff != nil`, không thì "Hôm qua"), nhãn sau "Giờ này", màu bộ phận. Chỉ khi có số so sánh.
   - Chạm như cũ.
4. **Cần xử lý**: tiêu đề "Cần xử lý · N" + "Xem tất cả ›". Tối đa 3 `AlertRow` (mục 10), mỗi hàng là một `cardSurface(20)`. Đang tải, trống, lỗi: chữ như cũ.
5. **Marketing hôm nay** (`cardSurface`, tiêu đề màu `mkt`, `chevron.right` mở trang):
   - Lưới 2×2: "Số về" (ghi chú "N đơn lên" như cũ, **không** thanh tiến độ), "Chi phí QC", "CP / số", "CP / đơn". Ô cũ có ghi chú thì theo "Quy tắc thay ô" (mục 3.5).
   - Ghi chú phạm vi chi phí vào `InfoButton` "Chi phí và phạm vi" (chữ nguyên văn).
   - Quy tắc "—" và "Chưa có" giữ.
6. **Vận đơn hôm nay** (`cardSurface`, tiêu đề màu `vandon`):
   - "Doanh số chuyển đi" `.footnote` `muted` trên; số 40 rounded; "N đơn chuyển đi" + (" · theo ngày gửi hàng" chỉ khi `basis == .sent`) `.footnote`.
   - `SegRing` 3 phần: còn chờ (`waiting`), đã xác nhận (`closed − waiting − failed`, như code cũ), không xác nhận được (`failed`); màu `stNew`/`stDel`/`stCan`. Giữa: `closed` (tổng đơn vào Chờ xác nhận). Chú giải 3 hàng bên phải.
   - Câu "Trong X đơn vào Chờ xác nhận hôm nay: …" và phần "; N đơn đã chuyển đi" khi `basis != .sent` giữ như `HomeFeed.swift:302`.
   - Dòng "Tính riêng, không cộng vào tổng công ty" (bảng 2.3) có `InfoButton` mở `vdExplain` (chữ `vdExplain` đổi theo bảng 2.3).
7. **Ca đang chạy**:
   - 3 ô một hàng: Số đã nhận, Số đã chốt (cả hai có `DeltaPill` so hôm qua, như `HomeFeed.swift:410-411`), Chốt nóng.
   - 3 `RankRow` người. "Xem ca ›".
8. **Lối tắt**:
   - Lưới 4 cột: ô 56 bo 18 nền `wash`, icon 24 màu nhóm (bảng màu `giao.md` mục 5 mục 7, đổi sang `Palette`).
   - Nhãn `.caption` `ink` 2 dòng, canh giữa.

Ẩn tiền, `Skeleton`, thứ tự gọi API, `.task`: như cũ.

---

## 6. Bước G4: Tổng quan

### 6.1. Đầu trang và 4 bộ phận

Khung `A-tong-quan`. Logic `giao.md` 6.1, 6.2. G4 cũng đổi chuỗi `CompanyDept.vanDonDefinition` (`Departments.swift:116-122`) theo bảng 2.3.
- `FilterBar` 4 viên. `ScopeStrip` "Đang xem: …". Dải team.
- Mỗi bộ phận (`DeptBoard`) là `cardSurface` riêng, `.id(dept.rawValue)` giữ:
  - Hàng đầu: tên màu bộ phận `.title3.weight(.bold)`, `InfoButton` (mở định nghĩa cũ), `chevron.right` khi chạm được.
  - Số chính 40 rounded (`heroMoney`), dòng ghi chú `.footnote` `muted`.
  - **Không cặp thanh, không viên** (mục 2.4: nguồn bảng không có kỳ trước).
  - Ô con (`DeptTile`, giữ thành phần, vẽ như `StatTile`) thành lưới 2×2. Bộ phận có trên 4 ô: 4 ô đầu (thứ tự cũ) vào lưới, ô còn lại thành `ListRow` (tối đa 4 hàng). Ghi chú, `bar:`, chạm giữ.
  - **CSKH:** "Tự upsell" / "Từ MKT" thành `SplitBar` 2 phần (số đơn, tiền, tỷ trọng ở nhãn), màu `cskh` / `mkt`.
  - **Marketing:** ô con giữ như cũ. Có `MktAnalytics`: Số về (ghi chú "N đơn lên"), Chi phí QC, Chi phí / số, Chi phí / đơn chốt. Không có: Đơn lên, Tỷ lệ chốt, Chi phí QC, AOV. Không thêm ô ROAS: ROAS vẫn chỉ nằm ở dòng ghi chú số chính, khi `ratios`.
  - **Vận đơn:** số "Doanh số chuyển đi", "N đơn chuyển đi". `SplitBar` theo bộ phận lên đơn (Sale / CSKH / Khác) từ `shipping`. Rồi `ShipTable`.
- `ShipTable` (bảng cuộn ngang, mục 3.5):
  - Cột đầu "Bộ phận" dính, rộng 84.
  - Ô hai dòng: số đơn `.footnote.weight(.bold)` trên, tiền `.caption2` `muted` dưới.
  - Đủ cột "Chuyển đi", "Hoàn", "% hoàn đơn · giá trị". Hàng Tổng đậm.
  - Mép phải mờ dần 24 điểm khi còn cột.
- Câu cảnh báo, "Kỳ ngắn…", "4 bảng bộ phận chưa lọc theo team." giữ, `.footnote` `warn` hoặc `muted` như cũ.

### 6.2. Số liệu theo kỳ (`CenterBlocks`)

Khung `A-tong-quan-so-lieu`. Logic `giao.md` 6.3, `.id` giữ.
- Khối đầu `heroSurface()`: "Doanh thu đơn chốt" của kỳ, số 56, `DeltaPill` (số kỳ trước của ô KPI đó). **Không** đặt đồ thị 30 ngày trong khối này.
- Thẻ "Xu hướng 30 ngày" (`Home.swift:433-448`) giữ là thẻ riêng: chữ "30 ngày gần nhất, không theo kỳ đã chọn", link "Xem chi tiết" → `.overview`, các trạng thái trống/lỗi/đang tải, dòng "Đơn chốt 30 ngày". Chỉ đổi `LineChart` sang kiểu mới.
- 6 ô KPI: `KpiCard` 2 cột (giữ ghi chú, `DeltaPill`, chạm). "Doanh thu đơn chốt" và "Giá trị TB đơn (AOV)" dùng `money:`.
- `PancakeRefCard`: `Segmented` 3 ô; `RefCell` vẽ như `StatCell`; `RefDelta` thành `DeltaPill` (giữ quy tắc của `giao.md` 6.3); thanh Online / Tại quầy là `SplitBar` (`accent` / `orange`).
- Mục tiêu tháng: `Ring` 96 + số đạt 28 rounded + "x / goal · còn y" + `Bar`.
- Trạng thái đơn: `SegRing` màu trạng thái + chú giải chạm được.
- Vận hành đơn: phễu bậc bằng các hàng `FunnelLine` (Chốt → Xuất đi → Đã nhận), mẫu số và chạm như cũ; `StatusPill` cho Đang giao / Hoàn / Hủy / Chưa xuất.
- Nhân viên (móc `nhan-vien` **giữ trên khối này**): `Segmented` "TOP 5 | Cần hỗ trợ", 5 `RankRow` màu `accent`, `sub` "a chốt / b chia".
- Mua lại & data, Khách hàng: ô `StatCell` lưới, chạm như cũ. Khách lâu chưa mua: mỗi mốc một hàng với `Bar` màu như `giao.md`.

### 6.3. Tổng quan POS (`OverviewView`, `PosTile`, `PosSpark`, `PosBreakdown`)

Khung `A-tong-quan-pos`. Logic `giao.md` 6.4.
- Khối đầu `heroSurface()`: "Doanh thu theo POS", số tổng 56, `DeltaPill` kỳ trước (khi có). `ColumnBar` mỗi POS (màu POS, số trên, tên ngắn dưới).
  - Không chép khối đầu của Số liệu theo kỳ: chủ đề trang này là từng POS.
- 4 ô KPI: `KpiCard` ("Doanh thu đơn chốt" dùng `money:`). `ReconcileLine` thành `ScopeStrip` có icon ✓ `good` / ⚠ `warn`.
- "Xu hướng doanh thu": `LineChart` kiểu mới, giữ chữ và chạm.
- Trạng thái đơn hàng: `StackedBar` (vẽ như `SplitBar`) màu trạng thái + 6 `StatusPill`, chạm như cũ.
- `PosTile`: `cardSurface`.
  - Hàng đầu: `PosBadge(28)` + tên ngắn + trạng thái đồng bộ.
  - Số 40 + `DeltaPill`; `PosSpark` là `LineChart` nhỏ (cao 48, màu POS).
  - 3 `StatCell` nhỏ "Đơn chốt" / "GTTB" / "Tỷ lệ chốt"; "Tỷ trọng N%" + `Bar` màu POS. Chạm đặt POS như cũ.

---

## 7. Bước G5: Đơn hàng và đơn

Khung `A-don-hang`, `A-chi-tiet-don`. Logic `giao.md` mục 7. G5 cũng làm `SearchField` (`Search.swift`), `ExplainSheet` và tấm lọc trong `Shared.swift` theo mục 3.5.
- Tab Đơn hàng:
  - `SearchField` mới + nút lọc tròn 44 nền `wash`.
  - `FilterBar` (Kỳ, POS, cách tính). `ScopeStrip`.
  - **"Từng bước của đơn"**: khối `heroSurface()`; 5 `ColumnBar` (Mới, Xác nhận, Giao vận, Đã giao, Trả hàng; màu `stNew`…`stRet`), số trên, tên dưới; mỗi cột giữ `NavigationLink` riêng như cũ. Không lặp lại số dưới dạng chữ hay ô.
  - Hai `KpiCard` như `giao.md` 7: "Tỷ lệ giao thành công" (ghi chú "N / M đã xuất"), "Tổng đơn chốt" (ghi chú tiền).
  - "Đơn cần lưu ý": `ListRow` có icon (`hourglass`, `shippingbox`, `arrow.uturn.backward`, `exclamationmark.triangle`) màu theo loại, số phải.
  - Danh sách đơn: `Segmented` hoặc `Pill` trạng thái; `OrderCard`.
- **`OrderCard`** (`giao.md` 7.2), mỗi thẻ là `cardSurface(20)`:
  - Hàng 1: mã đơn `.callout.weight(.bold)` `.monospaced()`; `StatusPill`; tiền phải `.callout.weight(.bold)` rounded.
  - Hàng 2: chấm màu POS + dòng cũ `.footnote` `muted`.
  - Hàng 3: dòng phụ cũ `.caption` `muted`.
  - Vạch ngăn chỉ giữa hai thẻ, không giữa hai dòng của một thẻ.
- Trang đơn (`OrderDetailView`): **giữ `List`** (`giao.md` 7).
  - Hàng đầu là khối `heroSurface()` (`.listRowBackground(Color.clear)`, `.listRowInsets(EdgeInsets())`): mã, `StatusPill`, số tiền 40.
  - Các `Section` còn lại: hàng `.listRowBackground(Palette.card)`, icon trong ô 30 như `ListRow`.
  - Lịch sử trạng thái: dòng thời gian có chấm `accent` và đường nối. "Mở trên Pancake POS" giữ.
- Trang khách (`CustomerDetailView`): khối đầu `Avatar(56)` + tên + tổng chi tiêu 40; `Segmented`; `KpiCard`; nút "Gọi điện" `PrimaryButton`, "Nhắn tin" nút phụ.
- `ExplainSheet`: số 40 rounded; nút "Xem N đơn cấu thành" `PrimaryButton`.

---

## 8. Bước G6: Phòng ban và Sale

Khung `A-phong-ban`, `A-sale`, `A-nhan-vien-bang`. Logic `giao.md` mục 8. G6 cũng làm `GrowBar` (đổi thân sang `ColumnBar`), `Scatter`, `CompareChart` theo mục 3.5, và `Palette.hr` cho phòng Nhân sự ở `DeptsHome`.
- **Phòng ban** (`DeptCard`):
  - Mỗi phòng `cardSurface(24)`, bo đều 4 góc, **không sọc trái vuông**.
  - Hàng đầu: icon trong ô 40 bo 12 nền màu phòng 16%, icon màu phòng; tên `.title3.weight(.bold)`; số chờ duyệt (viên `badge`); `chevron.right`.
  - Chú thích `.footnote` `muted`. Trang con: lưới 2 cột ô `wash` bo 14, icon 15 màu phòng + tên `.footnote.weight(.semibold)`.
  - Chỉ một kiểu mũi tên (`chevron.right`).
- **Sale / So sánh nhân viên** (`CompareView`):
  - Khối đầu, **chỉ khi `effTeam != "all"`** (như `CskhViews.swift:762`): `heroSurface(tint: effTeam == "cskh" ? Palette.cskh : Palette.sale)`, nhãn giữ "Doanh thu chốt · bộ phận Sale|CSKH", số 56, `DeltaPill`, ghi chú "N đơn chốt · nhóm X". `PairBars` kỳ trước / kỳ này khi có `compare`.
  - Rồi 4 `KpiCard` 2×2 như cũ (delta, ghi chú, ô "Tổng đơn chốt" chạm mở `Route.orders`). Khi "Tất cả": không khối đầu, chỉ 4 ô, như `giao.md` 8.3 mục 4.
  - Người tỷ lệ cao nhất (`best`): `cardSurface` có quầng màu bộ phận, `Avatar(44)` viền sáng, tỷ lệ 40. Chạm như cũ.
  - "Hiệu suất đội ngũ": `RankRow` cho 15 người, `markers` là vạch trung vị (`muted`) và mục tiêu (`good`), chú thích vạch giữ.
  - "Đơn chia vs. tỷ lệ chốt": `Scatter` màu bộ phận, chấm có quầng; người nổi bật có nhãn tên.
  - 3 `RankBlock` (móc `nv-mo`): `RankRow`.
  - Danh sách chi tiết: `Pill` "Xếp theo" + nút "Xuất Excel" phụ; hàng `RankRow` (`sub` là các số phụ cũ) + `DeltaPill` điểm ở `trailing`.
  - `StaffTableBlock` chuyển xuống cuối trang như `giao.md` 8.3 mục 10, nhưng đặt **ngoài** nhánh `if data != nil { … } else if error == nil { … }` (ngay sau nhánh đó, trước khi đóng `VStack`). Giữ điều kiện `effTeam == "sale" && canView("sale-overview")`. Bảng không phụ thuộc `data` của `CompareView` (lượt quay cuộn tới `bang-nhan-vien` sau 8 giây, không chờ). Câu chân "Cách tính" vẫn trong nhánh `data`.
- **Bảng nhân viên** (`StaffTable`, `StaffCompare`):
  - Tiêu đề cột nền `wash`, `.caption2.weight(.bold)`. Không chữ bị cắt ở tiêu đề: tiêu đề 2 dòng được.
  - Hàng cao 56, vạch `line` 40%. Hàng Tổng nền `wash`.
  - Cột đóng băng nền `card`. Mép phải mờ dần.
  - **Bề rộng cột giữ nguyên** (`giao.md` 8.4).
  - `CompareControls`: `Segmented`, `Pill` nhỏ.
  - `CompareChart`: kỳ này `accent` nét 2,5 có vùng chuyển màu, kỳ so nét đứt `muted`, cột chênh `good`/`bad`.
- **Data được cấp, Trong ca** (`BatchesView`, `ShiftView`):
  - Ô số theo "Quy tắc thay ô" (mục 3.5).
  - Trong ca: khối đầu `heroSurface()` có `Ring` tiến độ ca (`progress.0`, như cũ); "Diễn biến trong ca theo giờ" là cột `GrowBar` (đã đổi sang `ColumnBar`) có số, chạm như cũ; "Hiệu suất nhân viên" `RankRow`; "Xác nhận mới nhất" `OrderCard`.

---

## 9. Bước G7: Trang một nhân viên và CSKH

Khung `A-chi-tiet-nhan-vien`, `A-cskh`. Logic `giao.md` mục 9, móc `nv-*`, `MktNvScroll` giữ. G7 cũng làm `BarChart` (`MoreViews.swift`) theo mục 3.5 "Cột": mỗi cột `ColumnBar`, giữ `route` chạm từng cột.
- **Nhân viên** (`StaffDetail`):
  - Khối đầu `heroSurface(tint: màu bộ phận)`: `Avatar(56)` + tên `.title2.weight(.bold)` + bộ phận; `SegRing` tỷ lệ chốt (đã chốt / còn lại) với tỷ lệ giữa vòng, bên phải "top / den chia" 28 rounded + `DeltaPill` điểm + "Kỳ trước x%".
  - 4 ô 2×2 theo "Quy tắc thay ô" (quy tắc ẩn số chia giữ).
  - **Trạng thái đơn chia**: một hàng "Đã chốt" trái / "X / Y đơn" phải, `Bar` 8 điểm dưới, tất cả trong lề thẻ. Rồi `SplitBar` các trạng thái chưa chốt; chỉ "Mới" và "Hủy" chạm được.
  - **Lý do chưa chốt**: mỗi lý do một hàng có `Bar` màu loại; đang lọc nền `wash` bo 14. Chip lọc là `Pill`.
  - Đơn chưa chốt: `OrderCard`.
- **CSKH** (`CskhOverview` và các trang):
  - Khối đầu `heroSurface(tint: Palette.cskh)`: "Doanh thu CSKH", số 56, `DeltaPill` (khi có kỳ trước); `LineChart` doanh thu theo ngày màu `cskh` (khi view có chuỗi ngày, mục 2.4).
  - KPI tháng (`.id("team-cskh-kpi")`): `Ring` tiến độ màu `cskh` + số; mốc "cần đạt tới hôm nay"; 4 ô (`KpiRing` giữ thành phần, vẽ như `StatTile` có `Ring` nhỏ). Không khoảng trống quá 48 điểm.
  - Cuộc gọi (`.id("team-cskh-calls")`): `ListRow` icon `phone.fill` `cskh`.
  - Doanh thu theo nhân viên: `RankRow` màu `cskh`.
  - Các trang Cuộc gọi, Khách theo NV, Mua lại & Upsell, Khách lâu chưa mua, KPI:
    - Đầu trang là một khối `heroSurface(tint: Palette.cskh)` có số chính;
    - bộ lọc là `FilterBar` + tấm;
    - ô theo "Quy tắc thay ô"; thẻ khách `cardSurface(20)`; cột (`BarChart`) màu `cskh`.
  - **Mọi biểu đồ CSKH dùng màu `cskh`**, không lẫn `accent`.

---

## 10. Bước G8: Marketing, Vận đơn, Thông báo

Khung `A-marketing`, `A-van-don`, `A-thong-bao`. Logic `giao.md` mục 10.
- **Marketing**:
  - Khối đầu `heroSurface(tint: Palette.mkt)`: "Doanh thu MKT", số 56, `DeltaPill` so kỳ trước (`MktAnalytics.prev`); dòng phụ cũ của `MktBig` giữ ("N đơn chốt · ROAS x", ẩn ROAS khi `posLimited`; "N marketer có chi phí · kỳ trước"; "Chưa có chi phí trong kỳ…"); `LineChart` màu `mkt` từ `timeline`/`bucket` (có chọn điểm, mục 3.5).
  - "So kỳ trước": `PairBars` doanh thu MKT kỳ trước `p.net` / kỳ này `c.net`, màu `mkt`.
  - "Hiệu quả quảng cáo" (thay `CostCard` nền đặc), theo "Quy tắc thay ô":
    - Chi phí quảng cáo: `DeltaPill(good: false)` (tăng chi phí là xấu), dòng phụ cũ.
    - Số về (delta, ghi chú "N đơn lên"), Đơn chốt (delta).
    - Chi phí mỗi số, Chi phí mỗi đơn chốt (`posLimited` → "—" như cũ).
    - Mọi ô giữ nút mở `ExplainSheet` như `MarketingView.swift:212-247`.
  - `MktChart`: Swift Charts giữ. Cột "Số về" 14 điểm màu `cskh`, đường "Đơn chốt" `mkt`. Vạch chọn và nhãn nổi theo mục 3.5. **Không** `Slider`.
  - "Tách theo" (`.id("mkt-tach")`): `Segmented` 4 tab; `Pill` "Xếp theo". `MktRowView` giữ hai thanh chi phí / số về, dòng tỉ lệ, trạng thái `active`/`dim`, hạng chỉ ở tab người; chỉ đổi màu (`mkt`) và bề mặt cho giống `RankRow`.
  - Xếp hạng (`MarketingRank`, `.id("mkt-hang")`): `Segmented` "Theo team | Theo nhân viên"; `RankRow` (hạng 1 có quầng); bảng chi tiết: ô 2×2 + phễu bậc (`FunnelLine`) luồng đơn + `SplitBar` doanh thu mới / CSKH + tối đa 4 `ListRow` phụ.
- **Vận đơn** (chữ theo 2.3; trên màn không có "doanh thu", "chốt", "bán hàng"):
  - Khối đầu `heroSurface(tint: Palette.vandon)`: "Doanh số chuyển đi", số 56, dòng ghi chú cũ (`Departments.swift:649`, chữ theo bảng 2.3), "N đơn chuyển đi". Chạm khối mở `show(.sentNet)` như cũ. `SegRing` theo bộ phận lên đơn (màu bộ phận), chỉ khi các phần cộng đúng bằng tổng (mục 2.4).
  - 4 ô theo "Quy tắc thay ô": "Đơn chuyển đi", "Hoàn · x%", "Đã nhận", "Không xác nhận được"; chạm `show(…)` giữ. Móc `van-don`/`dong` giữ.
  - Luồng: phễu bậc (`FunnelLine`) màu `vandon`, mẫu số và chạm như cũ; nhãn `StatusPill`.
  - View con của Vận đơn để trong `struct VanDonView` (hàm `private`) hoặc là `private struct` trong `Departments.swift`, không chuyển sang file khác (máy kiểm 12 chỉ quét `VanDonView`).
  - "Theo người lên đơn", "Người gọi xác nhận": bảng cuộn ngang mục 3.5 (đủ cột), người có `Avatar`.
  - "Lý do không xác nhận được": `Bar` màu `warn`.
  - Dải team (móc `team-bo`) giữ.
- **Thông báo**:
  - Khối đầu `heroSurface()`: `SegRing` theo số **hàng** của `items(sync:)`. Loại suy từ `id`: `sync-*` → đồng bộ, `unconfirmed` → đơn, `over20` → khách, `hr` → nhân sự; mỗi hàng giá trị 1; chỉ loại có hàng. Giữa là `items.count` (không cộng cảnh báo ca). Chú giải bên phải. Không gọi là "chưa đọc".
  - "Cần xử lý": `AlertRow`.
  - "Trong ca": `SegRing` nhỏ 2 phần theo `s.alerts` (`level == "high"` màu `bad`, còn lại `warn`) + hàng cảnh báo. Không có cảnh báo thì bỏ vòng, giữ dòng "Không có cảnh báo trong ca."
  - "Đồng bộ Pancake" (`.id("dong-bo-pancake")`): `ListRow` `PosBadge` + tên + giờ, chấm trạng thái phải.
- **`AlertRow`**: `ListRow` icon ô 30 nền màu loại 16%, icon màu loại (bảng `giao.md` 10.4); số hoặc tuổi bên phải.

---

## 11. Bước G9: Thêm và các trang phụ

Khung `A-them`, `A-trang-phu`, `A-nhan-su`. Logic `giao.md` mục 11. G9 cũng đổi màu Nhân sự sang `Palette.hr` ở `HRViews`, `RecruitView`.
- **Thêm**:
  - Khối tài khoản `heroSurface()`: `Avatar(68)` viền 2 `accent` có quầng, tên `.title2.weight(.bold)`, vai trò `Tag`, email/chức danh như cũ.
  - `ScanLoginRow`: `ListGroup`, icon nền đặc `brand`.
  - Nhóm "Tiện ích" (giữ tên; các dòng theo quyền như `MoreHome.rows`, gồm "Tổng quan theo từng POS" khi có): lưới 2 cột ô `wash` bo 18 cao 100, icon 24 màu nhóm + tên. Số ô = số dòng; lẻ thì ô cuối rộng đủ hàng.
  - Nhóm "Cài đặt" và các nhóm còn lại: `ListGroup` + `ListRow(filledIcon: true)` (màu `giao.md` 11.1). **Mọi hàng có icon.**
  - Đăng xuất: `ListGroup` riêng, chữ `bad`.
  - Móc `team-them-*` giữ.
- **Báo cáo cuối tháng** (`MonthlyView`):
  - Khối đầu `heroSurface()`: "Tổng doanh thu", số 56, `DeltaPill`; `LineChart` cộng dồn (`DualLine`: tháng này `accent`, tháng trước nét đứt).
  - Đổi tháng ‹ › là hai nút tròn 36 nền `wash`.
  - Theo POS: `ColumnBar` màu POS có số và đơn vị.
  - Trạng thái đơn: giữ 3 ô `SmallStat` có %, vẽ như `StatCell`. Không `SplitBar` (3 nhóm không cộng đủ tổng đơn, mục 2.4).
  - "Xuất báo cáo" `PrimaryButton`.
- **Trang phụ**: `ListGroup`, `ListRow`, `StatTile`, `PrimaryButton`, tấm theo mục 3.5.
  - `SecurityView`: khối đầu là icon khiên (`checkmark.shield.fill` màu `good` khi `mfaEnabled`, `exclamationmark.shield.fill` màu `warn` khi chưa) + chữ trạng thái cũ. Không `Ring` (không có tỷ lệ). Nút nguy hiểm `PrimaryButton(role: .destructive)`.
  - `AuditView`: dòng thời gian chấm `accent`.
  - `ConfigView`: hàng POS có chấm đồng bộ.
  - Không đụng `LockScreen`, `ApprovalSheet`, `QRScanScreen` (mục 15).
- **Nhân sự** (`HRViews`, `RecruitView`, màu `Palette.hr`):
  - Khối đầu `heroSurface(tint: Palette.hr)`: "Quân số", số 56, `LineChart` chuỗi tháng (nếu có).
  - "Vào / nghỉ theo tháng": cặp `GrowBar` (đã đổi sang `ColumnBar` ở G6) rộng 7 (vào `good`, nghỉ `bad`) có chú giải.
  - Danh sách: `ListRow` + `Avatar` + `Tag` trạng thái.
  - Hồ sơ: khối đầu `Avatar(56)` + vai trò + trạng thái; thông tin là `ListGroup`.
  - Duyệt: thẻ có "Duyệt" `PrimaryButton` và "Từ chối" `PrimaryButton(role: .destructive)`.
  - Tuyển dụng: `SegRing` 4 phần gộp theo `statusOrder`: Đang xét duyệt (new + review, `muted`), Phỏng vấn (booked + interviewed, `hr`), Đã tuyển (passed + trial, `good`), Loại (failed + rejected, `bad`). Giữa là tổng ứng viên.
- `WidgetDiagnosticsView`: chỉ màu; giữ chữ "Chẩn đoán widget", "Sao chép kết quả".

---

## 12. Bước G10: rà sáng/tối, cỡ chữ, lượt quay 15, số bản 1.0.0

### 12.1. Rà màu

Trên mọi màn đã đăng nhập (trừ mục 15), tìm và thay sang token `Palette`:
- `Color.white`/`.white` làm nền, `Color.black.opacity` làm nền/viền.
- `Color(red:…)`, `Color(hex:)` ngoài màu POS, huy chương, nút chính.
- Màu hệ thống `.gray`, `.blue`, `.orange`, `.purple`, `.teal`, `.green`, `.red`.

Chữ trên `heroSurface` dùng `heroInk`/`heroMuted`.

### 12.2. Rà cỡ chữ

Như `giao.md` 12.2. Thêm ngoại lệ: số rounded heavy cỡ cố định ở mục 3.3 (đã có `minimumScaleFactor`).

### 12.3 đến 12.6

Như `giao.md` 12.3 đến 12.6: VoiceOver; `MARKETING_VERSION = 1.0.0`, `CURRENT_PROJECT_VERSION = 12`; lượt quay `MEGATECH_TOUR=giaodien`; đoạn 15 trong `ios-preview.yml` (13 mốc, sáng rồi tối).

---

## 13. Phạm vi file và máy kiểm

### 13.1. Phạm vi file

Bảng `giao.md` mục 13, đổi U thành G. Thêm:
- G1: `M/Palette.swift` (mới, có `Palette`; không gộp vào `Theme.swift`). `M/Shared.swift` thêm `StatusPill` cạnh `StatusChip`.
- G2: `M/CskhViews.swift` (chỉ `CustomRangeSheet`). `M/HomeFeed.swift` (xoá lời chào cũ, mục 4.1). `M/Kit.swift` (thêm `SyncStatus.short`).
- G4: `M/Departments.swift` thêm chuỗi `CompanyDept.vanDonDefinition` (`:116-122`, bảng 2.3).
- G6: `M/ShiftView.swift` gồm cả `GrowBar`.
- G3 đến G9 được thêm file thành phần mới trong `M/` nếu cần (ví dụ `M/Charts10.swift`). Ghi trong tóm tắt bước. Không chuyển view con của Vận đơn ra file khác (mục 10).

### 13.2. Máy kiểm

Chạy trước khi đẩy, mỗi bước. Mọi mục là `giao.md` mục 14 (1 đến 9), cộng 10 đến 13 dưới đây.

**Gốc so sánh:**
- `BASE=b13a044` **chỉ** dùng cho mục 7 (móc lượt quay so với 0.11), như `giao.md`.
- Các mục khác (1, 3 đến 6, 8 đến 13) so với **commit đầu bước** (`HEAD` lúc chạy máy kiểm, trước khi commit bước này):
  ```bash
  git add -A && git diff --cached -U0 HEAD
  ```
  `git add -A` để file mới chưa theo dõi (như `Palette.swift`) cũng được kiểm. File docs đã có trước G1 và thay đổi của bước trước không bị tính.
- Mục 8 ở G10: `ios-preview.yml` so với commit G9 (dòng `timeout-minutes` đã đổi ở G1).
- Mục 4 "không import mới": hiểu như mục 2.5 (được thêm `import` của `SwiftUI`, `UIKit`, `Charts`, `Foundation`, `Observation`).

**Thêm:**
- **10.** Không API ngoài iOS 17: diff (cách trên) không có dòng thêm khớp
  ```
  \bTab\(|sidebarAdaptable|MeshGradient|glassEffect|GlassEffect|\.glass(Prominent)?\b|navigationTransition|matchedTransitionSource|symbolEffect\([^)]*\.(wiggle|breathe|rotate)|TextRenderer|LinePlot|AreaPlot|navigationSubtitle|@Entry|onScrollGeometryChange|onScrollPhaseChange|onScrollVisibilityChange|presentationSizing|\.mix\(with
  ```
- **11.** Không phông tải về: không file `.ttf`/`.otf` mới, không `UIAppFonts`, không `Font.custom(`.
- **12.** (Từ G8.) Chữ Vận đơn: trong `VanDonView` (`Departments.swift`, từ `struct VanDonView` tới `struct` kế tiếp) không có chuỗi `"…"` chứa `doanh thu`, `chốt`, `bán hàng` (không tính dòng chú thích `//`).
  ```bash
  awk '/^struct VanDonView/{on=1;next} on&&/^struct /{on=0} on' ios/Megatech/Megatech/Departments.swift \
    | grep -v '^\s*//' | grep -oE '"[^"]*"' | grep -iE 'doanh thu|chốt|bán hàng' && { echo "::error::Vận đơn còn chữ cấm"; exit 1; }
  ```
- **13.** Không sửa `docs/plans/2026-10-18-app-1.0/thiet-ke/**`, `giao.md`, `giao-A.md`.

---

## 14. Tóm tắt mỗi bước

Như `giao.md` mục 17. Thêm `## Khác hình mẫu`: liệt kê khối hình A có mà không vẽ (lý do: không có dữ liệu, mục 2.4), và khối app có mà hình không vẽ (đã giữ, đổi kiểu).

---

## 15. Không làm ở lượt này

Như `giao.md` mục 15. Thêm:
- **Màn đăng nhập, xác minh, khoá, quét mã** theo khung `A-dang-nhap`: để lượt sau, khi app chính đã chạy ổn. Lý do: giờ hỏi Face ID phụ thuộc thời lượng logo, và CI có đoạn kiểm Face ID.
- **Thanh dưới nổi dạng viên** (khung A): lượt sau. Lượt này dùng thanh hệ thống tô màu A (mục 4.4).
- Android: theo `giao.md` mục 18, dùng bảng màu và thành phần của file này.

---

## 16. Sau khi chạy xong

Như `giao.md` mục 16:
1. Tổ app lấy ảnh `15-sang-*.png`, `15-toi-*.png`.
2. Làm một trang Artifact: từng màn app đặt cạnh khung A, sáng và tối.
3. Người dùng xem, có sửa thì tổ viết `sua-1.md`.
4. Chỉ khi anh nói "phát hành" mới merge PR #81, ra `ios-v1.0.0-12`.
