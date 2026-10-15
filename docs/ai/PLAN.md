# PLAN: áp giao diện mới cho web tổng POS

> Claude viết, 2026-10-15. **Codex không sửa file này.** Nghiệm thu thấy lỗi thì Claude thêm task `FIX-*` vào đây và vào PROGRESS.md.
> Nguồn gộp: `docs/giao-dien-moi/00-plan.md`, `WEBTONGHOPPOS/NOTES.md` (mục "BẢNG MÀU CHÍNH THỨC" và "SCOPE"), `WEBTONGHOPPOS/TASKS.md` (kết quả nghiệm thu bước 1–3).
> Số dòng trong plan đo tại commit `2817ffc`. Code có thể đã xê dịch, nên **tìm theo tên** (class, hằng, hàm) chứ đừng tin số dòng tuyệt đối.

## 1. Mục tiêu

Áp ngôn ngữ thiết kế "dark command center" (bento, card, chip nhạt, mật độ cao, chuyển động tinh) lên web tổng,
**giữ nhận diện xanh lá MEGATECH** (lime `#D9F36D`, xanh `#17684B`, cam `#FF8A3D`). Không làm lại web, không đổi nghiệp vụ.

## 2. Phạm vi

**Trong phạm vi:** `app/globals.css`, `app/layout.tsx`, `app/ui-kit.tsx`, `app/center-view.tsx`, `app/exec-blocks.tsx`,
`app/dashboard.tsx` (khung: max-width, padding, màu nhóm menu), `components/ui/sidebar.tsx` (chỉ `SIDEBAR_WIDTH`),
các view chỉ khi cần bọc `TableWrap` hoặc thay hex cứng bằng token.

**Ngoài phạm vi (không chạm):** mascot `app/husky.tsx`, `app/megatech-mascot.tsx`, `app/logo-intro.tsx/.css`,
màn đăng nhập `app/auth-form.tsx`, khối `.den-*` trong `globals.css`, `lib/` (gồm `lib/mail.ts`, `lib/bot-charts.ts`),
`components/ui/*` trừ `sidebar.tsx`, `wrangler.jsonc`, `drizzle/`, `db/`, app iOS/Android, deploy.

**Không làm:** đổi số liệu, cách tính, tên nghiệp vụ, quyền xem, thêm thư viện, tạo `tailwind.config.js`.

## 3. Kiến trúc cần biết

- React 19 + `vinext` (giống Next) chạy trên Cloudflare Workers, D1 + drizzle, Tailwind 4 kiểu CSS-first.
- **Toàn bộ màu nằm trong `app/globals.css`**: `:root` (sáng) và `.dark` (tối). Khối `@theme inline` map biến sang utility (`bg-surface-2`, `text-ink-3`…).
  **Trong `@theme inline` chỉ được có custom property**, viết luật CSS vào đó là `npm run build` chết (lỗi đã xảy ra ở bước 1).
- Dark mode là class `.dark` trên `<html>`. Dark **không dùng bóng** (`--shadow*: none`), tách lớp bằng nền + viền.
- Trang tổng quan thật là **`app/center-view.tsx`** (tab "Điều hành"), không phải `dashboard.tsx`. `dashboard.tsx` là khung: menu trái, topbar, tabbar, `<main>`.
- Chart.js/canvas không đọc được biến CSS, nên `ui-kit.tsx` giữ bản hex (`POS_COLORS`, `STATUS_COLORS`) song song với token (`posVar()`, `STATUS_VARS`). Đổi màu thì đổi **cả hai**.

## 4. Bảng màu chính thức (đã đo WCAG, dùng nguyên văn)

Chi tiết đầy đủ ở `WEBTONGHOPPOS/NOTES.md` mục "BẢNG MÀU CHÍNH THỨC". Tóm tắt các giá trị task cần:

| Token | Sáng | Tối |
|---|---|---|
| Series chart 1 / 2 / 3 | `#17684B` / `#B24700` / `#2A78D6` | `#D9F36D` / `#FF8A3D` / `#6FD3BB` |
| `--sb-ink-3` (chữ mờ trên sidebar `#0F3328`, cả 2 theme) | `#7F9A8B` | `#7F9A8B` |
| `--st-new` / `--st-shipping` | `#89988F` / `#C78700` | giữ |

