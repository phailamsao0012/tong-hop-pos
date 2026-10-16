# 00 — Kế hoạch áp giao diện mới

> Dựng 2026-10-12 (Claude, Bước 1 của luồng /cowork). Nguồn: `WEBTONGHOPPOS/NOTES.md`
> mục DESIGN BRIEF + BẢNG MÀU CHÍNH THỨC + SCOPE ÁP GIAO DIỆN.
> **Mọi số dòng trong bộ tài liệu này đã mở code tại HEAD `3e4e35a` đối chiếu lại.**
> Chỗ nào NOTES.md ghi lệch thì file `02-file-can-sua.md` ghi rõ "NOTES.md ghi … — thật là …".

## Mục tiêu

Áp ngôn ngữ thiết kế "dark command center" (dashboard SaaS: bento, card, chip nhạt,
mật độ cao, micro-interaction tinh) lên web tổng POS, **giữ nguyên nhận diện xanh lá
MEGATECH** theo quyết định vòng 4 của chủ dự án.

Không phải làm lại web. Hạ tầng đã đúng:

- `app/globals.css` là file CSS duy nhất của UI (703 dòng), nạp ở `app/layout.tsx:2`.
- Tailwind 4 CSS-first, khối `@theme inline` ở `globals.css:13–61` đã map ~70 biến
  sang utility (`bg-surface-2`, `text-ink-3`, `border-line`…).
- **Không có `tailwind.config.js` — đừng tạo.**
- Dark mode bằng class `.dark` trên `<html>` (`@custom-variant dark` ở `globals.css:4`),
  script chặn nháy màu ở `layout.tsx:8`.

→ Đổi *giá trị* token trong `:root` / `.dark` là đổi màu toàn web. Không dựng mới gì.

## Thứ tự 3 tầng — làm đúng thứ tự này, không nhảy bước

### Tầng 1 — Token (Bước 2, gpt)

Chỉ sửa **giá trị** biến trong `app/globals.css` `:root` (dòng 64–82) và `.dark`
(dòng 85–100), cộng font + motion + `themeColor`.

- Hoàn thành khi: web đổi màu toàn bộ chỉ bằng sửa giá trị token.
- Ràng buộc: **không sửa file nào trong `components/ui/`** (60 file shadcn ăn màu qua
  bí danh `--color-*` ở `globals.css:15–26`, tự đổi theo token). Ngoại lệ duy nhất là
  `components/ui/sidebar.tsx:30` ở tầng 2.
- Gác: `npm run typecheck` sạch, `npm test` 112/112.

### Tầng 2 — Primitives (Bước 4, gpt)

Sửa các class/thành phần dùng chung đã có sẵn trong `app/globals.css` @layer components
và `app/ui-kit.tsx` (600 dòng). **Là SỬA, không TẠO MỚI** — brief cần gì thì ui-kit
gần như đã có: `Card` `.card`, `KpiCard`, `StatusChip`, `TableWrap`, `SortTh`,
`Sparkline`, `Donut`, `Funnel`, `ProgressBar`, `Avatar`, `EmptyState`, `Skeleton`,
`PageHeader`, `SectionTitle`, `Toolbar`, `SegmentedControl`, `SyncPill`, `ThemeSwitch`.

- Hoàn thành khi: KPI card thẳng hàng tuyệt đối; dưới 1024px bảng là card list,
  không còn scroll ngang.
- Gác: typecheck + test sạch.

### Tầng 3 — Bố cục (Bước 6, gpt)

Đổi lưới trang tổng quan sang bento không đối xứng.

**Cảnh báo quan trọng:** trang tổng quan thật là **`app/center-view.tsx`** (579 dòng,
tab "Điều hành", view mặc định — `dashboard.tsx:790` đặt `'center'`), **không phải**
`app/dashboard.tsx`. `dashboard.tsx` (2088 dòng) là khung ứng dụng: menu trái
(`SidebarNav` :636), tab bar điện thoại (`MobileTabBar` :741), topbar (:1501),
`<main>` (:1548), bộ chuyển view (:788).

- Hoàn thành khi: bento không đối xứng (có 8/4 và 7/5), không còn lưới 3 card đều nhau.
- Gác: typecheck + test sạch.

## Xen kẽ: 3 lần Claude nghiệm thu

| Bước | Ai | Việc |
|---|---|---|
| 3 | claude | Soi thật trang Điều hành light/dark, đo contrast, typecheck + test |
| 5 | claude | Responsive thật 360 / 768 / 1280 / 1920px + bàn phím |
| 7 | claude | Nghiệm thu cuối theo `03-nghiem-thu.md` (9 mục), chốt vào NOTES.md |

## Ràng buộc kỹ thuật — vi phạm là trượt

1. `pnpm install --frozen-lockfile`. **KHÔNG `npm install`** (crash arborist vì layout pnpm).
   `npm run typecheck` / `npm test` thì chạy bình thường.
2. Không tạo `tailwind.config.js`.
3. **NGOÀI PHẠM VI, không chạm:** mascot husky (`app/husky.tsx` 25 hex),
   `app/megatech-mascot.tsx` (7), `app/logo-intro.tsx` + `app/logo-intro.css` (6),
   màn đăng nhập `app/auth-form.tsx` (5), khối `.den-*` `globals.css:315–424`,
   `lib/mail.ts` (10 hex, email không có CSS var).
4. Giữ xanh lá → mascot/đăng nhập/logo **khớp luôn**, không phải sửa, không phải xin
   chốt lại thương hiệu. Đây là lợi ích chính của quyết định vòng 4.
5. Chạy web để xem: `npm run db:migrate:local` một lần, rồi `npx vinext dev -H 0.0.0.0`.
   `vinext dev` tự chặn server thứ hai. `/` → 307 `/setup` là ĐÚNG (DB local chưa có tài khoản).

## Thứ tự đọc tài liệu

1. `00-plan.md` — file này.
2. `01-bang-mau.md` — token light/dark đã đo WCAG + 3 ghi chú dễ sai.
3. `02-file-can-sua.md` — bảng `file:line → sửa gì`, chia theo Bước 2 / 4 / 6.
4. `03-nghiem-thu.md` — checklist 9 mục, dùng ở Bước 3 / 5 / 7.
