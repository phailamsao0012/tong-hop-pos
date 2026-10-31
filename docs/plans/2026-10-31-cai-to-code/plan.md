# Cải tổ code web tổng: phân tầng rõ, lỗi ở đâu sửa tầng đó

Ngày 31/10/2026. Anh Vũ: "Cải tổ lại web nhé, code, sắp xếp sao cho chuẩn logic code, phân tầng rõ ràng, để khi lỗi fix được sớm nhất, dễ nhất, chia rõ ràng từng mục, lỗi ở đâu fix tầng đấy, không lan man đến code của việc khác."

Claude tự code (anh dặn 31/10). Mỗi bước là một PR nhỏ, **không đổi số, không đổi giao diện, không đổi quyền**; anh chỉ duyệt plan này một lần và xem báo cáo cuối.

## 1. Mục tiêu

- Nhìn tên thư mục là biết code thuộc việc gì (Pancake, báo cáo, team, KPI, Telegram, Zalo, vận hành).
- Mỗi lỗi chỉ nằm ở một tầng: đọc sai Pancake → `lib/pancake/`; tính sai số → `lib/reports/`; hiện sai → `app/views/`; chặn sai quyền → `lib/auth/`. Sửa tầng đó, không đụng tầng khác.
- Mỗi lỗi trên web hiện một **mã lỗi có tiền tố tầng** (`PK-`, `DB-`, `AUTH-`, `RP-`, `UI-`) để anh chụp màn hình là Claude biết sửa ở đâu.
- Có "hàng rào" tự động (test kiến trúc) để code mới không lẫn tầng trở lại.

## 2. Không được đổi

- Số trên web, tên nghiệp vụ, quyền xem, đường dẫn API (`/api/...`), tham số URL (bộ lọc giữ nguyên khi bấm vào số).
- `.github/workflows/*`, `wrangler*.json*`, `migrations/**`, `drizzle/**`.
- Cách chạy trên PC (`wrangler dev --local`, nhánh `claude/plan-chuyen-pc`) và cách deploy Cloudflare.
- Không thêm thư viện mới. Không đổi framework (vẫn vinext, React 19, D1).

## 3. Hiện trạng (đo ngày 31/10, sau #106)

| Chỗ | Số đo | Vấn đề |
|---|---|---|
| `lib/*.ts` | 139 file, 16.000 dòng, **phẳng một thư mục** | tên file gợi ý việc nhưng không nhóm; `sync.ts` 739 dòng |
| `app/api/**/route.ts` | 137 route, 7.200 dòng; **70 route tự viết SQL** (`db.prepare`) | lỗi SQL nằm ở route, không test được bằng `node:test`; `users/route.ts` 16 câu, `reports/marketing` 16 câu, `auth/*` 19 route có SQL |
| `app/dashboard.tsx` | **2.115 dòng**, 25 `useState`, 19 `useEffect`, 20 `fetch` | vừa là khung (sidebar, thanh trên, tab điện thoại), vừa là bộ định tuyến 60 trang, vừa chứa cả panel "Kết nối 6 POS" (230 dòng JSX + 15 state) |
| `app/*.tsx` | 100 file, 23.300 dòng, **42 file tự `fetch('/api/...')`** thay vì qua `app/api-fetch.ts` / `use-api.ts` | lỗi mạng, lỗi quyền xử lý mỗi nơi một kiểu |
| Định dạng số, ngày | 19 file `app/` có hàm định dạng riêng, 10 chỗ tạo `Intl.NumberFormat` | web và Telegram làm tròn khác nhau |
| Test | 114 file, 591 bài; 30 bài gọi thẳng route; **38 file `lib/` chưa có test** (trong đó `alerts`, `bot`, `customer360`, `sale-quality`, `repurchase-report`, `products-report`...) | logic chưa có test là chỗ sửa dễ gãy |
| Lỗi hiện ra | route trả `{ error }` tự do, web hiện "Lỗi" chung | không biết lỗi ở tầng nào |

## 4. Thiết kế đích

