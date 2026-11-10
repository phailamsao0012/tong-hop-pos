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

# K2 — Đo lại đủ các khâu trong 24 giờ

## Phạm vi và cách chạy

Test `tests/k2-writes.test.ts` mở rộng kịch bản K1, so mã nền `fad5bb7` với mã hiện tại sau G7. Giữ nguyên bảng K1 phía trên. Tất cả dữ liệu từ thế giới demo, Pancake giả và SQLite trong bộ nhớ; không gọi mạng, D1 thật hoặc đọc thông tin đăng nhập.

- Nạp ba ngày đơn ảo như K1; chạy 1.440 phút giả từ `2026-10-18T00:00:00Z` cho sáu POS.
- Đơn mới/sửa và khách mới/sửa: mỗi năm phút (288 lượt/POS).
- Nhân viên, sản phẩm và bản chép nhân sự: mỗi giờ (24 lượt; nhân viên/sản phẩm cho từng POS).
- Khách lịch sử: bắt đầu một vòng mới mỗi ba giờ (8 vòng/POS), gọi tiếp với con trỏ trả về tới khi `completed=true`, không dừng sau một batch. Có giới hạn bảo vệ 1.000 batch/vòng để báo lỗi nếu con trỏ không kết thúc.
- Dispatch: mỗi phút, không bật POS chia số (1.440 lượt).
- Lấy sáu module cũ `sync`, `hr-sync`, `dispatch`, `stats`, `customers-sync`, `customer-stats` bằng `git show fad5bb7:lib/<module>.ts`. Chuyển import giữa các module này sang bản cũ tương ứng, tránh dùng nhầm số liệu khách hiện tại cho phía cũ. Thư mục tạm `tests/support/old-write-path-k2/` được xóa trong `finally`.
- Dùng bộ đếm chỉ mục K1, gồm tất cả ghi trạng thái của mỗi khâu. Các dòng đơn/hàng/số liệu ngày/số liệu khách được tách từ lượt đồng bộ đơn; các khâu bổ sung tính cả trạng thái riêng của chúng. Không cộng trùng.

Lệnh chuẩn (khi môi trường cho phép tiến trình con):

```powershell
pnpm exec tsx --import ./tests/support/register.mjs --test tests/k2-writes.test.ts
```

Trong sandbox hiện tại, lệnh trên bị `spawn EPERM`. Cách chạy đã dùng, hoàn toàn local:

```powershell
$legacyDir = Join-Path (Get-Location) 'tests/support/old-write-path-k2'
New-Item -ItemType Directory -Force -Path $legacyDir | Out-Null
foreach ($moduleName in @('sync','hr-sync','dispatch','stats','customers-sync','customer-stats')) {
  git show "fad5bb7:lib/$moduleName.ts" | Set-Content -Encoding utf8 (Join-Path $legacyDir "$moduleName.ts")
}
node --experimental-transform-types --import ./tests/support/g7-native-loader.ts --test --test-isolation=none tests/k2-writes.test.ts
node --experimental-transform-types --import ./tests/support/g7-native-loader.ts --test --test-isolation=none tests/sync-g2.test.ts tests/hr-sync.test.ts tests/g7-writes.test.ts
```

Chỉ strip type không đủ vì code có parameter property; Node cần `--experimental-transform-types`. Không sửa bộ nạp hiện hữu, không cài dependency hoặc dùng mạng.

## Kiểm chứng

K2 đối chiếu toàn bộ bảng đơn, hàng, `stats_daily*`, số liệu khách, bảy bảng nhân sự, và bổ sung `pos_users`, `pos_products`, `pos_customers`, `customer_notes`. Chỉ bỏ `fetched_at` và `updated_at` của các bảng số liệu; vẫn kiểm tra `pos_customers.updated_at`. Khi lỗi, test chỉ in số dòng/cột lệch, không in nội dung bản ghi.

Chạy lại G2/G3/G7 bằng Node trực tiếp: 14/14 test qua, mã thoát 0. Chuỗi G7: 160 → 105 dòng ước lượng gồm chỉ mục; chuỗi G2: 41 → 31 SQLite changes; G3: 53 → 11 dòng HR, không gồm trạng thái/chỉ mục.

Các kiểm tra bắt buộc:

| Lệnh | Mã thoát | Kết quả |
|---|---:|---|
| `pnpm typecheck` | 0 | Qua |
| `pnpm test` | 1 | `spawn EPERM`, không khởi động được các file test |
| `pnpm lint` | 1 | Lỗi hiện hữu ngoài file K2, gồm `app/`, `lib/`, `public/vendor/` |
| `pnpm build` | 1 | Lỗi dependency native, resolve dependency và `spawn EPERM` khi nạp Vite config |
| `pnpm exec oxlint tests/k2-writes.test.ts` | 0 | Không thêm lỗi lint ở file K2 |

Các giới hạn ước lượng của K1 vẫn áp dụng. K2 có duyệt hết khách demo từ đầu lịch sử nên số nạp khách lần đầu nằm trong 24 giờ sau nạp đơn; không thể so trực tiếp phần trăm tổng K2 với K1 để suy ra riêng hiệu quả G7. Không chạy alarm, canh gác, thao tác người dùng, áp trần ngân sách hoặc đo hóa đơn thật.

## Điều chỉnh vòng sửa K2

Lượt duyệt khách dùng `maxPages=1` cho cả mã nền và mã hiện tại: mỗi trang được ghi trước khi đọc trang/cửa sổ tiếp theo, vẫn đi tới `completed=true` cho đủ tám vòng mỗi POS. Nguồn demo tính tổng khách và ghi chú theo cửa sổ truy vấn, nên cùng mã khách có thể xuất hiện lại với giá trị khác. Với mặc định gom năm trang, các UPDATE chỉ cột đổi có thể dựa vào bản lưu cũ trước batch và khác upsert của mã nền. Lượt trước phát hiện 59 dòng lệch trong `pos_customers`.

Đây là thay đổi ranh giới batch của kịch bản đo, không sửa logic nghiệp vụ. Phép đối chiếu vẫn giữ mọi cột nghiệp vụ. Kết quả K2 bên dưới chỉ chứng minh tương đương khi ghi từng trang; chưa chứng minh tương đương với mặc định gom năm trang. Trường hợp gom nhiều trang cần sửa riêng ngoài phạm vi file được phép của K2. Số ghi trạng thái tăng theo số lần gọi nên không so trực tiếp với lần đo gom năm trang.

## Bảng kết quả K2

K2 chạy trực tiếp bằng Node: 1/1 test qua, mã thoát 0; không có bảng/cột lệch. G2/G3/G7: 14/14 qua, mã thoát 0. Các mã thoát của bốn lệnh bắt buộc và lint riêng file K2 giữ như bảng kiểm chứng trên, đã chạy lại trong vòng sửa này.

| Khâu | Trước | Sau | Giảm |
|---|---:|---:|---:|
| Nạp ba ngày đơn ảo | 13.986 | 13.986 | 0,00% |
| Dòng đơn | 12.828 | 9.398 | 26,74% |
| Dòng hàng | 8.841 | 2.031 | 77,03% |
| Số liệu ngày | 9.708 | 9.708 | 0,00% |
| Số liệu khách | 7.614 | 6.658 | 12,56% |
| Trạng thái đồng bộ đơn và ghi khác | 4.125 | 4.125 | 0,00% |
| Nhân sự, gồm trạng thái | 1.233 | 443 | 64,07% |
| Dispatch không có POS bật | 0 | 0 | Không áp dụng |
| Nhân viên, gồm trạng thái | 17.856 | 882 | 95,06% |
| Sản phẩm, gồm trạng thái | 7.056 | 432 | 93,88% |
| Khách mới/sửa, gồm ghi chú và trạng thái | 10.375 | 9.402 | 9,38% |
| Duyệt hết khách mỗi ba giờ, gồm trạng thái | 2.189.037 | 1.075.490 | 50,87% |
| **Tổng gồm nạp ban đầu** | **2.282.659** | **1.132.555** | **50,38%** |
| **Tổng 24 giờ sau nạp** | **2.268.673** | **1.118.569** | **50,69%** |

Đã xóa module lịch sử tạm sau khi đo. Chưa commit, push hoặc triển khai. Sai lệch khi gom nhiều trang vẫn là giới hạn cần xử lý riêng; không coi kết quả ghi từng trang là bằng chứng trường hợp đó đã được sửa.

# K3 — Đo với số trang thật, tách đúng dữ liệu và dòng ghi

## Cách đo và lý do tách

