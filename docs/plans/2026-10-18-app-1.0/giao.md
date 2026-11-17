# App iPhone 1.0.0: giao diện mới (tiêu đề lớn kiểu iPhone, thẻ trắng, một hàng lọc, chế độ tối)

Tổ app viết, 18/10/2026. Codex trên PC làm hết, theo cách đã chạy lượt 0.11 (`docs/plans/2026-10-16-app-0.11/giao.md`).
Bản 1.0.0 gồm luôn mọi thứ của 0.11 (chưa phát hành): làm tiếp trên nhánh 0.11, không cắt lại từ `main`.

Hình mẫu: `docs/plans/2026-10-18-app-1.0/mau/index.html` (mở bằng trình duyệt; 8 màn; nút **Sáng / Tối**). Anh Vũ xem bản này trên điện thoại.
- Hình mẫu vẽ phần đầu của mỗi màn để chốt kiểu. Khối nào đang có trên app mà hình không vẽ thì **vẫn giữ**, đổi sang kiểu mới.
- Tên người, số trong hình là số minh họa. Số trên app vẫn lấy từ API như cũ.
- Chỗ hình mẫu và file này khác nhau thì làm theo file này (ví dụ: bảng bộ phận không có mũi tên tăng giảm, mục 6.2).

---

## 0. Cho thread PC (người chạy script)

- **Nhánh.** Worktree mới `C:\Users\PC\Projects\thp-app10`, nhánh máy `codex/app-1.0`, cắt từ `origin/claude/project-thread-avd7td` (commit chứa file này; nền là 0.11 `b13a044`).
  - Đẩy fast-forward lên `claude/project-thread-avd7td`. Không đẩy nhánh khác, không force.
  - PR #81 từ nhánh này vào `main` đang mở: mỗi lần đẩy, GitHub tự chạy `iOS` (build) và `iOS preview` (máy ảo, quay video, chụp ảnh).
- **Mười bước, theo thứ tự:** `U1` → `U2` → … → `U10`. Mỗi bước một lần chạy Codex, như `chay-lien-mach.sh`. Script commit từng bước riêng.
- **Sau mỗi bước:** đẩy, rồi chờ **cả hai** workflow `iOS` và `iOS preview` trên đúng commit đó.
  - Lý do chờ cả `iOS preview`: bước nào cũng đụng màn mà lượt quay CI chạm vào (mục 2.3). Lỗi phát hiện sớm thì biết bước nào làm vỡ.
  - Đỏ thì lấy tên job, bước và annotation `::error::` (và 40 dòng cuối log bước đỏ) đưa Codex một vòng sửa. Tối đa 4 vòng mỗi bước.
  - Hết 4 vòng vẫn đỏ: dừng cả lượt, báo điều phối kèm commit và lỗi. Không chạy bước sau trên nền đỏ.
- **Annotation bắt đầu bằng `demo:`** là lỗi của máy chủ demo, không phải của code. Không sửa code vì nó. Gặp `::warning::demo:` thì vẫn coi là xanh.
- **PC không có Xcode.** Codex không build được trên máy. `iOS` trên GitHub là lần build thật. Máy kiểm (mục 14) chạy trước khi đẩy.
- **Hạn mức:** tk1 hết thì chuyển tk2, tk2 hết thì chờ hồi rồi chạy tiếp, như các lượt trước. Không hỏi anh giữa chừng.
- **Lệnh cấm, vùng cấm:** như `CODEX.md` mục 4 và 5. Không có ngoại lệ ở lượt này: không sửa `app/**`, `lib/**`, `tests/**`, `android/**`.
- **Telegram:** báo bắt đầu, 20 phút một tin, xong hoặc dừng thì báo, bằng script như các lượt trước.
- **Xong:** Claude PC kiểm một lần (diff, tóm tắt 10 bước, CI xanh ở commit cuối), viết `docs/plans/2026-10-18-app-1.0/ket-qua.md`, rồi báo điều phối kèm commit cuối. Không mở PR mới, không merge, không phát hành.

---

## 1. Anh Vũ muốn gì (18/10)

> "Lên plan để cập nhật giao diện app lên phiên bản 1.0.0 đi. Giao diện này cũ và chưa trực quan lắm."

Đã xem toàn bộ app 0.11. Chỗ làm app thấy cũ, khó đọc:
1. **Thanh đầu xanh đậm** ở mọi tab gốc: chữ "MEGATECH" và một câu khẩu hiệu chiếm chỗ, không cho thông tin gì.
2. **Bốn hàng nút lọc** ở Tổng quan (6 chip kỳ, 7 chip POS, 3 chip nhóm đơn, chip team) đẩy số xuống nửa dưới màn.
3. **Đoạn chữ xám dài** ở khắp nơi (định nghĩa, cách tính, ghi chú team), chữ 9–11 điểm.
4. **Cỡ chữ cố định**, không theo cỡ chữ đặt trong máy. **Chế độ tối nửa vời:** thẻ vẫn trắng, chữ vẫn đen, chỉ danh sách hệ thống đổi tối.
5. **Ô chỉ số giấu ghi chú** khi có mũi tên tăng giảm (`KpiCard`, `Kit.swift:154-159`), nên nhiều ghi chú không bao giờ hiện.
6. **Thẻ xanh đậm ở Trang chủ** dồn doanh thu, bộ phận, MKT, Vận đơn vào một khối dài.

Mục tiêu bản 1.0.0:
- Kiểu iPhone hiện đại: tiêu đề lớn ở mỗi tab, thanh dưới chuẩn, thẻ trắng viền mảnh, nền xám xanh rất nhạt.
- Một hàng nút lọc gọn (Kỳ, POS, Nhóm, Team), chạm mở danh sách chọn.
- Số to, gọn ("133,4 tr ₫"); chạm (i) xem định nghĩa và số đầy đủ.
- Chữ theo cỡ chữ của máy. Chế độ tối đúng.
- Giữ xanh MEGATECH `#17684B`. App chỉ cho sếp, viết SwiftUI thuần, không WebView.

---

## 2. Nguyên tắc chung (đọc trước mọi bước)

### 2.1. Chỉ đổi giao diện

Không đổi:
- API: đường dẫn, tham số, thứ tự tham số, số lần gọi, lúc gọi (`.task`, `Freshness`, kéo để làm mới, `UnlockPrefetch`).
- Trạng thái và khóa lưu: `AppNav`, `NavMemory`, `@AppStorage`/`@SceneStorage` (`thp_*`), `CompareState`, `MetricPrefs`.
- Quyền: `canView`, `canOpen`, `posLimited`, quy tắc ẩn số chia, quy tắc chỉ chủ hệ thống.
- Điều hướng: `Route`, `AppTab`, `PageDestination`, `DeptDestination`, `.appRoutes()`, thứ tự và `tag` của 5 tab.
- Cách tính mọi số, kể cả số app tự tính (tổng Pancake, "đã xác nhận" Vận đơn, AOV, tỷ lệ, %).
- Chữ ra của các hàm `Fmt` đang có (`WidgetShared/Format.swift`). Chỉ **thêm** hàm mới (mục 3.4).
- Chuỗi trong `Terms.swift`, nhất là chuỗi `FormatSelfTest.swift` ghim.
- Mọi dòng `print` của bản Debug, mọi móc lượt quay (mục 2.3).

Mỗi bước phải tự build được. Không để bước sau sửa lỗi build của bước trước.

### 2.2. Giữ chữ

- Mọi nhãn, câu tiếng Việt trên màn **giữ đúng từng chữ**, trừ chỗ file này ghi đổi (bảng đổi chữ ở mục 2.5).
- Câu chuyển vào nút (i) giữ nguyên văn trong bảng giải thích.
- Câu ghi chú thành phụ đề thì được viết hoa chữ đầu (ví dụ "xem riêng, không cộng lại…" thành "Xem riêng, không cộng lại…").
- Luôn để ngay trên màn (không giấu vào (i)):
  - "Xem riêng, không cộng lại" ở doanh thu bộ phận.
  - "Không phải doanh thu, không cộng vào doanh thu" ở Vận đơn.
  - Câu cảnh báo màu cam (`Color.warn`), câu "… chưa lọc theo team.", "… chưa lọc được theo nhóm đơn …", "Kỳ ngắn: …".
  - Nhãn "Dữ liệu minh họa" (`Hint`).
- Quy tắc chữ Vận đơn giữ như cũ: không gọi là "doanh thu", "chốt", "bán hàng". Dùng "Đơn chuyển đi", "Doanh số chuyển đi", "Người lên đơn", "Đơn vào Chờ xác nhận".

### 2.3. Móc lượt quay CI phải giữ (đọc kỹ)

CI không chạm màn hình được. Lượt quay đi bằng `DebugTour` (`Tabs.swift:575-1128`): đổi `AppNav`, gọi `DebugTap.shared.tap("<tên>")`, chờ cờ sẵn sàng, đọc dòng log. Vỡ một móc là `iOS preview` đỏ.

**Cấm:**
- Đổi tên, xóa, chuyển đi xa chỗ có `.onChange(of: DebugTap.shared.tick)`. Mỗi móc phải nằm trên view **đang hiện** lúc lượt quay chạm.
  - Không đặt móc trong `Menu { }`, nhãn của `Menu`, sheet chưa mở, nhánh `if` đang ẩn, hay trong `ViewThatFits` (nó dựng nhiều bản, móc chạy nhiều lần).
- Đổi `VStack` thành `LazyVStack`/`LazyVGrid` ở trang có neo cuộn (neo trong vùng lười chưa dựng thì `scrollTo` không tới).
- Đổi chữ trong `.id("…")`, đổi dạng dòng log, đổi chỗ đặt cờ sẵn sàng.

**Bảng móc** (vị trí ở bản 0.11; Codex tự tìm lại sau khi sửa):

| Móc | Nằm ở | Phải hiện trên |
|---|---|---|
| `nhan-vien` (đẩy `.staffDetail` người đầu TOP 5), `.id("nhan-vien")` | `Home.swift:501-509` | Tổng quan, khối "Nhân viên" |
| `van-don`, `dong` (bảng giải thích Vận đơn) | `Departments.swift:628-639` | trang Vận đơn |
| `cuon:<id>` | `Departments.swift:468-472` (`DeptPage`), `Tabs.swift:1141-1152` (`MktNvScroll`, gắn ở `StaffDetail.swift:80`) | mọi `DeptPage`; trang chi tiết nhân viên |
| `team-mo` | `HrTeam.swift:37-39` (`HrTeamChip`) | chip team ở Tổng quan và CSKH |
| `team-chon`, `team-chon-cskh` | `HrTeam.swift:113-118` (`HrTeamSheet`) | bảng chọn team |
| `team-bo` | `HrTeam.swift:164-166` (`HrTeamNotice`) | trang Vận đơn |
| `team-them-monthly`, `team-them-metrics`, `team-them-dong` | `Tabs.swift:440-448` (`MoreHome`) | tab Thêm |
| `xnk-*` (18 tên) | `StaffTable.swift:202-232`, `:464-470` | `StaffTableBlock`, `StaffRowsTable` |
| `xnk-chart-closed/-net/-rate/-year/-unequal` | `StaffCompare.swift:285-299` | `CompareControls` |
| `xnk-chart-first/-middle/-last/-clear` | `StaffCompare.swift:435-444` | `CompareChart` |
| `mkt-pos`, `mkt-tat-ca-pos`, `mkt-xep-doanh-thu`, `mkt-xep-khoa` (bảng xếp Debug `:279-289`), `mkt-xep-cp-so` | `MarketingView.swift:178, 421-441` | trang Marketing |
| `mkt-hang`, `mkt-hang-tl`, `mkt-hang-team`, `mkt-hang-chi-tiet`, `mkt-hang-xem-rieng` | `MarketingRank.swift:162-187` | khối Xếp hạng |
| `nv-mo` | `CskhViews.swift:842-849` | `CompareView` (cần 3 khối `RankBlock`) |
| `nv-trang-thai`, `nv-ly-do`, `nv-loc`, `nv-don` | `StaffDetail.swift:81-103` | trang chi tiết nhân viên |
| `DebugRetry.tick` | `Kit.swift:512-515` (`StateView` "Thử lại") | mọi khung lỗi |
| `DebugSearch.shared.orders` | `PipelineView.swift:122` (khi `followsShared`) | tab Đơn hàng |

**Neo cuộn** (`.id`), giữ đúng chữ và để trên khối tương ứng:
- Tổng quan: `sale`, `cskh`, `mkt`, `vandon` (`.id(dept.rawValue)`, `Departments.swift:198`), `center`, `nhan-vien`, và khi có team: `muc-tieu-team`, `van-hanh-team`, `mua-lai-team`, `khach-hang-team`. Bộ xử lý `nav.overviewScroll` ở `Home.swift:67-71` giữ nguyên.
- Bảng nhân viên: `so-cung-ky`, `hang-nhan-vien`, `cuoi-bang-nhan-vien`, `bang-nhan-vien`, `bieu-do-so-cung-ky`; cột cuộn ngang theo `StaffColumn.packedRate` / `.compare`.
- CSKH: `team-cskh-kpi`, `team-cskh-calls`. Marketing: `mkt-tach`, `mkt-hang`. Nhân viên: `nv-status`, `nv-reasons`, `nv-orders`. Thông báo: `dong-bo-pancake`.

**Cờ sẵn sàng** đặt trong hàm tải, giữ nguyên chỗ: `TeamTourStatus.*` (`HrTeam.swift:207-216` và các chỗ gán), `CompareTourStatus.ready`, `MktNvTour.{marketing, rank, compare, staff, done, failed}`.

**Dòng log** giữ nguyên dạng từng ký tự: `[MOC]`, `[NHO]`, `[CHAM]`, `[XNK]`, `[XNKQ]`, `[TEAM]`, `[TEAMQ]`, `[MKT]`, `[MKTQ]`, `[MKTRQ]`, `[NV]`, `[NVQ]`, `FORMAT_TEST …`, `DECODE_TEST …`.

