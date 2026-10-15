# QA đánh giá khả thi: plan giao diện mới web tổng (kiểu Threads @ikramsakib)

QA kiểm thử, 12/10/2026. Đọc plan.md, hien-trang.md, mau/tokens.css, mau/index.html, ảnh trong anh/, rồi đối chiếu code web tổng bản 55e723f (nhánh claude/project-thread-3ujeoc). Chỉ đọc, không sửa code, không chạm web thật.

## Kết luận: KHẢ THI, nhưng phải sửa plan 8 chỗ (mục A) trước khi giao Codex

Cách chia 10 đợt, giữ tên biến cũ, không sửa API cũ và 15 bất biến đều hợp lý. Ảnh mẫu đẹp, đúng tinh thần mẫu Threads, dùng đúng tên nghiệp vụ ở Vận đơn ("Đơn chuyển đi", "Doanh số chuyển đi", "Người lên đơn", "Ngày gửi hàng").

Những chỗ dưới đây nếu Codex làm đúng từng chữ của plan hiện tại sẽ ra lỗi: chữ hoặc màu biểu đồ khó đọc, chữ tiếng Việt lệch phông, lộ việc của chủ hệ thống cho người khác, lộ SĐT đầy đủ qua mạng, và số trên trang Điều hành cộng không ra tổng.

## A. Phải sửa trong plan

**A1. `--ink-4` sáng hơn sẽ làm mờ cả số liệu trên biểu đồ, không chỉ chữ (trả lời câu 1)**
- Plan G1 chỉ cho rà `text-ink-4` (67 chỗ). Nhưng code còn **29 chỗ `var(--ink-4)` trong style và SVG**, phần lớn là **màu dữ liệu**:
  - đường và vạch kỳ so ở `app/staff-compare.tsx:60, 190, 201, 247, 266` (biểu đồ "So cùng kỳ" anh vừa duyệt kiểu Lên xuống);
  - `app/overview-view.tsx:297-299` (Kỳ trước, Kỳ so sánh);
  - nhóm "Khác" ở `products-view.tsx:19`, `cskh-analytics-view.tsx:18`, `origin-view.tsx:30`, `product-group-blocks.tsx:16-18`;
  - "Người bán khác" ở `mkt-headline.tsx:172` (dải tách Doanh thu MKT hôm nay);
  - màu POS lạ ở `ui-kit.tsx:45`, `pos-badge.tsx:5`; `.postile`, `.poschip` ở `globals.css:460, 468`; chấm mức thấp ở `exec-blocks.tsx:159`.
