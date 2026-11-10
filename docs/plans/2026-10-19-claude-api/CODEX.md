# Luật cho Codex: gắn Claude API vào web tổng (19/10/2026)

1. **Đọc gì.** Đọc `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao (C1…C5).
2. **Nhánh nền** là nhánh demo `claude/project-thread-3ujeoc` mới nhất. Số dòng trong plan có thể lệch, nên tìm theo tên hàm, tên biến.
3. **Mục tiêu.**
   - Code tính mọi con số.
   - Claude API chỉ viết chữ giải thích và trả lời câu hỏi.
   - Số đang có trên web không đổi.
4. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit.
   - Cài gói. Script đã cài `@anthropic-ai/sdk@0.131.0`. Thiếu gói thì ghi vào "Câu hỏi còn lại" và dừng.
   - Gọi API Claude thật, kể cả khi thấy khoá ở đâu đó. Mọi test dùng client giả (object có `messages.create` / `messages.batches.*` trả dữ liệu dựng sẵn).
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `.github/**`, `migrations/**`, `drizzle/**`, `db/schema.ts`, `wrangler*.json*`, `scripts/**`.
   - Đổi `WORLD_VERSION` hoặc các `*_EPOCH`.
   - Tạo bảng, cột, chỉ mục. Không thêm migration. Lưu trữ chỉ dùng `app_settings`.
   - Sửa `lib/ai-summary.ts`, `lib/ai-trends.ts`, `lib/ai-pack.ts`, `lib/ai-insight.ts`, `app/api/ai/{pack,insights,pair,summary,trends}/**`.
   - Chạy `pnpm format` hay oxfmt cho cả file/repo.
   - Gọi web thật, Pancake, web nhân sự, API Cloudflare. Chỉ dùng `DEMO_MODE=1` và D1 local / SQLite trong test.
5. **Bí mật.**
   - Không đọc, liệt kê hay chép: `~/.codex*/**`, `~/.ssh/**`, `~/.config/gh/**`, `~/.megatech/**`, `C:\tele-bot\**`, `.env`, `.dev.vars` của người khác, và biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY`.
   - Không chạy `env`, `printenv`, `set`, `gh`, `wrangler deploy`, `wrangler d1 … --remote`, `wrangler secret`.
   - `ANTHROPIC_API_KEY` chỉ được đọc trong `claudeClient()` / `claudeMode()` ở `lib/claude.ts`. Không log, không trả về trình duyệt, không đưa vào lỗi.
6. **Dữ liệu gửi Claude.**
   - Không gửi SĐT, tên khách, tên nhân viên, ghi chú, địa chỉ, nội dung tin nhắn.
   - Nhân viên chỉ là mã.
   - Mỗi bước có test chứng minh điều này với dữ liệu giả có tên và ghi chú.
7. **Repo công khai.** Không đưa vào code, chú thích, test hay tóm tắt: số thật, số tiền của công ty, mã tài khoản Cloudflare, tên người, tên khách, email, SĐT, khoá. Giá công khai của Claude và các hằng số trần trong plan thì được ghi.
8. **Kiểm trước khi xong bước.**
   - Chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, ghi mã thoát từng lệnh. Sandbox Windows báo `EPERM` thì ghi lại; máy kiểm sẽ chạy ngoài sandbox.
   - Bước có mục chụp ảnh hay chạy demo local: làm nếu chạy được, không được thì ghi lý do.
9. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn nhất (số đúng và giữ bí mật hơn tiết kiệm), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
10. **Làm dở.** Đầu bước, nếu `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
11. **Tóm tắt** viết tiếng Việt. Tin nhắn cuối đúng mẫu:
    ```
    # Tóm tắt <bước>
    ## File đã đổi
    ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
    ## Test mới (tên test, ca nào)
    ## Mẫu kết quả trên demo local (số ảo)
    ## Chỗ làm khác plan và lý do
    ## Câu hỏi còn lại
    ```