**Khác phải giữ:**
- `RootTabs` là gốc khi đã đăng nhập, có `.task { await DebugTour.run(nav:) }`. `RootTabs.onAppear` chuyển sang `.home` khi không xem được Tổng quan.
- `PipelineView(embedded: true, followsShared: true)` là gốc tab Đơn hàng.
- Sale mở trang con `compare` (có `StaffTableBlock`); CSKH mở `cskh-overview` (có `StaffTableBlock(team: "cskh")`).
- Màn đăng nhập, khoá, logo mở app: không đụng. Giờ hỏi Face ID tự động phụ thuộc thời lượng logo (`LogoIntro.swift`, hết lúc 6,35 giây).
- Tên asset `LaunchBackground`, `AppIcon`, `AccentColor`; khóa `thp_last_email`.
- Hoạt ảnh chạy liên tục mới (nếu có) phải đi qua `FrameCap` (`Anim.swift:56-65`).

### 2.4. Viết mã

- Chỉ API của **iOS 17** (deployment target 17.0), Swift 5. Không dùng: `Tab(` trong `TabView`, `.tabViewStyle(.sidebarAdaptable)`, `MeshGradient`, `.navigationSubtitle`, `@Entry`, `.onScrollGeometryChange`, `.presentationSizing`, `.containerShape` kiểu iOS 18. Không chắc một API có từ iOS mấy thì không dùng.
- Không thêm thư viện, không thêm `import` mới ngoài các module repo đang dùng (`SwiftUI`, `UIKit`, `Charts`, `Foundation`…). Không `WebView`.
- Không `print` ngoài `#if DEBUG`.
- Luật định dạng của `ios.yml` (bước "Chặn định dạng số và ngày ngoài Format.swift") áp cho mọi file mới: ngoài `Format.swift` và `FormatSelfTest.swift` không `Formatter(`, `.formatted(`, `FormatStyle`, `format: .`, `style: .time/.date/…`, không viết tay `" ₫"` hay `) ₫`, không `String(format:` có số lẻ. Trục biểu đồ: `AxisValueLabel { Text(Fmt.…) }`, không `AxisValueLabel(format:)`.
- Không đặt `.accessibilityIdentifier` (CI không dùng).
- Mỗi file mới thêm vào `ios/Megatech/Megatech/` (nhóm đồng bộ theo thư mục, Xcode tự nhận; không sửa `project.pbxproj` để thêm file).

### 2.5. Bảng đổi chữ (chỉ những chỗ này)

| Chỗ | Cũ | Mới |
|---|---|---|
| Nhãn tab 1 (`Tabs.swift:44`) | Trang chủ | Hôm nay |
| `NavMemory.swift:16`, `:23` (Mở app vào) | Trang chủ / "Luôn mở vào Trang chủ (số hôm nay)." | Hôm nay / "Luôn mở vào Hôm nay (số hôm nay)." |
| `Home.swift:38` | "… Các phần khác xem ở Trang chủ và Phòng ban." | "… Các phần khác xem ở Hôm nay và Phòng ban." |
| Thẻ MKT ở Hôm nay | MKT hôm nay | Marketing hôm nay |
| Khẩu hiệu 5 tab gốc (`AppHeader`) | 5 câu khẩu hiệu | bỏ (không còn thanh đầu) |
| Lời chào Hôm nay | dòng lời chào + ô thứ ngày | phụ đề dưới tiêu đề lớn (mục 5) |
| Tiêu đề khối bước đơn (Đơn hàng) | (không có) | "Từng bước của đơn", phụ đề "Chạm một bước để mở danh sách" |
| Ô trạng thái đồng bộ | 2 dòng ("Đồng bộ OK" / "2 phút trước") | 1 dòng, mục 4.3 |
| Phần trong ngoặc của dòng "Đơn cần lưu ý" | "Chờ chuyển hàng (đã đóng, chưa giao)" | tiêu đề "Chờ chuyển hàng", dòng phụ "Đã đóng, chưa giao" |

---

## 3. Bước U1: bảng màu, chữ, số gọn, thành phần cơ bản

### 3.1. File mới `Palette.swift`

Màu theo bộ màu web (`tokens.css` "Megatech Ops"), mỗi màu có bản sáng và bản tối:

```swift
import SwiftUI
import UIKit

/// Bảng màu 1.0 (theo bộ màu web "Megatech Ops"): mỗi màu một bản sáng, một bản tối, tự đổi theo giao diện máy.
enum Palette {
    static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) })
    }
    static let bg = dynamic(0xF2F4F0, 0x0B100D)
    // … các màu trong bảng dưới
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255, blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}
```

| Tên (`Palette.`) | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `bg` | F2F4F0 | 0B100D | nền trang |
| `card` | FFFFFF | 171F1A | thẻ |
| `cell` | F5F7F4 | 1E2822 | ô con trong thẻ |
| `fill` | E9EDE8 | 26312B | rãnh thanh, nền ô tìm, rãnh phân đoạn |
| `line` | E3E8E2 | 233029 | viền thẻ, vạch ngăn |
| `segSel` | FFFFFF | 3A4A41 | ô đang chọn của phân đoạn |
| `ink` | 142019 | E8EEEA | chữ chính |
| `ink2` | 46544C | AAB6AF | chữ phụ đậm |
| `ink3` | 626E67 | 8A968F | chú thích |
| `ink4` | A5AEA8 | 56625B | mũi tên mờ, vạch kỳ so |
| `accent` | 17684B | 4FC48F | chữ, icon, đường biểu đồ màu thương hiệu |
| `accentSoft` | E5F1EB | 173426 | nền nút lọc đang bật, dòng đang chọn |
| `accentFill` | 17684B | 1F7A57 | nền nút chính, thẻ chi phí MKT (chữ trắng) |
| `onFill` | FFFFFF | FFFFFF | chữ trên `accentFill` và icon nền đặc |
| `good` / `goodSoft` | 15804A / E2F4E9 | 5FCF8F / 133222 | tăng tốt |
| `bad` / `badSoft` | C2412D / FCEBEA | F0806F / 3B1C1A | giảm, lỗi |
| `badge` | D8424F | F06B75 | số đỏ trên chuông, đếm việc |
| `warn` / `warnSoft` | 9A6500 / FCF3E3 | E3A63A / 33270F | cảnh báo, dải team |
| `info` / `infoSoft` | 2A5FC4 / EBF1FD | 8FB4F2 / 182842 | xanh dương |
| `purple` / `purpleSoft` | 6B4FC8 / EFEBFB | B19CF0 / 261F3D | tím |
| `orange` / `orangeSoft` | BB4F16 / FDEDE4 | F2A07A / 3A2216 | cam |
| `teal` / `tealSoft` | 0F7A68 / E1F3EF | 5CC9B3 / 12302A | xanh ngọc |
| `gray` / `graySoft` | 5D6A62 / EEF1EE | A9B5AE / 1F2823 | xám |
| `bar2` | C9D1CB | 34423A | cột phụ, thanh mờ |
| `grid` | EDF0EC | 1D2620 | lưới biểu đồ |

Màu trạng thái đơn (chữ / nền):

| Tên | Sáng | Tối |
|---|---|---|
| `stNew` / `stNewBg` (mới, chờ xác nhận) | 5D6A62 / EEF1EE | A9B5AE / 1F2823 |
| `stConf` / `stConfBg` (đã xác nhận, đang xử lý) | 2A5FC4 / EBF1FD | 8FB4F2 / 182842 |
| `stShip` / `stShipBg` (đang giao) | 9C600A / FCF3E3 | E9B25A / 33270F |
| `stDel` / `stDelBg` (đã nhận) | 18763F / E2F4E9 | 6FD59A / 133222 |
| `stRet` / `stRetBg` (hoàn) | BB4F16 / FDEDE4 | F2A07A / 3A2216 |
| `stCan` / `stCanBg` (hủy) | B83227 / FCEBEA | F39389 / 3B1C1A |

Huy chương (cả hai giao diện): vàng nền F2C14E chữ 5A3E00; bạc C9CED4 / 3B4148; đồng D9935F / 4A2408; hạng từ 4: nền `fill`, chữ `ink2`.

Màu icon nền đặc ở tab Thêm (cả hai giao diện, icon trắng): xanh `accentFill`, xanh dương 2F6FD6, tím 7B5BD6, cam E8772E, xám 8A948E, xanh lá 2E9E5B, xanh ngọc 159A86.

**Màu POS** (`Pos.swift:7`, `PosInfo.color`): bản sáng giữ 6 màu cũ; thêm bản tối, trả `Palette.dynamic`:

| POS | Sáng | Tối |
|---|---|---|
| sieu-vo-gao | 2A78D6 | 3F86DC |
| mgt-apex | EB6834 | E06A3C |
| thuy-san | 1BAF7A | 1BAF7A |
| bio-nano | EDA100 | BF8608 |
| megaroot | E87BA4 | D66594 |
| oxytetra | 4A3AA7 | 7F6FD2 |

`PosBadge` bỏ đoạn `mixed(with:)` làm sáng màu ở bản tối (màu tối đã sáng sẵn).

### 3.2. `Theme.swift`: trỏ tên cũ sang bảng màu mới

Giữ mọi tên cũ (mã đang dùng khắp nơi), đổi giá trị:

| Tên cũ | Mới |
|---|---|
| `brand` | giữ `Color("AccentColor")`; sửa asset `AccentColor.colorset`: sáng 17684B giữ, **tối đổi 8BD5AB → 4FC48F** |
| `brandDeep` | `Palette.accentFill` |
| `brandDark` | `Palette.accentFill` |
| `brandSoft` | `Palette.accentSoft` |
| `cream` | `Palette.bg` |
| `lime` | giữ D9F36D (chỉ dùng trên nền xanh đặc) |
| `good` / `bad` / `warn` | `Palette.good` / `.bad` / `.warn` |
| `ink` / `inkSoft` | `Palette.ink` / `Palette.ink3` |
| `card` | `Palette.card` |

Thêm vào `Theme.swift` các tên ngắn cho mã màn hình: `Color.bg`, `Color.line`, `Color.cellBg`, `Color.fillBg`, `Color.ink2`, `Color.ink3`, `Color.ink4`, `Color.accentSoft`, `Color.accentFill` trỏ về `Palette`. **Không** đặt tên `Color.purple`, `Color.orange`, `Color.teal`, `Color.gray`, `Color.blue` (trùng màu hệ thống): dùng `Palette.purple`…

Đổi màu nhóm:
- `Tone` (`Kit.swift:201-203`): green → `Palette.good`, red → `Palette.bad`, orange → `Palette.orange`, blue → `Palette.info`, gray → `Palette.ink3`, purple → `Palette.purple`.
- `CompanyDept.tint` (`Departments.swift`): sale → `Palette.info`, cskh → `Palette.teal`, mkt → `Palette.orange`, vandon → `Palette.purple`.
- `StatusChip.tint(code:)` (`Shared.swift:227-235`): 0, 17 → `stNew`; 3, 16 → `stDel`; 2 → `stShip`; 4, 5, 15 → `stRet`; 6, 7 → `stCan`; còn lại → `stConf`. Thêm `StatusChip.bg(code:)` trả màu nền tương ứng. `OrderTimeline` (`Shared.swift:487`) theo cùng bảng.
- `StatusStrip.items` (`DashboardView.swift:30`): new → `stNew`, confirmed → `stConf`, shipping → `stShip`, delivered → `stDel`, returned → `stRet`, cancelled → `stCan`.
- `SyncStatus.tone` (`Kit.swift:53`): chưa có số → `Palette.gray`, lỗi → `Palette.bad`, chậm → `Palette.warn`, ổn → `Palette.good` (bỏ `lime`).

### 3.3. Chữ

- Thành phần trong `Kit.swift`, `Anim.swift`, `PeriodChips.swift` và mọi thành phần mới dùng **kiểu chữ hệ thống** (theo cỡ chữ của máy), không `.system(size:)`.
- Bảng đổi khi gặp cỡ cố định:

| Cỡ cũ | Kiểu chữ mới |
|---|---|
| 8–10 | `.caption2` |
| 11 | `.caption` |
| 12 | `.footnote` |
| 13–14 | `.subheadline` |
| 15–16 | `.callout` |
| 17 | `.body` (đậm thì `.headline`) |
| 19–20 | `.title3` |
| 22 | `.title2` |
| 24–28 | `.title` |

- Số lớn (từ 20 điểm, ví dụ số chính của thẻ) được giữ cỡ cố định: `.system(size: N, weight: .semibold)` + `.monospacedDigit()` + `.lineLimit(1).minimumScaleFactor(0.6)`. Bỏ `design: .rounded` ở số (kiểu mới dùng SF Pro thường). Giữ `.rolling(value)`.
- Cỡ chữ lớn nhất của app: `RootTabs` đặt `.dynamicTypeSize(...DynamicTypeSize.accessibility2)` (bước U2).

### 3.4. Hàm mới `Fmt.compactMoney` (trong `WidgetShared/Format.swift`)

Tiền gọn cho số to, tách số và đơn vị để vẽ hai cỡ chữ:

```swift
/// Tiền gọn cho số to trên thẻ: số và đơn vị tách riêng (đơn vị vẽ chữ nhỏ). Dưới 1 triệu viết đủ; triệu 1 số lẻ; tỷ 2 số lẻ;
/// làm tròn trước rồi mới chọn đơn vị (999.950.000 → "1,00" "tỷ ₫"); từ 1.000 tỷ viết số nguyên có dấu chấm.
static func compactMoney(_ n: Double) -> (value: String, unit: String)
```

Quy tắc (dấu thập phân là dấu phẩy, nhóm nghìn là dấu chấm, giữa "tr"/"tỷ" và "₫" là khoảng trắng không ngắt U+00A0):
1. `r = n.rounded()`. Nếu `|r| < 1_000_000`: trả `(Fmt.int(r), "₫")`.
2. `m = n / 1e6` làm tròn 1 số lẻ. Nếu `|m| < 1000`: trả `(m một số lẻ, "tr\u{00A0}₫")`.
3. `b = n / 1e9` làm tròn 2 số lẻ. Nếu `|b| < 1000`: trả `(b hai số lẻ, "tỷ\u{00A0}₫")`.
4. Còn lại: trả `(Fmt.int(n / 1e9), "tỷ\u{00A0}₫")`.
- Số âm giữ dấu "-" (ASCII) đầu chuỗi số, như `Fmt.short`.