- #a5aea8 trên nền trắng chỉ ~2:1. Nét đứt 1,3px kỳ so và lát "Người bán khác" sẽ gần như mất.
- Sửa: thêm biến riêng cho dữ liệu, ví dụ `--series-muted` (sáng ~#8f9a93, tối giữ ~#6d8073), rồi đổi 29 chỗ `var(--ink-4)` ở trên sang biến mới. Lệnh rà phải là `rg -n "ink-4" app components`, không chỉ `text-ink-4`.

**A2. Phông mono thiếu chữ tiếng Việt ở độ đậm 500 và 600 (câu 2)**
- QA mở từng tệp phông: bộ latin của JetBrains Mono **không có** "₫ đ ạ ệ"; bộ vietnamese có.
- `tokens.css` dòng 13–16 (plan G1.1 bảo chép "4 khối y như vậy") chỉ khai báo bộ vietnamese cho **độ đậm 400**. Số KPI là mono 600, bảng là mono 500. Vì vậy "₫", "tỷ", "điểm" trong phần mono sẽ rơi sang phông khác (SF Mono/Menlo/Consolas), lệch nét. Ảnh mẫu đã thấy: "tỷ ₫", "1,9 điểm".
- Sửa: khai đủ 6 khối (latin + vietnamese × 400/500/600). Tổng 6 tệp đo được 84KB, vượt mức "≤ 60KB" ở G10. Cần đổi mức thành ≤ 90KB, hoặc bỏ 500.
- Nên thêm: chỉ để **chữ số** ở mono. Đơn vị (`<small>` "tỷ ₫", "điểm", "đơn") và dòng "Chủ hệ thống · Thứ Hai…" dùng Be Vietnam Pro. Tiếng Việt viết bằng mono khó đọc (ảnh `home-light-390.png` dòng ngày tháng phải xuống 2 dòng).

**A3. Số mono rộng hơn: giữ cơ chế co chữ đang có (câu 2)**
- `KpiCard` hiện tự co cỡ số theo bề rộng thẻ (`ui-kit.tsx:101`, hệ số 0,62/ký tự). Hệ số này đúng luôn cho mono: JetBrains Mono rộng 0,6em mỗi chữ.
- Plan 3.1 ghi cố định "số 26px". Nếu Codex bỏ cơ chế co, số dài ("1.234.567.890 ₫" ở trang tiền) sẽ bị cắt "…".
- Sửa: ghi rõ "26px là cỡ tối đa, giữ `fit` hiện có".
- Ô lớn Doanh thu MKT (`mkt-headline.tsx:49`) cỡ tới 60px, có `truncate`. "792,9 tr" bằng mono 60px rộng khoảng 290px, sát bề rộng ô ở 1280px. Cần hạ trần cỡ chữ của ô này, ví dụ `clamp(2rem,3.6vw,3rem)`, hoặc đo trước khi chốt.
- Cột so từng người `w-32` (`staff-compare.tsx:270`) chứa được tối đa 9 ký tự mono 13px. QA sẽ đo scrollWidth ở 1280 và 390 khi có demo.

**A4. Cache của briefing không được làm "như staff-compare" (câu 3)**
- `staff-compare` nhớ kết quả theo **mỗi URL** (`route.ts:16-21`), không theo người xem.
- Briefing có việc "KPI chậm tiến độ" chỉ chủ hệ thống được thấy, và việc lọc theo quyền/team. Nếu chép y cách cũ: chủ hệ thống mở trước, sau đó trong 3 phút Giám đốc hoặc Leader mở cùng URL sẽ thấy cả việc KPI của chủ hệ thống. Leader bị ép team cũng có thể thấy việc của team khác.
- Sửa: khoá cache = vai trò + danh sách view được xem + team bị ép + POS được xem (hoặc user id). Ghi rõ trong plan, và thêm test hai người khác quyền gọi liền nhau.

**A5. Nguồn từng việc trong briefing: ba dòng cần sửa (câu 3)**
- *Sheet CPQC chưa gửi*: plan ghi "nguồn mà `mkt-sheet-check.tsx` đang đọc". Nhưng file đó đọc `/api/marketing/sheet-check`, là số đối chiếu chứ không có giờ gửi. Giờ gửi thật nằm ở bảng `sheet_cost_sources.received_at` (`lib/sheet-costs.ts:355-382`). Sửa nguồn cho đúng.
- *POS chưa đồng bộ*: nên ghi thẳng là `pos_shops.last_sync_at` và `last_error` (`app/api/sync/pos/route.ts:29`) để Codex khỏi đoán.
- *Tỷ lệ hoàn 7 ngày so 7 ngày trước*: hoàn về sau ngày gửi vài ngày. Đơn gửi trong 7 ngày gần nhất chưa kịp hoàn, nên tỷ lệ tuần này luôn thấp giả, việc này gần như không bao giờ bật. Sửa: so theo đơn gửi đã đủ ngày, ví dụ gửi từ 8–21 ngày trước so với 22–35 ngày trước, hoặc dùng đúng cách tính "Tỷ lệ hoàn" của `/api/reports/van-don` với kỳ đã khép. Ghi rõ "theo ngày gửi hàng".
- *Chờ xác nhận quá 2 giờ*: logic pipeline coi mã 17 (Chờ xác nhận) là **đã chốt** (`pipeline/route.ts:17`). Mô tả việc nên là "đơn đã chốt nhưng chưa xác nhận quá 2 giờ", tính từ giờ vào Chờ xác nhận chứ không phải giờ tạo đơn. Nhớ giới hạn ngày, ví dụ 3 ngày gần nhất, để không quét cả `raw_pos_orders`.
- Về tải D1: 7 nguồn một lần gọi là nặng nhất ở "Nhân viên chốt thấp" (product-groups cả tháng). Có cache đúng như A4 thì chấp nhận được. Không tạo chỉ mục mới trên `raw_pos_orders` thật (quy tắc test tải). Mục tiêu < 800ms ở G10 chỉ đo được trên demo, ghi rõ.

**A6. Ctrl K: SĐT vẫn lộ qua mạng, và tìm khách đang quét cả bảng (câu 4)**
- `/api/reports/customers` (`route.ts:82, 184`) và `/api/raw/orders` (`route.ts:75`) đều trả **SĐT đầy đủ**. Plan chỉ che "••• 3 số cuối" trên giao diện, nên mở tab Network vẫn thấy hết.
- Không có kỳ (`start`/`end`), route customers lọc `phone LIKE '%…%' OR name LIKE '%…%'` trên `customer_stats` (`route.ts:132`). Mỗi lần gõ (sau 250ms) là một lần quét toàn bảng.
- Sửa (vẫn đúng bất biến "chỉ thêm route đọc"): thêm route mới `GET /api/search?q=` chỉ đọc, chỉ trả về:
  - tên, `•••` + 3 số cuối, tỉnh, số đơn, tổng tiền, id để mở Khách hàng 360;
  - tối đa 8 dòng;
  - tìm SĐT theo **đuôi số khi gõ ≥ 4 số** hoặc khớp đủ số (dùng chỉ mục như `raw/orders` đang làm); tìm tên giới hạn 8 dòng;
  - kiểm quyền `customers` và team bị ép như các route khác.
- Bấm khách thì mở Khách hàng 360 bằng id, không đưa SĐT đầy đủ lên URL.
- Gỡ ô "Tìm khách theo SĐT" cũ: CSKH đang dùng ô này dán đủ số để mở khách. Ctrl K phải nhận dán đủ 10 số và Enter mở thẳng khách đó; ghi vào tiêu chí nghiệm thu.
- Phần "không lưu lịch sử có tên/SĐT" là đúng; `lib/audit.ts` đã che SĐT trong `q` khi ghi nhật ký.

**A7. Điều hành: số theo bộ phận cộng không ra tổng (câu 5)**
- Ảnh `home-light-1440.png`: Doanh thu 2,64 tỷ; Sale 723,4 tr + CSKH 1,46 tỷ = 2,18 tỷ; MKT 1,12 tỷ.
- Anh hay cộng thử. MKT trùng một phần với Sale và CSKH (đơn có Marketer), còn phần thiếu 0,46 tỷ không có tên.
- Sửa:
  - dưới thẻ MKT ghi "trùng với Sale, CSKH, không cộng";
  - thêm dòng nhỏ "Khác (người bán chưa hậu tố / anh Xuân Nghĩa) x tr" để Sale + CSKH + Khác = Doanh thu, cùng cách dải tách MKT hôm nay ("Người bán khác").
- Ô "Doanh thu" phải ghi rõ số gì, phạm vi nào (quy tắc 5): tổng ô "Tổng cộng" Pancake các POS đang chọn, chỉ người có hậu tố.

**A8. Lời chào và cột "Việc cần anh" cho Giám đốc (câu 5)**
- Plan cho Giám đốc thấy cột "Việc cần anh", nhưng chữ mẫu cứng "7 việc cần **anh**".
- Sửa: tiêu đề cột và lời chào lấy theo người xem ("Việc cần chị Mơ", hoặc "Việc cần làm" khi không rõ xưng hô).
- Việc KPI không trả cho Giám đốc (A4).
- Trang Hoạt động đọc `/api/audit` chỉ cho chủ hệ thống: đúng như plan ghi.

## B. Nên sửa

- **B1. `--card-line` từ trong suốt thành #e3e8e2, `--shadow` thành none (câu 1)**
  - Ảnh hưởng mọi `.card`, `.kpi`, `.defs`, `.dept-tabs` (`globals.css:157, 164, 576, 677`), cùng `Toolbar` và ô "Cập nhật" (`ui-kit.tsx:225`, `dashboard.tsx:1532`).
  - Đây là đúng ý đồ, nhưng `.lc-on … .is-loading` (`globals.css:703`) đang dùng `--card-line` làm viền khi con vật chờ tải chạy, nên viền chờ tải sẽ hiện.
  - Con vật chờ tải dùng `--line`, `--surface`, `--surface-3` (`loading-critter/critter.css:27, 147, 255`). Đổi màu là đổi theo, cần chụp lại 4 con.
  - Màn đăng nhập `.den-*` không dùng các biến này: an toàn.
- **B2. Chế độ tối**
  - `--primary` đổi #8bd5ab → #4fc48f làm đổi màu "Kỳ này" ở biểu đồ So cùng kỳ và màu chữ trên nền primary.
  - Cần đo lại tương phản chữ trên nút primary tối (`--accent-ink` #07150e là ổn) và DeltaPill tốt/xấu tối.
- **B3. Số trong ảnh mẫu tự mâu thuẫn**
  - Vận đơn: các tab cộng lại 64+133+412+1.103+87+41 = 1.840, khác "Tất cả 1.776".
  - Dữ liệu mẫu thôi, nhưng anh xem ảnh sẽ hỏi. Nên sửa trước khi gửi anh.
- **B4. Ctrl K, mục Nhân viên** ghi "91 đơn tháng này". Nên ghi rõ "91 đơn chốt" (hoặc "đơn lên" với người Vận đơn), đúng quy tắc mỗi số ghi rõ là số gì.
- **B5. Thanh kỳ trên điện thoại** (`home-light-390.png`) chỉ thấy Hôm nay → Tháng này. Cần cuộn ngang, hoặc có "Thêm" cho Tháng trước / Tùy chọn. Bộ lọc ngày vẫn phải là một bộ dùng chung toàn web (quy tắc 4).
- **B6. Khung So cùng kỳ của staff-compare** có kiểu so riêng ("So với") đặt cạnh "So với Kỳ liền trước" của thanh lọc chung. Plan nên ghi rõ đây là hai thứ khác nhau, hoặc nối khung So cùng kỳ vào lựa chọn chung, để anh không thấy hai nút "So với" mâu thuẫn.

## C. Trả lời nhanh 5 câu của Tổ

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Đổi giá trị biến cũ có an toàn? | Có, nếu thêm biến dữ liệu thay 29 chỗ `var(--ink-4)` (A1); viền thẻ và con vật chờ tải cần chụp lại (B1). |
| 2 | Mono có tràn? | Không tràn nếu giữ cơ chế co chữ của KpiCard (A3); phải hạ cỡ ô MKT lớn; phải thêm phông vietnamese 500/600 (A2). |
| 3 | Briefing nặng, nguồn đúng? | Chịu được nếu cache theo quyền (A4) và giới hạn ngày; sửa 3 nguồn: sheet, hoàn, Chờ xác nhận (A5). |
| 4 | Ctrl K lộ SĐT? | Có, qua mạng, vì 2 route cũ trả đủ số. Cần route `/api/search` che từ máy chủ (A6). |
| 5 | Thiếu quy tắc? | Thiếu "Khác" để cộng ra tổng, MKT trùng không cộng, nhãn phạm vi Doanh thu (A7); lời chào theo người xem (A8); "đơn" phải ghi rõ loại (B4). Tên Vận đơn trong ảnh đều đúng. |

## D. QA sẽ kiểm khi có demo
- Tương phản: mọi chữ ≥ 4,5:1, nét dữ liệu ≥ 3:1, sáng và tối.
- `scrollWidth > clientWidth` của mọi `.num` ở 1280 và 390, 6 trang chính.
- "₫", "đ", "ệ" trong phần mono dùng đúng phông: kiểm bằng `document.fonts`, chụp phóng to.
- Briefing: hai tài khoản demo khác quyền gọi liền nhau; số từng việc khớp trang mở ra.
- Ctrl K: Network không có SĐT đầy đủ; dán đủ 10 số rồi Enter mở đúng khách.
- Chụp lại con vật chờ tải, màn đăng nhập, chế độ trình chiếu.
