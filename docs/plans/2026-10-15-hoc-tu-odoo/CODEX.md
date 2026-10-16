# Luật cho Codex: web tổng học từ Odoo (15/10/2026)

1. **Đọc gì.** `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao ở mục 5 của plan.
2. **Nhánh nền có thể là `demo-gop` hoặc `giao-dien-moi`** (giao diện mới). Số dòng trong plan theo nhánh demo cũ: tìm theo tên (`DEPTS`, `NAV_GROUPS`, `deptOf`, `dept-tabs`, `navCounts`…). Giữ nguyên kiểu dáng của giao diện mới, chỉ đổi đúng phần plan ghi.
3. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `.github/**`, `migrations/**`, `drizzle/**`, `wrangler*.json*`, `scripts/deploy-demo.mjs`.
   - Chạy `pnpm format` hay oxfmt cho cả file/repo (diff phình to).
   - Đổi số, cách tính, tên nghiệp vụ, quyền phía máy chủ ngoài điều plan ghi.
   - Gọi web thật, Pancake hay web nhân sự. Chỉ dùng `DEMO_MODE=1` và D1 local.
4. **Bí mật.** Không đọc, liệt kê hay chép `~/.codex*/**` (kể cả memories), `~/.ssh/**`, `~/.config/gh/**`, `C:\tele-bot\**`, `.env`, `.dev.vars` của người khác, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY`. Không chạy `env`, `printenv`, `set` (liệt kê biến), `gh`, `wrangler deploy`, `wrangler d1 … --remote`.
5. **Repo công khai.** Không đưa số thật, tên khách, email, SĐT, khoá vào code, chú thích, test, ảnh hay tóm tắt. SĐT giả dạng `0900000001`, tên giả "Khách A", "NV A".
6. **Kiểm trước khi xong bước.** Tự chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Ghi mã thoát từng lệnh vào tóm tắt.
7. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn và đúng ý plan nhất (không đổi số đang hiện), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
8. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
9. **Tóm tắt** (tiếng Việt). Tin nhắn cuối đúng mẫu:
   ```
   # Tóm tắt <bước>
   ## File đã đổi
   ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
   ## Test mới (tên test, ca nào)
   ## Chỗ làm khác plan và lý do
   ## Câu hỏi còn lại
   ```