```
lib/
  shared/      periods, format (số, tiền "tr", ngày, +/−), seg-lens, scope-filter, utils, errors
  auth/        auth, access, access-levels, login-session, login-requests, mfa, device-pair, google-id
  pancake/     pancake, pancake-probe, pancake-reference, sync, customers-sync, notes-pending, shop-map, order-status
  reports/     stats, report-*, overview-*, sale-*, cskh-*, calls, products-*, customer*, van-don, trends*, growth*, metrics, pivot
  teams/       web-teams, team, staff-scope, team-source, team-sheet, hr-*, people, tenure, pos-staff
  kpi/         targets, kpi-pace, forecast*, hot-close
  bot/         telegram, bot*, alerts, stuck-alert, watch*, advisor      ← cùng lib/shared/format với web
  zalo/        zalo*, dispatch*
  ops/         backup, scheduler, d1-usage, cf-cost, audit, mail, satellites, sat-proxy
  ai/          claude, ai-*
  demo/        (giữ nguyên)
app/
  shell/       sidebar, thanh trên, tab điện thoại, bộ lọc chung (từ dashboard.tsx tách ra)
  views/<nhóm>/  overview, sale, cskh, products, customers, marketing, giao-viec, settings...
  settings/    settings-hub, pos-connection (panel Kết nối POS tách khỏi dashboard, có hook riêng)
  api-fetch.ts, use-api.ts  (một đường lấy dữ liệu duy nhất; lỗi có mã tầng)
app/api/**/route.ts   chỉ: guard quyền → đọc tham số → gọi lib → trả JSON (≤ 40 dòng/route)
tests/<nhóm>/ ... + tests/arch/ (test kiến trúc)
```

Luật tầng, có test kiểm (`tests/arch/`):
1. `lib/**` không import React, không import `app/`.
2. `app/api/**/route.ts` không có `db.prepare`, không có câu SQL; chỉ gọi hàm trong `lib/`.
3. `app/views/**` không `fetch('/api')` thẳng; đi qua `apiFetch`/`useApi`.
4. Lỗi từ `lib/` ném `AppError(code, message)`; route đổi thành JSON `{ error, code, requestId }`; web hiện "Lỗi PK-12 · mã 7f3a" cạnh nút thử lại. Tiền tố: `AUTH` quyền, `PK` Pancake, `DB` D1, `RP` tính báo cáo, `BOT` Telegram/Zalo, `UI` giao diện.
5. Số và ngày chỉ định dạng ở `lib/shared/format.ts` (web và Telegram dùng chung).

Mỗi luật có **danh sách tạm chấp nhận** (allowlist) ghi các chỗ còn vi phạm; bước nào dọn xong thì rút khỏi danh sách. Test fail nếu có vi phạm mới ngoài danh sách. Như vậy ngay từ bước 1 code mới đã không lẫn tầng.

Cách chắc "không đổi số": bước 1 thêm `scripts/dev/so-api.mjs`: đăng nhập web số ảo, gọi 40 API báo cáo với cùng bộ lọc, lưu JSON. Mỗi PR chạy lại và `diff` với bản trước: phải trùng từng byte (trừ trường thời gian). Ảnh chụp 12 trang chính so bằng mắt trước/sau.

## 5. Các bước (mỗi bước một PR vào `main`, anh không cần duyệt từng PR)

