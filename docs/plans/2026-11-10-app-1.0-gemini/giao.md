# App iPhone 1.0.0: dựng theo thiết kế Gemini (19 màn, sáng và tối)

Tổ app viết, 10/11/2026. Người dùng duyệt plan ngày 10/11 ("đồng ý plan app"). Codex trên PC làm B1 đến B8. Claude kiểm một lần khi xong.

**Hình mẫu** (chỉ đọc, không sửa):
- `thiet-ke/index.html`: 19 màn, mỗi màn có khung tối và khung sáng, nhiều khung con (ví dụ 09A1, 11A–F, 16A–H). Mở bằng Chrome (cần mạng vì trang nạp Tailwind). Bấm tên màn ở hàng trên, rồi tên khung con.
- `thiet-ke/anh/<mã khung>.jpg`: ảnh chụp sẵn 56 khung, dùng khi không mở được trang. Tên ảnh là mã khung (`01.jpg`, `09A1.jpg`, `18E.jpg`…).
- `thiet-ke/he-thiet-ke-swiftui.pdf` (bản chữ: `he-thiet-ke-swiftui.txt`): bảng màu, cỡ chữ, lưới, 10 thành phần, 17 tiêu chí tự kiểm.

**Quy tắc đọc hình:**
- Số, tên người trong hình là số minh họa ("NV A", "72,0 tr ₫"). Số trên app luôn lấy từ API. **Không bịa số, không dựng số từ số khác** khi API không trả.
- Chữ ghi chú của người vẽ (dải "MÀN 09 / 19 (ĐÃ SỬA…)", "Đang tải số liệu · Không giả số 0", tên khung, nhãn "Bản Nền Tối") **không đưa vào app**.
- Khối app đang có mà hình không vẽ thì **giữ**, đổi sang kiểu mới. Khối hình có mà API không có số thì làm theo mục 2.3.
- Hình và file này khác nhau thì theo file này.

---

## 0. Cho thread PC (người chạy script)

- **Nhánh.** Worktree `C:\Users\PC\Projects\thp-app10`, nhánh máy `codex/app-1.0`. Kéo `origin/claude/project-thread-avd7td` về (fast-forward; đầu nhánh có file này, đã gộp `main` 68cc914). Đẩy fast-forward lên `claude/project-thread-avd7td`. Không đẩy nhánh khác, không force.
  - Nền code app: 0.11 cộng G1–G4 hướng A (`3cbfa28`). Lượt này làm tiếp trên nền đó, thay phần nhìn.
