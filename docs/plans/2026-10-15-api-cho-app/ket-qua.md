# Kết quả chạy liền một mạch: API cho app 15/10

Codex làm từng bước, máy kiểm sau mỗi bước. Tổ web tổng kiểm một lần sau khi đọc file này và diff.

## Tiến độ
```
15/10 05:36Z Bắt đầu ở ~/Projects/thp-api1510, nhánh codex/api-app-1510, gốc 4b61d65, tài khoản đầu codex.
15/10 05:36Z Lỗi lint ở gốc: 0.
15/10 05:36Z S1: bắt đầu (Tìm đơn, tìm khách: thoát LIKE, mã đơn theo khoá chính, SĐT nhiều dạng, nhật ký tìm).
15/10 05:36Z s1: codex hết lượt, đổi tài khoản
15/10 05:44Z S1: máy kiểm báo lỗi, giao lại vòng 1.
15/10 05:46Z S1: máy kiểm báo lỗi, giao lại vòng 2.
15/10 05:50Z S1: máy kiểm báo lỗi, giao lại vòng 3.
15/10 05:51Z DỪNG ở s1: Hết 3 vòng sửa mà máy kiểm vẫn báo lỗi (xem ~/codex-viec/api-1510/s1-loi-vong4.txt).
15/10 05:51Z Đã đẩy lên codex/api-app-1510 (ad53c02).
15/10 06:30Z Bắt đầu ở ~/Projects/thp-api1510, nhánh codex/api-app-1510, gốc 0e7679c, tài khoản đầu codex.
15/10 06:30Z Lỗi lint ở gốc: 0.
15/10 06:30Z S1: bắt đầu (Tìm đơn, tìm khách: thoát LIKE, mã đơn theo khoá chính, SĐT nhiều dạng, nhật ký tìm).
15/10 06:33Z S1: xong, commit 9a95ea3.
15/10 06:33Z S2: bắt đầu (Giới hạn 30 lượt tìm mỗi phút mỗi người).
15/10 06:36Z S2: xong, commit f335e35.
15/10 06:36Z X1: bắt đầu (Đã XN kho chỉ tính kho xác nhận, không tính người chốt tự bấm).
15/10 06:40Z X1: xong, commit ea31a9a.
15/10 06:40Z W1: bắt đầu (product-groups thêm trường tách sẵn và staffTotal).
15/10 06:45Z W1: xong, commit 3dd729f.
15/10 06:45Z W2: bắt đầu (staff-compare thêm seriesRate và rowsTotal).
15/10 06:49Z W2: xong, commit 7fc92ce.
15/10 06:49Z W5: bắt đầu (staff-compare thêm chart, CompareStrip đọc chart).
15/10 06:54Z W5: xong, commit c827c78.
15/10 06:54Z Xong mọi bước.
15/10 06:54Z Đã đẩy lên codex/api-app-1510 (cdfa028).
15/10 07:57Z Bắt đầu ở ~/Projects/thp-api1510, nhánh codex/api-app-1510, gốc ce20dc9, tài khoản đầu codex.
15/10 07:57Z Lỗi lint ở gốc: 0.
15/10 07:57Z S1: đã có commit, bỏ qua.
15/10 07:57Z S2: đã có commit, bỏ qua.
15/10 07:57Z X1: đã có commit, bỏ qua.
15/10 07:57Z W1: đã có commit, bỏ qua.
15/10 07:57Z W2: đã có commit, bỏ qua.
15/10 07:57Z W5: đã có commit, bỏ qua.
15/10 07:57Z F1: bắt đầu (Sửa hai điểm QA báo sau demo (15/10)).
15/10 07:59Z F1: xong, commit 0c6aba1.
15/10 07:59Z Xong mọi bước.
```

