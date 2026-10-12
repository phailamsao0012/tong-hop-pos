# Plan giao diện mới web tổng "Megatech Ops" (bản 2, 12/10/2026, đã sửa theo QA)

Người viết: Tổ web tổng. Người dựng: Codex. Người kiểm: QA kiểm thử. Người duyệt: anh Vũ.
Yêu cầu gốc của anh (12/10 14:15Z): "https://www.threads.com/@ikramsakib lên plan chi tiết để tôi có thể làm web của tôi như thế này đi, lên plan, vài ảnh demo nếu web tổng như vậy. plan chi tiết siêu chi tiết, kĩ càng từng tí một để codex làm phần dựng".

Plan này **chỉ đổi giao diện**. Không đổi số, cách tính, tên nghiệp vụ, API số liệu, quyền xem. Thêm đúng 2 route mới, chỉ đọc: `/api/reports/briefing` (G5.1) và `/api/search` (G6).

QA đã đánh giá khả thi (`docs/giao-dien-moi/danh-gia-qa.md`); bản 2 đã sửa đủ 8 điểm phải sửa và 6 điểm nên sửa, xem mục 9. Mọi giai đoạn làm trên demo trước, QA kiểm, anh duyệt rồi mới lên web thật.

---

## 0. Tóm tắt một đoạn

Web tổng đổi từ kiểu "thẻ trắng bóng đổ trên nền xanh nhạt, menu xanh đậm" sang kiểu bảng điều khiển gọn của các mẫu @ikramsakib: menu sáng cùng tông nền, thanh trên 56px có đường dẫn trang và ô tìm Ctrl K, thẻ không bóng mà có viền mảnh, thẻ con đặt trong "khay" xám nhạt, số dùng chữ đều nét (JetBrains Mono), chỉ một màu nhấn là xanh Megatech #17684b, chế độ tối gần đen ngả xanh. Trang Điều hành có thêm cột "Việc cần anh" bên trái (gom cảnh báo đã có sẵn), trang bộ phận có khối "Cần chú ý", trang Vận hành đơn đổi bảng thành dòng dạng thẻ. Làm theo 10 giai đoạn, giai đoạn 1 (đổi giá trị màu, chữ) đã làm cả web đổi diện mạo mà không đụng logic.

Ảnh mẫu: `mau/index.html` (mở `?s=home`, `?s=cskh`, `?s=orders`, `?s=palette`, thêm `&t=dark` cho tối). Số trong mẫu là số ảo.

---

## 1. Lựa chọn của anh

**ĐÃ CHỐT (anh Vũ 12/10/2026 15:32Z: "Chốt theo ý tổ đề xuất"): C1 (a) menu sáng · C2 (a) số JetBrains Mono · C3 có cột "Việc cần anh" · C4 có Ctrl K · C5 (a) tiêu đề Be Vietnam Pro 600.** Codex làm theo cột "Mặc định" dưới đây, bỏ qua các nhánh (b).

Bảng gốc:

| # | Câu hỏi | Lựa chọn | Mặc định (tổ khuyên) |
|---|---|---|---|
| C1 | Menu bên trái | (a) **sáng** cùng tông nền như mẫu; (b) giữ **xanh đậm** #113c30 như bây giờ | (a) sáng. Đúng kiểu mẫu anh gửi, nhìn gọn. |
| C2 | Chữ số | (a) **JetBrains Mono** đều nét như mẫu; (b) giữ **Be Vietnam Pro đậm** như bây giờ | (a) Mono cho số lớn, bảng, giờ; chữ thường vẫn Be Vietnam Pro. |
| C3 | Trang Điều hành có cột **"Việc cần anh"** bên trái | có / không | Có, chỉ hiện với chủ hệ thống và giám đốc. |
| C4 | Ô tìm **Ctrl K** tìm được khách, đơn, nhân viên, trang, lệnh | có / không | Có. |
| C5 | Tiêu đề lớn dùng Bricolage Grotesque như bây giờ hay Be Vietnam Pro 600 như mẫu | Bricolage / Be Vietnam Pro | Be Vietnam Pro 600 (mẫu dùng một họ chữ). |

Nếu anh chọn C1(b): bỏ bước 2.2, giữ token `--sb*` cũ; mọi bước khác giữ nguyên.
Nếu anh chọn C2(b): biến `--font-num` trỏ về `var(--font-ui)` và giữ `font-weight:700`; bỏ phông JetBrains Mono.

---

## 2. Điều KHÔNG được đổi (Codex đọc kỹ, QA kiểm từng dòng)

1. **Tên nghiệp vụ giữ nguyên chữ từng chữ.** Ví dụ: "Đơn chuyển đi", "Doanh số chuyển đi", "Đơn vào Chờ xác nhận", "Người lên đơn", "Ngày gửi hàng", "Số chia", "Đơn chốt", "Tỷ lệ chốt", "Doanh thu ngoài hậu tố", "Tự ups & từ MKT". Vận đơn **không** có chữ "chốt", "bán", "doanh thu". Không dịch sang tiếng Anh, không viết tắt mới.
2. **Số và cách tính:** không sửa file nào trong `app/api/**`, `lib/**` (trừ khi giai đoạn ghi rõ là thêm route mới chỉ đọc). Định dạng số giữ `vi`, `money`, `short`, `shortMoney`, `pct` trong `app/ui-kit.tsx`. Đổi phông số không được đổi chữ số hiển thị.
3. **Bộ lọc dùng chung:** toàn web một bộ lọc ngày, so kỳ trước cùng mốc giờ, bộ lọc trạng thái đơn, chọn POS, chọn team HR, Sale/CSKH. Giữ nguyên state, chỉ đổi vỏ.
4. **Bấm vào số mở trang tính ra số đó, giữ bộ lọc** (quy tắc anh chốt). Không bỏ `onClick` nào của KpiCard, ô bảng, cột biểu đồ.
5. **URL `?view=`**: tên view giữ nguyên (`center`, `overview`, `sale-overview`, `cskh-overview`, `van-don`, `pipeline`…). App điện thoại và link cũ dựa vào đó.
6. **Quyền xem:** `lib/access.ts` (VIEW_GATES), `canView`, `isOwner`. Trang KPI, Cấu hình, Nhật ký chỉ chủ hệ thống. Không hiện mục menu người xem không có quyền.
7. **Bảo mật:** giữ `Watermark` (người không phải chủ), `IdleLock`, ẩn số điện thoại (chỉ 3 số cuối) ở mọi chỗ mới thêm, kể cả Ctrl K. Không log dữ liệu khách ra console.
8. **Chế độ trình chiếu** (nút Trình chiếu, ←/→, Esc, zoom 1.15) giữ hoạt động.
9. **Con vật chờ tải** (`app/loading-critter/`) và dải cập nhật (`.refresh-bar`, `.is-refreshing`) giữ hoạt động; chỉ đổi màu theo token.
10. **Trang đăng nhập** (`app/auth-form.tsx`, lớp `.den-*`) KHÔNG đổi trong plan này.
11. **Màu POS** giữ 6 màu cũ (`--pos-1..6`), người dùng đã quen.
12. **Biểu đồ recharts:** `config` của `ChartContainer` phải là hằng số khai báo ngoài component (đổi object mỗi lần vẽ làm biểu đồ trắng, xem chú thích ở `app/mkt-headline.tsx`).
13. **Không thêm thư viện** ngoài: phông JetBrains Mono (tự host). `cmdk` đã có sẵn trong package.json. Không thêm framer-motion, không thêm Google Fonts (đã tự host vì pháp lý dữ liệu 11/10).
14. **Không deploy web thật, không merge vào `main`.** Chỉ lên demo (mục 4).
15. Tôn trọng `prefers-reduced-motion` ở mọi chuyển động mới.

---

## 3. Tệp đi kèm (đều trong `docs/giao-dien-moi/`)

| Tệp | Là gì |
|---|---|
| `plan.md` | Tệp này. |
| `hien-trang.md` | Kê giao diện hiện tại: khung, menu, màu, bộ thành phần, chỗ dùng. Đọc trước khi sửa. |
| `mau-threads-ikramsakib.md` | Mô tả 36 bài mẫu của @ikramsakib (bố cục, màu, chuyển động) và 5 mẫu tổ chọn theo. |
| `mau/index.html` | Mẫu tĩnh dựng sẵn bằng HTML/CSS (nguồn đúng về khoảng cách, cỡ chữ, bố cục). |
| `mau/tokens.css` | Bộ màu, chữ, bo góc, bóng chuẩn (biến `--o-*`). Giai đoạn 1 đổ giá trị này vào biến cũ. |
| `mau/fonts/` | Phông Be Vietnam Pro và JetBrains Mono 400/500/600 (latin + vietnamese), giấy phép OFL. |
| `anh/` | Ảnh chụp mẫu (sáng, tối, điện thoại) dùng để so khi nghiệm thu. |

Codex mở `mau/index.html` trong trình duyệt để so bằng mắt mỗi giai đoạn. Khi plan và mẫu khác nhau thì **plan đúng**.

---

