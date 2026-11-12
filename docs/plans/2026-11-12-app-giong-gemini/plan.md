# App iPhone 1.0.0: dựng lại bố cục cho giống thiết kế Gemini (R1–R7)

Duyệt: Nam "ok plan" 12/11/2026 07:01Z. Plan cho người đọc ở Artifact 8ULoFQpQgxHYHySWh4iWde.

Người làm: **Claude tự viết code**, không nhờ Codex (Nam 06:59Z: "phần này không nhờ codex nữa").
- Code viết trên PC qua Remote Control.
- Dựng và chụp bằng CI GitHub trên máy macOS.

## Vì sao làm lại
B2–B8 (Codex) chỉ đổi màu, thẻ và nút. Bố cục từng màn vẫn giữ kiểu cũ. Máy kiểm chỉ kiểm có số, không kiểm hình.

Lần này:
- mỗi màn phải có đủ khối, đúng thứ tự, đúng kiểu hình như khung Gemini;
- sau mỗi bước, Claude xếp ảnh `15-*` cạnh khung Gemini và kiểm từng khối.

## Nguồn thiết kế
- Ảnh khung: `docs/plans/2026-11-10-app-1.0-gemini/thiet-ke/anh/*.jpg`. Mỗi ảnh có máy tối và máy sáng cạnh nhau. Có các bản biến thể: 06B, 08B, 09A2, 11B, 16B…
- `thiet-ke/index.html`: chữ của từng màn.
- `thiet-ke/he-thiet-ke-swiftui.txt`: token màu, chữ, khoảng cách, bo góc.
- Token và thành phần đã có trong code: `Palette.swift`, `Theme.swift`, `MTKit.swift`. Dùng lại, không tạo bản thứ hai.

## Giữ nguyên (không đổi)
- Lớp lấy số: API, decode, cache, `StaffAPI`. Không đổi cách tính, quyền xem, đăng nhập, Face ID, khoá app.
- Luật tên số:
  - Vận đơn: "Đơn chuyển đi", "Doanh số chuyển đi", "Người lên đơn". Không gọi là chốt, doanh thu hay bán hàng.
  - CSKH không có tỷ lệ chốt.
  - Sale: tỷ lệ chốt <42% đỏ ▼, ≥42% xanh ✓.
  - Hoàn/hủy: ≥7% đỏ ▲, 5–7% vàng !, <5% xanh ✓.
- Không bịa số. Khối nào API chưa có số thì hiện "—" hoặc "Chưa có trên máy chủ". Mỗi bước phải liệt kê các khối đó trong `ket-qua-R.md`.
- Thêm trường mới trong API thì chỉ thêm `let x: T?` (optional) vào struct có sẵn, kèm ca DecodeSelfTest.
- Nếu `MEGATECH_TOUR` phải đổi theo màn mới, giữ đủ các mốc `[UI] moc=` của đoạn 15.

## Chụp thử không đụng Cloudflare (đã làm ở commit mở đầu)
- `ios-preview.yml`: `BASE` mặc định là `http://127.0.0.1:8788`.
- Bỏ bước "Dự phòng web demo". Web ảo hỏng thì lượt chạy đỏ.
- Thêm bước "Chặn gọi demo".
- Không đẩy nhánh demo, không deploy, không `--remote`.
- Mọi push đều kích CI. Commit chỉ có tài liệu thì thêm `[skip ci]`.

## Khung chung (R1)
1. **Tiêu đề màn gốc của tab.**
   - Dòng nhỏ phía trên tiêu đề lớn: "Chào buổi sáng, Sếp · Thứ Hai 09/11" ở 01; "Tháng 11/2026" ở 02, 04, 05.
   - Bên phải: nút vuông bo 12pt có nền (mắt che số, làm mới, chuông có số đỏ).
