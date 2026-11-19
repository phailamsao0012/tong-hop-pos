# Plan: Nghiên cứu kênh Threads @imimran004 rồi dựng "Demo 2" theo hướng kênh đó (16/10/2026)

Anh Vũ nhắn 16/10 05:02Z: "https://www.threads.com/@imimran004 cho 1 codex khác nghiên cứu kênh thread này đi, lên báo cáo chi tiết nhé, rồi sau đó áp lên web mình nhưng bản demo khác, không giống demo của odoo hay cũ, nói chung khác theo hướng kênh thread đó".

Claude viết plan này. Codex trên PC làm toàn bộ, chạy liền một mạch bằng `chay.mjs` (cùng thư mục). Claude kiểm một lần khi Codex xong, rồi gửi anh báo cáo + link demo 2. Không hỏi anh giữa chừng.

## 1. Mục tiêu

1. **Báo cáo chi tiết về kênh** `@imimran004` (bước R1): kênh nói về gì, phong cách hình ảnh, các mẫu giao diện / ý tưởng lặp lại, cái gì áp được cho web tổng, cái gì không. Viết tiếng Việt, đọc được trên điện thoại.
2. **Bản thiết kế + mẫu tĩnh** (bước R2): áp hướng của kênh lên web tổng, kèm danh sách ít nhất 10 điểm khác rõ với hai bản đã làm (giao diện mới theo @ikramsakib và Học từ Odoo).
3. **Demo 2**: một bản demo RIÊNG, tên miền `demo2.tonghopposmegatech.io.vn`, Worker `tong-hop-pos-demo2`, D1 `tong-hop-pos-demo2`, deploy từ nhánh `demo-2`. Cùng dữ liệu ảo, cùng công thức số với web thật; chỉ khác giao diện và cách trình bày.

## 2. Không được đổi

- **Demo hiện tại không đụng**: không sửa, không đẩy nhánh `claude/project-thread-3ujeoc`, `demo-gop`, `giao-dien-moi`, `codex/hoc-tu-odoo`, `main`. Không sửa `.github/workflows/deploy-demo.yml`, `.github/workflows/deploy.yml`, `scripts/deploy-demo.mjs`, `scripts/deploy.mjs`, `wrangler.jsonc`.
- **Số liệu và quyền không đổi**: không sửa `app/api/**`, `lib/**`, `db/**`, `drizzle/**`, `worker.ts`, `middleware*`. Mọi con số trên demo 2 phải bằng đúng con số trên web tổng cùng dữ liệu (cùng API, cùng JSON). Chỉ đổi cách trình bày ở `app/**/*.tsx`, `app/globals.css`, `app/ui/**`, `components/ui/**`, `public/fonts/**`.
- **Tên số** giữ đúng quy tắc: bộ phận Vận đơn dùng "Đơn chuyển đi", "Doanh số chuyển đi", "Người lên đơn", không dùng "bán hàng / chốt / doanh thu". Doanh số chỉ tính người có hậu tố MKT/CSKH/SALE (đã nằm trong `lib/`, không đụng). Bấm vào số vẫn mở trang chi tiết, giữ bộ lọc. So kỳ trước cùng mốc giờ giữ nguyên.
- **Màu thương hiệu** `#17684b` vẫn là màu nhấn chính (anh chốt). Nền, chữ, đường kẻ, màu phụ, phông, bo góc, bóng, bố cục được đổi theo kênh.
- **Che SĐT, quyền xem trang**: giữ nguyên (nằm ở API).
- **Repo công khai**: không số thật, tên khách, SĐT thật, email thật, token. Không chép nguyên văn bài của kênh dài quá 1 câu; không đưa ảnh gốc của kênh vào repo (bản quyền của người ta). Ảnh trong repo chỉ là ảnh chụp mẫu / demo của mình.
- Không thêm thư viện mới (`pnpm add`). Phông mới (nếu kênh dùng) phải là phông mở (OFL), tự host trong `public/fonts/`, file `.woff2` do máy tải ở bước R0 (Codex không dùng mạng). Không có thì dùng phông đang có (Be Vietnam Pro, Bricolage Grotesque, JetBrains Mono nếu có).