## 4. Cách làm việc cho Codex

- Repo: `phailamsao0012/tong-hop-pos` (công khai: không đưa số thật, email, số điện thoại, khóa bí mật vào code hay commit).
- Bộ máy: vinext trên Cloudflare Workers, React 19, Tailwind v4 (CSS-first trong `app/globals.css`), shadcn base-nova (`components/ui/*`), recharts 3.8 qua `components/ui/chart.tsx`, icon `lucide-react`.
- Mỗi giai đoạn một nhánh `codex/giao-dien-gN` tách từ `claude/project-thread-3ujeoc` (nhánh demo), mở PR **vào `claude/project-thread-3ujeoc`**. Không mở PR vào `main`.
- Push vào `claude/project-thread-3ujeoc` tự deploy demo.tonghopposmegatech.io.vn (workflow `deploy-demo.yml`, có bước kiểm trình duyệt `scripts/kiem-trinh-duyet.cjs`). Tổ web tổng merge PR, QA kiểm trên demo (mật khẩu demo@2026, nút "Chủ hệ thống (demo)").
- Trước mỗi PR chạy và dán kết quả vào mô tả PR:
  - `pnpm typecheck` (phải sạch)
  - `pnpm test` (hiện 158 bài, phải đạt hết)
  - `pnpm lint` (không thêm lỗi mới so với nhánh gốc; lỗi cũ react-compiler, a11y có sẵn thì để nguyên)
  - `pnpm build`
- Mỗi PR kèm ảnh trước/sau của ít nhất: Điều hành, Tổng quan POS, Tổng quan CSKH, Tổng quan Sale, Vận hành đơn, Khách hàng 360, Cấu hình; mỗi trang sáng + tối + 390px.
- Không dùng `git stash` trần, không force-push nhánh người khác, không sửa `.github/workflows/*`, `wrangler*.json`, `migrations/**`.
- Commit nhỏ, mô tả tiếng Việt, nói rõ trang nào đổi.

---

## 5. Giai đoạn

Thứ tự: G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8 → G9 → G10. G1–G4 là nền (mỗi cái một PR); G5 chia 3 PR theo trang; G6–G9 mỗi cái một PR; G10 là đợt kiểm cuối. Anh duyệt ở 3 mốc: sau G2 (khung + màu), sau G5 (trang chính), sau G10 (toàn bộ).

### G1. Màu, chữ, bo góc (đổi giá trị biến cũ, không đổi tên lớp)

Mục tiêu: toàn web đổi tông trong một PR mà không sửa component. Cách làm: giữ **tên** biến cũ trong `app/globals.css` (vì hơn 100 file đang dùng `bg-surface`, `text-ink-2`, `border-line`…), chỉ đổi **giá trị**, và thêm vài biến mới.

**1.1 Phông**
- Chép `mau/fonts/jetbrains-mono-*.woff2` vào `public/fonts/`, chép thêm giấy phép OFL của JetBrains Mono thành `public/fonts/OFL-jetbrains-mono.txt` (lấy từ gói @fontsource/jetbrains-mono 5.1.1, thư mục gốc gói có LICENSE).
- Thêm vào `public/fonts/fonts.css` **đủ 6 khối** `@font-face` của JetBrains Mono (latin + vietnamese × 400/500/600) y như `mau/tokens.css` (đổi `url(fonts/…)` thành `url(/fonts/…)`), có `font-display: swap`, khối vietnamese có `unicode-range`. Bộ latin **không có** ₫ đ ạ ệ ỷ; thiếu khối vietnamese của độ đậm nào thì chữ Việt trong số ở độ đậm đó rơi sang phông khác (QA A2). 6 tệp tổng ~77KB.
- **Chỉ chữ số dùng mono.** Đơn vị ("tỷ ₫", "tr ₫", "%", "điểm", "đơn", "khách") bọc `<small>` dùng `var(--font-ui)`; dòng ngày tháng, lời chào, mô tả dưới số dùng `var(--font-ui)`. Mũi tên + số % trong DeltaPill mono, chữ "điểm" theo sau dùng `var(--font-ui)`. Bảng: ô số mono (có thể chứa "tr", "tỷ": đã có khối vietnamese nên đúng phông).
- Không preload JetBrains Mono (chỉ preload Be Vietnam Pro 400 tiếng Việt như hiện tại ở `app/layout.tsx`).
- Thêm biến: `--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;` và đổi `--font-num: var(--font-mono);` (nếu anh chọn C2(b) thì để `--font-num: var(--font-ui)`).
- Nếu anh chọn C5 mặc định: `--font-display: var(--font-ui);` (Bricolage để nguyên tệp, chỉ không dùng). Tiêu đề `.display` đặt `font-weight:600; letter-spacing:-.02em`.

**1.2 Bảng đổi giá trị biến sáng (`:root`)**

| Biến cũ | Giá trị cũ | Giá trị mới | Ghi chú |
|---|---|---|---|
| `--bg` | #f0f4ee | **#f9faf8** | nền vùng làm việc (o-main) |
| (mới) `--app` | — | **#eef1ec** | nền menu + nền ngoài cùng (o-app) |
| `--surface` | #fff | #ffffff | thẻ |
| `--surface-2` | #f5f8f3 | **#f2f4f0** | khay (o-tray), nền tiêu đề bảng |
| `--surface-3` | #e9efe7 | **#e8ece6** | rê chuột đậm hơn khay |
| `--card-line` | transparent | **#e3e8e2** | thẻ có viền mảnh, không bóng |
| `--line` | #e3eae2 | **#e3e8e2** | |
| `--line-2` | #d5dfd6 | **#d3dbd2** | viền ô nhập, nút |
| `--line-3` | #c9d6ca | **#c3cdc4** | viền khi rê |
| `--ink` | #17342b | **#142019** | |
| `--ink-2` | #4f6559 | **#46544c** | |
| `--ink-3` | #5f7468 | **#626e67** | đã đo ≥4,5:1 trên cả khay #f2f4f0 |
| `--ink-4` | #7f9488 | **#a5aea8** | CHỈ dùng cho số 0, chữ tắt, trang trí (2:1). Không dùng cho chữ cần đọc, không dùng cho nét/khối dữ liệu. |
| (mới) `--series-muted` | — | **#8f9a93** | màu dữ liệu mờ (≥3:1): nét kỳ so, nhóm "Khác", "Người bán khác", POS lạ. Tối **#6d8073**. |
| `--primary` | #17684b | #17684b | giữ |
| `--primary-2` | #145a41 | **#12563e** | |
| `--tint` | #e4f5ea | **#e5f1eb** | nền chọn mềm (o-accent-soft) |
| `--good` | #15804a | #15804a | giữ (4,5:1 trên khay) |
| `--bad` | #c8403f | **#c2412d** | |
| `--warn` | #9a6500 | #9a6500 | giữ |
| (mới) `--now` | — | **#d8424f** | chấm "Ngay bây giờ" |
| `--chart-grid` | #e6ede6 | **#edf0ec** | |
| (mới) `--bar` | — | **#1f2a24** | cột biểu đồ thường (mực đậm) |
| (mới) `--bar-2` | — | **#c9d1cb** | cột kỳ so |
| `--shadow` | (bóng thẻ) | **none** | thẻ không bóng |
| `--shadow-lift` | | **0 1px 2px rgba(16,24,20,.06), 0 0 0 1px rgba(16,24,20,.05)** | mục đang chọn |
| `--shadow-pop` | | **0 12px 32px -8px rgba(16,24,20,.18), 0 0 0 1px rgba(16,24,20,.06)** | menu thả, popover, modal |
| `--radius` | .625rem | .625rem | giữ cho shadcn |
| (mới) `--r-card` `--r-tray` `--r-ctl` `--r-row` | — | 12px / 14px / 8px / 10px | |
| `--dur` / `--dur-2` | 180 / 240ms | **150ms / 220ms** | |
| `--st-*` | | xem `mau/tokens.css` dòng 45–50 | pill trạng thái nền pastel + chữ cùng tông: thêm biến `--st-*-bg` |

**Rà `ink-4` (QA A1):** chạy `rg -n "ink-4" app components` (không chỉ `text-ink-4`). Có 67 chỗ `text-ink-4` và 29 chỗ `var(--ink-4)`. Chữ có nghĩa đổi sang `text-ink-3`. Màu dữ liệu đổi sang `var(--series-muted)`, gồm ít nhất: `app/staff-compare.tsx` (nét và vạch kỳ so, CMP_CONFIG prev, ô Lên xuống), `app/overview-view.tsx:297-299` (Kỳ trước, Kỳ so sánh), nhóm "Khác" ở `products-view.tsx:19`, `cskh-analytics-view.tsx:18`, `origin-view.tsx:30`, `product-group-blocks.tsx:16-18`, "Người bán khác" `mkt-headline.tsx:172`, POS lạ `ui-kit.tsx:45` (`posVar`) và `pos-badge.tsx:5`, `.postile`/`.poschip` trong `globals.css`, chấm mức thấp `exec-blocks.tsx:159`. Ghi danh sách đã đổi vào mô tả PR.

