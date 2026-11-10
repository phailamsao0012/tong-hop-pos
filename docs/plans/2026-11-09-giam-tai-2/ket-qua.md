# Kết quả giảm tải đợt 2

Làm tại `codex/giam-tai-2`. Không commit, không deploy, không gọi web/D1 thật. Chỉ đọc bản sao PC; phép thử chỉ mục/bảng đếm dùng bảng TEMP, không áp migration vào bản sao nguồn. Không xuất nội dung khách, người dùng hay số liệu kinh doanh.

## Việc 1 — đo trước rồi sửa

Đã chạy script đo trước khi sửa code báo cáo. Chi tiết 6 tổ hợp (6 POS, hôm nay/7 ngày/tháng này đến 09/11, all/cskh): `do-cuoc-goi.md`; đo sau: `do-cuoc-goi-sau.md`.

Mỗi câu làm nóng một lần, chạy thêm ba lần lấy trung vị. Không coi lần đầu là phép đo không cache của hệ điều hành. Mỗi câu chạy một lần/lượt mở; coverage cũ chỉ chạy khi cả cache isolate và app_settings hết hạn. Thứ hạng tổng trung vị qua 6 tổ hợp, tương đương một lượt mở mỗi tổ hợp: assigned 385,99 ms; daily 141,17 ms; coverage trực tiếp 98,03 ms; unknownAuthors 35,31 ms; orders 24,72 ms; names 2,69 ms; cursors 0,19 ms; pendingCustomers 0,17 ms; tra cache coverage 0,15 ms. Đây là thời gian cộng các câu, không phải thời gian tường của trang chạy song song.

| Câu | Trước (ms) | Sau (ms) | Cách sửa |
|---|---:|---:|---|
| Assigned — all | 76,75–86,48 | 8,83–10,19 | Giữ nguyên SQL; chỉ mục hẹp phủ đủ assigned_user_id/pos_id |
| Assigned — cskh | 42,88–56,55 | 5,79–6,19 | Cùng chỉ mục; EXPLAIN dùng cả assigned_user_id và pos_id |
| Coverage | 15,04–17,67 | 0,02–0,03 | Cộng tối đa 6 dòng theo POS trong bảng đếm |

Các câu theo kỳ còn lại đều dưới 50 ms nên giữ nguyên. Không đổi `teamFilter`, không viết lại IN/DISTINCT khi phép đo chưa chứng minh cần. Chọn coverage để sửa thêm theo số dòng đọc D1 đã có trong plan, dù thời gian PC dưới 50 ms.

Khác công cụ so với plan: EXPLAIN QUERY PLAN không cung cấp số dòng thực đọc; `pc/d1-core.ts` đặt rows_read bằng số dòng kết quả. Vì vậy báo cáo chỉ ghi đường truy cập/chỉ mục, không bịa số dòng đọc và không dùng rows_read đó làm ngưỡng 20.000. Claude cần đo số dòng thực trên công cụ SQLite có scan-status hoặc môi trường D1 thử nếu cần xác nhận chỉ tiêu này.

`calls_coverage_pos` được điền từng POS bởi bộ hẹn giờ 00–05h VN. Trigger giữ count/min/max trong cùng giao dịch khi đồng bộ thêm, sửa, xoá hoặc chuyển POS; đổi người phụ trách không đổi tổng khách. Sửa/xoá cực trị min/max có thể cần tra lại chỉ mục trong lúc ghi. Chỉ dùng bảng mới khi tất cả POS được chọn đã sẵn sàng; sau đó bỏ qua cả hai cache cũ và không ghi app_settings khi xem. Giữ fallback/cache cũ cho giai đoạn chưa điền đủ để không trả thiếu số.

Đối chiếu PC: assigned và coverage mới bằng đường cũ ở cả 6 tổ hợp. Bảng TEMP giữ các chỉ mục có SQL DDL của bảng nguồn, thêm chỉ mục mới rồi ANALYZE; EXPLAIN vẫn chọn chỉ mục mới khi có cả các chỉ mục cũ. Test dữ liệu tự sinh so toàn bộ báo cáo khi thêm ghi chú, đổi người phụ trách, xoá khách; test riêng bảng coverage còn bao gồm chuyển POS, sửa cực trị, xoá hết ghi chú, rollback.

