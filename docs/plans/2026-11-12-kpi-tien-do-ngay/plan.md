# KPI tháng chia theo ngày, hiện thiếu / dư ở Tổng quan cho từng người Sale, CSKH, MKT (anh Vũ 12/11/2026)

Yêu cầu (nguyên văn): "phần kpi nhé, tôi muốn xem được cả ở phần tổng quan. khi set theo tháng sẽ auto chia tiến độ theo từng ngày trong tháng, ví dụ tháng 30 ngày, kpi 200tr thì lấy 200 chia 30, sau đó sẽ có tiến độ ở hàng của sale, cskh, mkt đó, ví dụ chia ra là 10tr 1 ngày, hôm nay tính đến hết 23h59'59s đạt được 8tr thì ngày mai sẽ báo đỏ là thiếu -2tr, còn nếu được 12tr ngày mai sẽ báo là +2tr, và con số đó liên tục thay đổi khi họ có đơn chốt mới, không tính hoàn hủy vào".

**Trạng thái: đang lên plan, chưa chốt, chưa code.** Người làm: Claude.

## Nền đã có

- `lib/kpi/kpi-pace.ts` (làm theo yêu cầu 31/10):
  - KPI ngày = mục tiêu tháng ÷ số ngày làm. Bỏ trống số ngày làm thì lấy số ngày của tháng.
  - `paceDiff` = doanh thu tháng − KPI ngày × số ngày đã qua.
- Đang hiện ở các trang KPI: `cskh-kpi-view`, `giao-viec-kpi-view`, `team-groups-view`, `targets-panel`, ảnh Zalo sáng.
- **Chưa có ở Tổng quan.** Chưa áp cho MKT.
- Mục tiêu tháng đặt ở trang Mục tiêu (`/api/targets`, scope `employee` / `team`).

## Kết quả cần có

### 1. Cách tính

- **KPI ngày** = mục tiêu tháng ÷ số ngày của tháng. Ví dụ 200 tr ÷ 30 = 6,67 tr/ngày. Nếu người đó có đặt "số ngày làm" thì chia theo số ngày làm.
- **Phải đạt tới hết hôm qua** = KPI ngày × số ngày đã qua trọn vẹn (từ ngày 1 tới hết 23:59:59 hôm qua, giờ VN).
- **Đã đạt** = doanh thu đơn chốt từ ngày 1 tới **ngay lúc này**, gồm cả đơn chốt hôm nay. **Không tính đơn hoàn / hủy**: đơn đang hoàn, đã hoàn, hủy (status 4, 15, 5, 6) bị trừ ra, kể cả khi hủy sau khi đã chốt.
- **Thiếu / dư** = Đã đạt − Phải đạt tới hết hôm qua.
  - Ví dụ: ngày 1 đạt 8 tr → sáng ngày 2 hiện **−2 tr đỏ**. Trong ngày 2 có đơn chốt mới 3 tr → số tự đổi thành **+1 tr xanh**.
  - Ngày 1 đạt 12 tr → sáng ngày 2 hiện **+2 tr xanh**.
- **Hôm nay cần** = KPI ngày − (thiếu/dư). Ví dụ đang −2 tr thì hôm nay cần 12 tr. Hiện kèm "đã có x tr hôm nay".
- Số cập nhật mỗi lần đồng bộ đơn (vài phút một lần). Có hiện giờ cập nhật.

### 2. Hiện ở đâu trên Tổng quan

- Bảng nhân viên của từng bộ phận Sale / CSKH / MKT ở Tổng quan: thêm cột **"KPI"** ngay sau Doanh thu.
  - Dòng trên: **thiếu / dư** (đỏ nếu âm, xanh nếu dương hoặc 0).
  - Dòng nhỏ dưới: "x% tháng · cần y tr hôm nay".
  - Rê chuột: KPI tháng, KPI ngày, phải đạt tới hết hôm qua, đã đạt, đơn hoàn hủy đã trừ.
