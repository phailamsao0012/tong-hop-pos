# CONVENTIONS: quy ước code (Claude viết, Codex không sửa)

## Chung
- Viết giống code xung quanh: TypeScript + React function component, Tailwind utility trong `className`, CSS dùng chung trong `app/globals.css`.
- Comment **tiếng Việt có dấu**, ngắn, chỉ ghi "vì sao" khi không hiển nhiên. Không comment lại điều code đã nói.
- Không đổi tên export, prop, hàm đang dùng. Không di chuyển/tách file nếu task không yêu cầu.
- Diff nhỏ nhất có thể. Không format lại file (không chạy `oxfmt` toàn repo), không sửa lint ngoài dòng mình đụng.

## Màu và CSS
- **Màu chỉ khai báo ở `:root` và `.dark` trong `app/globals.css`.** Component dùng `var(--token)` hoặc utility (`text-ink-3`, `bg-surface-2`).
- Ngoại lệ hex duy nhất: hằng `POS_COLORS`, `STATUS_COLORS` trong `app/ui-kit.tsx` (cho Chart.js/canvas/xuất file), và phải khớp token tương ứng.
- Thêm token mới: thêm ở **cả** `:root` lẫn `.dark`. Cần utility thì thêm dòng map `--color-x: var(--x);` trong `@theme inline`.
- **Trong `@theme inline` chỉ có custom property.** Luật CSS đặt sau khối `.dark { }` hoặc trong `@layer components`.
- Dark: không dùng `box-shadow` để tách lớp. Chỉ báo trạng thái (focus, đang chọn) phải có `outline`/`border` thấy được ở cả 2 theme.
- Lime `#D9F36D` không làm màu chữ ở theme sáng. Cam tươi `#FF8A3D` không làm chữ ở theme sáng.
- Bo góc: card 14px, nút/ô nhập 10px (`--radius`). Weight chữ số: 600.
- Không tạo `tailwind.config.js`.

## Công cụ
- Cài gói: `pnpm install --frozen-lockfile`. **Không `npm install`** (crash vì layout pnpm).
- Kiểm: `npm run typecheck`, `npm test`, `npm run build`. Lint có lỗi sẵn từ trước, không gác.
- Chạy web xem: `npm run db:migrate:local` (một lần), rồi `npm run dev`. `vinext dev` tự chặn server thứ hai, đừng bật thêm.

## Git
- Nhánh làm việc: `giao-dien-moi`. Không commit lên `main`, không push, không deploy.
- Một task = một commit. Message: `<id>: <mô tả tiếng Việt ngắn>`, ví dụ `T4: lưới bento 8/4 và 7/5 cho trang Điều hành`.
- `docs/ai/PROGRESS.md` và `HANDOFF.md` commit cùng commit của task.
- Không commit `.dev.vars*`, `.wrangler/`, `dist/`, file tạm, ảnh chụp.
