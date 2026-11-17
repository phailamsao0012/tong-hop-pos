# Marketing: xem theo Team Sale, biết team Sale nào chốt cho team MKT nào ra sao (anh Vũ 12/11/2026)

Yêu cầu (nguyên văn, kèm ảnh trang Marketing): "ở phần mkt, t muốn xem được là đội sale nào chốt cho team mkt nào tình trạng như thế nào, nói chung là muốn thêm 1 phần chọn team sale nữa, để xem team đấy doanh thu cho team mkt đấy, tỉ lệ chốt, mọi thứ nó ntn".

**Trạng thái: anh Vũ đồng ý plan 12/11 16:30 ("ok đồng ý"). Chưa code.** Người làm: Claude.

## Nền đã có

- **Team Sale lấy từ web nhân sự** (bản sao `hr_*`, `lib/teams/hr-teams.ts` → `HrTeamGroup`): mỗi team có Leader, Trưởng phòng, thành viên (tài khoản POS). Người chưa vào team gom vào "Chưa vào team". Trang "Sale / CSKH theo team" (`app/team-groups-view.tsx`) đang dùng nguồn này.
- **Team MKT** do web tổng tự đặt (`/api/marketing-teams`, `memberIds`). Trang Marketing đã có ô "Tất cả team MKT".
- **Đơn MKT có `seller_id`** (Sale được gán, người chốt). Trang Marketing đã lọc được theo 1 Sale (`sellerId`) và theo nút Sale / CSKH đầu trang (`teamFilter`).
- **Lọc theo đơn vị nhân sự** đã có sẵn: `unitSubquery` / `unitIds` trong `lib/teams/team.ts`, dùng cho nút "Team" đầu trang.

## Kết quả cần có

### 1. Ô chọn "Team Sale" trên trang Marketing

- Đặt cạnh ô "Tất cả team MKT".
- Lựa chọn:
  - Tất cả team Sale;
  - từng team Sale (tên team · Leader);
  - "Chưa vào team".
- Chỉ liệt kê team có người trên POS đang chọn (quy tắc POS).
- Chọn một team Sale thì **mọi số trên trang Marketing chỉ tính đơn có Sale (seller) thuộc team đó**: số chính, phễu, bảng gộp, bảng Xếp hạng marketer / team MKT, sản phẩm, đơn gần nhất.
- Kết hợp được với ô Team MKT. Ví dụ "Team Sale Hương × Team MKT Quỳnh" thì thấy đúng phần đơn của MKT Quỳnh mà team Hương chốt.
- **Chi phí QC không đổi theo team Sale**, vì chi phí là của marketer. Ghi rõ dưới ô Chi phí: "chi phí của marketer, không chia theo team Sale". ROAS lúc này là DT do team Sale này chốt ÷ toàn bộ chi phí của marketer, dễ hiểu sai. Vì vậy khi đang chọn một team Sale thì ROAS và CP/đơn hiện mờ, kèm chú thích.
- Lưu lựa chọn trên URL (`saleTeam=`) để gửi link cho nhau xem được.

### 2. Khối mới "Team Sale × Team MKT" (bảng chéo)

- Mặc định thu vào dòng tiêu đề, bấm mới xổ ra, như khối Sản phẩm / Đơn gần nhất.
- **Dòng** = team Sale. **Cột** = team MKT (+ cột Tổng). Có nút đảo dòng ↔ cột.
- Mỗi ô hiện **chỉ số đang chọn** ở hàng nút trên bảng: Doanh thu (mặc định) · Đơn chốt · SĐT nhận · TL chốt · Đơn đi · Tỉ lệ đi · Tỉ lệ hoàn · Tỉ lệ hủy · DT/SĐT.
  - SĐT nhận = số điện thoại khác nhau trên đơn MKT tạo trong kỳ được gán cho Sale của team đó.
  - TL chốt = Đơn chốt ÷ SĐT nhận.
  - Đơn đi / hoàn / hủy theo đúng định nghĩa đã chốt ở bảng Xếp hạng marketer (`docs/plans/2026-11-12-gop-bang-mkt/plan.md`).
- Ô tô đậm nhạt theo giá trị trong cùng bảng (heatmap 1 màu xanh của web), ô trống hiện `—`.
- Bấm một ô thì đặt luôn 2 ô chọn Team Sale + Team MKT ở đầu trang, cả trang lọc theo cặp đó.
- Rê chuột vào ô: "Team Sale X chốt cho Team MKT Y: DT …, đơn chốt …/SĐT …, TL chốt …%, đi …, hoàn …, hủy …".
- Dòng / cột Tổng tính từ tổng số, không lấy trung bình.

## Cách làm