- Dòng **team** và dòng **bộ phận**: tổng KPI các thành viên. Nếu team có KPI riêng thì dùng KPI team.
- Người chưa đặt KPI: cột hiện "—", không đỏ.
- Kỳ trên Tổng quan đang chọn không phải "Tháng này" (ví dụ chọn tuần trước) thì cột KPI vẫn tính theo **tháng hiện tại**. Tiêu đề cột ghi "KPI T11" cho rõ.

### 3. MKT

- KPI của marketer tính trên **doanh thu MKT** (chờ anh chọn): DT New (Sale chốt), DT tổng (New + CSKH), hay cả hai, mỗi loại một KPI.
- Đặt KPI cho marketer ở trang Mục tiêu (thêm nhóm "Marketing").

### 4. Quy tắc POS

- KPI là mục tiêu toàn công ty (mục C của plan POS).
- Khi chọn ít hơn 6 POS, cột KPI ghi chú "đạt tính trên POS đang chọn" (chờ anh chốt mục C).

## Cách làm

1. `lib/kpi/kpi-pace.ts`:
   - thêm `paceThroughYesterday`: dùng `daysCompleted` = số ngày trọn đã qua, thay vì `daysElapsed`;
   - thêm `needToday`;
   - test với ví dụ của anh (200 tr / 30 ngày; 10 tr/ngày, đạt 8 → −2, đạt 12 → +2; có đơn mới thì đổi).
2. Doanh thu tháng không tính hoàn hủy: hàm chung `kpiNetSql` (loại status 4, 15, 5, 6), dùng cho Tổng quan và các trang KPI cũ để mọi nơi cùng một số.
3. API `/api/reports/overview` trả thêm `kpi` cho từng người / team: `{ goal, daily, mustByYesterday, achieved, diff, needToday }`. Đọc mục tiêu tháng hiện tại + doanh thu tháng tới hiện tại, dùng bảng tính sẵn.
4. UI: cột KPI ở bảng nhân viên Tổng quan (`overview-sections.tsx` / bảng bộ phận), dùng `Th` tự co giãn.
5. Trang Mục tiêu: thêm nhóm Marketing.
6. Kiểm trên DB thật (bản thử PC): chọn một người có KPI, tính tay so với web. Chụp ảnh gửi anh.

## Anh trả lời 12/11 16:48

1. **Hoàn / hủy:** "đúng, hoàn hủy sẽ tính tỉ lệ khác, còn đã chốt là chốt".
   - KPI **Đã đạt = doanh thu mọi đơn đã chốt** (xác nhận lần đầu) trong tháng, **không trừ** đơn hoàn hoặc hủy về sau.
   - Hoàn và hủy theo dõi ở tỉ lệ hoàn, tỉ lệ hủy riêng.
   - Bỏ `kpiNetSql` loại status 4/15/5/6 ở trên. Số tháng cũ không tự giảm khi có đơn hoàn.
2. **KPI MKT:** chỉ tính **DT New**.
3. **Số ngày:** tính theo số ngày chính xác của tháng (28/29/30/31). Chủ nhật và lễ cũng làm.
   - Ô "số ngày làm" từng người: không dùng cho KPI chia ngày nữa. Chờ anh xác nhận có bỏ ô này khỏi trang Mục tiêu không.
4. **Thêm mới:** phần chọn **ngày lễ cố định trong năm** (cấu hình chung, chủ hệ thống sửa).
   - Ví dụ 1/1, 30/4, 1/5, 2/9; ngày âm lịch như Tết, Giỗ Tổ chờ anh xác nhận có cần không.
   - Lưu ở `app_settings` khoá `holidays`, có trang con trong Cấu hình.
   - **Chờ anh: ngày lễ dùng để làm gì**:
     - (a) KPI ngày lễ = 0, KPI tháng chia cho các ngày còn lại;
     - (b) chỉ đánh dấu ngày lễ trên biểu đồ, lịch, báo cáo để dễ giải thích số thấp, KPI vẫn chia đều;
     - (c) khác.