Thêm vào `FormatSelfTest.swift`, nhóm mới `compact(&r)` gọi trong `runAndExit()`. Đáp án viết tay, không lấy hàm đang kiểm làm đáp án:

| n | value | unit |
|---|---|---|
| 0 | `0` | `₫` |
| 850_000 | `850.000` | `₫` |
| 999_999 | `999.999` | `₫` |
| 999_999.6 | `1,0` | `tr ₫` |
| 1_000_000 | `1,0` | `tr ₫` |
| 8_700_000 | `8,7` | `tr ₫` |
| 133_420_000 | `133,4` | `tr ₫` |
| 999_940_000 | `999,9` | `tr ₫` |
| 999_960_000 | `1,00` | `tỷ ₫` |
| 1_264_000_000 | `1,26` | `tỷ ₫` |
| 1_266_000_000 | `1,27` | `tỷ ₫` |
| 999_996_000_000 | `1.000` | `tỷ ₫` |
| 12_345_000_000_000 | `12.345` | `tỷ ₫` |
| -8_700_000 | `-8,7` | `tr ₫` |

(Khoảng trắng trong cột unit là U+00A0.) Tên ca `compact-<n>-value`, `compact-<n>-unit`.

Nơi dùng: số tiền to (số chính của thẻ, bảng bộ phận, ô chỉ số tiền). Số tiền nhỏ trong dòng chữ vẫn `Fmt.shortMoney`/`Fmt.money` như cũ. VoiceOver của số gọn đọc `Fmt.money(n)` đầy đủ (`.accessibilityLabel`).

### 3.5. Thành phần (sửa trong `Kit.swift`, `Anim.swift`; giữ tên và chữ ký cũ để mọi chỗ gọi vẫn build)

Bề mặt:
- **Mới `cardSurface(radius: CGFloat = 16)`**: nền `Palette.card` bo góc, viền 1 điểm `Palette.line` (`strokeBorder`). Không bóng.
- `cardShadow()`: đổi thành bóng rất nhẹ `Color.black.opacity(0.05)`, radius 2, y 1 ở bản sáng; bản tối không bóng (`@Environment(\.colorScheme)`). Các bước màn dần thay bằng `cardSurface`.
- `Panel`: padding 16, khoảng cách trong 12, `cardSurface(16)`.
- `Card`, `MiniStat`, `StatCard`: `cardSurface`.

Tiêu đề:
- `SectionHead(title, action?, route?, count?)`: thêm tham số tùy chọn `subtitle: String? = nil`, `info: InfoText? = nil` (mục 4.8).
  - Tiêu đề `.headline` màu `ink`; số đếm: viên `Palette.badge`, chữ trắng `.caption2` đậm.
  - Hành động: `.subheadline` màu `accent` + `chevron.right`.
  - Phụ đề `.footnote` màu `ink3`, xuống dòng được. (i) đứng ngay sau tiêu đề.
- **Mới `GroupTitle(title, subtitle: String? = nil, info: InfoText? = nil)`**: tiêu đề nhóm lớn trên nền trang (không thẻ): `.title2` đậm, phụ đề `.footnote` `ink3`.

Ô số:
- `KpiCard` (giữ chữ ký, thêm tham số cuối có mặc định): `unit: String? = nil`, `money: Double? = nil`.
  - Khi có `money`: số và đơn vị lấy từ `Fmt.compactMoney(money)`, bỏ qua `value`; VoiceOver đọc `Fmt.money(money)`.
  - Bố cục (như ô `tile` trong hình mẫu): `cardSurface(16)`, padding 14, dọc khoảng cách 6.
    - Dòng 1: `IconSquare(icon, tint, size: 28)` + nhãn `.subheadline` `ink2`, tối đa 2 dòng.
    - Dòng 2: số `.system(size: 26, weight: .semibold)` `monospacedDigit` + đơn vị `.footnote` `ink3`.
    - Dòng 3: `DeltaPill` **và** ghi chú `.caption` `ink3`, cùng hiện, tự xuống dòng.
  - Giữ `.loadingPlaceholder(thinking)` và `.rolling`.
- **Mới `DeltaPill(_ text: String, good: Bool? = nil)`**:
  - Hướng mũi tên theo dấu: chuỗi bắt đầu "-" hoặc "−" là giảm. Chữ hiện bỏ dấu đầu ("+12%" hiện "12%").
  - Màu: `good` (mặc định = hướng lên) → chữ `Palette.good` nền `goodSoft`; ngược lại `bad`/`badSoft`.
  - Viên tròn, `.footnote` đậm, icon `arrow.up` / `arrow.down` cỡ nhỏ.
  - VoiceOver: "tăng 12%" / "giảm 12%".
  - Biến thể trên nền xanh đặc: tham số `onFill: Bool = false` → nền trắng 14%, chữ tăng C9F2DA, giảm FFC2B8.
- **Mới `StatCell(label, value, unit: String? = nil, note: String? = nil, tone: Color? = nil)`**: ô con trong thẻ. Nền `Palette.cell` bo 12, padding 10/12; nhãn `.caption` `ink3`; số `.title3` đậm vừa + đơn vị `.caption`; ghi chú `.caption` `ink3`.
- **Mới `IconSquare(_ icon: String, tint: Color, size: CGFloat = 32, filled: Bool = false)`**: ô vuông bo `size × 0.28`; nền `tint.opacity(0.14)`, icon `MetricIcon` màu `tint`. `filled`: nền `tint`, icon trắng.

Nút, nhãn, chọn:
- `Tag`: viên tròn, `.caption` đậm, nền màu tone 14%.
- **Mới `StatusPill(name, code)`**: chữ `StatusChip.tint`, nền `StatusChip.bg`, viên tròn, `.caption` đậm. `StatusChip` hiện như `StatusPill`.
- `FilterChip`: bật → nền `Palette.ink`, chữ `Palette.card`; tắt → nền `Palette.cell`, chữ `ink2`; không viền. `.subheadline` vừa. Số đỏ `Palette.badge`. Thêm `.accessibilityAddTraits(on ? .isSelected : [])`.
- `QuickChip` (`PeriodChips.swift`): cùng kiểu `FilterChip`.
- `Segmented`: rãnh `Palette.fill` bo 9, padding 2; ô chọn nền `Palette.segSel`, bóng `black 10%` radius 1,5 (chỉ bản sáng), chữ `ink` đậm; ô khác chữ `ink2`. `.footnote`. Thêm `.isSelected`. Thêm `.sensoryFeedback(.selection, trigger: selection)`.
- `PrimaryButton`: mặc định nền `Palette.accentFill`, chữ trắng `.body` đậm, bo 12, cao 14 trên dưới.
- `DatePill`: nền `card`, viền `line`, chữ `.footnote` đậm.
- `Hint`: nền `Palette.fill`, chữ `.caption2` `ink3`.
- `Avatar`: giữ (nền màu 14%); chữ `.system(size: size × 0.36, weight: .semibold)`.
- `Medal`: màu mục 3.1; chữ `.caption` đậm.

Biểu đồ và thanh:
- `Bar` (`Anim.swift`): rãnh `Palette.fill`.
- `Ring`: rãnh `Palette.fill`; chữ giữa `.system(size: size × 0.24, weight: .semibold)`; tôn trọng Giảm chuyển động (không chạy hoạt ảnh khi bật).
- `LineChart`: giữ cách vẽ (không đổi sang Swift Charts). Lưới `Palette.grid`; vùng tô `tint` 24% → 0; nét 2,2; chỉ chấm điểm cuối; nhãn số lớn nhất là viên nền `Palette.ink`, chữ `Palette.card` `.caption2` đậm; nhãn trục `.caption2` `ink3`; tôn trọng Giảm chuyển động.
- `StackedBar`: cao 10, bo 5, khe 2; chú giải chấm vuông bo 3 + `.caption` `ink2`.
- `FunnelLine`: nhãn `.footnote`, số `.footnote` đậm.
- `Skeleton`, `SkeletonGrid`: nền `Palette.fill` thay `black 5%`. `ThinkingLoader`: hộp `cardSurface(12)`.
- `StateView`: khung `cardSurface(12)`; viền lỗi `Palette.warn`; nút "Thử lại" viên `accentFill` chữ trắng (`onDark`: giữ `lime`). Móc `DebugRetry` giữ.

### 3.6. CI ở bước U1

`.github/workflows/ios-preview.yml`: chỉ đổi `timeout-minutes: 60` thành `timeout-minutes: 80` (dòng 29). Không đổi dòng nào khác. (Lượt quay đang 32–53 phút; bản mới thêm đoạn 15 ở U10.)

---

## 4. Bước U2: khung app

### 4.1. `TabPage` mới (thay thanh đầu bằng tiêu đề lớn của iPhone)

Chữ ký mới (sửa 6 chỗ gọi):

```swift
struct TabPage<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    @ViewBuilder let content: Content
    @Environment(\.refresh) private var outer
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(Color.ink3).fixedSize(horizontal: false, vertical: true) }
                content
            }
            .padding(.horizontal, 16).padding(.top, 2).padding(.bottom, 24)
        }
        .refreshHost(outer: outer)
        .background(Color.bg)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
        .toolbar { ToolbarItemGroup(placement: .topBarTrailing) { SyncPill(); BellButton() } }
    }
}
```

- Bỏ `.toolbar(.hidden, for: .navigationBar)`. Thanh trên dùng nền mặc định của hệ thống (trong suốt khi ở đầu trang, mờ khi cuộn).
- Xóa `AppHeader`. Giữ `SyncStatus` nguyên vẹn.
- Cơ chế kéo để làm mới (`refreshHost(outer:)`, `.refreshable` đặt ngoài `TabPage`) giữ như cũ.

Tiêu đề và phụ đề 5 tab gốc:

| Tab | `title` | `subtitle` |
|---|---|---|
| Hôm nay (`HomeFeed`) | "Hôm nay" | `"\(Fmt.weekday()) · \(hello()) \(tên hiển thị)"`, ví dụ "Thứ Bảy, 18/10 · Chào buổi tối, Chủ hệ thống" (làm ở U3; U2 để `nil`) |
| Đơn hàng (`OrdersHome`) | "Đơn hàng" | "Theo dõi từng bước, giao đúng hẹn." |
| Tổng quan (`HomeView`) | "Tổng quan" | "4 bộ phận · \(period.label)" (khi không có quyền: "4 bộ phận") |
| Phòng ban (`DeptsHome`) | "Phòng ban" | "\(n) phòng ban · chạm để vào phòng" (danh sách rỗng: `nil`) |
| Thêm (`MoreHome`) | "Thêm" | "Tài khoản, tiện ích, cài đặt" |

Ở 5 tab gốc, bỏ dòng `PageTitle` đầu trang (tiêu đề đã ở thanh trên). `PipelineView`: khi `embedded` thì không vẽ `PageTitle`; khi mở riêng (`.page("pipeline")`) thì `navigationTitle("Vận hành đơn")` và phụ đề như mục 4.4.

### 4.2. Trang con (đẩy vào trong tab)

- `brandNav()` đổi thân, giữ tên (27 chỗ gọi): `self.navigationBarTitleDisplayMode(.inline).background(Color.bg)`. Bỏ nền xanh đậm, bỏ `toolbarColorScheme(.dark)`.
- Trang dạng `List`/`Form` hệ thống giữ nền hệ thống (đã đổi tối đúng).
- **`PageTitle`** (28 chỗ) đổi thân: **không vẽ tiêu đề nữa**, chỉ vẽ phụ đề (`.subheadline` `ink3`) và phần `trailing` (nếu có), cùng một hàng. Có `icon` thì bỏ icon.
  - Vì thế tiêu đề phải hiện ở chỗ khác: thanh trên (`navigationTitle`) khi trang mở riêng, hoặc ô đang chọn của `SubNav` khi trang nằm trong Sale/CSKH/Nhân sự.
  - Codex kiểm từng chỗ gọi `PageTitle`. Trang mở riêng mà `navigationTitle` khác `PageTitle.title` thì sửa `navigationTitle` cho bằng (ví dụ `Security.swift:204` "Bảo mật" → "Bảo mật tài khoản"; `CskhViews.swift:141` theo `isCskh`).
  - Không còn phụ đề và không có `trailing` thì bỏ hẳn dòng.

### 4.3. Ô đồng bộ và chuông (trên thanh trên của 5 tab gốc)

- **Mới `SyncPill`**: `NavigationLink(value: Route.alertsSync)`.
  - Viên cao 32, nền `card`, viền `line`; chấm 7 điểm màu `sync.tone`; chữ `.footnote` đậm `ink2`, một dòng.
  - Chữ: thêm `SyncStatus.short`:
    - chưa có số: "Đang kiểm tra";
    - có lỗi: "Lỗi đồng bộ";
    - quá 15 phút: "Đồng bộ chậm";
    - ≤ 1 phút: "Vừa đồng bộ";
    - < 60 phút: "Đồng bộ \(n) phút"; < 1 ngày: "Đồng bộ \(n/60) giờ"; còn lại: "Đồng bộ \(n/1440) ngày".
  - VoiceOver: nhãn `"\(sync.title), \(sync.subtitle)"`, gợi ý giữ "Mở Thông báo, phần Đồng bộ Pancake từng POS".
  - Chuyển `.task { await sync.refresh(maxAge: Freshness.window) }` từ `AppHeader` sang `SyncPill`.
- **Mới `BellButton`**: `NavigationLink(value: Route.alerts)`, `MetricIcon("bell.fill")` cỡ 20 màu `ink`, khung 36×36.
  - Số đỏ góc trên phải: `alerts?.count(sync: sync) ?? sync.alertCount` (như cũ), viên `Palette.badge`, chữ trắng `.caption2` đậm, chỉ hiện khi > 0.
  - VoiceOver: "Thông báo", giá trị "\(n) việc cần xử lý".
