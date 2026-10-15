# Luật cho Codex: số mới cho app và ô tìm đơn (15/10/2026)

1. **Đọc gì.** `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao ở mục 5 của plan.
2. **Hợp đồng API.** Đọc bằng `git show origin/claude/project-thread-avd7td:docs/plans/2026-10-14-app-ios-android/plan.md` (mục 4.2.1, 4.2.2, 4.2.6). Script đã `git fetch` nhánh này trước khi giao.
3. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit và đẩy.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `.github/**`, `migrations/**`, `drizzle/**`. `wrangler.jsonc` và `scripts/deploy-demo.mjs` chỉ ở bước S2, đúng phần plan ghi.
   - Chạy `pnpm format` cho cả repo. Không chạy oxfmt (nó định dạng lại cả file, diff phình to).
   - Đổi số, cách tính, tên nghiệp vụ, quyền xem ngoài điều plan ghi.
   - Gọi web thật, Pancake hay web nhân sự. Chỉ dùng `DEMO_MODE=1` và D1 local.
4. **Bí mật.** Không đọc, liệt kê hay chép `~/.megatech/**`, `~/.ssh/**`, `~/.config/gh/**`, `~/.codex*/**` (kể cả `~/.codex/memories/`), `.dev.vars` của người khác, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY` trong tên. Không chạy `env`, `printenv`, `gh`, `wrangler deploy`, `wrangler d1 … --remote`.
5. **Repo công khai.** Không đưa số thật, tên khách, email, SĐT, khoá hay token vào code, chú thích, test hay tóm tắt. SĐT giả dạng `0900000001`, tên giả "Khách A", "NV A".
6. **Kiểm trước khi xong bước.** Tự chạy `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Ghi mã thoát từng lệnh vào tóm tắt.
7. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn và đúng ý plan nhất (không đổi số đang hiện), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
8. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
9. **Tóm tắt** (tiếng Việt). Tin nhắn cuối của em đúng theo mẫu:
   ```
   # Tóm tắt <bước>
   ## File đã đổi
   ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
   ## Test mới (tên test, ca nào)
   ## Chỗ làm khác plan và lý do
   ## Câu hỏi còn lại
   ```