## 3. Hiện trạng (đã kiểm ở `main` 1f6cde5, ngày 16/10)

- Nền nhánh này là `main` (web thật). Chọn `main` thay vì nhánh demo cũ để demo 2 không mang menu Odoo hay giao diện @ikramsakib; nếu anh thích thì đường lên web thật ngắn nhất.
- Framework: vinext (React 19, RSC), Tailwind v4 + shadcn (`components/ui/*`), biểu đồ Chart.js.
- Token màu và lớp dùng chung: `app/globals.css` (703 dòng; token sáng/tối, bí danh shadcn trong `@theme inline`, lớp `.num`, `.kpi`, `.tbl`, `.seg`, `.btn`, `.nav-item`…). Chữ số dùng Be Vietnam Pro 700 tabular-nums (lớp `.num`). Phông khai ở `public/fonts/fonts.css`.
- Khung trang + menu + bộ lọc chung: `app/dashboard.tsx` (2102 dòng: `View`, `navigation`, `DEPTS`, thanh trên, bộ lọc kỳ / POS / team). Trang con: 35 file `app/*-view.tsx` / `*-panel.tsx`, khối dùng chung `app/ui-kit.tsx`, `app/ui-kit-pos.tsx`, `app/exec-blocks.tsx`, `app/overview-*.tsx`, `app/ui/theme.ts`, `app/ui/chart-motion.ts`, `app/ui/motion.ts`.
- Đăng nhập: `app/login/page.tsx`, `app/auth-form.tsx`. Màn mở đầu: `app/logo-intro.tsx` + `app/logo-intro.css`. Linh vật: `app/megatech-mascot.tsx`.
- Demo: `DEMO_MODE=1` thay Pancake + web nhân sự bằng bản giả `lib/demo/` (người và số ảo). Tài khoản demo bấm ngay ở trang đăng nhập, mật khẩu `demo@2026`. Deploy demo hiện tại: `scripts/deploy-demo.mjs` (Worker `tong-hop-pos-demo`, D1 riêng, tên miền `demo.tonghopposmegatech.io.vn`, tự tạo D1 nếu chưa có, chạy migration rồi deploy) gọi từ `.github/workflows/deploy-demo.yml` (đẩy nhánh `claude/project-thread-3ujeoc`) và job `deploy-demo` trong `deploy.yml`.
- Kiểm trình duyệt sau deploy: `scripts/kiem-trinh-duyet.cjs` (đọc `BASE`, `OUT`). Nó dựa vào: `.nav-item[aria-current="page"]`, `?view=<tên>` mở đúng trang, radiogroup "Thời gian tự khóa", hộp thoại "Web đang khóa", số bấm được mở trang chi tiết. **Giao diện mới phải giữ các điểm bám này** (đổi vẻ ngoài thoải mái, giữ class / aria / chữ mà script tìm).
- Hai bản đã làm (để tham khảo và để KHÁC đi; máy chép vào `.kenh/tham-khao/` ở bước R0):
  - Giao diện mới theo @ikramsakib: `docs/giao-dien-moi/plan.md`, `mau-threads-ikramsakib.md`, `mau/index.html`, `mau/tokens.css` (nhánh `demo-gop`). Đặc điểm: bảng điều khiển kiểu dev, số JetBrains Mono, menu trái sáng, cột "Việc cần anh", Ctrl K.
  - Học từ Odoo: `docs/plans/2026-10-15-hoc-tu-odoo/plan.md` (nhánh `codex/hoc-tu-odoo`). Đặc điểm: menu khuôn Hôm nay / Danh mục / Báo cáo / Cấu hình, Việc của tôi, bảng xoay, chi tiết khách kiểu form.

## 4. Thiết kế chung (Codex cụ thể hoá ở R2)

### 4.1 Cách áp kênh

Chưa ai trong nhóm xem được kênh (Threads chặn máy chủ đám mây). Vì vậy:

