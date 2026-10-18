# Luật chung cho Claude và Codex: web tổng (tong-hop-pos)

Claude Code và Codex cùng đọc file này. `CLAUDE.md` chỉ trỏ về đây, nên chỉ sửa luật ở file này.

## Ai làm gì
- **Claude là kỹ sư.** Viết plan vào `docs/plans/`, chia việc thành các bước nhỏ. Mỗi bước có tiêu chí xong và cách kiểm. Claude giao việc cho Codex, sau đó kiểm bài và mở PR.
- **Codex là thợ.** Làm đúng một bước trong plan được giao. Không làm thêm. Plan và code thật khác nhau thì dừng lại và ghi câu hỏi, không tự đoán.
- **Anh Vũ** chỉ duyệt plan và xem demo. Lên web thật chỉ khi anh nhắn đồng ý.

## Nhánh
- `main`: web thật. Merge vào `main` sẽ tự deploy lên tonghopposmegatech.io.vn. Không ai được đẩy hay mở PR vào `main` khi anh chưa đồng ý.
- `claude/project-thread-3ujeoc`: nhánh demo, tự deploy lên demo.tonghopposmegatech.io.vn. Mọi việc mới đều bắt đầu từ nhánh này.
- Nhánh làm việc của Codex đặt tên `codex/<việc>`. PR mở vào nhánh demo.

## Lệnh
- Cài: `pnpm install --frozen-lockfile` (Node ≥ 22.13)
- Trước khi nộp phải chạy đủ bốn lệnh: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Không được thêm lỗi lint mới.
- Chạy thử bằng số ảo: `pnpm dev` với `DEMO_MODE=1` trong `.dev.vars`. Mật khẩu demo là `demo@2026`.

## Phân tầng code
- `lib/*.ts`: logic nghiệp vụ và câu SQL (D1, drizzle). Không import React.
- `app/api/**/route.ts`: route API mỏng. Kiểm quyền bằng `lib/access.ts`, gọi `lib/`, trả JSON.
- `app/*-view.tsx`, `app/*.tsx`: giao diện React 19. Lấy dữ liệu qua `app/api-fetch.ts`.
- `components/ui/`: linh kiện shadcn (base-nova). Dùng lại, không chép thêm bản khác.
- `lib/demo/`: bộ dữ liệu ảo cho demo. Logic mới nếu đọc Pancake hay web nhân sự thì phải có bản giả ở đây.
- `tests/*.test.ts`: test chạy bằng node:test qua tsx. Logic mới trong `lib/` phải có test.
- Kiểu viết: TypeScript strict, Tailwind v4, định dạng bằng `pnpm format` (oxfmt). Chữ hiện trên web viết tiếng Việt.

## Không được làm
- Sửa `.github/workflows/*`, `wrangler*.json*`, `migrations/**`, `drizzle/**` khi plan không ghi rõ.
- Đổi số liệu, cách tính, tên nghiệp vụ hay quyền xem khi plan không ghi rõ.
- Đưa vào code, commit, ảnh hay plan: số thật, tên khách, email, số điện thoại, khoá bí mật. **Repo này công khai.**
- Tạo chỉ mục rộng trên `raw_pos_orders`, hoặc chạy thử tải trên web thật.

## Quy tắc gọi tên số
- Vận đơn: không gọi là bán hàng, chốt hay doanh thu. Dùng "Đơn chuyển đi", "Doanh số chuyển đi", "Đơn vào Chờ xác nhận", "Người lên đơn".
- Doanh số chỉ tính người có hậu tố MKT, CSKH hoặc SALE. Mỗi con số trên web phải ghi rõ là số gì và tính trong phạm vi nào.
- Bấm vào một con số thì mở trang tính ra số đó và giữ nguyên bộ lọc.

## Plan
- Plan nằm trong `docs/plans/<yyyy-mm-dd>-<việc>/plan.md`. Xem mẫu ở `docs/plans/README.md`.
- Plan giao diện mới đã có sẵn ở `docs/giao-dien-moi/`. Phần đó có luật riêng trong `docs/giao-dien-moi/CODEX.md`.