Quy tắc: lime **không bao giờ là màu chữ ở theme sáng**. Cam `#FF8A3D` không làm chữ ở theme sáng (dùng `#B24700`). Chữ ≥ 4.5:1, đường/viền/vòng ≥ 3:1.

## 5. Hiện trạng (2026-10-15)

Đã nằm trong commit `916820a` (chưa nghiệm thu đầy đủ):
- Tầng 1 token: đúng bảng màu. Đã sửa `--ink-4`, chip `--t-*` sáng, `--st-new`, `--st-shipping` sáng, `--sb-ink-3` tối. Đã bỏ luật `box-shadow:none !important` toàn cục.
- Tầng 2 primitives: card 14px, KPI min-height 116px, số weight 600, sparkline, bảng thành thẻ dưới 1024px, sidebar 248px, TableWrap ở center-view / overview-sections / uncounted-view.
- `exec-blocks.tsx`: `TEAM_COLORS` và khối tóm tắt đã chuyển sang token.

Còn thiếu: chưa ai chạy được typecheck/test/build trên bản này. `--sb-ink-3` sáng vẫn là `#7ea38f`. Vòng trạng thái ở dark chưa kiểm. Chart series và `STATUS_COLORS` chưa đồng bộ. Tầng 3 bố cục chưa làm.

## 6. Lệnh kiểm (dùng cho mọi task)

```
pnpm install --frozen-lockfile     # chỉ cần khi node_modules thiếu/lệch, KHÔNG npm install
npm run typecheck                  # phải exit 0
npm test                           # phải 112/112 pass (hoặc nhiều hơn, không ít hơn)
npm run build                      # phải "Build complete"
```
**Trong sandbox Codex (2026-10-15):** `npm test` (và có thể `npm run build`) lỗi `spawn EPERM` vì sandbox chặn tạo tiến trình con, không phải lỗi code.
Gặp đúng lỗi `spawn EPERM` thì **không BLOCKED, không thử lách**: ghi "test/build: spawn EPERM, chờ Claude chạy" vào dòng kết quả, vẫn tích task và commit nếu typecheck xanh.
Claude chạy `npm test` + `npm run build` ngoài sandbox sau mỗi task; đỏ thì Claude thêm `FIX-*`.
**Sandbox chỉ cho đọc `.git`**: Codex **không** `git add`/`git commit`. Xong task thì tích PROGRESS, ghi HANDOFF, đặt `STATUS: READY | <task kế> | <giờ>` rồi dừng; Claude kiểm xong sẽ commit `<id>: …`. Không coi việc không commit được là BLOCKED.
Lint có ~1117 lỗi sẵn từ trước, **không tính** là hồi quy, đừng sửa lint ngoài phạm vi.
Kiểm hex mới: `git diff <commit đầu task> -- app components | Select-String '#[0-9a-fA-F]{3,6}\b'`. Chỉ được có hex trong `globals.css` (`:root`/`.dark`) và hằng hex của `ui-kit.tsx`.

## 7. Danh sách task

### T1: Chạy kiểm nền trên bản hiện tại
- **File:** không sửa code. Chỉ ghi kết quả vào PROGRESS.md / HANDOFF.md.
- **Làm:** chạy đủ 4 lệnh ở mục 6 trên nhánh `giao-dien-moi`. Ghi exit code + dòng tổng kết của từng lệnh.
- **Xong khi:** cả 3 lệnh kiểm xanh. Nếu đỏ: **không tự sửa**. Đặt BLOCKED, dán lỗi nguyên văn, để Claude ra task FIX.
- **Commit:** `T1: kiểm nền (typecheck/test/build)` (chỉ docs/ai).

### T2: Hoàn tất token + vòng trạng thái ở dark
- **File:** `app/globals.css` (ngoài khối `@theme inline` và ngoài `.den-*`).
- **Làm:**
  1. `:root` đổi `--sb-ink-3:#7ea38f` thành `#7F9A8B` (sidebar 2 theme cùng nền `#0F3328`).
  2. Ở `.dark` (shadow = none), đảm bảo 5 chỉ báo vẫn nhìn thấy, bằng `outline` hoặc `border-color` dùng `var(--ring)` / `var(--primary)`, **không** dùng hex:
     `.kpi.is-active` (KPI đang chọn), `.lift:focus-visible`, `.ring-hover:focus-visible`, `.nav-flash`, `.is-refreshing .kpi` / `.is-refreshed .kpi`.
     Nếu các luật này đang dùng `box-shadow` với giá trị cứng (không qua `--shadow*`) thì ở light giữ nguyên, chỉ thêm luật `.dark …` bù.