- Trang con không có ô đồng bộ và chuông (như cũ: chỉ tab gốc có).

### 4.4. Thanh dưới (`RootTabs`, `Tabs.swift:43-58`)

- Nhãn: "Hôm nay", "Đơn hàng", "Tổng quan", "Phòng ban", "Thêm". Thứ tự và `tag` giữ.
- Icon: giữ `Reicon.tab` của 4 tab; tab Tổng quan đổi thành `Reicon.tab("chart.bar.fill", "ri_chart", on: nav.tab == .overview)` như các tab khác. Xóa `CenterTabIcon` (vòng tròn xanh vẽ sẵn).
- `.tint(.brand)` giữ (asset đã có bản tối mới).
- Thêm `.dynamicTypeSize(...DynamicTypeSize.accessibility2)` trên `TabView`.
- Không đổi `TabView` sang API iOS 18.

### 4.5. Nút lọc một hàng

**Mới `Pill`** (kiểu chung): viên cao tối thiểu 34, padding 12 trái / 10 phải; nền `card`, viền `line`; chữ `.subheadline` đậm `ink`, icon đầu 16 `ink2`, `chevron.down` cuối 12 `ink3` (khi là menu). Bật: nền `accentSoft`, chữ và icon `accent`, không viền.

**Mới `FilterBar { … }`**: `ScrollView(.horizontal, showsIndicators: false)` chứa `HStack(spacing: 8)`. Tràn sát mép: bên trong `.padding(.horizontal, 16)`, bên ngoài `.padding(.horizontal, -16)`. Không ghim dính khi cuộn.

Đổi ruột (giữ tên và chữ ký để chỗ gọi vẫn build):
- `PeriodChips(period:options:)` thành **một `Pill` kiểu `Menu`**:
  - Nhãn: icon `calendar` + `period.title` + chevron. Không bao giờ "bật" (luôn có một kỳ).
  - Mục: mỗi `options` một nút (dấu ✓ ở kỳ đang chọn); `Divider`; nút "Khác…" mở `CustomRangeSheet` như cũ. Kỳ đang chọn không có trong `options` (khoảng tự chọn, 30 ngày) thì hiện trong nhãn và có ✓ ở "Khác…".
  - VoiceOver: "Kỳ: \(period.title)". `.sensoryFeedback(.selection, trigger: period)`.
  - Bỏ `ViewThatFits` và dải chip.
- `PosChipRow(selection:label:allLabel:)` thành **một `Pill` kiểu `Menu`**:
  - Chưa chọn POS: nhãn là 6 chấm tròn 7 điểm theo màu 6 POS (thứ tự `PosBreakdown.order`, chồng nhẹ) + `allLabel`. Không bật.
  - Đã chọn: `PosBadge(id, size: 18)` + tên ngắn `PosBreakdown.short[id]`; bật.
  - Mục: `allLabel` (✓ khi chưa chọn); `Divider`; 6 POS theo `PosBreakdown.order`, nhãn tên đầy đủ, ✓ ở POS đang chọn. POS đang lỗi đồng bộ (như chấm đỏ cũ) thì nhãn thêm " · lỗi đồng bộ".
  - Chọn một POS là đặt `selection = id`; chọn `allLabel` là đặt `""`.
  - VoiceOver: "POS: \(tên POS hoặc allLabel)". `.sensoryFeedback(.selection, trigger: selection)`.
  - `PosChip`, `PosMiniChip` không còn ai dùng thì xóa.
- **Mới `ProductPill(selection: Binding<String>)`** (chỉ Tổng quan dùng, U4): `Menu` với "Tất cả nhóm" (`all`), "Gentadox" (`gentadox`), "SK + GK" (`skgk`). Nhãn: icon `shippingbox` + tên đang chọn; bật khi khác `all`. VoiceOver "Nhóm đơn: …".
- `HrTeamChip`: thành **`Pill` kiểu nút** (không phải `Menu`): icon `person.2` + `nav?.hrUnit?.shortName ?? "Team"`; bật khi có team; chạm mở `HrTeamSheet` như cũ. **Móc `team-mo` giữ ngay trên view này.**

Chỗ gọi cũ để từng hàng riêng vẫn build và hiện được (mỗi hàng một viên). Các bước màn (U3–U9) gom vào `FilterBar`.

### 4.6. Dải team

`HrTeamNotice(applies:deptLabel:)` đổi thân, giữ chữ ký:
- Một hàng: icon `person.2.fill` 15; chữ ngắn `.footnote` đậm, tối đa 2 dòng; `InfoButton` mở câu dài cũ (nguyên văn, `HrTeam.swift:158-160`); nút "Bỏ chọn team".
  - Chữ ngắn khi `applies`: "Đang xem riêng team \(unit.name)". Khi không: "Trang này chưa lọc theo team \(unit.name)".
  - Nút "Bỏ chọn team": `.footnote` đậm `ink`, nền `card`, bo 8, padding 7/10.
- Khung: nền `Palette.warnSoft`, chữ `Palette.warn`, bo 12, padding 8 (trái 12).
- **Móc `team-bo` giữ trên view này.**
- `HrNoticeModifier`: giữ `safeAreaInset(edge: .top)`, nền `Color.bg`, padding ngang 16, dọc 8.
- `HrTeamErrorView`: chữ `Palette.bad` `.subheadline`; nút "Bỏ chọn team" kiểu trên.

### 4.7. `SubNav`

- ≤ 3 trang: một hàng phân đoạn kiểu `Segmented` rộng (`.subheadline`), số đỏ (nếu có) cạnh chữ.
- > 3 trang: dải `FilterChip` cuộn ngang như cũ (kiểu chip mới).
- Giữ `.id(p.id)`, cuộn tới chip đang chọn, `withAnimation(.snappy(duration: 0.25))`.

### 4.8. Nút (i)

- **Mới `struct InfoText: Identifiable { let id = UUID(); let title: String; let body: String }`**.
- **Mới `InfoButton(_ info: InfoText)`**: icon `info.circle` 17 `ink3`, vùng chạm 44×44 (`contentShape`), VoiceOver "Giải thích: \(title)". Chạm mở `InfoSheet`.
- **Mới `InfoSheet`**: `NavigationStack`, tiêu đề `info.title` inline, nút "Đóng"; thân `ScrollView` chữ `.body` `ink`, padding 20; `.presentationDetents([.medium, .large])`.
- Chỗ nào đang có `ExplainSheet` cho một số (chạm ô số, nút (i) ở Hôm nay, `StaffTable`) thì **giữ `ExplainSheet`**. `InfoButton` chỉ dành cho câu giải thích chữ được chuyển khỏi màn.

### 4.9. Tiện ích khác ở U2

- **Mới `ListRow(icon: String?, tint: Color, title: String, subtitle: String?, filledIcon: Bool = false) { trailing }`**: hàng danh sách cao tối thiểu 48: `IconSquare` 30 (hoặc không icon), tiêu đề `.body`, phụ đề `.footnote` `ink3`, phần phải, `chevron.right` `ink4` khi là link. Vạch ngăn `Palette.line` thụt theo chữ.
- **Mới `ListGroup { … }`**: khối nhóm hàng kiểu Cài đặt iPhone: `cardSurface(14)`, padding trái 14.
- `OrdersHome`, `HomeView`, `DeptsHome`, `MoreHome`, `HomeFeed`: chỉ đổi chỗ gọi `TabPage` và bỏ `PageTitle` gốc ở bước này.
- `NavMemory.swift`: chỉ đổi chữ theo bảng 2.5.

---

## 5. Bước U3: Hôm nay (`HomeFeed.swift`)

Thứ tự mới, trên xuống (theo hình mẫu "Hôm nay"):

0. **Phụ đề** (`TabPage.subtitle`): `"\(Fmt.weekday()) · \(hello()) \(displayName)"`. Bỏ dòng lời chào và ô thứ ngày cũ (`:62-77`).
1. **Thẻ doanh thu** (thẻ trắng `cardSurface`, thay thẻ xanh đậm):
   - Hàng đầu: "Doanh thu hôm nay" (hoặc "Số chính hôm nay" khi chỉ xem Vận đơn) `.subheadline` đậm `ink2`; nút (i) mở `totalExplain` như cũ; khoảng trống; nút mắt ẩn số (giữ `thp_hide_money`, giữ nhãn VoiceOver).
   - Số chính: `Fmt.compactMoney(refSum)`: số `.system(size: 44, weight: .semibold)`, đơn vị `.title3` `ink3`. Đang ẩn: "••••••••".
   - Hai dòng `.footnote` `ink3`: dòng phạm vi ("Mọi POS · từ 0h đến HH:mm" / "N POS được cấp…") rồi dòng nguồn ("Tổng cộng thống kê Pancake, cộng N POS · X đơn chốt" và các biến thể), giữ nguyên chữ.
   - Câu cảnh báo Pancake chưa đọc được: màu `Palette.warn`, icon `exclamationmark.triangle.fill`.
   - Thanh so với hôm qua: `Bar(value: min(1, hôm nay / hôm qua cả ngày))` màu `accent`, chỉ khi có số hôm qua > 0. Dưới thanh một hàng: trái "Hôm qua cả ngày", phải `Fmt.shortMoney(số hôm qua)` (đang ẩn: "••••••").
   - Chạm thẻ mở `.overviewRef` như cũ (chỉ khi `canView("overview")`). Chữ "Chưa đọc được số Tổng cộng của Pancake…" giữ.
2. **Thẻ "Theo bộ phận"** (khi không chỉ xem Vận đơn):
   - `SectionHead("Theo bộ phận", subtitle: "Xem riêng, không cộng lại · % so cùng giờ hôm qua")`.
   - Mỗi bộ phận một `ListRow`: `IconSquare(dept.icon, dept.tint)`; tiêu đề tên bộ phận (`ink`, không còn chữ lime) + nút (i) nhỏ mở `revenueExplain` / `mktExplain` như cũ; phụ đề "N đơn chốt" / "N đơn đã xác nhận".
   - Phải: số gọn (`.callout` đậm + đơn vị `.caption2`) trên, `DeltaPill` dưới.
   - Chạm hàng mở `.dept(<dept>, period: .today)` khi `dept.canOpen(me)` (như `opener`), không thì không chạm được, không có mũi tên.
   - Lỗi: `StateView` gọn. Không có quyền: "Tài khoản chưa được cấp xem doanh thu bộ phận."
3. **Thẻ "Cần xử lý"**: `SectionHead("Cần xử lý", action: "Xem tất cả", route: .alerts, count:)`. Tối đa 3 `AlertRow` (mục 10.4). Đang tải, trống, lỗi: chữ như cũ.
4. **Thẻ "Marketing hôm nay"** (đổi chữ từ "MKT hôm nay"): `SectionHead(subtitle: "Số đưa về và chi phí quảng cáo", action: "Mở")` + 4 `StatCell` 2 cột: Số về, Chi phí QC, CP / số, CP / đơn. Giữ ghi chú và quy tắc "—" + "chi phí không chia POS". Chạm thẻ mở `.dept(.mkt, period: .today)`.
5. **Thẻ "Vận đơn hôm nay"**: `SectionHead(subtitle: "Không phải doanh thu, không cộng vào doanh thu", action: "Mở")` + nút (i) mở `vdExplain` như cũ.
   - Nhãn "Doanh số chuyển đi" `.caption` `ink3`; số gọn `.system(size: 28, weight: .semibold)`; ghi chú "N đơn chuyển đi".
   - Dòng "Trong X đơn vào Chờ xác nhận hôm nay" `.footnote` `ink2`; `StackedBar` 3 phần: còn chờ (`stNew`), đã xác nhận (`stDel`), không xác nhận được (`stCan`); chú giải có số. Có số "đã chuyển đi" thì thêm dòng "d đơn đã chuyển đi".
   - VoiceOver của khối này đọc nguyên câu cũ (`:302`).
   - Chạm mở `.dept(.vandon, period: .today)`.
6. **Thẻ "Ca đang chạy"** (khi `canView("shift")`): `SectionHead(action: "Xem ca", route: .page("shift"))`; 3 `StatCell`: Số đã nhận, Số đã chốt (ghi chú "±x% hôm qua"), Chốt nóng; 3 hàng người: `Medal`, `Avatar(32)`, tên, `Bar`, "N chốt".
7. **"Lối tắt"**: `GroupTitle("Lối tắt")` + lưới 4 cột: `IconSquare(size: 46)` bo 14 + nhãn `.caption` `ink2` 2 dòng, giữa. Mục và quyền giữ (`HomeShortcuts`). Màu: Trong ca `good`, Đơn mới chưa chốt `orange`, Tra khách `info`, Theo từng POS `accent`, Cuộc gọi CSKH `teal`, Data Sale `good`, Báo cáo tháng `purple`, Duyệt nhân sự `orange`.

Ẩn số tiền: mọi chỗ cũ có che thì vẫn che (thẻ doanh thu, hàng bộ phận, số MKT, Vận đơn, bảng giải thích).
Đang tải: `Skeleton` theo từng thẻ như cũ. Thứ tự gọi API, `.task`, `onChange(of: phase)` giữ.

---

## 6. Bước U4: Tổng quan

### 6.1. Đầu trang (`Home.swift` `HomeView`)

- `TabPage(title: "Tổng quan", subtitle: "4 bộ phận · \(period.label)")`.
- `FilterBar { PeriodChips(period: $nav.period); PosChipRow(selection: $nav.pos); ProductPill(selection: $nav.product); HrTeamChip() }` thay 4 hàng cũ.
- `ScrollViewReader` và `.onChange(of: nav.overviewScroll)` giữ nguyên.

### 6.2. 4 bộ phận (`Departments.swift`: `DeptBoards`, `DeptBoard`, `DeptTile`, 4 bảng, `ShipTable`)

