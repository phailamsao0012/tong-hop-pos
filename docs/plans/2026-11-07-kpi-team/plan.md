# KPI team mới, báo tỷ lệ chốt dưới 42%, tách số MKT theo sản phẩm (07/11/2026)

Anh Vũ giao 07/11/2026 07:06Z và trả lời câu hỏi 07:10Z, 07:12Z. Claude tự code trong thread Tổ web tổng. Chưa làm khi anh chưa duyệt plan.

## Quyết định của anh
1. Rê chuột vào số ở bảng Xếp hạng marketer thì tách theo **sản phẩm** (Gentadox, Oxy…), không tách theo POS.
2. Cột Tỷ lệ XN ở MKT **không** tô theo mốc 42%.
3. Các đầu mục là **chỉ tiêu KPI**. Tin Zalo gửi theo từng khung giờ đang có. Sale có tỷ lệ chốt dưới 42% thì báo ngay về Zalo.
4. "Tỷ lệ tự upsell" = trong khách MKT mang về đã chuyển sang CSKH, phần trăm khách CSKH bán thêm được đơn.
5. Sản phẩm đếm theo **số lượng sản phẩm** (hộp, chai), không đếm theo số đơn.
6. Hàng đầu sơ đồ là 2 tài khoản **Giám đốc** đang có.
7. Chủ hệ thống giao KPI tổng cho cả team. Leader và Mentor tự chia cho nhân sự.
8. Có cả bảng số lượng sản phẩm để xem lẫn KPI theo sản phẩm.
9. Tin báo dưới 42% gửi cho **Leader và Mentor** của người đó.

Mặc định Claude tự chọn (anh chưa nói, đổi được):
- Tỷ lệ chốt dùng để báo là của **hôm nay**, tính tới lúc kiểm.
- Chỉ xét người đã nhận từ 10 số trong ngày, để đầu ngày không báo nhầm.
- Mỗi người bị báo tối đa 1 lần trong mỗi khung giờ.

## Các bước

### B1. Tỷ lệ chốt Sale: dưới 42% đỏ, từ 42% xanh
- Thêm hằng `SALE_CLOSE_RATE_OK = 0.42` trong `lib/reports/metrics.ts` và hàm tô màu dùng chung trong `app/ui-kit.tsx`.
- Áp cho mọi chỗ hiện tỷ lệ chốt của Sale: Tổng quan Sale, Phân tích Sale, Điều hành (ô Nhân viên Sale), bảng từng nhân viên, So sánh nhân viên.
- Không đổi con số. Không tô cột Tỷ lệ XN ở MKT.
- **Xong khi:** test tô màu đúng ở 41,9%, 42% và khi không có số. Kiểm bằng ảnh.

### B2. MKT: rê chuột hiện tách theo sản phẩm
- Thêm `lib/reports/mkt-product-split.ts`. Một câu gom theo marketer × dòng sản phẩm, trên cùng phạm vi lọc với bảng: số SĐT, đơn tạo, đơn XN, doanh thu, số lượng.
- Dòng sản phẩm lấy theo mẫu tên trong `lib/reports/product-groups.ts`: Gentadox, Oxy, Bio Nano Shield, Godkill/SK+GK, Nano Clean, Khác.
- Đơn có nhiều sản phẩm thì đếm vào từng dòng nó có; khung ghi rõ "một đơn có thể nằm ở nhiều dòng".
- Rê chuột vào ô Đơn tạo, SĐT, Đơn XN, Doanh thu thì hiện khung nhỏ. Trên điện thoại thì chạm vào ô.
- Chỉ gọi API khi rê chuột vào ô lần đầu, có cache, để không tăng số dòng đọc D1 lúc mở trang.
- **Xong khi:** cộng các dòng ≥ tổng của ô (vì một đơn có thể ở nhiều dòng); có test SQL bằng D1 giả.

