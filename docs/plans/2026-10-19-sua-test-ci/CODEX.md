# Luật cho Codex: sửa test làm đỏ Deploy demo (19/10/2026)

1. **Đọc gì.** Đọc `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao (T1).
2. **Nhánh nền** là nhánh demo `claude/project-thread-3ujeoc` mới nhất. Số dòng trong plan có thể lệch, nên tìm theo tên hàm, tên biến.
3. **Mục tiêu duy nhất:** test G8, K1, K2, K3 chạy được khi repo chỉ có 1 commit (CI checkout nông), kết quả test không đổi.
4. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `.github/**`, `migrations/**`, `drizzle/**`, `db/schema.ts`, `wrangler*.json*`, `scripts/**`.
   - Đổi `WORLD_VERSION` hoặc các `*_EPOCH`.
   - Tạo bảng, cột, chỉ mục. Không thêm migration. Lưu trữ chỉ dùng `app_settings`.
   - Sửa code trong `lib/` hay `app/`. Bước này chỉ sửa test và thêm tệp mẫu.
   - Chạy `pnpm format` hay oxfmt cho cả file/repo.
   - Gọi web thật, Pancake, web nhân sự, API Cloudflare. Chỉ dùng `DEMO_MODE=1` và D1 local / SQLite trong test.
5. **Bí mật.**
   - Không đọc, liệt kê hay chép: `~/.codex*/**`, `~/.ssh/**`, `~/.config/gh/**`, `~/.megatech/**`, `C:\tele-bot\**`, `.env`, `.dev.vars` của người khác, và biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY`.
   - Không chạy `env`, `printenv`, `set`, `gh`, `wrangler deploy`, `wrangler d1 … --remote`, `wrangler secret`.
6. **Repo công khai.** Không đưa vào code, chú thích, test hay tóm tắt: số thật, số tiền của công ty, mã tài khoản Cloudflare, tên người, tên khách, email, SĐT, khoá.
7. **Kiểm trước khi xong bước.**
   - Chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, ghi mã thoát từng lệnh. Sandbox Windows báo `EPERM` thì ghi lại; máy kiểm sẽ chạy ngoài sandbox.
8. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn nhất (số đúng và giữ bí mật hơn tiết kiệm), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
9. **Làm dở.** Đầu bước, nếu `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
10. **Tóm tắt** viết tiếng Việt. Tin nhắn cuối đúng mẫu:
    ```
    # Tóm tắt <bước>
    ## File đã đổi
    ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
    ## Test mới (tên test, ca nào)
    ## So tệp mẫu với git show (kết quả diff)
    ## Chỗ làm khác plan và lý do
    ## Câu hỏi còn lại
    ```