- Trên các bảng: `GroupTitle("4 bộ phận", subtitle: <dòng chân cũ "Chạm vào bộ phận để xem chi tiết · số Pancake đồng bộ HH:mm">, info: <toàn bộ nội dung "Cách tính 4 bộ phận">)`. Bỏ `DisclosureGroup` "Cách tính 4 bộ phận" và dòng chân cũ ở dưới.
- `DeptBoard` mới (hình mẫu "Tổng quan"):
  - `cardSurface(16)`, padding 16. Bỏ vạch màu mép trên, bỏ dòng "Xem chi tiết X ›".
  - Hàng đầu: `IconSquare(dept.icon, dept.tint)`; tên `.headline` + chú thích `.footnote` `ink3` (2 dòng); khi chạm được thì `chevron.right` `ink4` bên phải.
  - Nhãn số chính (`heroLabel`, ví dụ "Doanh thu", "Doanh số chuyển đi") `.caption` `ink3`, không viết hoa toàn bộ.
  - Số chính: thêm tham số `heroMoney: Double? = nil`; có thì vẽ `Fmt.compactMoney` (`.system(size: 32, weight: .semibold)` + đơn vị `.callout` `ink3`), không thì vẽ `hero` như cũ. Ghi chú số chính `.footnote` `ink3`.
  - Ô con: `DeptTile` vẽ như `StatCell` (nền `cell`, bo 12); có `bar` thì vẽ `Bar` dưới.
  - **Không vẽ `DeltaPill` trên bảng**: `/api/reports/sections` không có số kỳ trước (hình mẫu vẽ là minh họa).
  - Giữ: `NavigationLink`, `StaggerIn`, `.id(dept.rawValue)`, bảng chờ tải (redacted), nhãn VoiceOver và gợi ý "Chạm để xem chi tiết …".
- `SaleBoard`, `CskhBoard`, `MktBoard`, `VanDonBoard`: truyền `heroMoney` (net tương ứng). Ô con giữ nhãn, giá trị, ghi chú như cũ.
- `ShipTable`: tiêu đề cột `.caption2` đậm `ink3`; hàng `.footnote`, số `monospacedDigit`; hàng Tổng đậm; số tiền nhỏ `.caption2` `ink3`; % hoàn tô theo `returnTone` (màu `Palette`). Giữ dòng chú giải.
- Câu cảnh báo dưới bảng (MKT chưa lọc nhóm, Vận đơn nhóm, Kỳ ngắn) giữ, `.footnote`. "4 bảng bộ phận chưa lọc theo team." giữ dưới các bảng.

### 6.3. Số liệu theo kỳ (`CenterBlocks`, `Home.swift:305-644`)

- `HrTeamNotice` đầu khối giữ (dải mới).
- `GroupTitle("Số liệu theo kỳ", subtitle: <dòng xám "<kỳ · ngày> · so với kỳ liền trước · …">)`. Bỏ `Hint` tên kỳ (kỳ đã ở phụ đề). `.id("center")` đặt trên tiêu đề này.
- **6 ô chỉ số**: `KpiCard` kiểu mới, 2 cột, khoảng cách 12. "Doanh thu đơn chốt" và "Giá trị TB đơn (AOV)" dùng `money:`. Ghi chú hiện cùng mũi tên. Chạm như cũ.
- **`PancakeRefCard`** (`Metrics.swift:206-304`):
  - `SectionHead("Số tham chiếu Pancake", subtitle: "% so với dd/mm–dd/mm · cách tính của Pancake")`; `Tag` "Lấy từ Pancake" / "Web tự tính" ngay dưới.
  - `Segmented` "Tổng cộng / Online / Bán tại quầy".
  - `RefCell` vẽ như `StatCell` (3 ô rồi 2×2); `RefDelta` thành `DeltaPill` (giữ quy tắc không hiện khi kỳ trước bằng 0; "Hàng hoàn" tăng là xấu).
  - Thanh Online / Tại quầy: `StackedBar` màu `accent` / `orange`.
- **Mục tiêu tháng** (`.id("muc-tieu-team")` khi có team): `SectionHead("Mục tiêu tháng MM", action: <giữ>)`; bên trái `Ring(value:, size: 96)`; bên phải số đã đạt gọn (`.title` đậm) + "x / goal · còn y" (giữ chữ) + `Bar`. Không thêm vạch tiến độ mới. Chưa đặt mục tiêu: chữ cũ.
- **Xu hướng 30 ngày**: `SectionHead(subtitle: "Doanh thu đơn chốt từng ngày", info: <câu xám cũ đầy đủ>, action: "Xem chi tiết")`; `LineChart` kiểu mới; dòng chân "Đơn chốt 30 ngày: N".
- **Trạng thái đơn**: `SectionHead(subtitle: "Đơn tạo trong kỳ · lúc đồng bộ")`; `Donut` dùng màu trạng thái; chú giải từng dòng: chấm vuông, tên, số, % (`monospacedDigit`), chạm như cũ.
- **Vận hành đơn** (`.id("van-hanh-team")` khi có team): `SectionHead(subtitle: "Chốt → xuất đi → đã nhận · theo giờ chốt trong kỳ", action: "Xem chi tiết")`; `FunnelLine` kiểu mới; nhãn Đang giao / Hoàn / Hủy / Chưa xuất là `StatusPill` (màu `stShip` / `stRet` / `stCan` / `stNew`), chạm như cũ.
- **Nhân viên** (`.id("nhan-vien")` và móc `nhan-vien` **giữ trên khối này**):
  - `SectionHead("Nhân viên", subtitle: "Tỷ lệ chốt (<rateShort>) · từ 10 đơn chia · Sale và CSKH", action: "So sánh nhân viên")`.
  - `Segmented` 2 ô "TOP 5" | "CẦN HỖ TRỢ" (`@State` trong view, mặc định TOP 5, không lưu).
  - Hàng: `Medal`, `Avatar(32)`, tên + phụ "a chốt / b chia" (`.caption` `ink3`), phải: tỷ lệ `.callout` đậm + `Bar` 84 điểm. Chạm mở `.staffDetail` như cũ.
  - Móc `nhan-vien` vẫn đẩy người đầu của **TOP 5** dù đang chọn ô nào.
- **Mua lại & data** (`.id("mua-lai-team")`): 6 `StatCell` 2 cột; hai link "Mua lại ›", "Data ›" giữ.
- **Khách hàng** (`.id("khach-hang-team")`): 6 `StatCell` 3×2, chạm như cũ; phụ đề "Toàn bộ lịch sử · bấm một ô để mở trang tương ứng".
- **Khách lâu chưa mua**: mỗi mốc một khối: tên + số đậm bên phải; `Bar` (30–45 `good`, 46–60 `warn`, 61–90 `orange`, trên 90 `bad`); ghi chú `.caption`. Chạm như cũ.
- Câu "… chưa lọc theo team." của từng khối giữ.

### 6.4. Tổng quan POS (`OverviewView`, `Home.swift:180-300`; `PosTile`, `PosSpark` ở `Pos.swift`; `PosBreakdown` ở `DashboardView.swift`)

- Thanh trên: "Tổng quan POS" (inline). Phụ đề "Hiệu suất bán hàng theo từng điểm" + `Hint` "Số liệu Pancake" (`PageTitle` trailing).
- `FilterBar { PeriodChips(period: $preset); PosChipRow(selection: …, label: "", allLabel: "Tất cả") }`, rồi `ScopeLine` (`.footnote` `ink3`, giữ chữ "Đang xem: …").
- 4 ô chỉ số `KpiCard` mới ("Doanh thu đơn chốt" dùng `money:`); `ReconcileLine` `.footnote` có icon ✓ `good` / ⚠ `warn`.
- "Xu hướng doanh thu", "Trạng thái đơn hàng" (`StackedBar` + 6 ô `StatusPill` màu trạng thái) đổi kiểu, giữ chữ, giữ chạm.
- `PosTile`: `cardSurface(16)`; bỏ dải màu mờ trên đầu; hàng đầu `PosBadge(28)` + tên ngắn + dòng trạng thái; số doanh thu gọn; `DeltaPill` (từ `Fmt.delta` như cũ); `PosSpark` màu POS; 3 `StatCell` nhỏ "Đơn chốt" / "GTTB" / "Tỷ lệ chốt"; "Tỷ trọng N%" + `Bar` màu POS. Chạm đặt POS như cũ.

---

## 7. Bước U5: Đơn hàng và đơn (`PipelineView.swift`, `Shared.swift`, `Search.swift`)

### 7.1. Tab Đơn hàng (`PipelineView`)

Thứ tự (hình mẫu "Đơn hàng"):
1. **Ô tìm** `SearchField` kiểu mới: cao 38, nền `Palette.fill`, bo 11, kính lúp `ink3`, chữ `.body`, nút xóa giữ nhãn "Xóa chữ đã gõ". Bên phải ô vuông 38×38 nền `fill` bo 11, icon `line.3.horizontal.decrease`, mở `.orders` như nút lọc cũ.
2. Kết quả tìm (logic giữ): thẻ `cardSurface`; `SectionHead("Kết quả tìm · …", action: "Xem tất cả")`; hàng là `OrderCard` (mục 7.2); chữ gợi ý, chữ trống giữ.
3. `FilterBar { PeriodChips(period:); <Pill Menu POS> ; <Pill Menu cách tính> }`:
   - Pill POS: chính là menu POS đang nằm giữa trang (cùng biến trạng thái), **chuyển lên đây**: "Tất cả POS" hoặc tên POS.
   - Pill cách tính: `Menu` "Theo giờ chốt" / "Theo ngày tạo", thay `Segmented` cũ (cùng biến `basis`), icon `clock`.
   - Rồi `ScopeLine`.
4. **Thẻ "Từng bước của đơn"** (chữ mới, bảng 2.5): 5 ô một hàng, mỗi ô nền `cell` bo 12: `IconSquare(28)` + số `.callout` đậm + nhãn `.caption2` `ink3`.
   - Mới (`gray`, `tray`), Xác nhận (`info`, `checkmark.circle`), Giao vận (`warn`, `truck.box`), Đã giao (`good`, `paperplane`), Trả hàng (`bad`, `arrow.uturn.backward`).
   - Bỏ mũi tên giữa các ô. Chạm như cũ. "Mới" hiện 0 khi "Theo giờ chốt" như cũ.
5. Hai `KpiCard`: "Tỷ lệ giao thành công" (số %, ghi chú "N / M đã xuất"), "Tổng đơn chốt" (số đơn; ghi chú `Fmt.shortMoney(tiền)`).
6. **Thẻ "Đơn cần lưu ý"**: thẻ thường (bỏ nền đỏ); tiêu đề có icon `exclamationmark.triangle.fill` màu `bad`; "Xem tất cả" giữ. 4 `ListRow` không icon: tiêu đề, phụ (tách phần trong ngoặc, bảng 2.5), phải "N đơn" (`.callout` `ink2`; dòng "Hoàn / trả hàng" màu `bad`). Chạm như cũ.
7. **Thẻ "Danh sách đơn hàng"**: `SectionHead(action: "Mới nhất")`; hàng chip trạng thái (Mới / Xác nhận / Giao vận / Đã giao) kiểu `FilterChip` mới, cùng cách bật tắt như cũ; tối đa 8 `OrderCard`. Đang tải, lỗi, trống: chữ cũ.

### 7.2. Thẻ đơn (dùng chung)

**Mới `OrderCard`** (thay thân thẻ đơn ở `PipelineView`, kết quả tìm, `RawOrdersView`; `OrderRowView` trong `List` dùng cùng bố cục, không nền):
- Hàng 1: mã đơn `.callout` đậm `.monospaced()`; `StatusPill`; khoảng trống; số tiền `Fmt.money` `.callout` đậm `monospacedDigit`.
- Hàng 2: chấm 8 điểm màu POS + "POS · khách · SĐT · giờ" (giữ thứ tự và chữ cũ) `.footnote` `ink2`.
- Hàng 3: phần còn lại cũ (người bán…) `.caption` `ink3`.
- Vạch ngăn `line` giữa các thẻ trong một khối.

### 7.3. Trang đơn và khách

- `OrderListView`: `List` giữ, hàng `OrderRowView` theo 7.2; câu đầu danh sách (bối cảnh, "Danh sách đơn chưa lọc theo team.", "Lọc theo ngày xác nhận…") `.footnote` giữ chữ. `.searchable` giữ.
- `OrderDetailView`: `List` giữ; `StatusChip` thành `StatusPill`; "Mở trên Pancake POS" giữ.
- `CustomerDetailView`: thẻ hồ sơ `cardSurface`; `Segmented` kiểu mới; `KpiCard` mới; nút "Gọi điện" là `PrimaryButton`; "Nhắn tin" nền `accentSoft` chữ `accent`.
- `CustomerSearchView`: `SearchField` mới + `Pill` menu POS; hàng kết quả `cardSurface(14)`; chữ giữ.
- `ExplainSheet`: số lớn `.system(size: 34, weight: .semibold)` `monospacedDigit` (bỏ `.rounded`); nút "Xem N đơn cấu thành" `PrimaryButton`. Phần còn lại giữ.

---

## 8. Bước U6: Phòng ban và Sale

### 8.1. Tab Phòng ban (`DeptsHome.swift`)

- `DeptCard`: `cardSurface(16)`, padding 16; bỏ vạch màu và icon chuyển màu.
  - Hàng đầu: `IconSquare(icon, tint, size: 36)`; tên `.headline` + số chờ duyệt (viên `badge`, chữ trắng `.caption2` đậm, ví dụ "2 chờ duyệt"); chú thích `.footnote` `ink3` 2 dòng; `chevron.right`.
  - Trang con: lưới 2 cột, mỗi ô nền `cell` bo 10, icon 14 `ink2` + tên `.footnote` vừa, số đỏ nếu có.
  - Bộ phận một trang: ô chữ "bên trong" thành một ô như trên (icon + câu cũ).
- Giữ `StaggerIn`, quyền, nguồn danh sách.

### 8.2. Khung trang bộ phận (`DeptPage`, `SaleContent`, `CskhContent`, `Embed`)

- `DeptPage`: nền `bg`, padding 16, khoảng cách 16; `brandNav()` mới. Móc `cuon:` giữ.
- `SubNav` đầu trang (mục 4.7): Sale 3 trang là phân đoạn; CSKH là dải chip.
- `HrTeamNotice(applies: false)` dưới `SubNav` giữ (dải mới).