- **Xong khi:** 3 lệnh kiểm xanh. `grep` thấy cả 5 selector có luật dark bù. Không còn `!important` quét bóng toàn cục.

### T3: Màu chart theo bảng chính thức
- **File:** `app/globals.css` (`--chart-*`, thêm `--series-1..3` nếu chưa có), `app/exec-blocks.tsx`, `app/ui-kit.tsx` (`STATUS_COLORS`).
- **Làm:**
  1. Thêm token `--series-1/2/3` cho cả 2 theme theo mục 4. Series 1 luôn là màu accent.
  2. Chart trong `exec-blocks.tsx`: tối đa 3 series, dùng `var(--series-*)`, lưới dashed (`strokeDasharray`), nét 2px (đang 2.4).
  3. `STATUS_COLORS` (hex) khớp giá trị `--st-*` theme sáng hiện có trong `globals.css`.
  4. **Không đổi `POS_COLORS` / `--pos-1..6`.** Đó là màu nhận diện từng cửa hàng, chờ chủ dự án chốt (xem mục 9).
- **Xong khi:** 3 lệnh kiểm xanh. Trong `exec-blocks.tsx` không còn hex. Số liệu chart không đổi.

### GOP-DEMO: gỡ xung đột khi gộp nhánh demo (chỉ trên nhánh `demo-gop`)
- **Bối cảnh:** Claude đã tạo nhánh `demo-gop` từ `giao-dien-moi` và merge nhánh demo của Tổ web tổng (`47d5c9b`). Các file không thuộc giao diện đã lấy theo nhánh demo. Còn 5 khối xung đột (`<<<<<<<`) trong `app/dashboard.tsx` (2), `app/overview-sections.tsx` (2), `app/ui-kit.tsx` (1).
- **Làm:** gỡ từng khối. Nguyên tắc: **giữ logic, số liệu, tab, view, quyền, nhãn của bên nhánh demo** (khối giữa `=======` và `>>>>>>>`); **giữ kiểu dáng của giao diện mới** (class lưới, `TableWrap`, màu `var(--token)` thay hex, `max-w-[1360px]`, màu nhóm menu dạng token). Nếu bên demo thêm nhóm menu/tab mới có `color: '#…'` thì đổi sang token gần nghĩa nhất (`var(--t-blue)`, `var(--t-teal)`, `var(--t-orange)`, `var(--warn)`, `var(--ink-3)`, `var(--primary)`). Nếu hai bên cùng sửa một dòng mà khác mục đích, gộp cả hai.
- **Không:** sửa file nào khác, git add/commit (Claude làm).
- **Xong khi:** không còn `<<<<<<<`, `=======`, `>>>>>>>` trong 3 file; `npm run typecheck` exit 0. Ghi kết quả vào PROGRESS/HANDOFF.

### FIX-GOP-1: thanh trên tràn 5px ở màn 1280 (nhánh `demo-gop`)
- **Lỗi (Claude đo trên demo, 1280×900, có thanh bên):** `.user` ở góc phải topbar kết thúc ở x=1285, trang cuộn ngang 5px. Nguyên nhân: nhánh demo thêm `HrTeamPicker` vào topbar, cộng padding 24px của T5; ô tìm kiếm có `min-w-24` nên không co thêm.
- **File:** `app/globals.css` (khối `.topbar`) và nếu cần `app/dashboard.tsx` (chỉ class của `<form>` tìm kiếm trong `<header className="topbar">`).
- **Làm:** (1) đổi media `@media (max-width: 1200px) { .topbar { gap: 6px; } }` thành `@media (max-width: 1440px) { .topbar { gap: 6px; padding: 0 16px; } }`; giữ nguyên rule `max-width: 900px`. (2) Ô tìm kiếm: `min-w-24` đổi thành `min-w-0` để form co được khi chật. Không ẩn hay bỏ nút nào.
- **Xong khi:** typecheck xanh, không thêm hex. Claude đo lại trên demo: không cuộn ngang ở 1024 / 1280 / 1440.

