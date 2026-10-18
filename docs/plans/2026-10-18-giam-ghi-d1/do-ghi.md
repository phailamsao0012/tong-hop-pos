# K1 — Đo dòng ghi trên dữ liệu ảo

## Kết quả

So sánh mã nền `fad5bb7` (trước G1) với mã hiện tại sau G6. Đơn vị là dòng ghi **ước lượng trong SQLite**, có cộng chỉ mục; đây không phải số đo trên D1 thật.

| Khâu | Trước | Sau | Giảm |
|---|---:|---:|---:|
| Nạp ba ngày đơn ảo | 13.986 | 13.986 | 0% |
| Dòng đơn trong đồng bộ gần đây | 12.828 | 9.398 | 26,74% |
| Dòng hàng trong đồng bộ gần đây | 8.841 | 2.031 | 77,03% |
| Số liệu ngày | 9.708 | 9.708 | 0% |
| Số liệu khách | 7.614 | 7.614 | 0% |
| Trạng thái đồng bộ và ghi khác | 4.125 | 4.125 | 0% |
| Kéo nhân sự, gồm trạng thái | 1.233 | 443 | 64,07% |
| Dispatch không có POS bật | 0 | 0 | Không áp dụng |
| **Tổng gồm nạp ban đầu** | **58.335** | **47.305** | **18,91%** |
| **Riêng 24 giờ sau nạp** | **44.349** | **33.319** | **24,87%** |

Các bảng `raw_pos_orders`, `raw_pos_order_items`, `stats_daily*`, `customer_stats`, `customer_seller_stats` và bảy bảng `hr_*` khớp giữa hai phiên bản. Bỏ qua `fetched_at` và thời điểm `updated_at` của bảng số liệu khi đối chiếu, theo tiêu chí G2. Không in nội dung bản ghi ra báo cáo.

## Cách đo và chạy lại

Test: `tests/k1-writes.test.ts`. Dùng thế giới `lib/demo/world.ts`, Pancake giả `lib/demo/fake-pancake.ts`, `DEMO_MODE=1` và D1 SQLite trong bộ nhớ. Không gọi mạng.

- Nạp đơn của ngày 15–17/10/2026 cho cả sáu POS bằng hàm ghi của từng phiên bản.
- Giờ giả bắt đầu `2026-10-18T00:00:00Z`, chạy 1.440 phút. Mỗi năm phút gọi `syncRecent` cho sáu POS (288 lượt/POS); mỗi giờ gọi `pullHr` (24 lượt); mỗi phút gọi `runDispatch` (1.440 lượt), không bật POS chia số.
- Cả hai phiên bản dùng cùng ngày, nguồn đơn, giờ giả và dữ liệu HR. Dùng các hàm nghiệp vụ thật, không lấy tổng từ mô hình giả định.
- Lấy bốn module cũ `sync`, `hr-sync`, `dispatch`, `stats` bằng `git show fad5bb7:lib/<file>.ts`, đổi đường dẫn import để chạy trong `tests/support/old-write-path/`. Test xóa thư mục này trong `finally`, kể cả khi lỗi. Không lưu bản cũ trong thay đổi bàn giao.
- Cờ `estimateIndexes` của `d1` mặc định tắt. Khi bật, `rows_written = changes × (1 + số chỉ mục bị đụng)`. Đọc chỉ mục thật qua `PRAGMA index_list/index_info`; INSERT/DELETE tính mọi chỉ mục, UPDATE chỉ tính chỉ mục có cột trong SET. Chỉ mục biểu thức hoặc có điều kiện được tính bảo thủ cho mọi UPDATE. Cờ tắt vẫn trả `changes` như trước.
- `onWrite` cộng tất cả câu ghi theo khâu, gồm cả câu không đi vào tổng trả về của hàm đồng bộ.

Trên môi trường cho phép tiến trình con, chạy:

```powershell
pnpm exec tsx --import ./tests/support/register.mjs --test tests/k1-writes.test.ts
pnpm exec tsx --import ./tests/support/register.mjs --test tests/sync-g2.test.ts tests/hr-sync.test.ts
```

## Kiểm chứng và giới hạn

Trong phiên chạy này, Node 24 chặn tiến trình con với `spawn EPERM`: bộ chạy test chuẩn không khởi động được các file test, esbuild cũng bị chặn. Để vẫn thực thi kiểm chứng, dùng bộ nạp TypeScript tạm trong cùng tiến trình (`typescript.transpileModule` và `node:module.registerHooks`), `--test-isolation=none`; lấy module cũ bằng PowerShell `git show` trước khi chạy. Bộ nạp tạm và module cũ đã được xóa sau kiểm chứng.

- K1: 2/2 test qua, mã thoát 0; bao gồm kiểm tra cờ mặc định, INSERT/DELETE, UPDATE cột có/không có chỉ mục, ghi không khớp dòng, và toàn bộ kịch bản 24 giờ.
- Đối chiếu G2/G3: 8/8 test qua, mã thoát 0. G2 chuỗi đổi trạng thái/người bán/bớt hàng: 41 → 31 SQLite changes; G3: 53 → 11 dòng HR, không gồm trạng thái/chỉ mục.
- `pnpm typecheck`: 0.
- `pnpm test`: 1, `spawn EPERM`, chưa xác minh toàn bộ suite bằng lệnh chuẩn.
- `pnpm lint`: 1, lỗi hiện hữu ở `app/` và `public/vendor/`; không có lỗi ở file K1 sau khi sửa cảnh báo regex mới.
- `pnpm build`: 1, lỗi nạp dependency native và `spawn EPERM` khi nạp cấu hình Vite.

Đây là mô hình ước lượng theo yêu cầu plan, không mô phỏng B-tree, trigger, chi phí REPLACE xóa ngầm hay toàn bộ nội bộ D1. Với UPSERT, câu INSERT được tính theo mọi chỉ mục dù nhánh xung đột cập nhật. Không suy ra hóa đơn hoặc mức tiết kiệm trên web thật từ các số này.

Kịch bản giữ chu kỳ năm phút ở cả hai phía để đối chiếu cùng dữ liệu; không đi qua alarm Durable Object nên không đo lợi ích demo giãn lịch 30 phút của G5. Không chạy backfill, đồng bộ riêng sản phẩm/khách, canh gác, thao tác người dùng hay áp trần G6. Dispatch không bật POS nên bằng 0 ở cả hai phía (mã nền đã thoát sớm khi không có POS). Không thay đổi logic sản phẩm để tạo mức giảm giả. Nạp ban đầu chỉ nạp đơn/dòng hàng; số liệu được dựng khi chạy đồng bộ gần đây.

Chỉ thay test, bộ hỗ trợ test và tài liệu K1. Chưa commit, push hay triển khai.