1. **API `/api/reports/marketing`** nhận thêm `saleTeam` (mã đơn vị nhân sự, hoặc `none`).
   - Lọc `o.seller_id IN (unitSubquery sale team)`, chung chỗ với `teamFilter` (`lib/reports/marketing-overview.ts`).
   - Áp tương tự cho `/api/marketing/analytics` (`mkt-analytics.ts`), `/api/marketing/trend`, `/api/marketing/orders`, `/api/marketing/sheet-check`.
   - Cache khoá thêm `saleTeam`.
2. **API mới `/api/reports/marketing/cross`**: cùng kỳ, POS, basis.
   - Một lượt đọc `GROUP BY` (team Sale của seller, team MKT của marketer).
   - Đếm: đơn chốt, SĐT nhận, doanh thu, đơn đi, hoàn, hủy.
   - Map seller → team Sale bằng bảng `hr_pos_team` (join trong SQL), marketer → team MKT bằng danh sách `memberIds` (CASE hoặc bảng tạm).
   - Không quét lại bảng đơn nhiều lần.
3. **UI:**
   - Ô chọn Team Sale (`MarketingSaleTeamSelect`), theo mẫu `MarketingTeamSelect` trong `app/marketing-view.tsx`.
   - Khối `MktCrossTable` mới trong `app/mkt-cross.tsx`, dùng `CollapsibleCard` + `SegmentedControl` + `Th` tự co giãn.
4. **Test:**
   - Hàm thuần dựng ma trận từ kết quả SQL.
   - Tổng dòng/cột bằng tổng ô.
   - Chọn từng team Sale rồi cộng lại phải bằng Tất cả team Sale (kể cả "Chưa vào team").
5. **Kiểm trên dữ liệu thật** ở bản thử PC (cổng 8789): tổng cột Doanh thu của bảng chéo = Doanh thu MKT ở số chính, cùng kỳ và POS. Chụp ảnh gửi anh.
6. typecheck, test, build:pc. Gom vào đợt khởi động lại PC.

## Câu hỏi chờ anh

1. **"Team Sale" có tính cả CSKH không?**
   - Đơn MKT có thể do CSKH chốt (DT CSKH).
   - Đề xuất: ô chọn có 2 nhóm "Team Sale" và "Team CSKH" (đều lấy từ web nhân sự). Bảng chéo mặc định chỉ team Sale, có nút thêm CSKH.
2. **Đơn được chuyển Sale giữa chừng** (Sale A nhận, Sale B chốt): tính cho team của người chốt hay người được gán ban đầu?
   - Đề xuất: người chốt (`seller_id` hiện tại / người xác nhận đơn), như doanh thu New đang tính.
3. **Bảng chéo có cần xem theo từng marketer** (dòng team Sale × cột marketer) không, hay chỉ cấp team là đủ?

## Anh trả lời (12/11 16:27)

1. **CSKH:** không cần. Chỉ team Sale.
2. **Câu b:** anh trả lời "trả lời sai". Đề xuất "tính cho người chốt" của tôi không đúng ý anh.
   - Số thật 30 ngày (đơn MKT xác nhận từ 13/10): chỉ **19 / 14.213 đơn** có người xác nhận khác Sale đang gán trên đơn. Hai cách gần như cùng số.
   - ~~Mặc định dùng Sale được gán trên đơn (`seller_id`).~~
   - **Anh chốt 16:30: "tính cho người bấm xác nhận đơn".** Team Sale của đơn = team của `first_confirmed_by` (người bấm xác nhận lần đầu).
     - Đơn chưa xác nhận (chỉ dùng cho SĐT nhận / đơn tạo): chưa có người xác nhận, nên dùng `seller_id` để đếm SĐT nhận.
     - Người xác nhận không phải Sale (CSKH, quản lý, kho): vào dòng "Người xác nhận ngoài team Sale" để tổng không mất số.
3. **Xem theo từng marketer:** "có thể". Bảng chéo có nút đổi cột: team MKT ↔ từng marketer.
4. **Chi phí:** chỉ Marketing mới có chi phí, Sale không có.
   - Xem theo MKT (Team Sale = Tất cả): có chi phí, ROAS, CP/…
   - Đang chọn 1 team Sale, hoặc ở bảng chéo theo team Sale: **ẩn hẳn** các cột và ô chi phí, ROAS, CP/đơn, CP/số, % CP/DT (không làm mờ nữa).
   - Dòng / cột Tổng chung (Tất cả team Sale) thì có chi phí.

## Rủi ro

- Người đổi team giữa kỳ: tính theo team **hiện tại** trên web nhân sự (như trang Sale theo team). Ghi rõ trong tooltip.
- Seller chưa có trên web nhân sự: vào "Chưa vào team", không mất số.
- Quay lại: ô chọn mặc định "Tất cả team Sale" thì trang giữ y như cũ.