## Cảnh báo cho tổ soát
```
S1: lệnh lạ: /bin/zsh -lc "ls ~/Projects/tong-hop-pos/node_modules/.pnpm | rg '"'^(tsx|vinext|oxlint|typescript|vite@)'"' && pnpm install --offline --frozen-
S1: lệnh lạ: /bin/zsh -lc "ls ~/Projects/tong-hop-pos/node_modules/.pnpm | rg '"'^(tsx|vinext|oxlint|typescript|vite@)'"' && pnpm install --offline --frozen-
```

---

## Tóm tắt S1

### File đã đổi

- `lib/search-query.ts`: thoát LIKE, biến thể SĐT, khoá đơn, che và phân loại từ khoá.
- `lib/audit.ts`: nhận diện hành động `search`, che từ khoá và ghi loại tìm.
- `app/api/raw/orders/route.ts`: tìm bằng `id IN`, `phone IN`, LIKE có ESCAPE.
- `app/api/reports/customers/route.ts`: thoát LIKE ở cả hai chế độ.
- `lib/demo/world.ts`, `lib/demo/mode.ts`: hai đơn thử tìm kiếm và tăng phiên bản dữ liệu demo.
- `tests/search-query.test.ts`: 11 test mới.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn IPC của tsx (`listen EPERM`).
- `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, đủ **184/184 test** qua.
- `pnpm lint`: **1**, có **1.158 lỗi**, giống HEAD; đối chiếu xác nhận **không thêm lỗi**.
- `WRANGLER_SEND_METRICS=false pnpm build`: **0**.
- `git diff HEAD --check`: **0**; kiểm phạm vi file S1 qua.

### Test mới (tên test, ca nào)

11 test đều qua:

- `escapeLike`: `%`, `_`, `\` chỉ khớp ký tự nguyên văn.
- `phoneVariants`: các dạng số và dấu phân cách cùng ba biến thể.
- `orderKeys`: bỏ `#`, đúng POS, chặn ký tự SQL.
- `maskSearchTerm`: che SĐT, tên và phân loại từ khoá.
- `classifyApi`: hai route có `q` thành `search`; `q` rỗng không thành `search`.
- `nhật ký search`: lưu từ khoá đã che, loại tìm; xử lý tham số trùng và chuỗi dài.
- `tìm đơn`: biến thể SĐT cùng kết quả, giữ lọc ngày.
- `tìm mã đơn`: dùng `id IN`, giữ tìm đuôi SĐT.
- `tìm tên và ký tự đặc biệt`: kiểm cả hai route và hai chế độ khách.
- `EXPLAIN local`: mã đơn dùng khoá chính; SĐT dùng chỉ mục POS × SĐT.
- `demo`: có đơn tháng trước và đơn Mới với SĐT giả.

### Chỗ làm khác plan và lý do

- Ép dùng chỉ mục SĐT có sẵn để tránh SQLite chọn chỉ mục ngày khi kết hợp `IN` với sắp xếp.
- Dùng Node chạy toàn bộ test vì sandbox chặn IPC của CLI tsx.
- Chỉ xử lý S1; chưa commit hoặc push.

### Câu hỏi còn lại

Yêu cầu nhật ký còn hai điểm trong [worker.ts](~/Projects/thp-api1510/worker.ts:226): batch lỗi vẫn ghi URL nguyên văn, lượt bị chặn quyền thiếu chi tiết từ khoá. File này ngoài danh sách được sửa của S1 theo `CODEX.md`, nên giữ nguyên và chuyển tổ kiểm xử lý.
---

## Tóm tắt S2

### File đã đổi

- `wrangler.jsonc`: thêm `SEARCH_LIMIT`, 30 lượt/60 giây, namespace `1501`.
- `scripts/deploy-demo.mjs`: cấu hình demo dùng namespace `1502`.
- `db/env.d.ts`: thêm binding tùy chọn.
- `lib/search-limit.ts`: kiểm tra hạn mức theo mã người dùng; thiếu binding thì cho qua.
- `app/api/raw/orders/route.ts`, `app/api/reports/customers/route.ts`: chỉ đếm GET có `q` không rỗng; vượt hạn mức trả 429 đúng thông báo.
- `tests/search-limit.test.ts`: thêm 6 test.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

