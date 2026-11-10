# Giảm tải đợt 2: đầu trang Cuộc gọi, danh sách MKT lưu sẵn, nhớ kiểm đăng nhập 60 giây

Anh Vũ 09/11/2026:
> "cho Codex làm 3 việc: số đầu trang Cuộc gọi (đo câu nặng thật trước), lưu sẵn danh sách MKT, nhớ kiểm đăng nhập 60 giây; chưa lên web thật"

- Nhánh: `codex/giam-tai-2`, tách từ `origin/main` ecbd6a2 (#147). Worktree trên PC: `C:\thp\codex-tai2`.
- **Không deploy, không đụng web thật hay D1 thật.** Chỉ chạy trên bản sao DB ở PC: `C:\thp\db-thu\thp.sqlite`.
- Không đổi số, cách tính, quyền xem, giao diện. Không đưa số thật, tên, SĐT, khoá vào repo (repo công khai).
- Thêm migration chỉ khi cần cho việc 2. Nếu thêm thì đúng 1 file `drizzle/0052_*.sql`.

## Việc 1. Số đầu trang Cuộc gọi: ĐO TRƯỚC, rồi mới sửa

### 1a. Đo (bắt buộc làm trước, ghi kết quả vào `do-cuoc-goi.md` cùng thư mục)
- Viết `scripts/pc/do-cuoc-goi.ts`, chạy bằng `npx tsx --import ./tests/support/register.mjs`. Mở DB bằng `openD1` trong `pc/d1.ts`, trên `C:\thp\db-thu\thp.sqlite`.
- Đo từng câu mà `callsReport` và `callsCoverage` (`lib/reports/calls-report.ts`) chạy khi mở trang Cuộc gọi. Gồm các câu trong `env.DB.batch([...])`, câu `pendingCustomers` và câu `callsCoverage`, với:
  - 6 POS;
  - kỳ "Hôm nay", "7 ngày", "Tháng này" (01/11–09/11);
  - team `all` và `cskh`.
- Với mỗi câu ghi:
  - thời gian (ms), chạy 3 lần lấy trung vị, lần đầu không tính cache;
  - số dòng đọc, đo bằng `EXPLAIN QUERY PLAN`, kèm chỉ mục được dùng.
- Số đo trên web thật (Cloudflare D1, 09/11, 1 giờ) để đối chiếu:
  - câu `callsCoverage` (đếm `pos_customers` + `customer_notes` theo POS): 1.960 ms, đọc 1.221.664 dòng mỗi lần (trước khi có cache 15 phút);
  - `SELECT COUNT(*) AS n FROM pos_customers WHERE assigned_user_id IS NOT NULL AND assigned_user_id IN (SELECT DISTINCT user_id FROM pos_users …)`: 22 lần/giờ, 42 ms, đọc 69.694 dòng;
  - `SELECT COUNT(*) … FROM customer_notes WHERE created_at>=? … author_id IN (SELECT DISTINCT user_id FROM pos_users …)`: 15 lần/giờ, đọc 6.163 dòng.
- Xếp hạng câu nặng nhất theo tổng (thời gian × số lần mỗi lượt mở trang).

### 1b. Sửa đúng các câu nặng đo được (chỉ câu đọc trên 20.000 dòng hoặc chạy trên 50 ms trên PC)
Cách sửa theo thứ tự ưu tiên. Số trả về phải giữ nguyên.
1. Câu đếm toàn bảng không phụ thuộc kỳ, như `callsCoverage`: đổi thành bảng đếm sẵn theo POS.
   - Được cập nhật khi đồng bộ ghi chú/khách. Đồng bộ khách: `lib/pancake/*customers*`. Đồng bộ ghi chú: chỗ `INSERT INTO customer_notes`.
   - Hoặc tính tăng dần (cộng số dòng mới ghi).
   - Bỏ cache `app_settings` 15 phút khi bảng đếm sẵn đã đúng.
2. Câu có `IN (SELECT DISTINCT user_id FROM pos_users WHERE …)`: viết lại để dùng chỉ mục có sẵn, ví dụ `EXISTS` hoặc bảng tạm danh sách người.
   - Không tạo chỉ mục rộng trên `raw_pos_orders`.
   - Được thêm chỉ mục hẹp trên `customer_notes` / `pos_customers` nếu `EXPLAIN` chứng minh cần, đặt trong migration 0052.
3. Câu theo kỳ đã nhanh (dưới 50 ms) thì để nguyên.
- Test: số đầu trang Cuộc gọi đường mới bằng đường cũ cho bộ dữ liệu tự sinh, gồm các trường hợp:
  - thêm ghi chú mới;
  - khách đổi người phụ trách;
  - xoá khách.

## Việc 2. Lưu sẵn danh sách MKT (người từng là Marketer trên đơn)
Hiện trạng ở `lib/teams/marketer-ids.ts`:
- Có câu `SELECT DISTINCT TRIM(marketer_id) FROM raw_pos_orders`, quét cả bảng đơn (384.000 dòng, khoảng 1 s trên D1).
- Kết quả được lưu trong `app_settings` 6 giờ và nhớ trong isolate 10 phút. Khi hết hạn thì quét lại.

Sửa thành danh sách lưu sẵn, cập nhật dần, không bao giờ quét lại cả bảng khi người xem mở trang:
- Bảng `marketer_ids (marketer_id TEXT PRIMARY KEY, first_seen_at TEXT, last_seen_at TEXT)`, migration 0052. Hoặc 1 khoá `app_settings` dạng JSON nếu đơn giản hơn và đủ, nhưng phải giải thích lý do chọn trong `ket-qua.md`.
- Khi đồng bộ đơn ghi đơn có `marketer_id` (chỗ `orderStatements` trong `lib/pancake/*`): `INSERT … ON CONFLICT DO NOTHING` (hoặc chỉ cập nhật `last_seen_at` khi đổi ngày). Ghi trong cùng batch.
  Phải không làm tăng số lượt ghi khi đồng bộ lặp không đổi dữ liệu: test G4/G7/G8/K1–K3 đang khóa điều này, phải vẫn qua.
- Điền lần đầu: bộ hẹn giờ chạy 1 lần câu DISTINCT cũ, theo từng POS, ngoài giờ người xem. Sau đó ghi cờ sẵn sàng. Chưa sẵn sàng thì dùng đường cũ.
- `marketerIds(db)` đọc bảng mới khi đã sẵn sàng.
- Test: danh sách từ bảng mới bằng câu DISTINCT cũ, sau chuỗi đồng bộ có đơn mới / đổi marketer / xoá đơn. Đơn bị xoá thì marketer vẫn giữ trong danh sách, đúng như câu DISTINCT cũ vì nó cũng không lọc trạng thái.

## Việc 3. Nhớ kiểm đăng nhập 60 giây
Hiện trạng ở `lib/auth/auth.ts`: `SESSION_MEMO_MS = 15000`, `sessionMemo` theo isolate. `actingMemo` dùng cùng thời hạn.
- Đổi `SESSION_MEMO_MS` thành 60 giây.
- Giữ an toàn. Các thao tác sau phải xoá nhớ ngay trong isolate đang xử lý:
  - đăng xuất (đã có `forgetSession`);
  - đổi mật khẩu;
  - khoá tài khoản;
  - đổi vai trò / quyền;
  - thu hồi phiên (`/api/auth/sessions`);
  - tắt/bật MFA.
- Tìm tất cả route ghi `users`, `sessions`, `user_mfa`, `passkeys`. Thêm hàm `forgetUserSessions(userId)` xoá mọi mục nhớ của user đó, và gọi ở các route này.
- Ghi rõ trong `ket-qua.md`: isolate khác có thể còn nhớ tối đa 60 giây (trước là 15 giây). Riêng khoá tài khoản thì sửa trong `loadUser` để `disabled` luôn được kiểm: mỗi lần `users.updated_at` đổi thì bỏ nhớ.
  Nếu không làm được với chi phí thấp, ghi rõ giới hạn này để Claude báo anh.
- Test: nhớ 60 giây; đăng xuất / đổi mật khẩu / khoá thì lần gọi tiếp theo trong cùng isolate đọc lại DB.

## Nộp
- Chạy `node node_modules/typescript/bin/tsc --noEmit` và các test liên quan bằng bộ nạp native, như lần trước. Sandbox chặn `pnpm` thì ghi rõ, Claude chạy ngoài sandbox.
- Ghi `docs/plans/2026-11-09-giam-tai-2/ket-qua.md`: file đổi, số đo trước và sau (việc 1), giới hạn còn lại.
- Không commit. Claude kiểm, chạy đủ test, so số trên bản sao PC, rồi commit.