2. **Màn con.**
   - Không dùng nav bar có "<" ở giữa.
   - Breadcrumb xanh nhỏ trên tiêu đề lớn, ví dụ "‹ Phòng ban", "‹ Phòng ban · Sale", "‹ Trang chủ". Bấm vào thì quay lại.
   - Bên phải: nút mắt (13 có thêm nút i).
3. **Lọc.**
   - Một pill rộng hết màn: icon phễu, "Tháng này · Mọi POS · Tất cả · Team A" và chevron. Bấm vào mở bottom sheet chọn kỳ, POS, bộ phận, team.
   - Bỏ các dòng chọn rời và dòng "Đang xem…".
4. **Segmented.** Một khối bo 11pt, các phần bằng nhau. Phần đang chọn tô đặc: xanh ở nền tối, trắng ở nền sáng. Không dùng chip có viền.
5. **Tab bar.**
   - Phẳng, rộng hết màn, dính đáy, nền đặc, có nhãn.
   - Tab đang chọn chỉ đổi màu xanh, không có capsule.
   - Bỏ thanh nổi hình viên thuốc.
6. **Safe area.**
   - Không gì đè lên giờ, pin hay Dynamic Island.
   - Segmented nằm trong luồng cuộn, không ghim lên vùng status. Lỗi ở Tổng quan và Hôm nay.
7. **Tab sáng.** Hôm nay và Thông báo sáng tab "Trang chủ".

## Theo màn
Mỗi màn có 2 phần:
- "Gemini": khối từ trên xuống, là thứ phải có.
- "Bỏ": thứ trong app hiện tại phải bỏ.

### R2: 01 Hôm nay, 14 Thông báo

**01 Hôm nay (Trang chủ). Gemini:**
1. Dải "Mọi POS · từ 0h đến HH:MM · ● Đồng bộ OK".
2. Thẻ hero "DOANH THU HÔM NAY":
   - vòng tỷ trọng theo POS bên trái;
   - số lớn, "N đơn chốt · K POS", thanh "Hôm qua cả ngày";
   - ô từng POS;
   - nút (i).
3. "Theo bộ phận": Sale, CSKH, Marketing. Mỗi bộ phận có badge so cùng giờ hôm qua và 2 thanh "Hôm qua cùng giờ" / "Giờ này".
4. "MKT hôm nay": lưới 2×2 (Số về, Chi phí QC, CP/số, CP/đơn), nút ›.
5. "Vận đơn hôm nay": Doanh số chuyển đi, dòng Chờ xác nhận.
6. "Cần xử lý · N": các hàng có ›, link "Xem tất cả".
7. "Lối tắt": lưới 4×2 nút icon.
8. "Ca đang chạy": 3 ô và top 3 NV.

Bỏ: 3 khối Sale, CSKH, MKT kiểu cũ có 3 ô nhỏ.

**14 Thông báo. Gemini:**
1. "‹ Trang chủ" và nút làm mới.
2. Hero "CẦN XỬ LÝ": vòng "N nhóm", "N việc", 4 dòng đếm.
3. "Ưu tiên": các hàng Đơn mới chưa chốt, Khách quá 20 ngày chưa ghi chú, Yêu cầu nhân sự chờ duyệt, Đồng bộ lỗi/chậm. Các POS chậm gom vào **một** hàng.
4. "Trong ca": % chốt nóng, nút "Điều hành trong ca ›".
5. "Đồng bộ Pancake": mỗi POS một hàng ✓/!/↻, nút "Tải lại".

### R3: 02–04 Tổng quan
1. Pill lọc rồi segmented "Bốn bộ phận | Số liệu & KH | Theo POS". **Mặc định mở Bốn bộ phận.**
2. **Bốn bộ phận (02):**
   1. Banner vàng "Bảng bộ phận chưa lọc theo team" (chỉ khi có lọc team).
   2. "Tiến độ tháng · Ba bộ phận theo tháng": 3 thanh KPI kèm "Mốc tới hôm nay" và "✓ Đúng tiến độ".
   3. "Doanh thu · Sale": badge, số lớn, 3 ô.
   4. "CSKH": số lớn, dòng upsell / từ MKT.
   5. "Marketing": lưới 2×2 và 2 dòng chú thích.
   6. "Vận đơn": bảng có cột 1 cố định.