Biến `--t-*` (màu ô icon) giữ nguyên tên, đổi giá trị theo lớp `.t-*` trong `mau/index.html` (t-green #e2f2ea/#17684b, t-blue #e7effc/#2a5fc4, t-orange #fcefe4/#bb5a16, t-purple #eeeafb/#5b48b8, t-red #fcebea/#b83227); t-teal, t-gray, t-lime giữ.

**1.3 Bảng đổi giá trị biến tối (`.dark`)**

| Biến | Giá trị mới |
|---|---|
| `--bg` | #0f1511 |
| `--app` | #0b100d |
| `--surface` | #171f1a |
| `--surface-2` | #131a16 |
| `--surface-3` | #1c251f |
| `--card-line`, `--line` | #233029 |
| `--line-2` | #2e3d35 |
| `--line-3` | #3a4b42 |
| `--ink` / `--ink-2` / `--ink-3` / `--ink-4` | #e8eeea / #aab6af / #8a968f / #56625b |
| `--primary` / `--primary-2` / `--primary-ink` | #4fc48f / #6fd4a6 / #07150e |
| `--tint` | #173426 |
| `--good` / `--bad` / `--warn` / `--now` | #5fcf8f / #f0806f / #e3a63a / #f06b75 |
| `--bar` / `--bar-2` / `--chart-grid` | #d9e2dc / #34423a / #1d2620 |
| `--shadow` | none |
| `--shadow-lift` | 0 0 0 1px rgba(255,255,255,.06) |
| `--shadow-pop` | 0 16px 40px -10px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.07) |
| `--st-*`, `--st-*-bg`, `--t-*` | theo `mau/tokens.css` khối `.dark` và `.dark .t-*` trong mẫu |

Đổi `themeColor` trong `app/layout.tsx`: sáng #eef1ec, tối #0b100d.

Tối đổi `--primary` từ #8bd5ab sang #4fc48f (QA B2): màu "Kỳ này" ở biểu đồ So cùng kỳ và mọi chữ đặt trên nền primary đổi theo. Đo lại: chữ `--primary-ink` #07150e trên #4fc48f (8,6:1, đạt), DeltaPill tốt/xấu trên nền thẻ tối (#5fcf8f 8,7:1, #f0806f 6,4:1).

**1.4 Lớp dùng chung trong `app/globals.css` (`@layer components`)**
- `.num`: `font-family: var(--font-num); font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums;` (C2(b): giữ 700, -.01em).
- `.card`, `.kpi`: `border-radius: var(--r-card); border: 1px solid var(--card-line); box-shadow: none;`. Bỏ `transform: translateY(-2px)` khi rê; thay bằng `border-color: var(--line-3)`. `.kpi.is-active` → `box-shadow: inset 0 0 0 1px var(--primary)`.
- `.kpi .lbl`: bỏ in hoa; `font-size:12px; font-weight:500; letter-spacing:0; color: var(--ink-3)`.
- `.kpi .val`: `font-family: var(--font-num); font-weight:600; letter-spacing:-.03em`. Đơn vị (tr ₫, tỷ ₫, %) bọc `<small>` cỡ 14px màu ink-3 (xem G3.1).
- Spotlight (`.has-spot` trên `.card`, `.kpi`): bỏ hẳn (mẫu không có). Gỡ `<Spotlight />` khỏi `dashboard.tsx` và xoá CSS `.has-spot`. Tệp `app/spotlight.tsx` xoá.
- `.lift`: thay hiệu ứng nhấc bằng đổi viền.
- `table th`: giữ in hoa 10.5px .07em; nền `var(--surface-2)`, góc trên bo 8px.
- `.seg`: nền `var(--surface-2)`, viền `var(--line)`, padding 3px, bo 9px. `.seg-thumb`: nền `var(--surface)`, `box-shadow: var(--shadow-lift)`. `.seg-btn.is-active`: màu `var(--ink)`, đậm 600 (không còn chữ trắng trên nền xanh). Biến thể `.seg.primary` (giữ chữ trắng nền xanh) chỉ dùng cho ô chọn chỉ số chính nếu cần.
- `.btn`: cao 34px (sm 28px), bo `var(--r-ctl)`, viền `var(--line-2)`, chữ 600. `.btn.primary`: `box-shadow: 0 1px 2px rgba(23,104,75,.25), inset 0 1px 0 rgba(255,255,255,.12)`.
- `.field`: cao 34px, bo 8px, viền `var(--line-2)`, focus `box-shadow: 0 0 0 3px var(--focus)` với `--focus: rgba(23,104,75,.22)` (tối rgba(79,196,143,.28)).
- `.sync`: bỏ khung viền; hiện `● 17:04` (chấm + giờ mono), rê mới hiện chi tiết như cũ.
- Thanh cuộn: `scrollbar-width: thin; scrollbar-color: var(--line-2) transparent`.
- **Con vật chờ tải (QA B1):** `.lc-on … .is-loading` trong `globals.css` (~dòng 703) dùng `--card-line` làm viền lúc chờ; khi `--card-line` hết trong suốt thì viền này hiện ra. Đặt riêng `border-color: transparent` cho thẻ đang chờ con vật. `app/loading-critter/critter.css` dùng `--line`, `--surface`, `--surface-3` nên đổi màu theo; chụp lại 4 con (gà, bò, trứng, lợn) sáng + tối.

**Nghiệm thu G1:** mở mọi trang trên demo, không chỗ nào còn bóng đổ ở thẻ; không chữ nào khó đọc; số hiện bằng JetBrains Mono; tối không còn xanh rêu cũ. Ảnh so: `anh/home-light-1440.png` (chỉ so màu, chưa so bố cục).

### G2. Khung app: menu, thanh trên

**2.1 Bố cục khung** (`app/dashboard.tsx` dòng ~1409–1500)
- Giữ `SidebarProvider` / `Sidebar collapsible="offcanvas"` / `SidebarInset` của shadcn.
- Menu rộng **240px** (đổi biến `--sidebar-width` trong `components/ui/sidebar.tsx` hoặc truyền style), nền `var(--app)`, không viền phải; vùng làm việc `SidebarInset` nền `var(--bg)` có `border-left: 1px solid var(--line)`.
- Màn ≥1280px: menu luôn mở. 768–1279px: menu thu thành ngăn kéo (offcanvas) như hiện tại.
- `main`: bỏ `max-w-[1440px] mx-auto` ở trang Điều hành (vì có cột Việc cần anh, xem G5.1); các trang khác giữ max 1440px, padding `28px 32px 40px` (md), `18px 16px 96px` (điện thoại).

**2.2 Menu sáng** (bỏ nếu anh chọn C1(b))
- Đầu menu: ô logo 30×30 bo 8px nền `--primary` + "Megatech" (13.5px 600) + "Tổng hợp POS" (11.5px ink-3) + mũi tên lên xuống (để sau thành chọn chi nhánh; bây giờ không bấm được, có `title="Sắp có"`). Logo dùng `/logo.svg` hiện tại.
- Mục: cao 32px, padding 0 8px, bo 8px, icon lucide 16px stroke 1.75, chữ 500 màu ink-2. Mục đang mở: nền `var(--surface)`, `box-shadow: var(--shadow-lift)`, chữ ink, icon màu `--primary`. Bỏ vạch lime và màu riêng từng nhóm (`NavGroup.color` không dùng nữa nhưng để nguyên kiểu dữ liệu).
- Tên nhóm: 10.5px 600 in hoa .08em ink-3, cách trên 12px. Giữ nhóm thu gọn được (`thp_nav_open`), mũi tên chỉ hiện khi rê.
- Bộ phận (Sale, CSKH, Marketing, Vận đơn): mỗi bộ phận một mục, mũi tên `›` bên phải; bấm vào mở tab Tổng quan của bộ phận (như hiện tại `DEPTS`).
- Số đếm bên phải mục (`counts` hiện có, ví dụ Lâu chưa mua 128, Vận đơn 64): font mono 11.5px ink-3. Số cần xử lý (ví dụ Ngoài hậu tố có người chưa ghi nguyên nhân): huy hiệu tròn nền `--now` chữ trắng.
- Chân menu: ô người dùng (avatar chữ tắt 30px nền tint chữ primary + tên + vai trò + mũi tên). Bấm mở menu thả (shadcn DropdownMenu): "Bảo mật tài khoản" (view security), "Giao diện: Sáng / Tối / Theo máy", "Trình chiếu", "Đăng xuất". Phần trạng thái đồng bộ POS (`SidebarStatus`) chuyển lên trên ô người dùng, gọn một dòng "6/6 POS đồng bộ · 17:04" (đỏ khi có POS lỗi, bấm mở Cấu hình như cũ).
- Màu token menu: `--sb: var(--app)`, `--sb-ink: var(--ink)`, `--sb-ink-2: var(--ink-2)`, `--sb-ink-3: var(--ink-3)`, `--sb-line: var(--line)`, `--sb-accent: var(--surface)`, `--sb-hover: rgba(20,32,25,.04)` (tối rgba(255,255,255,.04)); bí danh shadcn `--sidebar-primary: var(--primary)`.