| # | Nhánh | Việc | Tiêu chí xong | Cách kiểm |
|---|---|---|---|---|
| B1 | `claude/cai-to-b1-hang-rao` | `tests/arch/` 3 test luật tầng với allowlist = hiện trạng; `lib/shared/errors.ts` (`AppError`, mã tầng); `scripts/dev/so-api.mjs` + bản JSON gốc | test mới chạy xanh; JSON gốc lưu ở `tests/snapshots/api/` (số ảo) | `pnpm test` |
| B2 | `claude/cai-to-b2-chia-lib` | `git mv` 139 file `lib/` vào thư mục nhóm; sửa import; `tests/` chia thư mục theo | không đổi dòng code nào ngoài import | typecheck, test, build; `so-api` trùng |
| B3 | `claude/cai-to-b3-route-auth` | 19 route `auth/*` + `users`, `teams`, `web-teams`, `config`: SQL chuyển vào `lib/auth/*`, `lib/teams/*`; thêm test với `tests/support/d1-sqlite` | route ≤ 40 dòng, không `prepare`; allowlist bớt 23 route | test + đăng nhập, đổi mật khẩu, passkey thử trên số ảo |
| B4 | `claude/cai-to-b4-route-reports` | 30 route `reports/*`: SQL vào `lib/reports/*` | allowlist bớt 30 route | `so-api` trùng từng byte |
| B5 | `claude/cai-to-b5-route-con-lai` | route còn lại (`sync`, `dispatch`, `targets`, `demo`, `ai`, `backup`...) | allowlist route = rỗng, xoá luôn allowlist | test; đồng bộ số ảo chạy đủ 5 bước |
| B6 | `claude/cai-to-b6-khung` | Tách `app/shell/` (sidebar, thanh trên, tab điện thoại, bộ lọc) và bảng định tuyến `app/views/registry.ts` (id trang → component, quyền) khỏi `dashboard.tsx` | `dashboard.tsx` ≤ 600 dòng; mọi trang vẫn mở từ sidebar, URL `?view=` giữ nguyên | ảnh 12 trang trước/sau trùng; test `nav-structure` |
| B7 | `claude/cai-to-b7-cai-dat` | Panel "Kết nối POS" thành `app/settings/pos-connection.tsx` + hook `usePosConnection`; `dashboard.tsx` ≤ 300 dòng | 15 state POS rời khỏi dashboard | kiểm tra API, lưu ID, lấy 50 đơn trên số ảo |
| B8 | `claude/cai-to-b8-fetch` | 42 file bỏ `fetch('/api')` thẳng, dùng `apiFetch`/`useApi`; web hiện mã lỗi + mã yêu cầu | allowlist fetch = rỗng; tắt mạng thì mọi trang hiện cùng một ô lỗi | ảnh ô lỗi; test `use-api` |
| B9 | `claude/cai-to-b9-dinh-dang` | Gom 19 bộ định dạng về `lib/shared/format.ts`; Telegram dùng chung (gắn với quy chuẩn Telegram) | không còn `Intl.NumberFormat` ngoài `format.ts` | `so-api` trùng; ảnh bảng số trước/sau |
| B10 | `claude/cai-to-b10-test` | Thêm test cho 38 file `lib/` chưa có, ưu tiên file có SQL và file tính số (`alerts`, `sale-quality`, `repurchase-report`, `products-report`, `customer360`) | mọi file `lib/` có ít nhất một test; `pnpm test` < 15 phút | CI |

Thứ tự bắt buộc: B1 → B2 → (B3, B4, B5 có thể xen) → B6 → B7 → B8 → B9 → B10. Mỗi PR gộp xong mới mở PR sau để tránh xung đột. Việc khác (Telegram, thử tải PC) chen vào giữa vẫn được vì mỗi bước nhỏ.

## 6. Kiểm thử

- Trước B1: chụp 12 trang chính (Tổng quan, Sale, CSKH, Cuộc gọi, Sản phẩm, Khách hàng, Marketing, Vận đơn, KPI, Giao việc, Cài đặt, Bảo mật) trên số ảo, màn điện thoại và máy tính; lưu `so-api` gốc.
- Mỗi PR: `pnpm typecheck`, `pnpm test`, `pnpm lint` (không thêm lỗi), `pnpm build`, `so-api` diff trống, ảnh so lại trang bị chạm.
- Sau B10: chạy lại bộ đồng bộ số ảo đủ 5 bước, đăng nhập 4 vai trò (chủ, mentor, lead, xem), bấm 20 con số xem có giữ bộ lọc.
- Gửi anh một báo cáo ảnh: trước/sau mỗi trang + bảng số đo (dòng, route có SQL, file chưa test) trước/sau.

## 7. Rủi ro và cách lùi

- Đổi chỗ file làm nhánh khác (`claude/plan-chuyen-pc`, `codex/*` đang treo) khó gộp: làm B2 trong một PR riêng, gộp nhanh trong một buổi; nhánh treo thì rebase ngay sau, Claude làm.
- Chuyển SQL ra `lib/` mà lệch tham số: `so-api` bắt được vì JSON phải trùng từng byte.
- Tách `dashboard.tsx` dễ rơi state (bộ lọc, POS đang chọn): B6 chỉ di chuyển JSX, state giữ nguyên chỗ; B7 mới chuyển state POS, có ảnh so.
- Lùi: mỗi PR là một squash commit, `git revert` một commit là về như cũ; không có migration nên không mất dữ liệu.
- Chi phí Cloudflare: không thêm câu đọc D1 nào; `so-api` chỉ chạy trên số ảo ở máy Claude.
- Web đang chuyển sang PC: mọi bước đều chạy được bằng `wrangler dev --local`; không đụng script PC.