| Lệnh | Mã thoát và kết quả |
|---|---|
| `pnpm typecheck` | **0** |
| `pnpm test` | **1** — sandbox chặn socket nội bộ của `tsx` (`EPERM`) |
| `pnpm lint` trước và sau sửa | **1** mỗi lần — cùng 1.158 chẩn đoán, không thêm lỗi |
| `pnpm build` | **0** |
| `pnpm exec tsx --import ./tests/support/register.mjs --test tests/search-limit.test.ts` | **1** — cùng lỗi socket |
| `node --import tsx --import ./tests/support/register.mjs --test tests/search-limit.test.ts` | **0** — 6/6 qua |
| `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts` | **0** — 190/190 qua |
| `node scripts/deploy-demo.mjs --local` | **0** |
| Kiểm tra cấu hình sinh ra bằng Node | **0** — namespace `1501`/`1502`, đều 30 lượt/60 giây |
| `git diff --check` | **0** |

### Test mới (tên test, ca nào)

- **checkSearchLimit**: thiếu binding, khóa đúng mã người dùng, lỗi 429 đúng câu.
- **Hai route dùng chung 30 lượt/phút**: lượt 31 bị chặn trước truy vấn dữ liệu; phút sau tìm được.
- **Hạn mức theo từng người**: người khác cùng IP vẫn tìm được.
- **GET thiếu q, q rỗng hoặc chỉ khoảng trắng**: không gọi binding.
- **GET có q khi thiếu binding**: hai route vẫn trả dữ liệu.
- **Chưa đăng nhập**: trả 401, không gọi binding.

### Chỗ làm khác plan và lý do

Không khác phần triển khai. Do sandbox chặn socket của `tsx`, đã chạy bổ sung toàn bộ test trực tiếp bằng Node; tất cả đều qua. Chỉ sửa 7 file thuộc S2, chưa commit hoặc push.

### Câu hỏi còn lại

Không có.
---

## Tóm tắt X1

### File đã đổi

- [app/api/reports/product-groups/route.ts](~/Projects/thp-api1510/app/api/reports/product-groups/route.ts): `whConfirmed`, `whRate` và `wh=1` chỉ tính người xác nhận khác người chốt, có mã rõ ràng.
- [app/product-group-blocks.tsx](~/Projects/thp-api1510/app/product-group-blocks.tsx): sửa ô giải thích, thêm “(không tính)”, giữ dòng Tổng theo nghĩa mới. Đây là file duy nhất khác đọc hai trường trên.
- [tests/product-groups-wh-confirmed.test.ts](~/Projects/thp-api1510/tests/product-groups-wh-confirmed.test.ts): cập nhật test cũ và thêm ca X1.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn socket nội bộ của `tsx` (`EPERM`).
- `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, đủ **191/191 test qua**.
- `pnpm lint`: **1**; đối chiếu HEAD: cùng **1.158 chẩn đoán**, **0 lỗi mới**.
- `pnpm build`: **0**.
- `git diff --check`: **0**.
- `pnpm dev` và lần thử `--hostname 127.0.0.1`: **1**, sandbox chặn mở cổng.

### Test mới (tên test, ca nào)

“X1: kho, tự bấm, không rõ và quay lại Chờ xác nhận cộng đúng; wh=1 chỉ lấy kho”: kiểm ba loại người bấm, tỷ lệ, danh sách, đơn quay lại Chờ xác nhận, trạng thái tùy chọn; trên cả ba cách chia nhóm và hai cách tính người.

### Chỗ làm khác plan và lý do

- Thêm `waitingUnconfirmed` cho ô chi tiết để tránh cộng trùng đơn đã xác nhận rồi quay lại Chờ xác nhận; giữ nguyên `waiting`.
- Chưa có ảnh trước/sau khổ 1440 và 390px vì sandbox chặn máy chủ local. Đã xoá `.dev.vars` tạm.
- Chỉ sửa X1; chưa commit hoặc push.

### Câu hỏi còn lại

Không có. Còn thiếu kiểm ảnh giao diện trong môi trường cho phép mở cổng local.
---

## Tóm tắt W1

### File đã đổi

- `app/api/reports/product-groups/route.ts`: thêm sáu trường cho `staff[]`, `staffTotal` và định nghĩa; giữ nguyên trường cũ.
- `lib/demo/world.ts`: thêm đơn giả trạng thái 17 đã có giờ XN kho.
- `lib/demo/mode.ts`: tăng phiên bản dữ liệu demo để nạp ca mới.
- `tests/product-groups-w1.test.ts`: thêm kiểm thử W1.
- `tests/fixtures/product-groups-after-x1.json`: lưu dấu kiểm JSON sau X1.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn socket IPC của `tsx`.
- `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, toàn bộ **194 test qua**.
- `pnpm lint`: **1**, vẫn 1.158 lỗi như HEAD; đối chiếu xác nhận **không thêm lỗi**.
- `pnpm build`: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- **JSON demo bỏ trường mới khớp nguyên bản sau X1 ở mọi dim và bộ lọc**: 12 tổ hợp, giữ nguyên JSON cũ.
- **Đơn demo trạng thái 17 đã XN kho không cộng hai lần ở mọi dim và cách tính người**: kiểm cả người bán và chăm sóc.
- **Tổng chỉ cộng người có mã; các phép min/max cộng theo từng người**: kiểm kho, tự xác nhận, không rõ, quay lại chờ, bộ lọc tùy chọn và tập rỗng.