So mã nền `fad5bb7` với mã sau G9, cả hai dùng cùng nguồn demo hiện tại sau G8 và SQLite trong bộ nhớ. Giữ nguyên K1, K2 ở trên. Số dòng ghi gồm ước lượng chỉ mục theo bộ đếm K1, không phải số D1 thật.

Theo chỉ dẫn chạy lại của Claude ngày 18/10 lúc 14:05Z, tách hai phần vì phép so trước đây dùng hai lịch khác nhau rồi đòi mọi bảng cuối giống nhau. Tổng khách và ghi chú của nguồn giả phụ thuộc thời điểm/cửa sổ gọi; lần duyệt cuối hai phía ở phút 1.430 và 720. Sai lệch này chưa chứng minh lỗi G8, nên không sửa mã nghiệp vụ để ép bằng nhau.

1. **Đúng dữ liệu (G8):** dùng 2 POS để giảm thời gian chạy, giữ đủ 1.440 phút. Hai phía cùng lịch cũ: nghỉ hơn một giờ từ khi hoàn tất; gọi trực tiếp `syncCustomersBackfill` cùng các phút 0, 65, …, 1.430. Kiểm tra đủ 23 vòng/POS mỗi phía. So toàn bộ các bảng như K2, gồm `pos_customers`, `customer_notes`, đơn, hàng, `stats_daily*`, `customer_stats`, `customer_seller_stats`, `hr_*`, `pos_users`, `pos_products`. Chỉ bỏ `fetched_at` và `updated_at` của bảng số liệu như trước, vẫn so `pos_customers.updated_at`.
2. **Dòng ghi (G9):** dùng đủ 6 POS × 1.440 phút, mỗi phía theo lịch thật: cũ 23 vòng/POS, mới 2 vòng/POS (phút 0, 720; cách giờ bắt đầu vòng trước 12 giờ). So số dòng ghi; mọi bảng khác vẫn phải khớp, chỉ không so bảng cuối `pos_customers` và `customer_notes` vì khác thời điểm gọi. Hai bảng này đã được kiểm đầy đủ trong phần 1. Khi lệch, test in số dòng/cột lệch và báo lỗi.

Cả hai phần nạp ba ngày đơn ảo 15–17/10/2026, chạy ngày 18/10 từ 00:00 UTC. Đơn gần đây mỗi 5 phút với 10 trang; khách gần đây mỗi 5 phút với mặc định 3 trang; khách lịch sử 12 trang mỗi lần gọi, tiếp tục con trỏ tới hết. Không ép 1 trang. Nhân viên/sản phẩm/HR mỗi giờ, dispatch mỗi phút (không bật POS chia số). Giờ giả giữ nguyên trong mỗi vòng; không mô phỏng thời gian mạng, deadline hoặc trần ghi của scheduler. Không thêm lượt lịch sử đơn sau nạp; đường lịch sử đơn 10 trang được kiểm riêng ở G8.

Không đổi nguồn giả, logic nghiệp vụ hay thêm lượt cuối để làm bằng dữ liệu. Các giới hạn ước lượng K1 vẫn áp dụng; không suy ra hóa đơn thật từ số đo này.

## Lệnh kiểm chứng local

Bộ chạy chuẩn `pnpm test` bị sandbox chặn spawn. Dùng bộ nạp Node có sẵn, nạp trước module cũ bằng PowerShell vì Node cũng bị chặn gọi `git`:

```powershell
$legacyDir = Join-Path (Get-Location) 'tests/support/old-write-path-k3'
New-Item -ItemType Directory -Force -Path $legacyDir | Out-Null
foreach ($moduleName in @('sync','hr-sync','dispatch','stats','customers-sync','customer-stats')) {
  git show "fad5bb7:lib/$moduleName.ts" | Set-Content -Encoding utf8 (Join-Path $legacyDir "$moduleName.ts")
}
node --experimental-transform-types --import ./tests/support/g7-native-loader.ts --test --test-isolation=none tests/k3-writes.test.ts
$legacyG8Dir = Join-Path (Get-Location) 'tests/support/old-write-path-g8'
New-Item -ItemType Directory -Force -Path $legacyG8Dir | Out-Null
foreach ($moduleName in @('sync','customers-sync','stats','customer-stats')) {
  git show "fad5bb7:lib/$moduleName.ts" | Set-Content -Encoding utf8 (Join-Path $legacyG8Dir "$moduleName.ts")
}
node --experimental-transform-types --import ./tests/support/g7-native-loader.ts --test --test-isolation=none tests/sync-g2.test.ts tests/hr-sync.test.ts tests/g7-writes.test.ts tests/g8-pending.test.ts tests/g9-rewalk.test.ts
```

