# Kết quả chạy liền một mạch: Đợt 13 17/10

Codex làm từng bước, máy kiểm sau mỗi bước. Claude kiểm một lần sau khi đọc file này và diff.

## Tiến độ
```
17/10 07:34Z Bắt đầu ở C:~/Projects/thp-dot13, nhánh codex/dot-13-1710, gốc c42117c, 14 bước.
17/10 07:34Z Lỗi lint ở gốc: 1158.
17/10 07:34Z A1: bắt đầu (Chi phí MKT chỉ so với đơn New (mục 4, 12)).
17/10 07:45Z A1: xong, commit 07b7d7d.
17/10 07:45Z A2: bắt đầu (Sale: AOV và doanh thu từ Đang đóng hàng trở đi (mục 5)).
17/10 07:56Z A2: xong, commit 4d2c7ce.
17/10 07:56Z A3: bắt đầu (Vận đơn: làm lại thẻ đầu trang và màu tỷ lệ hoàn (mục 7)).
17/10 08:05Z A3: xong, commit 65e8c14.
17/10 08:05Z A4: bắt đầu (Thẻ xu hướng theo kỳ đang chọn (mục 3)).
17/10 08:22Z A4: xong, commit 6c693b1.
17/10 08:22Z A5: bắt đầu (CSKH (và Sale) tổng quan: số chính lên đầu (mục 11)).
17/10 08:26Z DỪNG ở a5: Codex chạy lệnh đụng thư mục khóa / bí mật / web thật (xem ~/codex-viec/dot13-1710/a5-lan0-tk1.jsonl).
```

---

## Tóm tắt A1

### File đã đổi

- `lib/ad-costs.ts`, `lib/mkt-analytics.ts`: dùng chung công thức ROAS, CP/đơn theo New.
- `app/api/marketing/roas/route.ts`, `app/api/reports/sections/route.ts`: nhận bộ lọc Sale/CSKH, trả số tách.
- `app/mkt-headline.tsx`, `app/mkt-roas-view.tsx`, `app/overview-sections.tsx`: cập nhật số, nhãn và chú thích.
- `tests/mkt-new-cost.test.ts`: thêm 2 test.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

Bốn lệnh `pnpm` không khởi chạy vì thiếu trong PATH. Chạy trực tiếp các chương trình tương ứng:

- Typecheck: **0**.
- Test: **0**, đạt **273/273**.
- Lint: **1**; các file sửa có đúng **11 lỗi cũ, không thêm lỗi**. Test mới lint **0**.
- Build: **0**.
- `git diff --check`: **0**.
- D1 local migrations và EXPLAIN: **0**. Kết quả chính:

```text
SEARCH raw_pos_orders USING INDEX idx_raw_orders_pos_confirmed_status_money
(pos_id=? AND first_confirmed_at>? AND first_confirmed_at<?)
```

### Test mới (tên test, ca nào)

- **Ba nơi cùng New**: 3 loại người bán, 2 marketer có chi phí; kiểm tra tổng tách, ROAS, CP/đơn, bảng và biểu đồ; chuyển nút giữ chi phí và số về.
- **Thiếu chi phí/đơn New**: kiểm tra mẫu số rỗng và marketer chưa nhập chi phí.

### Chỗ làm khác plan và lý do

- `finish()` thực tế nằm trong `lib/mkt-analytics.ts`; đã sửa tại đó.
- Giữ phạm vi marketer có chi phí như hiện tại.
- Dùng chương trình trực tiếp thay `pnpm`; chưa kiểm tra giao diện bằng trình duyệt.

### Câu hỏi còn lại

Không có. Chỉ thực hiện A1; chưa commit, push hay deploy.
---

## Tóm tắt A2

### File đã đổi