### FIX-GOP-2: thanh trên tràn 140px ở màn 1024 (nhánh `demo-gop`)
- **Lỗi (Claude đo trên demo sau FIX-GOP-1):** 1024×900 có thanh bên, trang cuộn ngang 140px; tràn là `TeamSwitch` (`.seg-btn`) và `.user` (rộng 203px vì hiện tên + chức danh từ `lg`).
- **File:** `app/dashboard.tsx`, chỉ trong `<div className="user">`.
- **Làm:** khối tên/chức danh trong `.user` đổi `lg:block` thành `xl:block` (dưới 1280 chỉ còn avatar + nút đăng xuất; tên vẫn có trong `title`). Không ẩn nút nào khác.
- **Xong khi:** typecheck xanh. Claude đo lại: không cuộn ngang ở 1024 / 1280 / 1440 / 1920.

### FIX-GOP-3: thanh trên vẫn tràn ~111px ở màn 1024 (nhánh `demo-gop`)
- **Đo sau FIX-GOP-2 (1024, thanh bên 247px):** topbar rộng 776px; con: trigger 28, TeamSwitch 149, HrTeamPicker 69, GlobalStatusFilter 117, MetricSettings 32, **SyncPill 126**, Trình chiếu 32, ThemeSwitch 93, user 69 (+ gap + padding 32) ≈ 813px.
- **File:** `app/dashboard.tsx`, chỉ prop `className` của `<SyncPill … />` trong topbar.
- **Làm:** `className="hidden md:inline-flex"` đổi thành `className="hidden xl:inline-flex"`. Lý do: dưới 1280 trạng thái đồng bộ đã hiện ở chân thanh bên ("6/6 POS đang hoạt động · Cập nhật …"), không mất thông tin.
- **Xong khi:** typecheck xanh. Claude đo lại: không cuộn ngang ở 1024 / 1280 / 1440 / 1920.

### FIX-T3: giữ nghĩa màu của chart nhịp tháng
- **File:** `app/exec-blocks.tsx`, chỉ trong `MonthPace` (object `config` của `ChartContainer`).
- **Lỗi:** T3 đổi `forecast` sang `var(--series-2)` và `target` sang `var(--series-3)`. Sai nghĩa: dự báo là phần nối tiếp đường thực tế (cùng màu, nét đứt, mờ), mục tiêu là đường tham chiếu trung tính, không phải series dữ liệu.
- **Làm:** `forecast.color` = `'var(--series-1)'`; `target.color` = `'var(--ink-3)'`. Giữ nguyên mọi thay đổi khác của T3 (TEAM_COLORS, lưới dashed, nét 2px).
- **Xong khi:** typecheck xanh; trong `MonthPace` chỉ `actual` và `forecast` dùng `--series-1`.

### FIX-T4: KPI thứ 7 mồ côi trên điện thoại
- **File:** `app/center-view.tsx`, dòng `kpis.map((k, i) => kpiCard(...))`.
- **Lỗi:** T4 bỏ `max-lg:col-span-2` của KPI thứ 7 (`i === 6`). Dưới `lg` lưới 2 cột, 7 KPI nên ô cuối lẻ một mình nửa hàng.
- **Làm:** giữ class `lg:` của T4, thêm lại `max-lg:col-span-2` khi `i === 6`.
- **Xong khi:** typecheck xanh; KPI thứ 7 có `max-lg:col-span-2`.

### T4: Bố cục bento trang Điều hành
- **File:** `app/center-view.tsx` (chỉ phần lưới, khoảng dòng 477–545).
- **Làm:** lưới `lg:grid-cols-12`:
  hàng 1 bốn KPI `col-span-3` (dưới lg: 2 cột);
  hàng 2 khối chính `col-span-8` + khối phụ `col-span-4`;
  hàng 3 `col-span-7` + `col-span-5`. Không còn hàng nào 3 card đều nhau (`xl:grid-cols-3`).
  Chỉ đổi class lưới / thứ tự bọc. **Không đổi nội dung, dữ liệu, nút, quyền.**
- **Xong khi:** 3 lệnh kiểm xanh. Có ít nhất một cặp 8/4 và một cặp 7/5. Dưới `lg` mọi khối 1 cột (KPI 2 cột).