- **Chín bước theo thứ tự:** `B1` → `B1b` → `B2` → … → `B8` (mục 3, 3b, 4 đến 10). Mỗi bước một lần chạy Codex. Script commit từng bước riêng: `App iPhone 1.0.0 B<n>: <tên bước> (Codex viết trên PC, máy kiểm)`.
- **B1 chỉ đọc và viết báo cáo**, commit có `[skip ci]`. B1b đến B8 không có `[skip ci]`: đẩy, rồi chờ **cả hai** workflow `iOS` và `iOS preview` trên đúng commit đó (PR #81 đang mở nên mỗi lần đẩy GitHub tự chạy).
  - Đỏ: lấy tên job, bước, annotation `::error::`, 40 dòng cuối log bước đỏ, đưa Codex một vòng sửa. **Tối đa 4 vòng mỗi bước.** Hết 4 vòng vẫn đỏ: dừng cả lượt, báo điều phối kèm commit và lỗi. Không chạy bước sau trên nền đỏ.
  - Annotation bắt đầu bằng `demo:` là lỗi máy chủ demo, không sửa code vì nó. `::warning::demo:` coi là xanh.
- **B1 có câu hỏi dừng** (mục 3.3): dừng sau B1, báo điều phối, chờ tổ app trả lời rồi mới chạy B1b.
- **PC không có Xcode.** `iOS` trên GitHub là lần build thật. Máy kiểm (mục 12) chạy trước mỗi lần đẩy.
- **Hạn mức:** tk1 hết thì tk2, tk2 hết thì chờ hồi rồi chạy tiếp, như các lượt trước. Không hỏi người dùng giữa chừng.
- **Telegram:** báo bắt đầu, 20 phút một tin, xong hoặc dừng, bằng script như các lượt trước (mẫu `docs/plans/2026-10-15-api-cho-app/bao-tele-api.sh`). Không đọc khoá bot.
- **Vùng cấm:** `app/**`, `lib/**`, `tests/**`, `migrations/**`, `drizzle/**`, `android/**`, `wrangler*`, `.github/workflows/ios.yml`, `docs/plans/2026-11-10-app-1.0-gemini/thiet-ke/**`, file này. Không đổi web, dữ liệu, Cloudflare. Không gộp nhánh demo.
- **Xong B8:** Claude PC kiểm một lần (diff, tóm tắt 8 bước, CI xanh ở commit cuối), viết `docs/plans/2026-11-10-app-1.0-gemini/ket-qua.md`, báo điều phối kèm commit cuối. Không mở PR mới, không merge, không phát hành.

---

## 1. Người dùng muốn gì

- 18/10: "Giao diện này cũ và chưa trực quan lắm." Hướng A vẽ xong nhưng 09/11 người dùng thấy "hơi sơ sài", nhờ bên khác (Gemini) vẽ lại theo bộ PDF tổ app soạn.
- Gemini vẽ 19 màn, sáng và tối, thân thiện, chuyên nghiệp, dễ dùng, giữ chất MEGATECH (xanh `#17684B`).
- 10/11 người dùng duyệt plan: dựng đúng thiết kế này cho bản 1.0.0. Giữ phần lấy số, đăng nhập, Face ID, bảo mật; làm lại phần nhìn.
- App chỉ cho sếp, SwiftUI thuần iOS 17, không WebView.

---

## 2. Nguyên tắc (đọc trước mọi bước)

### 2.1. Vẫn giữ từ lượt trước

`docs/plans/2026-10-18-app-1.0/giao.md` và `giao-A.md` vẫn là luật nền. Giữ nguyên văn các mục sau, chỉ **phần nhìn** thay bằng file này:

| Mục | Nội dung |
|---|---|
| `giao.md` 2.1 | Không đổi trạng thái, khoá lưu (`thp_*`), quyền (`canView`, `canOpen`, `posLimited`, ẩn số chia, chỉ chủ hệ thống), điều hướng (`Route`, `AppTab`, thứ tự và `tag` 5 tab), cách tính, chữ ra của `Fmt` cũ, `Terms.swift`, dòng `print` Debug. Mỗi bước tự build được. |
| `giao.md` 2.2 | Giữ chữ, trừ chỗ file này ghi đổi. Luật chữ Vận đơn. |
| `giao.md` 2.3 | **Móc lượt quay CI**: bảng móc, neo cuộn `.id`, cờ sẵn sàng, dòng log, "Khác phải giữ". Vỡ một móc là `iOS preview` đỏ. |
| `giao.md` 2.4 | Chỉ API iOS 17, không thư viện mới, luật định dạng số và ngày của `ios.yml`, không `print` ngoài `#if DEBUG`, không `.accessibilityIdentifier`. |
| `giao-A.md` 2.3 | Bảng đổi chữ Vận đơn ("Tính riêng, không cộng vào tổng công ty"). |
| `giao-A.md` 2.5 | Danh sách API iOS được dùng và cấm; hoạt ảnh lặp qua `TimelineView` + `FrameCap`; tắt khi Giảm chuyển động. |
| `giao.md` 3.4 | `Fmt.compactMoney` (đã có từ G1). |

Khác lượt trước:
- **Được thêm API** theo mục 2.2 (lượt trước cấm).
- **Màn 19 Đăng nhập** được đổi phần nhìn ở B8 (mục 10.1), giữ logic.
- Thanh dưới, thẻ, bảng, biểu đồ theo Gemini, không theo hướng A.

### 2.2. Thêm API (chỉ đọc, chỉ khi B1 ghi rõ)

Một số màn Gemini cần số mà app chưa gọi (hồ sơ nhân sự và huy hiệu, số T, KPI team, Điều hành, nhóm sản phẩm, sản phẩm đã giao…). Web đã có route trên `main`. Được:
- Thêm `struct` giải mã và hàm gọi `GET` trong `API.swift` hoặc `StaffAPI.swift`, **chỉ** cho route B1 liệt kê ở bảng "Cần gọi thêm" (mục 3.2).
- Thêm ca vào `DecodeSelfTest.swift` cho mỗi `struct` mới (chỉ thêm dòng).

Không được:
- Sửa hàm gọi, tham số, `struct` đã có; đổi số lần gọi hay lúc gọi của màn cũ.
- Gọi `POST`/`PUT`/`DELETE` mới. Gọi route `app/api/v1/**` của web nhân sự.
- Tự tính số web không trả (cộng, chia, tỷ lệ). App chỉ hiển thị số máy chủ đã tính, trừ chỗ app 0.11 đã tự tính sẵn (giữ như cũ).
- Đọc trường nhạy cảm (SĐT, email, CCCD, ngân hàng, địa chỉ). Hồ sơ nhân sự chỉ đọc trường web trả cho chủ hệ thống, giữ đúng quyền web.

### 2.3. Khi API không có số

- Khối đó **không vẽ số giả**. Thiếu một ô: hiện `—`. Thiếu cả khối: bỏ khối, ghi vào tóm tắt bước mục "Khác hình mẫu".
- Không có số kỳ trước: không vẽ thanh đôi so kỳ, không vẽ viên +/−.
- Không có chuỗi: không vẽ đường. Không dựng chuỗi từ một tổng.
- Vòng và thanh chia đoạn chỉ khi các phần cộng lại đúng bằng tổng.
- **Máy chủ:** từ B1b lượt quay CI dùng web ảo chạy ngay trên máy GitHub (mục 3b), có đủ route mới. Dự phòng vẫn là demo (`demo.tonghopposmegatech.io.vn`, bản 31/10, chưa có `staff-profile`, `staff-tenure`, `kpi2`, `delivered-products`): route trả 404 thì app hiện khung "Chưa có trên máy chủ" (trạng thái Trống của `MTStateContainerView`, mục 4.4), **không** đỏ CI, **không** chặn màn khác tải. Không sửa web, không gộp nhánh demo.

### 2.4. Quy tắc nghiệp vụ (in trên màn)

- Tỷ lệ chốt Sale: `<42%` đỏ, dấu ▼; `≥42%` xanh, dấu ✓. Chỉ Sale. **CSKH không có tỷ lệ chốt**, KPI CSKH là doanh số.
- Hoàn/hủy: `≥7%` đỏ ▲; `5%` đến `<7%` vàng !; `<5%` xanh ✓.
- Không có tỷ lệ: hiện `—`, không hiện `0%`.
- Màu luôn kèm dấu (▲ ▼ ✓ ! ↗ ↘ + −), không chỉ dựa vào màu.
- Vận đơn: chỉ "Đơn chuyển đi", "Doanh số chuyển đi", "Đơn vào Chờ xác nhận", "Người lên đơn", "Người gọi xác nhận". Không "doanh thu", "chốt", "bán hàng" trên màn Vận đơn, kể cả câu phủ định. Luôn có dòng "Tính riêng, không cộng vào tổng công ty".
- Chi nhánh: Hà Nội, Thái Nguyên.
- Tiền trong cùng một danh sách cùng đơn vị (`tr ₫`), qua `Fmt`.
- Mỗi số ghi rõ phạm vi (kỳ, POS, team) ở dòng phụ hoặc nút (i).
- Chạm số mở trang chi tiết và giữ bộ lọc (như cũ).
- Chế độ ẩn số (con mắt) che tiền thành `••• tr ₫` ở mọi thẻ số lớn, nếu app đã có cờ ẩn số; chưa có thì ghi câu hỏi, không tự thêm khoá lưu mới.
- Riêng tư: SĐT, email khách luôn che như app đang làm.

### 2.5. Viết mã

- iOS 17, Swift 5. Chỉ phông hệ thống (SF Pro, SF Pro Rounded). Không `Font.custom(`, không file phông.
- Biểu đồ dùng `Charts` (`LineMark`, `AreaMark`, `BarMark`, `SectorMark`, `RuleMark`, `PointMark`).
- Mọi chữ theo Dynamic Type qua kiểu chữ ở mục 4.2; số lớn có `minimumScaleFactor(0.6)` và `lineLimit(1)`.
- Vùng bấm tối thiểu 44×44, các nút cách nhau ≥ 8.
- Trang không trượt ngang. Chỉ bảng (`MTStickyColumnTable`) cuộn ngang, có bóng mờ ở mép khi còn cột ẩn.
- Phản hồi chạm: co nhẹ (0,97) và `sensoryFeedback(.selection)`, tắt co khi Giảm chuyển động.
- Không `LazyVStack` ở trang có neo cuộn (`giao.md` 2.3).
- File mới đặt trong `ios/Megatech/Megatech/`, thêm vào `project.pbxproj` đúng cách các file trước đã thêm (target app, không vào widget trừ khi file đó widget cần).

---

## 3. Bước B1: đối chiếu 19 màn với API (chỉ đọc)

Không sửa code. Viết `docs/plans/2026-11-10-app-1.0-gemini/doi-chieu.md`.

### 3.1. Cách làm

Với từng khung (56 khung, theo tên ảnh trong `thiet-ke/anh/`):
1. Liệt kê mọi con số, nhãn số, biểu đồ, danh sách trong khung.
2. Với mỗi thứ: app 0.11 đã có chưa (file, `struct`, trường)? Nếu chưa, route web nào trên `main` trả số đó (đọc `app/api/**/route.ts` và `lib/**` để biết tên trường; **không chạy web, không gọi web thật**)?
3. Đánh dấu một trong ba: **Có sẵn** (app đã gọi), **Cần gọi thêm** (web có route, app chưa gọi), **Thiếu** (web không trả).
4. Ghi route đó có trên máy chủ demo chưa: `git cat-file -e origin/claude/project-thread-3ujeoc:<đường dẫn route>`.

### 3.2. Bảng trong `doi-chieu.md`

```
## Khung 01 · Hôm nay
| Thứ trên màn | Trạng thái | App: file/struct.trường | Web: route?tham số → trường | Demo có? |

## Cần gọi thêm (tổng hợp)
| Route | Tham số | Struct mới | Trường dùng | Màn | Demo có? |

## Thiếu (web không trả)
| Màn | Thứ thiếu | Đề xuất: bỏ khối / hiện — / hỏi người dùng |

## Câu hỏi
```

### 3.3. Dừng và hỏi

Dừng sau B1, báo điều phối, chờ trả lời nếu:
- Có mục **Thiếu** mà đề xuất là "hỏi người dùng" (khối chính của một màn: số lớn đầu trang, bảng chính).
- Một số trong hình cần **đổi cách tính** hoặc **đổi nghĩa** so với web.
- Một route cần quyền khác quyền chủ hệ thống.

Không có các trường hợp trên thì vẫn dừng sau B1 để tổ app duyệt bảng "Cần gọi thêm" (một lần), rồi chạy B2 đến B8 liền mạch.

---

## 3b. Bước B1b: web ảo chạy ngay trên máy GitHub cho lượt quay thử

Người dùng duyệt 10/11 02:15Z ("Web ảo trên GitHub", rồi "đồng ý"). Lý do: máy chủ demo đang bản 31/10, thiếu route mới; người dùng cấm cập nhật demo vì tốn Cloudflare.

### 3b.1. Việc

- Script mới `scripts/ci/web-ao.sh` (bash, chạy trên `macos-latest`), bật web tổng chế độ demo bằng code của chính commit đang chạy:
  1. `pnpm install --frozen-lockfile` (Node 22, `pnpm/action-setup` + `actions/setup-node` đặt ở workflow). Nếu tải `xlsx` từ `cdn.sheetjs.com` lỗi thì dừng với `::error::web-ao: cài gói`; **không** đổi `package.json`.
  2. `pnpm build`, rồi `node scripts/deploy-demo.mjs --local` (chỉ ghi `dist/server/wrangler.demo.json`, không gọi Cloudflare).
  3. Từ file đó tạo `dist/server/wrangler.ci.json`: bỏ `ai`, `routes`, cron (`triggers.crons = []`), `ratelimits`, `services` và binding nào cần Cloudflare thật; thêm biến `DEMO_MODE=1`, `LOCAL_DEV=1`. Tham khảo cách QA làm: `/mnt/project-files/qa/cho-test/dung-cho-test.sh` (Claude PC đọc giúp nếu Codex không thấy file này) và cách bản PC chạy `wrangler dev --local`.
  4. `wrangler d1 migrations apply DB --local --persist-to "$RUNNER_TEMP/wstate"` với cấu hình chỉ có D1 (như script QA).
  5. Chạy nền `pnpm exec wrangler dev --config dist/server/wrangler.ci.json --local --ip 127.0.0.1 --port 8788 --persist-to "$RUNNER_TEMP/wstate"`, log vào `$RUNNER_TEMP/web-ao.log`.
  6. Chờ tối đa 180 giây tới khi `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/api/auth/me` ra mã HTTP (bất kỳ, khác `000`). Hết giờ: in 60 dòng cuối log và `exit 1`.
  7. Gọi một lần các route demo cần để có số (đăng nhập `chu@demo.megatech.vn` / mật khẩu demo công khai, rồi `GET /api/reports/overview`), để chế độ demo tự dựng người và đơn ảo. Nếu demo cần bước đồng bộ thì gọi đúng route web đang dùng cho việc đó ở chế độ demo (đọc `lib/demo/mode.ts`), không viết SQL tay.
- `ios-preview.yml`:
  - Thêm bước "Web ảo" trước bước "Phiên đăng nhập bản demo": cài Node 22 + pnpm, chạy `bash scripts/ci/web-ao.sh`. Thành công thì ghi `BASE=http://127.0.0.1:8788` vào `$GITHUB_ENV`.
  - **Dự phòng:** bước "Web ảo" đặt `continue-on-error: true`. Hỏng thì giữ `BASE` cũ (demo), in `::warning::web-ao: không bật được, dùng demo`. Lượt quay vẫn chạy như trước.
  - Bước đăng nhập demo dùng `$BASE` như cũ (đã dùng biến), không đổi gì khác.
  - Cuối job (bước `if: always()`): dừng tiến trình `wrangler`, chép 200 dòng cuối `web-ao.log` vào thư mục ảnh đầu ra (đã lọc: không token, không cookie).
  - Tăng `timeout-minutes` nếu cần (một dòng).
- Máy ảo iOS gọi được `127.0.0.1` của máy GitHub; app đã cho phép mạng nội bộ (`NSAllowsLocalNetworking` trong `ios/Megatech/Info.plist`). Không sửa `Info.plist`.

### 3b.2. Cấm

- Không `wrangler deploy`, `wrangler login`, không `--remote`, không dùng `CLOUDFLARE_API_TOKEN` hay secret nào. Web ảo chỉ sống trong máy GitHub của lượt chạy.
- Không sửa `app/**`, `lib/**`, `package.json`, `pnpm-lock.yaml`, `wrangler*.json*` gốc, `migrations/**`, `drizzle/**`, `deploy.yml`, `ios.yml`.

### 3b.3. Xong khi

- `iOS preview` trên commit B1b xanh, log có dòng `web-ao: sẵn sàng` và `BASE=http://127.0.0.1:8788`.
- Ảnh các đoạn 12–14 có số (không phải màn lỗi tải).
- Thử thêm một lần gọi `GET /api/reports/staff-profile` (tham số theo route) từ script: mã 200. Ghi kết quả vào tóm tắt.
- Đỏ thì sửa tối đa 4 vòng như mọi bước. Hết 4 vòng: để nguyên phần dự phòng (dùng demo), ghi lý do vào tóm tắt, **đi tiếp B2**, báo điều phối một dòng.

---

## 4. Bước B2: hệ thiết kế và thanh 5 tab

### 4.1. Màu (`Palette.swift`)

Thay giá trị trong `Palette` bằng bảng Gemini (`he-thiet-ke-swiftui.txt` mục 1). Giữ khung `Palette.dynamic(light, dark)`. Thêm tên mới, trỏ tên cũ sang tên mới để code cũ vẫn build:

| Tên mới | Sáng | Tối | Tên cũ trỏ vào |
|---|---|---|---|
| `mtBrandPrimary` | `#17684B` | `#17684B` | `brand`, `accentFill` |
| `mtBackground` | `#F4F7F5` | `#071711` | `bg` |
| `mtSurfaceCard` | `#FFFFFF` | `#0E291F` | `card`, `cardEnd`, `nav`, `segSel` |
| `mtCardBorder` | `#DCE6E0` | `#34D399` 18% | `line` (chỉ viền thẻ) |
| `mtSurfaceCell` | `#F4F8F6` | `#071912` | `wash`, `cell`, `fill`, `grid` |
| `mtTextPrimary` | `#0F291E` | `#F0FDF4` | `ink`, `heroInk` |
| `mtTextSecondary` | `#335C4A` | `#A7F3D0` | `muted`, `ink2`, `ink3`, `heroMuted` |
| `mtSuccessInk` / `mtSuccessBg` | `#0F5E3F` / `#D1FAE5` | `#6EE7B7` / `#10B981` 20% | `good` / `goodSoft` |
| `mtWarningInk` / `mtWarningBg` | `#78350F` / `#FEF3C7` | `#FDE68A` / `#F59E0B` 16% | `warn` / `warnSoft` |
| `mtDangerInk` / `mtDangerBg` | `#BE123C` / `#FFE4E6` | `#FDA4AF` / `#F43F5E` 20% | `bad` / `badSoft` |
| `mtRolePurpleInk` / `mtRolePurpleBg` | `#4C1D95` / `#F3E8FF` | `#DDD6FE` / `#8B5CF6` 25% | `purple` / `purpleSoft` |

- Màu có độ mờ: dùng `UIColor(rgb:alpha:)` trong `dynamic` (thêm tham số alpha mặc định 1 nếu cần), không dùng `Color.mix`.
- Thêm `extension Color { static let mtBrandPrimary = Palette.mtBrandPrimary … }` cho đủ tên ở bảng trên, để code viết như PDF.
- Màu bộ phận (`sale`, `cskh`, `mkt`, `vandon`, `hr`), màu POS, huy chương, trạng thái đơn (`stNew`…`stCan`): giữ tên, chỉnh giá trị cho khớp ảnh Gemini nếu ảnh dùng màu khác; không có trong ảnh thì giữ.
- `hero*`: thẻ số lớn Gemini là thẻ thường (`mtSurfaceCard`, viền `mtCardBorder`), không nền màu riêng. Trỏ `hero`, `heroStart`, `heroEnd` về `mtSurfaceCard`; `heroGlow` về `mtBrandPrimary` độ mờ 0,12 (quầng nhẹ góc trên thẻ số lớn ở bản tối, xem ảnh `01.jpg`).

### 4.2. Chữ, lưới, bo góc

Thêm `enum MT` trong `Palette.swift` (hoặc file mới `MTTokens.swift`):
- Chữ (đều theo Dynamic Type, dùng `relativeTo:`):
  - `heroNumber`: `.system(size: 30, weight: .heavy, design: .rounded)` relative `.largeTitle`, luôn `.monospacedDigit()`.
  - `screenTitle`: `.title2.bold()`.
  - `cardMetric`: `.system(size: 17, weight: .bold, design: .rounded)` relative `.headline`, `.monospacedDigit()`.
  - `cardHeader`: `.system(size: 15, weight: .bold)` relative `.subheadline`.
  - `body`: `.system(size: 12, weight: .medium)` relative `.footnote`, `.monospacedDigit()` trong bảng.
  - `caption`: `.system(size: 11, weight: .medium)` relative `.caption`.
  - Size cố định + `relativeTo` làm bằng `@ScaledMetric` hoặc `Font.system(size:…)` với `.dynamicTypeSize` — chọn cách build được ở iOS 17, ghi trong tóm tắt.
- Lưới: `MT.gutter = 16`, `MT.cardGap = 12`, `MT.cardPad = 16`, `MT.cellGap = 8`.
- Bo góc: `MT.rCard = 16`, `MT.rCell = 12`, `MT.rSeg = 11`, `MT.rSheet = 24`.

### 4.3. Mười thành phần (file mới `MTKit.swift`)

Tên theo PDF mục 3. Mỗi thành phần có VoiceOver (gộp nhãn + số + phạm vi thành một câu), Dynamic Type, Giảm chuyển động.

1. **`MTMetricHeroCard`**: nhãn, số lớn, dòng phạm vi (kỳ · POS · team), viên so kỳ (tuỳ chọn), nút (i) (tuỳ chọn), chạm mở trang. Ẩn số theo mục 2.4.
2. **`MTStatCell`**: nhãn 11 trên, số 17 dưới, dòng phụ tuỳ chọn, `mtSurfaceCell`, bo 12. Dùng trong lưới 2 cột.
3. **`MTComparisonBarRow`**: hai thanh ngang "kỳ trước / kỳ này" (hoặc "hôm qua cùng giờ / giờ này") cùng thang, số ở cuối mỗi thanh, viên chênh lệch. Chỉ khi có số kỳ trước (mục 2.3).
4. **`MTTrendChart`** (`LineMark` + `AreaMark`, nét đứt kỳ trước nếu có chuỗi kỳ trước, `chartXSelection` hiện số tại điểm chạm) và **`MTDonutChart`** (`SectorMark`, giữa vòng là tổng). Trục dùng `AxisValueLabel { Text(Fmt.…) }`.
5. **`MTStickyColumnTable`**: cột đầu (tên) đứng yên, các cột sau cuộn ngang trong `ScrollView(.horizontal)`, tiêu đề cột bấm để xếp (giữ cách xếp app đang có), dòng Tổng cuối, bóng mờ mép phải khi còn cột ẩn, biểu tượng ⇄ gợi ý cuộn. Giữ `.id` neo cột của `StaffTable` (`giao.md` 2.3).
6. **`MTRateBadge`**: nhận `rate: Double?` và `kind: .saleClose | .refund`, tự chọn màu và dấu theo mục 2.4. `nil` → `—`.
7. **`MTFilterBarPill`** + **`MTFilterSheet`**: một hàng viên lọc (Kỳ, POS, Nhóm, Team), viên tự giãn dòng không cắt chữ, chạm mở tấm từ đáy (bo 24, `presentationDetents([.medium, .large])`). Dùng lại logic `PeriodChips`, `PosChipRow`, `ProductPill`, `HrTeamChip`; móc `team-mo` vẫn trên viên Team.
8. **`MTSegmentedControl`**: chuyển khung con trong một màn (ví dụ "Bốn bộ phận | Số liệu | Theo POS"), bo 11, vùng bấm ≥ 44.
9. **`MTStateContainerView`**: 5 trạng thái: Đang tải (khung xương `.redacted(reason: .placeholder)`, nhấp nháy tắt khi Giảm chuyển động), Lỗi (câu lý do + nút "Thử lại", **giữ móc `DebugRetry.tick` như `StateView`**), Trống, Mất mạng, Có số. Thay phần nhìn của `StateView` bằng thành phần này; giữ chữ ký `StateView` (gọi lại `MTStateContainerView` bên trong).
10. **`MTRootTabView`**: phần nhìn của thanh 5 tab trong `RootTabs` (`Tabs.swift`). Biểu tượng: `house.fill` Trang chủ, `shippingbox.fill` Đơn hàng, `chart.bar.fill` Tổng quan, `building.2.fill` Phòng ban, `ellipsis.circle.fill` Thêm. Tab chọn màu `mtBrandPrimary` (bản tối dùng `mtSuccessInk` cho đủ tương phản). Giữ `TabView`, `tag`, thứ tự, `RootTabs.onAppear`, `.task { DebugTour.run }`. Nền thanh: `mtSurfaceCard` với viền trên `mtCardBorder` (dùng `toolbarBackground`, không thanh tự vẽ nổi).

Thành phần cũ trong `Kit.swift` (`KpiCard`, `StatCell`, `StatTile`, `PairBars`, `Segmented`, `Pill`, `FilterBar`, `LineChart`, `Ring`, `SplitBar`, `Panel`, `Card`, `SectionHead`, `TabHeader`…): giữ tên và chữ ký, đổi bên trong sang gọi thành phần MT hoặc dùng màu và chữ mục 4.1, 4.2. Không xoá thành phần còn chỗ gọi.

### 4.4. Khung trang (`TabPage`)

- Tiêu đề lớn 22 đậm (mục 4.2) bên trái, nút đồng bộ và chuông bên phải (giữ `SyncButton`, `BellButton`, chữ `SyncStatus.short`).
- Nền `mtBackground`, lề 16, khoảng giữa thẻ 12.
- Hàng lọc `MTFilterBarPill` ngay dưới tiêu đề ở màn có lọc.
- Ghi chú dài cất vào nút (i) (`InfoButton`, `InfoSheet`); câu phải luôn hiện (`giao.md` 2.2) vẫn để trên màn, đặt cuối thẻ, chữ `caption`.

### 4.5. Phạm vi B2

Chỉ hệ thiết kế và khung. Màn nào trông khác vì đổi màu và thành phần thì chấp nhận; chưa sửa bố cục từng màn.

---

## 5. Bước B3: màn 01 Hôm nay, 14 Thông báo, 18 Bộ lọc và trạng thái

Hình: `01.jpg`, `14.jpg`, `18A.jpg` đến `18G.jpg`.

- **01 Hôm nay** (`HomeFeed.swift`): theo thứ tự trong hình. Thẻ số lớn doanh thu hôm nay (`MTMetricHeroCard`), thanh đôi "hôm qua cùng giờ / giờ này" (`MTComparisonBarRow`, số app đã có), lưới ô 2 cột bốn bộ phận, thẻ Vận đơn hôm nay (chữ theo mục 2.4), danh sách cảnh báo (`AlertRow`). Giữ mọi khối app đang có, chạm ra đúng trang như cũ.
- **14 Thông báo** (`AlertsPage`, `Tabs.swift`; `AlertRow` dùng chung): hàng có biểu tượng tròn màu theo loại, giờ bên phải, nhóm theo ngày nếu app đã có ngày. Giữ neo `dong-bo-pancake`.
- **18 Bộ lọc và trạng thái**: tấm lọc (18A–C) dùng `MTFilterSheet`; khung 5 trạng thái (18D–G) dùng `MTStateContainerView`. Áp vào mọi màn đã có lọc và `StateView`. Riêng 18E: **không** in "Không giả số 0", chỉ khung xương.

---

## 6. Bước B4: màn 02–04 Tổng quan, 05–06 Đơn hàng

Hình: `02.jpg`, `03.jpg`, `04.jpg`, `05.jpg`, `06A.jpg` đến `06C.jpg`.

- **Tổng quan** (`Home.swift`, `Departments.swift`, `Pos.swift`, `DashboardView.swift`, `Metrics.swift`): đầu trang có `MTSegmentedControl` ba khung "Bốn bộ phận" (02), "Số liệu" (03), "Theo POS" (04).
  - Segmented chỉ đổi khung đang hiện. **Neo cuộn** `sale`, `cskh`, `mkt`, `vandon`, `center`, `nhan-vien` và các neo team phải còn trên khung con đang hiện khi lượt quay chạm (`nav.overviewScroll`). Cách an toàn: lượt quay hay `nav.overviewScroll` trỏ neo thuộc khung nào thì đổi segmented sang khung đó trước khi `scrollTo`. Móc `nhan-vien` nằm trên khung "Số liệu". Ghi cách làm trong tóm tắt.
  - Segmented nhớ lựa chọn trong phiên (`@SceneStorage` với khoá mới `thp_overview_seg`; đây là khoá mới duy nhất được thêm ở lượt này).
  - 02: bảng 4 bộ phận (`MTStickyColumnTable` nếu hình là bảng), tỷ lệ bằng `MTRateBadge`. `/api/reports/sections` không có kỳ trước: không vẽ thanh đôi ở đây.
  - 03: thẻ số theo kỳ, biểu đồ `MTTrendChart` từ chuỗi có thật, khối Nhân viên TOP 5.
  - 04: thẻ từng POS (`PosTile`), đường nhỏ (`PosSpark`), chia theo POS (`PosBreakdown`).
- **Đơn hàng** (`PipelineView.swift`, `Shared.swift`, `Search.swift`): 05 cột/nhóm trạng thái, ô tìm, thẻ đơn; 06A–C trang đơn, dòng thời gian, khách. SĐT khách che như cũ.

---

## 7. Bước B5: màn 07 Phòng ban, 08–10 Sale, bảng nhân viên, trang một nhân viên

Hình: `07.jpg`, `08A.jpg`, `08B.jpg`, `09A1.jpg`, `09A2.jpg`, `09B.jpg` đến `09D.jpg`, `10.jpg`.

- **07** (`DeptsHome.swift`): thẻ từng bộ phận, chi nhánh Hà Nội / Thái Nguyên nếu app có số theo chi nhánh.
- **08** (`DeptPage`, `SaleContent`, `CompareView`, `RankBlock`): đầu trang Sale, xếp hạng, so sánh. Tỷ lệ chốt bằng `MTRateBadge(.saleClose)`.
- **09** (`StaffTable.swift`, `StaffCompare.swift`, `BatchesView`, `ShiftView.swift`): 09A bảng nhân viên `MTStickyColumnTable` (cột đầu tên + nhãn số T nếu B1 có nguồn), dòng "Tổng" cuối; 09B So cùng kỳ (giữ móc `xnk-*`); 09C Data được cấp; 09D Trong ca.
- **10** (`StaffDetail.swift`): trang một nhân viên. Huy hiệu, mốc (ngày vào → tài khoản POS → đơn đầu), số T chỉ khi B1 đã đưa vào "Cần gọi thêm" và tổ app đã duyệt; tên huy hiệu lấy nguyên chữ web trả. Giữ móc `nv-*`, `cuon:<id>`.

---

## 8. Bước B6: màn 11 CSKH, 12 Marketing, 13 Vận đơn

Hình: `11A.jpg` đến `11F.jpg`, `12A.jpg`, `12B.jpg`, `13.jpg`.

- **11** (`CskhOverview.swift`, `CskhViews.swift`): sáu khung A–F theo hình (tổng quan, gọi điện, chăm sóc, mua lại, khách lâu chưa mua, KPI). **Không tỷ lệ chốt ở CSKH.** Giữ neo `team-cskh-kpi`, `team-cskh-calls`, móc `team-chon-cskh`.
- **12** (`MarketingView.swift`, `MarketingRank.swift`): 12A tổng quan MKT (DT New + DT CSKH = doanh thu MKT, đúng như web trả), 12B xếp hạng. Giữ mọi móc `mkt-*`, neo `mkt-tach`, `mkt-hang`.
- **13** (`VanDonView` trong `Departments.swift`): chữ theo mục 2.4. Nhãn bộ phận Vận đơn màu `mtRolePurple`. Giữ móc `van-don`, `dong`, `team-bo`. Không chuyển `VanDonView` ra file khác.

---

## 9. Bước B7: màn 15–16 Thêm và 8 trang phụ, 17 Nhân sự

Hình: `15A.jpg` đến `15C.jpg`, `16A.jpg` đến `16H.jpg`, `17A.jpg` đến `17F.jpg`.

- **15** (`MoreHome`, `MoreGroup`, `SatelliteSection` trong `Tabs.swift`): nhóm hàng có biểu tượng vuông màu. Giữ móc `team-them-*`, hàng chính sách, hàng chẩn đoán widget.
- **16A–H** trang phụ (`MoreViews.swift`, `Metrics.swift` `MetricSettingsView`, `AppSettings.swift`, `Config.swift`, `Security.swift` phần cài đặt, `Approvals.swift` `ScanLoginRow`, `WidgetProbe.swift` `WidgetDiagnosticsView`): đổi kiểu theo hình, giữ chữ, số, quyền. Không đụng `LockScreen`, `CoverWindow`, khoá app.
- **17 Nhân sự** (`HRViews.swift`, `HR.swift`, `RecruitView.swift`): 17A tổng quan, hồ sơ, huy hiệu, sơ đồ, duyệt, tuyển dụng theo hình. Dữ liệu chỉ từ route đã có (`/api/sat/hr/*`, `/api/recruit/*`) và route B1 đã duyệt. Nhãn chức danh Leader màu `mtRolePurple`. Không hiện trường nhạy cảm.

---

## 10. Bước B8: màn 19 Đăng nhập, rà sáng/tối và chữ to, số bản 1.0.0

### 10.1. Màn 19 Đăng nhập (hình `19A.jpg` đến `19E.jpg`)

Được sửa **phần nhìn** của `LoginView.swift`, `LoginShell.swift`: màu, chữ, bố cục thẻ, nút theo hình.

Giữ nguyên, không đổi một dòng logic:
- Luồng đăng nhập, xác minh, mã 2 lớp, quét QR, khoá `thp_last_email`, gọi API.
- `LogoIntro.swift`, `MegatechMascot.swift`, `LaunchClock.swift`, `Unlock.swift`, `Session.swift`, `UnlockPrefetch.swift`, `MegatechApp.swift`: **không sửa**. Giờ hỏi Face ID tự động phụ thuộc thời lượng logo (hết lúc 6,35 giây) và CI có đoạn kiểm Face ID.
- Chữ trên màn đăng nhập giữ nguyên văn.
- Nếu đổi phần nhìn làm đỏ đoạn Face ID hay đoạn đăng nhập của `iOS preview` sau 2 vòng sửa: trả `LoginView.swift`, `LoginShell.swift` về như đầu bước, ghi vào tóm tắt, đi tiếp.

### 10.2. Rà màu

Mọi màn đã đăng nhập: không còn `Color.white`/`.black` làm nền, `Color(red:…)`, `Color(hex:)` ngoài màu POS và huy chương, màu hệ thống `.gray .blue .orange .purple .teal .green .red`. Thay bằng token mục 4.1.

### 10.3. Rà chữ to

Chạy thử bằng biến môi trường cỡ chữ của lượt quay (nếu có) hoặc đọc mã: ở cỡ `accessibility2` không chữ nào bị cắt, số và `₫` không rớt dòng riêng, bảng vẫn cuộn ngang được.

### 10.4. Số bản

`MARKETING_VERSION = 1.0.0`, `CURRENT_PROJECT_VERSION = 12` (8 dòng trong `project.pbxproj`).

### 10.5. Lượt quay `giaodien` và đoạn 15 `ios-preview.yml`

Như `giao.md` 12.5 và 12.6 (chưa làm ở lượt trước). Mốc chụp, sáng rồi tối:
`hom-nay tong-quan tong-quan-so-lieu tong-quan-pos don-hang phong-ban sale nhan-vien nhan-vien-mot cskh mkt van-don thong-bao them nhan-su dang-nhap`.
- `dang-nhap`: chụp màn đăng nhập ở đầu lượt `giaodien` nếu lượt đó đi qua màn đăng nhập; nếu không đi qua thì bỏ mốc này, ghi trong tóm tắt.
- Màn mà route chưa có trên demo (mục 2.3) vẫn chụp, ảnh hiện khung "Chưa có trên máy chủ".
- `ios-preview.yml`: chỉ thêm đoạn 15 (không dòng `-`) và nếu cần thì tăng `timeout-minutes` (một dòng).

---

## 11. Phạm vi file

`M/` = `ios/Megatech/Megatech/`, `W/` = `ios/Megatech/WidgetShared/`.

| Bước | Được sửa |
|---|---|
| B1 | `docs/plans/2026-11-10-app-1.0-gemini/doi-chieu.md` (mới) |
| B1b | `scripts/ci/web-ao.sh` (mới), `.github/workflows/ios-preview.yml` (bước Web ảo, dự phòng, dọn cuối job, `timeout-minutes`) |
| B2 | `M/Palette.swift`, `M/MTKit.swift` (mới), `M/MTTokens.swift` (mới, nếu tách), `M/Theme.swift`, `M/Kit.swift`, `M/Anim.swift`, `M/Tabs.swift` (chỉ `RootTabs` phần nhìn, `TabPage` nếu ở đây), `M/PeriodChips.swift`, `M/Pos.swift` (`PosChipRow`), `M/HrTeam.swift` (phần nhìn), `M/Shared.swift` (`StatusChip`, `StatusPill`), `M/Assets.xcassets/AccentColor.colorset/Contents.json`, `ios/Megatech/Megatech.xcodeproj/project.pbxproj` (chỉ thêm file mới) |
| B3 | `M/HomeFeed.swift`, `M/Tabs.swift` (`AlertsPage`), `M/Kit.swift`, `M/MTKit.swift`, mọi file có `StateView`/lọc (chỉ chỗ gọi) |
| B4 | `M/Home.swift`, `M/Departments.swift` (bảng bộ phận, `ShipTable`), `M/Pos.swift`, `M/DashboardView.swift`, `M/Metrics.swift` (`PancakeRefCard`, `RefCell`, `RefDelta`), `M/PipelineView.swift`, `M/Shared.swift`, `M/Search.swift`, `M/MoreViews.swift` (chỉ thẻ đơn), `M/Tabs.swift` (chỉ `DebugTour` nếu cần đổi segmented trước khi cuộn) |
| B5 | `M/DeptsHome.swift`, `M/Departments.swift` (`DeptPage`, `SaleContent`), `M/CskhViews.swift` (`CompareView`, `RankBlock`, `Scatter`, `BatchesView`, `Embed`), `M/StaffTable.swift`, `M/StaffCompare.swift`, `M/ShiftView.swift`, `M/StaffDetail.swift` |
| B6 | `M/CskhOverview.swift`, `M/CskhViews.swift`, `M/MarketingView.swift`, `M/MarketingRank.swift`, `M/Departments.swift` (`VanDonView`) |
| B7 | `M/Tabs.swift` (`MoreHome`, `MoreGroup`, `SatelliteSection`), `M/MoreViews.swift`, `M/Metrics.swift`, `M/AppSettings.swift`, `M/Config.swift`, `M/Security.swift` (trừ `LockScreen`, `CoverWindow`, khoá), `M/Approvals.swift` (`ScanLoginRow`), `M/WidgetProbe.swift` (`WidgetDiagnosticsView`), `M/HRViews.swift`, `M/HR.swift`, `M/RecruitView.swift` |
| B8 | `M/LoginView.swift`, `M/LoginShell.swift` (phần nhìn), mọi file iOS đã sửa ở B2–B7 (màu, chữ to, VoiceOver), `M/Tabs.swift` (lượt `giaodien` trong `#if DEBUG`), `project.pbxproj` (8 dòng số bản), `.github/workflows/ios-preview.yml` (đoạn 15, `timeout-minutes`) |

- **B3 đến B7** được thêm `M/API.swift`, `M/StaffAPI.swift`, `M/DecodeSelfTest.swift` **chỉ thêm dòng**, chỉ cho route đã duyệt ở B1 (mục 2.2).
- Mọi bước, khi sửa lỗi build hay CI của chính bước đó, được sửa `M/Kit.swift`, `M/MTKit.swift`, `M/Palette.swift` nhưng không đổi chữ ký thành phần đã có.
- Mọi bước được viết `.codex-out/<bước>/`.
- **Cấm ở mọi bước:** `LogoIntro.swift`, `MegatechMascot.swift`, `LaunchClock.swift`, `MegatechApp.swift`, `Session.swift`, `Unlock.swift`, `UnlockPrefetch.swift`, `NavMemory.swift`, `Terms.swift`, `FormatSelfTest.swift`, `ios/Megatech/MegatechWidget/**`, `W/**` (đã có `compactMoney`), `.github/workflows/ios.yml`, vùng cấm mục 0.

---

## 12. Máy kiểm (trước mỗi lần đẩy)

Gốc so sánh: commit đầu bước (`git add -A && git diff --cached -U0 HEAD`). Riêng mục 7 so với `BASE=b13a044` (0.11).

1. Phạm vi file theo mục 11. Không file khoá, không `.env`, không CRLF.
2. Có tóm tắt đủ mẫu (mục 13).
3. Lọc dữ liệu nhạy cảm trên diff (regex như các lượt trước): SĐT 10 số, email, token. `chu@demo.megatech.vn` có sẵn trong workflow, không tính.
4. Không thư viện mới, `import` chỉ `SwiftUI`, `UIKit`, `Charts`, `Foundation`, `Observation`; không `WebView`; không `print` ngoài `#if DEBUG`.
5. Luật định dạng: chạy đúng lệnh `grep` của bước "Chặn định dạng số và ngày ngoài Format.swift" trong `ios.yml`.
6. Không API ngoài iOS 17: diff không có dòng thêm khớp regex `giao-A.md` 13.2 mục 10.
7. Móc lượt quay không mất: đúng vòng lệnh `giao.md` mục 14.7 (`BASE=b13a044`).
8. Không phông tải về: không `.ttf`/`.otf`, `UIAppFonts`, `Font.custom(`.
9. Chữ Vận đơn: lệnh `awk` của `giao-A.md` 13.2 mục 12 (từ B6).
10. Không chữ ghi chú thiết kế: diff không có dòng thêm chứa `Không giả số`, `MÀN `, `ĐÃ SỬA`, `Bản Nền`, `Khung xương`.
11. `API.swift`, `StaffAPI.swift`, `DecodeSelfTest.swift`, `ios-preview.yml`: chỉ dòng thêm (không dòng `-`), trừ dòng `timeout-minutes`.
12. B8: `project.pbxproj` chỉ khác 8 dòng số bản (ngoài dòng thêm file mới ở B2).
13. Không sửa `docs/plans/2026-11-10-app-1.0-gemini/thiet-ke/**`, `giao.md`.
14. (B1b trở đi) `scripts/ci/**` và `ios-preview.yml` không có `wrangler deploy`, `wrangler login`, `--remote`, `CLOUDFLARE_`, `secrets.`(mới thêm).
15. Mục 11 ở B1b: `ios-preview.yml` được có dòng `-` chỉ ở chỗ đặt `BASE` và `timeout-minutes`.

Mục nào đỏ thì sửa trước khi đẩy; không đẩy khi máy kiểm đỏ.

---

## 13. Tóm tắt mỗi bước (`.codex-out/<bước>/tom-tat.md`)

Theo mẫu tóm tắt các lượt trước (`docs/plans/2026-10-18-app-1.0/giao.md` mục 17), thêm:
- `## Móc đã giữ`: số `.id("…")`, số tên `DebugTap`, số dòng log trước và sau bước.
- `## Khác hình mẫu`: khối hình có mà không vẽ (lý do: không có số, mục 2.3), khối app có mà hình không vẽ (đã giữ).
- `## API thêm` (B3–B7): route, `struct`, màn dùng.
- `## Ảnh cần xem`: tên ảnh CI có màn bước này đổi.

Không tên người, không SĐT, không số thật.

---

## 14. Không làm ở lượt này

- Sửa web, API web, dữ liệu, Cloudflare, nhánh demo.
- Widget (`MegatechWidget/`): giữ, chỉ số bản theo app.
- Màn khoá, logo mở app, linh vật, màn che riêng tư.
- Android: lượt sau, cùng bảng màu và thành phần.
- Lỗi logic sẵn có phát hiện khi làm: ghi vào tóm tắt, không sửa.
- Mở PR mới, merge, phát hành.

---

## 15. Sau khi chạy xong (tổ app)

1. Thread PC: Claude PC kiểm một lần, viết `ket-qua.md`, báo điều phối kèm commit cuối.
2. Tổ app lấy ảnh `15-sang-*.png`, `15-toi-*.png` của lần chạy `iOS preview` cuối, làm **một trang Artifact**: từng màn app đặt cạnh khung Gemini, sáng và tối. Không gửi file, không gửi video.
3. Người dùng xem. Có sửa thì tổ app viết `sua-1.md`, giao Codex như trên.
4. Chỉ khi người dùng nhắn "phát hành": merge PR #81 vào `main`, `iOS` tự đăng `ios-v1.0.0-12`.