3. **Số liệu & KH:** theo khung 03.
4. **Theo POS (04):**
   - "DOANH THU THEO POS": badge, số lớn, danh sách hàng "POS · chốt / đơn … tiền".
   - "Trong kỳ": biểu đồ đường.

Bỏ: nav bar và chữ "Số liệu Pancake".

### R4: 05–06 Đơn hàng, 07 Phòng ban

**05 Đơn hàng. Gemini:**
1. "Tháng 11/2026", tiêu đề, nút mắt, pill lọc.
2. "ĐƠN THEO BƯỚC": số lớn và cột Mới, Xác nhận, Giao vận, Đã giao, Trả hàng.
3. "Đơn cần lưu ý": hàng có badge ▲ đỏ / ! vàng.
4. "Danh sách đơn hàng": hàng 2 dòng có giá và ›.
5. Tìm kiếm chuyển vào trong danh sách hoặc bottom sheet. 06A–C là trang chi tiết.

Bỏ: segmented "Theo giờ chốt | Theo ngày tạo" ở đầu.

**07 Phòng ban. Gemini:**
- Chỉ có tiêu đề.
- 5 thẻ Sale, CSKH, Marketing, Vận đơn, Nhân sự. Nhân sự có badge "N chờ duyệt".
- Mỗi thẻ: tên đậm, link xanh bên phải ("Sale ›", "Tổng quan CSKH ›", "Phân tích ›", "Xem Vận đơn ›", "Tổng quan ›"), lưới 2 cột nút chữ căn giữa có ›.
- Vận đơn chỉ một dòng.

Bỏ: icon vuông, mô tả, nút tròn ›, nút làm mới và chuông ở header.

### R5: 08–09 Sale, 10 Một nhân viên

**08A Sale. Gemini:**
1. "‹ Phòng ban", pill lọc.
2. Hero "DOANH THU CHỐT · SALE": badge và 2 thanh "Kỳ trước / Kỳ này".
3. Mỗi nhóm sản phẩm một bảng: Nhân viên | Đơn chốt | Doanh thu, có hàng Tổng.
4. "Hiệu suất đội ngũ": lưới 2×2 và hàng NV kèm badge % ✓/▼.
5. Nút đầy "So sánh nhân viên ›".

Xem thêm 08B, 09A1, 09A2, 09B–D: tab Data / Trong ca / so sánh.

Bỏ: đoạn định nghĩa dài và 2 segmented lồng nhau. Segmented Nhân viên / Data / Trong ca chỉ giữ nếu khung 08B có, và đặt dưới pill lọc.

**10 Một nhân viên. Gemini:**
1. Tiêu đề lớn "Tên · Sale", pill lọc.
2. Thẻ "TỶ LỆ CHỐT": badge % bên trái, "Doanh thu chốt" bên phải, nút đầy "Xem đơn chốt (N) ›".
3. "Trạng thái đơn chia (Chưa chốt)": thanh 2 màu và 2 ô Mới / Hủy.
4. "Lý do chưa chốt": hàng lý do kèm số, rồi hàng đơn.

Bỏ: thẻ avatar riêng và lưới ô rời.

### R6: 11 CSKH, 12 Marketing, 13 Vận đơn

**11A CSKH. Gemini:**
1. Pill lọc.
2. Hero "DOANH THU CSKH": badge và biểu đồ đường.
3. "Đơn chốt CSKH": lưới 2×2 và nút "Xem KPI từng nhân viên CSKH ›".

Theo 11A (đã chốt). KPI tháng (vòng %) chuyển xuống dưới hoặc vào trang KPI.