**2.3 Thanh trên** (thay `<header className="topbar">`)
- Cao 56px, padding 0 24px, nền `color-mix(in srgb, var(--bg) 88%, transparent)` + `backdrop-filter: blur(8px)`, viền dưới `var(--line)`, dính trên cùng.
- Trái → phải:
  1. `SidebarTrigger` (chỉ hiện khi menu đang là ngăn kéo).
  2. **Đường dẫn trang**: "Megatech / {nhóm} / **{trang}**". Nhóm lấy từ `NAV_GROUPS` / `DEPTS` (ví dụ "Bộ phận / CSKH"); trang lấy từ nhãn view hiện có. Chữ 13px 500 ink-3, mục cuối 600 ink. Bấm nhóm bộ phận mở tab Tổng quan bộ phận.
  3. Khoảng trống.
  4. **Ô tìm** rộng 340px (lg) / 260px (md), cao 34px: icon kính lúp + "Tìm khách, đơn, nhân viên, trang…" + phím `Ctrl K` (trên Mac hiện `⌘K`, nhận biết bằng `navigator.platform`/`userAgentData`). Bấm mở Ctrl K (G6). Nếu anh chọn C4 "không": giữ form tìm khách cũ, chỉ đổi kiểu.
  5. `TeamSwitch` (Tất cả/Sale/CSKH) và `HrTeamPicker`: giữ, đổi vỏ theo `.seg` / `.sel` mới.
  6. `GlobalStatusFilter`, `MetricSettingsButton`: giữ chỗ hiện tại nhưng chuyển xuống thanh lọc của trang (G3.6) nếu trang có `PeriodToolbar`; trang không có thanh lọc thì giữ ở thanh trên.
  7. **Đồng bộ**: chấm xanh + giờ mono "17:04" (`SyncPill` kiểu mới); vàng nhấp nháy khi đang cập nhật; đỏ khi lỗi. Rê hiện chi tiết như cũ.
  8. Chuông (icon `Bell`): chấm cam khi có việc "Ngay bây giờ" (G5.1); bấm mở popover danh sách Việc cần anh rút gọn (5 việc đầu + "Xem hết" về Điều hành). Người không có quyền xem Việc cần anh: ẩn chuông.
  9. Bỏ khỏi thanh trên: chữ "TỔNG HỢP POS", nút Trình chiếu, `ThemeSwitch`, khối user (đã chuyển xuống chân menu). Phím tắt giữ: Ctrl/⌘ Shift L đổi sáng/tối; Ctrl/⌘ Shift P trình chiếu.
- Điện thoại (<768px): thanh trên còn ☰ + tên trang + chấm giờ đồng bộ + chuông + kính lúp (mở Ctrl K toàn màn).

**2.4 Thanh tab bộ phận** (`.dept-tabs`): gạch chân 2px màu `--primary` dưới tab đang mở, chữ 500 ink-3 / 600 ink, số đếm trong ô mono nhỏ nền khay (tab đang mở nền tint chữ primary). Điện thoại cuộn ngang, không xuống dòng.

**2.5 Thanh dưới điện thoại** (`MobileTabBar`): giữ 5 mục hiện có (Điều hành · Doanh thu · Trong ngày · Khách · Thêm), nền `color-mix(in srgb, var(--surface) 92%, transparent)` + blur 10px, icon 20px, mục đang mở màu primary 600.

**Nghiệm thu G2:** so với `anh/home-light-1440.png` phần menu + thanh trên; mọi mục menu cũ còn đủ, đúng quyền; ngăn kéo điện thoại mở/đóng được; đường dẫn đúng ở mọi view.

### G3. Bộ thành phần (`app/ui-kit.tsx`, `components/ui/*`)

Sửa ở một chỗ, mọi trang ăn theo. Không đổi chữ ký props (tên, kiểu) để không phải sửa 100+ chỗ gọi; thêm props mới phải có mặc định.

**3.1 `KpiCard`** (126 chỗ dùng)
- Bố cục: hàng đầu = nhãn (12px 500 ink-3) bên trái, ô icon 26×26 bo 7px màu `t-*` bên phải. Hàng hai = số mono 600 -.03em, **26px là cỡ tối đa**: giữ cơ chế tự co cỡ số theo bề rộng thẻ đang có (`ui-kit.tsx` ~dòng 101, hệ số 0,62/ký tự, vẫn đúng với mono 0,6em) (QA A3), không đặt cỡ cố định; đơn vị tách ra `<small>` 14px 500 ink-3 cách 3px (ví dụ `2,64` + `tỷ ₫`). Tách đơn vị bằng hàm mới `splitUnit(text)`: nhận chuỗi đã định dạng ("2,64 tỷ ₫", "54,8%", "1.948") trả `[số, đơn vị]` (khớp đuôi ` tỷ ₫`, ` tr ₫`, ` ₫`, `%`, ` đơn`, ` khách`); không định dạng lại số.
- Dòng phạm vi (prop mới `scope?: string`, 11px ink-3, ngay dưới số): ghi số này là số gì, phạm vi nào, ví dụ Doanh thu: "Tổng cộng Pancake {n} POS đang chọn · người có hậu tố". Bắt buộc ở thẻ Doanh thu của Điều hành và Tổng quan POS (quy tắc anh: mỗi số phải ghi rõ là số gì).
- Ô lớn Doanh thu MKT (`mkt-headline.tsx:49`, hiện tới 60px, có `truncate`): hạ trần cỡ chữ về `clamp(2rem, 3.6vw, 3rem)`; QA đo không cắt ở 1280 và 390.
- Hàng ba: mũi tên ↑/↓ + % mono 11.5px 600 màu good/bad + chữ mô tả 11.5px ink-3 ("so cùng kỳ tháng 9"). Tỷ lệ đổi theo điểm ghi "điểm" như cũ.
- `progress`: thanh 6px bo tròn nền khay, phần đầy primary.
- `sparkline`: giữ, vẽ bằng `Sparkline` mới (3.7).
- Rê: viền `--line-3`; đang chọn: viền trong 1px primary. Không nhấc lên.
- Padding 14px 16px; bo 12px; khoảng giữa 4 thẻ 12px.
- Biến thể mới `layout="row"` (cho trang Vận hành đơn): icon 36px nền thẻ trong ô khay bên trái, tên + mô tả giữa, số 28px bên phải; nền thẻ là khay. Mặc định `layout="stack"`.

**3.2 `ChartCard`** (160 chỗ, khung mọi trang)
- Viền 1px `--card-line`, bo 12px, không bóng. Đầu thẻ: tiêu đề 14px 600 + phụ đề 12px ink-3 cùng dòng (xuống dòng khi hẹp) + hành động bên phải (nút ghost sm "Chi tiết ›").
- Prop mới `variant: 'card' | 'tray'` (mặc định 'card'). `tray`: nền `--surface-2`, bo 14px, padding 6px; con bên trong là `.sub` (nền thẻ, viền, bo 10px, padding 12px 14px). Dùng cho "Doanh thu theo bộ phận" (3 thẻ con), nhóm KPI phụ, thẻ POS.
- `info` (InfoTip "Cách tính"): giữ, icon ⓘ 14px ink-3 cạnh tiêu đề.
- `more`: link "Xem thêm ›" 12.5px 600 ink-2.

**3.3 `PageHeader`**: tiêu đề 24px 600 -.02em (điện thoại 20px); phụ đề 13.5px ink-3; huy hiệu "số ảo" kiểu `.demo-tag` (mono 11px nền warn 12%) khi `data.mode==='demo'`; nút hành động bên phải (primary cho việc chính, nút viền cho việc phụ). Bỏ `eyebrow` in hoa (vẫn nhận prop, không hiện).

