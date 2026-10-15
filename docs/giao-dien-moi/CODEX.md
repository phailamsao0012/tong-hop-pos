# Giao việc cho Codex: giao diện mới web tổng

Anh Vũ chốt plan ngày 12/10/2026 ("Chốt theo ý tổ đề xuất"). Năm lựa chọn: menu sáng, số JetBrains Mono, có cột "Việc cần anh", có Ctrl K, tiêu đề Be Vietnam Pro 600.

## Đọc trước khi làm
1. `docs/giao-dien-moi/plan.md`: plan đầy đủ. Mục 2 là các điều **không được đổi**. Mục 5 chia 10 giai đoạn G1–G10.
2. `docs/giao-dien-moi/hien-trang.md`: giao diện hiện tại nằm ở đâu trong code.
3. `docs/giao-dien-moi/mau/index.html`: mẫu tĩnh, mở bằng trình duyệt. Thêm `?s=home`, `?s=cskh`, `?s=orders` hoặc `?s=palette` để xem từng trang, thêm `&t=dark` để xem tối.
4. `docs/giao-dien-moi/mau/tokens.css`: bộ màu chuẩn.
5. `docs/giao-dien-moi/anh/`: ảnh để so khi nghiệm thu.
6. `docs/giao-dien-moi/danh-gia-qa.md`: góp ý của QA. Plan bản 2 đã sửa theo đủ các góp ý này.

## Luật làm việc
- **Mỗi lần chỉ làm một giai đoạn**, theo thứ tự G1 → G10.
- Tạo nhánh `codex/giao-dien-gN` từ `claude/project-thread-3ujeoc`.
- Mở PR **vào `claude/project-thread-3ujeoc`**. Tuyệt đối không mở PR vào `main`.
- Trước khi mở PR, chạy đủ bốn lệnh và dán kết quả vào mô tả PR:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm lint` (không được thêm lỗi mới)
  - `pnpm build`
- Mô tả PR viết tiếng Việt, gồm:
  - giai đoạn nào;
  - tệp nào đã đổi;
  - chỗ nào làm khác plan, và vì sao;
  - ảnh trước/sau của các trang mà plan yêu cầu.
- Repo công khai. Không đưa số thật, email, số điện thoại hay khoá bí mật vào code, commit hoặc ảnh.
- Không sửa `.github/workflows/*`, `wrangler*.json`, `migrations/**`.
- Không đổi số, cách tính, tên nghiệp vụ, quyền xem.
- Route mới chỉ được thêm đúng hai route chỉ đọc: `/api/reports/briefing` và `/api/search`. Câu SQL mới phải đưa vào PR để duyệt.
- Plan và code thật khác nhau thì dừng lại, ghi câu hỏi vào PR. Không tự đoán.

## Sau mỗi PR
1. Tổ web tổng xem PR rồi merge vào nhánh demo. Nhánh này tự deploy lên demo.tonghopposmegatech.io.vn.
2. QA kiểm trên demo theo mục 7 của plan.
3. Anh Vũ xem demo ở ba mốc: sau G2, sau G5 và sau G10.

Lên web thật chỉ khi anh nhắn đồng ý.

## Lời giao mẫu (dán vào Codex, đổi số giai đoạn)
> Repo phailamsao0012/tong-hop-pos, nhánh gốc claude/project-thread-3ujeoc. Đọc docs/giao-dien-moi/CODEX.md và docs/giao-dien-moi/plan.md, rồi làm đúng giai đoạn G1 trong mục 5 của plan. Chỉ làm G1. Tạo nhánh codex/giao-dien-g1, chạy pnpm typecheck, pnpm test, pnpm lint, pnpm build, rồi mở PR vào claude/project-thread-3ujeoc. Mô tả PR viết tiếng Việt, theo mục "Luật làm việc" trong CODEX.md.