- R0 (máy) chụp và tải kênh về `.kenh/` trong worktree (không commit).
- R1 (Codex) xem từng ảnh, đọc từng bài, viết báo cáo. **Kênh nói về gì thì áp cái đó**:
  - Kênh về thiết kế giao diện / dashboard / app: áp ngôn ngữ hình ảnh (màu nền, phông, bo góc, bóng, mật độ, kiểu thẻ, kiểu biểu đồ, kiểu menu, chuyển động) + bố cục màn hình.
  - Kênh về sản phẩm / AI / năng suất / kinh doanh: áp cách trình bày ý tưởng (vd tóm tắt bằng câu, thẻ "việc nên làm", dòng thời gian…) **chỉ bằng dữ liệu API đang có**, không thêm API.
  - Kênh pha trộn: làm cả hai, ưu tiên phần hình ảnh.
- Ảnh lấy được ít (dưới 5 bài có hình): vẫn làm, ghi rõ trong báo cáo mục "Giới hạn", suy ra hướng từ phần có được (ảnh đại diện, tiểu sử, link trong tiểu sử, chữ các bài). Không dừng, không hỏi.

### 4.2 "Khác" nghĩa là gì (tiêu chí bắt buộc ở R2)

Bản thiết kế phải có bảng **"Khác hai bản cũ"** ≥ 10 dòng, mỗi dòng: hạng mục | @ikramsakib làm | Odoo làm | Demo 2 làm | lấy từ bài nào của kênh. Hạng mục tối thiểu: bố cục khung (menu trái / trên / dưới / nổi…), màu nền và mặt thẻ, phông chữ tiêu đề, phông chữ số, bo góc + bóng, kiểu thẻ số (KPI), kiểu biểu đồ, kiểu bảng, trang Tổng quan bố trí ra sao, điện thoại (390px) điều hướng ra sao, chế độ tối, chuyển động. Một dòng mà Demo 2 giống một trong hai bản cũ thì phải ghi lý do (vd quy tắc của anh bắt giữ).

### 4.3 Cờ "Demo 2" trên giao diện

Góc thanh trên hiện nhãn nhỏ "Demo 2" khi `location.hostname` bắt đầu bằng `demo2.` (đọc phía trình duyệt, không cần biến môi trường mới). Để anh không nhầm hai demo.

### 4.4 Hạ tầng demo 2 (bước H0)

- `scripts/deploy-demo-2.mjs`: chép `scripts/deploy-demo.mjs`, đổi `NAME='tong-hop-pos-demo2'`, `DOMAIN='demo2.tonghopposmegatech.io.vn'`, **bỏ hẳn kho R2 sao lưu** (`config.r2_buckets = []`, không gọi `wrangler r2`), `SEARCH_LIMIT` namespace_id `'1503'`, file cấu hình `dist/server/wrangler.demo2.json`, file migrate tạm `wrangler.demo2-migrate.json`. Giữ y nguyên `vars` của demo cũ (`DEMO_MODE: '1'` …). Đầu file một dòng chú thích nói đây là demo 2 theo plan này.
- `.github/workflows/deploy-demo-2.yml`: chép `deploy-demo.yml`, đổi `name: Deploy demo 2`, `on.push.branches: [demo-2]` (giữ `paths-ignore`, `workflow_dispatch`), `concurrency.group: deploy-demo-2`, job chạy `node scripts/deploy-demo-2.mjs`, bước "Thử đăng nhập" và job `kiem-trinh-duyet` dùng `https://demo2.tonghopposmegatech.io.vn`, tên artifact `kiem-trinh-duyet-demo2`. Bước kiểm trình duyệt để `continue-on-error: true` (giao diện mới có thể làm lệch vài điểm bám; báo đỏ nhưng không chặn).
- Không sửa `deploy.yml`, `deploy-demo.yml`, `deploy-demo.mjs`.

## 5. Các bước