### 8.3. So sánh nhân viên (`CompareView`, `CskhViews.swift:693-872`)

Thứ tự mới (hình mẫu "Sale"):
1. Phụ đề (`PageTitle`): "Tỷ lệ chốt = <rateShort> · so với kỳ liền trước".
2. `FilterBar { PeriodChips; PosChipRow(allLabel: "Tất cả POS"); HrTeamChip() }`; dưới đó `Segmented` "Sale | CSKH | Tất cả" (chỉ khi đang hiện như cũ); `ScopeLine`; `HrTeamNotice` (dải).
3. Lọc trong trang: `Pill` menu "Tất cả bộ phận" + ô tìm "Tìm tên nhân viên" (kiểu `SearchField` mới), một hàng.
4. **Thẻ chính** (`cardSurface`): nhãn "Doanh thu chốt · bộ phận Sale|CSKH" `.subheadline` đậm `ink2`; số gọn 44 điểm + `DeltaPill`; dòng "N đơn chốt · nhóm X". Trong thẻ, 4 `StatCell` 2×2: "Tổng nhân sự", "Tổng đơn chia", "Tổng đơn chốt" (chạm mở `Route.orders` như cũ), "Trung vị tỷ lệ chốt". Mỗi ô có `DeltaPill` (nếu có) và ghi chú cũ, **hiện cả hai**.
   - Khi "Tất cả" (không có doanh thu bộ phận): 4 ô là 4 `KpiCard` 2×2 như cũ, kiểu mới.
5. **"NHÂN VIÊN NỔI BẬT"**: thẻ `cardSurface`; `IconSquare("trophy.fill", vàng F2C14E)`; nhãn `.caption` `ink3`; `Avatar(28)` + tên `.headline`; "rateFrac · net"; bên phải tỷ lệ `.system(size: 30, weight: .semibold)` + "%". Chạm mở `staffDetail`.
6. **"Hiệu suất đội ngũ"**: `SectionHead(subtitle: "Tỷ lệ chốt (%) của 15 nhân viên cao nhất · vạch xám: trung vị · vạch xanh: mục tiêu x%")`. Hàng: tên `.footnote` rộng 96; rãnh `fill` cao 10 bo 5; phần tô màu `Fmt.rateTone`; vạch trung vị `ink3` 2 điểm; vạch mục tiêu `good` 2 điểm; số `.footnote` đậm bên phải. Trục 0%–100% `.caption2`. Chạm như cũ.
7. **"Đơn chia vs. tỷ lệ chốt"**: `Scatter` giữ cách vẽ, đổi màu; 4 câu góc `.caption2` `ink3`.
8. **3 `RankBlock`** (bắt buộc giữ, móc `nv-mo` dùng): tiêu đề có `IconSquare` (vương miện vàng / dấu than `bad` / cán cân `orange`), phụ đề cũ; 3 hàng `Medal` + `Avatar(32)` + tên + phụ + số phải. Trống: "Chưa đủ dữ liệu."
9. **Danh sách chi tiết**: `SectionHead("So sánh chi tiết nhân viên (N người)")`; một hàng nút nhỏ: `Pill` menu "Xếp theo: …" (Doanh thu / Đơn chốt / Tỷ lệ chốt) và `ExportButton` "Xuất Excel" kiểu viên viền.
   - Hàng (tối đa 60, như cũ): `Medal`, `Avatar(32)`, tên `.callout` vừa + phụ "bộ phận · kỳ trước x% · net" `.caption` `ink3`; phải: tỷ lệ `.callout` đậm + `DeltaPill(Fmt.changePoints(tỷ lệ, tỷ lệ kỳ trước))` (xanh tăng, đỏ giảm). Chạm mở `staffDetail`.
   - Hình mẫu vẽ biểu đồ nhỏ ở đây; danh sách này không có số từng ngày của từng người nên dùng `DeltaPill`. Biểu đồ nhỏ thật vẫn ở cột "So cùng kỳ" của bảng bên dưới.
10. **`StaffTableBlock`** (chỉ Sale, quyền như cũ): **chuyển xuống đây** (cũ ở ngay dưới bộ lọc). Kiểu ở 8.4.
11. Câu chân "Cách tính: …" giữ, `.caption` `ink3`.

Nội dung trong `VStack` thường (không lười). Móc `nv-mo` và cờ `MktNvTour.compare` giữ.

### 8.4. Từng nhân viên (`StaffTable.swift`) và So cùng kỳ (`StaffCompare.swift`)

- `SectionHead("Từng nhân viên Sale|CSKH", subtitle: "Bảng đầy đủ · vuốt ngang xem thêm cột", info: <phụ đề dài cũ ở Terms.swift:138-140, nguyên văn>)`. Câu cảnh báo nhóm đơn (màu cam) giữ trên màn.
- `CompareControls`:
  - Menu chế độ và menu bước thành `Pill` nhỏ (cao 30, `.footnote`); nhãn VoiceOver "Lùi bao xa" giữ.
  - `Segmented` "Lên xuống / Chênh lệch / Cộng dồn"; "Từng nhân viên:" `.caption` `ink3`; `Segmented` chỉ số.
  - Nút "← Xem cả đội" nền `accentFill`; câu gợi ý `.caption` `ink3`.
  - Tổng: số `.title3` đậm; chênh lệch màu `good`/`bad`.
- `CompareChart` (Swift Charts, giữ): kỳ này `Palette.accent` nét 2,2; kỳ so `Palette.ink4` gạch; cột chênh `good`/`bad`; khung chạm nền `card` viền `line` (thay `material`); chú giải "Kỳ này" / "Kỳ so" `.caption`.
- `StaffRowsTable`:
  - Cột đóng băng "Nhân viên" nền `card`; tiêu đề cột nền `cell`, chữ `.caption2` đậm `ink2`, mũi tên xếp `ink3`.
  - Hàng cao 56, vạch `line`; hàng "Tổng" đậm nền `accentSoft`; số link màu `accent`.
  - Ô đang chọn ở "So cùng kỳ": nền `accentSoft`, viền 2 điểm `accent`.
  - **Bề rộng cột giữ nguyên** (CI chụp ở cỡ chữ lớn nhất). Chữ trong ô `.footnote` + `.minimumScaleFactor(0.7)`.
  - Nhãn VoiceOver, gợi ý giữ.
- `CompareCell`: tăng `Palette.good`, giảm `Palette.bad`, kỳ so `ink4`.
- `WhySheet`, `StaffOrdersView`: `List` giữ; hàng đơn như 7.2.

### 8.5. Data được cấp (`BatchesView`) và Trong ca (`ShiftView.swift`)

- `BatchesView`: phụ đề; `FilterBar { PeriodChips(options: [.month, .last, .d90]) }`; 2 `StatCard`; chip lọc; thẻ tháng `cardSurface`.
- `ShiftView`: phụ đề + `Pill` menu ca (6 ca + "Hôm nay" / "Hôm qua") ở `trailing`; `Ring` + `Tag`; 4 `KpiCard`; "Hiệu suất nhân viên" hàng `Bar` + chữ đánh giá; thẻ cảnh báo nền `badSoft`/`warnSoft`; "Diễn biến trong ca (theo giờ)" cột `accent`; "Xác nhận mới nhất" hàng đơn.

---

## 9. Bước U7: Trang một nhân viên và các trang CSKH

### 9.1. Trang chi tiết nhân viên (`StaffDetail.swift`)

Theo hình mẫu "Nhân viên":
1. **Thẻ đầu** (`cardSurface`):
   - `Avatar(44)` + tên `.title3` đậm + bộ phận `.footnote` `ink3`.
   - `ScopeLine` (giữ chữ) có icon `calendar`.
   - Khối tỷ lệ: trái `Ring(value: rate / 100, size: 96, label: Fmt.pct(rate))`; phải nhãn "Tỷ lệ chốt" `.caption` `ink3`, "<top> / <den> chia|tạo" (`.title` đậm cho tử số, phần sau `.callout` `ink3`), `DeltaPill` điểm (từ số cũ), "Kỳ trước x%" khi có số kỳ trước.
2. **4 ô** `KpiCard` 2×2: "Đơn chốt" (mũi tên, "Theo ngày chốt", mở danh sách), "Doanh thu chốt" (`money:`, "AOV x"), "Số chia" (quy tắc ẩn "—" + "Số chia của CSKH chỉ chủ hệ thống, giám đốc xem"; link "Đơn chia", "<n> SĐT khác nhau"), "Đơn tạo" (link).
3. **Trạng thái** (`.id("nv-status")`): `SectionHead(<tiêu đề cũ>, subtitle: "Đã chốt X / Y · Chưa chốt Z", info: definitions["closed"])`; `StackedBar` màu trạng thái; dòng chú giải: chấm, tên, số, %; chỉ "Mới" và "Hủy" chạm được (có `chevron.right`).
4. **Lý do** (`.id("nv-reasons")`): `SectionHead("Lý do chưa chốt (N đơn)", subtitle: "Chạm một lý do để lọc danh sách", info: definitions["reasons"] + ["productFilter"])`.
   - Mỗi lý do: chấm màu theo loại (thẻ đơn `orange`, ghi chú `info`, khác `gray`), tên, số đậm bên phải, `Bar` cùng màu, "Mới a · Hủy b" `.caption` `ink3`. Đang lọc: nền `accentSoft` bo 12.
   - "Chỉ đếm 2.000 đơn mới nhất." giữ trên màn. Chú giải một hàng: Thẻ đơn / Ghi chú / Khác.
5. Thẻ khác trên đơn chưa chốt: chip nền `cell`. Đang lọc: chip `accentSoft` "Đang lọc: X ✕".
6. **Đơn chưa chốt** (`.id("nv-orders")`): thẻ đơn: mã `.monospaced()` + `StatusPill` + ngày bên phải; `PosBadge(14)` + tên POS ngắn + chip lý do (nền `orangeSoft` chữ `orange`); các dòng "Thẻ: ", "Ghi chú đơn: ", "Ghi chú khách (…): ", "SĐT " `.footnote` `ink2`. Chạm mở đơn. "Hiện N trên M đơn chưa chốt, mới nhất trước." giữ.
- `MktNvScroll` giữ đúng chỗ gắn. Móc `nv-*`, cờ `MktNvTour.staff`, dòng `[NV]`, `[NVQ]` giữ. Chữ 404 giữ.

### 9.2. Các trang CSKH

- **Tổng quan CSKH** (`CskhOverview.swift`): phụ đề; `FilterBar { PeriodChips; HrTeamChip() }` (móc `team-mo` ở chip này); `ScopeLine`; dải team.
  - `CskhKpiProgress` (`.id("team-cskh-kpi")`): `SectionHead("KPI CSKH tháng M/YYYY", action: "Từng người")`; `Ring` tô theo tiến độ (màu `Palette`); số và chữ giữ; thanh có vạch đen (vạch `Palette.ink`); 4 ô nhỏ thành `StatCell` 2×2. Cả thẻ vẫn là link; "Thử lại" vẫn nằm ngoài link.
  - 4 ô chỉ số `KpiCard` mới (ghi chú tỷ lệ giờ hiện được); "Doanh thu CSKH" dùng `money:`.
  - "Doanh thu theo ngày": `LineChart` mới.
  - Thẻ cuộc gọi (`.id("team-cskh-calls")`): `ListRow` icon điện thoại `teal`, "Hôm nay đã gọi N cuộc", dòng cam giữ.
  - "Doanh thu theo nhân viên": hàng `Medal` + tên + số + `Bar` thị phần + ghi chú.
  - `StaffTableBlock(team: "cskh")` kiểu 8.4.
- **Cuộc gọi** (`CallsView`), **Khách theo nhân viên** (`CareView`), **Mua lại & Upsell** (`RepurchaseView`), **Khách lâu chưa mua** (`DormantView`), **KPI CSKH** (`KpiView`):
  - Phụ đề; kỳ bằng `FilterBar`; ô số `KpiCard`/`StatCell` mới; `Ring` mới; chip `FilterChip` mới; thẻ khách `cardSurface(14)` với `Tag` màu mới; nút gọi `IconButton`; biểu đồ cột `BarChart` (`MoreViews.swift:327-346`) màu `accent`.
  - Dải đỏ của Khách lâu chưa mua: nền `badSoft`, chữ `bad`.
  - Không sửa logic các chỗ đang lỗi sẵn (menu xếp không chạy, mũi tên không chạm được): ghi vào tóm tắt, để lượt sau.

---

## 10. Bước U8: Marketing, Vận đơn, Thông báo

### 10.1. Marketing (`MarketingView.swift`)

Theo hình mẫu "Marketing":
1. Phụ đề "Doanh thu, chi phí quảng cáo, số về"; `FilterBar { PeriodChips; PosChipRow(allLabel: "Tất cả POS") }`; `ScopeLine`; lỗi gọn.
2. Dòng "Đang xem": chip bỏ lọc nền `accentSoft` chữ `accent` có `xmark` (gợi ý VoiceOver "Bỏ lọc" giữ), link "Bỏ lọc" màu `accent`; không lọc thì câu cũ `.footnote` `ink3`.
3. **4 ô** `KpiCard` 2×2 (thay `MktBig` + 2 `KpiCard`; bỏ vạch màu trên ô):
   - "Doanh thu MKT" (`money:`, tăng là tốt, ghi chú "N đơn chốt · ROAS x" như cũ).
   - "Chi phí quảng cáo" (`money:`, **tăng là xấu**: `deltaGood: false` khi tăng, như `MktDelta` cũ; ghi chú cũ).
   - "Số về" (ghi chú "N đơn lên", giờ hiện được).
   - "Đơn chốt".
   - Chạm mở `ExplainSheet` như cũ.
4. **`CostCard`**: nền `accentFill`, bo 16, chữ trắng. Hai cột ngăn bởi vạch trắng 20%.
   - Trái: "Chi phí mỗi số" + icon (i) như cũ, số `.system(size: 28, weight: .semibold)` (giữ hàm định dạng cũ), `DeltaPill(onFill: true)` (giảm là tốt, như cũ), câu cũ trắng 80% `.footnote`.
   - Phải: "Chi phí mỗi đơn chốt", số 22 điểm, `DeltaPill(onFill: true)`, "N đơn chốt".