## Việc 2 — danh sách MKT

Chọn bảng `marketer_ids`, không dùng JSON: thêm một mã bằng INSERT ON CONFLICT DO NOTHING, không phải đọc/ghi lại cả danh sách, và batch cùng đơn. Chỉ tạo câu MKT khi mã chuẩn hoá thay đổi; đồng bộ lặp không đổi không thêm câu ghi. first_seen_at/last_seen_at giữ thời điểm lần đầu ghi dòng, không cập nhật mỗi lượt.

Bộ hẹn giờ 00–05h VN điền đúng một POS mỗi lượt, ghi dấu POS đã điền trong cùng batch, rồi bật `marketer_ids_ready_v2` ở lượt kế tiếp khi không còn POS chưa điền. Chưa sẵn sàng dùng đường cũ/cache 6 giờ. Đã sẵn sàng chỉ đọc bảng mới, còn memo isolate tối đa 10 phút như cũ. Các lượt điền mới được cộng vào hạn mức ghi của scheduler.

Khác plan/code: “người từng là marketer” không hoàn toàn bằng DISTINCT cũ khi marketer của đơn bị thay thế. DISTINCT chỉ thấy mã hiện còn trên ít nhất một dòng đơn. Theo chỉ đạo giữ đúng số cũ, khi đổi marketer, xoá mã cũ khỏi bảng nếu nó không còn trên đơn nào. Câu kiểm tra này có thể quét bảng đơn **trong đồng bộ khi đổi mã**, không chạy khi người xem mở trang đã sẵn sàng. Không thêm chỉ mục raw_pos_orders. Xoá mềm đơn (status 7/is_removed) vẫn giữ marketer vì DISTINCT cũ không lọc trạng thái. Xoá cứng trực tiếp ngoài luồng đồng bộ không được hỗ trợ tự sửa bảng MKT.

Test so danh sách với DISTINCT sau đơn mới/đổi marketer/xoá mềm; kiểm đường đã sẵn sàng không đọc raw_pos_orders; kiểm lặp đồng bộ trả 0 câu ghi.

## Việc 3 — phiên 60 giây

SESSION_MEMO_MS và actingMemo dùng 60 giây. `forgetUserSessions` xoá các phiên đã nhớ của người bị đổi và góc xem như liên quan. Thu hồi một phiên theo id dùng thêm `forgetSessionId`. Gọi sau khi ghi thành công ở đổi mật khẩu, sửa/xoá tài khoản, khoá từ nhân sự, thêm/xoá passkey, lưu/bật/tắt TOTP, thu hồi phiên. Các route gọi hàm ghi trong lib nên đặt invalidation ngay ở lib cho các đường bảo mật; route users xoá nhớ sau batch. Đăng xuất vẫn xoá phiên hiện tại. Các lần cập nhật last_login_at, last_seen_at, counter passkey chỉ là metadata, không đổi quyền nên không ép xoá memo.

**Giới hạn phải báo anh:** isolate khác có thể còn nhớ tối đa 60 giây, trước là 15 giây, bao gồm cả khoá tài khoản. loadUser vẫn kiểm disabled khi đọc DB, nhưng không phát hiện users.updated_at đổi ở isolate khác trong thời gian memo. Muốn phát hiện ngay phải đọc phiên bản/disabled mỗi request hoặc có kênh invalidation liên isolate; chưa có đường chi phí thấp trong code hiện tại nên giữ giới hạn này theo nhánh xử lý được plan cho phép. Không tuyên bố khoá tức thời giữa các isolate.

Test đồng hồ giả chứng minh hit đến 59.999 ms, đọc lại ở 60.000 ms; đổi mật khẩu, đăng xuất, khoá, MFA/passkey và thu hồi phiên làm đọc lại DB trong cùng isolate. Có generation bảo vệ lượt đọc đang dở: nếu thu hồi xảy ra trong khi đang đọc DB thì không cho kết quả cũ điền lại memo; test điều khiển promise đã qua.