Mỗi bước: Codex làm, máy kiểm (`pnpm typecheck`, `pnpm test`, `pnpm lint` không thêm lỗi, `pnpm build`, file đúng phạm vi, không lộ SĐT/email/token), sai thì Codex sửa tối đa 3 vòng, đạt thì máy commit. Bước R0 và "chụp" là máy làm, không phải Codex.

**R0. Máy thu kênh** (chay.mjs tự làm, không Codex)
- Cài Playwright 1.56.1 + Chromium vào `~/codex-viec/demo-imimran/pw` (một lần).
- Mở `https://www.threads.com/@imimran004` (khung 1440×900 và 390×844, ngôn ngữ en-US), cuộn tới khi hết bài mới hoặc 80 lượt cuộn; đóng hộp đăng nhập nếu hiện (Esc / nút đóng). Ít hơn 3 bài thì thử thêm `https://www.threads.net/@imimran004`.
- Lưu vào `.kenh/` (gốc worktree, đã thêm vào `.git/info/exclude`): `trang-*.png` (ảnh chụp từng màn khi cuộn), `bai.json` (mỗi bài: link, giờ, chữ, danh sách ảnh), `anh/*.jpg|png|webp` (ảnh trong bài, rộng ≥ 300px, tối đa 150 ảnh), `tieu-su.json` (tên, tiểu sử, link trong tiểu sử, số bài thu được). Mở thêm tối đa 25 bài có nhiều ảnh nhất theo link riêng để lấy đủ ảnh trong carousel.
- Chép tài liệu hai bản cũ vào `.kenh/tham-khao/` bằng `git show` (không cần mạng ngoài GitHub): `docs/giao-dien-moi/{plan.md,mau-threads-ikramsakib.md,mau/tokens.css,mau/index.html}` từ `origin/demo-gop`, `docs/plans/2026-10-15-hoc-tu-odoo/plan.md` từ `origin/codex/hoc-tu-odoo`.
- Phông: nếu R1 ghi tên phông mở ở dòng `PHONG: <tên Google Fonts>` trong `bao-cao-kenh.md`, máy tải `.woff2` (latin, latin-ext, vietnamese; 400/500/600/700) từ Google Fonts về `.kenh/phong/` trước bước R2 để Codex chép vào `public/fonts/`.

**R1. Báo cáo chi tiết về kênh**
- Đọc: `.kenh/tieu-su.json`, `.kenh/bai.json`, xem **từng** ảnh trong `.kenh/anh/` và `.kenh/trang-*.png` (dùng công cụ xem ảnh của Codex), `.kenh/tham-khao/*`.
- Viết `docs/plans/2026-10-16-demo-imimran/bao-cao-kenh.md`, tiếng Việt, các mục:
  1. Tóm tắt 5 dòng: kênh là ai, nói về gì, phong cách một câu, áp được gì cho web tổng.
  2. Số liệu thu được: số bài, số ảnh, khoảng thời gian bài, giới hạn (bị chặn đăng nhập…).
  3. Chủ đề: nhóm các bài theo chủ đề, mỗi nhóm: số bài, ý chính (diễn lại bằng lời mình), 1–3 bài tiêu biểu (link).
  4. Ngôn ngữ hình ảnh: bảng màu (mã hex đo từ ảnh, ghi màu nào dùng cho gì), phông (tên nếu nhận ra, hoặc mô tả: có chân / không chân / mono, độ đậm, cỡ), bo góc (px ước), bóng, viền, mật độ, lưới, khoảng trắng, biểu tượng, hình minh hoạ, kiểu biểu đồ, chuyển động (nếu có video / gif), sáng / tối.
  5. Mẫu thành phần lặp lại: thẻ số, bảng, menu, thanh trên, bộ lọc, thẻ người, dòng thời gian, trạng thái rỗng, nút… Mỗi mẫu: tả kỹ để người không xem ảnh vẫn dựng lại được, ảnh nào.
  6. Bố cục màn hình tiêu biểu (≥ 4): chia cột, thứ tự khối, cỡ khối.
  7. Áp vào web tổng: bảng "Thấy ở kênh → Áp vào trang nào của web tổng → Cách áp → Mức ưu tiên (cao/vừa/thấp)" ≥ 15 dòng; và "Không áp, vì sao" (vd trái quy tắc số của anh, cần API mới).
  8. So với hai bản cũ (@ikramsakib, Odoo): giống ở đâu (phải tránh), khác ở đâu.
  9. Dòng cuối riêng: `PHONG: <tên phông Google Fonts mở dùng cho tiêu đề>, <tên phông cho chữ số hoặc "giữ">` (chỉ phông có trên Google Fonts, có tiếng Việt; không có thì `PHONG: giữ`).