5. **`MktChart`** (Swift Charts, giữ): cột "Số về" `Palette.teal` 70%, đường và chấm "Đơn chốt" `Palette.good`, vạch chọn `ink3` gạch; chú giải một hàng; câu gợi ý chạm giữ. Trục giữ `Fmt`.
6. **"Tách theo"** (`.id("mkt-tach")`):
   - `SectionHead("Tách theo", info: <câu ghi chú sản phẩm cũ, chỉ khi ở tab Sản phẩm>)`; `Segmented` 4 tab.
   - Hàng: `Pill` nhỏ "Xếp theo: …" (Marketer, Team) + câu "Chạm một dòng để xem riêng, chạm lại để bỏ." `.caption` `ink3`. Câu khoá khi POS (`MktSort.posHint`) giữ.
   - `MktRowView`: `Medal` (tab Marketer), tên `.callout` vừa + phụ `.caption` `ink3`; phải số chính `.callout` đậm + dòng phụ `.caption` `good`; 2 thanh mảnh 5 điểm (`orange` chi phí, `teal` số về); chân `.caption` `ink3`. Dòng đang chọn nền `accentSoft` bo 12; dòng khác mờ 0,55 khi đang chọn một marketer.
   - "Xem tất cả N dòng" / "Thu gọn" `.subheadline` `accent` giữa.
   - Bảng xếp Debug (`:279-289`) giữ.
7. **Xếp hạng** (`MarketingRank.swift`, `.id("mkt-hang")`):
   - `SectionHead(<tiêu đề cũ>, subtitle: <câu "Chỉ số theo mốc…">, info: <danh sách "Cách tính" của máy chủ, mỗi dòng "khóa: giá trị">)`. Bỏ `DisclosureGroup` "Cách tính".
   - `Segmented` "Theo team | Theo nhân viên" (giữ thứ tự). `Pill` nhỏ "Xếp theo: X".
   - Hàng: `Medal` + `Avatar(32)` + tên + phụ + số + dòng phụ. Dòng chọn nền `accentSoft`. Chữ dùng kiểu chữ của app (sửa chỗ đang dùng font hệ thống khác).
   - Bảng chi tiết: `List` giữ; nút "Xem riêng …" `.borderedProminent` tint `accentFill`.
8. Câu nguồn cuối trang giữ, `.caption2` `ink3`.

### 10.2. Vận đơn (`VanDonView`, `Departments.swift:566-858`)

- Câu đầu (theo ngày gửi / theo Chờ xác nhận) là phụ đề `.subheadline` `ink3`.
- `FilterBar { PeriodChips; PosChipRow; HrTeamChip() }`; `ScopeLine`; **`HrTeamNotice` (dải, có móc `team-bo`) giữ trên trang này**.
- Ô tổng: "Doanh số chuyển đi" là ô rộng (số gọn 32 điểm, ghi chú cũ "… · không phải doanh thu"); 4 ô 2×2 `KpiCard`: "Đơn chuyển đi", "Hoàn · x%", "Đã nhận", "Không xác nhận được". Chạm mở `ExplainSheet` như cũ. Móc `van-don` / `dong` giữ.
- Phễu: `FunnelLine` mới; nhãn "Chờ xác nhận N", "Không XN được N", "Hủy sau XN N" là `StatusPill`.
- "Theo người lên đơn": lưới kiểu `ShipTable` mới.
- "Người gọi xác nhận": `Avatar(32)` + tên + phụ; phải "XN x%" và "hoàn y%".
- "Lý do không xác nhận được": `Bar` màu `warn`.
- Chân "Số Pancake · đồng bộ …" giữ. Cờ `TeamTourStatus.vanDonReady`, dòng `[TEAMQ]`, `[TEAM] van-don` giữ.

### 10.3. Thông báo (`AlertsPage`, `Tabs.swift:157-248`)

- Phụ đề "Cập nhật lúc HH:mm" / "Đang kiểm tra…".
- Thẻ "Cần xử lý" (`SectionHead` có số đếm) với `AlertRow`.
- Thẻ "Trong ca": hàng cảnh báo có `IconSquare` `bad`/`warn`; "Xem ca" giữ quyền.
- Thẻ "Đồng bộ Pancake" (`.id("dong-bo-pancake")` giữ): hàng `PosBadge(28)` + tên + "đồng bộ lúc …" hoặc lỗi (`bad`) `.footnote`; phải chấm màu + tuổi `.footnote` `ink3`.

### 10.4. `AlertRow` (dùng chung với Hôm nay, `HomeFeed.swift:537-551`)

`ListRow` với `IconSquare` theo loại việc: đồng bộ → `bad` + `arrow.triangle.2.circlepath`; đơn mới → `orange` + `hourglass`; khách CSKH → `purple` + `phone`; nhân sự → `accent` + `checkmark.seal`. Giữ chữ, giữ đích chạm và quyền.

---

## 11. Bước U9: Thêm và các trang phụ

### 11.1. Tab Thêm (`MoreHome`, `MoreGroup`, `SatelliteSection`, hàng chính sách, hàng chẩn đoán widget ở `Tabs.swift:396-556`)

Theo hình mẫu "Thêm" (kiểu Cài đặt iPhone):
- Thẻ hồ sơ: `Avatar(48)`, tên `.headline`, chức danh hoặc email `.footnote` `ink3`, `Tag` vai trò (xanh).
- `ScanLoginRow` trong một `ListGroup`: `IconSquare` nền đặc `accentFill`, icon trắng.
- Nhóm "Tiện ích", "Cài đặt", "Web vệ tinh": tiêu đề nhóm `.footnote` `ink3` viết hoa bằng `.textCase(.uppercase)` (chữ trong mã giữ), mỗi nhóm một `ListGroup`.
- Mỗi hàng `ListRow(filledIcon: true)`, icon trắng trên nền đặc:

| Hàng | Màu nền |
|---|---|
| Tổng quan theo từng POS | `accentFill` |
| Hồ sơ khách hàng | 2F6FD6 |
| Báo cáo cuối tháng | 7B5BD6 |
| Báo cáo tùy chỉnh | E8772E |
| Đơn nguồn Pancake POS | 8A948E |
| Bảo mật tài khoản | 2E9E5B |
| Cách tính | 159A86 |
| Cấu hình & kết nối, Nhật ký hoạt động, Cài đặt trên máy này, Chính sách bảo mật, Chẩn đoán widget, web vệ tinh | 8A948E |

- Hàng web vệ tinh giữ chấm trạng thái, số đỏ, chữ "Cần cập nhật app để dùng", "Mất kết nối web vệ tinh, thử lại sau".
- "Chính sách bảo mật": icon `arrow.up.right` thay `chevron`.
- "Đăng xuất": một `ListGroup` riêng, một hàng chữ `Palette.bad` + icon `rectangle.portrait.and.arrow.right`, chạm gọi `auth.logout()` như cũ.
- "Phiên bản … · MEGATECH POS Operations" `.footnote` `ink3` giữa.
- Móc `team-them-*`, `tourPage` giữ trong `MoreHome`.

### 11.2. Trang phụ (chỉ đổi kiểu bằng bộ thành phần mới, giữ chữ, số, quyền)

- `MonthlyView` (`MoreViews.swift:80-153`): bộ đổi tháng ‹ [tháng] › kiểu `Pill`; `KpiCard` mới ("Tổng doanh thu" dùng `money:`); `SmallStat` vẽ như `StatCell`; `DualLine` tháng này `accent`, tháng trước `ink4`; `PrimaryButton` "Xuất báo cáo"; hộp ghi chú nền `infoSoft`.
- `CustomReportView`: chip `FilterChip` mới; ô chọn biểu đồ: chọn → viền `accent` nền `accentSoft`.
- `RawOrdersView`: dải thông tin nền `infoSoft`; hàng lọc thành `FilterBar` (menu POS, `PeriodMenu`, trạng thái, ô tìm); thẻ đơn `OrderCard`.
- `AuditView`: chip; hàng dòng thời gian `IconSquare` theo loại hành động; "Lỗi {status}" là `Tag` đỏ.
- `SecurityView` (không đụng `LockScreen`), `SessionsSection`: thẻ `cardSurface`, nút `PrimaryButton`/viền; chữ giữ.
- `MetricSettingsView`: hàng chọn có ✓ `accent`; hộp thông tin nền `accentSoft`.
- `AppSettingsView`: như trên.
- `ConfigView` và các sheet: ô POS `cardSurface`, `Tag` trạng thái; nút "Đồng bộ ngay" / "Đồng bộ tất cả" `accentFill`; sheet `Form` giữ hệ thống. Quyền chỉ chủ hệ thống giữ.
- Nhân sự (`HRViews.swift`, `RecruitView.swift`): `SubNav` mới; `KpiCard`/`StatCard` mới; hàng người `ListRow` + `Tag`.
- `WidgetDiagnosticsView` (`WidgetProbe.swift`): chỉ màu và chữ theo kiểu mới; **giữ chữ "Chẩn đoán widget" và "Sao chép kết quả"** (`ios.yml` ghi trong ghi chú bản thử).
- `Approvals.swift`: chỉ `ScanLoginRow`. Không đụng `ApprovalSheet`, `QRScanScreen`.

---

## 12. Bước U10: chế độ tối, cỡ chữ, lượt quay 15, số bản 1.0.0

### 12.1. Rà chế độ tối

Trên mọi màn khi đã đăng nhập (trừ file ở mục 15 "Không làm"), tìm và thay:
- `Color.white`, `.white` làm **nền** → `Color.card` hoặc `Palette.card`. (`.white` làm chữ trên nền xanh đặc thì giữ.)
- `Color.black.opacity(…)`, `.black.opacity(…)` làm nền hay viền → `Palette.fill` / `Palette.line`.
- `Color(red:…)`, `Color(hex:)` ngoài màu POS và màu đặc ở mục 3.1 → token `Palette`.
- `.gray`, `.blue`, `.orange`, `.purple`, `.teal` của hệ thống → token `Palette`.

### 12.2. Rà cỡ chữ

- Không còn `.system(size:)` dưới 20 điểm trên màn đã đăng nhập, trừ: nhãn trục biểu đồ; ô `StaffRowsTable` (bề rộng cố định, đã có `minimumScaleFactor`); `Medal`, `Avatar`, `Ring` (cỡ theo khung).
- Xem lại ảnh `12-chu-lon.png` (CI chụp ở cỡ chữ lớn nhất): bảng nhân viên không vỡ.

### 12.3. VoiceOver

- `Pill` có nhãn "Kỳ: …", "POS: …", "Nhóm đơn: …", "Team: …".
- Chip, phân đoạn đang chọn có `.isSelected`.
- `InfoButton` "Giải thích: …"; `DeltaPill` "tăng … / giảm …"; số gọn đọc `Fmt.money` đầy đủ.

### 12.4. Số bản

`project.pbxproj`: `MARKETING_VERSION = 1.0.0` và `CURRENT_PROJECT_VERSION = 12` ở cả 4 chỗ mỗi khóa (app và widget, Debug và Release; bản 0.11 ở dòng 296, 310, 325, 339, 353, 363, 378, 388). Không sửa dòng khác. Thẻ phát hành sau khi merge sẽ là `ios-v1.0.0-12`.

### 12.5. Lượt quay `MEGATECH_TOUR=giaodien` (DEBUG, `Tabs.swift`)

- `DebugTour.run`: thêm nhánh `giaodien` (đặt cạnh các nhánh `MEGATECH_TOUR` khác).
- `MktNvTour.active`: trả `true` khi `MEGATECH_TOUR` là `mktnv` **hoặc** `giaodien` (để các cờ `compare`, `staff`, `marketing` và móc `nv-mo` chạy).
- Mốc in `[UI] moc=<tên>` (có `fflush(stdout)`). Chờ cờ quá 60 giây (dùng cách của `mktWait`) thì in `[UI] moc=loi-tai` và dừng.
- Đầu lượt: `nav.period = .month; nav.pos = ""; nav.product = "all"; nav.hrUnit = nil`.

| Mốc | Việc | Chờ |
|---|---|---|
| `hom-nay` | `nav.tab = .home; nav.homePath = []` | 8 giây |
| `tong-quan` | `nav.tab = .overview; nav.overviewPath = []` | 8 giây |
| `tong-quan-so-lieu` | `nav.overviewScroll = "center"` | 4 giây |
| `tong-quan-nhan-vien` | `nav.overviewScroll = "nhan-vien"` | 4 giây |
| `don-hang` | `nav.tab = .orders; nav.ordersPath = []` | 8 giây |
| `phong-ban` | `nav.tab = .depts; nav.deptsPath = []` | 4 giây |
| `sale` | `MktNvTour.compare = false; nav.deptsPath = [.dept(.sale, period: .month, page: "compare")]` | cờ `MktNvTour.compare`, rồi 3 giây |
| `nhan-vien` | `MktNvTour.staff = false; DebugTap.shared.tap("nv-mo")` | cờ `MktNvTour.staff`, rồi 3 giây |
| `cskh` | `nav.deptsPath = [.dept(.cskh, period: .month)]` | 8 giây |
| `mkt` | `MktNvTour.marketing = false; nav.deptsPath = [.dept(.mkt, period: .month)]` | cờ `MktNvTour.marketing`, rồi 3 giây |
| `van-don` | `nav.deptsPath = [.dept(.vandon, period: .month)]` | 8 giây |
| `thong-bao` | `nav.deptsPath = [.alerts]` | 5 giây |
| `them` | `nav.tab = .more` | 4 giây |
| `xong` | | |

Chuyển cảnh trong `withAnimation(.snappy(duration: 0.35))` như hàm `play`.

### 12.6. `.github/workflows/ios-preview.yml`: đoạn 15

Thêm **sau đoạn 14, trước phần "Cờ Face ID"**. Chỉ thêm đoạn này; không sửa dòng nào khác (`timeout-minutes` đã đổi ở U1).