**3.4 `TableWrap` + `SortTh` + bảng**
- Đầu bảng: nền khay, chữ 10.5px 600 in hoa .07em ink-3, cột đang xếp chữ ink + mũi tên ↓/↑.
- Ô số: mono 13px 500 -.02em căn phải; ô chữ đầu dòng: Be Vietnam Pro 500. Dòng phụ trong ô (ví dụ "114/146 đã chốt"): Be Vietnam Pro 11px ink-3.
- Dòng: padding 9px 12px, kẻ dưới `--line`, rê nền `--hover` (biến mới: sáng #f1f4f0, tối #1c251f). Bỏ vạch xanh bên trái khi rê (`.row-hover … box-shadow inset 2px`).
- Dòng Tổng (`tfoot`): nền khay, 600.
- Cột người: ô chữ tắt 28×28 bo 8px màu `t-*` theo thứ tự (hàm `Avatar` hiện có, thêm prop `tone`).
- Giữ `sticky`, `stickyFirst`, mask mờ hai bên khi cuộn ngang.

**3.5 `SegmentedControl`**: theo `.seg` mới (G1.4). Thumb trượt giữ (đã có), thời lượng 200ms `--ease`. Biến thể `tone="primary"` giữ cho chỗ cần nổi (ví dụ chọn Đơn chốt / Doanh thu / Tỷ lệ chốt ở bảng nhân viên dùng mặc định mới, không nền xanh).

**3.6 Thanh lọc trang (`PeriodToolbar`, `app/overview-view.tsx` dòng ~96–135, 19 trang dùng)**
- Một hàng, xuống dòng khi hẹp, khoảng 8px: [seg kỳ: Hôm nay · Hôm qua · Tuần này · Tháng này · Tháng trước · Tùy chọn] [ô chọn "So với **Kỳ liền trước**"] [ô chọn POS: 6 chấm màu chồng nhau + "6 POS"] [ô chọn "Trạng thái **Đã chốt trở đi**"].
- Ô chọn (`.sel`): cao 34px, viền line-2, nền thẻ, chữ 12.5px ink-2, giá trị đậm ink, mũi tên 14px. Dùng `Select` shadcn hiện có, chỉ đổi lớp trigger.
- Điện thoại: seg kỳ **đủ 6 lựa chọn** (kể cả Tháng trước, Tùy chọn), cuộn ngang, không xuống dòng, tự cuộn tới mục đang chọn (QA B5); "So với" và "Trạng thái" gom vào nút "Bộ lọc" mở ngăn kéo dưới (shadcn `Drawer`), có nút "Xong". Vẫn là một bộ lọc ngày dùng chung toàn web.

**3.7 Biểu đồ nhỏ**: `Sparkline` nét 1.6px, không chấm (prop `dot` mặc định false), màu good/bad theo xu hướng khi gọi từ bảng POS; `Donut` vòng 18px, khe 2px giữa lát; `Funnel` các bậc dùng primary pha nền như cũ; `ProgressBar` 6px.

**3.8 `DeltaPill` / `StatusChip`**
- `DeltaPill variant="plain"`: chữ mono 600 + ↑/↓ (không nền). `variant="chip"`: nền good-bg/bad-bg bo tròn.
- `StatusChip` → kiểu pill trạng thái đơn: cao 22px, padding 0 9px, chấm 6px màu chữ, nền `--st-*-bg`, chữ `--st-*` 11.5px 600. Hàm mới `OrderStatusPill({ status })` dùng `STATUS_LABELS`, KHÔNG đổi chữ nhãn.

**3.9 shadcn (`components/ui/`)**: `select`, `popover`, `dropdown-menu`, `dialog`, `tooltip`: bo 10px (popover 12px), bóng `var(--shadow-pop)`, viền `var(--line)`, mục rê nền `--hover`, mục chọn có dấu ✓ màu primary. `input`: như `.field`. `button`: biến thể default = `.btn.primary`, outline = `.btn`, ghost = `.btn.ghost`.

**3.10 Trạng thái tải / lỗi / rỗng**: `Skeleton` khối bo 8px màu `--surface-2` nhấp nháy nhẹ (giữ keyframes cũ); `ErrorBox` viền bad 30%, nền bad-bg, nút "Thử lại"; `EmptyState` icon 20px ink-4 + chữ ink-3 giữa thẻ. Con vật chờ tải giữ.

**Nghiệm thu G3:** so `anh/cskh-light-1440-full.png` (thẻ KPI, bảng); kiểm 126 chỗ KpiCard không tràn chữ ở 1280px và 390px (QA dùng kịch bản chụp mọi view).

### G4. Biểu đồ (recharts qua `components/ui/chart.tsx`, 15 tệp; SVG tự vẽ ở `overview-trends.tsx`, `pos-multiples.tsx`)

- Trục: chữ mono 10.5px ink-3, không vạch trục, lưới ngang `--chart-grid` 1px, không lưới dọc.
- Cột theo ngày (doanh thu, đơn): cột kỳ này màu `--bar` (mực đậm), **ngày hôm nay** màu `--primary`, cột kỳ so màu `--bar-2` đặt sát bên phải hẹp hơn (60% bề rộng). Bo góc trên 4px. Nhãn số chỉ trên cột hôm nay (mono 11px 600 ink).
- Đường: nét 2px, kỳ so nét đứt 4 3 màu `--ink-4`; vùng tô dưới đường primary 10% (tối 14%).
- Nhiều POS: giữ màu `--pos-1..6`; chú giải ô vuông 10px bo 3px.
- Tooltip: thẻ nền surface, viền line, bóng pop, bo 10px, dòng "Kỳ này / Kỳ so / Chênh lệch" (theo mẫu khung So cùng kỳ đã làm ở `app/staff-compare.tsx`).
- Chú giải đặt bên phải đầu thẻ, 11.5px ink-3.
- Biểu đồ so cùng kỳ (`app/staff-compare.tsx`): đã làm 3 kiểu Lên xuống / Chênh lệch / Cộng dồn; chỉ đổi màu theo token, không đổi logic.
- Mọi `config` biểu đồ vẫn là hằng số ngoài component (bất biến 12).

### G5. Trang (3 PR)

**5.1 Điều hành (`app/center-view.tsx`) – PR G5a** (ảnh: `anh/home-light-1440.png`, `anh/home-dark-1440.png`, `anh/home-light-390.png`)
- Bố cục ≥1280px: lưới 2 cột `300px | 1fr`. Cột trái "Việc cần anh" (nếu C3 = có và người xem là chủ hệ thống/giám đốc), cột phải là nội dung. Người khác: một cột như hiện tại.
- **Lời chào theo người xem** (QA A8): "Chào {xưng hô} {tên gọi}. **{n} việc cần {xưng hô}, {m} việc ngay bây giờ.**" Ví dụ chủ hệ thống: "Chào anh Vũ. 7 việc cần anh…"; giám đốc tên Hoa (nữ): "Chào chị Hoa. 3 việc cần chị…". Tên gọi = chữ cuối của `user.displayName` (bỏ hậu tố SALE/CSKH/MKT). Xưng hô lấy từ trường giới tính/xưng hô nếu web nhân sự có; không có thì bỏ xưng hô: "Chào Hoa. 3 việc cần làm, …". Không có việc: "Chào anh Vũ. Hôm nay chưa có việc gì." Vế đầu ink, vế sau ink-3; 28px 600 -.02em. Dòng dưới Be Vietnam Pro 12.5px ink-3: "{vai trò} · {Thứ} {dd/mm/yyyy} · số tới {HH:mm}" (giờ có thể mono).
- Thanh lọc (G3.6).
- 4 KPI: Doanh thu, Đơn chốt, Tỷ lệ chốt, Doanh số chuyển đi (đúng 4 số hiện trang Điều hành đang có; nếu trang hiện có số khác thì giữ số hiện có, chỉ đổi vỏ). Doanh số chuyển đi **không** cộng vào doanh thu. Thẻ Doanh thu có dòng phạm vi (G3.1).
- Khay "Doanh thu theo bộ phận" **phải cộng ra đúng ô Doanh thu** (QA A7; anh hay cộng thử):
  - 3 thẻ con: **Sale** (doanh thu New), **CSKH**, **Khác · ngoài Sale và CSKH** (= Doanh thu − Sale − CSKH; tooltip liệt kê phần này gồm ai theo dữ liệu, ví dụ người hậu tố MKT tự bán, anh Xuân Nghĩa). Dòng dưới thẻ Khác: "ba ô cộng ra {Doanh thu}".
  - Dải riêng bên dưới, viền đứt: **MKT · đơn có Marketer** {số} · ROAS · chi phí QC · số về, cuối dải ghi "nằm trong Sale và CSKH, **không cộng thêm**".
  - Mỗi thẻ: nhãn, số 22px mono + đơn vị `<small>`, dòng ↑% + đơn chốt + tỷ lệ chốt. Số lấy đúng API đang dùng ở khối tách 3 bộ phận hiện có (đang ở demo chờ anh duyệt); không tự tính lại cách khác. "Chi tiết ›" mở trang bộ phận.
- Thẻ "Doanh thu theo ngày" (G4). Thẻ "Theo POS": bảng POS, doanh thu, đơn chốt, tỷ lệ chốt, so cùng kỳ, đường 12 ngày; bấm dòng mở Tổng quan POS lọc đúng POS.
- Các khối khác của Điều hành hiện nay (AI tóm tắt, chốt nóng, khách, mua lại…) giữ, xếp sau, đổi vỏ ChartCard.
- **Cột "Việc cần anh"**:
  - Đầu cột: seg "Việc cần làm | Hoạt động" (không ghi "cần anh" cứng, vì giám đốc cũng xem). Hoạt động = nhật ký gần đây đọc `GET /api/audit` (route đã có, chỉ chủ hệ thống xem được; `/api/activity` chỉ để ghi, không đọc). Người không xem được nhật ký thì ẩn tab.
  - 3 nhóm: **Ngay bây giờ** (chấm đỏ `--now`), **Hôm nay**, **Tuần này**; mỗi nhóm có số đếm mono bên phải.
  - Mỗi việc: ô icon 26px màu `t-*`, tiêu đề 13px 600 (tối đa 2 dòng), mô tả 11.5px ink-3, giá trị mono bên phải. Bấm: mở trang tính ra việc đó (đúng quy tắc 4), mục được chọn nổi lên (nền thẻ + bóng pop). Nút "Bỏ qua" khi rê: ẩn việc tới hết ngày (nhớ `localStorage` khoá `thp_brief_skip_{ngày}`, chỉ trên máy).
  - Cuối cột: "Hôm nay đã xử lý {n} việc · {m} cảnh báo tự hết" (n = số việc đã bỏ qua/đã mở hôm nay).
  - Điện thoại: thành thẻ "Việc cần anh" đầu trang (3 việc + "Xem hết ›" mở ngăn kéo đủ danh sách).
  - **Nguồn việc** (route mới `GET /api/reports/briefing`, chỉ đọc, thêm vào `VIEW_GATES` cho `center`, chỉ trả việc thuộc quyền người xem, cache 3 phút như `staff-compare`):

  | Loại | Điều kiện | Nhóm | Lấy từ (đã QA đối chiếu) | Bấm mở |
  |---|---|---|---|---|
  | POS chưa đồng bộ | `now − pos_shops.last_sync_at` > 30 phút, hoặc `last_error` khác rỗng | Ngay bây giờ | bảng `pos_shops` (cột `last_sync_at`, `last_error`; cách đọc ở `app/api/sync/pos/route.ts` ~dòng 29) | `config` |
  | Đơn đã chốt chưa xác nhận quá lâu | đơn đang ở **Chờ xác nhận** (mã 17; pipeline coi mã này là đã chốt, `app/api/reports/pipeline/route.ts` ~dòng 17) và đã vào Chờ xác nhận > 2 giờ; tính từ **giờ vào Chờ xác nhận** (cùng cột thời điểm pipeline dùng), KHÔNG từ giờ tạo đơn; chỉ xét đơn vào Chờ xác nhận trong 3 ngày gần nhất; đếm theo POS | Ngay bây giờ | cùng điều kiện mã trạng thái + cột thời gian của `/api/reports/pipeline` | `pipeline` lọc Chờ xác nhận |
  | Doanh thu ngoài hậu tố | > 0 và chưa ghi nguyên nhân | Hôm nay | `/api/reports/uncounted` | `uncounted` |
  | Sheet CPQC chưa gửi | `now − max(sheet_cost_sources.received_at)` > 2 giờ, chỉ xét trong 8:00–22:00 giờ VN | Hôm nay | bảng `sheet_cost_sources` cột `received_at` (đọc như `lib/sheet-costs.ts` ~dòng 355–382). KHÔNG dùng `/api/marketing/sheet-check` (đó là số đối chiếu, không có giờ gửi) | `mkt-roas` |
  | Tỷ lệ hoàn tăng | tính **theo ngày gửi hàng, chỉ kỳ đã khép**: đơn gửi từ 8–21 ngày trước so với đơn gửi 22–35 ngày trước, cùng cách tính "Tỷ lệ hoàn" của `/api/reports/van-don`; bật khi tăng ≥ 2 điểm. Không so 7 ngày gần nhất (đơn mới gửi chưa kịp hoàn nên số thấp giả) | Hôm nay | `/api/reports/van-don` (hàm tính tỷ lệ hoàn) | `van-don` lọc POS + kỳ tương ứng |
  | KPI chậm tiến độ | % đạt tháng thấp hơn % ngày đã qua ≥ 5 điểm | Tuần này | nguồn của `app/team-kpi-progress.tsx`. **Chỉ trả cho chủ hệ thống** (KPI chỉ chủ hệ thống xem) | `sale-kpi` / `cskh-kpi` |
  | Nhân viên chốt thấp | tỷ lệ chốt tháng < 60% và có ≥ 20 số chia | Tuần này | `/api/reports/product-groups` (nặng nhất trong 7 nguồn, cả tháng) | trang Tổng quan bộ phận, xếp theo tỷ lệ chốt |

  - **Cache (QA A4):** KHÔNG chép cách nhớ của `staff-compare` (nhớ theo URL, ai mở sau cũng nhận kết quả của người mở trước). Khoá cache = `vai trò + danh sách view người đó xem được + team bị ép (HR/Sale/CSKH) + danh sách POS được xem` (hoặc đơn giản là user id), thời hạn 3 phút. Thêm test: hai người khác quyền (chủ hệ thống rồi giám đốc; Leader team A rồi Leader team B) gọi liền nhau, người sau không thấy việc KPI hay việc team khác.
  - Mục tiêu < 800ms chỉ đo trên demo; không đo, không test tải trên web thật.
  - Codex **đọc route nguồn trước**, gọi lại hàm có sẵn hoặc copy đúng điều kiện; **không viết SQL mới quét toàn bảng `raw_pos_orders`**, không thêm chỉ mục (web thật từng lỗi D1 7429). Câu SQL mới nào cũng phải giới hạn theo ngày (`created_at`/ngày chốt ≥ hôm nay − 14 ngày) và gửi Tổ web tổng duyệt trong PR.
  - Ngưỡng (30 phút, 2 giờ, 2 điểm, 5 điểm, 60%, 20 số) để trong một hằng số `BRIEF_RULES` ở đầu route, chú thích "đổi ở đây".
  - Không có dữ liệu nguồn (lỗi) thì bỏ qua loại đó, không làm hỏng cả cột; trả `errors: string[]` để hiện dòng nhỏ "Chưa lấy được: …".

**5.2 Tổng quan Sale / CSKH (`app/team-overview-view.tsx`, `app/product-group-blocks.tsx`, `app/cskh-view.tsx`) – PR G5b** (ảnh: `anh/cskh-light-1440-full.png`)
- Thứ tự: PageHeader ("Tổng quan CSKH", phụ đề, nút "Cuộc gọi" + "So sánh nhân viên" primary) → tab bộ phận → thanh lọc → 4 KPI → hàng `2fr | 1fr`: "Cần chú ý" + "Số chia theo người" → khung So cùng kỳ (đã có) → bảng "Từng nhân viên".
- **Cần chú ý** (thẻ mới, chỉ đọc từ API đã gọi ở trang, không thêm route): tối đa 4 dòng, mỗi dòng icon tròn 32px nền `t-*`, tiêu đề 13px 600, mô tả 11.5px, nút "Bỏ qua" (ghost) + nút hành động ("Xem đơn", "Xem số chia", "Xem khách"). Dòng sinh từ dữ liệu đã có: người giảm đơn chốt nhiều nhất so cùng kỳ (`staff-compare`), người tỷ lệ chốt thấp nhất (`product-groups`), khách hẹn gọi lại hôm nay chưa gọi (CSKH: `/api/reports/calls` nếu trang đã gọi; không thì bỏ), đơn CSKH hoàn trong 3 ngày (nếu có sẵn). Không có dòng nào thì ẩn thẻ, "Số chia theo người" chiếm cả hàng.
- **Số chia theo người**: danh sách tên + "đã chốt / số chia" mono + thanh 6px (nền primary 18%, phần đầy primary). Tối đa 6 người, "Xem hết" mở bảng.
- Bảng Từng nhân viên: giữ đủ cột, nút "Hiện cột thẻ đơn" (CSKH mặc định ẩn, Sale hiện), cột So cùng kỳ (Lên xuống / Chênh lệch / Cộng dồn). Chỉ đổi vỏ theo G3.4.
- **Hai chữ "So với" (QA B6):** thanh lọc chung có "So với Kỳ liền trước" (cho thẻ số, biểu đồ đầu trang); khung So cùng kỳ của bảng nhân viên có kiểu so riêng sâu hơn (cùng thứ, cùng ngày tháng trước, lùi nhiều bước). Để không thấy hai nút mâu thuẫn: tiêu đề khung đổi thành "So cùng kỳ · bảng nhân viên", và khi người dùng chưa tự chọn kiểu trong khung thì khung **lấy theo lựa chọn So với của thanh lọc chung** (chỉ đọc giá trị, không đổi API); chọn khác trong khung thì hiện chip nhỏ "riêng bảng này · về theo bộ lọc chung" để quay lại.
- Sale giống CSKH, giữ cột thẻ đơn, tab Trong ngày · chốt nóng, Chia số.

**5.3 Vận hành đơn (`app/pipeline-view.tsx`) và Tổng quan Vận đơn (`app/van-don-view.tsx`) – PR G5c** (ảnh: `anh/orders-light-1440.png`)
- 4 KPI `layout="row"`: Chờ xác nhận, Đang giao, Giao thành công, Hoàn (số và nhãn giữ như trang hiện tại; chỉ đổi vỏ).
- Tab trạng thái có số đếm (Tất cả, Chờ xác nhận, Đã xác nhận, Đang giao, Giao thành công, Hoàn, Hủy) dùng kiểu G2.4; bên phải seg POS.
- Ô tìm trong trang: "Tìm mã đơn, tên khách, 3 số cuối SĐT, người lên đơn…" (phím `/` để focus). Chỉ lọc dữ liệu trang đã tải hoặc tham số tìm route đang hỗ trợ; không thêm tìm theo SĐT đầy đủ.
- Danh sách: khay chứa các dòng-thẻ (nền thẻ, viền, bo 10px, cách 4px). Cột: [Mã đơn mono 600 + "Tên khách · sản phẩm"] [Người lên đơn + tuyến "Hà Nội đến Thái Bình"] [pill trạng thái] [Tiền mono phải] [Ngày gửi hàng mono + dòng phụ "dự kiến 14/10"/"chờ gửi"/"nhận 11/10"] [›]. Đơn cảnh báo (quá giờ) có dấu ▲ màu warn sau mã.
- Bấm dòng mở chi tiết đơn như hiện tại.
- Chân: "1–25 trong 1.776 đơn" + "Mỗi trang 25 · Trang 1/72" + nút ‹ ›.
- Điện thoại: dòng-thẻ xếp dọc 2 cột (trái: mã, khách, người lên đơn, tuyến; phải: pill, tiền, ngày); KPI 2×2 bỏ ô icon.
- Tên nghiệp vụ Vận đơn đúng bất biến 1.

**5.4 Các trang còn lại** (Tổng quan POS, Sản phẩm, Phân tích, Theo team, Cuộc gọi, Marketing, ROAS, Khách hàng 360, Hồ sơ khách, Mua lại, Lâu chưa mua, Báo cáo cuối tháng, Báo cáo tùy chọn, Ngoài hậu tố, Cấu hình, Nhật ký, Đơn nguồn): **không đổi bố cục**, chỉ ăn theo G1–G4. QA chụp đủ để soát tràn chữ, màu sai, chữ khó đọc. Chỗ nào lỗi thì sửa nhỏ trong PR G10.

### G6. Ctrl K (nếu C4 = có) – PR riêng (ảnh: `anh/palette-light-1440.png`)

- Tệp mới `app/command-palette.tsx`, dùng `components/ui/command.tsx` (cmdk 1.1.1 đã có) trong `Dialog`.
- Mở bằng Ctrl/⌘ K, bấm ô tìm trên thanh trên, hoặc kính lúp điện thoại. Đóng Esc. Rộng 640px, cách trên 110px, nền mờ `rgba(10,16,12,.38)` + blur 2px; điện thoại toàn màn.
- Ô nhập 15px; hàng chip lọc: Tất cả · Trang · Khách · Đơn · Nhân viên (chip đang chọn nền ink chữ nền).
- **Route mới `GET /api/search?q=&kind=` (QA A6), chỉ đọc**, vì `/api/reports/customers` và `/api/raw/orders` trả SĐT đầy đủ (che trên giao diện vẫn lộ qua tab Network) và tìm không kèm kỳ là `LIKE '%…%'` quét cả `customer_stats` mỗi lần gõ:
  - Trả tối đa **8 dòng mỗi nhóm**. Khách: `{ id, name, phoneTail: '•••' + 3 số cuối, province, orders, spend }`. **Không bao giờ trả SĐT đầy đủ.** Đơn: mã đơn, POS, trạng thái, tiền, ngày, người lên đơn; SĐT khách cũng chỉ 3 số cuối.
  - Tìm SĐT: chỉ khi gõ **≥ 4 chữ số**, khớp **đuôi số** hoặc khớp đủ số, dùng chỉ mục đang có (như `raw/orders` đang làm). Tìm tên: tiền tố/chứa, `LIMIT 8`. Không thêm chỉ mục mới trên `raw_pos_orders` thật; câu SQL đưa Tổ web tổng duyệt trong PR.
  - Kiểm quyền như route cũ: khách cần quyền `customers`; đơn cần quyền `raw-orders`; team bị ép (Sale/CSKH/HR) lọc như các route khác. Ghi nhật ký qua `lib/audit.ts` (đã tự che SĐT trong `q`).
  - Gõ chậm 250ms rồi mới gọi, huỷ yêu cầu cũ (AbortController).
- **Dán đủ số rồi Enter mở thẳng khách:** CSKH đang dùng ô tìm cũ kiểu này. Gõ/dán 10 số (hoặc +84…) rồi Enter: nếu đúng 1 khách khớp đủ số thì mở thẳng Khách hàng 360 của khách đó; nhiều khách thì hiện danh sách. Mở bằng **id**, không đưa SĐT lên URL.
- Nhóm kết quả (tiêu đề in hoa 10.5px):
  - **Trang**: từ `NAV_GROUPS` + `DEPTS` + nhãn view, lọc theo `canView`. Không gọi API. Gõ không dấu vẫn ra ("cskh tong quan", "van don").
  - **Lệnh**: "Đổi giao diện: Tối/Sáng" (Ctrl Shift L), "Trình chiếu" (Ctrl Shift P), "Làm mới số liệu", "Đăng xuất".
  - **Khách**: từ `/api/search`; dòng: tên · "••• 3 số cuối" · tỉnh · "{n} đơn chốt · {tổng tiền}".
  - **Nhân viên**: lọc danh sách nhân viên trang đã có trong bộ nhớ; số bên phải ghi rõ loại số, ví dụ "91 đơn chốt tháng này" (người Vận đơn: "đơn lên") (QA B4). Bấm mở Tổng quan bộ phận lọc người đó.
  - **Đơn**: từ `/api/search` (chỉ người có quyền `raw-orders`). Bấm mở chi tiết đơn.
- Phím: ↑↓ chọn, Enter mở, Esc đóng, Tab đổi chip. Chân: "↑↓ chọn · ↵ mở · Ctrl K đóng/mở".
- Không lưu lịch sử tìm có tên/SĐT khách vào localStorage. Lịch sử chỉ lưu trang/lệnh đã mở gần đây (khoá `thp_cmdk_recent`, tối đa 6).
- Gỡ form "Tìm khách theo SĐT hoặc tên" cũ ở thanh trên **chỉ khi** Ctrl K đã đạt nghiệm thu "dán đủ số rồi Enter"; trang Hồ sơ khách vẫn có ô tìm riêng như cũ.

### G7. Chuyển động – PR riêng

Không thư viện, CSS + rAF có sẵn. Mọi mục dưới tắt khi `prefers-reduced-motion: reduce`.

| Chỗ | Chuyển động | Thời lượng |
|---|---|---|
| Rê mục menu, nút, dòng | đổi nền | 120ms ease `cubic-bezier(.2,.7,.2,1)` |
| Seg (kỳ, chỉ số, tab bộ phận) | thumb/gạch chân trượt sang mục mới | 200ms |
| Đổi trang (view) | nội dung mờ dần vào + trượt lên 6px | 200ms |
| Thẻ KPI và thẻ đầu trang khi vào trang | lần lượt hiện, mỗi thẻ trễ 40ms (tối đa 8 thẻ) | 220ms mỗi thẻ |
| Số KPI khi đổi kỳ | lăn số (CountUp hiện có, giữ) | 600ms |
| Cột biểu đồ | mọc từ đáy lần đầu vẽ (giữ "vẽ dần" hiện có); đổi kỳ thì không chạy lại | 400ms |
| Popover, menu thả, Ctrl K | phóng 0.96 → 1 + mờ vào | 160ms |
| Ngăn kéo điện thoại | trượt từ dưới/trái | 220ms |
| Đổi sáng/tối | vòng tròn lan từ nút đã bấm (View Transitions API `document.startViewTransition` + `clip-path: circle()`); trình duyệt không hỗ trợ thì đổi thẳng | 400ms |
| Việc cần anh mới đến | chấm đỏ nháy 2 lần | 1.2s |

### G8. Chế độ tối – PR riêng

- Màu theo G1.3. Kiểm từng trang: không chỗ nào còn màu cứng (`#fff`, `bg-white`, `text-black`, `rgba(23,52,43…)`). Codex chạy `rg -n "#fff\b|#ffffff|bg-white|text-black|rgba\(23,52,43" app components` và thay bằng token.
- Ảnh trong thẻ (logo, linh vật) giữ.
- Biểu đồ: cột mực sáng `--bar` #d9e2dc, hôm nay primary sáng #4fc48f, kỳ so #34423a; nét kỳ so dùng `--series-muted` tối #6d8073.
- Primary tối đổi #8bd5ab → #4fc48f: chụp lại biểu đồ So cùng kỳ (nét Kỳ này), nút primary, chip chọn; đo tương phản như G1.3.
- Pill trạng thái, ô icon `t-*`: dùng khối `.dark` trong mẫu.
- Ảnh so: `anh/home-dark-1440.png`, `anh/cskh-dark-390.png`.

### G9. Điện thoại (<768px) – PR riêng

- Không cuộn ngang trang ở 360px và 390px (QA đo `document.documentElement.scrollWidth === innerWidth` trên mọi view).
- Lề trang 16px; khoảng giữa khối 16px; thanh dưới không che nội dung (padding dưới 96px + safe-area).
- KPI 2 cột; khay 3 thẻ con thành 1 cột; hàng `2fr|1fr` thành 1 cột; bảng cuộn ngang trong thẻ (mask mờ mép), cột đầu dính.
- Tab bộ phận, seg kỳ cuộn ngang, không xuống dòng.
- Tiêu đề thẻ dài xuống dòng; ghi chú phụ đề thẻ ẩn nếu chật (`.hd .note` ẩn ở <768px).
- Nút hành động thẻ "Bỏ qua" ẩn, chỉ giữ nút chính.
- Ảnh so: `anh/home-light-390.png`, `anh/cskh-dark-390.png`, `anh/orders-light-390.png`.

### G10. Kiểm thử, sửa vặt, nghiệm thu – PR cuối

Xem mục 7.

---

## 6. Rủi ro và cách tránh

| Rủi ro | Cách tránh |
|---|---|
| Đổi giá trị biến làm chữ khó đọc ở chỗ dùng `text-ink-4` cho chữ có nghĩa | G1 rà `text-ink-4` (lệnh `rg -n "text-ink-4" app`), chữ có nghĩa đổi sang ink-3; QA đo tương phản ≥ 4,5:1 chữ thường, ≥ 3:1 chữ ≥ 18px. |
| Phông mono rộng hơn làm số tràn thẻ KPI/ô bảng | Giữ cơ chế tự co cỡ số của KpiCard (26px chỉ là trần); hạ trần ô lớn Doanh thu MKT; QA đo `scrollWidth > clientWidth` của mọi `.num` ở 1280 và 390 trên 6 trang chính. |
| Bỏ bóng thẻ làm trang "phẳng" quá | Đã bù bằng viền + khay; anh duyệt ở mốc sau G2. |
| Cột Việc cần anh gọi nhiều API làm chậm Điều hành | Một route `briefing` gom, cache 3 phút, gọi song song bằng `db.batch`, giới hạn 14 ngày; tải sau nội dung chính (không chặn KPI). Đo thời gian route trên demo < 800ms. |
| Ctrl K lộ SĐT khách | Route `/api/search` che số từ máy chủ (không chỉ che trên giao diện), tối đa 8 dòng, không lưu lịch sử tìm khách. QA mở tab Network kiểm không có SĐT đầy đủ. |
| Cache briefing lộ việc giữa người khác quyền | Khoá cache theo quyền/người (G5.1), test hai người liền nhau. |
| Phông mono thiếu chữ Việt | Đủ 6 khối; đơn vị và chữ dùng Be Vietnam Pro. QA kiểm `document.fonts` và chụp phóng to ₫ đ ệ. |
| D1 web thật quá tải vì truy vấn mới | Không quét toàn bảng, không thêm chỉ mục, giới hạn theo ngày; Tổ web tổng duyệt SQL. Không test tải web thật. |
| Đổi 160 chỗ ChartCard/126 chỗ KpiCard gây lỗi lặt vặt | Không đổi props; mỗi giai đoạn chụp đủ view và so ảnh. |
| App điện thoại mở link `?view=` cũ | Không đổi tên view (bất biến 5). |
| Codex sửa nhầm tên nghiệp vụ | QA rà chữ: `rg -n "Doanh thu vận đơn\|chốt vận đơn\|bán hàng" app` phải rỗng; so danh sách nhãn trước/sau. |

---

## 7. Danh sách nghiệm thu (QA tick từng dòng trên demo)

**Chung**
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build` đạt; `pnpm lint` không thêm lỗi.
- [ ] Bước kiểm trình duyệt của `deploy-demo.yml` đạt.
- [ ] Mọi view trong `NAV_GROUPS` + `DEPTS` mở được, không lỗi console, đúng quyền (thử 3 vai: chủ hệ thống, trưởng phòng Sale, nhân viên CSKH).
- [ ] Số trên mọi KPI, bảng, biểu đồ giống hệt trước khi đổi (so 10 số ngẫu nhiên mỗi trang, cùng bộ lọc).
- [ ] Bấm số vẫn mở đúng trang, giữ bộ lọc.
- [ ] Tên nghiệp vụ không đổi (danh sách nhãn trước/sau khớp).
- [ ] Watermark, khoá khi rảnh, trình chiếu, con vật chờ tải, dải cập nhật còn chạy.
- [ ] Không cuộn ngang ở 360/390px; thanh dưới không che nội dung.
- [ ] Tối: không còn mảng trắng, chữ đọc được.
- [ ] Tắt chuyển động (reduced motion): không còn trượt, phóng, lăn số.
- [ ] Tương phản chữ ≥ 4,5:1 (đo 20 chỗ chữ nhỏ nhất).

**Theo trang**
- [ ] Điều hành giống `anh/home-light-1440.png` (bố cục, cỡ chữ, khoảng cách); Việc cần anh đúng quyền, mỗi việc mở đúng trang, "Bỏ qua" nhớ tới hết ngày.
- [ ] Tổng quan CSKH giống `anh/cskh-light-1440-full.png`; Cần chú ý ẩn khi rỗng; cột thẻ đơn CSKH mặc định ẩn.
- [ ] Vận hành đơn giống `anh/orders-light-1440.png`; điện thoại giống `anh/orders-light-390.png`.
- [ ] Ctrl K giống `anh/palette-light-1440.png`; tab Network không có SĐT đầy đủ; dán đủ 10 số rồi Enter mở đúng khách; Esc đóng; phím mũi tên chạy.
- [ ] Điều hành: Sale + CSKH + Khác = Doanh thu (đúng từng đồng trên demo); dải MKT ghi "không cộng thêm"; thẻ Doanh thu có dòng phạm vi.
- [ ] Lời chào và số việc đúng theo người xem (thử chủ hệ thống và giám đốc).
- [ ] Briefing: hai tài khoản khác quyền gọi liền nhau, người sau không thấy việc của người trước; số từng việc khớp trang mở ra.
- [ ] Nét dữ liệu (kỳ so, nhóm Khác) ≥ 3:1 sáng và tối; chữ ≥ 4,5:1.
- [ ] Con vật chờ tải 4 con, màn đăng nhập, chế độ trình chiếu chụp lại không lỗi viền/màu.

**Hiệu năng**
- [ ] Lighthouse điện thoại trang Điều hành trên demo: không thấp hơn trước quá 5 điểm.
- [ ] Tải thêm phông ≤ 90KB (JetBrains Mono 6 tệp ~77KB; trình duyệt chỉ tải khối cần dùng).
- [ ] "₫ đ ệ ỷ" trong ô số mono dùng đúng JetBrains Mono (kiểm `document.fonts.check`, chụp phóng to).
- [ ] `/api/reports/briefing` < 800ms trên demo.

---

## 8. Ước lượng khối lượng (để anh hình dung, không phải hạn)

| Giai đoạn | Tệp chính | Độ lớn |
|---|---|---|
| G1 | globals.css, layout.tsx, public/fonts | nhỏ |
| G2 | dashboard.tsx (khung, menu, thanh trên), components/ui/sidebar.tsx | vừa |
| G3 | ui-kit.tsx, overview-view.tsx (PeriodToolbar), components/ui/* | vừa |
| G4 | components/ui/chart.tsx, 15 tệp biểu đồ (chỉ màu) | vừa |
| G5a | center-view.tsx, route mới briefing | lớn |
| G5b | team-overview-view.tsx, product-group-blocks.tsx, cskh-view.tsx | vừa |
| G5c | pipeline-view.tsx, van-don-view.tsx | vừa |
| G6 | command-palette.tsx mới | vừa |
| G7–G9 | globals.css + rải rác | nhỏ–vừa |
| G10 | sửa vặt | nhỏ |

---

## 9. Đã sửa theo QA (bản 2, 12/10/2026)

| Mã QA | Sửa ở đâu trong plan |
|---|---|
| A1 `--ink-4` làm mờ nét dữ liệu | G1.2: thêm `--series-muted`, rà `rg "ink-4"`, danh sách 29 chỗ |
| A2 mono thiếu chữ Việt 500/600 | G1.1: đủ 6 khối, chỉ chữ số dùng mono; G10 mức phông ≤ 90KB; mẫu `tokens.css` đã khai đủ |
| A3 giữ co chữ KpiCard, ô MKT lớn | G3.1 |
| A4 cache briefing theo người | G5.1 (Cache) + test hai người |
| A5 nguồn sheet, hoàn, Chờ xác nhận, đồng bộ | G5.1 bảng nguồn |
| A6 Ctrl K lộ SĐT qua mạng, quét bảng | G6: route `/api/search`, dán đủ số + Enter |
| A7 số bộ phận không cộng ra tổng | G5.1 khay: Sale + CSKH + Khác = Doanh thu, MKT "không cộng thêm"; dòng phạm vi thẻ Doanh thu; ảnh mẫu đã sửa |
| A8 lời chào theo người xem | G5.1 |
| B1 viền con vật chờ tải | G1.4 |
| B2 primary tối | G1.3, G8 |
| B3 số tab Vận đơn không khớp | ảnh mẫu sửa: các tab cộng ra 1.776 |
| B4 "91 đơn" chưa rõ | G6 + ảnh mẫu: "91 đơn chốt tháng này" |
| B5 thanh kỳ điện thoại thiếu mục | G3.6 + ảnh mẫu: đủ 6 mục, cuộn ngang |
| B6 hai nút "So với" | G5.2 |