- File được sửa: chỉ `docs/plans/2026-10-16-demo-imimran/bao-cao-kenh.md`.
- Xong khi: đủ 9 mục, mục 7 ≥ 15 dòng, mục 4 có ≥ 6 mã hex, có dòng `PHONG:`; không chép nguyên văn quá 1 câu mỗi bài.

**R2. Bản thiết kế Demo 2 + mẫu tĩnh**
- Đọc báo cáo R1, `app/globals.css`, `app/dashboard.tsx` (khung, menu), `app/overview-view.tsx`, `app/ui-kit.tsx`.
- Viết `docs/plans/2026-10-16-demo-imimran/thiet-ke.md`: (a) token sáng + tối đầy đủ (tên biến trùng tên trong `app/globals.css` để G1 thay thẳng), (b) phông, cỡ chữ từng bậc, (c) khung trang sáng / điện thoại, (d) từng trang: Tổng quan, Sale, CSKH, MKT, Vận đơn, Đơn thô, Khách hàng, Cài đặt / Bảo mật, Đăng nhập: bố cục khối, khối nào lên trên, (e) kiểu biểu đồ Chart.js (màu dãy, lưới, chú thích, tooltip), (f) bảng "Khác hai bản cũ" theo 4.2, (g) danh sách điểm bám kiểm trình duyệt phải giữ (mục 3).
- Mẫu tĩnh `docs/plans/2026-10-16-demo-imimran/mau/index.html` + `mau/tokens.css`: một file HTML không cần mạng, số giả, chuyển màn bằng `?s=home|sale|vandon|login&t=dark|light`, khung 1440 và 390 đều đẹp. Phông lấy từ `.kenh/phong/` chép sang `mau/fonts/` (nếu có).
- Máy chụp mẫu (sau khi kiểm đạt): `mau/anh/{home,sale,vandon,login}-{light,dark}-{1440,390}.png`.
- File được sửa: `docs/plans/2026-10-16-demo-imimran/{thiet-ke.md,mau/**}`.
- Xong khi: bảng "Khác" ≥ 10 dòng, mẫu mở được không mạng, 4 màn × sáng/tối.

**H0. Hạ tầng demo 2**
- Làm đúng 4.4. Thêm `scripts/deploy-demo-2.mjs --local` chạy được (chỉ ghi `dist/server/wrangler.demo2.json`, không gọi Cloudflare); máy kiểm chạy thử lệnh này sau `pnpm build`.
- File được sửa: `scripts/deploy-demo-2.mjs`, `.github/workflows/deploy-demo-2.yml`.
- Xong khi: `node scripts/deploy-demo-2.mjs --local` thoát 0, file ghi ra có `name: tong-hop-pos-demo2`, route `demo2.tonghopposmegatech.io.vn`, `r2_buckets: []`.

