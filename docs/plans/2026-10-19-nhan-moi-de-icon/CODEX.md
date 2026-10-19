# Luật cho Codex: sửa nhãn "Mới" đè icon (19/10/2026)

1. **Đọc gì.** `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao (S1).
2. **Nhánh nền** là nhánh demo `claude/project-thread-3ujeoc` mới nhất. Số dòng trong plan có thể lệch: tìm theo tên hàm, tên biến.
3. **Mục tiêu duy nhất:** nhãn trạng thái làm mới không còn đè icon, tiêu đề hay số trong ô; số liệu, cách tính, quyền không đổi.
4. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `.github/**`, `migrations/**`, `drizzle/**`, `db/schema.ts`, `wrangler*.json*`, `scripts/deploy-demo.mjs`; đổi `WORLD_VERSION`; đổi `BLOCK_EPOCH`, `STATS_EPOCH`, `CUSTOMER_EPOCH`, `SELLER_PRODUCT_EPOCH`, `SENT_AT_EPOCH` (đổi epoch = dựng lại cả bảng = ghi hàng triệu dòng).
   - Tạo hay xoá chỉ mục, bảng, cột. Không thêm migration.
   - Chạy `pnpm format` hay oxfmt cho cả file/repo.
   - Gọi web thật, Pancake, web nhân sự, API Cloudflare. Chỉ dùng `DEMO_MODE=1` và D1 local / SQLite trong test.
5. **Bí mật.** Không đọc, liệt kê hay chép `~/.codex*/**`, `~/.ssh/**`, `~/.config/gh/**`, `~/.megatech/**`, `C:\tele-bot\**`, `.env`, `.dev.vars` của người khác, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY`. Không chạy `env`, `printenv`, `set`, `gh`, `wrangler deploy`, `wrangler d1 … --remote`.
6. **Repo công khai.** Không đưa số thật, số tiền, mã tài khoản Cloudflare, tên người, tên khách, email, SĐT, khoá vào code, chú thích, test hay tóm tắt.
7. **Kiểm trước khi xong bước.** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`; ghi mã thoát từng lệnh. Chụp ảnh trang Điều hành (demo local) lúc vừa tải xong ở bề rộng 1440px và 390px, ghi đường dẫn ảnh vào tóm tắt (ảnh để ngoài repo).
8. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn nhất (ưu tiên số liệu đúng hơn tiết kiệm ghi), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
9. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
10. **Tóm tắt** (tiếng Việt), tin nhắn cuối đúng mẫu:
    ```
    # Tóm tắt <bước>
    ## File đã đổi
    ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
    ## Test mới (tên test, ca nào)
    ## Chỗ làm khác plan và lý do
    ## Câu hỏi còn lại
    ```
