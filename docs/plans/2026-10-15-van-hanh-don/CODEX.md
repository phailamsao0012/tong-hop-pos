# Luật cho Codex: Vận hành đơn + Lãi thật (15/10/2026)

1. **Đọc gì.** `AGENTS.md` ở gốc repo. Bước V… đọc `docs/plans/2026-10-15-van-hanh-don/plan.md`; bước L… đọc thêm `docs/plans/2026-10-15-lai-that/plan.md`. Chỉ làm đúng bước được giao ở mục 5 của plan.
2. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng (kể cả `pnpm add`, `npm install`, tải trình duyệt). Script lo commit và đẩy.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Chạy `wrangler … --remote`, `wrangler deploy`, `pnpm db:migrate` (bản remote), gọi web thật, Pancake hay web nhân sự.
   - Chạy `pnpm format` hay oxfmt cho cả repo (nó định dạng lại cả file, làm diff khổng lồ). Định dạng tay theo kiểu code xung quanh.
   - Sửa số mong đợi của test cũ cho qua. Test cũ đỏ là code mới sai.
3. **Bí mật.** Không đọc, liệt kê hay chép thư mục `.codex*`, `.ssh`, `.config/gh`, `C:\tele-bot`, `.env`, `.dev.vars` có sẵn, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY` trong tên. Không chạy `env`, `printenv`, `set` (Windows), `gh`.
4. **Repo công khai.** Không đưa vào code, test, ảnh, tóm tắt: số thật, tên khách, SĐT, email. SĐT giả dạng `0900000001`. Tên hãng ship trong demo là tên giả ("Hãng A Express"…).
5. **Kiểm trước khi xong bước.** Tự chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Ghi mã thoát từng lệnh vào tóm tắt. Lint không được thêm lỗi so với lúc bắt đầu.
   - Trên PC Windows, `pnpm test` / `pnpm build` trong sandbox có thể lỗi `spawn EPERM`: đó là sandbox chặn tạo tiến trình con, không phải lỗi code. Ghi mã thoát vào tóm tắt, không sửa code hay cấu hình vì lỗi này. Máy kiểm của script chạy lại cả bốn lệnh ngoài sandbox.
6. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn nhất (ít đổi nhất, không đổi số cũ), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
7. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này (lần trước hết lượt hoặc máy kiểm báo lỗi): đọc và làm tiếp, không làm lại từ đầu.
8. **Tóm tắt** (tiếng Việt). Tin nhắn cuối đúng mẫu:
   ```
   # Tóm tắt <bước>
   ## File đã đổi
   ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
   ## Test mới (tên test, ca nào)
   ## Chỗ làm khác plan và lý do
   ## Câu hỏi còn lại
   ```