## Anh chốt 12/11 16:52

- **Ngày lễ = (ii):** chỉ đánh dấu ngày lễ trên biểu đồ, lịch, báo cáo, tooltip ngày ("Lễ 30/4"). KPI vẫn chia đều mọi ngày.
- **Có ngày lễ âm lịch** (Tết, Giỗ Tổ…):
  - Cấu hình cho chọn ngày theo dương lịch hoặc âm lịch.
  - Đổi âm sang dương bằng bảng tính sẵn 2024–2035 (thuật toán Hồ Ngọc Đức, có test với các ngày Tết đã biết).
- **Bỏ ô "số ngày làm"** khỏi trang Mục tiêu.
  - `kpiPace` luôn dùng số ngày của tháng.
  - Dữ liệu `workingDays` cũ giữ trong DB, không xoá, chỉ không đọc nữa.

**Trạng thái plan KPI: đã chốt đủ, chưa code.**

## Thêm 12/11 16:55: KPI tháng 11 theo bộ phận × POS (anh Vũ giao số)

Anh Vũ: "tiện set luôn tháng này nhé kpi".

6 số KPI (Sale / CSKH × Siêu Vô Gạo, Bio Nano, Oxytetra) không ghi vào repo (repo công khai); cất ở `C:\thp\kpi\kpi-2026-11.json` trên PC.

**Hiện bảng `targets` chỉ có 3 cấp:** POS (cả POS), team nhân sự, từng nhân viên. Chưa có cấp **"bộ phận trên một POS"** (Sale của POS X, CSKH của POS X), nên chưa nhập đúng được bằng trang Mục tiêu hiện tại.

**Cách làm:**
1. Thêm cấp KPI mới `scope='dept_pos'`, `ref_id='sale:sieu-vo-gao'` …
   - Trang Mục tiêu có nhóm "Bộ phận × POS".
   - **Thực đạt:**
     - Sale: DT New trên POS đó, đơn do người bán thuộc Sale chốt.
     - CSKH: DT CSKH trên POS đó.
     - Theo cách tính đã chốt: đã chốt là chốt, không trừ hoàn / hủy.
   - Chia ngày theo số ngày của tháng (30 ngày tháng 11):
     - KPI ngày = KPI tháng ÷ 30 (số cụ thể không ghi ở đây).
   - Hiện ở Tổng quan: dòng bộ phận Sale / CSKH khi chọn POS đó; khi chọn nhiều POS thì cộng KPI các POS đang chọn.
2. **Nhập 6 số trên vào DB thật** ngay sau khi bản có cấp `dept_pos` chạy trên PC:
   - Sao lưu `C:\thp\db\thp.sqlite` trước (`scripts/pc/sao-luu-nhanh.mjs`).
   - Ghi 6 dòng `targets` tháng `2026-11`.
   - Đọc lại để kiểm.
   - Anh Vũ đã yêu cầu rõ thao tác này (16:55).
3. **Chưa rõ, chờ anh:** KPI bộ phận × POS có cần chia xuống từng người không (ví dụ chia đều cho số Sale trên POS đó), hay chỉ theo dõi ở cấp bộ phận?

## Câu hỏi chờ anh (bản đầu, đã trả lời ở trên)

1. KPI MKT tính trên DT New, DT tổng, hay cả hai?
2. Ngày nghỉ (Chủ nhật, lễ): vẫn chia đều cho mọi ngày trong tháng (như ví dụ của anh), hay chỉ chia cho ngày làm? Hiện trang Mục tiêu có ô "số ngày làm" từng người.
3. "Không tính hoàn hủy": đơn chốt tháng này nhưng hoàn vào tháng sau thì lúc hoàn sẽ bị trừ khỏi tháng này (số tháng đã qua tự giảm). Anh đồng ý cách đó không?