### Chỗ làm khác plan và lý do

Không đổi phạm vi W1. Dùng lệnh Node tương đương để chạy toàn bộ test vì sandbox chặn IPC của `tsx` CLI.

### Câu hỏi còn lại

Không có.
---

## Tóm tắt W2

### File đã đổi

- [route.ts](~/Projects/thp-api1510/app/api/reports/staff-compare/route.ts): thêm `staff[].seriesRate` và `rowsTotal` theo người có số kỳ đang xem.
- [staff-compare-w2.test.ts](~/Projects/thp-api1510/tests/staff-compare-w2.test.ts): test W2.
- [staff-compare-before-w2.json](~/Projects/thp-api1510/tests/fixtures/staff-compare-before-w2.json): hash đối chiếu JSON trước W2.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0** sau khi sửa lỗi kiểu trong test.
- `pnpm test`: **1**, sandbox chặn socket của `tsx`.
- `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, qua **196/196 test**.
- `pnpm lint`: **1**, giữ nguyên **1.158 lỗi nền**, không thêm lỗi.
- `pnpm build`: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- **“W2: JSON cũ giữ nguyên; seriesRate trùng pointValue và rowsTotal khớp dòng Tổng, staffTotal.people trên demo”**: kiểm sáu bộ lọc, chuỗi giờ/ngày, điểm gộp và JSON cũ.
- **“W2: loại người chỉ có kỳ so và mã trống; giữ người chỉ có đơn chốt hoặc số chia, tỷ lệ có trọng số và null”**: kiểm tập người, tỷ lệ gộp, kỳ dài khác nhau, lọc người và tổng rỗng.

### Chỗ làm khác plan và lý do

Code đúng phạm vi W2. Do sandbox chặn `tsx` CLI, chạy toàn bộ test bằng Node với cùng bộ nạp `tsx`.

### Câu hỏi còn lại

Không có.
---

## Tóm tắt W5

### File đã đổi

- `app/api/reports/staff-compare/route.ts`: thêm `chart` cả đội và `staff[].chart`.
- `lib/compare-chart.ts`: hàm thuần gộp điểm, tính tỷ lệ, cộng dồn và cắt theo `cutoff`.
- `app/staff-compare.tsx`: biểu đồ cả đội/xem riêng đọc `chart`; bỏ cắt theo giờ máy.
- `tests/compare-chart.test.ts`, `tests/staff-compare-w5.test.ts`, `tests/staff-compare-chart-view.test.ts`: thêm test W5.
- `tests/fixtures/staff-compare-before-w5.json`: lưu hash JSON trước W5.
- `tests/staff-compare-w2.test.ts`: bỏ trường mới khi đối chiếu JSON cũ.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0**.
- `pnpm test`: **1**, sandbox chặn pipe IPC của `tsx`.
- `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, **203/203 test qua**.
- `pnpm lint`: **1**, giữ nguyên **1.158 chẩn đoán**, không thêm chẩn đoán mới.
- `pnpm build`: **0**.
- Chạy riêng test W2/W5 lần cuối: **0**, **9/9 qua**.
- `DEMO_MODE=1 pnpm dev --host 127.0.0.1 --port 1510`: **1**, sandbox chặn cổng 9229 (`listen EPERM`).
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

