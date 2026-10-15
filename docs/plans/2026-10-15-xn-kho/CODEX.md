# Luật cho Codex: tìm bước kho gọi khách (15/10/2026)

1. **Đọc gì.** `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng bước được giao ở mục 5 của plan.
2. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit và đẩy; đẩy xong GitHub tự chạy job đọc.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Chạy `wrangler … --remote`, `wrangler deploy`, gọi web thật, Pancake hay web nhân sự từ máy. Việc đọc web thật chỉ chạy trong job GitHub em viết.
   - Viết câu SQL có lệnh ghi (INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, REPLACE, PRAGMA, ATTACH). Chỉ SELECT.
   - Chạy `pnpm format` cho cả repo hay oxfmt.
3. **Bí mật.** Không đọc, liệt kê hay chép `~/.megatech/**`, `~/.ssh/**`, `~/.config/gh/**`, `~/.codex*/**` (kể cả `~/.codex/memories/`), `~/tele-bot/**`, `.dev.vars` của người khác, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY` trong tên. Không chạy `env`, `printenv`, `gh`.
4. **Repo công khai, log job cũng công khai.** Job chỉ được in **tỉ lệ %** và nhãn gộp. Không in: số đơn tuyệt đối, tiền, tên người, tên khách, SĐT, id đơn, id người, ghi chú đơn, JSON gốc. Kết quả SQL ghi vào file tạm trong job, không `cat`, không tải lên artifact.
5. **Kiểm trước khi xong bước.** Tự chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Ghi mã thoát từng lệnh vào tóm tắt.
6. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn nhất, ghi vào "Chỗ làm khác plan", rồi làm tiếp.
7. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
8. **Tóm tắt** (tiếng Việt). Tin nhắn cuối của em đúng theo mẫu:
   ```
   # Tóm tắt <bước>
   ## File đã đổi
   ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
   ## Test mới (tên test, ca nào)
   ## Chỗ làm khác plan và lý do
   ## Câu hỏi còn lại
   ```
