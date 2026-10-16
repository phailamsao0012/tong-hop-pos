# Luật cho Codex: Demo 2 theo kênh @imimran004 (16/10/2026)

1. **Đọc gì.** `docs/plans/2026-10-16-demo-imimran/plan.md`. Chỉ làm đúng bước được giao ở mục 5. Tài liệu kênh thu về nằm trong `.kenh/` ở gốc worktree (không commit, không sửa).
2. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng (kể cả `pnpm add`, `npm install`, tải phông, tải trình duyệt, mở threads.com). Máy lo commit, đẩy, tải.
   - Sửa file ngoài "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `app/api/**`, `lib/**`, `db/**`, `drizzle/**`, `worker.ts`, `.github/workflows/deploy*.yml` cũ, `scripts/deploy*.mjs` cũ, `wrangler.jsonc`.
   - Chạy `wrangler … --remote`, `wrangler deploy`, `pnpm db:migrate`, gọi web thật, demo, Pancake hay web nhân sự.
   - Chạy `pnpm format` / oxfmt cho cả repo. Định dạng tay theo code xung quanh.
   - Sửa số mong đợi của test cũ cho qua. Test cũ đỏ là code mới sai.
   - Đổi lời gọi API, cách tính, tên số, quyền xem. Đây là đợt đổi giao diện, không đổi số.
3. **Bí mật.** Không đọc, liệt kê, chép thư mục `.codex*`, `.ssh`, `.config/gh`, `C:\tele-bot`, `.env`, `.dev.vars`, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY`. Không chạy `env`, `printenv`, `set`, `gh`.
4. **Repo công khai.** Không số thật, tên khách, SĐT, email thật. SĐT giả `0900000001`. Không chép nguyên văn bài của kênh quá 1 câu; không chép ảnh gốc của kênh vào repo.
5. **Kiểm trước khi xong bước.** Tự chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Ghi mã thoát từng lệnh vào tóm tắt. Lint không thêm lỗi so với lúc bắt đầu.
6. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn nhất (ít đổi nhất, không đổi số), ghi vào "Chỗ làm khác plan", làm tiếp.
7. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần dở của chính bước này: đọc và làm tiếp.
8. **Tóm tắt** (tiếng Việt). Tin nhắn cuối đúng mẫu:
   ```
   # Tóm tắt <bước>
   ## File đã đổi
   ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
   ## Test mới (tên test, ca nào)
   ## Chỗ làm khác plan và lý do
   ## Câu hỏi còn lại
   ```
