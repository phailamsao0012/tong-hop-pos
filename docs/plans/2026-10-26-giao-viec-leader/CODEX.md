# Luật cho Codex: giao việc và thông báo Zalo (plan bản 2, 27/10/2026)

1. **Đọc gì.** `AGENTS.md` ở gốc repo, rồi `plan.md` cùng thư mục. Chỉ làm đúng một bước được giao (Z1, Z2, Z3, Z4).
2. **Nhánh nền** là nhánh demo `claude/project-thread-3ujeoc` mới nhất. Số dòng trong plan có thể lệch: tìm theo tên hàm, tên biến.
3. **Mục tiêu:** sếp giao việc và họp trên web, leader và nhân viên làm việc qua Zalo Bot, tin tự động theo giờ. Không đổi số liệu, cách tính, quyền xem của bất kì trang nào khác. Số doanh số gửi Zalo phải lấy từ hàm sẵn có (`overviewReport`).
4. **Không được.**
   - `git commit`, `git push`, tạo nhánh, mở PR, dùng mạng. Script lo commit.
   - Sửa file ngoài danh sách "File được sửa" của bước. Cần thì không sửa, ghi vào "Câu hỏi còn lại".
   - Sửa `.github/**`, `drizzle/meta/**`, `db/schema.ts`, `wrangler*.json*`, `scripts/**`, `lib/auth.ts`, `worker.ts` (riêng Z4 được thêm đúng một lời gọi `maybeZaloTick` trong `scheduled`); đổi `WORLD_VERSION` hay các `*_EPOCH`.
   - Thêm migration nào khác ngoài `drizzle/0047_giao_viec_zalo.sql` (bước Z1), hay tạo chỉ mục trên bảng có sẵn (nhất là `raw_pos_orders`).
   - Chạy `pnpm format` hay oxfmt cho cả file/repo.
   - Gọi web thật, Pancake, web nhân sự, API Cloudflare, API Zalo. Chỉ dùng `DEMO_MODE=1` và D1 local / SQLite trong test.
5. **Bí mật.** Không đọc, liệt kê hay chép `~/.codex*/**`, `~/.ssh/**`, `~/.config/gh/**`, `~/.megatech/**`, `C:\tele-bot\**`, `.env`, `.dev.vars` của người khác, biến môi trường có `SECRET`, `TOKEN`, `PASSWORD`, `KEY`. Không chạy `env`, `printenv`, `set`, `gh`, `wrangler deploy`, `wrangler d1 … --remote`.
6. **Repo công khai.** Không đưa số thật, tên người thật (leader, nhân viên: chỉ dùng tên ảo trong `lib/demo/world.ts`), tên khách, email (trừ `@demo.megatech.vn`), SĐT, khoá vào code, chú thích, test hay tóm tắt.
7. **Kiểm trước khi xong bước.** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`; ghi mã thoát từng lệnh. Không thêm lỗi lint mới.
8. **Plan và code khác nhau.** Không ai trả lời giữa chừng. Chọn cách an toàn nhất (ưu tiên không lộ việc giữa các leader, không mở rộng quyền), ghi vào "Chỗ làm khác plan", rồi làm tiếp.
9. **Làm dở.** Đầu bước, `git status` có thay đổi chưa commit thì đó là phần làm dở của chính bước này: đọc và làm tiếp.
10. **Tóm tắt** (tiếng Việt), tin nhắn cuối đúng mẫu:
    ```
    # Tóm tắt <bước>
    ## File đã đổi
    ## Lệnh đã chạy và kết quả (mã thoát từng lệnh)
    ## Test mới (tên test, ca nào)
    ## Đã thử trên pnpm dev (Z3, Z4)
    ## Chỗ làm khác plan và lý do
    ## Câu hỏi còn lại
    ```