Có **7 test mới**, kiểm:

- Chart trùng thuật toán `CompareStrip` cũ ở ba chỉ số, ba kiểu vẽ, giờ/ngày, gộp ngày và hai kỳ lệch độ dài.
- Tỷ lệ có trọng số, giới hạn 100%, mẫu số bằng 0, cộng dồn và đuôi `null`.
- Giờ luôn gộp 1; cắt cả hai kỳ; chuỗi rỗng.
- JSON trước W5 giữ nguyên trên sáu bộ lọc demo; chart từng người không bị gộp lần hai.
- Bản nhớ vắt qua đầu giờ không mọc điểm; kiểu ngày không bị cắt.
- `CompareStrip` đọc chart cả đội/xem riêng cho cả ba kiểu vẽ.
- `seriesCut` dùng `cutoff` API thay giờ máy.

### Chỗ làm khác plan và lý do

- Chưa chụp được ảnh trước/sau ở 1440px và 390px vì `pnpm dev` bị sandbox chặn. Phần đối chiếu hình ảnh vẫn chưa được xác nhận.
- Chạy toàn bộ test trực tiếp bằng Node để tránh pipe IPC bị chặn của `tsx`.
- Chỉ sửa tám file thuộc phạm vi W5; chưa commit, push hay deploy.

### Câu hỏi còn lại

Không có câu hỏi triển khai. Còn cần QA ảnh demo khi chạy được máy chủ local.
---

## Tóm tắt F1

### File đã đổi

- `lib/audit.ts`: xét `export` trước `search`.
- `app/api/reports/customers/route.ts`: chuẩn hóa SĐT về dạng `0…` ở cả hai nhánh tìm khách.
- `tests/search-query.test.ts`: thêm test hồi quy.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`: **0** sau khi sửa kiểu dữ liệu test; lượt đầu **2**.
- `pnpm test`: **1**, sandbox chặn IPC của tsx (`EPERM`).
- `node --import tsx --import ./tests/support/register.mjs --test tests/*.test.ts`: **0**, qua **205/205** test.
- `pnpm lint`: **1**, trước và sau đều **1.158 lỗi có sẵn**, không thêm lỗi.
- `pnpm build`: **0**.
- `git diff --check`: **0**.

### Test mới (tên test, ca nào)

- **classifyApi: export được ưu tiên khi có q và vẫn giữ các ngưỡng xuất cũ**: kiểm tra `size`, `limit`, `export=1`; tìm thường vẫn là `search`.
- **tìm khách: SĐT 0, 84, +84 và 9 số cho cùng khách ở nhánh thường và theo kỳ**: so toàn bộ JSON với kết quả dạng `0…`.

### Chỗ làm khác plan và lý do

Code đúng phạm vi F1. Chạy toàn bộ test trực tiếp qua Node vì lệnh tsx bị sandbox chặn IPC.

### Câu hỏi còn lại

Không có.