- `lib/sale-packed.ts` mới, `lib/sale-analytics.ts`: tính DT đóng hàng theo người, dùng CLOSED và PACKED_SQL.
- `app/api/reports/{overview,sections}/route.ts`: bổ sung số liệu và danh sách đơn phân trang.
- `app/{team-overview-view,sale-analytics-view,overview-sections}.tsx`: nhãn AOV, cột doanh thu/tỷ trọng sắp xếp được, ô tổng Sale và bấm xem đơn.
- `tests/sale-packed.test.ts` mới.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck/test/lint/build`: từng lệnh **1**, không tìm thấy pnpm.
- Chạy script tương ứng qua `npm.cmd run`:
  - `typecheck`: **0**.
  - `test`: **0**, 276/276 test qua.
  - `lint`: **1**, lỗi có sẵn; đối chiếu HEAD trên các file A2: 11 chẩn đoán trước/sau, không thêm lỗi.
  - `build` với `DEMO_MODE=1`: **0**.
- Test riêng A2: **0**, 3/3 qua.
- `git diff --check`: **0**.
- `EXPLAIN QUERY PLAN` trên D1 local: **0**. Cả truy vấn tổng hợp và danh sách đều có:

```text
SEARCH o USING INDEX idx_raw_orders_pos_closed_status_money
(pos_id=? AND first_closed_at>? AND first_closed_at<?)
```

### Test mới (tên test, ca nào)

- **CLOSED, trạng thái 1/8/9/2/3/6 và lịch sử qua 8**: kiểm PACKED_SQL, loại hủy/CSKH/ngoài kỳ/POS; `packedNet ≤ net`.
- **Phân trang không mất đơn, team và nhóm sản phẩm giữ phạm vi**: kiểm 105 đơn, lọc team và nhóm.
- **Demo tổng cột = khối Sale…**: đối chiếu ba nơi, danh sách khớp số đơn và tiền; CSKH không thêm trường mới.

### Chỗ làm khác plan và lý do

- Danh sách `?packed=1` dùng route overview, cùng helper tính số, để giữ bộ lọc nhóm sản phẩm và hỗ trợ phân trang.
- Dùng `npm.cmd run` thay pnpm; test cần shim tạm cho lỗi `os.userInfo` trong sandbox. Đã xóa file tạm.

### Câu hỏi còn lại

Không. Chưa kiểm giao diện bằng trình duyệt. Chưa commit, push hay deploy.
---

## Tóm tắt A3

### File đã đổi

- `lib/van-don.ts`: bổ sung số đơn, doanh số và trạng thái hiện tại cho 5 thẻ.
- `app/api/reports/van-don/route.ts`: cấp số mới và danh sách đơn có phân trang.
- `app/van-don-view.tsx`: thay hàng thẻ, thêm tooltip và bấm xem đơn; bỏ phần hoàn trùng.
- `app/overview-sections.tsx`, `lib/return-tone.ts`: dùng chung ngưỡng hoàn 5%/7%, dưới 5% không tô màu.
- `tests/van-don-cards.test.ts`: thêm 3 test.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`: từng lệnh **1**, máy không tìm thấy `pnpm`.
- `npm.cmd run typecheck`: **0**.
- `npm.cmd run test`: **1**, lỗi môi trường `os.userInfo`.
- Chạy toàn bộ test qua Node/tsx với workaround: **0**, **279/279 đạt**.
- `npm.cmd run lint`: **1**, lỗi ở file ngoài phạm vi A3.
- Oxlint riêng 6 file A3: **0**.
- `npm.cmd run build`: **0**.
- `git diff --check`: **0**.
- Dev với `DEMO_MODE=1`: **1**, cấu hình yêu cầu remote proxy Cloudflare.

`EXPLAIN` trên SQLite của bộ giả lập D1:

```text
SEARCH o USING INDEX idx_raw_orders_pos_closed_status_money
  (pos_id=? AND first_closed_at>? AND first_closed_at<?)
SEARCH o USING INDEX idx_raw_orders_pos_sent_status_money
  (pos_id=? AND first_sent_at>? AND first_sent_at<?)
CORRELATED SCALAR SUBQUERY 1
SCAN h VIRTUAL TABLE INDEX 1:
USE TEMP B-TREE FOR LAST TERM OF ORDER BY
```

### Test mới (tên test, ca nào)

- `returnTone`: biên 4,99 / 5 / 6,99 / 7 và mẫu rỗng.
- `van-don-cards`: đã qua bước, đang ở bước, doanh số, nhóm ngày gửi riêng.
- `van-don-cards API`: số thẻ khớp danh sách, giữ POS/kỳ/team, phân trang và chỉ mục SQL.

### Chỗ làm khác plan và lý do

- Dùng npm và Node/tsx vì pnpm thiếu, tsx CLI lỗi môi trường.
- Chưa có ảnh desktop/mobile, đối chiếu demo và `EXPLAIN` trên D1 local thật.
- Corepack và dev đã tự thử kết nối phụ trợ rồi thất bại; em đã dừng các hướng này.
- Giữ nguyên cơ sở ngày gửi hiện có, giải thích chênh lệch nhóm đơn trong tooltip.

### Câu hỏi còn lại

Không có câu hỏi nghiệp vụ. Còn cần nghiệm thu demo và kiểm tra D1 local thật.
---

## Tóm tắt A4

### File đã đổi

- `lib/period-kind.ts`, `lib/trend-period.ts`: phân loại kỳ, dự đoán, so cùng mốc, hồ sơ 28 ngày và truy vấn theo bộ lọc.
- `app/api/reports/trend-cards/route.ts`, `lib/access.ts`: API mới, kiểm quyền từng bộ phận, danh sách đơn giải thích số.
- `app/overview-trends.tsx`, `app/marketing-view.tsx`, `app/team-overview-view.tsx`: thẻ theo kỳ, đường kỳ trước nét đứt, tối đa 5 dòng nhân viên.
- `tests/trend-period.test.ts`: 7 test A4.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