Test chuyển import giữa các module cũ và xóa thư mục tạm trong `finally`. Không dùng mạng, không commit/push/triển khai.

## Kết quả

Phần 1 đã qua: **0 dòng lệch với số trang thật**, 2 POS, 23 vòng/POS ở cả hai phía (173,69 giây). Phần 2 đã qua: 6 POS, 23 vòng/POS cũ và 2 vòng/POS mới; **0 dòng lệch ở tất cả bảng phải so** (884,26 giây). Tổng khoảng 1.058 giây. Node báo 3/3 test qua (gồm test cha), 0 lỗi. Đây là số đo mới của lần chạy lại này.

## Các kiểm tra bổ sung

| Lệnh | Mã thoát | Kết quả |
|---|---:|---|
| `pnpm typecheck` | 0 | Qua |
| `pnpm test` | 1 | Sandbox chặn `spawn EPERM`, không khởi động được test chuẩn |
| `pnpm lint` | 1 | Lỗi có sẵn ngoài phạm vi K3 ở `app/`, `lib/`, `public/vendor/` |
| `pnpm build` | 1 | `spawn EPERM` khi nạp Vite config/dependency native |
| Node local G2/G3/G7/G8/G9 (lệnh trên) | 0 | 17/17 test qua; nạp trước module cũ G8 bằng PowerShell |
| `pnpm exec oxlint tests/k3-writes.test.ts` | 0 | Không thêm lỗi/cảnh báo lint |
| `git diff --check` | 0 | Qua |

Lần gọi hồi quy đầu tiên chưa nạp module G8 bị `spawnSync git EPERM` (16/17 qua); đã nạp đúng module từ `fad5bb7` rồi chạy lại đủ 17/17, mã 0.

## Bảng dòng ghi phần 2 — số đo chạy lại

| Khâu | Trước | Sau | Giảm |
|---|---:|---:|---:|
| Nạp ba ngày đơn ảo | 13.986 | 13.986 | 0,00% |
| Dòng đơn | 12.828 | 9.398 | 26,74% |
| Dòng hàng | 8.841 | 2.031 | 77,03% |
| Số liệu ngày | 9.708 | 9.708 | 0,00% |
| Số liệu khách | 7.614 | 6.658 | 12,56% |
| Trạng thái đồng bộ đơn và ghi khác | 4.125 | 4.125 | 0,00% |
| Nhân sự, gồm trạng thái | 1.233 | 443 | 64,07% |
| Dispatch không có POS bật | 0 | 0 | Không áp dụng |
| Nhân viên, gồm trạng thái | 17.856 | 882 | 95,06% |
| Sản phẩm, gồm trạng thái | 7.056 | 432 | 93,88% |
| Khách mới/sửa, gồm ghi chú và trạng thái | 13.416 | 12.577 | 6,25% |
| Duyệt hết khách theo lịch mỗi phía, gồm trạng thái | 269.449 | 267.345 | 0,78% |
| **Tổng gồm nạp ban đầu** | **366.112** | **327.585** | **10,52%** |
| **Tổng 24 giờ sau nạp** | **352.126** | **313.599** | **10,94%** |

Mức giảm này thuộc toàn bộ đường ghi cũ/mới trong kịch bản, không phải hiệu quả riêng G9. Số vòng giảm mạnh nhưng số ghi khâu duyệt khách chỉ giảm 0,78%; không suy ra hóa đơn thật hay tự sửa thêm ngoài K3.

Lệnh Node K3 báo 3/3 qua. Lệnh PowerShell bọc có mã thoát 1 do `ExperimentalWarning` trên stderr khi chuyển hướng `2>&1`; log xác nhận `pass 3`, `fail 0`. Lệnh hồi quy Node chạy lại có `exit $LASTEXITCODE` nên trả mã 0 như bảng kiểm tra.

Đã dọn module lịch sử và log tạm; typecheck cuối sau khi dọn vẫn mã 0. Chỉ đổi test K3 và tài liệu này. Không có câu hỏi còn lại về đối chiếu dữ liệu; các kiểm tra toàn repo chưa xanh vì lỗi môi trường/lint ngoài K3 đã nêu. Chưa commit, push hoặc triển khai.