### T5: Khung trang (dashboard.tsx)
- **File:** `app/dashboard.tsx`, `app/globals.css` (`.topbar`, `.tabbar`).
- **Làm:**
  1. `<main>`: `max-w-[1440px]` thành `max-w-[1360px]`; padding ngang `px-4` / `md:px-6` (16/24px). Giữ nguyên nhánh `presenting`.
  2. Màu 6 nhóm menu (khoảng dòng 413–419, `color: '#…'`) đổi sang token: Điều hành `var(--primary)`, các nhóm còn lại dùng `var(--t-blue)`, `var(--warn)`, `var(--t-teal)`, `var(--t-orange)`, `var(--ink-3)`. Nếu `color` được dùng để pha (`${color}22`, `color-mix`…), đổi cách pha sang `color-mix(in srgb, var(--x) 13%, transparent)` cho đúng.
  3. `.topbar` padding ngang 24px (giữ `min-height:56px`). `.tabbar` nhãn 11px.
- **Xong khi:** 3 lệnh kiểm xanh. Trong khối nhóm menu không còn hex.

### FIX-T5: chip nhóm menu ở dark + topbar trên điện thoại
- **File:** `app/globals.css` (ngoài `@theme inline` và `.den-*`).
- **Lỗi 1:** `.mod-chip` có icon `color: #fff`. Sau T5 nền chip là token; ở dark token sáng (`--primary` = lime, `--t-*` pastel) nên icon trắng gần như không thấy.
  **Làm:** thêm luật `.dark .mod-chip { color: var(--sb); }` đặt cạnh các luật `.dark …` khác (sau khối `.dark { }`). Không đổi luật light.
- **Lỗi 2:** T5 xoá `@media (max-width: 900px) { .topbar { min-height: 52px; padding: 0 12px; } }` và padding 16px ở ≤1200px, nên trên điện thoại topbar lề 24px lệch với `<main>` (16px).
  **Làm:** ≤1200px giữ `gap: 6px` như T5; thêm lại `@media (max-width: 900px) { .topbar { min-height: 52px; padding: 0 16px; } }` (16px khớp `px-4` của main). Desktop giữ 24px.
- **Xong khi:** typecheck xanh; không thêm hex.

### T6: Rà sót cuối + bàn giao nghiệm thu
- **File:** không bắt buộc sửa. Chỉ sửa nếu rà thấy hex mới lọt ngoài vùng cho phép.
- **Làm:** chạy lệnh kiểm hex ở mục 6 trên toàn diff `3e4e35a..HEAD`. Liệt kê vào HANDOFF.md mọi chỗ còn hex trong phạm vi (trừ ngoài phạm vi ở mục 2). Chạy lại 3 lệnh kiểm.
- **Xong khi:** 3 lệnh kiểm xanh. Đặt `STATUS: DONE`. HANDOFF ghi "chờ Claude nghiệm thu giao diện".

### (Claude) NT: nghiệm thu bằng mắt sau T6
Claude chạy web local, chụp sáng/tối ở 390 / 768 / 1280 / 1920px, đo tương phản, thử bàn phím (focus, KPI đang chọn), so số liệu trang Điều hành trước/sau cùng bộ lọc. Lỗi thì thêm `FIX-*`.

## 8. Rủi ro

| Rủi ro | Phòng |
|---|---|
| Viết luật CSS vào `@theme inline`, làm build chết | Luật mới đặt sau khối `.dark { }`. Luôn chạy `npm run build` |
| Mất chỉ báo trạng thái ở dark | T2 bù outline cho đủ 5 selector |
| Đổi lưới làm mất khối hoặc đổi dữ liệu | T4 chỉ đổi class. Claude so số trước/sau |
| Sandbox Windows của Codex không chạy được lệnh (`helper_unknown_error`) | Người chạy Codex dùng `-c windows.sandbox="unelevated"` (đã kiểm 2026-10-15) |
| Lỡ deploy làm tắt cron | Codex không được push/deploy. `wrangler.jsonc` đã trả về mỗi phút ở `2817ffc` |

## 9. Câu hỏi chủ dự án đã chốt (2026-10-15): giữ 2 font, giữ `POS_COLORS`/`--pos-1..6`, theme theo hệ điều hành

1. Font: giữ 2 họ (Be Vietnam Pro + Bricolage cho tiêu đề), Claude khuyên giữ; hay gộp 1 họ như brief.
2. Màu từng cửa hàng `POS_COLORS` / `--pos-1..6`: giữ như cũ, hay đổi theo bảng màu mới.
3. Theme mặc định: giữ theo hệ điều hành, hay mặc định tối (theme "chuẩn nhận diện").