**G1. Nền: token, phông, khung, menu, nhãn Demo 2**
- Thay token sáng / tối trong `app/globals.css` theo `thiet-ke.md` (a); phông mới vào `public/fonts/` + `public/fonts/fonts.css`; lớp `.num`, `.kpi`, `.tbl`, `.seg`, `.btn`, `.nav-item` đổi vẻ theo thiết kế.
- Khung `app/dashboard.tsx`: bố cục menu / thanh trên / vùng nội dung theo thiết kế (c). Giữ `View`, `navigation` (danh sách trang + quyền), `?view=`, `.nav-item[aria-current="page"]`, bộ lọc kỳ / POS / team và hành vi của chúng. Chỉ đổi JSX trình bày + class. Nhãn "Demo 2" theo 4.3.
- `app/ui/theme.ts`, `app/ui/chart-motion.ts`: màu dãy biểu đồ, lưới, phông biểu đồ theo (e).
- File được sửa: `app/globals.css`, `public/fonts/**`, `app/dashboard.tsx`, `app/ui/**`, `app/layout.tsx`, `components/ui/**`, `tests/giao-dien-demo2*.test.ts`.
- Test mới `tests/giao-dien-demo2.test.ts`: đọc `app/globals.css`, kiểm có đủ biến token ở cả sáng và tối (danh sách lấy từ thiết kế), `#17684b` còn là `--primary` sáng.

**G2. Tổng quan + đăng nhập + màn mở đầu**
- `app/overview-view.tsx`, `app/overview-sections.tsx`, `app/overview-trends.tsx`, `app/exec-blocks.tsx`, `app/ui-kit.tsx`, `app/ui-kit-pos.tsx`, `app/mkt-headline.tsx`, `app/monthly-*.tsx`, `app/pos-*.tsx`, `app/stale-chip.tsx`, `app/login/page.tsx`, `app/auth-form.tsx`, `app/logo-intro.tsx`, `app/logo-intro.css`: bố cục và vẻ theo thiết kế (d). Không đổi lời gọi API, không đổi cách tính, không đổi tên số.
- File được sửa: các file trên + `app/ui/**`, `app/globals.css`, `tests/giao-dien-demo2*.test.ts`.

**G3. Sale + CSKH**
- `app/sale-*.tsx`, `app/cskh-*.tsx`, `app/care-view.tsx`, `app/calls-view.tsx`, `app/shift-*.tsx`, `app/staff-*.tsx`, `app/ladder-table.tsx`, `app/team-*.tsx`, `app/uncounted-*.tsx`, `app/compare-view.tsx`. Biểu đồ mini từng người: tăng xanh, giảm đỏ (giữ). Không thêm lại khu thẻ nhóm sản phẩm ở Sale/CSKH (anh đã bỏ).
- File được sửa: các file trên + `app/ui/**`, `app/globals.css`, `tests/giao-dien-demo2*.test.ts`.

**G4. Marketing**
- `app/marketing-*.tsx`, `app/mkt-*.tsx`, `app/origin-view.tsx`, `app/order-origin-filter.tsx`, `app/products-view.tsx`, `app/product-group-blocks.tsx`, `app/sheet-cost-link.tsx`.
- File được sửa: các file trên + `app/ui/**`, `app/globals.css`, `tests/giao-dien-demo2*.test.ts`.

**G5. Vận đơn, đơn thô, khách hàng, kho**
- `app/van-don-view.tsx`, `app/shipping-lines.tsx`, `app/raw-orders-view.tsx`, `app/customers-view.tsx`, `app/customer360-view.tsx`, `app/pipeline-view.tsx`, `app/dispatch-view.tsx`, `app/reconcile-line.tsx`, `app/status-filter.tsx`, `app/pancake-*.tsx`, `app/center-view.tsx`, `app/custom-report-view.tsx`.
- Giữ tên số Vận đơn (mục 2).
- File được sửa: các file trên + `app/ui/**`, `app/globals.css`, `tests/giao-dien-demo2*.test.ts`.

**G6. Cài đặt, quản trị, các trang còn lại**
- Mọi `app/*-panel.tsx`, `app/audit-view.tsx`, `app/security-panel.tsx`, `app/sessions-card.tsx`, `app/metric-settings.tsx`, `app/idle-lock.tsx`, `app/alert-panel.tsx`, `app/ai-pack.tsx`, `app/spotlight.tsx`, `app/setup/page.tsx`, `app/privacy/page.tsx`, `app/qr/**`, các `app/*.tsx` còn lại chưa thuộc G2–G5. Giữ radiogroup "Thời gian tự khóa" và hộp thoại "Web đang khóa".
- File được sửa: `app/**/*.tsx` trừ `app/api/**`, + `app/ui/**`, `app/globals.css`, `tests/giao-dien-demo2*.test.ts`.

