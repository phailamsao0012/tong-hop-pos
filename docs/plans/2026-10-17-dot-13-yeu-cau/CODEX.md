# Luật cho Codex: đợt 13 yêu cầu web tổng (17/10/2026)

1. **Đọc gì.** `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao (A1…D2).
2. **Nhánh nền** là nhánh demo `claude/project-thread-3ujeoc` mới nhất. Số dòng trong plan có thể lệch: tìm theo tên hàm, tên biến. Giữ nguyên kiểu dáng giao diện mới.
3. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `.github/**`, `migrations/**`, `drizzle/**`, `wrangler*.json*`, `scripts/deploy-demo.mjs`; đổi `WORLD_VERSION`.
   - Tạo chỉ mục mới trên `raw_pos_orders`.
   - Chạy `pnpm format` hay oxfmt cho cả file/repo.
   - Đổi số, cách tính, tên nghiệp vụ, quyền phía máy chủ ngoài điều plan ghi.
   - Gọi web thật, Pancake hay web nhân sự. Chỉ dùng `DEMO_MODE=1` và D1 local.
4. **Bí mật.** Không đọc, liệt kê hay chép `~/.codex*/**`, `~/.ssh/**`, `~/.config/gh/**`, `~/.megatech/**`, `C:\tele-bot\**`, `.env`, `.dev.vars` của người khác, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY`. Không chạy `env`, `printenv`, `set`, `gh`, `wrangler deploy`, `wrangler d1 … --remote`.
5. **Repo công khai.** Không đưa số thật, tên người, tên khách, email, SĐT, khoá vào code, chú thích, test, ảnh hay tóm tắt. Tên giả "NV A", "Team MKT 1", SĐT giả `0900000001`.
6. **Kiểm trước khi xong bước.** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`; ghi mã thoát từng lệnh. Bước có câu đọc `raw_pos_orders` mới: chép kết quả `EXPLAIN QUERY PLAN` (D1 local).
7. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn và đúng ý plan nhất (không đổi số đang hiện), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
8. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
9. **Tóm tắt** (tiếng Việt), tin nhắn cuối đúng mẫu:
   ```
   # Tóm tắt <bước>
   ## File đã đổi
   ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
   ## Test mới (tên test, ca nào)
   ## Chỗ làm khác plan và lý do
   ## Câu hỏi còn lại
   ```