```bash
          # 15. Giao diện 1.0: chụp các màn chính, sáng rồi tối (chỉ ảnh, không video).
          ui_stages=(hom-nay tong-quan tong-quan-so-lieu tong-quan-nhan-vien don-hang phong-ban sale nhan-vien cskh mkt van-don thong-bao them)
          wait_ui() {
            local deadline=$((SECONDS + ${2:-90})) log="$3"
            while (( SECONDS < deadline )); do
              if grep -q '^\[UI\] moc=loi-tai$' "$log"; then
                echo "::error::15-giao-dien: lỗi tải khi chờ mốc $1"; tail -n 40 "$log" | grep -E '^\[(UI|MOC|MKT|NV)\]' || true; return 1
              fi
              if grep -q "^\[UI\] moc=$1$" "$log"; then sleep 1; return 0; fi
              sleep 0.2
            done
            echo "::error::15-giao-dien: thiếu mốc $1"; tail -n 40 "$log" | grep -E '^\[(UI|MOC|MKT|NV)\]' || true; return 1
          }
          for mode in sang toi; do
            xcrun simctl terminate "$UDID" "$BUNDLE" || true
            if [ "$mode" = toi ]; then xcrun simctl ui "$UDID" appearance dark; else xcrun simctl ui "$UDID" appearance light; fi
            log15="$RUNNER_TEMP/ui-15-$mode.txt"
            vars15=(SIMCTL_CHILD_MEGATECH_BASE="$BASE" SIMCTL_CHILD_MEGATECH_SESSION="${TOKEN:-}" SIMCTL_CHILD_MEGATECH_FPS=20 \
              SIMCTL_CHILD_MEGATECH_TOUR=giaodien SIMCTL_CHILD_MEGATECH_NAV_RESET=1)
            env "${vars15[@]}" xcrun simctl launch --stdout="$log15" "$UDID" "$BUNDLE" > /dev/null
            face_on_ask "$log15"
            for stage in "${ui_stages[@]}"; do
              wait_ui "$stage" 90 "$log15"
              xcrun simctl io "$UDID" screenshot "$OUT/15-$mode-$stage.png"
            done
            wait_ui xong 30 "$log15"
          done
          xcrun simctl ui "$UDID" appearance light
          n15=$(ls "$OUT"/15-*.png 2>/dev/null | wc -l | tr -d ' ')
          if [ "$n15" != "$(( ${#ui_stages[@]} * 2 ))" ]; then echo "::error::15-giao-dien: thiếu ảnh ($n15/$(( ${#ui_stages[@]} * 2 )))"; exit 1; fi
          grep -hE '^\[UI\]' "$RUNNER_TEMP"/ui-15-*.txt > "$OUT/15-giao-dien-app.txt" || true
          mark "het-15"
```

- Tên biến máy ảo, `face_on_ask`, `mark` dùng đúng tên đang có trong file (Codex đối chiếu đoạn 13 và 14; khác tên thì dùng tên trong file).
- Không thêm `15-…` vào vòng `ffmpeg` (không có video).
- `ios.yml`: không sửa.

---

## 13. File được sửa ở từng bước (máy kiểm phạm vi theo bảng này)

Đường dẫn ngắn: `M/` = `ios/Megatech/Megatech/`, `W/` = `ios/Megatech/WidgetShared/`.

| Bước | File |
|---|---|
| U1 | `M/Palette.swift` (mới), `M/Theme.swift`, `M/Kit.swift`, `M/Anim.swift`, `M/PeriodChips.swift` (chỉ `QuickChip`), `M/Pos.swift` (chỉ màu, `PosBadge`), `M/Departments.swift` (chỉ `CompanyDept.tint`), `M/Shared.swift` (chỉ `StatusChip`, màu `OrderTimeline`), `M/DashboardView.swift` (chỉ màu `StatusStrip`), `M/Assets.xcassets/AccentColor.colorset/Contents.json`, `W/Format.swift` (chỉ thêm `compactMoney`), `M/FormatSelfTest.swift` (chỉ thêm nhóm `compact`), `.github/workflows/ios-preview.yml` (chỉ dòng `timeout-minutes`) |
| U2 | `M/Kit.swift`, `M/Tabs.swift` (`RootTabs`, `OrdersHome`, `MoreHome` chỉ chỗ gọi `TabPage`, `SubNav`, xóa `CenterTabIcon`), `M/HomeFeed.swift`, `M/Home.swift`, `M/DeptsHome.swift` (chỉ chỗ gọi `TabPage` và bỏ `PageTitle` gốc; `Home.swift:38` chữ theo bảng 2.5), `M/PipelineView.swift` (chỉ ẩn `PageTitle` khi `embedded`), `M/PeriodChips.swift`, `M/Pos.swift` (`PosChipRow`), `M/HrTeam.swift`, `M/NavMemory.swift` (chỉ chữ theo bảng 2.5), các file có `PageTitle`/`navigationTitle` lệch nhau (chỉ dòng `navigationTitle`) |
| U3 | `M/HomeFeed.swift` |
| U4 | `M/Home.swift`, `M/Departments.swift` (bảng bộ phận, `ShipTable`), `M/Metrics.swift` (chỉ `PancakeRefCard`, `RefCell`, `RefDelta`), `M/DashboardView.swift` (`PosBreakdown`), `M/Pos.swift` (`PosTile`, `PosSpark`) |
| U5 | `M/PipelineView.swift`, `M/Shared.swift`, `M/Search.swift` (chỉ `SearchField`), `M/MoreViews.swift` (chỉ thẻ đơn của `RawOrdersView` dùng `OrderCard`) |
| U6 | `M/DeptsHome.swift`, `M/Departments.swift` (`DeptPage`, `DeptDestination`, `SaleContent`, `CskhContent`), `M/Tabs.swift` (`SubNav`), `M/CskhViews.swift` (`CompareView`, `RankBlock`, `Scatter`, `BatchesView`, `Embed`), `M/StaffTable.swift`, `M/StaffCompare.swift`, `M/ShiftView.swift` |
| U7 | `M/StaffDetail.swift`, `M/CskhOverview.swift`, `M/CskhViews.swift` (`CallsView`, `CareView`, `RepurchaseView`, `DormantView`, `KpiView`, `CustomerCallList`), `M/MoreViews.swift` (chỉ `BarChart`) |
| U8 | `M/MarketingView.swift`, `M/MarketingRank.swift`, `M/Departments.swift` (`VanDonView`), `M/Tabs.swift` (`AlertsPage`), `M/HomeFeed.swift` (chỉ `AlertRow`) |
| U9 | `M/Tabs.swift` (`MoreHome`, `MoreGroup`, `SatelliteSection`, hàng chính sách, hàng widget), `M/MoreViews.swift`, `M/Security.swift` (không đụng `LockScreen`, `CoverWindow`, khoá app), `M/Metrics.swift` (`MetricSettingsView`), `M/AppSettings.swift`, `M/Config.swift`, `M/HRViews.swift`, `M/RecruitView.swift`, `M/WidgetProbe.swift` (chỉ `WidgetDiagnosticsView`), `M/Approvals.swift` (chỉ `ScanLoginRow`) |
| U10 | `M/Tabs.swift` (lượt `giaodien` trong `#if DEBUG`, `MktNvTour.active`), mọi file iOS đã sửa ở U1–U9 (chỉ màu tối, cỡ chữ, VoiceOver), `ios/Megatech/Megatech.xcodeproj/project.pbxproj` (chỉ 8 dòng số bản), `.github/workflows/ios-preview.yml` (chỉ đoạn 15) |

- Mọi bước, khi sửa lỗi build hay lỗi CI của chính bước đó, được sửa `M/Kit.swift` và `M/Palette.swift` nhưng không đổi chữ ký thành phần đã có.
- Mọi bước được viết `.codex-out/<bước>/`. Thread PC được thêm `docs/plans/2026-10-18-app-1.0/ket-qua.md` khi xong.
- Cấm sửa ở mọi bước: `LoginView.swift`, `LoginShell.swift`, `Unlock.swift`, `LogoIntro.swift`, `MegatechMascot.swift`, `LaunchClock.swift`, `MegatechApp.swift`, `Session.swift`, `UnlockPrefetch.swift`, `API.swift`, `StaffAPI.swift`, `NavMemory.swift` (ngoài chữ ở U2), `Terms.swift`, `DecodeSelfTest.swift`, `ios/Megatech/MegatechWidget/**`, `W/` ngoài `Format.swift`, `.github/workflows/ios.yml`, `app/**`, `lib/**`, `tests/**`, `android/**`.

---

## 14. Máy kiểm sau mỗi bước (thêm vào phần chung của `CODEX.md` mục 12)

1. Phạm vi file theo mục 13. Không file khóa, không `.env`, không CRLF.
2. Có tóm tắt đủ mẫu (mục 17). Lệnh cấm thì dừng cả phần.
3. Lọc dữ liệu nhạy cảm (regex NHAY như các lượt trước) trên diff: SĐT 10 số, email, token. Riêng `chu@demo.megatech.vn` đã có sẵn trong workflow, không tính.
4. iOS: không thư viện mới, không `import` mới, không `WebView`, không `print` ngoài `#if DEBUG`.
5. **Luật định dạng**: chạy đúng lệnh `grep` của bước "Chặn định dạng số và ngày ngoài Format.swift" trong `ios.yml` trên máy (Git Bash). Có dòng nào là đỏ.
6. **Không API iOS 18**: `git diff` không có dòng thêm khớp `\bTab\(|sidebarAdaptable|MeshGradient|navigationSubtitle|@Entry|onScrollGeometryChange|presentationSizing`.
7. **Móc lượt quay không mất** (so với nền 0.11 `b13a044`):

```bash
BASE=b13a044
for pat in '\.id\("[a-z0-9-]+"\)' '"(xnk|mkt|nv|team|cuon)[a-z0-9:-]*"' 'print\("\[(MOC|NHO|CHAM|XNK|XNKQ|TEAM|TEAMQ|MKT|MKTQ|MKTRQ|NV|NVQ)\][^"]*' 'MktNvTour\.(marketing|rank|compare|staff|done|failed) = true' 'TeamTourStatus\.[a-zA-Z]+ = true' 'CompareTourStatus\.ready = true'; do
  thieu=$(comm -23 <(git grep -ohE "$pat" "$BASE" -- 'ios/Megatech/Megatech/*.swift' | sort -u) \
                   <(git grep -ohE "$pat" -- 'ios/Megatech/Megatech/*.swift' | sort -u))
  [ -z "$thieu" ] || { echo "::error::mất móc lượt quay: $thieu"; exit 1; }
done
```

8. U1: `ios-preview.yml` chỉ khác dòng `timeout-minutes`. U10: `ios-preview.yml` chỉ thêm đoạn 15 (mọi dòng khác giữ; so bằng `git diff -U0`: không có dòng `-`), `project.pbxproj` chỉ khác 8 dòng số bản.
9. Bước U1: `FormatSelfTest.swift` chỉ thêm dòng (không dòng `-`).

---

## 15. Không làm ở lượt này

- Màn đăng nhập, mở khoá, logo mở app, linh vật, màn che riêng tư, `ApprovalSheet`, `QRScanScreen`: giữ nguyên (luôn nền tối).
- Widget (`MegatechWidget/`, `ProbeWidgetView`, `WidgetGallery`): giữ, chỉ số bản theo app.
- API, mã web, giao diện web: không đổi.
- Android: làm sau, theo mục 18, khi anh duyệt bản iPhone và Android Phần A (A0 → A8b) đã xong.
- Sửa các lỗi logic sẵn có ghi trong kiểm kê (menu xếp Khách lâu chưa mua không chạy, dòng "Đơn đang xử lý" mở sai nhóm…): ghi vào tóm tắt, để lượt sau.
- Gộp nhánh demo, mở PR mới, merge `main`, phát hành: tổ app và điều phối lo sau khi anh duyệt (mục 16).

---

## 16. Sau khi chạy xong (tổ app, điều phối)

1. Thread PC: Claude PC kiểm một lần, viết `ket-qua.md`, báo điều phối kèm commit cuối.
2. Tổ app lấy ảnh `15-sang-*.png` và `15-toi-*.png` (nhánh `ios-preview` hoặc artifact `ios-preview` của lần chạy cuối), làm **một trang Artifact** cho anh xem trên điện thoại: từng màn sáng/tối, đặt cạnh hình mẫu. Không gửi file, không gửi video.
3. Anh xem. Anh muốn sửa gì thì tổ app viết `sua-1.md`, giao Codex PC như các lượt trước.
4. Anh nói "phát hành": tổ app merge PR #81 vào `main` (đã gồm 0.11 và giao diện mới). `iOS` tự đăng bản `ios-v1.0.0-12`. Không merge khi anh chưa nói.

---

## 17. Tóm tắt mỗi bước

Theo mẫu `CODEX.md` mục 11, thêm hai mục:
- `## Móc đã giữ`: đếm số `.id("…")`, số tên `DebugTap`, số dòng log trước và sau bước (từ máy kiểm 7).
- `## Ảnh cần xem`: tên các ảnh CI (`12-*`, `13-team-*`, `14-*`, và từ U10 là `15-*`) có màn bước này đổi.

Không tên người, không SĐT, không số thật.

---

## 18. Android (ghi trước, lượt sau, chưa làm)

Khi bản iPhone được duyệt và Android Phần A xong, tổ app viết `docs/plans/<ngày>-android-1.0/giao.md` theo cùng hình mẫu:
- Cùng bảng màu mục 3.1 (bản sáng, bản tối) cho Compose `ColorScheme`, tắt màu động của Android 12+.
- Cùng hàm số gọn (`compactMoney`) và bộ ca kiểm thử mục 3.4.
- Thanh trên lớn (`LargeTopAppBar`) có ô đồng bộ và chuông; thanh dưới 5 mục cùng tên; một hàng nút lọc; thẻ trắng viền mảnh; nút (i).
- Cùng nguyên tắc mục 2: chỉ đổi giao diện, giữ API, quyền, chữ.
