# Plan: sửa sót sau khi lên "Đang đóng hàng" (16/10/2026)

Tổ web tổng viết, Codex làm, Tổ web tổng kiểm một lần khi xong. Nhánh `codex/sua-sot-1610`, tạo từ nhánh demo `claude/project-thread-3ujeoc`. Không đẩy vào main hay nhánh demo; Tổ web tổng gộp sau.

## 1. Vì sao
- 16/10 04:39Z merge PR #79 vào main thì `deploy.yml` chạy luôn job `deploy-demo` (`needs: deploy`), đưa mã main lên demo, đè bản demo có giao diện mới. 04:51Z nhánh demo tự deploy lại nên demo đúng trở lại. Từ nay demo chỉ được deploy từ nhánh demo (`deploy-demo.yml`).
- Sau R2, hai chữ cũ còn sót trên web, và một lỗi nhỏ trên điện thoại (QA 16/10).

## 2. Không được đổi
Số liệu, cách tính, API trả về (giữ mọi trường và mọi khoá `definitions` cũ vì app đọc), `deploy-demo.yml`, job `deploy` trong `deploy.yml`, `WORLD_VERSION`, migration.

## 3. Các bước

**S1. Bỏ deploy demo khỏi deploy.yml, sửa chữ sót, sửa cột dính trên điện thoại**
- File được sửa: `.github/workflows/deploy.yml`, `app/api/reports/product-groups/route.ts`, `app/product-group-blocks.tsx`, `tests/**`.
- `deploy.yml`: xoá nguyên job `deploy-demo` (từ dòng chú thích "# Bản demo …" tới hết job). Job `deploy` giữ nguyên từng dòng. Thêm một dòng chú thích ngắn ở cuối: demo chỉ deploy từ nhánh demo qua `deploy-demo.yml`.
- `route.ts`, `definitions.waiting`: viết lại thành "Chờ xác nhận đếm mọi Đơn chốt đang ở trạng thái Chờ xác nhận." (bỏ phần nói "Còn Chờ xác nhận chỉ đếm đơn chưa từng được xác nhận"). Các khoá khác giữ nguyên chữ.
- `product-group-blocks.tsx`, biểu tượng (i) của thẻ (đang `info={r ? Object.values(r.definitions).join(' ') : undefined}`): không ghép các định nghĩa cũ của cột Đã XN kho nữa. Bỏ các khoá `whConfirmed`, `warehouseConfirmed`, `backToWaiting`, `otherUnconfirmed` khỏi chuỗi (lọc ở giao diện, API vẫn trả).
- Cùng file: trên điện thoại, cột tên dính (sticky) che nét đầu của tiêu đề "Đang đóng hàng" khi cuộn ngang. Sửa cho tiêu đề cột dính có nền đặc và lớp trên (z-index) cao hơn tiêu đề các cột cuộn, hoặc thêm khoảng đệm trái cho tiêu đề cột kế bên; chọn cách ít đổi nhất. Không đổi bề rộng bảng ở máy tính.
- Xong khi:
  - Test đọc `.github/workflows/deploy.yml`: không còn chữ `deploy-demo.mjs`, không còn job `deploy-demo`; job `deploy` vẫn có `pnpm db:migrate` và `pnpm run deploy`.
  - Test: chuỗi info của thẻ không chứa "Đã XN kho"/"XN kho"; `definitions.waiting` không còn "chưa từng được xác nhận"; API vẫn có khoá `whConfirmed`.
  - `pnpm typecheck`, `pnpm test`, `pnpm build` qua; `pnpm lint` không thêm lỗi.