Bốn lệnh `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` không khởi chạy được: shell trả **1**, không tìm thấy `pnpm`.

Đã chạy công cụ tương đương bằng Node:

| Kiểm tra | Mã thoát | Kết quả |
|---|---:|---|
| TypeScript `tsc --noEmit` | 0 | Đạt |
| Toàn bộ test | 0 | 286/286 đạt |
| Test A4 lần cuối | 0 | 7/7 đạt |
| Oxlint toàn repo | 1 | Còn lỗi nền; phần sửa không thêm lỗi |
| Oxlint các file mới | 0 | Đạt |
| Vinext build lần cuối | 0 | Đạt |
| `git diff --check` | 0 | Đạt |
| EXPLAIN trên D1 local | 0 | Dùng chỉ mục sẵn có |

Phần đọc đơn trong kết quả EXPLAIN:

```text
SEARCH o USING COVERING INDEX idx_raw_orders_pos_closed_status_money (pos_id=? AND first_closed_at>? AND first_closed_at<?)
SEARCH o USING INDEX idx_raw_orders_pos_confirmed_status_money (pos_id=? AND first_confirmed_at>? AND first_confirmed_at<?)
SEARCH o USING COVERING INDEX idx_raw_orders_pos_sent_status_money (pos_id=? AND first_sent_at>? AND first_sent_at<?)
```

Các truy vấn dùng `USE TEMP B-TREE FOR GROUP BY`.

### Test mới (tên test, ca nào)

Trong `trend-period.test.ts`:

- `period-kind`: đủ 11 nút kỳ, phân biệt tháng/năm, tùy chọn không dự đoán.
- Hồ sơ 50% tới 14h → dự đoán gấp đôi; thiếu hồ sơ không dự đoán.
- Trọng số theo thứ; tối đa 5 dòng; dòng mới không chia cho 0.
- Ưu tiên 4 ngày cùng thứ, kiểm mốc đầu/cuối ngày.
- POS/team/MKT, so tới cùng phút, cache và chỉ mục.
- Team nhân sự, chi nhánh, ngày gửi và danh sách đơn khớp số.
- Quyền API: thu hẹp POS/team, chặn bộ phận không được cấp.

### Chỗ làm khác plan và lý do

- Thêm `preset` vì khoảng ngày hiện tại chưa phân biệt được chắc chắn 11 nút kỳ.
- Hồ sơ lưu riêng theo bộ lọc/bộ phận trong khóa ngày, tránh dùng hồ sơ toàn công ty cho team nhỏ.
- Vận đơn giữ cách tính theo ngày gửi khi dữ liệu sẵn sàng, dùng chỉ mục `sent` có sẵn.
- AI chỉ hiện ở Tuần này đúng phạm vi toàn công ty; phạm vi hẹp dùng nhận xét tự tính.
- API nhận `branch`; chưa nối bộ lọc chi nhánh chung vì thuộc B2.

### Câu hỏi còn lại

Không có câu hỏi. **Còn thiếu ảnh kiểm tra desktop/mobile**: demo local mở được, nhưng Chrome tự động không khởi động được để chụp ảnh (mã 1).

Chưa commit hoặc push.
---

## Tóm tắt A5

### File đã đổi

- `app/team-overview-view.tsx`: đưa 6 ô chính lên sau bộ lọc; bố trí 3 cột máy tính, 2 cột điện thoại; gom hàng phụ; chuyển xu hướng/KPI xuống dưới; bỏ khối nguồn đơn trùng.

### Lệnh đã chạy và kết quả (mã thoát từng lệnh)

- `pnpm typecheck/test/lint/build`: đều **1**, không tìm thấy `pnpm`.
- Chạy script tương ứng qua `npm.cmd`:
  - `typecheck`: **0**.
  - `test`: **1**, lỗi môi trường `uv_os_get_passwd`.
  - `lint`: **1**, lỗi có sẵn. File sửa giữ nguyên 7 lỗi, không thêm lỗi mới.
  - `build`: **0**.
- `git diff --check`: **0**.
- Dev server: **1**, cấu hình yêu cầu Cloudflare remote proxy; chưa chụp được ảnh demo.

### Test mới (tên test, ca nào)

Không thêm test; A5 chỉ đổi bố cục, dùng số hiện có.

### Chỗ làm khác plan và lý do

- Giữ so sánh kỳ trước hiện có; API chưa cấp so sánh “cùng mốc”.
- Ẩn xu hướng khi xem riêng nhân viên vì A4 chưa hỗ trợ bộ lọc này.
- Chưa xác minh trực quan ở 1366×768 và 390px do dev server không khởi động được.

### Câu hỏi còn lại

Không có. Còn cần kiểm tra demo và chụp hai ảnh khi môi trường local chạy được.