### B3. KPI team theo chỉ tiêu mới
- Chỉ tiêu Sale (team và từng người): Số nhận, Số chốt, Doanh số, Số đơn, Số lượng theo sản phẩm.
- Chỉ tiêu CSKH (team và từng người): Doanh số, Tỷ lệ tự upsell, Số lượng theo sản phẩm.
- Lưu theo tháng trong `app_settings` khoá `target_kpi2:<YYYY-MM>`, dạng JSON `{ "<scope>:<id>": { assigned, closed, orders, upsellRate, products: { <dòng>: số lượng } } }`. Không thêm migration. Doanh số vẫn dùng bảng `targets` như cũ.
- Trang Giao việc → KPI team:
  - Chủ hệ thống đặt KPI tổng của team.
  - Leader / Mentor thấy team mình (`managedTeams`), chia cho từng người (`targetStaff` / `canWriteTarget`). Có dòng "đã chia X / tổng Y" và cảnh báo khi chia vượt.
- Mỗi chỉ tiêu có cột Đã đạt và % theo cách tính đang có:
  - Số nhận = số được chia.
  - Số chốt = chốt từ số được chia.
  - Số đơn = đơn chốt.
  - Số lượng sản phẩm = tổng số lượng trên đơn chốt, không tính quà tặng.
- **Xong khi:** test lưu, đọc, quyền (Leader không sửa được team khác); test tính Đã đạt.

### B4. Tỷ lệ tự upsell của CSKH
- Khách có đơn đầu do MKT mang về, rồi được chuyển cho CSKH trong kỳ. Tỷ lệ = khách có thêm đơn chốt do CSKH đó bán ÷ số khách đã chuyển cho CSKH đó.
- Thêm `lib/reports/cskh-upsell.ts`, dùng lại cách tìm lần mua trong `lib/reports/repurchase-report.ts`.
- **Xong khi:** test với khách ảo (có, không, nhiều lần mua).

### B5. Bảng số lượng sản phẩm tháng này
- Trên trang KPI team có bảng Sale / CSKH × dòng sản phẩm: số lượng tháng này, so cùng kỳ tháng trước, xếp từ nhiều tới ít.
- Bấm vào số thì ra danh sách đơn, giữ bộ lọc.
- **Xong khi:** số khớp trang Sản phẩm khi lọc cùng bộ phận và cùng kỳ.

### B6. Zalo theo khung giờ và báo dưới 42%
- Tin ảnh từng khung giờ (8h, 12h, 17h, 22h) thêm phần KPI:
  - Leader Sale: số nhận, số chốt, doanh số, so với KPI.
  - Mentor CSKH: doanh số, KPI, tỷ lệ tự upsell.
- Báo dưới 42%:
  - Vòng cron Zalo đang chạy mỗi phút; mỗi 15 phút thì kiểm tỷ lệ chốt hôm nay của từng Sale.
  - Ai dưới 42% (đã nhận ≥ 10 số) thì gửi Leader và Mentor của team người đó (`reportTargets`), mỗi người tối đa 1 lần mỗi khung giờ.
  - Lưu đã báo trong `app_settings` khoá `zalo_low_rate_v1`.
- **Xong khi:** test chọn người nhận, test không báo lặp trong cùng khung.

### B7. Sơ đồ quyền xem: 2 Giám đốc ở hàng đầu
- `app/permission-tree-panel.tsx`: hàng trên cùng là 2 tài khoản vai trò Giám đốc, hiện tên tài khoản. Mọi Leader / Mentor / Team nối lên dưới.
- **Xong khi:** ảnh chụp đúng thứ tự, không đè chữ.

## Chi phí Cloudflare (ước)
- B2: thêm 1 câu đọc khi rê chuột lần đầu, có cache. Khoảng vài nghìn dòng mỗi lần.
- B6: mỗi 15 phút, 1 câu tỷ lệ chốt hôm nay (khoảng 1–3 nghìn dòng) → khoảng 0,3 triệu dòng mỗi ngày, nhỏ so với hạn mức.
- B3–B5: chỉ đọc khi mở trang KPI.

## Kiểm
- Chạy `pnpm typecheck`, `pnpm test`, `pnpm build`; lint không thêm lỗi.
- Chụp ảnh bằng số ảo, gửi anh qua Artifact. Anh nhắn "ok lên" thì mới lên web thật.