**12A Marketing. Gemini:**
1. Hero "DOANH THU MKT": badge và biểu đồ đường.
2. "Hiệu quả quảng cáo": lưới 3×2 (Chi phí quảng cáo, Số về, Đơn chốt (đã XN), ROAS, Chi phí mỗi số, Chi phí mỗi đơn chốt).
3. "Tách theo": segmented nhỏ "Theo người | Sản phẩm" và bảng.
4. Nút "Xếp hạng marketer / team ›".

Giữ phần chia New / CSKH / Khác (tra-loi-b1 12A).

**13 Vận đơn. Gemini:**
1. Nút mắt và nút i.
2. Hero "DOANH SỐ CHUYỂN ĐI": số lớn, vòng Sale/CSKH, chú thích "Tính riêng…".
3. "Luồng vận chuyển": lưới 2×2 có badge và 4 thanh phễu (Đơn vào Chờ xác nhận, Đã xác nhận, Đơn chuyển đi, Không xác nhận được).
4. Bảng "Theo người lên đơn".
5. Bảng "Người gọi xác nhận", rồi "Lý do không xác nhận được".

Bỏ: chip tím "Vận đơn" và 2 dòng mô tả.

### R7: 15–16 Thêm, 17 Nhân sự, 19 Đăng nhập, đóng gói

**15A Thêm. Gemini:**
1. Thẻ hồ sơ và nút đầy "Quét đăng nhập máy tính".
2. "Báo cáo & KPI Chủ hệ thống": lưới 2 cột nút và một nút rộng "KPI Sale…".
3. "Vận hành & Nhân sự": 4 nút rộng.
4. "Tài khoản & hệ thống": 6 nút, "Đăng xuất" đỏ.

16A–H là các trang phụ: chỉ đổi khung theo R1.

**17A Nhân sự. Gemini:**
1. "‹ Phòng ban".
2. Hero "QUÂN SỐ" và 2 ô.
3. "Theo chi nhánh / phòng ban".
4. Nút "Danh sách nhân sự (N) ›".

Hàng chip đang tràn thì đổi thành segmented vừa khung. Khi lỗi, dùng state view có nút Thử lại.

**19 Đăng nhập:** theo khung 19A–E. Thêm mốc chụp `15-sang-dang-nhap` / `15-toi-dang-nhap`.

**Đóng gói:** bản dựng tăng lên 13, số bản giữ 1.0.0.

## Đoạn chụp 15
- Chụp mỗi màn sau khi số đã hiện (chờ mốc số đầu tiên của màn đó), không chụp lúc còn khung xương.
- Tên ảnh phải khớp đúng màn. Lỗi cũ: ảnh sáng lệch 1–2 màn.

## Tiêu chí xong mỗi bước
Nam 07:02Z: "làm từng bước, kiểm giao diện và hoạt động theo từng giai đoạn". Mỗi bước phải đạt cả hai phần dưới đây rồi mới sang bước sau.

1. CI `iOS` và `iOS preview` xanh trên commit của bước. Kiểm hoạt động gồm:
   - tour bấm qua các màn của bước;
   - số hiện đúng: không lỗi tải, không "loi-tai";
   - bấm lọc, đổi tab và đi vào màn con đều chạy;
   - nút quay lại hoạt động;
   - DECODE_TEST OK.
2. Ảnh `15-sang-*` và `15-toi-*` của các màn trong bước (lấy từ nhánh `ios-preview`) xếp cạnh khung Gemini, đủ khối, đúng thứ tự.
3. Ghi `ket-qua-R.md`: các khối còn "—" vì chưa có số.
4. Tối đa 4 vòng sửa mỗi bước. Quá thì dừng và báo Nam.

## Ngoài phạm vi
- Phát hành IPA: chỉ khi Nam nói "phát hành".
- Đổi web hay API ngoài trường optional.
- Android.