**G7. Điện thoại 390px, chế độ tối, chuyển động, rà cuối**
- Rà mọi trang ở 390px: không tràn ngang, cột tên trong bảng không đè tiêu đề, menu điện thoại theo thiết kế (c). Chế độ tối đủ tương phản (chữ thường ≥ 4.5:1). `prefers-reduced-motion` tắt chuyển động.
- Viết `docs/plans/2026-10-16-demo-imimran/ket-qua-codex.md`: đã làm gì từng trang, chỗ khác thiết kế, bảng "Khác hai bản cũ" bản cuối (đối chiếu thực tế), việc chưa làm.
- File được sửa: `app/**/*.tsx` trừ `app/api/**`, `app/globals.css`, `app/ui/**`, `components/ui/**`, `docs/plans/2026-10-16-demo-imimran/ket-qua-codex.md`, `tests/giao-dien-demo2*.test.ts`.

**Máy đẩy** (chay.mjs, sau G7): đẩy nhánh làm việc `codex/demo-imimran`, rồi đẩy cùng commit lên nhánh `demo-2` (GitHub tự deploy demo 2). Không đẩy nhánh nào khác.

## 6. Kiểm cuối (Claude, một lần, sau khi máy đẩy)

1. Đọc `bao-cao-kenh.md`, `thiet-ke.md`, ảnh mẫu, `ket-qua.md`; xem diff `main..codex/demo-imimran`: không file nào trong `app/api/**`, `lib/**`, `db/**`, `drizzle/**`, `worker.ts`, workflow / script deploy cũ.
2. Workflow "Deploy demo 2" xanh; mở `demo2.tonghopposmegatech.io.vn`, đăng nhập `chu@demo.megatech.vn` / `demo@2026`, so 5 con số Tổng quan với `demo.tonghopposmegatech.io.vn` cùng kỳ (cùng dữ liệu ảo nên phải bằng nhau, trừ khi WORLD_VERSION hai bên khác), chụp 1440 + 390, sáng + tối.
3. Đạt: gửi anh Artifact gồm báo cáo kênh (rút gọn) + ảnh + link demo 2. Không đạt: ghi lỗi vào `ghi-them.md` để máy giao Codex sửa (chạy lại chay.mjs, các bước đã commit tự bỏ qua).

## 7. Rủi ro và cách quay lại

| Rủi ro | Xử lý |
|---|---|
| Threads bắt đăng nhập, thu được ít bài | Vẫn làm từ phần có; báo cáo ghi "Giới hạn". Không đăng nhập bằng tài khoản của anh. |
| Kênh không về thiết kế | Áp theo 4.1 (cách trình bày ý tưởng), vẫn đổi vẻ theo ảnh đại diện / phong cách bài. |
| Tên miền demo2 chưa gắn được (token Cloudflare thiếu quyền) | Workflow báo đỏ ở bước deploy; Claude báo điều phối một lần, demo 2 vẫn xem được ở `tong-hop-pos-demo2.<tài khoản>.workers.dev` (`workers_dev: true`). |
| Giao diện mới làm lệch kiểm trình duyệt | Bước đó `continue-on-error`; Claude xem ảnh artifact, giao sửa nếu lỗi thật. |
| Codex đụng số / API | Máy kiểm chặn file ngoài phạm vi (trả về như cũ) và báo Codex sửa. |
| Muốn bỏ demo 2 | Xoá nhánh `demo-2`, `codex/demo-imimran`; Worker + D1 `tong-hop-pos-demo2` xoá trên Cloudflare khi anh bảo. Không ảnh hưởng web thật hay demo cũ. |

## 8. Không làm trong đợt này

- Lên web thật (chỉ khi anh xem demo 2 và nói ok).
- Gộp demo 2 với demo cũ.
- Đổi app iPhone.