## File thay đổi

- `scripts/pc/do-cuoc-goi.ts`: bắt đúng SQL phát ra từ callsReport/callsCoverage, đo từng câu và EXPLAIN, đo TEMP candidate và đối chiếu số với đường cũ.
- `drizzle/0052_marketer_ids.sql`: duy nhất một migration mới; bảng MKT, chỉ mục khách hẹp, bảng đếm coverage và trigger.
- `lib/reports/calls-coverage.ts`, `lib/reports/calls-report.ts`: điền/đọc bảng đếm, fallback an toàn.
- `lib/teams/marketer-ids.ts`, `lib/pancake/sync.ts`, `lib/ops/scheduler.ts`: MKT tăng dần, điền ngoài giờ và tính lượt ghi.
- `lib/auth/auth.ts`, `lib/auth/auth-db.ts`, `lib/teams/hr-api.ts`, `app/api/users/route.ts`: TTL và xoá memo bảo mật.
- `tests/giam-tai-2.test.ts`: test số cũ/mới và memo phiên.
- Ba file báo cáo trong thư mục plan này; không sửa plan.

## Kiểm tra

- `npx tsx --import ./tests/support/register.mjs scripts/pc/do-cuoc-goi.ts`: bị chặn `spawn EPERM` (esbuild). Đo thành công bằng `node --import ./tests/support/register-native.mjs scripts/pc/do-cuoc-goi.ts` và bản `--candidate`.
- Đã thử đủ `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`: cả bốn bị `ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED`, Access denied tạo symlink dependency, chưa chạy được script tương ứng. Claude cần chạy đủ bên ngoài sandbox; chưa có kết quả build.
- `node node_modules/typescript/bin/tsc --noEmit`: qua.
- Native tests: 37/37 qua, gồm 5 test mới, G4/G7/G8, access và mkt-stats. K1/K2 qua; K2 không có sai khác bảng cuối cùng. K3 qua cả correctness và writes (3/3 tính cả test cha), differences rỗng, tổng thời gian khoảng 624 giây. Dừng runner gộp sau K2 để tránh chạy K3 trùng với runner K3 riêng; kết quả K3 lấy từ runner riêng đã kết thúc exit 0.
- Native oxlint toàn repo: lỗi tồn tại ở nhiều file ngoài phạm vi (overview-report, bot-parse, UI, vendor...). Oxlint trên toàn bộ 11 file TS được sửa/thêm: 0 diagnostic.
- Native oxfmt trên các file TS: không chạy được, `Failed to setup external formatter / spawn EPERM`. Không định dạng toàn repo.
- `git diff --check`: qua.

Chưa áp migration lên DB thật/bản sao nguồn. Migration phải có trước code mới; chờ các lượt điền ngoài giờ xong mới bỏ đường fallback. Chỉ mục/trigger thêm chi phí ghi cho dữ liệu thay đổi; fixture ước lượng số ghi hiện tại không tính trigger, nên kết quả giảm ghi của G/K không phải phép đo đầy đủ chi phí trigger khi bảng coverage đã được điền.


## S?a theo ki?m b?i 1f8fce1 (09/11/2026)

?? ho?n th?nh hai ?i?m theo th? t?, kh?ng commit. Chi ti?t t?i [ket-qua-kiem-bai-1f8fce1.md](ket-qua-kiem-bai-1f8fce1.md). Code ??ng b? kh?ng b?o ??m fetched_at ch? t?ng; ?? gi? nh?nh t?nh l?i MAX khi gi?m ?? b?o to?n s? c?. Native tests 18/18 qua, typecheck v? lint file s?a qua. pnpm test b? spawn EPERM; pnpm build g?p spawn EPERM v? l?i dependency native trong m?i tr??ng sandbox. ??i chi?u b?n sao PC: c? 6 t? h?p Cu?c g?i v? danh s?ch MKT sau d?n kh?p c?ch c?.
